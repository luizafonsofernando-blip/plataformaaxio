import test from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { buildFinalPdf, equalHash, fieldInput, inviteToken, otpHash, randomCode, sha256 } from "../server-assets/luce-sign-flow.mjs";

test("campos de assinatura exigem página e área válidas", () => {
  assert.deepEqual(fieldInput({ page_number: 1, x: 0.1, y: 0.7, width: 0.4, height: 0.1 }, 2),
    { page_number: 1, x: 0.1, y: 0.7, width: 0.4, height: 0.1 });
  assert.throws(() => fieldInput({ page_number: 3, x: 0.1, y: 0.7, width: 0.4, height: 0.1 }, 2));
  assert.throws(() => fieldInput({ page_number: 1, x: 0.8, y: 0.7, width: 0.4, height: 0.1 }, 2));
});

test("tokens e OTP são não reversíveis sem segredo e não aceitam hash inválido", () => {
  const previous = process.env.SIGN_TOKEN_SECRET;
  process.env.SIGN_TOKEN_SECRET = "segredo-local-de-teste-com-mais-de-trinta-e-dois-caracteres";
  try {
    const token = inviteToken("signer-1", "nonce-1");
    assert.match(token, /^[a-f0-9]{64}$/);
    assert.notEqual(token, inviteToken("signer-1", "nonce-2"));
    assert.match(randomCode(), /^\d{6}$/);
    assert.equal(equalHash(otpHash("signer-1", "nonce-1", "123456"), otpHash("signer-1", "nonce-1", "123456")), true);
    assert.equal(equalHash("x", "x"), false);
  } finally { if (previous === undefined) delete process.env.SIGN_TOKEN_SECRET; else process.env.SIGN_TOKEN_SECRET = previous; }
});

test("PDF final mantém original como fonte, adiciona relatório e produz hashes verificáveis", async () => {
  const pdf = await PDFDocument.create();
  const sourcePage = pdf.addPage([595, 842]);
  sourcePage.drawText("CONTEUDO ORIGINAL", { x: 55, y: 730, font: await pdf.embedFont(StandardFonts.Helvetica), size: 12 });
  const original = Buffer.from(await pdf.save());
  const document = { id: "doc-1", title: "Contrato de teste", original_sha256: sha256(original) };
  const signer = { id: "signer-1", full_name: "Ana Silva", email: "ana@exemplo.com", status: "signed",
    signature_text: "Ana Silva", consented_at: "2026-11-15T12:00:00Z", signed_at: "2026-11-15T12:01:00Z" };
  const built = await buildFinalPdf({ original, document, signers: [signer],
    fields: [{ signer_id: signer.id, page_number: 1, x: 0.1, y: 0.75, width: 0.4, height: 0.08 }],
    events: [{ event_index: 1, created_at: "2026-11-15T12:01:00Z", event_type: "signer.signed" }],
    verificationUrl: "https://exemplo.com/luce-sign/verificar/?codigo=abc123" });
  assert.equal(sha256(built.finalBytes), built.finalSha256);
  assert.equal(sha256(built.evidenceBytes), built.evidenceSha256);
  assert.equal((await PDFDocument.load(built.finalBytes)).getPageCount(), 2);
  assert.equal((await PDFDocument.load(built.evidenceBytes)).getPageCount(), 1);
  assert.equal(sha256(original), document.original_sha256);
  const task = getDocument({ data: new Uint8Array(built.finalBytes), isEvalSupported: false, useSystemFonts: false });
  try {
    const final = await task.promise;
    const first = await final.getPage(1);
    const text = (await first.getTextContent()).items.map((item) => item.str).join(" ");
    assert.match(text, /CONTEUDO ORIGINAL/);
    assert.match(text, /Ana Silva/);
  } finally { await task.destroy(); }
});

test("PDF preserva nomes acentuados e pagina relatório extenso", async () => {
  const pdf = await PDFDocument.create(); pdf.addPage([595, 842]);
  const original = Buffer.from(await pdf.save());
  const signer = { id: "s1", full_name: "João Gonçalves", email: "joao@exemplo.com", status: "signed",
    signed_at: "2026-11-15T12:00:00Z", consented_at: "2026-11-15T11:59:00Z" };
  const events = Array.from({ length: 65 }, (_, index) => ({ event_index: index + 1,
    created_at: "2026-11-15T12:00:00Z", event_type: `evidência.${index + 1}` }));
  const built = await buildFinalPdf({ original, document: { id: "d1", title: "Declaração", original_sha256: sha256(original) },
    signers: [signer], fields: [{ signer_id: "s1", page_number: 1, x: 0.1, y: 0.75, width: 0.4, height: 0.08 }],
    events, verificationUrl: "https://exemplo.com/luce-sign/verificar/#codigo=abc" });
  if (process.env.SIGN_PDF_QA_PATH) await writeFile(process.env.SIGN_PDF_QA_PATH, built.finalBytes);
  const task = getDocument({ data: new Uint8Array(built.evidenceBytes), isEvalSupported: false, useSystemFonts: false });
  try {
    const evidence = await task.promise;
    assert.ok(evidence.numPages > 1);
    const first = await evidence.getPage(1);
    const text = (await first.getTextContent()).items.map((item) => item.str).join(" ");
    assert.match(text, /João Gonçalves/);
  } finally { await task.destroy(); }
  const finalTask = getDocument({ data: new Uint8Array(built.finalBytes), isEvalSupported: false, useSystemFonts: false });
  try {
    const final = await finalTask.promise;
    const reportPage = await final.getPage(2);
    const reportText = (await reportPage.getTextContent()).items.map((item) => item.str).join(" ");
    assert.match(reportText, /João Gonçalves/);
    assert.match(reportText, /SHA-256 do PDF original/);
  } finally { await finalTask.destroy(); }
});
