import test from 'node:test';
import assert from 'node:assert/strict';
import {auditMonthlyEbefExports,expectedEbefMonthWindows}
  from '../src/monthly-ebef-audit.mjs';

const october=expectedEbefMonthWindows('2026-10');
const row=(digit,date,type='verificacao')=>({
  source_key:digit.repeat(64),
  gestta_id:digit.repeat(24),
  cnpj:'01234567000189',competencia:'2026-10',
  tarefa:type==='verificacao'?'VERIFICAR NECESSIDADE DE EBEF | TECNICO':
    'DECLARACAO DE EBEF | TECNICO',
  tipo_tarefa:type,status_gestta:'ABERTA',
  vencimento:date,concluido_em:null,baixado:false,
});
const windows=()=>[
  {window:october[0],tasks:[row('a','2026-10-12'),row('b','2026-10-30')]},
  {window:october[1],tasks:[row('a','2026-10-12'),row('b','2026-10-30'),
    row('c','2026-10-31','declaracao')]},
];

test('outubro exige ambas as janelas 01-30 e 02-31',()=>{
  assert.deepEqual(october,[
    {start:'2026-10-01',end:'2026-10-30'},
    {start:'2026-10-02',end:'2026-10-31'},
  ]);
  assert.throws(()=>auditMonthlyEbefExports('2026-10',[windows()[0]]),
    /incompleto/);
});
test('mes completo elimina sobreposicao por ID, inclui dia 31 e nao expõe dados',()=>{
  const result=auditMonthlyEbefExports('2026-10',windows());
  assert.equal(result.rawRows,5);
  assert.equal(result.distinctTasks,3);
  assert.equal(result.overlapDuplicates,2);
  assert.deepEqual(result.categories,{declaracao:1,verificacao:2});
  assert.equal(result.completeWindows,true);
  assert.equal(result.allUsersProven,false);
  assert.equal(result.synchronized,false);
  assert.equal(JSON.stringify(result).includes('01234567000189'),false);
  assert.equal(JSON.stringify(result).includes('VERIFICAR NECESSIDADE'),false);
  assert.deepEqual(auditMonthlyEbefExports('2026-10',windows().reverse()).categories,
    result.categories);
});
test('rejeita janela duplicada, alterada e fora de ordem mensal',()=>{
  assert.throws(()=>auditMonthlyEbefExports('2026-10',[
    windows()[0],windows()[0]]),/inesperada|duplicada/);
  const changed=windows();changed[1].window={start:'2026-10-03',end:'2026-10-31'};
  assert.throws(()=>auditMonthlyEbefExports('2026-10',changed),/inesperada/);
});
test('rejeita mesmo ID com titulo/status divergentes no intervalo sobreposto',()=>{
  const changed=windows();
  changed[1].tasks[0]={...changed[1].tasks[0],status_gestta:'CONCLUIDA'};
  assert.throws(()=>auditMonthlyEbefExports('2026-10',changed),
    /campos divergentes/);
});
test('rejeita datas fora do recorte, ID repetido no arquivo e categoria desconhecida',()=>{
  let changed=windows();changed[0].tasks[0]={...changed[0].tasks[0],vencimento:'2026-10-31'};
  assert.throws(()=>auditMonthlyEbefExports('2026-10',changed),/fora da janela/);
  changed=windows();changed[0].tasks.push({...changed[0].tasks[0]});
  assert.throws(()=>auditMonthlyEbefExports('2026-10',changed),/repetido/);
  changed=windows();changed[0].tasks[0].tipo_tarefa='outra';
  assert.throws(()=>auditMonthlyEbefExports('2026-10',changed),/nao validado/);
});
test('fevereiro exige uma janela, intervalo vazio permitido como observacao vazia',()=>{
  const expected=expectedEbefMonthWindows('2026-02');
  assert.deepEqual(expected,[{start:'2026-02-01',end:'2026-02-28'}]);
  const result=auditMonthlyEbefExports('2026-02',[{window:expected[0],tasks:[]}]);
  assert.equal(result.distinctTasks,0);
  assert.equal(result.completeWindows,true);
  assert.equal(result.allUsersProven,false);
});
