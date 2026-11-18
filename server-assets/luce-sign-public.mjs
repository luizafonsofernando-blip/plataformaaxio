import { createClient } from "@supabase/supabase-js";
import { isIP } from "node:net";
import { rejectDisallowedOrigin, rejectLargeRequest, setApiSecurityHeaders } from "../api/_security.js";
import { SIGN_BUCKET, signError } from "./luce-sign.mjs";
import { buildFinalPdf, equalHash, hmac, otpHash, randomToken, sha256 } from "./luce-sign-flow.mjs";

function db() {
  const url = process.env.SUPABASE_URL;
  if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw signError("LUCE Sign indisponível.", 503);
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
function data(result) { if (result.error) throw signError("Falha ao consultar o LUCE Sign.", 503); return result.data; }
function send(response, status, payload) { setApiSecurityHeaders(response); response.setHeader("Cache-Control", "no-store"); return response.status(status).json(payload); }
function clientIp(request) {
  const first = String(request.headers["x-vercel-forwarded-for"] || request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return isIP(first) ? first : null;
}
async function limit(database, key, max, seconds) {
  const allowed = data(await database.rpc("sign_take_rate_limit", { p_key_hash: hmac(`limit:${key}`), p_limit: max, p_window_seconds: seconds }));
  if (!allowed) throw signError("Muitas tentativas. Aguarde para continuar.", 429);
}
async function linkSigner(database, token) {
  if (!/^[a-f0-9]{64}$/.test(token || "")) throw signError("Link inválido ou expirado.", 404);
  const signer = data(await database.from("sign_signers").select("*").eq("link_hash", sha256(token)).maybeSingle());
  if (!signer || !signer.link_expires_at || Date.parse(signer.link_expires_at) <= Date.now() ||
    signer.status === "declined" || signer.status === "expired") throw signError("Link inválido ou expirado.", 404);
  const document = data(await database.from("sign_documents").select("*").eq("id", signer.document_id).single());
  if (["cancelled", "expired", "declined", "error"].includes(document.status)) throw signError("Este documento não aceita assinaturas.", 409);
  return { signer, document };
}
async function sessionSigner(database, request) {
  const token = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!/^[A-Za-z0-9_-]{40,80}$/.test(token)) throw signError("Acesso não autorizado.", 401);
  const signer = data(await database.from("sign_signers").select("*").eq("session_hash", sha256(token)).maybeSingle());
  if (!signer || !signer.session_expires_at || Date.parse(signer.session_expires_at) <= Date.now() ||
    !signer.link_expires_at || Date.parse(signer.link_expires_at) <= Date.now()) throw signError("Sessão expirada.", 401);
  const document = data(await database.from("sign_documents").select("*").eq("id", signer.document_id).single());
  return { signer, document, token };
}
async function file(database, response, path, expected, name) {
  const downloaded = await database.storage.from(SIGN_BUCKET).download(path);
  if (downloaded.error) throw signError("Arquivo indisponível.", 503);
  const bytes = Buffer.from(await downloaded.data.arrayBuffer());
  if (sha256(bytes) !== expected) throw signError("Falha na verificação de integridade.", 503);
  response.setHeader("Content-Type", "application/pdf");
  response.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  response.setHeader("Cache-Control", "no-store");
  return response.status(200).send(bytes);
}
async function record(database, signer, type, details, request) {
  data(await database.from("sign_events").insert({ document_id: signer.document_id, organization_id: signer.organization_id,
    signer_id: signer.id, event_type: type, details, ip_address: clientIp(request), user_agent: String(request.headers["user-agent"] || "").slice(0, 500) }));
}
async function uploadImmutable(database, path, bytes, expectedHash) {
  const uploaded = await database.storage.from(SIGN_BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (!uploaded.error) return;
  const existing = await database.storage.from(SIGN_BUCKET).download(path);
  if (existing.error || sha256(Buffer.from(await existing.data.arrayBuffer())) !== expectedHash) {
    throw signError("Não foi possível guardar o PDF sem substituir outro arquivo.", 503);
  }
}
export async function finalize(database, documentId) {
  const signers = data(await database.from("sign_signers").select("*").eq("document_id", documentId).order("signing_order"));
  if (!signers.length || signers.some((item) => item.status !== "signed")) return;
  const claimTime = data(await database.rpc("sign_claim_finalization", { p_document_id: documentId }));
  if (!claimTime) return;
  const claimed = data(await database.from("sign_documents").select("*").eq("id", documentId).single());
  try {
    const originalFile = await database.storage.from(SIGN_BUCKET).download(claimed.original_path);
    if (originalFile.error) throw signError("Original indisponível.", 503);
    const original = Buffer.from(await originalFile.data.arrayBuffer());
    if (sha256(original) !== claimed.original_sha256) throw signError("Original alterado.", 503);
    const fields = data(await database.from("sign_fields").select("*").eq("document_id", documentId));
    const events = data(await database.from("sign_events").select("event_index,created_at,event_type,event_hash,signer_id").eq("document_id", documentId).order("event_index"));
    const code = randomToken();
    const base = process.env.SIGN_PUBLIC_BASE_URL;
    if (!base || !/^https:\/\//.test(base)) throw signError("Endereço público não configurado.", 503);
    const verificationUrl = `${base.replace(/\/$/, "")}/luce-sign/verificar/#codigo=${encodeURIComponent(code)}`;
    const built = await buildFinalPdf({ original, document: claimed, signers, fields, events, verificationUrl });
    const prefix = `${claimed.organization_id}/${documentId}/final`;
    const finalPath = `${prefix}/${built.finalSha256}.pdf`;
    const evidencePath = `${prefix}/evidencias-${built.evidenceSha256}.pdf`;
    await uploadImmutable(database, finalPath, built.finalBytes, built.finalSha256);
    await uploadImmutable(database, evidencePath, built.evidenceBytes, built.evidenceSha256);
    const completed = data(await database.rpc("sign_complete_document", { p_document_id: documentId, p_claim: claimTime,
      p_verification_hash: sha256(code), p_final_path: finalPath, p_final_hash: built.finalSha256,
      p_evidence_path: evidencePath, p_evidence_hash: built.evidenceSha256 }));
    if (!completed) throw signError("Outra finalização já está em andamento.", 409);
  } catch (error) {
    await database.from("sign_documents").update({ finalizing_at: null }).eq("id", documentId).eq("finalizing_at", claimTime);
    throw error;
  }
}
export default async function handler(request, response) {
  setApiSecurityHeaders(response);
  response.setHeader("Cache-Control", "no-store");
  if (rejectDisallowedOrigin(request, response) || rejectLargeRequest(request, response, 8_000)) return;
  try {
    const database = db();
    const resource = String(request.query?.resource || "");
    const method = String(request.method || "GET").toUpperCase();
    if (!["verify", "link", "otp-verify", "account-auth", "document", "sign", "decline", "final"].includes(resource)) throw signError("Operação indisponível.", 404);
    const ip = clientIp(request) || "unknown";
    await limit(database, `public:${resource}:${ip}`, resource === "verify" ? 40 : 20, 3600);
    if (resource === "verify" && method === "POST") {
      const code = String(request.body?.codigo || "");
      if (!/^[A-Za-z0-9_-]{40,80}$/.test(code)) throw signError("Protocolo não encontrado.", 404);
      const document = data(await database.from("sign_documents").select("id,status,completed_at,original_sha256,final_sha256")
        .eq("verification_code", sha256(code)).eq("status", "completed").maybeSingle());
      if (!document) throw signError("Protocolo não encontrado.", 404);
      const full = data(await database.from("sign_documents").select("final_path").eq("id", document.id).single());
      const finalFile = await database.storage.from(SIGN_BUCKET).download(full.final_path);
      if (finalFile.error || sha256(Buffer.from(await finalFile.data.arrayBuffer())) !== document.final_sha256) {
        throw signError("A integridade do arquivo final não pôde ser confirmada.", 503);
      }
      if (!data(await database.rpc("sign_verify_event_chain", { p_document_id: document.id }))) {
        throw signError("A integridade do histórico não pôde ser confirmada.", 503);
      }
      return send(response, 200, { id: document.id, status: document.status, completed_at: document.completed_at,
        original_sha256: document.original_sha256, final_sha256: document.final_sha256 });
    }
    if (resource === "link" && method === "POST") {
      const { signer, document } = await linkSigner(database, String(request.body?.token || ""));
      if (signer.status === "invited") {
        const viewed = data(await database.from("sign_signers").update({ status: "viewed", updated_at: new Date().toISOString() })
          .eq("id", signer.id).eq("status", "invited").select("id").maybeSingle());
        if (viewed) await record(database, signer, "invite.opened", {}, request);
      }
      return send(response, 200, { signer: signer.full_name, document: document.title, status: signer.status,
        email_hint: signer.email ? signer.email.replace(/^(.{1,2}).*(@.*)$/, "$1***$2") : null });
    }
    if (resource === "account-auth" && method === "POST") {
      const { signer } = await linkSigner(database, String(request.body?.token || ""));
      await limit(database, `account:${signer.id}:${ip}`, 5, 3600);
      const email = String(request.body?.email || "").trim().toLowerCase();
      const password = String(request.body?.password || "");
      if (!signer.email || email !== signer.email.toLowerCase() || !password || password.length > 128) {
        throw signError("Credenciais inválidas para este signatário.", 401);
      }
      const anonKey = process.env.SUPABASE_ANON_KEY;
      if (!anonKey) throw signError("Autenticação do Portal indisponível.", 503);
      const auth = createClient(process.env.SUPABASE_URL, anonKey,
        { auth: { persistSession: false, autoRefreshToken: false } });
      const login = await auth.auth.signInWithPassword({ email, password });
      const account = login.data?.user;
      if (login.error || !account || account.email?.toLowerCase() !== email || !account.email_confirmed_at ||
        ["pending", "rejected", "suspended"].includes(String(account.app_metadata?.status || "approved").toLowerCase())) {
        throw signError("Conta não confirmada ou credenciais inválidas.", 401);
      }
      const session = randomToken();
      const changed = data(await database.rpc("sign_verify_portal_account", {
        p_signer_id: signer.id, p_session_hash: sha256(session), p_account_id: account.id,
        p_ip_address: clientIp(request), p_user_agent: String(request.headers["user-agent"] || "").slice(0, 500),
      }));
      if (!changed) throw signError("Este link não permite autenticação.", 409);
      return send(response, 200, { session, expires_in: 1800 });
    }
    if (resource === "otp-verify" && method === "POST") {
      const { signer } = await linkSigner(database, String(request.body?.token || ""));
      await limit(database, `verify:${signer.id}:${ip}`, 10, 3600);
      const code = String(request.body?.code || "");
      if (!/^\d{6}$/.test(code) || !signer.otp_hash || !signer.otp_expires_at ||
        Date.parse(signer.otp_expires_at) <= Date.now() || signer.otp_attempts >= 5) throw signError("Código inválido ou expirado.", 401);
      const valid = equalHash(otpHash(signer.id, signer.otp_nonce, code), signer.otp_hash);
      if (!valid) {
        data(await database.rpc("sign_reject_otp", { p_signer_id: signer.id, p_otp_hash: signer.otp_hash,
          p_ip_address: clientIp(request), p_user_agent: String(request.headers["user-agent"] || "").slice(0, 500) }));
        throw signError("Código inválido ou expirado.", 401);
      }
      const session = randomToken();
      const changed = data(await database.rpc("sign_verify_otp", { p_signer_id: signer.id, p_otp_hash: signer.otp_hash,
        p_session_hash: sha256(session), p_ip_address: clientIp(request),
        p_user_agent: String(request.headers["user-agent"] || "").slice(0, 500) }));
      if (!changed) throw signError("Código já utilizado ou expirado.", 401);
      return send(response, 200, { session, expires_in: 1800 });
    }
    if (["document", "sign", "decline", "final"].includes(resource)) {
      const { signer, document, token } = await sessionSigner(database, request);
      if (resource === "decline" && method === "POST") {
        const declined = data(await database.rpc("sign_decline_document", { p_signer_id: signer.id,
          p_session_hash: sha256(token), p_ip_address: clientIp(request),
          p_user_agent: String(request.headers["user-agent"] || "").slice(0, 500) }));
        if (!declined) throw signError("Não foi possível registrar a recusa.", 409);
        return send(response, 200, { declined: true });
      }
      if (resource === "document" && method === "GET") {
        if (!document.original_path || !["sent", "viewed", "partially_signed"].includes(document.status)) throw signError("Documento indisponível.", 409);
        return file(database, response, document.original_path, document.original_sha256, "documento-original.pdf");
      }
      if (resource === "final" && method === "GET") {
        if (document.status !== "completed" || !document.final_path) throw signError("Documento final ainda não disponível.", 409);
        return file(database, response, document.final_path, document.final_sha256, "documento-assinado.pdf");
      }
      if (resource === "sign" && method === "POST") {
        if (request.body?.consent !== true || request.body?.consent_version !== "v1") throw signError("Confirme seu consentimento para assinar.");
        const name = String(request.body?.signature_text || "").trim();
        if (name !== signer.full_name) throw signError("Digite exatamente o nome cadastrado para assinar.");
        const accepted = data(await database.rpc("sign_accept_signature", { p_signer_id: signer.id,
          p_session_hash: sha256(token), p_signature_text: name, p_consent_version: "v1",
          p_ip_address: clientIp(request), p_user_agent: String(request.headers["user-agent"] || "").slice(0, 500) }));
        if (!accepted) throw signError("Assinatura não autorizada ou sessão expirada.", 409);
        try { await finalize(database, document.id); }
        catch (error) { console.error("LUCE Sign finalization pending", error); }
        return send(response, 200, { signed: true, message: "Assinatura registrada. O PDF final será disponibilizado após todas as assinaturas e a montagem das evidências." });
      }
    }
    throw signError("Operação indisponível.", 404);
  } catch (error) {
    if (!error?.status) console.error("LUCE Sign public API failure", error);
    return send(response, error?.status || 500, { error: error?.status ? error.message : "Falha interna no LUCE Sign." });
  }
}
