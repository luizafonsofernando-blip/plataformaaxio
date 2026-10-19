import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewMonthlyEbefExports} from '../src/monthly-ebef-review.mjs';

const task=(id,cnpj,vencimento,tipo='verificacao',status='ABERTA')=>({
  source_key:id.repeat(64),gestta_id:id.repeat(24),cnpj,
  competencia:'2026-10',tarefa:tipo==='declaracao'?'DECLARACAO DE EBEF | TECNICO':
    'VERIFICAR NECESSIDADE DE EBEF | TECNICO',
  tipo_tarefa:tipo,tipo_registro:'',cliente:'EMPRESA EXEMPLO',
  departamento:'Técnico',responsavel:'Equipe Exemplo',status_gestta:status,
  vencimento,data_legal:null,concluido_em:null,feito_atrasado:false,
  feito_com_multa:false,baixado:false,
});
const windows=()=>{
  const a=task('a','01234567000189','2026-10-03');
  const b=task('b','01234567000189','2026-10-12','declaracao','CONCLUÍDO');
  const c=task('c','98765432000100','2026-10-31','verificacao','IMPEDIMENTO');
  return [
    {window:{start:'2026-10-01',end:'2026-10-30'},tasks:[a,b]},
    {window:{start:'2026-10-02',end:'2026-10-31'},tasks:[a,b,c]},
  ];
};

test('revisa CNPJs unicos separadamente de tarefas e categorias',()=>{
  const {summary,tasks}=reviewMonthlyEbefExports('2026-10',windows());
  assert.equal(tasks.length,3);
  assert.equal(summary.distinctTasks,3);
  assert.equal(summary.uniqueCnpjs,2);
  assert.equal(summary.companiesBoth,1);
  assert.equal(summary.companiesOnlyVerification,1);
  assert.equal(summary.companiesOnlyDeclaration,0);
  assert.equal(summary.categories.verificacao,2);
  assert.equal(summary.categories.declaracao,1);
  assert.deepEqual(summary.statusCounts,{
    aberta:1,concluida:1,impedimento:1,desconsiderada:0,outros:0,
  });
  assert.equal(summary.declarationDeliveryVerified,false);
  assert.equal(summary.actualDatabaseCompared,false);
  assert.equal(summary.writesPerformed,false);
  assert.equal(JSON.stringify(summary).includes('01234567000189'),false);
  assert.equal(JSON.stringify(summary).includes('EMPRESA EXEMPLO'),false);
});
test('nao confunde 3 tipos de filtros EBEF com 3 categorias do XLSX',()=>{
  const entries=windows();
  entries[0].tasks=entries[0].tasks.filter(x=>x.tipo_tarefa==='verificacao');
  entries[1].tasks=entries[1].tasks.filter(x=>x.tipo_tarefa==='verificacao');
  const {summary}=reviewMonthlyEbefExports('2026-10',entries);
  assert.equal(summary.categories.verificacao,2);
  assert.equal(summary.categories.declaracao,0);
  assert.equal(summary.declarationDeliveryVerified,false);
});
test('falha sem segunda janela ou com CNPJ nao validado',()=>{
  assert.throws(()=>reviewMonthlyEbefExports('2026-10',windows().slice(0,1)),
    /incompleto/);
  const rows=windows();
  rows[1].tasks[2].cnpj='123';
  assert.throws(()=>reviewMonthlyEbefExports('2026-10',rows),
    /Documento/);
});
test('detecta campo de responsavel divergente mesmo com mesmo ID',()=>{
  const rows=windows();
  rows[1].tasks[0]={...rows[1].tasks[0],responsavel:'outro'};
  assert.throws(()=>reviewMonthlyEbefExports('2026-10',rows),
    /divergentes/);
});
