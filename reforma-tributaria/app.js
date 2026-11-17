const STORAGE_KEY = "luce-rtc-session";
const loginView = document.getElementById("loginView");
const workspace = document.getElementById("workspace");
const loginMessage = document.getElementById("loginMessage");
const workspaceMessage = document.getElementById("workspaceMessage");
const logout = document.getElementById("logout");

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
}

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

const session = readSession();
if (session?.access_token) loadStatus(session.access_token).catch((error) => showLogin(error.message));
else showLogin();
