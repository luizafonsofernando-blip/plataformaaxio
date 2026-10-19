import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  validateGesttaApiTask,validateGesttaApiEnvelope,summarizeGesttaApiEnvelope,
} from '../../api/ebef/gestta-sync-contract.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
const task=(id='a'.repeat(24))=>({
  source_key:sha('gestta-id:'+id),gestta_id:id,cnpj:'01234567000189',
  competencia:'2026-10',tarefa:'VERIFICAR NECESSIDADE DE EBEF | TECNICO',
  tipo_tarefa:'verificacao',tipo_registro:'',cliente:'EMPRESA EXEMPLO',
  departamento:'Técnico',responsavel:'Equipe Exemplo',status_gestta:'ABERTA',
  vencimento:'2026-10-19',data_legal:null,concluido_em:null,
  feito_atrasado:false,feito_com_multa:null,baixado:false,
});
const body=()=>({
  source:'gestta',mode:'validate_only',export_sha256:'b'.repeat(64),
  tasks:[task()],
});

test('API reconhece Data Meta legitima e valida somente a estrutura',()=>{
  assert.equal(validateGesttaApiTask(task()),true);
  assert.equal(validateGesttaApiEnvelope(body()),true);
  const response=summarizeGesttaApiEnvelope(body());
  assert.deepEqual(response,{
    ok:true,mode:'validate_only',acceptedRecords:1,
    categories:{declaracao:0,verificacao:1},
    allUsersProven:false,dbCompared:false,writesPerformed:false,
  });
  assert.equal(JSON.stringify(response).includes('01234567000189'),false);
});
test('API rejeita datas impossiveis, formato errado e campo omitido',()=>{
  for(const v of ['2026-02-30','2026-13-01','19/10/2026','2026-10-00',
    '2026-11-31','2026-10-19T00:00:00Z',undefined]){
    const row={...task(),vencimento:v};
    assert.equal(validateGesttaApiTask(row),false,String(v));
  }
});
test('API rejeita CNPJ alterado com mesmo ID e chave, campos extras e booleans indevidos',()=>{
  for(const row of [
    {...task(),source_key:'0'.repeat(64)},
    {...task(),gestta_id:null},
    {...task(),cnpj:'123'},
    {...task(),foo:'extra'},
    {...task(),feito_atrasado:'SIM'},
    {...task(),tipo_tarefa:'declaracao'},
    {...task(),tarefa:'TAREFA GENERICA'},
  ])assert.equal(validateGesttaApiTask(row),false);
});
test('API impede payload legado ou tentativa de escrita e IDs repetidos',()=>{
  for(const request of [
    {...body(),mode:'write'},
    {...body(),mode:undefined},
    {...body(),tasks:[task(),task()]},
    {...body(),source:'outro'},
    {...body(),extra:'x'},
    {...body(),export_sha256:'x'},
  ])assert.equal(validateGesttaApiEnvelope(request),false);
});
test('API distingue duas categorias de tarefas da exportacao',()=>{
  const second=task('c'.repeat(24));
  second.tipo_tarefa='declaracao';
  second.tarefa='DECLARAÇÃO DE EBEF | TÉCNICO';
  const payload={...body(),tasks:[task(),second]};
  assert.equal(validateGesttaApiEnvelope(payload),true);
  assert.deepEqual(summarizeGesttaApiEnvelope(payload).categories,
    {declaracao:1,verificacao:1});
});
