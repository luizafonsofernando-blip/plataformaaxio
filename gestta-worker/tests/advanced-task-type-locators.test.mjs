import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TASK_TYPE_KEYS, taskTypeCheckbox, inspectTaskTypes, ensureAllTaskTypes,
} from '../src/advanced-task-type-locators.mjs';

function fakeTypes({
  absent=null, duplicate=null, invisible=null, checkedAtStart={},
}={}) {
  const states={}, clicks=[];
  const labels={
    'FLUXO DE TAREFAS':'Fluxo de tarefas \uF021',
    'SOLICITACAO DE SERVICO':'Solicitação de serviço \uF021',
    'RECORRENTE':'Recorrente \uF021',
  };
  for(const key of TASK_TYPE_KEYS) states[key]=checkedAtStart[key]??false;
  const page={
    getByRole:(role,{name})=>{
      assert.equal(role,'checkbox');
      assert(name instanceof RegExp);
      const key=TASK_TYPE_KEYS.find(key=>name.test(labels[key]));
      assert(key,'Expressão do tipo de tarefa não reconhecida');
      const checkbox={
        first:()=>checkbox,
        waitFor:async()=>{if(key===invisible) throw Error('oculto');},
        count:async()=>key===absent?0:(key===duplicate?2:1),
        isVisible:async()=>key!==invisible,
        isChecked:async()=>states[key],
        check:async()=>{clicks.push(key);states[key]=true;},
      };
      return checkbox;
    },
  };
  return {page,states,clicks};
}

test('três tipos identificados por nome sem depender dos glifos',async()=>{
  const f=fakeTypes();
  const states=await inspectTaskTypes(f.page);
  assert.deepEqual(Object.keys(states),TASK_TYPE_KEYS);
  assert(Object.values(states).every(item=>item.checked===false));
  assert.deepEqual(f.clicks,[]);
});

test('marca somente os tipos ainda não selecionados e confere três',async()=>{
  const f=fakeTypes({checkedAtStart:{'FLUXO DE TAREFAS':true}});
  assert.deepEqual(await ensureAllTaskTypes(f.page),{selected:3});
  assert.deepEqual(f.clicks,['SOLICITACAO DE SERVICO','RECORRENTE']);
  assert(Object.values(f.states).every(Boolean));
});

test('interrompe sem marcar ao localizar tipo ausente, duplicado ou oculto',async()=>{
  for(const args of [
    {absent:'RECORRENTE'},
    {duplicate:'FLUXO DE TAREFAS'},
    {invisible:'SOLICITACAO DE SERVICO'},
  ]) {
    const f=fakeTypes(args);
    await assert.rejects(()=>ensureAllTaskTypes(f.page),/não localizado de forma única e visível/);
    assert.deepEqual(f.clicks,[]);
  }
});

test('não permite nomes de tipo desconhecidos',()=>{
  assert.throws(()=>taskTypeCheckbox(fakeTypes().page,'EXTRA'),/desconhecido/);
});
