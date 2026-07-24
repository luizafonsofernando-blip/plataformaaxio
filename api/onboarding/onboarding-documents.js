const DEFAULT_SUPABASE_URL = "https://prznhgwiibcazuwlwvnt.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_gQNx5ZW2OTr5J7jNgTQoOg_1n4ffmG4";

function json(response, status, body) {
  response.status(status).setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  return response.json(body);
}

function supabaseConfig() {
  return {
    url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL,
    publicKey:
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      DEFAULT_SUPABASE_PUBLISHABLE_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

function cleanText(value, max = 5000) {
  return String(value || "").slice(0, max);
}

function cleanNullable(value, max = 5000) {
  const text = cleanText(value, max).trim();
  return text || null;
}

function cleanObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function supabaseFetch(path, { method = "GET", key, bearer, body, prefer } = {}) {
  const { url } = supabaseConfig();
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      apikey: key,
      "content-type": "application/json",
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      ...(prefer ? { prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.msg || data?.message || data?.error_description || data?.error || "Falha no Supabase.");
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

async function callerFromRequest(request, publicKey) {
  const authorization = String(request.headers.authorization || "");
  if (!authorization.startsWith("Bearer ")) return null;
  return supabaseFetch("/auth/v1/user", {
    key: publicKey,
    bearer: authorization.replace(/^Bearer\s+/i, ""),
  });
}

function isAdmin(user) {
  return user?.app_metadata?.role === "admin" && user?.app_metadata?.status !== "pending";
}

export default async function handler(request, response) {
  if (!["GET", "POST", "DELETE"].includes(request.method)) return json(response, 405, { error: "Metodo nao permitido." });
  const { publicKey, serviceRoleKey } = supabaseConfig();
  if (!publicKey || !serviceRoleKey) return json(response, 503, { error: "Servico indisponivel." });

  let caller;
  try {
    caller = await callerFromRequest(request, publicKey);
  } catch (_error) {
    return json(response, 401, { error: "Sessao invalida." });
  }
  if (!caller || caller.app_metadata?.status === "pending") return json(response, 403, { error: "Sessao invalida ou usuario nao aprovado." });

  if (request.method === "GET") {
    const ownerFilter = isAdmin(caller) ? "" : `&owner_id=eq.${encodeURIComponent(caller.id)}`;
    const rows = await supabaseFetch(
      `/rest/v1/onboarding_documents?select=*&order=updated_at.desc&limit=200${ownerFilter}`,
      { key: serviceRoleKey, bearer: serviceRoleKey },
    );
    return json(response, 200, rows || []);
  }

  if (request.method === "DELETE") {
    if (!isAdmin(caller)) return json(response, 403, { error: "Somente o administrador pode excluir documentos." });
    const id = cleanText(request.body?.id, 80).trim();
    if (!/^[a-z0-9._:-]{8,80}$/i.test(id)) return json(response, 400, { error: "Documento invalido." });
    await supabaseFetch(`/rest/v1/onboarding_documents?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      key: serviceRoleKey,
      bearer: serviceRoleKey,
    });
    return json(response, 200, { message: "Documento excluido." });
  }

  const input = request.body || {};
  const id = cleanText(input.id, 80).trim();
  if (!/^[a-z0-9._:-]{8,80}$/i.test(id)) return json(response, 400, { error: "Documento invalido." });
  const existingRows = await supabaseFetch(`/rest/v1/onboarding_documents?select=id,owner_id&id=eq.${encodeURIComponent(id)}&limit=1`, {
    key: serviceRoleKey,
    bearer: serviceRoleKey,
  });
  const existing = Array.isArray(existingRows) ? existingRows[0] : null;
  if (existing && existing.owner_id !== caller.id && !isAdmin(caller)) return json(response, 403, { error: "Documento nao pertence ao usuario." });
  const now = new Date().toISOString();
  const row = {
    id,
    owner_id: existing?.owner_id || caller.id,
    serial: cleanText(input.serial, 80),
    emitente: cleanText(input.emitente, 120),
    kind: cleanText(input.kind, 40),
    status: cleanText(input.status, 40) === "rascunho" ? "rascunho" : "final",
    title: cleanText(input.title, 200),
    empresa: cleanNullable(input.empresa, 200),
    documento: cleanNullable(input.documento, 120),
    procedimento: cleanNullable(input.procedimento, 120),
    created_at: cleanText(input.created_at, 40) || now,
    updated_at: now,
    form_state: cleanObject(input.form_state),
    html: cleanText(input.html, 900000),
  };
  const saved = await supabaseFetch("/rest/v1/onboarding_documents?on_conflict=id", {
    method: "POST",
    key: serviceRoleKey,
    bearer: serviceRoleKey,
    prefer: "resolution=merge-duplicates,return=representation",
    body: row,
  });
  return json(response, 200, saved || []);
}
