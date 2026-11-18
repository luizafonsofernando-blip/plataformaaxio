import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const bundle = join(root, "infra", "rtc-vercel-app", "dist");

test("dedicated RTC bundle stays within the Vercel Hobby function limit", async () => {
  execFileSync(process.execPath, [join(root, "infra", "rtc-vercel-app", "prepare.mjs")]);
  const rtcRoutes = (await readdir(join(bundle, "api", "rtc"))).filter((name) => name.endsWith(".js"));
  assert.equal(rtcRoutes.length, 11);
  assert.equal(rtcRoutes.includes("local-login.js"), false);
  assert.equal(await readFile(join(bundle, "api", "onboarding", "login.js"), "utf8")
    .then((source) => source.includes("reforma-tributaria")), true);
  const config = JSON.parse(await readFile(join(bundle, "vercel.json"), "utf8"));
  assert.equal(config.outputDirectory, "public");
  assert.equal(rtcRoutes.length + 1, 12);
});
