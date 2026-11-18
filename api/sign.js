import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import {
  rejectDisallowedOrigin,
  rejectLargeRequest,
  rejectRateLimited,
  requireActiveModuleUser,
  setApiSecurityHeaders,
} from "./_security.js";
import {
  SIGN_BUCKET, UUID, cleanText, decodePdf, inspectPdf, isEditor, signError,
  validateDocumentInput, validateSignerInput,
} from "../server-assets/luce-sign.mjs";
import { fieldInput, inviteToken, otpHash, randomCode, sha256 } from "../server-assets/luce-sign-flow.mjs";
import publicHandler, { finalize } from "../server-assets/luce-sign-public.mjs";

const MAX_BODY = 3_000_000;

function json(response, status, data) {
  setApiSecurityHeaders(response);
  return response.status(status).json(data);
}

function database() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw signError("LUCE Sign não está configurado no servidor.", 503);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function result(value) {
  if (value.error) throw signError("Falha ao acessar os dados do LUCE Sign.", 503);
  return value.data;
}

async function membership(db, userId, organizationId) {
  if (!UUID.test(String(organizationId || ""))) throw signError("Organização inválida.");
  const rows = result(await db.from("sign_members").select("role").eq("organization_id", organizationId).eq("user_id", userId).limit(1));
  if (!rows?.length) throw signError("Acesso não autorizado a esta organização.", 403);
  return rows[0].role;
}

async function documentFor(db, userId, documentId) {
  if (!UUID.test(String(documentId || ""))) throw signError("Documento inválido.");
  const rows = result(await db.from("sign_documents").select("*").eq("id", documentId).is("deleted_at", null).limit(1));
  const document = rows?.[0];
  if (!document) throw signError("Documento não encontrado.", 404);
  const role = await membership(db, userId, document.organization_id);
  return { document, role };
}

export default async function handler(request, response) {
  const resource = String(request.query?.resource || "bootstrap");
  if (["verify", "link", "otp-verify", "account-auth", "document", "sign", "decline", "final"].includes(resource)) {
    return publicHandler(request, response);
  }
  setApiSecurityHeaders(response);
  if (rejectDisallowedOrigin(request, response)) return;
  if (rejectLargeRequest(request, response, MAX_BODY)) return;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("LUCE Sign configuration missing", {
      supabaseUrl: Boolean(process.env.SUPABASE_URL),
      serviceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    });
    return json(response, 503, { error: "LUCE Sign não está configurado no servidor." });
  }
  if (await rejectRateLimited(request, response, { action: "luce_sign", limit: 60, windowSeconds: 60 })) return;
  const user = await requireActiveModuleUser(request, response, "luce-sign");
  if (!user) return;

  try {
    const db = database();
    const method = String(request.method || "GET").toUpperCase();
    if (resource === "logout" && method === "POST") {
      const url = process.env.SUPABASE_URL;
      const token = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
      const logout = await fetch(`${url}/auth/v1/logout?scope=local`, {
        method: "POST",
        headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${token}` },
      });
      if (!logout.ok) throw signError("Não foi possível encerrar a sessão no servidor.", 503);
      return json(response, 200, { ok: true });
    }
    if (resource === "bootstrap" && method === "GET") {
      const memberRows = result(await db.from("sign_members").select("organization_id,role").eq("user_id", user.id));
      const ids = memberRows.map((row) => row.organization_id);
      const organizations = ids.length
        ? result(await db.from("sign_organizations").select("id,name,cnpj").in("id", ids).order("name"))
        : [];
      const organizationId = String(request.query?.organization_id || organizations[0]?.id || "");
      if (!organizationId) return json(response, 200, { organizations, documents: [], signers: [], role: null });
      const role = await membership(db, user.id, organizationId);
      const documents = result(await db.from("sign_documents")
        .select("id,title,category,status,original_sha256,original_size,page_count,final_sha256,completed_at,created_at,updated_at,created_by")
        .eq("organization_id", organizationId).is("deleted_at", null).order("created_at", { ascending: false }).limit(100));
      const documentIds = documents.map((document) => document.id);
      const signers = documentIds.length
        ? result(await db.from("sign_signers").select("id,document_id,full_name,email,role,signing_order,status,link_expires_at").in("document_id", documentIds))
        : [];
      const fields = documentIds.length
        ? result(await db.from("sign_fields").select("signer_id,document_id,page_number,x,y,width,height").in("document_id", documentIds))
        : [];
      return json(response, 200, { organizations, organizationId, documents, signers, fields, role });
    }

    if (resource === "organizations" && method === "POST") {
      if (user.app_metadata?.role !== "admin") throw signError("Apenas administradores podem criar organizações.", 403);
      const name = cleanText(request.body?.name, 160);
      const cnpj = String(request.body?.cnpj || "").replace(/\D/g, "");
      if (name.length < 2 || name.length > 160 || (cnpj && cnpj.length !== 14)) throw signError("Nome ou CNPJ inválido.");
      const organization = result(await db.from("sign_organizations").insert({ name, cnpj: cnpj || null, created_by: user.id }).select("id,name,cnpj").single());
      return json(response, 201, { organization });
    }

    if (resource === "documents" && method === "POST") {
      const organizationId = request.body?.organization_id;
      const role = await membership(db, user.id, organizationId);
      if (!isEditor(role)) throw signError("Você não pode criar documentos nesta organização.", 403);
      const input = validateDocumentInput(request.body);
      const document = result(await db.from("sign_documents").insert({
        ...input, organization_id: organizationId, created_by: user.id,
      }).select("id,title,category,status,created_at").single());
      return json(response, 201, { document });
    }

    if (resource === "signers" && method === "POST") {
      const { document, role } = await documentFor(db, user.id, request.body?.document_id);
      if (!isEditor(role) || document.status !== "draft") throw signError("O documento não aceita novos signatários.", 409);
      const signer = result(await db.from("sign_signers").insert({
        ...validateSignerInput(request.body), document_id: document.id, organization_id: document.organization_id, created_by: user.id,
      }).select("id,document_id,full_name,email,role,signing_order,status").single());
      return json(response, 201, { signer });
    }

    if (resource === "place-signer" && method === "POST") {
      const { document, role } = await documentFor(db, user.id, request.body?.document_id);
      if (!isEditor(role) || document.status !== "draft" || !document.original_path) {
        throw signError("O documento não aceita novas assinaturas.", 409);
      }
      const name = cleanText(request.body?.full_name, 160);
      if (name.length < 2 || name.length > 160) throw signError("Informe o nome completo do signatário.");
      const field = fieldInput(request.body, document.page_count);
      const signerId = result(await db.rpc("sign_place_signer", {
        p_document_id: document.id, p_actor_id: user.id, p_full_name: name,
        p_page_number: field.page_number, p_x: field.x, p_y: field.y,
        p_width: field.width, p_height: field.height,
      }));
      if (!signerId) throw signError("Não foi possível posicionar a assinatura.", 409);
      return json(response, 201, { signer_id: signerId });
    }

    if (resource === "fields" && method === "POST") {
      const { document, role } = await documentFor(db, user.id, request.body?.document_id);
      if (!isEditor(role) || document.status !== "draft" || !document.original_path) throw signError("Posição não pode ser alterada neste documento.", 409);
      const signerId = String(request.body?.signer_id || "");
      if (!UUID.test(signerId)) throw signError("Signatário inválido.");
      const signer = result(await db.from("sign_signers").select("id").eq("id", signerId).eq("document_id", document.id).maybeSingle());
      if (!signer) throw signError("Signatário não pertence ao documento.", 404);
      const field = fieldInput(request.body, document.page_count);
      const saved = result(await db.from("sign_fields").upsert({ ...field, signer_id: signerId,
        document_id: document.id, organization_id: document.organization_id }, { onConflict: "signer_id" })
        .select("signer_id,page_number,x,y,width,height").single());
      return json(response, 200, { field: saved });
    }

    if (resource === "prepare" && method === "POST") {
      const { document, role } = await documentFor(db, user.id, request.body?.document_id);
      if (!isEditor(role) || document.status !== "draft" || !document.original_path) throw signError("Documento não pode ser preparado.", 409);
      const signers = result(await db.from("sign_signers").select("id").eq("document_id", document.id));
      const fields = result(await db.from("sign_fields").select("signer_id").eq("document_id", document.id));
      if (!signers.length || signers.some((signer) => !fields.some((field) => field.signer_id === signer.id))) {
        throw signError("Defina uma posição de assinatura para cada signatário.");
      }
      const prepared = result(await db.from("sign_documents").update({ status: "prepared", updated_at: new Date().toISOString(), updated_by: user.id })
        .eq("id", document.id).eq("status", "draft").select("id").maybeSingle());
      if (!prepared) throw signError("Documento já foi preparado.", 409);
      result(await db.from("sign_events").insert({ document_id: document.id, organization_id: document.organization_id,
        actor_id: user.id, event_type: "document.prepared" }));
      return json(response, 200, { prepared: true });
    }

    if (resource === "generate-links" && method === "POST") {
      const { document, role } = await documentFor(db, user.id, request.body?.document_id);
      if (!isEditor(role) || !["prepared", "sent", "viewed", "partially_signed"].includes(document.status)) {
        throw signError("Documento não está pronto para assinatura.", 409);
      }
      const base = process.env.SIGN_PUBLIC_BASE_URL;
      if (!base || !/^https:\/\//.test(base)) throw signError("Endereço público não configurado.", 503);
      const days = Math.min(30, Math.max(1, Number.parseInt(process.env.SIGN_LINK_VALIDITY_DAYS || "7", 10) || 7));
      const signers = result(await db.from("sign_signers").select("*").eq("document_id", document.id).order("signing_order"));
      const links = [];
      for (const signer of signers) {
        if (["signed", "declined"].includes(signer.status)) continue;
        const active = signer.link_nonce && signer.link_hash && Date.parse(signer.link_expires_at || "") > Date.now() && signer.status !== "expired";
        const nonce = active ? signer.link_nonce : randomBytes(16).toString("hex");
        const token = inviteToken(signer.id, nonce);
        const expires = active ? signer.link_expires_at : new Date(Date.now() + days * 86400_000).toISOString();
        if (!active) {
          result(await db.from("sign_signers").update({ link_nonce: nonce, link_hash: sha256(token),
            link_expires_at: expires, status: "invited", session_hash: null, session_expires_at: null,
            updated_at: new Date().toISOString() }).eq("id", signer.id).eq("document_id", document.id));
          result(await db.from("sign_events").insert({ document_id: document.id, organization_id: document.organization_id,
            actor_id: user.id, signer_id: signer.id, event_type: "invite.manual_link_created",
            details: { expires_at: expires, email_sent: false } }));
        }
        links.push({ signer_id: signer.id, name: signer.full_name,
          url: `${base.replace(/\/$/, "")}/luce-sign/assinar/#token=${token}`, expires_at: expires });
      }
      result(await db.from("sign_documents").update({ status: "sent", updated_at: new Date().toISOString(),
        updated_by: user.id }).eq("id", document.id).eq("status", "prepared"));
      return json(response, 200, { links });
    }

    if (resource === "access-code" && method === "POST") {
      const { document, role } = await documentFor(db, user.id, request.body?.document_id);
      if (!isEditor(role) || !["sent", "viewed", "partially_signed"].includes(document.status)) throw signError("Documento indisponível.", 409);
      const signerId = String(request.body?.signer_id || "");
      if (!UUID.test(signerId)) throw signError("Signatário inválido.");
      const signer = result(await db.from("sign_signers").select("*").eq("id", signerId).eq("document_id", document.id).maybeSingle());
      if (!signer || ["signed", "declined", "expired"].includes(signer.status) ||
        !signer.link_hash || !signer.link_expires_at || Date.parse(signer.link_expires_at) <= Date.now()) {
        throw signError("Signatário indisponível.", 409);
      }
      if (signer.otp_issued_at && Date.now() - Date.parse(signer.otp_issued_at) < 60_000) {
        throw signError("Aguarde um minuto antes de gerar outro código.", 429);
      }
      const today = new Date().toISOString().slice(0, 10);
      const count = signer.otp_counter_date === today ? signer.otp_send_count : 0;
      if (count >= 10) throw signError("Limite diário de códigos atingido.", 429);
      const code = randomCode(), nonce = randomBytes(16).toString("hex");
      const issued = result(await db.from("sign_signers").update({ otp_nonce: nonce, otp_hash: otpHash(signer.id, nonce, code),
        otp_expires_at: new Date(Date.now() + 600_000).toISOString(), otp_issued_at: new Date().toISOString(),
        otp_attempts: 0, otp_counter_date: today, otp_send_count: count + 1 })
        .eq("id", signer.id).eq("document_id", document.id).eq("otp_send_count", signer.otp_send_count)
        .select("id").maybeSingle());
      if (!issued) throw signError("Tente gerar o código novamente.", 409);
      result(await db.from("sign_events").insert({ document_id: document.id, organization_id: document.organization_id,
        actor_id: user.id, signer_id: signer.id, event_type: "access_code.generated_by_operator",
        details: { delivery: "manual", expires_in_seconds: 600 } }));
      return json(response, 200, { code, expires_in: 600 });
    }

    if (resource === "revoke-link" && method === "POST") {
      const { document, role } = await documentFor(db, user.id, request.body?.document_id);
      if (!isEditor(role) || !["sent", "viewed", "partially_signed"].includes(document.status)) throw signError("Documento indisponível.", 409);
      const signerId = String(request.body?.signer_id || "");
      if (!UUID.test(signerId)) throw signError("Signatário inválido.");
      const revoked = result(await db.from("sign_signers").update({ status: "expired", link_nonce: null,
        link_hash: null, link_expires_at: null, otp_hash: null, session_hash: null, session_expires_at: null,
        updated_at: new Date().toISOString() }).eq("id", signerId).eq("document_id", document.id)
        .in("status", ["invited", "viewed", "authenticated"]).select("id").maybeSingle());
      if (!revoked) throw signError("Link não pode ser revogado.", 409);
      result(await db.from("sign_events").insert({ document_id: document.id, organization_id: document.organization_id,
        actor_id: user.id, signer_id: signerId, event_type: "invite.revoked" }));
      return json(response, 200, { revoked: true });
    }

    if (resource === "cancel" && method === "POST") {
      const { document, role } = await documentFor(db, user.id, request.body?.document_id);
      if (!isEditor(role)) throw signError("Você não pode cancelar este documento.", 403);
      const cancelled = result(await db.rpc("sign_cancel_document", { p_document_id: document.id, p_actor_id: user.id }));
      if (!cancelled) throw signError("Este documento não pode ser cancelado.", 409);
      return json(response, 200, { status: "cancelled" });
    }

    if (resource === "delete" && method === "POST") {
      const { document, role } = await documentFor(db, user.id, request.body?.document_id);
      if (!isEditor(role)) throw signError("Você não pode excluir este documento.", 403);
      const deleted = result(await db.rpc("sign_hide_document", { p_document_id: document.id, p_actor_id: user.id }));
      if (!deleted) throw signError("Este documento já foi excluído.", 409);
      return json(response, 200, { deleted: true });
    }

    if (resource === "finalize" && method === "POST") {
      const { document, role } = await documentFor(db, user.id, request.body?.document_id);
      if (!isEditor(role) || document.status !== "partially_signed") throw signError("Documento não está pronto para finalização.", 409);
      await finalize(db, document.id);
      const current = result(await db.from("sign_documents").select("status").eq("id", document.id).single());
      return json(response, 200, { status: current.status });
    }

    if (resource === "upload" && method === "POST") {
      const { document, role } = await documentFor(db, user.id, request.body?.document_id);
      if (!isEditor(role) || document.status !== "draft" || document.original_path) throw signError("Este documento não aceita novo arquivo.", 409);
      const { bytes, sha256 } = decodePdf(request.body?.base64);
      const pageCount = await inspectPdf(bytes);
      const path = `${document.organization_id}/${document.id}/original/${sha256}.pdf`;
      const uploaded = await db.storage.from(SIGN_BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: false });
      if (uploaded.error) throw signError("Não foi possível guardar o PDF no armazenamento privado.", 503);
      const updated = await db.from("sign_documents").update({
        original_path: path, original_sha256: sha256, original_size: bytes.length, page_count: pageCount,
        updated_by: user.id, updated_at: new Date().toISOString(),
      }).eq("id", document.id).eq("organization_id", document.organization_id).is("original_path", null).select("id,original_sha256,original_size").single();
      if (updated.error) {
        await db.storage.from(SIGN_BUCKET).remove([path]);
        throw signError("Não foi possível vincular o PDF ao documento.", 503);
      }
      return json(response, 200, { document: updated.data });
    }

    if (resource === "file" && method === "GET") {
      const { document } = await documentFor(db, user.id, request.query?.id);
      const variant = String(request.query?.variant || "original");
      if (!["original", "final", "evidence"].includes(variant)) throw signError("Tipo de arquivo inválido.");
      const path = variant === "original" ? document.original_path : variant === "final" ? document.final_path : document.evidence_path;
      const expected = variant === "original" ? document.original_sha256 : variant === "final" ? document.final_sha256 : document.evidence_sha256;
      if (!path || !expected) throw signError("Arquivo ainda não disponível.", 404);
      const download = await db.storage.from(SIGN_BUCKET).download(path);
      if (download.error) throw signError("Não foi possível abrir o PDF.", 503);
      const bytes = Buffer.from(await download.data.arrayBuffer());
      if (createHash("sha256").update(bytes).digest("hex") !== expected) {
        throw signError("A integridade do PDF não pôde ser confirmada.", 503);
      }
      response.setHeader("Content-Type", "application/pdf");
      response.setHeader("Content-Disposition", `${variant === "original" ? "inline" : "attachment"}; filename="${variant}-${document.id}.pdf"`);
      return response.status(200).send(bytes);
    }

    return json(response, 404, { error: "Operação indisponível." });
  } catch (error) {
    if (!error?.status) console.error("LUCE Sign API failure", error);
    return json(response, error?.status || 500, { error: error?.status ? error.message : "Falha interna no LUCE Sign." });
  }
}
