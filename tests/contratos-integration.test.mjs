import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const login = fs.readFileSync(new URL("../api/onboarding/login.js", import.meta.url), "utf8");
const users = fs.readFileSync(new URL("../api/onboarding/admin-users.js", import.meta.url), "utf8");

test("Contratos participates in centralized authentication and permissions", () => {
  assert.ok(login.includes('"contratos"'));
  assert.ok(users.includes('{ id: "contratos", label: "Contratos" }'));
  assert.ok(login.includes('requireActiveModuleUser(request, response, "contratos")'));
  assert.ok(login.includes('request.method === "GET"'));
});

test("Contratos is built as a production module without local converter dependency", () => {
  const htmlUrl = new URL("../contratos/index.html", import.meta.url);
  assert.ok(fs.existsSync(htmlUrl));
  const assets = fs.readdirSync(new URL("../contratos/assets/", import.meta.url));
  const js = assets.filter((file) => file.endsWith(".js")).map((file) => fs.readFileSync(new URL(`../contratos/assets/${file}`, import.meta.url), "utf8")).join("\n");
  assert.ok(js.includes("Luce Contratos"));
  assert.ok(!js.includes("127.0.0.1:4317"));
});
