(function () {
  const config = window.LuceModuleAuth || {};
  const moduleId = String(config.moduleId || "module").replace(/[^\w-]/g, "-").toLowerCase();
  const storageKey = `luce-auth-${moduleId}`;
  const loginTitle = config.title || "Acesso seguro";
  const moduleName = config.moduleName || loginTitle;
  const appSelector = config.appSelector || "main,.app-shell,.app";
  const returnTarget = new URLSearchParams(window.location.search).get("return") || "";

  function storedSession() {
    try {
      const session = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (!session?.access_token || !session.expires_at_ms || session.expires_at_ms <= Date.now()) {
        sessionStorage.removeItem(storageKey);
        return null;
      }
      return session;
    } catch (_error) {
      sessionStorage.removeItem(storageKey);
      return null;
    }
  }

  function saveSession(session) {
    const expiresAt = Date.now() + Math.max(0, Number(session.expires_in || 0) * 1000);
    sessionStorage.setItem(storageKey, JSON.stringify({ ...session, expires_at_ms: expiresAt }));
  }

  function clearSession() {
    sessionStorage.removeItem(storageKey);
  }

  function setLocked(locked) {
    document.body.classList.toggle("module-auth-locked", locked);
    document.body.classList.toggle("module-authenticated", !locked);
    document.querySelectorAll(appSelector).forEach((el) => {
      if (!el.closest(".module-login-screen")) el.toggleAttribute("inert", locked);
    });
  }

  function messageFor(error) {
    if (error?.name === "AbortError") return "O servidor demorou para responder. Tente novamente.";
    if (error?.code === "account_pending") return "Cadastro aguardando aprovação do administrador.";
    if (error?.code === "too_many_attempts") return "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.";
    return "E-mail, usuário ou senha inválidos.";
  }

  async function login(identifier, password) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch("/api/onboarding/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: String(identifier || "").trim().toLowerCase(), password }),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.message || "Credenciais inválidas.");
        error.code = data.code || "invalid_credentials";
        throw error;
      }
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  function renderLogin() {
    setLocked(true);
    const screen = document.createElement("section");
    screen.className = "module-login-screen";
    screen.innerHTML = `
      <aside class="luce-auth-story" aria-label="Identidade do módulo">
        <div class="luce-auth-brand"><img src="/assets/logo-luce-oficial.png" alt="Luce Sistemas"></div>
        <div class="luce-auth-copy">
          <small>${moduleName}</small>
          <h2>${config.headline || "Acesso individual por sistema."}</h2>
          <p>${config.description || "Use suas credenciais Luce. Esta sessão é exclusiva deste módulo."}</p>
          <div class="luce-auth-points">
            <span>Sessão isolada</span>
            <span>Mesmo usuário</span>
            <span>Logout individual</span>
          </div>
        </div>
        <span class="luce-auth-signature">Uma solução Luce</span>
      </aside>
      <form class="module-login-card" autocomplete="off">
        <img src="/assets/logo-luce-oficial.png" alt="Luce" class="module-login-logo">
        <div>
          <p>${moduleName}</p>
          <h1>${loginTitle}</h1>
          <span>Informe e-mail ou usuário e senha para acessar este sistema.</span>
        </div>
        <label>E-mail ou usuário<input name="identifier" type="text" autocomplete="username" required></label>
        <label>Senha
          <span class="password-field">
            <input name="password" type="password" autocomplete="current-password" required>
            <button type="button" data-toggle-password aria-label="Exibir senha">Ver</button>
          </span>
        </label>
        <button type="submit">Entrar</button>
        <strong class="module-login-message" role="status" aria-live="polite"></strong>
      </form>
    `;
    document.body.prepend(screen);
    const form = screen.querySelector("form");
    const button = form.querySelector('button[type="submit"]');
    const message = screen.querySelector(".module-login-message");
    const password = form.elements.password;
    screen.querySelector("[data-toggle-password]").addEventListener("click", (event) => {
      password.type = password.type === "password" ? "text" : "password";
      event.currentTarget.textContent = password.type === "password" ? "Ver" : "Ocultar";
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      message.textContent = "";
      button.disabled = true;
      button.textContent = "Entrando...";
      try {
        const session = await login(form.elements.identifier.value, password.value);
        saveSession(session);
        if (returnTarget && returnTarget.startsWith("/") && !returnTarget.startsWith("//")) window.location.replace(returnTarget);
        else window.location.reload();
      } catch (error) {
        password.value = "";
        password.focus();
        message.textContent = messageFor(error);
      } finally {
        button.disabled = false;
        button.textContent = "Entrar";
      }
    });
    setTimeout(() => form.elements.identifier.focus(), 80);
  }

  window.LuceModuleSession = {
    key: storageKey,
    get: storedSession,
    logout() {
      clearSession();
      window.location.reload();
    }
  };

  if (storedSession()) setLocked(false);
  else renderLogin();
})();
