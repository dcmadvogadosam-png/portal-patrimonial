const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, PATCH, OPTIONS",
      "access-control-allow-headers": "content-type, authorization"
    }
  });

function requiredEnv(env) {
  const missing = [];
  if (!env.SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  return missing;
}

function cleanSupabaseUrl(env) {
  return String(env.SUPABASE_URL || "").replace(/\/$/, "");
}

async function readJsonSafe(res) {
  const text = await res.text().catch(() => "");
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function supabaseFetch(env, path, options = {}) {
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    ...(options.headers || {})
  };
  return fetch(`${cleanSupabaseUrl(env)}${path}`, { ...options, headers });
}

async function getLoggedUser(env, request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const res = await fetch(`${cleanSupabaseUrl(env)}/auth/v1/user`, {
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
  if (!user?.id) {
    return {
      ok: false,
      response: json({
        error: "Sessão inválida. Faça logout e login novamente como administrador."
      }, 401)
    };
  }

  const res = await supabaseFetch(
    env,
    `/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,email,role,ativo&limit=1`,
    { method: "GET" }
  );

  const rows = await readJsonSafe(res);
  const profile = Array.isArray(rows) ? rows[0] : null;

  if (!profile || profile.role !== "admin" || profile.ativo === false) {
    return {
      ok: false,
      response: json({
        error: "Acesso negado. O usuário logado precisa ser administrador."
      }, 403)
    };
  }

  return { ok: true, user, profile };
}

async function findAuthUserByEmail(env, email) {
  if (!email) return null;

  for (let page = 1; page <= 20; page++) {
    const res = await supabaseFetch(
      env,
      `/auth/v1/admin/users?page=${page}&per_page=100`,
      { method: "GET" }
    );

    const data = await readJsonSafe(res);
    if (!res.ok) return null;

    const users = Array.isArray(data?.users)
      ? data.users
      : (Array.isArray(data) ? data : []);

    const found = users.find(
      u => String(u.email || "").toLowerCase() === String(email).toLowerCase()
    );

    if (found?.id) return found;

    if (!users.length || users.length < 100) break;
  }

  return null;
}

async function updateAuthPassword(env, authUserId, password) {
  const res = await supabaseFetch(
    env,
    `/auth/v1/admin/users/${encodeURIComponent(authUserId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ password })
    }
  );

  const data = await readJsonSafe(res);
  return { res, data };
}

async function createAuthUser(env, email, password, nome) {
  const res = await supabaseFetch(env, `/auth/v1/admin/users`, {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome: nome || "" }
    })
  });

  const data = await readJsonSafe(res);
  return { res, data };
}

async function updateProfileId(env, oldId, newId) {
  if (!oldId || !newId || oldId === newId) return;

  await supabaseFetch(
    env,
    `/rest/v1/profiles?id=eq.${encodeURIComponent(oldId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ id: newId })
    }
  );
}

export async function onRequestOptions() {
  return json({ ok: true });
}

export async function onRequestPost({ request, env }) {
  return updatePassword(request, env);
}

export async function onRequestPatch({ request, env }) {
  return updatePassword(request, env);
}

async function updatePassword(request, env) {
  try {
    const missing = requiredEnv(env);
    if (missing.length) {
      return json({
        error: `Variáveis ausentes no Cloudflare: ${missing.join(", ")}`
      }, 500);
    }

    const admin = await assertAdmin(env, request);
    if (!admin.ok) return admin.response;

    const body = await request.json().catch(() => null);

    const selectedId = String(body?.user_id || body?.id || "").trim();
    const selectedEmail = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || body?.nova_senha || "");

    if (!selectedId && !selectedEmail) {
      return json({ error: "Selecione o morador." }, 400);
    }

    if (password.length < 6) {
      return json({
        error: "A nova senha precisa ter pelo menos 6 caracteres."
      }, 400);
    }

    let profile = null;

    if (selectedId) {
      const res = await supabaseFetch(
        env,
        `/rest/v1/profiles?id=eq.${encodeURIComponent(selectedId)}&select=id,email,nome,role&limit=1`,
        { method: "GET" }
      );
      const rows = await readJsonSafe(res);
      if (Array.isArray(rows) && rows.length) profile = rows[0];
    }

    if (!profile && selectedEmail) {
      const res = await supabaseFetch(
        env,
        `/rest/v1/profiles?email=eq.${encodeURIComponent(selectedEmail)}&select=id,email,nome,role&limit=1`,
        { method: "GET" }
      );
      const rows = await readJsonSafe(res);
      if (Array.isArray(rows) && rows.length) profile = rows[0];
    }

    if (!profile) {
      return json({
        error: "Morador não encontrado na tabela profiles."
      }, 404);
    }

    if (!profile.email) {
      return json({
        error: "O morador não possui e-mail cadastrado."
      }, 400);
    }

    if (profile.role && profile.role !== "morador") {
      return json({
        error: "O usuário selecionado não é um morador."
      }, 400);
    }

    // 1. Procura o usuário no Supabase Auth pelo e-mail.
    let authUser = await findAuthUserByEmail(env, profile.email);

    // 2. Se não existir no Auth, cria automaticamente.
    let createdNow = false;
    if (!authUser) {
      const created = await createAuthUser(
        env,
        profile.email,
        password,
        profile.nome
      );

      if (!created.res.ok) {
        return json({
          error: "Não foi possível criar o usuário no Supabase Auth.",
          detalhe: created.data
        }, created.res.status || 500);
      }

      authUser = created.data?.user || created.data;
      createdNow = true;
    }

    if (!authUser?.id) {
      return json({
        error: "Não foi possível localizar o ID do usuário no Supabase Auth."
      }, 500);
    }

    // 3. Sincroniza o ID da tabela profiles com o Auth.
    if (profile.id !== authUser.id) {
      await updateProfileId(env, profile.id, authUser.id);
    }

    // 4. Atualiza a senha.
    const attempt = await updateAuthPassword(
      env,
      authUser.id,
      password
    );

    if (!attempt.res.ok) {
      return json({
        error: attempt.data?.msg ||
               attempt.data?.message ||
               attempt.data?.error ||
               "Erro ao alterar senha no Supabase Auth.",
        detalhe: attempt.data
      }, attempt.res.status || 500);
    }

    return json({
      ok: true,
      created_auth_user: createdNow,
      user_id: authUser.id,
      email: profile.email,
      mensagem: createdNow
        ? "Usuário não existia no Supabase Auth, foi criado automaticamente e a senha foi definida com sucesso."
        : "Senha alterada com sucesso."
    });
  } catch (err) {
    return json({
      error: err?.message || "Erro interno ao alterar senha."
    }, 500);
  }
}
