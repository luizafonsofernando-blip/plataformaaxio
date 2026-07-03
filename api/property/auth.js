import crypto from "crypto";

const ALL_ENTITIES = ["ent-cpf-1", "ent-cnpj-1", "ent-cnpj-2"];
const ALL_MODULES = ["dashboard", "properties", "people", "contracts", "finance", "reports", "expenses", "profits"];
const COOKIE_NAME = "property_session";
const DEFAULT_SUPABASE_URL = "https://prznhgwiibcazuwlwvnt.supabase.co";

const accounts = [
  {
    username: "gerente",
    name: "Gerente",
    role: "admin",
    salt: "axion-property-gerente-v1",
    hash: "99087aa162a1d1a47c6d88d5606a2bee66dc7217fe19b2ce9b66b9fbef570d19",
    allowedEntityIds: ALL_ENTITIES,
    allowedModules: ALL_MODULES
  },
  {
    username: "user",
    name: "User",
    role: "user",
    salt: "axion-property-user-v1",
    hash: "77e4d1425750da9ae127ebd4f10dd65cdd2b9545c8dbcfe295be6ee216a4e9b1",
    allowedEntityIds: ALL_ENTITIES,
    allowedModules: ["dashboard", "properties", "people", "contracts", "finance", "reports"]
  }
];

async function supabaseSession(username, password) {
  const supabaseUrl = supabaseUrlFromEnv();
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!anonKey || !serviceRoleKey) return null;

  let email = username.includes("@") ? username : "";
  if (!email) {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1000`, {
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`
      }
    });
    if (!response.ok) return null;
    const data = await response.json();
    const users = Array.isArray(data?.users) ? data.users : [];
    const match = users.find((user) => {
      const metadata = user.user_metadata || {};
      return [metadata.username, metadata.display_name, metadata.name, user.email?.split("@")[0]]
        .map((value) => String(value || "").trim().toLowerCase())
        .includes(username);
    });
    email = match?.email || "";
  }
  if (!email) return null;

  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "content-type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });
  if (!response.ok) return null;
  const data = await response.json();
  const role = data.user?.app_metadata?.role === "admin" || username === "gerente" ? "admin" : "user";
  return {
    name: data.user?.user_metadata?.display_name || data.user?.user_metadata?.username || (role === "admin" ? "Gerente" : "User"),
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
