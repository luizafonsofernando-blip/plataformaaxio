import { clientIpHash, isSuspendedUser, rejectDisallowedOrigin, rejectLargeRequest, rejectRateLimited, requestAuditMetadata, setApiSecurityHeaders } from "../_security.js";

const DEFAULT_SUPABASE_URL = "https://prznhgwiibcazuwlwvnt.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_gQNx5ZW2OTr5J7jNgTQoOg_1n4ffmG4";
const LUCE_EMAIL_DOMAIN = "lucesolutions.com.br";
const LEGACY_EMAIL_DOMAIN = ["axi", "onsolutions.com.br"].join("");
const ADMIN_EMAILS = new Set([
  "luizafonsofernando@gmail.com",
  `admin01@${LUCE_EMAIL_DOMAIN}`,
  `fernanddo46@${LUCE_EMAIL_DOMAIN}`,
  `admin01@${LEGACY_EMAIL_DOMAIN}`,
  `fernanddo46@${LEGACY_EMAIL_DOMAIN}`,
]);
const ADMIN01_TARGET_EMAIL = "luizafonsofernando@gmail.com";
const ADMIN01_LEGACY_EMAILS = new Set([
  `admin01@${LUCE_EMAIL_DOMAIN}`,
  `admin01@${LEGACY_EMAIL_DOMAIN}`,
]);
const LUCE_MODULES = [
  { id: "onboarding", label: "Onboarding Contábil" },
  { id: "property", label: "Property" },
  { id: "comunicados", label: "Comunicados" },
  { id: "review-folha", label: "Review Folha" },
  { id: "radar-legislativo", label: "Radar Legislativo" },
  { id: "contratos", label: "Contratos" },
  { id: "ebef", label: "E-BEF" },
  { id: "luce-sign", label: "Luce Sign" },
  { id: "reforma-tributaria", label: "Reforma Tributária" },
];
const VALID_MODULE_IDS = new Set(LUCE_MODULES.map((module) => module.id));
const PENDING_CLEANUP_CUTOFF = new Date("2026-07-25T03:00:00.000Z");
const MAX_BODY_BYTES = 8_000;

function json(response, status, body) {
  setApiSecurityHeaders(response);
  response.status(status);
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
  return (ADMIN_EMAILS.has(email) || user?.app_metadata?.role === "admin") && user?.app_metadata?.role === "admin" && !["pending", "rejected", "suspended"].includes(userStatus(user));
}

async function auditAdminAction({ request, serviceRoleKey, caller, eventType, targetId, metadata = {} }) {
  try {
    await supabaseFetch("/rest/v1/security_audit_log", {
      method: "POST",
      key: serviceRoleKey,
      bearer: serviceRoleKey,
      body: {
        actor_id: caller.id || null,
        event_type: eventType,
        target_id: targetId || null,
        ip_hash: await clientIpHash(request),
        metadata: requestAuditMetadata(request, metadata),
      },
    });
  } catch (error) {
    console.warn("Onboarding admin audit failed", error);
  }
}

function userStatus(user) {
  return String(user?.app_metadata.status || "").trim().toLowerCase();
}

function isPendingUser(user) {
  return userStatus(user) === "pending";
}

function isConfirmedUser(user) {
  return Boolean(user?.confirmed_at || user?.email_confirmed_at);
}

function adminSeenMap(user) {
  const value = user?.app_metadata?.onboarding_admin_seen_by;
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isNewConfirmedUserForAdmin(user, adminId) {
  if (!adminId || isAdminUser(user) || !isConfirmedUser(user) || isRejectedUser(user)) return false;
  if (!user?.user_metadata?.registration_requested_at) return false;
  return !adminSeenMap(user)[adminId];
}

async function markUsersSeenByAdmin(users, caller, serviceRoleKey) {
  const seenAt = new Date().toISOString();
  await Promise.all(users.map((user) => {
    const seenBy = { ...adminSeenMap(user), [caller.id]: seenAt };
    return supabaseFetch(`/auth/v1/admin/users/${user.id}`, {
      method: "PUT",
      key: serviceRoleKey,
      bearer: serviceRoleKey,
      body: {
        app_metadata: {
          ...(user.app_metadata || {}),
          onboarding_admin_seen_by: seenBy,
        },
      },
    }).catch((error) => console.warn("Admin user seen marker failed", error));
  }));
}

function isRejectedUser(user) {
  return userStatus(user) === "rejected";
}

function extractSupabaseUser(data) {
  return data.user || data;
}

function isCleanupPendingUser(user) {
  if (!isPendingUser(user)) return false;
  const requestedAt = user?.user_metadata.registration_requested_at || user.created_at;
  const date = new Date(requestedAt || 0);
  return !Number.isNaN(date.getTime()) && date <= PENDING_CLEANUP_CUTOFF;
}

function isLegacyActiveUser(user) {
  return !userStatus(user);
}

function displayName(user) {
  return user?.user_metadata.display_name || user?.user_metadata.name || String(user?.email || "").split("@")[0] || "";
}

function isAdmin01User(user) {
  const email = String(user?.email || "").toLowerCase();
  const username = String(user?.user_metadata.username || "").toLowerCase();
  const display = String(user?.user_metadata.display_name || user?.user_metadata.name || "").toLowerCase();
  return ADMIN01_LEGACY_EMAILS.has(email) || email === ADMIN01_TARGET_EMAIL || username === "admin01" || display === "admin01";
}

function profileToModule(profile) {
  const normalized = String(profile || "").trim().toLowerCase();
  if (normalized === "property") return "property";
  if (normalized === "cerne") return "cerne";
  if (normalized === "sentinela") return "sentinela";
  if (normalized === "contratos") return "contratos";
  if (normalized === "radar-legislativo" || normalized === "radar-sindical") return "radar-legislativo";
  if (normalized === "comunicados" || normalized === "comunica-facil") return "comunicados";
  if (normalized === "review-folha") return "review-folha";
  return "onboarding";
}

function userAllowedModules(user) {
  if (isAdmin01User(user)) return LUCE_MODULES.map((module) => module.id);
  const explicit = Array.isArray(user?.app_metadata?.allowed_modules) ? user.app_metadata.allowed_modules : [];
  const clean = explicit.map((module) => String(module || "").trim().toLowerCase()).filter((module) => VALID_MODULE_IDS.has(module));
  if (clean.length) return [...new Set(clean)];
  return [profileToModule(user?.user_metadata?.profile)];
}

function normalizedModuleList(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((module) => String(module || "").trim().toLowerCase()).filter((module) => VALID_MODULE_IDS.has(module)))];
}

function normalizeRole(value) {
  return value === "admin" ? "admin" : "user";
}

async function migrateAdmin01EmailIfNeeded(users, serviceRoleKey) {
  const targetAlreadyExists = users.some((user) => String(user?.email || "").toLowerCase() === ADMIN01_TARGET_EMAIL && !isAdmin01User(user));
  const admin01 = users.find((user) => isAdmin01User(user));
  if (!admin01) return { user: null, status: "not_found" };
  const currentEmail = String(admin01.email || "").toLowerCase();
  if (currentEmail === ADMIN01_TARGET_EMAIL) return { user: admin01, status: "already_updated" };
  if (targetAlreadyExists) {
    return { user: admin01, status: "target_exists", message: `Ja existe outro usuário com o e-mail ${ADMIN01_TARGET_EMAIL}.` };
  }
  const updated = extractSupabaseUser(await supabaseFetch(`/auth/v1/admin/users/${admin01.id}`, {
    method: "PUT",
    key: serviceRoleKey,
    bearer: serviceRoleKey,
    body: {
      email: ADMIN01_TARGET_EMAIL,
      email_confirm: true,
      app_metadata: { ...(admin01.app_metadata || {}), role: "admin", status: "approved" },
      user_metadata: {
        ...(admin01.user_metadata || {}),
        username: admin01.user_metadata.username || "Admin01",
        display_name: admin01.user_metadata.display_name || "Admin01",
        name: admin01.user_metadata.name || "Administrador",
      },
    },
  }));
  return { user: updated || { ...admin01, email: ADMIN01_TARGET_EMAIL }, status: "updated" };
}

async function listAllUsers(serviceRoleKey, maxPages = 10) {
  const allUsers = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const data = await supabaseFetch(`/auth/v1/admin/users?page=${page}&per_page=100`, {
      key: serviceRoleKey,
      bearer: serviceRoleKey,
    });
    const users = Array.isArray(data.users) ? data.users : [];
    allUsers.push(...users);
    if (users.length < 100) break;
  }
  return allUsers;
}

async function rejectUser(user, serviceRoleKey) {
  await supabaseFetch(`/auth/v1/admin/users/${user?.id}`, {
    method: "PUT",
    key: serviceRoleKey,
    bearer: serviceRoleKey,
    body: {
      app_metadata: { ...(user.app_metadata || {}), role: user?.app_metadata?.role || "user", status: "rejected" },
      user_metadata: { ...(user?.user_metadata || {}), rejected_at: new Date().toISOString() },
    },
  });

  try {
    await supabaseFetch(`/auth/v1/admin/users/${user?.id}`, { method: "DELETE", key: serviceRoleKey, bearer: serviceRoleKey });
    return { mode: "marked_rejected_and_deleted" };
  } catch (deleteError) {
    return { mode: "marked_rejected", deleteError: deleteError.message };
  }
}

export default async function handler(request, response) {
  if (rejectDisallowedOrigin(request, response)) return;
  if (rejectLargeRequest(request, response, MAX_BODY_BYTES)) return;
  if (await rejectRateLimited(request, response, { action: "onboarding_admin_users", limit: 120, windowSeconds: 60 })) return;

  if (!["GET", "POST"].includes(request.method)) return json(response, 405, { error: "Método não permitido." });
  const { publicKey, serviceRoleKey } = supabaseConfig();
  if (!publicKey || !serviceRoleKey) return json(response, 503, { error: "Serviço indisponível." });

  let caller;
  try {
    caller = await callerFromRequest(request, publicKey);
  } catch (_error) {
    return json(response, 401, { error: "Sessão inválida." });
  }
  if (!isAdminUser(caller) || !isAdmin01User(caller)) {
    return json(response, 403, { error: "Somente o ADMIN 01 pode visualizar e gerenciar usuários." });
  }

  if (request.method === "GET") {
    const summaryOnly = String(request.query?.summary || "") === "1";
    const pendingUsers = [];
    const activeUsers = [];
    const allUsers = await listAllUsers(serviceRoleKey);
    let migration = { status: "not_attempted" };
    try {
      migration = await migrateAdmin01EmailIfNeeded(allUsers, serviceRoleKey);
      if (migration.user) {
        const index = allUsers.findIndex((user) => user?.id === migration.user?.id);
        if (index >= 0) allUsers[index] = migration.user;
      }
    } catch (error) {
      migration = { status: "failed", message: error?.message };
      console.warn("Admin01 email migration failed", error);
    }
    const newConfirmedUsers = allUsers.filter((user) => isNewConfirmedUserForAdmin(user, caller.id));
    if (summaryOnly) {
      return json(response, 200, { newUsersCount: newConfirmedUsers.length });
    }
    for (const user of allUsers) {
      if (isRejectedUser(user)) continue;
      if (isCleanupPendingUser(user)) continue;
      if (isPendingUser(user) && isConfirmedUser(user)) {
        await supabaseFetch(`/auth/v1/admin/users/${user?.id}`, {
          method: "PUT",
          key: serviceRoleKey,
          bearer: serviceRoleKey,
          body: {
            app_metadata: {
              ...(user.app_metadata || {}),
              role: user?.app_metadata?.role || "user",
              status: "approved",
              auto_approved_at: user?.app_metadata?.auto_approved_at || new Date().toISOString(),
            },
          },
        }).catch((error) => console.warn("Confirmed pending user approval failed", error));
        user.app_metadata = {
          ...(user.app_metadata || {}),
          role: user?.app_metadata?.role || "user",
          status: "approved",
          auto_approved_at: user?.app_metadata?.auto_approved_at || new Date().toISOString(),
        };
      }
      if (isLegacyActiveUser(user)) {
        await supabaseFetch(`/auth/v1/admin/users/${user?.id}`, {
          method: "PUT",
          key: serviceRoleKey,
          bearer: serviceRoleKey,
          body: { app_metadata: { ...(user.app_metadata || {}), role: user?.app_metadata?.role || "user", status: "approved" } },
        }).catch((error) => console.warn("Legacy user approval failed", error));
        user.app_metadata = { ...(user.app_metadata || {}), role: user?.app_metadata?.role || "user", status: "approved" };
      }
      const baseUser = {
        id: user?.id,
        email: user?.email,
        name: displayName(user),
        username: user?.user_metadata.username,
        profile: user?.user_metadata.profile,
        role: user?.app_metadata?.role || "user",
        allowedModules: userAllowedModules(user),
        isAdmin01: isAdmin01User(user),
        created_at: user.created_at,
        confirmed_at: user.confirmed_at || user.email_confirmed_at || null,
        last_sign_in_at: user.last_sign_in_at || null,
        requested_at: user?.user_metadata.registration_requested_at || user.created_at,
        isNew: newConfirmedUsers.some((newUser) => newUser.id === user.id),
        status: isSuspendedUser(user) ? "suspended" : "active",
      };
      if (!isConfirmedUser(user) && user?.user_metadata?.registration_requested_at) {
        pendingUsers.push(baseUser);
        continue;
      }
      if (isPendingUser(user)) pendingUsers.push(baseUser);
      else activeUsers.push({ ...baseUser, canDelete: user?.id !== caller.id && !isAdmin01User(user), canSuspend: !isAdmin01User(user) });
    }
    activeUsers.sort((a, b) => String(a.email || "").localeCompare(String(b.email || "")));
    pendingUsers.sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
    const admin01 = allUsers.find((user) => isAdmin01User(user));
    await markUsersSeenByAdmin(newConfirmedUsers, caller, serviceRoleKey);
    return json(response, 200, {
      users: pendingUsers,
      pendingUsers,
      activeUsers,
      modules: LUCE_MODULES,
      canManagePermissions: isAdmin01User(caller),
      newUsersCount: newConfirmedUsers.length,
      admin01Migration: migration,
      admin01Email: admin01?.email || null
    });
  }

  const userId = String(request.body?.userId || "");
  const action = String(request.body?.action || "");
  if (action === "restore_from_history") {
    await auditAdminAction({
      request,
      serviceRoleKey,
      caller,
      eventType: "admin_restore_users_from_history_blocked",
    });
    return json(response, 410, { error: "Rotina de restauração removida por segurança." });
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
      failed.push({ scope: "list", reason: error?.message });
    }
    for (const user of pendingUsers) {
      try {
        const result = await rejectUser(user, serviceRoleKey);
        if (result.mode === "deleted" || result.mode === "marked_rejected_and_deleted") deleted += 1;
        if (result.mode === "marked_rejected") marked += 1;
        rejected += 1;
      } catch (error) {
        failed.push({ id: user?.id, email: user?.email, reason: error?.message });
      }
    }
    await auditAdminAction({
      request,
      serviceRoleKey,
      caller,
      eventType: "admin_reject_all_pending_users",
      metadata: { rejected, deleted, marked, failed_count: failed.length },
    });
    return json(response, 200, {
      message: `${rejected} solicitação(oes) removida(s) da lista de pendentes.`,
      rejected,
      deleted,
      marked,
      failed,
    });
  }
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !["approve", "reject", "delete", "update_access", "suspend", "reactivate"].includes(action)) {
    return json(response, 400, { error: "Solicitação inválida." });
  }
  if (action === "delete" && userId === caller.id) {
    return json(response, 400, { error: "Não é possível excluir o próprio usuário administrador." });
  }
  if (action === "approve") {
    const target = await supabaseFetch(`/auth/v1/admin/users/${userId}`, { key: serviceRoleKey, bearer: serviceRoleKey });
    const targetUser = extractSupabaseUser(target);
    if (!targetUser) return json(response, 404, { error: "Solicitação não encontrada." });
    if (!isPendingUser(targetUser)) return json(response, 200, { message: "Solicitação já não está pendente." });
    await supabaseFetch(`/auth/v1/admin/users/${userId}`, {
      method: "PUT",
      key: serviceRoleKey,
      bearer: serviceRoleKey,
      body: {
        app_metadata: { ...(targetUser.app_metadata || {}), role: "user", status: "approved" },
      },
    });
    await auditAdminAction({
      request,
      serviceRoleKey,
      caller,
      eventType: "admin_user_approved",
      targetId: userId,
      metadata: { email: targetUser.email, username: targetUser.user_metadata.username },
    });
    return json(response, 200, { message: "Cadastro aprovado." });
  }
  if (action === "update_access") {
    if (!isAdmin01User(caller)) return json(response, 403, { error: "Somente o ADMIN 01 pode alterar permissões e perfis." });
    const target = await supabaseFetch(`/auth/v1/admin/users/${userId}`, { key: serviceRoleKey, bearer: serviceRoleKey });
    const targetUser = extractSupabaseUser(target);
    if (!targetUser) return json(response, 404, { error: "Usuário não encontrado." });
    if (isAdmin01User(targetUser)) return json(response, 403, { error: "As permissões do ADMIN 01 não podem ser alteradas." });
    const allowedModules = normalizedModuleList(request.body?.allowedModules);
    if (!allowedModules.length) return json(response, 400, { error: "Selecione ao menos um módulo para o usuário." });
    const role = normalizeRole(request.body?.role);
    await supabaseFetch(`/auth/v1/admin/users/${userId}`, {
      method: "PUT",
      key: serviceRoleKey,
      bearer: serviceRoleKey,
      body: {
        app_metadata: {
          ...(targetUser.app_metadata || {}),
          role,
          status: targetUser.app_metadata?.status || "approved",
          allowed_modules: allowedModules,
          ebef_shared_access: allowedModules.includes("ebef"),
          permissions_updated_at: new Date().toISOString(),
          permissions_updated_by: caller.id,
        },
      },
    });
    await auditAdminAction({
      request,
      serviceRoleKey,
      caller,
      eventType: "admin_user_permissions_updated",
      targetId: userId,
      metadata: {
        email: targetUser.email,
        username: targetUser.user_metadata?.username,
        role,
        allowed_modules: allowedModules,
      },
    });
    return json(response, 200, { message: "Permissões atualizadas." });
  }
  if (action === "suspend" || action === "reactivate") {
    const target = await supabaseFetch(`/auth/v1/admin/users/${userId}`, { key: serviceRoleKey, bearer: serviceRoleKey });
    const targetUser = extractSupabaseUser(target);
    if (!targetUser) return json(response, 404, { error: "Usuário não encontrado." });
    if (isAdmin01User(targetUser)) return json(response, 403, { error: "O ADMIN 01 não pode ser suspenso." });
    const suspending = action === "suspend";
    const previousStatus = userStatus(targetUser) || "approved";
    const nextStatus = suspending ? "suspended" : "approved";
    await supabaseFetch(`/auth/v1/admin/users/${userId}`, {
      method: "PUT",
      key: serviceRoleKey,
      bearer: serviceRoleKey,
      body: {
        ban_duration: suspending ? "876000h" : "none",
        app_metadata: {
          ...(targetUser.app_metadata || {}),
          status: nextStatus,
          status_updated_at: new Date().toISOString(),
          status_updated_by: caller.id,
        },
      },
    });
    await auditAdminAction({
      request,
      serviceRoleKey,
      caller,
      eventType: suspending ? "admin_user_suspended" : "admin_user_reactivated",
      targetId: userId,
      metadata: { email: targetUser.email, previous_status: previousStatus, new_status: nextStatus },
    });
    return json(response, 200, { message: suspending ? "Usuário suspenso com sucesso." : "Usuário reativado com sucesso." });
  }
  if (action === "reject") {
    let target;
    try {
      target = await supabaseFetch(`/auth/v1/admin/users/${userId}`, { key: serviceRoleKey, bearer: serviceRoleKey });
    } catch (_error) {
      return json(response, 200, { message: "Solicitação já não está pendente." });
    }
    const targetUser = extractSupabaseUser(target);
    if (!targetUser || !isPendingUser(targetUser)) return json(response, 200, { message: "Solicitação já não está pendente." });
    await rejectUser(targetUser, serviceRoleKey);
    await auditAdminAction({
      request,
      serviceRoleKey,
      caller,
      eventType: "admin_user_rejected",
      targetId: userId,
      metadata: { email: targetUser.email, username: targetUser.user_metadata.username },
    });
    return json(response, 200, { message: "Cadastro removido da lista de pendentes." });
  }
  const deleteTarget = await supabaseFetch(`/auth/v1/admin/users/${userId}`, { key: serviceRoleKey, bearer: serviceRoleKey }).catch(() => null);
  const deleteTargetUser = deleteTarget ? extractSupabaseUser(deleteTarget) : null;
  if (!deleteTargetUser) return json(response, 404, { error: "Usuário não encontrado." });
  if (isAdmin01User(deleteTargetUser)) return json(response, 403, { error: "O ADMIN 01 não pode ser excluído." });
  await supabaseFetch(`/auth/v1/admin/users/${userId}`, { method: "DELETE", key: serviceRoleKey, bearer: serviceRoleKey });
  await auditAdminAction({ request, serviceRoleKey, caller, eventType: "admin_user_deleted", targetId: userId });
  return json(response, 200, { message: "Usuário excluído." });
}
