import test from 'node:test';
import assert from 'node:assert/strict';
import { taskFilterTrigger, verifyTaskFilterTrigger } from '../src/task-filter.mjs';

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
