import test from 'node:test';
import assert from 'node:assert/strict';
import {assertEbefThreeSelected} from '../src/ebef-selection-after-apply.mjs';

const names=[
  'DECLARAÇÃO DE EBEF | TÉCNICO',
  'VERIFICAR NECESSIDADE DE EBEF | ROTINA A',
  'VERIFICAR NECESSIDADE DE EBEF | ROTINA B',
];
const full=()=>names.map(name=>({name,checked:true}));
test('confirma tres opcoes EBEF distintas somente se todas marcadas',()=>{
  assert.deepEqual(assertEbefThreeSelected(full()),{
    found:3,checked:3,completeRendered:true,
  });
});
test('nao homologa 2/3, falta, duplicacao ou tarefa estranha',()=>{
  for(const data of [
    full().map((r,i)=>({...r,checked:i!==2})),
    full().slice(0,2),
    [...full(),{name:'OUTRA TAREFA',checked:true}],
    [full()[0],full()[1],full()[1]],
    [{name:'OUTRA TAREFA',checked:true},...full().slice(1)],
    [{name:names[0],checked:'true'},...full().slice(1)],
  ]){
    assert.throws(()=>assertEbefThreeSelected(data));
  }
});
