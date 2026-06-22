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

const json = (request: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const hash = async (value: string) => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Metodo nao permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json(request, { error: "Servico indisponivel." }, 503);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const clientAddress = request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const ipHash = await hash(clientAddress.trim());
  const { data: allowed, error: rateError } = await adminClient.rpc("check_auth_rate_limit", {
    p_key_hash: ipHash,
    p_action: "registration",
    p_limit: 3,
    p_window_seconds: 3600,
  });
  if (rateError || !allowed) return json(request, { error: "Muitas tentativas. Tente novamente mais tarde." }, 429);

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch (_error) {
    return json(request, { error: "Dados invalidos." }, 400);
  }

  const name = String(input.name || "").trim();
  const username = String(input.username || "").trim().toLowerCase();
  const email = String(input.email || "").trim().toLowerCase();
  const password = String(input.password || "");
  const profile = input.profile === "simao" ? "simao" : "orteconte";

  if (name.length < 2 || name.length > 80) return json(request, { error: "Nome invalido." }, 400);
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return json(request, { error: "Usuario invalido." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(request, { error: "E-mail invalido." }, 400);
  if (!/^\d{6}$/.test(password)) {
    return json(request, { error: "A senha deve conter exatamente 6 digitos numericos." }, 400);
  }

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 100 });
    if (error) return json(request, { error: "Nao foi possivel verificar o cadastro." }, 500);
    const duplicate = data.users.some(
      (user) => user.email?.toLowerCase() === email ||
        String(user.user_metadata?.username || "").toLowerCase() === username,
    );
    if (duplicate) return json(request, { error: "E-mail ou usuario ja cadastrado." }, 409);
    if (data.users.length < 100) break;
  }

  const { error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name, username, profile },
    app_metadata: { role: "user", status: "pending" },
  });
  if (error) return json(request, { error: "Nao foi possivel enviar a solicitacao." }, 400);

  await adminClient.from("security_audit_log").insert({
    event_type: "registration_requested", ip_hash: ipHash, metadata: { username },
  });

  return json(request, { message: "Solicitacao enviada." }, 201);
});
