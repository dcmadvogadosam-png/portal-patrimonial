const json = (body, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*"
    }
  });

async function readJsonSafe(res) {
  const text = await res.text().catch(() => "");
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

export async function onRequestGet({ env }) {
  const result = {
    ok: false,
    checks: {
      SUPABASE_URL: Boolean(env.SUPABASE_URL),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
      service_role_format: false,
      auth_admin_access: false,
      profiles_access: false
    },
    message: ""
  };

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    result.message = "Falta SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY nas variáveis do Cloudflare.";
    return json(result, 500);
  }

  const baseUrl = String(env.SUPABASE_URL).replace(/\/$/, "");
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || "");

  // JWT service_role usually contains this claim when decoded. We do not expose the key.
  try {
    const payload = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    result.checks.service_role_format = payload.role === "service_role";
    result.key_role = payload.role || null;
  } catch {
    result.key_role = "não foi possível ler o JWT";
  }

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json"
  };

  const authRes = await fetch(`${baseUrl}/auth/v1/admin/users?page=1&per_page=1`, { headers });
  const authData = await readJsonSafe(authRes);
  result.checks.auth_admin_access = authRes.ok;
  result.auth_status = authRes.status;
  if (!authRes.ok) result.auth_error = authData;

  const profilesRes = await fetch(`${baseUrl}/rest/v1/profiles?select=id,email,role&limit=1`, { headers });
  const profilesData = await readJsonSafe(profilesRes);
  result.checks.profiles_access = profilesRes.ok;
  result.profiles_status = profilesRes.status;
  if (!profilesRes.ok) result.profiles_error = profilesData;

  result.ok = result.checks.SUPABASE_URL &&
              result.checks.SUPABASE_SERVICE_ROLE_KEY &&
              result.checks.service_role_format &&
              result.checks.auth_admin_access &&
              result.checks.profiles_access;

  result.message = result.ok
    ? "Cloudflare Functions e Supabase Service Role estão funcionando corretamente."
    : "Existe problema na variável SUPABASE_SERVICE_ROLE_KEY, no deploy, ou no banco Supabase.";

  return json(result, result.ok ? 200 : 500);
}
