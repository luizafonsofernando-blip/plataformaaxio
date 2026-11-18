import test from "node:test";
import assert from "node:assert/strict";
import { createGateway } from "../infra/rtc-gateway/server.mjs";

test("gateway authenticates and only forwards allowlisted read requests", async () => {
  const forwarded = [];
  const gateway = createGateway({ RTC_GATEWAY_TOKEN: "secret-for-tests", RTC_REGULAR_UPSTREAM: "http://regular.internal:8080" }, async (url) => {
    forwarded.push(String(url));
    return new Response(JSON.stringify({ versaoApp: "1.6.1" }), { headers: { "content-type": "application/json" } });
  });
  await new Promise((resolve) => gateway.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${gateway.address().port}`;
  try {
    assert.equal((await fetch(`${base}/health/regular`)).status, 200);
    assert.equal((await fetch(`${base}/api/calculadora/dados-abertos/versao`)).status, 401);
    assert.equal((await fetch(`${base}/api/calculadora/dados-abertos/versao`, { headers: { authorization: "Bearer wrong" } })).status, 401);
    assert.equal((await fetch(`${base}/admin`, { headers: { authorization: "Bearer secret-for-tests" } })).status, 404);
    assert.equal((await fetch(`${base}/api/calculadora/dados-abertos/versao`, { method: "POST", headers: { authorization: "Bearer secret-for-tests" } })).status, 405);
    assert.equal((await fetch(`${base}/api/calculadora/dados-abertos/versao`, { headers: { authorization: "Bearer secret-for-tests" } })).status, 200);
    const ncm = await fetch(`${base}/api/calculadora/dados-abertos/ncm?ncm=12345678&data=2026-11-17`, { headers: { authorization: "Bearer secret-for-tests" } });
    assert.equal(ncm.status, 200);
    const invalid = await fetch(`${base}/api/calculadora/dados-abertos/ncm?ncm=123&data=2026-11-17`, { headers: { authorization: "Bearer secret-for-tests" } });
    assert.equal(invalid.status, 400);
    assert.deepEqual(forwarded, ["http://regular.internal:8080/api/calculadora/dados-abertos/versao",
      "http://regular.internal:8080/api/calculadora/dados-abertos/versao",
      "http://regular.internal:8080/api/calculadora/dados-abertos/ncm?ncm=12345678&data=2026-11-17"]);
  } finally { await new Promise((resolve) => gateway.close(resolve)); }
});

test("gateway forwards only bounded authenticated calculation operations", async () => {
  const forwarded = [];
  const gateway = createGateway({ RTC_GATEWAY_TOKEN: "secret-for-tests", RTC_REGULAR_UPSTREAM: "http://regular.internal:8080" }, async (url, options) => {
    forwarded.push({ url: String(url), method: options.method, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ objetos: [{ estadoItem: "CALCULADO" }], total: {} }),
      { headers: { "content-type": "application/json", "x-warning-dados-simulados": "6" } });
  });
  await new Promise((resolve) => gateway.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${gateway.address().port}`;
  const path = "/api/calculadora/observabilidade/regime-geral";
  const headers = { authorization: "Bearer secret-for-tests", "content-type": "application/json" };
  try {
    assert.equal((await fetch(base + path, { method: "POST", body: '{}', headers: { "content-type": "application/json" } })).status, 401);
    assert.equal((await fetch(base + path, { method: "POST", body: '{}', headers })).status, 400);
    assert.equal((await fetch(base + path + "?debug=1", { method: "POST", body: '{"itens":[{}]}', headers })).status, 400);
    assert.equal((await fetch(base + path, { method: "POST", body: JSON.stringify({ itens: Array(51).fill({}) }), headers })).status, 400);
    const operation = { id: "test", itens: [{ numero: 1 }] };
    const result = await fetch(base + path, { method: "POST", body: JSON.stringify(operation), headers });
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("x-warning-dados-simulados"), "6");
    assert.deepEqual(forwarded, [{ url: "http://regular.internal:8080" + path, method: "POST", body: operation }]);
  } finally { await new Promise((resolve) => gateway.close(resolve)); }
});
