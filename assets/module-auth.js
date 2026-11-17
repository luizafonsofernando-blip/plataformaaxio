(function () {
  const config = window.LuceModuleAuth || {};
  const moduleId = String(config.moduleId || "module").replace(/[^\w-]/g, "-").toLowerCase();
  const storageKey = `luce-auth-${moduleId}`;
  const loginTitle = config.title || "Acesso seguro";
  const moduleName = config.moduleName || loginTitle;
  const appSelector = config.appSelector || "main,.app-shell,.app";
  const returnTarget = new URLSearchParams(window.location.search).get("return") || "";
  const supabaseUrl = "https://prznhgwiibcazuwlwvnt.supabase.co";
  const publishableKey = "sb_publishable_gQNx5ZW2OTr5J7jNgTQoOg_1n4ffmG4";

  function storedSession() {
    try {
      const session = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (!session?.access_token || !session.expires_at_ms) {
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
    const previous = storedSession();
    sessionStorage.setItem(storageKey, JSON.stringify({ ...previous, ...session, expires_at_ms: expiresAt }));
  }

  function clearSession() {
    sessionStorage.removeItem(storageKey);
  }

  function setLocked(locked) {
    document.body.classList.toggle("module-auth-locked", locked);
    document.body.classList.toggle("module-authenticated", !locked);
    document.body.classList.toggle("auth-locked", locked);
    document.body.classList.toggle("authenticated", !locked);
    document.querySelectorAll(appSelector).forEach((el) => {
      if (!el.closest(".login-screen")) el.toggleAttribute("inert", locked);
    });
  }

  function messageFor(error) {
    if (error?.code === "email_not_confirmed") return "Confirme seu e-mail antes de entrar.";
    if (error?.name === "AbortError") return "O servidor demorou para responder. Tente novamente.";
    if (error?.code === "account_pending") return "Cadastro aguardando aprova\u00e7\u00e3o do administrador.";
    if (error?.code === "too_many_attempts") return "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.";
    if (error?.code === "module_forbidden") return "Usuário sem acesso autorizado a este módulo.";
    if (error?.code === "account_suspended") return "Sistema em manutenção, em caso de dúvidas contate o suporte";
    return "E-mail, usu\u00e1rio ou senha inv\u00e1lidos.";
  }

  async function login(identifier, password) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch("/api/onboarding/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: String(identifier || "").trim().toLowerCase(), password, profile: moduleId }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.message || "Credenciais inv\u00e1lidas.");
        error.code = data.code || "invalid_credentials";
        throw error;
      }
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function validateSession(session) {
    if (!session?.access_token) return false;
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${session.access_token}`,
      },
      cache: "no-store",
    });
    if (!response.ok) return false;
    const user = await response.json().catch(() => ({}));
    return user?.app_metadata?.status !== "suspended";
  }

  async function refreshSession(session = storedSession()) {
    if (!session?.refresh_token) return null;
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const refreshed = await response.json().catch(() => null);
    if (!refreshed?.access_token) return null;
    saveSession(refreshed);
    return storedSession();
  }

  function renderLogin() {
    setLocked(true);
    const screen = document.createElement("section");
    screen.className = "login-screen module-login-screen";
    screen.innerHTML = `
      <aside class="luce-auth-story" aria-label="Identidade do m&oacute;dulo">
        <div class="luce-auth-copy">
          <small>${moduleName}</small>
          <h2>${config.headline || "Acesso individual por sistema."}</h2>
          <p>${config.description || "Use suas credenciais Luce. Esta sess&atilde;o &eacute; exclusiva deste m&oacute;dulo."}</p>
          <div class="luce-auth-points">
            <span>Sess&atilde;o isolada</span>
            <span>Mesmo usu&aacute;rio</span>
            <span>Logout individual</span>
          </div>
        </div>
        <span class="luce-auth-signature">Uma solu&ccedil;&atilde;o Luce</span>
      </aside>
      <form class="login-card" autocomplete="off">
        <div class="login-logo">
          <h1>${moduleName}</h1>
        </div>
        <label>E-mail ou usu&aacute;rio<input name="identifier" type="text" autocomplete="username" placeholder="Informe o e-mail ou usu&aacute;rio" required></label>
        <label>Senha<input name="password" type="password" autocomplete="current-password" placeholder="Informe a senha" required></label>
        <button class="btn primary" type="submit">Entrar</button>
        <strong class="login-error" role="status" aria-live="polite"></strong>
      </form>
    `;
    document.body.prepend(screen);
    const form = screen.querySelector("form");
    const button = form.querySelector('button[type="submit"]');
    const message = screen.querySelector(".login-error");
    const password = form.elements.password;
    if (moduleId === "sentinela") {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "btn";
      toggle.textContent = "Criar conta";
      form.append(toggle);
      const registration = document.createElement("form");
      registration.className = "login-card";
      registration.hidden = true;
      registration.style.display = "none";
      registration.innerHTML = `
        <div class="login-logo"><h1>Criar conta no Sentinela</h1></div>
        <label>Nome<input name="name" autocomplete="name" minlength="2" maxlength="80" required></label>
        <label>Usuário<input name="username" autocomplete="username" minlength="3" maxlength="60" required></label>
        <label>E-mail<input name="email" type="email" autocomplete="email" required></label>
        <label>Senha<input name="password" type="password" autocomplete="new-password" minlength="6" maxlength="20" placeholder="De 6 a 20 caracteres" required></label>
        <label>Confirmar senha<input name="confirmation" type="password" autocomplete="new-password" minlength="6" maxlength="20" required></label>
        <button class="btn primary" type="submit">Criar conta</button>
        <strong role="status" aria-live="polite"></strong>
        <button class="btn" type="button">Voltar ao login</button>`;
      screen.append(registration);
      toggle.addEventListener("click", () => {
        form.hidden = true;
        form.style.display = "none";
        registration.hidden = false;
        registration.style.display = "";
        registration.elements.name.focus();
      });
      registration.querySelector('button[type="button"]').addEventListener("click", () => {
        registration.hidden = true;
        registration.style.display = "none";
        form.hidden = false;
        form.style.display = "";
        form.elements.identifier.focus();
      });
      registration.addEventListener("submit", async event => {
        event.preventDefault();
        const notice = registration.querySelector('[role="status"]');
        const submit = registration.querySelector('[type="submit"]');
        if (submit.disabled) return;
        if (registration.elements.password.value !== registration.elements.confirmation.value) {
          notice.textContent = "As senhas não coincidem.";
          return;
        }
        submit.disabled = true;
        notice.textContent = "Enviando cadastro...";
        try {
          const data = Object.fromEntries(new FormData(registration));
          delete data.confirmation;
          const response = await fetch('/api/onboarding/register', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...data, profile: 'sentinela' }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Não foi possível criar a conta.');
          registration.reset();
          notice.textContent = result.message || 'Cadastro realizado. Confira seu e-mail para confirmar a conta e depois entre no Sentinela.';
        } catch (error) {
          notice.textContent = error.message || 'Não foi possível criar a conta. Tente novamente.';
        } finally {
          submit.disabled = false;
        }
      });
    }
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
    refresh: refreshSession,
    logout() {
      clearSession();
      window.location.reload();
    },
  };

  const initialSession = storedSession();
  if (initialSession) {
    const prepareSession = initialSession.expires_at_ms <= Date.now()
      ? refreshSession(initialSession)
      : Promise.resolve(initialSession);
    prepareSession.then((activeSession) => activeSession && validateSession(activeSession)).then((valid) => {
      if (valid) setLocked(false);
      else {
        clearSession();
        renderLogin();
        const message = document.querySelector(".module-login-screen .login-error");
        if (message) message.textContent = "Sistema em manutenção, em caso de dúvidas contate o suporte";
      }
    }).catch(() => {
      clearSession();
      renderLogin();
    });
    setInterval(async () => {
      let session = storedSession();
      const hadSession = Boolean(session);
      if (session?.expires_at_ms <= Date.now() + 120000) session = await refreshSession(session).catch(() => null);
      if (hadSession && !session) {
        clearSession();
        window.location.reload();
        return;
      }
      if (session && !(await validateSession(session).catch(() => false))) {
        clearSession();
        window.location.reload();
      }
    }, 60000);
  } else renderLogin();
})();
