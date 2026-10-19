import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assembleEbefOfflineSnapshot} from '../src/ebef-snapshot-pages.mjs';
import {planEbefReconciliationOffline} from '../src/ebef-reconciliation-plan.mjs';

const hash=x=>createHash('sha256').update(x).digest('hex');
const makeRow=id=>({
  source_key:hash('gestta-id:'+id),gestta_id:id,cnpj:'01234567000189',
  competencia:'2026-10',tarefa:'VERIFICAR NECESSIDADE DE EBEF | TECNICO',
  tipo_tarefa:'verificacao',tipo_registro:'',cliente:'CLIENTE SINTETICO',
  departamento:'TECNICO',responsavel:'EQUIPE SINTETICA',status_gestta:'ABERTA',
  vencimento:'2026-10-19',data_legal:null,concluido_em:null,
  feito_atrasado:false,feito_com_multa:null,baixado:false,
});
const sorted=()=>['a'.repeat(24),'b'.repeat(24),'c'.repeat(24)]
  .map(makeRow).sort((a,b)=>a.source_key.localeCompare(b.source_key));
const manifest=(n=3,size=2)=>({
  schema:'ebef_gestta_tasks/v1',mode:'operator_supplied_offline',
  scope:'gestta_ebef_tasks_only',
  revision:'f'.repeat(64),capturedAt:'2026-10-19T16:00:00.000Z',
  totalRows:n,pageSize:size,
});
const pages=(data=sorted())=>[
  {pageIndex:0,revision:'f'.repeat(64),rows:data.slice(0,2)},
  {pageIndex:1,revision:'f'.repeat(64),rows:data.slice(2)},
];

test('monta paginas ordenadas e permite estimativa offline sem afirmar leitura real',()=>{
  const {summary,snapshot}=assembleEbefOfflineSnapshot(manifest(),pages());
  assert.equal(summary.pagesVerified,2);
  assert.equal(summary.rowsVerified,3);
  assert.equal(summary.manifestPagesComplete,true);
  assert.equal(summary.databaseSnapshotVerified,false);
  assert.equal(summary.isolationIndependentlyVerified,false);
  assert.equal(summary.writesPerformed,false);
  assert.equal(summary.allUsersProven,false);
  assert.equal(snapshot.rows.length,3);
  assert.equal(snapshot.complete,true);
  const plan=planEbefReconciliationOffline([sorted()[0]],snapshot);
  assert.equal(plan.inserts,0);
  assert.equal(plan.unchanged,1);
  assert.equal(plan.existingRecordsOutsideExport,2);
  assert.equal(plan.snapshotVerifiedAgainstDatabase,false);
  assert.equal(JSON.stringify(summary).includes('01234567000189'),false);
  assert.equal(JSON.stringify(summary).includes('CLIENTE SINTETICO'),false);
});
test('rejeita pagina faltante ou pagina inesperada',()=>{
  assert.throws(()=>assembleEbefOfflineSnapshot(manifest(),pages().slice(0,1)),
    /incompleto/);
  const unexpected=[...pages(),{pageIndex:2,revision:'f'.repeat(64),rows:[]}];
  assert.throws(()=>assembleEbefOfflineSnapshot(manifest(),unexpected),
    /incompleto/);
});
test('rejeita indice desordenado ou revisao diferente entre paginas',()=>{
  const badIndex=pages();badIndex[1].pageIndex=3;
  assert.throws(()=>assembleEbefOfflineSnapshot(manifest(),badIndex),/incompleto/);
  const badRevision=pages();badRevision[1].revision='e'.repeat(64);
  assert.throws(()=>assembleEbefOfflineSnapshot(manifest(),badRevision),/incompleto/);
});
test('rejeita chave repetida inclusive entre paginas',()=>{
  const duplicate=pages();duplicate[1].rows=[duplicate[0].rows[1]];
  assert.throws(()=>assembleEbefOfflineSnapshot(manifest(),duplicate),/incompleto/);
});
test('rejeita falta de ordem crescente mesmo com todas tarefas presentes',()=>{
  const unordered=sorted().reverse();
  assert.throws(()=>assembleEbefOfflineSnapshot(manifest(),pages(unordered)),
    /incompleto/);
});
test('rejeita linhas adulteradas, datas invalidas ou campos extras',()=>{
  const tampered=pages();
  tampered[0].rows[0]={...tampered[0].rows[0],cnpj:'1'};
  assert.throws(()=>assembleEbefOfflineSnapshot(manifest(),tampered),/incompleto/);
  const withExtra=pages();withExtra[0].rows[0]={...withExtra[0].rows[0],extra:true};
  assert.throws(()=>assembleEbefOfflineSnapshot(manifest(),withExtra),/incompleto/);
});
test('rejeita manifesto com escopo errado, hora impossivel ou total zero',()=>{
  for(const patch of [
    {scope:'all_tables'},
    {mode:'live_db_verified'},
    {revision:'nao_validada'},
    {capturedAt:'2026-02-31T16:00:00.000Z'},
    {totalRows:-1},
    {totalRows:10001},
    {pageSize:501},
  ]){
    assert.throws(()=>assembleEbefOfflineSnapshot({...manifest(),...patch},pages()),
      /incompleto/);
  }
});
test('rejeita pagina truncada e total declarado inconsistente',()=>{
  const cut=pages();cut[0].rows=cut[0].rows.slice(0,1);
  assert.throws(()=>assembleEbefOfflineSnapshot(manifest(),cut),/incompleto/);
  assert.throws(()=>assembleEbefOfflineSnapshot(manifest(4,2),pages()),
    /incompleto/);
});

test('fotografia vazia exige manifesto com zero e nenhuma pagina, sem provar banco vazio',()=>{
  const {snapshot,summary}=assembleEbefOfflineSnapshot(manifest(0,200),[]);
  assert.deepEqual(snapshot.rows,[]);
  assert.equal(summary.rowsVerified,0);
  assert.equal(summary.pagesVerified,0);
  assert.equal(summary.databaseSnapshotVerified,false);
  assert.equal(summary.isolationIndependentlyVerified,false);
  const plan=planEbefReconciliationOffline([sorted()[0]],snapshot);
  assert.equal(plan.inserts,1);
  assert.equal(plan.snapshotVerifiedAgainstDatabase,false);
  assert.equal(plan.applyAuthorized,false);
  assert.throws(()=>assembleEbefOfflineSnapshot(manifest(0,200),pages()),
    /incompleto/);
});
