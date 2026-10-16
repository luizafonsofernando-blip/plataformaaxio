import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VERIFIED_STATUS_LABELS, statusCheckbox, concludedStatusCheckbox,
  inspectConcludedStatus, inspectAdvancedStatuses, ensureAllAdvancedStatuses,
} from '../src/advanced-status-locators.mjs';

function fakeStatuses({
  absent=null, duplicate=null, invisible=null,
  checkedAtStart={},
} = {}) {
  const state={};
  const calls=[];
  for (const key of Object.keys(VERIFIED_STATUS_LABELS)) {
    state[key]=checkedAtStart[key]??false;
  }
  const printedNames = {
    ABERTA:'Aberta \uF020',
    CONCLUIDA:'Concluída',
    IMPEDIMENTO:'Impedimento \uF020',
    DESCONSIDERADA:'Desconsiderada',
  };
  const mockFor=key=>{
    const item={
      first:()=>item,
      waitFor:async()=>{ if(key===invisible)throw Error('hidden'); },
      count:async()=>key===absent?0:(key===duplicate?2:1),
      isVisible:async()=>key!==invisible,
      isChecked:async()=>state[key],
      check:async()=>{ calls.push(key);state[key]=true; },
    };
    return item;
  };
  const page={
    getByRole:(role,options)=>{
      assert.equal(role,'checkbox');
      assert.equal(typeof options.name==='string' || options.name instanceof RegExp, true);
      const key=Object.keys(VERIFIED_STATUS_LABELS).find(k =>
        typeof options.name==='string'
          ? options.name===printedNames[k] && options.exact===true
          : options.name.test(printedNames[k]));
      assert(key,'localizador nome inesperado');
      return mockFor(key);
    },
  };
  return {page,state,calls};
}

test('todos os status identificados, inclusive Aberta e Impedimento com glifo', async()=>{
  const f=fakeStatuses();
  const states=await inspectAdvancedStatuses(f.page);
  assert.deepEqual(Object.keys(states),['ABERTA','CONCLUIDA','IMPEDIMENTO','DESCONSIDERADA']);
  assert.deepEqual(f.calls,[]);
  assert.equal(await concludedStatusCheckbox(f.page).count(),1);
  assert.deepEqual(await inspectConcludedStatus(f.page),{found:true,checked:false});
});

test('pode marcar apenas os status faltantes, sem desmarcar os já marcados',async()=>{
  const f=fakeStatuses({checkedAtStart:{ABERTA:true,IMPEDIMENTO:true}});
  assert.deepEqual(await ensureAllAdvancedStatuses(f.page),{selected:4});
  assert.deepEqual(f.calls,['CONCLUIDA','DESCONSIDERADA']);
  assert(Object.values(f.state).every(Boolean));
});

test('não marca nada se algum checkbox de status não existir',async()=>{
  for (const option of [{absent:'CONCLUIDA'},{duplicate:'ABERTA'},{invisible:'IMPEDIMENTO'}]) {
    const f=fakeStatuses(option);
    await assert.rejects(()=>ensureAllAdvancedStatuses(f.page),/não localizado de forma única e visível/);
    assert.deepEqual(f.calls,[]);
  }
});

test('bloqueia status desconhecido',()=>{
  assert.throws(()=>statusCheckbox(fakeStatuses().page,'ARQUIVADA'),/não reconhecido/);
});
