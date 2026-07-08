const DEFAULT_SUPABASE_URL = "https://prznhgwiibcazuwlwvnt.supabase.co";
const SUPABASE_USER_PAGE_LIMIT = 100;
const MAX_BODY_BYTES = 2_000;

function json(response, status, body) {
  response.status(status).setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  return response.json(body);
}

async function sha256(value) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(value).digest("hex");
}

function isAllowedOrigin(origin = "") {
  if (!origin) return true;
  return /^https:\/\/plataformaaxio(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

async function supabaseFetch(path, { method = "GET", body, serviceRoleKey, supabaseUrl }) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.msg || data.message || data.error || "Falha no Supabase.");
    error.status = response.status;
    throw error;
  }
  return data;
}

async function findUserByEmail(email, serviceRoleKey, supabaseUrl) {
  for (let page = 1; page <= 10; page += 1) {
    const data = await supabaseFetch(`/auth/v1/admin/users?page=${page}&per_page=${SUPABASE_USER_PAGE_LIMIT}`, {
      serviceRoleKey,
      supabaseUrl,
    });
    const users = Array.isArray(data?.users) ? data.users : [];
    const match = users.find((user) => String(user.email || "").toLowerCase() === email);
    if (match) return match;
    if (users.length < SUPABASE_USER_PAGE_LIMIT) break;
  }
  return null;
}

export default async function handler(request, response) {
  if (request.method !== "POST") return json(response, 405, { error: "Metodo nao permitido." });
  if (!isAllowedOrigin(String(request.headers.origin || ""))) {
    return json(response, 403, { error: "Origem nao autorizada." });
  }
  if (Number(request.headers["content-length"] || "0") > MAX_BODY_BYTES) {
    return json(response, 413, { error: "Solicitacao muito grande." });
  }
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return json(response, 503, { error: "Servico indisponivel." });

  const email = String(request.body?.email || "").trim().toLowerCase();
  const code = String(request.body?.code || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code)) {
    return json(response, 400, { error: "Codigo de ativacao invalido." });
  }

  const user = await findUserByEmail(email, serviceRoleKey, supabaseUrl);
  if (!user) return json(response, 404, { error: "Cadastro nao encontrado." });
  if (user.app_metadata?.status !== "activation_pending") return json(response, 400, { error: "Cadastro ja ativado ou aguardando revisao." });

  const expected = String(user.user_metadata?.activation_hash || "");
  const expiresAt = Date.parse(String(user.user_metadata?.activation_expires_at || ""));
  const actual = await sha256(`${email}:${code}`);
  if (!expected || expected !== actual || !expiresAt || expiresAt < Date.now()) {
    return json(response, 400, { error: "Codigo incorreto ou expirado." });
  }

  const metadata = { ...(user.user_metadata || {}) };
  delete metadata.activation_hash;
  delete metadata.activation_expires_at;
  await supabaseFetch(`/auth/v1/admin/users/${user.id}`, {
    method: "PUT",
    serviceRoleKey,
    supabaseUrl,
    body: {
      user_metadata: metadata,
      app_metadata: { ...(user.app_metadata || {}), role: "user", status: "approved" },
    },
  });
  return json(response, 200, { message: "Conta ativada com sucesso." });
}
