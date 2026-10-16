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
    await assert.rejects(()=>openDepartmentPicker(m.page),/nao localizado de forma unica/);
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
