import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { decodePdf, inspectPdf, isEditor, validateDocumentInput, validateSignerInput } from "../server-assets/luce-sign.mjs";

test("normaliza documento sem aceitar campos vazios", () => {
  assert.deepEqual(validateDocumentInput({ title: "  Contrato   2026 ", category: "Outros" }), { title: "Contrato 2026", category: "Outros" });
  assert.throws(() => validateDocumentInput({ title: " " }), /nome de documento/);
});

test("valida signatário e ordem de assinatura", () => {
  assert.equal(validateSignerInput({ full_name: "Maria Silva", email: "MARIA@EXEMPLO.COM" }).email, "maria@exemplo.com");
  assert.equal(validateSignerInput({ full_name: "Maria Silva" }).email, null);
  assert.throws(() => validateSignerInput({ full_name: "M", email: "invalido" }), /nome completo/);
  assert.throws(() => validateSignerInput({ full_name: "Maria Silva", email: "maria@exemplo.com", signing_order: 0.5 }), /Ordem/);
});

test("rejeita arquivo sem assinatura PDF e calcula hash determinístico", () => {
  assert.throws(() => decodePdf(Buffer.from("texto").toString("base64")), /PDF/);
  const content = Buffer.from("%PDF-1.4\n%%EOF\n");
  const parsed = decodePdf(content.toString("base64"));
  assert.equal(parsed.sha256, createHash("sha256").update(content).digest("hex"));
});

test("não aceita PDF estruturalmente inválido", async () => {
  await assert.rejects(() => inspectPdf(Buffer.from("%PDF-1.4\n%%EOF\n")), /não pôde ser validado/);
});

test("conta as páginas de um PDF estruturalmente válido", async () => {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>",
    "<< /Length 0 >>\nstream\n\nendstream",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, body] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  assert.equal(await inspectPdf(Buffer.from(pdf)), 1);
});

test("somente perfis de edição podem preparar documentos", () => {
  assert.equal(isEditor("operator"), true);
  assert.equal(isEditor("viewer"), false);
});
