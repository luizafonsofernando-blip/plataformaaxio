// Ponte CONTROLADA do Excel LUCE para Supabase E-BEF HOMOLOGACAO.
// Nunca toca o projeto principal, nao executa DELETE/UPDATE/UPSERT.
// Os campos nao existentes no Excel ficam NULL (nao inventar dados).
import {createHash} from 'node:crypto';
import {validateGesttaApiTask} from '../../api/ebef/gestta-sync-contract.mjs';

export const EBEF_HOMOLOG_ORIGIN='https://xwpwjwbpahdphksggatm.supabase.co';
const sha=id=>createHash('sha256').update('gestta-id:'+id).digest('hex');
const safeDate=v=>v===''?null:v;

export function prepareEbefHomologRows(data,{
  expectedMonth='2026-10',expectedTasks=44,expectedCompanies=38
}={}){
  if(data?.schema!=='luce-ebef-local/v1'||data.origin!=='arquivo_local'||
     data.sync!==false||data.coverage!=='usuarios_nao_comprovados'||
     data.transmission!=='nao_comprovada' ||
     data.month!==expectedMonth||!Array.isArray(data.tasks)||
     data.tasks.length!==expectedTasks){
    throw Error('Relatorio de homologacao inesperado; importacao bloqueada.');
  }
  const companies=new Set(data.tasks.map(t=>t.cnpj));
  if(companies.size!==expectedCompanies)
    throw Error('Numero de empresas inesperado; importacao bloqueada.');
  const rows=data.tasks.map(t=>{
    const row={
      source_key:sha(t.id),gestta_id:t.id,cnpj:t.cnpj,
      competencia:t.competencia,tarefa:t.titulo,
      tipo_tarefa:t.categoria==='Verificação'?'verificacao':
        t.categoria==='Declaração'?'declaracao':null,
      tipo_registro:'',cliente:t.empresa,departamento:t.departamento,
      responsavel:t.responsavel,status_gestta:t.status,
      vencimento:safeDate(t.dataMeta),data_legal:null,
      concluido_em:safeDate(t.concluidoEm),
      feito_atrasado:null,feito_com_multa:null,baixado:null,
    };
    if(!validateGesttaApiTask(row)){
      throw Error('Registro E-BEF invalido; importacao bloqueada.');
    }
    return row;
  });
  if(new Set(rows.map(x=>x.source_key)).size!==rows.length){
    throw Error('IDs E-BEF repetidos; importacao bloqueada.');
  }
  return {rows,summary:{
    month:data.month,companies:companies.size,tasks:rows.length,
    verification:rows.filter(t=>t.tipo_tarefa==='verificacao').length,
    declaration:rows.filter(t=>t.tipo_tarefa==='declaracao').length,
    omittedFieldsFromXlsx:['tipo_registro','data_legal','feito_atrasado',
      'feito_com_multa','baixado'],
    sourceCompleteness:'xlsx_local_parcial',
    fullGesttaUsersProven:false,transmissionProven:false,
    destination:'somente_ebef_homologacao',
    writesPerformed:false,
  }};
}
function headers(key){
  return {apikey:key,authorization:'Bearer '+key,
    accept:'application/json','content-type':'application/json'};
}
export async function importEbefHomologOnce(rows,{
  key,confirmed=false,requestFetch=fetch
}={}){
  if(!confirmed)throw Error('Importacao nao autorizada; nenhuma escrita.');
  if(typeof key!=='string'||key.length<32||
     !Array.isArray(rows)||rows.length!==44 ||
     rows.some(t=>!validateGesttaApiTask(t)) ||
     new Set(rows.map(t=>t.source_key)).size!==rows.length){
    throw Error('Credencial ou registros invalidos; nenhuma escrita.');
  }
  const endpoint=EBEF_HOMOLOG_ORIGIN+'/rest/v1/ebef_gestta_tasks';
  const options={method:'GET',headers:headers(key),
    signal:AbortSignal.timeout(15000)};
  // Falha segura: recusa sobrepor qualquer registro ja presente.
  const before=await requestFetch(endpoint+'?select=source_key&limit=1',options);
  if(!before.ok)throw Error('Nao foi possivel verificar a tabela de homologacao.');
  const existing=await before.json();
  if(!Array.isArray(existing)||existing.length!==0){
    throw Error('Homologacao ja contem dados. Nenhum registro alterado.');
  }
  // PostgREST insere o lote como uma unica instrucao: nao usar UPSERT.
  const inserted=await requestFetch(endpoint,{
    method:'POST',headers:{...headers(key),Prefer:'return=minimal'},
    body:JSON.stringify(rows),signal:AbortSignal.timeout(30000)
  });
  if(!inserted.ok){
    throw Error('Importacao nao confirmada. Verifique a tabela antes de tentar novamente.');
  }
  const check=await requestFetch(endpoint+'?select=source_key&limit=100',options);
  if(!check.ok)throw Error('Enviado, mas nao foi possivel validar a quantidade.');
  const remote=await check.json();
  const expected=new Set(rows.map(x=>x.source_key));
  if(!Array.isArray(remote)||remote.length!==expected.size||
     remote.some(x=>!expected.has(x.source_key))){
    throw Error('Divergencia apos importacao. Revisar homologacao manualmente.');
  }
  return {
    imported:rows.length,verified:remote.length,companies:
      new Set(rows.map(x=>x.cnpj)).size,
    destination:'ebef_homologacao',productionTouched:false
  };
}
