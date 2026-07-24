const DEFAULT_SUPABASE_URL = "https://prznhgwiibcazuwlwvnt.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_gQNx5ZW2OTr5J7jNgTQoOg_1n4ffmG4";
const ADMIN_EMAILS = new Set(["admin01@axionsolutions.com.br", "fernanddo46@axionsolutions.com.br"]);
const PENDING_CLEANUP_CUTOFF = new Date("2026-07-25T03:00:00.000Z");

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

function userStatus(user) {
  return String(user?.app_metadata?.status || "").trim().toLowerCase();
}

function isPendingUser(user) {
  return userStatus(user) === "pending";
}

function isRejectedUser(user) {
  return userStatus(user) === "rejected";
}

function isCleanupPendingUser(user) {
  if (!isPendingUser(user)) return false;
  const requestedAt = user.user_metadata?.registration_requested_at || user.created_at;
  const date = new Date(requestedAt || 0);
  return !Number.isNaN(date.getTime()) && date <= PENDING_CLEANUP_CUTOFF;
}

function isLegacyActiveUser(user) {
  return !userStatus(user);
}

function displayName(user) {
  return user.user_metadata?.display_name || user.user_metadata?.name || String(user.email || "").split("@")[0] || "";
}

function normalizeLookup(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function slugifyName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 50);
}

async function listAllUsers(serviceRoleKey) {
  const users = [];
  for (let page = 1; page <= 10; page += 1) {
    const data = await supabaseFetch(`/auth/v1/admin/users?page=${page}&per_page=100`, {
      key: serviceRoleKey,
      bearer: serviceRoleKey,
    });
    const pageUsers = Array.isArray(data?.users) ? data.users : [];
    users.push(...pageUsers);
    if (pageUsers.length < 100) break;
  }
  return users;
}

function userMatchesCandidate(user, candidate) {
  const email = normalizeLookup(user.email);
  const username = normalizeLookup(user.user_metadata?.username);
  const name = normalizeLookup(displayName(user));
  return Boolean(
    (candidate.email && email === normalizeLookup(candidate.email)) ||
      (candidate.username && username === normalizeLookup(candidate.username)) ||
      (candidate.name && name === normalizeLookup(candidate.name)),
  );
}

async function restoreUsersFromHistory(serviceRoleKey) {
  const [documents, auditRows, users] = await Promise.all([
    supabaseFetch("/rest/v1/onboarding_documents?select=emitente&limit=1000", {
      key: serviceRoleKey,
      bearer: serviceRoleKey,
    }).catch(() => []),
    supabaseFetch("/rest/v1/security_audit_log?select=metadata&event_type=in.(onboarding_document_saved,onboarding_document_updated,onboarding_draft_saved)&limit=1000", {
      key: serviceRoleKey,
      bearer: serviceRoleKey,
    }).catch(() => []),
    listAllUsers(serviceRoleKey),
  ]);
  const candidates = new Map();
  const addCandidate = ({ name, email, username }) => {
    const cleanName = String(name || "").trim();
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanUsername = String(username || cleanName || cleanEmail.split("@")[0] || "").trim();
    if (!cleanName && !cleanEmail && !cleanUsername) return;
    if (/^(usuario autenticado|usuário autenticado|não registrado|nao registrado)$/i.test(cleanName)) return;
    const slug = slugifyName(cleanUsername || cleanName || cleanEmail.split("@")[0]);
    if (!slug || slug === "admin01" || slug === "fernanddo46") return;
    const key = cleanEmail || slug;
    candidates.set(key, {
      name: cleanName || cleanUsername,
      username: cleanUsername || cleanName,
      email: cleanEmail || `${slug}@axionsolutions.com.br`,
    });
  };
  (Array.isArray(documents) ? documents : []).forEach((row) => addCandidate({ name: row.emitente, username: row.emitente }));
  (Array.isArray(auditRows) ? auditRows : []).forEach((row) => {
    const metadata = row.metadata || {};
    addCandidate({ name: metadata.actor_name, email: metadata.actor_email, username: metadata.actor_name });
  });

  let created = 0;
  let reactivated = 0;
  const skipped = [];
  for (const candidate of candidates.values()) {
    const existing = users.find((user) => userMatchesCandidate(user, candidate));
    if (existing) {
      await supabaseFetch(`/auth/v1/admin/users/${existing.id}`, {
        method: "PUT",
        key: serviceRoleKey,
        bearer: serviceRoleKey,
        body: {
          app_metadata: { ...(existing.app_metadata || {}), role: existing.app_metadata?.role || "user", status: "approved" },
          user_metadata: {
            ...(existing.user_metadata || {}),
            display_name: displayName(existing) || candidate.name,
            username: existing.user_metadata?.username || candidate.username,
            profile: existing.user_metadata?.profile || "orteconte",
          },
        },
      });
      reactivated += 1;
      continue;
    }
    try {
      const createdUser = await supabaseFetch("/auth/v1/admin/users", {
        method: "POST",
        key: serviceRoleKey,
        bearer: serviceRoleKey,
        body: {
          email: candidate.email,
          password: "123456",
          email_confirm: true,
          user_metadata: { display_name: candidate.name, username: candidate.username, profile: "orteconte" },
          app_metadata: { role: "user", status: "approved" },
        },
      });
      if (createdUser?.user) users.push(createdUser.user);
      created += 1;
    } catch (error) {
      skipped.push({ name: candidate.name, email: candidate.email, reason: error.message });
    }
  }
  return { created, reactivated, skipped };
}

async function rejectUser(user, serviceRoleKey) {
  try {
    await supabaseFetch(`/auth/v1/admin/users/${user.id}`, { method: "DELETE", key: serviceRoleKey, bearer: serviceRoleKey });
    return { mode: "deleted" };
  } catch (deleteError) {
    await supabaseFetch(`/auth/v1/admin/users/${user.id}`, {
      method: "PUT",
      key: serviceRoleKey,
      bearer: serviceRoleKey,
      body: {
        app_metadata: { ...(user.app_metadata || {}), role: user.app_metadata?.role || "user", status: "rejected" },
        user_metadata: { ...(user.user_metadata || {}), rejected_at: new Date().toISOString() },
      },
    });
    return { mode: "marked_rejected", deleteError: deleteError.message };
  }
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
      for (const user of users) {
        if (isRejectedUser(user)) continue;
        if (isCleanupPendingUser(user)) continue;
        if (isLegacyActiveUser(user)) {
          await supabaseFetch(`/auth/v1/admin/users/${user.id}`, {
            method: "PUT",
            key: serviceRoleKey,
            bearer: serviceRoleKey,
            body: { app_metadata: { ...(user.app_metadata || {}), role: user.app_metadata?.role || "user", status: "approved" } },
          }).catch((error) => console.warn("Legacy user approval failed", error));
          user.app_metadata = { ...(user.app_metadata || {}), role: user.app_metadata?.role || "user", status: "approved" };
        }
        const baseUser = {
          id: user.id,
          email: user.email,
          name: displayName(user),
          username: user.user_metadata?.username,
          profile: user.user_metadata?.profile,
          created_at: user.created_at,
          requested_at: user.user_metadata?.registration_requested_at || user.created_at,
        };
        if (isPendingUser(user)) pendingUsers.push(baseUser);
        else activeUsers.push({ ...baseUser, role: user.app_metadata?.role || "user", canDelete: user.id !== caller.id });
      }
      if (users.length < 100) break;
    }
    activeUsers.sort((a, b) => String(a.email || "").localeCompare(String(b.email || "")));
    pendingUsers.sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
    return json(response, 200, { users: pendingUsers, pendingUsers, activeUsers });
  }

  const userId = String(request.body?.userId || "");
  const action = String(request.body?.action || "");
  if (action === "restore_from_history") {
    const result = await restoreUsersFromHistory(serviceRoleKey);
    return json(response, 200, { message: `${result.created} usuario(s) criado(s), ${result.reactivated} reativado(s).`, ...result });
  }
  if (action === "reject_all") {
    let rejected = 0;
    let deleted = 0;
    let marked = 0;
    const failed = [];
    let pendingUsers = [];
    try {
      pendingUsers = (await listAllUsers(serviceRoleKey)).filter(isPendingUser);
    } catch (error) {
      failed.push({ scope: "list", reason: error.message });
    }
    for (const user of pendingUsers) {
      try {
        const result = await rejectUser(user, serviceRoleKey);
        if (result.mode === "deleted") deleted += 1;
        if (result.mode === "marked_rejected") marked += 1;
        rejected += 1;
      } catch (error) {
        failed.push({ id: user.id, email: user.email, reason: error.message });
      }
    }
    return json(response, 200, {
      message: `${rejected} solicitacao(oes) removida(s) da lista de pendentes.`,
      rejected,
      deleted,
      marked,
      failed,
    });
  }
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !["approve", "reject", "delete"].includes(action)) {
    return json(response, 400, { error: "Solicitacao invalida." });
  }
  if (action === "delete" && userId === caller.id) {
    return json(response, 400, { error: "Nao e possivel excluir o proprio usuario administrador." });
  }
  if (action === "approve") {
    const target = await supabaseFetch(`/auth/v1/admin/users/${userId}`, { key: serviceRoleKey, bearer: serviceRoleKey });
    if (!isPendingUser(target.user)) return json(response, 200, { message: "Solicitacao ja nao esta pendente." });
    await supabaseFetch(`/auth/v1/admin/users/${userId}`, {
      method: "PUT",
      key: serviceRoleKey,
      bearer: serviceRoleKey,
      body: { app_metadata: { ...(target.user.app_metadata || {}), role: "user", status: "approved" } },
    });
    return json(response, 200, { message: "Cadastro aprovado." });
  }
  if (action === "reject") {
    let target;
    try {
      target = await supabaseFetch(`/auth/v1/admin/users/${userId}`, { key: serviceRoleKey, bearer: serviceRoleKey });
    } catch (_error) {
      return json(response, 200, { message: "Solicitacao ja nao esta pendente." });
    }
    if (!target.user || !isPendingUser(target.user)) return json(response, 200, { message: "Solicitacao ja nao esta pendente." });
    await rejectUser(target.user, serviceRoleKey);
    return json(response, 200, { message: "Cadastro removido da lista de pendentes." });
  }
  await supabaseFetch(`/auth/v1/admin/users/${userId}`, { method: "DELETE", key: serviceRoleKey, bearer: serviceRoleKey });
  return json(response, 200, { message: "Usuario excluido." });
}
