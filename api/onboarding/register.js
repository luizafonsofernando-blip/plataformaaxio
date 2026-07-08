import { sendMail, mailConfigured } from "./mail.js";

const DEFAULT_SUPABASE_URL = "https://prznhgwiibcazuwlwvnt.supabase.co";
const SUPABASE_USER_PAGE_LIMIT = 100;
const MAX_BODY_BYTES = 10_000;

async function sha256(value) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(value).digest("hex");
}

function activationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

async function supabaseFetch(path, { method = "GET", body, serviceRoleKey, supabaseUrl }) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      ...(method === "POST" ? { prefer: "return=minimal" } : {}),
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
  const clientAddress =
    request.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    request.headers["x-real-ip"] ||
    "unknown";
  try {
    const ipHash = clientAddress === "unknown" ? null : await sha256(clientAddress);
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
  if (!mailConfigured()) {
    return json(response, 503, {
      error: "Envio de e-mail nao configurado. Configure RESEND_API_KEY e MAIL_FROM na Vercel.",
      code: "mail_not_configured",
    });
  }

  const input = request.body && typeof request.body === "object" ? request.body : {};
  const name = String(input.name || "").trim();
  const username = normalizeUsername(input.username);
  const usernameKey = username.toLowerCase();
  const email = String(input.email || "").trim().toLowerCase();
  const password = String(input.password || "");
  const profile = "orteconte";

  if (name.length < 2 || name.length > 80) return json(response, 400, { error: "Nome invalido." });
  if (!/^[\p{L}\p{N}._ -]{3,60}$/u.test(username)) return json(response, 400, { error: "Usuario invalido." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(response, 400, { error: "E-mail invalido." });
  if (!/^\d{6}$/.test(password)) {
    return json(response, 400, { error: "A senha deve conter exatamente 6 digitos numericos." });
  }

  try {
    const duplicate = await findDuplicateUser({ email, usernameKey, serviceRoleKey, supabaseUrl });
    if (duplicate) return json(response, 409, { error: "E-mail ou usuario ja cadastrado." });
    const code = activationCode();
    const activation_hash = await sha256(`${email}:${code}`);
    const activation_expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    await sendMail({
      to: email,
      subject: "Codigo de ativacao - Onboarding Contabil",
      html: `<p>Ola, ${escapeHtml(name)}.</p><p>Seu codigo de ativacao do Onboarding Contabil e:</p><h2>${code}</h2><p>O codigo expira em 30 minutos.</p>`,
    });

    await supabaseFetch("/auth/v1/admin/users", {
      method: "POST",
      serviceRoleKey,
      supabaseUrl,
      body: {
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: name, username, profile, activation_hash, activation_expires_at },
        app_metadata: { role: "user", status: "activation_pending" },
      },
    });
    await auditRegistration({ username, profile, serviceRoleKey, supabaseUrl, request });
    return json(response, 201, {
      message: "Codigo de ativacao enviado ao e-mail cadastrado.",
      requiresActivation: true,
      mailConfigured: true,
    });
  } catch (error) {
    console.error("Onboarding registration failed", error);
    return json(response, Number(error.status) || 500, {
      error: Number(error.status) === 422 ? "E-mail ou usuario ja cadastrado." : "Nao foi possivel solicitar o cadastro.",
    });
  }
}
