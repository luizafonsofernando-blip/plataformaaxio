import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advancedApplyButton, verifyAdvancedApplyButton, clickAdvancedApplyButton,
} from '../src/advanced-action-locators.mjs';

function fakeButton({ count=1, visible=true }={}) {
  let clicked=0;
  const locator={
    first:()=>locator,
    waitFor:async()=>{if(!visible)throw new Error('hidden');},
    count:async()=>count,
    isVisible:async()=>visible,
    click:async()=>{clicked++;},
  };
  const page={
    getByRole:(role,options)=>{
      assert.equal(role,'button');
      assert.deepEqual(options,{name:'Filtrar',exact:true});
      return locator;
    },
  };
  return {page,locator,clicks:()=>clicked};
}

test('encontra botão Filtrar por nome acessível exato',async()=>{
  const f=fakeButton();
  assert.equal(advancedApplyButton(f.page),f.locator);
  assert.equal(await verifyAdvancedApplyButton(f.page),f.locator);
  assert.equal(f.clicks(),0);
});

test('aciona botão Filtrar quando é único e visível',async()=>{
  const f=fakeButton();
  await clickAdvancedApplyButton(f.page);
  assert.equal(f.clicks(),1);
});

test('não clica se botão não existir, for duplicado ou estiver oculto',async()=>{
  for (const options of [{count:0},{count:2},{visible:false}]) {
    const f=fakeButton(options);
    await assert.rejects(()=>clickAdvancedApplyButton(f.page),/nao localizado de forma unica/);
    assert.equal(f.clicks(),0);
  }
});

test('aceita CSS calibrado como alternativa',async()=>{
  const css='#advanced-submit';
  const loc={count:async()=>1,isVisible:async()=>true};
  const page={locator:value=>{assert.equal(value,css);return loc;}};
  assert.equal(advancedApplyButton(page,css),loc);
});
