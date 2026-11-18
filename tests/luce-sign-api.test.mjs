import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import adminHandler from "../api/sign.js";
import publicHandler from "../server-assets/luce-sign-public.mjs";

function response() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

test("APIs do Sign falham fechadas quando o Supabase não está configurado", async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousFetch = globalThis.fetch;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  globalThis.fetch = () => { throw new Error("Não deveria haver chamada externa"); };
  try {
    const admin = response();
    await adminHandler({ method: "GET", headers: { host: "localhost" }, query: { resource: "bootstrap" } }, admin);
    assert.equal(admin.statusCode, 503);
    assert.equal(admin.headers["Cache-Control"], "no-store, max-age=0");
    const publicResponse = response();
    await publicHandler({ method: "POST", headers: { host: "localhost" }, query: { resource: "link" }, body: { token: "x" } }, publicResponse);
    assert.equal(publicResponse.statusCode, 503);
    assert.equal(publicResponse.headers["Referrer-Policy"], "no-referrer");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

test("fluxo de links manuais não depende de provedor de e-mail", async () => {
  const adminSource = await readFile(new URL("../api/sign.js", import.meta.url), "utf8");
  const publicSource = await readFile(new URL("../server-assets/luce-sign-public.mjs", import.meta.url), "utf8");
  assert.match(adminSource, /resource === "generate-links"/);
  assert.match(adminSource, /resource === "revoke-link"/);
  assert.match(adminSource, /resource === "access-code"/);
  assert.doesNotMatch(`${adminSource}\n${publicSource}`, /SIGN_RESEND_API_KEY|SIGN_FROM_EMAIL|sendSignEmail/);
});
