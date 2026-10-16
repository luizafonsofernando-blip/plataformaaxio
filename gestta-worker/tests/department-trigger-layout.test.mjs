import test from 'node:test';
import assert from 'node:assert/strict';
import {REQUIRED_DEPARTMENTS} from '../src/advanced-filter-config.mjs';
import {inspectDepartmentTriggerLayout} from '../src/department-trigger-layout.mjs';

function scenario(extra='Selecionar todos') {
  const memberNodes=[];
  const doc={};
  function makeNode(tag, parent=null, children=[]) {
    return {
      tagName:tag.toUpperCase(),classList:[],id:'',
      parentElement:parent,textContent:'',
      querySelectorAll:css=>{
        if(css==='.gestta-multiselect-dropdown__item-toggle')return children;
        if(css==='[id^="gestta-multiselect-dropdown-"][id$="-p"]')return [];
        if(css==='button'||css==='input')return [];
        throw Error('Unexpected CSS '+css);
      },
    };
  }
  const parent=makeNode('div',null,[]);
  const list=makeNode('ul',parent,memberNodes);
  parent.querySelectorAll=css=>css==='.gestta-multiselect-dropdown__item-toggle'
    ?memberNodes
    :css==='button'||css==='input'||css.startsWith('[id^=')?[]:[];
  for(const name of [...REQUIRED_DEPARTMENTS,extra]) {
    const li={textContent:name};
    memberNodes.push({
      closest:tag=>tag==='li'?li:null,
      parentElement:list,
    });
  }
  doc.querySelectorAll=css=>{
    if(css==='.gestta-multiselect-dropdown__item-toggle')return memberNodes;
    if(css.includes('label,span,div'))return [];
    throw Error('Unexpected global CSS '+css);
  };
  const originalDoc=globalThis.document;
  const fakePage={
    evaluate:async(fn,args)=>{
      globalThis.document=doc;
      try{return fn(args);}
      finally{
        if(originalDoc===undefined)delete globalThis.document;
        else globalThis.document=originalDoc;
      }
    },
  };
  return fakePage;
}

test('descobre o grupo estrutural 21+1 sem depender do título Departamento',async()=>{
  const result=await inspectDepartmentTriggerLayout(scenario());
  assert.equal(result.totalToggles,22);
  assert.equal(result.matchedDepartmentRows,21);
  assert.equal(result.uniqueGroupCount,1);
  assert.equal(result.labelCandidateCount,0);
  assert.equal(result.ancestors[0].descendantToggleCount,22);
});

test('contêiner com nome adicional desconhecido não é aceito nem exibido',async()=>{
  const result=await inspectDepartmentTriggerLayout(scenario('CLIENTE SIGILOSO 123'));
  assert.equal(result.uniqueGroupCount,0);
  assert.equal(result.matchedDepartmentRows,21);
  assert.equal(JSON.stringify(result).includes('CLIENTE SIGILOSO 123'),false);
});
