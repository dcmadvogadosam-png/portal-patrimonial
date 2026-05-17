const corsHeaders = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization"
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

const cleanUrl = (env) => String(env.SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = (env) => String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

async function readJsonSafe(res) {
  const text = await res.text().catch(() => "");
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

function headers(env, extra = {}) {
  const key = serviceKey(env);
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra
  };
}

async function sb(env, path, options = {}) {
  return fetch(`${cleanUrl(env)}${path}`, {
    ...options,
    headers: headers(env, options.headers || {})
  });
}

async function getLoggedUser(env, request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const res = await fetch(`${cleanUrl(env)}/auth/v1/user`, {
    headers: { apikey: serviceKey(env), Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;
  return res.json();
}

async function assertAdmin(env, request) {
  const user = await getLoggedUser(env, request);
  if (!user?.id) return { ok: false, response: json({ error: "Sessão inválida. Faça login novamente como administrador." }, 401) };

  const res = await sb(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,email,role,ativo&limit=1`, { method: "GET" });
  const rows = await readJsonSafe(res);
  const profile = Array.isArray(rows) ? rows[0] : null;

  if (!profile || profile.role !== "admin" || profile.ativo === false) {
    return { ok: false, response: json({ error: "Acesso negado. Apenas administradores podem importar backup." }, 403) };
  }
  return { ok: true, user, profile };
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

function cleanCondominio(c) {
  return {
    ...pick(c, ["id", "created_at"]),
    nome: c.nome || c.name || "Condomínio sem nome",
    endereco: c.endereco || c.address || ""
  };
}

function normalizePeople(value) {
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/\n|,/).map(v => v.trim()).filter(Boolean);
  return [];
}

function cleanProfile(m, authId) {
  return {
    id: authId,
    nome: m.nome || m.name || m.email || "Morador",
    email: String(m.email || "").trim().toLowerCase(),
    role: "morador",
    unidade: m.unidade || m.apartamento || m.unit || null,
    condominio_id: m.condominio_id || m.condominioId || null,
    cpf: m.cpf || null,
    celular: m.celular || m.telefone || m.phone || null,
    placa_veiculo: m.placa_veiculo || m.placa || null,
    foto_placa_veiculo_url: m.foto_placa_veiculo_url || null,
    pessoas_moram_junto: normalizePeople(m.pessoas_moram_junto || m.moradores_adicionais || m.pessoas || []),
    ativo: m.ativo !== false
  };
}

function cleanLancamento(l) {
  return {
    ...pick(l, ["id", "created_at"]),
    condominio_id: l.condominio_id || l.condominioId || null,
    tipo: l.tipo === "receita" ? "receita" : "despesa",
    data: String(l.data || new Date().toISOString().slice(0,10)).slice(0,10),
    valor: Number(l.valor || 0),
    categoria: l.categoria || null,
    descricao: l.descricao || null,
    local: l.local || null,
    justificativa: l.justificativa || null,
    anexo_url: l.anexo_url || null,
    nota_url: l.nota_url || null,
    created_by: l.created_by || null
  };
}

async function listAuthUsers(env) {
  const users = [];
  for (let page = 1; page <= 20; page++) {
    const res = await sb(env, `/auth/v1/admin/users?page=${page}&per_page=100`, { method: "GET" });
    const data = await readJsonSafe(res);
    if (!res.ok) throw new Error(`Erro ao listar usuários Auth: ${JSON.stringify(data)}`);
    const chunk = Array.isArray(data?.users) ? data.users : [];
    users.push(...chunk);
    if (chunk.length < 100) break;
  }
  return users;
}

function tempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#";
  let pass = "Dm@";
  for (let i=0;i<12;i++) pass += alphabet[Math.floor(Math.random()*alphabet.length)];
  return pass;
}

export async function onRequestOptions() {
  return new Response("ok", { headers: corsHeaders });
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: "Variáveis SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes no Cloudflare." }, 500);
    }

    const admin = await assertAdmin(env, request);
    if (!admin.ok) return admin.response;

    const body = await request.json().catch(() => ({}));
    const backup = body.backup || body;

    const condominios = Array.isArray(backup.condominios) ? backup.condominios : [];
    const moradores = Array.isArray(backup.moradores) ? backup.moradores : (Array.isArray(backup.profiles) ? backup.profiles.filter(p => p.role === "morador") : []);
    const lancamentos = Array.isArray(backup.lancamentos) ? backup.lancamentos : [];

    if (!condominios.length && !moradores.length && !lancamentos.length) {
      return json({ error: "Backup vazio ou em formato incompatível." }, 400);
    }

    const avisos = [];
    let totalCondominios = 0, totalMoradores = 0, totalLancamentos = 0, authCriados = 0;

    // 1. Condomínios
    const condominiosClean = condominios.map(cleanCondominio).filter(c => c.nome);
    if (condominiosClean.length) {
      const res = await sb(env, "/rest/v1/condominios?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(condominiosClean)
      });
      const data = await readJsonSafe(res);
      if (!res.ok) return json({ error: "Erro ao importar condomínios.", detalhe: data }, res.status);
      totalCondominios = condominiosClean.length;
    }

    // 2. Moradores + Auth
    const authUsers = await listAuthUsers(env);
    const authByEmail = new Map(authUsers.map(u => [String(u.email || "").toLowerCase(), u]));

    for (const m of moradores) {
      const email = String(m.email || "").trim().toLowerCase();
      if (!email) { avisos.push(`Morador sem e-mail ignorado: ${m.nome || m.id || "sem identificação"}`); continue; }

      let authUser = authByEmail.get(email);
      if (!authUser?.id) {
        const createRes = await sb(env, "/auth/v1/admin/users", {
          method: "POST",
          body: JSON.stringify({
            email,
            password: tempPassword(),
            email_confirm: true,
            user_metadata: { nome: m.nome || "" }
          })
        });
        const created = await readJsonSafe(createRes);
        if (!createRes.ok) {
          avisos.push(`Não foi possível criar Auth para ${email}: ${JSON.stringify(created)}`);
          continue;
        }
        authUser = created.user || created;
        authByEmail.set(email, authUser);
        authCriados++;
      }

      const profile = cleanProfile(m, authUser.id);
      const res = await sb(env, "/rest/v1/profiles?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(profile)
      });
      const data = await readJsonSafe(res);
      if (!res.ok) {
        avisos.push(`Erro ao importar morador ${email}: ${JSON.stringify(data)}`);
        continue;
      }
      totalMoradores++;
    }

    // 3. Lançamentos
    const lancamentosClean = lancamentos.map(cleanLancamento).filter(l => l.condominio_id && l.valor >= 0);
    if (lancamentosClean.length) {
      const res = await sb(env, "/rest/v1/lancamentos?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(lancamentosClean)
      });
      const data = await readJsonSafe(res);
      if (!res.ok) return json({ error: "Erro ao importar lançamentos.", detalhe: data }, res.status);
      totalLancamentos = lancamentosClean.length;
    }

    return json({
      ok: true,
      importados: {
        condominios: totalCondominios,
        moradores: totalMoradores,
        lancamentos: totalLancamentos,
        auth_criados: authCriados
      },
      avisos
    });

  } catch (err) {
    return json({ error: err?.message || "Erro interno ao importar backup." }, 500);
  }
}
