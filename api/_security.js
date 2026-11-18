const DEFAULT_ALLOWED_HOSTS = [
  "lucesistemas.vercel.app",
  "lucesistemas.com.br",
  "www.lucesistemas.com.br",
  "lucesistemas.com",
  "www.lucesistemas.com",
  "luce-radar-legislativo.vercel.app",
];
const DEFAULT_SUPABASE_URL = "https://prznhgwiibcazuwlwvnt.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_gQNx5ZW2OTr5J7jNgTQoOg_1n4ffmG4";
const RATE_LIMIT_BUCKETS = globalThis.__luceRateLimitBuckets || new Map();
globalThis.__luceRateLimitBuckets = RATE_LIMIT_BUCKETS;
export const ACCOUNT_SUSPENDED_MESSAGE = "Sistema em manutenção, em caso de dúvidas contate o suporte";

export function rtcBetaReady() {
  if (process.env.VERCEL_ENV === "production") return false;
  if (process.env.RTC_BETA_ENABLED === "0") return false;
  if (!process.env.VERCEL_ENV) return true;
  if (process.env.RTC_BETA_ENABLED !== "1") return false;
  if (process.env.VERCEL_ENV !== "preview") return true;
  try {
    const url = new URL(process.env.SUPABASE_URL || "");
    return url.protocol === "https:"
      && url.hostname.endsWith(".supabase.co")
      && url.hostname !== new URL(DEFAULT_SUPABASE_URL).hostname;
  } catch { return false; }
}

export function isSuspendedUser(user) {
  return String(user?.app_metadata?.status || "").trim().toLowerCase() === "suspended";
}

export async function currentSupabaseUser(request, options = {}) {
  const supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const serviceRoleKey = options.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishableKey = options.publishableKey
    || process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.SUPABASE_ANON_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || DEFAULT_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl) return null;
  if (options.userId) {
    if (!serviceRoleKey) return null;
    const result = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(options.userId)}`, {
      headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` },
      cache: "no-store",
    });
    if (!result.ok) return null;
    const data = await result.json().catch(() => ({}));
    return data.user || data;
  }
  const authorization = String(request?.headers?.authorization || "");
  if (!authorization.startsWith("Bearer ")) return null;
  const result = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: publishableKey, authorization },
    cache: "no-store",
  });
  return result.ok ? result.json() : null;
}

function legacyModuleForUser(user) {
  const profile = String(user?.user_metadata?.profile || "").trim().toLowerCase();
  if (["orteconte", "simao", "onboarding"].includes(profile)) return "onboarding";
  if (profile === "comunica-facil") return "comunicados";
  if (profile === "radar-sindical") return "radar-legislativo";
  return profile;
}

export async function requireActiveModuleUser(request, response, moduleId) {
  if (moduleId === "reforma-tributaria" && !rtcBetaReady()) {
    setApiSecurityHeaders(response);
    response.status(503).json({ code: "module_disabled", error: "Módulo Beta temporariamente indisponível." });
    return null;
  }
  const user = await currentSupabaseUser(request);
  if (!user) {
    setApiSecurityHeaders(response);
    response.status(401).json({ code: "invalid_session", error: "Sessão inválida." });
    return null;
  }
  if (isSuspendedUser(user)) {
    setApiSecurityHeaders(response);
    response.status(403).json({ code: "account_suspended", error: ACCOUNT_SUSPENDED_MESSAGE });
    return null;
  }
  const status = String(user?.app_metadata?.status || "approved").trim().toLowerCase();
  if (["pending", "rejected"].includes(status)) {
    setApiSecurityHeaders(response);
    response.status(403).json({ code: "account_pending", error: "Acesso não autorizado." });
    return null;
  }
  const role = user?.app_metadata?.role === "admin" ? "admin" : "user";
  const modules = Array.isArray(user?.app_metadata?.allowed_modules)
    ? user.app_metadata.allowed_modules.map((value) => String(value || "").trim().toLowerCase())
    : [];
  if (role !== "admin" && !modules.includes(moduleId) && legacyModuleForUser(user) !== moduleId) {
    setApiSecurityHeaders(response);
    response.status(403).json({ code: "module_forbidden", error: "Acesso não autorizado a este módulo." });
    return null;
  }
  if (moduleId === "reforma-tributaria" && process.env.VERCEL_ENV === "preview") {
    const allowedAdmins = String(process.env.RTC_BETA_ADMIN_IDS || "").split(",").map((id) => id.trim().toLowerCase()).filter(Boolean);
    if (role !== "admin" || !allowedAdmins.includes(String(user.id || "").toLowerCase())) {
      setApiSecurityHeaders(response);
      response.status(403).json({ code: "module_forbidden", error: "Acesso Beta restrito a administradores autorizados." });
      return null;
    }
  }
  return user;
}

function configuredAllowedHosts() {
  const extraHosts = String(process.env.ALLOWED_ORIGIN_HOSTS || process.env.ALLOWED_HOSTS || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ALLOWED_HOSTS, ...extraHosts])];
}

export function setApiSecurityHeaders(response) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Robots-Tag", "noindex, nofollow, nosnippet");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("X-DNS-Prefetch-Control", "off");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
}

export function isAllowedOrigin(origin = "", allowedHosts = configuredAllowedHosts()) {
  if (!origin) return true;
  let url;
  try {
    url = new URL(origin);
  } catch (_error) {
    return false;
  }
  if (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)) return true;
  if (url.protocol !== "https:") return false;
  const hostname = url.hostname.toLowerCase();
  if (allowedHosts.includes(hostname)) return true;
  if (/^lucesistemas(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(hostname)) return true;
  return /\.lucesistemas\.com\.br$/i.test(hostname) || /\.lucesistemas\.com$/i.test(hostname);
}

export function rejectDisallowedOrigin(request, response, allowedHosts) {
  const origin = String(request.headers.origin || "");
  const host = String(request.headers.host || "").toLowerCase();
  if (origin && host) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.hostname.toLowerCase() === host.split(":")[0]) return false;
    } catch (_error) {
      // Fall through to the static allowlist.
    }
  }
  if (!origin && host && isAllowedOrigin(`https://${host.split(":")[0]}`, allowedHosts)) return false;
  if (isAllowedOrigin(origin, allowedHosts)) return false;
  setApiSecurityHeaders(response);
  response.status(403).json({ error: "Origem não autorizada." });
  return true;
}

export function rejectLargeRequest(request, response, maxBytes) {
  const contentLength = Number(request.headers["content-length"] || "0");
  if (!Number.isFinite(contentLength) || contentLength <= maxBytes) return false;
  setApiSecurityHeaders(response);
  response.status(413).json({ error: "Solicitação muito grande." });
  return true;
}

function rateLimitEnabled() {
  return !/^(0|false|off|disabled)$/i.test(String(process.env.LUCE_RATE_LIMIT_ENABLED || "true").trim());
}

function rateLimitOverride(action, fallbackLimit, fallbackWindowSeconds) {
  const envKey = `LUCE_RATE_LIMIT_${String(action || "api").toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
  const raw = String(process.env[envKey] || "").trim();
  if (!raw) return { limit: fallbackLimit, windowSeconds: fallbackWindowSeconds };
  const [limitText, windowText] = raw.split(/[:/,]/).map((part) => part.trim());
  const limit = Number(limitText);
  const windowSeconds = Number(windowText || fallbackWindowSeconds);
  return {
    limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : fallbackLimit,
    windowSeconds: Number.isFinite(windowSeconds) && windowSeconds > 0 ? Math.floor(windowSeconds) : fallbackWindowSeconds,
  };
}

function pruneRateLimitBuckets(now) {
  if (RATE_LIMIT_BUCKETS.size < 5000) return;
  for (const [key, bucket] of RATE_LIMIT_BUCKETS.entries()) {
    if (!bucket || bucket.resetAt <= now) RATE_LIMIT_BUCKETS.delete(key);
  }
}

export async function rejectRateLimited(request, response, options = {}) {
  if (!rateLimitEnabled()) return false;
  const action = String(options.action || "api");
  const fallbackLimit = Number(options.limit || 600);
  const fallbackWindowSeconds = Number(options.windowSeconds || 60);
  const { limit, windowSeconds } = rateLimitOverride(action, fallbackLimit, fallbackWindowSeconds);
  const now = Date.now();
  const ipHash = await clientIpHash(request);
  const keyParts = Array.isArray(options.keyParts) ? options.keyParts : [];
  const bucketKey = [action, ipHash || "unknown", request.method || "GET", ...keyParts].join(":");
  const current = RATE_LIMIT_BUCKETS.get(bucketKey);
  const bucket = current && current.resetAt > now
    ? current
    : { count: 0, resetAt: now + windowSeconds * 1000 };
  bucket.count += 1;
  RATE_LIMIT_BUCKETS.set(bucketKey, bucket);
  pruneRateLimitBuckets(now);

  const remaining = Math.max(0, limit - bucket.count);
  response.setHeader("X-RateLimit-Limit", String(limit));
  response.setHeader("X-RateLimit-Remaining", String(remaining));
  response.setHeader("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

  if (bucket.count <= limit) return false;
  setApiSecurityHeaders(response);
  response.setHeader("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
  response.status(429).json({ error: "Muitas solicitações em curto período. Aguarde alguns instantes e tente novamente." });
  return true;
}

export function clientAddress(request) {
  const forwardedFor = String(request.headers["x-forwarded-for"] || "")
    .split(",")
    .map((part) => part.trim())
    .find(Boolean);
  return String(
    request.headers["cf-connecting-ip"] ||
      request.headers["x-real-ip"] ||
      request.headers["x-vercel-forwarded-for"] ||
      forwardedFor ||
      "unknown",
  ).trim();
}

export function clientUserAgent(request, max = 300) {
  return String(request.headers["user-agent"] || "").trim().slice(0, max) || null;
}

export async function sha256(value) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(String(value)).digest("hex");
}

export async function clientIpHash(request) {
  const address = clientAddress(request);
  if (!address || address === "unknown") return null;
  const salt = process.env.AUDIT_HASH_SALT || process.env.SUPABASE_JWT_SECRET || "";
  return sha256(`${salt}:${address}`);
}

export function requestAuditMetadata(request, extra = {}) {
  return {
    ...extra,
    user_agent: clientUserAgent(request),
    origin: String(request.headers.origin || "").slice(0, 200) || null,
    host: String(request.headers.host || "").slice(0, 120) || null,
  };
}
