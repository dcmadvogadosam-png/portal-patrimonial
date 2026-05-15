const $ = (id) => document.getElementById(id);
const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

let supabaseClient = null;
let currentUser = null;
let profile = null;
let condominios = [];
let lancamentos = [];
let moradores = [];

function msg(el, text, type = "") {
  if (!el) return;
  el.textContent = text || "";
  el.className = `message ${type}`;
}

function show(el) {
  if (el) el.classList.remove("hidden");
}

function hide(el) {
  if (el) el.classList.add("hidden");
}

function bindBasicEvents() {
  $("adminAccessBtn")?.addEventListener("click", () => {
    msg($("adminLoginMsg"), "");
    show($("adminLoginModal"));
  });

  $("closeAdminLogin")?.addEventListener("click", () => {
    hide($("adminLoginModal"));
  });

  $("adminLoginModal")?.addEventListener("click", (e) => {
    if (e.target?.id === "adminLoginModal") hide($("adminLoginModal"));
  });

  $("adminLoginBtn")?.addEventListener("click", loginAdmin);
  $("loginBtn")?.addEventListener("click", loginMorador);
  $("logoutBtn")?.addEventListener("click", logout);
  $("printBtn")?.addEventListener("click", () => window.print());
  $("filterTipo")?.addEventListener("change", renderLancamentos);
  $("filterBusca")?.addEventListener("input", renderLancamentos);
  $("closeModal")?.addEventListener("click", () => hide($("detailModal")));

  $("formCondominio")?.addEventListener("submit", criarCondominio);
  $("formMorador")?.addEventListener("submit", criarMorador);
  $("formLancamento")?.addEventListener("submit", criarLancamento);
  $("formRemoverCondominio")?.addEventListener("submit", removerCondominio);
  $("formRemoverMorador")?.addEventListener("submit", removerMorador);
  $("formRemoverLancamento")?.addEventListener("submit", removerLancamento);
  $("senhaCondominio")?.addEventListener("change", popularMoradoresPorCondominio);
  $("formAlterarSenhaMorador")?.addEventListener("submit", alterarSenhaMorador);
  $("addMoradorExtra")?.addEventListener("click", adicionarLinhaMoradorExtra);
  $("moradoresExtrasList")?.addEventListener("click", (e) => { if (e.target?.classList?.contains("remove-extra")) e.target.closest(".repeat-row")?.remove(); });
  $("relatorioCondominio")?.addEventListener("change", renderMoradoresRelatorio);
  $("buscaPlaca")?.addEventListener("input", renderMoradoresRelatorio);
  $("exportMoradoresPdf")?.addEventListener("click", exportarMoradoresPdf);
  $("exportMoradoresCsv")?.addEventListener("click", exportarMoradoresCsv);
  $("backupPortalBtn")?.addEventListener("click", exportarBackupPortal);
  bindFileName("moradorFoto", "moradorFotoNome");
  bindFileName("logoCondominioRelatorio", "logoCondominioRelatorioNome");
  bindFileName("logoDmRelatorio", "logoDmRelatorioNome");
}


function requireConfig() {
  if (
    !window.DM_SUPABASE_URL ||
    !window.DM_SUPABASE_ANON_KEY ||
    window.DM_SUPABASE_URL.includes("COLE_AQUI") ||
    window.DM_SUPABASE_ANON_KEY.includes("COLE_AQUI")
  ) {
    msg($("loginMsg"), "Configure o Supabase no arquivo config.js antes de usar o portal.", "error");
    msg($("adminLoginMsg"), "Configure o Supabase no arquivo config.js antes de fazer login.", "error");
    return false;
  }

  supabaseClient = window.supabase.createClient(
    window.DM_SUPABASE_URL,
    window.DM_SUPABASE_ANON_KEY
  );

  return true;
}

async function init() {
  bindBasicEvents();

  if (!requireConfig()) {
    return;
  }

  await carregarCondominios();
  await restoreSession();
}

async function restoreSession() {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session?.user) {
    currentUser = data.session.user;
    await carregarPerfil();
    if (profile) await abrirDashboard();
  }
}

async function carregarCondominios() {
  if (!supabaseClient) return;

  let result = await supabaseClient.from("condominios").select("*");
  let data = result.data;
  let error = result.error;

  if (error) {
    console.warn("Erro ao carregar condomínios:", error);
    condominios = [];
  } else {
    condominios = (data || [])
      .map(c => ({
        ...c,
        nome: c.nome || c.name || c.titulo || c.descricao || "Condomínio sem nome"
      }))
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  }

  popularSelects();
}

function popularSelects() {
  const options =
    `<option value="">Selecione o condomínio</option>` +
    condominios.map(c => `<option value="${c.id}">${escapeHtml(c.nome || c.name || "Condomínio")}</option>`).join("");

  ["loginCondominio", "moradorCondominio", "lanCondominio", "removerCondominio", "senhaCondominio", "relatorioCondominio"].forEach(id => {
    const el = $(id);
    if (el) el.innerHTML = options;
  });

  popularMoradoresPorCondominio();
}

async function loginMorador() {
  if (!supabaseClient && !requireConfig()) return;

  msg($("loginMsg"), "");
  const email = $("loginEmail").value.trim();
  const password = $("loginSenha").value;
  const condominioId = $("loginCondominio").value;

  if (!condominioId) {
    msg($("loginMsg"), "Selecione o seu condomínio para acessar como morador.", "error");
    return;
  }

  if (!email || !password) {
    msg($("loginMsg"), "Informe e-mail e senha.", "error");
    return;
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    msg($("loginMsg"), "Login inválido. Verifique e-mail e senha.", "error");
    return;
  }

  currentUser = data.user;
  await carregarPerfil();

  if (!profile) {
    await supabaseClient.auth.signOut();
    msg($("loginMsg"), "Usuário sem perfil cadastrado. Fale com a administração.", "error");
    return;
  }

  if (profile.role === "admin") {
    await supabaseClient.auth.signOut();
    msg($("loginMsg"), "Este formulário é exclusivo para moradores. Use o botão Área Administrativa.", "error");
    return;
  }

  if (profile.condominio_id !== condominioId) {
    await supabaseClient.auth.signOut();
    msg($("loginMsg"), "Este morador não está vinculado ao condomínio selecionado.", "error");
    return;
  }

  await abrirDashboard();
}

async function loginAdmin() {
  if (!supabaseClient && !requireConfig()) return;

  msg($("adminLoginMsg"), "");
  const email = $("adminEmail").value.trim();
  const password = $("adminSenha").value;

  if (!email || !password) {
    msg($("adminLoginMsg"), "Informe o e-mail e a senha do administrador.", "error");
    return;
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    msg($("adminLoginMsg"), "Login administrativo inválido.", "error");
    return;
  }

  currentUser = data.user;
  await carregarPerfil();

  if (!profile || profile.role !== "admin") {
    await supabaseClient.auth.signOut();
    msg($("adminLoginMsg"), "Este usuário não possui permissão de administrador.", "error");
    return;
  }

  hide($("adminLoginModal"));
  await abrirDashboard();
}

async function carregarPerfil() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .single();

  if (error) {
    console.warn(error);
    profile = null;
  } else {
    profile = data;
  }
}

async function abrirDashboard() {
  hide($("loginScreen"));
  show($("dashboardScreen"));
  show($("logoutBtn"));
  hide($("adminAccessBtn"));

  const isAdmin = profile?.role === "admin";
  $("adminPanel")?.classList.toggle("hidden", !isAdmin);
  $("userRoleLabel").textContent = isAdmin ? "Administrador geral" : `Morador | Unidade ${profile.unidade || "-"}`;

  const condominio = isAdmin
    ? { nome: "Todos os condomínios" }
    : condominios.find(c => c.id === profile.condominio_id);

  $("condominioTitulo").textContent = condominio?.nome || "Condomínio";
  $("sessionLabel").textContent = currentUser.email;

  await carregarLancamentos();
  if (isAdmin) await carregarMoradores();
}

async function logout() {
  if (supabaseClient) await supabaseClient.auth.signOut();
  window.location.reload();
}


async function carregarMoradores() {
  if (!supabaseClient) return;

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("role", "morador");

  if (error) {
    console.warn("Erro ao carregar moradores:", error);
    moradores = [];
  } else {
    moradores = (data || []).sort((a, b) =>
      String(a.nome || a.email || "").localeCompare(String(b.nome || b.email || ""), "pt-BR")
    );
  }

  popularMoradores();
  popularMoradoresPorCondominio();
  renderMoradoresRelatorio();
}

function popularMoradores() {
  const el = $("removerMorador");
  if (!el) return;

  el.innerHTML =
    `<option value="">Selecione o morador</option>` +
    moradores.map(m => {
      const condominio = condominios.find(c => c.id === m.condominio_id);
      const cond = condominio?.nome ? ` - ${condominio.nome}` : "";
      const unidade = m.unidade ? ` - Unidade ${m.unidade}` : "";
      const nome = m.nome || m.email || "Morador";
      return `<option value="${m.id}">${escapeHtml(nome + unidade + cond)}</option>`;
    }).join("");
}

function popularLancamentosRemocao() {
  const el = $("removerLancamento");
  if (!el) return;

  el.innerHTML =
    `<option value="">Selecione o lançamento</option>` +
    lancamentos.map(l => {
      const cond = l.condominios?.nome ? ` - ${l.condominios.nome}` : "";
      const label = `${formatDate(l.data)} - ${money(l.valor)} - ${l.categoria || l.descricao || "Despesa"}${cond}`;
      return `<option value="${l.id}">${escapeHtml(label)}</option>`;
    }).join("");
}

async function carregarLancamentos() {
  let query = supabaseClient
    .from("lancamentos")
    .select("*, condominios(nome)")
    .order("data", { ascending: false });

  if (profile?.role !== "admin") {
    query = query.eq("condominio_id", profile.condominio_id);
  }

  const { data, error } = await query;
  if (error) {
    console.error(error);
    lancamentos = [];
  } else {
    lancamentos = data || [];
  }

  renderResumo();
  renderLancamentos();
  popularLancamentosRemocao();
}

function renderResumo() {
  const receitas = lancamentos
    .filter(l => l.tipo === "receita")
    .reduce((s, l) => s + Number(l.valor || 0), 0);

  const despesas = lancamentos
    .filter(l => l.tipo === "despesa")
    .reduce((s, l) => s + Number(l.valor || 0), 0);

  $("totalReceitas").textContent = money(receitas);
  $("totalDespesas").textContent = money(despesas);
  $("saldoAtual").textContent = money(receitas - despesas);
  $("totalRegistros").textContent = lancamentos.length;
}

function renderLancamentos() {
  if (!$("recordsList")) return;

  const tipo = $("filterTipo")?.value || "";
  const busca = ($("filterBusca")?.value || "").toLowerCase().trim();

  let itens = [...lancamentos];

  if (tipo) itens = itens.filter(l => l.tipo === tipo);
  if (busca) {
    itens = itens.filter(l =>
      [l.descricao, l.categoria, l.justificativa, l.condominios?.nome]
        .join(" ")
        .toLowerCase()
        .includes(busca)
    );
  }

  $("recordsList").innerHTML = itens.map(l => `
    <article class="record-card">
      <div>
        <h4>${escapeHtml(l.descricao || "Lançamento")}</h4>
        <div class="record-meta">
          <span class="tag ${l.tipo === "despesa" ? "expense" : "income"}">${l.tipo === "despesa" ? "Despesa" : "Receita"}</span>
          <span class="tag">${money(l.valor)}</span>
          <span class="tag">${formatDate(l.data)}</span>
          ${profile?.role === "admin" ? `<span class="tag">${escapeHtml(l.condominios?.nome || "")}</span>` : ""}
          ${l.categoria ? `<span class="tag">${escapeHtml(l.categoria)}</span>` : ""}
        </div>
        <p>${l.justificativa ? escapeHtml(l.justificativa.slice(0, 160) + (l.justificativa.length > 160 ? "..." : "")) : "Sem justificativa informada."}</p>
      </div>
      <div class="record-actions">
        <button class="btn details-btn" onclick="abrirDetalhes('${l.id}')">Ver detalhes</button>
      </div>
    </article>
  `).join("") || `<p>Nenhum lançamento encontrado.</p>`;
}

function formatDate(d) {
  if (!d) return "-";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function extrairUrlAnexo(lancamento) {
  const direta = lancamento.anexo_url || lancamento.nota_url || lancamento.foto_url || "";
  if (direta) return direta;

  const texto = lancamento.justificativa || "";
  const match = texto.match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0] : "";
}

function limparJustificativa(texto = "") {
  return String(texto)
    .replace(/Anexo\/foto:\s*https?:\/\/[^\s<>"']+/ig, "")
    .replace(/https?:\/\/[^\s<>"']+/ig, "")
    .trim();
}

window.abrirDetalhes = function(id) {
  const l = lancamentos.find(x => x.id === id);
  if (!l) return;

  const fileLink = (label, url) => url ? `<div class="attachment"><a href="${url}" target="_blank">${label}</a></div>` : "";
  const imageBox = (label, url) => url ? `<div class="attachment image-evidence"><strong>${label}</strong><a href="${url}" target="_blank"><img src="${url}" alt="${label}"></a></div>` : "";

  const anexoUrl = extrairUrlAnexo(l);
  const isImage = anexoUrl && /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(anexoUrl);
  const justificativaLimpa = limparJustificativa(l.justificativa || "");

  $("detailContent").innerHTML = `
    <span class="pill">${l.tipo === "despesa" ? "Despesa" : "Receita"}</span>
    <h2>${escapeHtml(l.descricao || "Lançamento")}</h2>
    <div class="detail-grid">
      <div class="detail-box"><strong>Valor</strong><p>${money(l.valor)}</p></div>
      <div class="detail-box"><strong>Data</strong><p>${formatDate(l.data)}</p></div>
      <div class="detail-box"><strong>Categoria</strong><p>${escapeHtml(l.categoria || "-")}</p></div>
    </div>
    <div class="detail-box" style="margin-top:18px"><strong>Justificativa / Motivo</strong><p>${escapeHtml(justificativaLimpa || "Não informado.")}</p></div>
    <h3>Documentos e evidências</h3>
    <div class="attachments">
      ${isImage ? imageBox("Imagem anexada", anexoUrl) : fileLink("Abrir anexo / foto", anexoUrl)}
    </div>
  `;

  show($("detailModal"));
};

async function criarCondominio(e) {
  e.preventDefault();
  msg($("adminMsg"), "");

  const payload = {
    nome: $("condNome").value.trim(),
    endereco: $("condEndereco").value.trim()
  };

  const { error } = await supabaseClient.from("condominios").insert(payload);
  if (error) return msg($("adminMsg"), "Erro ao cadastrar condomínio: " + error.message, "error");

  e.target.reset();
  await carregarCondominios();
  msg($("adminMsg"), "Condomínio cadastrado com sucesso.", "ok");
}

async function criarMorador(e) {
  e.preventDefault();
  msg($("adminMsg"), "");

  const moradoresJunto = Array.from(document.querySelectorAll(".morador-extra-nome"))
    .map(input => input.value.trim())
    .filter(Boolean);

  const condominioId = $("moradorCondominio")?.value || "";
  const fotoUrl = await uploadFile($("moradorFoto")?.files?.[0], `condominios/${condominioId}/moradores`);

  const payload = {
    nome: $("moradorNome")?.value?.trim() || "",
    cpf: $("moradorCpf")?.value?.trim() || "",
    celular: $("moradorCelular")?.value?.trim() || "",
    email_contato: $("moradorEmailOpcional")?.value?.trim() || "",
    email: $("moradorEmail")?.value?.trim() || "",
    password: $("moradorSenha")?.value || "",
    moradores_junto: moradoresJunto,
    placa_veiculo: normalizarPlaca($("moradorPlaca")?.value || ""),
    foto_url: fotoUrl,
    unidade: $("moradorUnidade")?.value?.trim() || "",
    condominio_id: condominioId
  };

  if (!payload.nome || !payload.cpf || !payload.celular || !payload.email || !payload.password || !payload.unidade || !payload.condominio_id) {
    msg($("adminMsg"), "Preencha nome, CPF, celular, e-mail de acesso, senha, unidade e condomínio do morador.", "error");
    return;
  }

  const { data: sessionData } = await supabaseClient.auth.getSession();
  const token = sessionData?.session?.access_token;

  const res = await fetch("/api/create-user", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  const result = await res.json().catch(() => ({}));
  if (!res.ok) return msg($("adminMsg"), result.error || "Erro ao criar morador.", "error");

  e.target.reset();
  resetMoradoresExtras();
  const fotoNome = $("moradorFotoNome");
  if (fotoNome) fotoNome.textContent = "Nenhuma foto selecionada";
  await carregarMoradores();
  msg($("adminMsg"), "Morador criado/recriado com login de acesso.", "ok");
}

async function uploadFile(file, folder) {
  if (!file) return null;

  const ext = file.name.split(".").pop();
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabaseClient.storage
    .from("documentos")
    .upload(path, file, { upsert: false });

  if (error) {
    console.warn("Falha no upload do anexo:", error);
    return null;
  }

  const { data } = supabaseClient.storage.from("documentos").getPublicUrl(path);
  return data?.publicUrl || null;
}

async function criarLancamento(e) {
  e.preventDefault();
  msg($("adminMsg"), "");

  try {
    const condominioId = $("lanCondominio")?.value || "";
    if (!condominioId) {
      msg($("adminMsg"), "Selecione o condomínio.", "error");
      return;
    }

    const data = $("lanData")?.value || "";
    const valor = Number($("lanValor")?.value || 0);
    const categoria = $("lanCategoria")?.value?.trim() || "Despesa";
    const local = $("lanLocal")?.value?.trim() || "";
    const justificativa = $("lanJustificativa")?.value?.trim() || "";

    if (!data || !valor) {
      msg($("adminMsg"), "Informe a data e o valor da despesa.", "error");
      return;
    }

    const anexo = await uploadFile($("lanAnexo")?.files?.[0], `condominios/${condominioId}/anexos`);

    let justificativaCompleta = justificativa;
    if (local) justificativaCompleta = `Local: ${local}\n\n${justificativaCompleta}`;

    const basePayload = {
      condominio_id: condominioId,
      tipo: "despesa",
      data,
      valor,
      categoria,
      descricao: categoria || local || justificativa.slice(0, 80) || "Despesa",
      justificativa: justificativaCompleta
    };

    let error = null;

    // 1ª tentativa: salva na coluna nova recomendada.
    if (anexo) {
      const tentativaAnexo = await supabaseClient
        .from("lancamentos")
        .insert({ ...basePayload, anexo_url: anexo });
      error = tentativaAnexo.error;
    } else {
      const tentativaSemAnexo = await supabaseClient
        .from("lancamentos")
        .insert(basePayload);
      error = tentativaSemAnexo.error;
    }

    // 2ª tentativa: compatibilidade com coluna antiga nota_url.
    if (error && anexo && String(error.message || "").includes("anexo_url")) {
      const tentativaNota = await supabaseClient
        .from("lancamentos")
        .insert({ ...basePayload, nota_url: anexo });
      error = tentativaNota.error;
    }

    // 3ª tentativa: se o banco ainda não tiver coluna de anexo, salva o link dentro da justificativa.
    if (
      error &&
      anexo &&
      (String(error.message || "").includes("nota_url") || String(error.message || "").includes("schema cache"))
    ) {
      const tentativaTexto = await supabaseClient
        .from("lancamentos")
        .insert({
          ...basePayload,
          justificativa: `${justificativaCompleta}\n\nAnexo/foto: ${anexo}`.trim()
        });
      error = tentativaTexto.error;
    }

    if (error) throw error;

    e.target.reset();

    const nomeAnexo = $("lanAnexoNome");
    if (nomeAnexo) nomeAnexo.textContent = "Nenhuma imagem selecionada";

    await carregarLancamentos();
    msg($("adminMsg"), "Lançamento salvo com sucesso.", "ok");
  } catch (err) {
    msg($("adminMsg"), "Erro ao salvar lançamento: " + err.message, "error");
  }
}


async function removerCondominio(e) {
  e.preventDefault();
  msg($("adminMsg"), "");

  const condominioId = $("removerCondominio")?.value;
  if (!condominioId) {
    msg($("adminMsg"), "Selecione um condomínio para remover.", "error");
    return;
  }

  const condominio = condominios.find(c => c.id === condominioId);
  const nome = condominio?.nome || "este condomínio";

  const confirmar = confirm(
    `Tem certeza que deseja remover "${nome}"?\n\nEssa ação pode remover lançamentos vinculados a esse condomínio e não poderá ser desfeita.`
  );

  if (!confirmar) return;

  try {
    const { error } = await supabaseClient
      .from("condominios")
      .delete()
      .eq("id", condominioId);

    if (error) throw error;

    await carregarCondominios();
    await carregarLancamentos();

    msg($("adminMsg"), `Condomínio "${nome}" removido com sucesso.`, "ok");
  } catch (err) {
    msg($("adminMsg"), "Erro ao remover condomínio: " + err.message, "error");
  }
}



async function removerMorador(e) {
  e.preventDefault();
  msg($("adminMsg"), "");

  const moradorId = $("removerMorador")?.value;
  if (!moradorId) {
    msg($("adminMsg"), "Selecione um morador para remover.", "error");
    return;
  }

  const morador = moradores.find(m => m.id === moradorId);
  const nome = morador?.nome || morador?.email || "este morador";

  const confirmar = confirm(
    `Tem certeza que deseja remover "${nome}"?\n\nO perfil será apagado e o login de acesso será removido.`
  );

  if (!confirmar) return;

  try {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const token = sessionData?.session?.access_token;

    const res = await fetch("/api/delete-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ user_id: moradorId })
    });

    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || "Erro ao remover morador.");

    await carregarMoradores();
    msg($("adminMsg"), `Morador "${nome}" removido com sucesso.`, "ok");
  } catch (err) {
    msg($("adminMsg"), "Erro ao remover morador: " + err.message, "error");
  }
}

async function removerLancamento(e) {
  e.preventDefault();
  msg($("adminMsg"), "");

  const lancamentoId = $("removerLancamento")?.value;
  if (!lancamentoId) {
    msg($("adminMsg"), "Selecione um lançamento para remover.", "error");
    return;
  }

  const lancamento = lancamentos.find(l => l.id === lancamentoId);
  const label = lancamento ? `${formatDate(lancamento.data)} - ${money(lancamento.valor)}` : "este lançamento";

  const confirmar = confirm(
    `Tem certeza que deseja remover ${label}?\n\nEssa ação não poderá ser desfeita.`
  );

  if (!confirmar) return;

  try {
    const { error } = await supabaseClient
      .from("lancamentos")
      .delete()
      .eq("id", lancamentoId);

    if (error) throw error;

    await carregarLancamentos();
    msg($("adminMsg"), "Lançamento removido com sucesso.", "ok");
  } catch (err) {
    msg($("adminMsg"), "Erro ao remover lançamento: " + err.message, "error");
  }
}



function popularMoradoresPorCondominio() {
  const condominioId = $("senhaCondominio")?.value || "";
  const selectMorador = $("senhaMorador");
  if (!selectMorador) return;

  if (!condominioId) {
    selectMorador.innerHTML = `<option value="">Selecione primeiro o condomínio</option>`;
    return;
  }

  const filtrados = moradores.filter(m => m.condominio_id === condominioId);

  if (!filtrados.length) {
    selectMorador.innerHTML = `<option value="">Nenhum morador cadastrado neste condomínio</option>`;
    return;
  }

  selectMorador.innerHTML =
    `<option value="">Selecione o morador</option>` +
    filtrados.map(m => {
      const unidade = m.unidade ? ` - Unidade ${m.unidade}` : "";
      const nome = m.nome || m.email || "Morador";
      return `<option value="${m.id}">${escapeHtml(nome + unidade + " - " + (m.email || ""))}</option>`;
    }).join("");
}

async function alterarSenhaMorador(e) {
  e.preventDefault();
  msg($("adminMsg"), "");

  const userId = $("senhaMorador")?.value || "";
  const novaSenha = $("novaSenhaMorador")?.value || "";

  if (!userId) {
    msg($("adminMsg"), "Selecione o morador que terá a senha alterada.", "error");
    return;
  }

  if (!novaSenha || novaSenha.length < 6) {
    msg($("adminMsg"), "A nova senha precisa ter pelo menos 6 caracteres.", "error");
    return;
  }

  try {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const token = sessionData?.session?.access_token;

    const res = await fetch("/api/update-user-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ user_id: userId, password: novaSenha })
    });

    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || "Erro ao alterar senha do morador.");

    $("novaSenhaMorador").value = "";
    msg($("adminMsg"), "Senha do morador alterada com sucesso.", "ok");
  } catch (err) {
    msg($("adminMsg"), "Erro ao alterar senha: " + err.message, "error");
  }
}


function normalizarPlaca(valor = "") {
  return String(valor).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function bindFileName(inputId, labelId) {
  const input = $(inputId);
  const label = $(labelId);
  if (!input || !label) return;
  input.addEventListener("change", () => {
    label.textContent = input.files?.[0]?.name || "Nenhum arquivo selecionado";
  });
}

function adicionarLinhaMoradorExtra() {
  const box = $("moradoresExtrasList");
  if (!box) return;
  const row = document.createElement("div");
  row.className = "repeat-row";
  row.innerHTML = `<input class="morador-extra-nome" placeholder="Nome de outro morador" /><button type="button" class="btn btn-light btn-small remove-extra">Remover</button>`;
  box.appendChild(row);
}

function resetMoradoresExtras() {
  const box = $("moradoresExtrasList");
  if (!box) return;
  box.innerHTML = `<div class="repeat-row"><input class="morador-extra-nome" placeholder="Nome de outro morador" /><button type="button" class="btn btn-light btn-small remove-extra">Remover</button></div>`;
}

function getMoradoresFiltradosRelatorio() {
  const condominioId = $("relatorioCondominio")?.value || "";
  const placa = normalizarPlaca($("buscaPlaca")?.value || "");
  let itens = moradores.filter(m => !condominioId || m.condominio_id === condominioId);
  if (placa) itens = itens.filter(m => normalizarPlaca(m.placa_veiculo || "").includes(placa));
  return itens;
}

function nomeCondominio(id) {
  return condominios.find(c => c.id === id)?.nome || "-";
}

function moradoresJuntoTexto(m) {
  const v = m.moradores_junto;
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "string") {
    try { const parsed = JSON.parse(v); if (Array.isArray(parsed)) return parsed.join(", "); } catch (_) {}
    return v;
  }
  return "";
}

function renderMoradoresRelatorio() {
  const wrap = $("moradoresRelatorioLista");
  const resumo = $("moradoresRelatorioResumo");
  if (!wrap || !resumo) return;
  const itens = getMoradoresFiltradosRelatorio();
  const condominioId = $("relatorioCondominio")?.value || "";
  const titulo = condominioId ? nomeCondominio(condominioId) : "Todos os condomínios";
  resumo.textContent = `${titulo}: ${itens.length} morador(es) encontrado(s).`;
  if (!itens.length) { wrap.innerHTML = `<p class="hint">Nenhum morador encontrado para o filtro selecionado.</p>`; return; }
  wrap.innerHTML = `<table class="residents-table"><thead><tr><th>Responsável</th><th>CPF</th><th>Celular</th><th>E-mail acesso</th><th>Unidade</th><th>Condomínio</th><th>Placa</th><th>Moradores vinculados</th></tr></thead><tbody>${itens.map(m => `<tr><td>${escapeHtml(m.nome || "")}</td><td>${escapeHtml(m.cpf || "")}</td><td>${escapeHtml(m.celular || "")}</td><td>${escapeHtml(m.email || "")}</td><td>${escapeHtml(m.unidade || "")}</td><td>${escapeHtml(nomeCondominio(m.condominio_id))}</td><td>${escapeHtml(m.placa_veiculo || "")}</td><td>${escapeHtml(moradoresJuntoTexto(m) || "-")}</td></tr>`).join("")}</tbody></table>`;
}

function csvEscape(v) { return `"${String(v ?? "").replaceAll('"', '""')}"`; }

function downloadText(filename, text, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function exportarMoradoresCsv() {
  const itens = getMoradoresFiltradosRelatorio();
  if (!itens.length) return msg($("adminMsg"), "Nenhum morador para exportar.", "error");
  const header = ["Condominio","Responsavel","CPF","Celular","Email opcional","Email acesso","Unidade","Placa veiculo","Moradores vinculados","Foto"];
  const rows = itens.map(m => [nomeCondominio(m.condominio_id), m.nome, m.cpf, m.celular, m.email_contato, m.email, m.unidade, m.placa_veiculo, moradoresJuntoTexto(m), m.foto_url].map(csvEscape).join(";"));
  downloadText(`relatorio-moradores-${new Date().toISOString().slice(0,10)}.csv`, [header.join(";"), ...rows].join("\n"), "text/csv;charset=utf-8");
}

function fileToDataUrl(file) {
  return new Promise(resolve => {
    if (!file) return resolve("");
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result || "");
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

async function exportarMoradoresPdf() {
  const itens = getMoradoresFiltradosRelatorio();
  if (!itens.length) return msg($("adminMsg"), "Nenhum morador para gerar PDF.", "error");
  const logoCond = await fileToDataUrl($("logoCondominioRelatorio")?.files?.[0]);
  const logoDm = await fileToDataUrl($("logoDmRelatorio")?.files?.[0]);
  const condominioId = $("relatorioCondominio")?.value || "";
  const titulo = condominioId ? nomeCondominio(condominioId) : "Todos os condomínios";
  const rows = itens.map(m => `<tr><td>${escapeHtml(nomeCondominio(m.condominio_id))}</td><td>${escapeHtml(m.nome || "")}</td><td>${escapeHtml(m.cpf || "")}</td><td>${escapeHtml(m.celular || "")}</td><td>${escapeHtml(m.email || "")}</td><td>${escapeHtml(m.unidade || "")}</td><td>${escapeHtml(m.placa_veiculo || "-")}</td><td>${escapeHtml(moradoresJuntoTexto(m) || "-")}</td></tr>`).join("");
  const win = window.open("", "_blank");
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Relatório de Moradores</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;color:#102033;margin:0}.header{display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,#061d38,#0c3974);color:#fff;padding:18px 22px;border-radius:18px;margin-bottom:14px}.logos{display:flex;gap:12px;align-items:center}.logos img{max-height:58px;max-width:110px;background:#fff;border-radius:12px;padding:6px}.title h1{margin:0;font-size:24px}.title p{margin:6px 0 0;color:#dbeafe}.summary{display:flex;gap:12px;margin:10px 0 14px}.box{background:#f1f5f9;border-left:5px solid #e5b037;padding:10px 14px;border-radius:10px;font-weight:700}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#e5b037;color:#061d38;text-align:left;padding:8px;border:1px solid #d6a52f}td{padding:7px;border:1px solid #d8e1ef;vertical-align:top}tr:nth-child(even) td{background:#f8fbff}.footer{margin-top:12px;font-size:10px;color:#64748b}</style></head><body><div class="header"><div class="title"><h1>Relatório de Moradores</h1><p>${escapeHtml(titulo)} • DM Gestão Patrimonial</p></div><div class="logos">${logoCond ? `<img src="${logoCond}">` : ""}${logoDm ? `<img src="${logoDm}">` : ""}</div></div><div class="summary"><div class="box">Total de moradores: ${itens.length}</div><div class="box">Gerado em: ${new Date().toLocaleDateString("pt-BR")}</div></div><table><thead><tr><th>Condomínio</th><th>Responsável</th><th>CPF</th><th>Celular</th><th>E-mail acesso</th><th>Unidade</th><th>Placa</th><th>Moradores vinculados</th></tr></thead><tbody>${rows}</tbody></table><div class="footer">Relatório gerado pelo Portal de Transparência DM.</div><script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
  win.document.close();
}

function exportarBackupPortal() {
  const backup = { gerado_em: new Date().toISOString(), condominios, moradores, lancamentos };
  downloadText(`backup-portal-dm-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(backup, null, 2), "application/json;charset=utf-8");
}

document.addEventListener("DOMContentLoaded", init);
