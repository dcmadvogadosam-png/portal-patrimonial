const json = (body, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*"
    }
  });

function decodeJwtRole(key) {
  try {
    const payload = key.split(".")[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return decoded.role || null;
  } catch {
    return null;
  }
}

async function safeJson(res) {
  const txt = await res.text().catch(() => "");
  try { return JSON.parse(txt); } catch { return { raw: txt }; }
}

export async function onRequestGet({ env }) {
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const url = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const role = key ? decodeJwtRole(key) : null;

  const result = {
    versao: "senha-metodo-simples-direto-2026-05-17",
    ok: false,
    checks: {
      SUPABASE_URL: Boolean(url),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(key),
      key_role_service_role: role === "service_role",
      auth_admin_api: false,
      profiles_table: false
    },
    role_detectada: role || null
  };

  if (!url || !key || role !== "service_role") {
    return json(result, 500);
  }

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json"
  };

  const authRes = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1`, { headers });
  result.checks.auth_admin_api = authRes.ok;
  result.auth_status = authRes.status;
  if (!authRes.ok) result.auth_error = await safeJson(authRes);

  const profRes = await fetch(`${url}/rest/v1/profiles?select=id,email,role&limit=1`, { headers });
  result.checks.profiles_table = profRes.ok;
  result.profiles_status = profRes.status;
  if (!profRes.ok) result.profiles_error = await safeJson(profRes);

  result.ok = Object.values(result.checks).every(Boolean);
  return json(result, result.ok ? 200 : 500);
}
