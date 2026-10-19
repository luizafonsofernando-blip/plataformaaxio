import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {planEbefReconciliationOffline}
  from '../src/ebef-reconciliation-plan.mjs';

const sha=input=>createHash('sha256').update(input).digest('hex');
function row(id,cnpj='01234567000189',status='ABERTA'){
  return {
    source_key:sha('gestta-id:'+id),
    gestta_id:id,cnpj,competencia:'2026-10',
    tarefa:'VERIFICAR NECESSIDADE DE EBEF | TECNICO',
    tipo_tarefa:'verificacao',tipo_registro:'',
    cliente:'CLIENTE EXEMPLO',departamento:'TECNICO',
    responsavel:'EQUIPE EXEMPLO',status_gestta:status,
    vencimento:'2026-10-19',data_legal:null,concluido_em:null,
    feito_atrasado:false,feito_com_multa:null,baixado:false,
  };
}
const A='a'.repeat(24),B='b'.repeat(24),C='c'.repeat(24),D='d'.repeat(24);
const snapshot=rows=>({
  kind:'explicit_readonly_snapshot',
  complete:true,origin:'operator_supplied_offline',
  capturedAt:'2026-10-19T16:00:00.000Z',rows,
});

test('sem snapshot, contagens de escrita permanecem desconhecidas',()=>{
  const r=planEbefReconciliationOffline([row(A),row(B)]);
  assert.equal(r.proposedRecords,2);
  assert.equal(r.inserts,null);
  assert.equal(r.updates,null);
  assert.equal(r.unchanged,null);
  assert.equal(r.wouldDelete,0);
  assert.equal(r.needsReadOnlySnapshot,true);
  assert.equal(r.writesPerformed,false);
  assert.equal(r.applyAuthorized,false);
  assert.equal(r.transactionalWriteImplemented,false);
  assert.equal(r.allUsersProven,false);
});
test('snapshot de exemplo permite estimar novas, atualizadas, iguais e nao incluidas',()=>{
  const input=[row(A),row(B,'98765432000100','CONCLUIDA'),row(C)];
  const old=[row(A),row(B,'98765432000100','ABERTA'),row(D)];
  const r=planEbefReconciliationOffline(input,snapshot(old));
  assert.deepEqual([r.inserts,r.updates,r.unchanged,r.existingRecordsOutsideExport],
    [1,1,1,1]);
  assert.equal(r.conflicts,0);
  assert.equal(r.wouldDelete,0);
  assert.equal(r.needsReadOnlySnapshot,false);
  assert.equal(r.snapshotVerifiedAgainstDatabase,false);
  assert.equal(r.concurrencyRechecked,false);
  assert.equal(r.writesPerformed,false);
  assert.equal(JSON.stringify(r).includes('01234567000189'),false);
  assert.equal(JSON.stringify(r).includes(A),false);
  const repeated=planEbefReconciliationOffline([...input].reverse(),
    snapshot([...old].reverse()));
  assert.equal(repeated.proposedDigest,r.proposedDigest);
  assert.equal(repeated.snapshotDigest,r.snapshotDigest);
});
test('repeticao sem mudanca e estavel e nao produz atualizacoes',()=>{
  const data=[row(A),row(B)];
  const r=planEbefReconciliationOffline(data,snapshot(data));
  assert.equal(r.updates,0);
  assert.equal(r.inserts,0);
  assert.equal(r.unchanged,2);
});
test('bloqueia alteracao de identidade para mesmo ID sem criar plano parcial',()=>{
  const data=[row(A),row(B)];
  for(const field of ['cnpj','competencia','tipo_tarefa']){
    const changed={...row(B)};
    if(field==='cnpj')changed.cnpj='98765432000100';
    if(field==='competencia')changed.competencia='2026-09';
    if(field==='tipo_tarefa'){
      changed.tipo_tarefa='declaracao';
      changed.tarefa='DECLARACAO DE EBEF | TECNICO';
    }
    assert.throws(()=>planEbefReconciliationOffline(
      [row(A),changed],snapshot(data)),/Identidade imutavel/);
  }
});
test('recusa snapshots incompletos, nao reconhecidos ou com data invalida',()=>{
  const good=snapshot([row(A)]);
  for(const s of [
    {...good,complete:false},
    {...good,kind:'other'},
    {...good,origin:'supabase_live_confirmed'},
    {...good,capturedAt:'data invalida'},
    {...good,capturedAt:'2026-02-31T16:00:00.000Z'},
    {...good,rows:null},
  ]) assert.throws(()=>planEbefReconciliationOffline([row(A)],s),/Snapshot/);
});
test('bloqueia IDs repetidos, chaves manipuladas e datas ruins',()=>{
  assert.throws(()=>planEbefReconciliationOffline([row(A),row(A)]),/repetido/);
  assert.throws(()=>planEbefReconciliationOffline(
    [row(A)],snapshot([row(A),row(A)])),/repetido/);
  const invalid={...row(A),source_key:'c'.repeat(64)};
  assert.throws(()=>planEbefReconciliationOffline([invalid]),/contrato/);
  const invalidDate={...row(A),vencimento:'2026-02-30'};
  assert.throws(()=>planEbefReconciliationOffline([invalidDate]),/contrato/);
});
