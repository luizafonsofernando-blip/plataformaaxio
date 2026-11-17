import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/rtc/status.js";

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

function request(method = "GET", token = "") {
  return { method, headers: { host: "localhost:3000", ...(token ? { authorization: `Bearer ${token}` } : {}) } };
}

const originalFetch = globalThis.fetch;
const originalRateLimit = process.env.LUCE_RATE_LIMIT_ENABLED;
const originalEngineUrl = process.env.RTC_REGULAR_ENGINE_URL;

test.before(() => { process.env.LUCE_RATE_LIMIT_ENABLED = "false"; });
test.after(() => {
  globalThis.fetch = originalFetch;
  if (originalRateLimit === undefined) delete process.env.LUCE_RATE_LIMIT_ENABLED;
  else process.env.LUCE_RATE_LIMIT_ENABLED = originalRateLimit;
  if (originalEngineUrl === undefined) delete process.env.RTC_REGULAR_ENGINE_URL;
  else process.env.RTC_REGULAR_ENGINE_URL = originalEngineUrl;
});

test("RTC status rejects unauthenticated requests and unsupported methods", async () => {
  const anonymous = response();
  await handler(request(), anonymous);
  assert.equal(anonymous.statusCode, 401);
  const post = response();
  await handler(request("POST"), post);
  assert.equal(post.statusCode, 405);
});

test("RTC status denies a user without module access", async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ app_metadata: { role: "user", status: "approved", allowed_modules: ["property"] } }) });
  const result = response();
  await handler(request("GET", "session"), result);
  assert.equal(result.statusCode, 403);
  assert.equal(result.body.code, "module_forbidden");
});

test("RTC status only reports configuration readiness, never operational status", async () => {
  process.env.RTC_REGULAR_ENGINE_URL = "https://private-engine.example";
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ app_metadata: { role: "user", status: "approved", allowed_modules: ["reforma-tributaria"] } }) });
  const result = response();
  await handler(request("GET", "session"), result);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.engines.map(({ status }) => status), ["pending_validation", "not_configured", "not_configured"]);
  assert.ok(!JSON.stringify(result.body).includes("private-engine.example"));
});
