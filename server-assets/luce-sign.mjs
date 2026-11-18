import { createHash } from "node:crypto";

export const SIGN_BUCKET = "luce-sign-private";
export const MAX_PDF_BYTES = 2 * 1024 * 1024;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function signError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

export function cleanText(value, max) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max + 1);
}

export function validateDocumentInput(input) {
  const title = cleanText(input?.title, 200);
  const category = cleanText(input?.category || "Outros", 100);
  if (title.length < 2 || title.length > 200) throw signError("Informe um nome de documento entre 2 e 200 caracteres.");
  if (category.length < 2 || category.length > 100) throw signError("Categoria inválida.");
  return { title, category };
}

export function validateSignerInput(input) {
  const full_name = cleanText(input?.full_name, 160);
  const email = cleanText(input?.email, 254).toLowerCase();
  const role = cleanText(input?.role || "Outro", 80);
  const signing_order = Number(input?.signing_order ?? 1);
  if (full_name.length < 2 || full_name.length > 160) throw signError("Informe o nome completo do signatário.");
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) throw signError("E-mail do signatário inválido.");
  if (role.length < 2 || role.length > 80) throw signError("Papel do signatário inválido.");
  if (!Number.isInteger(signing_order) || signing_order < 1 || signing_order > 100) throw signError("Ordem de assinatura inválida.");
  return { full_name, email: email || null, role, signing_order };
}

export function decodePdf(base64) {
  if (typeof base64 !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) {
    throw signError("Arquivo PDF inválido.");
  }
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > MAX_PDF_BYTES) throw signError("O PDF deve ter no máximo 2 MB.", 413);
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw signError("O arquivo não é um PDF válido.");
  if (!bytes.subarray(-2048).toString("latin1").includes("%%EOF")) throw signError("O PDF está incompleto.");
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export async function inspectPdf(bytes) {
  const { PDFDocument } = await import("pdf-lib");
  try {
    const document = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
    const pages = document.getPageCount();
    if (pages < 1 || pages > 500) throw signError("O PDF possui uma quantidade de páginas não permitida.");
    return pages;
  } catch (error) {
    if (error?.status) throw error;
    throw signError("O PDF não pôde ser validado. Arquivos protegidos ou danificados não são aceitos.");
  }
}

export function isEditor(role) {
  return ["admin", "manager", "operator"].includes(role);
}
