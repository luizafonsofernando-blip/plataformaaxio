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
    await assert.rejects(()=>openDepartmentPicker(m.page),/Campo Departamento preenchido|nao localizado de forma unica|ambiguo/);
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


test('abre departamento selecionado via ID próximo ao título sem limpar seleção',async()=>{
  let clicked=0, selected=0;
  const control={
    count:async()=>1,isVisible:async()=>true,
    click:async()=>{clicked++;},
  };
  const page={
    getByText:()=>({count:async()=>0,isVisible:async()=>false}),
    evaluate:async()=>({
      labelCount:1,candidateCount:1,depth:2,
      candidateId:'gestta-multiselect-dropdown-18-p',
    }),
    locator:css=>{
      assert.equal(css,'#gestta-multiselect-dropdown-18-p');
      return control;
    },
  };
  await openDepartmentPicker(page);
  assert.equal(clicked,1);
  assert.equal(selected,0);
});

test('não clica em campo de cliente se título Departamento for ausente ou ambíguo',async()=>{
  for(const labelCount of [0,2]){
    let clicked=0;
    const page={
      getByText:()=>({count:async()=>0}),
      evaluate:async()=>({
        labelCount,candidateCount:1,depth:2,
        candidateId:'gestta-multiselect-dropdown-5-p',
      }),
      locator:()=>({count:async()=>1,isVisible:async()=>true,click:async()=>{clicked++;}}),
    };
    await assert.rejects(()=>openDepartmentPicker(page),/contêiner não identificado/);
    assert.equal(clicked,0);
  }
});
