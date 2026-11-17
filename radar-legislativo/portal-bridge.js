(() => {
  "use strict";

  const RADAR_ORIGIN = "https://luce-radar-legislativo.vercel.app";
  const SESSION_KEYS = [
    "luce-auth-onboarding-contabil",
    "luce-auth-property",
    "onboardContabilSupabaseSession",
  ];

  function readSession() {
    for (const key of SESSION_KEYS) {
      try {
        const stored = JSON.parse(sessionStorage.getItem(key) || "null");
        const session = stored?.profile?.access_token ? stored.profile : stored;
        if (session?.access_token && session?.refresh_token) return session;
      } catch (_error) {
        // Ignore invalid legacy entries and continue with the next known key.
      }
    }
    return null;
  }

  const session = readSession();
  if (session) {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = `${RADAR_ORIGIN}/api/auth/handoff`;
    form.hidden = true;
    const fields = {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
    };
    Object.entries(fields).forEach(([name, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.append(input);
    });
    document.body.append(form);
    form.submit();
    return;
  }

  const status = document.getElementById("bridgeStatus");
  if (status) status.textContent = "Sua sessão do Portal não foi encontrada. Redirecionando para o acesso unificado.";
  window.location.replace(`${RADAR_ORIGIN}/auth?source=portal`);
})();
