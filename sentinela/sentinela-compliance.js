(() => {
  "use strict";

  let bridge = null;
  let state = null;
  let activeTab = "dashboard";
  let pendingImport = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const emptyRow = (columns, message) => `<tr><td colspan="${columns}" class="empty-state">${escapeHtml(message)}</td></tr>`;
  const activeCase = (item) => !["resolved", "closed"].includes(item.status);
  const priorityWeight = (value) => ({ critical: 0, high: 1, normal: 2, low: 3 }[value] ?? 4);
  const formatDate = (value, time = false) => value ? new Intl.DateTimeFormat("pt-BR", time ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" }).format(new Date(value)) : "Não informado";
  const formatMoney = (cents) => cents === null || cents === undefined ? "Não informado" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents) / 100);
  const label = (value) => ({
    internal: "Controle interno", external: "Controle externo", maed: "MAED", manual: "Manual", import: "Importação",
    identified: "Identificada", analysis: "Em análise", assigned: "Atribuída", action_requested: "Providência solicitada",
    waiting_responsible: "Aguardando responsável", waiting_client: "Aguardando cliente", waiting_payment: "Aguardando pagamento",
    waiting_agency: "Aguardando órgão externo", regularizing: "Em regularização", resolved: "Resolvida", closed: "Encerrada",
    critical: "Crítica", high: "Alta", normal: "Normal", low: "Baixa", client: "Cliente", external_agency: "Órgão externo", other: "Outro",
    preview: "Aguardando confirmação", confirmed: "Confirmada", cancelled: "Cancelada", failed: "Falhou",
  }[value] || String(value || "Não informado").replaceAll("_", " "));
  const badge = (value) => `<span class="badge ${escapeHtml(value)}">${escapeHtml(label(value))}</span>`;

  function compliance() {
    return state?.compliance || { categories: [], profiles: [], cases: [], outreach: [], snapshots: [], imports: [], events: [] };
  }

  function companyById(id) {
    return state?.companies?.find((item) => item.id === id) || null;
  }

  function caseCompany(item) {
    return companyById(item.company_id)?.legal_name || item.source_company_name || "Empresa em revisão";
  }

  function can(permission) {
    return Array.isArray(state?.permissions) && state.permissions.includes(permission);
  }

  function metrics() {
    const data = compliance();
    const cases = data.cases || [];
    const latest = data.snapshots?.[0]?.metrics || {};
    const companyKeys = new Set(cases.map((item) => item.company_id || String(item.source_company_name || "").toLocaleLowerCase("pt-BR")).filter(Boolean));
    const resolved = cases.filter((item) => ["resolved", "closed"].includes(item.status)).length;
    const open = cases.filter(activeCase).length;
    const assigned = cases.filter((item) => activeCase(item) && (item.assigned_to || item.assigned_name)).length;
    const maedCases = cases.filter((item) => item.origin === "maed");
    return {
      monitored: Number(latest.monitoredCompanies ?? companyKeys.size),
      analyzed: companyKeys.size,
      identified: cases.length,
      resolved,
      open,
      resolutionRate: cases.length ? resolved / cases.length * 100 : Number(latest.resolutionRate || 0),
      assigned,
      unassigned: Math.max(0, open - assigned),
      regular: Number(latest.regularCompanies ?? 0),
      maedCount: maedCases.length || Number(latest.maedCompanies || 0),
      maedAmount: maedCases.reduce((sum, item) => sum + Number(item.amount_cents || 0), 0) || Number(latest.maedAmountCents || 0),
      averageDays: Number(latest.averageResponseDays || 0),
    };
  }

  function selectedPeriodBounds() {
    const mode = $("#compliancePeriod")?.value || "since_start";
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    let start = null;
    if (mode === "month") start = new Date(now.getFullYear(), now.getMonth(), 1);
    if (mode === "previous_month") {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end.setTime(new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime());
    }
    if (mode === "quarter") start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    if (mode === "semester") start = new Date(now.getFullYear(), now.getMonth() < 6 ? 0 : 6, 1);
    if (mode === "year") start = new Date(now.getFullYear(), 0, 1);
    if (mode === "custom") {
      const startValue = $("#compliancePeriodStart")?.value;
      const endValue = $("#compliancePeriodEnd")?.value;
      start = startValue ? new Date(`${startValue}T00:00:00`) : null;
      if (endValue) end.setTime(new Date(`${endValue}T23:59:59.999`).getTime());
    }
    return { mode, start, end };
  }

  function casesInSelectedPeriod() {
    const { start, end } = selectedPeriodBounds();
    if (!start) return compliance().cases || [];
    return (compliance().cases || []).filter((item) => {
      const value = new Date(item.created_at || item.updated_at || 0);
      return value >= start && value <= end;
    });
  }

  function renderMetrics() {
    const values = metrics();
    const cards = [
      ["Empresas monitoradas", values.monitored, "Base confirmada"],
      ["Empresas analisadas", values.analyzed, "Com registro operacional"],
      ["Ocorrências identificadas", values.identified, "Registros operacionais"],
      ["Resolvidas", values.resolved, `${values.resolutionRate.toFixed(1).replace(".", ",")}% de resolução`],
      ["Em aberto", values.open, `${values.unassigned} sem responsável`],
      ["Taxa de resolução", `${values.resolutionRate.toFixed(1).replace(".", ",")}%`, "Casos concluídos"],
      ["Abertas com responsável", values.assigned, "Tratativa atribuída"],
      ["Abertas sem responsável", values.unassigned, "Exigem direcionamento"],
      ["Empresas sem pendência", values.regular, "Na base confirmada"],
      ["MAED", values.maedCount, formatMoney(values.maedAmount)],
      ["Valores identificados", formatMoney((compliance().cases || []).reduce((sum, item) => sum + Number(item.amount_cents || 0), 0)), "Ocorrências com valor"],
      ["Tempo médio", values.averageDays ? `${values.averageDays.toFixed(1).replace(".", ",")} dias` : "—", "Casos com datas apuráveis"],
    ];
    $("#complianceMetrics").innerHTML = cards.map(([name, value, detail]) => `<article class="compliance-metric"><span>${escapeHtml(name)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`).join("");
  }

  function renderEvolution() {
    const data = compliance();
    const baseline = [...(data.snapshots || [])].reverse().find((item) => item.snapshot_type === "baseline");
    const selectedCases = casesInSelectedPeriod();
    const current = metrics();
    const selectedResolved = selectedCases.filter((item) => !activeCase(item)).length;
    const selectedOpen = selectedCases.filter(activeCase).length;
    const selectedUnassigned = selectedCases.filter((item) => activeCase(item) && !item.assigned_name && !item.assigned_to).length;
    const selectedMaed = selectedCases.filter((item) => item.origin === "maed").length;
    const source = baseline?.metrics || {};
    const rows = [
      ["Empresas analisadas", Number(source.monitoredCompanies || 0), current.monitored],
      ["Casos resolvidos", Number(source.resolvedCases || 0), selectedResolved],
      ["Casos em aberto", Number(source.openCases || 0), selectedOpen],
      ["Sem responsável", Number(source.unassignedOpenCases || 0), selectedUnassigned],
      ["MAED", Number(source.maedCompanies || 0), selectedMaed],
    ];
    $("#complianceEvolution").innerHTML = baseline ? `<div class="evolution-head"><span>Indicador</span><span>Base inicial</span><span>Atual</span><span>Variação</span></div>${rows.map(([name, before, now]) => `<div class="evolution-row"><strong>${escapeHtml(name)}</strong><span>${before}</span><span>${now}</span><b class="${now - before > 0 && name.includes("aberto") ? "negative" : ""}">${now - before > 0 ? "+" : ""}${now - before}</b></div>`).join("")}` : `<div class="empty-state">Importe e confirme o Relatório Geral para estabelecer a base inicial imutável.</div>`;

    const attention = (data.cases || []).filter(activeCase).sort((a, b) => priorityWeight(a.priority) - priorityWeight(b.priority)).slice(0, 8);
    $("#complianceAttention").innerHTML = attention.length ? attention.map((item) => `<div class="compact-item"><div><strong>${escapeHtml(caseCompany(item))}</strong><small>${escapeHtml(item.title)} · ${escapeHtml(item.priority_reason || "Acompanhamento necessário")}</small></div>${badge(item.priority)}</div>`).join("") : `<div class="empty-state">Nenhuma prioridade operacional em aberto.</div>`;
  }

  function renderCompanies() {
    const query = String($("#complianceCompanySearch")?.value || "").trim().toLocaleLowerCase("pt-BR");
    const filter = $("#complianceCompanyState")?.value || "all";
    const cases = compliance().cases || [];
    const rows = (state?.companies || []).map((company) => {
      const companyCases = cases.filter((item) => item.company_id === company.id);
      const open = companyCases.filter(activeCase).length;
      const resolved = companyCases.filter((item) => !activeCase(item)).length;
      const profile = compliance().profiles?.find((item) => item.company_id === company.id);
      return { company, profile, total: companyCases.length, open, resolved };
    }).filter(({ company, open }) => {
      const matches = !query || `${company.legal_name} ${company.cnpj}`.toLocaleLowerCase("pt-BR").includes(query);
      return matches && (filter === "all" || (filter === "open" ? open > 0 : open === 0));
    });
    $("#complianceCompanyRows").innerHTML = rows.length ? rows.map(({ company, profile, total, open, resolved }) => `<tr><td><strong>${escapeHtml(company.legal_name)}</strong></td><td>${escapeHtml(formatCnpj(company.cnpj))}</td><td>${total}</td><td>${open}</td><td>${resolved}</td><td>${escapeHtml(profile?.treatment_owner_name || company.internal_owner || "Não atribuído")}</td><td>${open ? badge("attention") : badge("regular")}</td><td><button class="row-action" data-compliance-company="${company.id}" type="button">Abrir ficha</button></td></tr>`).join("") : emptyRow(8, "Nenhuma empresa corresponde aos filtros.");
  }

  function formatCnpj(value) {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 14);
    return digits.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
  }

  function filteredCases(origin = null) {
    const query = String($("#complianceCaseSearch")?.value || "").trim().toLocaleLowerCase("pt-BR");
    const status = $("#complianceCaseStatus")?.value || "active";
    const priority = $("#complianceCasePriority")?.value || "all";
    return (compliance().cases || []).filter((item) => {
      const matchesQuery = !query || `${caseCompany(item)} ${item.title} ${item.competence || ""}`.toLocaleLowerCase("pt-BR").includes(query);
      const matchesStatus = status === "all" || (status === "active" ? activeCase(item) : item.status === status);
      return matchesQuery && matchesStatus && (priority === "all" || item.priority === priority) && (!origin || item.origin === origin);
    });
  }

  function renderCases() {
    const rows = filteredCases();
    $("#complianceCaseRows").innerHTML = rows.length ? rows.map((item) => `<tr><td><strong>${escapeHtml(caseCompany(item))}</strong><small>${escapeHtml(item.title)}</small></td><td>${escapeHtml(label(item.origin))}</td><td>${escapeHtml(item.competence || "Não informada")}</td><td>${badge(item.priority)}</td><td>${escapeHtml(item.assigned_name || "Não atribuído")}</td><td>${badge(item.status)}</td><td><div class="row-actions"><button class="row-action" data-compliance-edit="${item.id}" type="button">Editar</button>${can("compliance.delete") ? `<button class="row-action danger" data-compliance-delete="${item.id}" type="button">Excluir</button>` : ""}</div></td></tr>`).join("") : emptyRow(7, "Nenhuma ocorrência corresponde aos filtros.");
  }

  function renderControlRows(origin, target, columns) {
    const rows = (compliance().cases || []).filter((item) => item.origin === origin);
    const html = rows.map((item) => {
      if (origin === "internal") return `<tr><td>${escapeHtml(caseCompany(item))}</td><td>${escapeHtml(item.obligation || item.title)}</td><td>${escapeHtml(item.competence || "Não informada")}</td><td>${escapeHtml(item.department || "Não informado")}</td><td>${escapeHtml(item.assigned_name || "Não atribuído")}</td><td>${badge(item.status)}</td></tr>`;
      if (origin === "external") return `<tr><td>${escapeHtml(caseCompany(item))}</td><td>${escapeHtml(item.obligation || item.title)}</td><td>${escapeHtml(item.gestta_task || "Em análise")}</td><td>${escapeHtml(formatMoney(item.amount_cents))}</td><td>${escapeHtml(item.assigned_name || "Não atribuído")}</td><td>${badge(item.status)}</td></tr>`;
      return `<tr><td>${escapeHtml(caseCompany(item))}</td><td>${escapeHtml(item.obligation || item.title)}</td><td>${escapeHtml(item.competence || "Não informada")}</td><td>${escapeHtml(formatMoney(item.amount_cents))}</td><td>${escapeHtml(formatDate(item.due_at))}</td><td>${badge(item.status)}</td></tr>`;
    }).join("");
    $(target).innerHTML = html || emptyRow(columns, `Nenhum registro de ${label(origin)} confirmado.`);
  }

  function renderResponsibles() {
    const grouped = new Map();
    (compliance().cases || []).forEach((item) => {
      const name = item.assigned_name || "Sem responsável";
      const current = grouped.get(name) || { total: 0, open: 0, resolved: 0, critical: 0 };
      current.total += 1;
      if (activeCase(item)) current.open += 1; else current.resolved += 1;
      if (activeCase(item) && item.priority === "critical") current.critical += 1;
      grouped.set(name, current);
    });
    const cards = [...grouped.entries()].sort((a, b) => b[1].open - a[1].open);
    $("#complianceResponsibleCards").innerHTML = cards.length ? cards.map(([name, value]) => `<article class="panel compliance-summary-card"><header><strong>${escapeHtml(name)}</strong>${value.critical ? badge("critical") : badge("normal")}</header><div><span>Recebidos <b>${value.total}</b></span><span>Em aberto <b>${value.open}</b></span><span>Resolvidos <b>${value.resolved}</b></span></div></article>`).join("") : `<div class="panel empty-state">Nenhum responsável atribuído.</div>`;
  }

  function renderPriorities() {
    const rows = (compliance().cases || []).filter(activeCase).sort((a, b) => priorityWeight(a.priority) - priorityWeight(b.priority));
    $("#compliancePriorityCards").innerHTML = rows.length ? rows.map((item) => `<article class="occurrence-card"><span class="severity-line ${escapeHtml(item.priority === "high" ? "relevant" : item.priority)}"></span><div><h3>${escapeHtml(caseCompany(item))} · ${escapeHtml(item.title)}</h3><p>${escapeHtml(item.priority_reason || "Acompanhamento operacional sem gatilho crítico expresso.")}</p><div class="occurrence-meta"><span>Prazo: ${escapeHtml(formatDate(item.internal_due_at || item.due_at))}</span><span>Responsável: ${escapeHtml(item.assigned_name || "Não atribuído")}</span>${badge(item.priority)}${badge(item.status)}</div></div></article>`).join("") : `<div class="panel empty-state">Nenhuma prioridade em aberto.</div>`;
  }

  function renderOutreach() {
    const cases = compliance().cases || [];
    const byId = new Map(cases.map((item) => [item.id, item]));
    const rows = compliance().outreach || [];
    $("#complianceOutreachRows").innerHTML = rows.length ? rows.map((item) => { const linked = byId.get(item.case_id); return `<tr><td><strong>${escapeHtml(linked ? caseCompany(linked) : "Ocorrência")}</strong><small>${escapeHtml(linked?.title || "Registro preservado")}</small></td><td>${escapeHtml(label(item.audience))}</td><td>${escapeHtml(item.contacted_name)}</td><td>${escapeHtml(item.request_summary)}</td><td>${escapeHtml(formatDate(item.requested_at, true))}</td><td>${escapeHtml(formatDate(item.response_due_at))}</td><td>${escapeHtml(item.response_summary || (item.responded_at ? "Retorno registrado" : "Aguardando"))}</td></tr>`; }).join("") : emptyRow(7, "Nenhum acionamento registrado.");
  }

  function reportRows() {
    const type = $("#complianceReportType")?.value || "management";
    let rows = compliance().cases || [];
    if (type === "open") rows = rows.filter(activeCase);
    if (type === "resolved") rows = rows.filter((item) => !activeCase(item));
    if (type === "maed") rows = rows.filter((item) => item.origin === "maed");
    if (type === "internal") rows = rows.filter((item) => item.origin === "internal");
    if (type === "external") rows = rows.filter((item) => item.origin === "external");
    if (type === "priorities") rows = rows.filter((item) => ["critical", "high"].includes(item.priority));
    if (["monthly", "quarterly", "semiannual", "annual"].includes(type)) {
      const days = { monthly: 31, quarterly: 93, semiannual: 186, annual: 366 }[type];
      const start = Date.now() - days * 86400000;
      rows = rows.filter((item) => new Date(item.created_at || 0).getTime() >= start);
    }
    return rows.map((item) => ({ Empresa: caseCompany(item), Ocorrência: item.title, Origem: label(item.origin), Obrigação: item.obligation || "", Competência: item.competence || "", Prioridade: label(item.priority), Responsável: item.assigned_name || "Não atribuído", Status: label(item.status), Valor: formatMoney(item.amount_cents) }));
  }

  function renderReport() {
    const values = metrics();
    const rows = reportRows();
    const reportName = $("#complianceReportType")?.selectedOptions?.[0]?.textContent || "Geral consolidado";
    $("#complianceReportPreview").innerHTML = `<header class="institutional-report-head"><span>LUCE SISTEMAS</span><strong>${escapeHtml(reportName)} · Compliance</strong><small>Base atualizada em ${escapeHtml(formatDate(new Date().toISOString(), true))}</small></header><section class="report-kpis"><div><span>Monitoradas</span><b>${values.monitored}</b></div><div><span>Em aberto</span><b>${values.open}</b></div><div><span>Resolvidas</span><b>${values.resolved}</b></div><div><span>MAED</span><b>${escapeHtml(formatMoney(values.maedAmount))}</b></div></section><div class="table-wrap"><table><thead><tr><th>Empresa</th><th>Ocorrência</th><th>Competência</th><th>Prioridade</th><th>Responsável</th><th>Status</th></tr></thead><tbody>${rows.slice(0, 100).map((row) => `<tr><td>${escapeHtml(row.Empresa)}</td><td>${escapeHtml(row.Ocorrência)}</td><td>${escapeHtml(row.Competência)}</td><td>${escapeHtml(row.Prioridade)}</td><td>${escapeHtml(row.Responsável)}</td><td>${escapeHtml(row.Status)}</td></tr>`).join("") || emptyRow(6, "Nenhuma informação disponível para este relatório.")}</tbody></table></div><footer>LUCE SISTEMAS</footer>`;
  }

  function renderHistory() {
    const imports = (compliance().imports || []).map((item) => ({ at: item.confirmed_at || item.created_at, title: `Importação ${label(item.status)}`, detail: item.filename, badge: item.status }));
    const caseById = new Map((compliance().cases || []).map((item) => [item.id, item]));
    const events = (compliance().events || []).map((item) => ({ at: item.created_at, title: `Ocorrência ${label(item.event_type)}`, detail: caseById.get(item.case_id)?.title || "Histórico preservado", badge: "normal" }));
    const rows = [...imports, ...events].sort((a, b) => String(b.at).localeCompare(String(a.at)));
    $("#complianceHistory").innerHTML = rows.length ? rows.map((item) => `<article><time>${escapeHtml(formatDate(item.at, true))}</time><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p></div>${badge(item.badge)}</article>`).join("") : `<div class="panel empty-state">Nenhum evento de Compliance registrado.</div>`;
  }

  function renderCategories() {
    const rows = compliance().categories || [];
    $("#complianceCategoryCards").innerHTML = rows.length ? rows.map((item) => `<article class="panel compliance-summary-card"><header><strong>${escapeHtml(item.name)}</strong>${badge(item.active ? "regular" : "closed")}</header><p>${escapeHtml(item.description || `Código: ${item.code}`)}</p></article>`).join("") : `<div class="panel empty-state">Nenhuma categoria configurada.</div>`;
  }

  function populateForms() {
    const companyOptions = `<option value="">Sem empresa vinculada</option>${(state?.companies || []).map((item) => `<option value="${item.id}">${escapeHtml(item.legal_name)}</option>`).join("")}`;
    $$('[data-company-select]').forEach((select) => { if (select.closest("#complianceCaseDialog")) select.innerHTML = companyOptions; });
    $("#complianceCategorySelect").innerHTML = (compliance().categories || []).map((item) => `<option value="${escapeHtml(item.code)}">${escapeHtml(item.name)}</option>`).join("") || `<option value="other">Outros</option>`;
    $("#complianceOutreachCase").innerHTML = (compliance().cases || []).filter(activeCase).map((item) => `<option value="${item.id}">${escapeHtml(caseCompany(item))} · ${escapeHtml(item.title)}</option>`).join("") || `<option value="">Nenhuma ocorrência em aberto</option>`;
  }

  function render(nextState) {
    state = nextState;
    if (!$("#complianceMetrics")) return;
    renderMetrics();
    renderEvolution();
    renderCompanies();
    renderCases();
    renderControlRows("internal", "#complianceInternalRows", 6);
    renderControlRows("external", "#complianceExternalRows", 6);
    renderControlRows("maed", "#complianceMaedRows", 6);
    renderResponsibles();
    renderPriorities();
    renderOutreach();
    renderReport();
    renderHistory();
    renderCategories();
    populateForms();
  }

  function switchTab(name) {
    activeTab = name;
    $$('[data-compliance-tab]').forEach((button) => button.classList.toggle("active", button.dataset.complianceTab === name));
    $$('[data-compliance-panel]').forEach((panel) => panel.classList.toggle("active", panel.dataset.compliancePanel === name));
    if (name === "reports") renderReport();
  }

  function formData(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function moneyToCents(value) {
    const raw = String(value || "").replace(/[^\d,.-]/g, "");
    if (!raw) return null;
    const normalizedValue = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
    const number = Number(normalizedValue);
    return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : null;
  }

  function openCase(id = null) {
    const form = $("#complianceCaseForm");
    form.reset();
    form.dataset.id = id || "";
    const item = id ? compliance().cases.find((entry) => entry.id === id) : null;
    $("h2", form).textContent = item ? "Editar ocorrência" : "Nova ocorrência";
    if (item) {
      ["company_id", "title", "origin", "category_code", "obligation", "competence", "priority", "status", "assigned_name", "department", "priority_reason", "description", "next_action"].forEach((name) => { if (form.elements[name]) form.elements[name].value = item[name] || ""; });
      form.elements.amount.value = item.amount_cents === null ? "" : (Number(item.amount_cents) / 100).toFixed(2).replace(".", ",");
      form.elements.internal_due_at.value = item.internal_due_at ? new Date(item.internal_due_at).toISOString().slice(0, 16) : "";
    }
    $(".form-message", form).textContent = "";
    $("#complianceCaseDialog").showModal();
  }

  function renderCompanyDetail(tab) {
    const form = $("#complianceCompanyForm");
    const companyId = form.elements.company_id.value;
    const company = companyById(companyId);
    const cases = (compliance().cases || []).filter((item) => item.company_id === companyId);
    const caseIds = new Set(cases.map((item) => item.id));
    let content = "";
    if (tab === "cases") content = cases.map((item) => `<article class="compact-item"><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.obligation || label(item.origin))} · ${escapeHtml(item.competence || "Competência não informada")}</small></div>${badge(item.status)}</article>`).join("");
    if (["internal", "external", "maed"].includes(tab)) content = cases.filter((item) => item.origin === tab).map((item) => `<article class="compact-item"><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.obligation || "Obrigação não informada")} · ${escapeHtml(formatMoney(item.amount_cents))}</small></div>${badge(item.priority)}</article>`).join("");
    if (tab === "debts") content = cases.filter((item) => item.amount_cents !== null && item.origin !== "maed").map((item) => `<article class="compact-item"><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.competence || "Competência não informada")}</small></div><b>${escapeHtml(formatMoney(item.amount_cents))}</b></article>`).join("");
    if (tab === "outreach") content = (compliance().outreach || []).filter((item) => caseIds.has(item.case_id)).map((item) => `<article class="compact-item"><div><strong>${escapeHtml(item.contacted_name)}</strong><small>${escapeHtml(item.request_summary)} · ${escapeHtml(formatDate(item.requested_at, true))}</small></div>${badge(item.audience)}</article>`).join("");
    if (tab === "documents") content = (state?.documents || []).filter((item) => item.company_id === companyId).map((item) => `<article class="compact-item"><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.category || "Documento")} · ${escapeHtml(formatDate(item.created_at))}</small></div></article>`).join("");
    if (tab === "history") content = (compliance().events || []).filter((item) => caseIds.has(item.case_id)).map((item) => `<article class="compact-item"><div><strong>${escapeHtml(label(item.event_type))}</strong><small>${escapeHtml(formatDate(item.created_at, true))}</small></div></article>`).join("");
    if (tab === "reports") {
      const open = cases.filter(activeCase).length;
      const resolved = cases.length - open;
      const amount = cases.reduce((sum, item) => sum + Number(item.amount_cents || 0), 0);
      content = `<div class="company-report-summary"><span>Ocorrências <b>${cases.length}</b></span><span>Em aberto <b>${open}</b></span><span>Resolvidas <b>${resolved}</b></span><span>Valor identificado <b>${escapeHtml(formatMoney(amount))}</b></span></div><p>Os relatórios institucionais desta empresa utilizam os mesmos registros persistidos no banco do Sentinela.</p>`;
    }
    $("#complianceCompanyDetail").innerHTML = content || `<div class="empty-state">Nenhuma informação disponível em ${escapeHtml(company?.legal_name || "esta empresa")} para esta seção.</div>`;
  }

  function switchCompanyTab(tab) {
    $$('[data-compliance-company-tab]').forEach((button) => button.classList.toggle("active", button.dataset.complianceCompanyTab === tab));
    $('[data-compliance-company-panel="overview"]').classList.toggle("active", tab === "overview");
    $('[data-compliance-company-panel="detail"]').classList.toggle("active", tab !== "overview");
    if (tab !== "overview") renderCompanyDetail(tab);
  }

  function openCompanyProfile(companyId) {
    const company = companyById(companyId);
    if (!company) return;
    const form = $("#complianceCompanyForm");
    form.reset();
    form.elements.company_id.value = companyId;
    const profile = compliance().profiles?.find((item) => item.company_id === companyId);
    form.dataset.version = profile?.version || "";
    ["monitoring_status", "treatment_owner_name", "monitoring_owner_name", "client_contact_name", "client_contact_email", "client_contact_phone", "notes"].forEach((name) => {
      if (form.elements[name]) form.elements[name].value = profile?.[name] || (name === "monitoring_status" ? "active" : "");
    });
    $("#complianceCompanyTitle").textContent = company.legal_name;
    $(".form-message", form).textContent = `${formatCnpj(company.cnpj)} · ${company.tax_regime || "Regime não informado"}`;
    switchCompanyTab("overview");
    $("#complianceCompanyDialog").showModal();
  }

  async function submitCompanyProfile(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $('[data-compliance-profile-save]', form);
    const message = $(".form-message", form);
    const data = formData(form);
    if (form.dataset.version) data.version = Number(form.dataset.version);
    button.disabled = true;
    message.textContent = "Salvando ficha...";
    try {
      await bridge.api("POST", { resource: "compliance_profile", data });
      $("#complianceCompanyDialog").close();
      bridge.toast("Ficha de Compliance atualizada para todos os usuários autorizados.");
      await bridge.load();
    } catch (error) { message.textContent = error.message; }
    finally { button.disabled = false; }
  }

  async function submitCase(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = $('button[type="submit"]', form);
    const message = $(".form-message", form);
    const data = formData(form);
    data.amount_cents = moneyToCents(data.amount);
    delete data.amount;
    submit.disabled = true;
    message.textContent = "Salvando...";
    try {
      const id = form.dataset.id;
      if (id) {
        const current = compliance().cases.find((item) => item.id === id);
        data.version = current?.version;
        await bridge.api("PATCH", { resource: "compliance_case", id, data });
      } else await bridge.api("POST", { resource: "compliance_case", data });
      $("#complianceCaseDialog").close();
      bridge.toast("Ocorrência de Compliance salva no banco de dados.");
      await bridge.load();
    } catch (error) {
      message.textContent = error.message;
    } finally { submit.disabled = false; }
  }

  async function submitOutreach(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = $('button[type="submit"]', form);
    const message = $(".form-message", form);
    submit.disabled = true;
    message.textContent = "Salvando...";
    try {
      await bridge.api("POST", { resource: "compliance_outreach", data: formData(form) });
      $("#complianceOutreachDialog").close();
      bridge.toast("Acionamento registrado com rastreabilidade.");
      await bridge.load();
    } catch (error) { message.textContent = error.message; }
    finally { submit.disabled = false; }
  }

  function previewMarkup(data) {
    const metric = data.metrics || {};
    const warnings = data.warnings || [];
    return `<div class="preview-summary"><strong>${escapeHtml(data.label || "Fonte de Compliance")}</strong><span>Período: ${escapeHtml(data.period?.start || "a revisar")} a ${escapeHtml(data.period?.end || "a revisar")}</span></div><div class="preview-metrics"><span>Empresas <b>${metric.monitoredCompanies ?? "—"}</b></span><span>Pendências <b>${data.reconciliation?.totalCases ?? "—"}</b></span><span>Resolvidas <b>${metric.resolvedCases ?? "—"}</b></span><span>Em aberto <b>${metric.openCases ?? "—"}</b></span><span>Responsáveis <b>${metric.assignedOpenCases ?? "—"}</b></span><span>Valores MAED <b>${escapeHtml(formatMoney(metric.maedAmountCents))}</b></span><span>MAED <b>${metric.maedCompanies ?? "—"}</b></span><span>Conflitos <b>${data.reconciliation?.conflicts || 0}</b></span></div><div class="preview-reconciliation"><strong>Reconciliação antes da gravação</strong><span>${data.reconciliation?.matched || 0} ocorrência(s) vinculada(s) a empresas existentes</span><span>${data.reconciliation?.review || 0} ocorrência(s) incompleta(s) mantida(s) em revisão, sem criar empresa duplicada</span><span>${data.reconciliation?.recordsToCreate || 0} ocorrência(s) serão criadas; ${data.reconciliation?.recordsToUpdate || 0} serão atualizadas</span></div>${warnings.map((warning) => `<p class="preview-warning">${escapeHtml(warning)}</p>`).join("")}<p class="preview-confirmation">Revise os números. Nenhum snapshot ou ocorrência definitiva foi criado até aqui.</p>`;
  }

  async function previewImport(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = $("#compliancePreviewImport");
    const message = $(".form-message", form);
    const activeSession = bridge.session();
    submit.disabled = true;
    message.textContent = "Analisando a estrutura do arquivo...";
    try {
      const response = await fetch("/api/sentinela", { method: "POST", headers: { authorization: `Bearer ${activeSession?.access_token || ""}`, "x-sentinela-operation": "compliance-preview" }, body: new FormData(form) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível gerar a prévia.");
      if (pendingImport?.batchId && pendingImport.batchId !== result.data?.batchId) {
        await bridge.api("POST", { resource: "compliance_import_cancel", data: { batchId: pendingImport.batchId } });
      }
      pendingImport = result.data;
      $("#complianceImportPreview").innerHTML = previewMarkup(pendingImport);
      $("#complianceImportPreview").classList.remove("hidden");
      $("#complianceConfirmImport").classList.remove("hidden");
      submit.textContent = "Atualizar prévia";
      message.textContent = "Prévia pronta para conferência.";
    } catch (error) { message.textContent = error.message; }
    finally { submit.disabled = false; }
  }

  async function confirmImport() {
    if (!pendingImport?.batchId) return bridge.toast("Gere a prévia antes de confirmar.", "error");
    const button = $("#complianceConfirmImport");
    const message = $(".form-message", $("#complianceImportForm"));
    button.disabled = true;
    message.textContent = "Confirmando snapshot e ocorrências...";
    try {
      await bridge.api("POST", { resource: "compliance_import_confirm", data: { batchId: pendingImport.batchId } });
      $("#complianceImportDialog").close();
      pendingImport = null;
      bridge.toast("Importação confirmada. O snapshot histórico foi preservado.");
      await bridge.load();
    } catch (error) { message.textContent = error.message; }
    finally { button.disabled = false; }
  }

  async function cancelImport({ close = true } = {}) {
    const batchId = pendingImport?.batchId;
    pendingImport = null;
    if (close && $("#complianceImportDialog").open) $("#complianceImportDialog").close();
    if (!batchId) return;
    try {
      await bridge.api("POST", { resource: "compliance_import_cancel", data: { batchId } });
      bridge.toast("Prévia cancelada. Nenhum dado operacional foi importado.");
      await bridge.load();
    } catch (error) {
      bridge.toast(error.message, "error");
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function exportReport(format) {
    const rows = reportRows();
    if (!rows.length) return bridge.toast("Não há dados para exportar.", "error");
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "csv") {
      const headers = Object.keys(rows[0]);
      const csv = [headers, ...rows.map((row) => headers.map((key) => row[key]))].map((line) => line.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(";")).join("\r\n");
      downloadBlob(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }), `compliance-${stamp}.csv`);
    } else if (format === "xlsx" && window.XLSX) {
      const book = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(book, window.XLSX.utils.json_to_sheet(rows), "Compliance");
      window.XLSX.writeFile(book, `compliance-${stamp}.xlsx`);
    } else if (format === "word") {
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial;color:#14253d;margin:36px}h1{color:#071d3b}table{width:100%;border-collapse:collapse;font-size:10px}th{background:#071d3b;color:white}th,td{border:1px solid #d9dfe8;padding:7px}</style></head><body><h1>Relatório Gerencial de Compliance</h1>${$("#complianceReportPreview").innerHTML}</body></html>`;
      downloadBlob(new Blob(["\ufeff", html], { type: "application/msword" }), `compliance-${stamp}.doc`);
    } else if (format === "pptx") {
      if (!window.PptxGenJS) throw new Error("O gerador de PowerPoint não está disponível.");
      const values = metrics();
      const presentation = new window.PptxGenJS();
      presentation.layout = "LAYOUT_WIDE";
      presentation.author = "Luce Sistemas";
      presentation.subject = "Relatório Gerencial de Compliance";
      presentation.title = "Compliance";
      presentation.company = "Luce Sistemas";
      presentation.lang = "pt-BR";
      presentation.theme = {
        headFontFace: "Montserrat",
        bodyFontFace: "Arial",
        lang: "pt-BR",
      };

      const cover = presentation.addSlide();
      cover.background = { color: "071D3B" };
      cover.addText("LUCE SISTEMAS", { x: 0.7, y: 0.55, w: 4.2, h: 0.3, fontFace: "Montserrat", fontSize: 12, bold: true, color: "69B9F3", margin: 0 });
      cover.addText("Relatório Gerencial\nde Compliance", { x: 0.7, y: 1.55, w: 7.8, h: 1.6, fontFace: "Montserrat", fontSize: 30, bold: true, color: "FFFFFF", breakLine: false, margin: 0 });
      cover.addText(`Base atualizada em ${formatDate(new Date().toISOString(), true)}`, { x: 0.7, y: 3.55, w: 5.5, h: 0.35, fontSize: 12, color: "C8D7E6", margin: 0 });
      cover.addShape(presentation.ShapeType.line, { x: 0.7, y: 4.25, w: 11.9, h: 0, line: { color: "238FE5", width: 2 } });

      const summary = presentation.addSlide();
      summary.background = { color: "F7F9FC" };
      summary.addText("Visão consolidada", { x: 0.65, y: 0.45, w: 5.5, h: 0.45, fontFace: "Montserrat", fontSize: 22, bold: true, color: "071D3B", margin: 0 });
      const kpis = [
        ["Empresas monitoradas", values.monitored], ["Ocorrências em aberto", values.open],
        ["Ocorrências resolvidas", values.resolved], ["Valor de MAED", formatMoney(values.maedAmount)],
      ];
      kpis.forEach(([name, value], index) => {
        const x = 0.65 + index * 3.12;
        summary.addShape(presentation.ShapeType.rect, { x, y: 1.25, w: 2.75, h: 1.25, rectRadius: 0.04, fill: { color: "FFFFFF" }, line: { color: "D6E0EA", width: 1 } });
        summary.addText(String(name), { x: x + 0.18, y: 1.48, w: 2.38, h: 0.3, fontSize: 10, bold: true, color: "5C6F82", margin: 0 });
        summary.addText(String(value), { x: x + 0.18, y: 1.88, w: 2.38, h: 0.42, fontFace: "Montserrat", fontSize: 20, bold: true, color: "071D3B", margin: 0 });
      });
      summary.addText("Prioridades operacionais", { x: 0.65, y: 3.05, w: 5.5, h: 0.35, fontFace: "Montserrat", fontSize: 16, bold: true, color: "071D3B", margin: 0 });
      const tableRows = [["Empresa", "Ocorrência", "Prioridade", "Responsável", "Status"], ...rows.slice(0, 12).map((row) => [row.Empresa, row.Ocorrência, row.Prioridade, row.Responsável, row.Status])];
      summary.addTable(tableRows, { x: 0.65, y: 3.55, w: 12.05, h: 3.15, border: { type: "solid", color: "D6E0EA", pt: 0.6 }, fill: "FFFFFF", color: "24384D", fontFace: "Arial", fontSize: 8, margin: 0.06, rowH: 0.24, bold: false, autoFit: false, colW: [2.75, 3.25, 1.25, 2.4, 1.55] });
      await presentation.writeFile({ fileName: `compliance-${stamp}.pptx` });
    } else if (format === "pdf") {
      document.body.classList.add("compliance-print");
      window.print();
      setTimeout(() => document.body.classList.remove("compliance-print"), 500);
    }
    bridge.api("POST", { resource: "compliance_export_audit", data: { format, reportType: $("#complianceReportType")?.value || "management", recordCount: rows.length } }).catch(() => {});
    bridge.toast("Relatório preparado para exportação.");
  }

  function bind() {
    $$('[data-compliance-close]').forEach((button) => button.addEventListener("click", () => {
      const dialog = $(button.dataset.complianceClose);
      if (dialog?.open) dialog.close();
    }));
    $$('[data-compliance-tab]').forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.complianceTab)));
    $("#complianceNewCaseButton").addEventListener("click", () => openCase());
    $("#complianceImportButton").addEventListener("click", () => { pendingImport = null; const form = $("#complianceImportForm"); form.reset(); $("#complianceImportPreview").classList.add("hidden"); $("#complianceConfirmImport").classList.add("hidden"); $("#compliancePreviewImport").textContent = "Gerar prévia"; $(".form-message", form).textContent = ""; $("#complianceImportDialog").showModal(); });
    $("#complianceNewOutreachButton").addEventListener("click", () => { const form = $("#complianceOutreachForm"); form.reset(); form.elements.requested_at.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16); $("#complianceOutreachDialog").showModal(); });
    $("#complianceCaseForm").addEventListener("submit", submitCase);
    $("#complianceCompanyForm").addEventListener("submit", submitCompanyProfile);
    $("#complianceOutreachForm").addEventListener("submit", submitOutreach);
    $("#complianceImportForm").addEventListener("submit", previewImport);
    $("#complianceConfirmImport").addEventListener("click", confirmImport);
    $("#complianceCancelImport").addEventListener("click", () => cancelImport());
    $("#complianceImportDialog").addEventListener("close", () => { if (pendingImport) cancelImport({ close: false }); });
    ["complianceCompanySearch", "complianceCompanyState"].forEach((id) => $(`#${id}`).addEventListener("input", renderCompanies));
    ["complianceCaseSearch", "complianceCaseStatus", "complianceCasePriority"].forEach((id) => $(`#${id}`).addEventListener("input", renderCases));
    $("#complianceReportType").addEventListener("change", renderReport);
    $("#compliancePeriod").addEventListener("change", () => {
      $("#complianceCustomPeriod").classList.toggle("hidden", $("#compliancePeriod").value !== "custom");
      renderEvolution();
    });
    ["compliancePeriodStart", "compliancePeriodEnd"].forEach((id) => $(`#${id}`).addEventListener("change", renderEvolution));
    $$('[data-compliance-company-tab]').forEach((button) => button.addEventListener("click", () => switchCompanyTab(button.dataset.complianceCompanyTab)));
    $$('[data-compliance-export]').forEach((button) => button.addEventListener("click", async () => {
      try { await exportReport(button.dataset.complianceExport); }
      catch (error) { bridge.toast(error.message, "error"); }
    }));
    $(".compliance-view").addEventListener("click", async (event) => {
      const company = event.target.closest("[data-compliance-company]");
      if (company) return openCompanyProfile(company.dataset.complianceCompany);
      const edit = event.target.closest("[data-compliance-edit]");
      if (edit) return openCase(edit.dataset.complianceEdit);
      const remove = event.target.closest("[data-compliance-delete]");
      if (!remove || !confirm("Tem certeza de que deseja excluir esta ocorrência? O histórico de auditoria será preservado.")) return;
      try {
        await bridge.api("DELETE", { resource: "compliance_case", id: remove.dataset.complianceDelete });
        bridge.toast("Ocorrência excluída com preservação do histórico.");
        await bridge.load();
      } catch (error) { bridge.toast(error.message, "error"); }
    });
  }

  function init(nextBridge) {
    bridge = nextBridge;
    bind();
  }

  window.SentinelaCompliance = { init, render };
})();
