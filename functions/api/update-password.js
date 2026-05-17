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

function baseUrl(env) {
  return String(env.SUPABASE_URL || "").replace(/\/$/, "");
}

function serviceKey(env) {
  return String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
}

function supabaseHeaders(env, extra = {}) {
  const key = serviceKey(env);
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra
  };
}

async function readJsonSafe(res) {
  const text = await res.text().catch(() => "");
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

function decodeJwtRole(key) {
  try {
    const payload = key.split(".")[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return decoded.role || null;
  } catch {
    return null;
  }
}

async function supabaseRest(env, path, options = {}) {
  return fetch(`${baseUrl(env)}${path}`, {
    ...options,
    headers: supabaseHeaders(env, options.headers || {})
  });
}

async function getLoggedUser(env, request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return { ok: false, error: "Token do administrador ausente. Faça login novamente.", status: 401 };
  }

  const res = await fetch(`${baseUrl(env)}/auth/v1/user`, {
    headers: {
      apikey: serviceKey(env),
      Authorization: `Bearer ${token}`
    }
  });

  const data = await readJsonSafe(res);
  if (!res.ok || !data?.id) {
    return { ok: false, error: "Sessão do administrador inválida. Faça logout e login novamente.", status: 401, detalhe: data };
  }

  return { ok: true, user: data };
}

async function assertAdmin(env, request) {
  const session = await getLoggedUser(env, request);
  if (!session.ok) return session;

  const res = await supabaseRest(
    env,
    `/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}&select=id,email,role,ativo&limit=1`,
    { method: "GET" }
  );

  const rows = await readJsonSafe(res);
  const profile = Array.isArray(rows) ? rows[0] : null;

  if (!res.ok) {
    return { ok: false, error: "Erro ao consultar perfil do administrador.", status: 500, detalhe: rows };
  }

  if (!profile || profile.role !== "admin" || profile.ativo === false) {
    return { ok: false, error: "O usuário logado não possui permissão administrativa na tabela profiles.", status: 403 };
  }

  return { ok: true, admin: profile };
}

async function getProfile(env, userId, email) {
  if (userId) {
    const res = await supabaseRest(
      env,
      `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,nome,role,ativo&limit=1`,
      { method: "GET" }
    );
    const rows = await readJsonSafe(res);
    if (Array.isArray(rows) && rows[0]) return rows[0];
  }

  if (email) {
    const res = await supabaseRest(
      env,
      `/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id,email,nome,role,ativo&limit=1`,
      { method: "GET" }
    );
    const rows = await readJsonSafe(res);
    if (Array.isArray(rows) && rows[0]) return rows[0];
  }

  return null;
}

async function findAuthUserByEmail(env, email) {
  if (!email) return null;

  for (let page = 1; page <= 10; page++) {
    const res = await supabaseRest(
      env,
      `/auth/v1/admin/users?page=${page}&per_page=100`,
      { method: "GET" }
    );

    const data = await readJsonSafe(res);
    if (!res.ok) {
      return { error: true, status: res.status, detalhe: data };
    }

    const users = Array.isArray(data?.users) ? data.users : [];
    const found = users.find(u => String(u.email || "").toLowerCase() === String(email).toLowerCase());
    if (found) return found;
    if (users.length < 100) break;
  }

  return null;
}

async function updateAuthPassword(env, authUserId, password) {
  const res = await supabaseRest(
    env,
    `/auth/v1/admin/users/${encodeURIComponent(authUserId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ password })
    }
  );

  const data = await readJsonSafe(res);
  return { ok: res.ok, status: res.status, data };
}

export async function onRequestOptions() {
  return json({ ok: true });
}

export async function onRequestPost({ request, env }) {
  try {
    const key = serviceKey(env);

    if (!env.SUPABASE_URL || !key) {
      return json({
        error: "Variáveis ausentes no Cloudflare.",
        detalhe: {
          SUPABASE_URL: Boolean(env.SUPABASE_URL),
          SUPABASE_SERVICE_ROLE_KEY: Boolean(key)
        }
      }, 500);
    }

    const keyRole = decodeJwtRole(key);
    if (keyRole !== "service_role") {
      return json({
        error: "A variável SUPABASE_SERVICE_ROLE_KEY não é uma chave service_role.",
        detalhe: { role_detectada_no_jwt: keyRole || "não identificada" }
      }, 500);
    }

    const admin = await assertAdmin(env, request);
    if (!admin.ok) {
      return json({ error: admin.error, detalhe: admin.detalhe || null }, admin.status || 403);
    }

    const body = await request.json().catch(() => ({}));
    const userId = String(body.user_id || body.id || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || body.nova_senha || "");

    if (!userId && !email) {
      return json({ error: "Selecione um morador para alterar a senha." }, 400);
    }

    if (password.length < 6) {
      return json({ error: "A nova senha precisa ter pelo menos 6 caracteres." }, 400);
    }

    const profile = await getProfile(env, userId, email);

    if (!profile) {
      return json({
        error: "Morador não encontrado na tabela profiles.",
        detalhe: { user_id_recebido: userId || null, email_recebido: email || null }
      }, 404);
    }

    if (profile.role !== "morador") {
      return json({ error: "O usuário selecionado não é um morador." }, 400);
    }

    /*
      MÉTODO SIMPLES E DIRETO:
      1) A tabela profiles usa o mesmo ID do Supabase Auth.
      2) Primeiro tentamos alterar a senha diretamente pelo profile.id.
      3) Se o ID estiver divergente por cadastro antigo, fazemos fallback pelo e-mail.
    */

    let authUserId = profile.id;
    let tentativaDireta = await updateAuthPassword(env, authUserId, password);

    if (!tentativaDireta.ok) {
      const authByEmail = await findAuthUserByEmail(env, profile.email);

      if (authByEmail?.error) {
        return json({
          error: "Não foi possível consultar usuários no Supabase Auth usando service_role.",
          detalhe: authByEmail
        }, authByEmail.status || 500);
      }

      if (!authByEmail?.id) {
        return json({
          error: "Este morador existe na tabela profiles, mas não existe em Authentication > Users.",
          detalhe: {
            email_do_morador: profile.email,
            profile_id: profile.id,
            tentativa_direta_status: tentativaDireta.status,
            tentativa_direta_retorno: tentativaDireta.data
          }
        }, 404);
      }

      authUserId = authByEmail.id;
      const tentativaPorEmail = await updateAuthPassword(env, authUserId, password);

      if (!tentativaPorEmail.ok) {
        return json({
          error: "Supabase Auth recusou a alteração de senha.",
          detalhe: {
            auth_user_id: authUserId,
            email: profile.email,
            status: tentativaPorEmail.status,
            retorno_supabase: tentativaPorEmail.data
          }
        }, tentativaPorEmail.status || 500);
      }
    }

    return json({
      ok: true,
      mensagem: "Senha do morador alterada com sucesso.",
      morador: {
        nome: profile.nome,
        email: profile.email,
        profile_id: profile.id,
        auth_user_id_usado: authUserId
      }
    });
  } catch (err) {
    return json({
      error: "Erro interno na função update-password.",
      detalhe: err?.message || String(err)
    }, 500);
  }
}
