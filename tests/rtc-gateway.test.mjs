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
      "http://regular.internal:8080/api/calculadora/dados-abertos/ncm?ncm=12345678&data=2026-11-17"]);
  } finally { await new Promise((resolve) => gateway.close(resolve)); }
});
