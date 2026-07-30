import crypto from "crypto";

const ALL_ENTITIES = ["ent-cpf-1", "ent-cnpj-1", "ent-cnpj-2"];
const ALL_MODULES = ["dashboard", "properties", "people", "contracts", "finance", "reports", "expenses", "profits"];
const COOKIE_NAME = "property_session";
const DEFAULT_SUPABASE_URL = "https://prznhgwiibcazuwlwvnt.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_gQNx5ZW2OTr5J7jNgTQoOg_1n4ffmG4";
const LUCE_EMAIL_DOMAIN = "lucesolutions.com.br";
const LEGACY_EMAIL_DOMAIN = ["axi", "onsolutions.com.br"].join("");
const SUPABASE_USER_PAGE_LIMIT = 100;

const accounts = [
  {
    username: "gerente",
    name: "Gerente",
    role: "admin",
    salt: "luce-property-gerente-v1",
    hash: "99087aa162a1d1a47c6d88d5606a2bee66dc7217fe19b2ce9b66b9fbef570d19",
    allowedEntityIds: ALL_ENTITIES,
    allowedModules: ALL_MODULES
  },
  {
    username: "user",
    name: "User",
    role: "user",
    salt: "luce-property-user-v1",
    hash: "77e4d1425750da9ae127ebd4f10dd65cdd2b9545c8dbcfe295be6ee216a4e9b1",
    allowedEntityIds: ALL_ENTITIES,
    allowedModules: ["dashboard", "properties", "people", "contracts", "finance", "reports"]
  }
];

function uniqueKeys(keys) {
  return keys.filter(Boolean).filter((key, index, all) => all.indexOf(key) === index);
}

function legacyEmailForIdentifier(identifier) {
  const aliases = {
    fernanddo46: `fernanddo46@${LEGACY_EMAIL_DOMAIN}`
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
    `${identifier}@orteconte.com.br`
  ]);
}

function authKeyCandidates(serviceRoleKey) {
  return uniqueKeys([
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    process.env.VITE_SUPABASE_ANON_KEY,
    DEFAULT_SUPABASE_PUBLISHABLE_KEY,
    serviceRoleKey
  ]);
}

function isKeyConfigurationError(error) {
  const payloadText = JSON.stringify(error?.payload || {}).toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return error?.status === 401 && /api key|apikey|jwt|token/.test(`${payloadText} ${message}`);
}

async function supabaseFetch(path, { method = "GET", key, body, bearer } = {}) {
  const supabaseUrl = supabaseUrlFromEnv();
  const result = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: key,
      "content-type": "application/json",
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await result.json().catch(() => ({}));
  if (!result.ok) {
    const error = new Error(data.msg || data.message || data.error_description || "Falha de autenticacao.");
    error.status = result.status;
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
        bearer: serviceRoleKey
      });
      const users = Array.isArray(data?.users) ? data.users : [];
      const match = users.find((user) => {
        const metadata = user.user_metadata || {};
        return [
          metadata.username,
          metadata.display_name,
          metadata.name,
          String(user.email || "").split("@")[0]
        ].map((value) => String(value || "").trim().toLowerCase()).includes(identifier);
      });
      if (match?.email) return match.email;
      if (users.length < SUPABASE_USER_PAGE_LIMIT) break;
    }
  } catch (error) {
    console.warn("Property user lookup failed", error);
  }

  return "";
}

async function signInWithPassword(email, password, keys) {
  let lastError;
  for (const key of keys) {
    try {
      return await supabaseFetch("/auth/v1/token?grant_type=password", {
        method: "POST",
        key,
        body: { email, password }
      });
    } catch (error) {
      lastError = error;
      if (!isKeyConfigurationError(error)) throw error;
    }
  }
  throw lastError || new Error("Falha de autenticacao.");
}

async function signInWithEmailCandidates(emailCandidates, password, keys) {
  let lastError;
  for (const email of emailCandidates) {
    try {
      return await signInWithPassword(email, password, keys);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Falha de autenticacao.");
}

async function approveLegacyUserIfNeeded(user, serviceRoleKey) {
  if (!serviceRoleKey || !user?.id || user.app_metadata?.status) return user;
  const appMetadata = {
    ...(user.app_metadata || {}),
    role: user.app_metadata?.role || "user",
    status: "approved"
  };
  const data = await supabaseFetch(`/auth/v1/admin/users/${user.id}`, {
    method: "PUT",
    key: serviceRoleKey,
    bearer: serviceRoleKey,
    body: { app_metadata: appMetadata }
  });
  return data.user || { ...user, app_metadata: appMetadata };
}

async function supabaseSession(identifier, password) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authKeys = authKeyCandidates(serviceRoleKey);
  if (authKeys.length === 0) return null;

  const email = await findEmailByIdentifier(identifier, serviceRoleKey);
  const emailCandidates = email ? [email] : fallbackEmailCandidates(identifier);
  if (emailCandidates.length === 0) return null;

  const data = await signInWithEmailCandidates(emailCandidates, password, authKeys);
  if (data.user?.app_metadata?.status === "pending") {
    const error = new Error("Conta pendente de aprovacao.");
    error.code = "account_pending";
    throw error;
  }

  data.user = await approveLegacyUserIfNeeded(data.user, serviceRoleKey);
  const role = data.user?.app_metadata?.role === "admin" ? "admin" : "user";
  return {
    name: data.user?.user_metadata?.display_name || data.user?.user_metadata?.username || data.user?.email || (role === "admin" ? "Administrador" : "Usuario"),
    role,
    allowedEntityIds: ALL_ENTITIES,
    allowedModules: role === "admin" ? ALL_MODULES : ["dashboard", "properties", "people", "contracts", "finance", "reports"]
  };
}

function sessionSecret() {
  return process.env.PROPERTY_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || accounts.map((account) => account.hash).join(".");
}

function supabaseUrlFromEnv() {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
}

function signSession(session) {
  const payload = Buffer.from(JSON.stringify({ ...session, exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60 })).toString("base64url");
  const signature = crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function setSessionCookie(response, session) {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  response.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${signSession(session)}; HttpOnly;${secure} SameSite=Lax; Path=/api/property; Max-Age=28800`
  );
}

function verifyPassword(password, account) {
  const candidate = crypto.pbkdf2Sync(String(password ?? ""), account.salt, 150000, 32, "sha256");
  const expected = Buffer.from(account.hash, "hex");
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  if (request.method !== "POST") {
    return response.status(405).json({ message: "Metodo nao permitido." });
  }

  const body = request.body ?? {};

  const username = String(body?.username ?? "").trim().toLowerCase();
  const supabase = await supabaseSession(username, String(body?.password ?? "")).catch((error) => {
    console.error("Property Supabase auth failed", error);
    return null;
  });
  if (supabase) {
    setSessionCookie(response, supabase);
    return response.status(200).json({ session: supabase });
  }

  const account = accounts.find((item) => item.username === username);

  if (!account || !verifyPassword(body?.password, account)) {
    return response.status(401).json({ message: "Usuario ou senha invalidos." });
  }

  const session = {
    name: account.name,
    role: account.role,
    allowedEntityIds: account.allowedEntityIds,
    allowedModules: account.allowedModules
  };
  setSessionCookie(response, session);
  return response.status(200).json({ session });
}
