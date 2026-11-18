import test from "node:test";
import assert from "node:assert/strict";
import { activeMembership, normalizeCnpj, RtcStoreError, validUuid } from "../server-assets/rtc-store.mjs";

test("RTC validates CNPJ without changing its digits", () => {
  assert.equal(normalizeCnpj("04.252.011/0001-10"), "04252011000110");
  assert.throws(() => normalizeCnpj("11.111.111/1111-11"), (error) => error instanceof RtcStoreError && error.code === "invalid_cnpj");
  assert.throws(() => normalizeCnpj("04.252.011/0001-11"), /invalid_cnpj/);
});

test("RTC fails closed on missing, suspended, or malformed memberships", async () => {
  const org = "11111111-1111-4111-8111-111111111111";
  assert.equal(validUuid(org), true);
  assert.equal(validUuid("not-an-id"), false);
  let filters = [];
  const client = { from(table) {
    assert.equal(table, "rtc_memberships");
    filters = [];
    const query = {
      select() { return query; },
      eq(key, value) { filters.push([key, value]); return query; },
      async maybeSingle() { return { data: null, error: null }; },
    };
    return query;
  } };
  await assert.rejects(activeMembership(client, org, "user-1"), (error) => error.code === "organization_forbidden" && error.status === 403);
  assert.deepEqual(filters, [["organization_id", org], ["user_id", "user-1"], ["status", "active"]]);
  await assert.rejects(activeMembership(client, "invalid", "user-1"), (error) => error.code === "invalid_organization");
});
