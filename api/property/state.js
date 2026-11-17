import crypto from "crypto";
import { ACCOUNT_SUSPENDED_MESSAGE, currentSupabaseUser, isSuspendedUser, rejectDisallowedOrigin, rejectLargeRequest, rejectRateLimited, setApiSecurityHeaders } from "../_security.js";

const COOKIE_NAME = "property_session";
const DEFAULT_SUPABASE_URL = "https://prznhgwiibcazuwlwvnt.supabase.co";
const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024;

function sessionSecret() {
  return process.env.PROPERTY_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function cookieValue(request, name) {
  const raw = request.headers.cookie || "";
  const match = raw
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : "";
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
  setApiSecurityHeaders(response);
  return response.status(status).json(body);
}

async function verifyBearerSession(request, supabaseUrl, serviceRoleKey) {
  const authorization = String(request.headers.authorization || "");
  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  if (!token) return null;
  const result = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${token}`
    }
  });
  if (!result.ok) return null;
  const user = await result.json();
  const role = user?.app_metadata?.role === "admin" ? "admin" : "user";
  const explicitModules = Array.isArray(user?.app_metadata?.allowed_modules) ? user.app_metadata.allowed_modules : [];
  const allowedModules = explicitModules.map((module) => String(module || "").trim().toLowerCase());
  const legacyModule = String(user?.user_metadata?.profile || "").trim().toLowerCase() === "property" ? "property" : "";
  if (role !== "admin" && !allowedModules.includes("property") && legacyModule !== "property") return null;
  return {
    userId: user?.id || null,
    allowedEntityIds: role === "admin"
      ? ["ent-cpf-1", "ent-cnpj-1", "ent-cnpj-2"]
      : ["ent-cnpj-1", "ent-cnpj-2"]
  };
}

function supabaseUrlFromEnv() {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
}

function hasValidPayloadSize(payload) {
  return Buffer.byteLength(JSON.stringify(payload), "utf8") <= MAX_PAYLOAD_BYTES;
}

async function fetchPropertyState(supabaseUrl, entityId) {
  const url = `${supabaseUrl}/rest/v1/property_module_state?entity_id=eq.${encodeURIComponent(entityId)}&select=payload,updated_at`;
  const result = await fetch(url, { headers: supabaseHeaders() });
  if (!result.ok) return { ok: false, status: result.status, rows: [] };
  const rows = await result.json();
  return { ok: true, status: 200, rows };
}

async function writeAudit(supabaseUrl, { entityId, userId, operation, previousUpdatedAt, nextUpdatedAt, request }) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/property_module_audit`, {
      method: "POST",
      headers: supabaseHeaders(),
      body: JSON.stringify({
        entity_id: entityId,
        user_id: userId || null,
        operation,
        previous_updated_at: previousUpdatedAt || null,
        next_updated_at: nextUpdatedAt || null,
        user_agent: String(request.headers["user-agent"] || "").slice(0, 300) || null,
        origin: String(request.headers.origin || "").slice(0, 200) || null
      })
    });
  } catch (_error) {
    // Auditoria é complementar; a falha não deve impedir a gravação principal.
  }
}

export default async function handler(request, response) {
  setApiSecurityHeaders(response);
  if (rejectDisallowedOrigin(request, response)) return;
  if (rejectLargeRequest(request, response, MAX_PAYLOAD_BYTES + 20_000)) return;
  if (await rejectRateLimited(request, response, { action: "property_state", limit: 300, windowSeconds: 60 })) return;

  const supabaseUrl = supabaseUrlFromEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return json(response, 503, { message: "Supabase service role não configurada para o Property." });
  }

  const session = verifySession(request) || await verifyBearerSession(request, supabaseUrl, serviceRoleKey);
  const currentUser = session ? await currentSupabaseUser(request, { supabaseUrl, serviceRoleKey, userId: session.userId }) : null;
  if (isSuspendedUser(currentUser)) return json(response, 403, { code: "account_suspended", message: ACCOUNT_SUSPENDED_MESSAGE });
  const entityId = String(request.query?.entityId || request.body?.entityId || "").trim();
  if (!session || !session.allowedEntityIds?.includes(entityId)) {
    return json(response, 401, { message: "Sessão inválida." });
  }

  if (request.method === "GET") {
    const result = await fetchPropertyState(supabaseUrl, entityId);
    if (!result.ok) return json(response, result.status, { message: "Não foi possível carregar o estado." });
    return json(response, 200, { payload: result.rows[0]?.payload || null, updatedAt: result.rows[0]?.updated_at || "" });
  }

  if (request.method === "PUT") {
    const payload = request.body.payload;
    const knownUpdatedAt = String(request.body.knownUpdatedAt || "").trim();
    const forceBootstrap = request.body.forceBootstrap === true;
    if (!payload || typeof payload !== "object") return json(response, 400, { message: "Payload inválido." });
    if (!hasValidPayloadSize(payload)) return json(response, 413, { message: "Payload muito grande." });
    const current = await fetchPropertyState(supabaseUrl, entityId);
    if (!current.ok) return json(response, current.status, { message: "Não foi possível validar a versão atual do estado." });
    const currentRow = current.rows[0] || null;
    const currentUpdatedAt = currentRow?.updated_at || "";
    if (currentRow && knownUpdatedAt && currentUpdatedAt !== knownUpdatedAt) {
      return json(response, 409, {
        message: "Os dados foram alterados por outro usuário. Atualize a tela e tente novamente.",
        payload: currentRow.payload || null,
        updatedAt: currentUpdatedAt
      });
    }
    if (currentRow && !knownUpdatedAt && !forceBootstrap) {
      return json(response, 409, {
        message: "Versão local sem confirmação do banco. Atualize a tela antes de salvar.",
        payload: currentRow.payload || null,
        updatedAt: currentUpdatedAt
      });
    }
    const nextUpdatedAt = new Date().toISOString();
    const result = await fetch(`${supabaseUrl}/rest/v1/property_module_state`, {
      method: "POST",
      headers: supabaseHeaders("resolution=merge-duplicates,return=representation"),
      body: JSON.stringify({ entity_id: entityId, updated_by: session.userId || null, updated_at: nextUpdatedAt, payload })
    });
    if (!result.ok) return json(response, result.status, { message: "Não foi possível salvar o estado." });
    const rows = await result.json().catch(() => []);
    const savedUpdatedAt = rows[0]?.updated_at || nextUpdatedAt;
    await writeAudit(supabaseUrl, {
      entityId,
      userId: session.userId,
      operation: currentRow ? "update_state" : "create_state",
      previousUpdatedAt: currentUpdatedAt,
      nextUpdatedAt: savedUpdatedAt,
      request
    });
    return json(response, 200, { ok: true, updatedAt: savedUpdatedAt });
  }

  return json(response, 405, { message: "Método não permitido." });
}
