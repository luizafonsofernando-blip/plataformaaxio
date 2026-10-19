// Gestta E-BEF: endpoint de validacao autenticada, SEM ESCRITA.
// A sincronizacao definitiva permanece intencionalmente bloqueada
// ate aprovacao do esquema, auditoria e implementacao transacional.
import {createHash,timingSafeEqual} from 'node:crypto';
import {setApiSecurityHeaders} from '../_security.js';
import {
  MAX_GESTTA_BODY_BYTES,validateGesttaApiEnvelope,
  summarizeGesttaApiEnvelope,
} from './gestta-sync-contract.mjs';

function isAuthorized(actual,expected){
  if(!actual||!expected)return false;
  const a=createHash('sha256').update(actual).digest();
  const b=createHash('sha256').update(expected).digest();
  return timingSafeEqual(a,b);
}

export default async function handler(req,res){
  setApiSecurityHeaders(res);
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return res.status(405).json({error:'Metodo nao permitido.'});
  }
  const secret=process.env.GESTTA_SYNC_TOKEN;
  if(!secret||secret.length<32){
    return res.status(503).json({error:'Validacao Gestta ainda nao configurada.'});
  }
  const authorization=String(req.headers?.authorization??'');
  const bearer=authorization.match(/^Bearer ([^\s]+)$/i)?.[1]??'';
  if(!isAuthorized(bearer,secret)){
    return res.status(401).json({error:'Acesso nao autorizado.'});
  }
  const size=Number(req.headers?.['content-length']??0);
  if(!Number.isFinite(size)||size<0||size>MAX_GESTTA_BODY_BYTES){
    return res.status(413).json({error:'Requisicao excede o limite.'});
  }
  let body;
  try{
    body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(Buffer.byteLength(JSON.stringify(body??{}),'utf8')>MAX_GESTTA_BODY_BYTES){
      return res.status(413).json({error:'Requisicao excede o limite.'});
    }
  }catch{
    return res.status(400).json({error:'JSON invalido.'});
  }
  // Defesa em profundidade: nenhum caminho executa fetch nem SQL.
  // Payload legado, sem mode, tambem e bloqueado (nao e dry-run implicito).
  if(body?.mode!=='validate_only'){
    return res.status(423).json({
      error:'Gravacao Gestta -> LUCE bloqueada durante a homologacao.',
    });
  }
  if(!validateGesttaApiEnvelope(body)){
    return res.status(422).json({error:'Relatorio nao atende ao contrato.'});
  }
  return res.status(200).json(summarizeGesttaApiEnvelope(body));
}
