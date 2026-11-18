import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const bundle = join(root, "infra", "rtc-vercel-app", "dist");

test("dedicated RTC bundle stays within the Vercel Hobby function limit", async () => {
  execFileSync(process.execPath, [join(root, "infra", "rtc-vercel-app", "prepare.mjs")]);
  const rtcRoutes = (await readdir(join(bundle, "api", "rtc"))).filter((name) => name.endsWith(".js"));
  assert.equal(rtcRoutes.length, 11);
  assert.equal(rtcRoutes.includes("local-login.js"), false);
  assert.match(await readFile(join(bundle, "api", "onboarding", "login.js"), "utf8"),
    /request\.body\?\.profile !== "reforma-tributaria"/);
  assert.match(await readFile(join(bundle, "api", "onboarding", "_login-base.js"), "utf8"),
    /const VALID_MODULE_IDS/);
  const { default: login } = await import(pathToFileURL(join(bundle, "api", "onboarding", "login.js")));
  let rejected;
  await login({ method: "POST", body: { profile: "property" } }, {
    setHeader() {}, status(code) { rejected = code; return this; }, json() {},
  });
  assert.equal(rejected, 403);
  const config = JSON.parse(await readFile(join(bundle, "vercel.json"), "utf8"));
  assert.equal(config.outputDirectory, "public");
  assert.equal(rtcRoutes.length + 1, 12);
  const example = JSON.parse(await readFile(join(bundle, "reforma-tributaria", "example-operation.json"), "utf8"));
  assert.equal(example.itens.length, 1);
  assert.equal(example.dhFatoGerador.slice(0, 10), "2027-03-10");
});
