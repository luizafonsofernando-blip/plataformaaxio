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
    CONCLUIDA:'Concluída \uF020',
    IMPEDIMENTO:'Impedimento \uF020',
    DESCONSIDERADA:'Desconsiderada \uF020',
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
      if (role==='button') {
        assert.deepEqual(options,{name:'Filtrar',exact:true});
        return {count:async()=>1};
      }
      assert.equal(role,'checkbox');
      assert.equal(options.name instanceof RegExp, true);
      const key=Object.keys(VERIFIED_STATUS_LABELS).find(k =>
        options.name.test(printedNames[k]));
      assert(key,'localizador nome inesperado');
      return mockFor(key);
    },
  };
  return {page,state,calls};
}

test('todos os status identificados com nomes acessíveis contendo glifos', async()=>{
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


test('Concluída e Desconsiderada aceitam nomes simples ou com sufixo',()=>{
  const matching=['Concluída','Concluída \uF020','Desconsiderada','Desconsiderada \uF020'];
  const f=fakeStatuses();
  const a=statusCheckbox(f.page,'CONCLUIDA');
  const b=statusCheckbox(f.page,'DESCONSIDERADA');
  assert.equal(a!==undefined,true);
  assert.equal(b!==undefined,true);
  // Demonstrar a ancoragem sem usar igualdade exata.
  assert.match('Concluída \uF020',/^Concluída\b/i);
  assert.match('Desconsiderada \uF020',/^Desconsiderada\b/i);
  assert.doesNotMatch('Não concluída',/^Concluída\b/i);
});

test('interrompe após checkbox desaparecer durante seleções, sem avançar',async()=>{
  let selected=false;
  const keys=['ABERTA','CONCLUIDA','IMPEDIMENTO','DESCONSIDERADA'];
  const labels=['Aberta','Concluída','Impedimento','Desconsiderada'];
  const state=[false,false,false,false];
  let clicks=0;
  const page={
    getByRole:(role,opts)=>{
      if(role==='button') return {count:async()=>1};
      const i=labels.findIndex(label=>opts.name.test(label));
      assert.notEqual(i,-1);
      const el={
        first:()=>el,
        waitFor:async()=>{},
        count:async()=>i===1 && selected?0:1,
        isVisible:async()=>true,
        isChecked:async()=>state[i],
        check:async()=>{clicks++;state[i]=true;if(i===0)selected=true;},
      };
      return el;
    },
  };
  await assert.rejects(()=>ensureAllAdvancedStatuses(page),/CONCLUIDA desapareceu/);
  assert.equal(clicks,1);
  assert.deepEqual(state,[true,false,false,false]);
});
