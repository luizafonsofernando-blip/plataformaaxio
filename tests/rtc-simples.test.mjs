import test from "node:test";
import assert from "node:assert/strict";
import { fetchSimplesActivities } from "../server-assets/rtc-official.mjs";
import handler from "../api/rtc/simples-activities.js";

const config = { RTC_SIMPLES_ENGINE_URL: "https://simples.example/", RTC_SIMPLES_ENGINE_TOKEN: "test-token" };
const originalFetch = globalThis.fetch;
const originalRateLimit = process.env.LUCE_RATE_LIMIT_ENABLED;

test.before(() => { process.env.LUCE_RATE_LIMIT_ENABLED = "false"; });
test.after(() => {
  globalThis.fetch = originalFetch;
  if (originalRateLimit === undefined) delete process.env.LUCE_RATE_LIMIT_ENABLED;
  else process.env.LUCE_RATE_LIMIT_ENABLED = originalRateLimit;
});

test("Simples connector fails closed without a private gateway", async () => {
  await assert.rejects(fetchSimplesActivities("2026-11-17", {}), (error) => error.code === "engine_not_configured");
  await assert.rejects(fetchSimplesActivities("2026-11-17", { ...config, RTC_SIMPLES_ENGINE_URL: "http://simples.example/" }), (error) => error.code === "engine_not_configured");
});

test("Simples connector checks version and returns official activity data", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), auth: options.headers.authorization });
    return new Response(JSON.stringify(calls.length === 1
      ? { versaoApp: "0.0.6", versaoDb: "2026-11" }
      : [{ codigo: "09", descricao: "Prestação de serviços", disponivel: true, tpDocsAdmissiveis: ["55"] }]));
  };
  const result = await fetchSimplesActivities("2026-11-17", config);
  assert.equal(result.rows[0].codigo, "09");
  assert.equal(result.engineVersion, "0.0.6");
  assert.equal(calls[0].url, "https://simples.example/api/versao");
  assert.equal(calls[1].url, "https://simples.example/api/calculadora/simples-nacional/atividades?data=2026-11-17");
  assert.ok(calls.every((call) => call.auth === "Bearer test-token"));
});

test("Simples connector rejects mismatched version before data request", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response(JSON.stringify({ versaoApp: "0.0.7" })); };
  await assert.rejects(fetchSimplesActivities("2026-11-17", config), (error) => error.code === "engine_version_mismatch");
  assert.equal(calls, 1);
});

test("Simples API requires an authenticated module user", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error("unexpected"); };
  const response = { setHeader() { return this; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ method: "GET", headers: { host: "localhost:3000" }, query: { data: "2026-11-17" } }, response);
  assert.equal(response.statusCode, 401);
  assert.equal(calls, 0);
});
