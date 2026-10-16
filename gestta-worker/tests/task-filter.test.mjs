import test from 'node:test';
import assert from 'node:assert/strict';
import { taskFilterTrigger, verifyTaskFilterTrigger, validateEbefOptionNames, selectEbefTasks } from '../src/task-filter.mjs';

function makePage({count=1,visible=true}={}) {
  const locator={count:async()=>count,isVisible:async()=>visible};
  return {
    getByText(label,options){
      assert.equal(label,'Todas as tarefas');
      assert.equal(options.exact,true);
      return locator;
    },
  };
}
test('localiza o filtro Todas as tarefas por texto exato', async()=>{
  const page=makePage();
  assert.equal(await verifyTaskFilterTrigger(page),taskFilterTrigger(page));
});
test('falha quando filtro está ausente ou ambiguo', async()=>{
  await assert.rejects(()=>verifyTaskFilterTrigger(makePage({count:0})),/0 correspondencias/);
  await assert.rejects(()=>verifyTaskFilterTrigger(makePage({count:2})),/2 correspondencias/);
});
test('falha quando filtro está oculto', async()=>{
  await assert.rejects(()=>verifyTaskFilterTrigger(makePage({visible:false})),/nao esta visivel/);
});


const threeNames = [
  'DECLARAÇÃO DE EBEF | TÉCNICO',
  'VERIFICAR NECESSIDADE DE EBEF | TÉCNICO',
  'VERIFICAR NECESSIDADE DE EBEF | OUTRO DEPARTAMENTO',
];

test('valida resultado bef com uma declaração e duas verificações', () => {
  assert.equal(validateEbefOptionNames(threeNames),true);
  assert.throws(()=>validateEbefOptionNames(threeNames.slice(0,2)),/exatamente tres/);
  assert.throws(()=>validateEbefOptionNames([...threeNames.slice(0,2),'RELATORIO FISCAL']),/nao corresponde/);
  assert.throws(()=>validateEbefOptionNames([threeNames[0],threeNames[1],threeNames[1]]),/repetidas/);
  assert.throws(()=>validateEbefOptionNames([threeNames[0],threeNames[0]+' X',threeNames[1]]),/Escopo incorreto/);
});

function mockTaskDropdown({
  names=threeNames,
  isDefault=true,
  searchVisible=true,
  checkedAtStart=[],
}={}) {
  let opened=false, typed='', clickCount=0;
  const selected=names.map((_,i)=>checkedAtStart.includes(i));
  const trigger = {
    count:async()=>1,
    isVisible:async()=>true,
    click:async()=>{opened=true;clickCount++;},
  };
  const input={
    count:async()=>opened?1:0,
    isVisible:async()=>searchVisible,
    fill:async text=>{typed=text;},
    inputValue:async()=>typed,
  };
  const checkboxAt=i=>({
    count:async()=>1,
    isChecked:async()=>selected[i],
    check:async()=>{selected[i]=true;},
  });
  const rowAt=i=>({
    isVisible:async()=>i<names.length,
    innerText:async()=>names[i],
    locator:css=>{assert.equal(css,'input[type=checkbox]');return checkboxAt(i);},
    waitFor:async()=>{if(i>=names.length)throw Error('not found');},
  });
  const rows={
    count:async()=>typed==='bef'?names.length:0,
    nth:i=>rowAt(i),
  };
  const page={
    getByText:(name,opts)=>{
      assert.equal(name,'Todas as tarefas');
      assert.equal(opts.exact,true);
      return {
        ...trigger,
        count:async()=>isDefault?1:0,
      };
    },
    locator:css=>{
      if(css==='input.task-search')return input;
      if(css==='div.result-row')return rows;
      throw Error('unexpected selector '+css);
    },
  };
  return {page,selected:()=>selected,typed:()=>typed,clicks:()=>clickCount};
}
const css={searchCss:'input.task-search',rowCss:'div.result-row',checkboxCss:'input[type=checkbox]'};

test('pesquisa bef e marca exatamente tres opcoes da lista',async()=>{
  const m=mockTaskDropdown();
  assert.deepEqual(await selectEbefTasks(m.page,css),{selected:3});
  assert.equal(m.typed(),'bef');
  assert.deepEqual(m.selected(),[true,true,true]);
  assert.equal(m.clicks(),1);
});
test('nao clica se ja houver tarefa selecionada previamente',async()=>{
  const m=mockTaskDropdown({isDefault:false});
  await assert.rejects(()=>selectEbefTasks(m.page,css),/Todas as tarefas/);
  assert.equal(m.clicks(),0);
});
test('nao seleciona opcoes fora do padrao E-BEF',async()=>{
  const m=mockTaskDropdown({names:[threeNames[0],threeNames[1],'ROTINA CONTABIL']});
  await assert.rejects(()=>selectEbefTasks(m.page,css),/nao corresponde/);
  assert.deepEqual(m.selected(),[false,false,false]);
});
test('nao seleciona se a busca nao retornar tres opcoes',async()=>{
  const m=mockTaskDropdown({names:threeNames.slice(0,2)});
  await assert.rejects(()=>selectEbefTasks(m.page,css),/nao apresentou tres opcoes/);
  assert.deepEqual(m.selected(),[false,false]);
});
test('nao seleciona se o input de busca estiver invisivel',async()=>{
  const m=mockTaskDropdown({searchVisible:false});
  await assert.rejects(()=>selectEbefTasks(m.page,css),/nao localizado/);
  assert.deepEqual(m.selected(),[false,false,false]);
});
