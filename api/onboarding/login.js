import { ACCOUNT_SUSPENDED_MESSAGE, clientIpHash, isSuspendedUser, rejectDisallowedOrigin, rejectLargeRequest, rejectRateLimited, requestAuditMetadata, requireActiveModuleUser, setApiSecurityHeaders, sha256 } from "../_security.js";

const SUPABASE_USER_PAGE_LIMIT = 100;
const DEFAULT_SUPABASE_URL = "https://prznhgwiibcazuwlwvnt.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_gQNx5ZW2OTr5J7jNgTQoOg_1n4ffmG4";
const LUCE_EMAIL_DOMAIN = "lucesolutions.com.br";
const LEGACY_EMAIL_DOMAIN = ["axi", "onsolutions.com.br"].join("");
const VALID_MODULE_IDS = new Set(["onboarding", "property", "comunicados", "review-folha", "radar-legislativo", "contratos", "ebef", "luce-sign", "reforma-tributaria"]);
const MAX_BODY_BYTES = 4_000;

function json(response, status, body) {
  setApiSecurityHeaders(response);
  response.status(status);
  return response.json(body);
}

async function auditLogin({ request, serviceRoleKey, eventType, identifier, user, metadata = {} }) {
  if (!serviceRoleKey) return;
  try {
    await supabaseFetch("/rest/v1/security_audit_log", {
      method: "POST",
      key: serviceRoleKey,
      bearer: serviceRoleKey,
      body: {
        actor_id: user?.id || null,
        event_type: eventType,
        target_id: user?.id || null,
        ip_hash: await clientIpHash(request),
        metadata: requestAuditMetadata(request, {
          identifier_hash: identifier ? await sha256(String(identifier).toLowerCase()) : null,
          user_email: user?.email || null,
          ...metadata,
        }),
      },
    });
  } catch (error) {
    console.warn("Onboarding login audit failed", error);
  }
}

function legacyEmailForIdentifier(identifier) {
  const aliases = {
    admin01: "luizafonsofernando@gmail.com",
    fernanddo46: `fernanddo46@${LEGACY_EMAIL_DOMAIN}`,
  };
  return aliases[identifier] || "";
}

function fallbackEmailCandidates(identifier) {
  const directEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier) ? identifier : "";
  const legacyEmail = legacyEmailForIdentifier(identifier);
  if (directEmail) return [directEmail];
  return uniqueKeys([
    legacyEmail,
    `${identifier}@${LUCE_EMAIL_DOMAIN}`,
    `${identifier}@${LEGACY_EMAIL_DOMAIN}`,
    `${identifier}@orteconte.com.br`,
  ]);
}

function uniqueKeys(keys) {
  return keys.filter(Boolean).filter((key, index, all) => all.indexOf(key) === index);
}

function authKeyCandidates(serviceRoleKey) {
  return uniqueKeys([
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    process.env.VITE_SUPABASE_ANON_KEY,
    DEFAULT_SUPABASE_PUBLISHABLE_KEY,
    serviceRoleKey,
  ]);
}

function isKeyConfigurationError(error) {
  const payloadText = JSON.stringify(error.payload || {}).toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return error.status === 401 && /api key|apikey|jwt|token/.test(`${payloadText} ${message}`);
}

async function supabaseFetch(path, { method = "GET", key, body, bearer } = {}) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: key,
      "content-type": "application/json",
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.msg || data.message || data.error_description || "Falha de autenticação.");
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

async function findEmailByIdentifier(identifier, serviceRoleKey) {
  const directEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier) ? identifier : legacyEmailForIdentifier(identifier);
  if (directEmail) return directEmail;
  if (!serviceRoleKey) return "";

  try {
    for (let page = 1; page <= 10; page += 1) {
      const data = await supabaseFetch(`/auth/v1/admin/users?page=${page}&per_page=${SUPABASE_USER_PAGE_LIMIT}`, {
        key: serviceRoleKey,
        bearer: serviceRoleKey,
      });
      const users = Array.isArray(data.users) ? data.users : [];
      const match = users.find((user) => {
        const metadata = user?.user_metadata || {};
        const aliases = [
          metadata.username,
          metadata.display_name,
          metadata.name,
          String(user?.email || "").split("@")[0],
        ];
        return aliases.map((value) => String(value || "").trim().toLowerCase()).includes(identifier);
      });
      if (match?.email) return match.email;
      if (users.length < SUPABASE_USER_PAGE_LIMIT) break;
    }
  } catch (error) {
    console.warn("Onboarding user lookup failed", error);
  }

  return "";
}

async function findUserByIdentifier(identifier, serviceRoleKey) {
  if (!serviceRoleKey) return null;
  for (let page = 1; page <= 10; page += 1) {
    const data = await supabaseFetch(`/auth/v1/admin/users?page=${page}&per_page=${SUPABASE_USER_PAGE_LIMIT}`, {
      key: serviceRoleKey,
      bearer: serviceRoleKey,
    });
    const users = Array.isArray(data.users) ? data.users : [];
    const match = users.find((user) => {
      const metadata = user?.user_metadata || {};
      const aliases = [metadata.username, metadata.display_name, metadata.name, user?.email, String(user?.email || "").split("@")[0]];
      return aliases.map((value) => String(value || "").trim().toLowerCase()).includes(identifier);
    });
    if (match) return match;
    if (users.length < SUPABASE_USER_PAGE_LIMIT) break;
  }
  return null;
}

async function signInWithPassword(email, password, keys) {
  let lastError;
  for (const key of keys) {
    try {
      return await supabaseFetch("/auth/v1/token?grant_type=password", {
        method: "POST",
        key,
        body: { email, password },
      });
    } catch (error) {
      lastError = error;
      if (!isKeyConfigurationError(error)) throw error;
    }
  }
  throw lastError || new Error("Falha de autenticação.");
}

async function signInWithEmailCandidates(emailCandidates, password, keys) {
  let lastError;
  for (const email of emailCandidates) {
    try {
      return await signInWithPassword(email, password, keys);
    } catch (error) {
      lastError = error;
      const payloadText = JSON.stringify(error.payload || {}).toLowerCase();
      if (error.status === 400 && /confirm|confirmed|email_not_confirmed/.test(payloadText)) throw error;
    }
  }
  throw lastError || new Error("Falha de autenticação.");
}

async function checkRateLimit({ key, action, limit, windowSeconds, serviceRoleKey }) {
  if (!serviceRoleKey || !key) return true;
  try {
    return (
      (await supabaseFetch("/rest/v1/rpc/check_auth_rate_limit", {
        method: "POST",
        key: serviceRoleKey,
        bearer: serviceRoleKey,
        body: {
          p_key_hash: key,
          p_action: action,
          p_limit: limit,
          p_window_seconds: windowSeconds,
        },
      })) === true
    );
  } catch (error) {
    console.warn("Onboarding login rate-limit check failed", error);
    return true;
  }
}

async function approveLegacyUserIfNeeded(user, serviceRoleKey) {
  if (!serviceRoleKey || !user?.id || user?.app_metadata.status) return user;
  const appMetadata = {
    ...(user.app_metadata || {}),
    role: user?.app_metadata?.role || "user",
    status: "approved",
  };
  const data = await supabaseFetch(`/auth/v1/admin/users/${user?.id}`, {
    method: "PUT",
    key: serviceRoleKey,
    bearer: serviceRoleKey,
    body: { app_metadata: appMetadata },
  });
  return data.user || { ...user, app_metadata: appMetadata };
}

function isConfirmedUser(user) {
  return Boolean(user?.confirmed_at || user?.email_confirmed_at);
}

function requestedProfile(value) {
  const profile = String(value || "").trim().toLowerCase();
  if (profile === "orteconte" || profile === "simao" || profile === "onboarding") return "onboarding";
  if (profile === "comunica-facil") return "comunicados";
  return VALID_MODULE_IDS.has(profile) ? profile : "";
}

function profileToModule(profile) {
  const normalized = String(profile || "").trim().toLowerCase();
  if (normalized === "property") return "property";
  if (normalized === "cerne") return "cerne";
  if (normalized === "sentinela") return "sentinela";
  if (normalized === "contratos") return "contratos";
  if (normalized === "radar-legislativo" || normalized === "radar-sindical") return "radar-legislativo";
  if (normalized === "comunicados" || normalized === "comunica-facil") return "comunicados";
  if (normalized === "review-folha") return "review-folha";
  return "onboarding";
}

function allowedModulesForUser(user) {
  if (user?.app_metadata?.role === "admin") return [...VALID_MODULE_IDS];
  const explicit = Array.isArray(user?.app_metadata?.allowed_modules) ? user.app_metadata.allowed_modules : [];
  const clean = explicit.map((module) => String(module || "").trim().toLowerCase()).filter((module) => VALID_MODULE_IDS.has(module));
  return clean.length ? [...new Set(clean)] : [profileToModule(user?.user_metadata?.profile)];
}

function legacyProfileForModule(moduleId) {
  if (moduleId === "property" || moduleId === "radar-legislativo" || moduleId === "contratos") return moduleId;
  return "orteconte";
}

async function applyRequestedProfileIfNeeded(user, serviceRoleKey, moduleId) {
  if (!serviceRoleKey || !user?.id || !moduleId) return user;
  if (moduleId === "luce-sign" || moduleId === "reforma-tributaria") return user;
  const targetProfile = legacyProfileForModule(moduleId);
  if (user?.user_metadata?.profile === targetProfile) return user;
  const userMetadata = {
    ...(user.user_metadata || {}),
    profile: targetProfile,
  };
  const data = await supabaseFetch(`/auth/v1/admin/users/${user.id}`, {
    method: "PUT",
    key: serviceRoleKey,
    bearer: serviceRoleKey,
    body: { user_metadata: userMetadata },
  });
  return data.user || { ...user, user_metadata: userMetadata };
}

function ensureModuleAccess(user, moduleId) {
  if (!moduleId) return;
  if (!allowedModulesForUser(user).includes(moduleId)) {
    const error = new Error("Módulo não autorizado.");
    error.code = "module_forbidden";
    error.status = 403;
    throw error;
  }
}

async function approveConfirmedPendingUserIfNeeded(user, serviceRoleKey) {
  if (!serviceRoleKey || !user?.id || user?.app_metadata?.status !== "pending" || !isConfirmedUser(user)) return user;
  const appMetadata = {
    ...(user.app_metadata || {}),
    role: user?.app_metadata?.role || "user",
    status: "approved",
    auto_approved_at: new Date().toISOString(),
  };
  const data = await supabaseFetch(`/auth/v1/admin/users/${user.id}`, {
    method: "PUT",
    key: serviceRoleKey,
    bearer: serviceRoleKey,
    body: { app_metadata: appMetadata },
  });
  return data.user || { ...user, app_metadata: appMetadata };
}

export default async function handler(request, response) {
  if (rejectDisallowedOrigin(request, response)) return;

  if (request.method === "GET") {
    if (await rejectRateLimited(request, response, { action: "contratos_session", limit: 120, windowSeconds: 60 })) return;
    const user = await requireActiveModuleUser(request, response, "contratos");
    if (!user) return;
    return json(response, 200, {
      user: {
        id: user.id,
        email: user.email || "",
        displayName: user.user_metadata?.display_name || user.user_metadata?.name || user.user_metadata?.username || "Usuário",
        role: user.app_metadata?.role === "admin" ? "admin" : "user",
      },
    });
  }

  if (rejectLargeRequest(request, response, MAX_BODY_BYTES)) return;

  if (request.method !== "POST") {
    return json(response, 405, { code: "invalid_credentials" });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authKeys = authKeyCandidates(serviceRoleKey);
  if (!supabaseUrl || authKeys.length === 0) {
    return json(response, 503, { code: "service_unavailable" });
  }

  const identifier = String(request.body?.identifier || "").trim().toLowerCase();
  const password = String(request.body?.password || "");
  const targetProfile = requestedProfile(request.body?.profile);
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
  const isAlias = /^[\p{L}\p{N} ._-]{3,80}$/u.test(identifier);
  if ((!isEmail && !isAlias) || !password || password.length > 128) {
    return json(response, 401, { code: "invalid_credentials" });
  }

  try {
    const identifierHash = await sha256(identifier);
    const ipHash = await clientIpHash(request);
    const ipAllowed = await checkRateLimit({
      key: ipHash,
      action: "login_ip",
      limit: 60,
      windowSeconds: 3600,
      serviceRoleKey,
    });
    const identifierAllowed = await checkRateLimit({
      key: identifierHash,
      action: "login_identifier",
      limit: 20,
      windowSeconds: 900,
      serviceRoleKey,
    });
    if (!ipAllowed || !identifierAllowed) {
      await auditLogin({
        request,
        serviceRoleKey,
        eventType: "login_rate_limited",
        identifier,
        metadata: { scope: ipAllowed ? "identifier" : "ip" },
      });
      return json(response, 429, { code: "too_many_attempts" });
    }

    const identifiedUser = await findUserByIdentifier(identifier, serviceRoleKey);
    if (isSuspendedUser(identifiedUser)) {
      await auditLogin({ request, serviceRoleKey, eventType: "login_blocked_suspended", identifier, user: identifiedUser });
      return json(response, 403, { code: "account_suspended", message: ACCOUNT_SUSPENDED_MESSAGE });
    }
    const email = await findEmailByIdentifier(identifier, serviceRoleKey);
    const emailCandidates = email ? [email] : fallbackEmailCandidates(identifier);
    if (emailCandidates.length === 0) return json(response, 401, { code: "invalid_credentials" });

    const session = await signInWithEmailCandidates(emailCandidates, password, authKeys);

    session.user = await approveConfirmedPendingUserIfNeeded(session.user, serviceRoleKey);
    if (isSuspendedUser(session.user)) {
      await supabaseFetch("/auth/v1/logout?scope=global", { method: "POST", key: authKeys[0], bearer: session.access_token }).catch(() => null);
      return json(response, 403, { code: "account_suspended", message: ACCOUNT_SUSPENDED_MESSAGE });
    }

    if (session.user?.app_metadata.status === "pending") {
      await auditLogin({ request, serviceRoleKey, eventType: "login_pending_account", identifier, user: session.user });
      return json(response, 403, { code: "account_pending" });
    }

    session.user = await approveLegacyUserIfNeeded(session.user, serviceRoleKey);
    ensureModuleAccess(session.user, targetProfile);
    session.user = await applyRequestedProfileIfNeeded(session.user, serviceRoleKey, targetProfile);
    await auditLogin({ request, serviceRoleKey, eventType: "login_success", identifier, user: session.user });
    return json(response, 200, session);
  } catch (error) {
    console.error("Onboarding login failed", error);
    const payloadText = JSON.stringify(error.payload || {}).toLowerCase();
    await auditLogin({
      request,
      serviceRoleKey,
      eventType: "login_failed",
      identifier,
      metadata: { status: Number(error.status) || null },
    });
    if (Number(error.status) === 400 && /confirm|confirmed|email_not_confirmed/.test(payloadText)) {
      return json(response, 403, { code: "email_not_confirmed" });
    }
    if (error.code === "module_forbidden") return json(response, 403, { code: "module_forbidden" });
    return json(response, 401, { code: "invalid_credentials" });
  }
}
