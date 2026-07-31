const DEFAULT_ALLOWED_HOSTS = [
  "plataformaaxio.vercel.app",
  "lucesistemas.vercel.app",
  "lucesistemas.com.br",
  "www.lucesistemas.com.br",
  "lucesistemas.com",
  "www.lucesistemas.com",
];

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
  if (/^(plataformaaxio|lucesistemas)(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(hostname)) return true;
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
  response.status(403).json({ error: "Origem nao autorizada." });
  return true;
}

export function rejectLargeRequest(request, response, maxBytes) {
  const contentLength = Number(request.headers["content-length"] || "0");
  if (!Number.isFinite(contentLength) || contentLength <= maxBytes) return false;
  setApiSecurityHeaders(response);
  response.status(413).json({ error: "Solicitacao muito grande." });
  return true;
}
