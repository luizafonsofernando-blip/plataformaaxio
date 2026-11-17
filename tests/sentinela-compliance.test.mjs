import test from "node:test";
import assert from "node:assert/strict";
import { analyzeComplianceExtract, complianceCaseInput } from "../server-assets/sentinela-compliance.mjs";

const context = {
  organizationId: "22222222-2222-4222-8222-222222222222",
  user: { id: "11111111-1111-4111-8111-111111111111" },
};

const extract = {
  text: "RELATÓRIO GERENCIAL DO SETOR DE COMPLIANCE\nPeríodo de referência: agosto/2026 | Base atualizada até 03/09/2026",
  tables: [
    [
      ["Indicador", "Resultado"],
      ["Empresas analisadas — Controle Interno", "188"],
      ["DCTFWeb analisadas", "152"],
      ["DCTFWeb resolvidas", "106"],
      ["DCTFWeb ainda em aberto", "46"],
      ["Abertas com responsável atribuído", "39"],
      ["Abertas sem responsável identificado", "7"],
      ["Empresas sem pendência identificada", "16"],
      ["MAED geradas", "8 empresas / R$ 925,00"],
      ["Tempo médio de resposta apurável", "5,4 dias"],
    ],
    [
      ["Empresa", "Competência", "Responsável", "Situação registrada"],
      ["Empresa A", "05/2026", "Ana — Pessoal", "Questionamos sobre a atualização"],
    ],
    [
      ["Empresa", "IMPOSTOS", "TAREFA NO GESTTA"],
      ["Empresa B", "INSS", "Em análise"],
    ],
    [
      ["Empresa", "Obrigação", "Competência", "Valor", "Observação"],
      ["Empresa C", "DCTFWeb", "05/2026", "R$ 50,00", "DARF vence em 16/09/2026"],
    ],
  ],
};

test("extrai indicadores institucionais e período do relatório", () => {
  const result = analyzeComplianceExtract(extract, "Relatorio_03.09.2026.docx");
  assert.equal(result.period.start, "2026-08-01");
  assert.equal(result.period.end, "2026-09-03");
  assert.equal(result.metrics.monitoredCompanies, 188);
  assert.equal(result.metrics.resolvedCases, 106);
  assert.equal(result.metrics.maedAmountCents, 92500);
});

test("separa controles interno, externo e MAED sem confundir atribuição com resolução", () => {
  const result = analyzeComplianceExtract(extract, "Relatorio.docx");
  assert.deepEqual(result.cases.map((item) => item.origin), ["internal", "external", "maed"]);
  assert.equal(result.cases[0].status, "assigned");
  assert.equal(result.cases[0].resolvedAt, null);
  assert.equal(result.cases[2].amountCents, 5000);
});

test("normaliza ocorrência para persistência por organização", () => {
  const result = complianceCaseInput({ title: "DCTFWeb pendente", origin: "internal", priority: "high", amount_cents: 12345 }, context);
  assert.equal(result.organization_id, context.organizationId);
  assert.equal(result.amount_cents, 12345);
  assert.equal(result.status, "identified");
  assert.equal(result.version, 1);
});

test("rejeita valor financeiro inválido", () => {
  assert.throws(() => complianceCaseInput({ title: "Débito fiscal", amount_cents: 12.5 }, context), /valor monetário válido/);
});
