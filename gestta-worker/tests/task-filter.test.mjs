import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyTaskFilterTrigger, validateEbefOptionNames,
  taskSearchLocator, ebefMenuItemsLocator, menuItemCheckbox,
  ensureUnfilteredTaskPicker, selectEbefTasks,
} from '../src/task-filter.mjs';

const taskNames = [
  'DECLARAÇÃO DE EBEF | TÉCNICO',
  'VERIFICAR NECESSIDADE DE EBEF | TÉCNICO',
  'VERIFICAR NECESSIDADE DE EBEF | OUTRO DEPARTAMENTO',
];

function fakeDropdown({
  labels=taskNames, initialVisible=true, initiallyMissing=false,
  duplicateTrigger=false, searchVisible=true, checkboxCount=1,
  failScroll=false, alreadyChecked=[],
}={}) {
  let opened=false, typed='', clicks=0, clearClicks=0, triggerWaits=0;
  let waited=0;
  const selected=labels.map((_,i)=>alreadyChecked.includes(i));
  const scrolls=[];
  const trigger={
    first:()=>trigger,
    waitFor:async options=>{
      triggerWaits++;
      assert.equal(options.state,'visible');
      assert.equal(options.timeout,30000);
      if(!initialVisible)throw new Error('timeout');
    },
    count:async()=>initiallyMissing?0:(duplicateTrigger?2:1),
    isVisible:async()=>initialVisible,
    click:async()=>{opened=true;clicks++;},
  };
  const search={
    first:()=>search,
    waitFor:async()=>{if(!opened || !searchVisible)throw new Error('not visible');},
    count:async()=>opened?1:0,
    isVisible:async()=>searchVisible,
    fill:async value=>{typed=value;},
    inputValue:async()=>typed,
  };
  const box=i=>({
    count:async()=>checkboxCount,
    isChecked:async()=>selected[i],
    check:async()=>{selected[i]=true;},
    scrollIntoViewIfNeeded:async()=>{scrolls.push('box'+i);},
  });
  const row=i=>({
    waitFor:async()=>{if(i>=labels.length)throw new Error('missing');},
    scrollIntoViewIfNeeded:async()=>{
      scrolls.push('row'+i);
      if(failScroll)throw new Error('cannot scroll');
    },
    isVisible:async()=>i<labels.length,
    innerText:async()=>labels[i],
    getByRole:role=>{assert.equal(role,'checkbox');return box(i);},
  });
  const rows={
    nth:row,
    count:async()=>typed==='bef'?labels.length:0,
  };
  const page={
    waitForTimeout:async ms=>{waited=ms;},
    getByText:(text,opts)=>{
      if(text==='Selecionar todas ativas')return {count:async()=>0};
      assert.equal(text,'Todas as tarefas');
      assert.equal(opts.exact,true);
      return trigger;
    },
    getByRole:(role,opts)=>{
      if(role==='textbox'){
        if(!opts)return {count:async()=>opened?1:0};
        assert(opts.name instanceof RegExp);
        assert(opts.name.test('Buscar por tarefa'));
        return search;
      }
      if(role==='menuitem'){
        if(!opts)return {count:async()=>typed==='bef'?labels.length:0};
        assert(opts.name instanceof RegExp);
        assert(opts.name.test('DECLARAÇÃO DE EBEF | TÉCNICO'));
        return rows;
      }
      throw new Error('Unexpected role: '+role);
    },
    locator:()=>({click:async()=>clearClicks++}),
  };
  return {page,selected:()=>selected,typed:()=>typed,clicks:()=>clicks,
    clearClicks:()=>clearClicks,scrolls:()=>scrolls,waited:()=>waited,triggerWaits:()=>triggerWaits};
}

test('espera o filtro Todas as tarefas aparecer antes de conferir contagem',async()=>{
  const f=fakeDropdown();
  await verifyTaskFilterTrigger(f.page);
  assert.equal(f.triggerWaits(),1);
});

test('nao limpa nem clica quando filtro continua ausente',async()=>{
  const f=fakeDropdown({initialVisible:false,initiallyMissing:true});
  await assert.rejects(()=>ensureUnfilteredTaskPicker(f.page),/correspondencias=0/);
  assert.equal(f.clicks(),0);
  assert.equal(f.clearClicks(),0);
});

test('aborta filtro ambiguo com dois elementos',async()=>{
  const f=fakeDropdown({duplicateTrigger:true});
  await assert.rejects(()=>verifyTaskFilterTrigger(f.page),/correspondencias=2/);
});

test('valida tres opcoes distintas e bloqueia tarefas nao E-BEF',()=>{
  assert.equal(validateEbefOptionNames(taskNames),true);
  assert.throws(()=>validateEbefOptionNames(taskNames.slice(0,2)),/exatamente tres/);
  assert.throws(()=>validateEbefOptionNames([taskNames[0],taskNames[1],'OUTRA TAREFA']),/nao corresponde/);
  assert.throws(()=>validateEbefOptionNames([taskNames[0],taskNames[1],taskNames[1]]),/repetidas/);
});

test('abre filtro, espera 5s, digita bef, rola lista e marca as tres tarefas',async()=>{
  const f=fakeDropdown();
  assert.deepEqual(await selectEbefTasks(f.page),{selected:3});
  assert.equal(f.waited(),5000);
  assert.equal(f.typed(),'bef');
  assert.deepEqual(f.selected(),[true,true,true]);
  assert.deepEqual(f.scrolls(),['row0','row1','row2','box0','box1','box2']);
  assert.equal(f.clicks(),1);
  assert.equal(f.clearClicks(),0);
});

test('checkbox ja marcado permanece marcado',async()=>{
  const f=fakeDropdown({alreadyChecked:[1]});
  assert.deepEqual(await selectEbefTasks(f.page),{selected:3});
  assert.deepEqual(f.selected(),[true,true,true]);
});

test('nao seleciona quando so ha duas opcoes',async()=>{
  const f=fakeDropdown({labels:taskNames.slice(0,2)});
  await assert.rejects(()=>selectEbefTasks(f.page),/tres itens no DOM/);
  assert.deepEqual(f.selected(),[false,false]);
});

test('bloqueia rolagem impossivel sem marcar checkboxes',async()=>{
  const f=fakeDropdown({failScroll:true});
  await assert.rejects(()=>selectEbefTasks(f.page),/Nao foi possivel rolar/);
  assert.deepEqual(f.selected(),[false,false,false]);
});

test('bloqueia campo de busca oculto sem marcar checkboxes',async()=>{
  const f=fakeDropdown({searchVisible:false});
  await assert.rejects(()=>selectEbefTasks(f.page),/Campo Buscar por tarefa indisponivel/);
  assert.deepEqual(f.selected(),[false,false,false]);
});

test('bloqueia checkbox ambiguo antes de marcar qualquer opcao',async()=>{
  const f=fakeDropdown({checkboxCount:2});
  await assert.rejects(()=>selectEbefTasks(f.page),/checkbox unico/);
  assert.deepEqual(f.selected(),[false,false,false]);
});

test('usa localizadores semanticos',async()=>{
  const f=fakeDropdown();
  assert.equal(typeof taskSearchLocator(f.page).isVisible,'function');
  assert.equal(typeof ebefMenuItemsLocator(f.page).nth,'function');
  assert.equal(typeof menuItemCheckbox(ebefMenuItemsLocator(f.page).nth(0)).isChecked,'function');
});
