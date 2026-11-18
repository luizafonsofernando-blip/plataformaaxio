import test from "node:test";
import assert from "node:assert/strict";
import { createRtcDevServer } from "../infra/rtc-local/dev-server.mjs";

test("RTC local server exposes only its own UI and authenticated APIs", async () => {
  const server = createRtcDevServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(`${base}/reforma-tributaria/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Reforma Tributária/);
    assert.equal((await fetch(`${base}/api/rtc/status`)).status, 401);
    assert.equal((await fetch(`${base}/api/onboarding/login`)).status, 404);
    assert.equal((await fetch(`${base}/supabase/config.toml`)).status, 404);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
