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

  ["loginCondominio", "moradorCondominio", "lanCondominio", "removerCondominio"].forEach(id => {
    const el = $(id);
    if (el) el.innerHTML = options;
  });
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

  const payload = {
    nome: $("moradorNome")?.value?.trim() || "",
    email: $("moradorEmail")?.value?.trim() || "",
    password: $("moradorSenha")?.value || "",
    unidade: $("moradorUnidade")?.value?.trim() || "",
    condominio_id: $("moradorCondominio")?.value || ""
  };

  if (!payload.nome || !payload.email || !payload.password || !payload.condominio_id) {
    msg($("adminMsg"), "Preencha nome, e-mail, senha e condomínio do morador.", "error");
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


document.addEventListener("DOMContentLoaded", init);
