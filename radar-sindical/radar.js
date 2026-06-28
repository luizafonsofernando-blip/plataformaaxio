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
  "vigencia",
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
let dashboardFilter = "total";
let selectedAgreementId = null;
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
      ${statCard("Total CCTs", stats.total, "total")}
      ${statCard("Vigentes", stats.active, "active")}
      ${statCard("Vencidas", stats.expired, "expired")}
      ${statCard("Prox. vencimento", stats.expiringSoon, "expiringSoon")}
      ${statCard("Sem vinculo", stats.unlinkedClients, "unlinkedClients")}
      ${statCard("Clientes em risco", stats.riskyClients, "riskyClients")}
    </section>
    <section class="grid two-cols">
      <article class="card">
        <h2>Indicativo selecionado</h2>
        ${dashboardIndicatorPanel()}
      </article>
      <article class="card">
        <h2>Instrumentos vencendo em 90 dias</h2>
        ${expiringSoonPanel()}
      </article>
    </section>
    <section class="card">
      <h2>Indicativos totais</h2>
      ${selectableTotalsPanel(stats)}
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
  if (!selectedAgreementId || !state.agreements.some((item) => item.id === selectedAgreementId)) {
    selectedAgreementId = state.agreements[0]?.id || null;
  }
  const selected = state.agreements.find((item) => item.id === selectedAgreementId);
  return `
    <section class="grid two-cols agreements-layout">
      <article class="card">
        <h2>Convenções cadastradas</h2>
        <p class="muted">A lista exibe a categoria. Clique para abrir a revisão completa.</p>
        <div class="list" style="margin-top:16px">
          ${state.agreements.length ? state.agreements.map(agreementSummaryCard).join("") : `<div class="empty-state">Nenhuma convenção importada. Use Upload Mediador para importar uma CCT.</div>`}
        </div>
      </article>
      ${selected ? agreementDetailCard(selected) : `<article class="card"><h2>Detalhes da convenção</h2><p class="muted">Selecione uma convenção para revisar os dados extraídos.</p></article>`}
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
  document.querySelectorAll("[data-dashboard-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      dashboardFilter = button.dataset.dashboardFilter;
      render();
    });
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        dashboardFilter = button.dataset.dashboardFilter;
        render();
      }
    });
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
  document.querySelectorAll("[data-select-agreement]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedAgreementId = button.dataset.selectAgreement;
      render();
    });
  });
  document.getElementById("agreementForm")?.addEventListener("submit", saveAgreementReview);
  document.querySelectorAll("[data-confirm-agreement]").forEach((button) => {
    button.addEventListener("click", () => {
      const form = document.getElementById("agreementForm");
      if (form) persistAgreementForm(form);
      confirmAgreement(button.dataset.confirmAgreement);
    });
  });
  document.querySelectorAll("[data-reject-agreement]").forEach((button) => {
    button.addEventListener("click", () => rejectAgreement(button.dataset.rejectAgreement));
  });
  document.querySelectorAll("[data-delete-agreement]").forEach((button) => {
    button.addEventListener("click", () => deleteAgreement(button.dataset.deleteAgreement));
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

function saveAgreementReview(event) {
  event.preventDefault();
  persistAgreementForm(event.currentTarget);
  saveState();
  render();
}

function persistAgreementForm(form) {
  const id = form.elements.agreementId.value;
  state.agreements = state.agreements.map((item) => item.id === id ? {
    ...item,
    title: form.elements.title.value,
    category: form.elements.category.value,
    city: form.elements.city.value,
    state: form.elements.state.value.toUpperCase(),
    baseDate: form.elements.baseDate.value,
    startsAt: form.elements.startsAt.value,
    endsAt: form.elements.endsAt.value,
    employerUnion: form.elements.employerUnion.value,
    employerUnionCnpj: form.elements.employerUnionCnpj.value,
    laborUnion: form.elements.laborUnion.value,
    laborUnionCnpj: form.elements.laborUnionCnpj.value,
    mteRegistrationNumber: form.elements.mteRegistrationNumber.value,
    requestNumber: form.elements.requestNumber.value,
    processNumber: form.elements.processNumber.value,
    territorialCoverage: form.elements.territorialCoverage.value,
    executiveSummary: form.elements.executiveSummary.value,
  } : item);

  state.clauses = state.clauses.map((clause) => clause.agreementId === id ? {
    ...clause,
    title: form.elements[`clauseTitle-${clause.id}`]?.value || clause.title,
    summary: form.elements[`clauseSummary-${clause.id}`]?.value || clause.summary,
    rawExcerpt: form.elements[`clauseExcerpt-${clause.id}`]?.value || clause.rawExcerpt,
    confidence: Math.max(0, Math.min(1, Number(form.elements[`clauseConfidence-${clause.id}`]?.value || 0) / 100)),
    requiresReview: true,
  } : clause);
}

function confirmAgreement(id) {
  state.agreements = state.agreements.map((item) => item.id === id ? { ...item, status: "vigente", validatedAt: new Date().toISOString() } : item);
  state.clauses = state.clauses.map((item) => item.agreementId === id ? { ...item, requiresReview: false, confidence: Math.max(item.confidence, 0.8) } : item);
  saveState();
  render();
}

function rejectAgreement(id) {
  if (!confirm("Recusar esta revisao e remover a convencao da lista?")) return;
  removeAgreement(id);
}

function deleteAgreement(id) {
  if (!confirm("Excluir esta convencao e seus vinculos da base?")) return;
  removeAgreement(id);
}

function removeAgreement(id) {
  state.agreements = state.agreements.filter((item) => item.id !== id);
  state.clauses = state.clauses.filter((item) => item.agreementId !== id);
  state.links = state.links.filter((item) => item.agreementId !== id);
  if (selectedAgreementId === id) selectedAgreementId = state.agreements[0]?.id || null;
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

function statCard(label, value, filter) {
  return `<button class="card stat-card ${dashboardFilter === filter ? "active" : ""}" data-dashboard-filter="${filter}" type="button"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></button>`;
}

function dashboardIndicatorPanel() {
  const data = dashboardFilterData()[dashboardFilter] || dashboardFilterData().total;
  return `<div class="indicator-panel">
    <p class="muted">${escapeHtml(data.description)}</p>
    <div class="list">${data.items.length ? data.items.map(indicatorItem).join("") : `<div class="empty-state">Nenhum registro encontrado para este indicador.</div>`}</div>
  </div>`;
}

function dashboardFilterData() {
  const rows = mapRows();
  const expiring = expiringAgreements();
  return {
    total: {
      description: "Todas as convencoes coletivas cadastradas ou importadas no Radar.",
      items: state.agreements.map((agreement) => agreementIndicator(agreement)),
    },
    active: {
      description: "Convencoes com status vigente.",
      items: state.agreements.filter((agreement) => agreement.status === "vigente").map((agreement) => agreementIndicator(agreement)),
    },
    expired: {
      description: "Convencoes vencidas que exigem revisao antes de novas rotinas trabalhistas.",
      items: state.agreements.filter((agreement) => agreement.status === "vencida").map((agreement) => agreementIndicator(agreement)),
    },
    expiringSoon: {
      description: "Convencoes com vigencia final nos proximos 90 dias.",
      items: expiring.map((agreement) => agreementIndicator(agreement, `${daysUntil(agreement.endsAt)} dias restantes`)),
    },
    unlinkedClients: {
      description: "Clientes sem convencao validada vinculada.",
      items: state.clients
        .filter((client) => !state.links.some((link) => link.clientId === client.id && link.humanValidated))
        .map((client) => clientIndicator(client, "Sem convencao validada")),
    },
    riskyClients: {
      description: "Clientes com risco medio ou alto por ausencia de vinculo, validacao pendente ou CCT vencida.",
      items: rows.filter((row) => row.risk !== "baixo").map((row) => clientIndicator(row.client, `Risco ${row.risk}`)),
    },
  };
}

function indicatorItem(item) {
  return `<div class="list-item compact">
    <div>
      <strong>${escapeHtml(item.title)}</strong>
      <p class="muted">${escapeHtml(item.description)}</p>
    </div>
    ${item.badge ? `<span class="badge ${item.badgeClass || "info"}">${escapeHtml(item.badge)}</span>` : ""}
  </div>`;
}

function agreementIndicator(agreement, detail = "") {
  const days = daysUntil(agreement.endsAt);
  return {
    title: agreement.title,
    description: `${agreement.city}/${agreement.state} | Vigencia ate ${formatDate(agreement.endsAt)}${detail ? ` | ${detail}` : ""}`,
    badge: agreement.status,
    badgeClass: badgeClass(agreement.status === "vigente" ? "baixo" : agreement.status === "vencida" ? "alto" : "medio"),
    days,
  };
}

function clientIndicator(client, detail) {
  return {
    title: client.legalName,
    description: `${client.city}/${client.state} | CNAE ${client.mainCnae} | ${detail}`,
    badge: detail.toLowerCase().includes("alto") ? "alto" : detail.toLowerCase().includes("medio") ? "medio" : "revisar",
    badgeClass: detail.toLowerCase().includes("alto") || detail.toLowerCase().includes("sem") ? "danger" : "warn",
  };
}

function expiringSoonPanel() {
  const expiring = expiringAgreements();
  if (!expiring.length) {
    return `<div class="empty-state selectable-empty ${dashboardFilter === "expiringSoon" ? "active" : ""}" data-dashboard-filter="expiringSoon" role="button" tabindex="0">Nenhum instrumento coletivo vence nos proximos 90 dias.</div>`;
  }
  return `<div class="list selectable-panel ${dashboardFilter === "expiringSoon" ? "active" : ""}" data-dashboard-filter="expiringSoon" role="button" tabindex="0">${expiring.map((agreement) => indicatorItem(agreementIndicator(agreement, `${daysUntil(agreement.endsAt)} dias restantes`))).join("")}</div>`;
}

function totalsPanel(stats) {
  const items = [
    ["CCTs ao total", stats.total, "Total geral de convencoes cadastradas/importadas."],
    ["CCTs vigentes", stats.active, "Convenções confirmadas como vigentes."],
    ["CCTs vencidas", stats.expired, "Convenções com status vencida."],
    ["Clientes sem convenção", stats.unlinkedClients, "Clientes sem vínculo validado com CCT."],
  ];
  return `<div class="summary-grid">${items.map(([label, value, description]) => `<div class="summary-item"><strong>${value}</strong><span>${label}</span><small>${description}</small></div>`).join("")}</div>`;
}

function selectableTotalsPanel(stats) {
  const items = [
    ["CCTs ao total", stats.total, "Total geral de convencoes cadastradas/importadas.", "total"],
    ["CCTs vigentes", stats.active, "Convencoes confirmadas como vigentes.", "active"],
    ["CCTs vencidas", stats.expired, "Convencoes com status vencida.", "expired"],
    ["Clientes sem convencao", stats.unlinkedClients, "Clientes sem vinculo validado com CCT.", "unlinkedClients"],
  ];
  return `<div class="summary-grid">${items.map(([label, value, description, filter]) => `<button class="summary-item ${dashboardFilter === filter ? "active" : ""}" data-dashboard-filter="${filter}" type="button"><strong>${value}</strong><span>${label}</span><small>${description}</small></button>`).join("")}</div>`;
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

function agreementDetailCard(agreement) {
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

function agreementSummaryCard(agreement) {
  const active = selectedAgreementId === agreement.id ? "active" : "";
  return `<button class="agreement-summary ${active}" data-select-agreement="${agreement.id}" type="button">
    <span>${escapeHtml(agreement.category || "Categoria a revisar")}</span>
    ${statusBadge(agreement.status)}
  </button>`;
}

function agreementCard(agreement) {
  const related = state.clauses.filter((clause) => clause.agreementId === agreement.id);
  return `<article class="card">
    <form id="agreementForm" class="grid">
      <input type="hidden" name="agreementId" value="${agreement.id}">
      <div class="list-item">
        <div>
          <h2>${escapeHtml(agreement.category || agreement.title)}</h2>
          <p class="muted">${escapeHtml(agreement.city)}/${escapeHtml(agreement.state)} | Vigencia ${formatDate(agreement.startsAt)} a ${formatDate(agreement.endsAt)}</p>
        </div>
        <div class="actions">
          ${statusBadge(agreement.status)}
          <button class="button secondary" type="submit">Salvar edicoes</button>
          ${agreement.status === "em validacao" ? `<button class="button" type="button" data-confirm-agreement="${agreement.id}">Confirmar revisao</button><button class="button danger" type="button" data-reject-agreement="${agreement.id}">Recusar revisao</button>` : ""}
          <button class="button danger" type="button" data-delete-agreement="${agreement.id}">Excluir</button>
        </div>
      </div>
      <div class="form-grid agreement-fields">
        ${field("title", "Titulo", agreement.title, "full")}
        ${field("category", "Categoria", agreement.category)}
        ${field("city", "Cidade", agreement.city)}
        ${field("state", "UF", agreement.state)}
        ${field("baseDate", "Data-base", agreement.baseDate, "", "date")}
        ${field("startsAt", "Vigencia inicial", agreement.startsAt, "", "date")}
        ${field("endsAt", "Vigencia final", agreement.endsAt, "", "date")}
        ${field("mteRegistrationNumber", "Registro MTE", agreement.mteRegistrationNumber)}
        ${field("requestNumber", "Numero da solicitacao", agreement.requestNumber)}
        ${field("processNumber", "Numero do processo", agreement.processNumber)}
        ${field("employerUnion", "Sindicato patronal", agreement.employerUnion)}
        ${field("employerUnionCnpj", "CNPJ sindicato patronal", agreement.employerUnionCnpj)}
        ${field("laborUnion", "Sindicato laboral", agreement.laborUnion)}
        ${field("laborUnionCnpj", "CNPJ sindicato laboral", agreement.laborUnionCnpj)}
        ${field("territorialCoverage", "Abrangencia territorial", agreement.territorialCoverage, "full")}
        ${textareaField("executiveSummary", "Resumo executivo", agreement.executiveSummary, "full")}
      </div>
      <h3>Campos extraidos para revisao</h3>
      <div class="clause-grid">${related.map(clauseReviewCard).join("")}</div>
    </form>
  </article>`;
}

function clauseReviewCard(clause) {
  const missing = Number(clause.confidence) === 0;
  const confidence = Math.round(Number(clause.confidence || 0) * 100);
  return `<div class="card clause ${missing ? "missing" : ""}">
    <div class="actions" style="justify-content:space-between">
      <label class="field clause-title">Campo<input name="clauseTitle-${clause.id}" value="${escapeAttribute(clause.title)}"></label>
      <label class="field confidence-field">Confianca<input name="clauseConfidence-${clause.id}" type="number" min="0" max="100" value="${confidence}"></label>
    </div>
    <label class="field">Resumo<textarea name="clauseSummary-${clause.id}">${escapeHtml(clause.summary)}</textarea></label>
    <label class="field">Trecho identificado<textarea name="clauseExcerpt-${clause.id}">${escapeHtml(clause.rawExcerpt || "")}</textarea></label>
    <span class="badge ${missing ? "danger" : clause.requiresReview ? "warn" : "ok"}">${confidence}%</span>
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
    const risk = !agreement || agreement.status === "vencida" ? "alto" : !link?.humanValidated || agreement.status === "em validacao" ? "medio" : "baixo";
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

function expiringAgreements() {
  return state.agreements
    .filter((item) => {
      const days = daysUntil(item.endsAt);
      return days !== null && days >= 0 && days <= 90;
    })
    .sort((a, b) => daysUntil(a.endsAt) - daysUntil(b.endsAt));
}

function field(name, label, value = "", className = "", type = "text") {
  return `<label class="field ${className}">${label}<input name="${name}" type="${type}" value="${escapeAttribute(value)}"></label>`;
}

function textareaField(name, label, value = "", className = "") {
  return `<label class="field ${className}">${label}<textarea name="${name}">${escapeHtml(value)}</textarea></label>`;
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
