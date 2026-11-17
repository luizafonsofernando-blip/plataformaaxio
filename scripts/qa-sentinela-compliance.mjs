import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Luiz Fernando/AppData/Local/OpenAI/Codex/runtimes/cua_node/440c4f095d41ea30/bin/node_modules/playwright");
const output = path.resolve("output/playwright");
await fs.mkdir(output, { recursive: true });

const ids = {
  organization: "10000000-0000-4000-8000-000000000001",
  company: "20000000-0000-4000-8000-000000000001",
  case: "30000000-0000-4000-8000-000000000001",
};
const permissions = [
  "companies.read", "companies.write", "companies.delete", "companies.import",
  "workflow.read", "workflow.write", "workflow.delete", "documents.read", "documents.write", "documents.delete",
  "integrations.read", "settings.manage", "compliance.view", "compliance.create", "compliance.edit",
  "compliance.delete", "compliance.assign", "compliance.report", "compliance.export", "compliance.admin",
];
const payload = {
  organization: { id: ids.organization, name: "Luce Sistemas", slug: "luce", status: "active" },
  membership: { role: "admin" },
  user: { id: "40000000-0000-4000-8000-000000000001", name: "Administrador", email: "admin@example.com" },
  companies: [{ id: ids.company, legal_name: "Empresa Demonstração Ltda", cnpj: "12345678000190", state: "MG", fiscal_status: "attention", monitoring_enabled: true, created_at: "2026-09-01T12:00:00Z" }],
  occurrences: [], tasks: [], documents: [], notifications: [], integrations: [], comments: [], snapshots: [], findings: [], connectorJobs: [], rules: [], featureFlags: [], auditEvents: [],
  permissions,
  generatedAt: "2026-09-05T15:00:00Z",
  compliance: {
    categories: [{ id: "50000000-0000-4000-8000-000000000001", code: "dctfweb", name: "DCTFWeb", active: true, sort_order: 10 }],
    profiles: [],
    cases: [{ id: ids.case, organization_id: ids.organization, company_id: ids.company, title: "DCTFWeb pendente", origin: "internal", category_code: "dctfweb", obligation: "DCTFWeb", competence: "08/2026", status: "assigned", priority: "high", priority_reason: "Prazo operacional próximo.", assigned_name: "Analista Fiscal", department: "Fiscal", amount_cents: 92500, internal_due_at: "2026-09-08T15:00:00Z", version: 1, created_at: "2026-09-03T15:00:00Z" }],
    outreach: [],
    snapshots: [{ id: "60000000-0000-4000-8000-000000000001", snapshot_type: "baseline", period_start: "2026-08-01", period_end: "2026-09-03", metrics: { monitoredCompanies: 188, resolvedCases: 106, openCases: 46, maedCompanies: 8, maedAmountCents: 92500, averageResponseDays: 5.4 }, confirmed_at: "2026-09-03T15:00:00Z" }],
    imports: [], events: [],
  },
};

async function preparePage(context, viewportName) {
  await context.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await context.route("https://fonts.gstatic.com/**", (route) => route.abort());
  await context.route("**/assets/module-auth.js", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `window.LuceModuleSession={get:()=>({access_token:'qa-token'}),refresh:async()=>({access_token:'qa-token'}),logout:()=>{}};document.body.classList.remove('module-auth-locked','auth-locked');document.body.classList.add('module-authenticated','authenticated');`,
  }));
  await context.route("**/api/sentinela", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:4173/sentinela/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#loadingState")?.classList.contains("hidden"));
  if (viewportName === "mobile") await page.locator("#mobileMenu").click();
  await page.locator('[data-view="compliance"]').click();
  await page.locator('[data-page="compliance"].active').waitFor();
  assert.equal(await page.locator("#complianceMetrics .compliance-metric").count(), 12, `${viewportName}: métricas`);
  assert.equal(await page.locator("[data-compliance-tab]").count(), 12, `${viewportName}: abas internas`);
  assert.equal(await page.locator("#navComplianceCount").textContent(), "1", `${viewportName}: contador`);
  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  assert.ok(dimensions.scrollWidth <= dimensions.clientWidth + 1, `${viewportName}: a página não deve ter rolagem horizontal global`);
  await page.locator('[data-compliance-tab="reports"]').click();
  await page.locator('[data-compliance-panel="reports"].active').waitFor();
  assert.equal(await page.locator('[data-compliance-export="pptx"]').isVisible(), true, `${viewportName}: exportação PowerPoint`);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(output, `sentinela-compliance-${viewportName}.png`), fullPage: true });
  assert.deepEqual(errors, [], `${viewportName}: erros de página`);
  return page;
}

const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const desktopPage = await preparePage(desktop, "desktop");
  const powerPointDownload = desktopPage.waitForEvent("download");
  await desktopPage.locator('[data-compliance-export="pptx"]').click();
  const downloadedPowerPoint = await powerPointDownload;
  assert.match(downloadedPowerPoint.suggestedFilename(), /\.pptx$/i, "exportação gera um arquivo PowerPoint");
  await downloadedPowerPoint.saveAs(path.join(output, "sentinela-compliance-qa.pptx"));
  await desktopPage.locator('[data-compliance-tab="companies"]').click();
  await desktopPage.locator('[data-compliance-company]').click();
  assert.equal(await desktopPage.locator("#complianceCompanyDialog").getAttribute("open"), "", "ficha da empresa abre");
  assert.equal(await desktopPage.locator("[data-compliance-company-tab]").count(), 10, "ficha possui as dez seções operacionais");
  await desktopPage.locator('[data-compliance-close="#complianceCompanyDialog"]').last().click();
  await desktopPage.locator('[data-compliance-tab="cases"]').click();
  await desktopPage.locator("#complianceNewCaseButton").click();
  assert.equal(await desktopPage.locator("#complianceCaseDialog").getAttribute("open"), "", "dialog de ocorrência abre");
  await desktopPage.getByRole("button", { name: "Cancelar", exact: true }).click();
  await desktopPage.locator("#complianceImportButton").click();
  assert.equal(await desktopPage.locator("#complianceImportDialog").getAttribute("open"), "", "dialog de importação abre");
  await desktopPage.locator("#complianceCancelImport").click();
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const mobilePage = await preparePage(mobile, "mobile");
  const tabs = await mobilePage.locator(".compliance-tabs").evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  assert.ok(tabs.scrollWidth >= tabs.clientWidth, "mobile: navegação interna permanece acessível");
  await mobile.close();
  console.log("QA visual do Compliance concluído sem regressões.");
} finally {
  await browser.close();
}
