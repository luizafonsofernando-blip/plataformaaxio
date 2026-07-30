(function () {
  const SESSION_KEY = "onboardContabilSupabaseSession";
  const SUPABASE_URL = "https://prznhgwiibcazuwlwvnt.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_gQNx5ZW2OTr5J7jNgTQoOg_1n4ffmG4";

  function storedSession() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    } catch (_error) {
      return null;
    }
  }

  function saveSession(session) {
    const expiresAt = Date.now() + Math.max(0, Number(session.expires_in || 0) * 1000);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, expires_at_ms: expiresAt }));
  }

  function friendlyError(error) {
    if (error?.name === "AbortError") return "O servidor demorou para responder. Tente novamente.";
    if (error?.code === "account_pending") return "Cadastro aguardando aprovação do administrador.";
    if (error?.code === "too_many_attempts") return "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.";
    return "E-mail, usuário ou senha inválidos.";
  }

  async function loginWithSupabaseFunction(identifier, password) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/login`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ identifier, password }),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const authError = new Error("Credenciais inválidas.");
        authError.code = data.code || "invalid_credentials";
        throw authError;
      }
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function loginWithIdentifier(identifier, password) {
    const normalized = String(identifier || "").trim().toLowerCase();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch("/api/onboarding/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: normalized, password }),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) return data;
      if (data.code === "account_pending") {
        const pendingError = new Error("Cadastro pendente.");
        pendingError.code = "account_pending";
        throw pendingError;
      }
      return loginWithSupabaseFunction(normalized, password);
    } finally {
      clearTimeout(timeout);
    }
  }

  function renderLogin() {
    document.body.classList.add("cerne-auth-locked");
    const screen = document.createElement("section");
    screen.className = "cerne-login-screen";
    screen.innerHTML = `
      <form class="cerne-login-card" autocomplete="off">
        <img src="/cerne/cerne-logo.png" alt="CERNE" class="cerne-login-logo">
        <div>
          <p>CERNE</p>
          <h1>Acesso seguro</h1>
          <span>Use o mesmo usuário ativo do Onboarding Contábil.</span>
        </div>
        <label>E-mail ou usuário<input name="identifier" type="text" autocomplete="username" required></label>
        <label>Senha<input name="password" type="password" autocomplete="current-password" required></label>
        <button type="submit">Entrar</button>
        <strong class="cerne-login-message" role="status" aria-live="polite"></strong>
      </form>
    `;
    document.body.prepend(screen);
    const form = screen.querySelector("form");
    const button = screen.querySelector("button");
    const message = screen.querySelector(".cerne-login-message");
    setTimeout(() => form.elements.identifier.focus(), 80);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      message.textContent = "";
      button.disabled = true;
      button.textContent = "Entrando...";
      try {
        const session = await loginWithIdentifier(form.elements.identifier.value, form.elements.password.value);
        saveSession(session);
        window.location.reload();
      } catch (error) {
        form.elements.password.value = "";
        form.elements.password.focus();
        message.textContent = friendlyError(error);
      } finally {
        button.disabled = false;
        button.textContent = "Entrar";
      }
    });
  }

  const session = storedSession();
  if (!session?.access_token) renderLogin();
})();
