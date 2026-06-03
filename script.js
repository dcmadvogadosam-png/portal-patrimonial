console.log("Portal DM versão: import-backup-direto-sem-api-logo-sem-circulo-2026-05-17");
console.log("Portal DM versão: importar-backup-json-2026-05-17");
console.log("Portal DM versão: senha-via-supabase-edge-function-2026-05-17");
console.log("Portal DM versão: senha-metodo-simples-direto-2026-05-17");

const $ = (id) => document.getElementById(id);
const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

let supabaseClient = null;
let currentUser = null;
let profile = null;
let condominios = [];
let lancamentos = [];
let moradores = [];
let portarias = [];
let whatsappMoradorAtual = null;
let mensagens = [];
let conversaMoradorSelecionado = null;
let ocorrencias = [];
let ocorrenciaCategorias = [];
let ocorrenciaSelecionada = null;
const INTERNAL_ROLES = ["admin","administrativo","engenharia","financeiro","juridico","jurídico","manutencao","manutenção","seguranca","segurança","limpeza","portaria","obras","prestadores"];
const SECTOR_ROLES = INTERNAL_ROLES.filter(r => r !== "admin" && r !== "portaria");
function normalizeRole(v=""){ return String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,""); }
function isInternalRole(){ return INTERNAL_ROLES.map(normalizeRole).includes(normalizeRole(profile?.role)); }
function roleLabel(role){ const r=normalizeRole(role); return r==="admin"?"Administrador":r==="portaria"?"Portaria":r==="morador"?"Morador":String(role||"Setor interno").replace(/^./,c=>c.toUpperCase()); }

function msg(el, text, type = "") { if (el) { el.textContent = text || ""; el.className = `message ${type}`; } }
function show(el) { el?.classList.remove("hidden"); }
function hide(el) { el?.classList.add("hidden"); }
function escapeHtml(value = "") { return String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
function parsePessoasMoramJunto(value = "") {
  return String(value || "")
    .split(/\n|,/)
    .map(v => v.trim())
    .filter(Boolean);
}
function formatPessoasMoramJunto(value) {
  const lista = Array.isArray(value) ? value : parsePessoasMoramJunto(value || "");
  if (!lista.length) return "-";
  return lista.map(escapeHtml).join("<br>");
}
function formatDate(d) { if (!d) return "-"; const [y,m,day] = String(d).split("-"); return day && m && y ? `${day}/${m}/${y}` : d; }
function todayMonth(dateString){ const d = dateString ? new Date(dateString+'T00:00:00') : null; const now = new Date(); return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }

function requireConfig() {
  if (!window.DM_SUPABASE_URL || !window.DM_SUPABASE_ANON_KEY || window.DM_SUPABASE_URL.includes("COLE_AQUI") || window.DM_SUPABASE_ANON_KEY.includes("COLE_AQUI")) {
    msg($("loginMsg"), "Configure o Supabase no arquivo config.js antes de usar o portal.", "error");
    msg($("adminLoginMsg"), "Configure o Supabase no arquivo config.js antes de fazer login.", "error");
    return false;
  }
  supabaseClient = window.supabase.createClient(window.DM_SUPABASE_URL, window.DM_SUPABASE_ANON_KEY);
  return true;
}

function bindBasicEvents() {
  $("tabMorador")?.addEventListener("click", () => switchLoginTab("morador"));
  $("tabAdmin")?.addEventListener("click", () => switchLoginTab("admin"));
  $("tabPortaria")?.addEventListener("click", () => switchLoginTab("portaria"));
  $("tabEquipe")?.addEventListener("click", () => switchLoginTab("equipe"));
  $("loginBtn")?.addEventListener("click", loginMorador);
  $("adminLoginBtn")?.addEventListener("click", loginAdmin);
  $("portariaLoginBtn")?.addEventListener("click", loginPortaria);
  $("equipeLoginBtn")?.addEventListener("click", loginEquipe);
  $("logoutBtn")?.addEventListener("click", logout);
  $("printBtn")?.addEventListener("click", () => window.print());
  $("mobileMenuBtn")?.addEventListener("click", () => $("adminSidebar")?.classList.toggle("open"));
  $("filterTipo")?.addEventListener("change", renderLancamentos);
  $("filterBusca")?.addEventListener("input", renderLancamentos);
  $("buscaCondominio")?.addEventListener("input", renderCondominiosTable);
  $("buscaMorador")?.addEventListener("input", renderMoradoresTable);
  $("senhaCondominio")?.addEventListener("change", popularMoradoresSenha);
  $("pesquisarSenhaMorador")?.addEventListener("click", popularMoradoresSenha);
  $("senhaBuscaMorador")?.addEventListener("input", popularMoradoresSenha);
  $("alterarSenhaMoradorBtn")?.addEventListener("click", alterarSenhaMorador);
  $("formPortaria")?.addEventListener("submit", criarPortaria);
  $("verificarPortariaBtn")?.addEventListener("click", renderPortariaTable);
  $("buscaPortariaMorador")?.addEventListener("input", renderPortariaMoradores);
  $("closeWhatsapp")?.addEventListener("click", () => hide($("whatsappModal")));
  $("whatsappModal")?.addEventListener("click", (e) => { if (e.target?.id === "whatsappModal") hide($("whatsappModal")); });
  $("enviarWhatsappBtn")?.addEventListener("click", enviarWhatsappMorador);
  $("abrirFaleSindicoBtn")?.addEventListener("click", abrirFaleSindico);
  $("closeFaleSindico")?.addEventListener("click", () => hide($("faleSindicoModal")));
  $("faleSindicoModal")?.addEventListener("click", (e) => { if (e.target?.id === "faleSindicoModal") hide($("faleSindicoModal")); });
  $("enviarSindicoBtn")?.addEventListener("click", enviarMensagemSindico);
  $("carregarMensagensBtn")?.addEventListener("click", carregarMensagensAdmin);
  $("mensagensCondominio")?.addEventListener("change", carregarMensagensAdmin);
  $("enviarRespostaMensagemBtn")?.addEventListener("click", responderMensagemMorador);
  $("closeDetail")?.addEventListener("click", () => hide($("detailModal")));
  $("detailModal")?.addEventListener("click", (e) => { if (e.target?.id === "detailModal") hide($("detailModal")); });
  $("formCondominio")?.addEventListener("submit", criarCondominio);
  $("formMorador")?.addEventListener("submit", criarMorador);
  $("formLancamento")?.addEventListener("submit", criarLancamento);
  $("formRemoverCondominio")?.addEventListener("submit", removerCondominio);
  $("formRemoverMorador")?.addEventListener("submit", removerMorador);
  $("formRemoverLancamento")?.addEventListener("submit", removerLancamento);
  $("exportCsvBtn")?.addEventListener("click", exportCsv);
  $("backupJsonBtn")?.addEventListener("click", backupJson);
  $("backupJsonUpload")?.addEventListener("change", importarBackupJson);
  $("lanAnexo")?.addEventListener("change", (e) => { $("lanAnexoNome").textContent = e.target.files?.[0]?.name || "Nenhum arquivo selecionado"; });
  $("moradorFotoPlaca")?.addEventListener("change", (e) => { $("moradorFotoPlacaNome").textContent = e.target.files?.[0]?.name || "Nenhuma imagem selecionada"; });
  $("formOcorrencia")?.addEventListener("submit", criarOcorrencia);
  $("formOcCategoria")?.addEventListener("submit", salvarOcorrenciaCategoria);
  $("formOcorrenciaMorador")?.addEventListener("submit", criarOcorrenciaMorador);
  $("atualizarOcorrenciasBtn")?.addEventListener("click", carregarOcorrencias);
  $("ocFiltroCond")?.addEventListener("change", renderOcorrencias);
  $("ocFiltroStatus")?.addEventListener("change", renderOcorrencias);
  $("ocFiltroBusca")?.addEventListener("input", renderOcorrencias);
  $("ocAnexos")?.addEventListener("change", (e) => { const n=e.target.files?.length||0; $("ocAnexosNome").textContent = n ? `${n} arquivo(s) selecionado(s)` : "Nenhum arquivo selecionado"; });
  $("closeOcorrenciaModal")?.addEventListener("click", () => hide($("ocorrenciaModal")));
  $("ocorrenciaModal")?.addEventListener("click", (e) => { if(e.target?.id === "ocorrenciaModal") hide($("ocorrenciaModal")); });
  document.querySelectorAll("[data-admin-tab]").forEach(btn => btn.addEventListener("click", () => setAdminTab(btn.dataset.adminTab)));
}

function switchLoginTab(tab){
  $("tabMorador")?.classList.toggle("active", tab === "morador");
  $("tabAdmin")?.classList.toggle("active", tab === "admin");
  $("tabPortaria")?.classList.toggle("active", tab === "portaria");
  $("tabEquipe")?.classList.toggle("active", tab === "equipe");
  $("moradorLoginBox")?.classList.toggle("hidden", tab !== "morador");
  $("adminLoginBox")?.classList.toggle("hidden", tab !== "admin");
  $("portariaLoginBox")?.classList.toggle("hidden", tab !== "portaria");
  $("equipeLoginBox")?.classList.toggle("hidden", tab !== "equipe");
}
function setAdminTab(tab){
  document.querySelectorAll("[data-admin-tab]").forEach(b => b.classList.toggle("active", b.dataset.adminTab === tab));
  document.querySelectorAll("[data-panel]").forEach(p => p.classList.toggle("hidden", p.dataset.panel !== tab));
  $("adminSidebar")?.classList.remove("open");
  if(tab === "ocorrencias") carregarOcorrencias();
}

async function init() {
  bindBasicEvents();
  if (!requireConfig()) return;
  await carregarCondominios();
  await restoreSession();
}

async function restoreSession() {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session?.user) { currentUser = data.session.user; await carregarPerfil(); if (profile) await abrirDashboard(); }
}

async function carregarCondominios() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient.from("condominios").select("*").order("nome", { ascending: true });
  condominios = error ? [] : (data || []).map(c => ({...c, nome: c.nome || c.name || "Condomínio sem nome", endereco: c.endereco || c.address || ""}));
  popularSelects(); popularSetorRoles(); renderCondominiosTable(); renderResumo();
}

function popularSelects() {
  const options = `<option value="">Selecione o condomínio</option>` + condominios.map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join("");
  ["loginCondominio","portariaLoginCondominio","moradorCondominio","lanCondominio","removerCondominio","senhaCondominio","portariaCondominio","gestaoPortariaCondominio","mensagensCondominio","ocCond","ocFiltroCond"].forEach(id => { const el=$(id); if(el) el.innerHTML=options; });
}


function popularSetorRoles(){
  const options = `<option value="">Selecione o perfil responsável</option>` + SECTOR_ROLES.map(r => `<option value="${escapeHtml(normalizeRole(r))}">${escapeHtml(roleLabel(r))}</option>`).join("");
  ["catRole"].forEach(id => { const el=$(id); if(el) el.innerHTML = options; });
}

async function loginMorador() {
  msg($("loginMsg"), "");
  const email = $("loginEmail")?.value?.trim(); const password = $("loginSenha")?.value || ""; const condominioId = $("loginCondominio")?.value || "";
  if (!email || !password || !condominioId) return msg($("loginMsg"), "Informe condomínio, e-mail e senha.", "error");
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return msg($("loginMsg"), "Login inválido: " + error.message, "error");
  currentUser = data.user; await carregarPerfil();
  if (!profile) { await logout(); return; }
  if (profile.role !== "admin" && profile.condominio_id !== condominioId) { await supabaseClient.auth.signOut(); return msg($("loginMsg"), "Este usuário não pertence ao condomínio selecionado.", "error"); }
  await abrirDashboard();
}

async function loginAdmin() {
  msg($("adminLoginMsg"), "");
  const email = $("adminEmail")?.value?.trim(); const password = $("adminSenha")?.value || "";
  if (!email || !password) return msg($("adminLoginMsg"), "Informe e-mail e senha do administrador.", "error");
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return msg($("adminLoginMsg"), "Login inválido: " + error.message, "error");
  currentUser = data.user; await carregarPerfil();
  if (!isInternalRole()) { await supabaseClient.auth.signOut(); return msg($("adminLoginMsg"), "Este login não possui permissão administrativa ou de setor interno.", "error"); }
  await abrirDashboard();
}

async function loginEquipe() {
  msg($("equipeLoginMsg"), "");
  const email = $("equipeEmail")?.value?.trim();
  const password = $("equipeSenha")?.value || "";
  if (!email || !password) return msg($("equipeLoginMsg"), "Informe e-mail e senha da equipe.", "error");
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return msg($("equipeLoginMsg"), "Login inválido: " + error.message, "error");
  currentUser = data.user;
  await carregarPerfil();
  const roleNorm = normalizeRole(profile?.role);
  const setorPermitido = SECTOR_ROLES.map(normalizeRole).includes(roleNorm);
  if (!profile || !setorPermitido) {
    await supabaseClient.auth.signOut();
    return msg($("equipeLoginMsg"), "Este login não possui permissão de equipe/setor interno.", "error");
  }
  await abrirDashboard();
}

async function loginPortaria() {
  msg($("portariaLoginMsg"), "");
  const email = $("portariaEmail")?.value?.trim(); const password = $("portariaSenha")?.value || ""; const condominioId = $("portariaLoginCondominio")?.value || "";
  if (!email || !password || !condominioId) return msg($("portariaLoginMsg"), "Informe condomínio, e-mail e senha da portaria.", "error");
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return msg($("portariaLoginMsg"), "Login inválido: " + error.message, "error");
  currentUser = data.user; await carregarPerfil();
  if (!profile) { await logout(); return; }
  if (profile.role !== "portaria") { await supabaseClient.auth.signOut(); return msg($("portariaLoginMsg"), "Este login não possui permissão de portaria.", "error"); }
  if (profile.condominio_id !== condominioId) { await supabaseClient.auth.signOut(); return msg($("portariaLoginMsg"), "Este login da portaria não pertence ao condomínio selecionado.", "error"); }
  await abrirDashboard();
}

async function carregarPerfil() {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const token = sessionData?.session?.access_token;

  if (token) {
    try {
      const res = await fetch("/api/me", {
        method: "GET",
        headers: { "Authorization": `Bearer ${token}` }
      });
      const result = await res.json().catch(() => ({}));
      if (res.ok && result?.profile) {
        profile = result.profile;
      } else {
        profile = null;
        msg($("loginMsg"), result?.error || "Perfil não encontrado. Verifique a tabela profiles.", "error");
        msg($("adminLoginMsg"), result?.error || "Perfil não encontrado. Verifique a tabela profiles.", "error");
        msg($("equipeLoginMsg"), result?.error || "Perfil não encontrado. Verifique a tabela profiles.", "error");
        msg($("portariaLoginMsg"), result?.error || "Perfil não encontrado. Verifique a tabela profiles.", "error");
        return;
      }
    } catch (err) {
      profile = null;
      msg($("loginMsg"), "Erro ao consultar perfil: " + (err?.message || err), "error");
      msg($("adminLoginMsg"), "Erro ao consultar perfil: " + (err?.message || err), "error");
      msg($("portariaLoginMsg"), "Erro ao consultar perfil: " + (err?.message || err), "error");
      return;
    }
  } else {
    profile = null;
    msg($("loginMsg"), "Sessão expirada. Faça login novamente.", "error");
    return;
  }

  if (profile.ativo === false) {
    profile = null;
    msg($("loginMsg"), "Usuário inativo. Contate a administração.", "error");
    msg($("adminLoginMsg"), "Usuário inativo. Contate a administração.", "error");
    msg($("portariaLoginMsg"), "Usuário inativo. Contate a administração.", "error");
    await supabaseClient.auth.signOut();
    return;
  }
}


async function abrirDashboard() {
  hide($("loginScreen")); show($("dashboardScreen"));
  const roleNorm = normalizeRole(profile?.role);
  const isAdmin = roleNorm === "admin";
  const isPortaria = roleNorm === "portaria";
  const isSetorInterno = isInternalRole() && !isAdmin && !isPortaria;
  const isMorador = !isAdmin && !isPortaria && !isSetorInterno;
  $("dashboardScreen").classList.toggle("is-admin", isAdmin || isSetorInterno);
  $("dashboardScreen").classList.toggle("is-resident", isMorador);
  $("dashboardScreen").classList.toggle("is-portaria", isPortaria);
  $("dashboardScreen").classList.toggle("is-sector", isSetorInterno);
  $("adminSidebar")?.classList.toggle("hidden", !(isAdmin || isSetorInterno));
  $("adminPanel")?.classList.toggle("hidden", !(isAdmin || isSetorInterno));
  $("recordsSection")?.classList.toggle("hidden", isPortaria || isSetorInterno);
  $("portariaPanel")?.classList.toggle("hidden", !isPortaria);
  $("sessionLabel").textContent = profile?.nome || currentUser.email;
  $("sessionRole").textContent = roleLabel(profile?.role);
  $("userRoleLabel").textContent = isAdmin ? "Administrador geral" : (isSetorInterno ? `Setor interno | ${roleLabel(profile?.role)}` : (isPortaria ? "Acesso da portaria" : `Morador | Unidade ${profile.unidade || "-"}`));
  document.querySelectorAll("[data-admin-tab]").forEach(btn => { if(isSetorInterno && btn.dataset.adminTab !== "ocorrencias") btn.classList.add("hidden"); else btn.classList.remove("hidden"); });
  if (!isAdmin && $("filterTipo")) { $("filterTipo").value = "despesa"; $("filterTipo").disabled = true; }
  if (isAdmin && $("filterTipo")) { $("filterTipo").disabled = false; }
  const condominio = isAdmin || isSetorInterno ? { nome: isSetorInterno ? "Minhas ocorrências do setor" : "Todos os condomínios" } : condominios.find(c => c.id === profile.condominio_id);
  $("condominioTitulo").textContent = condominio?.nome || "Condomínio";
  if (isPortaria) { await carregarMoradoresPortaria(); await carregarOcorrenciaCategorias(); renderResumo(); return; }
  if(!isSetorInterno) await carregarLancamentos();
  if (isAdmin) { await carregarMoradores(); await carregarPortarias(); await carregarMensagensAdmin(false); await carregarOcorrenciaCategorias(); }
  if (isSetorInterno) { await carregarOcorrenciaCategorias(); await carregarOcorrencias(); }
  if (isMorador) { show($("residentCommsSection")); await carregarMensagensMorador(); await carregarOcorrenciaCategorias(); }
  renderResumo(); if(isAdmin) setAdminTab("condominios"); if(isSetorInterno) setAdminTab("ocorrencias");
}

async function logout(){ if(supabaseClient) await supabaseClient.auth.signOut(); window.location.reload(); }

async function apiGet(path){
  const {data:sessionData}=await supabaseClient.auth.getSession();
  const token=sessionData?.session?.access_token;
  const res=await fetch(path,{headers:{"Authorization":`Bearer ${token}`}});
  const result=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(result.error || `Erro na API ${path}. Status ${res.status}`);
  return result.data || [];
}

async function apiPost(path, body){
  const {data:sessionData}=await supabaseClient.auth.getSession();
  const token=sessionData?.session?.access_token;
  const res=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},body:JSON.stringify(body || {})});
  const result=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(result.error || `Erro na API ${path}. Status ${res.status}`);
  return result.data || result;
}


async function carregarMoradores() {
  try{
    moradores = await apiGet("/api/list-moradores");
  }catch(error){
    console.error("Erro ao carregar moradores pela API:", error);
    moradores = [];
    msg($("adminMsg"), "Não foi possível carregar os moradores: " + error.message, "error");
  }
  popularMoradores(); renderMoradoresTable(); renderResumo(); renderCondominiosTable(); renderPortariaMoradores();
}
async function carregarMoradoresPortaria(){
  try{
    moradores = await apiGet("/api/list-moradores");
  }catch(error){
    console.error("Erro ao carregar moradores da portaria pela API:", error);
    moradores = [];
  }
  renderPortariaMoradores();
}
async function carregarPortarias(){
  try{
    portarias = await apiGet("/api/list-portarias");
  }catch(error){
    console.error("Erro ao carregar portarias pela API:", error);
    portarias = [];
  }
  renderPortariaTable();
}
function popularMoradores(){
  const el=$("removerMorador");
  if(el) el.innerHTML = `<option value="">Selecione o morador</option>` + moradores.map(m => `<option value="${m.id}">${escapeHtml((m.nome||m.email||"Morador") + (m.unidade?` - Unidade ${m.unidade}`:"") )}</option>`).join("");
  popularMoradoresSenha();
}
function popularMoradoresSenha(){
  const el=$("senhaMoradorSelecionado"); if(!el) return;
  const cond=$("senhaCondominio")?.value || "";
  const busca=($("senhaBuscaMorador")?.value||"").toLowerCase().trim();
  let lista=[...moradores];
  if(cond) lista=lista.filter(m=>m.condominio_id===cond);
  if(busca) lista=lista.filter(m=>[m.nome,m.email,m.unidade,m.cpf].join(" ").toLowerCase().includes(busca));
  el.innerHTML = `<option value="">Selecione um morador</option>` + lista.map(m=>{
    const condNome=condominios.find(c=>c.id===m.condominio_id)?.nome || "Sem condomínio";
    return `<option value="${m.id}">${escapeHtml(m.nome||m.email||"Morador")} | ${escapeHtml(condNome)}${m.unidade?` | Unidade ${escapeHtml(m.unidade)}`:""}</option>`;
  }).join("");
}
function popularLancamentosRemocao(){ const el=$("removerLancamento"); if(!el) return; el.innerHTML = `<option value="">Selecione o lançamento</option>` + lancamentos.map(l => `<option value="${l.id}">${escapeHtml(`${formatDate(l.data)} - ${money(l.valor)} - ${l.categoria || l.descricao || l.tipo}`)}</option>`).join(""); }

async function carregarLancamentos(){
  try{
    lancamentos = await apiGet("/api/list-lancamentos");
  }catch(error){
    console.error("Erro ao carregar lançamentos pela API:", error);
    lancamentos = [];
    msg($("adminMsg"), "Não foi possível carregar os lançamentos: " + error.message, "error");
  }
  renderResumo(); renderLancamentos(); popularLancamentosRemocao();
}

function renderResumo(){
  const isAdmin = profile?.role === "admin";
  const baseItems = isAdmin ? lancamentos.filter(l => todayMonth(l.data)) : lancamentos;
  const receitas = baseItems.filter(l => l.tipo === "receita").reduce((s,l)=>s+Number(l.valor||0),0);
  const despesas = baseItems.filter(l => l.tipo !== "receita").reduce((s,l)=>s+Number(l.valor||0),0);
  if($("totalReceitas")) $("totalReceitas").textContent = money(receitas);
  if($("totalDespesas")) $("totalDespesas").textContent = money(despesas);
  if($("saldoAtual")) $("saldoAtual").textContent = money(receitas-despesas);
  if($("totalRegistros")) $("totalRegistros").textContent = isAdmin ? lancamentos.length : lancamentos.filter(l=>l.tipo !== "receita").length;
  if($("metricCondominios")) $("metricCondominios").textContent = isAdmin ? condominios.length : 1;
  if($("metricMoradores")) $("metricMoradores").textContent = moradores.length;
  if($("labelDespesas")) $("labelDespesas").textContent = isAdmin ? "Despesas (Mês)" : "Total de despesas";
  if($("smallDespesas")) $("smallDespesas").textContent = isAdmin ? "Total registrado" : "Do seu condomínio";
}

function renderCondominiosTable(){
  const tbody=$("condominiosTable"); if(!tbody) return;
  const busca=($("buscaCondominio")?.value||"").toLowerCase();
  const rows=condominios.filter(c => [c.nome,c.endereco].join(" ").toLowerCase().includes(busca)).map(c=>{
    const qtd = moradores.filter(m => m.condominio_id === c.id).length;
    return `<tr><td><strong>${escapeHtml(c.nome)}</strong></td><td>${escapeHtml(c.endereco||"-")}</td><td>${qtd}</td><td>${formatDate(String(c.created_at||"").slice(0,10))}</td><td><button class="table-action" onclick="selectCondominio('${c.id}')">Ver</button></td></tr>`;
  }).join("");
  tbody.innerHTML = rows || `<tr><td colspan="5">Nenhum condomínio cadastrado.</td></tr>`;
}
window.selectCondominio = (id) => { const c=condominios.find(x=>x.id===id); if(c) alert(`${c.nome}\n${c.endereco||"Sem endereço"}`); };

function renderMoradoresTable(){
  const tbody=$("moradoresTable"); if(!tbody) return;
  const busca=($("buscaMorador")?.value||"").toLowerCase();
  const rows=moradores.filter(m => [m.nome,m.email,m.unidade,m.cpf,m.placa_veiculo,(Array.isArray(m.pessoas_moram_junto)?m.pessoas_moram_junto.join(" "):m.pessoas_moram_junto)].join(" ").toLowerCase().includes(busca)).map(m=>{
    const cond = condominios.find(c=>c.id===m.condominio_id)?.nome || "-";
    const foto = m.foto_placa_veiculo_url ? `<a class="mini-link" href="${escapeHtml(m.foto_placa_veiculo_url)}" target="_blank" rel="noopener">Ver imagem</a>` : "-";
    return `<tr><td><strong>${escapeHtml(m.nome||"-")}</strong></td><td>${escapeHtml(m.email||"-")}</td><td>${escapeHtml(m.unidade||"-")}</td><td>${escapeHtml(cond)}</td><td>${formatPessoasMoramJunto(m.pessoas_moram_junto)}</td><td>${escapeHtml(m.placa_veiculo||"-")}</td><td>${foto}</td><td>${m.ativo===false?"Inativo":"Ativo"}</td></tr>`;
  }).join("");
  tbody.innerHTML = rows || `<tr><td colspan="8">Nenhum morador cadastrado.</td></tr>`;
}

function renderLancamentos(){
  const list=$("recordsList"); if(!list) return;
  const tipo=$("filterTipo")?.value||""; const busca=($("filterBusca")?.value||"").toLowerCase().trim();
  let itens=[...lancamentos];
  if(profile?.role !== "admin") itens=itens.filter(l=>l.tipo !== "receita");
  else if(tipo) itens=itens.filter(l=>l.tipo===tipo);
  if(busca) itens=itens.filter(l=>[l.descricao,l.categoria,l.justificativa,l.condominios?.nome].join(" ").toLowerCase().includes(busca));
  list.innerHTML = itens.map(l=>`<article class="record-card"><div><h4>${escapeHtml(l.descricao || l.categoria || "Lançamento")}</h4><div class="record-meta"><span class="tag ${l.tipo === "receita" ? "income" : "expense"}">${l.tipo === "receita" ? "Receita" : "Despesa"}</span><span class="tag">${money(l.valor)}</span><span class="tag">${formatDate(l.data)}</span>${profile?.role==="admin"?`<span class="tag">${escapeHtml(l.condominios?.nome||"")}</span>`:""}${l.categoria?`<span class="tag">${escapeHtml(l.categoria)}</span>`:""}</div><p>${escapeHtml((l.justificativa||"Sem justificativa informada.").slice(0,180))}${(l.justificativa||"").length>180?"...":""}</p></div><div class="record-actions"><button class="btn details-btn" onclick="abrirDetalhes('${l.id}')">Ver detalhes</button></div></article>`).join("") || `<p>Nenhum lançamento encontrado.</p>`;
}

function extrairUrlAnexo(l){ return l.anexo_url || l.nota_url || l.comprovante_url || l.foto_antes_url || l.foto_depois_url || ((l.justificativa||"").match(/https?:\/\/[^\s<>"']+/i)||[])[0] || ""; }
window.abrirDetalhes = function(id){
  const l=lancamentos.find(x=>x.id===id); if(!l) return; const url=extrairUrlAnexo(l); const isImg=/\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(url);
  $("detailContent").innerHTML = `<span class="pill">${l.tipo==="receita"?"Receita":"Despesa"}</span><h2>${escapeHtml(l.descricao||"Lançamento")}</h2><div class="detail-grid"><div class="detail-box"><strong>Valor</strong><p>${money(l.valor)}</p></div><div class="detail-box"><strong>Data</strong><p>${formatDate(l.data)}</p></div><div class="detail-box"><strong>Categoria</strong><p>${escapeHtml(l.categoria||"-")}</p></div></div><div class="detail-box"><strong>Justificativa / Motivo</strong><p>${escapeHtml(l.justificativa||"Não informado.")}</p></div><h3>Documentos e evidências</h3><div class="attachments">${url ? (isImg ? `<div class="attachment image-evidence"><a href="${url}" target="_blank"><img src="${url}" alt="Anexo"></a></div>` : `<div class="attachment"><a href="${url}" target="_blank">Abrir anexo</a></div>`) : `<p>Nenhum anexo informado.</p>`}</div>`;
  show($("detailModal"));
};

async function criarCondominio(e){ e.preventDefault(); msg($("adminMsg"),""); const payload={nome:$("condNome").value.trim(), endereco:$("condEndereco").value.trim()}; const {error}=await supabaseClient.from("condominios").insert(payload); if(error) return msg($("adminMsg"),"Erro ao cadastrar condomínio: "+error.message,"error"); e.target.reset(); await carregarCondominios(); msg($("adminMsg"),"Condomínio cadastrado com sucesso.","ok"); }

async function criarMorador(e){
  e.preventDefault(); msg($("adminMsg"),"");
  const payload={
    nome:$("moradorNome").value.trim(),
    email:$("moradorEmail").value.trim(),
    password:$("moradorSenha").value,
    unidade:$("moradorUnidade").value.trim(),
    condominio_id:$("moradorCondominio").value,
    cpf:$("moradorCpf")?.value?.trim()||"",
    celular:$("moradorCelular")?.value?.trim()||"",
    placa_veiculo:$("moradorPlaca")?.value?.trim()||"",
    pessoas_moram_junto: parsePessoasMoramJunto($("moradorPessoas")?.value || ""),
    foto_placa_veiculo_url:""
  };
  if(!payload.nome||!payload.email||!payload.password||!payload.condominio_id) return msg($("adminMsg"),"Preencha nome, e-mail, senha e condomínio do morador.","error");
  if(payload.password.length < 6) return msg($("adminMsg"),"A senha precisa ter pelo menos 6 caracteres.","error");

  try{
    const fotoPlaca = $("moradorFotoPlaca")?.files?.[0] || null;
    if(fotoPlaca){
      const url = await uploadFile(fotoPlaca, `moradores/placas/${payload.condominio_id}`);
      if(!url) return msg($("adminMsg"),"Não foi possível enviar a foto da placa. Tente novamente.","error");
      payload.foto_placa_veiculo_url = url;
    }

    const {data:sessionData}=await supabaseClient.auth.getSession();
    const token=sessionData?.session?.access_token;
    const res=await fetch("/api/create-user",{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},
      body:JSON.stringify(payload)
    });
    const result=await res.json().catch(()=>({}));
    if(!res.ok) {
      console.error("Erro detalhado ao criar morador:", result);
      const detalhe = result.dica ? ` | ${result.dica}` : (result.etapa ? ` | Etapa: ${result.etapa}` : "");
      return msg($("adminMsg"), (result.error || `Erro ao criar morador. Status: ${res.status}.`) + detalhe, "error");
    }

    e.target.reset();
    if($("moradorFotoPlacaNome")) $("moradorFotoPlacaNome").textContent = "Nenhuma imagem selecionada";
    await carregarMoradores();
    msg($("adminMsg"),"Morador criado com login de acesso e dados salvos.","ok");
  }catch(error){
    msg($("adminMsg"), error?.message || "Erro ao criar morador.","error");
  }
}

function renderPortariaTable(){
  const tbody=$("portariaTable"); if(!tbody) return;
  const cond=$("gestaoPortariaCondominio")?.value || "";
  let lista=[...portarias]; if(cond) lista=lista.filter(p=>p.condominio_id===cond);
  const rows=lista.map(p=>{ const condNome=condominios.find(c=>c.id===p.condominio_id)?.nome || "-"; return `<tr><td><strong>${escapeHtml(p.nome||"-")}</strong></td><td>${escapeHtml(p.cpf||"-")}</td><td>${escapeHtml(p.celular||"-")}</td><td>${escapeHtml(p.email||"-")}</td><td><code>${escapeHtml(p.senha_acesso||"-")}</code></td><td>${escapeHtml(condNome)}</td><td><button class="table-action" onclick="editarPortaria('${p.id}')">Editar</button> <button class="table-action danger-action" onclick="removerPortaria('${p.id}')">Remover</button></td></tr>`; }).join("");
  tbody.innerHTML = rows || `<tr><td colspan="7">Nenhum login de portaria encontrado para o filtro selecionado.</td></tr>`;
}
async function criarPortaria(e){
  e.preventDefault(); msg($("adminMsg"),"");
  const payload={condominio_id:$("portariaCondominio")?.value||"", nome:$("porteiroNome")?.value?.trim()||"", cpf:$("porteiroCpf")?.value?.trim()||"", celular:$("porteiroCelular")?.value?.trim()||"", email:$("porteiroEmail")?.value?.trim().toLowerCase()||"", password:$("porteiroSenha")?.value||""};
  if(!payload.condominio_id||!payload.nome||!payload.email||!payload.password) return msg($("adminMsg"),"Preencha condomínio, nome, e-mail e senha da portaria.","error");
  if(payload.password.length<6) return msg($("adminMsg"),"A senha precisa ter pelo menos 6 caracteres.","error");
  const {data:sessionData}=await supabaseClient.auth.getSession(); const token=sessionData?.session?.access_token;
  const res=await fetch("/api/create-portaria",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},body:JSON.stringify(payload)});
  const result=await res.json().catch(()=>({})); if(!res.ok) return msg($("adminMsg"), result.error||"Erro ao criar login da portaria.", "error");
  e.target.reset(); await carregarPortarias(); msg($("adminMsg"),"Login da portaria criado com sucesso.","ok");
}
window.editarPortaria=async function(id){
  const p=portarias.find(x=>x.id===id); if(!p) return;
  const nome=prompt("Nome do porteiro(a):",p.nome||""); if(nome===null)return; const cpf=prompt("CPF:",p.cpf||""); if(cpf===null)return; const celular=prompt("Celular:",p.celular||""); if(celular===null)return; const email=prompt("E-mail de login:",p.email||""); if(email===null)return; const senha=prompt("Senha de acesso:",p.senha_acesso||""); if(senha===null)return;
  if(String(senha).length<6) return msg($("adminMsg"),"A senha precisa ter pelo menos 6 caracteres.","error");
  const {data:sessionData}=await supabaseClient.auth.getSession(); const token=sessionData?.session?.access_token;
  const res=await fetch("/api/update-portaria",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},body:JSON.stringify({id,nome,cpf,celular,email,password:senha,condominio_id:p.condominio_id,user_id:p.user_id})});
  const result=await res.json().catch(()=>({})); if(!res.ok) return msg($("adminMsg"), result.error||"Erro ao atualizar portaria.", "error");
  await carregarPortarias(); msg($("adminMsg"),"Cadastro da portaria atualizado.","ok");
};
window.removerPortaria=async function(id){
  const p=portarias.find(x=>x.id===id); if(!p)return; if(!confirm(`Remover o login da portaria de ${p.nome||p.email}?`))return;
  const {data:sessionData}=await supabaseClient.auth.getSession(); const token=sessionData?.session?.access_token;
  const res=await fetch("/api/delete-portaria",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},body:JSON.stringify({id,user_id:p.user_id})});
  const result=await res.json().catch(()=>({})); if(!res.ok) return msg($("adminMsg"), result.error||"Erro ao remover portaria.", "error");
  await carregarPortarias(); msg($("adminMsg"),"Login da portaria removido.","ok");
};
function renderPortariaMoradores(){
  const tbody=$("portariaMoradoresTable"); if(!tbody)return; const busca=($("buscaPortariaMorador")?.value||"").toLowerCase().trim(); let lista=[...moradores]; if(profile?.role==="portaria") lista=lista.filter(m=>m.condominio_id===profile.condominio_id);
  if(busca) lista=lista.filter(m=>[m.nome,m.cpf,m.unidade,m.celular,m.placa_veiculo,m.email,Array.isArray(m.pessoas_moram_junto)?m.pessoas_moram_junto.join(" "):m.pessoas_moram_junto].join(" ").toLowerCase().includes(busca));
  const rows=lista.map(m=>{ const tel=m.celular||""; const telHtml=tel?`<button class="phone-link" onclick="abrirWhatsappMorador('${m.id}')">${escapeHtml(tel)}</button>`:"-"; return `<tr><td><strong>${escapeHtml(m.nome||"-")}</strong></td><td>***********</td><td>${escapeHtml(m.unidade||"-")}</td><td>${telHtml}</td><td>${escapeHtml(m.placa_veiculo||"-")}</td><td>${escapeHtml(m.email||"-")}</td><td>${formatPessoasMoramJunto(m.pessoas_moram_junto)}</td></tr>`; }).join("");
  tbody.innerHTML=rows||`<tr><td colspan="7">Nenhum morador encontrado.</td></tr>`;
}
window.abrirWhatsappMorador=function(id){ const m=moradores.find(x=>x.id===id); if(!m)return; whatsappMoradorAtual=m; $("whatsappMoradorNome").textContent=`Enviar WhatsApp para ${m.nome||"morador"}`; $("whatsappAssunto").value=""; $("whatsappDescricao").value=""; show($("whatsappModal")); };
function enviarWhatsappMorador(){ if(!whatsappMoradorAtual?.celular)return; const assunto=($("whatsappAssunto")?.value||"").trim(); const descricao=($("whatsappDescricao")?.value||"").trim(); if(!assunto||!descricao)return alert("Digite o assunto e a descrição da mensagem."); const numero=String(whatsappMoradorAtual.celular).replace(/\D/g,""); const finalNumero=numero.startsWith("55")?numero:`55${numero}`; const texto=`Assunto: ${assunto}

${descricao}`; window.open(`https://wa.me/${finalNumero}?text=${encodeURIComponent(texto)}`,"_blank"); hide($("whatsappModal")); }


function abrirFaleSindico(){
  $("sindicoAssunto").value = "";
  $("sindicoDescricao").value = "";
  msg($("sindicoMsg"), "");
  show($("faleSindicoModal"));
}

async function carregarMensagensMorador(){
  const box = $("residentMessagesList");
  if(!box || profile?.role === "admin" || profile?.role === "portaria") return;
  try{
    mensagens = await apiGet("/api/list-mensagens");
    renderMensagensMorador();
  }catch(error){
    console.error("Erro ao carregar mensagens do morador:", error);
    box.innerHTML = `<p class="message error">${escapeHtml(error.message || "Erro ao carregar mensagens.")}</p>`;
  }
}

function getMensagemThreadId(m){ return String(m.thread_id || m.morador_id || "conversa-geral"); }
function agruparMensagensPorConversa(lista){
  const mapa = new Map();
  [...lista].sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))).forEach(m => {
    const id = getMensagemThreadId(m);
    const atual = mapa.get(id) || { id, assunto: m.assunto || "Conversa com a administração", mensagens: [], ultima: m.created_at || "" };
    if(m.remetente_tipo === "morador" && (!atual.assunto || atual.assunto === "Resposta da administração")) atual.assunto = m.assunto || atual.assunto;
    atual.mensagens.push(m);
    atual.ultima = m.created_at || atual.ultima;
    mapa.set(id, atual);
  });
  return [...mapa.values()].sort((a,b)=>String(b.ultima).localeCompare(String(a.ultima)));
}

function renderMensagensMorador(){
  const box = $("residentMessagesList"); if(!box) return;
  const view = $("residentConversationView");
  if(view){ hide(view); view.innerHTML = ""; }
  if(!mensagens.length){ box.innerHTML = `<p>Você ainda não possui conversas.</p>`; return; }
  const conversas = agruparMensagensPorConversa(mensagens);
  box.innerHTML = conversas.map(c => {
    const ultima = c.mensagens[c.mensagens.length-1];
    const pendentes = c.mensagens.filter(m => m.remetente_tipo === "admin").length;
    return `<button class="resident-thread-card" type="button" onclick="abrirConversaMoradorPainel('${escapeHtml(c.id)}')">
      <strong>${escapeHtml(c.assunto || "Conversa com a administração")}</strong>
      <span>${c.mensagens.length} mensagem(ns) na conversa · última em ${formatDate(String(ultima?.created_at||"").slice(0,10))}</span>
      <small>${pendentes ? "Resposta da administração disponível" : "Aguardando resposta"}</small>
    </button>`;
  }).join("");
}

window.abrirConversaMoradorPainel = function(threadId){
  const view = $("residentConversationView"); if(!view) return;
  const msgs = mensagens.filter(m => getMensagemThreadId(m) === String(threadId)).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
  if(!msgs.length) return;
  const assunto = msgs.find(m => m.remetente_tipo === "morador")?.assunto || msgs[0]?.assunto || "Conversa";
  view.innerHTML = `<div class="conversation-view-head">
    <div><h3>${escapeHtml(assunto)}</h3><p class="message">Histórico completo da conversa com a administração.</p></div>
    <div class="conversation-actions"><button class="btn-small btn-secondary" type="button" onclick="fecharConversaMoradorPainel()">Voltar</button><button class="btn-small btn-danger-soft" type="button" onclick="excluirConversaMorador('${escapeHtml(threadId)}')">Excluir conversa</button></div>
  </div>
  <div class="resident-message-thread">${msgs.map(m => `
    <article class="message-bubble ${m.remetente_tipo === "admin" ? "admin" : "resident"}">
      <div><strong>${m.remetente_tipo === "admin" ? "Administração" : "Você"}</strong><small>${formatDate(String(m.created_at||"").slice(0,10))}</small></div>
      <h4>${escapeHtml(m.assunto || "Mensagem")}</h4>
      <p>${escapeHtml(m.descricao || "")}</p>
      <footer class="message-bubble-footer"><button class="delete-message-btn" type="button" onclick="excluirMensagemMorador('${escapeHtml(m.id)}')">Excluir mensagem</button></footer>
    </article>`).join("")}</div>`;
  show(view);
  view.scrollIntoView({ behavior:"smooth", block:"start" });
};

window.fecharConversaMoradorPainel = function(){ const view = $("residentConversationView"); if(view){ hide(view); view.innerHTML=""; } };

window.excluirMensagemMorador = async function(id){
  if(!id || !confirm("Excluir esta mensagem somente do seu painel?")) return;
  try{ await apiPost("/api/delete-mensagem", { id }); await carregarMensagensMorador(); }
  catch(error){ alert(error.message || "Erro ao excluir mensagem."); }
};

window.excluirConversaMorador = async function(threadId){
  if(!threadId || !confirm("Excluir esta conversa somente do seu painel?")) return;
  try{ await apiPost("/api/delete-mensagem", { thread_id: threadId }); await carregarMensagensMorador(); }
  catch(error){ alert(error.message || "Erro ao excluir conversa."); }
};

async function enviarMensagemSindico(){
  const assunto = ($("sindicoAssunto")?.value || "").trim();
  const descricao = ($("sindicoDescricao")?.value || "").trim();
  msg($("sindicoMsg"), "");
  if(!assunto || !descricao) return msg($("sindicoMsg"), "Preencha o assunto e a descrição.", "error");
  try{
    await apiPost("/api/send-mensagem", { assunto, descricao });
    msg($("sindicoMsg"), "Mensagem enviada com sucesso.", "ok");
    $("sindicoAssunto").value = "";
    $("sindicoDescricao").value = "";
    await carregarMensagensMorador();
    setTimeout(() => hide($("faleSindicoModal")), 700);
  }catch(error){
    msg($("sindicoMsg"), error.message || "Erro ao enviar mensagem.", "error");
  }
}

async function carregarMensagensAdmin(mostrarErro = true){
  if(profile?.role !== "admin") return;
  const cond = $("mensagensCondominio")?.value || "";
  const lista = $("mensagensMoradoresLista");
  const thread = $("mensagemThreadLista");
  conversaMoradorSelecionado = null;
  if($("responderMensagemBox")) hide($("responderMensagemBox"));
  if(!cond){
    if(lista) lista.innerHTML = `<p>Selecione um condomínio para visualizar.</p>`;
    if(thread) thread.innerHTML = `<p>Clique no nome do morador para abrir a conversa.</p>`;
    return;
  }
  try{
    mensagens = await apiGet(`/api/list-mensagens?condominio_id=${encodeURIComponent(cond)}`);
    renderMensagensAdminLista();
    if(thread) thread.innerHTML = `<p>Clique no nome do morador para abrir a conversa.</p>`;
    msg($("mensagensAdminMsg"), mensagens.length ? "" : "Nenhuma mensagem encontrada para este condomínio.");
  }catch(error){
    if(mostrarErro) msg($("mensagensAdminMsg"), error.message || "Erro ao carregar mensagens.", "error");
  }
}

function renderMensagensAdminLista(){
  const lista = $("mensagensMoradoresLista"); if(!lista) return;
  const porMorador = new Map();
  mensagens.forEach(m => {
    const id = m.morador_id || "sem-id";
    const atual = porMorador.get(id) || { morador_id:id, nome:m.morador_nome || "Morador", unidade:m.morador_unidade || "", total:0, ultima:"" };
    atual.total += 1;
    atual.ultima = m.created_at || atual.ultima;
    porMorador.set(id, atual);
  });
  const rows = [...porMorador.values()].sort((a,b)=>String(b.ultima).localeCompare(String(a.ultima)));
  lista.innerHTML = rows.map(r => `<button class="resident-message-person" type="button" onclick="abrirConversaMorador('${escapeHtml(r.morador_id)}')"><strong>${escapeHtml(r.nome)}</strong><span>${r.unidade ? `Unidade ${escapeHtml(r.unidade)} · ` : ""}${r.total} mensagem(ns)</span></button>`).join("") || `<p>Nenhum morador enviou mensagem neste condomínio.</p>`;
}

window.abrirConversaMorador = function(moradorId){
  conversaMoradorSelecionado = moradorId;
  const thread = $("mensagemThreadLista"); if(!thread) return;
  const msgs = mensagens.filter(m => String(m.morador_id) === String(moradorId)).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
  const morador = msgs[0];
  if($("mensagemThreadTitulo")) $("mensagemThreadTitulo").textContent = morador ? `Conversa com ${morador.morador_nome || "morador"}` : "Conversa";
  thread.innerHTML = msgs.map(m => `
    <article class="message-bubble ${m.remetente_tipo === "admin" ? "admin" : "resident"}">
      <div><strong>${m.remetente_tipo === "admin" ? "Administração" : escapeHtml(m.morador_nome || "Morador")}</strong><small>${formatDate(String(m.created_at||"").slice(0,10))}</small></div>
      <h4>${escapeHtml(m.assunto || "Mensagem")}</h4>
      <p>${escapeHtml(m.descricao || "")}</p>
    </article>
  `).join("");
  if($("responderMensagemBox")) show($("responderMensagemBox"));
};

async function responderMensagemMorador(){
  const descricao = ($("respostaAdminMensagem")?.value || "").trim();
  if(!conversaMoradorSelecionado) return msg($("mensagensAdminMsg"), "Selecione um morador para responder.", "error");
  if(!descricao) return msg($("mensagensAdminMsg"), "Digite a resposta antes de enviar.", "error");
  try{
    await apiPost("/api/reply-mensagem", { morador_id: conversaMoradorSelecionado, thread_id: (mensagens.find(m => String(m.morador_id) === String(conversaMoradorSelecionado))?.thread_id || null), descricao });
    $("respostaAdminMensagem").value = "";
    await carregarMensagensAdmin();
    abrirConversaMorador(conversaMoradorSelecionado);
    msg($("mensagensAdminMsg"), "Resposta enviada ao morador.", "ok");
  }catch(error){
    msg($("mensagensAdminMsg"), error.message || "Erro ao responder mensagem.", "error");
  }
}


function diasEntreDatas(a, b){
  if(!a || !b) return 0;
  const d1 = new Date(String(a).slice(0,10) + 'T00:00:00');
  const d2 = new Date(String(b).slice(0,10) + 'T00:00:00');
  return Math.max(0, Math.round((d2-d1)/(1000*60*60*24)));
}
function prazoBadge(oc){
  if(["Concluída","Cancelada"].includes(oc.status)) return `<span class="sla-badge ok">Finalizada</span>`;
  if(!oc.data_prazo) return `<span class="sla-badge">Sem prazo</span>`;
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const prazo = new Date(String(oc.data_prazo).slice(0,10)+'T00:00:00');
  const diff = Math.ceil((prazo-hoje)/(1000*60*60*24));
  if(diff < 0) return `<span class="sla-badge late">Vencida há ${Math.abs(diff)} dia(s)</span>`;
  if(diff <= 1) return `<span class="sla-badge warn">Vence ${diff===0?'hoje':'amanhã'}</span>`;
  return `<span class="sla-badge ok">${diff} dia(s) restantes</span>`;
}
async function carregarOcorrenciaCategorias(){
  try{
    ocorrenciaCategorias = await apiGet('/api/ocorrencia-categorias');
    if(!ocorrenciaCategorias.length){
      ocorrenciaCategorias = [
        {nome:'Engenharia', setor_responsavel:'Engenharia', responsavel_padrao:'', prazo_dias:5},
        {nome:'Manutenção', setor_responsavel:'Manutenção', responsavel_padrao:'', prazo_dias:3},
        {nome:'Financeiro', setor_responsavel:'Financeiro', responsavel_padrao:'', prazo_dias:2},
        {nome:'Jurídico', setor_responsavel:'Jurídico', responsavel_padrao:'', prazo_dias:10},
        {nome:'Administrativo', setor_responsavel:'Administrativo', responsavel_padrao:'', prazo_dias:3},
        {nome:'Segurança', setor_responsavel:'Segurança', responsavel_padrao:'', prazo_dias:2},
        {nome:'Limpeza', setor_responsavel:'Limpeza', responsavel_padrao:'', prazo_dias:2},
        {nome:'Portaria', setor_responsavel:'Portaria', responsavel_padrao:'', prazo_dias:2},
        {nome:'Obras', setor_responsavel:'Engenharia', responsavel_padrao:'', prazo_dias:5},
        {nome:'Prestadores de Serviço', setor_responsavel:'Administrativo', responsavel_padrao:'', prazo_dias:4},
        {nome:'Outros', setor_responsavel:'Administrativo', responsavel_padrao:'', prazo_dias:3}
      ];
    }
  }catch(e){ console.warn(e); ocorrenciaCategorias=[]; }
  popularOcorrenciaCategorias();
}
function popularOcorrenciaCategorias(){
  const opts = `<option value="">Selecione a categoria</option>` + ocorrenciaCategorias.map(c=>`<option value="${escapeHtml(c.id || c.nome)}">${escapeHtml(c.nome)}${c.prazo_dias?` · ${c.prazo_dias} dias`:''}</option>`).join('');
  if($('ocCategoria')) $('ocCategoria').innerHTML = opts;
  if($('residentOcCategoria')) $('residentOcCategoria').innerHTML = opts;
  if($('categoriasLista')) $('categoriasLista').innerHTML = ocorrenciaCategorias.map(c=>`<span><strong>${escapeHtml(c.nome)}</strong><small>${escapeHtml(c.setor_responsavel||'-')} · ${c.responsavel_role ? 'Perfil: '+escapeHtml(roleLabel(c.responsavel_role))+' · ' : ''}SLA ${escapeHtml(c.prazo_dias||'-')} dia(s)</small></span>`).join('') || '<p>Nenhuma categoria cadastrada.</p>';
}
async function salvarOcorrenciaCategoria(e){
  e.preventDefault(); msg($('ocorrenciasMsg'),'');
  const payload={nome:$('catNome').value.trim(), setor_responsavel:$('catSetor').value.trim(), responsavel_padrao:$('catResponsavel').value.trim(), responsavel_role:($('catRole')?.value||'').trim(), prazo_dias:Number($('catPrazo').value||0)};
  if(!payload.nome || !payload.setor_responsavel || !payload.prazo_dias) return msg($('ocorrenciasMsg'),'Preencha categoria, setor e prazo.', 'error');
  try{ await apiPost('/api/ocorrencia-categorias', payload); e.target.reset(); await carregarOcorrenciaCategorias(); msg($('ocorrenciasMsg'),'Categoria salva com sucesso.', 'ok'); }
  catch(error){ msg($('ocorrenciasMsg'), error.message || 'Erro ao salvar categoria.', 'error'); }
}
async function carregarOcorrencias(){
  if(!profile || !isInternalRole()) return;
  try{ if(!ocorrenciaCategorias.length) await carregarOcorrenciaCategorias(); ocorrencias = await apiGet('/api/ocorrencias'); renderOcorrencias(); }
  catch(error){ msg($('ocorrenciasMsg'), error.message || 'Erro ao carregar ocorrências.', 'error'); }
}
async function criarOcorrencia(e){
  e.preventDefault(); msg($('ocorrenciasMsg'),'');
  const categoriaValue = $('ocCategoria').value;
  const cat = ocorrenciaCategorias.find(c=>String(c.id||c.nome)===String(categoriaValue));
  const payload={condominio_id:$('ocCond').value, unidade:$('ocUnidade').value.trim(), solicitante:$('ocSolicitante').value.trim(), categoria_id:cat?.id||null, categoria_nome:cat?.nome || categoriaValue, responsavel_setor:cat?.setor_responsavel || '', responsavel_nome:cat?.responsavel_padrao || '', responsavel_role:cat?.responsavel_role || normalizeRole(cat?.setor_responsavel || ''), prioridade:$('ocPrioridade').value, descricao:$('ocDescricao').value.trim()};
  if(!payload.condominio_id || !payload.solicitante || !payload.categoria_nome || !payload.descricao) return msg($('ocorrenciasMsg'),'Preencha condomínio, solicitante, categoria e descrição.', 'error');
  try{
    const files=[...($('ocAnexos')?.files||[])];
    payload.anexos=[];
    for(const file of files){ const url=await uploadFile(file, `ocorrencias/${payload.condominio_id}`); if(url) payload.anexos.push({nome_arquivo:file.name, tipo_arquivo:file.type, url_arquivo:url}); }
    await apiPost('/api/ocorrencias', payload); e.target.reset(); $('ocAnexosNome').textContent='Nenhum arquivo selecionado'; await carregarOcorrencias(); msg($('ocorrenciasMsg'),'Ocorrência registrada com sucesso.', 'ok');
  }catch(error){ msg($('ocorrenciasMsg'), error.message || 'Erro ao registrar ocorrência.', 'error'); }
}
async function criarOcorrenciaMorador(e){
  e.preventDefault();
  msg($("residentOcMsg"), "");
  try{
    const categoriaId=$("residentOcCategoria")?.value || "";
    const cat=ocorrenciaCategorias.find(c=>String(c.id)===String(categoriaId));
    const payload={
      condominio_id: profile?.condominio_id || "",
      unidade: profile?.unidade || "",
      solicitante: profile?.nome || currentUser?.email || "Morador",
      solicitante_tipo: "Morador",
      categoria_id: categoriaId || null,
      categoria_nome: cat?.nome || "Administrativo",
      responsavel_setor: cat?.setor_responsavel || "Administrativo",
      responsavel_nome: cat?.responsavel_padrao || "",
      prioridade: $("residentOcPrioridade")?.value || "Normal",
      descricao: $("residentOcDescricao")?.value?.trim() || ""
    };
    if(!payload.descricao) return msg($("residentOcMsg"), "Descreva a solicitação.", "error");
    await apiPost('/api/ocorrencias', payload);
    e.target.reset();
    msg($("residentOcMsg"), "Ocorrência registrada com sucesso. A administração poderá acompanhar pelo painel.", "ok");
  }catch(error){ msg($("residentOcMsg"), error.message || "Erro ao registrar ocorrência.", "error"); }
}

function renderOcorrencias(){
  const box=$('ocorrenciasLista'); if(!box) return;
  const isSetor = isInternalRole() && normalizeRole(profile?.role) !== "admin" && normalizeRole(profile?.role) !== "portaria";
  $("formOcorrencia")?.classList.toggle("hidden", isSetor);
  $("formOcCategoria")?.classList.toggle("hidden", normalizeRole(profile?.role) !== "admin");
  const cond=$('ocFiltroCond')?.value || ''; const status=$('ocFiltroStatus')?.value || ''; const busca=($('ocFiltroBusca')?.value||'').toLowerCase().trim();
  let lista=[...ocorrencias];
  if(cond) lista=lista.filter(o=>String(o.condominio_id)===cond);
  if(status) lista=lista.filter(o=>String(o.status)===status);
  if(busca) lista=lista.filter(o=>[o.numero_ocorrencia,o.solicitante,o.categoria_nome,o.responsavel_setor,o.descricao,o.unidade].join(' ').toLowerCase().includes(busca));
  const abertas=ocorrencias.filter(o=>!['Concluída','Cancelada'].includes(o.status)).length;
  const hoje=new Date(); hoje.setHours(0,0,0,0);
  const vencidas=ocorrencias.filter(o=>!['Concluída','Cancelada'].includes(o.status) && o.data_prazo && new Date(String(o.data_prazo).slice(0,10)+'T00:00:00') < hoje).length;
  const concluidas=ocorrencias.filter(o=>o.status==='Concluída').length;
  const tempos=ocorrencias.filter(o=>o.status==='Concluída' && o.data_conclusao).map(o=>diasEntreDatas(o.created_at, o.data_conclusao));
  if($('occMetricAbertas')) $('occMetricAbertas').textContent=abertas;
  if($('occMetricVencidas')) $('occMetricVencidas').textContent=vencidas;
  if($('occMetricConcluidas')) $('occMetricConcluidas').textContent=concluidas;
  if($('occMetricTempoMedio')) $('occMetricTempoMedio').textContent=(tempos.length ? Math.round(tempos.reduce((a,b)=>a+b,0)/tempos.length) : 0) + ' dias';
  box.innerHTML = lista.map(o=>{
    const condNome=condominios.find(c=>String(c.id)===String(o.condominio_id))?.nome || 'Condomínio';
    return `<article class="occurrence-card" onclick="abrirOcorrencia('${escapeHtml(o.id)}')"><div><strong>${escapeHtml(o.numero_ocorrencia||'OC')}</strong><span>${escapeHtml(condNome)}${o.unidade?` · Unidade ${escapeHtml(o.unidade)}`:''}</span></div><h4>${escapeHtml(o.categoria_nome||'Categoria')} · ${escapeHtml(o.solicitante||'Solicitante')}</h4><p>${escapeHtml(o.descricao||'').slice(0,160)}${String(o.descricao||'').length>160?'...':''}</p><footer><span class="status-pill">${escapeHtml(o.status||'Aberta')}</span>${prazoBadge(o)}<small>${formatDate(String(o.created_at||'').slice(0,10))}</small></footer></article>`;
  }).join('') || '<p>Nenhuma ocorrência encontrada.</p>';
}
window.abrirOcorrencia = async function(id){
  ocorrenciaSelecionada = ocorrencias.find(o=>String(o.id)===String(id));
  if(!ocorrenciaSelecionada) return;
  try{
    const data = await apiGet(`/api/ocorrencias/${encodeURIComponent(id)}`);
    const oc = data.ocorrencia || ocorrenciaSelecionada; const historico=data.historico||[]; const comentarios=data.comentarios||[]; const anexos=data.anexos||[];
    const condNome=condominios.find(c=>String(c.id)===String(oc.condominio_id))?.nome || 'Condomínio';
    $('ocorrenciaDetalhe').innerHTML = `<span class="pill">${escapeHtml(oc.numero_ocorrencia||'Ocorrência')}</span><h2>${escapeHtml(oc.categoria_nome||'Ocorrência')}</h2><p><strong>Condomínio:</strong> ${escapeHtml(condNome)} ${oc.unidade?` · <strong>Unidade:</strong> ${escapeHtml(oc.unidade)}`:''}</p><p><strong>Solicitante:</strong> ${escapeHtml(oc.solicitante||'-')} · <strong>Responsável:</strong> ${escapeHtml(oc.responsavel_setor||'-')}</p><p><strong>Descrição:</strong><br>${escapeHtml(oc.descricao||'')}</p><div class="occurrence-status-update"><select id="ocNovoStatus"><option>Aberta</option><option>Em análise</option><option>Em execução</option><option>Aguardando terceiros</option><option>Aguardando aprovação</option><option>Concluída</option><option>Cancelada</option></select><textarea id="ocComentario" placeholder="Comentário, providência adotada ou justificativa"></textarea><button class="btn btn-primary" type="button" onclick="atualizarOcorrenciaStatus()">Salvar movimentação</button></div><h3>Anexos</h3><div class="attachment-list">${anexos.map(a=>`<a href="${escapeHtml(a.url_arquivo)}" target="_blank">📎 ${escapeHtml(a.nome_arquivo||'Anexo')}</a>`).join('') || '<p>Nenhum anexo.</p>'}</div><h3>Histórico</h3><div class="history-list">${historico.map(h=>`<article><strong>${escapeHtml(h.acao||'Movimentação')}</strong><span>${formatDate(String(h.created_at||'').slice(0,10))}</span><p>${escapeHtml(h.comentario||'')}</p></article>`).join('') || '<p>Nenhum histórico.</p>'}</div><h3>Comentários internos</h3><div class="history-list">${comentarios.map(c=>`<article><strong>${escapeHtml(c.usuario_nome||'Usuário')}</strong><span>${formatDate(String(c.created_at||'').slice(0,10))}</span><p>${escapeHtml(c.comentario||'')}</p></article>`).join('') || '<p>Nenhum comentário.</p>'}</div>`;
    $('ocNovoStatus').value = oc.status || 'Aberta'; show($('ocorrenciaModal'));
  }catch(error){ msg($('ocorrenciasMsg'), error.message || 'Erro ao abrir ocorrência.', 'error'); }
}
window.atualizarOcorrenciaStatus = async function(){
  if(!ocorrenciaSelecionada) return;
  const status=$('ocNovoStatus').value; const comentario=$('ocComentario').value.trim();
  try{ await apiPost(`/api/ocorrencias/${encodeURIComponent(ocorrenciaSelecionada.id)}/status`, {status, comentario}); hide($('ocorrenciaModal')); await carregarOcorrencias(); msg($('ocorrenciasMsg'), 'Movimentação salva com sucesso.', 'ok'); }
  catch(error){ alert(error.message || 'Erro ao atualizar ocorrência.'); }
}

async function uploadFile(file, folder){ if(!file) return null; const ext=file.name.split('.').pop(); const path=`${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`; const {error}=await supabaseClient.storage.from("documentos").upload(path,file,{upsert:false}); if(error){console.warn(error); return null;} const {data}=supabaseClient.storage.from("documentos").getPublicUrl(path); return data?.publicUrl || null; }

async function criarLancamento(e){
  e.preventDefault(); msg($("adminMsg"),"");
  try{
    const condominio_id=$("lanCondominio").value; const tipo=$("lanTipo")?.value||"despesa"; const data=$("lanData").value; const valor=Number($("lanValor").value||0); const categoria=$("lanCategoria").value.trim(); const local=$("lanLocal").value.trim(); const justificativa=$("lanJustificativa").value.trim();
    if(!condominio_id||!data||!valor) return msg($("adminMsg"),"Selecione condomínio, data e valor.","error");
    const anexo=await uploadFile($("lanAnexo")?.files?.[0],`condominios/${condominio_id}/anexos`);
    const payload={condominio_id,tipo,data,valor,categoria,local,descricao:categoria||local||tipo,justificativa};
    if(anexo) payload.anexo_url=anexo;
    const {data:sessionData}=await supabaseClient.auth.getSession();
    const token=sessionData?.session?.access_token;
    const res=await fetch("/api/save-lancamento",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},body:JSON.stringify(payload)});
    const result=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(result.error || `Erro ao salvar lançamento. Status ${res.status}`);
    e.target.reset(); $("lanAnexoNome").textContent="Nenhum arquivo selecionado"; await carregarLancamentos(); msg($("adminMsg"),"Lançamento salvo com sucesso.","ok");
  }catch(err){ msg($("adminMsg"),"Erro ao salvar lançamento: "+err.message,"error"); }
}

async function removerCondominio(e){ e.preventDefault(); const id=$("removerCondominio").value; if(!id) return msg($("adminMsg"),"Selecione um condomínio para remover.","error"); const c=condominios.find(x=>x.id===id); if(!confirm(`Tem certeza que deseja remover "${c?.nome||'este condomínio'}"?`)) return; const {error}=await supabaseClient.from("condominios").delete().eq("id",id); if(error) return msg($("adminMsg"),"Erro ao remover condomínio: "+error.message,"error"); await carregarCondominios(); await carregarLancamentos(); msg($("adminMsg"),"Condomínio removido com sucesso.","ok"); }
async function removerMorador(e){ e.preventDefault(); const id=$("removerMorador").value; if(!id) return msg($("adminMsg"),"Selecione um morador.","error"); const m=moradores.find(x=>x.id===id); if(!confirm(`Remover "${m?.nome||m?.email||'este morador'}"?`)) return; const {data:sessionData}=await supabaseClient.auth.getSession(); const token=sessionData?.session?.access_token; const res=await fetch("/api/delete-user",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},body:JSON.stringify({user_id:id})}); const result=await res.json().catch(()=>({})); if(!res.ok) return msg($("adminMsg"),result.error||"Erro ao remover morador.","error"); await carregarMoradores(); msg($("adminMsg"),"Morador removido com sucesso.","ok"); }
async function removerLancamento(e){ e.preventDefault(); const id=$("removerLancamento").value; if(!id) return msg($("adminMsg"),"Selecione um lançamento.","error"); if(!confirm("Tem certeza que deseja remover este lançamento?")) return; const {error}=await supabaseClient.from("lancamentos").delete().eq("id",id); if(error) return msg($("adminMsg"),"Erro ao remover lançamento: "+error.message,"error"); await carregarLancamentos(); msg($("adminMsg"),"Lançamento removido com sucesso.","ok"); }

async function alterarSenhaMorador(){
  msg($("adminMsg"),"");
  const user_id=$("senhaMoradorSelecionado")?.value || "";
  const password=$("novaSenhaMorador")?.value || "";
  if(!user_id) return msg($("adminMsg"),"Selecione o morador que terá a senha alterada.","error");
  if(password.length < 6) return msg($("adminMsg"),"A nova senha precisa ter pelo menos 6 caracteres.","error");

  const morador=moradores.find(m=>m.id===user_id);
  if(!morador?.email) return msg($("adminMsg"),"O morador selecionado não possui e-mail cadastrado.","error");

  if(!confirm(`Alterar a senha de ${morador?.nome || morador?.email || "este morador"}?`)) return;

  const {data:sessionData}=await supabaseClient.auth.getSession();
  const token=sessionData?.session?.access_token;
  if(!token) return msg($("adminMsg"),"Sessão expirada. Faça login novamente como administrador.","error");

  const endpoint = `${window.DM_SUPABASE_FUNCTIONS_URL}/update-resident-password`;

  const res=await fetch(endpoint,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Authorization":`Bearer ${token}`,
      "apikey": window.DM_SUPABASE_ANON_KEY
    },
    body:JSON.stringify({
      user_id,
      email: morador.email,
      password
    })
  });

  const result=await res.json().catch(()=>({}));
  if(!res.ok) {
    console.error("Erro detalhado ao alterar senha via Supabase Edge Function:", result);
    const detalhe = result.detalhe ? " | Detalhe: " + JSON.stringify(result.detalhe) : "";
    return msg($("adminMsg"), (result.error || "Erro ao alterar senha do morador.") + detalhe, "error");
  }

  if($("novaSenhaMorador")) $("novaSenhaMorador").value="";
  msg($("adminMsg"), result.mensagem || "Senha do morador alterada com sucesso.","ok");
}

function downloadText(filename, text, type="text/plain"){ const blob=new Blob([text],{type}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url); }


function normalizarBackupPortal(raw){
  if(!raw || typeof raw !== "object") throw new Error("Arquivo JSON inválido.");
  const data = raw.data && typeof raw.data === "object" ? raw.data : raw;
  const condominiosImport = Array.isArray(data.condominios) ? data.condominios : [];
  const moradoresImport = Array.isArray(data.moradores) ? data.moradores : (Array.isArray(data.profiles) ? data.profiles.filter(p=>p.role==="morador") : []);
  const lancamentosImport = Array.isArray(data.lancamentos) ? data.lancamentos : [];
  if(!condominiosImport.length && !moradoresImport.length && !lancamentosImport.length){
    throw new Error("O backup não contém condomínios, moradores ou lançamentos para importar.");
  }
  return { condominios: condominiosImport, moradores: moradoresImport, lancamentos: lancamentosImport };
}

async function importarBackupJson(e){
  const input = e.target;
  const file = input.files?.[0];
  if(!file) return;

  show($("backupImportBox"));
  msg($("backupImportMsg"), "Lendo arquivo de backup...", "");
  if($("backupImportDetails")) $("backupImportDetails").innerHTML = "";

  try{
    if(profile?.role !== "admin") throw new Error("Apenas administradores podem importar backup.");
    if(!file.name.toLowerCase().endsWith(".json")) throw new Error("Selecione um arquivo .json válido.");

    const text = await file.text();
    const raw = JSON.parse(text);
    const backup = normalizarBackupPortal(raw);

    const resumo = `Condomínios: ${backup.condominios.length} | Moradores: ${backup.moradores.length} | Lançamentos: ${backup.lancamentos.length}`;
    const confirmar = confirm(`Importar backup JSON?\n\n${resumo}\n\nOs registros existentes com o mesmo ID serão atualizados.`);
    if(!confirmar){
      msg($("backupImportMsg"), "Importação cancelada.", "");
      input.value = "";
      return;
    }

    msg($("backupImportMsg"), "Importando backup diretamente pelo Supabase. Aguarde...", "");

    let totalCondominios = 0;
    let totalMoradores = 0;
    let totalLancamentos = 0;
    const avisos = [];

    const limparObj = (obj, permitidos) => {
      const limpo = {};
      permitidos.forEach(k => {
        if(obj && Object.prototype.hasOwnProperty.call(obj,k) && obj[k] !== undefined) limpo[k] = obj[k];
      });
      return limpo;
    };

    const pessoasArray = (value) => {
      if(Array.isArray(value)) return value.map(v=>String(v).trim()).filter(Boolean);
      if(typeof value === "string") return value.split(/\n|,/).map(v=>v.trim()).filter(Boolean);
      return [];
    };

    const condominiosClean = backup.condominios.map(c => ({
      ...limparObj(c, ["id","created_at"]),
      nome: c.nome || c.name || "Condomínio sem nome",
      endereco: c.endereco || c.address || ""
    })).filter(c => c.nome);

    if(condominiosClean.length){
      const { error } = await supabaseClient
        .from("condominios")
        .upsert(condominiosClean, { onConflict: "id" });
      if(error) throw new Error("Erro ao importar condomínios: " + error.message);
      totalCondominios = condominiosClean.length;
    }

    const moradoresClean = backup.moradores.map(m => ({
      ...limparObj(m, ["id","created_at"]),
      nome: m.nome || m.name || m.email || "Morador",
      email: String(m.email || "").trim().toLowerCase(),
      role: "morador",
      unidade: m.unidade || m.apartamento || m.unit || null,
      condominio_id: m.condominio_id || m.condominioId || null,
      cpf: m.cpf || null,
      celular: m.celular || m.telefone || m.phone || null,
      placa_veiculo: m.placa_veiculo || m.placa || null,
      foto_placa_veiculo_url: m.foto_placa_veiculo_url || null,
      pessoas_moram_junto: pessoasArray(m.pessoas_moram_junto || m.moradores_adicionais || m.pessoas || []),
      ativo: m.ativo !== false
    })).filter(m => m.id && m.email);

    if(backup.moradores.length && !moradoresClean.length){
      avisos.push("Nenhum morador foi importado porque o backup não possui ID/e-mail válido nos moradores.");
    }

    if(moradoresClean.length){
      const { error } = await supabaseClient
        .from("profiles")
        .upsert(moradoresClean, { onConflict: "id" });
      if(error) throw new Error("Erro ao importar moradores: " + error.message);
      totalMoradores = moradoresClean.length;
    }

    const lancamentosClean = backup.lancamentos.map(l => ({
      ...limparObj(l, ["id","created_at"]),
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
    })).filter(l => l.condominio_id && l.valor >= 0);

    if(lancamentosClean.length){
      const { error } = await supabaseClient
        .from("lancamentos")
        .upsert(lancamentosClean, { onConflict: "id" });
      if(error) throw new Error("Erro ao importar lançamentos: " + error.message);
      totalLancamentos = lancamentosClean.length;
    }

    msg($("backupImportMsg"), "Backup importado com sucesso.", "ok");
    if($("backupImportDetails")){
      $("backupImportDetails").innerHTML = `
        <div class="import-result-grid">
          <span>🏢 Condomínios: <strong>${totalCondominios}</strong></span>
          <span>👥 Moradores: <strong>${totalMoradores}</strong></span>
          <span>💰 Lançamentos: <strong>${totalLancamentos}</strong></span>
        </div>
        <div class="import-warnings"><strong>Observação:</strong><br>Esta importação restaura os dados do painel. Usuários de login do Supabase Authentication não são recriados por arquivo JSON; se algum morador não conseguir entrar, recrie o acesso pelo cadastro/alteração de senha.</div>
        ${avisos.length ? `<div class="import-warnings"><strong>Avisos:</strong><br>${avisos.map(escapeHtml).join("<br>")}</div>` : ""}
      `;
    }

    await carregarCondominios();
    await carregarMoradores();
    await carregarLancamentos();

  }catch(err){
    console.error("Erro na importação direta do backup:", err);
    msg($("backupImportMsg"), err?.message || "Erro ao importar backup.", "error");
  }finally{
    input.value = "";
  }
}

function exportCsv(){ const header=["data","tipo","valor","categoria","condominio","descricao","justificativa"]; const rows=lancamentos.map(l=>[l.data,l.tipo,l.valor,l.categoria||"",l.condominios?.nome||"",l.descricao||"",(l.justificativa||"").replace(/\n/g," ")]); const csv=[header,...rows].map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(";")).join("\n"); downloadText("lancamentos_portal_transparencia_dm.csv",csv,"text/csv;charset=utf-8"); }
function backupJson(){
  downloadText("backup_portal_transparencia_dm.json", JSON.stringify({
    tipo:"portal_transparencia_dm_backup",
    versao:2,
    gerado_em:new Date().toISOString(),
    condominios,
    moradores,
    portarias,
    lancamentos
  },null,2), "application/json");
}

document.addEventListener("DOMContentLoaded", init);
