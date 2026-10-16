import test from 'node:test';
import assert from 'node:assert/strict';
import {
  taskFilterTrigger, verifyTaskFilterTrigger, validateEbefOptionNames,
  taskSearchLocator, ebefMenuItemsLocator, menuItemCheckbox, selectEbefTasks,
} from '../src/task-filter.mjs';

const names = [
  'DECLARAÇÃO DE EBEF | TÉCNICO',
  'VERIFICAR NECESSIDADE DE EBEF | TÉCNICO',
  'VERIFICAR NECESSIDADE DE EBEF | OUTRO DEPARTAMENTO',
];

test('identifica seletor principal Todas as tarefas',async()=>{
  const element={count:async()=>1,isVisible:async()=>true};
  const page={getByText:(value,opts)=>{
    assert.equal(value,'Todas as tarefas');
    assert.equal(opts.exact,true);
    return element;
  }};
  assert.equal(await verifyTaskFilterTrigger(page),taskFilterTrigger(page));
});

test('falha em gatilho ausente ou ambiguo',async()=>{
  const page=n=>({getByText:()=>({count:async()=>n,isVisible:async()=>true})});
  await assert.rejects(()=>verifyTaskFilterTrigger(page(0)),/0 correspondencias/);
  await assert.rejects(()=>verifyTaskFilterTrigger(page(2)),/2 correspondencias/);
});

test('comprova padrao exato das 3 opcoes',()=>{
  assert.equal(validateEbefOptionNames(names),true);
  assert.throws(()=>validateEbefOptionNames(names.slice(0,2)),/exatamente tres/);
  assert.throws(()=>validateEbefOptionNames([names[0],names[1],'ROTINA FISCAL']),/nao corresponde/);
  assert.throws(()=>validateEbefOptionNames([names[0],names[1],names[1]]),/repetidas/);
});

function fakeDropdown({
  labels=names, priorSelection=false, searchVisible=true, checkboxCount=1,
  failOnScroll=false, alreadyChecked=[],
}={}) {
  let opened=false,typed='',clicks=0;
  const selected=labels.map((_,i)=>alreadyChecked.includes(i));
  const scrolls=[];
  const trigger={
    count:async()=>priorSelection?0:1,
    isVisible:async()=>true,
    click:async()=>{opened=true;clicks++;},
  };
  const search={
    first:()=>search,
    waitFor:async()=>{if(!searchVisible || !opened) throw new Error('campo invisivel');},
    count:async()=>opened?1:0,
    isVisible:async()=>searchVisible,
    fill:async value=>{typed=value;},
    inputValue:async()=>typed,
  };
  const box=i=>({
    count:async()=>checkboxCount,
    scrollIntoViewIfNeeded:async()=>{scrolls.push('box'+i);},
    isChecked:async()=>selected[i],
    check:async()=>{selected[i]=true;},
  });
  const row=i=>({
    waitFor:async()=>{if(i>=labels.length)throw new Error('missing');},
    scrollIntoViewIfNeeded:async()=>{
      scrolls.push('row'+i);
      if(failOnScroll)throw new Error('cannot scroll');
    },
    isVisible:async()=>i<labels.length,
    innerText:async()=>labels[i],
    getByRole:(name)=>{
      assert.equal(name,'checkbox');
      return box(i);
    },
  });
  const rows={
    nth:row,
    count:async()=>typed==='bef'?labels.length:0,
  };
  const page={
    getByText:(label,opts)=>{
      if (label === 'Selecionar todas ativas') return {count:async()=>0};
      assert.equal(label,'Todas as tarefas');
      assert.equal(opts.exact,true);
      return trigger;
    },
    getByRole:(role,opts)=>{
      if(role==='textbox'){
        if (!opts) return {count:async()=>opened?1:0};
        assert(opts.name instanceof RegExp);
        assert(opts.name.test('Buscar por tarefa'));
        return search;
      }
      if(role==='menuitem'){
        if (!opts) return {count:async()=>typed==='bef'?labels.length:0};
        assert(opts.name instanceof RegExp);
        assert(opts.name.test('DECLARAÇÃO DE EBEF | TÉCNICO'));
        return rows;
      }
      throw new Error('role unexpected: '+role);
    },
  };
  return {page,selected:()=>selected,typed:()=>typed,clicks:()=>clicks,scrolls:()=>scrolls};
}

test('mapeia input, menuitems e checkboxes por papeis acessiveis',()=>{
  const {page}=fakeDropdown();
  const row=ebefMenuItemsLocator(page).nth(0);
  assert.equal(taskSearchLocator(page),page.getByRole('textbox',{name:/Buscar por tarefa/i}));
  assert.equal(typeof row.scrollIntoViewIfNeeded,'function');
  assert.equal(typeof menuItemCheckbox(row).isChecked,'function');
});

test('digita bef, rola tres itens e marca cada checkbox',async()=>{
  const f=fakeDropdown();
  assert.deepEqual(await selectEbefTasks(f.page),{selected:3});
  assert.equal(f.typed(),'bef');
  assert.deepEqual(f.selected(),[true,true,true]);
  assert.deepEqual(f.scrolls(),[
    'row0','row1','row2','box0','box1','box2',
  ]);
  assert.equal(f.clicks(),1);
});

test('respeita checkbox ja marcado sem alternar para desmarcado',async()=>{
  const f=fakeDropdown({alreadyChecked:[1]});
  assert.deepEqual(await selectEbefTasks(f.page),{selected:3});
  assert.deepEqual(f.selected(),[true,true,true]);
});

test('aborta antes de clicar ao ver tarefa previamente filtrada',async()=>{
  const f=fakeDropdown({priorSelection:true});
  await assert.rejects(()=>selectEbefTasks(f.page),/Todas as tarefas/);
  assert.equal(f.clicks(),0);
});

test('aborta antes de selecionar quando ha 2 ou mais de 3 resultados',async()=>{
  for(const labels of [names.slice(0,2), [...names,'EXTRA DE EBEF']]){
    const f=fakeDropdown({labels});
    await assert.rejects(()=>selectEbefTasks(f.page),/tres itens|esperado exatamente tres/);
    assert.deepEqual(f.selected(),Array(labels.length).fill(false));
  }
});

test('aborta quando a lista precisa de container de rolagem especial',async()=>{
  const f=fakeDropdown({failOnScroll:true});
  await assert.rejects(()=>selectEbefTasks(f.page),/Nao foi possivel rolar/);
  assert.deepEqual(f.selected(),[false,false,false]);
});

test('aborta se input de busca nao estiver visivel',async()=>{
  const f=fakeDropdown({searchVisible:false});
  await assert.rejects(()=>selectEbefTasks(f.page),/correspondencias=1, visivel=false/);
  assert.deepEqual(f.selected(),[false,false,false]);
});

test('aborta se checkbox de uma opcao nao e unico',async()=>{
  const f=fakeDropdown({checkboxCount:2});
  await assert.rejects(()=>selectEbefTasks(f.page),/checkbox unico/);
  assert.deepEqual(f.selected(),[false,false,false]);
});
