import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyEbefFilterLabel} from '../src/ebef-summary-diagnostic.mjs';

test('classifica resumo conhecido sem retornar texto bruto',()=>{
  const r=classifyEbefFilterLabel('DECLARAÇÃO DE EBEF | TÉCNICO +2');
  assert.equal(r.strictSummaryMatch,true);
  assert.equal(r.startsDeclaracao,true);
  assert.equal(r.suffixIsTwo,true);
  assert.equal(r.isTodasTarefas,false);
  assert.equal(JSON.stringify(r).includes('TÉCNICO'),false);
});
test('nao aceita como evidencia resumos incompletos e nao EBEF',()=>{
  for (const label of [
    'Todas as tarefas','DECLARAÇÃO DE EBEF | TÉCNICO +1',
    'VERIFICAR NECESSIDADE DE EBEF +2','Usuarios +2','',
  ]) assert.equal(classifyEbefFilterLabel(label).strictSummaryMatch,false);
});
test('sinaliza EBEF presente sem confundir com confirmacao de 3 marcacoes',()=>{
  const r=classifyEbefFilterLabel('DECLARAÇÃO DE EBEF | TÉCNICO');
  assert.equal(r.hasEbef,true);
  assert.equal(r.hasDeclaracao,true);
  assert.equal(r.strictSummaryMatch,false);
  assert.equal(r.suffixIsTwo,false);
});
