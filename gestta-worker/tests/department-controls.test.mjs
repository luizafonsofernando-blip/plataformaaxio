import test from 'node:test';
import assert from 'node:assert/strict';
import {
  departmentTrigger, departmentSelectAll, verifyDepartmentControl,
  openDepartmentPicker, clickDepartmentSelectAll,
} from '../src/department-controls.mjs';

function mockControls({
  triggerCount=1,triggerVisible=true,allCount=1,allVisible=true,
}={}) {
  let triggerClicks=0,allClicks=0;
  const make=(count,visible,click)=>{
    const item={
      first:()=>item,
      waitFor:async()=>{if(!visible)throw Error('hidden');},
      count:async()=>count,
      isVisible:async()=>visible,
      click:async()=>{click();},
    };
    return item;
  };
  const trigger=make(triggerCount,triggerVisible,()=>triggerClicks++);
  const anchor=make(allCount,allVisible,()=>allClicks++);
  const menuitem={locator:tag=>{assert.equal(tag,'a');return anchor;}};
  const page={
    getByText:name=>{assert.equal(name,'Todos departamentos');return trigger;},
    evaluate:async()=>({labelCount:0,candidateCount:0,depth:0,candidateId:''}),
    getByRole:(role,opt)=>{
      assert.equal(role,'menuitem');
      assert.deepEqual(opt,{name:'Selecionar todos',exact:true});
      return menuitem;
    },
  };
  return {page,trigger,anchor,triggerClicks:()=>triggerClicks,allClicks:()=>allClicks};
}

test('usa seletor do Inspector para campo Todos departamentos',async()=>{
  const m=mockControls();
  assert.equal(departmentTrigger(m.page),m.trigger);
  await openDepartmentPicker(m.page);
  assert.equal(m.triggerClicks(),1);
  assert.equal(m.allClicks(),0);
});

test('usa menuitem Selecionar todos + a, e nao depende de nth()',async()=>{
  const m=mockControls();
  assert.equal(departmentSelectAll(m.page),m.anchor);
  await clickDepartmentSelectAll(m.page);
  assert.equal(m.allClicks(),1);
});

test('nao clica em dropdown ausente, duplicado ou invisivel',async()=>{
  for (const variation of [
    {triggerCount:0},{triggerCount:2},{triggerVisible:false},
  ]) {
    const m=mockControls(variation);
    await assert.rejects(()=>openDepartmentPicker(m.page),/Nao foi encontrado um unico grupo|nao localizado de forma unica|ambiguo/);
    assert.equal(m.triggerClicks(),0);
  }
});

test('nao clica em selecionar todos ausente, duplicado ou invisivel',async()=>{
  for (const variation of [
    {allCount:0},{allCount:2},{allVisible:false},
  ]) {
    const m=mockControls(variation);
    await assert.rejects(()=>clickDepartmentSelectAll(m.page),/nao localizado de forma unica/);
    assert.equal(m.allClicks(),0);
  }
});

test('aceita CSS calibrado alternativo sem precisar de posicoes',async()=>{
  const m=mockControls();
  const selectors={
    '#departments':m.trigger,
    '#departments-all':m.anchor,
  };
  const page={locator:css=>selectors[css]};
  assert.equal(departmentTrigger(page,'#departments'),m.trigger);
  assert.equal(departmentSelectAll(page,'#departments-all'),m.anchor);
});

test('nao verifica estado dos 21 so pelo clique',async()=>{
  const m=mockControls();
  assert.equal(await clickDepartmentSelectAll(m.page),undefined);
  assert.equal(m.allClicks(),1);
});



const verifiedLayout=(id='gestta-multiselect-dropdown-6-p')=>({
  uniqueGroupCount:1,matchedDepartmentRows:21,
  ancestors:[
    {depth:0,descendantToggleCount:22,descendantDropdownCount:0,
      descendantDropdownIds:[]},
    {depth:1,descendantToggleCount:22,descendantDropdownCount:1,
      descendantDropdownIds:[id]},
    {depth:2,descendantToggleCount:22,descendantDropdownCount:1,
      descendantDropdownIds:[id]},
  ],
});

test('abre o departamento preenchido pelo grupo 21+1 sem clicar no X',async()=>{
  let clicked=0,clickPosition;
  const control={
    count:async()=>1,isVisible:async()=>true,
    evaluate:async()=>({safe:true,x:12,y:16}),
    click:async options=>{clicked++;clickPosition=options.position;},
  };
  const page={
    getByText:()=>({count:async()=>0}),
    evaluate:async()=>verifiedLayout(),
    locator:css=>{
      assert.equal(css,'#gestta-multiselect-dropdown-6-p');
      return control;
    },
  };
  await openDepartmentPicker(page);
  assert.equal(clicked,1);
  assert.deepEqual(clickPosition,{x:12,y:16});
});

test('rejeita grupo inexistente e ID compartilhado por dois dropdowns',async()=>{
  for(const layout of [
    {...verifiedLayout(),uniqueGroupCount:0},
    {...verifiedLayout(),ancestors:[
      {depth:1,descendantToggleCount:22,descendantDropdownCount:2,
        descendantDropdownIds:['gestta-multiselect-dropdown-6-p','gestta-multiselect-dropdown-7-p']},
    ]},
  ]){
    let clicks=0;
    const page={
      getByText:()=>({count:async()=>0}),
      evaluate:async()=>layout,
      locator:()=>({count:async()=>1,isVisible:async()=>true,
        evaluate:async()=>({safe:true,x:12,y:14}),click:async()=>{clicks++;}}),
    };
    await assert.rejects(()=>openDepartmentPicker(page),/Nada foi clicado/);
    assert.equal(clicks,0);
  }
});

test('não clica se o ponto do campo estiver coberto pelo X ou por outro elemento',async()=>{
  let clicks=0;
  const page={
    getByText:()=>({count:async()=>0}),
    evaluate:async()=>verifiedLayout(),
    locator:()=>({
      count:async()=>1,isVisible:async()=>true,
      evaluate:async()=>({safe:false,reason:'area_interativa_insegura'}),
      click:async()=>{clicks++;},
    }),
  };
  await assert.rejects(()=>openDepartmentPicker(page),/Nao ha ponto seguro/);
  assert.equal(clicks,0);
});
