// Gestta/E-BEF: plano de reconciliacao INERTE (sem I/O, banco ou rede).
// Nao executa transacoes; nunca retorna CNPJ, nome, ID ou linhas completas.
// Snapshot fornecido e uma hipotese de trabalho, NAO prova estado do Supabase.
import {createHash} from 'node:crypto';
import {validateGesttaApiTask} from '../../api/ebef/gestta-sync-contract.mjs';
import {COMPARABLE_FIELDS} from './pre-sync-preview.mjs';

const IMMUTABLE=['gestta_id','cnpj','competencia','tipo_tarefa'];
const hash=value=>createHash('sha256').update(value).digest('hex');

function indexValidated(rows) {
  if(!Array.isArray(rows))throw new Error('Conjunto de tarefas invalido.');
  const byKey=new Map();
  const gesttaIds=new Set();
  for(const row of rows){
    if(!validateGesttaApiTask(row)){
      throw new Error('Tarefa sem contrato E-BEF valido; reconciliacao bloqueada.');
    }
    if(byKey.has(row.source_key)||gesttaIds.has(row.gestta_id)){
      throw new Error('Identificador repetido; reconciliacao bloqueada.');
    }
    byKey.set(row.source_key,row);
    gesttaIds.add(row.gestta_id);
  }
  return byKey;
}
function signature(row){
  return hash(JSON.stringify(COMPARABLE_FIELDS.map(field=>row[field])));
}
function datasetHash(index){
  return hash(JSON.stringify([...index].map(([key,row])=>[key,signature(row)])
    .sort((a,b)=>a[0].localeCompare(b[0]))));
}
function validUtcInstant(value) {
  if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)){
    return false;
  }
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return false;
  const expected=value.length===20?value.slice(0,-1)+'.000Z':value;
  return date.toISOString()===expected;
}
function validateOfflineSnapshot(snapshot){
  if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot)||
     snapshot.kind!=='explicit_readonly_snapshot'||
     snapshot.complete!==true||
     snapshot.origin!=='operator_supplied_offline'||
     !Array.isArray(snapshot.rows)||
     !validUtcInstant(snapshot.capturedAt)){
    throw new Error('Snapshot offline completo com procedencia e captura obrigatorio.');
  }
  return indexValidated(snapshot.rows);
}

export function planEbefReconciliationOffline(tasks,snapshot=null) {
  const incoming=indexValidated(tasks);
  const base={
    mode:'offline_reconciliation_only',
    proposedRecords:incoming.size,
    proposedDigest:datasetHash(incoming),
    inserts:null,updates:null,unchanged:null,
    existingRecordsOutsideExport:null,conflicts:null,
    wouldDelete:0,needsReadOnlySnapshot:true,
    snapshotVerifiedAgainstDatabase:false,
    concurrencyRechecked:false,
    transactionalWriteImplemented:false,
    applyAuthorized:false,writesPerformed:false,
    allUsersProven:false,
  };
  if(snapshot===null){
    return {...base,decision:'blocked_snapshot_required'};
  }
  const previous=validateOfflineSnapshot(snapshot);
  let inserts=0,updates=0,unchanged=0;
  for(const [key,next] of incoming){
    const old=previous.get(key);
    if(!old){inserts++;continue;}
    if(IMMUTABLE.some(field=>next[field]!==old[field])){
      throw new Error('Identidade imutavel alterada; requer revisao manual.');
    }
    if(signature(next)===signature(old))unchanged++;
    else updates++;
  }
  return {
    ...base,inserts,updates,unchanged,
    existingRecordsOutsideExport:
      [...previous.keys()].filter(key=>!incoming.has(key)).length,
    conflicts:0,
    needsReadOnlySnapshot:false,
    snapshotDigest:datasetHash(previous),
    decision:'offline_estimate_not_authorized_for_write',
  };
}
