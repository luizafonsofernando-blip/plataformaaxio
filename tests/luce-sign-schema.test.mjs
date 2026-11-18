import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const adminId = "5853712b-ec49-413c-8042-decba5cb2c77";
const migrations = [
  "20261115183201_create_luce_sign_foundation.sql",
  "20261115184850_extend_luce_sign_electronic_signatures.sql",
  "20261115192202_link_luce_sign_admin01.sql",
  "20261115192450_harden_luce_sign_functions.sql",
  "20261115192704_index_luce_sign_foreign_keys.sql",
  "20261115193417_add_luce_sign_portal_account_auth.sql",
  "20261115201208_allow_signers_without_email_and_place_on_pdf.sql",
  "20261115211500_soft_delete_luce_sign_documents.sql",
];

test("migrations do Sign preservam o Admin01, isolam tabelas e concluem assinatura", async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create schema storage;
      create schema extensions;
      create extension pgcrypto schema extensions;
      create table auth.users (
        id uuid primary key, email text, raw_user_meta_data jsonb,
        raw_app_meta_data jsonb, updated_at timestamptz
      );
      create table storage.buckets (
        id text primary key, name text, public boolean,
        file_size_limit bigint, allowed_mime_types text[]
      );
      insert into auth.users values (
        '${adminId}', 'luizafonsofernando@gmail.com', '{"username":"Admin01"}',
        '{"role":"admin","status":"approved","allowed_modules":["contratos"]}', now()
      );
    `);
    for (const name of migrations) {
      const sql = await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
      await db.exec(sql);
    }
    const user = (await db.query(`select raw_app_meta_data from auth.users where id = '${adminId}'`)).rows[0].raw_app_meta_data;
    assert.equal(user.role, "admin");
    assert.deepEqual(user.allowed_modules, ["contratos", "luce-sign"]);
    const org = (await db.query("select id from public.sign_organizations where created_by = $1", [adminId])).rows[0];
    assert.ok(org?.id);
    assert.equal((await db.query("select role from public.sign_members where organization_id = $1 and user_id = $2", [org.id, adminId])).rows[0].role, "admin");
    const permissions = (await db.query(`select
      has_table_privilege('anon', 'public.sign_documents', 'SELECT') as anon_read,
      has_table_privilege('authenticated', 'public.sign_documents', 'INSERT') as user_write,
      (select relrowsecurity from pg_class where oid = 'public.sign_documents'::regclass) as rls`)).rows[0];
    assert.deepEqual(permissions, { anon_read: false, user_write: false, rls: true });
    assert.equal((await db.query(`select has_function_privilege('anon',
      'public.sign_place_signer(uuid,uuid,text,integer,numeric,numeric,numeric,numeric)',
      'EXECUTE') as allowed`)).rows[0].allowed, false);

    const document = (await db.query(`insert into public.sign_documents
      (organization_id, title, created_by, original_path, original_sha256, original_size, page_count, status)
      values ($1, 'Contrato de teste', $2, 'original.pdf', $3, 100, 1, 'sent') returning id`,
      [org.id, adminId, "a".repeat(64)])).rows[0];
    const signer = (await db.query(`insert into public.sign_signers
      (document_id, organization_id, full_name, email, created_by, status, otp_hash, otp_expires_at)
      values ($1, $2, 'Ana Silva', 'ana@exemplo.com', $3, 'invited', $4, now() + interval '10 minutes') returning id`,
      [document.id, org.id, adminId, "b".repeat(64)])).rows[0];
    const placedDocument = (await db.query(`insert into public.sign_documents
      (organization_id, title, created_by, original_path, original_sha256, original_size, page_count, status)
      values ($1, 'Posicionamento', $2, 'posicao.pdf', $3, 100, 1, 'draft') returning id`,
      [org.id, adminId, "a".repeat(64)])).rows[0];
    const placedSigner = (await db.query(`select public.sign_place_signer(
      $1, $2, 'José da Silva', 1, 0.55, 0.7, 0.35, 0.1) as id`,
      [placedDocument.id, adminId])).rows[0].id;
    assert.ok(placedSigner);
    assert.equal((await db.query("select email from public.sign_signers where id = $1", [placedSigner])).rows[0].email, null);
    assert.equal((await db.query("select count(*)::integer as total from public.sign_fields where signer_id = $1", [placedSigner])).rows[0].total, 1);
    assert.equal((await db.query("select public.sign_hide_document($1, $2) as hidden", [placedDocument.id, adminId])).rows[0].hidden, true);
    const hidden = (await db.query("select status, deleted_at, deleted_by from public.sign_documents where id = $1", [placedDocument.id])).rows[0];
    assert.equal(hidden.status, "cancelled");
    assert.ok(hidden.deleted_at);
    assert.equal(hidden.deleted_by, adminId);
    assert.equal((await db.query("select count(*)::integer as total from public.sign_events where document_id = $1 and event_type = 'document.deleted'", [placedDocument.id])).rows[0].total, 1);
    assert.equal((await db.query("select public.sign_hide_document($1, $2) as hidden", [placedDocument.id, adminId])).rows[0].hidden, false);
    await db.query(`insert into public.sign_fields
      (document_id, organization_id, signer_id, page_number, x, y, width, height)
      values ($1, $2, $3, 1, 0.1, 0.7, 0.4, 0.1)`, [document.id, org.id, signer.id]);
    const verified = (await db.query("select public.sign_verify_otp($1, $2, $3, null, 'Teste') as ok",
      [signer.id, "b".repeat(64), "c".repeat(64)])).rows[0].ok;
    assert.equal(verified, true);
    const signed = (await db.query("select public.sign_accept_signature($1, $2, $3, 'v1', null, 'Teste') as ok",
      [signer.id, "c".repeat(64), "Ana Silva"])).rows[0].ok;
    assert.equal(signed, true);
    const claim = (await db.query("select public.sign_claim_finalization($1) as claimed", [document.id])).rows[0].claimed;
    assert.ok(claim);
    const completed = (await db.query(`select public.sign_complete_document(
      $1, $2, $3, 'final.pdf', $4, 'evidence.pdf', $5) as ok`,
      [document.id, claim, "d".repeat(64), "e".repeat(64), "f".repeat(64)])).rows[0].ok;
    assert.equal(completed, true);
    assert.equal((await db.query("select public.sign_verify_event_chain($1) as ok", [document.id])).rows[0].ok, true);
    assert.equal((await db.query("select status from public.sign_documents where id = $1", [document.id])).rows[0].status, "completed");
    const manualDocument = (await db.query(`insert into public.sign_documents
      (organization_id, title, created_by, original_path, original_sha256, original_size, page_count, status)
      values ($1, 'Assinatura manual', $2, 'manual.pdf', $3, 100, 1, 'sent') returning id`,
      [org.id, adminId, "a".repeat(64)])).rows[0];
    const manualSigner = (await db.query(`insert into public.sign_signers
      (document_id, organization_id, full_name, email, created_by, status, link_expires_at)
      values ($1, $2, 'João Silva', 'joao@exemplo.com', $3, 'invited', now() + interval '7 days') returning id`,
      [manualDocument.id, org.id, adminId])).rows[0];
    assert.equal((await db.query("select public.sign_verify_portal_account($1, $2, $3, null, 'Teste') as ok",
      [manualSigner.id, "1".repeat(64), adminId])).rows[0].ok, true);
    assert.equal((await db.query("select public.sign_decline_document($1, $2, null, 'Teste') as ok",
      [manualSigner.id, "1".repeat(64)])).rows[0].ok, true);
    assert.equal((await db.query("select status from public.sign_documents where id = $1", [manualDocument.id])).rows[0].status, "declined");
    assert.equal((await db.query("select public.sign_verify_event_chain($1) as ok", [manualDocument.id])).rows[0].ok, true);
    const cancelDocument = (await db.query(`insert into public.sign_documents
      (organization_id, title, created_by, original_path, original_sha256, original_size, page_count, status)
      values ($1, 'Cancelar', $2, 'cancel.pdf', $3, 100, 1, 'prepared') returning id`,
      [org.id, adminId, "a".repeat(64)])).rows[0];
    assert.equal((await db.query("select public.sign_cancel_document($1, $2) as ok",
      [cancelDocument.id, adminId])).rows[0].ok, true);
    assert.equal((await db.query("select status from public.sign_documents where id = $1", [cancelDocument.id])).rows[0].status, "cancelled");
    await assert.rejects(() => db.query("update public.sign_events set event_type = 'alterado' where document_id = $1", [document.id]), /append-only/);
  } finally { await db.close(); }
});
