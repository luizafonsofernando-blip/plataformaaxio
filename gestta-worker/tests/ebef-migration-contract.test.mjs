import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COMPARABLE_FIELDS} from '../src/pre-sync-preview.mjs';

const sql=readFileSync(new URL('../../supabase/migrations/20261015_ebef_gestta_sync.sql',
  import.meta.url),'utf8');

test('SQL EBEF possui exatamente duas tabelas novas e todos campos da integracao',()=>{
  const creates=[...sql.matchAll(/^create table public\.([a-z_]+)\s*\(/gmi)]
    .map(x=>x[1]);
  assert.deepEqual(creates,['ebef_gestta_tasks','ebef_gestta_sync_runs']);
  const taskDef=sql.split('create table public.ebef_gestta_tasks (')[1]
    .split('create index idx_ebef_gestta_tasks_cnpj_comp')[0];
  for(const field of COMPARABLE_FIELDS){
    assert.match(taskDef,new RegExp('\\b'+field+'\\s+'));
  }
  assert.match(taskDef,/source_key text primary key/);
  assert.match(taskDef,/gestta_id text unique/);
  assert.match(taskDef,/first_seen_at timestamptz/);
  assert.match(taskDef,/last_seen_at timestamptz/);
});
test('SQL EBEF liga RLS e revoga acesso publico, anonimo e autenticado',()=>{
  for(const table of ['ebef_gestta_tasks','ebef_gestta_sync_runs']){
    assert.ok(sql.includes('alter table public.'+table+' enable row level security;'));
    assert.ok(sql.includes('revoke all privileges on table public.'+table+
      ' from public, anon, authenticated;'));
  }
  assert.match(sql,/revoke all privileges on sequence public\.ebef_gestta_sync_runs_id_seq\s+from public, anon, authenticated;/);
  assert.doesNotMatch(sql,/grant\s+[^;]*\bdelete\b/i);
  assert.doesNotMatch(sql,/drop\s+table|truncate\s+table|delete\s+from|update\s+public\./i);
});
test('SQL EBEF nao contem fragmentos corrompidos ou duplicatas',()=>{
  assert.equal([...sql.matchAll(/create table public\.ebef_gestta_tasks/g)].length,1);
  assert.equal([...sql.matchAll(/create table public\.ebef_gestta_sync_runs/g)].length,1);
  assert.doesNotMatch(sql,/\n\),\s*\n/);
  assert.match(sql,/source_key ~ '\^\[a-f0-9\]\{64\}\$'/);
  assert.match(sql,/gestta_id ~ '\^\[a-f0-9\]\{24\}\$'/);
});
