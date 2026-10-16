import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeExportCandidates, inspectExportControl} from '../src/export-control-diagnostic.mjs';

const candidate=(extra={})=>({
 tag:'button',
 classes:['mixed-topfilter__action--export'],
 iconClasses:['fa','fa-download'],
 visible:true,disabled:false,
 explicitExportClass:true,hasDownloadIcon:true,...extra,
});

test('único botão visível de exportação com ícone é candidato válido',()=>{
  const result=summarizeExportCandidates({
    scopeCount:1,actionsCount:5,candidates:[candidate()],
  });
  assert.equal(result.visibleDownloadCandidates,1);
  assert.equal(result.uniqueExportCandidate,true);
  assert.equal(result.exportClassAndIconConfirmed,true);
});

test('não aprova escopos duplicados ou candidatos ambíguos',()=>{
  for(const mock of [
    {scopeCount:2,actionsCount:5,candidates:[candidate()]},
    {scopeCount:1,actionsCount:5,candidates:[candidate(),candidate()]},
    {scopeCount:0,actionsCount:0,candidates:[]},
  ]){
    const result=summarizeExportCandidates(mock);
    assert.equal(result.uniqueExportCandidate,false);
  }
});

test('não aprova exportação desabilitada ou sem ícone',()=>{
  for(const mock of [
    candidate({disabled:true}),
    candidate({hasDownloadIcon:false}),
  ]){
    const result=summarizeExportCandidates({scopeCount:1,actionsCount:5,candidates:[mock]});
    assert.equal(result.uniqueExportCandidate,false);
  }
});

test('não aprova como homologado se faltar classe explícita de exportação',()=>{
  const result=summarizeExportCandidates({
    scopeCount:1,actionsCount:5,
    candidates:[candidate({explicitExportClass:false})],
  });
  assert.equal(result.uniqueExportCandidate,true);
  assert.equal(result.exportClassAndIconConfirmed,false);
});

test('inspeção usa apenas page.evaluate sem clicar ou abrir downloads',async()=>{
  let reads=0;
  const page={
    evaluate:async fn=>{
      assert.match(fn.toString(),/mixed-topfilter__actions/);
      reads++;
      return {scopeCount:1,actionsCount:5,candidates:[candidate()]};
    },
  };
  const result=await inspectExportControl(page);
  assert.equal(reads,1);
  assert.equal(result.exportClassAndIconConfirmed,true);
});

test('diagnóstico inválido falha sem assumir botão',()=>{
  assert.throws(()=>summarizeExportCandidates(null),/incompleto/);
});
