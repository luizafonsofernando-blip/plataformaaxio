import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSingleExportOptions,assertGlobalExportFilters,verifiedExportButton,
  assertEbefSelectionPreserved,EXPORT_BUTTON_CSS,
} from '../src/export-test-guards.mjs';

test('exige confirmacao explicita, janela outubro 01-30 e apenas um XLSX',()=>{
  const options=parseSingleExportOptions([
    '--start=2026-10-01','--end=2026-10-30','--confirm-download',
  ]);
  assert.deepEqual(options.window,{start:'2026-10-01',end:'2026-10-30'});
  assert.equal(options.expected,'01/10/2026 - 30/10/2026');
});
test('bloqueia periodos maiores, incorretos ou sem consentimento explicito',()=>{
  for(const args of [
    ['--start=2026-10-01','--end=2026-10-30'],
    ['--start=2026-10-01','--end=2026-10-31','--confirm-download'],
    ['--start=2026-09-01','--end=2026-09-30','--confirm-download'],
    ['--start=2026-10-01','--end=2026-10-30','--confirm-download','--confirm-download'],
    ['--start=2026-10-01','--end=2026-10-30','--confirm-download','--auto'],
  ])assert.throws(()=>parseSingleExportOptions(args));
});

function globalPage(found){
  return {
    getByText:regexp=>{
      const label=String(regexp);
      const key=label.includes('clientes')?'clientes':
        label.includes('usu')?'usuarios': 'Data Meta';
      return {
        count:async()=>found[key]?1:0,
        isVisible:async()=>true,
      };
    },
  };
}
test('só permite exportação com Todos clientes, Todos usuarios e Data Meta visíveis',async()=>{
  assert.deepEqual(await assertGlobalExportFilters(globalPage({
    clientes:true,usuarios:true,'Data Meta':true,
  })),{allClients:true,allUsers:true,modeDataMeta:true});
  for(const missing of ['clientes','usuarios','Data Meta']){
    const all={clientes:true,usuarios:true,'Data Meta':true};
    all[missing]=false;
    await assert.rejects(()=>assertGlobalExportFilters(globalPage(all)),/nao confirmado/);
  }
});
test('seleção EBEF obrigatória após Filtrar',async()=>{
  const makePage=text=>({
    locator:()=>({
      count:async()=>1,isVisible:async()=>true,innerText:async()=>text,
    }),
  });
  assert.equal(await assertEbefSelectionPreserved(makePage('DECLARAÇÃO DE EBEF | TÉCNICO +2')),true);
  await assert.rejects(()=>assertEbefSelectionPreserved(makePage('TODAS TAREFAS')),/nao confirma E-BEF/);
});
test('botão de exportação só é usado quando o diagnóstico retorna candidato único',async()=>{
  let touched=0;
  const good={
    locator:css=>{
      touched++;
      if(css===EXPORT_BUTTON_CSS)return {
        count:async()=>1,isVisible:async()=>true,isEnabled:async()=>true,
      };
      throw Error('unexpected');
    },
    evaluate:async()=>({
      scopeCount:1,actionsCount:3,
      candidates:[{
        tag:'button',classes:['mixed-topfilter__action--export'],
        iconClasses:['fa','fa-download'],visible:true,disabled:false,
        explicitExportClass:true,hasDownloadIcon:true,
      }],
    }),
  };
  await verifiedExportButton(good);
  assert.equal(touched,1);
  const missing={...good,evaluate:async()=>({
    scopeCount:1,actionsCount:3,candidates:[],
  })};
  await assert.rejects(()=>verifiedExportButton(missing),/nao confirmada/);
  assert.equal(touched,1);
});
