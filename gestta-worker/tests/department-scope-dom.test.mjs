import test from 'node:test';
import assert from 'node:assert/strict';
import {REQUIRED_DEPARTMENTS} from '../src/advanced-filter-config.mjs';
import {inspectScopedDepartments} from '../src/department-scope.mjs';

// Simula a mesma estrutura observada pelo diagnóstico real: uma lista
// de 22 toggles sob um menu "Selecionar todos", dentro de um ancestral maior.
function fakeDropdown(extraLabel, {selected=false}={}) {
  const toggles=[...REQUIRED_DEPARTMENTS,extraLabel].map(label=>{
    const li={textContent:label,getAttribute:()=>null};
    const input={
      tagName:'INPUT',type:'checkbox',checked:selected,
      classList:['checkbox-item'],matches:()=>true,
      getAttribute:()=>null,querySelector:()=>null,
    };
    return {
      closest:tag=>tag==='li'?li:null,
      querySelector:css=>css==='.checkbox-item'?input:null,
      tagName:'A',classList:['gestta-multiselect-dropdown__item-toggle'],
      getAttribute:()=>null,
    };
  });
  const element=(text,parent,nodes)=>({
    textContent:text,parentElement:parent,
    getBoundingClientRect:()=>({width:100,height:25}),
    querySelectorAll:()=>nodes,
  });
  const root=element('',null,[...toggles,...Array(42).fill({})]);
  const group=element('',root,toggles);
  const menuHeader=element('',group,toggles.slice(-1));
  const menuitem=element('Selecionar todos',menuHeader,[]);
  const link=element('Selecionar todos',menuitem,[]);
  const fakeDocument={querySelectorAll:()=>[menuitem,link]};
  const fakeWindow={getComputedStyle:()=>({visibility:'visible',display:'block'})};
  let reads=0;
  const page={
    evaluate:async(fn,arg)=>{
      // Playwright evaluates this function in the browser global scope.
      const originalDoc=globalThis.document,originalWindow=globalThis.window;
      globalThis.document=fakeDocument;
      globalThis.window=fakeWindow;
      try { reads++; return fn(arg); }
      finally {
        if(originalDoc===undefined) delete globalThis.document;
        else globalThis.document=originalDoc;
        if(originalWindow===undefined) delete globalThis.window;
        else globalThis.window=originalWindow;
      }
    },
  };
  return {page,reads:()=>reads};
}

test('21 departamentos + 1 controle de selecionar todos => escopo válido',async()=>{
  const mock=fakeDropdown('Selecionar todos',{selected:true});
  const result=await inspectScopedDepartments(mock.page);
  assert.equal(mock.reads(),1);
  assert.equal(result.found,true);
  assert.equal(result.rowCount,21);
  assert.equal(result.recognizedUnique,21);
  assert.equal(result.unknownCount,0);
  assert.equal(result.ignoredSelectAllControls,1);
  assert.equal(result.allExpectedPresent,true);
  assert.equal(result.stateCounts.marcado,21);
  assert(result.nearbyCandidateProfiles.some(x=>x.toggles===22&&x.valid));
});

test('21 departamentos + nome desconhecido => escopo inválido e não vaza nome',async()=>{
  const mock=fakeDropdown('CLIENTE DADO CONFIDENCIAL',{selected:true});
  const result=await inspectScopedDepartments(mock.page);
  assert.equal(result.found,false);
  assert.equal(result.candidateScopes,0);
  assert(result.nearbyCandidateProfiles.some(x=>x.toggles===22&&!x.valid));
  assert.equal(JSON.stringify(result).includes('CLIENTE DADO CONFIDENCIAL'),false);
});
