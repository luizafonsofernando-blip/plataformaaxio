import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import handler from '../../api/ebef/gestta-sync.js';
import {syncTasks} from '../src/sync.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
const TOKEN='a'.repeat(48);
const task=()=>({
  source_key:sha('gestta-id:'+'b'.repeat(24)),gestta_id:'b'.repeat(24),
  cnpj:'01234567000189',competencia:'2026-10',
  tarefa:'VERIFICAR NECESSIDADE DE EBEF | TECNICO',
  tipo_tarefa:'verificacao',tipo_registro:'',cliente:'EMPRESA EXEMPLO',
  departamento:'Tecnico',responsavel:'Equipe Exemplo',status_gestta:'ABERTA',
  vencimento:'2026-10-19',data_legal:null,concluido_em:null,
  feito_atrasado:false,feito_com_multa:null,baixado:false,
});
function req(body,auth='Bearer '+TOKEN){
  return {method:'POST',headers:{authorization:auth},body};
}
function res(){
  return {
    code:200,payload:null,headers:{},
    setHeader(name,value){this.headers[name]=value;return this;},
    status(code){this.code=code;return this;},
    json(payload){this.payload=payload;return this;},
  };
}

test('rota bloqueia modo antigo de sincronizacao sem chamar fetch',async()=>{
  const oldSecret=process.env.GESTTA_SYNC_TOKEN;
  const priorFetch=globalThis.fetch;
  process.env.GESTTA_SYNC_TOKEN=TOKEN;
  let calls=0;
  globalThis.fetch=()=>{calls++;throw new Error('Acesso de rede proibido no teste.');};
  try{
    const row=task();
    const requestRow=row;
    const legacy={source:'gestta',export_sha256:'a'.repeat(64),tasks:[requestRow]};
    const blocked=res();
    await handler(req(legacy),blocked);
    assert.equal(blocked.code,423);
    assert.equal(calls,0);
    const accepted=res();
    await handler(req({...legacy,mode:'validate_only'}),accepted);
    assert.equal(accepted.code,200);
    assert.equal(accepted.payload.acceptedRecords,1);
    assert.equal(accepted.payload.writesPerformed,false);
    assert.equal(accepted.payload.dbCompared,false);
    assert.equal(calls,0);
    const denied=res();
    await handler(req({...legacy,mode:'validate_only'},'Bearer invalido'),denied);
    assert.equal(denied.code,401);
    assert.equal(calls,0);
  }finally{
    globalThis.fetch=priorFetch;
    if(oldSecret===undefined)delete process.env.GESTTA_SYNC_TOKEN;
    else process.env.GESTTA_SYNC_TOKEN=oldSecret;
  }
});
test('cliente de sincronizacao nao usa rede quando dryRun nao e true',async()=>{
  const oldFetch=globalThis.fetch;
  let calls=0;
  globalThis.fetch=()=>{calls++;throw new Error('Acesso de rede proibido no teste.');};
  try{
    await assert.rejects(()=>syncTasks([task()],'f'.repeat(64)),
      /desabilitada/);
    const simulated=await syncTasks([task()],'f'.repeat(64),{dryRun:true});
    assert.equal(simulated.dryRun,true);
    assert.equal(simulated.synchronized,false);
    assert.equal(calls,0);
  }finally{globalThis.fetch=oldFetch;}
});
