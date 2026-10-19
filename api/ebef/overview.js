// E-BEF hospedado: SOMENTE GET autenticado de um recorte Data Meta.
// Nunca executar insert/update/delete, criar tabela nem aceitar upload.
import {
  DATA_FIELDS,MAX_PAGE_SIZE,MAX_CLOUD_ROWS,allowedEbefUser,
  getEbefCloudConfig,validEbefMonth,nextEbefMonth,
  validateEbefRequest,rejectCrossOrigin,readonlyApiHeaders
} from './cloud-read-contract.mjs';

const timeoutMs=10000;
const emptyError=(res,status,code)=>res.status(status).json({error:code});

async function authenticatedUser(token,conf,requestFetch){
  const response=await requestFetch(conf.origin+'/auth/v1/user',{
    method:'GET',
    headers:{apikey:conf.apikey,authorization:'Bearer '+token,
      accept:'application/json'},
    signal:AbortSignal.timeout(timeoutMs)
  });
  if(!response.ok)return null;
  const user=await response.json();
  return user && typeof user==='object' ? user : null;
}
function toViewTask(row){
  if(!row||typeof row!=='object'||Array.isArray(row)||
     !/^[a-f0-9]{64}$/.test(row.source_key??'')||
     !/^[a-f0-9]{24}$/.test(row.gestta_id??'')||
     !/^\d{14}$/.test(row.cnpj??'')||
     !['verificacao','declaracao'].includes(row.tipo_tarefa)||
     !validEbefMonth(row.competencia)||
     !/^20\d{2}-\d{2}-\d{2}$/.test(row.vencimento??'')||
     ![row.cliente,row.tarefa,row.status_gestta,row.responsavel].every(x=>
       typeof x==='string'&&x.length>0&&x.length<=500) ||
     ![row.departamento??'',row.concluido_em??''].every(x=>
       typeof x==='string'&&x.length<=500)){
    throw Error('Linha E-BEF nao reconhecida.');
  }
  return {
    cnpj:row.cnpj,empresa:row.cliente,
    categoria:row.tipo_tarefa==='verificacao'?'Verificação':'Declaração',
    status:row.status_gestta,titulo:row.tarefa,
    departamento:row.departamento??'',responsavel:row.responsavel,
    dataMeta:row.vencimento,competencia:row.competencia,
    concluidoEm:row.concluido_em??'',id:row.gestta_id,
  };
}

export async function readCloudEbefMonth({month,conf,requestFetch=fetch}){
  const results=[],ids=new Set();
  let cursor=null;
  while(true){
    const url=new URL(conf.dataOrigin+'/rest/v1/ebef_gestta_tasks');
    url.searchParams.set('select',DATA_FIELDS.join(','));
    url.searchParams.set('and','(vencimento.gte.'+month+'-01,'+
      'vencimento.lt.'+nextEbefMonth(month)+'-01)');
    url.searchParams.set('order','source_key.asc');
    url.searchParams.set('limit',String(MAX_PAGE_SIZE));
    if(cursor)url.searchParams.set('source_key','gt.'+cursor);
    const response=await requestFetch(url.toString(),{
      method:'GET',
      headers:{apikey:conf.service,authorization:'Bearer '+conf.service,
        accept:'application/json'},
      signal:AbortSignal.timeout(timeoutMs)
    });
    if(!response.ok){
      // PGRST205/PostgreSQL undefined_table: esquema ainda nao aplicado.
      const data=await response.json().catch(()=>({}));
      if([404,406].includes(response.status)&&
         ['PGRST205','42P01'].includes(data.code)){
        const error=new Error('E-BEF ainda nao provisionado.');
        error.code='not_provisioned';throw error;
      }
      throw Error('Falha na leitura segura E-BEF.');
    }
    const rows=await response.json();
    if(!Array.isArray(rows)||rows.length>MAX_PAGE_SIZE)
      throw Error('Paginacao E-BEF invalida.');
    for(const row of rows){
      const task=toViewTask(row);
      if(cursor&&row.source_key<=cursor)throw Error('Cursor E-BEF inconsistente.');
      if(ids.has(task.id))throw Error('ID E-BEF repetido.');
      ids.add(task.id);
      results.push(task);
      cursor=row.source_key;
      if(results.length>MAX_CLOUD_ROWS)
        throw Error('Escopo E-BEF excede limite seguro.');
    }
    if(rows.length<MAX_PAGE_SIZE)break;
  }
  return {
    schema:'luce-ebef-local/v1',
    origin:'luce_cloud',month,
    coverage:'usuarios_nao_comprovados',
    transmission:'nao_comprovada',sync:false,
    tasks:results
  };
}

export async function serveEbefOverview(req,res,{
  env=process.env,requestFetch=fetch
}={}){
  readonlyApiHeaders(res);
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return emptyError(res,405,'method_not_allowed');
  }
  if(rejectCrossOrigin(req))return emptyError(res,403,'origin_denied');
  const token=validateEbefRequest(req);
  if(!token)return emptyError(res,401,'login_required');
  const month=String(req.query?.month??'');
  if(!validEbefMonth(month))return emptyError(res,400,'invalid_month');
  let conf;
  try{conf=getEbefCloudConfig(env);}
  catch{return emptyError(res,503,'configuration_invalid');}
  if(!conf.configured)return emptyError(res,503,'access_not_configured');
  try{
    const user=await authenticatedUser(token,conf,requestFetch);
    if(!user)return emptyError(res,401,'session_expired');
    if(!allowedEbefUser(user,conf.allowed))
      return emptyError(res,403,'ebef_access_denied');
    const data=await readCloudEbefMonth({month,conf,requestFetch});
    return res.status(200).json(data);
  }catch(error){
    if(error?.code==='not_provisioned')
      return emptyError(res,503,'ebef_database_not_provisioned');
    // Nunca registrar detalhes, tokens, nomes ou linhas de clientes.
    return emptyError(res,503,'ebef_read_unavailable');
  }
}

export default async function handler(req,res){
  return serveEbefOverview(req,res);
}
