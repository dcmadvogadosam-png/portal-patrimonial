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

function cleanSupabaseUrl(env) {
  return String(env.SUPABASE_URL || "").replace(/\/$/, "");
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

async function readJsonSafe(res) {
  const text = await res.text().catch(() => "");
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw: text }; }
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
    return { ok: false, response: json({ error: "Sessão inválida. Faça logout, login novamente como administrador e tente outra vez." }, 401) };
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
        error: "Acesso negado. O usuário logado precisa existir na tabela profiles com role='admin' e ativo=true.",
        detalhe: profile || rows || null
      }, 403)
    };
  }

  return { ok: true, user, profile };
}

async function validarCondominio(env, condominio_id) {
  const res = await supabaseFetch(
    env,
    `/rest/v1/condominios?id=eq.${encodeURIComponent(condominio_id)}&select=id,nome&limit=1`,
    { method: "GET" }
  );
  const data = await readJsonSafe(res);
  return Array.isArray(data) && data.length ? data[0] : null;
}



async function listarAuthUsersPorRole(env, role) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const res = await supabaseFetch(env, `/auth/v1/admin/users?page=${page}&per_page=100`, { method: "GET" });
    const data = await readJsonSafe(res);
    const users = Array.isArray(data?.users) ? data.users : (Array.isArray(data) ? data : []);
    users.forEach(u => {
      const meta = u.user_metadata || u.raw_user_meta_data || {};
      if (String(meta.role || "").toLowerCase() === role) {
        out.push({
          id: u.id,
          email: String(u.email || "").toLowerCase(),
          nome: meta.nome || u.email || "Morador",
          role,
          unidade: meta.unidade || "",
          condominio_id: meta.condominio_id || null,
          cpf: meta.cpf || "",
          celular: meta.celular || "",
          placa_veiculo: meta.placa_veiculo || "",
          pessoas_moram_junto: meta.pessoas_moram_junto || [],
          ativo: true,
          origem: "auth_metadata"
        });
      }
    });
    if (!users.length || users.length < 100) break;
  }
  return out;
}

function mergeMoradoresProfilesAuth(profileRows, authRows) {
  const map = new Map();
  [...(Array.isArray(profileRows) ? profileRows : []), ...(Array.isArray(authRows) ? authRows : [])].forEach(row => {
    if (!row) return;
    const key = String(row.id || row.email || Math.random()).toLowerCase();
    const prev = map.get(key) || {};
    map.set(key, { ...row, ...prev, ...Object.fromEntries(Object.entries(row).filter(([_,v]) => v !== null && v !== undefined && v !== "")) });
  });
  return [...map.values()].filter(m => String(m.role || "").toLowerCase() === "morador");
}

async function criarAuthUser(env, payload) {
  const res = await supabaseFetch(env, "/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: {
        nome: payload.nome,
        role: "morador",
        unidade: payload.unidade,
        condominio_id: payload.condominio_id,
        cpf: payload.cpf,
        celular: payload.celular,
        placa_veiculo: payload.placa_veiculo
      }
    })
  });

  const data = await readJsonSafe(res);
  if (!res.ok) {
    const msg = data?.msg || data?.message || data?.error_description || data?.error || data?.raw || "Erro ao criar login no Supabase Auth.";
    return { ok: false, status: res.status, error: msg, data };
  }

  return { ok: true, user: data };
}

async function upsertProfile(env, profilePayload) {
  const profileRes = await supabaseFetch(env, "/rest/v1/profiles?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(profilePayload)
  });
  const profileData = await readJsonSafe(profileRes);
  return { ok: profileRes.ok, status: profileRes.status, data: profileData };
}

function normalizarPessoasMoramJunto(value) {
  if (Array.isArray(value)) return value.map(v => String(v || "").trim()).filter(Boolean);
  return String(value || "").split(/\n|,/).map(v => v.trim()).filter(Boolean);
}

function semCampoFotoPlaca(payload) {
  const clone = { ...payload };
  delete clone.foto_placa_veiculo_url;
  return clone;
}

async function handleCreateUser(request, env) {
  try {
    const missing = requiredEnv(env);
    if (missing.length) return json({ error: `Variáveis ausentes no Cloudflare: ${missing.join(", ")}` }, 500);

    if (request.method === "OPTIONS") return json({ ok: true });
    if (request.method === "GET") {
      return json({
        ok: true,
        route: "/api/create-user",
        message: "API ativa. Use POST pelo painel administrativo.",
        obs: "Se o cadastro falhar, confira se o SQL CORRECAO_CADASTRO_MORADORES.sql foi executado no Supabase."
      });
    }
    if (request.method !== "POST") return json({ error: "Método não permitido. Use POST." }, 405);

    const admin = await assertAdmin(env, request);
    if (!admin.ok) return admin.response;

    const body = await request.json().catch(() => null);
    const payload = {
      nome: String(body?.nome || "").trim(),
      email: String(body?.email || "").trim().toLowerCase(),
      password: String(body?.password || ""),
      unidade: String(body?.unidade || "").trim(),
      condominio_id: String(body?.condominio_id || "").trim(),
      cpf: String(body?.cpf || "").trim(),
      celular: String(body?.celular || "").trim(),
      placa_veiculo: String(body?.placa_veiculo || "").trim(),
      pessoas_moram_junto: normalizarPessoasMoramJunto(body?.pessoas_moram_junto || body?.moradores_junto || ""),
      foto_placa_veiculo_url: String(body?.foto_placa_veiculo_url || "").trim()
    };

    if (!payload.nome || !payload.email || !payload.password || !payload.condominio_id) {
      return json({ error: "Preencha nome, e-mail, senha e condomínio do morador." }, 400);
    }
    if (payload.password.length < 6) return json({ error: "A senha precisa ter pelo menos 6 caracteres." }, 400);

    const condominio = await validarCondominio(env, payload.condominio_id);
    if (!condominio) {
      return json({
        error: "Condomínio inválido. Selecione novamente o condomínio no formulário.",
        detalhe: "O valor enviado em condominio_id não foi encontrado na tabela condominios."
      }, 400);
    }

    const profileByEmailRes = await supabaseFetch(
      env,
      `/rest/v1/profiles?email=eq.${encodeURIComponent(payload.email)}&select=id,email&limit=1`,
      { method: "GET" }
    );
    const existingProfiles = await readJsonSafe(profileByEmailRes);
    if (Array.isArray(existingProfiles) && existingProfiles.length) {
      return json({ error: "Já existe um morador cadastrado com este e-mail na tabela profiles." }, 409);
    }

    const auth = await criarAuthUser(env, payload);
    if (!auth.ok) {
      return json({
        error: auth.error,
        etapa: "auth.users",
        dica: "Verifique se a SUPABASE_SERVICE_ROLE_KEY é realmente a service_role secret e se o e-mail ainda não existe em Authentication > Users."
      }, auth.status || 500);
    }

    const userId = auth.user?.id;
    if (!userId) return json({ error: "Login criado, mas o Supabase não retornou o ID do usuário." }, 500);

    const profilePayload = {
      id: userId,
      nome: payload.nome,
      email: payload.email,
      role: "morador",
      unidade: payload.unidade,
      condominio_id: payload.condominio_id,
      cpf: payload.cpf,
      celular: payload.celular,
      placa_veiculo: payload.placa_veiculo,
      pessoas_moram_junto: payload.pessoas_moram_junto,
      ativo: true
    };

    if (payload.foto_placa_veiculo_url) {
      profilePayload.foto_placa_veiculo_url = payload.foto_placa_veiculo_url;
    }

    let profile = await upsertProfile(env, profilePayload);

    // Compatibilidade: se o Supabase ainda não recebeu a coluna foto_placa_veiculo_url, tenta salvar o morador sem essa coluna.
    const erroColunaFoto = JSON.stringify(profile.data || {}).includes("foto_placa_veiculo_url");
    if (!profile.ok && erroColunaFoto) {
      profile = await upsertProfile(env, semCampoFotoPlaca(profilePayload));
    }

    if (!profile.ok) {
      await supabaseFetch(env, `/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" }).catch(() => null);
      const msg = profile.data?.message || profile.data?.error || profile.data?.raw || "Erro ao criar perfil do morador.";
      return json({
        error: msg,
        etapa: "profiles",
        detalhe: profile.data,
        dica: "Execute o arquivo CORRECAO_CADASTRO_MORADORES.sql no SQL Editor do Supabase e tente novamente."
      }, profile.status || 500);
    }

    return json({
      ok: true,
      user_id: userId,
      condominio,
      profile: Array.isArray(profile.data) ? profile.data[0] : profile.data,
      aviso: payload.foto_placa_veiculo_url && erroColunaFoto ? "Morador criado, mas a coluna foto_placa_veiculo_url ainda não existe no banco. Execute o SQL de correção para armazenar a foto." : null
    });
  } catch (err) {
    return json({ error: err?.message || "Erro interno ao criar morador.", stack: String(err?.stack || "").slice(0, 800) }, 500);
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

  // Apaga Auth; o perfil cai junto se o FK on delete cascade estiver ativo.
  const res = await supabaseFetch(env, `/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await readJsonSafe(res);
    return json({ error: data?.message || data?.error || data?.raw || "Erro ao remover usuário no Auth.", detalhe: data }, res.status);
  }
  return json({ ok: true });
}

async function findAuthUserByEmail(env, email) {
  if (!email) return null;
  // Supabase Admin API does not always support direct email lookup in every project,
  // so we list users page by page and match the email safely.
  for (let page = 1; page <= 20; page++) {
    const res = await supabaseFetch(env, `/auth/v1/admin/users?page=${page}&per_page=100`, { method: "GET" });
    const data = await readJsonSafe(res);
    if (!res.ok) return null;
    const users = Array.isArray(data?.users) ? data.users : (Array.isArray(data) ? data : []);
    const found = users.find(u => String(u.email || "").toLowerCase() === String(email).toLowerCase());
    if (found?.id) return found;
    if (!users.length || users.length < 100) break;
  }
  return null;
}

async function updateAuthPassword(env, authUserId, password) {
  const res = await supabaseFetch(env, `/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, {
    method: "PATCH",
    body: JSON.stringify({ password })
  });
  const data = await readJsonSafe(res);
  return { res, data };
}

async function handleUpdatePassword(request, env) {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST" && request.method !== "PATCH") return json({ error: "Método não permitido." }, 405);

  const missing = requiredEnv(env);
  if (missing.length) return json({ error: `Variáveis ausentes no Cloudflare: ${missing.join(", ")}` }, 500);

  const admin = await assertAdmin(env, request);
  if (!admin.ok) return admin.response;

  const body = await request.json().catch(() => null);
  const selectedId = String(body?.user_id || body?.id || "").trim();
  const selectedEmail = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || body?.nova_senha || "");

  if (!selectedId && !selectedEmail) return json({ error: "Selecione o morador para alterar a senha." }, 400);
  if (password.length < 6) return json({ error: "A nova senha precisa ter pelo menos 6 caracteres." }, 400);

  // Busca o perfil por ID OU por e-mail. Isso corrige cadastros antigos em que profiles.id
  // ficou diferente do ID real do usuário no Supabase Auth.
  let profile = null;
  if (selectedId) {
    const profileRes = await supabaseFetch(
      env,
      `/rest/v1/profiles?id=eq.${encodeURIComponent(selectedId)}&select=id,email,nome,role&limit=1`,
      { method: "GET" }
    );
    const profileRows = await readJsonSafe(profileRes);
    if (Array.isArray(profileRows) && profileRows.length) profile = profileRows[0];
  }
  if (!profile && selectedEmail) {
    const profileRes = await supabaseFetch(
      env,
      `/rest/v1/profiles?email=eq.${encodeURIComponent(selectedEmail)}&select=id,email,nome,role&limit=1`,
      { method: "GET" }
    );
    const profileRows = await readJsonSafe(profileRes);
    if (Array.isArray(profileRows) && profileRows.length) profile = profileRows[0];
  }

  if (!profile) return json({ error: "Morador não encontrado na tabela profiles." }, 404);
  if (profile.role && profile.role !== "morador") return json({ error: "O usuário selecionado não é um morador." }, 400);

  // 1ª tentativa: usar profiles.id como auth user id.
  let authUserId = profile.id || selectedId;
  let attempt = await updateAuthPassword(env, authUserId, password);

  // Se falhar, procura no Supabase Auth pelo e-mail do morador e tenta com o ID correto do Auth.
  if (!attempt.res.ok && profile.email) {
    const authUser = await findAuthUserByEmail(env, profile.email);
    if (authUser?.id) {
      authUserId = authUser.id;
      attempt = await updateAuthPassword(env, authUserId, password);
    }
  }

  if (!attempt.res.ok) {
    const data = attempt.data || {};
    return json({
      error: data?.msg || data?.message || data?.error || data?.raw || "Erro ao alterar senha no Supabase Auth. Confira se a variável SUPABASE_SERVICE_ROLE_KEY é a chave service_role correta e se o morador existe em Authentication > Users.",
      detalhe: data,
      dica: "Este morador precisa existir também em Supabase > Authentication > Users com o mesmo e-mail do cadastro."
    }, attempt.res.status || 500);
  }

  return json({ ok: true, user_id: authUserId, morador: profile });
}

async function criarAuthPortariaUser(env, payload) {
  const res = await supabaseFetch(env, "/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: {
        nome: payload.nome,
        role: "portaria",
        condominio_id: payload.condominio_id,
        cpf: payload.cpf,
        celular: payload.celular
      }
    })
  });
  const data = await readJsonSafe(res);
  if (!res.ok) {
    const msg = data?.msg || data?.message || data?.error_description || data?.error || data?.raw || "Erro ao criar login da portaria no Supabase Auth.";
    return { ok: false, status: res.status, error: msg, data };
  }
  return { ok: true, user: data };
}

async function handleCreatePortaria(request, env) {
  try {
    if (request.method === "OPTIONS") return json({ ok: true });
    if (request.method !== "POST") return json({ error: "Método não permitido. Use POST." }, 405);
    const missing = requiredEnv(env);
    if (missing.length) return json({ error: `Variáveis ausentes no Cloudflare: ${missing.join(", ")}` }, 500);
    const admin = await assertAdmin(env, request);
    if (!admin.ok) return admin.response;

    const body = await request.json().catch(() => null);
    const payload = {
      nome: String(body?.nome || "").trim(),
      cpf: String(body?.cpf || "").trim(),
      celular: String(body?.celular || "").trim(),
      email: String(body?.email || "").trim().toLowerCase(),
      password: String(body?.password || body?.senha || ""),
      condominio_id: String(body?.condominio_id || "").trim()
    };
    if (!payload.nome || !payload.email || !payload.password || !payload.condominio_id) return json({ error: "Preencha condomínio, nome, e-mail e senha da portaria." }, 400);
    if (payload.password.length < 6) return json({ error: "A senha precisa ter pelo menos 6 caracteres." }, 400);
    const condominio = await validarCondominio(env, payload.condominio_id);
    if (!condominio) return json({ error: "Condomínio inválido para o cadastro da portaria." }, 400);

    const existingRes = await supabaseFetch(env, `/rest/v1/profiles?email=eq.${encodeURIComponent(payload.email)}&select=id,email&limit=1`, { method: "GET" });
    const existing = await readJsonSafe(existingRes);
    if (Array.isArray(existing) && existing.length) return json({ error: "Já existe um usuário cadastrado com este e-mail." }, 409);

    const auth = await criarAuthPortariaUser(env, payload);
    if (!auth.ok) return json({ error: auth.error, etapa: "auth.users", detalhe: auth.data }, auth.status || 500);
    const userId = auth.user?.id;
    if (!userId) return json({ error: "Login criado, mas o Supabase não retornou o ID do usuário." }, 500);

    const profilePayload = { id: userId, nome: payload.nome, email: payload.email, role: "portaria", unidade: null, condominio_id: payload.condominio_id, cpf: payload.cpf, celular: payload.celular, placa_veiculo: null, ativo: true };
    const profile = await upsertProfile(env, profilePayload);
    if (!profile.ok) {
      await supabaseFetch(env, `/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" }).catch(() => null);
      const msg = profile.data?.message || profile.data?.error || profile.data?.raw || "Erro ao criar perfil da portaria.";
      return json({ error: msg, etapa: "profiles", detalhe: profile.data }, profile.status || 500);
    }

    const row = { user_id: userId, condominio_id: payload.condominio_id, nome: payload.nome, cpf: payload.cpf, celular: payload.celular, email: payload.email, senha_acesso: payload.password, ativo: true };
    const portariaRes = await supabaseFetch(env, "/rest/v1/portaria_logins", { method: "POST", body: JSON.stringify(row) });
    const portariaData = await readJsonSafe(portariaRes);
    if (!portariaRes.ok) {
      await supabaseFetch(env, `/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" }).catch(() => null);
      return json({ error: portariaData?.message || portariaData?.error || portariaData?.raw || "Erro ao salvar tabela portaria_logins.", etapa: "portaria_logins", detalhe: portariaData }, portariaRes.status || 500);
    }
    return json({ ok: true, user_id: userId, condominio, portaria: Array.isArray(portariaData) ? portariaData[0] : portariaData });
  } catch (err) {
    return json({ error: err?.message || "Erro interno ao criar portaria." }, 500);
  }
}

async function handleUpdatePortaria(request, env) {
  try {
    if (request.method === "OPTIONS") return json({ ok: true });
    if (request.method !== "POST" && request.method !== "PATCH") return json({ error: "Método não permitido." }, 405);
    const missing = requiredEnv(env);
    if (missing.length) return json({ error: `Variáveis ausentes no Cloudflare: ${missing.join(", ")}` }, 500);
    const admin = await assertAdmin(env, request);
    if (!admin.ok) return admin.response;
    const body = await request.json().catch(() => null);
    const id = String(body?.id || "").trim();
    const userId = String(body?.user_id || "").trim();
    const payload = {
      nome: String(body?.nome || "").trim(), cpf: String(body?.cpf || "").trim(), celular: String(body?.celular || "").trim(), email: String(body?.email || "").trim().toLowerCase(), password: String(body?.password || body?.senha || ""), condominio_id: String(body?.condominio_id || "").trim()
    };
    if (!id || !userId) return json({ error: "ID da portaria não informado." }, 400);
    if (!payload.nome || !payload.email || !payload.password || !payload.condominio_id) return json({ error: "Preencha condomínio, nome, e-mail e senha." }, 400);
    if (payload.password.length < 6) return json({ error: "A senha precisa ter pelo menos 6 caracteres." }, 400);

    const authRes = await supabaseFetch(env, `/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: "PATCH", body: JSON.stringify({ email: payload.email, password: payload.password, email_confirm: true, user_metadata: { nome: payload.nome, role: "portaria", condominio_id: payload.condominio_id, cpf: payload.cpf, celular: payload.celular } }) });
    const authData = await readJsonSafe(authRes);
    if (!authRes.ok) return json({ error: authData?.message || authData?.error || authData?.raw || "Erro ao atualizar Auth da portaria.", detalhe: authData }, authRes.status);

    const profile = await upsertProfile(env, { id: userId, nome: payload.nome, email: payload.email, role: "portaria", condominio_id: payload.condominio_id, cpf: payload.cpf, celular: payload.celular, ativo: true });
    if (!profile.ok) return json({ error: profile.data?.message || profile.data?.error || "Erro ao atualizar perfil da portaria.", detalhe: profile.data }, profile.status || 500);

    const rowRes = await supabaseFetch(env, `/rest/v1/portaria_logins?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ nome: payload.nome, cpf: payload.cpf, celular: payload.celular, email: payload.email, senha_acesso: payload.password, condominio_id: payload.condominio_id, user_id: userId, ativo: true }) });
    const rowData = await readJsonSafe(rowRes);
    if (!rowRes.ok) return json({ error: rowData?.message || rowData?.error || rowData?.raw || "Erro ao atualizar tabela da portaria.", detalhe: rowData }, rowRes.status);
    return json({ ok: true });
  } catch (err) { return json({ error: err?.message || "Erro interno ao atualizar portaria." }, 500); }
}

async function handleDeletePortaria(request, env) {
  try {
    if (request.method === "OPTIONS") return json({ ok: true });
    if (request.method !== "POST" && request.method !== "DELETE") return json({ error: "Método não permitido." }, 405);
    const missing = requiredEnv(env);
    if (missing.length) return json({ error: `Variáveis ausentes no Cloudflare: ${missing.join(", ")}` }, 500);
    const admin = await assertAdmin(env, request);
    if (!admin.ok) return admin.response;
    const body = await request.json().catch(() => null);
    const id = String(body?.id || "").trim();
    const userId = String(body?.user_id || "").trim();
    if (!id && !userId) return json({ error: "Informe o ID do cadastro da portaria." }, 400);
    if (id) await supabaseFetch(env, `/rest/v1/portaria_logins?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    if (userId) {
      const res = await supabaseFetch(env, `/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await readJsonSafe(res);
        return json({ error: data?.message || data?.error || data?.raw || "Erro ao remover usuário da portaria no Auth.", detalhe: data }, res.status);
      }
    }
    return json({ ok: true });
  } catch (err) { return json({ error: err?.message || "Erro interno ao remover portaria." }, 500); }
}


async function assertAuthenticatedProfile(env, request) {
  const user = await getLoggedUser(env, request);
  if (!user?.id) {
    return { ok: false, response: json({ error: "Sessão inválida ou expirada. Faça login novamente." }, 401) };
  }

  let res = await supabaseFetch(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=*&limit=1`, { method: "GET" });
  let rows = await readJsonSafe(res);
  let prof = Array.isArray(rows) ? rows[0] : null;

  if (!prof && user.email) {
    res = await supabaseFetch(env, `/rest/v1/profiles?email=eq.${encodeURIComponent(String(user.email).toLowerCase())}&select=*&limit=1`, { method: "GET" });
    rows = await readJsonSafe(res);
    prof = Array.isArray(rows) ? rows[0] : null;
  }

  if (!prof || prof.ativo === false) {
    return { ok: false, response: json({ error: "Perfil não encontrado ou inativo para este login.", user: { id: user.id, email: user.email } }, 403) };
  }

  return { ok: true, user, profile: prof };
}

async function handleListMoradores(request, env) {
  try {
    if (request.method === "OPTIONS") return json({ ok: true });
    if (request.method !== "GET") return json({ error: "Método não permitido. Use GET." }, 405);
    const missing = requiredEnv(env);
    if (missing.length) return json({ error: `Variáveis ausentes no Cloudflare: ${missing.join(", ")}` }, 500);

    const auth = await assertAuthenticatedProfile(env, request);
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const role = String(auth.profile.role || "").toLowerCase();
    const condFiltro = String(url.searchParams.get("condominio_id") || "").trim();

    // Busca robusta: primeiro lê profiles com service_role. Se algum cadastro criou login em Auth,
    // mas por qualquer motivo não apareceu no profiles, complementa pela metadata do Auth.
    const profileRes = await supabaseFetch(env, `/rest/v1/profiles?select=*&order=nome.asc`, { method: "GET" });
    const profileRowsRaw = await readJsonSafe(profileRes);
    if (!profileRes.ok) return json({ error: profileRowsRaw?.message || profileRowsRaw?.error || profileRowsRaw?.raw || "Erro ao listar profiles.", detalhe: profileRowsRaw }, profileRes.status);

    const authRows = await listarAuthUsersPorRole(env, "morador").catch(() => []);
    let lista = mergeMoradoresProfilesAuth(profileRowsRaw, authRows);

    if (role === "admin") {
      if (condFiltro) lista = lista.filter(m => String(m.condominio_id || "") === condFiltro);
    } else if (role === "portaria" || role === "morador") {
      if (!auth.profile.condominio_id) return json({ error: "Este usuário não está vinculado a um condomínio." }, 400);
      lista = lista.filter(m => String(m.condominio_id || "") === String(auth.profile.condominio_id));
    } else {
      return json({ error: "Tipo de perfil sem permissão para listar moradores." }, 403);
    }

    lista.sort((a,b) => String(a.nome || a.email || "").localeCompare(String(b.nome || b.email || ""), "pt-BR"));
    return json({ ok: true, data: lista });
  } catch (err) {
    return json({ error: err?.message || "Erro interno ao listar moradores." }, 500);
  }
}

async function handleListLancamentos(request, env) {
  try {
    if (request.method === "OPTIONS") return json({ ok: true });
    if (request.method !== "GET") return json({ error: "Método não permitido. Use GET." }, 405);
    const missing = requiredEnv(env);
    if (missing.length) return json({ error: `Variáveis ausentes no Cloudflare: ${missing.join(", ")}` }, 500);

    const auth = await assertAuthenticatedProfile(env, request);
    if (!auth.ok) return auth.response;

    let path = `/rest/v1/lancamentos?select=*&order=data.desc`;
    if (String(auth.profile.role || "").toLowerCase() !== "admin") {
      if (!auth.profile.condominio_id) return json({ error: "Este usuário não está vinculado a um condomínio." }, 400);
      path = `/rest/v1/lancamentos?condominio_id=eq.${encodeURIComponent(auth.profile.condominio_id)}&select=*&order=data.desc`;
    }

    const res = await supabaseFetch(env, path, { method: "GET" });
    const data = await readJsonSafe(res);
    if (!res.ok) return json({ error: data?.message || data?.error || data?.raw || "Erro ao listar lançamentos.", detalhe: data }, res.status);

    let rows = Array.isArray(data) ? data : [];
    // Anexa o nome do condomínio sem depender de relationship automática do Supabase.
    const condRes = await supabaseFetch(env, `/rest/v1/condominios?select=id,nome`, { method: "GET" });
    const condData = await readJsonSafe(condRes);
    const condMap = new Map((Array.isArray(condData) ? condData : []).map(c => [String(c.id), c.nome]));
    rows = rows.map(l => ({ ...l, condominios: l.condominios || { nome: condMap.get(String(l.condominio_id)) || "" } }));

    return json({ ok: true, data: rows });
  } catch (err) {
    return json({ error: err?.message || "Erro interno ao listar lançamentos." }, 500);
  }
}

async function handleSaveLancamento(request, env) {
  try {
    if (request.method === "OPTIONS") return json({ ok: true });
    if (request.method !== "POST") return json({ error: "Método não permitido. Use POST." }, 405);
    const missing = requiredEnv(env);
    if (missing.length) return json({ error: `Variáveis ausentes no Cloudflare: ${missing.join(", ")}` }, 500);
    const admin = await assertAdmin(env, request);
    if (!admin.ok) return admin.response;
    const body = await request.json().catch(() => null);
    const payload = {
      condominio_id: String(body?.condominio_id || "").trim(),
      tipo: String(body?.tipo || "despesa").trim(),
      data: String(body?.data || "").trim(),
      valor: Number(body?.valor || 0),
      categoria: String(body?.categoria || "").trim(),
      local: String(body?.local || "").trim(),
      descricao: String(body?.descricao || body?.categoria || body?.local || body?.tipo || "").trim(),
      justificativa: String(body?.justificativa || "").trim(),
      created_by: admin.user.id
    };
    if (body?.anexo_url) payload.anexo_url = String(body.anexo_url);
    if (!payload.condominio_id || !payload.data || !payload.valor) return json({ error: "Selecione condomínio, data e valor." }, 400);
    const res = await supabaseFetch(env, "/rest/v1/lancamentos", { method: "POST", body: JSON.stringify(payload) });
    const data = await readJsonSafe(res);
    if (!res.ok) return json({ error: data?.message || data?.error || data?.raw || "Erro ao salvar lançamento.", detalhe: data }, res.status);
    return json({ ok: true, data: Array.isArray(data) ? data[0] : data });
  } catch (err) {
    return json({ error: err?.message || "Erro interno ao salvar lançamento." }, 500);
  }
}

async function handleListPortarias(request, env) {
  try {
    if (request.method === "OPTIONS") return json({ ok: true });
    if (request.method !== "GET") return json({ error: "Método não permitido. Use GET." }, 405);
    const missing = requiredEnv(env);
    if (missing.length) return json({ error: `Variáveis ausentes no Cloudflare: ${missing.join(", ")}` }, 500);
    const admin = await assertAdmin(env, request);
    if (!admin.ok) return admin.response;

    const res = await supabaseFetch(env, `/rest/v1/portaria_logins?select=*&order=nome.asc`, { method: "GET" });
    const data = await readJsonSafe(res);
    if (!res.ok) return json({ error: data?.message || data?.error || data?.raw || "Erro ao listar portarias.", detalhe: data }, res.status);
    return json({ ok: true, data: Array.isArray(data) ? data : [] });
  } catch (err) {
    return json({ error: err?.message || "Erro interno ao listar portarias." }, 500);
  }
}


async function handleListMensagens(request, env) {
  try {
    if (request.method === "OPTIONS") return json({ ok: true });
    if (request.method !== "GET") return json({ error: "Método não permitido. Use GET." }, 405);
    const missing = requiredEnv(env);
    if (missing.length) return json({ error: `Variáveis ausentes no Cloudflare: ${missing.join(", ")}` }, 500);
    const auth = await assertAuthenticatedProfile(env, request);
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const role = String(auth.profile.role || "").toLowerCase();
    let condominioId = String(url.searchParams.get("condominio_id") || "").trim();
    let path = "/rest/v1/mensagens_moradores?select=*&order=created_at.asc";

    if (role === "admin") {
      if (condominioId) path = `/rest/v1/mensagens_moradores?condominio_id=eq.${encodeURIComponent(condominioId)}&select=*&order=created_at.asc`;
    } else if (role === "morador") {
      path = `/rest/v1/mensagens_moradores?morador_id=eq.${encodeURIComponent(auth.profile.id)}&select=*&order=created_at.asc`;
    } else {
      return json({ error: "Acesso permitido apenas para administrador ou morador." }, 403);
    }

    const res = await supabaseFetch(env, path, { method: "GET" });
    const data = await readJsonSafe(res);
    if (!res.ok) return json({ error: data?.message || data?.error || data?.raw || "Erro ao listar mensagens.", detalhe: data }, res.status);
    return json({ ok: true, data: Array.isArray(data) ? data : [] });
  } catch (err) {
    return json({ error: err?.message || "Erro interno ao listar mensagens." }, 500);
  }
}

async function handleSendMensagem(request, env) {
  try {
    if (request.method === "OPTIONS") return json({ ok: true });
    if (request.method !== "POST") return json({ error: "Método não permitido. Use POST." }, 405);
    const missing = requiredEnv(env);
    if (missing.length) return json({ error: `Variáveis ausentes no Cloudflare: ${missing.join(", ")}` }, 500);
    const auth = await assertAuthenticatedProfile(env, request);
    if (!auth.ok) return auth.response;
    if (String(auth.profile.role || "").toLowerCase() !== "morador") return json({ error: "Apenas moradores podem enviar mensagem ao síndico." }, 403);

    const body = await request.json().catch(() => null);
    const assunto = String(body?.assunto || "").trim();
    const descricao = String(body?.descricao || "").trim();
    if (!assunto || !descricao) return json({ error: "Preencha assunto e descrição." }, 400);
    if (!auth.profile.condominio_id) return json({ error: "Seu cadastro não está vinculado a um condomínio." }, 400);

    const payload = {
      condominio_id: auth.profile.condominio_id,
      morador_id: auth.profile.id,
      morador_nome: auth.profile.nome || auth.profile.email || "Morador",
      morador_unidade: auth.profile.unidade || "",
      remetente_tipo: "morador",
      assunto,
      descricao,
      respondida: false,
      created_by: auth.user.id
    };
    const res = await supabaseFetch(env, "/rest/v1/mensagens_moradores", { method: "POST", body: JSON.stringify(payload) });
    const data = await readJsonSafe(res);
    if (!res.ok) return json({ error: data?.message || data?.error || data?.raw || "Erro ao salvar mensagem.", detalhe: data }, res.status);
    return json({ ok: true, data: Array.isArray(data) ? data[0] : data });
  } catch (err) {
    return json({ error: err?.message || "Erro interno ao enviar mensagem." }, 500);
  }
}

async function handleReplyMensagem(request, env) {
  try {
    if (request.method === "OPTIONS") return json({ ok: true });
    if (request.method !== "POST") return json({ error: "Método não permitido. Use POST." }, 405);
    const missing = requiredEnv(env);
    if (missing.length) return json({ error: `Variáveis ausentes no Cloudflare: ${missing.join(", ")}` }, 500);
    const admin = await assertAdmin(env, request);
    if (!admin.ok) return admin.response;

    const body = await request.json().catch(() => null);
    const moradorId = String(body?.morador_id || "").trim();
    const descricao = String(body?.descricao || "").trim();
    if (!moradorId || !descricao) return json({ error: "Selecione o morador e digite a resposta." }, 400);

    const profRes = await supabaseFetch(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(moradorId)}&select=id,nome,email,unidade,condominio_id,role&limit=1`, { method: "GET" });
    const profData = await readJsonSafe(profRes);
    const morador = Array.isArray(profData) ? profData[0] : null;
    if (!morador || String(morador.role || "").toLowerCase() !== "morador") return json({ error: "Morador não encontrado para responder." }, 404);

    const payload = {
      condominio_id: morador.condominio_id,
      morador_id: morador.id,
      morador_nome: morador.nome || morador.email || "Morador",
      morador_unidade: morador.unidade || "",
      remetente_tipo: "admin",
      assunto: "Resposta da administração",
      descricao,
      respondida: true,
      created_by: admin.user.id
    };
    const res = await supabaseFetch(env, "/rest/v1/mensagens_moradores", { method: "POST", body: JSON.stringify(payload) });
    const data = await readJsonSafe(res);
    if (!res.ok) return json({ error: data?.message || data?.error || data?.raw || "Erro ao salvar resposta.", detalhe: data }, res.status);
    await supabaseFetch(env, `/rest/v1/mensagens_moradores?morador_id=eq.${encodeURIComponent(morador.id)}&remetente_tipo=eq.morador`, { method: "PATCH", body: JSON.stringify({ respondida: true }) }).catch(() => null);
    return json({ ok: true, data: Array.isArray(data) ? data[0] : data });
  } catch (err) {
    return json({ error: err?.message || "Erro interno ao responder mensagem." }, 500);
  }
}

async function handleMe(request, env) {
  try {
    if (request.method === "OPTIONS") return json({ ok: true });
    if (request.method !== "GET") return json({ error: "Método não permitido. Use GET." }, 405);

    const missing = requiredEnv(env);
    if (missing.length) return json({ error: `Variáveis ausentes no Cloudflare: ${missing.join(", ")}` }, 500);

    const user = await getLoggedUser(env, request);
    if (!user?.id) return json({ error: "Sessão inválida ou expirada. Faça login novamente." }, 401);

    // Busca com service_role para não depender das policies/RLS da tabela profiles.
    // Primeiro tenta pelo UUID do Auth. Se houver cadastro antigo desalinhado, tenta pelo e-mail.
    let res = await supabaseFetch(
      env,
      `/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=*&limit=1`,
      { method: "GET" }
    );
    let rows = await readJsonSafe(res);
    let profile = Array.isArray(rows) ? rows[0] : null;

    if (!profile && user.email) {
      res = await supabaseFetch(
        env,
        `/rest/v1/profiles?email=eq.${encodeURIComponent(String(user.email).toLowerCase())}&select=*&limit=1`,
        { method: "GET" }
      );
      rows = await readJsonSafe(res);
      profile = Array.isArray(rows) ? rows[0] : null;
    }

    if (!profile) {
      return json({ error: "Perfil não encontrado na tabela profiles para este usuário.", user: { id: user.id, email: user.email } }, 404);
    }

    return json({ ok: true, user: { id: user.id, email: user.email }, profile });
  } catch (err) {
    return json({ error: err?.message || "Erro interno ao buscar perfil.", stack: String(err?.stack || "").slice(0, 800) }, 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/me") return handleMe(request, env);
    if (url.pathname === "/api/list-moradores") return handleListMoradores(request, env);
    if (url.pathname === "/api/list-lancamentos") return handleListLancamentos(request, env);
    if (url.pathname === "/api/save-lancamento") return handleSaveLancamento(request, env);
    if (url.pathname === "/api/list-portarias") return handleListPortarias(request, env);
    if (url.pathname === "/api/list-mensagens") return handleListMensagens(request, env);
    if (url.pathname === "/api/send-mensagem") return handleSendMensagem(request, env);
    if (url.pathname === "/api/reply-mensagem") return handleReplyMensagem(request, env);
    if (url.pathname === "/api/create-user") return handleCreateUser(request, env);
    if (url.pathname === "/api/create-portaria") return handleCreatePortaria(request, env);
    if (url.pathname === "/api/update-portaria") return handleUpdatePortaria(request, env);
    if (url.pathname === "/api/delete-portaria") return handleDeletePortaria(request, env);
    if (url.pathname === "/api/delete-user") return handleDeleteUser(request, env);
    if (url.pathname === "/api/update-password") return handleUpdatePassword(request, env);
    if (url.pathname === "/api/health") {
      const missing = requiredEnv(env);
      return json({
        ok: missing.length === 0,
        missing,
        mode: "worker-assets",
        version: "corrigido-rotas-listagem-2026-05-22",
        routes: ["/api/me", "/api/list-moradores", "/api/list-lancamentos", "/api/save-lancamento", "/api/list-portarias", "/api/create-user", "/api/create-portaria", "/api/update-portaria", "/api/delete-portaria", "/api/delete-user", "/api/update-password", "/api/list-mensagens", "/api/send-mensagem", "/api/reply-mensagem"],
        database_required: ["condominios", "profiles", "portaria_logins", "lancamentos", "mensagens_moradores", "anexos", "storage.documentos"]
      }, missing.length ? 500 : 200);
    }

    if (request.method === "OPTIONS") return json({ ok: true });

    if (env.ASSETS) return env.ASSETS.fetch(request);

    return new Response("Not found", { status: 404 });
  }
};