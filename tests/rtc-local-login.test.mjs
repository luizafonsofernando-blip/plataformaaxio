import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/rtc/local-login.js";

function response() {
  return { statusCode: 200, setHeader() { return this; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test("local RTC login is unavailable without an explicit local Supabase environment", async () => {
  const previous = { RTC_LOCAL_MODE: process.env.RTC_LOCAL_MODE, SUPABASE_URL: process.env.SUPABASE_URL, NODE_ENV: process.env.NODE_ENV };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("must not call Supabase"); };
  try {
    process.env.RTC_LOCAL_MODE = "1";
    process.env.SUPABASE_URL = "https://production.example";
    const result = response();
    await handler({ method: "POST", headers: { host: "localhost:3000" }, body: { identifier: "test@example.com", password: "test" } }, result);
    assert.equal(result.statusCode, 404);
    process.env.SUPABASE_URL = "http://127.0.0.1:55321";
    process.env.NODE_ENV = "production";
    const blocked = response();
    await handler({ method: "POST", headers: { host: "localhost:3000" }, body: { identifier: "test@example.com", password: "test" } }, blocked);
    assert.equal(blocked.statusCode, 404);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
