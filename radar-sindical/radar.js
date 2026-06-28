const STORAGE_KEY = "radarSindicalState:v1";

const navItems = [
  ["dashboard", "Monitoramento"],
  ["upload", "Upload Mediador"],
  ["clients", "Clientes"],
  ["agreements", "Convencoes"],
  ["links", "Vinculos"],
  ["map", "Mapa"],
];

const clauseTopics = [
  "piso salarial",
  "reajuste salarial",
  "vale alimentacao",
  "vale transporte",
  "plano de saude",
  "plano odontologico",
  "seguro de vida",
  "banco de horas",
  "hora extra",
  "adicional noturno",
  "contribuicoes sindicais",
];

let view = "dashboard";
let editingClientId = null;
let state = loadState();

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return JSON.parse(saved);
  return {
    clients: [
      {
        id: "cli-001",
        legalName: "Nexus Servicos Administrativos Ltda.",
        cnpj: "18453271000190",
        city: "Curitiba",
        state: "PR",
        mainCnae: "8211-3/00",
        employeeCount: 124,
        economicCategory: "Servicos administrativos",
        employerUnion: "SEAC-PR",
        employerUnionCnpj: "76540832000144",
        laborUnion: "SINDEESMAT",
        laborUnionCnpj: "80322910000172",
      },
      {
        id: "cli-002",
        legalName: "Orion Tecnologia e Suporte S.A.",
        cnpj: "30284711000155",
        city: "Sao Paulo",
        state: "SP",
        mainCnae: "6204-0/00",
        employeeCount: 86,
        economicCategory: "Tecnologia da informacao",
        employerUnion: "SEPROSP",
        employerUnionCnpj: "61110302000180",
        laborUnion: "SINDPD-SP",
        laborUnionCnpj: "62285093000120",
      },
    ],
    agreements: [],
    clauses: [],
    links: [],
    alerts: [
      {
        id: crypto.randomUUID(),
        title: "Cliente sem convencao vinculada",
        description: "Clientes sem CCT validada devem ser revisados antes do fechamento de folha.",
        severity: "alto",
      },
    ],
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setView(nextView) {
  view = nextView;
  render();
}

function render() {
  renderNav();
  const root = document.getElementById("view");
  const views = {
    dashboard: renderDashboard,
    upload: renderUpload,
    clients: renderClients,
    agreements: renderAgreements,
    links: renderLinks,
    map: renderMap,
  };
  root.innerHTML = views[view]();
  bindViewEvents();
}

function renderNav() {
  document.getElementById("nav").innerHTML = navItems
    .map(([id, label]) => `<button class="nav-button ${view === id ? "active" : ""}" data-view-button="${id}">${label}</button>`)
    .join("");
}

function renderDashboard() {
  const stats = buildStats();
  return `
    <section class="grid stats">
      ${statCard("Total CCTs", stats.total)}
      ${statCard("Vigentes", stats.active)}
      ${statCard("Vencidas", stats.expired)}
      ${statCard("Prox. vencimento", stats.expiringSoon)}
      ${statCard("Sem vinculo", stats.unlinkedClients)}
      ${statCard("Clientes em risco", stats.riskyClients)}
    </section>
    <section class="grid two-cols">
      <article class="card"><h2>Mapa operacional</h2>${mapTable(mapRows().slice(0, 5))}</article>
      <article class="card"><h2>Alertas priorizados</h2><div class="list">${state.alerts.map(alertCard).join("")}</div></article>
    </section>
  `;
}

function renderUpload() {
  return `
    <section class="grid two-cols">
      <article class="card">
        <h2>Upload PDF Mediador</h2>
        <p class="muted">A importacao cria CCT em validacao. O usuario precisa confirmar antes de aplicar.</p>
        <form id="uploadForm" class="grid" style="margin-top:16px">
          <p class="label">Arquivo PDF da convencao</p>
          <label class="file-picker" for="agreementPdf"><span>Escolher arquivo</span><span id="uploadFileName">Nenhum PDF selecionado</span></label>
          <input class="sr-only" id="agreementPdf" name="file" type="file" accept="application/pdf">
          <button class="button" id="processPdf" type="submit" disabled>Processar PDF</button>
          <p class="message" id="uploadMessage"></p>
        </form>
      </article>
      <article class="card">
        <h2>Campos extraidos</h2>
        <div class="grid two-cols" style="margin-top:16px">
          ${["Registro MTE", "Solicitacao", "Processo", "Vigencia", "Data-base", "Sindicatos", "CNPJs", "Pisos", "Beneficios", "Jornada", "Contribuicoes"].map((item) => `<div class="card">${item}</div>`).join("")}
        </div>
      </article>
    </section>
  `;
}

function renderClients() {
  const client = state.clients.find((item) => item.id === editingClientId);
  return `
    <section class="grid two-cols">
      <article class="card">
        <h2>${client ? "Editar cliente" : "Cadastrar cliente"}</h2>
        <form id="clientForm" class="form-grid" style="margin-top:16px">
          ${field("legalName", "Razao social", client?.legalName, "full")}
          ${field("cnpj", "CNPJ", client?.cnpj)}
          ${field("city", "Municipio", client?.city)}
          ${field("state", "UF", client?.state)}
          ${field("mainCnae", "CNAE principal", client?.mainCnae)}
          ${field("employeeCount", "Qtd. empregados", client?.employeeCount || "", "", "number")}
          ${field("economicCategory", "Categoria economica", client?.economicCategory)}
          ${field("employerUnionCnpj", "CNPJ sindicato patronal", client?.employerUnionCnpj)}
          ${field("employerUnion", "Sindicato patronal", client?.employerUnion)}
          ${field("laborUnionCnpj", "CNPJ sindicato laboral", client?.laborUnionCnpj)}
          ${field("laborUnion", "Sindicato laboral", client?.laborUnion)}
          <div class="actions field full">
            <button class="button" type="submit">${client ? "Salvar alteracoes" : "Salvar cliente"}</button>
            ${client ? `<button class="button secondary" type="button" id="cancelEdit">Cancelar</button>` : ""}
          </div>
          <p class="message field full" id="cnpjMessage"></p>
        </form>
      </article>
      <article class="card">
        <h2>Clientes cadastrados</h2>
        <div class="list" style="margin-top:16px">${state.clients.map(clientCard).join("")}</div>
      </article>
    </section>
  `;
}

function renderAgreements() {
  return `
    <section class="grid">
      ${state.agreements.length ? state.agreements.map(agreementCard).join("") : `<article class="card"><h2>Nenhuma convencao importada</h2><p class="muted">Use Upload Mediador para importar uma CCT.</p></article>`}
    </section>
  `;
}

function renderLinks() {
  return `
    <section class="grid two-cols">
      <article class="card">
        <h2>Vincular cliente e convencao</h2>
        <form id="linkForm" class="grid" style="margin-top:16px">
          <label>Cliente<select name="clientId">${state.clients.map((c) => `<option value="${c.id}">${escapeHtml(c.legalName)}</option>`).join("")}</select></label>
          <label>Convencao<select name="agreementId">${state.agreements.map((a) => `<option value="${a.id}">${escapeHtml(a.title)}</option>`).join("")}</select></label>
          <button class="button" ${state.clients.length && state.agreements.length ? "" : "disabled"}>Criar vinculo</button>
        </form>
      </article>
      <article class="card"><h2>Vinculos ativos</h2><div class="list" style="margin-top:16px">${state.links.map(linkCard).join("")}</div></article>
    </section>
  `;
}

function renderMap() {
  return `<article class="card"><h2>Mapa de Convencoes dos Clientes</h2>${mapTable(mapRows())}</article>`;
}

function bindViewEvents() {
  document.querySelectorAll("[data-view-button]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.viewButton));
  });

  const fileInput = document.getElementById("agreementPdf");
  if (fileInput) {
    fileInput.addEventListener("change", () => {
      document.getElementById("uploadFileName").textContent = fileInput.files[0]?.name || "Nenhum PDF selecionado";
      document.getElementById("processPdf").disabled = !fileInput.files[0];
    });
    document.getElementById("uploadForm").addEventListener("submit", uploadPdf);
  }

  const clientForm = document.getElementById("clientForm");
  if (clientForm) {
    clientForm.addEventListener("submit", saveClient);
    document.getElementById("cancelEdit")?.addEventListener("click", () => {
      editingClientId = null;
      render();
    });
    clientForm.cnpj.addEventListener("blur", () => lookupCnpj(clientForm.cnpj.value, {
      legalName: "legalName",
      city: "city",
      state: "state",
      mainCnae: "mainCnae",
      economicCategory: "economicCategory",
    }));
    clientForm.employerUnionCnpj.addEventListener("blur", () => lookupCnpj(clientForm.employerUnionCnpj.value, { legalName: "employerUnion" }));
    clientForm.laborUnionCnpj.addEventListener("blur", () => lookupCnpj(clientForm.laborUnionCnpj.value, { legalName: "laborUnion" }));
  }

  document.querySelectorAll("[data-edit-client]").forEach((button) => {
    button.addEventListener("click", () => {
      editingClientId = button.dataset.editClient;
      render();
    });
  });
  document.querySelectorAll("[data-remove-client]").forEach((button) => {
    button.addEventListener("click", () => removeClient(button.dataset.removeClient));
  });
  document.querySelectorAll("[data-confirm-agreement]").forEach((button) => {
    button.addEventListener("click", () => confirmAgreement(button.dataset.confirmAgreement));
  });
  document.querySelectorAll("[data-reject-agreement]").forEach((button) => {
    button.addEventListener("click", () => rejectAgreement(button.dataset.rejectAgreement));
  });

  document.getElementById("linkForm")?.addEventListener("submit", createLink);
}

async function uploadPdf(event) {
  event.preventDefault();
  const input = document.getElementById("agreementPdf");
  const message = document.getElementById("uploadMessage");
  if (!input.files[0]) return;
  message.textContent = "Lendo PDF e extraindo clausulas...";
  const body = new FormData();
  body.append("file", input.files[0]);

  try {
    const response = await fetch("/api/conventions/upload", { method: "POST", body });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Falha no upload.");
    const id = crypto.randomUUID();
    state.agreements.unshift({ id, ...payload.extraction.agreement });
    state.clauses.unshift(...payload.extraction.clauses.map((clause) => ({ id: crypto.randomUUID(), agreementId: id, ...clause })));
    state.alerts.unshift({
      id: crypto.randomUUID(),
      title: "Nova convencao em validacao",
      description: `${payload.extraction.agreement.title} aguarda revisao humana.`,
      severity: "medio",
    });
    saveState();
    message.textContent = "Extracao concluida. Convencao enviada para validacao humana.";
    setTimeout(() => setView("agreements"), 700);
  } catch (error) {
    message.textContent = error.message || "Nao foi possivel importar o PDF.";
  }
}

async function lookupCnpj(value, map) {
  const digits = value.replace(/\D/g, "");
  const message = document.getElementById("cnpjMessage");
  if (digits.length !== 14) return;
  message.textContent = "Consultando CNPJ...";
  try {
    const response = await fetch(`/api/cnpj/${digits}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "CNPJ nao encontrado.");
    const form = document.getElementById("clientForm");
    Object.entries(map).forEach(([source, target]) => {
      if (payload[source] && form[target]) form[target].value = payload[source];
    });
    message.textContent = "Dados preenchidos automaticamente.";
  } catch (error) {
    message.textContent = error.message || "Nao foi possivel consultar o CNPJ.";
  }
}

function saveClient(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const client = {
    id: editingClientId || crypto.randomUUID(),
    legalName: form.legalName.value,
    cnpj: form.cnpj.value,
    city: form.city.value,
    state: form.state.value.toUpperCase(),
    mainCnae: form.mainCnae.value,
    employeeCount: Number(form.employeeCount.value || 0),
    economicCategory: form.economicCategory.value,
    employerUnionCnpj: form.employerUnionCnpj.value,
    employerUnion: form.employerUnion.value,
    laborUnionCnpj: form.laborUnionCnpj.value,
    laborUnion: form.laborUnion.value,
  };
  if (editingClientId) {
    state.clients = state.clients.map((item) => item.id === editingClientId ? client : item);
  } else {
    state.clients.unshift(client);
    state.alerts.unshift({ id: crypto.randomUUID(), title: "Cliente sem convencao vinculada", description: `${client.legalName} precisa de vinculo validado.`, severity: "alto" });
  }
  editingClientId = null;
  saveState();
  render();
}

function removeClient(id) {
  const client = state.clients.find((item) => item.id === id);
  if (!client || !confirm(`Remover ${client.legalName} da base?`)) return;
  state.clients = state.clients.filter((item) => item.id !== id);
  state.links = state.links.filter((item) => item.clientId !== id);
  saveState();
  render();
}

function confirmAgreement(id) {
  state.agreements = state.agreements.map((item) => item.id === id ? { ...item, status: "vigente", validatedAt: new Date().toISOString() } : item);
  state.clauses = state.clauses.map((item) => item.agreementId === id ? { ...item, requiresReview: false, confidence: Math.max(item.confidence, 0.8) } : item);
  saveState();
  render();
}

function rejectAgreement(id) {
  state.agreements = state.agreements.filter((item) => item.id !== id);
  state.clauses = state.clauses.filter((item) => item.agreementId !== id);
  state.links = state.links.filter((item) => item.agreementId !== id);
  saveState();
  render();
}

function createLink(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const agreement = state.agreements.find((item) => item.id === form.agreementId.value);
  if (!agreement) return;
  state.links = [
    {
      id: crypto.randomUUID(),
      clientId: form.clientId.value,
      agreementId: agreement.id,
      startsAt: agreement.startsAt,
      endsAt: agreement.endsAt,
      status: agreement.status === "em validacao" ? "pendente_validacao" : "ativo",
      humanValidated: agreement.status !== "em validacao",
    },
    ...state.links.filter((item) => item.clientId !== form.clientId.value),
  ];
  saveState();
  render();
}

function statCard(label, value) {
  return `<article class="card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></article>`;
}

function alertCard(alert) {
  return `<div class="list-item risk-${riskClass(alert.severity)}"><div><strong>${escapeHtml(alert.title)}</strong><p class="muted">${escapeHtml(alert.description)}</p></div><span class="badge ${badgeClass(alert.severity)}">${alert.severity}</span></div>`;
}

function clientCard(client) {
  return `<div class="list-item">
    <div>
      <strong>${escapeHtml(client.legalName)}</strong>
      <p class="muted">${formatCnpj(client.cnpj)} · ${escapeHtml(client.city)}/${escapeHtml(client.state)} · CNAE ${escapeHtml(client.mainCnae)}</p>
      <p class="muted">Patronal: ${escapeHtml(client.employerUnion || "")} ${client.employerUnionCnpj ? `(${formatCnpj(client.employerUnionCnpj)})` : ""} · Laboral: ${escapeHtml(client.laborUnion || "")} ${client.laborUnionCnpj ? `(${formatCnpj(client.laborUnionCnpj)})` : ""}</p>
    </div>
    <div class="actions">
      <span class="badge info">${client.employeeCount} empregados</span>
      <button class="button secondary" data-edit-client="${client.id}">Editar</button>
      <button class="button danger" data-remove-client="${client.id}">Remover</button>
    </div>
  </div>`;
}

function agreementCard(agreement) {
  const related = state.clauses.filter((clause) => clause.agreementId === agreement.id);
  return `<article class="card">
    <div class="list-item">
      <div>
        <h2>${escapeHtml(agreement.title)}</h2>
        <p class="muted">${escapeHtml(agreement.city)}/${escapeHtml(agreement.state)} · ${formatDate(agreement.startsAt)} a ${formatDate(agreement.endsAt)}</p>
      </div>
      <div class="actions">
        ${statusBadge(agreement.status)}
        ${agreement.status === "em validacao" ? `<button class="button" data-confirm-agreement="${agreement.id}">Confirmar revisao</button><button class="button danger" data-reject-agreement="${agreement.id}">Recusar revisao</button>` : ""}
      </div>
    </div>
    <p class="muted" style="margin-top:14px">${escapeHtml(agreement.executiveSummary || "")}</p>
    <div class="clause-grid">${related.map(clauseCard).join("")}</div>
  </article>`;
}

function clauseCard(clause) {
  const missing = Number(clause.confidence) === 0;
  return `<div class="card clause ${missing ? "missing" : ""}">
    <div class="actions" style="justify-content:space-between">
      <strong>${escapeHtml(clause.title)}</strong>
      <span class="badge ${missing ? "danger" : clause.requiresReview ? "warn" : "ok"}">${Math.round(clause.confidence * 100)}%</span>
    </div>
    <p class="${missing ? "" : "muted"}" style="margin-top:10px">${escapeHtml(clause.summary)}</p>
  </div>`;
}

function linkCard(link) {
  const client = state.clients.find((item) => item.id === link.clientId);
  const agreement = state.agreements.find((item) => item.id === link.agreementId);
  return `<div class="list-item"><div><strong>${escapeHtml(client?.legalName || "")}</strong><p class="muted">${escapeHtml(agreement?.title || "")}</p></div>${link.humanValidated ? `<span class="badge ok">validado</span>` : `<span class="badge warn">pendente</span>`}</div>`;
}

function mapRows() {
  return state.clients.map((client) => {
    const link = state.links.find((item) => item.clientId === client.id);
    const agreement = state.agreements.find((item) => item.id === link?.agreementId);
    const risk = !agreement ? "alto" : !link?.humanValidated || agreement.status === "em validacao" ? "medio" : "baixo";
    return { client, agreement, status: agreement?.status || "sem vinculo", risk };
  });
}

function mapTable(rows) {
  return `<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Cidade</th><th>CNAE</th><th>Convencao</th><th>Status</th><th>Risco</th></tr></thead><tbody>${rows.map((row) => `<tr class="risk-${riskClass(row.risk)}"><td><strong>${escapeHtml(row.client.legalName)}</strong></td><td>${escapeHtml(row.client.city)}/${escapeHtml(row.client.state)}</td><td>${escapeHtml(row.client.mainCnae)}</td><td>${escapeHtml(row.agreement?.title || "Sem vinculo")}</td><td>${statusBadge(row.status)}</td><td><span class="badge ${badgeClass(row.risk)}">${row.risk}</span></td></tr>`).join("")}</tbody></table></div>`;
}

function buildStats() {
  const unlinked = state.clients.filter((client) => !state.links.some((link) => link.clientId === client.id && link.humanValidated)).length;
  return {
    total: state.agreements.length,
    active: state.agreements.filter((item) => item.status === "vigente").length,
    expired: state.agreements.filter((item) => item.status === "vencida").length,
    expiringSoon: state.agreements.filter((item) => {
      const days = daysUntil(item.endsAt);
      return days !== null && days >= 0 && days <= 90;
    }).length,
    unlinkedClients: unlinked,
    riskyClients: unlinked + state.agreements.filter((item) => item.status === "em validacao").length,
  };
}

function field(name, label, value = "", className = "", type = "text") {
  return `<label class="field ${className}">${label}<input name="${name}" type="${type}" value="${escapeAttribute(value)}"></label>`;
}

function statusBadge(status) {
  const cls = status === "vigente" || status === "ativo" ? "ok" : status === "vencida" || status === "sem vinculo" ? "danger" : "warn";
  return `<span class="badge ${cls}">${escapeHtml(status)}</span>`;
}

function badgeClass(risk) {
  return risk === "baixo" ? "ok" : risk === "medio" ? "warn" : "danger";
}

function riskClass(risk) {
  return risk === "baixo" ? "low" : risk === "medio" ? "medium" : "high";
}

function daysUntil(date) {
  if (!date) return null;
  return Math.ceil((new Date(`${date}T00:00:00`).getTime() - Date.now()) / 86400000);
}

function formatDate(date) {
  if (!date) return "Nao informado";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(date));
}

function formatCnpj(value = "") {
  const digits = String(value).replace(/\D/g, "").slice(0, 14);
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") || value;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function escapeAttribute(value = "") {
  return escapeHtml(value);
}

render();
