import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Metodo nao permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization") || "";

  if (!supabaseUrl || !publishableKey || !serviceRoleKey || !authorization.startsWith("Bearer ")) {
    return json({ error: "Acesso nao autorizado." }, 401);
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
    caller.email?.toLowerCase() !== "admin01@axionsolutions.com.br" ||
    caller.app_metadata?.role !== "admin" ||
    caller.app_metadata?.status !== "approved"
  ) {
    return json({ error: "Somente o administrador pode cadastrar usuarios." }, 403);
  }

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch (_error) {
    return json({ error: "Dados invalidos." }, 400);
  }

  const name = String(input.name || "").trim();
  const username = String(input.username || "").trim();
  const email = String(input.email || "").trim().toLowerCase();
  const password = String(input.password || "");
  const profile = input.profile === "simao" ? "simao" : "orteconte";

  if (name.length < 2 || name.length > 80) return json({ error: "Nome invalido." }, 400);
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(username)) return json({ error: "Usuario invalido." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "E-mail invalido." }, 400);
  if (!/^\d{6}$/.test(password)) {
    return json({ error: "A senha deve conter exatamente 6 digitos numericos." }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name, username, profile },
    app_metadata: { role: "user" },
  });

  if (error) {
    const duplicate = /already|registered|exists/i.test(error.message);
    return json({ error: duplicate ? "Ja existe uma conta com esse e-mail." : "Nao foi possivel criar o usuario." }, 400);
  }

  return json({ id: data.user.id, message: "Usuario cadastrado com sucesso." }, 201);
});
