const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, authorization"
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders }
  });

function requiredEnv(env) {
  const missing = [];
  if (!env.SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  return missing;
}

async function supabaseFetch(env, path, options = {}) {
  const baseUrl = String(env.SUPABASE_URL || "").replace(/\/$/, "");
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

  const baseUrl = String(env.SUPABASE_URL || "").replace(/\/$/, "");
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

  const res = await supabaseFetch(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role,ativo&limit=1`, { method: "GET" });
  const rows = await res.json().catch(() => []);
  const profile = Array.isArray(rows) ? rows[0] : null;

  if (!profile || profile.role !== "admin" || profile.ativo === false) {
    return { ok: false, response: json({ error: "Acesso negado. O usuário logado não está como admin ativo na tabela profiles." }, 403) };
  }

  return { ok: true, user };
}

async function handleCreateUser(request, env) {
  try {
    const missing = requiredEnv(env);
    if (missing.length) return json({ error: `Variáveis ausentes no Cloudflare: ${missing.join(", ")}` }, 500);

    if (request.method === "OPTIONS") return json({ ok: true });
    if (request.method === "GET") return json({ ok: true, route: "/api/create-user", message: "API ativa. Use POST pelo painel administrativo." });
    if (request.method !== "POST") return json({ error: "Método não permitido. Use POST." }, 405);

    const admin = await assertAdmin(env, request);
    if (!admin.ok) return admin.response;

    const body = await request.json().catch(() => null);
    const nome = String(body?.nome || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const unidade = String(body?.unidade || "").trim();
    const condominio_id = String(body?.condominio_id || "").trim();
    const cpf = String(body?.cpf || "").trim();
    const celular = String(body?.celular || "").trim();
    const placa_veiculo = String(body?.placa_veiculo || "").trim();
    const foto_placa_veiculo_url = String(body?.foto_placa_veiculo_url || "").trim();

    if (!nome || !email || !password || !condominio_id) {
      return json({ error: "Preencha nome, e-mail, senha e condomínio do morador." }, 400);
    }
    if (password.length < 6) return json({ error: "A senha precisa ter pelo menos 6 caracteres." }, 400);

    const profileByEmailRes = await supabaseFetch(env, `/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id,email&limit=1`, { method: "GET" });
    const existingProfiles = await profileByEmailRes.json().catch(() => []);
    if (Array.isArray(existingProfiles) && existingProfiles.length) {
      return json({ error: "Já existe um morador cadastrado com este e-mail." }, 409);
    }

    const createUserRes = await supabaseFetch(env, "/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { nome, role: "morador", unidade, condominio_id, cpf, celular, placa_veiculo, foto_placa_veiculo_url }
      })
    });

    const createdUser = await createUserRes.json().catch(() => ({}));
    if (!createUserRes.ok) {
      const msg = createdUser?.msg || createdUser?.message || createdUser?.error_description || createdUser?.error || "Erro ao criar login no Supabase Auth.";
      return json({ error: msg }, createUserRes.status || 500);
    }

    const userId = createdUser?.id;
    if (!userId) return json({ error: "Login criado, mas o Supabase não retornou o ID do usuário." }, 500);

    const profilePayload = {
      id: userId,
      nome,
      email,
      role: "morador",
      unidade,
      condominio_id,
      cpf,
      celular,
      placa_veiculo,
      foto_placa_veiculo_url,
      ativo: true
    };

    const profileRes = await supabaseFetch(env, "/rest/v1/profiles", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(profilePayload)
    });

    const profileData = await profileRes.json().catch(() => ({}));
    if (!profileRes.ok) {
      await supabaseFetch(env, `/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" }).catch(() => null);
      const msg = profileData?.message || profileData?.error || "Erro ao criar perfil do morador.";
      return json({ error: msg }, profileRes.status || 500);
    }

    return json({ ok: true, user_id: userId, profile: Array.isArray(profileData) ? profileData[0] : profileData });
  } catch (err) {
    return json({ error: err?.message || "Erro interno ao criar morador." }, 500);
  }
}

async function handleDeleteUser(request, env) {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST" && request.method !== "DELETE") return json({ error: "Método não permitido." }, 405);

  const missing = requiredEnv(env);
  if (missing.length) return json({ error: `Variáveis ausentes no Cloudflare: ${missing.join(", ")}` }, 500);

  const admin = await assertAdmin(env, request);
  if (!admin.ok) return admin.response;

  const body = await request.json().catch(() => null);
  const userId = String(body?.user_id || body?.id || "").trim();
  if (!userId) return json({ error: "Informe o ID do usuário." }, 400);

  const res = await supabaseFetch(env, `/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return json({ error: data?.message || data?.error || "Erro ao remover usuário no Auth." }, res.status);
  }
  return json({ ok: true });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/create-user") return handleCreateUser(request, env);
    if (url.pathname === "/api/delete-user") return handleDeleteUser(request, env);
    if (url.pathname === "/api/health") {
      const missing = requiredEnv(env);
      return json({ ok: missing.length === 0, missing, mode: "worker-assets", routes: ["/api/create-user", "/api/delete-user"] }, missing.length ? 500 : 200);
    }

    if (request.method === "OPTIONS") return json({ ok: true });

    // Entrega os arquivos estáticos quando publicado como Cloudflare Worker com assets.
    if (env.ASSETS) return env.ASSETS.fetch(request);

    return new Response("Not found", { status: 404 });
  }
};