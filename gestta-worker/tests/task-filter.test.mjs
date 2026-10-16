import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyTaskFilterTrigger, validateEbefOptionNames,
  taskSearchLocator, ebefMenuItemsLocator, menuItemCheckbox,
  ensureUnfilteredTaskPicker, taskFilterClearLocator,
  TASK_FILTER_CLEAR_CONTAINER, selectEbefTasks,
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

test('nao limpa nem clica quando o filtro e o X estao ausentes',async()=>{
  const f=fakeDropdown({initialVisible:false,initiallyMissing:true});
  // O X padrão confirmado pelo Inspector também pode estar ausente se
  // o Gestta não tiver carregado. Nesse caso deve interromper sem clicar.
  f.page.locator=selector=>{
    assert.equal(selector,TASK_FILTER_CLEAR_CONTAINER);
    return {getByRole:role=>{
      assert.equal(role,'button');
      return {count:async()=>0,isVisible:async()=>false,click:async()=>{throw Error('nao clicar');}};
    }};
  };
  await assert.rejects(()=>ensureUnfilteredTaskPicker(f.page,{clearCss:''}),/correspondencias=0/);
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


function fakePersistedTaskFilter({
  initiallySelected=true, clearMatches=1, visibleClear=true,
  restoresDefault=true, css='#task-filter .clear-selection',
} = {}) {
  let selected=initiallySelected, clearClicks=0, triggerClicks=0, waited=0;
  const trigger={
    first:()=>trigger,
    waitFor:async()=>{if(selected)throw new Error('default not visible');},
    count:async()=>selected?0:1,
    isVisible:async()=>!selected,
    click:async()=>triggerClicks++,
  };
  const clear={
    count:async()=>clearMatches,
    isVisible:async()=>visibleClear,
    click:async()=>{clearClicks++; if(restoresDefault)selected=false;},
  };
  const page={
    getByText:(text,options)=>{
      assert.equal(text,'Todas as tarefas');
      assert.equal(options.exact,true);
      return trigger;
    },
    locator:selector=>{assert.equal(selector,css);return clear;},
  };
  return {
    page, css,
    clearClicks:()=>clearClicks,
    triggerClicks:()=>triggerClicks,
    selected:()=>selected,
  };
}

test('quando filtro ja esta em Todas as tarefas nao clica no X',async()=>{
  const f=fakePersistedTaskFilter({initiallySelected:false});
  await ensureUnfilteredTaskPicker(f.page,{clearCss:f.css});
  assert.equal(f.clearClicks(),0);
});

test('quando havia selecao salva limpa apenas o X calibrado e valida estado inicial',async()=>{
  const f=fakePersistedTaskFilter();
  await ensureUnfilteredTaskPicker(f.page,{clearCss:f.css});
  assert.equal(f.clearClicks(),1);
  assert.equal(f.selected(),false);
});

test('localizador default usa o X confirmado no Inspector',async()=>{
  assert.equal(TASK_FILTER_CLEAR_CONTAINER,'#gestta-multiselect-dropdown-5-p');
  let clearClicks=0, selected=true;
  const button={
    count:async()=>1, isVisible:async()=>true,
    click:async()=>{clearClicks++;selected=false;},
  };
  const container={
    getByRole:role=>{ assert.equal(role,'button');return button; },
    innerText:async()=> 'DECLARAÇÃO DE EBEF | TÉCNICO',
  };
  const trigger={
    first:()=>trigger,
    waitFor:async()=>{if(selected)throw Error('not ready');},
    count:async()=>selected?0:1,
    isVisible:async()=>!selected,
  };
  const page={
    getByText:()=>trigger,
    locator:css=>{assert.equal(css,TASK_FILTER_CLEAR_CONTAINER);return container;},
  };
  assert.equal(taskFilterClearLocator(page),button);
  await ensureUnfilteredTaskPicker(page,{clearCss:''});
  assert.equal(clearClicks,1);
  assert.equal(selected,false);
});

test('nao clica no X default caso o container nao exiba tarefa E-BEF',async()=>{
  let clears=0;
  const trigger={
    first:()=>trigger,waitFor:async()=>{throw Error('not ready');},
    count:async()=>0,isVisible:async()=>false,
  };
  const clear={count:async()=>1,isVisible:async()=>true,click:async()=>clears++};
  const container={
    getByRole:()=>clear,
    innerText:async()=> 'Todos clientes',
  };
  const page={
    getByText:()=>trigger,
    locator:selector=>{assert.equal(selector,TASK_FILTER_CLEAR_CONTAINER);return container;},
  };
  await assert.rejects(
    ()=>ensureUnfilteredTaskPicker(page,{clearCss:''}),
    /nao exibe uma tarefa E-BEF/
  );
  assert.equal(clears,0);
});

test('nao clica em X generico, ambiguo ou oculto',async()=>{
  const f=fakePersistedTaskFilter({css:'button'});
  await assert.rejects(
    ()=>ensureUnfilteredTaskPicker(f.page,{clearCss:'button'}),/demasiado generico/
  );
  assert.equal(f.clearClicks(),0);
  for(const state of [{clearMatches:2},{clearMatches:0},{visibleClear:false}]){
    const g=fakePersistedTaskFilter(state);
    await assert.rejects(
      ()=>ensureUnfilteredTaskPicker(g.page,{clearCss:g.css}),
      /nao localizado de forma unica/
    );
    assert.equal(g.clearClicks(),0);
  }
});

test('se o X nao devolver Todas as tarefas nao prossegue para busca',async()=>{
  const f=fakePersistedTaskFilter({restoresDefault:false});
  await assert.rejects(
    ()=>ensureUnfilteredTaskPicker(f.page,{clearCss:f.css}),
    /nao reapareceu/
  );
  assert.equal(f.clearClicks(),1);
  assert.equal(f.triggerClicks(),0);
});


test('duas consultas consecutivas limpam selecao E-BEF e repetem 3/3',async()=>{
  let active=false, dropdownOpened=false, clears=0, selections=0, searchValue='';
  let marks=[false,false,false];
  const trigger={
    first:()=>trigger,
    waitFor:async()=>{if(active)throw Error('not ready');},
    count:async()=>active?0:1,
    isVisible:async()=>!active,
    click:async()=>{dropdownOpened=true;},
  };
  const clear={
    count:async()=>active?1:0,
    isVisible:async()=>active,
    click:async()=>{
      clears++;active=false;dropdownOpened=false;marks=[false,false,false];
    },
  };
  const container={
    getByRole:()=>clear,
    innerText:async()=>active?'DECLARAÇÃO DE EBEF | TÉCNICO':'Todas as tarefas',
  };
  const search={
    first:()=>search,waitFor:async()=>{if(!dropdownOpened)throw Error('closed');},
    count:async()=>dropdownOpened?1:0,isVisible:async()=>true,
    fill:async v=>{searchValue=v;},inputValue:async()=>searchValue,
  };
  const labels=[
    'DECLARAÇÃO DE EBEF | TÉCNICO',
    'VERIFICAR NECESSIDADE DE EBEF | TÉCNICO',
    'VERIFICAR NECESSIDADE DE EBEF | OUTRO DEPARTAMENTO',
  ];
  const check=i=>({
    count:async()=>1,scrollIntoViewIfNeeded:async()=>{},
    isChecked:async()=>marks[i],
    check:async()=>{marks[i]=true;selections++;if(marks.every(Boolean))active=true;},
  });
  const row=i=>({
    waitFor:async()=>{},scrollIntoViewIfNeeded:async()=>{},
    isVisible:async()=>true,innerText:async()=>labels[i],
    getByRole:()=>check(i),
  });
  const menuitems={nth:row,count:async()=>3};
  const page={
    waitForTimeout:async()=>{},
    getByText:(text)=>text==='Selecionar todas ativas'
      ? {count:async()=>0}:trigger,
    getByRole:(role,opts)=>role==='textbox'
      ? (opts?search:{count:async()=>1})
      : (opts?menuitems:{count:async()=>3}),
    locator:css=>{assert.equal(css,TASK_FILTER_CLEAR_CONTAINER);return container;},
  };
  assert.deepEqual(await selectEbefTasks(page),{selected:3});
  assert.equal(clears,0);
  assert.deepEqual(await selectEbefTasks(page),{selected:3});
  assert.equal(clears,1);
  assert.equal(selections,6);
  assert.deepEqual(marks,[true,true,true]);
});
