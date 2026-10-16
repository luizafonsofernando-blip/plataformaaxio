import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectGlobalFilters,summarizeGlobalFilterDiagnostics}
  from '../src/global-filters-diagnostic.mjs';

test('retorna apenas metadados permitidos e localizadores sem strings de clientes',async()=>{
  const page={
    getByText:re=>({
      count:async()=>/usu/.test(String(re))?0:1,
      isVisible:async()=>true,
    }),
    evaluate:async()=>({
      dateRangeVisible:true,
      dropdowns:[{
        id:'gestta-multiselect-dropdown-7-p',tag:'div',
        classes:['gestta-multiselect-dropdown'],x:600,width:280,
        inputs:1,buttons:1,
        equals:{allClients:false,allUsers:false,dataMeta:false},
        contains:{clientes:false,usuarios:false,dataMeta:false},
        inputHasNonemptyValue:false,
      }],
    }),
  };
  const result=await inspectGlobalFilters(page);
  assert.equal(result.textualMatches.users.count,0);
  assert.equal(result.dateRangeVisible,true);
  assert.equal(result.totalTopDropdowns,1);
  assert.equal(JSON.stringify(result).includes('Cliente Exemplo'),false);
});

test('detecta resumo estrutural sem descartar painel com usuário não reconhecido',()=>{
  const raw={matches:{clients:{count:1},users:{count:0},dataMeta:{count:1}},
    dateRangeVisible:true,dropdowns:[]};
  assert.equal(summarizeGlobalFilterDiagnostics(raw).totalTopDropdowns,0);
});

test('entrada inválida não produz falso diagnóstico de sucesso',()=>{
  assert.throws(()=>summarizeGlobalFilterDiagnostics(null),/incompleto/);
  assert.throws(()=>summarizeGlobalFilterDiagnostics({dropdowns:[]}),/incompleto/);
});
