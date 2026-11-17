import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Luiz Fernando/AppData/Local/OpenAI/Codex/runtimes/cua_node/440c4f095d41ea30/bin/node_modules/playwright");
const output = path.resolve("output/playwright");
await fs.mkdir(output, { recursive: true });
const alertFile = path.join(output, "caixa-postal-alerta-qa.txt");
await fs.writeFile(alertFile, "Receita Federal informa que uma nova comunicação foi recebida na Caixa Postal do contribuinte.", "utf8");

const company = { id: "20000000-0000-4000-8000-000000000001", legal_name: "Empresa Demonstração Ltda", cnpj: "12345678000190", fiscal_status: "attention" };
const payload = {
  organization: { id: "10000000-0000-4000-8000-000000000001", name: "Luce Sistemas", slug: "luce", status: "active" },
  membership: { role: "admin" }, user: { id: "40000000-0000-4000-8000-000000000001", name: "Administrador", email: "admin@example.com" },
  companies: [company], occurrences: [], tasks: [], documents: [], notifications: [], comments: [], snapshots: [], findings: [], connectorJobs: [], rules: [], featureFlags: [], auditEvents: [],
  integrations: [
    { code: "federal-cnd", name: "CND Federal / CPEND", status: "assisted", environment: "production", metadata: { access_mode: "assisted" } },
    { code: "federal-situation", name: "Situação Fiscal Federal", status: "assisted", environment: "production", metadata: { access_mode: "assisted" } },
    { code: "federal-mailbox", name: "Caixa Postal", status: "assisted", environment: "production", metadata: { access_mode: "assisted" } },
    { code: "dctfweb", name: "DCTFWeb", status: "development", environment: "configuration", metadata: {} },
  ],
  assistedIntakes: [{ id: "70000000-0000-4000-8000-000000000001", company_id: company.id, source_code: "federal-cnd", official_status: "regular", checked_at: "2026-09-06T12:00:00Z", valid_until: "2027-03-05T23:59:59Z" }],
  permissions: ["companies.read", "workflow.read", "documents.read", "integrations.read", "integrations.operate", "compliance.view", "compliance.admin"], generatedAt: "2026-09-06T12:00:00Z",
  compliance: { categories: [], profiles: [], cases: [], outreach: [], snapshots: [], imports: [], events: [] },
};

async function checkViewport(browser, viewport, name) {
  const context = await browser.newContext({ viewport });
  await context.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await context.route("https://fonts.gstatic.com/**", (route) => route.abort());
  await context.route("**/assets/module-auth.js", (route) => route.fulfill({ contentType: "application/javascript", body: "window.LuceModuleSession={get:()=>({access_token:'qa-token'}),refresh:async()=>({access_token:'qa-token'}),logout:()=>{}};document.body.classList.remove('module-auth-locked','auth-locked');" }));
  await context.route("**/api/sentinela", async (route) => {
    if (route.request().headers()["x-sentinela-operation"] === "fiscal-preview") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { sourceCode: "federal-mailbox", sourceName: "Alerta da Caixa Postal", officialStatus: "attention", cnpjs: [], issuedAt: null, expiresAt: null, summary: "Nova comunicação recebida.", requiresPortalAccess: true } }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:4173/sentinela/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#loadingState")?.classList.contains("hidden"));
  if (name === "mobile") await page.locator("#mobileMenu").click();
  await page.locator('[data-view="integrations"]').click();
  assert.equal(await page.locator(".assisted-action-card").count(), 3, `${name}: três fluxos assistidos`);
  assert.equal(await page.locator("#integrationCards .badge.assisted").count(), 3, `${name}: integrações identificadas como assistidas`);
  await page.locator('[data-assisted-open="federal-mailbox"]').click();
  assert.equal(await page.locator("#assistedIntakeDialog").getAttribute("open"), "", `${name}: diálogo abre`);
  await page.locator("#assistedFile").setInputFiles(alertFile);
  await page.locator("#assistedPreviewButton").click();
  await page.locator("#assistedPreview:not(.hidden)").waitFor();
  assert.equal(await page.locator("#assistedConfirmButton").isVisible(), true, `${name}: confirmação disponível após prévia`);
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  assert.ok(width.scroll <= width.client + 1, `${name}: sem rolagem horizontal global`);
  await page.screenshot({ path: path.join(output, `sentinela-assisted-${name}.png`), fullPage: true });
  assert.deepEqual(errors, [], `${name}: sem erros de página`);
  await context.close();
}

const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
try {
  await checkViewport(browser, { width: 1440, height: 900 }, "desktop");
  await checkViewport(browser, { width: 390, height: 844 }, "mobile");
  console.log("QA visual do monitoramento fiscal assistido concluído sem regressões.");
} finally {
  await browser.close();
}
