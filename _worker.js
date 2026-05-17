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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/create-user") return handleCreateUser(request, env);
    if (url.pathname === "/api/delete-user") return handleDeleteUser(request, env);
    if (url.pathname === "/api/health") {
      const missing = requiredEnv(env);
      return json({
        ok: missing.length === 0,
        missing,
        mode: "worker-assets",
        routes: ["/api/create-user", "/api/delete-user"],
        database_required: ["condominios", "profiles", "lancamentos", "anexos", "storage.documentos"]
      }, missing.length ? 500 : 200);
    }

    if (request.method === "OPTIONS") return json({ ok: true });

    if (env.ASSETS) return env.ASSETS.fetch(request);

    return new Response("Not found", { status: 404 });
  }
};