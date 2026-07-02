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
  "Access-Control-Allow-Headers": "apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

const hash = async (value: string) => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const legacyEmailForIdentifier = (identifier: string) => {
  const aliases: Record<string, string> = {
    fernanddo46: "fernanddo46@axionsolutions.com.br",
  };
  return aliases[identifier] || "";
};

const isPendingUser = (user: { app_metadata?: Record<string, unknown> }) =>
  user.app_metadata?.status === "pending";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { code: "invalid_credentials" }, 405);
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > 10_000) return json(request, { code: "invalid_credentials" }, 413);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return json(request, { code: "invalid_credentials" }, 401);
  }

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch (_error) {
    return json(request, { code: "invalid_credentials" }, 400);
  }

  const identifier = String(input.identifier || "").trim().toLowerCase();
  const password = String(input.password || "");
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
  const isAlias = /^[\p{L}\p{N} ._-]{3,80}$/u.test(identifier);
  if ((!isEmail && !isAlias) || !password || password.length > 128) {
    return json(request, { code: "invalid_credentials" }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const clientAddress = request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const identifierHash = await hash(identifier);
  const ipHash = await hash(clientAddress.trim());
  const rateKey = await hash(`${identifierHash}:${ipHash}`);

  let email = isEmail ? identifier : legacyEmailForIdentifier(identifier);
  for (let page = 1; page <= 10 && !email; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 100 });
    if (error) return json(request, { code: "invalid_credentials" }, 401);
    const match = data.users.find((user) => {
      const username = String(user.user_metadata?.username || "").trim().toLowerCase();
      const displayName = String(user.user_metadata?.display_name || user.user_metadata?.name || "")
        .trim().toLowerCase();
      const emailAlias = String(user.email || "").split("@")[0].trim().toLowerCase();
      return username === identifier || displayName === identifier || emailAlias === identifier;
    });
    email = match?.email || "";
    if (data.users.length < 100) break;
  }

  if (!email) {
    const { data: allowed, error: rateError } = await adminClient.rpc("check_auth_rate_limit", {
      p_key_hash: rateKey,
      p_action: "login",
      p_limit: 8,
      p_window_seconds: 900,
    });
    await adminClient.from("security_audit_log").insert({
      event_type: !rateError && allowed === false ? "login_rate_limited" : "login_failed",
      ip_hash: ipHash,
      metadata: { identifier_hash: identifierHash, rate_limit_error: Boolean(rateError) },
    });
    return !rateError && allowed === false
      ? json(request, { code: "too_many_attempts" }, 429)
      : json(request, { code: "invalid_credentials" }, 401);
  }

  const authClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
    const { data: allowed, error: rateError } = await adminClient.rpc("check_auth_rate_limit", {
      p_key_hash: rateKey,
      p_action: "login",
      p_limit: 8,
      p_window_seconds: 900,
    });
    await adminClient.from("security_audit_log").insert({
      event_type: !rateError && allowed === false ? "login_rate_limited" : "login_failed",
      ip_hash: ipHash,
      metadata: { identifier_hash: identifierHash, rate_limit_error: Boolean(rateError) },
    });
    return !rateError && allowed === false
      ? json(request, { code: "too_many_attempts" }, 429)
      : json(request, { code: "invalid_credentials" }, 401);
  }

  if (isPendingUser(data.user)) {
    await authClient.auth.signOut();
    return json(request, { code: "account_pending" }, 403);
  }

  await adminClient.from("auth_rate_limits").delete().eq("key_hash", rateKey).eq("action", "login");
  await adminClient.from("security_audit_log").insert({
    actor_id: data.user.id,
    event_type: "login_succeeded",
    ip_hash: ipHash,
  });

  return json(request, {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
    expires_at: data.session.expires_at,
    token_type: data.session.token_type,
    user: data.user,
  });
});
