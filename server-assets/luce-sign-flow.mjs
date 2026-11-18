import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { signError } from "./luce-sign.mjs";

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export const randomToken = () => randomBytes(32).toString("base64url");
export const randomCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
export const equalHash = (a, b) => {
  if (!/^[a-f0-9]{64}$/.test(a || "") || !/^[a-f0-9]{64}$/.test(b || "")) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
};
export function hmac(value) {
  const secret = process.env.SIGN_TOKEN_SECRET;
  if (!secret || secret.length < 32) throw signError("Segredo do LUCE Sign não configurado.", 503);
  return createHmac("sha256", secret).update(value).digest("hex");
}
export function inviteToken(signerId, nonce) { return hmac(`invite:${signerId}:${nonce}`); }
export function otpHash(signerId, nonce, code) { return hmac(`otp:${signerId}:${nonce}:${code}`); }
export function fieldInput(input, pageCount) {
  const page_number = Number(input?.page_number);
  const x = Number(input?.x), y = Number(input?.y), width = Number(input?.width), height = Number(input?.height);
  if (!Number.isInteger(page_number) || page_number < 1 || page_number > pageCount ||
    ![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width < 0.05 || height < 0.025 ||
    x + width > 1 || y + height > 1) throw signError("Posição de assinatura inválida.");
  return { page_number, x, y, width, height };
}
function safe(value) {
  return String(value ?? "").normalize("NFC")
    .replace(/[\u2013\u2014]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x20-\x7e\u00a0-\u00ff]/g, "?");
}
function wrap(text, font, size, maxWidth) {
  const rows = []; let row = "";
  for (const word of safe(text).split(/\s+/)) {
    const next = row ? `${row} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > maxWidth && row) { rows.push(row); row = word; }
    else row = next;
  }
  if (row) rows.push(row);
  return rows;
}
function line(page, text, x, y, width, font, size = 9, color = rgb(0.13, 0.2, 0.34)) {
  let cursor = y;
  for (const row of wrap(text, font, size, width)) {
    let part = row;
    while (part && font.widthOfTextAtSize(part, size) > width) {
      const n = Math.max(1, Math.floor(part.length * width / font.widthOfTextAtSize(part, size)));
      page.drawText(part.slice(0, n), { x, y: cursor, font, size, color });
      part = part.slice(n); cursor -= size + 4;
    }
    if (part) { page.drawText(part, { x, y: cursor, font, size, color }); cursor -= size + 4; }
  }
  return cursor;
}
export async function buildFinalPdf({ original, document, signers, fields, events, verificationUrl }) {
  const pdf = await PDFDocument.load(original, { ignoreEncryption: false });
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const signer of signers) {
    if (signer.status !== "signed" || !signer.signed_at) throw signError("Nem todos os signatários concluíram a assinatura.", 409);
    const field = fields.find((item) => item.signer_id === signer.id);
    if (!field || field.page_number > pdf.getPageCount()) throw signError("Campo de assinatura ausente.", 409);
    const page = pdf.getPage(field.page_number - 1);
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const x = field.x * pageWidth, y = pageHeight * (1 - field.y - field.height);
    const width = field.width * pageWidth, height = field.height * pageHeight;
    page.drawRectangle({ x, y, width, height, color: rgb(1, 1, 1), borderColor: rgb(0.18, 0.42, 0.73), borderWidth: 0.7, opacity: 0.92 });
    const size = Math.min(11, Math.max(7, height / 3.5));
    const label = safe(signer.signature_text || signer.full_name);
    let fitted = label;
    while (fitted.length > 1 && bold.widthOfTextAtSize(fitted, size) > width - 10) fitted = fitted.slice(0, -1);
    page.drawText(fitted, { x: x + 5, y: y + height - size - 4, font: bold, size, color: rgb(0.08, 0.17, 0.31) });
    page.drawText("Assinatura eletrônica - LUCE Sign", { x: x + 5, y: y + 4, font: regular, size: Math.min(6, size - 1), color: rgb(0.2, 0.3, 0.43) });
  }
  const evidence = await PDFDocument.create();
  const evidenceRegular = await evidence.embedFont(StandardFonts.Helvetica);
  const evidenceBold = await evidence.embedFont(StandardFonts.HelveticaBold);
  const ew = 595, eh = 842, margin = 46;
  let ep = evidence.addPage([ew, eh]), ey = eh - margin;
  const heading = (title) => { ep.drawText(safe(title), { x: margin, y: ey, font: evidenceBold, size: 14, color: rgb(0.06, 0.13, 0.25) }); ey -= 27; };
  const entry = (label, value) => { more(); ey = line(ep, `${label}: ${value || "Não disponível"}`, margin, ey, ew - 2 * margin, evidenceRegular, 9) - 7; };
  const more = () => { if (ey < 90) { ep = evidence.addPage([ew, eh]); ey = eh - margin; } };
  heading("RELATÓRIO DE EVIDÊNCIAS - LUCE SIGN");
  entry("Documento", document.title); entry("Identificador", document.id);
  entry("Estado", "Concluído por assinatura eletrônica");
  entry("SHA-256 do PDF original", document.original_sha256);
  entry("Modalidade", "Link individual com autenticação adicional registrada por signatário");
  entry("Verificação", verificationUrl);
  ey -= 8; heading("SIGNATÁRIOS");
  for (const signer of signers) {
    more(); entry("Nome", signer.full_name);
    if (signer.email) entry("E-mail", signer.email);
    entry("Consentimento (UTC)", signer.consented_at); entry("Assinatura (UTC)", signer.signed_at);
    const authentication = events.some((event) => event.signer_id === signer.id && event.event_type === "account.authenticated")
      ? "Conta confirmada do Portal Luce"
      : events.some((event) => event.signer_id === signer.id && event.event_type === "access_code.generated_by_operator")
        ? "Código gerado pelo operador; entrega manual não verificada pela plataforma"
        : "Código de uso único por e-mail";
    entry("Autenticação", authentication); ey -= 4;
  }
  more(); heading("HISTÓRICO DE EVENTOS");
  for (const event of events) { more(); entry(`#${event.event_index} ${event.created_at}`, event.event_type); }
  more();
  const qrData = await QRCode.toDataURL(verificationUrl, { margin: 1, width: 160, errorCorrectionLevel: "M" });
  const qr = await evidence.embedPng(Buffer.from(qrData.split(",")[1], "base64"));
  if (ey < 230) { ep = evidence.addPage([ew, eh]); ey = eh - margin; }
  ep.drawImage(qr, { x: margin, y: ey - 140, width: 140, height: 140 });
  line(ep, "Protocolo público de autenticidade", margin + 154, ey - 30, 350, evidenceBold, 9);
  line(ep, verificationUrl, margin + 154, ey - 48, 350, evidenceRegular, 8);
  line(ep, "Assinatura eletrônica com evidências de autenticação e manifestação de vontade. Não equivale a assinatura ICP-Brasil do signatário.", margin, ey - 162, ew - 2 * margin, evidenceRegular, 8);
  line(ep, "Referências normativas: Lei 14.063/2020, art. 4; MP 2.200-2/2001, art. 10. A modalidade aplicável depende do contexto do documento.", margin, ey - 190, ew - 2 * margin, evidenceRegular, 8);
  const evidenceBytes = Buffer.from(await evidence.save());
  const sealedEvidence = await PDFDocument.load(evidenceBytes);
  const pages = await pdf.copyPages(sealedEvidence, sealedEvidence.getPageIndices());
  for (const page of pages) pdf.addPage(page);
  const finalBytes = Buffer.from(await pdf.save());
  return { finalBytes, evidenceBytes, finalSha256: sha256(finalBytes), evidenceSha256: sha256(evidenceBytes) };
}
