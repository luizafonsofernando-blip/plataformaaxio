import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeUsersCheckboxKinds} from '../src/users-checkbox-kinds-diagnostic.mjs';

test('classifica controles distintos de opcoes sem afirmar cobertura global',()=>{
  const xs=[
    {kind:'option',checked:true,disabled:false},
    {kind:'option',checked:true,disabled:false},
    {kind:'control',checked:false,disabled:false},
  ];
  const r=summarizeUsersCheckboxKinds(xs);
  assert.equal(r.total.count,3);
  assert.equal(r.groups.option.count,2);
  assert.equal(r.groups.option.unchecked,0);
  assert.equal(r.groups.control.unchecked,1);
  assert.equal(r.allUsersProven,false);
});
test('um usuario desmarcado continua pendente mesmo com 596 marcados',()=>{
  const xs=Array.from({length:596},()=>({kind:'option',checked:true,disabled:false}));
  xs.push({kind:'option',checked:false,disabled:false});
  const r=summarizeUsersCheckboxKinds(xs);
  assert.equal(r.groups.option.unchecked,1);
  assert.equal(r.groups.control.count,0);
  assert.equal(r.allUsersProven,false);
});
test('tipo desconhecido nao pode ser convertido em cobertura valida',()=>{
  const r=summarizeUsersCheckboxKinds([
    {kind:'unknown',checked:false,disabled:false},
    {kind:'option',checked:true,disabled:false},
  ]);
  assert.equal(r.groups.unknown.unchecked,1);
  assert.equal(r.allUsersProven,false);
  assert.throws(()=>summarizeUsersCheckboxKinds([{kind:'usuario',checked:true,disabled:false}]));
});
