import test from "node:test";
import assert from "node:assert/strict";
import { analyzeAssistedText } from "../server-assets/sentinela-assisted.mjs";

test("identifica CND regular, CNPJ e validade sem depender do portal", () => {
  const result = analyzeAssistedText(
    "CERTIDÃO NEGATIVA DE DÉBITOS. CNPJ 12.345.678/0001-90. Emitida em 06/09/2026. Válida até 05/03/2027.",
    "federal-cnd",
  );
  assert.equal(result.officialStatus, "regular");
  assert.deepEqual(result.cnpjs, ["12345678000190"]);
  assert.equal(result.issuedAt, "2026-09-06");
  assert.equal(result.expiresAt, "2027-03-05");
  assert.equal(result.portalGeneration, "portal-agnostic");
});

test("classifica CPEND como atenção", () => {
  const result = analyzeAssistedText(
    "CERTIDÃO POSITIVA COM EFEITOS DE NEGATIVA relativa ao CNPJ 12.345.678/0001-90.",
    "federal-cnd",
  );
  assert.equal(result.officialStatus, "attention");
});

test("situação fiscal com omissão produz pendência relevante", () => {
  const result = analyzeAssistedText(
    "Relatório de Situação Fiscal. Foi identificada omissão de declaração e pendência para o contribuinte.",
    "federal-situation",
  );
  assert.equal(result.officialStatus, "relevant");
});

test("alerta de caixa postal exige consulta ao canal oficial", () => {
  const result = analyzeAssistedText(
    "Receita Federal informa que uma nova comunicação foi recebida na Caixa Postal do contribuinte.",
    "federal-mailbox",
  );
  assert.equal(result.officialStatus, "attention");
  assert.equal(result.requiresPortalAccess, true);
  assert.equal(result.officialApi, false);
});

