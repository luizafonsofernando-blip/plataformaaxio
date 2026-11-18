import test from "node:test";
import assert from "node:assert/strict";
import { calculateRegularOperation, fetchRegularClassifications, fetchRegularCode, RtcEngineError, validOperationDate } from "../server-assets/rtc-official.mjs";
import handler from "../api/rtc/classifications.js";
import codeHandler from "../api/rtc/code.js";
import calculateHandler from "../api/rtc/calculate.js";

const config = { RTC_REGULAR_ENGINE_URL: "https://engine.example/", RTC_REGULAR_ENGINE_TOKEN: "test-token" };
const originalFetch = globalThis.fetch;
const originalRateLimit = process.env.LUCE_RATE_LIMIT_ENABLED;

test.before(() => { process.env.LUCE_RATE_LIMIT_ENABLED = "false"; });
test.after(() => {
  globalThis.fetch = originalFetch;
  if (originalRateLimit === undefined) delete process.env.LUCE_RATE_LIMIT_ENABLED;
  else process.env.LUCE_RATE_LIMIT_ENABLED = originalRateLimit;
});

test("operation dates must be real calendar dates", () => {
  assert.equal(validOperationDate("2026-02-28"), true);
  assert.equal(validOperationDate("2026-02-30"), false);
  assert.equal(validOperationDate("2026-2-8"), false);
});

test("connector fails closed without a gateway or its token", async () => {
  await assert.rejects(fetchRegularClassifications("2026-11-17", {}), (error) => error.code === "engine_not_configured");
  await assert.rejects(fetchRegularClassifications("2026-11-17", { ...config, RTC_REGULAR_ENGINE_URL: "http://engine.example/" }), (error) => error.code === "engine_not_configured");
  await assert.rejects(fetchRegularClassifications("2026-11-17", { ...config, RTC_REGULAR_ENGINE_URL: "http://localhost:58080/", RTC_LOCAL_ENGINE_HTTP: "1" }), (error) => error.code === "engine_not_configured");
});

test("connector checks pinned official version before returning classifications", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), token: options.headers.authorization });
    return new Response(JSON.stringify(calls.length === 1
      ? { versaoApp: "1.6.1", versaoDb: "2026-11" }
      : [{ codigo: "000", descricao: "Tributação integral", classificacoesTributarias: [{ codigo: "000001", descricao: "Operação" }] }]),
    { headers: { "content-type": "application/json" } });
  };
  const result = await fetchRegularClassifications("2026-11-17", config);
  assert.equal(result.rows[0].classificacoesTributarias[0].codigo, "000001");
  assert.equal(result.engineVersion, "1.6.1");
  assert.equal(calls[0].url, "https://engine.example/api/calculadora/dados-abertos/versao");
  assert.equal(calls[1].url, "https://engine.example/api/calculadora/dados-abertos/situacoes-tributarias/cbs-ibs?data=2026-11-17");
  assert.ok(calls.every((call) => call.token === "Bearer test-token"));
});

test("NCM and NBS lookups require exact code, date and pinned official version", async () => {
  await assert.rejects(fetchRegularCode("ncm", "123", "2026-11-17", config), (error) => error.code === "invalid_code");
  await assert.rejects(fetchRegularCode("nbs", "123456789", "2026-02-30", config), (error) => error.code === "invalid_date");
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(String(url));
    assert.equal(options.headers.authorization, "Bearer test-token");
    return new Response(JSON.stringify(calls.length % 2 === 1
      ? { versaoApp: "1.6.1", versaoDb: "teste" }
      : { capitulo: "01", tributadoPeloImpostoSeletivo: false }));
  };
  const ncm = await fetchRegularCode("ncm", "12345678", "2026-11-17", config);
  const nbs = await fetchRegularCode("nbs", "123456789", "2026-11-17", config);
  assert.equal(ncm.code, "12345678");
  assert.equal(nbs.engineVersion, "1.6.1");
  assert.equal(calls[1], "https://engine.example/api/calculadora/dados-abertos/ncm?ncm=12345678&data=2026-11-17");
  assert.equal(calls[3], "https://engine.example/api/calculadora/dados-abertos/nbs?nbs=123456789&data=2026-11-17");
});

test("connector rejects a version mismatch and never queries the catalog", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ versaoApp: "1.6.2" })); };
  await assert.rejects(fetchRegularClassifications("2026-11-17", config), (error) => error.code === "engine_version_mismatch");
  assert.equal(calls, 1);
});

test("regular calculation preserves official item states and simulation warning", async () => {
  const operation = { id: "test", itens: [{ numero: 1 }] };
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify(calls.length === 1
      ? { versaoApp: "1.6.1", versaoDb: "2026-11" }
      : { objetos: [{ estadoItem: "CALCULO_SIMULADO" }], total: {} }),
    { headers: calls.length === 2 ? { "x-warning-dados-simulados": "6" } : {} });
  };
  const result = await calculateRegularOperation(operation, config);
  assert.equal(result.engineVersion, "1.6.1");
  assert.equal(result.output.objetos[0].estadoItem, "CALCULO_SIMULADO");
  assert.equal(result.warning, "6");
  assert.equal(calls[1].url, "https://engine.example/api/calculadora/observabilidade/regime-geral");
  assert.equal(calls[1].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[1].options.body), operation);
  await assert.rejects(calculateRegularOperation({ itens: [] }, config), (error) => error.code === "invalid_operation");
});

test("calculation API rejects anonymous users before invoking the engine", async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error("unexpected"); };
  const response = { statusCode: 200, setHeader() { return this; },
    status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await calculateHandler({ method: "POST", headers: { host: "localhost:3000" }, body: {} }, response);
  assert.equal(response.statusCode, 401);
  assert.equal(called, false);
});

test("connector permits only the explicit loopback gateway in local development", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).endsWith("/versao")
    ? { versaoApp: "1.6.1", versaoDb: "local" }
    : []));
  try {
    const local = await fetchRegularClassifications("2026-11-17", {
      ...config, RTC_REGULAR_ENGINE_URL: "http://127.0.0.1:58080/", RTC_LOCAL_ENGINE_HTTP: "1",
    });
    assert.equal(local.engineVersion, "1.6.1");
    await assert.rejects(fetchRegularClassifications("2026-11-17", {
      ...config, RTC_REGULAR_ENGINE_URL: "http://127.0.0.1:58081/", RTC_LOCAL_ENGINE_HTTP: "1",
    }), (error) => error.code === "engine_not_configured");
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});

test("catalog API rejects anonymous requests before calling any engine", async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error("unexpected"); };
  const response = {
    statusCode: 200,
    setHeader() { return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await handler({ method: "GET", headers: { host: "localhost:3000" }, query: { data: "2026-11-17" } }, response);
  assert.equal(response.statusCode, 401);
  assert.equal(called, false);
});

test("catalog API denies a signed-in user without RTC permission", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ app_metadata: { role: "user", status: "approved", allowed_modules: ["property"] } }));
  const response = {
    statusCode: 200,
    setHeader() { return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await handler({ method: "GET", headers: { host: "localhost:3000", authorization: "Bearer session" }, query: { data: "2026-11-17" } }, response);
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.code, "module_forbidden");
});

test("NCM/NBS API denies anonymous and unauthorized users", async () => {
  const response = () => ({ statusCode: 200, setHeader() { return this; },
    status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
  const request = { method: "GET", headers: { host: "localhost:3000" }, query: { tipo: "ncm", codigo: "12345678", data: "2026-11-17" } };
  const anonymous = response();
  await codeHandler(request, anonymous);
  assert.equal(anonymous.statusCode, 401);
  globalThis.fetch = async () => new Response(JSON.stringify({ app_metadata: { role: "user", status: "approved", allowed_modules: ["property"] } }));
  const forbidden = response();
  await codeHandler({ ...request, headers: { ...request.headers, authorization: "Bearer session" } }, forbidden);
  assert.equal(forbidden.statusCode, 403);
  assert.equal(forbidden.body.code, "module_forbidden");
});
