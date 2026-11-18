const STORAGE_KEY = "luce-rtc-session";
const loginView = document.getElementById("loginView");
const workspace = document.getElementById("workspace");
const loginMessage = document.getElementById("loginMessage");
const workspaceMessage = document.getElementById("workspaceMessage");
const logout = document.getElementById("logout");
let catalog = [];
let organizations = [];
let selectedCompanyId = null;
let currentCompanies = [];
let currentDraft = null;
let draftList = [];
let draftEpoch = 0;
let autoSaveTimer;
let saveQueue = Promise.resolve();
let autoSaveBlocked = false;
let pendingDraftId = null;

async function rtcRequest(path, options = {}) {
  const token = readSession()?.access_token;
  const response = await fetch(path, {
    ...options, cache: "no-store",
    headers: { authorization: `Bearer ${token || ""}`, ...(options.body ? { "content-type": "application/json" } : {}) },
  });
  if (response.status === 401 || response.status === 403 && ["module_forbidden", "account_suspended"].includes((await response.clone().json().catch(() => ({}))).code)) {
    sessionStorage.removeItem(STORAGE_KEY);
    showLogin("Sua sessão expirou ou não possui acesso a este módulo.");
    throw new Error("Sessão inválida.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const messages = { module_disabled: "O módulo Beta está temporariamente indisponível.", store_not_configured: "Cadastro ainda não configurado.", store_unavailable: "Cadastro temporariamente indisponível.", bootstrap_forbidden: "Somente o administrador principal pode criar organizações.", invalid_cnpj: "CNPJ inválido.", invalid_name: "Informe um nome válido.", company_exists: "Esta empresa já está cadastrada nesta organização.", company_write_forbidden: "Seu perfil não permite cadastrar empresas.", organization_forbidden: "Você não possui acesso a esta organização.", invalid_draft: "Revise os dados do rascunho.", draft_conflict: "Este rascunho foi alterado. Recarregue-o antes de salvar.", draft_write_forbidden: "Seu perfil não permite salvar rascunhos.", invalid_code: "Informe um NCM de 8 dígitos ou NBS de 9 dígitos.", engine_not_configured: "O motor oficial ainda não está configurado.", engine_version_mismatch: "A versão do motor não corresponde à versão homologada.", engine_unavailable: "O motor oficial está indisponível.", engine_timeout: "A consulta excedeu o tempo permitido.", invalid_date: "Informe uma data válida.", engine_invalid_response: "O motor retornou uma resposta incompatível." };
    throw new Error(messages[data.code] || "Não foi possível concluir a operação.");
  }
  return data;
}

async function loadCompanies() {
  const organization = organizations.find((item) => item.id === document.getElementById("organizationSelect").value);
  const form = document.getElementById("companyForm");
  form.hidden = !organization || organization.role !== "admin";
  document.getElementById("draftForm").hidden = !organization || organization.role === "viewer";
  document.getElementById("draftForm").querySelector('button[type="submit"]').disabled = !organization || organization.role === "viewer";
  document.getElementById("auditSection").hidden = !organization || organization.role !== "admin";
  document.getElementById("historySection").hidden = true;
  document.getElementById("analysisDetail").hidden = true;
  selectedCompanyId = null;
  cancelAutoSave();
  currentDraft = null;
  currentCompanies = [];
  if (!organization) return;
  const data = await rtcRequest(`/api/rtc/companies?organization_id=${encodeURIComponent(organization.id)}`);
  currentCompanies = data.companies;
  document.getElementById("companyCount").textContent = String(currentCompanies.length);
  const select = document.getElementById("draftCompany");
  select.replaceChildren(...currentCompanies.map((company) => {
    const option = document.createElement("option");
    option.value = company.id;
    option.textContent = `${company.legal_name} · ${company.cnpj}`;
    return option;
  }));
  const body = document.getElementById("companyRows");
  body.replaceChildren(...data.companies.map((company) => {
    const row = document.createElement("tr");
    for (const value of [company.cnpj, company.legal_name, company.trade_name || "-"]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    const actions = document.createElement("td");
    const history = document.createElement("button");
    history.type = "button";
    history.textContent = "Histórico";
    history.addEventListener("click", () => loadHistory(company).catch((error) => {
      document.getElementById("historyMessage").textContent = error.message;
    }));
    actions.append(history);
    row.append(actions);
    return row;
  }));
  document.getElementById("registryMessage").textContent = data.companies.length ? "" : "Nenhuma empresa cadastrada nesta organização.";
  if (currentCompanies.length) await loadDrafts();
  else {
    draftList = [];
    renderDrafts();
  }
}

async function loadDrafts() {
  const organizationId = document.getElementById("organizationSelect").value;
  const companyId = document.getElementById("draftCompany").value;
  if (!companyId) return;
  const data = await rtcRequest(`/api/rtc/drafts?${new URLSearchParams({ organization_id: organizationId, company_id: companyId })}`);
  if (companyId !== document.getElementById("draftCompany").value) return;
  draftList = data.drafts;
  renderDrafts();
}

function renderDrafts() {
  document.getElementById("draftCount").textContent = String(draftList.length);
  const regime = document.getElementById("draftRegimeFilter").value;
  const month = document.getElementById("draftMonthFilter").value;
  const visible = draftList.filter((draft) => (!regime || draft.engine === regime)
    && (!month || draft.operation_date.startsWith(month)));
  document.getElementById("draftRows").replaceChildren(...visible.map((draft) => {
    const row = document.createElement("tr");
    for (const value of [draft.title, currentCompanies.find((item) => item.id === draft.company_id)?.legal_name || "-",
      draft.engine === "regular" ? "Regime Regular" : "Simples Nacional", new Date(draft.updated_at).toLocaleString("pt-BR")]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    const actions = document.createElement("td");
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Editar";
    edit.disabled = !draft.editable;
    if (!draft.editable) edit.title = "Somente o criador pode editar este rascunho.";
    edit.addEventListener("click", () => {
      loadDraftIntoForm(draft, true);
      document.getElementById("draftMessage").textContent = "Rascunho carregado. Nenhum cálculo fiscal foi executado.";
    });
    actions.append(edit);
    const duplicate = document.createElement("button");
    duplicate.type = "button";
    duplicate.textContent = "Duplicar";
    duplicate.disabled = document.getElementById("draftForm").querySelector('button[type="submit"]').disabled;
    duplicate.addEventListener("click", async () => {
      loadDraftIntoForm(draft, false);
      document.getElementById("draftName").value = `${draft.title} (cópia)`.slice(0, 120);
      await queueDraftSave(false);
    });
    actions.append(duplicate);
    row.append(actions);
    return row;
  }));
}

function cancelAutoSave() {
  clearTimeout(autoSaveTimer);
  draftEpoch += 1;
  autoSaveBlocked = false;
  pendingDraftId = null;
}

function addDraftItem(item = {}) {
  const container = document.getElementById("draftItems");
  if (container.childElementCount >= 50) return;
  const row = document.createElement("div");
  row.className = "draft-item";
  const fields = [
    ["description", "Descrição", "text", item.description || "", "180"],
    ["amount", "Valor (R$)", "number", ((item.amount_cents || 0) / 100).toFixed(2), ""],
    ["ncm", "NCM", "text", item.ncm || "", "8"],
    ["nbs", "NBS", "text", item.nbs || "", "9"],
  ];
  for (const [name, labelText, type, value, maxlength] of fields) {
    const wrapper = document.createElement("div");
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.dataset.field = name;
    input.type = type;
    input.value = value;
    if (maxlength) input.maxLength = Number(maxlength);
    if (name === "description" || name === "amount") input.required = true;
    if (name === "amount") { input.min = "0"; input.max = "1000000000"; input.step = "0.01"; }
    if (name === "ncm") input.pattern = "[0-9]{8}";
    if (name === "nbs") input.pattern = "[0-9]{9}";
    label.append(input);
    wrapper.append(label);
    row.append(wrapper);
  }
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Remover";
  remove.addEventListener("click", () => {
    if (container.childElementCount > 1) row.remove();
    document.getElementById("addDraftItem").disabled = container.childElementCount >= 50;
    scheduleAutoSave();
  });
  row.append(remove);
  container.append(row);
  document.getElementById("addDraftItem").disabled = container.childElementCount >= 50;
}

function loadDraftIntoForm(draft, editing) {
  cancelAutoSave();
  currentDraft = editing ? draft : null;
  document.getElementById("draftName").value = draft.title;
  document.getElementById("draftEngine").value = draft.engine;
  document.getElementById("draftDate").value = draft.operation_date;
  document.getElementById("draftItems").replaceChildren();
  for (const item of draft.scenario.items) addDraftItem(item);
}

function draftItemsFromForm() {
  return [...document.querySelectorAll("#draftItems .draft-item")].map((row) => {
    const field = (name) => row.querySelector(`[data-field="${name}"]`).value.trim();
    const amount = field("amount");
    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(amount)) throw new Error("Informe valores com até duas casas decimais.");
    const [whole, fraction = ""] = amount.split(".");
    const item = { description: field("description"), amount_cents: Number(whole) * 100 + Number(fraction.padEnd(2, "0")) };
    if (field("ncm")) item.ncm = field("ncm");
    if (field("nbs")) item.nbs = field("nbs");
    return item;
  });
}

function queueDraftSave(automatic) {
  const form = document.getElementById("draftForm");
  if (!form.checkValidity() || !document.getElementById("draftCompany").value) {
    if (!automatic) form.reportValidity();
    return Promise.resolve();
  }
  const epoch = draftEpoch;
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    if (epoch !== draftEpoch || automatic && (!currentDraft || autoSaveBlocked)) return;
    const message = document.getElementById("draftMessage");
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const body = {
        id: currentDraft?.id || (pendingDraftId ||= crypto.randomUUID()),
        organization_id: document.getElementById("organizationSelect").value,
        company_id: document.getElementById("draftCompany").value,
        title: document.getElementById("draftName").value.trim(),
        engine: document.getElementById("draftEngine").value,
        operation_date: document.getElementById("draftDate").value,
        scenario: { items: draftItemsFromForm() },
        ...(currentDraft ? { version: currentDraft.version } : {}),
      };
      message.textContent = automatic ? "Salvando alterações..." : "Salvando rascunho...";
      const data = await rtcRequest("/api/rtc/drafts", { method: currentDraft ? "PATCH" : "POST", body: JSON.stringify(body) });
      if (epoch !== draftEpoch) return;
      currentDraft = data.draft;
      pendingDraftId = null;
      autoSaveBlocked = false;
      message.textContent = "Rascunho salvo sem resultado fiscal.";
      await loadDrafts();
    } catch (error) {
      if (epoch === draftEpoch) {
        autoSaveBlocked = true;
        message.textContent = error.message;
      }
    } finally {
      const organization = organizations.find((item) => item.id === document.getElementById("organizationSelect").value);
      button.disabled = !organization || organization.role === "viewer";
    }
  });
  return saveQueue;
}

function scheduleAutoSave() {
  clearTimeout(autoSaveTimer);
  if (currentDraft && !autoSaveBlocked) autoSaveTimer = setTimeout(() => queueDraftSave(true), 1200);
}

document.getElementById("draftCompany").addEventListener("change", () => {
  cancelAutoSave();
  currentDraft = null;
  loadDrafts().catch((error) => { document.getElementById("draftMessage").textContent = error.message; });
});
document.getElementById("newDraft").addEventListener("click", () => {
  cancelAutoSave();
  currentDraft = null;
  const companyId = document.getElementById("draftCompany").value;
  document.getElementById("draftForm").reset();
  document.getElementById("draftCompany").value = companyId;
  document.getElementById("draftItems").replaceChildren();
  addDraftItem();
  document.getElementById("draftMessage").textContent = "Novo cenário. Nenhum cálculo fiscal será executado.";
});
document.getElementById("addDraftItem").addEventListener("click", () => { addDraftItem(); scheduleAutoSave(); });
document.getElementById("draftForm").addEventListener("input", scheduleAutoSave);
document.getElementById("draftRegimeFilter").addEventListener("change", renderDrafts);
document.getElementById("draftMonthFilter").addEventListener("change", renderDrafts);
document.getElementById("draftForm").addEventListener("submit", (event) => {
  event.preventDefault();
  queueDraftSave(false);
});
addDraftItem();

async function loadHistory(company) {
  const organizationId = document.getElementById("organizationSelect").value;
  selectedCompanyId = company.id;
  document.getElementById("historySection").hidden = false;
  document.getElementById("analysisDetail").hidden = true;
  document.getElementById("historyTitle").textContent = `Histórico de cálculos: ${company.legal_name}`;
  const data = await rtcRequest(`/api/rtc/history?organization_id=${encodeURIComponent(organizationId)}&company_id=${encodeURIComponent(company.id)}`);
  document.getElementById("historyRows").replaceChildren(...data.analyses.map((analysis) => {
    const row = document.createElement("tr");
    for (const value of [analysis.operation_date, analysis.engine, analysis.status, analysis.engine_version]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    const actions = document.createElement("td");
    const detail = document.createElement("button");
    detail.type = "button";
    detail.textContent = "Ver";
    detail.addEventListener("click", () => loadAnalysis(analysis.id).catch((error) => {
      document.getElementById("historyMessage").textContent = error.message;
    }));
    actions.append(detail);
    row.append(actions);
    return row;
  }));
  document.getElementById("historyMessage").textContent = data.analyses.length ? "" : "Nenhum cálculo registrado para esta empresa.";
}

async function loadAnalysis(analysisId) {
  const organizationId = document.getElementById("organizationSelect").value;
  const query = new URLSearchParams({ organization_id: organizationId, company_id: selectedCompanyId, analysis_id: analysisId });
  const data = await rtcRequest(`/api/rtc/history?${query}`);
  const analysis = data.analyses[0];
  if (!analysis) throw new Error("Análise não encontrada.");
  document.getElementById("analysisDetail").hidden = false;
  document.getElementById("analysisData").textContent = JSON.stringify({
    data: analysis.operation_date, motor: analysis.engine, versao: analysis.engine_version,
    regras: analysis.rules_version, fonte: analysis.source_commit, entrada: analysis.input_data, saida: analysis.output_data,
  }, null, 2);
  document.getElementById("reportLinks").replaceChildren(...(data.reports || []).map((report) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Baixar relatório PDF";
    button.title = `SHA-256: ${report.sha256}`;
    button.addEventListener("click", async () => {
      try {
        const download = await rtcRequest(`/api/rtc/report?id=${encodeURIComponent(report.id)}`);
        window.location.assign(download.url);
      } catch (error) { document.getElementById("historyMessage").textContent = error.message; }
    });
    return button;
  }));
}

document.getElementById("loadAudit").addEventListener("click", async () => {
  const organizationId = document.getElementById("organizationSelect").value;
  try {
    const data = await rtcRequest(`/api/rtc/audit?organization_id=${encodeURIComponent(organizationId)}`);
    document.getElementById("auditRows").replaceChildren(...data.events.map((event) => {
      const row = document.createElement("tr");
      for (const value of [new Date(event.created_at).toLocaleString("pt-BR"), event.event_type, event.actor_id || "Sistema"]) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
      return row;
    }));
  } catch (error) { document.getElementById("registryMessage").textContent = error.message; }
});

async function loadOrganizations() {
  const data = await rtcRequest("/api/rtc/organizations");
  organizations = data.organizations;
  const select = document.getElementById("organizationSelect");
  select.replaceChildren(...organizations.map((organization) => {
    const option = document.createElement("option");
    option.value = organization.id;
    option.textContent = organization.name;
    return option;
  }));
  document.getElementById("organizationForm").hidden = !data.canBootstrap;
  document.getElementById("registryContent").hidden = !organizations.length;
  if (organizations.length) await loadCompanies();
  else document.getElementById("registryMessage").textContent = "Nenhuma organização vinculada a este usuário.";
}

function renderCatalog(filter = "") {
  const term = filter.trim().toLocaleLowerCase("pt-BR");
  const rows = catalog.filter((row) => [row.codigo, row.descricao, ...row.classificacoesTributarias.flatMap((item) => [item.codigo, item.descricao])]
    .some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(term)));
  document.getElementById("catalogRows").replaceChildren(...rows.map((item) => {
    const row = document.createElement("tr");
    const code = document.createElement("td");
    const description = document.createElement("td");
    const classifications = document.createElement("td");
    code.textContent = item.codigo;
    description.textContent = item.descricao;
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = `${item.classificacoesTributarias.length} classificações`;
    const list = document.createElement("ul");
    list.append(...item.classificacoesTributarias.map((entry) => {
      const line = document.createElement("li");
      const key = document.createElement("strong");
      key.textContent = entry.codigo;
      line.append(key, document.createTextNode(entry.descricao || ""));
      return line;
    }));
    details.append(summary, list);
    classifications.append(details);
    row.append(code, description, classifications);
    return row;
  }));
  document.getElementById("catalogMessage").textContent = `${rows.length} de ${catalog.length} situações tributárias exibidas.`;
}

function readSession() {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null"); }
  catch { return null; }
}

function showLogin(message = "") {
  loginView.hidden = false;
  workspace.hidden = true;
  logout.hidden = true;
  loginMessage.textContent = message;
}

async function loadStatus(token) {
  const response = await fetch("/api/rtc/status", {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) {
    sessionStorage.removeItem(STORAGE_KEY);
    showLogin(response.status === 403 ? "Sua conta não tem acesso a este módulo." : "Sessão expirada. Entre novamente.");
    return;
  }
  if (!response.ok) throw new Error("Não foi possível consultar a prontidão do módulo.");
  const data = await response.json();
  document.getElementById("engines").replaceChildren(...data.engines.map((engine) => {
    const row = document.createElement("tr");
    const name = document.createElement("td");
    const status = document.createElement("td");
    name.textContent = engine.name;
    status.className = "status";
    status.textContent = engine.status === "pending_validation" ? "Configuração pendente de validação" : "Não configurado";
    row.append(name, status);
    return row;
  }));
  loginView.hidden = true;
  workspace.hidden = false;
  logout.hidden = false;
  workspaceMessage.textContent = "Nenhum cálculo está disponível antes da homologação dos motores oficiais.";
  loadOrganizations().catch((error) => { document.getElementById("registryMessage").textContent = error.message; });
}

document.getElementById("organizationSelect").addEventListener("change", () => {
  loadCompanies().catch((error) => { document.getElementById("registryMessage").textContent = error.message; });
});

document.getElementById("organizationForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    const data = await rtcRequest("/api/rtc/organizations", { method: "POST", body: JSON.stringify({ name: form.elements.namedItem("name").value }) });
    form.reset();
    await loadOrganizations();
    document.getElementById("organizationSelect").value = data.organization.id;
    await loadCompanies();
  } catch (error) { document.getElementById("registryMessage").textContent = error.message; }
  finally { button.disabled = false; }
});

document.getElementById("companyForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    await rtcRequest("/api/rtc/companies", { method: "POST", body: JSON.stringify({
      organization_id: document.getElementById("organizationSelect").value,
      cnpj: form.elements.namedItem("cnpj").value,
      legal_name: form.elements.namedItem("legal_name").value,
      trade_name: form.elements.namedItem("trade_name").value,
    }) });
    form.reset();
    await loadCompanies();
  } catch (error) { document.getElementById("registryMessage").textContent = error.message; }
  finally { button.disabled = false; }
});

document.getElementById("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  button.disabled = true;
  loginMessage.textContent = "";
  try {
    const local = ["localhost", "127.0.0.1"].includes(location.hostname);
    const response = await fetch(local ? "/api/rtc/local-login" : "/api/onboarding/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        identifier: form.elements.namedItem("identifier").value,
        password: form.elements.namedItem("password").value,
        profile: "reforma-tributaria",
      }),
    });
    if (!response.ok) throw new Error("Não foi possível entrar com essas credenciais.");
    const session = await response.json();
    if (!session.access_token) throw new Error("O portal não retornou uma sessão válida.");
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ access_token: session.access_token }));
    form.elements.namedItem("password").value = "";
    await loadStatus(session.access_token);
  } catch (error) { showLogin(error.message); }
  finally { button.disabled = false; }
});

logout.addEventListener("click", () => {
  sessionStorage.removeItem(STORAGE_KEY);
  showLogin();
});

document.getElementById("catalogForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  const date = document.getElementById("operationDate").value;
  const message = document.getElementById("catalogMessage");
  button.disabled = true;
  message.textContent = "Consultando o motor oficial...";
  try {
    const token = readSession()?.access_token;
    const response = await fetch(`/api/rtc/classifications?data=${encodeURIComponent(date)}`, {
      headers: { authorization: `Bearer ${token || ""}` }, cache: "no-store",
    });
    if (response.status === 401 || response.status === 403) {
      sessionStorage.removeItem(STORAGE_KEY);
      showLogin("Sua sessão expirou ou não possui acesso a este módulo.");
      return;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errors = {
        engine_not_configured: "O motor oficial ainda não está configurado.",
        engine_version_mismatch: "A versão do motor não corresponde à versão homologada.",
        engine_unavailable: "O motor oficial está indisponível no momento.",
        engine_timeout: "A consulta excedeu o tempo permitido.",
        invalid_date: "Informe uma data válida.",
      };
      throw new Error(errors[data.code] || "Não foi possível concluir a consulta.");
    }
    catalog = data.rows;
    document.getElementById("catalogResults").hidden = false;
    const source = document.getElementById("catalogSource");
    source.hidden = false;
    source.textContent = `Fonte: ${data.source} | motor ${data.engineVersion} | base ${data.databaseVersion || "não informada"} | consulta ${new Date(data.queriedAt).toLocaleString("pt-BR")}`;
    renderCatalog(document.getElementById("catalogFilter").value);
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
});

document.getElementById("catalogFilter").addEventListener("input", (event) => renderCatalog(event.currentTarget.value));
document.getElementById("simplesForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  const message = document.getElementById("simplesMessage");
  button.disabled = true;
  message.textContent = "Consultando o motor oficial...";
  try {
    const date = document.getElementById("simplesDate").value;
    const data = await rtcRequest(`/api/rtc/simples-activities?data=${encodeURIComponent(date)}`);
    document.getElementById("simplesRows").replaceChildren(...data.rows.map((activity) => {
      const row = document.createElement("tr");
      for (const value of [activity.codigo, activity.descricao, activity.rotuloAnexo || "-", activity.disponivel ? "Disponível" : "Não disponível"]) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
      return row;
    }));
    document.getElementById("simplesResults").hidden = false;
    const source = document.getElementById("simplesSource");
    source.hidden = false;
    source.textContent = `Fonte: ${data.source} | motor ${data.engineVersion} | base ${data.databaseVersion || "não informada"} | consulta ${new Date(data.queriedAt).toLocaleString("pt-BR")}`;
    message.textContent = `${data.rows.length} atividades retornadas.`;
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
});
document.getElementById("codeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const kind = document.getElementById("codeKind").value;
  const code = document.getElementById("codeValue").value.trim();
  const date = document.getElementById("codeDate").value;
  const message = document.getElementById("codeMessage");
  const result = document.getElementById("codeResult");
  const source = document.getElementById("codeSource");
  result.hidden = true;
  source.hidden = true;
  if (!new RegExp(`^\\d{${kind === "ncm" ? 8 : 9}}$`).test(code)) {
    message.textContent = "Informe um NCM de 8 dígitos ou NBS de 9 dígitos.";
    return;
  }
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  message.textContent = "Consultando o motor oficial...";
  try {
    const data = await rtcRequest(`/api/rtc/code?${new URLSearchParams({ tipo: kind, codigo: code, data: date })}`);
    source.textContent = `Fonte: ${data.source} | motor ${data.engineVersion} | base ${data.databaseVersion || "não informada"} | consulta ${new Date(data.queriedAt).toLocaleString("pt-BR")}`;
    source.hidden = false;
    result.textContent = JSON.stringify(data.details, null, 2);
    result.hidden = false;
    message.textContent = "Dados de referência do motor. O enquadramento tributário exige análise adicional; valores de Imposto Seletivo podem ser de homologação.";
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
});
const now = new Date();
document.getElementById("operationDate").value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
document.getElementById("simplesDate").value = document.getElementById("operationDate").value;
document.getElementById("codeDate").value = document.getElementById("operationDate").value;

const session = readSession();
if (session?.access_token) loadStatus(session.access_token).catch((error) => showLogin(error.message));
else showLogin();
