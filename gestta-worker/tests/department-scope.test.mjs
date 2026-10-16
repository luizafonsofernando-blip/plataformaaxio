import test from 'node:test';
import assert from 'node:assert/strict';
import {REQUIRED_DEPARTMENTS} from '../src/advanced-filter-config.mjs';
import {inspectScopedDepartments} from '../src/department-scope.mjs';

const makeSnapshot=(name,checked)=>({
  label:name,elementTag:'input',toggleTag:'a',
  checkboxClasses:['checkbox-item'],
  toggleClasses:['gestta-multiselect-dropdown__item-toggle'],
  checkboxRole:'',inputType:'checkbox',inputChecked:checked,
  ariaChecked:null,dataState:'',
});
function mockBrowserResult(raw){
  let reads=0;
  const page={evaluate:async(fn,allowed)=>{
    assert.match(fn.toString(),/visibleSelectAllCandidates/);
    assert.deepEqual(allowed,REQUIRED_DEPARTMENTS);
    reads++;
    return raw;
  }};
  return {page,reads:()=>reads};
}

test('escopo único contendo 21 nomes e estados retornados sem milhares de linhas',async()=>{
  const input={
    found:true,candidateScopes:1,visibleSelectAllCandidates:2,
    nearbyToggleCounts:[21],
    snapshots:REQUIRED_DEPARTMENTS.map(name=>makeSnapshot(name,true)),
  };
  const fake=mockBrowserResult(input);
  const result=await inspectScopedDepartments(fake.page);
  assert.equal(fake.reads(),1);
  assert.equal(result.rowCount,21);
  assert.equal(result.recognizedUnique,21);
  assert.equal(result.unknownCount,0);
  assert.equal(result.allExpectedPresent,true);
  assert.equal(result.stateCounts.marcado,21);
});

test('escopo nao resolvido nunca é tratado como selecao integral',async()=>{
  const fake=mockBrowserResult({
    found:false,candidateScopes:0,visibleSelectAllCandidates:1,
    nearbyToggleCounts:[4,8,21],snapshots:[],
  });
  const result=await inspectScopedDepartments(fake.page);
  assert.equal(result.found,false);
  assert.equal(result.allExpectedPresent,undefined);
  assert.equal(result.candidateScopes,0);
});

test('não divulga nomes desconhecidos mesmo com escopo falsamente marcado válido',async()=>{
  const labels=[...REQUIRED_DEPARTMENTS.slice(0,20),'CLIENTE - DADOS SIGILOSOS'];
  const fake=mockBrowserResult({
    found:true,candidateScopes:1,visibleSelectAllCandidates:1,
    nearbyToggleCounts:[21],snapshots:labels.map(name=>makeSnapshot(name,true)),
  });
  const result=await inspectScopedDepartments(fake.page);
  assert.equal(result.allExpectedPresent,false);
  assert.equal(result.unknownCount,1);
  assert.equal(JSON.stringify(result).includes('CLIENTE - DADOS SIGILOSOS'),false);
});

test('estado misto preservado, sem marcar checkboxes',async()=>{
  const fake=mockBrowserResult({
    found:true,candidateScopes:1,visibleSelectAllCandidates:1,
    nearbyToggleCounts:[21],
    snapshots:REQUIRED_DEPARTMENTS.map((name,i)=>makeSnapshot(name,i%2===0)),
  });
  const result=await inspectScopedDepartments(fake.page);
  assert.equal(result.stateCounts.marcado,11);
  assert.equal(result.stateCounts.desmarcado,10);
});
