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
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
});

const securityHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

const json = (request: Request, body: Record<string, unknown> | Array<unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), ...securityHeaders },
  });

const cleanText = (value: unknown, max = 5000) => String(value || "").slice(0, max);
const cleanNullable = (value: unknown, max = 5000) => {
  const text = cleanText(value, max).trim();
  return text || null;
};

const cleanObject = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const callerAuditMetadata = (caller: {
  email?: string;
  user_metadata?: Record<string, unknown>;
}) => ({
  actor_email: caller.email || null,
  actor_name: caller.user_metadata?.display_name || caller.user_metadata?.name || caller.user_metadata?.username || null,
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (!["GET", "POST", "DELETE"].includes(request.method)) {
    return json(request, { error: "Metodo nao permitido." }, 405);
  }
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > 1_100_000) return json(request, { error: "Solicitacao muito grande." }, 413);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY");
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
  if (callerError || !caller || caller.app_metadata?.status !== "approved") {
    return json(request, { error: "Sessao invalida ou usuario nao aprovado." }, 403);
  }
  const isAdmin = caller.app_metadata?.role === "admin";

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (request.method === "GET") {
    const query = adminClient
      .from("onboarding_documents")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (!isAdmin) query.eq("owner_id", caller.id);
    const { data, error } = await query;
    if (error) return json(request, { error: "Nao foi possivel carregar o historico." }, 500);
    return json(request, data || []);
  }

  let input: Record<string, unknown> = {};
  try {
    input = await request.json();
  } catch (_error) {
    return json(request, { error: "Dados invalidos." }, 400);
  }

  if (request.method === "DELETE") {
    const id = cleanText(input.id, 80).trim();
    if (!/^[a-z0-9._:-]{8,80}$/i.test(id)) return json(request, { error: "Documento invalido." }, 400);
    if (!isAdmin) {
      await adminClient.from("security_audit_log").insert({
        actor_id: caller.id,
        event_type: "onboarding_document_forbidden_delete",
        target_id: id,
        metadata: callerAuditMetadata(caller),
      });
      return json(request, { error: "Somente o administrador pode excluir documentos." }, 403);
    }
    const { data: existingDelete, error: existingDeleteError } = await adminClient
      .from("onboarding_documents")
      .select("id, owner_id, serial, kind, procedimento")
      .eq("id", id)
      .maybeSingle();
    if (existingDeleteError) return json(request, { error: "Nao foi possivel validar o documento." }, 400);
    if (!existingDelete) return json(request, { error: "Documento nao encontrado." }, 404);
    const { error } = await adminClient
      .from("onboarding_documents")
      .delete()
      .eq("id", id);
    if (error) return json(request, { error: "Nao foi possivel excluir o documento." }, 400);
    await adminClient.from("security_audit_log").insert({
      actor_id: caller.id,
      event_type: "onboarding_document_deleted",
      target_id: id,
      metadata: {
        ...callerAuditMetadata(caller),
        owner_id: existingDelete.owner_id,
        serial: existingDelete.serial,
        kind: existingDelete.kind,
        procedimento: existingDelete.procedimento,
      },
    });
    return json(request, { message: "Documento excluido." });
  }

  const id = cleanText(input.id, 80).trim();
  if (!/^[a-z0-9._:-]{8,80}$/i.test(id)) return json(request, { error: "Documento invalido." }, 400);
  const { data: existing, error: existingError } = await adminClient
    .from("onboarding_documents")
    .select("id, owner_id")
    .eq("id", id)
    .maybeSingle();
  if (existingError) return json(request, { error: "Nao foi possivel validar o documento." }, 400);
  if (existing && existing.owner_id !== caller.id && !isAdmin) {
    await adminClient.from("security_audit_log").insert({
      actor_id: caller.id,
      event_type: "onboarding_document_forbidden_update",
      target_id: id,
      metadata: callerAuditMetadata(caller),
    });
    return json(request, { error: "Documento nao pertence ao usuario." }, 403);
  }
  const now = new Date().toISOString();
  const row = {
    id,
    owner_id: existing?.owner_id || caller.id,
    serial: cleanText(input.serial, 80),
    emitente: cleanText(input.emitente, 120),
    kind: cleanText(input.kind, 40),
    status: cleanText(input.status, 40) === "rascunho" ? "rascunho" : "final",
    title: cleanText(input.title, 200),
    empresa: cleanNullable(input.empresa, 200),
    documento: cleanNullable(input.documento, 120),
    procedimento: cleanNullable(input.procedimento, 120),
    created_at: cleanText(input.created_at, 40) || now,
    updated_at: now,
    form_state: cleanObject(input.form_state),
    html: cleanText(input.html, 900000),
  };

  const { data, error } = await adminClient
    .from("onboarding_documents")
    .upsert(row, { onConflict: "id" })
    .select("*")
    .single();
  if (error) return json(request, { error: "Nao foi possivel salvar o documento." }, 400);
  await adminClient.from("security_audit_log").insert({
    actor_id: caller.id,
    event_type: existing
      ? "onboarding_document_updated"
      : row.status === "rascunho" ? "onboarding_draft_saved" : "onboarding_document_saved",
    target_id: id,
    metadata: {
      ...callerAuditMetadata(caller),
      serial: row.serial,
      kind: row.kind,
      procedimento: row.procedimento,
      edited_at: now,
    },
  });
  return json(request, [data]);
});
