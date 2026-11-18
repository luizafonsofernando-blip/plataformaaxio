import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const users = {
  admin: "11111111-1111-4111-8111-111111111111",
  analyst: "22222222-2222-4222-8222-222222222222",
  other: "33333333-3333-4333-8333-333333333333",
  suspended: "44444444-4444-4444-8444-444444444444",
};

test("RTC migration isolates organizations, companies and immutable analyses", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;
    `);
    for (const id of Object.values(users)) await db.query("insert into auth.users (id) values ($1)", [id]);
    const migration = await readFile(new URL("../supabase/migrations/20261118001814_create_luce_rtc_foundation.sql", import.meta.url), "utf8");
    await db.exec(migration);

    const orgA = (await db.query("insert into public.rtc_organizations (name, created_by) values ('Escritório A', $1) returning id", [users.admin])).rows[0].id;
    const orgB = (await db.query("insert into public.rtc_organizations (name, created_by) values ('Escritório B', $1) returning id", [users.other])).rows[0].id;
    await db.query("insert into public.rtc_memberships (organization_id, user_id, role) values ($1, $2, 'analyst'), ($1, $3, 'viewer')", [orgA, users.analyst, users.suspended]);
    assert.equal((await db.query("select role from public.rtc_memberships where organization_id = $1 and user_id = $2", [orgA, users.admin])).rows[0].role, "admin");
    assert.equal((await db.query("select role from public.rtc_memberships where organization_id = $1 and user_id = $2", [orgB, users.other])).rows[0].role, "admin");
    const companyA = (await db.query("insert into public.rtc_companies (organization_id, cnpj, legal_name, created_by) values ($1, '11111111000191', 'Empresa A', $2) returning id", [orgA, users.admin])).rows[0].id;
    const companyB = (await db.query("insert into public.rtc_companies (organization_id, cnpj, legal_name, created_by) values ($1, '22222222000191', 'Empresa B', $2) returning id", [orgA, users.admin])).rows[0].id;
    const companyOther = (await db.query("insert into public.rtc_companies (organization_id, cnpj, legal_name, created_by) values ($1, '33333333000191', 'Empresa C', $2) returning id", [orgB, users.other])).rows[0].id;
    await db.query("insert into public.rtc_company_access (company_id, organization_id, user_id, granted_by) values ($1, $2, $3, $4), ($1, $2, $5, $4)", [companyA, orgA, users.analyst, users.admin, users.suspended]);
    await db.query("update public.rtc_memberships set status = 'suspended' where organization_id = $1 and user_id = $2", [orgA, users.suspended]);
    const analysis = (await db.query(`insert into public.rtc_analyses
      (organization_id, company_id, requested_by, operation_date, engine, engine_version, rules_version, source_commit, status, input_data, output_data, correlation_id)
      values ($1, $2, $3, date '2026-11-17', 'regular', '1.6.1', '2026-11', $4, 'completed', '{}', '{}', gen_random_uuid()) returning id`,
    [orgA, companyA, users.admin, "a".repeat(40)])).rows[0].id;
    await assert.rejects(db.query("update public.rtc_analyses set status = 'failed' where id = $1", [analysis]), /immutable/);
    await assert.rejects(db.query("insert into public.rtc_company_access (company_id, organization_id, user_id, granted_by) values ($1, $2, $3, $4)", [companyOther, orgA, users.analyst, users.admin]), /foreign key/);

    async function visibleAs(userId) {
      await db.exec("set role authenticated");
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
      try {
        const companies = (await db.query("select id from public.rtc_companies order by id")).rows.map((row) => row.id);
        const analyses = (await db.query("select id from public.rtc_analyses")).rows.map((row) => row.id);
        const organizations = (await db.query("select id from public.rtc_organizations")).rows.map((row) => row.id);
        return { companies, analyses, organizations };
      } finally { await db.exec("reset role"); }
    }

    assert.deepEqual((await visibleAs(users.analyst)).companies, [companyA]);
    assert.deepEqual((await visibleAs(users.analyst)).analyses, [analysis]);
    assert.deepEqual((await visibleAs(users.other)).companies, [companyOther]);
    assert.deepEqual((await visibleAs(users.other)).analyses, []);
    assert.deepEqual((await visibleAs(users.suspended)).companies, []);
    assert.deepEqual((await visibleAs(users.admin)).companies.sort(), [companyA, companyB].sort());
    assert.deepEqual((await visibleAs(users.analyst)).organizations, [orgA]);
    const privileges = (await db.query("select has_table_privilege('anon', 'public.rtc_companies', 'SELECT') as anon_read, has_table_privilege('authenticated', 'public.rtc_companies', 'INSERT') as user_write")).rows[0];
    assert.deepEqual(privileges, { anon_read: false, user_write: false });
  } finally { await db.close(); }
});
