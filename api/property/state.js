import crypto from "crypto";

const COOKIE_NAME = "property_session";
const DEFAULT_SUPABASE_URL = "https://prznhgwiibcazuwlwvnt.supabase.co";
const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024;

function sessionSecret() {
  return process.env.PROPERTY_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function cookieValue(request, name) {
  const raw = request.headers.cookie || "";
  return raw
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function verifySession(request) {
  const secret = sessionSecret();
  if (!secret) return null;
  const token = cookieValue(request, COOKIE_NAME);
  if (!token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!session.exp || session.exp < Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch (_error) {
    return null;
  }
}

function supabaseHeaders(prefer) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
    ...(prefer ? { prefer } : {})
  };
}

function json(response, status, body) {
  response.setHeader("Cache-Control", "no-store");
  return response.status(status).json(body);
}

function supabaseUrlFromEnv() {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
}

function hasValidPayloadSize(payload) {
  return Buffer.byteLength(JSON.stringify(payload), "utf8") <= MAX_PAYLOAD_BYTES;
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  const supabaseUrl = supabaseUrlFromEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return json(response, 503, { message: "Supabase service role nao configurada para o Property." });
  }

  const session = verifySession(request);
  const entityId = String(request.query?.entityId || request.body?.entityId || "").trim();
  if (!session || !session.allowedEntityIds?.includes(entityId)) {
    return json(response, 401, { message: "Sessao invalida." });
  }

  if (request.method === "GET") {
    const url = `${supabaseUrl}/rest/v1/property_module_state?entity_id=eq.${encodeURIComponent(entityId)}&select=payload`;
    const result = await fetch(url, { headers: supabaseHeaders() });
    if (!result.ok) return json(response, result.status, { message: "Nao foi possivel carregar o estado." });
    const rows = await result.json();
    return json(response, 200, { payload: rows[0]?.payload || null });
  }

  if (request.method === "PUT") {
    const payload = request.body?.payload;
    if (!payload || typeof payload !== "object") return json(response, 400, { message: "Payload invalido." });
    if (!hasValidPayloadSize(payload)) return json(response, 413, { message: "Payload muito grande." });
    const result = await fetch(`${supabaseUrl}/rest/v1/property_module_state`, {
      method: "POST",
      headers: supabaseHeaders("resolution=merge-duplicates"),
      body: JSON.stringify({ entity_id: entityId, payload })
    });
    if (!result.ok) return json(response, result.status, { message: "Nao foi possivel salvar o estado." });
    return json(response, 200, { ok: true });
  }

  return json(response, 405, { message: "Metodo nao permitido." });
}
