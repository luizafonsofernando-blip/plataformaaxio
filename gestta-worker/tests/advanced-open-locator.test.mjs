import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADVANCED_OPEN_CSS, advancedOpenLocator, verifyAdvancedOpenLocator, openAdvancedFilters,
} from '../src/advanced-open-locator.mjs';

function fake({count=1,visible=true}={}) {
  let clicks=0;
  const locator={
    first:()=>locator,
    waitFor:async()=>{if(!visible)throw Error('hidden');},
    count:async()=>count,
    isVisible:async()=>visible,
    click:async()=>{clicks++;},
  };
  const page={locator:css=>{assert.equal(css,ADVANCED_OPEN_CSS);return locator;}};
  return {page,locator,clicks:()=>clicks};
}

test('seletor do funil ancorado em pai e classe do icone, nao em indice',()=>{
  assert.match(ADVANCED_OPEN_CSS,/mixed-topfilter__actions/);
  assert.match(ADVANCED_OPEN_CSS,/glyphicon-filter/);
  assert.doesNotMatch(ADVANCED_OPEN_CSS,/nth/);
});
test('funil unico e visivel pode ser acionado',async()=>{
  const f=fake();
  assert.equal(advancedOpenLocator(f.page),f.locator);
  assert.equal(await verifyAdvancedOpenLocator(f.page),f.locator);
  await openAdvancedFilters(f.page);
  assert.equal(f.clicks(),1);
});
test('funil ausente, oculto ou ambiguo impede clique',async()=>{
  for(const variant of [{count:0},{count:2},{visible:false}]){
    const f=fake(variant);
    await assert.rejects(()=>openAdvancedFilters(f.page),/nao identificado de forma unica/);
    assert.equal(f.clicks(),0);
  }
});
