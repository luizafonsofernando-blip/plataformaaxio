import test from 'node:test';
import assert from 'node:assert/strict';
import {
  discoverDepartmentTrigger, validateDepartmentTriggerDiscovery,
} from '../src/department-trigger-discovery.mjs';

test('aceita um unico ID da dropdown dentro do grupo Departamento',()=>{
  assert.equal(validateDepartmentTriggerDiscovery({
    labelCount:1,candidateCount:1,depth:2,
    candidateId:'gestta-multiselect-dropdown-17-p',
  }),'#gestta-multiselect-dropdown-17-p');
});

test('bloqueia componente com ID sem formato confirmado ou distante',()=>{
  for (const candidate of [
    {labelCount:1,candidateCount:1,depth:2,candidateId:'other-widget'},
    {labelCount:1,candidateCount:1,depth:6,candidateId:'gestta-multiselect-dropdown-17-p'},
    {labelCount:1,candidateCount:2,depth:2,candidateId:''},
    {labelCount:2,candidateCount:1,depth:2,candidateId:'gestta-multiselect-dropdown-17-p'},
  ]) assert.throws(()=>validateDepartmentTriggerDiscovery(candidate),/contêiner não identificado/);
});

function fakeDocument(dropdownCount=1) {
  const ids = Array.from({length:dropdownCount},(_,i)=>({
    id:'gestta-multiselect-dropdown-'+(17+i)+'-p',
  }));
  const outer={
    parentElement:null,
    querySelectorAll:()=>ids,
  };
  const group={
    parentElement:outer,
    querySelectorAll:()=>ids,
  };
  const label={
    children:[],textContent:'Departamento',parentElement:group,
  };
  return {querySelectorAll:()=>[label]};
}

test('descobre campo preenchido pelo título em um DOM simulado',async()=>{
  let clicks=0;
  const originalDocument=globalThis.document;
  const field={
    count:async()=>1,isVisible:async()=>true,
    click:async()=>{clicks++;},
  };
  const page={
    evaluate:async fn=>{
      globalThis.document=fakeDocument();
      try{return fn();}
      finally{
        if(originalDocument===undefined)delete globalThis.document;
        else globalThis.document=originalDocument;
      }
    },
    locator:css=>{
      assert.equal(css,'#gestta-multiselect-dropdown-17-p');
      return field;
    },
  };
  const result=await discoverDepartmentTrigger(page);
  assert.equal(result,field);
  assert.equal(clicks,0);
});

test('mais de um dropdown sob mesmo Departamento não é clicado',async()=>{
  const originalDocument=globalThis.document;
  let clicks=0;
  const page={
    evaluate:async fn=>{
      globalThis.document=fakeDocument(2);
      try{return fn();}
      finally{
        if(originalDocument===undefined)delete globalThis.document;
        else globalThis.document=originalDocument;
      }
    },
    locator:()=>({click:async()=>{clicks++;}}),
  };
  await assert.rejects(()=>discoverDepartmentTrigger(page),/contêiner não identificado/);
  assert.equal(clicks,0);
});
