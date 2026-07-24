const DEFAULT_SUPABASE_URL = "https://prznhgwiibcazuwlwvnt.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_gQNx5ZW2OTr5J7jNgTQoOg_1n4ffmG4";
const ADMIN_EMAILS = new Set(["admin01@axionsolutions.com.br", "fernanddo46@axionsolutions.com.br"]);

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

async function supabaseFetch(path, { method = "GET", key, bearer, body } = {}) {
  const { url } = supabaseConfig();
  const response = await fetch(`${url}${path}`, {
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
    const error = new Error(data.msg || data.message || data.error_description || data.error || "Falha no Supabase.");
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

function isAdminUser(user) {
  const email = String(user?.email || "").toLowerCase();
  return ADMIN_EMAILS.has(email) && user?.app_metadata?.role === "admin" && user?.app_metadata?.status !== "pending";
}

export default async function handler(request, response) {
  if (!["GET", "POST"].includes(request.method)) return json(response, 405, { error: "Metodo nao permitido." });
  const { publicKey, serviceRoleKey } = supabaseConfig();
  if (!publicKey || !serviceRoleKey) return json(response, 503, { error: "Servico indisponivel." });

  let caller;
  try {
    caller = await callerFromRequest(request, publicKey);
  } catch (_error) {
    return json(response, 401, { error: "Sessao invalida." });
  }
  if (!isAdminUser(caller)) return json(response, 403, { error: "Somente o administrador pode gerenciar usuarios." });

  if (request.method === "GET") {
    const pendingUsers = [];
    const activeUsers = [];
    for (let page = 1; page <= 10; page += 1) {
      const data = await supabaseFetch(`/auth/v1/admin/users?page=${page}&per_page=100`, {
        key: serviceRoleKey,
        bearer: serviceRoleKey,
      });
      const users = Array.isArray(data?.users) ? data.users : [];
      users.forEach((user) => {
        const baseUser = {
          id: user.id,
          email: user.email,
          name: user.user_metadata?.display_name,
          username: user.user_metadata?.username,
          profile: user.user_metadata?.profile,
          created_at: user.created_at,
        };
        if (user.app_metadata?.status === "pending") pendingUsers.push(baseUser);
        else activeUsers.push({ ...baseUser, role: user.app_metadata?.role || "user", canDelete: user.id !== caller.id });
      });
      if (users.length < 100) break;
    }
    activeUsers.sort((a, b) => String(a.email || "").localeCompare(String(b.email || "")));
    pendingUsers.sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
    return json(response, 200, { users: pendingUsers, pendingUsers, activeUsers });
  }

  const userId = String(request.body?.userId || "");
  const action = String(request.body?.action || "");
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !["approve", "reject", "delete"].includes(action)) {
    return json(response, 400, { error: "Solicitacao invalida." });
  }
  if (action === "delete" && userId === caller.id) {
    return json(response, 400, { error: "Nao e possivel excluir o proprio usuario administrador." });
  }
  if (action === "approve") {
    const target = await supabaseFetch(`/auth/v1/admin/users/${userId}`, { key: serviceRoleKey, bearer: serviceRoleKey });
    if (target.user?.app_metadata?.status !== "pending") return json(response, 404, { error: "Solicitacao nao encontrada." });
    await supabaseFetch(`/auth/v1/admin/users/${userId}`, {
      method: "PUT",
      key: serviceRoleKey,
      bearer: serviceRoleKey,
      body: { app_metadata: { ...(target.user.app_metadata || {}), role: "user", status: "approved" } },
    });
    return json(response, 200, { message: "Cadastro aprovado." });
  }
  await supabaseFetch(`/auth/v1/admin/users/${userId}`, { method: "DELETE", key: serviceRoleKey, bearer: serviceRoleKey });
  return json(response, 200, { message: action === "reject" ? "Cadastro rejeitado." : "Usuario excluido." });
}
