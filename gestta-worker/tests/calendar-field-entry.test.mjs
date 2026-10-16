import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseDateFieldOrder,fillDateFields} from '../src/calendar-field-entry.mjs';

test('ao passar setembro -> outubro, fim é preenchido antes do início',()=>{
  assert.deepEqual(chooseDateFieldOrder(
    {start:'01/09/2026',end:'30/09/2026'},
    {start:'01/10/2026',end:'30/10/2026'}
  ),['end','start']);
});

test('ao voltar outubro -> setembro, início é preenchido antes do fim',()=>{
  assert.deepEqual(chooseDateFieldOrder(
    {start:'02/10/2026',end:'31/10/2026'},
    {start:'01/09/2026',end:'30/09/2026'}
  ),['start','end']);
});

test('entre janelas sobrepostas de outubro mantém ordem padrão',()=>{
  assert.deepEqual(chooseDateFieldOrder(
    {start:'01/10/2026',end:'30/10/2026'},
    {start:'02/10/2026',end:'31/10/2026'}
  ),['start','end']);
});

test('nunca aceita datas invertidas ou inválidas',()=>{
  for(const next of [
    {start:'32/10/2026',end:'31/10/2026'},
    {start:'31/10/2026',end:'01/10/2026'},
    {start:'01/10/2026',end:'33/10/2026'},
  ])assert.throws(
    ()=>chooseDateFieldOrder({start:'01/09/2026',end:'30/09/2026'},next),
    /inválidas/
  );
});

function fakeCalendar(start='01/09/2026',end='30/09/2026',options={}) {
  const state={start,end};
  const actions=[];
  let rejectOnce=Boolean(options.rejectOnce);
  const field=(key)=>({
    count:async()=>1,
    isVisible:async()=>true,
    inputValue:async()=>state[key],
    fill:async value=>{
      actions.push(key);
      // Simular validação do Gestta: se tentar start>fim antigo,
      // a atualização da UI ignora o valor incompatível.
      if(key==='start' && value==='01/10/2026' && state.end==='30/09/2026'){
        return;
      }
      if(key==='start' && rejectOnce){
        rejectOnce=false;
        return;
      }
      state[key]=value;
    },
  });
  return {
    page:{waitForTimeout:async()=>{}},
    initial:field('start'),
    final:field('end'),
    state,
    actions,
  };
}

test('preenchimento direcional evita reset na passagem setembro-outubro',async()=>{
  const f=fakeCalendar();
  const out=await fillDateFields(f.page,{
    initial:f.initial,final:f.final,
    start:'01/10/2026',end:'30/10/2026',
  });
  assert.equal(out.confirmed,true);
  assert.equal(out.passages,1);
  assert.deepEqual(f.actions,['end','start']);
  assert.deepEqual(f.state,{start:'01/10/2026',end:'30/10/2026'});
});

test('reverifica e corrige quando componente ignora primeira digitação',async()=>{
  const f=fakeCalendar('01/09/2026','30/09/2026',{rejectOnce:true});
  const out=await fillDateFields(f.page,{
    initial:f.initial,final:f.final,
    start:'01/10/2026',end:'30/10/2026',
  });
  assert.equal(out.passages,2);
  assert.deepEqual(f.actions,['end','start','start']);
});

test('interrompe após duas passagens se campo persistir incorreto',async()=>{
  const f=fakeCalendar();
  f.initial.fill=async()=>{};
  await assert.rejects(
    ()=>fillDateFields(f.page,{
      initial:f.initial,final:f.final,
      start:'01/10/2026',end:'30/10/2026',
    }),
    /Nenhum botao Aplicar foi acionado/
  );
});

test('não preenche se campos estão invisíveis ou ambíguos',async()=>{
  const f=fakeCalendar();
  let fills=0;
  f.initial.count=async()=>2;
  f.initial.fill=async()=>{fills++;};
  await assert.rejects(
    ()=>fillDateFields(f.page,{
      initial:f.initial,final:f.final,
      start:'01/10/2026',end:'30/10/2026',
    }),
    /nao sao unicos e visiveis/
  );
  assert.equal(fills,0);
});
