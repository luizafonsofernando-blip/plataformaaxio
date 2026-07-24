const DEFAULT_SUPABASE_URL = "https://prznhgwiibcazuwlwvnt.supabase.co";
const SUPABASE_USER_PAGE_LIMIT = 100;
const MAX_BODY_BYTES = 10_000;

async function sha256(value) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(value).digest("hex");
}

function json(response, status, body) {
  response.status(status).setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  return response.json(body);
}

function isAllowedOrigin(origin = "") {
  if (!origin) return true;
  return /^https:\/\/plataformaaxio(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

function normalizeUsername(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function safeError(error) {
  return error instanceof Error ? error.message : "Nao foi possivel solicitar o cadastro.";
}

function clientAddress(request) {
  return String(
    request.headers["cf-connecting-ip"] ||
      request.headers["x-real-ip"] ||
      request.headers["x-forwarded-for"]?.split(",")[0] ||
      "unknown",
  ).trim();
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

async function findDuplicateUser({ email, usernameKey, serviceRoleKey, supabaseUrl }) {
  for (let page = 1; page <= 10; page += 1) {
    const data = await supabaseFetch(`/auth/v1/admin/users?page=${page}&per_page=${SUPABASE_USER_PAGE_LIMIT}`, {
      serviceRoleKey,
      supabaseUrl,
    });
    const users = Array.isArray(data?.users) ? data.users : [];
    const duplicate = users.some((user) => {
      const userEmail = String(user.email || "").trim().toLowerCase();
      const userName = normalizeUsername(user.user_metadata?.username).toLowerCase();
      return userEmail === email || userName === usernameKey;
    });
    if (duplicate) return true;
    if (users.length < SUPABASE_USER_PAGE_LIMIT) break;
  }
  return false;
}

async function auditRegistration({ username, profile, serviceRoleKey, supabaseUrl, request }) {
  try {
    const address = clientAddress(request);
    const ipHash = address === "unknown" ? null : await sha256(address);
    await supabaseFetch("/rest/v1/security_audit_log", {
      method: "POST",
      serviceRoleKey,
      supabaseUrl,
      body: {
        event_type: "registration_requested",
        ip_hash: ipHash,
        metadata: { username, profile },
      },
    });
  } catch (error) {
    console.warn("Onboarding registration audit failed", safeError(error));
  }
}

async function checkRateLimit({ key, action, limit, windowSeconds, serviceRoleKey, supabaseUrl }) {
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
}

async function auditRateLimited({ action, metadata, serviceRoleKey, supabaseUrl, request }) {
  try {
    const address = clientAddress(request);
    const ipHash = address === "unknown" ? null : await sha256(address);
    await supabaseFetch("/rest/v1/security_audit_log", {
      method: "POST",
      serviceRoleKey,
      supabaseUrl,
      body: {
        event_type: `${action}_rate_limited`,
        ip_hash: ipHash,
        metadata,
      },
    });
  } catch (error) {
    console.warn("Onboarding rate-limit audit failed", safeError(error));
  }
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return json(response, 405, { error: "Metodo nao permitido." });
  }
  if (!isAllowedOrigin(String(request.headers.origin || ""))) {
    return json(response, 403, { error: "Origem nao autorizada." });
  }

  const contentLength = Number(request.headers["content-length"] || "0");
  if (contentLength > MAX_BODY_BYTES) {
    return json(response, 413, { error: "Solicitacao muito grande." });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return json(response, 503, { error: "Servico de cadastro indisponivel." });
  }

  const input = request.body && typeof request.body === "object" ? request.body : {};
  const name = String(input.name || "").trim();
  const username = normalizeUsername(input.username);
  const usernameKey = username.toLowerCase();
  const email = String(input.email || "").trim().toLowerCase();
  const password = String(input.password || "");
  const profile = "orteconte";
  const address = clientAddress(request);
  const ipHash = await sha256(address);
  const emailHash = await sha256(email || "empty-email");

  if (name.length < 2 || name.length > 80) return json(response, 400, { error: "Nome invalido." });
  if (!/^[\p{L}\p{N}._ -]{3,60}$/u.test(username)) return json(response, 400, { error: "Usuario invalido." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(response, 400, { error: "E-mail invalido." });
  if (!/^\d{6}$/.test(password)) {
    return json(response, 400, { error: "A senha deve conter exatamente 6 digitos numericos." });
  }

  try {
    const ipAllowed = await checkRateLimit({
      key: ipHash,
      action: "registration_ip",
      limit: 3,
      windowSeconds: 3600,
      serviceRoleKey,
      supabaseUrl,
    });
    const emailAllowed = await checkRateLimit({
      key: emailHash,
      action: "registration_email",
      limit: 2,
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
    if (duplicate) return json(response, 409, { error: "E-mail ou usuario ja cadastrado." });

    await supabaseFetch("/auth/v1/admin/users", {
      method: "POST",
      serviceRoleKey,
      supabaseUrl,
      body: {
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: name, username, profile },
        app_metadata: { role: "user", status: "pending" },
      },
    });
    await auditRegistration({ username, profile, serviceRoleKey, supabaseUrl, request });
    return json(response, 201, { message: "Solicitacao enviada." });
  } catch (error) {
    console.error("Onboarding registration failed", error);
    return json(response, Number(error.status) || 500, {
      error: Number(error.status) === 422 ? "E-mail ou usuario ja cadastrado." : "Nao foi possivel solicitar o cadastro.",
    });
  }
}
