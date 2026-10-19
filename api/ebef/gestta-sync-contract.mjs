// Contrato puro para o Gestta E-BEF: SOMENTE validacao, sem banco ou rede.
// Nao devolver nem registrar CNPJs, nomes, responsaveis ou IDs das tarefas.
import {createHash} from 'node:crypto';

export const MAX_GESTTA_BODY_BYTES=600_000;
export const MAX_GESTTA_TASKS=2000;
const FIELDS=Object.freeze([
  'source_key','gestta_id','cnpj','competencia','tarefa','tipo_tarefa',
  'tipo_registro','cliente','departamento','responsavel','status_gestta',
  'vencimento','data_legal','concluido_em','feito_atrasado','feito_com_multa','baixado',
]);
const DATE_FIELDS=['vencimento','data_legal','concluido_em'];
const BOOL_FIELDS=['feito_atrasado','feito_com_multa','baixado'];
const TEXT_FIELDS=['tarefa','tipo_registro','cliente','departamento',
  'responsavel','status_gestta'];
function ascii(value){
  return String(value??'').normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toUpperCase();
}
function validDate(value){
  if(value===null)return true;
  if(typeof value!=='string'||!/^(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value))return false;
  const date=new Date(value+'T00:00:00Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function validateGesttaApiTask(row){
  if(!row||typeof row!=='object'||Array.isArray(row))return false;
  if(Object.keys(row).length!==FIELDS.length || FIELDS.some(f=>!Object.hasOwn(row,f)))return false;
  if(!/^[a-f0-9]{64}$/.test(row.source_key) ||
     !/^[a-f0-9]{24}$/.test(row.gestta_id)||
     !/^\d{14}$/.test(row.cnpj)||
     !/^20\d{2}-(0[1-9]|1[0-2])$/.test(row.competencia))return false;
  if(TEXT_FIELDS.some(f=>typeof row[f]!=='string'||row[f].length>500))return false;
  if(!row.tarefa.trim()||!row.cliente.trim()||!row.responsavel.trim()||
     !row.status_gestta.trim()||row.tipo_registro.length>100)return false;
  if(!DATE_FIELDS.every(f=>validDate(row[f])))return false;
  if(!BOOL_FIELDS.every(f=>row[f]===null||typeof row[f]==='boolean'))return false;
  const title=ascii(row.tarefa);
  const type=/^DECLARACAO DE EBEF(?:\s*\||$)/.test(title)?'declaracao'
    : /^VERIFICAR NECESSIDADE DE EBEF(?:\s*\||$)/.test(title)?'verificacao'
    : null;
  if(!type || row.tipo_tarefa!==type)return false;
  const calculated=createHash('sha256').update('gestta-id:'+row.gestta_id).digest('hex');
  return row.source_key===calculated;
}
export function validateGesttaApiEnvelope(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||
     Object.keys(body).length!==4||
     !['source','mode','export_sha256','tasks'].every(k=>Object.hasOwn(body,k))||
     body.source!=='gestta'||body.mode!=='validate_only'||
     !/^[a-f0-9]{64}$/.test(body.export_sha256)||
     !Array.isArray(body.tasks)||body.tasks.length<1||
     body.tasks.length>MAX_GESTTA_TASKS)return false;
  const unique=new Set();
  for(const row of body.tasks){
    if(!validateGesttaApiTask(row)||unique.has(row.source_key))return false;
    unique.add(row.source_key);
  }
  return true;
}
export function summarizeGesttaApiEnvelope(body){
  if(!validateGesttaApiEnvelope(body)){
    throw new Error('Payload Gestta invalido.');
  }
  const categories={declaracao:0,verificacao:0};
  for(const row of body.tasks)categories[row.tipo_tarefa]++;
  return {
    ok:true,mode:'validate_only',acceptedRecords:body.tasks.length,categories,
    allUsersProven:false,dbCompared:false,writesPerformed:false,
  };
}
