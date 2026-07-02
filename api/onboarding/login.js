const SUPABASE_USER_PAGE_LIMIT = 100;
const DEFAULT_SUPABASE_URL = "https://prznhgwiibcazuwlwvnt.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_gQNx5ZW2OTr5J7jNgTQoOg_1n4ffmG4";

function json(response, status, body) {
  response.status(status).setHeader("Cache-Control", "no-store");
  return response.json(body);
}

function legacyEmailForIdentifier(identifier) {
  const aliases = {
    fernanddo46: "fernanddo46@axionsolutions.com.br",
  };
  return aliases[identifier] || "";
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
    const error = new Error(data.msg || data.message || data.error_description || "Falha de autenticacao.");
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

  for (let page = 1; page <= 10; page += 1) {
    const data = await supabaseFetch(`/auth/v1/admin/users?page=${page}&per_page=${SUPABASE_USER_PAGE_LIMIT}`, {
      key: serviceRoleKey,
      bearer: serviceRoleKey,
    });
    const users = Array.isArray(data?.users) ? data.users : [];
    const match = users.find((user) => {
      const metadata = user.user_metadata || {};
      const aliases = [
        metadata.username,
        metadata.display_name,
        metadata.name,
        String(user.email || "").split("@")[0],
      ];
      return aliases.map((value) => String(value || "").trim().toLowerCase()).includes(identifier);
    });
    if (match?.email) return match.email;
    if (users.length < SUPABASE_USER_PAGE_LIMIT) break;
  }

  return "";
}

async function approveLegacyUserIfNeeded(user, serviceRoleKey) {
  if (!serviceRoleKey || !user?.id || user.app_metadata?.status) return user;
  const appMetadata = {
    ...(user.app_metadata || {}),
    role: user.app_metadata?.role || "user",
    status: "approved",
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
  if (request.method !== "POST") {
    return json(response, 405, { code: "invalid_credentials" });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    DEFAULT_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey) {
    return json(response, 503, { code: "service_unavailable" });
  }

  const identifier = String(request.body?.identifier || "").trim().toLowerCase();
  const password = String(request.body?.password || "");
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
  const isAlias = /^[\p{L}\p{N} ._-]{3,80}$/u.test(identifier);
  if ((!isEmail && !isAlias) || !password || password.length > 128) {
    return json(response, 401, { code: "invalid_credentials" });
  }

  try {
    const email = await findEmailByIdentifier(identifier, serviceRoleKey);
    if (!email) return json(response, 401, { code: "invalid_credentials" });

    const session = await supabaseFetch("/auth/v1/token?grant_type=password", {
      method: "POST",
      key: anonKey,
      body: { email, password },
    });

    if (session.user?.app_metadata?.status === "pending") {
      return json(response, 403, { code: "account_pending" });
    }

    session.user = await approveLegacyUserIfNeeded(session.user, serviceRoleKey);
    return json(response, 200, session);
  } catch (error) {
    console.error("Onboarding login failed", error);
    return json(response, 401, { code: "invalid_credentials" });
  }
}
