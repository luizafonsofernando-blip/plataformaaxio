import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import formidable from "formidable";

export const SENTINELA_UPLOAD_BYTES = 4 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain", "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

function field(fields, name, max = 500) {
  const value = Array.isArray(fields[name]) ? fields[name][0] : fields[name];
  return String(value || "").trim().slice(0, max);
}

function safeFilename(value) {
  const parsed = path.parse(String(value || "documento"));
  const base = parsed.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "documento";
  const extension = parsed.ext.toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 10);
  return `${base}${extension}`;
}

function parseForm(request) {
  const form = formidable({ maxFileSize: SENTINELA_UPLOAD_BYTES, multiples: false, allowEmptyFiles: false });
  return new Promise((resolve, reject) => form.parse(request, (error, fields, files) => error ? reject(error) : resolve({ fields, files })));
}

export async function uploadSentinelaDocument(request, context, supabase, audit) {
  let storagePath = "";
  try {
    const { fields, files } = await parseForm(request);
    const uploaded = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!uploaded) throw Object.assign(new Error("Selecione um arquivo."), { status: 400 });
    if (!ALLOWED_TYPES.has(uploaded.mimetype)) throw Object.assign(new Error("Formato de arquivo não permitido."), { status: 415 });
    if (!["analyst", "supervisor", "admin"].includes(context.membership.role)) throw Object.assign(new Error("Seu perfil não possui permissão para registrar documentos."), { status: 403 });
    const companyId = field(fields, "company_id", 80) || null;
    const occurrenceId = field(fields, "occurrence_id", 80) || null;
    const filename = safeFilename(uploaded.originalFilename);
    storagePath = `${context.organizationId}/${companyId || "geral"}/${randomUUID()}-${filename}`;
    const buffer = fs.readFileSync(uploaded.filepath);
    const { error: uploadError } = await supabase.storage.from("sentinel-documents").upload(storagePath, buffer, { contentType: uploaded.mimetype, upsert: false, cacheControl: "3600" });
    if (uploadError) throw uploadError;
    const payload = {
      organization_id: context.organizationId, company_id: companyId, occurrence_id: occurrenceId,
      category: field(fields, "category", 80) || "evidence", name: field(fields, "name", 200) || uploaded.originalFilename,
      source: field(fields, "source", 100) || "manual", storage_path: storagePath, mime_type: uploaded.mimetype,
      size_bytes: uploaded.size, issued_at: field(fields, "issued_at", 10) || null, expires_at: field(fields, "expires_at", 10) || null,
      created_by: context.user.id,
    };
    const { data: document, error: insertError } = await supabase.from("sentinel_documents").insert(payload).select("*").single();
    if (insertError) throw insertError;
    await audit(request, context, "documents_created", "documents", document.id, null, document);
    return document;
  } catch (error) {
    if (storagePath) await supabase.storage.from("sentinel-documents").remove([storagePath]);
    if (error?.code === 1009) throw Object.assign(new Error("O arquivo excede o limite de 4 MB."), { status: 413 });
    throw error;
  }
}
