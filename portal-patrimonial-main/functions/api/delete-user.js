const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization"
    }
  });

function requiredEnv(env) {
  const missing = [];
  if (!env.SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  return missing;
}

async function supabaseFetch(env, path, options = {}) {
  const baseUrl = env.SUPABASE_URL.replace(/\/$/, "");
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    ...(options.headers || {})
  };

  return fetch(`${baseUrl}${path}`, { ...options, headers });
}

async function getLoggedUser(env, request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const baseUrl = env.SUPABASE_URL.replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`
    }
  });

  if (!res.ok) return null;
  return res.json();
}

async function assertAdmin(env, request) {
  const user = await getLoggedUser(env, request);
  if (!user?.id) return { ok: false, response: json({ error: "Sessão inválida. Faça login novamente." }, 401) };

  const res = await supabaseFetch(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role&limit=1`, {
    method: "GET"
  });
  const rows = await res.json().catch(() => []);
  const profile = Array.isArray(rows) ? rows[0] : null;

  if (!profile || profile.role !== "admin") {
    return { ok: false, response: json({ error: "Acesso negado. Apenas administrador pode executar esta ação." }, 403) };
  }

  return { ok: true, user };
}

export async function onRequestOptions() {
  return json({ ok: true });
}

export async function onRequestPost({ request, env }) {
  try {
    const missing = requiredEnv(env);
    if (missing.length) {
      return json({ error: `Variáveis ausentes no Cloudflare: ${missing.join(", ")}` }, 500);
    }

    const admin = await assertAdmin(env, request);
    if (!admin.ok) return admin.response;

    const body = await request.json().catch(() => null);
    const userId = String(body?.user_id || "").trim();

    if (!userId) return json({ error: "Informe o ID do morador para remover." }, 400);
    if (userId === admin.user.id) return json({ error: "Você não pode remover o próprio usuário administrador por aqui." }, 400);

    const profileRes = await supabaseFetch(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
      method: "DELETE"
    });
    if (!profileRes.ok) {
      const profileError = await profileRes.json().catch(() => ({}));
      return json({ error: profileError?.message || "Erro ao remover perfil do morador." }, profileRes.status || 500);
    }

    const authRes = await supabaseFetch(env, `/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: "DELETE"
    });
    if (!authRes.ok && authRes.status !== 404) {
      const authError = await authRes.json().catch(() => ({}));
      return json({ error: authError?.msg || authError?.message || "Perfil removido, mas houve erro ao remover login no Auth." }, authRes.status || 500);
    }

    return json({ ok: true });
  } catch (err) {
    return json({ error: err?.message || "Erro interno ao remover morador." }, 500);
  }
}
