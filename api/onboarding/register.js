import { clientAddress, clientIpHash, rejectDisallowedOrigin, requestAuditMetadata, setApiSecurityHeaders, sha256 } from "../_security.js";

const DEFAULT_SUPABASE_URL = "https://prznhgwiibcazuwlwvnt.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_gQNx5ZW2OTr5J7jNgTQoOg_1n4ffmG4";
const DEFAULT_APP_URL = "https://lucesistemas.vercel.app";
const SUPABASE_USER_PAGE_LIMIT = 100;
const MAX_BODY_BYTES = 10_000;

function json(response, status, body) {
  setApiSecurityHeaders(response);
  response.status(status);
  return response.json(body);
}

function normalizeUsername(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function safeError(error) {
  return error instanceof Error ? error?.message : "Não foi possível solicitar o cadastro.";
}

async function supabaseFetch(path, { method = "GET", body, serviceRoleKey, supabaseUrl, preferMinimal = method === "POST" } = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      ...(preferMinimal ? { prefer: "return=minimal" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.msg || data.message || data.error_description || data.error || "Falha no Supabase.");
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

async function supabasePublicFetch(path, { method = "POST", body, publicKey, supabaseUrl } = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: publicKey,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.msg || data.message || data.error_description || data.error || "Falha no Supabase.");
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

function registrationProfile(inputProfile) {
  const profile = String(inputProfile || "").trim().toLowerCase();
  return ["orteconte", "simao", "property", "ebef"].includes(profile) ? profile : "orteconte";
}

function profileToModule(profile) {
  return ["property", "ebef"].includes(profile) ? profile : "onboarding";
}

function appRedirectUrl(request, profile = "orteconte") {
  const origin = String(request.headers.origin || "").replace(/\/+$/, "");
  const configured = process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || DEFAULT_APP_URL;
  const baseUrl = origin || configured;
  const normalized = /^https?:\/\//i.test(baseUrl) ? baseUrl : `https://${baseUrl}`;
  const pathByProfile = {
    property: "/property/",
    ebef: "/ebef/",
    orteconte: "/app/",
    simao: "/app/",
  };
  return `${normalized.replace(/\/+$/, "")}${pathByProfile[profile] || "/app/"}`;
}

async function findDuplicateUser({ email, usernameKey, serviceRoleKey, supabaseUrl }) {
  for (let page = 1; page <= 10; page += 1) {
    const data = await supabaseFetch(`/auth/v1/admin/users?page=${page}&per_page=${SUPABASE_USER_PAGE_LIMIT}`, {
      serviceRoleKey,
      supabaseUrl,
    });
    const users = Array.isArray(data.users) ? data.users : [];
    const duplicate = users.some((user) => {
      const userEmail = String(user?.email || "").trim().toLowerCase();
      const userName = normalizeUsername(user?.user_metadata.username).toLowerCase();
      return userEmail === email || userName === usernameKey;
    });
    if (duplicate) return true;
    if (users.length < SUPABASE_USER_PAGE_LIMIT) break;
  }
  return false;
}

async function auditRegistration({ username, profile, serviceRoleKey, supabaseUrl, request }) {
  try {
    await supabaseFetch("/rest/v1/security_audit_log", {
      method: "POST",
      serviceRoleKey,
      supabaseUrl,
      body: {
        event_type: "registration_requested",
        ip_hash: await clientIpHash(request),
        metadata: requestAuditMetadata(request, { username, profile }),
      },
    });
  } catch (error) {
    console.warn("Onboarding registration audit failed", safeError(error));
  }
}

async function auditConfirmationResend({ email, profile, eventType, serviceRoleKey, supabaseUrl, request }) {
  try {
    await supabaseFetch("/rest/v1/security_audit_log", {
      method: "POST",
      serviceRoleKey,
      supabaseUrl,
      body: {
        event_type: eventType,
        ip_hash: await clientIpHash(request),
        metadata: requestAuditMetadata(request, { email_hash: await sha256(email), profile }),
      },
    });
  } catch (error) {
    console.warn("Onboarding confirmation resend audit failed", safeError(error));
  }
}

async function checkRateLimit({ key, action, limit, windowSeconds, serviceRoleKey, supabaseUrl }) {
  try {
    const data = await supabaseFetch("/rest/v1/rpc/check_auth_rate_limit", {
      method: "POST",
      serviceRoleKey,
      supabaseUrl,
      preferMinimal: false,
      body: {
        p_key_hash: key,
        p_action: action,
        p_limit: limit,
        p_window_seconds: windowSeconds,
      },
    });
    return data === true;
  } catch (error) {
    console.warn("Onboarding registration rate-limit check failed", safeError(error));
    return true;
  }
}

function resendMessageFor(error) {
  const status = Number(error?.status || 0);
  const payloadText = JSON.stringify(error?.payload || {}).toLowerCase();
  if (status === 429 || /rate|limit|too many/.test(payloadText)) {
    return "Limite de envio atingido. Aguarde alguns minutos antes de reenviar.";
  }
  return "Se o e-mail estiver cadastrado e ainda não confirmado, um novo link será enviado.";
}
async function auditRateLimited({ action, metadata, serviceRoleKey, supabaseUrl, request }) {
  try {
    await supabaseFetch("/rest/v1/security_audit_log", {
      method: "POST",
      serviceRoleKey,
      supabaseUrl,
      body: {
        event_type: `${action}_rate_limited`,
        ip_hash: await clientIpHash(request),
        metadata: requestAuditMetadata(request, metadata),
      },
    });
  } catch (error) {
    console.warn("Onboarding rate-limit audit failed", safeError(error));
  }
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return json(response, 405, { error: "Método não permitido." });
  }
  if (rejectDisallowedOrigin(request, response)) return;

  const contentLength = Number(request.headers["content-length"] || "0");
  if (contentLength > MAX_BODY_BYTES) {
    return json(response, 413, { error: "Solicitação muito grande." });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const publicKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    DEFAULT_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !publicKey || !serviceRoleKey) {
    return json(response, 503, { error: "Servi\u00e7o de cadastro indispon\u00edvel." });
  }

  const input = request.body && typeof request.body === "object" ? request.body : {};
  const name = String(input.name || "").trim();
  const username = normalizeUsername(input.username);
  const usernameKey = username.toLowerCase();
  const email = String(input.email || "").trim().toLowerCase();
  const password = String(input.password || "");
  const profile = registrationProfile(input.profile);
  const action = String(input.action || "").trim().toLowerCase();
  const address = clientAddress(request);
  const ipHash = await sha256(address);
  const emailHash = await sha256(email || "empty-email");

  if (action === "resend_confirmation") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(response, 400, { error: "E-mail inválido." });
    const ipAllowed = await checkRateLimit({
      key: ipHash,
      action: "confirmation_resend_ip",
      limit: 20,
      windowSeconds: 3600,
      serviceRoleKey,
      supabaseUrl,
    });
    const emailAllowed = await checkRateLimit({
      key: emailHash,
      action: "confirmation_resend_email",
      limit: 4,
      windowSeconds: 3600,
      serviceRoleKey,
      supabaseUrl,
    });
    if (!ipAllowed || !emailAllowed) {
      await auditConfirmationResend({
        email,
        profile,
        eventType: "confirmation_resend_rate_limited",
        serviceRoleKey,
        supabaseUrl,
        request,
      });
      return json(response, 429, { error: "Limite de envio atingido. Aguarde alguns minutos antes de reenviar." });
    }
    try {
      await supabasePublicFetch("/auth/v1/resend", {
        method: "POST",
        publicKey,
        supabaseUrl,
        body: {
          type: "signup",
          email,
          options: { email_redirect_to: appRedirectUrl(request, profile) },
        },
      });
      await auditConfirmationResend({
        email,
        profile,
        eventType: "confirmation_resent",
        serviceRoleKey,
        supabaseUrl,
        request,
      });
      return json(response, 200, { message: "Link de confirmação reenviado. Verifique sua caixa de entrada e spam." });
    } catch (error) {
      console.warn("Onboarding confirmation resend failed", safeError(error), error?.payload || "");
      await auditConfirmationResend({
        email,
        profile,
        eventType: "confirmation_resend_failed",
        serviceRoleKey,
        supabaseUrl,
        request,
      });
      return json(response, Number(error.status) === 429 ? 429 : 200, { message: resendMessageFor(error) });
    }
  }

  if (name.length < 2 || name.length > 80) return json(response, 400, { error: "Nome inválido." });
  if (!/^[\p{L}\p{N}._ -]{3,60}$/u.test(username)) return json(response, 400, { error: "Usuário inválido." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(response, 400, { error: "E-mail inválido." });
  if (password.length < 6 || password.length > 20) {
    return json(response, 400, { error: "A senha deve conter entre 6 e 20 caracteres." });
  }

  try {
    const ipAllowed = await checkRateLimit({
      key: ipHash,
      action: "registration_ip",
      limit: 30,
      windowSeconds: 3600,
      serviceRoleKey,
      supabaseUrl,
    });
    const emailAllowed = await checkRateLimit({
      key: emailHash,
      action: "registration_email",
      limit: 5,
      windowSeconds: 86400,
      serviceRoleKey,
      supabaseUrl,
    });
    if (!ipAllowed || !emailAllowed) {
      await auditRateLimited({
        action: "registration",
        metadata: { username, profile, scope: ipAllowed ? "email" : "ip" },
        serviceRoleKey,
        supabaseUrl,
        request,
      });
      return json(response, 429, { error: "Muitas tentativas. Tente novamente mais tarde." });
    }

    const duplicate = await findDuplicateUser({ email, usernameKey, serviceRoleKey, supabaseUrl });
    if (duplicate) return json(response, 409, { error: "E-mail ou usuário já cadastrado." });

    const signupData = await supabasePublicFetch(`/auth/v1/signup?redirect_to=${encodeURIComponent(appRedirectUrl(request, profile))}`, {
      method: "POST",
      publicKey,
      supabaseUrl,
      body: {
        email,
        password,
        data: { display_name: name, username, profile, registration_requested_at: new Date().toISOString() },
      },
    });
    const createdUser = signupData.user || signupData;
    if (!createdUser?.id) {
      throw new Error("N\u00e3o foi poss\u00edvel criar o usu\u00e1rio no Supabase.");
    }

    try {
      await supabaseFetch(`/auth/v1/admin/users/${createdUser.id}`, {
        method: "PUT",
        serviceRoleKey,
        supabaseUrl,
        preferMinimal: false,
        body: {
          user_metadata: {
            ...(createdUser.user_metadata || {}),
            display_name: name,
            username,
            profile,
            registration_requested_at: new Date().toISOString(),
          },
          app_metadata: {
            ...(createdUser.app_metadata || {}),
            role: "user",
            status: "approved",
            allowed_modules: [profileToModule(profile)],
          },
        },
      });
    } catch (metadataError) {
      await supabaseFetch(`/auth/v1/admin/users/${createdUser.id}`, {
        method: "DELETE",
        serviceRoleKey,
        supabaseUrl,
      }).catch(() => null);
      throw metadataError;
    }
    await auditRegistration({ username, profile, serviceRoleKey, supabaseUrl, request });
    return json(response, 201, { message: "Cadastro realizado. Confirme seu e-mail para liberar o acesso ao sistema." });
  } catch (error) {
    console.error("Onboarding registration failed", error);
    return json(response, Number(error.status) || 500, {
      error: Number(error.status) === 422 ? "E-mail ou usuário já cadastrado." : "Não foi possível solicitar o cadastro.",
    });
  }
}
