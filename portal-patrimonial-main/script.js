
const $ = (id) => document.getElementById(id);
const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

let supabaseClient = null;
let currentUser = null;
let profile = null;
let condominios = [];
let lancamentos = [];
let moradores = [];

function msg(el, text, type = "") { if (el) { el.textContent = text || ""; el.className = `message ${type}`; } }
function show(el) { el?.classList.remove("hidden"); }
function hide(el) { el?.classList.add("hidden"); }
function escapeHtml(value = "") { return String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
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
  $("loginBtn")?.addEventListener("click", loginMorador);
  $("adminLoginBtn")?.addEventListener("click", loginAdmin);
  $("logoutBtn")?.addEventListener("click", logout);
  $("printBtn")?.addEventListener("click", () => window.print());
  $("mobileMenuBtn")?.addEventListener("click", () => $("adminSidebar")?.classList.toggle("open"));
  $("filterTipo")?.addEventListener("change", renderLancamentos);
  $("filterBusca")?.addEventListener("input", renderLancamentos);
  $("buscaCondominio")?.addEventListener("input", renderCondominiosTable);
  $("buscaMorador")?.addEventListener("input", renderMoradoresTable);
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
  $("lanAnexo")?.addEventListener("change", (e) => { $("lanAnexoNome").textContent = e.target.files?.[0]?.name || "Nenhum arquivo selecionado"; });
  document.querySelectorAll("[data-admin-tab]").forEach(btn => btn.addEventListener("click", () => setAdminTab(btn.dataset.adminTab)));
}

function switchLoginTab(tab){
  $("tabMorador")?.classList.toggle("active", tab === "morador");
  $("tabAdmin")?.classList.toggle("active", tab === "admin");
  $("moradorLoginBox")?.classList.toggle("hidden", tab !== "morador");
  $("adminLoginBox")?.classList.toggle("hidden", tab !== "admin");
}
function setAdminTab(tab){
  document.querySelectorAll("[data-admin-tab]").forEach(b => b.classList.toggle("active", b.dataset.adminTab === tab));
  document.querySelectorAll("[data-panel]").forEach(p => p.classList.toggle("hidden", p.dataset.panel !== tab));
  $("adminSidebar")?.classList.remove("open");
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
  popularSelects(); renderCondominiosTable(); renderResumo();
}

function popularSelects() {
  const options = `<option value="">Selecione o condomínio</option>` + condominios.map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join("");
  ["loginCondominio","moradorCondominio","lanCondominio","removerCondominio"].forEach(id => { const el=$(id); if(el) el.innerHTML=options; });
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
  if (profile?.role !== "admin") { await supabaseClient.auth.signOut(); return msg($("adminLoginMsg"), "Este login não possui permissão administrativa.", "error"); }
  await abrirDashboard();
}

async function carregarPerfil() {
  const { data, error } = await supabaseClient.from("profiles").select("*").eq("id", currentUser.id).maybeSingle();
  if (error || !data) { profile = null; msg($("loginMsg"), "Perfil não encontrado. Verifique se o usuário foi cadastrado na tabela profiles.", "error"); return; }
  if (data.ativo === false) { profile = null; msg($("loginMsg"), "Usuário inativo. Contate a administração.", "error"); await supabaseClient.auth.signOut(); return; }
  profile = data;
}

async function abrirDashboard() {
  hide($("loginScreen")); show($("dashboardScreen"));
  const isAdmin = profile?.role === "admin";
  $("dashboardScreen").classList.toggle("is-admin", isAdmin);
  $("adminSidebar")?.classList.toggle("hidden", !isAdmin);
  $("adminPanel")?.classList.toggle("hidden", !isAdmin);
  $("recordsSection")?.classList.toggle("hidden", false);
  $("sessionLabel").textContent = currentUser.email;
  $("sessionRole").textContent = isAdmin ? "Administrador" : "Morador";
  $("userRoleLabel").textContent = isAdmin ? "Administrador geral" : `Morador | Unidade ${profile.unidade || "-"}`;
  const condominio = isAdmin ? { nome: "Todos os condomínios" } : condominios.find(c => c.id === profile.condominio_id);
  $("condominioTitulo").textContent = condominio?.nome || "Condomínio";
  await carregarLancamentos();
  if (isAdmin) await carregarMoradores();
  renderResumo(); setAdminTab("condominios");
}

async function logout(){ if(supabaseClient) await supabaseClient.auth.signOut(); window.location.reload(); }

async function carregarMoradores() {
  const { data, error } = await supabaseClient.from("profiles").select("*").eq("role","morador").order("nome", { ascending: true });
  moradores = error ? [] : (data || []);
  popularMoradores(); renderMoradoresTable(); renderResumo(); renderCondominiosTable();
}
function popularMoradores(){ const el=$("removerMorador"); if(!el) return; el.innerHTML = `<option value="">Selecione o morador</option>` + moradores.map(m => `<option value="${m.id}">${escapeHtml((m.nome||m.email||"Morador") + (m.unidade?` - Unidade ${m.unidade}`:"") )}</option>`).join(""); }
function popularLancamentosRemocao(){ const el=$("removerLancamento"); if(!el) return; el.innerHTML = `<option value="">Selecione o lançamento</option>` + lancamentos.map(l => `<option value="${l.id}">${escapeHtml(`${formatDate(l.data)} - ${money(l.valor)} - ${l.categoria || l.descricao || l.tipo}`)}</option>`).join(""); }

async function carregarLancamentos(){
  let query = supabaseClient.from("lancamentos").select("*, condominios(nome)").order("data", { ascending:false });
  if(profile?.role !== "admin") query = query.eq("condominio_id", profile.condominio_id);
  const { data, error } = await query;
  lancamentos = error ? [] : (data || []);
  renderResumo(); renderLancamentos(); popularLancamentosRemocao();
}

function renderResumo(){
  const monthItems = lancamentos.filter(l => todayMonth(l.data));
  const receitas = monthItems.filter(l => l.tipo === "receita").reduce((s,l)=>s+Number(l.valor||0),0);
  const despesas = monthItems.filter(l => l.tipo !== "receita").reduce((s,l)=>s+Number(l.valor||0),0);
  if($("totalReceitas")) $("totalReceitas").textContent = money(receitas);
  if($("totalDespesas")) $("totalDespesas").textContent = money(despesas);
  if($("saldoAtual")) $("saldoAtual").textContent = money(receitas-despesas);
  if($("totalRegistros")) $("totalRegistros").textContent = lancamentos.length;
  if($("metricCondominios")) $("metricCondominios").textContent = condominios.length;
  if($("metricMoradores")) $("metricMoradores").textContent = moradores.length;
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
  const rows=moradores.filter(m => [m.nome,m.email,m.unidade,m.cpf].join(" ").toLowerCase().includes(busca)).map(m=>{
    const cond = condominios.find(c=>c.id===m.condominio_id)?.nome || "-";
    return `<tr><td><strong>${escapeHtml(m.nome||"-")}</strong></td><td>${escapeHtml(m.email||"-")}</td><td>${escapeHtml(m.unidade||"-")}</td><td>${escapeHtml(cond)}</td><td>${m.ativo===false?"Inativo":"Ativo"}</td></tr>`;
  }).join("");
  tbody.innerHTML = rows || `<tr><td colspan="5">Nenhum morador cadastrado.</td></tr>`;
}

function renderLancamentos(){
  const list=$("recordsList"); if(!list) return;
  const tipo=$("filterTipo")?.value||""; const busca=($("filterBusca")?.value||"").toLowerCase().trim();
  let itens=[...lancamentos];
  if(tipo) itens=itens.filter(l=>l.tipo===tipo);
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
  const payload={nome:$("moradorNome").value.trim(),email:$("moradorEmail").value.trim(),password:$("moradorSenha").value,unidade:$("moradorUnidade").value.trim(),condominio_id:$("moradorCondominio").value,cpf:$("moradorCpf")?.value?.trim()||"",celular:$("moradorCelular")?.value?.trim()||"",placa_veiculo:$("moradorPlaca")?.value?.trim()||""};
  if(!payload.nome||!payload.email||!payload.password||!payload.condominio_id) return msg($("adminMsg"),"Preencha nome, e-mail, senha e condomínio do morador.","error");
  const {data:sessionData}=await supabaseClient.auth.getSession(); const token=sessionData?.session?.access_token;
  const res=await fetch("/api/create-user",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},body:JSON.stringify(payload)});
  const result=await res.json().catch(()=>({})); if(!res.ok) return msg($("adminMsg"),result.error||"Erro ao criar morador.","error");
  e.target.reset(); await carregarMoradores(); msg($("adminMsg"),"Morador criado/recriado com login de acesso.","ok");
}

async function uploadFile(file, folder){ if(!file) return null; const ext=file.name.split('.').pop(); const path=`${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`; const {error}=await supabaseClient.storage.from("documentos").upload(path,file,{upsert:false}); if(error){console.warn(error); return null;} const {data}=supabaseClient.storage.from("documentos").getPublicUrl(path); return data?.publicUrl || null; }

async function criarLancamento(e){
  e.preventDefault(); msg($("adminMsg"),"");
  try{
    const condominio_id=$("lanCondominio").value; const tipo=$("lanTipo")?.value||"despesa"; const data=$("lanData").value; const valor=Number($("lanValor").value||0); const categoria=$("lanCategoria").value.trim(); const local=$("lanLocal").value.trim(); const justificativa=$("lanJustificativa").value.trim();
    if(!condominio_id||!data||!valor) return msg($("adminMsg"),"Selecione condomínio, data e valor.","error");
    const anexo=await uploadFile($("lanAnexo")?.files?.[0],`condominios/${condominio_id}/anexos`);
    const payload={condominio_id,tipo,data,valor,categoria,local,descricao:categoria||local||tipo,justificativa,created_by:currentUser?.id};
    if(anexo) payload.anexo_url=anexo;
    const {error}=await supabaseClient.from("lancamentos").insert(payload); if(error) throw error;
    e.target.reset(); $("lanAnexoNome").textContent="Nenhum arquivo selecionado"; await carregarLancamentos(); msg($("adminMsg"),"Lançamento salvo com sucesso.","ok");
  }catch(err){ msg($("adminMsg"),"Erro ao salvar lançamento: "+err.message,"error"); }
}

async function removerCondominio(e){ e.preventDefault(); const id=$("removerCondominio").value; if(!id) return msg($("adminMsg"),"Selecione um condomínio para remover.","error"); const c=condominios.find(x=>x.id===id); if(!confirm(`Tem certeza que deseja remover "${c?.nome||'este condomínio'}"?`)) return; const {error}=await supabaseClient.from("condominios").delete().eq("id",id); if(error) return msg($("adminMsg"),"Erro ao remover condomínio: "+error.message,"error"); await carregarCondominios(); await carregarLancamentos(); msg($("adminMsg"),"Condomínio removido com sucesso.","ok"); }
async function removerMorador(e){ e.preventDefault(); const id=$("removerMorador").value; if(!id) return msg($("adminMsg"),"Selecione um morador.","error"); const m=moradores.find(x=>x.id===id); if(!confirm(`Remover "${m?.nome||m?.email||'este morador'}"?`)) return; const {data:sessionData}=await supabaseClient.auth.getSession(); const token=sessionData?.session?.access_token; const res=await fetch("/api/delete-user",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},body:JSON.stringify({user_id:id})}); const result=await res.json().catch(()=>({})); if(!res.ok) return msg($("adminMsg"),result.error||"Erro ao remover morador.","error"); await carregarMoradores(); msg($("adminMsg"),"Morador removido com sucesso.","ok"); }
async function removerLancamento(e){ e.preventDefault(); const id=$("removerLancamento").value; if(!id) return msg($("adminMsg"),"Selecione um lançamento.","error"); if(!confirm("Tem certeza que deseja remover este lançamento?")) return; const {error}=await supabaseClient.from("lancamentos").delete().eq("id",id); if(error) return msg($("adminMsg"),"Erro ao remover lançamento: "+error.message,"error"); await carregarLancamentos(); msg($("adminMsg"),"Lançamento removido com sucesso.","ok"); }

function downloadText(filename, text, type="text/plain"){ const blob=new Blob([text],{type}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url); }
function exportCsv(){ const header=["data","tipo","valor","categoria","condominio","descricao","justificativa"]; const rows=lancamentos.map(l=>[l.data,l.tipo,l.valor,l.categoria||"",l.condominios?.nome||"",l.descricao||"",(l.justificativa||"").replace(/\n/g," ")]); const csv=[header,...rows].map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(";")).join("\n"); downloadText("lancamentos_portal_transparencia_dm.csv",csv,"text/csv;charset=utf-8"); }
function backupJson(){ downloadText("backup_portal_transparencia_dm.json", JSON.stringify({gerado_em:new Date().toISOString(),condominios,moradores,lancamentos},null,2), "application/json"); }

document.addEventListener("DOMContentLoaded", init);
