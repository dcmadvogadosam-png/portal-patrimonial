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
function cleanSupabaseUrl(env) { return String(env.SUPABASE_URL || "").replace(/\/$/, ""); }
async function readJsonSafe(res) { const text = await res.text().catch(() => ""); if (!text) return {}; try { return JSON.parse(text); } catch { return { raw: text }; } }
async function supabaseFetch(env, path, options = {}) {
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation", ...(options.headers || {}) };
  return fetch(`${cleanSupabaseUrl(env)}${path}`, { ...options, headers });
}
async function getLoggedUser(env, request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const res = await fetch(`${cleanSupabaseUrl(env)}/auth/v1/user`, { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return res.json();
}
async function assertAdmin(env, request) {
  const user = await getLoggedUser(env, request);
  if (!user?.id) return { ok: false, response: json({ error: "Sessão inválida. Faça logout, login novamente como administrador e tente outra vez." }, 401) };
  const res = await supabaseFetch(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,email,role,ativo&limit=1`, { method: "GET" });
  const rows = await readJsonSafe(res);
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile || profile.role !== "admin" || profile.ativo === false) return { ok: false, response: json({ error: "Acesso negado. O usuário logado precisa ser administrador." }, 403) };
  return { ok: true, user, profile };
}
async function findAuthUserByEmail(env, email) {
  if (!email) return null;
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
  const res = await supabaseFetch(env, `/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, { method: "PATCH", body: JSON.stringify({ password }) });
  const data = await readJsonSafe(res);
  return { res, data };
}
export async function onRequestOptions() { return json({ ok: true }); }
export async function onRequestPost({ request, env }) { return updatePassword(request, env); }
export async function onRequestPatch({ request, env }) { return updatePassword(request, env); }
async function updatePassword(request, env) {
  try {
    const missing = requiredEnv(env);
    if (missing.length) return json({ error: `Variáveis ausentes no Cloudflare: ${missing.join(", ")}` }, 500);
    const admin = await assertAdmin(env, request); if (!admin.ok) return admin.response;
    const body = await request.json().catch(() => null);
    const selectedId = String(body?.user_id || body?.id || "").trim();
    const selectedEmail = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || body?.nova_senha || "");
    if (!selectedId && !selectedEmail) return json({ error: "Selecione o morador para alterar a senha." }, 400);
    if (password.length < 6) return json({ error: "A nova senha precisa ter pelo menos 6 caracteres." }, 400);
    let profile = null;
    if (selectedId) {
      const profileRes = await supabaseFetch(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(selectedId)}&select=id,email,nome,role&limit=1`, { method: "GET" });
      const rows = await readJsonSafe(profileRes); if (Array.isArray(rows) && rows.length) profile = rows[0];
    }
    if (!profile && selectedEmail) {
      const profileRes = await supabaseFetch(env, `/rest/v1/profiles?email=eq.${encodeURIComponent(selectedEmail)}&select=id,email,nome,role&limit=1`, { method: "GET" });
      const rows = await readJsonSafe(profileRes); if (Array.isArray(rows) && rows.length) profile = rows[0];
    }
    if (!profile) return json({ error: "Morador não encontrado na tabela profiles." }, 404);
    if (profile.role && profile.role !== "morador") return json({ error: "O usuário selecionado não é um morador." }, 400);
    let authUserId = profile.id || selectedId;
    let attempt = await updateAuthPassword(env, authUserId, password);
    if (!attempt.res.ok && profile.email) {
      const authUser = await findAuthUserByEmail(env, profile.email);
      if (authUser?.id) { authUserId = authUser.id; attempt = await updateAuthPassword(env, authUserId, password); }
    }
    if (!attempt.res.ok) {
      const data = attempt.data || {};
      return json({ error: data?.msg || data?.message || data?.error || data?.raw || "Erro ao alterar senha no Supabase Auth. Confira se a variável SUPABASE_SERVICE_ROLE_KEY é a chave service_role correta e se o morador existe em Authentication > Users.", detalhe: data, dica: "Este morador precisa existir também em Supabase > Authentication > Users com o mesmo e-mail do cadastro." }, attempt.res.status || 500);
    }
    return json({ ok: true, user_id: authUserId, morador: profile });
  } catch (err) { return json({ error: err?.message || "Erro interno ao alterar senha do morador." }, 500); }
}
