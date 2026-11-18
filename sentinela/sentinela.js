(function () {
  "use strict";

  const state = {
    organization: null,
    membership: null,
    user: null,
    companies: [],
    occurrences: [],
    tasks: [],
    documents: [],
    notifications: [],
    integrations: [],
    comments: [],
    snapshots: [],
    findings: [],
    connectorJobs: [],
    rules: [],
    featureFlags: [],
    auditEvents: [],
    assistedIntakes: [],
    permissions: [],
    compliance: { categories: [], profiles: [], cases: [], outreach: [], snapshots: [], imports: [], events: [] },
    generatedAt: null,
    view: "dashboard",
  };
  const viewTitles = {
    dashboard: ["Operação fiscal", "Visão geral"],
    today: ["Prioridade diária", "O que precisa ser feito hoje"],
    companies: ["Carteira", "Empresas"],
    occurrences: ["Exceções", "Ocorrências"],
    tasks: ["Workflow", "Tarefas"],
    documents: ["Evidências", "Documentos"],
    integrations: ["Connector Hub", "Integrações"],
    compliance: ["Monitoramento e regularidade", "Compliance"],
  };
  const labels = {
    regular: "Regular", attention: "Atenção", relevant: "Relevante", critical: "Crítico",
    not_checked: "Não consultado", unavailable: "Indisponível", stale: "Desatualizado", unknown: "Sem informação",
    new: "Nova", analysis: "Em análise", waiting_client: "Aguardando cliente", waiting_agency: "Aguardando órgão",
    execution: "Em execução", resolved: "Resolvida", archived: "Arquivada", open: "Aberta",
    in_progress: "Em andamento", waiting: "Aguardando", done: "Concluída", cancelled: "Cancelada",
    low: "Baixa", normal: "Normal", high: "Alta", operational: "Operacional", assisted: "Operação assistida", unstable: "Instável",
    configuration: "Configuração pendente", unsupported: "Não suportada", development: "Em desenvolvimento",
    certificate: "Certidão", guide: "Guia", receipt: "Recibo", declaration: "Declaração", evidence: "Comprovante",
    viewer: "Usuário", analyst: "Analista", supervisor: "Supervisor", admin: "Administrador",
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const label = (value) => labels[value] || String(value || "Não informado");
  const companyById = (id) => state.companies.find((item) => item.id === id);
  const session = () => window.LuceModuleSession?.get?.();
  const isActiveTask = (task) => !["done", "cancelled"].includes(task.status);
  const isActiveOccurrence = (item) => !["resolved", "archived"].includes(item.status);

  function formatCnpj(value) {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 14);
    return digits.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
  }

  function formatDate(value, withTime = false) {
    if (!value) return "Não informado";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T12:00:00`) : new Date(value);
    if (Number.isNaN(date.getTime())) return "Não informado";
    return new Intl.DateTimeFormat("pt-BR", withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" }).format(date);
  }

  function relativeDate(value) {
    if (!value) return "Sem prazo";
    const date = new Date(value);
    const diff = Math.ceil((date.getTime() - Date.now()) / 86400000);
    if (diff < 0) return `${Math.abs(diff)} dia(s) em atraso`;
    if (diff === 0) return "Hoje";
    if (diff === 1) return "Amanhã";
    return `${diff} dias`;
  }

  function initials(name) {
    return String(name || "LU").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  }

  function badge(value) {
    return `<span class="badge ${escapeHtml(value || "unknown")}">${escapeHtml(label(value))}</span>`;
  }

  function emptyRow(columns, message) {
    return `<tr><td class="empty-state" colspan="${columns}">${escapeHtml(message)}</td></tr>`;
  }

  function toast(message, type = "success") {
    const item = document.createElement("div");
    item.className = `toast ${type}`;
    item.textContent = message;
    $("#toastRegion").append(item);
    setTimeout(() => item.remove(), 3600);
  }

  async function api(method = "GET", body, retried = false) {
    let activeSession = session();
    if (!activeSession?.access_token) throw Object.assign(new Error("Sessão expirada."), { code: "invalid_session" });
    const response = await fetch("/api/sentinela", {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${activeSession.access_token}` },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && !retried && window.LuceModuleSession?.refresh) {
      activeSession = await window.LuceModuleSession.refresh().catch(() => null);
      if (activeSession?.access_token) return api(method, body, true);
    }
    if (!response.ok) throw Object.assign(new Error(data.error || "Não foi possível concluir a operação."), { status: response.status, code: data.code });
    return data;
  }

  async function load() {
    $("#loadingState").classList.remove("hidden");
    $("#errorState").classList.add("hidden");
    $$(".view").forEach((view) => view.classList.remove("active"));
    try {
      Object.assign(state, await api());
      $("#loadingState").classList.add("hidden");
      showView(state.view);
      renderAll();
    } catch (error) {
      $("#loadingState").classList.add("hidden");
      $("#errorState").classList.remove("hidden");
      $("#errorMessage").textContent = error.message;
    }
  }

  function showView(viewName) {
    state.view = viewTitles[viewName] ? viewName : "dashboard";
    $$(".view").forEach((view) => view.classList.toggle("active", view.dataset.page === state.view));
    $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === state.view));
    const [eyebrow, title] = viewTitles[state.view];
    $("#pageEyebrow").textContent = eyebrow;
    $("#pageTitle").textContent = title;
    document.body.classList.remove("menu-open");
  }

  function renderAll() {
    renderHeader();
    renderDashboard();
    renderCompanies();
    renderOccurrences();
    renderTasks();
    renderDocuments();
    renderIntegrations();
    window.SentinelaAssisted?.render?.(state);
    window.SentinelaCompliance?.render?.(state);
    renderNotifications();
    populateCompanySelects();
    applyPermissions();
  }

  function can(permission) {
    return Array.isArray(state.permissions) && state.permissions.includes(permission);
  }

  function applyPermissions() {
    $$('[data-permission]').forEach((element) => { element.hidden = !can(element.dataset.permission); });
    $$('[data-open]').forEach((element) => {
      const required = { company: "companies.write", import: "companies.import", occurrence: "workflow.write", task: "workflow.write", comment: "workflow.write", document: "documents.write" }[element.dataset.open];
      if (required) element.hidden = !can(required);
    });
    $$('[data-update]').forEach((element) => { element.hidden = !can("workflow.write"); });
    $$('[data-delete]').forEach((element) => {
      const required = element.dataset.delete === "companies" ? "companies.delete" : element.dataset.delete === "documents" ? "documents.delete" : "workflow.delete";
      element.hidden = !can(required);
    });
  }

  function renderHeader() {
    const name = state.user?.name || state.user?.email || "Usuário Luce";
    $("#userName").textContent = name;
    $("#userInitials").textContent = initials(name);
    $("#userRole").textContent = label(state.membership?.role || "analyst");
    const openTasks = state.tasks.filter(isActiveTask);
    const activeOccurrences = state.occurrences.filter(isActiveOccurrence);
    $("#navTodayCount").textContent = String(openTasks.length);
    $("#navOccurrenceCount").textContent = String(activeOccurrences.length);
    const activeCompliance = (state.compliance?.cases || []).filter((item) => !["resolved", "closed"].includes(item.status)).length;
    $("#navComplianceCount").textContent = String(activeCompliance);
    const unread = state.notifications.filter((item) => !item.read_at).length;
    $("#notificationCount").textContent = String(unread);
    $("#notificationButton").classList.toggle("has-items", unread > 0);
    $("#freshness").textContent = `Dados carregados em ${formatDate(state.generatedAt, true)}`;
  }

  function statusCount(status) {
    return state.companies.filter((item) => item.fiscal_status === status).length;
  }

  function renderDashboard() {
    $("#metricCompanies").textContent = String(state.companies.length);
    $("#metricRegular").textContent = String(statusCount("regular"));
    $("#metricAttention").textContent = String(statusCount("attention") + statusCount("relevant"));
    $("#metricCritical").textContent = String(statusCount("critical"));
    $("#metricUnchecked").textContent = String(statusCount("not_checked") + statusCount("unavailable") + statusCount("stale"));

    const priorityTasks = state.tasks.filter(isActiveTask).sort((a, b) => {
      const weight = { critical: 0, high: 1, normal: 2, low: 3 };
      return (weight[a.priority] ?? 4) - (weight[b.priority] ?? 4) || String(a.due_at || "9999").localeCompare(String(b.due_at || "9999"));
    }).slice(0, 7);
    $("#dashboardTaskRows").innerHTML = priorityTasks.length ? priorityTasks.map((task) => {
      const company = companyById(task.company_id);
      return `<tr><td><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(company?.legal_name || "Sem empresa vinculada")}</small></td><td>${badge(task.priority)}</td><td>${escapeHtml(relativeDate(task.due_at))}</td><td>${escapeHtml(task.assigned_name || "Não atribuído")}</td><td>${badge(task.status)}</td></tr>`;
    }).join("") : emptyRow(5, "Nenhuma tarefa pendente. O fluxo está em dia.");

    const statuses = ["regular", "attention", "relevant", "critical", "not_checked"];
    const total = Math.max(1, state.companies.length);
    $("#riskBars").innerHTML = statuses.map((status) => {
      const count = statusCount(status);
      return `<div class="risk-row"><span>${escapeHtml(label(status))}</span><div class="risk-track"><div class="risk-fill ${status}" style="width:${Math.round(count / total * 100)}%"></div></div><strong>${count}</strong></div>`;
    }).join("");

    $("#integrationSummary").innerHTML = state.integrations.length ? state.integrations.map((item) => `<div class="summary-row"><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(label(item.environment))}</small></div>${badge(item.status)}</div>`).join("") : `<div class="empty-state">Matriz de integrações ainda não configurada.</div>`;
    const recent = state.occurrences.slice(0, 5);
    $("#recentOccurrences").innerHTML = recent.length ? recent.map((item) => `<div class="compact-item"><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(companyById(item.company_id)?.legal_name || "Sem empresa")}</small></div>${badge(item.severity)}</div>`).join("") : `<div class="empty-state">Nenhuma ocorrência registrada.</div>`;
  }

  function filteredCompanies() {
    const query = String($("#companySearch")?.value || "").trim().toLocaleLowerCase("pt-BR");
    const status = $("#companyStatus")?.value || "all";
    return state.companies.filter((company) => {
      const matchesQuery = !query || [company.legal_name, company.trade_name, company.cnpj, company.city].join(" ").toLocaleLowerCase("pt-BR").includes(query);
      return matchesQuery && (status === "all" || company.fiscal_status === status);
    });
  }

  function renderCompanies() {
    const companies = filteredCompanies();
    $("#companyRows").innerHTML = companies.length ? companies.map((company) => `<tr>
      <td><strong>${escapeHtml(company.legal_name)}</strong><small>${escapeHtml(company.trade_name || "Sem nome fantasia")}</small></td>
      <td>${escapeHtml(formatCnpj(company.cnpj))}</td><td>${escapeHtml(company.tax_regime || "Não informado")}</td>
      <td>${escapeHtml([company.city, company.state].filter(Boolean).join("/") || "Não informado")}</td><td>${badge(company.fiscal_status)}</td>
      <td>${escapeHtml(company.last_checked_at ? formatDate(company.last_checked_at, true) : "Não consultado")}</td>
      <td><div class="row-actions"><button class="row-action" data-company-detail="${company.id}" type="button">Abrir ficha</button><button class="row-action" data-create-occurrence="${company.id}" type="button">Ocorrência</button><button class="row-action danger" data-delete="companies" data-id="${company.id}" type="button">Excluir</button></div></td>
    </tr>`).join("") : emptyRow(7, "Nenhuma empresa corresponde aos filtros.");
  }

  function filteredOccurrences() {
    const severity = $("#occurrenceSeverity")?.value || "all";
    const status = $("#occurrenceStatus")?.value || "active";
    return state.occurrences.filter((item) => (severity === "all" || item.severity === severity) && (status === "all" || (status === "active" ? isActiveOccurrence(item) : item.status === status)));
  }

  function renderOccurrences() {
    const occurrences = filteredOccurrences();
    $("#occurrenceCards").innerHTML = occurrences.length ? occurrences.map((item) => {
      const comments = state.comments.filter((comment) => comment.occurrence_id === item.id);
      return `<article class="occurrence-card">
      <span class="severity-line ${escapeHtml(item.severity)}"></span><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description || "Sem descrição adicional.")}</p>
      <div class="occurrence-meta"><span>Empresa: ${escapeHtml(companyById(item.company_id)?.legal_name || "Não vinculada")}</span><span>Origem: ${escapeHtml(item.source)}</span><span>Prazo: ${escapeHtml(relativeDate(item.due_at))}</span><span>Responsável: ${escapeHtml(item.assigned_name || "Não atribuído")}</span>${badge(item.severity)}${badge(item.status)}</div>${comments.length ? `<div class="comment-list">${comments.slice(0, 3).map((comment) => `<p><strong>${escapeHtml(comment.created_by_name || "Usuário")}</strong> ${escapeHtml(comment.body)}</p>`).join("")}</div>` : ""}</div>
      <div class="row-actions"><button class="row-action" data-comment="${item.id}" type="button">Comentar</button>${isActiveOccurrence(item) ? `<button class="row-action" data-update="occurrences" data-id="${item.id}" data-status="resolved" type="button">Resolver</button>` : ""}<button class="row-action danger" data-delete="occurrences" data-id="${item.id}" type="button">Excluir</button></div>
    </article>`; }).join("") : `<div class="panel empty-state">Nenhuma ocorrência corresponde aos filtros.</div>`;
  }

  function filteredTodayTasks() {
    const priority = $("#todayPriority")?.value || "all";
    const status = $("#todayStatus")?.value || "active";
    return state.tasks.filter((task) => (priority === "all" || task.priority === priority) && (status === "all" || (status === "active" ? isActiveTask(task) : task.status === status)));
  }

  function renderToday() {
    const tasks = filteredTodayTasks();
    $("#todayRows").innerHTML = tasks.length ? tasks.map((task) => `<tr><td><strong>${escapeHtml(task.title)}</strong></td><td>${escapeHtml(companyById(task.company_id)?.legal_name || "Não vinculada")}</td><td>${badge(task.priority)}</td><td>${escapeHtml(relativeDate(task.due_at))}</td><td>${escapeHtml(task.assigned_name || "Não atribuído")}</td><td>${badge(task.status)}</td><td><div class="row-actions">${isActiveTask(task) ? `<button class="row-action" data-update="tasks" data-id="${task.id}" data-status="done" type="button">Concluir</button>` : ""}</div></td></tr>`).join("") : emptyRow(7, "Nenhuma tarefa corresponde aos filtros.");
  }

  function renderTasks() {
    renderToday();
    const columns = [
      ["open", "Abertas"], ["in_progress", "Em andamento"], ["waiting", "Aguardando"], ["done", "Concluídas"],
    ];
    $("#taskBoard").innerHTML = columns.map(([status, title]) => {
      const items = state.tasks.filter((task) => task.status === status);
      return `<section class="task-column"><div class="task-column-head"><strong>${title}</strong><span>${items.length}</span></div>${items.length ? items.map((task) => `<article class="task-card"><h3>${escapeHtml(task.title)}</h3><div>${badge(task.priority)}</div><p>${escapeHtml(companyById(task.company_id)?.legal_name || "Sem empresa")} · ${escapeHtml(relativeDate(task.due_at))}</p><div class="row-actions">${status !== "done" ? `<button class="row-action" data-update="tasks" data-id="${task.id}" data-status="${status === "open" ? "in_progress" : "done"}" type="button">${status === "open" ? "Iniciar" : "Concluir"}</button>` : ""}<button class="row-action danger" data-delete="tasks" data-id="${task.id}" type="button">Excluir</button></div></article>`).join("") : `<div class="empty-state">Sem tarefas</div>`}</section>`;
    }).join("");
  }

  function renderDocuments() {
    $("#documentRows").innerHTML = state.documents.length ? state.documents.map((document) => `<tr><td><strong>${escapeHtml(document.name)}</strong></td><td>${escapeHtml(companyById(document.company_id)?.legal_name || "Não vinculada")}</td><td>${escapeHtml(label(document.category))}</td><td>${escapeHtml(document.source)}</td><td>${escapeHtml(formatDate(document.issued_at))}</td><td>${escapeHtml(formatDate(document.expires_at))}</td><td><div class="row-actions">${document.storage_path ? `<button class="row-action" data-download-document="${document.id}" type="button">Baixar</button>` : ""}<button class="row-action danger" data-delete="documents" data-id="${document.id}" type="button">Excluir</button></div></td></tr>`).join("") : emptyRow(7, "Nenhum documento registrado.");
  }

  function renderIntegrations() {
    $("#integrationCards").innerHTML = state.integrations.length ? state.integrations.map((item) => {
      const assisted = item.metadata?.access_mode === "assisted";
      const source = assisted ? "Portal oficial · validação assistida" : item.metadata?.source_name || "Oficial pendente";
      const environment = assisted ? "Produção assistida" : label(item.environment);
      return `<article class="integration-card"><header><div><h3>${escapeHtml(item.name)}</h3><p>Código: ${escapeHtml(item.code)}</p></div>${badge(item.status)}</header><div class="integration-facts"><div><span>Ambiente</span><strong>${escapeHtml(environment)}</strong></div><div><span>Última validação</span><strong>${escapeHtml(item.last_checked_at ? formatDate(item.last_checked_at, true) : "Não realizada")}</strong></div><div><span>Fonte</span><strong>${escapeHtml(source)}</strong></div></div></article>`;
    }).join("") : `<div class="panel empty-state">Nenhuma integração cadastrada.</div>`;
    $("#connectorJobList").innerHTML = state.connectorJobs.length ? state.connectorJobs.slice(0, 10).map((job) => `<div class="compact-item"><div><strong>${escapeHtml(job.connector_code)} · ${escapeHtml(job.operation)}</strong><small>${escapeHtml(formatDate(job.created_at, true))} · ${job.attempt_count}/${job.max_attempts} tentativas</small></div>${badge(job.status)}</div>`).join("") : `<div class="empty-state">Nenhuma execução registrada. As integrações oficiais aguardam credenciais e homologação.</div>`;
    $("#ruleList").innerHTML = state.rules.length ? state.rules.map((rule) => `<div class="compact-item"><div><strong>${escapeHtml(rule.name)}</strong><small>${escapeHtml(rule.description || rule.event_type)}</small></div>${badge(rule.enabled ? rule.severity : "cancelled")}</div>`).join("") : `<div class="empty-state">Nenhuma regra configurada.</div>`;
  }

  function openCompanyDetail(companyId) {
    const company = companyById(companyId);
    if (!company) return;
    const snapshots = state.snapshots.filter((item) => item.company_id === companyId);
    const findings = state.findings.filter((item) => item.company_id === companyId);
    const occurrences = state.occurrences.filter((item) => item.company_id === companyId);
    const documents = state.documents.filter((item) => item.company_id === companyId);
    const events = state.auditEvents.filter((item) => item.entity_id === companyId || item.after_data?.company_id === companyId).slice(0, 12);
    $("#detailCompanyName").textContent = company.legal_name;
    $("#companyDetailContent").innerHTML = `<section class="detail-summary"><div><span>CNPJ</span><strong>${escapeHtml(formatCnpj(company.cnpj))}</strong></div><div><span>Regime</span><strong>${escapeHtml(company.tax_regime || "Não informado")}</strong></div><div><span>Responsável</span><strong>${escapeHtml(company.internal_owner || "Não atribuído")}</strong></div><div><span>Status geral</span>${badge(company.fiscal_status)}</div></section>
      <section class="detail-section"><h3>Regularidade e fontes oficiais</h3>${snapshots.length ? snapshots.map((item) => `<div class="detail-row"><div><strong>${escapeHtml(item.source_name)}</strong><small>Fonte: ${escapeHtml(item.source_code)} · ${escapeHtml(item.checked_at ? formatDate(item.checked_at, true) : "Não consultada")}</small></div>${badge(item.status)}</div>`).join("") : `<div class="empty-state">Não consultado. As integrações oficiais ainda não possuem credenciais homologadas.</div>`}</section>
      <section class="detail-section"><h3>Pendências interpretadas</h3>${findings.length ? findings.map((item) => `<div class="detail-row"><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.description || "Sem descrição")} · Origem: ${escapeHtml(item.source_code)}</small></div>${badge(item.severity)}</div>`).join("") : `<div class="empty-state">Nenhuma pendência oficial registrada.</div>`}</section>
      <section class="detail-section"><h3>Ocorrências e evidências</h3><p>${occurrences.length} ocorrência(s) · ${documents.length} documento(s)</p></section>
      <section class="detail-section"><h3>Histórico auditável</h3>${events.length ? events.map((item) => `<div class="detail-row"><div><strong>${escapeHtml(label(item.event_type))}</strong><small>${escapeHtml(formatDate(item.created_at, true))}</small></div></div>`).join("") : `<div class="empty-state">Nenhum evento adicional nesta empresa.</div>`}</section>`;
    $("#companyDetailDialog").showModal();
  }

  function renderNotifications() {
    $("#notificationList").innerHTML = state.notifications.length ? state.notifications.map((item) => `<article class="notification-item ${item.read_at ? "" : "unread"}" data-notification="${item.id}"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.message || "Sem detalhes adicionais.")}</p><p>${escapeHtml(formatDate(item.created_at, true))}</p></article>`).join("") : `<div class="empty-state">Nenhuma notificação.</div>`;
  }

  function populateCompanySelects() {
    $$('[data-company-select]').forEach((select) => {
      const selected = select.value;
      select.innerHTML = `<option value="">Sem empresa vinculada</option>${state.companies.map((company) => `<option value="${company.id}">${escapeHtml(company.legal_name)}</option>`).join("")}`;
      select.value = selected;
    });
  }

  function openDialog(type, defaults = {}) {
    const dialog = $(`#${type}Dialog`);
    const form = dialog?.querySelector("form");
    if (!dialog || !form) return;
    form.reset();
    Object.entries(defaults).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value || ""; });
    $(".form-message", form).textContent = "";
    setActionState($('button[type="submit"]', form), "idle");
    dialog.showModal();
  }

  function setActionState(button, state = "idle") {
    if (!button) return;
    button.classList.toggle("is-loading", state === "loading");
    button.classList.toggle("is-success", state === "success");
    button.classList.toggle("is-error", state === "error");
    if (state === "loading") button.setAttribute("aria-busy", "true");
    else button.removeAttribute("aria-busy");
  }

  function normalizedImportKey(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]/g, "");
  }

  function importValue(row, aliases) {
    const entries = Object.entries(row || {});
    const match = entries.find(([key]) => aliases.includes(normalizedImportKey(key)));
    return match ? String(match[1] ?? "").trim() : "";
  }

  async function readImportFile(file) {
    if (!file) throw new Error("Selecione uma planilha para importar.");
    if (!window.XLSX) throw new Error("O leitor de planilhas não foi carregado.");
    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer, { type: "array", cellDates: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = window.XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
    if (!rawRows.length) throw new Error("A planilha está vazia.");
    if (rawRows.length > 500) throw new Error("Importe no máximo 500 empresas por arquivo.");
    return rawRows.map((row) => ({
      cnpj: importValue(row, ["cnpj"]),
      legal_name: importValue(row, ["razaosocial", "nomeempresarial", "empresa"]),
      trade_name: importValue(row, ["nomefantasia", "fantasia"]),
      tax_regime: importValue(row, ["regimetributario", "regime"]),
      city: importValue(row, ["cidade", "municipio"]),
      state: importValue(row, ["uf", "estado"]).toUpperCase(),
      internal_owner: importValue(row, ["responsavel", "responsavelinterno"]),
      email: importValue(row, ["email", "correioeletronico"]),
      phone: importValue(row, ["telefone", "celular"]),
      state_registration: importValue(row, ["inscricaoestadual", "ie"]),
      municipal_registration: importValue(row, ["inscricaomunicipal", "im"]),
    }));
  }

  async function submitImport(form) {
    const submit = $('button[type="submit"]', form);
    const message = $(".form-message", form);
    const file = form.elements.file.files?.[0];
    submit.disabled = true;
    setActionState(submit, "loading");
    message.textContent = "Validando planilha...";
    try {
      const rows = await readImportFile(file);
      message.textContent = "Gravando empresas...";
      const result = await api("POST", { resource: "company_import", data: { filename: file.name, rows } });
      form.closest("dialog").close();
      toast(`${result.data.imported} empresa(s) importada(s).${result.data.rejected ? ` ${result.data.rejected} linha(s) rejeitada(s).` : ""}`, result.data.rejected ? "warning" : "success");
      await load();
    } catch (error) {
      message.textContent = error.message;
      setActionState(submit, "error");
    } finally {
      submit.disabled = false;
      if (!submit.classList.contains("is-error")) setActionState(submit, "idle");
    }
  }

  async function submitForm(form) {
    const resourceMap = { company: "companies", occurrence: "occurrences", task: "tasks", document: "documents", comment: "comments" };
    const resource = resourceMap[form.dataset.form];
    const data = Object.fromEntries(new FormData(form).entries());
    const submit = $('button[type="submit"]', form);
    const message = $(".form-message", form);
    submit.disabled = true;
    setActionState(submit, "loading");
    message.textContent = "Salvando...";
    try {
      const result = await api("POST", { resource, data });
      state[resource].unshift(result.data);
      form.closest("dialog").close();
      renderAll();
      toast("Informação salva no banco de dados.");
    } catch (error) {
      message.textContent = error.message;
      setActionState(submit, "error");
    } finally {
      submit.disabled = false;
      if (!submit.classList.contains("is-error")) setActionState(submit, "idle");
    }
  }

  async function submitDocument(form) {
    const submit = $('button[type="submit"]', form);
    const message = $(".form-message", form);
    const activeSession = session();
    submit.disabled = true;
    setActionState(submit, "loading");
    message.textContent = "Enviando arquivo...";
    try {
      const response = await fetch("/api/sentinela", { method: "POST", headers: { authorization: `Bearer ${activeSession?.access_token || ""}` }, body: new FormData(form) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível registrar o documento.");
      state.documents.unshift(result.data);
      form.closest("dialog").close();
      renderAll();
      toast("Documento armazenado com segurança.");
    } catch (error) {
      message.textContent = error.message;
      setActionState(submit, "error");
    } finally {
      submit.disabled = false;
      if (!submit.classList.contains("is-error")) setActionState(submit, "idle");
    }
  }

  async function downloadDocument(id, button) {
    button.disabled = true;
    setActionState(button, "loading");
    try {
      const result = await api("POST", { resource: "document_download", data: { id } });
      window.open(result.data.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      button.disabled = false;
      setActionState(button, "idle");
    }
  }

  async function updateResource(resource, id, data, button = null) {
    if (button) {
      button.disabled = true;
      setActionState(button, "loading");
    }
    try {
      const current = state[resource]?.find((item) => item.id === id);
      if (current?.version !== undefined) data.version = current.version;
      const result = await api("PATCH", { resource, id, data });
      const index = state[resource].findIndex((item) => item.id === id);
      if (index >= 0) state[resource][index] = result.data;
      renderAll();
      toast("Registro atualizado.");
    } catch (error) {
      setActionState(button, "error");
      toast(error.message, "error");
    } finally {
      if (button?.isConnected) {
        button.disabled = false;
        if (!button.classList.contains("is-error")) setActionState(button, "idle");
      }
    }
  }

  async function deleteResource(resource, id, button = null) {
    if (!window.confirm("Tem certeza de que deseja excluir este registro? O histórico de auditoria será preservado.")) return;
    if (button) {
      button.disabled = true;
      setActionState(button, "loading");
    }
    try {
      await api("DELETE", { resource, id });
      state[resource] = state[resource].filter((item) => item.id !== id);
      renderAll();
      toast("Registro excluído.");
    } catch (error) {
      setActionState(button, "error");
      toast(error.message, "error");
    } finally {
      if (button?.isConnected) {
        button.disabled = false;
        if (!button.classList.contains("is-error")) setActionState(button, "idle");
      }
    }
  }

  async function lookupCnpj() {
    const form = $('[data-form="company"]');
    const cnpj = String(form.elements.cnpj.value || "").replace(/\D/g, "");
    if (cnpj.length !== 14) return toast("Informe um CNPJ com 14 dígitos.", "error");
    const button = $("#lookupCnpj");
    button.disabled = true;
    setActionState(button, "loading");
    button.textContent = "Consultando...";
    try {
      const response = await fetch(`/api/cnpj/${cnpj}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Consulta pública indisponível.");
      form.elements.legal_name.value = data.razao_social || data.legal_name || data.nome || "";
      form.elements.trade_name.value = data.nome_fantasia || data.trade_name || "";
      form.elements.city.value = data.municipio || data.city || "";
      form.elements.state.value = data.uf || data.state || "";
      toast("Dados públicos carregados. Revise antes de salvar.");
    } catch (error) {
      setActionState(button, "error");
      toast(error.message, "error");
    } finally {
      button.disabled = false;
      button.textContent = "Buscar dados públicos";
      if (!button.classList.contains("is-error")) setActionState(button, "idle");
    }
  }

  function bindEvents() {
    $$(".nav-item").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
    $$('[data-go]').forEach((button) => button.addEventListener("click", () => showView(button.dataset.go)));
    $$('[data-open]').forEach((button) => button.addEventListener("click", () => openDialog(button.dataset.open)));
    $$('[data-form]').forEach((form) => form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (form.dataset.form === "import") submitImport(form);
      else if (form.dataset.form === "document") submitDocument(form);
      else submitForm(form);
    }));
    $("[data-close-detail]").addEventListener("click", () => $("#companyDetailDialog").close());
    $("#retryButton").addEventListener("click", load);
    $("#logoutButton").addEventListener("click", () => window.LuceModuleSession?.logout?.());
    $("#mobileMenu").addEventListener("click", () => document.body.classList.toggle("menu-open"));
    $("#lookupCnpj").addEventListener("click", lookupCnpj);
    $('[name="cnpj"]', $('[data-form="company"]')).addEventListener("input", (event) => { event.target.value = formatCnpj(event.target.value); });
    ["companySearch", "companyStatus"].forEach((id) => $(`#${id}`).addEventListener("input", renderCompanies));
    ["occurrenceSeverity", "occurrenceStatus"].forEach((id) => $(`#${id}`).addEventListener("change", renderOccurrences));
    ["todayPriority", "todayStatus"].forEach((id) => $(`#${id}`).addEventListener("change", renderToday));
    $("#globalSearch").addEventListener("input", (event) => {
      $("#companySearch").value = event.target.value;
      if (event.target.value.trim()) { showView("companies"); renderCompanies(); }
    });
    $("#notificationButton").addEventListener("click", () => toggleDrawer(true));
    $$('[data-close-drawer]').forEach((button) => button.addEventListener("click", () => toggleDrawer(false)));
    $("#drawerBackdrop").addEventListener("click", () => toggleDrawer(false));
    $("#notificationList").addEventListener("click", (event) => {
      const item = event.target.closest("[data-notification]");
      if (item) updateResource("notifications", item.dataset.notification, { read: true });
    });
    $("#content").addEventListener("click", (event) => {
      const filter = event.target.closest("[data-filter-status]");
      if (filter) { showView("companies"); $("#companyStatus").value = filter.dataset.filterStatus === "all" ? "all" : filter.dataset.filterStatus; renderCompanies(); return; }
      const createOccurrence = event.target.closest("[data-create-occurrence]");
      if (createOccurrence) { openDialog("occurrence", { company_id: createOccurrence.dataset.createOccurrence }); return; }
      const detail = event.target.closest("[data-company-detail]");
      if (detail) { openCompanyDetail(detail.dataset.companyDetail); return; }
      const comment = event.target.closest("[data-comment]");
      if (comment) { openDialog("comment", { occurrence_id: comment.dataset.comment }); return; }
      const update = event.target.closest("[data-update]");
      if (update) { updateResource(update.dataset.update, update.dataset.id, { status: update.dataset.status }, update); return; }
      const download = event.target.closest("[data-download-document]");
      if (download) { downloadDocument(download.dataset.downloadDocument, download); return; }
      const remove = event.target.closest("[data-delete]");
      if (remove) deleteResource(remove.dataset.delete, remove.dataset.id, remove);
    });
  }

  function toggleDrawer(open) {
    $("#notificationDrawer").classList.toggle("open", open);
    $("#notificationDrawer").setAttribute("aria-hidden", String(!open));
    $("#drawerBackdrop").classList.toggle("open", open);
  }

  document.addEventListener("DOMContentLoaded", () => {
    window.lucide?.createIcons({ attrs: { "aria-hidden": "true" } });
    window.SentinelaCompliance?.init?.({
      api,
      load,
      toast,
      session,
      getState: () => state,
      showView,
    });
    window.SentinelaAssisted?.init?.({
      load,
      toast,
      session,
      getState: () => state,
    });
    bindEvents();
    if (session()) load();
  });
})();
