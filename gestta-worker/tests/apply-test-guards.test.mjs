import test from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED_DEPARTMENTS } from '../src/advanced-filter-config.mjs';
import { assertDepartmentSelection, assertSelectedStatusesAndTypes } from '../src/apply-test-guards.mjs';

const validScope = () => ({
  found:true, candidateScopes:1,
  rowCount:REQUIRED_DEPARTMENTS.length,
  recognizedUnique:REQUIRED_DEPARTMENTS.length,
  allExpectedPresent:true,unknownCount:0,
  stateCounts:{marcado:21,desmarcado:0,indeterminado:0},
});
const validStatuses = () => Object.fromEntries(
  ['ABERTA','CONCLUIDA','IMPEDIMENTO','DESCONSIDERADA'].map(k=>[k,{checked:true}])
);
const validTypes = () => Object.fromEntries(
  ['FLUXO DE TAREFAS','SOLICITACAO DE SERVICO','RECORRENTE'].map(k=>[k,{checked:true}])
);
test('permite Filtrar apenas com os 21 departamentos unicos marcados',()=>{
  assert.doesNotThrow(()=>assertDepartmentSelection(validScope()));
});
test('rejeita qualquer departamento desmarcado ou indeterminado',()=>{
  for(const patch of [
    {marcado:20,desmarcado:1,indeterminado:0},
    {marcado:20,desmarcado:0,indeterminado:1}
  ]){
    assert.throws(()=>assertDepartmentSelection({...validScope(),stateCounts:patch}),/Nao acionar Filtrar/);
  }
});
test('rejeita lista global, escopo ambiguo ou incompleto',()=>{
  for(const patch of [
    {found:false},{candidateScopes:2},{rowCount:7735},
    {recognizedUnique:20},{unknownCount:1},{allExpectedPresent:false},
  ]) {
    assert.throws(()=>assertDepartmentSelection({...validScope(),...patch}),/Nao acionar Filtrar/);
  }
});
test('aceita 4 status e 3 tipos todos marcados',()=>{
  assert.doesNotThrow(()=>assertSelectedStatusesAndTypes(validStatuses(),validTypes()));
});
test('bloqueia qualquer status ou tipo desmarcado ou ausente',()=>{
  for(const group of ['statuses','types']){
    const states=validStatuses(),types=validTypes();
    if(group==='statuses')states.CONCLUIDA.checked=false;
    else types.RECORRENTE.checked=false;
    assert.throws(()=>assertSelectedStatusesAndTypes(states,types),/nao acionar Filtrar/);
  }
  const missing=validStatuses();delete missing.ABERTA;
  assert.throws(()=>assertSelectedStatusesAndTypes(missing,validTypes()),/nao acionar Filtrar/);
});
