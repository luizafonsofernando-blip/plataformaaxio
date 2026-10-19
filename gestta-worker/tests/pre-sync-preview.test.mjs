import test from 'node:test';
import assert from 'node:assert/strict';
import {previewEbefSyncReadOnly,COMPARABLE_FIELDS}
  from '../src/pre-sync-preview.mjs';

const record=(id,cnpj='01234567000189',status='ABERTO')=>({
  source_key:id.repeat(64),gestta_id:id.repeat(24),
  cnpj,competencia:'2026-10',
  tarefa:'VERIFICAR NECESSIDADE DE EBEF | TECNICO',
  tipo_tarefa:'verificacao',tipo_registro:'ORDEM DE SERVICO',
  cliente:'EMPRESA EXEMPLO',departamento:'Tecnico',
  responsavel:'Exemplo',status_gestta:status,
  vencimento:'2026-10-19',data_legal:null,concluido_em:null,
  feito_atrasado:false,feito_com_multa:false,baixado:false,
});

test('sem snapshot nao afirma inclusoes ou atualizacoes e nao grava',()=>{
  const r=previewEbefSyncReadOnly([record('a'),record('b')]);
  assert.equal(r.proposedRecords,2);
  assert.equal(r.inserts,null);
  assert.equal(r.updates,null);
  assert.equal(r.unchanged,null);
  assert.equal(r.deletes,0);
  assert.equal(r.needsReadOnlySnapshot,true);
  assert.equal(r.actualDatabaseCompared,false);
  assert.equal(r.writesPerformed,false);
  assert.equal(r.allUsersProven,false);
});
test('snapshot local declarado completo compara novos, alterados e iguais sem mostrar clientes',()=>{
  const next=[record('a'),record('b','98765432000100','CONCLUÍDA'),record('c')];
  const prior=[record('a'),record('b','98765432000100','ABERTO'),record('d')];
  const r=previewEbefSyncReadOnly(next,{
    kind:'explicit_readonly_snapshot',complete:true,rows:prior,
  });
  assert.equal(r.inserts,1);
  assert.equal(r.updates,1);
  assert.equal(r.unchanged,1);
  assert.equal(r.deletes,0);
  assert.equal(r.actualDatabaseCompared,false);
  assert.equal(r.writesPerformed,false);
  assert.equal(r.needsReadOnlySnapshot,false);
  assert.equal(JSON.stringify(r).includes('01234567000189'),false);
  assert.equal(JSON.stringify(r).includes(record('b').source_key),false);
});
test('recusa fotografia parcial, parametros invalidos e IDs duplicados',()=>{
  for(const snapshot of [
    {kind:'explicit_readonly_snapshot',complete:false,rows:[]},
    {kind:'any',complete:true,rows:[]},
    {kind:'explicit_readonly_snapshot',complete:true,rows:null},
    [],
  ])assert.throws(()=>previewEbefSyncReadOnly([record('a')],snapshot),
    /Snapshot/);
  assert.throws(()=>previewEbefSyncReadOnly([record('a'),record('a')]),
    /duplicado/);
  assert.throws(()=>previewEbefSyncReadOnly([record('a')],{
    kind:'explicit_readonly_snapshot',complete:true,rows:[record('b'),record('b')],
  }),/duplicado/);
});
test('bloqueia campo ausente ou ID reutilizado com CNPJ divergente',()=>{
  assert.equal(COMPARABLE_FIELDS.includes('source_key'),true);
  const incomplete=record('a');delete incomplete.status_gestta;
  assert.throws(()=>previewEbefSyncReadOnly([incomplete]),/campos completos/);
  assert.throws(()=>previewEbefSyncReadOnly([record('a')],{
    kind:'explicit_readonly_snapshot',complete:true,
    rows:[record('a','98765432000100')],
  }),/identidade/);
});
