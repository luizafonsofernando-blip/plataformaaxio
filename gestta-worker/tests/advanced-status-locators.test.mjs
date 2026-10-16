import test from 'node:test';
import assert from 'node:assert/strict';
import {concludedStatusCheckbox, inspectConcludedStatus} from '../src/advanced-status-locators.mjs';

const fake = ({count=1,visible=true,checked=false}={}) => {
  const element = {count:async()=>count,isVisible:async()=>visible,isChecked:async()=>checked};
  return {
    getByRole:(role,opts)=>{
      assert.equal(role,'checkbox');
      assert.deepEqual(opts,{name:'Concluída',exact:true});
      return element;
    },
  };
};

test('localizador Concluída confirmado por papel e nome acessível',async()=>{
  const page=fake({checked:true});
  assert.equal(await concludedStatusCheckbox(page).count(),1);
  assert.deepEqual(await inspectConcludedStatus(page),{found:true,checked:true});
});

test('leitura não marca checkbox Concluída',async()=>{
  assert.deepEqual(await inspectConcludedStatus(fake({checked:false})),{found:true,checked:false});
});

test('falha em ausente, duplicado e invisível',async()=>{
  await assert.rejects(()=>inspectConcludedStatus(fake({count:0})),/esperado 1/);
  await assert.rejects(()=>inspectConcludedStatus(fake({count:2})),/encontrados 2/);
  await assert.rejects(()=>inspectConcludedStatus(fake({visible:false})),/não visível/);
});
