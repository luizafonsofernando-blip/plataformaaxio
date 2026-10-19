// LUCE E-BEF — autenticacao de LEITURA do painel hospedado.
// Sem escrita nem publicacao de credenciais. Acesso NEGADO por padrao.
import {setApiSecurityHeaders} from '../_security.js';

const AUTH_ORIGIN='https://prznhgwiibcazuwlwvnt.supabase.co';
const HOMOLOG_ORIGIN='https://xwpwjwbpahdphksggatm.supabase.co';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const DATA_FIELDS=[
  'source_key','gestta_id','cnpj','competencia','tarefa','tipo_tarefa',
  'cliente','departamento','responsavel','status_gestta','vencimento',
  'concluido_em'
];
export const MAX_PAGE_SIZE=250;
export const MAX_CLOUD_ROWS=3000;

export function allowedEbefUser(user,idsRaw){
  if(!user||typeof user!=='object'||!UUID.test(String(user.id??'').toLowerCase()) ||
     user.app_metadata?.status!=='approved')return false;
  // Precisa de lista EXPLICITA, não aceitar wildcard, email ou papel admin geral.
  const ids=String(idsRaw??'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  return ids.length>0&&ids.length<=100&&ids.every(x=>UUID.test(x))&&
    ids.includes(String(user.id).toLowerCase());
}
export function validEbefMonth(month){
  return typeof month==='string'&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(month);
}
export function nextEbefMonth(month){
  if(!validEbefMonth(month))throw new Error('Competencia invalida.');
  const [year,mm]=month.split('-').map(Number);
  return mm===12?(year+1)+'-01':year+'-'+String(mm+1).padStart(2,'0');
}
export function getEbefCloudConfig(env){
  // NUNCA ler tabela Gestta no banco principal. A homologacao consulta
  // apenas projeto especifico, e SOMENTE em Vercel Preview.
  const authUrl=env.SUPABASE_URL||AUTH_ORIGIN;
  const dataUrl=env.EBEF_HOMOLOG_SUPABASE_URL;
  if(authUrl!==AUTH_ORIGIN||
     (dataUrl!==undefined&&dataUrl!==HOMOLOG_ORIGIN)){
    throw new Error('Origem Supabase nao permitida para E-BEF.');
  }
  if(env.VERCEL_ENV!=='preview'||
     env.EBEF_HOMOLOG_ENABLED!=='true'){
    return {configured:false,origin:AUTH_ORIGIN,
      dataOrigin:HOMOLOG_ORIGIN};
  }
  const apikey=env.SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
  const service=env.EBEF_HOMOLOG_SERVICE_ROLE_KEY;
  const allowed=env.EBEF_ALLOWED_USER_IDS;
  if(!apikey||!service||!allowed||!allowed.trim()||
     dataUrl!==HOMOLOG_ORIGIN){
    return {configured:false,origin:AUTH_ORIGIN,
      dataOrigin:HOMOLOG_ORIGIN};
  }
  return {
    configured:true,origin:AUTH_ORIGIN,dataOrigin:HOMOLOG_ORIGIN,
    apikey,service,allowed
  };
}

export function validateEbefRequest(req){
  const bearer=String(req.headers?.authorization??'').match(/^Bearer ([^\s]{20,4096})$/i)?.[1];
  return bearer||null;
}
export function rejectCrossOrigin(req){
  const origin=String(req.headers?.origin||'');
  if(!origin)return false;
  try{
    const u=new URL(origin);
    const host=String(req.headers?.host||'').toLowerCase();
    return u.host.toLowerCase()!==host||
      (u.protocol!=='https:'&&u.hostname!=='localhost');
  }catch{return true;}
}
export function readonlyApiHeaders(res){
  setApiSecurityHeaders(res);
  res.setHeader('Vary','Authorization');
  res.setHeader('Content-Security-Policy',"default-src 'none'");
  res.setHeader('X-Robots-Tag','noindex, nofollow');
}
