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
      create schema storage;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated;
      grant select on storage.objects to authenticated;
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
    const reportsMigration = await readFile(new URL("../supabase/migrations/20261118003754_create_luce_rtc_reports.sql", import.meta.url), "utf8");
    await db.exec(reportsMigration);

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
    const correlationId = "66666666-6666-4666-8666-666666666666";
    const registerAnalysis = `select public.rtc_register_analysis($1, $2, $3, date '2026-11-17',
      'regular', '1.6.1', '2026-11', $4, 'completed', '{}', '{}', $5) as id`;
    const analysis = (await db.query(registerAnalysis,
      [orgA, companyA, users.admin, "a".repeat(40), correlationId])).rows[0].id;
    await assert.rejects(db.query(registerAnalysis,
      [orgA, companyA, users.admin, "a".repeat(40), correlationId]), /unique constraint/);
    const reportId = "55555555-5555-4555-8555-555555555555";
    const objectName = `${orgA}/${companyA}/${reportId}.pdf`;
    await db.query("insert into storage.objects (bucket_id, name) values ('rtc-reports', $1)", [objectName]);
    await db.query("select public.rtc_register_report($1, $2, $3, $4, $5, $6, $7, $8)",
      [reportId, orgA, companyA, analysis, objectName, "b".repeat(64), 1024, users.admin]);
    assert.equal((await db.query("select public from storage.buckets where id = 'rtc-reports'")).rows[0].public, false);
    assert.equal((await db.query("select count(*)::int as total from public.rtc_audit_events where event_type = 'report_created'")).rows[0].total, 1);
    await assert.rejects(db.query("update public.rtc_reports set byte_length = 2048 where id = $1", [reportId]), /immutable/);
    await assert.rejects(db.query("delete from public.rtc_audit_events where event_type = 'report_created'"), /immutable/);
    await assert.rejects(db.query("insert into public.rtc_reports (organization_id, company_id, analysis_id, object_name, sha256, byte_length, created_by) values ($1, $2, $3, 'invalid.pdf', $4, 100, $5)", [orgB, companyOther, analysis, "a".repeat(64), users.other]), /check constraint|foreign key/);
    await assert.rejects(db.query("update public.rtc_analyses set status = 'failed' where id = $1", [analysis]), /immutable/);
    await assert.rejects(db.query("insert into public.rtc_company_access (company_id, organization_id, user_id, granted_by) values ($1, $2, $3, $4)", [companyOther, orgA, users.analyst, users.admin]), /foreign key/);

    async function visibleAs(userId) {
      await db.exec("set role authenticated");
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
      try {
        const companies = (await db.query("select id from public.rtc_companies order by id")).rows.map((row) => row.id);
        const analyses = (await db.query("select id from public.rtc_analyses")).rows.map((row) => row.id);
        const organizations = (await db.query("select id from public.rtc_organizations")).rows.map((row) => row.id);
        const reports = (await db.query("select id from public.rtc_reports")).rows.map((row) => row.id);
        const objects = (await db.query("select name from storage.objects")).rows.map((row) => row.name);
        const auditEvents = (await db.query("select id from public.rtc_audit_events")).rows.map((row) => row.id);
        return { companies, analyses, organizations, reports, objects, auditEvents };
      } finally { await db.exec("reset role"); }
    }

    assert.deepEqual((await visibleAs(users.analyst)).companies, [companyA]);
    assert.deepEqual((await visibleAs(users.analyst)).analyses, [analysis]);
    assert.deepEqual((await visibleAs(users.analyst)).reports, [reportId]);
    assert.deepEqual((await visibleAs(users.analyst)).objects, [objectName]);
    assert.deepEqual((await visibleAs(users.analyst)).auditEvents, []);
    assert.deepEqual((await visibleAs(users.other)).companies, [companyOther]);
    assert.deepEqual((await visibleAs(users.other)).analyses, []);
    assert.deepEqual((await visibleAs(users.other)).reports, []);
    assert.deepEqual((await visibleAs(users.other)).objects, []);
    assert.deepEqual((await visibleAs(users.suspended)).companies, []);
    assert.deepEqual((await visibleAs(users.admin)).companies.sort(), [companyA, companyB].sort());
    assert.equal((await visibleAs(users.admin)).auditEvents.length, 2);
    assert.deepEqual((await visibleAs(users.analyst)).organizations, [orgA]);
    const privileges = (await db.query("select has_table_privilege('anon', 'public.rtc_companies', 'SELECT') as anon_read, has_table_privilege('authenticated', 'public.rtc_companies', 'INSERT') as user_write")).rows[0];
    assert.deepEqual(privileges, { anon_read: false, user_write: false });
  } finally { await db.close(); }
});
