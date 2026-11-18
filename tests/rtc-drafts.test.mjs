import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { validateDraft } from '../server-assets/rtc-drafts.mjs';
import handler from '../api/rtc/drafts.js';

const admin = '11111111-1111-4111-8111-111111111111';
const outsider = '22222222-2222-4222-8222-222222222222';
const draftId = '33333333-3333-4333-8333-333333333333';
const input = { id: draftId, title: 'Operação de teste', engine: 'regular', operation_date: '2026-11-18',
  scenario: { items: [{ description: 'Produto', amount_cents: 12345, ncm: '12345678' }] } };

test('RTC draft validates dates, items and exact cent amounts', () => {
  assert.equal(validateDraft(input).scenario.items[0].amount_cents, 12345);
  assert.throws(() => validateDraft({ ...input, operation_date: '2026-02-30' }), /invalid_draft/);
  assert.throws(() => validateDraft({ ...input, scenario: { items: [{ description: 'x', amount_cents: 1.2 }] } }), /invalid_draft/);
  assert.throws(() => validateDraft({ ...input, scenario: { items: [] } }), /invalid_draft/);
});

test('RTC draft API rejects anonymous requests and honors the server kill switch', async () => {
  const response = () => ({ statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
  const previous = process.env.RTC_BETA_ENABLED;
  const request = { method: 'GET', headers: { host: 'localhost:3000' }, query: {} };
  try {
    const anonymous = response();
    await handler(request, anonymous);
    assert.equal(anonymous.statusCode, 401);
    process.env.RTC_BETA_ENABLED = '0';
    const disabled = response();
    await handler(request, disabled);
    assert.equal(disabled.statusCode, 503);
    assert.equal(disabled.body.code, 'module_disabled');
  } finally {
    if (previous === undefined) delete process.env.RTC_BETA_ENABLED;
    else process.env.RTC_BETA_ENABLED = previous;
  }
});

test('RTC draft migration preserves tenant isolation and audit', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;
    `);
    await db.query('insert into auth.users(id) values ($1), ($2)', [admin, outsider]);
    for (const file of ['20261118001814_create_luce_rtc_foundation.sql', '20261118010000_create_luce_rtc_simulation_drafts.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
    }
    const org = (await db.query("insert into public.rtc_organizations(name, created_by) values('Org A', $1) returning id", [admin])).rows[0].id;
    const company = (await db.query("insert into public.rtc_companies(organization_id, cnpj, legal_name, created_by) values($1, '11111111000191', 'Empresa A', $2) returning id", [org, admin])).rows[0].id;
    await db.query('insert into public.rtc_simulation_drafts(id, organization_id, company_id, created_by, title, engine, operation_date, scenario) values($1,$2,$3,$4,$5,$6,$7,$8)',
      [draftId, org, company, admin, input.title, input.engine, input.operation_date, JSON.stringify(input.scenario)]);
    assert.equal((await db.query("select count(*)::int as total from public.rtc_audit_events where event_type='simulation_draft_created'")).rows[0].total, 1);
    await db.query('update public.rtc_simulation_drafts set title=$1, version=2 where id=$2', ['Operação revista', draftId]);
    assert.equal((await db.query("select count(*)::int as total from public.rtc_audit_events where event_type='simulation_draft_updated'")).rows[0].total, 1);
    await assert.rejects(db.query('update public.rtc_simulation_drafts set company_id=$1, version=3 where id=$2', [draftId, draftId]), /identity\/version/);
    await assert.rejects(db.query('insert into public.rtc_simulation_drafts(id, organization_id, company_id, created_by, title, engine, operation_date, scenario) values(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7)',
      [org, draftId, admin, input.title, input.engine, input.operation_date, JSON.stringify(input.scenario)]), /foreign key/);
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [outsider]);
    assert.equal((await db.query('select count(*)::int as total from public.rtc_simulation_drafts')).rows[0].total, 0);
    await assert.rejects(db.query("update public.rtc_simulation_drafts set title='Invasão'"), /permission denied/);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [admin]);
    assert.equal((await db.query('select count(*)::int as total from public.rtc_simulation_drafts')).rows[0].total, 1);
  } finally { await db.close(); }
});
