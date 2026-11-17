
    const $ = (id) => document.getElementById(id);
    const socios = [];
    const aberturaAdministradores = [];
    const usuariosExternos = [];
    let currentDoc = "briefing";
    let aberturaCompletaLiberada = false;
    let currentDocumentSerial = "";
    let activeDraftId = "";
    let activeHistoryId = "";
    let activeHistoryStatus = "";
    let openingConclusionId = "";
    let openingConclusionMode = false;
    let restoredOpeningBriefingCompleted = false;
    let restoringHistoryState = false;
    let restoredFinalHistoryMode = false;
    let historyCache = [];
    let historyLoaded = false;
    let pendingHistoryDeleteId = "";
    let historyDeleteBusy = false;
    let historySaveBusy = false;
    const PROFILE_KEY = "implantadorClientesPerfil";
    const USER_KEY = "implantadorClientesUsu?rio";
    const ROLE_KEY = "implantadorClientesPapel";
    const HISTORY_KEY = "onboardContabilHistoricoDocumentos";
    const HISTORY_LOCAL_KEY = "luceOnboardingHistoricoDocumentos";
    const HISTORY_DELETED_KEY = "luceOnboardingHistoricoDocumentosExcluidos";
    const SUPABASE_URL = "https://prznhgwiibcazuwlwvnt.supabase.co";
    const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_gQNx5ZW2OTr5J7jNgTQoOg_1n4ffmG4";
    const SUPABASE_SESSION_KEY = "luce-auth-onboarding-contabil";
    const SUPABASE_ACTIVITY_KEY = `${SUPABASE_SESSION_KEY}:lastActivity`;
    const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000;
    const ACTIVITY_WRITE_INTERVAL_MS = 30 * 1000;
    let inactivityTimer = null;
    let lastActivityWriteAt = 0;
    const allSteps = ["tipoBriefingSecao", "indicacaoClienteSecao", "contadorAnteriorSecao", "briefingAbertura", "propostaComercialSecao", "empresa", "alvaraSecao", "usuariosExternosSecao", "socios", "financeiro", "informativo", "setores", "implantacao", "documentos"];
    let highestUnlockedIndex = 0;

    function tipoBriefing() {
      return value("tipoBriefing", "");
    }

    function activeProfile() {
      return sessionStorage.getItem(PROFILE_KEY) || "orteconte";
    }

    function activeUsername() {
      return sessionStorage.getItem(USER_KEY) || "Usuário não identificado";
    }

    function setProfile(profile = "orteconte") {
      const normalized = profile === "simao" ? "simao" : "orteconte";
      document.body.classList.toggle("profile-simao", normalized === "simao");
      document.body.classList.toggle("profile-orteconte", normalized === "orteconte");
      sessionStorage.setItem(PROFILE_KEY, normalized);
      if ($("documentPreview")) render();
    }

    function documentBrand() {
      if (activeProfile() === "simao") {
        return {
          name: "Simão Contabilidade",
          logo: "logo-simao-contabilidade.png",
          logoClass: "simao-doc-logo-bar",
          footerClass: "simao-doc-footer"
        };
      }
      return {
        name: "Orteconte Contabilidade",
        logo: "timbrado-orteconte.png",
        logoClass: "",
        footerClass: ""
      };
    }

    function printableProfileClass() {
      return activeProfile() === "simao" ? "profile-simao" : "profile-orteconte";
    }

    function setAuthenticated(active, profile = activeProfile(), username = activeUsername()) {
      document.body.classList.remove("auth-checking");
      document.body.classList.toggle("authenticated", active);
      document.body.classList.toggle("auth-locked", !active);
      if (active) {
        sessionStorage.setItem(USER_KEY, username);
        setProfile(profile);
        touchSessionActivity(true);
      } else {
        sessionStorage.removeItem(PROFILE_KEY);
        sessionStorage.removeItem(USER_KEY);
        sessionStorage.removeItem(ROLE_KEY);
        document.body.classList.remove("profile-simao", "profile-orteconte");
        updateAdminAccess(null);
        stopInactivityTimer();
      }
    }

    function updateAdminAccess(user) {
      const role = user?.app_metadata?.role || "";
      const isAdmin = role === "admin" && user?.app_metadata?.status === "approved";
      const isAdmin01 = isAdmin01User(user);
      if (user) sessionStorage.setItem(ROLE_KEY, isAdmin ? "admin" : "user");
      else sessionStorage.removeItem(ROLE_KEY);
      if ($("adminUsersButton")) $("adminUsersButton").hidden = !isAdmin01;
      if (isAdmin01) setTimeout(refreshAdminUsersBadge, 0);
      else updateAdminUsersBadge(0);
      if (!isAdmin01 && $("adminUsersDialog")?.open) $("adminUsersDialog").close();
    }

    function isCurrentUserAdmin() {
      const session = storedSupabaseSession();
      const user = session?.user || null;
      return sessionStorage.getItem(ROLE_KEY) === "admin" || (user?.app_metadata?.role === "admin" && user?.app_metadata?.status === "approved");
    }

    function isAdmin01User(user) {
      const email = String(user?.email || "").toLowerCase();
      const username = String(user?.user_metadata?.username || "").toLowerCase();
      const display = String(user?.user_metadata?.display_name || user?.user_metadata?.name || "").toLowerCase();
      return email === "luizafonsofernando@gmail.com" || username === "admin01" || display === "admin01";
    }

    function storedSupabaseSession() {
      try {
        return JSON.parse(sessionStorage.getItem(SUPABASE_SESSION_KEY) || "null");
      } catch (_error) {
        return null;
      }
    }

    function saveSupabaseSession(session) {
      const expiresAt = Date.now() + Math.max(0, Number(session.expires_in || 0) * 1000);
      sessionStorage.setItem(SUPABASE_SESSION_KEY, JSON.stringify({ ...session, expires_at_ms: expiresAt }));
    }

    function clearSupabaseSession() {
      sessionStorage.removeItem(SUPABASE_SESSION_KEY);
      sessionStorage.removeItem(SUPABASE_ACTIVITY_KEY);
      stopInactivityTimer();
    }

    function lastSessionActivityAt() {
      const activity = Number(sessionStorage.getItem(SUPABASE_ACTIVITY_KEY) || 0);
      return Number.isFinite(activity) ? activity : 0;
    }

    function touchSessionActivity(force = false) {
      if (!storedSupabaseSession()?.access_token) return;
      const now = Date.now();
      if (!force && now - lastActivityWriteAt < ACTIVITY_WRITE_INTERVAL_MS) return;
      lastActivityWriteAt = now;
      sessionStorage.setItem(SUPABASE_ACTIVITY_KEY, String(now));
      scheduleInactivityLogout();
    }

    function sessionExpiredByInactivity() {
      const lastActivity = lastSessionActivityAt();
      return Boolean(lastActivity && Date.now() - lastActivity >= INACTIVITY_TIMEOUT_MS);
    }

    function stopInactivityTimer() {
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
      }
    }

    function scheduleInactivityLogout() {
      stopInactivityTimer();
      const lastActivity = lastSessionActivityAt();
      if (!lastActivity) return;
      const remaining = INACTIVITY_TIMEOUT_MS - (Date.now() - lastActivity);
      inactivityTimer = setTimeout(async () => {
        if (sessionExpiredByInactivity()) {
          await autoSaveBeforeInactivityLogout();
          clearSupabaseSession();
          historyCache = [];
          historyLoaded = false;
          setAuthenticated(false);
          if ($("loginError")) $("loginError").textContent = "Sessão encerrada por inatividade. Entre novamente.";
          setTimeout(() => $("loginUser") && $("loginUser").focus(), 80);
        } else {
          scheduleInactivityLogout();
        }
      }, Math.max(1000, remaining));
    }

    function hasCurrentFormContent() {
      return Array.from(document.querySelectorAll(".app-shell input, .app-shell select, .app-shell textarea")).some((field) => {
        if (!field.id || field.type === "file" || /^(login|registration|adminUsers|passwordReset|resetNewPassword|resetCode)/i.test(field.id)) return false;
        if (field.type === "checkbox" || field.type === "radio") return field.checked;
        return Boolean(String(field.value || "").trim());
      }) || socios.length > 0 || aberturaAdministradores.length > 0 || usuariosExternos.length > 0;
    }

    async function autoSaveBeforeInactivityLogout() {
      if (!document.body.classList.contains("authenticated")) return;
      if (!storedSupabaseSession()?.access_token) return;
      if (!hasCurrentFormContent()) return;
      try {
        await saveDraftToHistory({ silent: true, reason: "inactivity" });
      } catch (error) {
        console.warn("Não foi possível salvar rascunho automático antes de encerrar a sessão por inatividade.", error);
      }
    }

    function setupInactivityTracking() {
      const events = ["click", "keydown", "input", "scroll", "pointerdown", "touchstart"];
      const recordActivity = () => {
        if (!document.body.classList.contains("authenticated")) return;
        touchSessionActivity(false);
      };
      events.forEach((eventName) => {
        window.addEventListener(eventName, recordActivity, { capture: true, passive: true });
      });
    }

    async function supabaseAuthRequest(path, { method = "GET", body, accessToken } = {}) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
          method,
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const error = new Error(data.msg || data.message || data.error_description || "Falha de autenticação.");
          error.code = data.error_code || data.code || data.error;
          throw error;
        }
        return data;
      } finally {
        clearTimeout(timeout);
      }
    }

    async function supabaseDataRequest(path, { method = "GET", body, prefer = "" } = {}) {
      let session = storedSupabaseSession();
      if (!session?.access_token) throw new Error("Sessão expirada. Entre novamente.");
      if (!session.expires_at_ms || session.expires_at_ms <= Date.now() + 60000) {
        session = await refreshSupabaseSession(session);
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
          method,
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
            ...(prefer ? { Prefer: prefer } : {})
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal
        });
        const text = await response.text();
        const data = text ? JSON.parse(text) : null;
        if (!response.ok) throw new Error(data?.message || data?.details || "Não foi possível acessar o histórico.");
        return data;
      } finally {
        clearTimeout(timeout);
      }
    }

    function profileFromSupabaseUser(user) {
      const requestedProfile = user && (user.user_metadata?.profile || user.app_metadata?.profile);
      return requestedProfile === "simao" ? "simao" : "orteconte";
    }

    function userCanAccessOnboarding(user) {
      if (user?.app_metadata?.role === "admin") return true;
      const modules = Array.isArray(user?.app_metadata?.allowed_modules) ? user.app_metadata.allowed_modules : [];
      if (modules.length) return modules.includes("onboarding");
      const profile = String(user?.user_metadata?.profile || "").toLowerCase();
      return !profile || profile === "orteconte" || profile === "simao";
    }

    function usernameFromSupabaseUser(user) {
      return user?.user_metadata?.display_name || user?.user_metadata?.name || user?.email || "Usuário autenticado";
    }

    async function refreshSupabaseSession(session) {
      if (!session?.refresh_token) throw new Error("Sessão expirada.");
      const refreshed = await supabaseAuthRequest("token?grant_type=refresh_token", {
        method: "POST",
        body: { refresh_token: session.refresh_token }
      });
      saveSupabaseSession(refreshed);
      return refreshed;
    }

    async function restoreSupabaseSession() {
      let session = storedSupabaseSession();
      if (!session?.access_token) return null;
      if (sessionExpiredByInactivity()) {
        clearSupabaseSession();
        return null;
      }
      try {
        if (!session.expires_at_ms || session.expires_at_ms <= Date.now() + 60000) {
          session = await refreshSupabaseSession(session);
        }
        const user = await supabaseAuthRequest("user", { accessToken: session.access_token });
        if (user?.app_metadata?.status !== "approved" || !userCanAccessOnboarding(user)) {
          clearSupabaseSession();
          return null;
        }
        return { session, user };
      } catch (_error) {
        clearSupabaseSession();
        return null;
      }
    }

    function startAccountStatusMonitor() {
      setInterval(async () => {
        const session = storedSupabaseSession();
        if (!session?.access_token || !document.body.classList.contains("authenticated")) return;
        try {
          const user = await supabaseAuthRequest("user", { accessToken: session.access_token });
          if (user?.app_metadata?.status === "suspended") {
            clearSupabaseSession();
            historyCache = [];
            historyLoaded = false;
            setAuthenticated(false);
            if ($("loginError")) $("loginError").textContent = "Sistema em manutenção, em caso de dúvidas contate o suporte";
          }
        } catch (_error) {
          // Falhas transitórias de rede não encerram uma sessão válida.
        }
      }, 60000);
    }

    function friendlyLoginError(error) {
      if (error?.name === "AbortError") return "O Supabase demorou para responder. Tente novamente.";
      if (error?.code === "account_pending") return "Confirme o e-mail antes de entrar.";
      if (error?.code === "too_many_attempts") return "Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.";
      if (error?.code === "module_forbidden") return "Usuário sem acesso autorizado ao Onboarding Contábil.";
      if (error?.code === "account_suspended") return "Sistema em manutenção, em caso de dúvidas contate o suporte";
      if (error?.code === "invalid_credentials") return "E-mail, usuário ou senha inválidos.";
      if (error?.code === "email_not_confirmed") return "Confirme o e-mail antes de entrar.";
      return "Não foi possível entrar. Verifique os dados e a conexão.";
    }

    async function loginWithIdentifier(identifier, password) {
      const normalized = String(identifier || "").trim().toLowerCase();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch("/api/onboarding/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ identifier: normalized, password, profile: "onboarding" }),
          signal: controller.signal
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok) return data;
        if (data.code === "account_pending") {
          const pendingError = new Error("Cadastro pendente.");
          pendingError.code = "account_pending";
          throw pendingError;
        }
        const authError = new Error("Credenciais invalidas.");
        authError.code = data.code || "invalid_credentials";
        throw authError;
      } finally {
        clearTimeout(timeout);
      }
    }
    async function supabaseFunctionRequest(functionName, { method = "POST", body, accessToken } = {}) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const [routeName, routeQuery = ""] = String(functionName).split("?");
      const localApiRoutes = {
        "admin-users": "/api/onboarding/admin-users",
        "onboarding-documents": "/api/onboarding/onboarding-documents",
        "request-registration": "/api/onboarding/register"
      };
      const url = localApiRoutes[routeName]
        ? `${localApiRoutes[routeName]}${routeQuery ? `?${routeQuery}` : ""}`
        : `${SUPABASE_URL}/functions/v1/${functionName}`;
      try {
        const requestOptions = {
          method,
          headers: {
            ...(localApiRoutes[routeName] ? {} : { apikey: SUPABASE_PUBLISHABLE_KEY }),
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal
        };
        let response = await fetch(url, requestOptions);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (localApiRoutes[routeName] && routeName === "onboarding-documents") {
            response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
              ...requestOptions,
              headers: {
                apikey: SUPABASE_PUBLISHABLE_KEY,
                "Content-Type": "application/json",
                ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
              }
            });
            const fallbackData = await response.json().catch(() => ({}));
            if (response.ok) return fallbackData;
            const fallbackError = new Error(fallbackData.error || data.error || "Nao foi possivel concluir a operacao.");
            fallbackError.code = fallbackData.code || data.code || "function_error";
            throw fallbackError;
          }
          const functionError = new Error(data.error || "Não foi possível concluir a operação.");
          functionError.code = data.code || "function_error";
          throw functionError;
        }
        return data;
      } finally {
        clearTimeout(timeout);
      }
    }

    async function setupLogin() {
      const form = $("loginForm");
      if (!form) return;
      const user = $("loginUser");
      const password = $("loginPassword");
      const button = $("loginButton");
      const error = $("loginError");
      setTimeout(() => user && user.focus(), 80);
      const submitLogin = async (event) => {
        event.preventDefault();
        if (error) error.textContent = "";
        if (button) {
          button.disabled = true;
          button.textContent = "Entrando...";
        }
        try {
          const session = await loginWithIdentifier(value("loginUser", ""), value("loginPassword", ""));
          saveSupabaseSession(session);
          setAuthenticated(true, profileFromSupabaseUser(session.user), usernameFromSupabaseUser(session.user));
          updateAdminAccess(session.user);
          await loadHistoryFromSupabase();
          if (password) {
            password.value = "";
          }
        } catch (loginError) {
          clearSupabaseSession();
          if (error) error.textContent = friendlyLoginError(loginError);
          if (password) {
            password.value = "";
            password.focus();
          }
        } finally {
          if (button) {
            button.disabled = false;
            button.textContent = "Entrar";
          }
        }
      };
      if (form.dataset.loginReady !== "true") {
        form.dataset.loginReady = "true";
        form.addEventListener("submit", submitLogin);
      }

      try {
        const restored = await restoreSupabaseSession();
        if (restored) {
          setAuthenticated(true, profileFromSupabaseUser(restored.user), usernameFromSupabaseUser(restored.user));
          updateAdminAccess(restored.user);
          await loadHistoryFromSupabase();
          return;
        }
      } catch (_restoreError) {
        clearSupabaseSession();
      }
      setAuthenticated(false);
    }

    setupInactivityTracking();
    startAccountStatusMonitor();
    setupLogin();

    function setAccountStatus(element, message = "", success = false) {
      if (!element) return;
      element.textContent = message;
      element.classList.toggle("success", success);
    }

    function validAccountPassword(password) {
      return String(password || "").length >= 6 && String(password || "").length <= 20;
    }

    let recoveryAccessToken = "";
    let adminAvailableModules = [];
    let adminCanManagePermissions = false;
    let adminActiveUsers = [];

    function recoveryRedirectUrl() {
      const url = new URL(window.location.href);
      url.hash = "";
      url.searchParams.set("recovery", "1");
      return url.toString();
    }

    async function sendPasswordRecoveryLink(email) {
      return supabaseAuthRequest(`recover?redirect_to=${encodeURIComponent(recoveryRedirectUrl())}`, {
        method: "POST",
        body: {
          email
        }
      });
    }

    async function updatePasswordWithRecoverySession(accessToken, password) {
      return supabaseAuthRequest("user", {
        method: "PUT",
        accessToken,
        body: { password }
      });
    }

    function recoveryParamsFromUrl() {
      const hashParams = new URLSearchParams(String(window.location.hash || "").replace(/^#/, ""));
      const searchParams = new URLSearchParams(window.location.search || "");
      return {
        accessToken: hashParams.get("access_token") || searchParams.get("access_token") || "",
        type: hashParams.get("type") || searchParams.get("type") || searchParams.get("recovery") || ""
      };
    }

    function dateTimeLabel(raw) {
      if (!raw) return "Data e hora nao informadas";
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return "Data e hora nao informadas";
      return date.toLocaleString("pt-BR");
    }

    function renderPendingUsers(users = []) {
      const list = $("pendingUsersList");
      if (!list) return;
      if (!users.length) {
        list.innerHTML = `
          <div class="pending-user">
            <strong>Nenhum cadastro aguardando confirmação.</strong>
          </div>
        `;
        return;
      }
      list.innerHTML = `
        <article class="pending-user">
          <strong>${users.length} cadastro(s) aguardando confirmação de e-mail</strong>
          <span>Esses usuários terão acesso automaticamente após confirmarem o endereço de e-mail.</span>
        </article>
      ` + users.map((user) => `
        <article class="pending-user">
          <strong>${escapeHtml(user.name || "Nome nao informado")}</strong>
          <span>@${escapeHtml(user.username || "sem-usuário")} - ${escapeHtml(user.email || "")}</span>
          <span>Perfil: ${escapeHtml(user.profile || "orteconte")}</span>
          <span>Solicitado em: ${escapeHtml(dateTimeLabel(user.requested_at || user.created_at))}</span>
          <span>Status: aguardando confirmação de e-mail</span>
          <div class="pending-user-actions">
            <button class="btn danger" type="button" data-user-action="delete" data-user-id="${escapeHtml(user.id)}">Excluir</button>
          </div>
        </article>
      `).join("");
    }

    function renderActiveUsers(users = []) {
      const list = $("activeUsersList");
      if (!list) return;
      const statusFilter = $("adminUsersStatusFilter")?.value || "all";
      const search = String($("adminUsersSearch")?.value || "").trim().toLocaleLowerCase("pt-BR");
      users = users.filter((user) => {
        if (statusFilter !== "all" && user.status !== statusFilter) return false;
        if (!search) return true;
        const haystack = [user.name, user.username, user.email, user.role, user.status, ...(user.allowedModules || [])].join(" ").toLocaleLowerCase("pt-BR");
        return haystack.includes(search);
      });
      if (!users.length) {
        list.innerHTML = '<div class="pending-user"><strong>Nenhum usuário ativo encontrado.</strong></div>';
        return;
      }
      const modules = adminAvailableModules.length ? adminAvailableModules : [{ id: "onboarding", label: "Onboarding Contábil" }, { id: "property", label: "Property" }, { id: "comunicados", label: "Comunicados" }, { id: "review-folha", label: "Review Folha" }];
      list.innerHTML = users.map((user) => `
        <article class="pending-user ${user.isNew ? "is-new-user" : ""} ${user.status === "suspended" ? "is-suspended-user" : ""}">
          <strong>${escapeHtml(user.name || "Nome não informado")}${user.isNew ? ' <span class="user-new-badge">Novo</span>' : ""}</strong>
          <span>@${escapeHtml(user.username || "sem-usuário")} · ${escapeHtml(user.email || "")}</span>
          <span>Cadastrado em: ${escapeHtml(dateTimeLabel(user.created_at))}</span>
          <span>Confirmado em: ${escapeHtml(dateTimeLabel(user.confirmed_at) || "Ainda não confirmado")}</span>
          <span>Último acesso: ${escapeHtml(dateTimeLabel(user.last_sign_in_at) || "Sem registro")}</span>
          <span class="user-status-badge ${user.status === "suspended" ? "suspended" : ""}">${user.status === "suspended" ? "Suspenso" : "Ativo"}</span>
          <label class="user-access-role">Perfil
            <select data-user-role="${escapeHtml(user.id)}" ${adminCanManagePermissions && !user.isAdmin01 ? "" : "disabled"}>
              <option value="user" ${user.role === "admin" ? "" : "selected"}>Usuário comum</option>
              <option value="admin" ${user.role === "admin" ? "selected" : ""}>Administrador</option>
            </select>
          </label>
          <div class="user-access-matrix" aria-label="Módulos autorizados">
            ${modules.map((module) => {
              const checked = (user.allowedModules || []).includes(module.id);
              return `<label><input type="checkbox" data-user-module="${escapeHtml(user.id)}" value="${escapeHtml(module.id)}" ${checked ? "checked" : ""} ${adminCanManagePermissions && !user.isAdmin01 ? "" : "disabled"}>${escapeHtml(module.label)}</label>`;
            }).join("")}
          </div>
          <div class="pending-user-actions">
            ${adminCanManagePermissions && !user.isAdmin01
              ? `<button class="btn mini" type="button" data-user-action="update_access" data-user-id="${escapeHtml(user.id)}">Salvar acessos</button>`
              : user.isAdmin01 ? '<button class="btn mini" type="button" disabled>ADMIN 01</button>' : '<button class="btn mini" type="button" disabled>Somente ADMIN 01 altera acessos</button>'}
            ${user.canSuspend ? `<button class="btn mini" type="button" data-user-action="${user.status === "suspended" ? "reactivate" : "suspend"}" data-user-id="${escapeHtml(user.id)}">${user.status === "suspended" ? "Reativar usuário" : "Suspender usuário"}</button>` : ""}
            ${user.canDelete === false
              ? '<button class="btn mini" type="button" disabled>Usuário atual</button>'
              : `<button class="btn danger" type="button" data-user-action="delete" data-user-id="${escapeHtml(user.id)}">Excluir</button>`}
          </div>
        </article>
      `).join("");
    }

    function updateAdminUsersBadge(count = 0) {
      const badge = $("adminUsersBadge");
      if (!badge) return;
      const total = Math.max(0, Number(count) || 0);
      badge.hidden = total === 0;
      badge.textContent = total > 99 ? "99+" : String(total);
    }

    async function refreshAdminUsersBadge() {
      if (!isCurrentUserAdmin()) return updateAdminUsersBadge(0);
      const session = storedSupabaseSession();
      if (!session?.access_token) return updateAdminUsersBadge(0);
      try {
        const data = await supabaseFunctionRequest("admin-users?summary=1", {
          method: "GET",
          accessToken: session.access_token
        });
        updateAdminUsersBadge(data.newUsersCount || 0);
      } catch (_error) {
        updateAdminUsersBadge(0);
      }
    }

    async function loadAdminUsers() {
      const session = storedSupabaseSession();
      const status = $("adminUsersStatus");
      if (!session?.access_token) throw new Error("Sessão expirada.");
      setAccountStatus(status, "Carregando usuários...");
      const data = await supabaseFunctionRequest("admin-users", {
        method: "GET",
        accessToken: session.access_token
      });
      adminAvailableModules = data.modules || [];
      adminCanManagePermissions = Boolean(data.canManagePermissions);
      adminActiveUsers = data.activeUsers || [];
      renderPendingUsers(data.pendingUsers || data.users || []);
      renderActiveUsers(adminActiveUsers);
      updateAdminUsersBadge(0);
      const migration = data.admin01Migration || {};
      if (migration.status === "updated") setAccountStatus(status, `Admin01 atualizado para ${data.admin01Email || "luizafonsofernando@gmail.com"}.`, true);
      else if (migration.status === "target_exists") setAccountStatus(status, migration.message || "Ja existe outro usuário com o novo e-mail informado.", false);
      else if (migration.status === "failed") setAccountStatus(status, migration.message || "Nao foi possivel atualizar o e-mail do Admin01.", false);
      else setAccountStatus(status, "");
    }

    function setupAccountManagement() {
      const registrationDialog = $("registrationDialog");
      const registrationForm = $("registrationForm");
      const registrationStatus = $("registrationStatus");
      const passwordResetDialog = $("passwordResetDialog");
      const passwordResetForm = $("passwordResetForm");
      const passwordResetStatus = $("passwordResetStatus");
      const adminDialog = $("adminUsersDialog");

      const setRegistrationStep = () => {
        $("registrationCodeWrap")?.classList.toggle("hidden", true);
        if ($("registrationCode")) {
          $("registrationCode").required = false;
          $("registrationCode").value = "";
        }
        if ($("registrationSubmit")) $("registrationSubmit").textContent = "Solicitar cadastro";
      };

      $("openRegistration")?.addEventListener("click", () => {
        registrationForm?.reset();
        setRegistrationStep();
        setAccountStatus(registrationStatus, "");
        registrationDialog?.showModal();
        setTimeout(() => $("registrationName")?.focus(), 50);
      });
      $("closeRegistration")?.addEventListener("click", () => {
        setRegistrationStep();
        registrationDialog?.close();
      });
      $("openPasswordReset")?.addEventListener("click", () => {
        passwordResetForm?.reset();
        recoveryAccessToken = "";
        $("resetEmail")?.closest("label")?.classList.remove("hidden");
        if ($("resetEmail")) $("resetEmail").required = true;
        $("sendResetCode")?.closest(".account-dialog-actions")?.classList.remove("hidden");
        $("resetCodeWrap")?.classList.add("hidden");
        if ($("resetCode")) $("resetCode").required = false;
        $("resetNewPasswordWrap")?.classList.add("hidden");
        $("resetNewPasswordConfirmWrap")?.classList.add("hidden");
        $("passwordResetSubmitWrap")?.classList.add("hidden");
        if ($("resetNewPassword")) $("resetNewPassword").required = false;
        if ($("resetNewPasswordConfirm")) $("resetNewPasswordConfirm").required = false;
        setAccountStatus(passwordResetStatus, "");
        passwordResetDialog?.showModal();
        setTimeout(() => $("resetEmail")?.focus(), 50);
      });
      $("closePasswordReset")?.addEventListener("click", () => passwordResetDialog?.close());
      $("closeAdminUsers")?.addEventListener("click", () => adminDialog?.close());
      $("adminUsersStatusFilter")?.addEventListener("change", () => renderActiveUsers(adminActiveUsers));
      $("adminUsersSearch")?.addEventListener("input", () => renderActiveUsers(adminActiveUsers));

      registrationForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const password = value("registrationPassword", "");
        if (password !== value("registrationPasswordConfirm", "")) {
          setAccountStatus(registrationStatus, "As senhas não conferem.");
          return;
        }
        if (!validAccountPassword(password)) {
          setAccountStatus(registrationStatus, "A senha deve conter entre 6 e 20 caracteres.");
          return;
        }
        const submit = $("registrationSubmit");
        if (submit) {
          submit.disabled = true;
          submit.textContent = "Enviando...";
        }
        try {
          await supabaseFunctionRequest("request-registration", {
            body: {
              name: value("registrationName", "").trim(),
              username: value("registrationUsername", "").trim(),
              email: value("registrationEmail", "").trim().toLowerCase(),
              password,
              profile: value("registrationProfile", "orteconte")
            }
          });
          registrationForm.reset();
          setRegistrationStep();
          setAccountStatus(registrationStatus, "Cadastro realizado. Verifique seu e-mail para confirmar a conta e acessar o sistema.", true);
        } catch (error) {
          setAccountStatus(registrationStatus, error.message || "Não foi possível solicitar o cadastro.");
        } finally {
          if (submit) {
            submit.disabled = false;
            submit.textContent = "Solicitar cadastro";
          }
        }
      });

      $("resendConfirmation")?.addEventListener("click", async () => {
        const email = value("registrationEmail", "").trim().toLowerCase();
        const profile = value("registrationProfile", "orteconte");
        const button = $("resendConfirmation");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          setAccountStatus(registrationStatus, "Informe o e-mail cadastrado para reenviar a confirmação.");
          return;
        }
        if (button) {
          button.disabled = true;
          button.textContent = "Reenviando...";
        }
        try {
          const data = await supabaseFunctionRequest("request-registration", {
            body: { action: "resend_confirmation", email, profile }
          });
          setAccountStatus(registrationStatus, data.message || "Link de confirmação reenviado. Verifique sua caixa de entrada e spam.", true);
        } catch (error) {
          setAccountStatus(registrationStatus, error.message || "Não foi possível reenviar a confirmação.");
        } finally {
          if (button) {
            button.disabled = false;
            button.textContent = "Reenviar confirmação";
          }
        }
      });

      $("sendResetCode")?.addEventListener("click", async () => {
        const email = value("resetEmail", "").trim().toLowerCase();
        const button = $("sendResetCode");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          setAccountStatus(passwordResetStatus, "Informe um e-mail válido.");
          return;
        }
        if (button) {
          button.disabled = true;
          button.textContent = "Enviando...";
        }
        try {
          await sendPasswordRecoveryLink(email);
          setAccountStatus(passwordResetStatus, "Link de recuperação enviado. Abra o e-mail e clique no link para redefinir a senha.", true);
        } catch (error) {
          setAccountStatus(passwordResetStatus, error.message || "Não foi possível enviar o link de recuperação.");
        } finally {
          if (button) {
            button.disabled = false;
            button.textContent = "Enviar link de recuperação";
          }
        }
      });

      passwordResetForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const newPassword = value("resetNewPassword", "");
        if (newPassword !== value("resetNewPasswordConfirm", "")) {
          setAccountStatus(passwordResetStatus, "As senhas não conferem.");
          return;
        }
        if (!validAccountPassword(newPassword)) {
          setAccountStatus(passwordResetStatus, "A senha deve conter entre 6 e 20 caracteres.");
          return;
        }
        if (!recoveryAccessToken) {
          setAccountStatus(passwordResetStatus, "Solicite o link de recuperação pelo e-mail e acesse o link recebido antes de redefinir a senha.");
          return;
        }
        const submit = $("passwordResetSubmit");
        if (submit) {
          submit.disabled = true;
          submit.textContent = "Redefinindo...";
        }
        try {
          await updatePasswordWithRecoverySession(recoveryAccessToken, newPassword);
          recoveryAccessToken = "";
          clearSupabaseSession();
          passwordResetForm.reset();
          setAccountStatus(passwordResetStatus, "Senha alterada com sucesso. Use a nova senha para entrar.", true);
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete("recovery");
          cleanUrl.hash = "";
          window.history.replaceState({}, document.title, cleanUrl.toString());
        } catch (error) {
          setAccountStatus(passwordResetStatus, error.message || "Link inválido ou expirado. Solicite um novo link de recuperação.");
        } finally {
          if (submit) {
            submit.disabled = false;
            submit.textContent = "Redefinir senha";
          }
        }
      });

      const recovery = recoveryParamsFromUrl();
      if (recovery.accessToken && String(recovery.type).toLowerCase().includes("recovery")) {
        recoveryAccessToken = recovery.accessToken;
        passwordResetForm?.reset();
        $("resetEmail")?.closest("label")?.classList.add("hidden");
        if ($("resetEmail")) $("resetEmail").required = false;
        $("sendResetCode")?.closest(".account-dialog-actions")?.classList.add("hidden");
        $("resetCodeWrap")?.classList.add("hidden");
        if ($("resetCode")) $("resetCode").required = false;
        $("resetNewPasswordWrap")?.classList.remove("hidden");
        $("resetNewPasswordConfirmWrap")?.classList.remove("hidden");
        $("passwordResetSubmitWrap")?.classList.remove("hidden");
        if ($("resetNewPassword")) $("resetNewPassword").required = true;
        if ($("resetNewPasswordConfirm")) $("resetNewPasswordConfirm").required = true;
        setAccountStatus(passwordResetStatus, "Link validado. Informe a nova senha.", true);
        passwordResetDialog?.showModal();
        setTimeout(() => $("resetNewPassword")?.focus(), 50);
      }

      $("adminUsersButton")?.addEventListener("click", async () => {
        adminDialog?.showModal();
        try {
          await loadAdminUsers();
        } catch (error) {
          setAccountStatus($("adminUsersStatus"), error.message || "Não foi possível carregar os usuários.");
        }
      });

      $("adminUsersDialog")?.addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-user-action]");
        if (!button) return;
        const action = button.dataset.userAction;
        const userId = button.dataset.userId;
        if (action === "reject_all" && !window.confirm("Excluir todos os cadastros que ainda aguardam confirmação?")) return;
        if (action === "restore_from_history") return;
        if (action === "reject" && !window.confirm("Excluir este cadastro?")) return;
        if (action === "delete" && !window.confirm("Excluir este usuário ativo? Esta ação remove o acesso ao sistema.")) return;
        if (action === "update_access" && !window.confirm("Salvar as permissões deste usuário?")) return;
        if (action === "suspend" && !window.confirm("Suspender este usuário?\n\nO usuário perderá imediatamente o acesso aos módulos atualmente habilitados. Seus dados e permissões serão preservados para eventual reativação.")) return;
        if (action === "reactivate" && !window.confirm("Reativar este usuário com os mesmos módulos e permissões anteriores?")) return;
        const session = storedSupabaseSession();
        if (!session?.access_token) return;
        const selectedModules = action === "update_access"
          ? [...document.querySelectorAll(`[data-user-module="${CSS.escape(userId)}"]:checked`)].map((input) => input.value)
          : undefined;
        const selectedRole = action === "update_access" ? document.querySelector(`[data-user-role="${CSS.escape(userId)}"]`)?.value || "user" : undefined;
        button.disabled = true;
        try {
          const result = await supabaseFunctionRequest("admin-users", {
            body: { userId, action, allowedModules: selectedModules, role: selectedRole },
            accessToken: session.access_token
          });
          if (result?.message) setAccountStatus($("adminUsersStatus"), result.message, true);
          await loadAdminUsers();
        } catch (error) {
          button.disabled = false;
          setAccountStatus($("adminUsersStatus"), error.message || "Não foi possível atualizar o usuário.");
        }
      });
    }

    function tipoPessoa() {
      if (isAlteracaoWorkflow()) return "Pessoa jurídica";
      return value("tipoPessoa", "");
    }

    function isEntradaAberturaWorkflow() {
      return tipoBriefing() === "BRIEFING ABERTURA" || tipoBriefing() === "PORTABILIDADE ENTRADA";
    }

    function hasReceitaImobiliariaQuestion() {
      return tipoBriefing() === "BRIEFING ABERTURA" || tipoBriefing() === "PORTABILIDADE ENTRADA" || tipoBriefing() === "ALTERAÇÃO CONTRATUAL";
    }

    function isPortabilidadeEntradaWorkflow() {
      return tipoBriefing() === "PORTABILIDADE ENTRADA";
    }

    function isBriefingAberturaWorkflow() {
      return tipoBriefing() === "BRIEFING ABERTURA";
    }

    function isPropostaComercialWorkflow() {
      return tipoBriefing() === "PROPOSTA COMERCIAL";
    }

    function isOpeningConclusionMode() {
      return openingConclusionMode && isBriefingAberturaWorkflow();
    }

    function isAlteracaoWorkflow() {
      return tipoBriefing() === "ALTERAÇÃO CONTRATUAL";
    }

    function isBaixaWorkflow() {
      return tipoBriefing() === "BAIXA DE EMPRESA" || tipoBriefing() === "PORTABILIDADE DE SAÍDA";
    }

    function isSaidaWorkflow() {
      return tipoBriefing() === "PORTABILIDADE DE SAÍDA";
    }

    function isPessoaFisica() {
      return isEntradaAberturaWorkflow() && !isAlteracaoWorkflow() && tipoPessoa().toLowerCase().includes("f");
    }

    function activeStepOrder() {
      if (!tipoBriefing()) return ["tipoBriefingSecao"];
      if (openingConclusionMode) return ["tipoBriefingSecao", "indicacaoClienteSecao", "briefingAbertura"];
      if (isBriefingAberturaWorkflow() && !aberturaCompletaLiberada) return ["tipoBriefingSecao", "indicacaoClienteSecao", "briefingAbertura", "usuariosExternosSecao", "socios"];
      if (isBaixaWorkflow()) return ["tipoBriefingSecao", "empresa", "socios", "financeiro"];
      if (isBriefingAberturaWorkflow()) return ["tipoBriefingSecao", "indicacaoClienteSecao", "briefingAbertura", "usuariosExternosSecao", "empresa", ...(isPessoaFisica() ? [] : ["alvaraSecao"]), "socios", "financeiro", "informativo", "setores", "implantacao", "documentos"];
      if (isPortabilidadeEntradaWorkflow()) return ["tipoBriefingSecao", "indicacaoClienteSecao", "contadorAnteriorSecao", "empresa", ...(isPessoaFisica() ? [] : ["alvaraSecao"]), "usuariosExternosSecao", "socios", "financeiro", "informativo", "setores", "implantacao", "documentos"];
      if (isPropostaComercialWorkflow()) return ["propostaComercialSecao"];
      if (isAlteracaoWorkflow()) {
        const steps = ["tipoBriefingSecao", "empresa"];
        if (value("alteracaoSocios", "") === "Sim") steps.push("socios");
        steps.push("financeiro", "informativo", "documentos");
        return steps;
      }
      return ["tipoBriefingSecao", "empresa", "socios", "financeiro", "informativo", "setores", "implantacao", "documentos"];
    }

    function value(id, fallback = "Não informado") {
      const field = $(id);
      return field && field.value.trim() ? field.value.trim() : fallback;
    }

    function onlyDigits(text) {
      return String(text || "").replace(/\D/g, "");
    }

    function formatCpfDigits(raw) {
      const digits = onlyDigits(raw).slice(0, 11);
      if (digits.length > 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
      if (digits.length > 6) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
      if (digits.length > 3) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
      return digits;
    }

    function formatCeiDigits(raw) {
      const digits = onlyDigits(raw).slice(0, 12);
      if (digits.length > 10) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 10)}/${digits.slice(10)}`;
      if (digits.length > 5) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
      if (digits.length > 2) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
      return digits;
    }

    function formatCnpjDigits(raw) {
      const digits = onlyDigits(raw).slice(0, 14);
      if (digits.length > 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
      if (digits.length > 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
      if (digits.length > 5) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
      if (digits.length > 2) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
      return digits;
    }

    function formatPhoneDigits(raw) {
      const digits = onlyDigits(raw).slice(0, 11);
      if (digits.length > 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
      if (digits.length > 6) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
      if (digits.length > 2) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
      if (digits.length > 0) return `(${digits}`;
      return "";
    }

    const currencyFieldIds = new Set([
      "aberturaValorServico",
      "aberturaValorHonorario",
      "aberturaHonorarioProvisorio",
      "aberturaCapitalSocial",
      "aberturaProlabore",
      "honorarioAnterior",
      "honorario",
      "capitalSocial",
      "socioValorProlabore",
      "financeiroValor",
      "financeiroHonorario",
      "honorarioProvisorio",
      "valorHonorariosAberto",
      "propostaHonorario",
      "propostaFaturamento"
    ]);

    const preciseNumberFieldIds = new Set([
      "aberturaSocioQuotas",
      "aberturaSocioPercentual",
      "socioParticipacao"
    ]);

    function formatCurrencyInputValue(raw) {
      const digits = onlyDigits(raw);
      if (!digits) return "";
      const cents = Number(digits) / 100;
      return cents.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function applyCurrencyMask(field) {
      if (!field || !currencyFieldIds.has(field.id)) return false;
      if (isPessoaFisica() && field.id === "capitalSocial" && /[a-zA-ZÀ-ÿ]/.test(field.value)) {
        field.value = field.value.trim();
        syncFieldFilled(field);
        return true;
      }
      field.value = formatCurrencyInputValue(field.value);
      syncFieldFilled(field);
      return true;
    }

    function formatCurrencyField(id) {
      const field = $(id);
      if (!field) return;
      applyCurrencyMask(field);
    }

    function formatPreciseNumberInputValue(raw, { finalize = false } = {}) {
      const text = String(raw || "").replace(/[^\d.,]/g, "");
      if (!text) return "";
      const lastComma = text.lastIndexOf(",");
      const lastDot = text.lastIndexOf(".");
      const decimalIndex = Math.max(lastComma, lastDot);
      const hasDecimalSeparator = decimalIndex >= 0;
      const integerDigits = onlyDigits(hasDecimalSeparator ? text.slice(0, decimalIndex) : text);
      const decimalDigits = hasDecimalSeparator ? onlyDigits(text.slice(decimalIndex + 1)) : "";
      const integerFormatted = (integerDigits || "0").replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      if (!hasDecimalSeparator) return integerFormatted;
      if (!decimalDigits && finalize) return integerFormatted;
      return `${integerFormatted},${decimalDigits}`;
    }

    function applyPreciseNumberMask(field, options = {}) {
      if (!field || !preciseNumberFieldIds.has(field.id)) return false;
      field.value = formatPreciseNumberInputValue(field.value, options);
      syncFieldFilled(field);
      return true;
    }

    function numberFromLocaleText(raw) {
      const text = String(raw || "").replace(/[^\d,.-]/g, "").trim();
      if (!text) return 0;
      const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
      return Number(normalized) || 0;
    }

    function inteiroPorExtenso(numero) {
      const unidades = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
      const especiais = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
      const dezenas = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
      const centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
      const ate999 = (n) => {
        if (n === 0) return "";
        if (n === 100) return "cem";
        if (n < 10) return unidades[n];
        if (n < 20) return especiais[n - 10];
        if (n < 100) return dezenas[Math.floor(n / 10)] + (n % 10 ? ` e ${unidades[n % 10]}` : "");
        return centenas[Math.floor(n / 100)] + (n % 100 ? ` e ${ate999(n % 100)}` : "");
      };
      if (numero === 0) return "zero";
      const milhoes = Math.floor(numero / 1000000);
      const milhares = Math.floor((numero % 1000000) / 1000);
      const resto = numero % 1000;
      const partes = [];
      if (milhoes) partes.push(`${milhoes === 1 ? "um milhão" : `${ate999(milhoes)} milhões`}`);
      if (milhares) partes.push(milhares === 1 ? "mil" : `${ate999(milhares)} mil`);
      if (resto) partes.push(ate999(resto));
      return partes.join(" e ");
    }

    function valorMonetarioPorExtenso(texto) {
      const numero = numberFromLocaleText(texto);
      const reais = Math.floor(numero);
      const centavos = Math.round((numero - reais) * 100);
      const realText = reais === 1 ? "real" : "reais";
      const centText = centavos === 1 ? "centavo" : "centavos";
      const partes = [`${inteiroPorExtenso(reais)} ${realText}`];
      if (centavos) partes.push(`${inteiroPorExtenso(centavos)} ${centText}`);
      return partes.join(" e ");
    }

    function formatIdentificacao(raw) {
      const digits = onlyDigits(raw);
      if (isPessoaFisica()) return digits.length > 11 ? formatCeiDigits(digits) : formatCpfDigits(digits);
      return formatCnpjDigits(digits);
    }

    function cpfValido(raw) {
      const cpf = onlyDigits(raw);
      if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
      const calc = (base) => {
        let soma = 0;
        for (let index = 0; index < base; index += 1) soma += Number(cpf[index]) * (base + 1 - index);
        const resto = (soma * 10) % 11;
        return resto === 10 ? 0 : resto;
      };
      return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
    }

    function normalizeIdentificacao() {
      const field = $("cnpj");
      if (!field) return;
      field.value = formatIdentificacao(field.value);
    }

    function normalizeCpfField(id) {
      const field = $(id);
      if (!field) return;
      field.value = formatCpfDigits(field.value);
      field.title = onlyDigits(field.value).length === 11 && !cpfValido(field.value)
        ? "CPF inválido. Confira os dígitos informados."
        : "CPF formatado e validado pelos dígitos verificadores. Não há consulta pública de dados pessoais.";
      syncFieldFilled(field);
    }

    function normalizeCepField(id = "cep") {
      const field = $(id);
      if (!field) return;
      const digits = onlyDigits(field.value).slice(0, 8);
      field.value = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
      syncFieldFilled(field);
    }

    let lastAutoCnpjLookup = "";
    let lastAutoCepLookup = "";
    let lastAutoAberturaCepLookup = "";
    let lastAutoAberturaSocioCepLookup = "";
    const lastAutoCnaeLookup = {};

    async function autoConsultarCnpjSeCompleto() {
      if (isPessoaFisica()) return;
      const cnpj = onlyDigits(value("cnpj", ""));
      if (cnpj.length !== 14 || cnpj === lastAutoCnpjLookup) return;
      lastAutoCnpjLookup = cnpj;
      await consultarCnpjPublico(true);
    }

    async function autoConsultarCepSeCompleto() {
      const cep = onlyDigits(value("cep", ""));
      if (cep.length !== 8 || cep === lastAutoCepLookup) return;
      lastAutoCepLookup = cep;
      const found = await preencherEnderecoPorCep(cep, true);
      if (found) updateFlowState();
    }

    async function autoConsultarAberturaCepSeCompleto() {
      const cep = onlyDigits(value("aberturaCep", ""));
      if (cep.length !== 8 || cep === lastAutoAberturaCepLookup) return;
      lastAutoAberturaCepLookup = cep;
      const found = await preencherAberturaEnderecoPorCep(cep, true);
      if (found) updateFlowState();
    }

    async function autoConsultarAberturaSocioCepSeCompleto() {
      const cep = onlyDigits(value("aberturaSocioCep", ""));
      if (cep.length !== 8 || cep === lastAutoAberturaSocioCepLookup) return;
      lastAutoAberturaSocioCepLookup = cep;
      const found = await preencherAberturaSocioEnderecoPorCep(cep, true);
      if (found) updateFlowState();
    }

    function formatCnaeDigits(text) {
      const digits = onlyDigits(text).slice(0, 7);
      if (digits.length <= 2) return digits;
      if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
      if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2, 4)}-${digits.slice(4)}`;
      return `${digits.slice(0, 2)}.${digits.slice(2, 4)}-${digits.slice(4, 5)}-${digits.slice(5)}`;
    }

    async function consultarDescricaoCnae(codigoRaw) {
      const codigo = onlyDigits(codigoRaw);
      if (codigo.length !== 7) return "";
      const response = await fetch(`https://servicodados.ibge.gov.br/api/v2/cnae/subclasses/${codigo}`);
      if (!response.ok) return "";
      const data = await response.json();
      const item = Array.isArray(data) ? data[0] : data;
      return item && item.descricao ? item.descricao : "";
    }

    async function autoPreencherCnaePrincipal(fieldId, descriptionFieldId = "") {
      const field = $(fieldId);
      if (!field) return;
      const digits = onlyDigits(field.value);
      if (digits.length !== 7 || lastAutoCnaeLookup[fieldId] === digits) return;
      lastAutoCnaeLookup[fieldId] = digits;
      const formatted = formatCnaeDigits(digits);
      field.value = formatted;
      try {
        const descricao = await consultarDescricaoCnae(digits);
        if (descricao) {
          if (descriptionFieldId && $(descriptionFieldId)) {
            $(descriptionFieldId).value = descricao;
            syncFieldFilled($(descriptionFieldId));
          } else {
            field.value = `${formatted} - ${descricao}`;
          }
        }
      } catch (error) {
        console.warn("Não foi possível consultar a descrição do CNAE.", error);
      }
      syncFieldFilled(field);
      updateFlowState();
    }

    function setFieldValue(id, text) {
      const field = $(id);
      if (!field || text === undefined || text === null || text === "") return;
      field.value = String(text).trim();
      syncFieldFilled(field);
    }

    function setSelectValue(id, text) {
      const field = $(id);
      if (!field || !text) return;
      if (!field.options) {
        setFieldValue(id, text);
        return;
      }
      const option = Array.from(field.options).find((item) => item.value === text || item.textContent === text);
      if (option) {
        field.value = option.value || option.textContent;
        syncFieldFilled(field);
      }
    }

    function moedaBrasileira(valor) {
      const numero = Number(valor);
      if (!Number.isFinite(numero)) return "";
      return numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }

    function buildEnderecoCnpj(data) {
      return [
        [data.descricao_tipo_de_logradouro, data.logradouro].filter(Boolean).join(" "),
        data.numero ? `nº ${data.numero}` : "",
        data.complemento,
        data.bairro
      ].filter(Boolean).join(", ");
    }

    function setLoading(button, loading, label) {
      if (!button) return;
      button.disabled = loading;
      button.textContent = loading ? "Buscando..." : label;
    }

    function automationUploadDefinitions() {
      const procedimento = tipoBriefing();
      if (!procedimento) return [];
      if (isEntradaAberturaWorkflow() && !tipoPessoa()) return [];
      if (isPessoaFisica()) {
        return [
          ["cpf", "CPF"],
          ["comprovante-endereco", "Comprovante de endereço"]
        ];
      }
      if (procedimento === "BRIEFING ABERTURA") {
        return [
          ["cnpj", "CNPJ"],
          ["contrato-social", "Contrato social"],
          ["cpf-socios", "CPF dos sócios"]
        ];
      }
      if (procedimento === "PORTABILIDADE ENTRADA") {
        return [
          ["cnpj", "CNPJ"],
          ["alteracao-contratual", "Contrato social ou última alteração"]
        ];
      }
      if (procedimento === "ALTERAÇÃO CONTRATUAL") {
        return [
          ["cnpj", "CNPJ"],
          ["alteracao-contratual", "Contrato social ou alteração atual"],
          ["cpf-socios", "CPF dos sócios"]
        ];
      }
      if (isBaixaWorkflow()) {
        return [
          ["cnpj", "CNPJ"],
          ["distrato-social", "Distrato social"],
          ["relatorio-financeiro", "Relatório financeiro"]
        ];
      }
      return [];
    }

    function renderAutomationUploads() {
      const panel = $("documentAutomation");
      const actions = $("documentUploadActions");
      if (!panel || !actions) return;
      const definitions = automationUploadDefinitions();
      panel.classList.toggle("active", definitions.length > 0);
      actions.innerHTML = definitions.map(([kind, label]) => `
        <label class="upload-btn">
          ${label}
          <input type="file" multiple accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*" data-upload-kind="${kind}">
        </label>
      `).join("");
    }

    function setUploadStatus(message, tone = "neutral") {
      const status = $("documentUploadStatus");
      if (!status) return;
      status.textContent = message || "";
      status.style.color = tone === "error" ? "#b3261e" : tone === "success" ? "var(--ok)" : "var(--muted)";
    }

    function loadScriptOnce(src, globalCheck) {
      return new Promise((resolve, reject) => {
        if (globalCheck()) {
          resolve();
          return;
        }
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
          existing.addEventListener("load", resolve, { once: true });
          existing.addEventListener("error", reject, { once: true });
          return;
        }
        const script = document.createElement("script");
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    async function extractPdfText(file) {
      await loadScriptOnce("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js", () => window.pdfjsLib);
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      const data = new Uint8Array(await file.arrayBuffer());
      const pdf = await window.pdfjsLib.getDocument({ data }).promise;
      const pages = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(content.items.map((item) => item.str).join(" "));
      }
      return pages.join("\n");
    }

    async function extractWordText(file) {
      if (/\.docx$/i.test(file.name)) {
        await loadScriptOnce("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js", () => window.mammoth);
        const result = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        return result.value || "";
      }
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => resolve("");
        reader.readAsText(file, "utf-8");
      });
    }

    function isImageFile(file) {
      return file && (file.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(file.name));
    }

    function fileToDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    function loadImageElement(src) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
      });
    }

    function parseBrazilianMoney(raw) {
      const clean = String(raw || "")
        .replace(/[^\d,.-]/g, "")
        .replace(/\.(?=\d{3}(?:\D|$))/g, "")
        .replace(",", ".");
      const number = Number(clean);
      return Number.isFinite(number) ? number : 0;
    }

    function formatMoneyFromNumber(number) {
      return Number(number || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }

    function detectFinancialStatusRows(canvas) {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      const { width, height } = canvas;
      const data = context.getImageData(0, 0, width, height).data;
      const xStart = Math.floor(width * 0.12);
      const xEnd = Math.floor(width * 0.42);
      const yStart = Math.floor(height * 0.10);
      const rowHits = [];

      for (let y = yStart; y < height - 4; y += 1) {
        let red = 0;
        let orange = 0;
        for (let x = xStart; x < xEnd; x += 1) {
          const index = (y * width + x) * 4;
          const r = data[index];
          const g = data[index + 1];
          const b = data[index + 2];
          const isRed = r > 170 && g < 130 && b < 140 && r > g + 45;
          const isOrange = r > 190 && g >= 95 && g < 190 && b < 110 && r > b + 80;
          if (isRed) red += 1;
          else if (isOrange) orange += 1;
        }
        if (red > 4 || orange > 4) {
          rowHits.push({ y, status: orange > red ? "parcial" : "aberto" });
        }
      }

      const groups = [];
      rowHits.forEach((hit) => {
        const last = groups[groups.length - 1];
        if (!last || hit.y - last.end > 3) {
          groups.push({ start: hit.y, end: hit.y, red: hit.status === "aberto" ? 1 : 0, orange: hit.status === "parcial" ? 1 : 0 });
        } else {
          last.end = hit.y;
          if (hit.status === "aberto") last.red += 1;
          else last.orange += 1;
        }
      });

      return groups
        .filter((group) => group.end - group.start >= 4)
        .map((group) => ({
          y: (group.start + group.end) / 2,
          status: group.orange > group.red ? "parcial" : "aberto"
        }));
    }

    async function recognizeImageText(dataUrl) {
      await loadScriptOnce("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js", () => window.Tesseract);
      const result = await window.Tesseract.recognize(dataUrl, "por+eng");
      return result.data || {};
    }

    function wordBox(word) {
      const box = word && (word.bbox || word.box);
      if (!box) return null;
      const x0 = box.x0 ?? box.left ?? 0;
      const y0 = box.y0 ?? box.top ?? 0;
      const x1 = box.x1 ?? (box.left + box.width) ?? x0;
      const y1 = box.y1 ?? (box.top + box.height) ?? y0;
      return { x0, y0, x1, y1, centerY: (y0 + y1) / 2 };
    }

    function moneyCandidatesFromOcr(ocrData, width) {
      const words = Array.isArray(ocrData.words) ? ocrData.words : [];
      return words
        .map((word) => ({ text: String(word.text || "").trim(), box: wordBox(word) }))
        .filter((item) => item.box && item.box.x0 > width * 0.60)
        .filter((item) => /\d{1,3}(?:[.,]\d{3})*[.,]\d{2}/.test(item.text))
        .map((item) => ({
          value: parseBrazilianMoney(item.text),
          text: item.text,
          y: item.box.centerY
        }))
        .filter((item) => item.value > 0);
    }

    function fallbackFinancialTotalFromText(text) {
      const match = String(text || "").match(/total\s+pendente(?:\s+vencido)?\s*[:\-]?\s*R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/i);
      return match ? parseBrazilianMoney(match[1]) : 0;
    }

    async function processFinancialImage(file) {
      const dataUrl = await fileToDataUrl(file);
      const image = await loadImageElement(dataUrl);
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);

      const rows = detectFinancialStatusRows(canvas);
      const ocrData = await recognizeImageText(dataUrl);
      const amounts = moneyCandidatesFromOcr(ocrData, canvas.width);
      const matched = rows.map((row) => {
        const nearest = amounts
          .map((amount) => ({ ...amount, distance: Math.abs(amount.y - row.y) }))
          .filter((amount) => amount.distance <= Math.max(14, canvas.height * 0.025))
          .sort((a, b) => a.distance - b.distance)[0];
        return nearest ? { ...row, amount: nearest.value } : null;
      }).filter(Boolean);

      let total = matched.reduce((sum, item) => sum + item.amount, 0);
      let source = "linhas vermelhas/laranjas";
      if (!total) {
        total = fallbackFinancialTotalFromText(ocrData.text || "");
        source = "total pendente lido no cabeçalho";
      }

      if (!total) throw new Error("Não foi possível identificar os valores em aberto na imagem.");
      const formatted = formatMoneyFromNumber(total);
      setSelectValue("honorariosAberto", "Sim");
      setFieldValue("valorHonorariosAberto", formatted);
      setFieldValue("financeiroObservacao", `Relatório financeiro por imagem: ${formatted} em aberto, calculado por ${source}. Linhas consideradas: ${matched.length || "não identificadas individualmente"}. Itens verdes foram desconsiderados.`);
      ["honorariosAberto", "valorHonorariosAberto", "financeiroObservacao"].forEach((id) => registerAutofillField(id));
      updateFlowState();
      return { total, formatted, count: matched.length, source };
    }

    async function extractDocumentText(file) {
      if (isImageFile(file)) {
        const dataUrl = await fileToDataUrl(file);
        const ocrData = await recognizeImageText(dataUrl);
        return ocrData.text || "";
      }
      if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") return extractPdfText(file);
      if (/\.docx?$/i.test(file.name) || file.type.includes("word")) return extractWordText(file);
      return file.text();
    }

    function normalizedText(text) {
      return String(text || "")
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\r/g, "\n")
        .replace(/\n{2,}/g, "\n")
        .trim();
    }

    function firstMatch(text, regex) {
      const match = text.match(regex);
      return match ? (match[1] || match[0]).trim() : "";
    }

    function extractCnpjFromText(text) {
      return firstMatch(text, /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/);
    }

    function extractCpfFromText(text) {
      return firstMatch(text, /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/);
    }

    function extractCepFromText(text) {
      return firstMatch(text, /\b\d{5}-?\d{3}\b/);
    }

    function extractMoneyNear(text, words) {
      const pattern = new RegExp(`(?:${words}).{0,80}(R\\$\\s?\\d{1,3}(?:\\.\\d{3})*,\\d{2}|\\d{1,3}(?:\\.\\d{3})*,\\d{2})`, "i");
      return firstMatch(text, pattern);
    }

    function extractLineAfter(text, labels) {
      for (const label of labels) {
        const regex = new RegExp(`${label}\\s*[:\\-]?\\s*([^\\n|]+)`, "i");
        const found = firstMatch(text, regex);
        if (found) return found.replace(/\s{2,}/g, " ").trim();
      }
      return "";
    }

    function extractLongTextAfter(text, labels, stopLabels = []) {
      const clean = normalizedText(text);
      for (const label of labels) {
        const regex = new RegExp(`${label}\\s*[:\\-]?\\s*([\\s\\S]{10,900})`, "i");
        const match = clean.match(regex);
        if (!match) continue;
        let value = match[1];
        const stops = stopLabels.length ? stopLabels : [
          "capital social", "administrador", "sócio", "socio", "cláusula", "clausula", "endereço", "endereco",
          "cnae", "atividade", "foro", "documentos", "testemunhas", "assinatura"
        ];
        const stopRegex = new RegExp(`\\b(${stops.join("|")})\\b`, "i");
        const stopIndex = value.search(stopRegex);
        if (stopIndex > 0) value = value.slice(0, stopIndex);
        value = value.replace(/\s{2,}/g, " ").trim();
        if (value.length > 8) return value;
      }
      return "";
    }

    function extractEmailFromText(text) {
      return firstMatch(text, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
    }

    function extractPhoneFromText(text) {
      return firstMatch(text, /\(?\d{2}\)?\s?\d{4,5}-?\d{4}\b/);
    }

    function setFieldValueIfEmpty(id, text) {
      if (!value(id, "") && text) setFieldValue(id, text);
    }

    function setSelectValueIfEmpty(id, text) {
      if (!value(id, "") && text) setSelectValue(id, text);
    }

    function registerAutofillField(id, filledIds) {
      const field = $(id);
      if (!field) return;
      field.dataset.autofilled = "true";
      field.classList.add("filled");
      if (filledIds && !filledIds.includes(id)) filledIds.push(id);
    }

    function setAutofillValue(id, text, filledIds, overwrite = false) {
      if (!text) return false;
      if (!overwrite && value(id, "")) return false;
      setFieldValue(id, text);
      registerAutofillField(id, filledIds);
      return true;
    }

    function setAutofillSelect(id, text, filledIds, overwrite = false) {
      if (!text) return false;
      if (!overwrite && value(id, "")) return false;
      setSelectValue(id, text);
      registerAutofillField(id, filledIds);
      return true;
    }

    function appendDocumentNote(kind, fileName = "") {
      const label = fileName ? `${kind}: ${fileName}` : kind;
      setFieldValue("docs", [value("docs", ""), `Arquivo lido automaticamente: ${label}`].filter(Boolean).join("\n"));
      if (isBriefingAberturaWorkflow()) {
        setFieldValue("aberturaObservacao", [value("aberturaObservacao", ""), `Arquivo lido automaticamente: ${label}`].filter(Boolean).join("\n"));
      }
    }

    function cleanAddressText(text) {
      return String(text || "")
        .replace(/\s+/g, " ")
        .replace(/^[:,\-\s]+/, "")
        .replace(/\s+CEP\s*[:\-]?\s*/i, ", CEP: ")
        .trim();
    }

    function extractHeadquartersAddress(text) {
      const clean = normalizedText(text).replace(/\n/g, " ");
      const match = clean.match(/\b(?:com\s+sede|sede\s+(?:na|à|a)|estabelecida\s+(?:na|à|a))\s+(.{20,260}?CEP\s*[:\-]?\s*\d{5}-?\d{3})/i);
      if (!match) return "";
      return cleanAddressText(match[1]);
    }

    async function preencherEnderecoPorCep(cepRaw, overwriteAddress = false) {
      const cep = onlyDigits(cepRaw);
      if (cep.length !== 8) return false;
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        if (!response.ok) return false;
        const data = await response.json();
        if (data.erro) return false;
        setFieldValue("cep", data.cep);
        if (overwriteAddress || !value("endereco", "")) setFieldValue("endereco", [data.logradouro, data.bairro].filter(Boolean).join(", "));
        setFieldValue("municipio", data.localidade);
        setSelectValue("estado", data.uf);
        return true;
      } catch (error) {
        return false;
      }
    }

    function aberturaEnderecoCompleto() {
      const linha1 = [value("aberturaRua", ""), value("aberturaNumero", "")].filter(Boolean).join(", ");
      const linha2 = $("aberturaSemComplemento")?.checked ? "" : value("aberturaComplemento", "");
      const cidadeUf = [value("aberturaCidade", ""), value("aberturaEstado", "")].filter(Boolean).join("/");
      const cep = value("aberturaCep", "");
      return [
        linha1,
        linha2,
        cidadeUf,
        cep ? `CEP: ${cep}` : ""
      ].filter(Boolean).join(" - ");
    }

    function aberturaComplementoPermitido() {
      return !$("aberturaSemComplemento")?.checked;
    }

    function aberturaGrupoExigeNome() {
      return ["Sim", "Será criado"].includes(value("aberturaGrupo", ""));
    }

    function grupoCadastroExigeNome() {
      return ["Sim", "Será criado"].includes(value("grupoCadastro", ""));
    }

    function aberturaEstadoESAtivo() {
      return isBriefingAberturaWorkflow() && value("aberturaEstado", "") === "ES";
    }

    function aberturaSolicitaAlvaraEspecifico() {
      return value("aberturaSolicitarAlvara", "") === "Sim";
    }

    function aberturaCoordenadasMapaUrl() {
      const lat = value("aberturaLatitude", "");
      const lng = value("aberturaLongitude", "");
      if (lat && lng) return `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
      const endereco = aberturaEnderecoCompleto();
      return endereco ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}` : "https://www.google.com/maps";
    }

    async function buscarAberturaCoordenadasPorEndereco() {
      const endereco = aberturaEnderecoCompleto();
      if (!endereco) {
        stepNote("briefingAbertura", "Preencha o endereço comercial antes de buscar latitude e longitude.");
        return false;
      }
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(endereco)}`;
        const response = await fetch(url, { headers: { "Accept": "application/json" } });
        if (!response.ok) throw new Error("Falha na consulta de coordenadas");
        const data = await response.json();
        const item = Array.isArray(data) ? data[0] : null;
        if (!item || !item.lat || !item.lon) {
          stepNote("briefingAbertura", "Não encontrei coordenadas para este endereço. Preencha latitude e longitude manualmente ou use Abrir mapa.");
          return false;
        }
        setFieldValue("aberturaLatitude", item.lat);
        setFieldValue("aberturaLongitude", item.lon);
        stepNote("briefingAbertura", "Coordenadas preenchidas pelo endereço informado.");
        updateConditionalFields();
        updateFlowState();
        return true;
      } catch (error) {
        stepNote("briefingAbertura", "Não foi possível buscar as coordenadas agora. Preencha manualmente ou use Abrir mapa.");
        return false;
      }
    }

    async function preencherAberturaEnderecoPorCep(cepRaw, overwriteAddress = false) {
      const cep = onlyDigits(cepRaw);
      if (cep.length !== 8) return false;
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        if (!response.ok) return false;
        const data = await response.json();
        if (data.erro) return false;
        setFieldValue("aberturaCep", data.cep);
        if (overwriteAddress || !value("aberturaRua", "")) setFieldValue("aberturaRua", [data.logradouro, data.bairro].filter(Boolean).join(", "));
        if (overwriteAddress || !value("aberturaCidade", "")) setFieldValue("aberturaCidade", data.localidade);
        setSelectValue("aberturaEstado", data.uf);
        return true;
      } catch (error) {
        return false;
      }
    }

    async function preencherAberturaSocioEnderecoPorCep(cepRaw, overwriteAddress = false) {
      const cep = onlyDigits(cepRaw);
      if (cep.length !== 8) return false;
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        if (!response.ok) return false;
        const data = await response.json();
        if (data.erro) return false;
        setFieldValue("aberturaSocioCep", data.cep);
        if (overwriteAddress || !value("aberturaSocioEndereco", "")) {
          setFieldValue("aberturaSocioEndereco", [data.logradouro, data.bairro, data.localidade, data.uf].filter(Boolean).join(", "));
        }
        return true;
      } catch (error) {
        return false;
      }
    }

    function extractCnpjCardFantasyName(text) {
      const clean = normalizedText(text);
      const marker = /T[ÍI]TULO\s+DO\s+ESTABELECIMENTO\s*\(?\s*NOME\s+DE\s+FANTASIA\s*\)?/i;
      const match = clean.match(marker);
      if (!match) return "";
      const after = clean.slice(match.index + match[0].length).trim();
      const stop = after.search(/\b(C[ÓO]DIGO\s+E\s+DESCRI[ÇC][ÃA]O|PORTE|LOGRADOURO|N[ÚU]MERO|COMPLEMENTO|CEP|BAIRRO|MUNIC[ÍI]PIO|UF|ENDERE[ÇC]O|ENTE\s+FEDERATIVO|SITUA[ÇC][ÃA]O|DATA\s+DA\s+SITUA[ÇC][ÃA]O)\b/i);
      const raw = (stop >= 0 ? after.slice(0, stop) : after)
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)[0] || "";
      const value = raw
        .replace(/^[:\-]+/, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      if (!value || /^\*+$/.test(value.replace(/\s/g, ""))) return "";
      return value;
    }

    function extractCnaesFromText(text) {
      const matches = Array.from(text.matchAll(/\b\d{2}\.?\d{2}-?\d-?\d{2}\b(?:\s*[-–]\s*[^\n;|]{4,90})?/g))
        .map((match) => match[0].trim())
        .filter((item, index, list) => list.indexOf(item) === index);
      return matches;
    }

    function extractUfFromText(text) {
      const uf = firstMatch(text, /\b(?:UF|Estado)\s*[:\-]?\s*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/i);
      return uf.toUpperCase();
    }

    function addParsedSocio(nome, cpf, participacao = "Não informado") {
      const cleanName = String(nome || "").replace(/[0-9:;,_/\\()[\]{}]+/g, " ").replace(/\s{2,}/g, " ").trim();
      if (!cleanName || !cpf) return;
      if (socios.some((socio) => onlyDigits(socio.cpf) === onlyDigits(cpf))) return;
      socios.push({
        nome: cleanName,
        cpf: formatCpfDigits(cpf),
        participacao,
        prolabore: "Não informado",
        valorProlabore: "Não informado",
        nascimento: "Não informado",
        email: "Não informado",
        telefone: "Não informado",
        situacao: "Ativo",
        sexo: "Não informado",
        estadoCivil: "Não informado",
        regimeCasamento: "Não aplicável",
        qualificacao: "Sócio administrador",
        mae: "Não informado",
        titulo: "Não informado"
      });
    }

    function extractSociosFromText(text) {
      const compact = normalizedText(text);
      const currentOnly = compact
        .replace(/s[óo]cios?\s+retirantes?[\s\S]*?(?=s[óo]cios?\s+(?:atuais|remanescentes|ingressantes)|$)/gi, "")
        .replace(/retira-se[\s\S]{0,700}?(?=permanece|ingressa|admite|quadro societ[áa]rio|$)/gi, "");
      const cpfMatches = Array.from(currentOnly.matchAll(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g));
      cpfMatches.slice(0, 8).forEach((match) => {
        const cpf = match[0];
        const before = currentOnly.slice(Math.max(0, match.index - 180), match.index);
        const nome = firstMatch(before, /(?:nome|s.cio|administrador|representante legal)\s*[:\-]?\s*([^\n]{5,})$/i)
          || firstMatch(before, /([^\n]{8,})$/);
        const after = currentOnly.slice(match.index, match.index + 220);
        const participacao = firstMatch(after, /(\d{1,3}(?:,\d{1,2})?\s*%)/) || "Não informado";
        addParsedSocio(nome, cpf, participacao);
      });
      renderSocios();
    }

    async function autofillFromUploadedText(text, kind, fileName = "") {
      const clean = normalizedText(text);
      const filledIds = [];
      let filled = 0;
      const cnpj = extractCnpjFromText(clean);
      const cpf = extractCpfFromText(clean);
      const cep = extractCepFromText(clean);
      const razao = extractLineAfter(clean, ["Nome empresarial", "Razão social", "Razao social", "Denominação social", "Denominacao social", "Nome"]);
      const fantasia = extractCnpjCardFantasyName(clean) || extractLineAfter(clean, ["Nome fantasia", "Título do estabelecimento", "Titulo do estabelecimento"]);
      const email = extractEmailFromText(clean);
      const telefone = extractPhoneFromText(clean);
      const municipio = extractLineAfter(clean, ["Município", "Municipio", "Cidade"]);
      const uf = extractUfFromText(clean);
      const capital = extractMoneyNear(clean, "capital social|capital");
      const objetoSocial = extractLongTextAfter(clean, ["objeto social", "objeto", "atividade empresarial"], ["capital social", "sócios", "socios", "administração", "administracao"]);
      const atividadePrincipal = extractLineAfter(clean, ["Atividade principal", "Atividade econômica principal", "Atividade economica principal", "Código e descrição da atividade econômica principal", "Codigo e descricao da atividade economica principal"]);
      if (cnpj && !isPessoaFisica()) {
        setAutofillValue("cnpj", formatCnpjDigits(cnpj), filledIds);
        normalizeIdentificacao();
        filled += 1;
        try { await consultarCnpjPublico(); } catch (error) {}
      }
      if (cpf && isPessoaFisica()) {
        setAutofillValue("cnpj", formatCpfDigits(cpf), filledIds);
        normalizeIdentificacao();
        filled += 1;
      }
      if (cpf && kind.includes("cpf")) {
        setAutofillValue("socioCpf", formatCpfDigits(cpf), filledIds);
        filled += 1;
      }
      if (cep) {
        setAutofillValue("cep", cep.replace(/^(\d{5})(\d{3})$/, "$1-$2"), filledIds);
        filled += 1;
      }
      const headquartersAddress = extractHeadquartersAddress(clean);
      if (headquartersAddress) {
        setAutofillValue("endereco", headquartersAddress, filledIds);
        filled += 1;
      }
      if (razao && !value("razao", "")) {
        setAutofillValue("razao", razao, filledIds);
        filled += 1;
      }
      if (fantasia) {
        setAutofillValue("fantasia", fantasia, filledIds);
        filled += 1;
      }
      const endereco = extractLineAfter(clean, ["Logradouro", "Endereço", "Endereco"]);
      if (!headquartersAddress && endereco && !value("endereco", "")) {
        setAutofillValue("endereco", endereco, filledIds);
        filled += 1;
      }
      if (cep) {
        const usedCep = await preencherEnderecoPorCep(cep, !headquartersAddress && !endereco);
        if (usedCep) filled += 1;
      }
      if (municipio && setAutofillValue("municipio", municipio, filledIds)) filled += 1;
      if (uf && setAutofillSelect("estado", uf, filledIds)) filled += 1;
      if (capital && setAutofillValue("capitalSocial", capital.startsWith("R$") ? capital : `R$ ${capital}`, filledIds)) filled += 1;
      const cnaes = extractCnaesFromText(clean);
      if (cnaes.length) {
        if (setAutofillValue("cnaePrincipal", cnaes[0], filledIds)) filled += 1;
        if (cnaes.length > 1 && setAutofillValue("cnaesSecundarios", cnaes.slice(1).join("\n"), filledIds)) filled += 1;
      }
      if (email && setAutofillValue("usuarioExterno", email, filledIds)) filled += 1;
      if (telefone && setAutofillValue("telefoneEmpresa", telefone, filledIds)) filled += 1;
      if (isBriefingAberturaWorkflow()) {
        if (setAutofillValue("aberturaRazao", razao, filledIds)) filled += 1;
        if (setAutofillValue("aberturaFantasia", fantasia, filledIds)) filled += 1;
        if (setAutofillValue("aberturaCep", cep ? cep.replace(/^(\d{5})(\d{3})$/, "$1-$2") : "", filledIds)) filled += 1;
        if (setAutofillValue("aberturaRua", headquartersAddress || endereco, filledIds)) filled += 1;
        if (setAutofillValue("aberturaCidade", municipio, filledIds)) filled += 1;
        if (setAutofillSelect("aberturaEstado", uf, filledIds)) filled += 1;
        if (setAutofillValue("aberturaCapitalSocial", capital ? (capital.startsWith("R$") ? capital : `R$ ${capital}`) : "", filledIds)) filled += 1;
        if (setAutofillValue("aberturaAtividadePrincipal", atividadePrincipal || (cnaes[0] || ""), filledIds)) filled += 1;
        if (setAutofillValue("aberturaCnaePrincipal", cnaes[0] || "", filledIds)) filled += 1;
        if (setAutofillValue("aberturaCnaesSecundarios", cnaes.slice(1).join("\n"), filledIds)) filled += 1;
        if (setAutofillValue("aberturaObjetoSocial", objetoSocial, filledIds)) filled += 1;
        const contato = [telefone, email].filter(Boolean).join(" / ");
        if (setAutofillValue("aberturaContatoEmail", contato, filledIds)) filled += 1;
        if (setAutofillValue("aberturaEmailGestta", email, filledIds)) filled += 1;
        if (cep) {
          const usedAberturaCep = await preencherAberturaEnderecoPorCep(cep, !value("aberturaRua", ""));
          if (usedAberturaCep) {
            ["aberturaCep", "aberturaRua", "aberturaCidade", "aberturaEstado"].forEach((id) => registerAutofillField(id, filledIds));
          }
        }
      }
      if (kind.includes("contrato") || kind.includes("alteracao") || kind.includes("cpf")) {
        const beforeCount = socios.length;
        extractSociosFromText(clean);
        filled += socios.length - beforeCount;
      }
      if (kind === "relatorio-financeiro") {
        const aberto = extractMoneyNear(clean, "em aberto|inadimpl[êe]ncia|saldo|d[ée]bito|valor");
        if (aberto) {
          setAutofillSelect("honorariosAberto", "Sim", filledIds, true);
          setAutofillValue("valorHonorariosAberto", aberto.startsWith("R$") ? aberto : `R$ ${aberto}`, filledIds, true);
          setAutofillValue("financeiroObservacao", `Relatório financeiro indica valor em aberto de ${aberto.startsWith("R$") ? aberto : `R$ ${aberto}`}.`, filledIds, true);
          filled += 1;
        }
      }
      if (kind === "distrato-social") {
        const baixa = firstMatch(clean, /(\d{2}\/\d{2}\/\d{4})/);
        if (baixa) {
          const [dia, mes, ano] = baixa.split("/");
          setAutofillValue("dataBaixa", `${ano}-${mes}-${dia}`, filledIds);
        }
      }
      appendDocumentNote(kind, fileName);
      updateFlowState();
      return { filled, filledIds };
    }

    async function handleDocumentUpload(input) {
      const files = Array.from(input.files || []);
      const kind = input.dataset.uploadKind;
      if (!files.length) return;
      setUploadStatus(`Lendo ${files.length} arquivo(s)...`);
      let totalFilled = 0;
      let readCount = 0;
      let failedCount = 0;
      const allFilledIds = [];
      try {
        for (const file of files) {
          try {
            if (kind === "relatorio-financeiro" && isImageFile(file)) {
              setUploadStatus(`Lendo ${file.name} e somando valores em vermelho/laranja...`);
              const result = await processFinancialImage(file);
              readCount += 1;
              totalFilled += 1;
              appendDocumentNote(kind, file.name);
              continue;
            }
            const text = await extractDocumentText(file);
            if (!text || text.trim().length < 10) throw new Error("Não foi possível extrair texto suficiente do arquivo.");
            const result = await autofillFromUploadedText(text, kind, file.name);
            readCount += 1;
            totalFilled += result.filled;
            result.filledIds.forEach((id) => {
              if (!allFilledIds.includes(id)) allFilledIds.push(id);
            });
          } catch (error) {
            failedCount += 1;
          }
        }
        if (!readCount) {
          setUploadStatus("Não foi possível ler o documento", "error");
          return;
        }
        const summary = `${readCount} arquivo(s) lido(s). ${totalFilled ? `${totalFilled} preenchimento(s) automático(s).` : "Nenhum campo foi identificado com segurança."}${failedCount ? ` ${failedCount} arquivo(s) com erro: Não foi possível ler o documento.` : ""}`;
        setUploadStatus(summary, totalFilled ? "success" : (failedCount ? "error" : "neutral"));
      } catch (error) {
        setUploadStatus("Não foi possível ler o documento", "error");
      } finally {
        input.value = "";
      }
    }

    async function consultarCnpjPublico(silent = false) {
      const button = $("buscarCnpj");
      if (isPessoaFisica()) {
        if (!silent) validarCpfPublico();
        return;
      }
      const cnpj = onlyDigits(value("cnpj", ""));
      if (cnpj.length !== 14) {
        if (!silent) alert("Informe um CNPJ com 14 dígitos para buscar os dados públicos.");
        return;
      }
      setLoading(button, true, "Buscar CNPJ");
      try {
        const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
        if (!response.ok) throw new Error("CNPJ não encontrado.");
        const data = await response.json();
        setFieldValue("razao", data.razao_social);
        if (data.nome_fantasia) setFieldValue("fantasia", data.nome_fantasia);
        setFieldValue("cep", data.cep);
        setFieldValue("endereco", buildEnderecoCnpj(data));
        setFieldValue("municipio", data.municipio);
        setSelectValue("estado", data.uf);
        setFieldValue("cnaePrincipal", [data.cnae_fiscal, data.cnae_fiscal_descricao].filter(Boolean).join(" - "));
        if (Array.isArray(data.cnaes_secundarios) && data.cnaes_secundarios.length) {
          setFieldValue("cnaesSecundarios", data.cnaes_secundarios.map((item) => [item.codigo, item.descricao].filter(Boolean).join(" - ")).join("\n"));
        }
        setFieldValue("capitalSocial", moedaBrasileira(data.capital_social));
        if (data.opcao_pelo_simples === true) setSelectValue("regime", "Simples Nacional");
        if (data.data_inicio_atividade) setFieldValue("constituicao", data.data_inicio_atividade);
        if (Array.isArray(data.qsa) && data.qsa.length && !socios.length) {
          $("socioQualificacaoObs").value = data.qsa.map((socio) => `${socio.nome_socio || socio.nome}: ${socio.qualificacao_socio || socio.qualificacao || "QSA"}`).join("\n");
        }
        normalizeIdentificacao();
        updateFlowState();
      } catch (error) {
        if (!silent) alert(`Não foi possível buscar o CNPJ. ${error.message || "Tente novamente em instantes."}`);
      } finally {
        setLoading(button, false, "Buscar CNPJ");
      }
    }

    async function consultarPropostaCnpjPublico(silent = false) {
      const button = $("buscarPropostaCnpj");
      const cnpj = onlyDigits(value("propostaCnpj", ""));
      if (cnpj.length !== 14) {
        if (!silent) alert("Informe um CNPJ com 14 dígitos para buscar os dados públicos.");
        return;
      }
      setLoading(button, true, "Buscar CNPJ");
      try {
        const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
        if (!response.ok) throw new Error("CNPJ não encontrado.");
        const data = await response.json();
        setFieldValue("propostaEmpresa", data.razao_social || data.nome_fantasia || "");
        setFieldValue("propostaCnpj", formatCnpjDigits(cnpj));
        setFieldValue("propostaRamo", [data.cnae_fiscal, data.cnae_fiscal_descricao].filter(Boolean).join(" - "));
        if (data.opcao_pelo_simples === true) setSelectValue("propostaTributacao", "Simples Nacional");
        if (!value("propostaContato", "") && Array.isArray(data.qsa) && data.qsa.length) {
          setFieldValue("propostaContato", data.qsa[0].nome_socio || data.qsa[0].nome || "");
        }
        syncAllFieldsFilled();
        updateFlowState();
      } catch (error) {
        if (!silent) alert(`Não foi possível buscar o CNPJ. ${error.message || "Tente novamente em instantes."}`);
      } finally {
        setLoading(button, false, "Buscar CNPJ");
      }
    }

    async function consultarSocioCnpjPublico(silent = false) {
      const button = $("buscarSocioCnpj");
      const cnpj = onlyDigits(value("socioCnpj", ""));
      if (cnpj.length !== 14) {
        if (!silent) alert("Informe um CNPJ com 14 dígitos para buscar os dados públicos do sócio PJ.");
        return;
      }
      setLoading(button, true, "Buscar");
      try {
        const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
        if (!response.ok) throw new Error("CNPJ não encontrado.");
        const data = await response.json();
        setFieldValue("socioNome", data.razao_social || data.nome_fantasia || "");
        setFieldValue("socioCnpj", formatCnpjDigits(cnpj));
        setFieldValue("socioEndereco", [
          buildEnderecoCnpj(data),
          [data.municipio, data.uf].filter(Boolean).join("/"),
          data.cep ? `CEP ${data.cep}` : ""
        ].filter(Boolean).join(" - "));
        if (data.email) setFieldValue("socioEmail", data.email);
        if (data.ddd_telefone_1) setFieldValue("socioTelefone", data.ddd_telefone_1);
        syncAllFieldsFilled();
        updateFlowState();
      } catch (error) {
        if (!silent) alert(`Não foi possível buscar o CNPJ do sócio PJ. ${error.message || "Tente novamente em instantes."}`);
      } finally {
        setLoading(button, false, "Buscar");
      }
    }

    async function consultarAberturaSocioCnpjPublico(silent = false) {
      const button = $("buscarAberturaSocioCnpj");
      const cnpj = onlyDigits(value("aberturaSocioCnpj", ""));
      if (cnpj.length !== 14) {
        if (!silent) alert("Informe um CNPJ com 14 dígitos para buscar os dados públicos do sócio PJ.");
        return;
      }
      setLoading(button, true, "Buscar");
      try {
        const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
        if (!response.ok) throw new Error("CNPJ não encontrado.");
        const data = await response.json();
        setFieldValue("aberturaSocioNome", data.razao_social || data.nome_fantasia || "");
        setFieldValue("aberturaSocioCnpj", formatCnpjDigits(cnpj));
        setFieldValue("aberturaSocioEndereco", [
          buildEnderecoCnpj(data),
          [data.municipio, data.uf].filter(Boolean).join("/"),
          data.cep ? `CEP ${data.cep}` : ""
        ].filter(Boolean).join(" - "));
        if (data.cep) setFieldValue("aberturaSocioCep", data.cep);
        syncAllFieldsFilled();
        updateFlowState();
      } catch (error) {
        if (!silent) alert(`Não foi possível buscar o CNPJ do sócio PJ. ${error.message || "Tente novamente em instantes."}`);
      } finally {
        setLoading(button, false, "Buscar");
      }
    }

    function aberturaTipoJuridicoFromCnpj(data = {}) {
      const descricao = String(data.descricao_identificador_matriz_filial || data.descricao_natureza_juridica || data.natureza_juridica || "").toLowerCase();
      if (descricao.includes("mei") || descricao.includes("microempreendedor")) return "Microempreendedor Individual (MEI)";
      if (descricao.includes("empresário") || descricao.includes("empresario")) return "Empresário Individual (EI)";
      if (descricao.includes("unipessoal")) return "Sociedade Limitada Unipessoal (SLU)";
      if (descricao.includes("limitada")) return "Sociedade Limitada (LTDA)";
      if (descricao.includes("anônima") || descricao.includes("anonima")) return "Sociedade Anônima (S.A.)";
      if (descricao.includes("simples")) return "Sociedade Simples";
      return "";
    }

    function preencherAberturaSociosPorQsa(data = {}) {
      const qsa = Array.isArray(data.qsa) ? data.qsa : [];
      if (!qsa.length) return;
      aberturaAdministradores.splice(0, aberturaAdministradores.length, ...qsa.map((socio) => ({
        tipo: "Pessoa física",
        nome: socio.nome_socio || socio.nome || "Não informado",
        cpf: "",
        cnpj: "",
        endereco: "",
        pjResponsavelNome: "",
        pjResponsavelCpf: "",
        cep: "",
        estadoCivil: "",
        regimeCasamento: "",
        profissao: "",
        quotas: "",
        percentual: "",
        qualificacao: socio.qualificacao_socio || socio.qualificacao || "QSA",
        prolabore: "",
        valorProlabore: "",
        certificadoDigital: "",
        senhaGov: "",
        possuiSenhaGov: ""
      })));
      renderAberturaAdministradores();
      stepNote("briefingAbertura", `${qsa.length} sócio(s) identificado(s) no QSA e incluído(s) no briefing.`);
    }

    async function consultarAberturaCnpjConcluidoPublico(silent = false) {
      const button = $("buscarAberturaCnpjConcluido");
      const cnpj = onlyDigits(value("aberturaCnpjConcluido", ""));
      if (cnpj.length !== 14) {
        if (!silent) alert("Informe um CNPJ com 14 dígitos para concluir o Briefing Abertura.");
        return;
      }
      setLoading(button, true, "Buscar CNPJ");
      try {
        const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
        if (!response.ok) throw new Error("CNPJ não encontrado.");
        const data = await response.json();
        setFieldValue("aberturaCnpjConcluido", formatCnpjDigits(cnpj));
        setFieldValue("aberturaRazao", data.razao_social || "");
        if (data.nome_fantasia) setFieldValue("aberturaFantasia", data.nome_fantasia);
        setFieldValue("aberturaCep", data.cep || "");
        setFieldValue("aberturaRua", data.logradouro || data.descricao_tipo_de_logradouro || "");
        setFieldValue("aberturaNumero", data.numero || "");
        setFieldValue("aberturaComplemento", data.complemento || "");
        setFieldValue("aberturaCidade", data.municipio || "");
        setSelectValue("aberturaEstado", data.uf || "");
        setFieldValue("aberturaCapitalSocial", moedaBrasileira(data.capital_social));
        setFieldValue("aberturaAtividadePrincipal", data.cnae_fiscal_descricao || "");
        setFieldValue("aberturaCnaePrincipal", data.cnae_fiscal ? String(data.cnae_fiscal) : "");
        if (Array.isArray(data.cnaes_secundarios) && data.cnaes_secundarios.length) {
          setFieldValue("aberturaCnaesSecundarios", data.cnaes_secundarios.map((item) => [item.codigo, item.descricao].filter(Boolean).join(" - ")).join("\n"));
        }
        const tipoJuridico = aberturaTipoJuridicoFromCnpj(data);
        if (tipoJuridico) setSelectValue("aberturaTipoJuridico", tipoJuridico);
        if (data.opcao_pelo_simples === true) setSelectValue("aberturaRegime", "Simples Nacional");
        preencherAberturaSociosPorQsa(data);
        syncOpeningBriefingToMainFields();
        syncAllFieldsFilled();
        updateFlowState();
      } catch (error) {
        if (!silent) alert(`Não foi possível buscar o CNPJ. ${error.message || "Tente novamente em instantes."}`);
      } finally {
        setLoading(button, false, "Buscar CNPJ");
      }
    }

    function validarCpfPublico() {
      const documento = onlyDigits(value("cnpj", ""));
      if (documento.length > 11) {
        alert("CEI informado. Não há consulta pública de dados pessoais; o sistema manterá apenas a formatação do número.");
        normalizeIdentificacao();
        updateFlowState();
        return;
      }
      if (documento.length !== 11) {
        alert("Informe um CPF com 11 dígitos para validar.");
        return;
      }
      normalizeIdentificacao();
      alert(cpfValido(documento)
        ? "CPF com dígitos verificadores válidos. Não foram consultados dados pessoais."
        : "CPF inválido. Confira os números informados.");
      updateFlowState();
    }

    async function consultarCepPublico() {
      const button = $("buscarCep");
      const cep = onlyDigits(value("cep", ""));
      if (cep.length !== 8) {
        alert("Informe um CEP com 8 dígitos para buscar o endereço.");
        return;
      }
      setLoading(button, true, "Buscar CEP");
      try {
        const found = await preencherEnderecoPorCep(cep, true);
        if (!found) throw new Error("CEP não encontrado.");
        updateFlowState();
      } catch (error) {
        alert(`Não foi possível buscar o CEP. ${error.message || "Tente novamente em instantes."}`);
      } finally {
        setLoading(button, false, "Buscar CEP");
      }
    }

    async function consultarAberturaCepPublico() {
      const button = $("buscarAberturaCep");
      const cep = onlyDigits(value("aberturaCep", ""));
      if (cep.length !== 8) {
        alert("Informe um CEP com 8 dígitos para buscar o endereço.");
        return;
      }
      setLoading(button, true, "Buscar CEP");
      try {
        const found = await preencherAberturaEnderecoPorCep(cep, true);
        if (!found) throw new Error("CEP não encontrado.");
        updateFlowState();
      } catch (error) {
        alert(`Não foi possível buscar o CEP. ${error.message || "Tente novamente em instantes."}`);
      } finally {
        setLoading(button, false, "Buscar CEP");
      }
    }

    async function consultarAberturaSocioCepPublico() {
      const button = $("buscarAberturaSocioCep");
      const cep = onlyDigits(value("aberturaSocioCep", ""));
      if (cep.length !== 8) {
        alert("Informe um CEP com 8 dígitos para buscar o endereço residencial.");
        return;
      }
      setLoading(button, true, "Buscar CEP");
      try {
        const found = await preencherAberturaSocioEnderecoPorCep(cep, true);
        if (!found) throw new Error("CEP não encontrado.");
        updateFlowState();
      } catch (error) {
        alert(`Não foi possível buscar o CEP residencial. ${error.message || "Tente novamente em instantes."}`);
      } finally {
        setLoading(button, false, "Buscar CEP");
      }
    }

    function moduleControls(stepId) {
      const section = $(stepId);
      return Array.from(section.querySelectorAll("input, select, textarea, button")).filter((control) => control.id !== "addSocio" || stepId === "socios");
    }

    function requiredControls(stepId) {
      return Array.from($(stepId).querySelectorAll("input:not([type='checkbox']), select, textarea"))
        .filter((control) => control.type !== "file" && control.type !== "hidden")
        .filter((control) => control.dataset.conditionalDisabled !== "true")
        .filter((control) => !["aberturaAdminNome", "aberturaAdminCpf"].includes(control.id))
        .filter((control) => !control.closest(".hidden") && !control.closest(".workflow-hidden"))
        .filter((control) => !(isPessoaFisica() && control.closest(".pf-optional-field")));
    }

    function updateConditionalFields() {
      document.body.classList.toggle("proposta-mode", isPropostaComercialWorkflow());
      const tipoBriefingNav = document.querySelector('.nav-button[data-jump="tipoBriefingSecao"]');
      const propostaNav = document.querySelector('.nav-button[data-jump="propostaComercialSecao"]');
      if (tipoBriefingNav) tipoBriefingNav.textContent = isPropostaComercialWorkflow() ? "Proposta Comercial" : "Tipo de briefing";
      if (propostaNav) propostaNav.classList.add("workflow-hidden");
      const aberturaCnpjConcluidoWrap = $("aberturaCnpjConcluidoWrap");
      if (aberturaCnpjConcluidoWrap) {
        aberturaCnpjConcluidoWrap.classList.toggle("hidden", !isOpeningConclusionMode());
        aberturaCnpjConcluidoWrap.querySelectorAll("input").forEach((control) => {
          control.dataset.conditionalDisabled = isOpeningConclusionMode() ? "false" : "true";
          if (!isOpeningConclusionMode()) {
            control.value = "";
            control.classList.remove("missing");
          }
        });
      }
      document.querySelectorAll(".abertura-kind-field").forEach((field) => {
        field.classList.toggle("hidden", !isEntradaAberturaWorkflow());
        field.querySelectorAll("input, select, textarea").forEach((control) => {
          control.dataset.conditionalDisabled = isEntradaAberturaWorkflow() ? "false" : "true";
          if (!isEntradaAberturaWorkflow()) {
            control.value = "";
            control.classList.remove("missing");
          }
        });
      });
      const tipoPessoaField = $("tipoPessoa");
      const draftButton = $("saveDraft");
      if (draftButton) draftButton.classList.toggle("workflow-hidden", !tipoBriefing() || isPropostaComercialWorkflow());
      const pessoaFisicaEntradaAbertura = isPessoaFisica();
      const alvaraSection = $("alvaraSecao");
      const alvaraNav = document.querySelector('.nav-button[data-jump="alvaraSecao"]');
      if (alvaraSection) {
        alvaraSection.classList.toggle("workflow-hidden", pessoaFisicaEntradaAbertura);
        alvaraSection.querySelectorAll("input, select, textarea, button").forEach((control) => {
          control.dataset.conditionalDisabled = pessoaFisicaEntradaAbertura ? "true" : "false";
          if (pessoaFisicaEntradaAbertura) control.classList.remove("missing", "draft-missing");
        });
      }
      if (alvaraNav && pessoaFisicaEntradaAbertura) {
        alvaraNav.classList.add("workflow-hidden");
        alvaraNav.classList.remove("locked", "done");
        alvaraNav.disabled = true;
      }
      document.querySelectorAll(".pf-person-hidden").forEach((field) => {
        field.classList.toggle("workflow-hidden", pessoaFisicaEntradaAbertura);
        field.querySelectorAll("input, select, textarea, button").forEach((control) => {
          control.dataset.conditionalDisabled = pessoaFisicaEntradaAbertura ? "true" : "false";
          if (pessoaFisicaEntradaAbertura) control.classList.remove("missing");
        });
      });
      const razaoLabelText = $("razaoLabelText");
      if (razaoLabelText) razaoLabelText.textContent = pessoaFisicaEntradaAbertura ? "Nome - Razão Social" : "Razão Social";
      const sociosTitle = $("sociosTitle");
      const sociosNav = document.querySelector('.nav-button[data-jump="socios"]');
      const sociosLabel = pessoaFisicaEntradaAbertura ? "Empregador - Representante" : "Sócios";
      if (sociosTitle) sociosTitle.textContent = sociosLabel;
      if (sociosNav) sociosNav.textContent = sociosLabel;
      const startSocioPf = $("startSocioPf");
      if (startSocioPf) startSocioPf.textContent = pessoaFisicaEntradaAbertura ? "Adicionar empregador - representante" : "Adicionar sócio PF";
      const addSocioButton = $("addSocio");
      if (addSocioButton) addSocioButton.textContent = pessoaFisicaEntradaAbertura ? "Adicionar Empregador - Representante" : "Adicionar sócio";
      const socioSenhaGovLabelText = $("socioSenhaGovLabelText");
      if (socioSenhaGovLabelText) socioSenhaGovLabelText.textContent = pessoaFisicaEntradaAbertura ? "Senha GOV" : "Senha GOV do sócio / observação";
      if (pessoaFisicaEntradaAbertura) {
        setSelectValue("socioTipo", "Pessoa física");
        setSelectValue("socioQualificacao", "Sócio responsável");
        if ($("socioProlabore")) $("socioProlabore").value = "";
        if ($("socioValorProlabore")) $("socioValorProlabore").value = "";
      }
      const regimeField = $("regime");
      if (regimeField) {
        const options = pessoaFisicaEntradaAbertura ? ["Doméstica", "CAEPF"] : ["Simples Nacional", "Lucro Presumido", "Lucro Real", "MEI"];
        const current = regimeField.value;
        const needsRefresh = Array.from(regimeField.options).map((option) => option.value).join("|") !== options.join("|");
        if (needsRefresh) {
          regimeField.innerHTML = options.map((option) => `<option>${option}</option>`).join("");
          regimeField.value = options.includes(current) ? current : options[0];
        }
      }
      document.querySelectorAll(".receita-imobiliaria-field").forEach((field) => {
        const active = hasReceitaImobiliariaQuestion() && !pessoaFisicaEntradaAbertura;
        field.classList.toggle("hidden", !active);
        field.querySelectorAll("input, select, textarea").forEach((control) => {
          control.dataset.conditionalDisabled = active ? "false" : "true";
          if (!active) {
            control.value = "";
            control.classList.remove("missing");
          }
        });
      });
      const receitaObsWrap = $("receitaImobiliariaObsWrap");
      if (receitaObsWrap) {
        const showObs = hasReceitaImobiliariaQuestion() && value("receitaImobiliaria", "") === "Sim";
        receitaObsWrap.classList.toggle("hidden", !showObs);
        receitaObsWrap.querySelectorAll("textarea").forEach((control) => {
          control.dataset.conditionalDisabled = showObs ? "false" : "true";
          if (!showObs) {
            control.value = "";
            control.classList.remove("missing");
          }
        });
      }
      const aberturaReceitaObsWrap = $("aberturaReceitaImobiliariaObsWrap");
      if (aberturaReceitaObsWrap) {
        const showObs = value("aberturaReceitaImobiliaria", "") === "Sim";
        aberturaReceitaObsWrap.classList.toggle("hidden", !showObs);
        aberturaReceitaObsWrap.querySelectorAll("textarea").forEach((control) => {
          control.dataset.conditionalDisabled = showObs ? "false" : "true";
          if (!showObs) {
            control.value = "";
            control.classList.remove("missing");
          }
        });
      }
      const socioTipo = value("socioTipo", "Pessoa física");
      const socioPessoaJuridica = socioTipo === "Pessoa jurídica";
      const socioProlaboreValorAtivo = !isBaixaWorkflow() && value("socioTipo", "Pessoa física") !== "Pessoa jurídica" && value("socioProlabore", "") === "Sim";
      const socioValorProlaboreWrap = $("socioValorProlaboreWrap");
      const socioValorProlabore = $("socioValorProlabore");
      if (socioValorProlaboreWrap && socioValorProlabore) {
        socioValorProlaboreWrap.classList.toggle("hidden", !socioProlaboreValorAtivo);
        socioValorProlabore.dataset.conditionalDisabled = socioProlaboreValorAtivo ? "false" : "true";
        if (!socioProlaboreValorAtivo) {
          socioValorProlabore.value = "";
          socioValorProlabore.classList.remove("missing");
        }
      }
      ["socioCnpjWrap", "socioEnderecoWrap", "socioPjResponsavelNomeWrap", "socioPjResponsavelCpfWrap"].forEach((id) => {
        const field = $(id);
        if (!field) return;
        field.classList.toggle("hidden", !socioPessoaJuridica);
        field.querySelectorAll("input, select, textarea").forEach((control) => {
          control.dataset.conditionalDisabled = socioPessoaJuridica ? "false" : "true";
          if (!socioPessoaJuridica) {
            control.value = "";
            control.classList.remove("missing");
          }
        });
      });
      ["socioCpf", "socioProlabore", "socioNascimento", "socioSexo", "socioEstadoCivil", "socioRegimeCasamento", "socioMae", "socioTitulo"].forEach((id) => {
        const field = $(id);
        if (!field) return;
        const wrap = field.closest("label");
        if (wrap) wrap.classList.toggle("hidden", socioPessoaJuridica);
        field.dataset.conditionalDisabled = socioPessoaJuridica ? "true" : "false";
        if (socioPessoaJuridica) {
          field.value = "";
          field.classList.remove("missing");
        }
      });
      if (isAlteracaoWorkflow() && tipoPessoaField) {
        tipoPessoaField.value = "Pessoa jurídica";
        tipoPessoaField.classList.remove("missing");
      }
      renderAutomationUploads();
      const observacaoLabel = $("observacaoInicialLabel");
      const observacaoField = $("observacaoInicial");
      if (observacaoLabel) observacaoLabel.textContent = isAlteracaoWorkflow() ? "Observação inicial - Quais estão sendo as alterações." : "Observação inicial";
      if (observacaoField) observacaoField.placeholder = isAlteracaoWorkflow()
        ? "Descreva objetivamente quais alterações serão feitas no contrato social."
        : "Contexto da chegada do cliente, pontos de atenção e recomendações aos setores";
      const identificacaoLabel = $("identificacaoLabel");
      const identificacao = $("cnpj");
      if (identificacaoLabel && identificacao) {
        identificacaoLabel.textContent = isPessoaFisica() ? "CPF - CEI" : "CNPJ";
        identificacao.placeholder = isPessoaFisica() ? "000.000.000-00 / CEI" : "00.000.000/0000-00";
      }
      const buscarCnpj = $("buscarCnpj");
      if (buscarCnpj) buscarCnpj.textContent = isPessoaFisica() ? "Validar CPF" : "Buscar CNPJ";
      document.querySelectorAll(".pf-optional-field").forEach((field) => {
        field.querySelectorAll("input, select, textarea").forEach((control) => {
          if (isPessoaFisica() && !control.value.trim()) control.classList.remove("missing");
        });
      });
      const funcionariosSim = $("funcionarios") && $("funcionarios").value === "Sim";
      const quantidadeWrap = $("quantidadeFuncionariosWrap");
      const quantidade = $("quantidadeFuncionarios");
      if (quantidadeWrap && quantidade) {
        quantidadeWrap.classList.toggle("hidden", !funcionariosSim);
        quantidade.dataset.conditionalDisabled = funcionariosSim ? "false" : "true";
        if (!funcionariosSim) {
          quantidade.value = "";
          quantidade.classList.remove("missing");
        }
      }
      const grupoSim = grupoCadastroExigeNome();
      const grupoWrap = $("nomeGrupoCadastroWrap");
      const nomeGrupo = $("nomeGrupoCadastro");
      if (grupoWrap && nomeGrupo) {
        grupoWrap.classList.toggle("hidden", !grupoSim);
        nomeGrupo.dataset.conditionalDisabled = grupoSim ? "false" : "true";
        if (!grupoSim) {
          nomeGrupo.value = "";
          nomeGrupo.classList.remove("missing");
        }
      }
      const indicacaoSim = $("houveIndicacaoCliente") && $("houveIndicacaoCliente").value === "Sim";
      const origemIndicacaoWrap = $("origemIndicacaoWrap");
      if (origemIndicacaoWrap) {
        origemIndicacaoWrap.classList.toggle("hidden", !indicacaoSim);
        origemIndicacaoWrap.querySelectorAll("input").forEach((control) => {
          control.dataset.conditionalDisabled = indicacaoSim ? "false" : "true";
          if (!indicacaoSim) {
            control.checked = false;
            control.classList.remove("missing");
          }
        });
      }
      const indicacaoPrecisaNome = indicacaoSim && Array.from(document.querySelectorAll(".origemIndicacaoCliente:checked")).some((item) => ["Indicação de cliente", "Indicação de colaborador"].includes(item.value));
      const indicacaoWrap = $("indicacaoClienteWrap");
      const indicacaoCliente = $("indicacaoCliente");
      if (indicacaoWrap && indicacaoCliente) {
        indicacaoWrap.classList.toggle("hidden", !indicacaoPrecisaNome);
        indicacaoCliente.dataset.conditionalDisabled = indicacaoPrecisaNome ? "false" : "true";
        if (!indicacaoPrecisaNome) {
          indicacaoCliente.value = "";
          indicacaoCliente.classList.remove("missing");
        }
      }
      const aberturaGrupoSim = aberturaGrupoExigeNome();
      const aberturaGrupoWrap = $("aberturaNomeGrupoWrap");
      const aberturaNomeGrupo = $("aberturaNomeGrupo");
      if (aberturaGrupoWrap && aberturaNomeGrupo) {
        aberturaGrupoWrap.classList.toggle("hidden", !aberturaGrupoSim);
        aberturaNomeGrupo.dataset.conditionalDisabled = aberturaGrupoSim ? "false" : "true";
        if (!aberturaGrupoSim) {
          aberturaNomeGrupo.value = "";
          aberturaNomeGrupo.classList.remove("missing");
        }
      }
      const aberturaEsAtivo = aberturaEstadoESAtivo();
      document.querySelectorAll(".abertura-es-field").forEach((field) => {
        field.classList.toggle("hidden", !aberturaEsAtivo);
        field.querySelectorAll("input, select, textarea, button, a").forEach((control) => {
          if ("dataset" in control) control.dataset.conditionalDisabled = aberturaEsAtivo ? "false" : "true";
          if (!aberturaEsAtivo && ["INPUT", "SELECT", "TEXTAREA"].includes(control.tagName)) {
            control.value = "";
            control.classList.remove("missing");
          }
        });
      });
      const mapaLink = $("abrirAberturaMapa");
      if (mapaLink) mapaLink.href = aberturaCoordenadasMapaUrl();
      const alvaraEspecificoSim = aberturaSolicitaAlvaraEspecifico();
      const alvaraEspecificoWrap = $("aberturaAlvaraEspecificoWrap");
      const alvaraEspecifico = $("aberturaAlvaraEspecifico");
      if (alvaraEspecificoWrap && alvaraEspecifico) {
        alvaraEspecificoWrap.classList.toggle("hidden", !alvaraEspecificoSim);
        alvaraEspecifico.dataset.conditionalDisabled = alvaraEspecificoSim ? "false" : "true";
        if (!alvaraEspecificoSim) {
          alvaraEspecifico.value = "";
          alvaraEspecifico.classList.remove("missing");
        }
      }
      const aberturaComplemento = $("aberturaComplemento");
      if (aberturaComplemento) {
        const complementoAtivo = aberturaComplementoPermitido();
        aberturaComplemento.dataset.conditionalDisabled = complementoAtivo ? "false" : "true";
        aberturaComplemento.disabled = !complementoAtivo;
        if (!complementoAtivo) {
          aberturaComplemento.value = "";
          aberturaComplemento.classList.remove("missing");
        }
      }
      document.querySelectorAll(".entrada-abertura-field").forEach((field) => {
        const active = isPortabilidadeEntradaWorkflow() || isBriefingAberturaWorkflow();
        field.classList.toggle("hidden", !active);
        field.querySelectorAll("input, select, textarea").forEach((control) => {
          control.dataset.conditionalDisabled = active ? "false" : "true";
          if (!active) {
            control.value = "";
            control.classList.remove("missing");
          }
        });
      });
      document.querySelectorAll(".abertura-only-area-field").forEach((field) => {
        const active = !isPortabilidadeEntradaWorkflow();
        field.classList.toggle("hidden", !active);
        field.querySelectorAll("input, select, textarea").forEach((control) => {
          control.dataset.conditionalDisabled = active ? "false" : "true";
          if (!active) {
            control.value = "";
            control.classList.remove("missing");
          }
        });
      });
      const aberturaSocioPessoaJuridica = value("aberturaSocioTipo", "Pessoa física") === "Pessoa jurídica";
      const aberturaSenhaGovSim = !aberturaSocioPessoaJuridica && $("aberturaPossuiSenhaGov") && $("aberturaPossuiSenhaGov").value === "Sim";
      const aberturaSenhaGovWrap = $("aberturaSenhaGovWrap");
      const aberturaSenhaGov = $("aberturaSenhaGov");
      if (aberturaSenhaGovWrap && aberturaSenhaGov) {
        aberturaSenhaGovWrap.classList.toggle("hidden", !aberturaSenhaGovSim);
        aberturaSenhaGov.dataset.conditionalDisabled = aberturaSenhaGovSim ? "false" : "true";
        if (!aberturaSenhaGovSim) {
          aberturaSenhaGov.value = "";
          aberturaSenhaGov.classList.remove("missing");
        }
      }
      const aberturaProlaboreSim = !aberturaSocioPessoaJuridica && $("aberturaPossuiProlabore") && $("aberturaPossuiProlabore").value === "Sim";
      const aberturaProlaboreWrap = $("aberturaProlaboreWrap");
      const aberturaProlabore = $("aberturaProlabore");
      if (aberturaProlaboreWrap && aberturaProlabore) {
        aberturaProlaboreWrap.classList.toggle("hidden", !aberturaProlaboreSim);
        aberturaProlabore.dataset.conditionalDisabled = aberturaProlaboreSim ? "false" : "true";
        if (!aberturaProlaboreSim) {
          aberturaProlabore.value = "";
          aberturaProlabore.classList.remove("missing");
        }
      }
      ["aberturaSocioCnpjWrap", "aberturaSocioPjResponsavelNomeWrap", "aberturaSocioPjResponsavelCpfWrap"].forEach((id) => {
        const field = $(id);
        if (!field) return;
        field.classList.toggle("hidden", !aberturaSocioPessoaJuridica);
        field.querySelectorAll("input, select, textarea").forEach((control) => {
          control.dataset.conditionalDisabled = aberturaSocioPessoaJuridica ? "false" : "true";
          if (!aberturaSocioPessoaJuridica) {
            control.value = "";
            control.classList.remove("missing");
          }
        });
      });
      ["aberturaSocioCpf", "aberturaSocioCep", "aberturaSocioEstadoCivil", "aberturaSocioRegimeCasamento", "aberturaSocioProfissao", "aberturaPossuiProlabore", "aberturaCertificadoPf", "aberturaPossuiSenhaGov"].forEach((id) => {
        const field = $(id);
        if (!field) return;
        const wrap = field.closest("label");
        if (wrap) wrap.classList.toggle("hidden", aberturaSocioPessoaJuridica);
        field.dataset.conditionalDisabled = aberturaSocioPessoaJuridica ? "true" : "false";
        if (aberturaSocioPessoaJuridica) {
          field.value = "";
          field.classList.remove("missing");
        }
      });
      const aberturaSocioEnderecoWrap = $("aberturaSocioEnderecoWrap");
      if (aberturaSocioEnderecoWrap) aberturaSocioEnderecoWrap.querySelector("input").placeholder = aberturaSocioPessoaJuridica ? "Endereço obtido pelo CNPJ ou preenchido manualmente" : "Endereço residencial";
      const aberturaSocioCasado = !aberturaSocioPessoaJuridica && $("aberturaSocioEstadoCivil") && $("aberturaSocioEstadoCivil").value === "Casado(a)";
      const aberturaSocioRegimeWrap = $("aberturaSocioRegimeWrap");
      if (aberturaSocioRegimeWrap) {
        aberturaSocioRegimeWrap.classList.toggle("hidden", !aberturaSocioCasado);
        aberturaSocioRegimeWrap.querySelectorAll("select").forEach((control) => {
          control.dataset.conditionalDisabled = aberturaSocioCasado ? "false" : "true";
          if (!aberturaSocioCasado) control.value = "";
          control.classList.remove("missing");
        });
      }
      const socioCasado = $("socioEstadoCivil") && $("socioEstadoCivil").value === "Casado(a)";
      const socioRegimeWrap = $("socioRegimeCasamentoWrap");
      if (socioRegimeWrap) {
        socioRegimeWrap.classList.toggle("hidden", !socioCasado);
        socioRegimeWrap.querySelectorAll("select").forEach((control) => {
          control.dataset.conditionalDisabled = socioCasado ? "false" : "true";
          if (!socioCasado) control.value = "";
          control.classList.remove("missing");
        });
      }
      document.querySelectorAll(".baixa-field").forEach((field) => {
        field.classList.toggle("hidden", !isBaixaWorkflow());
        field.querySelectorAll("input, select, textarea").forEach((control) => {
          control.dataset.conditionalDisabled = isBaixaWorkflow() ? "false" : "true";
          if (!isBaixaWorkflow()) {
            control.value = "";
            control.classList.remove("missing");
          }
        });
      });
      document.querySelectorAll(".abertura-field").forEach((field) => {
        field.classList.toggle("hidden", isBaixaWorkflow());
        field.querySelectorAll("input, select, textarea").forEach((control) => {
          control.dataset.conditionalDisabled = isBaixaWorkflow() ? "true" : "false";
          if (isBaixaWorkflow()) {
            if (control.type === "checkbox") control.checked = false;
            else control.value = "";
            control.classList.remove("missing");
          }
        });
      });
      document.querySelectorAll(".abertura-only-area-field").forEach((field) => {
        const active = !isPortabilidadeEntradaWorkflow() && !isBaixaWorkflow();
        field.classList.toggle("hidden", !active);
        field.querySelectorAll("input, select, textarea").forEach((control) => {
          control.dataset.conditionalDisabled = active ? "false" : "true";
          if (!active) {
            control.value = "";
            control.classList.remove("missing");
          }
        });
      });
      document.querySelectorAll(".saida-field").forEach((field) => {
        field.classList.toggle("hidden", !isSaidaWorkflow());
        field.querySelectorAll("input, select, textarea").forEach((control) => {
          control.dataset.conditionalDisabled = isSaidaWorkflow() ? "false" : "true";
          if (!isSaidaWorkflow()) {
            control.value = "";
            control.classList.remove("missing");
          }
        });
      });
      const nomeGrupoSaidaWrap = $("nomeGrupoSaidaWrap");
      const nomeGrupoSaida = $("nomeGrupoSaida");
      const grupoSaidaSim = isSaidaWorkflow() && value("grupoSaida", "") === "Sim";
      if (nomeGrupoSaidaWrap && nomeGrupoSaida) {
        nomeGrupoSaidaWrap.classList.toggle("hidden", !grupoSaidaSim);
        nomeGrupoSaida.dataset.conditionalDisabled = grupoSaidaSim ? "false" : "true";
        if (!grupoSaidaSim) {
          nomeGrupoSaida.value = "";
          nomeGrupoSaida.classList.remove("missing");
        }
      }
      document.querySelectorAll(".financeiro-forma-pagamento-field, .financeiro-competencia-field").forEach((field) => {
        field.classList.toggle("hidden", isSaidaWorkflow());
        field.querySelectorAll("input, select, textarea").forEach((control) => {
          control.dataset.conditionalDisabled = isSaidaWorkflow() ? "true" : "false";
          if (isSaidaWorkflow()) {
            control.value = "";
            control.classList.remove("missing");
          }
        });
      });
      document.querySelectorAll(".entrada-field").forEach((field) => {
        field.classList.toggle("hidden", !isPortabilidadeEntradaWorkflow());
        field.querySelectorAll("input, select, textarea").forEach((control) => {
          control.dataset.conditionalDisabled = isPortabilidadeEntradaWorkflow() ? "false" : "true";
          if (!isPortabilidadeEntradaWorkflow()) {
            control.value = "";
            control.classList.remove("missing");
          }
        });
      });
      document.querySelectorAll(".baixa-saida-hidden-field").forEach((field) => {
        field.classList.toggle("hidden", isBaixaWorkflow());
        field.querySelectorAll("input, select, textarea").forEach((control) => {
          control.dataset.conditionalDisabled = isBaixaWorkflow() ? "true" : "false";
          if (isBaixaWorkflow()) {
            if (control.type === "checkbox") control.checked = false;
            else control.value = "";
            control.classList.remove("missing");
          }
        });
      });
      if (isBaixaWorkflow()) {
        document.querySelectorAll(".formaAtuacao, .aberturaFormaAtuacao").forEach((control) => {
          control.checked = false;
          control.disabled = true;
          control.dataset.conditionalDisabled = "true";
          const wrapper = control.closest(".check");
          if (wrapper) wrapper.classList.add("hidden");
        });
      } else {
        document.querySelectorAll(".formaAtuacao, .aberturaFormaAtuacao").forEach((control) => {
          control.disabled = false;
          control.dataset.conditionalDisabled = "false";
          const wrapper = control.closest(".check");
          if (wrapper) wrapper.classList.remove("hidden");
        });
      }
      document.querySelectorAll(".saida-hidden-field").forEach((field) => {
        field.classList.toggle("hidden", isSaidaWorkflow());
        field.querySelectorAll("input, select, textarea").forEach((control) => {
          control.dataset.conditionalDisabled = isSaidaWorkflow() ? "true" : "false";
          if (isSaidaWorkflow()) {
            control.value = "";
            control.classList.remove("missing");
          }
        });
      });
      document.querySelectorAll(".entrada-hidden-field").forEach((field) => {
        const hidden = isPortabilidadeEntradaWorkflow() || isSaidaWorkflow();
        field.classList.toggle("hidden", hidden);
        field.querySelectorAll("input, select, textarea").forEach((control) => {
          control.dataset.conditionalDisabled = hidden ? "true" : "false";
          if (hidden) {
            control.value = "";
            control.classList.remove("missing");
          }
        });
      });
      document.querySelectorAll(".non-baixa-socio-field").forEach((field) => {
        const hideForCompanyPartner = value("socioTipo", "Pessoa física") === "Pessoa jurídica";
        const hidden = isBaixaWorkflow() || hideForCompanyPartner;
        field.classList.toggle("hidden", hidden);
        field.querySelectorAll("input, select, textarea").forEach((control) => {
          control.dataset.conditionalDisabled = hidden ? "true" : "false";
          if (hidden) {
            control.value = "";
            control.classList.remove("missing");
          }
        });
      });
      const socioPjAtivo = value("socioTipo", "Pessoa física") === "Pessoa jurídica";
      ["socioCnpjWrap", "socioEnderecoWrap", "socioPjResponsavelNomeWrap", "socioPjResponsavelCpfWrap"].forEach((id) => {
        const field = $(id);
        if (!field) return;
        field.classList.toggle("hidden", !socioPjAtivo);
        field.querySelectorAll("input, select, textarea").forEach((control) => {
          control.dataset.conditionalDisabled = socioPjAtivo ? "false" : "true";
          if (!socioPjAtivo) {
            control.value = "";
            control.classList.remove("missing");
          }
        });
      });
      document.querySelectorAll(".alteracao-field").forEach((field) => {
        field.classList.toggle("hidden", !isAlteracaoWorkflow());
        field.querySelectorAll("input, select, textarea").forEach((control) => {
          control.dataset.conditionalDisabled = isAlteracaoWorkflow() ? "false" : "true";
          if (!isAlteracaoWorkflow()) {
            if (control.type === "checkbox") control.checked = false;
            else control.value = "";
            control.classList.remove("missing");
          }
        });
      });
      const eventosSelecionados = new Set(Array.from(document.querySelectorAll(".alteracaoEvento:checked")).map((item) => item.value));
      document.querySelectorAll(".alteracao-evento-detalhe-wrap").forEach((field) => {
        const active = isAlteracaoWorkflow() && eventosSelecionados.has(field.dataset.event);
        field.classList.toggle("hidden", !active);
        field.querySelectorAll("textarea").forEach((control) => {
          control.dataset.conditionalDisabled = active ? "false" : "true";
          if (!active) {
            control.value = "";
            control.classList.remove("missing");
          }
        });
      });
      const mudancaTributacao = $("mudancaTributacao");
      const tributacaoDetalhada = !isAlteracaoWorkflow() || (mudancaTributacao && mudancaTributacao.value === "Sim");
      document.querySelectorAll(".alteracao-tributacao-field").forEach((field) => {
        field.classList.toggle("hidden", !tributacaoDetalhada);
        field.querySelectorAll("input, select, textarea").forEach((control) => {
          control.dataset.conditionalDisabled = tributacaoDetalhada ? "false" : "true";
          if (!tributacaoDetalhada) {
            control.value = "";
            control.classList.remove("missing");
          }
        });
      });
      const honorariosSim = isSaidaWorkflow() && $("honorariosAberto") && $("honorariosAberto").value === "Sim";
      document.querySelectorAll(".honorarios-aberto-field").forEach((field) => {
        field.classList.toggle("hidden", !honorariosSim);
        field.querySelectorAll("input, select, textarea").forEach((control) => {
          control.dataset.conditionalDisabled = honorariosSim ? "false" : "true";
          if (!honorariosSim) {
            control.value = "";
            control.classList.remove("missing");
          }
        });
      });
      const honorarioBaseAtivo = isPortabilidadeEntradaWorkflow() || isBriefingAberturaWorkflow();
      document.querySelectorAll(".financeiro-honorario-base-field").forEach((field) => {
        const active = isPortabilidadeEntradaWorkflow();
        field.classList.toggle("hidden", !active);
        field.querySelectorAll("input").forEach((control) => {
          control.dataset.conditionalDisabled = active ? "false" : "true";
          if (!active) {
            control.checked = false;
            control.value = "";
            control.classList.remove("missing");
          }
        });
      });
      document.querySelectorAll(".abertura-honorario-base-field").forEach((field) => {
        const active = isBriefingAberturaWorkflow();
        field.classList.toggle("hidden", !active);
        field.querySelectorAll("input").forEach((control) => {
          control.dataset.conditionalDisabled = active ? "false" : "true";
          if (!active) {
            control.checked = false;
            control.value = "";
            control.classList.remove("missing");
          }
        });
      });
      const honorarioProvisorioAtivo = honorarioBaseAtivo && $("honorarioBaseSemMovimentacao")?.checked;
      document.querySelectorAll(".honorario-provisorio-field").forEach((field) => {
        field.classList.toggle("hidden", !honorarioProvisorioAtivo);
        field.querySelectorAll("input").forEach((control) => {
          control.dataset.conditionalDisabled = honorarioProvisorioAtivo ? "false" : "true";
          if (!honorarioProvisorioAtivo) {
            control.value = "";
            control.classList.remove("missing");
          }
        });
      });
      const aberturaHonorarioProvisorioAtivo = isBriefingAberturaWorkflow() && $("aberturaHonorarioBaseSemMovimentacao")?.checked;
      document.querySelectorAll(".abertura-honorario-provisorio-field").forEach((field) => {
        field.classList.toggle("hidden", !aberturaHonorarioProvisorioAtivo);
        field.querySelectorAll("input").forEach((control) => {
          control.dataset.conditionalDisabled = aberturaHonorarioProvisorioAtivo ? "false" : "true";
          if (!aberturaHonorarioProvisorioAtivo) {
            control.value = "";
            control.classList.remove("missing");
          }
        });
      });
    }

    function checkboxGroupComplete(selector) {
      return document.querySelectorAll(`${selector}:checked`).length > 0;
    }

    function controlFilled(control) {
      return String(control.value || "").trim().length > 0;
    }

    function setMissing(control, missing) {
      if (!control) return;
      control.classList.toggle("missing", missing);
    }

    function markRequiredFields(stepId) {
      requiredControls(stepId).forEach((control) => setMissing(control, !controlFilled(control)));
    }

    function clearMissingFields(stepId) {
      const section = $(stepId);
      if (!section) return;
      section.querySelectorAll(".missing").forEach((control) => control.classList.remove("missing"));
    }

    function stepNote(stepId, message) {
      const section = $(stepId);
      let note = section.querySelector(".step-note");
      if (!note) {
        note = document.createElement("div");
        note.className = "step-note";
        section.querySelector(".section-body").prepend(note);
      }
      note.textContent = message;
      note.classList.toggle("visible", Boolean(message));
    }

    function isEmpresaComplete(showMissing = false) {
      const requiredIds = isBaixaWorkflow()
        ? [
            "razao",
            "fantasia",
            "grupoCadastro",
            "cnpj",
            "endereco",
            "cep",
            "municipio",
            "estado",
            "telefoneEmpresa",
            "dataBaixa",
            "ultimaCompetenciaBaixa",
            "motivoBaixa",
            ...(isSaidaWorkflow()
              ? ["grupoSaida", "possuiFiliais", "transmissaoDeclaracoes", "ultimaCompetenciaOrteconte", "honorarioAnterior", "motivoSaida", "emailEnvioDocumentacao"]
              : [])
          ]
        : null;
      const controls = requiredIds ? requiredIds.map((id) => $(id)).filter(Boolean) : requiredControls("empresa");
      const nomeGrupoSaidaComplete = !isSaidaWorkflow() || value("grupoSaida", "") !== "Sim" || controlFilled($("nomeGrupoSaida"));
      const fieldsComplete = controls.every(controlFilled) && nomeGrupoSaidaComplete;
      const formaComplete = isBaixaWorkflow() || isPessoaFisica() ? true : checkboxGroupComplete(".formaAtuacao");
      const alteracaoComplete = isAlteracaoWorkflow() ? checkboxGroupComplete(".alteracaoEvento") : true;
      if (showMissing) {
        if (requiredIds) controls.forEach((control) => setMissing(control, !controlFilled(control)));
        else markRequiredFields("empresa");
        setMissing($("nomeGrupoSaida"), isSaidaWorkflow() && value("grupoSaida", "") === "Sim" && !controlFilled($("nomeGrupoSaida")));
        stepNote("empresa", fieldsComplete && formaComplete && alteracaoComplete ? "" : (isAlteracaoWorkflow()
          ? "Preencha os dados cadastrais, selecione ao menos um evento, detalhe cada evento marcado e informe se haverá alteração de sócios."
          : "Preencha todos os dados cadastrais e selecione ao menos uma forma de atuação."));
      }
      return fieldsComplete && formaComplete && alteracaoComplete;
    }

    function isSociosComplete(showMissing = false) {
      const globalIds = isPessoaFisica() ? [] : isSaidaWorkflow()
        ? ["usuarioExterno", "socioQualificacaoObs"]
        : ["usuarioExterno", "govObs", "socioQualificacaoObs"];
      if (showMissing) {
        globalIds.forEach((id) => setMissing($(id), false));
        if (!socios.length) {
          const socioPessoaJuridica = !isPessoaFisica() && value("socioTipo", "Pessoa física") === "Pessoa jurídica";
          const socioRequiredIds = socioPessoaJuridica
            ? ["socioNome", "socioCnpj", "socioEndereco", "socioParticipacao", "socioEmail", "socioTelefone", "socioQualificacao"]
            : ["socioNome", "socioCpf", "socioParticipacao", "socioNascimento", "socioEmail", "socioTelefone", "socioSexo", "socioEstadoCivil"];
          if (!isPessoaFisica() && !socioPessoaJuridica) socioRequiredIds.push("socioQualificacao");
          if (!socioPessoaJuridica && value("socioEstadoCivil", "") === "Casado(a)") socioRequiredIds.push("socioRegimeCasamento");
          if (!isPessoaFisica() && !socioPessoaJuridica && !isBaixaWorkflow()) {
            socioRequiredIds.push("socioProlabore");
            if (value("socioProlabore", "") === "Sim") socioRequiredIds.push("socioValorProlabore");
          }
          socioRequiredIds.forEach((id) => setMissing($(id), value(id, "") === ""));
        }
        stepNote("socios", socios.length ? "" : "Adicione pelo menos um sócio completo para seguir para as demais etapas.");
      }
      return socios.length > 0;
    }

    function isGenericStepComplete(stepId, showMissing = false) {
      if (stepId === "indicacaoClienteSecao") return isIndicacaoClienteComplete(showMissing);
      const fieldsComplete = requiredControls(stepId).every(controlFilled);
      const checkboxComplete = stepId === "implantacao" ? checkboxGroupComplete(".task") : true;
      if (showMissing) {
        markRequiredFields(stepId);
        const label = stepId === "implantacao" ? "Preencha os campos e selecione ao menos uma tarefa de processo." : "Preencha todos os campos deste módulo.";
        stepNote(stepId, fieldsComplete && checkboxComplete ? "" : label);
      }
      return fieldsComplete && checkboxComplete;
    }

    function indicacaoOrigensSelecionadas() {
      return Array.from(document.querySelectorAll(".origemIndicacaoCliente:checked")).map((item) => item.value);
    }

    function indicacaoExigeNome() {
      return indicacaoOrigensSelecionadas().some((item) => ["Indicação de cliente", "Indicação de colaborador"].includes(item));
    }

    function indicacaoClienteResumo() {
      const houve = value("houveIndicacaoCliente", "");
      if (!houve) return "";
      if (houve === "Não") return "Não";
      const origens = indicacaoOrigensSelecionadas();
      const nome = value("indicacaoCliente", "");
      return [
        "Sim",
        origens.length ? `Origem: ${origens.join(", ")}` : "",
        nome ? `Quem indicou: ${nome}` : ""
      ].filter(Boolean).join(" | ");
    }

    function isIndicacaoClienteComplete(showMissing = false) {
      const houve = $("houveIndicacaoCliente");
      const houveComplete = controlFilled(houve);
      const origens = indicacaoOrigensSelecionadas();
      const origemComplete = value("houveIndicacaoCliente", "") !== "Sim" || origens.length > 0;
      const nomeComplete = !indicacaoExigeNome() || controlFilled($("indicacaoCliente"));
      if (showMissing) {
        setMissing(houve, !houveComplete);
        document.querySelectorAll(".origemIndicacaoCliente").forEach((item) => setMissing(item, value("houveIndicacaoCliente", "") === "Sim" && !origemComplete));
        setMissing($("indicacaoCliente"), !nomeComplete);
        stepNote("indicacaoClienteSecao", houveComplete && origemComplete && nomeComplete ? "" : "Informe se houve indicação. Se sim, marque a origem; para indicação de cliente ou colaborador, informe quem indicou.");
      }
      return houveComplete && origemComplete && nomeComplete;
    }

    function isBriefingAberturaComplete(showMissing = false) {
      const fieldsComplete = requiredControls("briefingAbertura").every(controlFilled);
      if (showMissing) {
        markRequiredFields("briefingAbertura");
        stepNote("briefingAbertura", fieldsComplete ? "" : "Preencha todos os campos da ficha Briefing Abertura.");
      }
      return fieldsComplete;
    }

    function isUsuariosExternosComplete(showMissing = false) {
      const draftControls = ["usuarioExternoEmail", "usuarioExternoTelefone", "usuarioExternoObservacoes"].map((id) => $(id)).filter(Boolean);
      const hasDraft = draftControls.some(controlFilled);
      const draftComplete = !hasDraft || controlFilled($("usuarioExternoEmail"));
      if (showMissing) {
        setMissing($("usuarioExternoEmail"), hasDraft && !draftComplete);
        stepNote("usuariosExternosSecao", draftComplete ? "" : "Informe o e-mail do usuário externo antes de seguir ou adicione o registro à lista.");
      }
      return draftComplete;
    }

    function isPropostaComercialComplete(showMissing = false) {
      const controls = requiredControls("propostaComercialSecao");
      const missing = controls.filter((control) => !controlFilled(control));
      const servicosSelecionados = propostaServicosSelecionados();
      if (showMissing) {
        controls.forEach((control) => setMissing(control, missing.includes(control)));
        document.querySelectorAll(".propostaServico").forEach((control) => setMissing(control, !servicosSelecionados.length));
        stepNote("propostaComercialSecao", missing.length || !servicosSelecionados.length ? "Preencha todos os campos da proposta comercial e selecione ao menos um serviço contratado antes de salvar ou gerar o documento." : "");
        if (missing.length) {
          missing[0].scrollIntoView({ behavior: "smooth", block: "center" });
          missing[0].focus();
        } else if (!servicosSelecionados.length) {
          $("propostaServicosWrap")?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
      return missing.length === 0 && servicosSelecionados.length > 0;
    }

    function isStepComplete(stepId, showMissing = false) {
      if (stepId === "briefingAbertura") return isBriefingAberturaComplete(showMissing);
      if (stepId === "usuariosExternosSecao") return isUsuariosExternosComplete(showMissing);
      if (stepId === "propostaComercialSecao") return isPropostaComercialComplete(showMissing);
      if (stepId === "empresa") return isEmpresaComplete(showMissing);
      if (stepId === "socios") return isSociosComplete(showMissing);
      return isGenericStepComplete(stepId, showMissing);
    }

    function markJustUnlocked(section) {
      section.classList.remove("just-unlocked");
      void section.offsetWidth;
      section.classList.add("just-unlocked");
      setTimeout(() => section.classList.remove("just-unlocked"), 420);
    }

    function navButtonForStep(stepId) {
      if (isPropostaComercialWorkflow() && stepId === "propostaComercialSecao") {
        return document.querySelector('.nav-button[data-jump="tipoBriefingSecao"]');
      }
      return document.querySelector(`.nav-button[data-jump="${stepId}"]`);
    }

    function refreshStepLocks() {
      const stepOrder = activeStepOrder();
      if (restoredFinalHistoryMode) {
        highestUnlockedIndex = Math.max(0, stepOrder.length - 1);
      } else {
        highestUnlockedIndex = 0;
        for (let index = 0; index < stepOrder.length - 1; index += 1) {
          if (isStepComplete(stepOrder[index], false)) highestUnlockedIndex = index + 1;
          else break;
        }
      }

      allSteps.forEach((stepId) => {
        const active = stepOrder.includes(stepId);
        const section = $(stepId);
        if (!section) return;
        section.classList.toggle("workflow-hidden", !active);
        const nav = document.querySelector(`.nav-button[data-jump="${stepId}"]`);
        if (nav) {
          const isTipoAsProposta = isPropostaComercialWorkflow() && stepId === "tipoBriefingSecao";
          const isDedicatedPropostaNav = isPropostaComercialWorkflow() && stepId === "propostaComercialSecao";
          nav.classList.toggle("workflow-hidden", isDedicatedPropostaNav || (!active && !isTipoAsProposta));
        }
      });

      stepOrder.forEach((stepId, index) => {
        const section = $(stepId);
        const locked = index > highestUnlockedIndex;
        const complete = isStepComplete(stepId, false);
        const wasLocked = section.classList.contains("locked");
        section.classList.toggle("locked", locked);
        if (wasLocked && !locked) markJustUnlocked(section);
        section.classList.toggle("complete", complete);
        moduleControls(stepId).forEach((control) => {
          control.disabled = locked || control.dataset.conditionalDisabled === "true";
        });
        const nav = navButtonForStep(stepId);
        if (nav) {
          nav.classList.toggle("locked", locked);
          nav.classList.toggle("done", complete);
          nav.disabled = locked;
        }
        if (locked) stepNote(stepId, "");
        if (complete) clearMissingFields(stepId);
      });

      if (!restoredFinalHistoryMode && !isPropostaComercialWorkflow()) {
        const blocker = stepOrder[highestUnlockedIndex];
        if (blocker && !isStepComplete(blocker, false)) isStepComplete(blocker, true);
      }
    }

    function validateVisibleSteps() {
      activeStepOrder().slice(0, highestUnlockedIndex + 1).forEach((stepId) => isStepComplete(stepId, true));
    }

    function updateFlowState() {
      updateConditionalFields();
      refreshStepLocks();
      syncAllFieldsFilled();
      render();
    }

    function syncFieldFilled(field) {
      if (field.type === "checkbox" || field.type === "radio") return;
      field.classList.toggle("filled", Boolean(field.value && field.value.trim()));
    }

    function syncAllFieldsFilled() {
      document.querySelectorAll("input, select, textarea").forEach(syncFieldFilled);
    }

    function dateLabel(raw) {
      if (!raw) return "Não informado";
      const [year, month, day] = raw.split("-");
      return `${day}/${month}/${year}`;
    }

    function todayDateLabel() {
      return new Date().toLocaleDateString("pt-BR");
    }

    function contractDistratoDateLabel() {
      return dateLabel(value("dataContratoDistrato", ""));
    }

    function currentDisplayDate() {
      return currentDoc === "contrato" ? (contractDistratoDateLabel() || todayDateLabel()) : todayDateLabel();
    }

    function ensureEmissionDateForCurrentContract() {
      if (currentDoc !== "contrato") return true;
      if (value("dataContratoDistrato", "")) return true;
      const field = $("dataContratoDistrato");
      setMissing(field, true);
      stepNote("financeiro", "Informe a Data do contrato-distrato antes de gerar contrato, distrato, PDF ou Word.");
      field?.scrollIntoView({ behavior: "smooth", block: "center" });
      field?.focus();
      return false;
    }

    function monthLabel(raw) {
      if (!raw) return "Não informado";
      const [year, month] = raw.split("-");
      return `${month}/${year}`;
    }

    function monthLongLabel(raw) {
      if (!raw) return "Não informado";
      const [year, month] = raw.split("-");
      const names = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
      return `${names[Number(month) - 1]} de ${year}`;
    }

    function longDateFromDate(raw) {
      if (!raw) return "Não informado";
      const [year, month, day] = raw.split("-");
      const names = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      return `${Number(day)} de ${names[Number(month) - 1]} de ${year}`;
    }

    function distratoDateLabel() {
      if (isSaidaWorkflow()) return monthLongLabel($("ultimaCompetenciaOrteconte").value);
      return longDateFromDate($("dataBaixa").value);
    }

    function selectedTasks() {
      return Array.from(document.querySelectorAll(".task:checked")).map((item) => item.value);
    }

    function selectedFormaAtuacao() {
      const items = Array.from(document.querySelectorAll(".formaAtuacao:checked")).map((item) => item.value);
      return items.length ? items.join(", ") : "Não informado";
    }

    function selectedAberturaFormaAtuacao() {
      const items = Array.from(document.querySelectorAll(".aberturaFormaAtuacao:checked")).map((item) => item.value);
      return items.length ? items.join(", ") : "Não informado";
    }

    function selectedAberturaDocumentos() {
      const items = Array.from(document.querySelectorAll(".aberturaDocumento:checked")).map((item) => item.value);
      return items.length ? items.join(", ") : "Não informado";
    }

    function selectedAlteracaoEventos() {
      const items = Array.from(document.querySelectorAll(".alteracaoEvento:checked")).map((item) => item.value);
      return items.length ? items.join(", ") : "Não informado";
    }

    function alteracaoEventosDetalhesRows() {
      const rowsData = Array.from(document.querySelectorAll(".alteracaoEvento:checked")).map((item) => {
        const detalhe = Array.from(document.querySelectorAll(".alteracaoEventoDetalhe"))
          .find((field) => field.dataset.event === item.value);
        return [item.value, detalhe && detalhe.value.trim() ? detalhe.value.trim() : "Não informado"];
      });
      return rowsData.length ? rowsData : [["Eventos selecionados", "Não informado"]];
    }

    function honorarioFinanceiro() {
      return value("financeiroHonorario", value("honorario"));
    }

    function competenciaFinanceira() {
      return monthLabel(value("financeiroCompetencia", "") || value("competencia", ""));
    }

    function formaPagamentoContrato() {
      const forma = value("formaPagamento", "boleto bancário").toLowerCase();
      if (forma.includes("boleto")) return "boleto bancário";
      if (forma.includes("pix")) return "pagamento via PIX";
      if (forma.includes("transfer")) return "transferência bancária";
      return forma;
    }

    function paragrafoValorServicosContrato() {
      const honorario = honorarioFinanceiro();
      const valorServicos = value("financeiroValor", honorario);
      const provisorio = value("honorarioProvisorio", value("aberturaHonorarioProvisorio", ""));
      const observacao = value("financeiroObservacao", "Dependendo do processo, esse valor pode ser reajustado.");
      const usarHonorarioBase = (isPortabilidadeEntradaWorkflow() || isBriefingAberturaWorkflow()) && ($("honorarioBaseSemMovimentacao")?.checked || $("aberturaHonorarioBaseSemMovimentacao")?.checked) && provisorio;
      if (!usarHonorarioBase) {
        return `<strong>VALOR DOS SERVIÇOS E CONDIÇÕES DE PAGAMENTO:</strong> A CONTRATANTE pagará à CONTRATADA o valor de ${valorServicos} e os honorários mensais de ${honorario}, com forma de pagamento por ${value("formaPagamento")}, competência inicial ${competenciaFinanceira()}. ${observacao}`;
      }
      return `<strong>VALOR DOS SERVIÇOS E CONDIÇÕES DE PAGAMENTO:</strong> A CONTRATANTE pagará à CONTRATADA o valor inicial de ${valorServicos} (${valorMonetarioPorExtenso(valorServicos)}), bem como honorários mensais no valor de ${honorario} (${valorMonetarioPorExtenso(honorario)}), mediante ${formaPagamentoContrato()}, com competência inicial a ser oportunamente definida. Os valores poderão ser reajustados em razão da complexidade, do volume ou das particularidades dos serviços efetivamente executados, mediante prévia comunicação à CONTRATANTE. Durante os períodos em que não houver movimentação, operação ou demanda relacionada aos serviços contratados, será devido o valor mensal mínimo de ${provisorio} (${valorMonetarioPorExtenso(provisorio)}), a título de manutenção, disponibilidade técnica e acompanhamento da CONTRATADA, permanecendo a cobrança até que haja o restabelecimento da movimentação ou a rescisão formal do contrato.`;
    }

    function identificacaoTitulo() {
      return isPessoaFisica() ? "CPF - CEI" : "CNPJ";
    }

    function optionalPessoaFisica(id, suffix = "") {
      const content = value(id, "");
      return content ? `${content}${suffix}` : "Desconsiderar";
    }

    function rows(items) {
      return items
        .filter(([, text]) => isMeaningfulDocValue(text))
        .map(([label, text]) => `<tr><th>${label}</th><td>${text}</td></tr>`)
        .join("");
    }

    function isMeaningfulDocValue(text) {
      const clean = String(text || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      if (!clean) return false;
      const invalidExact = new Set([
        "não informado",
        "não informada",
        "não aplicável",
        "não se aplica",
        "desconsiderar",
        "desconsiderado",
        "desconsiderada",
        "e-mail não informado",
        "telefone não informado",
        "endereço não informado",
        "nenhuma tarefa selecionada"
      ]);
      if (invalidExact.has(clean.replace(/\.$/, ""))) return false;
      return !/^não informado\b/.test(clean)
        && !/^não informada\b/.test(clean)
        && !/^não aplicável\b/.test(clean)
        && !/^não se aplica\b/.test(clean)
        && !/^desconsiderad[oa]\b/.test(clean)
        && !/^desconsiderar\b/.test(clean);
    }

    function rowsFilled(items) {
      return rows(items.filter(([, text]) => isMeaningfulDocValue(text)));
    }

    function sectionTitle(number, title) {
      return `<h3><span class="section-number">${number}</span>${title}</h3>`;
    }

    function sectionNumber(base) {
      return isAlteracaoWorkflow() ? base + 1 : base;
    }

    function sociosRows() {
      if (!socios.length) return "<p>N\u00e3o informado.</p>";
      const rowFor = (s) => {
        const documento = s.tipo === "Pessoa jur\u00eddica" ? s.cnpj : s.cpf;
        const responsavelPj = s.pjResponsavelNome ? "<br>Respons\u00e1vel pela PJ: " + escapeHtml(s.pjResponsavelNome) + " - CPF " + escapeHtml(s.pjResponsavelCpf || "N\u00e3o informado") : "";
        const acessos = [
          s.certificadoDigital ? "Certificado digital: " + escapeHtml(s.certificadoDigital) : "Certificado digital: N\u00e3o informado",
          s.senhaGov ? "Senha GOV: " + escapeHtml(s.senhaGov) : "Senha GOV: N\u00e3o informado"
        ].join("<br>");
        const baseNome = escapeHtml(s.nome) + "<br>" + escapeHtml(s.email || "") + "<br>" + escapeHtml(s.telefone || "") + (s.endereco ? "<br>" + escapeHtml(s.endereco) : "") + responsavelPj;
        if (isPessoaFisica()) {
          const dadosPessoais = [
            "Nascimento: " + escapeHtml(dateLabel(s.nascimento) || "N\u00e3o informado"),
            "Sexo: " + escapeHtml(s.sexo || "N\u00e3o informado"),
            "Estado civil: " + escapeHtml(s.estadoCivil || "N\u00e3o informado"),
            "Regime de casamento: " + escapeHtml(s.regimeCasamento || "N\u00e3o aplic\u00e1vel")
          ].join("<br>");
          return "<tr><td>" + baseNome + "</td><td>" + escapeHtml(documento || "N\u00e3o informado") + "</td><td>" + dadosPessoais + "</td><td>Participa\u00e7\u00e3o: " + escapeHtml(s.participacao || "N\u00e3o informado") + "<br>" + acessos + "</td></tr>";
        }
        const qualificacao = escapeHtml(s.qualificacao || "N\u00e3o informado") + "<br>" + escapeHtml(s.estadoCivil || "N\u00e3o aplic\u00e1vel") + "<br>" + escapeHtml(s.regimeCasamento || "N\u00e3o aplic\u00e1vel");
        if (isBaixaWorkflow()) {
          return "<tr><td>" + baseNome + "</td><td>" + escapeHtml(documento || "N\u00e3o informado") + "</td><td>" + qualificacao + "</td><td>" + escapeHtml(s.participacao || "N\u00e3o informado") + "</td></tr>";
        }
        const prolabore = s.prolabore ? "Pr\u00f3-labore: " + escapeHtml(s.prolabore) + "<br>Valor: " + escapeHtml(s.valorProlabore || "N\u00e3o aplic\u00e1vel") + "<br>" : "";
        return "<tr><td>" + baseNome + "</td><td>" + escapeHtml(documento || "N\u00e3o informado") + "</td><td>" + qualificacao + "</td><td>Participa\u00e7\u00e3o: " + escapeHtml(s.participacao || "N\u00e3o informado") + "<br>" + prolabore + acessos + "</td></tr>";
      };
      if (isBaixaWorkflow()) {
        return "<table class=\"doc-table\"><thead><tr><th>Nome</th><th>Documento</th><th>Qualifica\u00e7\u00e3o</th><th>Participa\u00e7\u00e3o</th></tr></thead><tbody>" + socios.map(rowFor).join("") + "</tbody></table>";
      }
      if (isPessoaFisica()) {
        return "<table class=\"doc-table\"><thead><tr><th>Empregador - Representante</th><th>CPF</th><th>Dados pessoais</th><th>Participa\u00e7\u00e3o / acessos</th></tr></thead><tbody>" + socios.map(rowFor).join("") + "</tbody></table>";
      }
      return "<table class=\"doc-table\"><thead><tr><th>Nome</th><th>Documento</th><th>Qualifica\u00e7\u00e3o</th><th>Participa\u00e7\u00e3o / acessos</th></tr></thead><tbody>" + socios.map(rowFor).join("") + "</tbody></table>";
    }

    function usuariosExternosRows() {
      const legacyEmail = value("usuarioExterno", "");
      const draft = {
        email: value("usuarioExternoEmail", ""),
        telefone: value("usuarioExternoTelefone", ""),
        observacoes: value("usuarioExternoObservacoes", "")
      };
      const lista = usuariosExternos.map((usuario) => ({ ...usuario }));
      if ((draft.email || draft.telefone || draft.observacoes) && !lista.some((usuario) => usuario.email === draft.email && usuario.telefone === draft.telefone)) lista.push(draft);
      if (!lista.length && legacyEmail) lista.push({ email: legacyEmail, telefone: "", observacoes: value("govObs", "") });
      if (!lista.length) return "<p>N\u00e3o informado.</p>";
      return `<table class="doc-table"><thead><tr><th>E-mail</th><th>Telefone</th><th>Observa&ccedil;&otilde;es</th></tr></thead><tbody>${lista.map((usuario) => `
        <tr>
          <td>${escapeHtml(usuario.email || "N\u00e3o informado")}</td>
          <td>${escapeHtml(usuario.telefone || "N\u00e3o informado")}</td>
          <td>${escapeHtml(usuario.observacoes || "N\u00e3o informado")}</td>
        </tr>
      `).join("")}</tbody></table>`;
    }

    function contadorAnteriorRows() {
      return rowsFilled([
        ["Nome", value("contadorAnteriorNome", "")],
        ["Telefone", value("contadorAnteriorTelefone", "")],
        ["Observa\u00e7\u00f5es sobre a transi\u00e7\u00e3o", value("contadorAnteriorObservacoes", "")]
      ]);
    }

    function briefingInicioLabel() {
      if (isPortabilidadeEntradaWorkflow()) return dateLabel($("dataContratoDistrato")?.value || "");
      return monthLabel($("inicio").value);
    }
    function docHero(title) {
      const serialMeta = currentDocumentSerial
        ? `<span class="doc-chip">Série: ${escapeHtml(currentDocumentSerial)}</span><span class="doc-chip">Emitente: ${escapeHtml(activeUsername())}</span>`
        : "";
      return `
        <div class="doc-hero">
          <div class="doc-cover">
            <div class="doc-eyebrow">${currentDisplayDate()}</div>
            <h2>${title}<br>${value("razao")}</h2>
            <div class="doc-meta">
              <span class="doc-chip">${identificacaoTitulo()}: ${value("cnpj")}</span>
              <span class="doc-chip">Regime: ${value("regime")}</span>
              ${isSaidaWorkflow() || isAlteracaoWorkflow() ? "" : `<span class="doc-chip">Início: ${briefingInicioLabel()}</span>`}
              <span class="doc-chip">Honorário: ${honorarioFinanceiro()}</span>
              ${serialMeta}
            </div>
          </div>
        </div>
      `;
    }

    function openingDocHero() {
      const serialMeta = currentDocumentSerial
        ? `<span class="doc-chip">Série: ${escapeHtml(currentDocumentSerial)}</span><span class="doc-chip">Emitente: ${escapeHtml(activeUsername())}</span>`
        : "";
      return `
        <div class="doc-hero">
          <div class="doc-cover">
            <div class="doc-eyebrow">${new Date().toLocaleDateString("pt-BR")}</div>
            <h2>Briefing Abertura<br>${value("aberturaRazao")}</h2>
            <div class="doc-meta">
              <span class="doc-chip">Tipo jurídico: ${value("aberturaTipoJuridico")}</span>
              <span class="doc-chip">Regime: ${value("aberturaRegime")}</span>
              <span class="doc-chip">Valor: ${value("aberturaValorServico")}</span>
              <span class="doc-chip">Pagamento: ${value("aberturaFormaPagamento")}</span>
              ${serialMeta}
            </div>
          </div>
        </div>
      `;
    }

    function summaryCards() {
      return `
        <div class="summary-grid">
          <div class="summary-item"><span>Competência</span><strong>${competenciaFinanceira()}</strong></div>
          <div class="summary-item"><span>Apuração</span><strong>${value("apuracao")}</strong></div>
          <div class="summary-item"><span>Responsável</span><strong>${socios[0] ? socios[0].nome : "Não informado"}</strong></div>
        </div>
      `;
    }

    function taskList() {
      const tasks = selectedTasks();
      if (!tasks.length) return "<p>Nenhuma tarefa selecionada.</p>";
      return `<div class="task-list">${tasks.map((task) => `<div class="task-item">${task}</div>`).join("")}</div>`;
    }

    function grupoCadastroRows() {
      return [
        ...((isPortabilidadeEntradaWorkflow() || isBriefingAberturaWorkflow()) && !isPessoaFisica() ? [["Filial", value("filialCadastro", "Não informado")]] : []),
        ["Pertence a grupo", value("grupoCadastro")],
        ["Nome do grupo", value("nomeGrupoCadastro", grupoCadastroExigeNome() ? "Não informado" : "Não aplicável")]
      ];
    }

    function receitaImobiliariaRows() {
      if (!hasReceitaImobiliariaQuestion() || isPessoaFisica()) return [];
      const resposta = value("receitaImobiliaria", "Não informado");
      return [
        ["Receita de venda de imóvel ou locação", resposta],
        ...(resposta === "Sim" ? [["Avaliação de CNAE para aluguel/venda de imóveis próprios", value("receitaImobiliariaObs")]] : [])
      ];
    }

    function alteracaoRows() {
      if (!isAlteracaoWorkflow()) return "";
      return `
        ${sectionTitle(2, "Eventos da alteração contratual")}
        <table class="doc-table">${rows([
          ["Eventos selecionados", selectedAlteracaoEventos()],
          ["Observação inicial - quais estão sendo as alterações", value("observacaoInicial")],
          ["Haverá alteração de sócios", value("alteracaoSocios")]
        ])}</table>
        <table class="doc-table">${rows(alteracaoEventosDetalhesRows())}</table>
      `;
    }

    function baixaSaidaRows() {
      const baixaRows = [
        ["Telefone", value("telefoneEmpresa")],
        ["Data de saída", dateLabel($("dataBaixa").value)],
        ["Última competência", monthLabel($("ultimaCompetenciaBaixa").value)],
        ["Motivo de saída", value("motivoBaixa")],
      ];
      if (!isSaidaWorkflow()) return baixaRows;
      return baixaRows.concat([
        ["Grupo", value("grupoSaida")],
        ...(value("grupoSaida", "") === "Sim" ? [["Nome do grupo", value("nomeGrupoSaida")]] : []),
        ["A empresa possui filiais", value("possuiFiliais")],
        ["Transmissão das declarações / inadimplência", value("transmissaoDeclaracoes")],
        ["\u00daltima compet\u00eancia da Orteconte", monthLabel($("ultimaCompetenciaOrteconte").value)],
        ["Qual era o honorário", value("honorarioAnterior")],
        ["Motivo da saída", value("motivoSaida")],
        ["E-mail de envio da documentação", value("emailEnvioDocumentacao")]
      ]);
    }

    function financeiroRows() {
      const items = [
        ...(isSaidaWorkflow() || isPortabilidadeEntradaWorkflow() ? [] : [["Valor dos serviços", value("financeiroValor")]]),
        ...(isSaidaWorkflow() ? [] : [["Forma de pagamento", value("formaPagamento")]]),
        ["Honorário mensal", honorarioFinanceiro()],
        ...((isPortabilidadeEntradaWorkflow() || isBriefingAberturaWorkflow()) && ($("honorarioBaseSemMovimentacao")?.checked || $("aberturaHonorarioBaseSemMovimentacao")?.checked) ? [
          ["Honorário base durante período de movimentação", "Sim"],
          ["Honorário provisório", value("honorarioProvisorio", value("aberturaHonorarioProvisorio", "Não informado"))]
        ] : []),
        ["Data do contrato-distrato", contractDistratoDateLabel()],
        ...(isPortabilidadeEntradaWorkflow() ? [["Data de pagamento", value("financeiroDataPagamento", "") ? `Dia ${value("financeiroDataPagamento", "")}` : "Não informado"]] : []),
        ["Competência", competenciaFinanceira()],
        ["Observação financeira", value("financeiroObservacao", "Dependendo do processo, esse valor pode ser reajustado.")]
      ];
      if (isSaidaWorkflow()) {
        items.push(["Honorários em aberto", value("honorariosAberto")]);
        items.push(["Valor em aberto", value("valorHonorariosAberto", value("honorariosAberto") === "Sim" ? "Não informado" : "Não aplicável")]);
      }
      return items;
    }

    function alteracaoExigeSocios() {
      return !isAlteracaoWorkflow() || value("alteracaoSocios", "") === "Sim";
    }

    function informativoRows() {
      if (isPessoaFisica()) {
        return [
          ["Regime tributário", value("regime")],
          ["Regime de caixa ou competência", value("regimeContabil")],
          ["Parcelamentos em aberto", value("parcelamentos")],
          ["Certificado PF e PJ", value("certificado")]
        ];
      }
      const items = [["Mudança de tributação", value("mudancaTributacao")]];
      if (!isAlteracaoWorkflow() || value("mudancaTributacao", "") === "Sim") {
        items.unshift(
          ["Regime de caixa ou competência", value("regimeContabil")],
          ["Retenção de INSS", value("retencaoInss")],
          ["Parcelamentos em aberto", value("parcelamentos")],
          ["Participação em licitações", value("licitacoes")],
          ["Certificado PF e PJ", value("certificado")],
          ["Cadastros ambientais", value("ambientais")],
          ["Licenças específicas", value("licencas")],
          ["Forma de emissão de NF", value("formaNf")]
        );
      }
      return items;
    }

    function briefingBaixaSaida() {
      return `
        ${docHero(tipoBriefing())}
        <div class="doc-body">
          ${summaryCards()}
          ${sectionTitle(1, "Dados cadastrais")}
          <table class="doc-table">${rows([
            ["Tipo de briefing", tipoBriefing()],
            ["Tipo de pessoa", tipoPessoa()],
            ["Nome", value("razao")],
            ["Nome fantasia", value("fantasia")],
            [identificacaoTitulo(), value("cnpj")],
            ...isSaidaWorkflow() ? [] : [["Última competência", monthLabel($("inicio").value)]],
            ["Endereço", `${value("endereco")} - ${value("municipio")}/${value("estado", "UF")} - CEP ${value("cep")}`]
          ].concat(grupoCadastroRows(), receitaImobiliariaRows(), baixaSaidaRows()))}</table>

          ${sectionTitle(2, "Sócios")}
          ${sociosRows()}
          <table class="doc-table">${rows([
            ...isSaidaWorkflow() ? [] : [["Acesso GOV / observação", value("govObs")]],
            ["Observação sobre qualificação", value("socioQualificacaoObs")]
          ])}</table>

          ${sectionTitle(3, "Informações financeiras")}
          <table class="doc-table">${rows(financeiroRows())}</table>
        </div>
      `;
    }

    function briefingAlteracaoContratual() {
      let sectionIndex = 1;
      const nextSection = (title) => sectionTitle(sectionIndex++, title);
      const alteracaoEventosSection = () => `
        ${nextSection("Eventos da alteração contratual")}
        <table class="doc-table">${rows([
          ["Eventos selecionados", selectedAlteracaoEventos()],
          ["Observação inicial - quais estão sendo as alterações", value("observacaoInicial")],
          ["Haverá alteração de sócios", value("alteracaoSocios")]
        ])}</table>
        <table class="doc-table">${rows(alteracaoEventosDetalhesRows())}</table>
      `;
      const sociosSection = () => alteracaoExigeSocios()
        ? `
          ${nextSection("Sócios")}
          ${sociosRows()}
          <table class="doc-table">${rows([
            ["Data de nascimento", socios[0] ? dateLabel(socios[0].nascimento) : "Não informado"],
            ["Sexo", socios[0] ? socios[0].sexo : "Não informado"],
            ["Estado civil", socios[0] ? socios[0].estadoCivil : "Não informado"],
            ["Regime de casamento", socios[0] ? socios[0].regimeCasamento : "Não informado"],
            ["Qualificação", socios[0] ? socios[0].qualificacao : "Não informado"],
            ["Observação sobre qualificação", value("socioQualificacaoObs")],
            ["Acesso GOV / observação", value("govObs")]
          ])}</table>
        `
        : "";
      return `
        ${docHero("Alteração contratual")}
        <div class="doc-body">
          <div class="notice">${value("observacaoInicial", "Observação inicial não informada.")}</div>

          ${nextSection("Informações iniciais e cadastrais")}
          <table class="doc-table">${rows([
            ["Tipo de briefing", tipoBriefing()],
            ["Nome", value("razao")],
            ["Nome fantasia", value("fantasia")],
            ["Tipo de pessoa", tipoPessoa()],
            [identificacaoTitulo(), value("cnpj")],
            ["Endereço", `${value("endereco")} - ${value("municipio")}/${value("estado", "UF")} - CEP ${value("cep")}`],
            ["Atividade principal", value("cnaePrincipal")],
            ["CNAEs secundários", value("cnaesSecundarios")],
            ["Forma de atuação", selectedFormaAtuacao()],
            ["Honorário acordado", `${honorarioFinanceiro()} | Cobrança a partir de ${competenciaFinanceira()}`]
          ].concat(grupoCadastroRows(), receitaImobiliariaRows()))}</table>

          ${alteracaoEventosSection()}
          ${sociosSection()}

          ${nextSection("Informações financeiras")}
          <table class="doc-table">${rows(financeiroRows())}</table>

          ${nextSection("Informativo")}
          <table class="doc-table">${rows(informativoRows())}</table>

          ${nextSection("Pessoa física")}
          <table class="doc-table">${rows([
            ["Imposto de Renda para os sócios", value("irSocios")],
            ["Propriedade rural para ITR", value("itr")]
          ])}</table>

          ${nextSection("Documentos enviados")}
          <p>${value("docs")}</p>
          <p><strong>Particularidades:</strong> ${value("observacoes")}</p>
        </div>
      `;
    }

    function briefingPessoaFisica() {
      const responsavel = socios[0] || {};
      const telefone = responsavel.telefone || value("telefoneEmpresa", "Não informado");
      const emails = [responsavel.email || "", value("socioQualificacaoObs", "")]
        .filter(Boolean)
        .join("<br>");
      return `
        ${docHero(tipoBriefing() || "Briefing pessoa física")}
        <div class="doc-body">
          <div class="notice">Briefing em formato simplificado para pessoa física, conforme padrão de atendimento doméstico/pessoal.</div>

          ${sectionTitle(1, "Dados cadastrais")}
          <table class="doc-table">${rows([
            ["Tipo de briefing", tipoBriefing()],
            ["Tipo de pessoa", tipoPessoa()],
            ["Nome - Razão Social", value("razao")],
            ["CPF - CEI", value("cnpj")],
            ["Endereço", `${value("endereco")} - ${value("municipio")}/${value("estado", "UF")} - CEP ${value("cep")}`],
            ["Fone", telefone],
            ["Pertence a grupo", value("grupoCadastro")],
            ["Nome do grupo", value("nomeGrupoCadastro", grupoCadastroExigeNome() ? "Não informado" : "Não aplicável")],
            ["CNAE principal", optionalPessoaFisica("cnaePrincipal")],
            ["Capital social", optionalPessoaFisica("capitalSocial")],
            ["Competência", competenciaFinanceira()],
            ["Valor honorário acordado", honorarioFinanceiro()],
            ["Usuário / e-mails", emails || "Não informado"]
          ])}</table>

          ${sectionTitle(2, "Empregador - Representante")}
          ${sociosRows()}

          ${sectionTitle(3, "Financeiro")}
          <table class="doc-table">${rows(financeiroRows())}</table>

          ${sectionTitle(4, "Informativo")}
          <table class="doc-table">${rows(informativoRows())}</table>

          ${sectionTitle(5, "Contábil")}
          <table class="doc-table">${rows([
            ["Regime de apuração", value("apuracao")],
            ["Empréstimos, financiamentos ou leasing", value("emprestimos")],
            ["Particularidades contábeis/financeiras", value("particularidadesContabeis")],
            ["Serviços contratados", value("servicos")]
          ])}</table>

          ${sectionTitle(6, "Pessoal")}
          <table class="doc-table">${rows([
            ["Possui funcionários", value("funcionarios")],
            ["Quantidade de funcionários", value("quantidadeFuncionarios", value("funcionarios") === "Sim" ? "Não informado" : "Não aplicável")],
            ["Contribuição individual", value("contribuicaoIndividual")]
          ])}</table>

          ${sectionTitle(7, "Processos e implantação")}
          ${taskList()}
          <table class="doc-table">${rows([
            ["Processos internos", value("processos")]
          ])}</table>

          ${sectionTitle(8, "Observações e documentos")}
          <table class="doc-table">${rows([
            ["Observação inicial", value("observacaoInicial")],
            ["Documentos enviados", value("docs")],
            ["Particularidades", value("observacoes")]
          ])}</table>
        </div>
      `;
    }

    function syncOpeningBriefingToMainFields() {
      setFieldValue("cnpj", value("aberturaCnpjConcluido", ""));
      setFieldValue("razao", value("aberturaRazao", ""));
      setFieldValue("fantasia", value("aberturaFantasia", ""));
      setSelectValue("filialCadastro", value("aberturaFilial", ""));
      setSelectValue("grupoCadastro", value("aberturaGrupo", ""));
      setFieldValue("nomeGrupoCadastro", value("aberturaNomeGrupo", ""));
      setFieldValue("cep", value("aberturaCep", ""));
      setFieldValue("endereco", [value("aberturaRua", ""), value("aberturaNumero", ""), aberturaComplementoPermitido() ? value("aberturaComplemento", "") : ""].filter(Boolean).join(", "));
      setFieldValue("municipio", value("aberturaCidade", ""));
      setSelectValue("estado", value("aberturaEstado", ""));
      setFieldValue("capitalSocial", value("aberturaCapitalSocial", ""));
      setFieldValue("areaTotal", value("aberturaAreaTotal", ""));
      setFieldValue("areaUtilizada", value("aberturaAreaUtilizada", ""));
      setFieldValue("cnaePrincipal", [value("aberturaCnaePrincipal", ""), value("aberturaAtividadePrincipal", "")].filter(Boolean).join(" - "));
      setFieldValue("cnaesSecundarios", value("aberturaCnaesSecundarios", ""));
      setSelectValue("receitaImobiliaria", value("aberturaReceitaImobiliaria", ""));
      setFieldValue("receitaImobiliariaObs", value("aberturaReceitaImobiliariaObs", ""));
      setFieldValue("servicos", value("aberturaObjetoSocial", ""));
      setFieldValue("usuarioExterno", value("aberturaEmailGestta", ""));
      setFieldValue("govObs", value("aberturaPossuiSenhaGov", "") === "Sim" ? value("aberturaSenhaGov", "") : value("aberturaPossuiSenhaGov", ""));
      setFieldValue("socioQualificacaoObs", value("aberturaRepresentanteReceita", ""));
      setFieldValue("financeiroValor", value("aberturaValorServico", ""));
      setFieldValue("financeiroHonorario", value("aberturaValorHonorario", ""));
      if ($("honorarioBaseSemMovimentacao") && $("aberturaHonorarioBaseSemMovimentacao")) {
        $("honorarioBaseSemMovimentacao").checked = $("aberturaHonorarioBaseSemMovimentacao").checked;
      }
      if ($("honorarioProvisorio")) $("honorarioProvisorio").value = value("aberturaHonorarioProvisorio", "");
      setSelectValue("formaPagamento", value("aberturaFormaPagamento", ""));
      setSelectValue("regime", value("aberturaRegime", ""));
      document.querySelectorAll(".formaAtuacao").forEach((item) => {
        item.checked = Array.from(document.querySelectorAll(".aberturaFormaAtuacao:checked")).some((source) => source.value === item.value);
      });
      if (value("aberturaSolicitarAlvara", "")) setSelectValue("alvara", value("aberturaSolicitarAlvara"));
      if (value("aberturaLicitacoes", "")) setSelectValue("licitacoes", value("aberturaLicitacoes"));
    }

    function aberturaSocioAtual() {
      const tipo = value("aberturaSocioTipo", "Pessoa física");
      const pessoaJuridica = tipo === "Pessoa jurídica";
      const nome = value("aberturaSocioNome", "");
      const cpf = value("aberturaSocioCpf", "");
      const cnpj = value("aberturaSocioCnpj", "");
      if (!nome && !cpf && !cnpj) return null;
      return {
        tipo,
        nome: nome || "Não informado",
        cpf: pessoaJuridica ? "" : formatCpfDigits(cpf),
        cnpj: pessoaJuridica ? formatCnpjDigits(cnpj) : "",
        endereco: value("aberturaSocioEndereco", ""),
        pjResponsavelNome: pessoaJuridica ? value("aberturaSocioPjResponsavelNome", "") : "",
        pjResponsavelCpf: pessoaJuridica ? formatCpfDigits(value("aberturaSocioPjResponsavelCpf", "")) : "",
        cep: pessoaJuridica ? "" : value("aberturaSocioCep", ""),
        estadoCivil: pessoaJuridica ? "Não aplicável" : value("aberturaSocioEstadoCivil", ""),
        regimeCasamento: pessoaJuridica ? "Não aplicável" : value("aberturaSocioRegimeCasamento", ""),
        profissao: pessoaJuridica ? "" : value("aberturaSocioProfissao", ""),
        quotas: value("aberturaSocioQuotas", ""),
        percentual: value("aberturaSocioPercentual", ""),
        qualificacao: value("aberturaSocioQualificacao", ""),
        prolabore: pessoaJuridica ? "" : value("aberturaPossuiProlabore", ""),
        valorProlabore: pessoaJuridica || value("aberturaPossuiProlabore", "") !== "Sim" ? "" : value("aberturaProlabore", ""),
        certificadoDigital: pessoaJuridica ? "" : value("aberturaCertificadoPf", ""),
        senhaGov: pessoaJuridica ? "" : value("aberturaSenhaGov", ""),
        possuiSenhaGov: pessoaJuridica ? "" : value("aberturaPossuiSenhaGov", "")
      };
    }

    function aberturaSociosDocumento() {
      const items = aberturaAdministradores.map((admin) => ({ ...admin }));
      const atual = aberturaSocioAtual();
      if (atual) items.push(atual);
      return items;
    }

    function aberturaAdministradoresDocumento() {
      const items = aberturaAdministradores.map((admin) => ({ ...admin }));
      const nome = value("aberturaAdminNome", "");
      const cpf = value("aberturaAdminCpf", "");
      if (nome || cpf) {
        items.push({
          nome: nome || "Não informado",
          cpf: cpf || "Não informado",
          socioAdministrador: value("aberturaAdminSocioAdministrador", "")
        });
      }
      return items;
    }

    function aberturaSociosDetalhesRows() {
      return aberturaSociosDocumento().map((socio, index) => {
        const pessoaJuridica = socio.tipo === "Pessoa jurídica";
        return `
          <tr><th colspan="2">Sócio ${index + 1}</th></tr>
          ${rowsFilled([
            ["Tipo de sócio", socio.tipo],
            ["Nome do sócio", socio.nome],
            ...(pessoaJuridica
              ? [["CNPJ do sócio PJ", socio.cnpj], ["Sócio responsável pela PJ", socio.pjResponsavelNome], ["CPF do responsável pela PJ", socio.pjResponsavelCpf]]
              : [["CPF do sócio", socio.cpf], ["CEP residencial", socio.cep]]),
            [pessoaJuridica ? "Endereço do sócio PJ" : "Endereço residencial", socio.endereco],
            ...(pessoaJuridica ? [] : [
              ["Estado civil", socio.estadoCivil],
              ["Regime de casamento", socio.regimeCasamento],
              ["Profissão", socio.profissao]
            ]),
            ["Quotas", socio.quotas],
            ["Porcentagem", socio.percentual],
            ["Qualificação", socio.qualificacao],
            ...(pessoaJuridica ? [] : [
              ["Possui pró-labore", socio.prolabore],
              ["Valor da retirada", socio.prolabore === "Sim" ? socio.valorProlabore : ""],
              ["Certificado digital Pessoa Física", socio.certificadoDigital],
              ["Possui senha gov", socio.possuiSenhaGov],
              ["Senha gov", socio.senhaGov]
            ])
          ])}
        `;
      }).join("");
    }

    function aberturaDadosEstabelecimentoEsRows() {
      if (!aberturaEstadoESAtivo()) return "";
      return rowsFilled([
        ["Estabelecimento é inócuo ou virtual", value("aberturaEstabelecimentoInocuoVirtual", "")],
        ["Área total do imóvel", value("aberturaAreaTotalImovel", "")],
        ["Área total utilizada pela empresa", value("aberturaAreaTotalUtilizadaEmpresa", "")],
        ["Imóvel próprio ou alugado", value("aberturaImovelProprioAlugado", "")],
        ["Quantidade de cômodos do imóvel", value("aberturaQuantidadeComodos", "")],
        ["Quantidade máxima de pessoas no ambiente", value("aberturaQuantidadeMaximaPessoas", "")],
        ["Edificação possui subsolo com uso distinto de estacionamento", value("aberturaSubsoloUsoDistinto", "")],
        ["Atividades perpassam dois ou mais municípios", value("aberturaAtividadesMultiplosMunicipios", "")],
        ["Atividades exercidas na residência do empreendedor", value("aberturaAtividadesResidenciaEmpreendedor", "")],
        ["Latitude", value("aberturaLatitude", "")],
        ["Longitude", value("aberturaLongitude", "")]
      ]);
    }

    function briefingAberturaInicial() {
      const areaTotal = value("aberturaAreaTotal", "");
      const areaUtilizada = value("aberturaAreaUtilizada", "");
      const aberturaRows = rowsFilled([
        ["Indicação do cliente", indicacaoClienteResumo()],
        ["Valor do serviço", value("aberturaValorServico", "")],
        ["Forma de pagamento", value("aberturaFormaPagamento", "")],
        ["Honorário Mensal", value("aberturaValorHonorario", "")],
        ...($("aberturaHonorarioBaseSemMovimentacao")?.checked ? [
          ["Honorário base durante período de movimentação", "Sim"],
          ["Honorário provisório", value("aberturaHonorarioProvisorio", "")]
        ] : []),
        ["Data de pagamento", value("aberturaDataPagamento", "") ? `Dia ${value("aberturaDataPagamento", "")}` : ""],
        ["CNPJ", value("aberturaCnpjConcluido", "")],
        ["Razão Social", value("aberturaRazao", "")],
        ["Nome fantasia", value("aberturaFantasia", "")],
        ["Filial", value("aberturaFilial", "")],
        ["Pertence a grupo", value("aberturaGrupo", "")],
        ["Nome do grupo", value("aberturaNomeGrupo", aberturaGrupoExigeNome() ? "Não informado" : "Não aplicável")],
        ["Tipo jurídico", value("aberturaTipoJuridico", "")],
        ["Enquadramento", value("aberturaEnquadramento", "")],
        ["Regime tributário", value("aberturaRegime", "")],
        ["Endereço empresa comercial", aberturaEnderecoCompleto()],
        ["Forma de atuação", selectedAberturaFormaAtuacao()],
        ["Área total da edificação", areaTotal ? `${areaTotal} m²` : ""],
        ["Área utilizada", areaUtilizada ? `${areaUtilizada} m²` : ""],
        ["Atividade principal", value("aberturaAtividadePrincipal", "")],
        ["CNAE principal", value("aberturaCnaePrincipal", "")],
        ["CNAEs secundários", value("aberturaCnaesSecundarios", "")],
        ["Receita de venda de imóvel ou locação", value("aberturaReceitaImobiliaria", "")],
        ...(value("aberturaReceitaImobiliaria", "") === "Sim" ? [["Avaliação de CNAE para aluguel/venda de imóveis próprios", value("aberturaReceitaImobiliariaObs", "")]] : []),
        ["Objeto social", value("aberturaObjetoSocial", "")],
        ["Capital Social", value("aberturaCapitalSocial", "")],
        ["Contato e e-mail da empresa", value("aberturaContatoEmail", "")],
        ["E-mail usuário externo Gestta", value("aberturaEmailGestta", "")],
        ["Representante perante a Receita Federal", value("aberturaRepresentanteReceita", "")]
      ]);
      const docsRows = rowsFilled([
        ["Cópia de documentos", selectedAberturaDocumentos()],
        ["Solicitar alvará específico", value("aberturaSolicitarAlvara", "")],
        ["Alvará a ser solicitado", value("aberturaAlvaraEspecifico", "")],
        ["Licitações", value("aberturaLicitacoes", "")]
      ]);
      const observacao = value("aberturaObservacao", "");
      let sectionIndex = 2;
      const usuarioExternoSection = `${sectionTitle(sectionIndex++, "Usuário Externo")}${usuariosExternosRows()}`;
      const socioSection = `${sectionTitle(sectionIndex++, "Sócios")}${aberturaSociosRows()}`;
      const estabelecimentoEsRows = aberturaDadosEstabelecimentoEsRows();
      const estabelecimentoEsSection = estabelecimentoEsRows ? `${sectionTitle(sectionIndex++, "Dados do Estabelecimento / Imóvel - ES")}<table class="doc-table">${estabelecimentoEsRows}</table>` : "";
      const docsSection = docsRows ? `${sectionTitle(sectionIndex++, "Documentos e processos")}<table class="doc-table">${docsRows}</table>` : "";
      return `
        ${openingDocHero()}
        <div class="doc-body">
          ${observacao ? `<div class="notice">${observacao}</div>` : ""}
          ${sectionTitle(1, "Ficha Briefing Abertura")}
          <table class="doc-table">${aberturaRows}</table>
          ${usuarioExternoSection}
          ${estabelecimentoEsSection}
          ${socioSection}
          ${docsSection}
        </div>
      `;
    }

    function aberturaSociosRows() {
      const rowsList = [];
      aberturaSociosDocumento().forEach((socio) => {
        const socioPj = socio.tipo === "Pessoa jurídica";
        rowsList.push(`
          <tr>
            <td>${escapeHtml(socio.nome)}<br>${escapeHtml(socioPj ? socio.cnpj : socio.cpf)}${socioPj ? `<br>Responsável pela PJ: ${escapeHtml(socio.pjResponsavelNome || "")} - CPF ${escapeHtml(socio.pjResponsavelCpf || "Não informado")}` : `<br>${escapeHtml(socio.profissao || "")}`}</td>
            <td>${escapeHtml(socioPj ? "Pessoa jurídica" : (socio.cep || ""))}<br>${escapeHtml(socio.endereco || "")}</td>
            <td>${socioPj ? "Não aplicável" : `${escapeHtml(socio.estadoCivil || "")}<br>${escapeHtml(socio.regimeCasamento || "")}`}</td>
            <td>Quotas: ${escapeHtml(socio.quotas || "")}<br>Porcentagem: ${escapeHtml(socio.percentual || "")}<br>Qualificação: ${escapeHtml(socio.qualificacao || "")}</td>
          </tr>
        `);
      });
      if (socios.length) {
        socios.forEach((s) => {
          const socioPj = s.tipo === "Pessoa jurídica";
          const documento = socioPj ? s.cnpj : s.cpf;
          const responsavelPj = socioPj && (s.pjResponsavelNome || s.pjResponsavelCpf)
            ? `<br>Responsável pela PJ: ${escapeHtml(s.pjResponsavelNome || "Não informado")} - CPF ${escapeHtml(s.pjResponsavelCpf || "Não informado")}`
            : "";
          const dadosPessoais = socioPj
            ? "Pessoa jurídica"
            : [
                s.nascimento ? `Nascimento: ${dateLabel(s.nascimento)}` : "",
                s.sexo ? `Sexo: ${escapeHtml(s.sexo)}` : "",
                s.estadoCivil ? `Estado civil: ${escapeHtml(s.estadoCivil)}` : "",
                s.regimeCasamento ? `Regime: ${escapeHtml(s.regimeCasamento)}` : ""
              ].filter(Boolean).join("<br>");
          const acessos = [
            s.certificadoDigital ? `Certificado digital: ${escapeHtml(s.certificadoDigital)}` : "",
            s.senhaGov ? `Senha GOV: ${escapeHtml(s.senhaGov)}` : ""
          ].filter(Boolean).join("<br>");
          rowsList.push(`
            <tr>
              <td>${escapeHtml(s.nome || "Não informado")}<br>${escapeHtml(documento || "Não informado")}${responsavelPj}<br>${escapeHtml(s.email || "E-mail não informado")}<br>${escapeHtml(s.telefone || "Telefone não informado")}</td>
              <td>${escapeHtml(s.endereco || (socioPj ? "Endereço não informado" : "Pessoa física"))}</td>
              <td>${dadosPessoais || "Não informado"}</td>
              <td>Qualificação: ${escapeHtml(s.qualificacao || "Não informado")}<br>Participação: ${escapeHtml(s.participacao || "Não informado")}<br>${isBaixaWorkflow() ? "" : `Pró-labore: ${escapeHtml(s.prolabore || "Não informado")}<br>Valor: ${escapeHtml(s.valorProlabore || "Não aplicável")}<br>${acessos}`}</td>
            </tr>
          `);
        });
      }
      if (!rowsList.length) return "<p>Não informado.</p>";
      return `<table class="doc-table"><thead><tr><th>Sócio</th><th>CPF / Endereço</th><th>Estado civil / administração</th><th>Participação / observações</th></tr></thead><tbody>${rowsList.join("")}</tbody></table>`;
    }

    function briefingAberturaOperacional() {
      syncOpeningBriefingToMainFields();
      const areaTotal = value("aberturaAreaTotal", "");
      const areaUtilizada = value("aberturaAreaUtilizada", "");
      const socioComplementarRows = rowsFilled([
        ...(value("aberturaSocioTipo", "Pessoa física") === "Pessoa jurídica" ? [] : [
          ["Certificado digital Pessoa Física", value("aberturaCertificadoPf", "")],
          ["Possui senha GOV", value("aberturaPossuiSenhaGov", "")],
          ["Senha GOV", value("aberturaSenhaGov", "")]
        ])
      ]);
      const documentosProcessosRows = rowsFilled([
        ["Cópia de documentos", selectedAberturaDocumentos()],
        ["Solicitar alvará específico", value("aberturaSolicitarAlvara", "")],
        ["Alvará a ser solicitado", value("aberturaAlvaraEspecifico", "")],
        ["Licitações", value("aberturaLicitacoes", "")]
      ]);
      const estabelecimentoEsRows = aberturaDadosEstabelecimentoEsRows();
      const usuarioExternoSection = estabelecimentoEsRows ? 3 : 2;
      const sociosSection = usuarioExternoSection + 1;
      const financeiroSection = sociosSection + 1;
      const documentosSection = financeiroSection + 1;
      return `
        ${docHero("Briefing Abertura")}
        <div class="doc-body">
          ${sectionTitle(1, "Informações iniciais e cadastrais")}
          <table class="doc-table">${rowsFilled([
            ["Tipo de briefing", tipoBriefing()],
            ["Tipo de pessoa", tipoPessoa()],
            ["Indicação do cliente", indicacaoClienteResumo()],
            ["Valor do serviço", value("aberturaValorServico", "")],
            ["Forma de pagamento", value("aberturaFormaPagamento", "")],
            ["Honorário Mensal", value("aberturaValorHonorario", "")],
            ["Razão Social", value("razao")],
            ["Nome fantasia", value("fantasia")],
            ["Filial", value("filialCadastro", "")],
            ["Pertence a grupo", value("aberturaGrupo", "")],
            ["Nome do grupo", value("aberturaNomeGrupo", aberturaGrupoExigeNome() ? "Não informado" : "Não aplicável")],
            ["Tipo jurídico", value("aberturaTipoJuridico", "")],
            ["Enquadramento", value("aberturaEnquadramento", "")],
            ["Regime tributário", value("aberturaRegime", value("regime"))],
            ["Endereço empresa comercial", aberturaEnderecoCompleto()],
            ["Forma de atuação", selectedAberturaFormaAtuacao()],
            ["Área total da edificação", areaTotal ? `${areaTotal} m²` : ""],
            ["Área utilizada", areaUtilizada ? `${areaUtilizada} m²` : ""],
            ["Atividade principal", value("aberturaAtividadePrincipal", "")],
            ["CNAE principal", value("aberturaCnaePrincipal", "")],
            ["CNAEs secundários", value("aberturaCnaesSecundarios", "")],
            ["Receita de venda de imóvel ou locação", value("aberturaReceitaImobiliaria", "")],
            ...(value("aberturaReceitaImobiliaria", "") === "Sim" ? [["Avaliação de CNAE para aluguel/venda de imóveis próprios", value("aberturaReceitaImobiliariaObs", "")]] : []),
            ["Objeto social", value("aberturaObjetoSocial", "")],
            ["Capital social", value("aberturaCapitalSocial", "")],
            ["Contato e e-mail da empresa", value("aberturaContatoEmail", "")],
            ["E-mail usuário externo Gestta", value("aberturaEmailGestta", "")],
            ["Representante perante a Receita Federal", value("aberturaRepresentanteReceita", "")],
            ["Observação", value("aberturaObservacao", "")]
          ])}</table>

          ${estabelecimentoEsRows ? `${sectionTitle(2, "Dados do Estabelecimento / Imóvel - ES")}<table class="doc-table">${estabelecimentoEsRows}</table>` : ""}

          ${sectionTitle(usuarioExternoSection, "Usuário Externo")}
          ${usuariosExternosRows()}

          ${sectionTitle(sociosSection, "Sócios")}
          ${aberturaSociosRows()}
          ${socioComplementarRows ? `<table class="doc-table">${socioComplementarRows}</table>` : ""}

          ${sectionTitle(financeiroSection, "Informações financeiras")}
          <table class="doc-table">${rowsFilled([
            ["Valor dos serviços", value("financeiroValor")],
            ["Forma de pagamento", value("formaPagamento")],
            ["Honorário mensal", honorarioFinanceiro()],
            ...(($("honorarioBaseSemMovimentacao")?.checked || $("aberturaHonorarioBaseSemMovimentacao")?.checked) ? [
              ["Honorário base durante período de movimentação", "Sim"],
              ["Honorário provisório", value("honorarioProvisorio", value("aberturaHonorarioProvisorio", ""))]
            ] : []),
            ["Data do contrato-distrato", contractDistratoDateLabel()],
            ["Data de pagamento", value("aberturaDataPagamento", "") ? `Dia ${value("aberturaDataPagamento", "")}` : ""],
            ["Competência", competenciaFinanceira()],
            ["Observação financeira", value("financeiroObservacao", "")]
          ])}</table>

          ${documentosProcessosRows ? `${sectionTitle(documentosSection, "Documentos e processos")}<table class="doc-table">${documentosProcessosRows}</table>` : ""}
        </div>
      `;
    }

    function propostaValor(id, fallback = "N\u00e3o informado") {
      return value(id, fallback);
    }

    function propostaHonorarioMensal() {
      return value("propostaHonorario", "R$ 380,00");
    }

    const propostaServicosDescricao = {
      fiscal: [
        "Conferência da execução em toda a parte fiscal da empresa, acompanhamento e ajustes da parte fiscal da empresa.",
        "Elaboração das guias mensais de recolhimentos dos impostos estaduais, se houverem, Sped Contribuições (conferência) e todas as obrigações acessórias pertinentes ao cliente.",
        "IRRF, DIRF, Sped Social, etc., e outras obrigações acessórias impostas pela legislação em vigor."
      ],
      pessoal: [
        "Confecção da Folha de Pagamento Mensal da empresa incluindo todas as obrigações acessórias pertinentes ao Departamento Pessoal, como toda a documentação de admissão e demissão de funcionários, GFIP, GPS, RAIS.",
        "Orientações trabalhistas, tributárias e fiscais."
      ],
      contabil: [
        "Elaboração da contabilização geral da empresa, apresentação mensal do Balancete e DRE da empresa, incluindo as confecções das guias mensais de recolhimentos dos impostos federais, se houverem, incluindo todas as obrigações acessórias tais como DIPJ, DCTF, DACON, SPED CONTÁBIL, ECF, etc."
      ],
      geral: [
        "Todas as guias de impostos, sejam federais, estaduais, municipais, previdenciários e trabalhistas, serão entregues com no mínimo 48 horas de antecedência ao pagamento, se observadas as datas previamente combinadas de entrega da documentação.",
        "Todas as guias de impostos, sejam federais, previdenciários e trabalhistas, serão entregues com no mínimo 48 horas de antecedência ao pagamento, se observadas as datas previamente combinadas de entrega da documentação."
      ]
    };

    function propostaServicosSelecionados() {
      const selecionados = Array.from(document.querySelectorAll(".propostaServico:checked")).map((item) => item.value);
      return selecionados.flatMap((item) => propostaServicosDescricao[item] || []);
    }

    function propostaServicosHtml() {
      const servicos = propostaServicosSelecionados();
      if (!servicos.length) return "<p>Serviços contábeis, fiscais, trabalhistas e obrigações acessórias conforme escopo contratado.</p>";
      return `<ul class="proposal-services">${servicos.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
    }

    function propostaComercial() {
      const empresa = propostaValor("propostaEmpresa", "Cliente n\u00e3o informado");
      const cnpj = propostaValor("propostaCnpj");
      const honorario = propostaHonorarioMensal();
      const honorarioExtenso = valorMonetarioPorExtenso(honorario);
      return `
        <div class="proposal-doc">
          <header class="proposal-head">
            <div>
              <span class="proposal-brand">Orteconte Contabilidade</span>
              <strong>Proposta Comercial</strong>
            </div>
            <div class="proposal-number">${currentDisplayDate()}</div>
          </header>
          <section class="proposal-cover">
            <p class="doc-eyebrow">Presta\u00e7\u00e3o de servi\u00e7os cont\u00e1beis</p>
            <h2>Proposta comercial para presta\u00e7\u00e3o de servi\u00e7os cont\u00e1beis</h2>
            <p>Prezados, apresentamos nossa proposta comercial com base nas informa\u00e7\u00f5es fornecidas para an\u00e1lise e contrata\u00e7\u00e3o dos servi\u00e7os cont\u00e1beis.</p>
          </section>
          <div class="doc-body proposal-body">
            ${sectionTitle(1, "Dados da proposta")}
            <table class="doc-table">${rowsFilled([
              ["Empresa", empresa],
              ["CNPJ", cnpj],
              ["A/C", propostaValor("propostaContato")],
              ["Origem", propostaValor("propostaOrigem")],
              ["Funcion\u00e1rios fixos", propostaValor("propostaFuncionariosFixos")],
              ["Funcion\u00e1rios safristas", propostaValor("propostaFuncionariosSafristas")],
              ["Faturamento", propostaValor("propostaFaturamento")],
              ["Tributa\u00e7\u00e3o", propostaValor("propostaTributacao")],
              ["Ramo de atividade", propostaValor("propostaRamo")]
            ])}</table>

            ${sectionTitle(2, "Servi\u00e7os contratados")}
            <div class="proposal-text-block">${propostaServicosHtml()}</div>

            ${sectionTitle(3, "Honor\u00e1rios cont\u00e1beis")}
            <p>A proposta de valor dos Honor\u00e1rios Cont\u00e1beis para os servi\u00e7os contratados acima ser\u00e1 inicialmente de <strong>${escapeHtml(honorario)}</strong> (<strong>${escapeHtml(honorarioExtenso)}</strong>) mensais, e mais uma parcela no final do ano no valor do honor\u00e1rio vigente ou proporcional a t\u00edtulo de fechamento anual, lembrando que o valor poder\u00e1 sofrer altera\u00e7\u00f5es caso seja inferior ao cobrado pelo profissional atual, devido ao c\u00f3digo de \u00e9tica da classe.</p>

            ${sectionTitle(4, "Considera\u00e7\u00f5es finais")}
            <p>A ORTECONTE trabalha de forma setorizada para um atendimento mais personalizado ao cliente. Ser\u00e1 um prazer podermos esclarecer quaisquer d\u00favidas existentes na proposta, bem como poder orientar em outras quest\u00f5es que possam surgir.</p>
            <div class="proposal-signature">
              <span>Manhua\u00e7u/MG, ${currentDisplayDate()}.</span>
              <strong>Orteconte Contabilidade</strong>
            </div>
          </div>
        </div>
      `;
    }

    function briefing() {
      if (isPropostaComercialWorkflow()) return propostaComercial();
      if (isPessoaFisica()) return briefingPessoaFisica();
      if (currentDoc === "briefingAbertura") return briefingAberturaInicial();
      if (isBaixaWorkflow()) return briefingBaixaSaida();
      if (isBriefingAberturaWorkflow()) return briefingAberturaOperacional();
      if (isAlteracaoWorkflow()) return briefingAlteracaoContratual();
      return `
        ${docHero(tipoBriefing() || "Briefing de implantação")}
        <div class="doc-body">
          ${summaryCards()}
          <div class="notice">${value("observacaoInicial", "Observação inicial não informada.")}</div>

          ${sectionTitle(1, "Informações iniciais e cadastrais")}
          <table class="doc-table">${rows([
            ["Tipo de briefing", tipoBriefing()],
            ["Indicação do cliente", indicacaoClienteResumo()],
            ["Nome", value("razao")],
            ["Nome fantasia", value("fantasia")],
            ["Tipo de pessoa", tipoPessoa()],
            [identificacaoTitulo(), value("cnpj")],
            ["Última competência", monthLabel($("inicio").value)],
            ["Endereço", `${value("endereco")} - ${value("municipio")}/${value("estado", "UF")} - CEP ${value("cep")}`],
            ["Atividade principal", value("cnaePrincipal")],
            ["Atividades secundárias", value("cnaesSecundarios")],
            ["Sócio responsável e contato", value("socioQualificacaoObs", "Preenchimento manual obrigatório pelo usuário")],
            ["Número de colaboradores", value("funcionarios")],
            ["Quantidade de funcionários", value("quantidadeFuncionarios", value("funcionarios") === "Sim" ? "Não informado" : "Não aplicável")],
            ["Regime tributário", value("regime")],
            ["Honorário acordado", `${honorarioFinanceiro()} | Cobrança a partir de ${competenciaFinanceira()}`]
          ].concat(grupoCadastroRows(), receitaImobiliariaRows()))}</table>

          ${alteracaoRows()}

          ${isPortabilidadeEntradaWorkflow() ? `
            ${sectionTitle("1A", "Dados Antigo Contador")}
            <table class="doc-table">${contadorAnteriorRows() || rows([["Dados Antigo Contador", "Não informado"]])}</table>
          ` : ""}

          ${isPortabilidadeEntradaWorkflow() ? `
            ${sectionTitle("1B", "Usuário Externo")}
            ${usuariosExternosRows()}
          ` : ""}

          ${alteracaoExigeSocios() ? `
            ${sectionTitle(sectionNumber(2), "Sócios")}
            ${sociosRows()}
            <table class="doc-table">${rows([
              ["Data de nascimento", socios[0] ? dateLabel(socios[0].nascimento) : "Não informado"],
              ["Sexo", socios[0] ? socios[0].sexo : "Não informado"],
              ["Estado civil", socios[0] ? socios[0].estadoCivil : "Não informado"],
              ["Regime de casamento", socios[0] ? socios[0].regimeCasamento : "Não informado"],
              ["Qualificação", socios[0] ? socios[0].qualificacao : "Não informado"],
              ["Observação sobre qualificação", value("socioQualificacaoObs")],
              ["Acesso GOV / observação", value("govObs")]
            ])}</table>
          ` : ""}

          ${sectionTitle(sectionNumber(3), "Informações financeiras")}
          <table class="doc-table">${rows(financeiroRows())}</table>

          ${sectionTitle(sectionNumber(4), "Informativo")}
          <table class="doc-table">${rows(informativoRows())}</table>

          ${isAlteracaoWorkflow() ? "" : `
          ${sectionTitle(sectionNumber(5), "Contábil")}
          <table class="doc-table">${rows([
            ["Regime de apuração", value("apuracao")],
            ["Empréstimos, financiamentos, consórcios ou leasing", value("emprestimos")],
            ["Particularidades contábeis/financeiras", value("particularidadesContabeis")],
            ["Serviços contratados", value("servicos")]
          ])}</table>

          ${sectionTitle(sectionNumber(6), "Pessoal")}
          <table class="doc-table">${rows([
            ["Possui funcionários", value("funcionarios")],
            ["Quantidade de funcionários", value("quantidadeFuncionarios", value("funcionarios") === "Sim" ? "Não informado" : "Não aplicável")],
            ["Pró-labore por sócio", socios.length ? socios.map((s) => `${s.nome}: ${s.prolabore} - ${s.valorProlabore}`).join("<br>") : "Não informado"],
            ["Contribuição individual do sócio", value("contribuicaoIndividual")]
          ])}</table>

          ${sectionTitle(sectionNumber(7), "Fiscal")}
          <table class="doc-table">${rows([
            ["Compra fora do estado", value("compraInter")],
            ["Venda fora do estado", value("vendaInter")],
            ["Regime Especial de Tributação (RET)", value("ret")],
            ["Emissão de notas pela contabilidade", value("emissaoContabilidade")],
            ["Forma de emissão", value("formaNf")]
          ])}</table>

          ${sectionTitle(sectionNumber(8), "Processos")}
          ${taskList()}
          <table class="doc-table">${rows([
            ["Alvará de funcionamento", value("alvara")],
            ["Opção pelo Simples Nacional", value("opcaoSimples")],
            ["Processos internos", value("processos")]
          ])}</table>
          `}

          ${sectionTitle(sectionNumber(9), "Pessoa física")}
          <table class="doc-table">${rows([
            ["Imposto de Renda para os sócios", value("irSocios")],
            ["Propriedade rural para ITR", value("itr")]
          ])}</table>

          ${sectionTitle(sectionNumber(10), "Documentos enviados")}
          <p>${value("docs")}</p>
          <p><strong>Particularidades:</strong> ${value("observacoes")}</p>
        </div>
      `;
    }

    function docFooter() {
      const brand = documentBrand();
      if (activeProfile() === "simao") return `<div class="doc-footer-bar ${brand.footerClass}">${brand.name}</div>`;
      return `<div class="doc-footer-bar"><strong>LUCE SISTEMAS</strong></div>`;
    }

    function contratoServicos() {
      const pessoal = `
        <div class="service-box">
          <h4>Departamento pessoal</h4>
          <p>Folha de pagamento, pró-labore, tributos trabalhistas e previdenciários.</p>
          <p>Férias, rescisões, informes e demais exigências legais, quando aplicável.</p>
          <p>Situação inicial de colaboradores: ${value("funcionarios")}${value("funcionarios") === "Sim" ? ` (${value("quantidadeFuncionarios")} funcionário(s))` : ""}.</p>
        </div>
      `;
      if (isPessoaFisica()) return `<div class="service-list single-service">${pessoal}</div>`;
      return `
        <div class="service-list">
          <div class="service-box">
            <h4>Escrituração contábil</h4>
            <p>Classificação contábil conforme normas e princípios vigentes.</p>
            <p>Emissão de balancetes, balanço anual e demonstrações obrigatórias.</p>
            <p>Emissão de certidões negativas quando aplicável.</p>
          </div>
          <div class="service-box">
            <h4>Escrituração fiscal</h4>
            <p>Orientação, controle e aplicação de dispositivos legais federais, estaduais e municipais.</p>
            <p>Apuração de tributos e transmissão de obrigações principais e acessórias.</p>
            <p>Rotinas relacionadas à emissão fiscal informada: ${value("formaNf")}.</p>
          </div>
          ${pessoal}
        </div>
      `;
    }

    function contrato() {
      const socio = socios[0] || {};
      const socioNome = socio.nome || "Não informado";
      const socioCpf = socio.tipo === "Pessoa jurídica" ? (socio.cnpj || "Não informado") : (socio.cpf || "Não informado");
      const endereco = `${value("endereco")} - ${value("municipio")}/${value("estado", "UF")} - CEP ${value("cep")}`;
      const dataHoje = contractDistratoDateLabel();
      const inicioServicos = monthLongLabel($("inicio").value);

      return `
        ${docHero("Contrato de prestação de serviços contábeis")}
        <div class="doc-body contract-body">
          <h3 class="contract-title">CONTRATO DE PRESTAÇÃO DE SERVIÇOS CONTÁBEIS</h3>

          <div class="contract-party"><p class="contract-lead"><strong>CONTRATANTE:</strong> ${value("razao")}, firma comercial estabelecida em ${endereco}, inscrita no CNPJ ${value("cnpj")}, enquadrada no regime de apuração ${value("regime")}, representada neste ato por seu representante legal Sr.(a) ${socioNome}, inscrito(a) no CPF ${socioCpf}.</p></div>

          <div class="contract-party"><p class="contract-lead"><strong>CONTRATADA:</strong> ORTECONTE CONTABILIDADE LTDA., empresa contábil estabelecida na Rua Serafim Tibúrcio, 120 A, Bairro Coqueiro, em Manhuaçu/MG, inscrita no CNPJ n° 05.621.174/0001-95, neste ato representada pelo contador e sócio responsável Sr. Elias Temer Júnior, registrado no CRC sob o n° 60.959.</p></div>

          <div class="contract-party"><p class="contract-lead"><strong>FIADOR:</strong> Fica o(a) Sr.(a) ${socioNome}, inscrito(a) no CPF ${socioCpf}, responsável na qualidade de FIADOR, por todas as obrigações assumidas pela CONTRATANTE no presente contrato.</p></div>

          <div class="contract-party"><p class="contract-lead">${paragrafoValorServicosContrato()}</p></div>

          <div class="contract-party"><p class="contract-lead"><strong>VIGÊNCIA DO CONTRATO DE SERVIÇO:</strong> O contrato tem validade a partir de sua assinatura, em ${dataHoje}, por tempo indeterminado, com início dos serviços em ${inicioServicos}, observadas as condições de rescisão previstas neste instrumento.</p></div>

          ${sectionTitle(1, "Serviços contratados")}
          <p class="contract-lead">Mediante as cláusulas e condições seguintes, marcadas conforme a modalidade de regime tributário vigente da empresa e conforme negociação prévia entre as partes, têm justo e contratado:</p>
          ${contratoServicos()}

          <div class="contract-clause"><strong>Cláusula segunda</strong> A CONTRATANTE compromete-se a preparar e entregar mensalmente toda a documentação fiscal, contábil, financeira e trabalhista necessária para que a CONTRATADA execute os serviços contratados dentro dos prazos legais.</div>

          <div class="contract-clause"><strong>Cláusula terceira</strong> A CONTRATADA assume responsabilidade técnica pelos serviços realizados e pelas orientações prestadas, desde que receba tempestivamente da CONTRATANTE os documentos e informações necessários.</div>

          <div class="contract-clause"><strong>Cláusula quarta</strong> As orientações fornecidas pela CONTRATADA deverão ser rigorosamente observadas pela CONTRATANTE, ficando a CONTRATADA isenta de responsabilidade por consequências decorrentes do descumprimento dessas orientações.</div>

          <div class="contract-clause"><strong>Cláusula quinta</strong> Multas decorrentes da entrega fora do prazo legal serão de responsabilidade da parte que der causa ao atraso, especialmente quando houver ausência, atraso ou inconsistência nas informações fornecidas pela CONTRATANTE.</div>

          <div class="contract-clause"><strong>Cláusula sexta</strong> Os honorários serão pagos conforme condições comerciais acima. A inadimplência pelo período de 2 meses poderá ensejar interrupção dos serviços e bloqueio no sistema da CONTRATADA, sem responsabilidade por efeitos decorrentes da não execução por falta de pagamento.</div>

          <div class="contract-clause"><strong>Cláusula sétima</strong> No mês de dezembro de cada ano poderá ser cobrado o equivalente a 1 honorário mensal relativo aos procedimentos de encerramento do exercício social, balanço patrimonial, obrigações anuais e demais rotinas de fechamento.</div>

          <div class="contract-clause"><strong>Cláusula oitava</strong> Em caso de atraso no pagamento dos honorários, poderão incidir multa, juros e demais encargos previstos na proposta comercial ou nos instrumentos de cobrança emitidos pela CONTRATADA.</div>

          <div class="contract-clause"><strong>Cláusula nona</strong> O contrato é firmado por tempo indeterminado e poderá ser rescindido por qualquer das partes mediante aviso prévio de 30 dias, por escrito, com apresentação das razões da decisão.</div>

          <div class="contract-clause"><strong>Cláusula décima</strong> Serviços extraordinários, alterações cadastrais, regularizações, processos especiais e demandas não previstas no escopo mensal serão cobrados à parte, mediante prévia convenção entre as partes.</div>

          <div class="contract-clause"><strong>Cláusula décima primeira</strong> Fica eleito o foro da cidade de Manhuaçu/MG para dirimir eventuais controvérsias oriundas do presente contrato, salvo ajuste diverso entre as partes.</div>

          <div class="signature-page">
            <p class="contract-lead contract-closing">Por estarem justas e contratadas, as partes firmam o presente instrumento, com início dos serviços em <strong>${inicioServicos}</strong>, para que produza seus efeitos legais.</p>
            <div class="signature-grid">
              <div class="signature-line">CONTRATANTE<br>${value("razao")}<br>${value("cnpj")}</div>
              <div class="signature-line">CONTRATADA<br>ORTECONTE CONTABILIDADE LTDA<br>05.621.174/0001-95</div>
            </div>
          </div>
        </div>
      `;
    }

    function distrato() {
      const socio = socios[0] || {};
      const socioNome = socio.nome || "Não informado";
      const valorDistrato = isSaidaWorkflow() && value("honorariosAberto") === "Sim"
        ? value("valorHonorariosAberto")
        : value("financeiroValor", "R$ 0,00");
      const dataDistrato = distratoDateLabel();
      const dataEmissao = contractDistratoDateLabel();

      return `
        ${docHero("Distrato de prestação de serviços profissionais")}
        <div class="doc-body contract-body">
          <h3 class="contract-title">DISTRATO DE PRESTAÇÃO DE SERVIÇOS PROFISSIONAIS</h3>

          <p class="contract-lead">Pelo presente instrumento particular, de um lado <strong>${value("razao")}</strong>, inscrita no CNPJ nº <strong>${value("cnpj")}</strong>, doravante denominada <strong>CONTRATANTE</strong>, neste ato representada por seu representante legal Sr(a). <strong>${socioNome}</strong>, e a empresa de Contabilidade <strong>ORTECONTE CONTABILIDADE LTDA</strong>, empresa contábil estabelecida na Rua Serafim Tibúrcio, 120 A, Bairro Coqueiro, em Manhuaçu/MG, inscrita no CNPJ n° 05.621.174/0001/95, neste ato representada pelo contador e sócio responsável o Sr. Elias Temer Júnior, brasileiro, casado, contador, residente e domiciliado na Rua Serafim Tibúrcio, 82, Bairro Coqueiro, em Manhuaçu/MG, registrado no CRC sob o n° 60.959, doravante <strong>CONTRATADO(A)</strong>, mediante as cláusulas e condições seguintes, acordam:</p>

          <div class="contract-clause"><strong>CLÁUSULA PRIMEIRA.</strong> O(A) contratante e o(a) contratado(a), firmaram “Contrato de Prestação de Serviços Contábeis”, pelo qual a primeira confiou à segunda serviços como previsto na cláusula primeira do pacto sob distrato.</div>

          <div class="contract-clause"><strong>CLÁUSULA SEGUNDA.</strong> O(A) contratante e o(a) contratado(a) decidem desistir da continuidade do contrato até agora vigente, restando acertado que, em razão dos serviços e atividades desenvolvidos até o momento, o(a) contratado(a) entregará, mediante protocolo, todos os serviços concluídos, bem como toda a documentação da empresa na data da assinatura deste distrato.</div>

          <div class="contract-clause"><strong>CLÁUSULA TERCEIRA.</strong> O(A) contratado(a), por força do instrumento ora distratado, executou seus serviços até ${dataDistrato}.</div>

          <div class="contract-clause"><strong>CLÁUSULA QUARTA.</strong> O(A) contratante obriga-se a pagar ao(à) contratado(a) a quantia de ${valorDistrato} a título de serviços prestados até a data da vigência do contrato ora rescindido.</div>

          <div class="contract-clause"><strong>CLÁUSULA QUINTA.</strong> O(A) contratante outorga ao(à) contratado(a) plena, total e irrevogável quitação, para nada mais reclamar, a qualquer tempo e a que título for, em relação à avença distratada, bem como aos serviços profissionais prestados.</div>

          <div class="contract-clause"><strong>CLÁUSULA SEXTA.</strong> O(A) contratado, após o recebimento dos honorários previstos, outorga ao(à) contratante plena, total e irrevogável quitação, para nada mais reclamar, a qualquer tempo e a que título for, em relação à avença distratada.</div>

          <div class="contract-clause"><strong>CLÁUSULA SÉTIMA.</strong> O presente distrato é firmado em caráter irrevogável e irretratável, obrigando as partes, seus herdeiros e sucessores.</div>

          <div class="contract-clause"><strong>CLÁUSULA OITAVA.</strong> Os casos omissos serão resolvidos de comum acordo.</div>

          <div class="contract-clause"><strong>PARÁGRAFO ÚNICO.</strong> Em caso de impasse, as partes submeterão a solução do conflito a procedimento arbitral nos termos da Lei n.º 9.307/96. Alternativamente, poderá ser eleito o foro da comarca para o fim de dirimir qualquer ação oriunda do presente contrato.</div>

          <p class="contract-lead contract-closing">E, para firmeza e como prova de assim haverem rescindido o contrato, firmam este instrumento particular, impresso em duas vias de igual teor e forma, assinado pelas partes contratantes.</p>

          <p class="contract-lead" style="text-align:right; margin-top: 20px;">Manhuaçu-MG, ${dataEmissao}</p>

          <div class="signature-grid">
            <div class="signature-line">CONTRATANTE<br>${value("razao")}<br>${value("cnpj")}</div>
            <div class="signature-line">CONTRATADA<br>ORTECONTE CONTABILIDADE LTDA<br>05.621.174/0001-95</div>
          </div>
        </div>
      `;
    }

    function updateDocumentTabs() {
      const briefingTab = document.querySelector('.tab[data-doc="briefing"]');
      const secondaryTab = document.querySelector('.tab[data-doc="contrato"]');
      if (isPropostaComercialWorkflow()) {
        currentDoc = "briefing";
        if (briefingTab) {
          briefingTab.textContent = "Proposta Comercial";
          briefingTab.classList.add("active");
        }
        if (secondaryTab) {
          secondaryTab.classList.add("hidden");
          secondaryTab.classList.remove("active");
        }
        return;
      }
      if (briefingTab) {
        briefingTab.textContent = "Briefing";
        briefingTab.classList.toggle("active", currentDoc === "briefing" || currentDoc === "briefingAbertura");
      }
      if (secondaryTab) {
        secondaryTab.classList.remove("hidden");
        secondaryTab.textContent = isBaixaWorkflow() ? "Distrato" : "Contrato";
        secondaryTab.classList.toggle("active", currentDoc === "contrato");
      }
    }

    function render() {
      updateDocumentTabs();
      const documentHtml = (currentDoc === "briefing" || currentDoc === "briefingAbertura") ? briefing() : (isBaixaWorkflow() ? distrato() : contrato());
      $("documentPreview").innerHTML = sanitizeDocumentHtml(`${documentHtml}${docFooter()}`);
    }

    function escapeHtml(text) {
      return String(text || "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[char]));
    }

    function sanitizeDocumentHtml(html) {
      const template = document.createElement("template");
      template.innerHTML = String(html || "");
      template.content.querySelectorAll("script, iframe, object, embed, link, meta, base, form, input, textarea, select").forEach((node) => node.remove());
      template.content.querySelectorAll("*").forEach((node) => {
        Array.from(node.attributes).forEach((attribute) => {
          const name = attribute.name.toLowerCase();
          const raw = attribute.value || "";
          if (name.startsWith("on") || name === "srcdoc") {
            node.removeAttribute(attribute.name);
            return;
          }
          if (name === "style" && /expression\s*\(|javascript\s*:|url\s*\(/i.test(raw)) {
            node.removeAttribute(attribute.name);
            return;
          }
          if (["href", "src", "xlink:href", "action"].includes(name)) {
            try {
              const url = new URL(raw, window.location.href);
              const safeImageData = node.tagName.toLowerCase() === "img" && url.protocol === "data:" && /^data:image\//i.test(raw);
              const safeLocal = url.origin === window.location.origin && ["http:", "https:"].includes(url.protocol);
              if (!safeImageData && !safeLocal) node.removeAttribute(attribute.name);
            } catch (error) {
              node.removeAttribute(attribute.name);
            }
          }
        });
      });
      pruneEmptyDocumentNodes(template.content);
      return template.innerHTML;
    }

    function normalizeDocumentText(text) {
      return String(text || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function isInvalidDocumentLine(text) {
      const clean = normalizeDocumentText(text).toLowerCase().replace(/\.$/, "");
      if (!clean) return true;
      const valueOnly = clean.includes(":") ? clean.split(":").slice(1).join(":").trim() : clean;
      return !isMeaningfulDocValue(valueOnly || clean);
    }

    function cleanCellInvalidLines(cell) {
      if (!cell || !cell.innerHTML.includes("<br")) return;
      const parts = cell.innerHTML.split(/<br\s*\/?>/i)
        .map((part) => part.trim())
        .filter((part) => {
          const text = normalizeDocumentText(part.replace(/<[^>]*>/g, " "));
          return !isInvalidDocumentLine(text);
        });
      cell.innerHTML = parts.join("<br>");
    }

    function elementHasMeaningfulContent(element) {
      if (!element) return false;
      if (element.querySelector("img, svg, canvas")) return true;
      return isMeaningfulDocValue(normalizeDocumentText(element.textContent));
    }

    function pruneEmptyDocumentNodes(root) {
      root.querySelectorAll("*").forEach((node) => {
        node.childNodes.forEach((child) => {
          if (child.nodeType !== Node.TEXT_NODE) return;
          child.textContent = child.textContent
            .replace(/\bE-mail não informado\b/gi, "")
            .replace(/\bTelefone não informado\b/gi, "")
            .replace(/\bEndereço não informado\b/gi, "")
            .replace(/\bNão informado\b/gi, "")
            .replace(/\bNão informada\b/gi, "")
            .replace(/\bNão aplicável\b/gi, "")
            .replace(/\bNão se aplica\b/gi, "")
            .replace(/\bDesconsiderado\b/gi, "")
            .replace(/\bDesconsiderada\b/gi, "")
            .replace(/\bDesconsiderar\b/gi, "");
        });
      });
      root.querySelectorAll("td").forEach(cleanCellInvalidLines);
      root.querySelectorAll("tr").forEach((row) => {
        const dataCells = Array.from(row.querySelectorAll("td"));
        if (!dataCells.length) return;
        if (!dataCells.some(elementHasMeaningfulContent)) row.remove();
      });
      root.querySelectorAll("tbody").forEach((tbody) => {
        if (!tbody.querySelector("tr")) tbody.closest("table")?.remove();
      });
      root.querySelectorAll("table").forEach((table) => {
        if (!table.querySelector("td")) table.remove();
      });
      root.querySelectorAll("p, .notice, .task-item, .summary-item").forEach((node) => {
        if (!elementHasMeaningfulContent(node)) node.remove();
      });
      root.querySelectorAll(".task-list").forEach((list) => {
        if (!list.querySelector(".task-item")) list.remove();
      });
      Array.from(root.querySelectorAll("h3")).reverse().forEach((heading) => {
        let sibling = heading.nextElementSibling;
        let hasContent = false;
        while (sibling && sibling.tagName.toLowerCase() !== "h3") {
          if (!sibling.classList.contains("doc-footer-bar") && elementHasMeaningfulContent(sibling)) {
            hasContent = true;
            break;
          }
          sibling = sibling.nextElementSibling;
        }
        if (!hasContent) heading.remove();
      });
    }

    function historyItems() {
      return historyCache;
    }

    function readStoredHistoryItems(storage, key) {
      try {
        const items = JSON.parse(storage.getItem(key) || "[]");
        return Array.isArray(items) ? items : [];
      } catch (_error) {
        return [];
      }
    }

    function deletedHistoryIds() {
      try {
        const items = JSON.parse(localStorage.getItem(HISTORY_DELETED_KEY) || "[]");
        return new Set(Array.isArray(items) ? items.map(String) : []);
      } catch (_error) {
        return new Set();
      }
    }

    function rememberDeletedHistoryId(id) {
      if (!id) return;
      try {
        const ids = Array.from(deletedHistoryIds());
        if (!ids.includes(String(id))) ids.unshift(String(id));
        localStorage.setItem(HISTORY_DELETED_KEY, JSON.stringify(ids.slice(0, 1000)));
      } catch (_error) {
        // A lista de exclusões evita restauração local indevida, mas não deve travar o sistema.
      }
    }

    function removeStoredHistoryItem(id) {
      if (!id) return;
      [sessionStorage, localStorage].forEach((storage) => {
        [HISTORY_KEY, HISTORY_LOCAL_KEY].forEach((key) => {
          try {
            const items = readStoredHistoryItems(storage, key);
            if (!items.length) return;
            const filtered = items.filter((item) => String(item?.id || item?.serial || "") !== String(id));
            if (filtered.length !== items.length) storage.setItem(key, JSON.stringify(filtered));
          } catch (_error) {
            // Falha de storage local não impede a exclusão no Supabase.
          }
        });
      });
    }

    function dedupeHistoryItems(items) {
      const map = new Map();
      const deleted = deletedHistoryIds();
      items.forEach((item) => {
        if (!item) return;
        const id = item.id || item.serial || `${item.createdAt || ""}-${item.title || ""}`;
        if (!id) return;
        if (deleted.has(String(id))) return;
        const previous = map.get(id);
        const previousDate = previous?.updated_at || previous?.updatedAt || previous?.createdAt || "";
        const nextDate = item.updated_at || item.updatedAt || item.createdAt || "";
        if (!previous || String(nextDate) >= String(previousDate)) map.set(id, item);
      });
      return Array.from(map.values()).sort((a, b) => new Date(b.updatedAt || b.updated_at || b.createdAt || 0) - new Date(a.updatedAt || a.updated_at || a.createdAt || 0));
    }

    function legacyHistoryItems() {
      return dedupeHistoryItems([
        ...readStoredHistoryItems(sessionStorage, HISTORY_KEY),
        ...readStoredHistoryItems(localStorage, HISTORY_KEY),
        ...readStoredHistoryItems(localStorage, HISTORY_LOCAL_KEY)
      ]);
    }

    function mirrorHistoryLocally(items = historyCache) {
      try {
        const safeItems = dedupeHistoryItems(items).slice(0, 250).map((item) => ({
          ...item,
          formState: safePersistedFormState(item.formState || {}),
          html: redactPersistedSecrets(item.html || "", item.formState || {})
        }));
        localStorage.setItem(HISTORY_LOCAL_KEY, JSON.stringify(safeItems));
      } catch (_error) {
        // A cópia local é apenas uma camada de recuperação; falhas de quota não bloqueiam o sistema.
      }
    }

    function normalizeSearchText(text) {
      return String(text || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
    }

    function historyItemFromRow(row) {
      return {
        id: row.id,
        serial: row.serial,
        emitente: row.emitente,
        kind: row.kind,
        ...(row.status === "rascunho" ? { status: "rascunho" } : {}),
        title: row.title,
        empresa: row.empresa,
        documento: row.documento,
        procedimento: row.procedimento,
        createdAt: row.created_at,
        formState: row.form_state,
        html: cleanSensitiveStorageMarker(row.html || ""),
        hasFullDocument: Boolean(row.html || row.form_state)
      };
    }

    function cleanSensitiveStorageMarker(source = "") {
      return String(source || "").replace(/\[DADO SENSÍVEL NÃO ARMAZENADO\]/g, "");
    }

    function isOpeningBriefingCompleted(item) {
      return Boolean(item?.formState?.meta?.openingBriefingCompleted || item?.formState?.meta?.openingBriefingCompletedAt);
    }

    function isOpeningBriefingHistoryItem(item) {
      const savedType = item?.formState?.fields?.tipoBriefing || "";
      const marker = normalizeSearchText([
        savedType,
        item?.procedimento,
        item?.title,
        item?.html
      ].filter(Boolean).join(" "));
      return marker.includes("briefing abertura");
    }

    function historyRowFromItem(item) {
      const session = storedSupabaseSession();
      return {
        id: item.id,
        owner_id: session?.user?.id,
        serial: item.serial,
        emitente: item.emitente,
        kind: item.kind,
        status: item.status === "rascunho" ? "rascunho" : "final",
        title: item.title,
        empresa: item.empresa,
        documento: item.documento,
        procedimento: item.procedimento,
        created_at: item.createdAt,
        form_state: safePersistedFormState(item.formState),
        html: redactPersistedSecrets(item.html, item.formState)
      };
    }

    function redactPersistedSecrets(source, formState = {}) {
      let html = cleanSensitiveStorageMarker(source || "");
      const fields = formState?.fields || {};
      Object.entries(fields).forEach(([id, secret]) => {
        if (!/senha|password/i.test(id) || !secret) return;
        if (String(secret).length < 8) return;
        html = html.split(String(secret)).join("");
      });
      return sanitizeDocumentHtml(cleanSensitiveStorageMarker(html));
    }

    function safePersistedFormState(formState) {
      const safeState = JSON.parse(JSON.stringify(formState || {}));
      const fields = safeState.fields || {};
      const govPassword = fields.aberturaSenhaGov;
      Object.keys(fields).forEach((id) => {
        if (/^(login|registration|adminUsers|passwordReset|resetNewPassword|resetCode)/i.test(id)) delete fields[id];
      });
      if (govPassword && fields.govObs === govPassword) delete fields.govObs;
      safeState.fields = fields;
      return safeState;
    }

    async function persistHistoryItem(item) {
      const session = storedSupabaseSession();
      const rows = await supabaseFunctionRequest("onboarding-documents", {
        body: historyRowFromItem(item),
        accessToken: session?.access_token
      });
      const saved = historyItemFromRow(rows[0]);
      historyCache = [saved, ...historyCache.filter((entry) => entry.id !== saved.id)]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      mirrorHistoryLocally();
      return saved;
    }

    async function migrateLegacyHistory() {
      const legacy = dedupeHistoryItems([
        ...readStoredHistoryItems(sessionStorage, HISTORY_KEY),
        ...readStoredHistoryItems(localStorage, HISTORY_KEY)
      ]);
      if (!legacy.length) return;
      for (const item of legacy.slice(0, 40)) {
        if (!item?.id || !item?.serial) continue;
        await persistHistoryItem(item);
      }
      mirrorHistoryLocally(historyCache);
      sessionStorage.removeItem(HISTORY_KEY);
    }

    async function loadHistoryFromSupabase() {
      historyLoaded = false;
      renderHistory();
      try {
        const session = storedSupabaseSession();
        const rows = await supabaseFunctionRequest("onboarding-documents", {
          method: "GET",
          accessToken: session?.access_token
        });
        historyCache = dedupeHistoryItems([...(rows || []).map(historyItemFromRow), ...legacyHistoryItems()]);
        await migrateLegacyHistory();
        historyLoaded = true;
        if (historyCache.length) {
          mirrorHistoryLocally();
          renderHistory();
          return;
        }
        renderHistory();
      } catch (error) {
        if (!historyCache.length) {
          historyCache = legacyHistoryItems().map((item) => ({
            ...item,
            id: item.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            createdAt: item.createdAt || new Date().toISOString()
          }));
        }
        historyLoaded = true;
        if (historyCache.length) {
          mirrorHistoryLocally();
          renderHistory();
          return;
        }
        renderHistory(error.message || "Não foi possível carregar o histórico.");
      }
    }

    async function ensureFullHistoryItem(id) {
      const current = historyItems().find((entry) => entry.id === id);
      if (!current) return null;
      if (current.hasFullDocument && (current.html || current.formState)) return current;
      const session = storedSupabaseSession();
      const rows = await supabaseFunctionRequest(`onboarding-documents?id=${encodeURIComponent(id)}`, {
        method: "GET",
        accessToken: session?.access_token
      });
      const full = rows?.[0] ? historyItemFromRow(rows[0]) : null;
      if (!full) return current;
      historyCache = historyCache.map((entry) => entry.id === id ? full : entry);
      mirrorHistoryLocally();
      return full;
    }

    function currentDocumentKind() {
      if (isPropostaComercialWorkflow()) return "proposta";
      if (currentDoc === "briefing" || currentDoc === "briefingAbertura") return "briefing";
      return isBaixaWorkflow() ? "distrato" : "contrato";
    }

    function documentKindLabel(kind) {
      if (kind === "proposta") return "Proposta";
      if (kind === "contrato") return "Contrato";
      if (kind === "distrato") return "Distrato";
      return "Briefing";
    }

    function currentHistoryTitle(kind) {
      const empresa = kind === "proposta"
        ? value("propostaEmpresa", "Cliente sem identifica\u00e7\u00e3o")
        : value("razao", value("nomeFantasia", "Cliente sem identifica\u00e7\u00e3o"));
      return `${documentKindLabel(kind)} - ${empresa}`;
    }

    function serialPrefix(kind) {
      if (kind === "proposta") return "PRP";
      if (kind === "contrato") return "CTR";
      if (kind === "distrato") return "DST";
      if (kind === "rascunho") return "RSC";
      return "BRF";
    }

    function nextDocumentSerial(kind) {
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const prefix = `${serialPrefix(kind)}-${datePart}`;
      const sequence = historyItems()
        .map((item) => String(item.serial || ""))
        .filter((serial) => serial.startsWith(prefix))
        .length + 1;
      return `${prefix}-${String(sequence).padStart(4, "0")}`;
    }

    function newHistoryId() {
      return (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function activeHistoryItem() {
      const id = activeHistoryId || activeDraftId || "";
      return id ? historyItems().find((entry) => entry.id === id) || null : null;
    }

    function safeFileName(text) {
      return String(text || "documento")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 90)
        .toLowerCase() || "documento";
    }

    function captureCurrentFormState() {
      const fields = {};
      document.querySelectorAll(".app-shell input, .app-shell select, .app-shell textarea").forEach((field) => {
        if (!field.id || field.type === "file" || /^(login|registration|adminUsers|passwordReset|resetNewPassword|resetCode)/i.test(field.id)) return;
        fields[field.id] = field.type === "checkbox" || field.type === "radio" ? field.checked : field.value;
      });
      fields.formaAtuacaoSelecionada = Array.from(document.querySelectorAll(".formaAtuacao:checked")).map((field) => field.value);
      fields.aberturaFormaAtuacaoSelecionada = Array.from(document.querySelectorAll(".aberturaFormaAtuacao:checked")).map((field) => field.value);
      return {
        currentDoc,
        meta: {
          openingBriefingCompleted: Boolean(openingConclusionId || restoredOpeningBriefingCompleted)
        },
        fields,
        socios: socios.map((socio) => ({ ...socio })),
        aberturaAdministradores: aberturaAdministradores.map((admin) => ({ ...admin })),
        usuariosExternos: usuariosExternos.map((usuario) => ({ ...usuario })),
        aberturaCompletaLiberada
      };
    }

    function persistedDocumentHtml(source = $("documentPreview").innerHTML) {
      let html = cleanSensitiveStorageMarker(source || "");
      document.querySelectorAll(".app-shell input, .app-shell textarea").forEach((field) => {
        if (!field.id || !/senha|password/i.test(field.id) || !field.value) return;
        if (String(field.value).length < 8) return;
        html = html.split(field.value).join("");
      });
      return sanitizeDocumentHtml(cleanSensitiveStorageMarker(html));
    }

    async function saveCurrentDocumentToHistory(kind = currentDocumentKind()) {
      if (historySaveBusy) return activeHistoryItem();
      historySaveBusy = true;
      try {
      restoredFinalHistoryMode = false;
      const existing = activeHistoryItem();
      const documentId = activeHistoryId || activeDraftId || newHistoryId();
      const updatingExisting = Boolean(activeHistoryId || activeDraftId);
      currentDocumentSerial = updatingExisting && currentDocumentSerial ? currentDocumentSerial : nextDocumentSerial(kind);
      render();
      const now = new Date();
      const formState = captureCurrentFormState();
      if (openingConclusionId) {
        formState.meta = {
          ...(formState.meta || {}),
          openingBriefingCompleted: true,
          openingBriefingCompletedAt: now.toISOString()
        };
      }
      const item = {
        id: documentId,
        serial: currentDocumentSerial,
        emitente: activeUsername(),
        kind,
        status: "final",
        title: currentHistoryTitle(kind),
        empresa: kind === "proposta" ? value("propostaEmpresa", "") : value("razao", value("nomeFantasia", "")),
        documento: kind === "proposta" ? value("propostaCnpj", "") : value("cnpj", ""),
        procedimento: tipoBriefing() || "Não informado",
        createdAt: existing?.createdAt || now.toISOString(),
        formState,
        html: persistedDocumentHtml()
      };
      openingConclusionId = "";
      openingConclusionMode = false;
      restoredOpeningBriefingCompleted = false;
      const saved = await persistHistoryItem(item);
      activeHistoryId = saved.id;
      activeHistoryStatus = "final";
      activeDraftId = saved.id;
      currentDocumentSerial = saved.serial || currentDocumentSerial;
      renderHistory();
      return saved;
      } finally {
        historySaveBusy = false;
      }
    }

    async function saveFinalDocument() {
      if (isPropostaComercialWorkflow()) {
        if (!isPropostaComercialComplete(true)) return false;
        currentDoc = "briefing";
        render();
        await saveCurrentDocumentToHistory("proposta");
        return true;
      }
      if (isBriefingAberturaWorkflow()) {
        syncOpeningBriefingToMainFields();
      }
      if (!ensureEmissionDateForCurrentContract()) return false;
      render();
      await saveCurrentDocumentToHistory(currentDocumentKind());
      return true;
    }

    async function saveDraftToHistory(options = {}) {
      if (historySaveBusy) return activeHistoryItem();
      historySaveBusy = true;
      try {
      restoredFinalHistoryMode = false;
      const kind = currentDocumentKind();
      const canUpdateCurrentDraft = activeHistoryStatus === "rascunho" && (activeHistoryId || activeDraftId);
      const existing = canUpdateCurrentDraft ? activeHistoryItem() : null;
      const documentId = canUpdateCurrentDraft ? (activeHistoryId || activeDraftId) : newHistoryId();
      currentDocumentSerial = canUpdateCurrentDraft && currentDocumentSerial ? currentDocumentSerial : nextDocumentSerial("rascunho");
      render();
      const now = new Date();
      const item = {
        id: documentId,
        serial: currentDocumentSerial,
        emitente: activeUsername(),
        kind,
        status: "rascunho",
        title: `Rascunho - ${currentHistoryTitle(kind)}`,
        empresa: kind === "proposta" ? value("propostaEmpresa", "") : value("razao", value("nomeFantasia", "")),
        documento: kind === "proposta" ? value("propostaCnpj", "") : value("cnpj", ""),
        procedimento: tipoBriefing() || "Não informado",
        createdAt: existing?.createdAt || now.toISOString(),
        formState: captureCurrentFormState(),
        html: persistedDocumentHtml()
      };
      const saved = await persistHistoryItem(item);
      activeHistoryId = saved.id;
      activeHistoryStatus = "rascunho";
      activeDraftId = saved.id;
      currentDocumentSerial = saved.serial || currentDocumentSerial;
      if (!options.silent) renderHistory();
      return saved;
      } finally {
        historySaveBusy = false;
      }
    }

    function historySearchText(item) {
      return normalizeSearchText([
        item.serial,
        item.emitente,
        item.status,
        item.title,
        item.empresa,
        item.documento,
        item.procedimento,
        documentKindLabel(item.kind),
        item.createdAt
      ].join(" "));
    }

    function renderHistory(loadError = "") {
      const list = $("historyList");
      if (!list) return;
      const errorMessage = typeof loadError === "string" ? loadError : "";
      if (!historyLoaded) {
        list.innerHTML = `<div class="history-empty">Carregando histórico seguro...</div>`;
        return;
      }
      if (errorMessage) {
        list.innerHTML = `<div class="history-empty">${escapeHtml(errorMessage)}</div>`;
        return;
      }
      const typeFilter = $("historyTypeFilter").value;
      const search = normalizeSearchText($("historySearch").value);
      const filtered = historyItems().filter((item) => {
        const typeMatch = typeFilter === "todos" || (typeFilter === "rascunho" ? item.status === "rascunho" : item.kind === typeFilter);
        const searchMatch = !search || historySearchText(item).includes(search);
        return typeMatch && searchMatch;
      });

      if (!filtered.length) {
        list.innerHTML = `<div class="history-empty">Nenhum documento encontrado no histórico.</div>`;
        return;
      }

      list.innerHTML = filtered.map((item) => {
        const date = item.createdAt ? new Date(item.createdAt).toLocaleString("pt-BR") : "Data não informada";
        const isDraft = item.status === "rascunho";
        const canConcludeOpening = !isDraft && isOpeningBriefingHistoryItem(item) && !isOpeningBriefingCompleted(item);
        const completeTag = isOpeningBriefingCompleted(item) ? `<span class="history-tag complete-tag">Completo</span>` : "";
        const actions = isDraft
          ? `<button class="btn mini" type="button" data-history-action="edit">Editar</button><button class="btn mini" type="button" data-history-action="delete">Excluir</button>`
          : `<button class="btn mini" type="button" data-history-action="open">Abrir</button><button class="btn mini" type="button" data-history-action="edit">Editar</button>${canConcludeOpening ? `<button class="btn mini" type="button" data-history-action="conclude">Concluir</button>` : ""}<button class="btn mini" type="button" data-history-action="delete">Excluir</button>`;
        return `
          <div class="history-item" data-id="${escapeHtml(item.id)}">
            <div>
              <strong>${escapeHtml(item.title)}</strong>
              <div class="history-meta">
                <span class="history-tag">${escapeHtml(documentKindLabel(item.kind))}</span>
                ${isDraft ? `<span class="history-tag draft-tag">Rascunho</span>` : ""}
                ${completeTag}
                ${escapeHtml(item.serial || "Sem série")} | ${escapeHtml(item.procedimento || "Procedimento não informado")} | ${escapeHtml(item.documento || "Documento não informado")} | Emitente: ${escapeHtml(item.emitente || "Não registrado")} | ${escapeHtml(date)}
              </div>
            </div>
            <div class="history-item-actions">
              ${actions}
            </div>
          </div>
        `;
      }).join("");
    }

    async function openHistoryDocument(id) {
      const item = await ensureFullHistoryItem(id);
      if (!item) return;
      if (!item.html) {
        alert("Este registro não possui conteúdo de documento salvo.");
        return;
      }
      openPdfDocument(cleanSensitiveStorageMarker(item.html));
    }

    function textFromHtml(html) {
      const template = document.createElement("template");
      template.innerHTML = sanitizeDocumentHtml(html || "");
      return template.content.textContent || "";
    }

    function rowsFromHistoryHtml(html) {
      const template = document.createElement("template");
      template.innerHTML = sanitizeDocumentHtml(html || "");
      const data = {};
      template.content.querySelectorAll("tr").forEach((row) => {
        const label = row.querySelector("th")?.textContent?.trim();
        const text = row.querySelector("td")?.textContent?.trim();
        if (label && text) data[label.toLowerCase()] = text;
      });
      return data;
    }

    function findHistoryRow(rowsData, labels) {
      const keys = Object.keys(rowsData);
      for (const label of labels) {
        const key = keys.find((item) => item.includes(label.toLowerCase()));
        if (key) return rowsData[key];
      }
      return "";
    }

    function restoreLegacyHistoryDocument(item) {
      clearBriefing();
      restoredFinalHistoryMode = item.status !== "rascunho";
      aberturaCompletaLiberada = restoredFinalHistoryMode;
      const cleanHtml = cleanSensitiveStorageMarker(item.html);
      const rowsData = rowsFromHistoryHtml(cleanHtml);
      const plainText = textFromHtml(cleanHtml);
      const inferredType = item.procedimento && item.procedimento !== "Não informado"
        ? item.procedimento
        : findHistoryRow(rowsData, ["tipo de briefing"]);
      const inferredDoc = item.documento || findHistoryRow(rowsData, ["cnpj", "cpf - cei"]);
      const inferredName = item.empresa || findHistoryRow(rowsData, ["nome", "empresa"]);
      const inferredFantasy = findHistoryRow(rowsData, ["nome fantasia"]);
      const inferredAddress = findHistoryRow(rowsData, ["endereço"]);

      if (inferredType) setSelectValue("tipoBriefing", inferredType);
      if (inferredType === "BRIEFING ABERTURA" || inferredType === "PORTABILIDADE ENTRADA") {
        setSelectValue("tipoPessoa", findHistoryRow(rowsData, ["tipo de pessoa"]) || "Pessoa jurídica");
      }
      if (inferredName) setFieldValue("razao", inferredName);
      if (inferredFantasy) setFieldValue("fantasia", inferredFantasy);
      if (inferredDoc) setFieldValue("cnpj", inferredDoc);
      if (inferredAddress) setFieldValue("endereco", inferredAddress);
      setFieldValue("cnaePrincipal", findHistoryRow(rowsData, ["atividade principal", "cnae principal"]));
      setFieldValue("cnaesSecundarios", findHistoryRow(rowsData, ["atividades secundárias", "cnaes secundários"]));
      setFieldValue("capitalSocial", findHistoryRow(rowsData, ["capital social"]));
      setFieldValue("financeiroValor", findHistoryRow(rowsData, ["valor"]));
      setFieldValue("formaPagamento", findHistoryRow(rowsData, ["forma de pagamento"]));
      setFieldValue("financeiroHonorario", findHistoryRow(rowsData, ["honorário mensal", "honorário acordado"]));
      const honorarioBaseHistorico = findHistoryRow(rowsData, ["honorário base durante período de movimentação"]);
      if ($("honorarioBaseSemMovimentacao")) $("honorarioBaseSemMovimentacao").checked = /^sim$/i.test(honorarioBaseHistorico);
      setFieldValue("honorarioProvisorio", findHistoryRow(rowsData, ["honorário provisório"]));
      const historyContractDate = findHistoryRow(rowsData, ["data do contrato-distrato", "data de emissão", "data de emissao"]);
      if (historyContractDate) {
        const match = historyContractDate.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (match) setFieldValue("dataContratoDistrato", `${match[3]}-${match[2]}-${match[1]}`);
      }
      setFieldValue("financeiroObservacao", findHistoryRow(rowsData, ["observação financeira"]));
      setFieldValue("observacaoInicial", findHistoryRow(rowsData, ["observação inicial"]) || "Documento restaurado a partir do histórico para conferência e edição.");
      setFieldValue("docs", `Registro recuperado do histórico.\n${plainText.slice(0, 1200)}`);

      currentDoc = item.kind === "briefing" ? "briefing" : "contrato";
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.doc === currentDoc));
      $("historyModal").hidden = true;
      renderSocios();
      updateFlowState();
      $("tipoBriefingSecao").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function resetOnboardingFormForRestore() {
      document.querySelectorAll(".app-shell input, .app-shell select, .app-shell textarea").forEach((field) => {
        if (!field.id || field.type === "file") return;
        if (/^(login|registration|adminUsers|passwordReset)/i.test(field.id)) return;
        if (field.type === "checkbox" || field.type === "radio") field.checked = false;
        else if (field.tagName === "SELECT") field.selectedIndex = 0;
        else field.value = "";
        field.classList.remove("missing", "draft-missing");
        delete field.dataset.conditionalDisabled;
      });
      document.querySelectorAll(".step-note").forEach((note) => {
        note.textContent = "";
        note.classList.remove("visible");
      });
      socios.splice(0, socios.length);
      aberturaAdministradores.splice(0, aberturaAdministradores.length);
      usuariosExternos.splice(0, usuariosExternos.length);
      renderAberturaAdministradores();
      renderSocios();
      renderUsuariosExternos();
      clearDraftPendingHighlights();
    }

    function applySavedField(control, saved) {
      if (!control || saved === undefined) return false;
      if (control.type === "checkbox" || control.type === "radio") control.checked = Boolean(saved);
      else control.value = saved;
      control.classList.remove("missing", "draft-missing");
      syncFieldFilled(control);
      return true;
    }

    function hydrateSavedCheckboxGroups(fields = {}, html = "") {
      const hydrated = { ...fields };
      const fillGroup = (key, selector) => {
        if (Array.isArray(hydrated[key])) return;
        const plainText = normalizeSearchText(textFromHtml(html));
        if (!plainText) return;
        const selected = Array.from(document.querySelectorAll(selector))
          .map((control) => control.value)
          .filter((option) => plainText.includes(normalizeSearchText(option)));
        if (selected.length) hydrated[key] = selected;
      };
      fillGroup("formaAtuacaoSelecionada", ".formaAtuacao");
      fillGroup("aberturaFormaAtuacaoSelecionada", ".aberturaFormaAtuacao");
      return hydrated;
    }

    function restoreSavedFields(fields = {}) {
      const applied = [];
      const priorityIds = [
        "tipoBriefing",
        "aberturaCnpjConcluido",
        "tipoPessoa",
        "alteracaoSocios",
        "socioTipo",
        "estado",
        "aberturaEstado",
        "solicitarAlvaraEspecifico",
        "grupoCadastro",
        "grupoSaida",
        "honorarioBaseSemMovimentacao",
        "aberturaHonorarioBaseSemMovimentacao"
      ];

      priorityIds.forEach((id) => {
        const control = $(id);
        if (applySavedField(control, fields[id])) applied.push(control);
      });

      Object.entries(fields).forEach(([id, saved]) => {
        if (priorityIds.includes(id)) return;
        if (id === "formaAtuacaoSelecionada" || id === "aberturaFormaAtuacaoSelecionada") return;
        const control = $(id);
        if (applySavedField(control, saved)) applied.push(control);
      });

      if (Array.isArray(fields.formaAtuacaoSelecionada)) {
        const selected = new Set(fields.formaAtuacaoSelecionada.map(String));
        document.querySelectorAll(".formaAtuacao").forEach((control) => {
          control.checked = selected.has(control.value);
          control.classList.remove("missing", "draft-missing");
          applied.push(control);
        });
      }
      if (Array.isArray(fields.aberturaFormaAtuacaoSelecionada)) {
        const selected = new Set(fields.aberturaFormaAtuacaoSelecionada.map(String));
        document.querySelectorAll(".aberturaFormaAtuacao").forEach((control) => {
          control.checked = selected.has(control.value);
          control.classList.remove("missing", "draft-missing");
          applied.push(control);
        });
      }

      applied.forEach((control) => {
        control.dispatchEvent(new Event("input", { bubbles: true }));
        control.dispatchEvent(new Event("change", { bubbles: true }));
      });
      syncAllFieldsFilled();
    }

    async function restoreHistoryDocument(id, options = {}) {
      const item = await ensureFullHistoryItem(id);
      if (!item) return;
      const openingBriefing = isOpeningBriefingHistoryItem(item);
      const concludeOpening = Boolean(options.concludeOpening && openingBriefing);
      const unlockFinalHistory = item.status !== "rascunho" && !concludeOpening;
      restoredOpeningBriefingCompleted = isOpeningBriefingCompleted(item);
      restoredFinalHistoryMode = unlockFinalHistory;
      if (!item.formState) {
        activeDraftId = (item.status === "rascunho" || concludeOpening || unlockFinalHistory) ? item.id : "";
        activeHistoryId = activeDraftId;
        activeHistoryStatus = item.status === "rascunho" ? "rascunho" : (activeDraftId ? "final" : "");
        openingConclusionId = concludeOpening ? item.id : "";
        openingConclusionMode = concludeOpening;
        currentDocumentSerial = item.serial || "";
        if (openingBriefing) aberturaCompletaLiberada = unlockFinalHistory;
        restoreLegacyHistoryDocument(item);
        openingConclusionMode = concludeOpening;
        restoredFinalHistoryMode = unlockFinalHistory;
        if (openingBriefing) {
          setSelectValue("tipoBriefing", "BRIEFING ABERTURA");
          currentDoc = "briefingAbertura";
          aberturaCompletaLiberada = unlockFinalHistory;
          document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", false));
          updateFlowState();
          if (concludeOpening) {
            alert("Briefing aberto para conclusão. Informe o CNPJ na ficha Briefing Abertura, aguarde a busca automática dos dados públicos e clique em Salvar.");
            $("briefingAbertura")?.scrollIntoView({ behavior: "smooth", block: "start" });
            $("aberturaCnpjConcluido")?.focus();
          }
        }
        if (item.status === "rascunho") markDraftPendingFields();
        return;
      }
      const state = item.formState;
      resetOnboardingFormForRestore();
      openingConclusionMode = concludeOpening;
      restoredFinalHistoryMode = unlockFinalHistory;
      aberturaCompletaLiberada = openingBriefing ? unlockFinalHistory : true;
      restoringHistoryState = true;
      try {
        restoreSavedFields(hydrateSavedCheckboxGroups(state.fields || {}, item.html || ""));
      } finally {
        restoringHistoryState = false;
      }
      openingConclusionMode = concludeOpening;
      socios.splice(0, socios.length, ...((state.socios || []).map((socio) => ({ ...socio }))));
      aberturaAdministradores.splice(0, aberturaAdministradores.length, ...((state.aberturaAdministradores || []).map((admin) => ({ ...admin }))));
      usuariosExternos.splice(0, usuariosExternos.length, ...((state.usuariosExternos || []).map((usuario) => ({ ...usuario }))));
      if (!openingBriefing && typeof state.aberturaCompletaLiberada === "boolean") aberturaCompletaLiberada = state.aberturaCompletaLiberada;
      if (openingBriefing && unlockFinalHistory) aberturaCompletaLiberada = true;
      currentDoc = openingBriefing ? "briefingAbertura" : (state.currentDoc || (item.kind === "briefing" ? "briefing" : "contrato"));
      activeDraftId = (item.status === "rascunho" || concludeOpening || unlockFinalHistory) ? item.id : "";
      activeHistoryId = activeDraftId;
      activeHistoryStatus = item.status === "rascunho" ? "rascunho" : (activeDraftId ? "final" : "");
      openingConclusionId = concludeOpening ? item.id : "";
      currentDocumentSerial = item.serial || "";
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", !openingBriefing && tab.dataset.doc === currentDoc));
      $("historyModal").hidden = true;
      renderAberturaAdministradores();
      renderSocios();
      renderUsuariosExternos();
      updateFlowState();
      if (item.status === "rascunho") markDraftPendingFields();
      if (concludeOpening) {
        alert("Briefing aberto para conclusão. Informe o CNPJ na ficha Briefing Abertura, aguarde a busca automática dos dados públicos e clique em Salvar.");
        $("briefingAbertura")?.scrollIntoView({ behavior: "smooth", block: "start" });
        $("aberturaCnpjConcluido")?.focus();
      } else {
        $("tipoBriefingSecao").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    async function deleteHistoryDocument(id, refresh = true) {
      if (!isCurrentUserAdmin()) throw new Error("Somente o administrador pode excluir documentos.");
      if (!id) throw new Error("Documento inválido para exclusão.");
      const session = storedSupabaseSession();
      await supabaseFunctionRequest(`onboarding-documents?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        body: { id },
        accessToken: session?.access_token
      });
      rememberDeletedHistoryId(id);
      removeStoredHistoryItem(id);
      historyCache = historyItems().filter((entry) => String(entry.id) !== String(id));
      mirrorHistoryLocally(historyCache);
      if (activeDraftId === id) activeDraftId = "";
      if (activeHistoryId === id) {
        activeHistoryId = "";
        activeHistoryStatus = "";
      }
      if (refresh) renderHistory();
    }

    function selectedHistoryItem(id) {
      return historyItems().find((entry) => entry.id === id) || null;
    }

    function openHistoryDeleteConfirm(id) {
      const item = selectedHistoryItem(id);
      if (!item || historyDeleteBusy) return;
      pendingHistoryDeleteId = id;
      const modal = $("historyDeleteConfirm");
      const title = $("historyDeleteTitle");
      if (title) title.textContent = "Tem certeza que deseja excluir?";
      const text = modal?.querySelector("p");
      if (text) text.textContent = `O arquivo "${item.title || "Documento do histórico"}" será removido do histórico.`;
      if (modal) modal.hidden = false;
      $("historyDeleteNo")?.focus();
    }

    function closeHistoryDeleteConfirm() {
      if (historyDeleteBusy) return;
      pendingHistoryDeleteId = "";
      if ($("historyDeleteConfirm")) $("historyDeleteConfirm").hidden = true;
    }

    async function confirmHistoryDelete() {
      if (!pendingHistoryDeleteId || historyDeleteBusy) return;
      const id = pendingHistoryDeleteId;
      const yesButton = $("historyDeleteYes");
      const noButton = $("historyDeleteNo");
      const modalText = $("historyDeleteConfirm")?.querySelector("p");
      historyDeleteBusy = true;
      if (yesButton) {
        yesButton.disabled = true;
        yesButton.textContent = "Excluindo...";
      }
      if (noButton) noButton.disabled = true;
      try {
        await deleteHistoryDocument(id);
        pendingHistoryDeleteId = "";
        if ($("historyDeleteConfirm")) $("historyDeleteConfirm").hidden = true;
      } catch (error) {
        if (modalText) modalText.textContent = error?.message || "Não foi possível excluir o documento.";
      } finally {
        historyDeleteBusy = false;
        if (yesButton) {
          yesButton.disabled = false;
          yesButton.textContent = "Sim, excluir";
        }
        if (noButton) noButton.disabled = false;
      }
    }

    function clearDraftPendingHighlights() {
      document.querySelectorAll(".draft-missing").forEach((field) => field.classList.remove("draft-missing"));
    }

    function markDraftPendingFields() {
      clearDraftPendingHighlights();
      activeStepOrder().forEach((stepId) => {
        if (!$(stepId)) return;
        requiredControls(stepId).forEach((control) => {
          if (!controlFilled(control)) control.classList.add("draft-missing");
        });
      });
      if (activeStepOrder().includes("socios") && !socios.length) {
        const socioDraftIds = value("socioTipo", "Pessoa física") === "Pessoa jurídica"
          ? ["socioNome", "socioCnpj", "socioEndereco", "socioParticipacao"]
          : ["socioNome", "socioCpf", "socioParticipacao"];
        socioDraftIds.forEach((id) => {
          if ($(id) && !value(id, "")) $(id).classList.add("draft-missing");
        });
      }
    }

    function clearUsuarioExternoForm() {
      ["usuarioExternoEmail", "usuarioExternoTelefone", "usuarioExternoObservacoes"].forEach((id) => {
        const field = $(id);
        if (!field) return;
        field.value = "";
        field.classList.remove("missing", "draft-missing");
      });
      syncAllFieldsFilled();
    }

    function renderUsuariosExternos() {
      const list = $("usuariosExternosList");
      if (!list) return;
      list.innerHTML = usuariosExternos.map((usuario, index) => `
        <div class="socio-card">
          <div class="socio-header">
            <strong>${escapeHtml(usuario.email || "Usuário externo")}</strong>
            <div class="socio-actions">
              <button class="btn mini" type="button" data-edit-usuario-externo="${index}">Editar</button>
              <button class="btn mini" type="button" data-remove-usuario-externo="${index}">Remover</button>
            </div>
          </div>
          <div>${escapeHtml(usuario.telefone || "Telefone não informado")}${usuario.observacoes ? ` | ${escapeHtml(usuario.observacoes)}` : ""}</div>
        </div>
      `).join("");
      document.querySelectorAll("[data-edit-usuario-externo]").forEach((button) => {
        button.addEventListener("click", () => {
          const usuario = usuariosExternos.splice(Number(button.dataset.editUsuarioExterno), 1)[0];
          if (!usuario) return;
          setFieldValue("usuarioExternoEmail", usuario.email || "");
          setFieldValue("usuarioExternoTelefone", usuario.telefone || "");
          setFieldValue("usuarioExternoObservacoes", usuario.observacoes || "");
          renderUsuariosExternos();
          updateFlowState();
          $("usuariosExternosSecao")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
      document.querySelectorAll("[data-remove-usuario-externo]").forEach((button) => {
        button.addEventListener("click", () => {
          usuariosExternos.splice(Number(button.dataset.removeUsuarioExterno), 1);
          renderUsuariosExternos();
          updateFlowState();
        });
      });
    }

    function renderSocios() {
      $("sociosList").innerHTML = socios.map((socio, index) => `
        <div class="socio-card">
          <div class="socio-header">
            <strong>${escapeHtml(socio.nome)} ${socio.tipo === "Pessoa jurídica" ? "<small>PJ</small>" : ""}</strong>
            <div class="socio-actions">
              <button class="btn mini" type="button" data-edit="${index}">Editar</button>
              <button class="btn mini" type="button" data-remove="${index}">Remover</button>
            </div>
          </div>
          <div>${escapeHtml(socio.tipo === "Pessoa jurídica" ? socio.cnpj : socio.cpf)} | ${escapeHtml(socio.participacao)} | ${escapeHtml(socio.email)}</div>
        </div>
      `).join("");
      document.querySelectorAll("[data-edit]").forEach((button) => {
        button.addEventListener("click", () => {
          const socio = socios.splice(Number(button.dataset.edit), 1)[0];
          if (!socio) return;
          $("socioTipo").value = socio.tipo || "Pessoa física";
          $("socioNome").value = socio.nome || "";
          $("socioCpf").value = socio.cpf || "";
          if ($("socioCnpj")) $("socioCnpj").value = socio.cnpj || "";
          if ($("socioEndereco")) $("socioEndereco").value = socio.endereco || "";
          if ($("socioPjResponsavelNome")) $("socioPjResponsavelNome").value = socio.pjResponsavelNome || "";
          if ($("socioPjResponsavelCpf")) $("socioPjResponsavelCpf").value = socio.pjResponsavelCpf || "";
          $("socioParticipacao").value = socio.participacao || "";
          if ($("socioProlabore")) $("socioProlabore").value = socio.prolabore || "";
          if ($("socioValorProlabore")) $("socioValorProlabore").value = socio.valorProlabore || "";
          $("socioNascimento").value = socio.nascimento || "";
          $("socioEmail").value = socio.email || "";
          $("socioTelefone").value = socio.telefone || "";
          $("socioSexo").value = socio.sexo || "";
          $("socioEstadoCivil").value = socio.estadoCivil || "";
          $("socioRegimeCasamento").value = socio.regimeCasamento === "Não aplicável" ? "" : (socio.regimeCasamento || "");
          $("socioQualificacao").value = socio.qualificacao || "";
          if ($("socioMae")) $("socioMae").value = socio.mae || "";
          if ($("socioTitulo")) $("socioTitulo").value = socio.titulo || "";
          if ($("socioCertificadoDigital")) $("socioCertificadoDigital").value = socio.certificadoDigital || "";
          if ($("socioSenhaGov")) $("socioSenhaGov").value = socio.senhaGov || "";
          renderSocios();
          syncAllFieldsFilled();
          updateFlowState();
          $("socios").scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
      document.querySelectorAll("[data-remove]").forEach((button) => {
        button.addEventListener("click", () => {
          socios.splice(Number(button.dataset.remove), 1);
          renderSocios();
          updateFlowState();
        });
      });
    }

    function renderAberturaAdministradores() {
      const list = $("aberturaSociosList") || $("aberturaAdminsList");
      if (!list) return;
      list.innerHTML = aberturaAdministradores.map((admin, index) => `
        <div class="socio-card">
          <div class="socio-header">
            <strong>${escapeHtml(admin.nome)} ${admin.tipo === "Pessoa jurídica" ? "<small>PJ</small>" : ""}</strong>
            <div class="socio-actions">
              <button class="btn mini" type="button" data-edit-abertura-admin="${index}">Editar</button>
              <button class="btn mini" type="button" data-remove-abertura-admin="${index}">Remover</button>
            </div>
          </div>
          <div>${escapeHtml(admin.tipo === "Pessoa jurídica" ? admin.cnpj : admin.cpf)} | ${escapeHtml(admin.percentual || admin.quotas || "Participação não informada")} | ${escapeHtml(admin.qualificacao || "Qualificação não informada")}${admin.tipo === "Pessoa jurídica" || !admin.prolabore ? "" : ` | Pró-labore: ${escapeHtml(admin.prolabore)}${admin.prolabore === "Sim" && admin.valorProlabore ? ` - ${escapeHtml(admin.valorProlabore)}` : ""}`}</div>
        </div>
      `).join("");
      document.querySelectorAll("[data-edit-abertura-admin]").forEach((button) => {
        button.addEventListener("click", () => {
          const admin = aberturaAdministradores.splice(Number(button.dataset.editAberturaAdmin), 1)[0];
          if (!admin) return;
          setSelectValue("aberturaSocioTipo", admin.tipo || "Pessoa física");
          setFieldValue("aberturaSocioNome", admin.nome || "");
          setFieldValue("aberturaSocioCpf", admin.cpf || "");
          setFieldValue("aberturaSocioCnpj", admin.cnpj || "");
          setFieldValue("aberturaSocioEndereco", admin.endereco || "");
          setFieldValue("aberturaSocioPjResponsavelNome", admin.pjResponsavelNome || "");
          setFieldValue("aberturaSocioPjResponsavelCpf", admin.pjResponsavelCpf || "");
          setFieldValue("aberturaSocioCep", admin.cep || "");
          setSelectValue("aberturaSocioEstadoCivil", admin.estadoCivil === "Não aplicável" ? "" : (admin.estadoCivil || ""));
          setSelectValue("aberturaSocioRegimeCasamento", admin.regimeCasamento === "Não aplicável" ? "" : (admin.regimeCasamento || ""));
          setFieldValue("aberturaSocioProfissao", admin.profissao || "");
          setFieldValue("aberturaSocioQuotas", admin.quotas || "");
          setFieldValue("aberturaSocioPercentual", admin.percentual || "");
          setSelectValue("aberturaSocioQualificacao", admin.qualificacao || "");
          setSelectValue("aberturaPossuiProlabore", admin.prolabore || "");
          setFieldValue("aberturaProlabore", admin.valorProlabore || "");
          setSelectValue("aberturaCertificadoPf", admin.certificadoDigital || "");
          setSelectValue("aberturaPossuiSenhaGov", admin.possuiSenhaGov || "");
          setFieldValue("aberturaSenhaGov", admin.senhaGov || "");
          renderAberturaAdministradores();
          syncAllFieldsFilled();
          updateFlowState();
          $("briefingAbertura").scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
      document.querySelectorAll("[data-remove-abertura-admin]").forEach((button) => {
        button.addEventListener("click", () => {
          aberturaAdministradores.splice(Number(button.dataset.removeAberturaAdmin), 1);
          renderAberturaAdministradores();
          updateFlowState();
        });
      });
    }

    function clearAberturaSocioForm() {
      ["aberturaSocioNome", "aberturaSocioCpf", "aberturaSocioCnpj", "aberturaSocioEndereco", "aberturaSocioPjResponsavelNome", "aberturaSocioPjResponsavelCpf", "aberturaSocioCep", "aberturaSocioProfissao", "aberturaSocioQuotas", "aberturaSocioPercentual", "aberturaProlabore", "aberturaSenhaGov"].forEach((id) => {
        const field = $(id);
        if (field) {
          field.value = "";
          field.classList.remove("missing", "draft-missing");
        }
      });
      setSelectValue("aberturaSocioTipo", "Pessoa física");
      setSelectValue("aberturaSocioEstadoCivil", "");
      setSelectValue("aberturaSocioRegimeCasamento", "");
      setSelectValue("aberturaSocioQualificacao", "");
      setSelectValue("aberturaPossuiProlabore", "");
      setSelectValue("aberturaCertificadoPf", "");
      setSelectValue("aberturaPossuiSenhaGov", "");
      updateConditionalFields();
      syncAllFieldsFilled();
    }

    if ($("addAberturaSocio")) $("addAberturaSocio").addEventListener("click", () => {
      const socio = aberturaSocioAtual();
      const pessoaJuridica = value("aberturaSocioTipo", "Pessoa física") === "Pessoa jurídica";
      const requiredIds = pessoaJuridica
        ? ["aberturaSocioNome", "aberturaSocioCnpj", "aberturaSocioEndereco", "aberturaSocioQualificacao"]
        : ["aberturaSocioNome", "aberturaSocioCpf", "aberturaSocioCep", "aberturaSocioEndereco", "aberturaSocioQualificacao"];
      if (!pessoaJuridica) {
        requiredIds.push("aberturaPossuiProlabore");
        if (value("aberturaPossuiProlabore", "") === "Sim") requiredIds.push("aberturaProlabore");
      }
      const missing = requiredIds.filter((id) => !value(id, ""));
      requiredIds.forEach((id) => setMissing($(id), missing.includes(id)));
      if (!socio || missing.length) {
        stepNote("briefingAbertura", "Informe os dados principais do sócio antes de adicioná-lo.");
        return;
      }
      aberturaAdministradores.push(socio);
      clearAberturaSocioForm();
      renderAberturaAdministradores();
      stepNote("briefingAbertura", `Sócio ${socio.nome} adicionado.`);
      updateFlowState();
    });

    if ($("addAberturaAdmin")) $("addAberturaAdmin").addEventListener("click", () => {
      const nome = value("aberturaAdminNome", "");
      const cpf = value("aberturaAdminCpf", "");
      const socioAdministrador = value("aberturaAdminSocioAdministrador", "Sim");
      setMissing($("aberturaAdminNome"), !nome);
      setMissing($("aberturaAdminCpf"), !cpf);
      if (!nome || !cpf) {
        stepNote("briefingAbertura", "Informe nome e CPF para adicionar o sócio.");
        return;
      }
      aberturaAdministradores.push({ nome, cpf: formatCpfDigits(cpf), socioAdministrador });
      $("aberturaAdminNome").value = "";
      $("aberturaAdminCpf").value = "";
      $("aberturaAdminSocioAdministrador").value = "Sim";
      renderAberturaAdministradores();
      updateFlowState();
    });

    if ($("addUsuarioExterno")) $("addUsuarioExterno").addEventListener("click", () => {
      const usuario = {
        email: value("usuarioExternoEmail", ""),
        telefone: value("usuarioExternoTelefone", ""),
        observacoes: value("usuarioExternoObservacoes", "")
      };
      setMissing($("usuarioExternoEmail"), !usuario.email);
      if (!usuario.email) {
        stepNote("usuariosExternosSecao", "Informe o e-mail do usuário externo antes de adicioná-lo.");
        return;
      }
      usuariosExternos.push(usuario);
      clearUsuarioExternoForm();
      renderUsuariosExternos();
      stepNote("usuariosExternosSecao", `Usuário externo ${usuario.email} adicionado.`);
      updateFlowState();
    });

    const buscarAberturaCoordenadasButton = $("buscarAberturaCoordenadas");
    if (buscarAberturaCoordenadasButton) {
      buscarAberturaCoordenadasButton.addEventListener("click", async () => {
        setLoading(buscarAberturaCoordenadasButton, true, "Buscando...");
        try {
          await buscarAberturaCoordenadasPorEndereco();
        } finally {
          setLoading(buscarAberturaCoordenadasButton, false, "Buscar coordenadas pelo endereço");
        }
      });
    }

    $("addSocio").addEventListener("click", () => {
      const pessoaFisicaEntradaAbertura = isPessoaFisica();
      const socioPessoaJuridica = !pessoaFisicaEntradaAbertura && value("socioTipo", "Pessoa física") === "Pessoa jurídica";
      const draftIds = socioPessoaJuridica
        ? ["socioNome", "socioCnpj", "socioEndereco", "socioQualificacao", "socioTipo", "socioParticipacao", "socioEmail", "socioTelefone"]
        : ["socioNome", "socioCpf", "socioParticipacao", "socioNascimento", "socioEmail", "socioTelefone", "socioSexo", "socioEstadoCivil"];
      if (!pessoaFisicaEntradaAbertura && !socioPessoaJuridica) draftIds.push("socioQualificacao", "socioTipo");
      if (!pessoaFisicaEntradaAbertura && !socioPessoaJuridica && !isBaixaWorkflow()) {
        draftIds.push("socioProlabore");
        if (value("socioProlabore", "") === "Sim") draftIds.push("socioValorProlabore");
      }
      if (!socioPessoaJuridica && value("socioEstadoCivil", "") === "Casado(a)") draftIds.push("socioRegimeCasamento");
      const missingDraft = draftIds.filter((id) => value(id, "") === "");
      draftIds.forEach((id) => setMissing($(id), missingDraft.includes(id)));
      if (missingDraft.length) {
        stepNote("socios", "Preencha todos os dados do sócio antes de adicioná-lo.");
        return;
      }
      const nome = value("socioNome", "");
      socios.push({
        tipo: pessoaFisicaEntradaAbertura ? "Pessoa física" : value("socioTipo", "Pessoa física"),
        nome,
        cpf: socioPessoaJuridica ? "" : formatCpfDigits(value("socioCpf")),
        cnpj: socioPessoaJuridica ? formatCnpjDigits(value("socioCnpj")) : "",
        endereco: socioPessoaJuridica ? value("socioEndereco") : "",
        pjResponsavelNome: socioPessoaJuridica ? value("socioPjResponsavelNome", "") : "",
        pjResponsavelCpf: socioPessoaJuridica ? formatCpfDigits(value("socioPjResponsavelCpf", "")) : "",
        participacao: value("socioParticipacao"),
        prolabore: pessoaFisicaEntradaAbertura || isBaixaWorkflow() || socioPessoaJuridica ? "" : value("socioProlabore"),
        valorProlabore: pessoaFisicaEntradaAbertura || isBaixaWorkflow() || socioPessoaJuridica || value("socioProlabore", "") !== "Sim" ? "" : value("socioValorProlabore"),
        nascimento: socioPessoaJuridica ? "" : $("socioNascimento").value,
        email: value("socioEmail"),
        telefone: value("socioTelefone"),
        sexo: socioPessoaJuridica ? "Não aplicável" : value("socioSexo"),
        estadoCivil: socioPessoaJuridica ? "Não aplicável" : value("socioEstadoCivil"),
        regimeCasamento: !socioPessoaJuridica && value("socioEstadoCivil", "") === "Casado(a)" ? value("socioRegimeCasamento") : "Não aplicável",
        qualificacao: pessoaFisicaEntradaAbertura ? "Empregador - Representante" : value("socioQualificacao"),
        mae: isBaixaWorkflow() || socioPessoaJuridica ? "" : value("socioMae"),
        titulo: isBaixaWorkflow() || socioPessoaJuridica ? "" : value("socioTitulo"),
        certificadoDigital: value("socioCertificadoDigital", ""),
        senhaGov: isSaidaWorkflow() ? "" : value("socioSenhaGov", "")
      });
      ["socioNome", "socioCpf", "socioCnpj", "socioEndereco", "socioPjResponsavelNome", "socioPjResponsavelCpf", "socioParticipacao", "socioProlabore", "socioValorProlabore", "socioNascimento", "socioEmail", "socioTelefone", "socioSexo", "socioEstadoCivil", "socioRegimeCasamento", "socioMae", "socioTitulo", "socioCertificadoDigital", "socioSenhaGov"].forEach((id) => {
        const field = $(id);
        if (field) field.value = "";
      });
      $("socioTipo").value = "Pessoa física";
      $("socioQualificacao").value = "";
      if ($("socioProlabore")) $("socioProlabore").value = "";
      renderSocios();
      stepNote("socios", `${pessoaFisicaEntradaAbertura ? "Empregador - Representante" : "Sócio"} ${nome} adicionado.`);
      updateFlowState();
    });

    function startSocio(tipo) {
      $("socioTipo").value = tipo;
      updateFlowState();
      const focusField = $("socioNome");
      focusField?.scrollIntoView({ behavior: "smooth", block: "center" });
      focusField?.focus();
    }

    const startSocioPfButton = $("startSocioPf");
    if (startSocioPfButton) startSocioPfButton.addEventListener("click", () => startSocio("Pessoa física"));
    const startSocioPjButton = $("startSocioPj");
    if (startSocioPjButton) startSocioPjButton.addEventListener("click", () => startSocio("Pessoa jurídica"));

    document.querySelectorAll("input, select, textarea").forEach((field) => {
      syncFieldFilled(field);
      if (currencyFieldIds.has(field.id)) {
        field.inputMode = "numeric";
        field.autocomplete = "off";
      }
      if (preciseNumberFieldIds.has(field.id)) {
        field.inputMode = "decimal";
        field.autocomplete = "off";
      }
      field.addEventListener("input", () => {
        if (applyCurrencyMask(field)) {
          field.classList.remove("draft-missing");
          updateFlowState();
          return;
        }
        if (applyPreciseNumberMask(field)) {
          field.classList.remove("draft-missing");
          updateFlowState();
          return;
        }
        if (field.id === "cnpj") normalizeIdentificacao();
        if (field.id === "propostaCnpj") field.value = formatCnpjDigits(field.value);
        if (field.id === "aberturaCnpjConcluido") field.value = formatCnpjDigits(field.value);
        if (field.id === "cep") normalizeCepField("cep");
        if (field.id === "aberturaCep") normalizeCepField("aberturaCep");
        if (field.id === "aberturaSocioCep") normalizeCepField("aberturaSocioCep");
        if (field.id === "aberturaSocioCnpj") field.value = formatCnpjDigits(field.value);
        if (field.id === "aberturaCnaePrincipal") field.value = formatCnaeDigits(field.value);
        if (field.id === "cnaePrincipal" && !/[a-zA-ZÀ-ÿ]/.test(field.value) && onlyDigits(field.value).length <= 7) field.value = formatCnaeDigits(field.value);
        if (field.id === "socioCnpj") field.value = formatCnpjDigits(field.value);
        if (["telefoneEmpresa", "socioTelefone", "contadorAnteriorTelefone", "usuarioExternoTelefone"].includes(field.id)) field.value = formatPhoneDigits(field.value);
        if (field.id === "socioCpf" || field.id === "socioPjResponsavelCpf" || field.id === "aberturaAdminCpf" || field.id === "aberturaSocioCpf" || field.id === "aberturaSocioPjResponsavelCpf") normalizeCpfField(field.id);
        field.classList.remove("draft-missing");
        syncFieldFilled(field);
        updateFlowState();
      });
      field.addEventListener("change", () => {
        if (field.id === "tipoBriefing" && !restoringHistoryState) {
          aberturaCompletaLiberada = false;
          openingConclusionMode = false;
          openingConclusionId = "";
        }
        if (field.id === "cnpj" || field.id === "tipoPessoa" || field.id === "tipoBriefing") normalizeIdentificacao();
        if (field.id === "propostaCnpj") {
          field.value = formatCnpjDigits(field.value);
          if (onlyDigits(field.value).length === 14) consultarPropostaCnpjPublico(true);
        }
        if (field.id === "aberturaCnpjConcluido") {
          field.value = formatCnpjDigits(field.value);
          if (onlyDigits(field.value).length === 14) consultarAberturaCnpjConcluidoPublico(true);
        }
        if (field.id === "cep") normalizeCepField("cep");
        if (field.id === "aberturaCep") normalizeCepField("aberturaCep");
        if (field.id === "aberturaSocioCep") normalizeCepField("aberturaSocioCep");
        if (field.id === "aberturaSocioCnpj") field.value = formatCnpjDigits(field.value);
        if (field.id === "socioCpf" || field.id === "socioPjResponsavelCpf" || field.id === "aberturaAdminCpf" || field.id === "aberturaSocioCpf" || field.id === "aberturaSocioPjResponsavelCpf") normalizeCpfField(field.id);
        field.classList.remove("draft-missing");
        syncFieldFilled(field);
        updateFlowState();
        if (field.id === "cnpj") autoConsultarCnpjSeCompleto();
        if (field.id === "cep") autoConsultarCepSeCompleto();
        if (field.id === "aberturaCep") autoConsultarAberturaCepSeCompleto();
        if (field.id === "aberturaSocioCep") autoConsultarAberturaSocioCepSeCompleto();
        if (field.id === "aberturaCnaePrincipal") autoPreencherCnaePrincipal("aberturaCnaePrincipal", "aberturaAtividadePrincipal");
        if (field.id === "cnaePrincipal" && !/[a-zA-ZÀ-ÿ]/.test(field.value)) autoPreencherCnaePrincipal("cnaePrincipal");
        if (field.id === "aberturaSocioCnpj" && onlyDigits(field.value).length === 14) consultarAberturaSocioCnpjPublico(true);
        if (field.id === "socioCnpj" && onlyDigits(field.value).length === 14) consultarSocioCnpjPublico(true);
      });
      field.addEventListener("blur", () => {
        if (currencyFieldIds.has(field.id)) formatCurrencyField(field.id);
        if (preciseNumberFieldIds.has(field.id)) applyPreciseNumberMask(field, { finalize: true });
      });
    });

    $("buscarCnpj").addEventListener("click", consultarCnpjPublico);
    if ($("buscarPropostaCnpj")) $("buscarPropostaCnpj").addEventListener("click", consultarPropostaCnpjPublico);
    if ($("buscarAberturaCnpjConcluido")) $("buscarAberturaCnpjConcluido").addEventListener("click", consultarAberturaCnpjConcluidoPublico);
    $("buscarSocioCnpj").addEventListener("click", consultarSocioCnpjPublico);
    $("buscarAberturaSocioCnpj").addEventListener("click", consultarAberturaSocioCnpjPublico);
    $("buscarCep").addEventListener("click", consultarCepPublico);
    $("buscarAberturaCep").addEventListener("click", consultarAberturaCepPublico);
    $("buscarAberturaSocioCep").addEventListener("click", consultarAberturaSocioCepPublico);
    $("documentUploadActions").addEventListener("change", (event) => {
      if (event.target && event.target.matches("input[type='file'][data-upload-kind]")) {
        handleDocumentUpload(event.target);
      }
    });

    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        currentDoc = tab.dataset.doc;
        document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item === tab));
        render();
      });
    });

    document.querySelectorAll(".nav-button").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.disabled || button.classList.contains("locked")) return;
        document.querySelectorAll(".nav-button").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        const targetId = isPropostaComercialWorkflow() && button.dataset.jump === "tipoBriefingSecao" ? "propostaComercialSecao" : button.dataset.jump;
        $(targetId).scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    function prepareOpeningBriefingDocument() {
      syncOpeningBriefingToMainFields();
      currentDoc = "briefingAbertura";
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", false));
      render();
    }

    const generateBriefingButton = $("generateBriefing");
    if (generateBriefingButton) generateBriefingButton.addEventListener("click", async () => {
      if (isBriefingAberturaWorkflow()) {
        syncOpeningBriefingToMainFields();
        currentDoc = "briefing";
        document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.doc === "briefing"));
        render();
        await saveCurrentDocumentToHistory("briefing");
        $("documentPreview").scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      validateVisibleSteps();
      currentDoc = "briefing";
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.doc === "briefing"));
      render();
      await saveCurrentDocumentToHistory("briefing");
      $("documentPreview").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const generateContractButton = $("generateContract");
    if (generateContractButton) generateContractButton.addEventListener("click", async () => {
      validateVisibleSteps();
      currentDoc = "contrato";
      if (!ensureEmissionDateForCurrentContract()) return;
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.doc === "contrato"));
      render();
      await saveCurrentDocumentToHistory(isBaixaWorkflow() ? "distrato" : "contrato");
      $("documentPreview").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    let originalPrintTitle = document.title;

    function setButtonInteractionState(button, state = "idle") {
      if (!button) return;
      button.classList.toggle("is-loading", state === "loading");
      button.classList.toggle("is-success", state === "success");
      button.classList.toggle("is-error", state === "error");
      if (state === "loading") button.setAttribute("aria-busy", "true");
      else button.removeAttribute("aria-busy");
    }

    function syncButtonInteractionState(button) {
      if (!(button instanceof HTMLButtonElement)) return;
      const label = String(button.textContent || "").trim().toLocaleLowerCase("pt-BR");
      if (button.disabled && /(?:ando|endo)\.\.\.$/.test(label)) {
        setButtonInteractionState(button, "loading");
      } else if (/^(?:salvo|rascunho salvo|atualizado|enviado|gerado)$/.test(label)) {
        setButtonInteractionState(button, "success");
      } else if (/^(?:erro|não foi possível)/.test(label)) {
        setButtonInteractionState(button, "error");
      } else if (!button.disabled) {
        setButtonInteractionState(button, "idle");
      }
    }

    const buttonStateObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        const button = mutation.target instanceof HTMLButtonElement
          ? mutation.target
          : mutation.target.parentElement?.closest("button");
        if (button) syncButtonInteractionState(button);
      });
    });
    buttonStateObserver.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["disabled"]
    });

    function preparePrintTitle() {
      originalPrintTitle = document.title;
      document.title = "";
    }

    function restorePrintTitle() {
      document.title = originalPrintTitle || "OnBoard Contábil";
    }

    window.addEventListener("beforeprint", preparePrintTitle);
    window.addEventListener("afterprint", restorePrintTitle);

    function printableDocumentHtml(contentHtml = $("documentPreview").innerHTML, autoPrint = true) {
      contentHtml = sanitizeDocumentHtml(contentHtml);
      const styles = Array.from(document.querySelectorAll("style")).map((style) => style.textContent).join("\n");
      const baseUrl = new URL(".", window.location.href).href;
      return `<!doctype html>
        <html lang="pt-BR">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <base href="${baseUrl}">
            <title></title>
            <style>
              ${styles}
              body {
                background: #eef4fb !important;
              }
              body::before, aside, .topbar, .form-column, .tabs, .actions {
                display: none !important;
                content: none !important;
              }
              .pdf-shell {
                max-width: 920px;
                margin: 22px auto;
                padding: 0 18px;
              }
              .pdf-toolbar {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 8px;
                margin-bottom: 12px;
              }
              .pdf-print-tip {
                color: #466274;
                font-size: 12px;
                line-height: 1.35;
              }
              .document {
                border-radius: 14px;
                overflow: hidden;
                print-color-adjust: exact;
                -webkit-print-color-adjust: exact;
              }
              @media print {
                @page { margin: 8mm; }
                * {
                  print-color-adjust: exact !important;
                  -webkit-print-color-adjust: exact !important;
                }
                body {
                  background: #fff !important;
                  color: #1d2528 !important;
                }
                .pdf-shell {
                  max-width: none;
                  margin: 0;
                  padding: 0;
                }
                .pdf-toolbar { display: none !important; }
                .document {
                  border: 1px solid #d7e7f7;
                  border-radius: 10px;
                  box-shadow: none;
                  min-height: auto;
                  overflow: hidden;
                }
                .doc-logo-bar {
                  display: none !important;
                }
                .doc-footer-bar { display: flex !important; }
                .doc-cover {
                  padding: 14px 22px 16px !important;
                }
                .doc-body {
                  padding: 20px 24px 24px !important;
                  background: #fff !important;
                }
                .doc-table {
                  border-spacing: 0 5px !important;
                }
                .doc-table th,
                .doc-table td,
                .summary-item,
                .task-item,
                .contract-party,
                .contract-clause,
                .service-box {
                  break-inside: avoid;
                  page-break-inside: avoid;
                }
              }
            </style>
          </head>
          <body class="${printableProfileClass()}">
            <div class="pdf-shell">
              <div class="pdf-toolbar">
                <div class="pdf-print-tip">Para remover data, endereço, about:blank e paginação automática, desmarque <strong>Cabeçalhos e rodapés</strong> na janela de impressão.</div>
                <button class="btn primary" id="pdfPrintButton" type="button">Gerar PDF</button>
              </div>
              <article class="document">${contentHtml}</article>
            </div>
          </body>
        </html>`;
    }

    function openPdfDocument(contentHtml = null) {
      if (!contentHtml) render();
      const pdfWindow = window.open("", "_blank");
      if (!pdfWindow) {
        preparePrintTitle();
        window.print();
        setTimeout(restorePrintTitle, 800);
        return;
      }
      writePdfDocument(pdfWindow, contentHtml || $("documentPreview").innerHTML);
    }

    function writePdfDocument(pdfWindow, contentHtml) {
      pdfWindow.document.open();
      pdfWindow.document.write(printableDocumentHtml(sanitizeDocumentHtml(contentHtml), true));
      pdfWindow.document.close();
      pdfWindow.focus();
      const startPrint = () => {
        pdfWindow.document.title = "";
        pdfWindow.focus();
        pdfWindow.print();
      };
      pdfWindow.document.getElementById("pdfPrintButton")?.addEventListener("click", startPrint);
      setTimeout(startPrint, 350);
    }

    function openPdfBlobDocument(contentHtml) {
      const html = printableDocumentHtml(sanitizeDocumentHtml(contentHtml), true);
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const pdfWindow = window.open(url, "_blank");
      if (!pdfWindow) {
        openPdfDocument(contentHtml);
        return;
      }
      pdfWindow.addEventListener("load", () => {
        const startPrint = () => {
          pdfWindow.document.title = "";
          pdfWindow.focus();
          pdfWindow.print();
        };
        pdfWindow.document.getElementById("pdfPrintButton")?.addEventListener("click", startPrint);
        setTimeout(startPrint, 350);
      }, { once: true });
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }

    async function inlineImagesForWord(contentHtml) {
      const template = document.createElement("template");
      template.innerHTML = sanitizeDocumentHtml(contentHtml);
      const images = Array.from(template.content.querySelectorAll("img"));
      await Promise.all(images.map(async (image) => {
        try {
          const absoluteUrl = new URL(image.getAttribute("src"), window.location.href).href;
          const response = await fetch(absoluteUrl);
          const blob = await response.blob();
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          image.setAttribute("src", dataUrl);
        } catch (error) {}
      }));
      return template.innerHTML;
    }

    async function generateWordDocument() {
      if (isPropostaComercialWorkflow()) {
        if (!isPropostaComercialComplete(true)) return;
        currentDoc = "briefing";
        render();
        await saveCurrentDocumentToHistory("proposta");
      } else {
        if (isBriefingAberturaWorkflow()) {
          syncOpeningBriefingToMainFields();
          currentDoc = "briefing";
          document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.doc === "briefing"));
        }
        if (!ensureEmissionDateForCurrentContract()) return;
        render();
        await saveCurrentDocumentToHistory();
      }
      const kind = currentDocumentKind();
      const contentHtml = await inlineImagesForWord($("documentPreview").innerHTML);
      const wordBrand = activeProfile() === "simao" ? "#f4bd2a" : "#091d35";
      const wordBrandDark = activeProfile() === "simao" ? "#d49400" : "#041222";
      const wordBrandLight = activeProfile() === "simao" ? "#ffd35d" : "#163d62";
      const wordLine = activeProfile() === "simao" ? "#f6df9f" : "#c7d6e3";
      const styles = `
        body { font-family: Arial, Helvetica, sans-serif; color: #1d2528; }
        .document { width: 100%; }
        .doc-cover, .doc-body, .contract-body { padding: 20px 0; }
        .doc-logo-bar, .doc-footer-bar {
          background-color: ${wordBrand};
          background-image: linear-gradient(112deg, ${wordBrandDark} 0%, ${wordBrand} 43%, ${wordBrandLight} 57%, ${wordBrand} 72%, ${wordBrandDark} 100%);
          color: #fff; text-align: center; padding: 12px;
        }
        .doc-logo-bar img, .doc-footer-bar img { max-width: 100%; height: auto; }
        .doc-hero {
          background-color: ${wordBrand};
          background-image: linear-gradient(112deg, ${wordBrandDark} 0%, ${wordBrand} 40%, ${wordBrandLight} 55%, ${wordBrand} 70%, ${wordBrandDark} 100%);
          color: #fff; padding: 24px;
        }
        .doc-kicker, .doc-label { text-transform: uppercase; color: #5c738c; font-size: 11px; }
        .doc-hero .doc-kicker, .doc-hero .doc-label { color: #eaf4ff; }
        .summary-grid, .task-list, .service-list, .signature-grid { width: 100%; }
        .summary-card, .task-item, .service-box, .contract-clause, .contract-party, .notice {
          border: 1px solid ${wordLine}; padding: 10px; margin: 8px 0; border-radius: 8px;
        }
        table { width: 100%; border-collapse: collapse; margin: 10px 0 16px; }
        td, th { border: 1px solid ${wordLine}; padding: 8px; vertical-align: top; }
        h1, h2, h3, h4 { color: ${wordBrandDark}; }
        .signature-line { border-top: 1px solid #1d2528; padding-top: 8px; margin-top: 50px; text-align: center; }
      `;
      const html = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
          <head>
            <meta charset="utf-8">
            <title>${documentKindLabel(kind)}</title>
            <style>${styles}</style>
          </head>
          <body><div class="document">${contentHtml}</div></body>
        </html>
      `;
      const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${safeFileName(currentHistoryTitle(kind))}.doc`;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        URL.revokeObjectURL(link.href);
        link.remove();
      }, 800);
    }

    $("printDoc").addEventListener("click", async () => {
      const button = $("printDoc");
      if (isPropostaComercialWorkflow()) {
        if (!isPropostaComercialComplete(true)) return;
        button.disabled = true;
        setButtonInteractionState(button, "loading");
        const pdfWindow = window.open("", "_blank");
        currentDoc = "briefing";
        render();
        const contentHtml = $("documentPreview").innerHTML;
        if (pdfWindow) {
          writePdfDocument(pdfWindow, contentHtml);
        } else {
          openPdfDocument(contentHtml);
        }
        try {
          await saveCurrentDocumentToHistory("proposta");
        } catch (error) {
          console.warn("Não foi possível salvar a proposta no histórico antes de gerar o PDF.", error);
        } finally {
          button.disabled = false;
          setButtonInteractionState(button, "idle");
        }
        return;
      }
      button.disabled = true;
      setButtonInteractionState(button, "loading");
      try {
        if (isBriefingAberturaWorkflow()) {
          syncOpeningBriefingToMainFields();
          currentDoc = "briefing";
          document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.doc === "briefing"));
          render();
          await saveCurrentDocumentToHistory();
          openPdfDocument();
          return;
        } else if (currentDoc === "briefing") {
          render();
        }
        if (!ensureEmissionDateForCurrentContract()) return;
        await saveCurrentDocumentToHistory();
        openPdfDocument();
      } finally {
        button.disabled = false;
        setButtonInteractionState(button, "idle");
      }
    });

    $("generateWord").addEventListener("click", async () => {
      if (isPropostaComercialWorkflow() && !isPropostaComercialComplete(true)) return;
      const button = $("generateWord");
      button.disabled = true;
      setButtonInteractionState(button, "loading");
      try {
        await generateWordDocument();
      } finally {
        button.disabled = false;
        setButtonInteractionState(button, "idle");
      }
    });

    $("saveDocument").addEventListener("click", async () => {
      const button = $("saveDocument");
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Salvando...";
      setButtonInteractionState(button, "loading");
      try {
        const saved = await saveFinalDocument();
        if (!saved) {
          button.textContent = originalText;
          button.disabled = false;
          setButtonInteractionState(button, "idle");
          return;
        }
        button.textContent = "Salvo";
        setButtonInteractionState(button, "success");
        alert("Informação salva.");
        setTimeout(() => {
          button.textContent = originalText;
          button.disabled = false;
          setButtonInteractionState(button, "idle");
        }, 1200);
      } catch (error) {
        button.textContent = "Erro ao salvar";
        button.disabled = false;
        setButtonInteractionState(button, "error");
        alert(error.message || "Não foi possível salvar o documento no histórico.");
      }
    });

    $("saveDraft").addEventListener("click", async () => {
      if (!tipoBriefing()) return;
      const button = $("saveDraft");
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Salvando...";
      setButtonInteractionState(button, "loading");
      try {
        currentDoc = "briefing";
        document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.doc === "briefing"));
        render();
        await saveDraftToHistory();
        markDraftPendingFields();
        renderHistory();
        button.textContent = "Rascunho salvo";
        setButtonInteractionState(button, "success");
        alert("Rascunho salvo.");
        setTimeout(() => {
          button.textContent = originalText;
          button.disabled = false;
          setButtonInteractionState(button, "idle");
        }, 1200);
      } catch (error) {
        button.textContent = "Erro ao salvar";
        button.disabled = false;
        setButtonInteractionState(button, "error");
        alert(error.message || "Não foi possível salvar o rascunho.");
      }
    });

    $("logoutButton").addEventListener("click", async () => {
      const session = storedSupabaseSession();
      await autoSaveBeforeInactivityLogout();
      if (session?.access_token) {
        try {
          await supabaseAuthRequest("logout", { method: "POST", accessToken: session.access_token });
        } catch (_error) {
          // A sessão local ainda deve ser encerrada se o servidor estiver indisponível.
        }
      }
      clearSupabaseSession();
      historyCache = [];
      historyLoaded = false;
      setAuthenticated(false);
      if ($("loginUser")) $("loginUser").value = "";
      if ($("loginPassword")) $("loginPassword").value = "";
      if ($("loginError")) $("loginError").textContent = "";
      setTimeout(() => $("loginUser") && $("loginUser").focus(), 80);
    });

    const generateOpeningPdfButton = $("generateOpeningPdf");
    if (generateOpeningPdfButton) generateOpeningPdfButton.addEventListener("click", async () => {
      if (!isBriefingAberturaWorkflow()) return;
      syncOpeningBriefingToMainFields();
      currentDoc = "briefing";
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.doc === "briefing"));
      render();
      await saveCurrentDocumentToHistory("briefing");
      openPdfDocument();
    });

    $("openHistory").addEventListener("click", async () => {
      $("historyModal").hidden = false;
      $("historySearch").focus();
      await loadHistoryFromSupabase();
      renderHistory();
    });

    $("closeHistory").addEventListener("click", () => {
      $("historyModal").hidden = true;
    });

    $("historyModal").addEventListener("click", (event) => {
      if (event.target === $("historyModal")) $("historyModal").hidden = true;
    });

    $("historyTypeFilter").addEventListener("change", () => renderHistory());
    $("historySearch").addEventListener("input", () => renderHistory());

    $("historyList").addEventListener("click", async (event) => {
      const button = event.target.closest("[data-history-action]");
      const item = event.target.closest(".history-item");
      if (!button || !item) return;
      try {
        if (button.dataset.historyAction === "open") await openHistoryDocument(item.dataset.id);
        if (button.dataset.historyAction === "edit") await restoreHistoryDocument(item.dataset.id);
        if (button.dataset.historyAction === "conclude") await restoreHistoryDocument(item.dataset.id, { concludeOpening: true });
        if (button.dataset.historyAction === "delete") openHistoryDeleteConfirm(item.dataset.id);
      } catch (error) {
        renderHistory(error?.message || "Não foi possível concluir a ação no histórico.");
      }
    });

    $("historyDeleteNo")?.addEventListener("click", closeHistoryDeleteConfirm);
    $("historyDeleteYes")?.addEventListener("click", confirmHistoryDelete);
    $("historyDeleteConfirm")?.addEventListener("click", (event) => {
      if (event.target === $("historyDeleteConfirm")) closeHistoryDeleteConfirm();
    });

    function clearBriefing() {
      restoredFinalHistoryMode = false;
      document.querySelectorAll("input").forEach((field) => {
        if (field.type === "checkbox" || field.type === "radio") field.checked = false;
        else field.value = "";
        field.classList.remove("missing", "draft-missing");
      });
      document.querySelectorAll("textarea").forEach((field) => {
        field.value = "";
        field.classList.remove("missing", "draft-missing");
      });
      document.querySelectorAll("select").forEach((field) => {
        field.selectedIndex = 0;
        field.classList.remove("missing", "draft-missing");
      });
      document.querySelectorAll(".step-note").forEach((note) => note.classList.remove("visible"));
      socios.splice(0, socios.length);
      aberturaAdministradores.splice(0, aberturaAdministradores.length);
      usuariosExternos.splice(0, usuariosExternos.length);
      aberturaCompletaLiberada = false;
      openingConclusionMode = false;
      openingConclusionId = "";
      restoredOpeningBriefingCompleted = false;
      currentDocumentSerial = "";
      activeDraftId = "";
      activeHistoryId = "";
      activeHistoryStatus = "";
      renderAberturaAdministradores();
      renderUsuariosExternos();
      renderSocios();
      currentDoc = "briefing";
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.doc === "briefing"));
      document.querySelectorAll(".nav-button").forEach((item) => item.classList.remove("active"));
      document.querySelector('.nav-button[data-jump="tipoBriefingSecao"]').classList.add("active");
      updateFlowState();
      $("tipoBriefingSecao").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    $("clearForm").addEventListener("click", clearBriefing);

    function resetForExample(selectedType) {
      restoredFinalHistoryMode = false;
      document.querySelectorAll("input").forEach((field) => {
        if (field.type === "checkbox" || field.type === "radio") field.checked = false;
        else field.value = "";
        field.classList.remove("missing", "draft-missing");
      });
      document.querySelectorAll("textarea").forEach((field) => {
        field.value = "";
        field.classList.remove("missing", "draft-missing");
      });
      document.querySelectorAll("select").forEach((field) => {
        field.selectedIndex = 0;
        field.classList.remove("missing", "draft-missing");
      });
      document.querySelectorAll(".step-note").forEach((note) => note.classList.remove("visible"));
      socios.splice(0, socios.length);
      aberturaAdministradores.splice(0, aberturaAdministradores.length);
      aberturaCompletaLiberada = false;
      openingConclusionMode = false;
      openingConclusionId = "";
      restoredOpeningBriefingCompleted = false;
      currentDocumentSerial = "";
      activeDraftId = "";
      activeHistoryId = "";
      activeHistoryStatus = "";
      renderAberturaAdministradores();
      renderUsuariosExternos();
      $("tipoBriefing").value = selectedType;
      currentDoc = "briefing";
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.doc === "briefing"));
    }

    function fillBaixaSaidaExample(selectedType) {
      resetForExample(selectedType);
      $("razao").value = selectedType === "PORTABILIDADE DE SAÍDA"
        ? "ELZENI DA SILVA OLIVEIRA SOCIEDADE INDIVIDUAL DE ADVOCACIA"
        : "ELZANI DA SILVA OLIVEIRA SOCIEDADE INDIVIDUAL DE ADVOCACIA";
      $("fantasia").value = selectedType === "PORTABILIDADE DE SAÍDA" ? "ELZENI ADVOCACIA" : "ELZANI ADVOCACIA";
      $("cnpj").value = "48.009.524/0001-70";
      $("endereco").value = "Rua Galaor Rios, n° 280 - Centro";
      $("cep").value = "29.390-000";
      $("municipio").value = "Iúna";
      $("estado").value = "ES";
      $("telefoneEmpresa").value = "(33) 0000-0000";
      $("dataBaixa").value = "2026-05-31";
      $("ultimaCompetenciaBaixa").value = "2026-01";
      $("motivoBaixa").value = "Rescisão/distrato de prestação de serviços contábeis.";
      if (selectedType === "PORTABILIDADE DE SAÍDA") {
        $("grupoSaida").value = "Não informado";
        $("possuiFiliais").value = "Não";
        $("transmissaoDeclaracoes").value = "VERIFICAR COM FINANCEIRO/DIRETORIA";
        $("ultimaCompetenciaOrteconte").value = "2026-01";
        $("honorarioAnterior").value = "R$ 200,00";
        $("motivoSaida").value = "FALTA DE PAGAMENTO";
        $("emailEnvioDocumentacao").value = "ELZENIADVOG@GMAIL.COM";
      }

      $("usuarioExterno").value = "ELZENIADVOG@GMAIL.COM";
      $("govObs").value = "Não informado";
      $("socioQualificacaoObs").value = "Responsável legal para assinatura do distrato.";
      socios.splice(0, socios.length, {
        nome: "Audir Xavier Teixeira",
        cpf: "Não informado",
        participacao: "Responsável legal",
        prolabore: "Não",
        valorProlabore: "Não aplicável",
        nascimento: "1980-01-01",
        email: "ELZENIADVOG@GMAIL.COM",
        telefone: "(33) 0000-0000",
        situacao: "Não informado",
        sexo: "Não informado",
        estadoCivil: "Não informado",
        regimeCasamento: "Não aplicável",
        qualificacao: "Sócio administrador",
        mae: "Não informado",
        titulo: "Não informado"
      });

      $("financeiroValor").value = selectedType === "PORTABILIDADE DE SAÍDA" ? "R$ 1.196,00" : "R$ 0,00";
      $("formaPagamento").value = "Pix";
      $("financeiroHonorario").value = selectedType === "PORTABILIDADE DE SAÍDA" ? "R$ 200,00" : "R$ 0,00";
      $("dataContratoDistrato").value = "2026-05-31";
      $("financeiroCompetencia").value = "2026-05";
      $("financeiroObservacao").value = selectedType === "PORTABILIDADE DE SAÍDA"
        ? "Conforme briefing de saída, verificar inadimplência com financeiro/diretoria."
        : "Distrato gerado conforme encerramento dos serviços contábeis.";
      if (selectedType === "PORTABILIDADE DE SAÍDA") {
        $("honorariosAberto").value = "Sim";
        $("valorHonorariosAberto").value = "R$ 1.196,00";
      }

      renderSocios();
      updateFlowState();
    }

    function fillPessoaFisicaExample(selectedType) {
      resetForExample(selectedType);
      $("tipoPessoa").value = "Pessoa física";
      $("razao").value = "CARLOS HENRIQUE SEGALL";
      $("fantasia").value = "Bio extratus";
      $("cnpj").value = "622.647.888-87";
      $("constituicao").value = "2026-06-01";
      $("inicio").value = "2026-06";
      $("competencia").value = "2026-06";
      $("endereco").value = "Faz Pau Oco, Córrego Luanda, Zona Rural";
      $("cep").value = "Não informado";
      $("municipio").value = "Não informado";
      $("estado").value = "MG";
      $("honorario").value = "R$ 80,00";
      $("financeiroValor").value = "R$ 80,00";
      $("formaPagamento").value = "Pix";
      $("financeiroHonorario").value = "R$ 80,00";
      $("dataContratoDistrato").value = "2026-06-01";
      $("financeiroCompetencia").value = "2026-06";
      $("financeiroObservacao").value = "Honorário acordado para atendimento de pessoa física/doméstica.";
      $("tipoUnidade").value = "Produtiva";
      document.querySelectorAll(".formaAtuacao").forEach((item) => {
        item.checked = item.value === "Atividade desenvolvida fora do estabelecimento (Domicílio Fiscal)";
      });
      $("observacaoInicial").value = "Briefing pessoa física conforme modelo de doméstica.";
      $("usuarioExterno").value = "segallcosmeticos@gamil.com";
      $("govObs").value = "Encaminhar informações nos e-mails cadastrados.";
      $("socioQualificacaoObs").value = "erika.givisiez@segallcosmeticos.com.br - encaminhar nos 2 e-mails";
      socios.splice(0, socios.length, {
        nome: "CARLOS HENRIQUE SEGALL",
        cpf: "622.647.888-87",
        participacao: "Responsável",
        prolabore: "Não aplicável",
        valorProlabore: "Não aplicável",
        nascimento: "1980-01-01",
        email: "segallcosmeticos@gamil.com",
        telefone: "33 9932 3744",
        situacao: "Regular",
        sexo: "Não informado",
        estadoCivil: "Não informado",
        regimeCasamento: "Não aplicável",
        qualificacao: "Responsável pessoa física",
        mae: "Não informado",
        titulo: "Não informado"
      });
      $("regime").value = "MEI";
      $("regimeContabil").value = "Caixa";
      $("retencaoInss").value = "Não realiza";
      $("parcelamentos").value = "Não possui";
      $("licitacoes").value = "Não";
      $("certificado").value = "Verificar e-CPF";
      $("ambientais").value = "Não";
      $("licencas").value = "Não aplicável";
      $("formaNf").value = "Não aplicável";
      $("mudancaTributacao").value = "Não";
      $("apuracao").value = "Mensal";
      $("emprestimos").value = "Não possui";
      $("particularidadesContabeis").value = "Atendimento pessoa física/doméstica.";
      $("funcionarios").value = "Não";
      $("contribuicaoIndividual").value = "Verificar";
      $("compraInter").value = "Não";
      $("vendaInter").value = "Não";
      $("ret").value = "Não participa";
      $("emissaoContabilidade").value = "Não";
      $("servicos").value = "Atendimento e acompanhamento de pessoa física/doméstica.";
      document.querySelectorAll(".task").forEach((item, index) => item.checked = index < 2);
      $("alvara").value = "Não aplicável";
      $("opcaoSimples").value = "Não aplicável";
      $("processos").value = "Conferir acessos e documentos pessoais.";
      $("irSocios").value = "Verificar";
      $("itr").value = "Verificar";
      $("docs").value = "CPF\nDados de contato\nInformações de acesso";
      $("observacoes").value = "Encaminhar nos dois e-mails informados no briefing.";
      ["retencaoInss", "parcelamentos", "licitacoes", "ambientais", "mudancaTributacao", "funcionarios", "compraInter", "vendaInter", "ret", "emissaoContabilidade"].forEach((id) => {
        if ($(id)) $(id).selectedIndex = 0;
      });
      if ($("irSocios")) $("irSocios").selectedIndex = 2;
      if ($("itr")) $("itr").selectedIndex = 2;
      renderSocios();
      updateFlowState();
    }

    function fillOpeningBriefingExample() {
      resetForExample("BRIEFING ABERTURA");
      $("tipoPessoa").value = "Pessoa jurídica";
      $("houveIndicacaoCliente").value = "Sim";
      document.querySelectorAll(".origemIndicacaoCliente").forEach((item) => item.checked = item.value === "Indicação de cliente");
      $("indicacaoCliente").value = "Indicação exemplo";
      $("aberturaValorServico").value = "R$ 1.330,00";
      $("aberturaFormaPagamento").value = "Boleto";
      $("aberturaValorHonorario").value = "R$ 1.330,00";
      $("aberturaDataPagamento").value = "15";
      $("aberturaRazao").value = "ORTECONTE CONTABILIDADE LTDA";
      $("aberturaFantasia").value = "ORTECONTE CONTABILIDADE LTDA";
      $("aberturaFilial").value = "Não";
      $("aberturaGrupo").value = "Sim";
      $("aberturaNomeGrupo").value = "Grupo exemplo";
      $("aberturaTipoJuridico").value = "Sociedade Limitada (LTDA)";
      $("aberturaEnquadramento").value = "ME";
      $("aberturaRegime").value = "Simples Nacional";
      $("aberturaCep").value = "36.900-353";
      $("aberturaRua").value = "Rua Serafim Tibúrcio";
      $("aberturaNumero").value = "120 A";
      $("aberturaComplemento").value = "";
      $("aberturaSemComplemento").checked = true;
      $("aberturaCidade").value = "Manhuaçu";
      $("aberturaEstado").value = "MG";
      $("aberturaCapitalSocial").value = "R$ 10.000,00";
      $("aberturaAreaTotal").value = "120";
      $("aberturaAreaUtilizada").value = "80";
      $("aberturaAtividadePrincipal").value = "Serviços contábeis";
      $("aberturaCnaePrincipal").value = "69.20-6-01";
      $("aberturaCnaesSecundarios").value = "70.20-4-00";
      $("aberturaObjetoSocial").value = "Prestação de serviços de contabilidade, consultoria, assessoria fiscal, contábil e trabalhista.";
      $("aberturaPossuiProlabore").value = "Sim";
      $("aberturaProlabore").value = "R$ 1.412,00";
      $("aberturaContatoEmail").value = "(33) 3331-0000 / atendimento@orteconte.com.br";
      $("aberturaEmailGestta").value = "usuário@orteconte.com.br";
      $("aberturaRepresentanteReceita").value = "Administrador exemplo";
      socios.splice(0, socios.length, {
        tipo: "Pessoa física",
        nome: "Administrador exemplo",
        cpf: "000.000.000-00",
        cnpj: "",
        endereco: "",
        pjResponsavelNome: "",
        pjResponsavelCpf: "",
        participacao: "100%",
        prolabore: "Sim",
        valorProlabore: "R$ 1.412,00",
        nascimento: "1980-01-01",
        email: "administrador@orteconte.com.br",
        telefone: "(33) 3331-0000",
        sexo: "Não informado",
        estadoCivil: "Casado(a)",
        regimeCasamento: "Comunhão parcial de bens",
        qualificacao: "Sócio administrador",
        mae: "",
        titulo: "",
        certificadoDigital: "Sim",
        senhaGov: "Informar acesso GOV"
      });
      $("aberturaSolicitarAlvara").value = "Sim";
      $("aberturaAlvaraEspecifico").value = "Alvará de localização e funcionamento";
      $("aberturaLicitacoes").value = "Não";
      document.querySelectorAll(".aberturaFormaAtuacao").forEach((item) => {
        item.checked = ["Estabelecimento fixo", "Internet"].includes(item.value);
      });
      document.querySelectorAll(".aberturaDocumento").forEach((item) => {
        item.checked = ["Documentos pessoais", "IPTU do endereço comercial", "Contrato de locação ou documento de posse do imóvel", "Comprovante de endereço comercial e residencial"].includes(item.value);
      });
      $("aberturaObservacao").value = "Ficha inicial para abertura. Após geração, editar pelo histórico para complementar sócios, financeiro, informativo, setores, processos e documentos.";
      aberturaAdministradores.splice(0, aberturaAdministradores.length);
      renderAberturaAdministradores();
      renderSocios();
      updateFlowState();
    }

    function fillPropostaComercialExample() {
      resetForExample("PROPOSTA COMERCIAL");
      $("propostaEmpresa").value = "Cliente Exemplo LTDA";
      $("propostaCnpj").value = "00.000.000/0001-00";
      $("propostaContato").value = "Administrador exemplo";
      $("propostaOrigem").value = "Indicação";
      $("propostaFuncionariosFixos").value = "3";
      $("propostaFuncionariosSafristas").value = "0";
      $("propostaFaturamento").value = "R$ 40.000,00 mensais";
      $("propostaTributacao").value = "Simples Nacional";
      $("propostaRamo").value = "Prestação de serviços";
      document.querySelectorAll(".propostaServico").forEach((item) => {
        item.checked = ["fiscal", "pessoal", "contabil", "geral"].includes(item.value);
      });
      $("propostaHonorario").value = "R$ 380,00";
      updateFlowState();
    }

    $("fillExample").addEventListener("click", () => {
      const selectedType = tipoBriefing() || "BRIEFING ABERTURA";
      const selectedPerson = tipoPessoa();
      if (selectedType === "BRIEFING ABERTURA") {
        fillOpeningBriefingExample();
        return;
      }
      if (selectedType === "PROPOSTA COMERCIAL") {
        fillPropostaComercialExample();
        return;
      }
      if (selectedType === "BAIXA DE EMPRESA" || selectedType === "PORTABILIDADE DE SAÍDA") {
        fillBaixaSaidaExample(selectedType);
        return;
      }
      if (selectedPerson.toLowerCase().includes("f")) {
        fillPessoaFisicaExample(selectedType);
        return;
      }
      resetForExample(selectedType);
      $("tipoPessoa").value = "Pessoa jurídica";
      if (isEntradaAberturaWorkflow()) {
        $("houveIndicacaoCliente").value = "Sim";
        document.querySelectorAll(".origemIndicacaoCliente").forEach((item) => item.checked = item.value === "Indicação de cliente");
        $("indicacaoCliente").value = "Indicação exemplo";
      }
      $("razao").value = "ACADEMIA BLACK GYM EVOLUTION LTDA";
      $("fantasia").value = "Black Gym Evolution";
      if (isEntradaAberturaWorkflow()) $("filialCadastro").value = "Não";
      $("cnpj").value = "61.422.810/0001-20";
      $("constituicao").value = "2025-06-24";
      $("inicio").value = "2025-06";
      $("competencia").value = "2025-06";
      $("endereco").value = "AV ALVARO MOREIRA DA SILVA, 239 - CENTRO";
      $("cep").value = "36.974-000";
      $("municipio").value = "Durandé";
      $("estado").value = "MG";
      $("cnaePrincipal").value = "93.13-1-00 - Atividade de condicionamento físico";
      $("cnaesSecundarios").value = "47.29-6-99 - Comércio varejista de produtos alimentícios\n47.63-6-02 - Comércio varejista de artigos esportivos\n77.21-7-00 - Aluguel de equipamentos recreativos e esportivos";
      $("honorario").value = "R$ 380,00 + honorário de encerramento";
      $("financeiroValor").value = "R$ 380,00";
      $("formaPagamento").value = "Boleto";
      $("financeiroHonorario").value = "R$ 380,00";
      $("dataContratoDistrato").value = "2025-06-24";
      if (isPortabilidadeEntradaWorkflow()) $("financeiroDataPagamento").value = "15";
      $("financeiroCompetencia").value = "2025-06";
      $("financeiroObservacao").value = "Dependendo do processo, esse valor pode ser reajustado. Cobrança a partir da competência 06/2025, com vencimento no dia 15.";
      $("capitalSocial").value = "R$ 10.000,00";
      $("tipoUnidade").value = "Produtiva";
      $("areaTotal").value = "120";
      $("areaUtilizada").value = "80";
      document.querySelectorAll(".formaAtuacao").forEach((item) => {
        item.checked = ["Estabelecimento fixo", "Internet"].includes(item.value);
      });
      $("observacaoInicial").value = "Empresa constituída em 24/06/2025 por outro escritório contábil e recentemente migrada para o atendimento.\n\nPor se tratar de uma empresa recém-aberta, até o momento não houve movimentação em nenhum setor. Cada setor deverá verificar os envios iniciais obrigatórios e criar as tarefas associadas ao fluxo, se necessário.\n\nDeverão ser criados os acessos: SIARE, procuração, código de acesso do Simples Nacional, login para emissão de NFS-e e demais credenciamentos. Ainda não foi identificada inscrição estadual ativa.";
      if (selectedType === "ALTERAÇÃO CONTRATUAL") {
        $("observacaoInicial").value = "Alteração contratual solicitada pelo cliente. Verificar os eventos selecionados e documentos anexados antes do protocolo.";
        $("alteracaoSocios").value = "Sim";
        document.querySelectorAll(".alteracaoEvento").forEach((item) => {
          item.checked = ["Alteração de endereço", "QSA", "Alteração de atividades econômicas"].includes(item.value);
        });
        $("alteracaoDetalheEndereco").value = "Atualização do endereço empresarial conforme documentos apresentados.";
        $("alteracaoDetalheQsa").value = "Atualização do quadro societário conforme alteração contratual.";
        $("alteracaoDetalheAtividadesEconomicas").value = "Revisão das atividades econômicas e CNAEs.";
      }
      $("usuarioExterno").value = "academiablackgymevolution@gmail.com";
      $("govObs").value = "Possui verificação em duas etapas";
      $("socioQualificacaoObs").value = "Sócio responsável pela administração e representação da empresa.";
      socios.splice(0, socios.length, {
        nome: "PEDRO HENRIQUE REIS HUEBRA",
        cpf: "100.327.596-65",
        participacao: "100%",
        prolabore: "Ao iniciar movimentação",
        valorProlabore: "Um salário mínimo",
        nascimento: "1999-10-31",
        email: "pedrohenriquegt6@gmail.com",
        telefone: "(33) 99807-0059",
        situacao: "Regular",
        sexo: "Masculino",
        estadoCivil: "Solteiro",
        regimeCasamento: "Não aplicável",
        qualificacao: "Sócio administrador",
        mae: "Renilda Ribeiro dos Reis Huebra",
        titulo: "219493870213"
      });
      $("regime").value = "Simples Nacional";
      $("regimeContabil").value = "Competência";
      $("retencaoInss").value = "Não realiza";
      $("parcelamentos").value = "Não possui";
      $("licitacoes").value = "Não";
      $("certificado").value = "Possui apenas na pessoa física";
      $("ambientais").value = "Não";
      $("licencas").value = "Verificar registro profissional em relação às atividades da empresa";
      $("formaNf").value = "NFS-e Prefeitura de Lajinha-MG, NFC-e";
      $("mudancaTributacao").value = "Não";
      $("apuracao").value = "Mensal";
      $("emprestimos").value = "Não possui";
      $("particularidadesContabeis").value = "Não há";
      $("funcionarios").value = "Não";
      $("quantidadeFuncionarios").value = "";
      $("contribuicaoIndividual").value = "Não possui";
      $("compraInter").value = "Verificar";
      $("vendaInter").value = "Não";
      $("ret").value = "Não participa";
      $("emissaoContabilidade").value = "Não";
      $("alvara").value = "Cliente informou que possui em mãos, mas ainda não enviou";
      $("opcaoSimples").value = "Conferir e solicitar se necessário";
      $("processos").value = "Gerar todas as certidões e verificar possíveis pendências. Credenciar certidão do FGTS, se necessário. Solicitar Inscrição Estadual, senha SIARE e credenciamento para emissão de NFS-e.";
      $("servicos").value = "Rotinas contábeis, fiscais, folha de pagamento, pró-labore, emissão de guias, obrigações acessórias e suporte de implantação.";
      $("irSocios").value = "Sim";
      $("itr").value = "Não possui";
      $("docs").value = "QSA\nCNPJ\nConsulta de optantes\nCNH\nContrato Social\nTítulo Eleitoral";
      $("observacoes").value = "Acompanhar opção pelo Simples Nacional, inscrição estadual e acessos municipais.";
      document.querySelectorAll(".task").forEach((item, index) => item.checked = index < 10);
      renderSocios();
      updateFlowState();
    });

    setupAccountManagement();
    updateFlowState();
  

