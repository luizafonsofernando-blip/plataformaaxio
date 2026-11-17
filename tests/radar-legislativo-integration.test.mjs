import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("Radar Legislativo remains available only in the access infrastructure", () => {
  const usersApi = read("../api/onboarding/admin-users.js");
  const loginApi = read("../api/onboarding/login.js");
  assert.match(usersApi, /id: "radar-legislativo", label: "Radar Legislativo"/);
  assert.match(loginApi, /"radar-legislativo"/);
});

test("session handoff keeps credentials out of URLs", () => {
  const bridge = read("../radar-legislativo/portal-bridge.js");
  assert.match(bridge, /form\.method = "POST"/);
  assert.match(bridge, /\/api\/auth\/handoff/);
  assert.doesNotMatch(bridge, /[?&#](access_token|refresh_token)=/i);
});
