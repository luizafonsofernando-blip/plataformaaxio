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
const originalEngineToken = process.env.RTC_REGULAR_ENGINE_TOKEN;

test.before(() => { process.env.LUCE_RATE_LIMIT_ENABLED = "false"; });
test.after(() => {
  globalThis.fetch = originalFetch;
  if (originalRateLimit === undefined) delete process.env.LUCE_RATE_LIMIT_ENABLED;
  else process.env.LUCE_RATE_LIMIT_ENABLED = originalRateLimit;
  if (originalEngineUrl === undefined) delete process.env.RTC_REGULAR_ENGINE_URL;
  else process.env.RTC_REGULAR_ENGINE_URL = originalEngineUrl;
  if (originalEngineToken === undefined) delete process.env.RTC_REGULAR_ENGINE_TOKEN;
  else process.env.RTC_REGULAR_ENGINE_TOKEN = originalEngineToken;
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
  process.env.RTC_REGULAR_ENGINE_TOKEN = "test-token";
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ app_metadata: { role: "user", status: "approved", allowed_modules: ["reforma-tributaria"] } }) });
  const result = response();
  await handler(request("GET", "session"), result);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.engines.map(({ status }) => status), ["pending_validation", "not_configured", "not_configured"]);
  assert.ok(!JSON.stringify(result.body).includes("private-engine.example"));
});

test("RTC Preview is limited to explicitly listed administrators", async () => {
  const keys = ["VERCEL_ENV", "RTC_BETA_ENABLED", "SUPABASE_URL", "RTC_BETA_ADMIN_IDS"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.VERCEL_ENV = "preview";
    process.env.RTC_BETA_ENABLED = "1";
    process.env.SUPABASE_URL = "https://rtc-beta-example.supabase.co";
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ id: "admin-beta", app_metadata: { role: "admin", status: "approved" } }) });
    delete process.env.RTC_BETA_ADMIN_IDS;
    const unconfigured = response();
    await handler(request("GET", "session"), unconfigured);
    assert.equal(unconfigured.statusCode, 403);
    process.env.RTC_BETA_ADMIN_IDS = "other-admin";
    const unlisted = response();
    await handler(request("GET", "session"), unlisted);
    assert.equal(unlisted.statusCode, 403);
    process.env.RTC_BETA_ADMIN_IDS = "admin-beta";
    const listed = response();
    await handler(request("GET", "session"), listed);
    assert.equal(listed.statusCode, 200);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ id: "admin-beta", app_metadata: { role: "user", status: "approved", allowed_modules: ["reforma-tributaria"] } }) });
    const nonAdmin = response();
    await handler(request("GET", "session"), nonAdmin);
    assert.equal(nonAdmin.statusCode, 403);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
