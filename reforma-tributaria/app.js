const STORAGE_KEY = "luce-rtc-session";
const loginView = document.getElementById("loginView");
const workspace = document.getElementById("workspace");
const loginMessage = document.getElementById("loginMessage");
const workspaceMessage = document.getElementById("workspaceMessage");
const logout = document.getElementById("logout");
let catalog = [];
let organizations = [];

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
    const messages = { store_not_configured: "Cadastro ainda não configurado.", store_unavailable: "Cadastro temporariamente indisponível.", bootstrap_forbidden: "Somente o administrador principal pode criar organizações.", invalid_cnpj: "CNPJ inválido.", invalid_name: "Informe um nome válido.", company_exists: "Esta empresa já está cadastrada nesta organização.", company_write_forbidden: "Seu perfil não permite cadastrar empresas.", organization_forbidden: "Você não possui acesso a esta organização." };
    throw new Error(messages[data.code] || "Não foi possível concluir a operação.");
  }
  return data;
}

async function loadCompanies() {
  const organization = organizations.find((item) => item.id === document.getElementById("organizationSelect").value);
  const form = document.getElementById("companyForm");
  form.hidden = !organization || organization.role !== "admin";
  if (!organization) return;
  const data = await rtcRequest(`/api/rtc/companies?organization_id=${encodeURIComponent(organization.id)}`);
  const body = document.getElementById("companyRows");
  body.replaceChildren(...data.companies.map((company) => {
    const row = document.createElement("tr");
    for (const value of [company.cnpj, company.legal_name, company.trade_name || "-"]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    return row;
  }));
  document.getElementById("registryMessage").textContent = data.companies.length ? "" : "Nenhuma empresa cadastrada nesta organização.";
}

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
    const response = await fetch("/api/onboarding/login", {
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
const now = new Date();
document.getElementById("operationDate").value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

const session = readSession();
if (session?.access_token) loadStatus(session.access_token).catch((error) => showLogin(error.message));
else showLogin();
