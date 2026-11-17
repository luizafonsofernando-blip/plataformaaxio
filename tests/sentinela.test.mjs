import test from "node:test";
import assert from "node:assert/strict";
import { companyInput, permissionsFor, requirePermission } from "../api/sentinela/index.js";

const userId = "11111111-1111-4111-8111-111111111111";
const context = (role = "analyst") => ({ membership: { role }, organizationId: "22222222-2222-4222-8222-222222222222", user: { id: userId } });

test("normaliza empresa para persistência central", () => {
  const company = companyInput({ cnpj: "12.345.678/0001-90", legal_name: "Empresa Teste", state: "mg", email: "financeiro@teste.com", monitoring_enabled: false }, context());
  assert.equal(company.cnpj, "12345678000190");
  assert.equal(company.state, "MG");
  assert.equal(company.email, "financeiro@teste.com");
  assert.equal(company.monitoring_enabled, false);
  assert.equal(company.organization_id, context().organizationId);
});

test("rejeita CNPJ incompleto", () => {
  assert.throws(() => companyInput({ cnpj: "123", legal_name: "Empresa Teste" }, context()), /CNPJ válido/);
});

test("viewer possui somente leitura", () => {
  assert.ok(permissionsFor(context("viewer")).includes("companies.read"));
  assert.ok(!permissionsFor(context("viewer")).includes("companies.write"));
  assert.throws(() => requirePermission(context("viewer"), "companies.write"), /não possui permissão/);
});

test("analista importa sem receber permissão destrutiva", () => {
  assert.ok(permissionsFor(context("analyst")).includes("companies.import"));
  assert.ok(!permissionsFor(context("analyst")).includes("companies.delete"));
});

test("administrador possui configuração integral", () => {
  assert.ok(permissionsFor(context("admin")).includes("settings.manage"));
  assert.doesNotThrow(() => requirePermission(context("admin"), "documents.delete"));
});
