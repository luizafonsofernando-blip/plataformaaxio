import { createClient } from "jsr:@supabase/supabase-js@2";

const allowedOrigin = (request: Request) => {
  const origin = request.headers.get("origin") || "";
  return /^https:\/\/plataformaaxio(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(origin) ||
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)
    ? origin
    : "https://plataformaaxio.vercel.app";
};

const corsHeaders = (request: Request) => ({
  "Access-Control-Allow-Origin": allowedOrigin(request),
  "Vary": "Origin",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
});

const securityHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

const json = (request: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), ...securityHeaders },
  });

const isPendingUser = (user: { app_metadata?: Record<string, unknown> }) => user.app_metadata?.status === "pending";
const isApprovedOrLegacyUser = (user: { app_metadata?: Record<string, unknown> }) => !isPendingUser(user);
const ADMIN_EMAILS = new Set(["admin01@axionsolutions.com.br", "fernanddo46@axionsolutions.com.br"]);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "GET" && request.method !== "POST") {
    return json(request, { error: "Metodo nao permitido." }, 405);
  }
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > 10_000) return json(request, { error: "Solicitacao muito grande." }, 413);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
    Deno.env.get("SUPABASE_ANON_KEY") ||
    Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ||
    Deno.env.get("VITE_SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization") || "";
  if (!supabaseUrl || !publishableKey || !serviceRoleKey || !authorization.startsWith("Bearer ")) {
    return json(request, { error: "Acesso nao autorizado." }, 401);
  }

  const callerClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  const caller = callerData.user;
  if (
    callerError ||
    !caller ||
    !ADMIN_EMAILS.has(String(caller.email || "").toLowerCase()) ||
    caller.app_metadata?.role !== "admin" ||
    isPendingUser(caller)
  ) {
    return json(request, { error: "Somente o administrador pode gerenciar usuarios." }, 403);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (request.method === "GET") {
    const pendingUsers: Array<Record<string, unknown>> = [];
    const activeUsers: Array<Record<string, unknown>> = [];
    for (let page = 1; page <= 10; page += 1) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 100 });
      if (error) return json(request, { error: "Nao foi possivel carregar os usuarios." }, 500);
      data.users.forEach((user) => {
        const baseUser = {
          id: user.id,
          email: user.email,
          name: user.user_metadata?.display_name,
          username: user.user_metadata?.username,
          profile: user.user_metadata?.profile,
          created_at: user.created_at,
        };
        if (user.app_metadata?.status === "pending") {
          pendingUsers.push(baseUser);
        }
        if (isApprovedOrLegacyUser(user)) {
          activeUsers.push({
            ...baseUser,
            role: user.app_metadata?.role || "user",
            canDelete: user.id !== caller.id,
          });
        }
      });
      if (data.users.length < 100) break;
    }
    activeUsers.sort((a, b) => String(a.email || "").localeCompare(String(b.email || "")));
    pendingUsers.sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
    return json(request, { users: pendingUsers, pendingUsers, activeUsers });
  }

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch (_error) {
    return json(request, { error: "Dados invalidos." }, 400);
  }
  const userId = String(input.userId || "");
  const action = String(input.action || "");
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !["approve", "reject", "delete"].includes(action)) {
    return json(request, { error: "Solicitacao invalida." }, 400);
  }

  if (action === "delete") {
    if (userId === caller.id) return json(request, { error: "Nao e possivel excluir o proprio usuario administrador." }, 400);
    const { data: targetData, error: targetError } = await adminClient.auth.admin.getUserById(userId);
    if (targetError || !targetData.user || !isApprovedOrLegacyUser(targetData.user)) {
      return json(request, { error: "Usuario ativo nao encontrado." }, 404);
    }
    const { error } = await adminClient.auth.admin.deleteUser(userId);
    if (error) return json(request, { error: "Nao foi possivel excluir o usuario." }, 400);
    await adminClient.from("security_audit_log").insert({ actor_id: caller.id, event_type: "user_deleted", target_id: userId });
    return json(request, { message: "Usuario excluido." });
  }

  if (action === "reject") {
    const { error } = await adminClient.auth.admin.deleteUser(userId);
    if (error) return json(request, { error: "Nao foi possivel rejeitar o cadastro." }, 400);
    await adminClient.from("security_audit_log").insert({ actor_id: caller.id, event_type: "user_rejected", target_id: userId });
    return json(request, { message: "Cadastro rejeitado." });
  }

  const { data: targetData, error: targetError } = await adminClient.auth.admin.getUserById(userId);
  if (targetError || !targetData.user || targetData.user.app_metadata?.status !== "pending") {
    return json(request, { error: "Solicitacao nao encontrada." }, 404);
  }
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    app_metadata: { ...targetData.user.app_metadata, role: "user", status: "approved" },
  });
  if (error) return json(request, { error: "Nao foi possivel aprovar o cadastro." }, 400);
  await adminClient.from("security_audit_log").insert({ actor_id: caller.id, event_type: "user_approved", target_id: userId });
  return json(request, { message: "Cadastro aprovado." });
});
