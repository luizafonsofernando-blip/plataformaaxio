import test from 'node:test';
import assert from 'node:assert/strict';
import {
  serveEbefOverview,readCloudEbefMonth
} from '../../api/ebef/overview.js';
import {
  allowedEbefUser,nextEbefMonth,getEbefCloudConfig
} from '../../api/ebef/cloud-read-contract.mjs';

const USER_ID='11111111-1111-4111-8111-111111111111';
const mockEnv={
  EBEF_ALLOWED_USER_IDS:USER_ID,
  SUPABASE_PUBLISHABLE_KEY:'public-test-key',
  SUPABASE_SERVICE_ROLE_KEY:'server-only-test-key'
};
const user={id:USER_ID,app_metadata:{status:'approved',role:'user'}};
function request(month='2026-10',authorization='Bearer '+'t'.repeat(36)){
  return {method:'GET',query:{month},
    headers:{authorization,host:'localhost:3000'}};
}
function response(){
  return {code:200,body:null,headers:{},
    setHeader(k,v){this.headers[k]=v;return this;},
    status(code){this.code=code;return this;},
    json(body){this.body=body;return this;}
  };
}
const row={
  source_key:'a'.repeat(64),gestta_id:'b'.repeat(24),
  cnpj:'01234567000189',competencia:'2026-10',
  tarefa:'VERIFICAR NECESSIDADE DE EBEF | TECNICO',
  tipo_tarefa:'verificacao',cliente:'EMPRESA SINTETICA',
  departamento:'Técnico',responsavel:'Equipe sintética',
  status_gestta:'ABERTA',vencimento:'2026-10-19',concluido_em:null
};

test('API E-BEF sem token, method GET ou mes invalido nao acessa rede',async()=>{
  let calls=0;
  const fake=()=>{calls++;throw Error('nao acessar rede');};
  for(const [req,status] of [
    [request('2026-10',''),401],
    [{...request(),method:'POST'},405],
    [request('2026-15'),400],
  ]){
    const res=response();
    await serveEbefOverview(req,res,{env:mockEnv,requestFetch:fake});
    assert.equal(res.code,status);
  }
  assert.equal(calls,0);
});
test('API E-BEF falha fechada sem allowlist ou credenciais configuradas',async()=>{
  const res=response();
  await serveEbefOverview(request(),res,{env:{},requestFetch:()=>{
    throw Error('Nao deveria consultar rede.');
  }});
  assert.equal(res.code,503);
  assert.equal(res.body.error,'access_not_configured');
  assert.equal(allowedEbefUser(user,'*'),false);
  assert.equal(allowedEbefUser({...user,app_metadata:{status:'pending'}},USER_ID),false);
  assert.equal(allowedEbefUser(user,USER_ID),true);
  assert.equal(nextEbefMonth('2026-12'),'2027-01');
  assert.equal(getEbefCloudConfig(mockEnv).configured,true);
});
test('API E-BEF exige usuario aprovado e na allowlist antes de consultar dados',async()=>{
  let taskRead=0;
  const fake=async url=>{
    if(url.includes('/auth/v1/user'))return new Response(JSON.stringify({
      ...user,id:'22222222-2222-4222-8222-222222222222'
    }),{status:200});
    taskRead++;
    return new Response('[]',{status:200});
  };
  const res=response();
  await serveEbefOverview(request(),res,{env:mockEnv,requestFetch:fake});
  assert.equal(res.code,403);
  assert.equal(res.body.error,'ebef_access_denied');
  assert.equal(taskRead,0);
});
test('API E-BEF autenticada retorna apenas espelho read-only sem IDs internos',async()=>{
  const urls=[],methods=[];
  const fake=async (url,options)=>{
    urls.push(url);methods.push(options.method);
    if(url.includes('/auth/v1/user'))
      return new Response(JSON.stringify(user),{status:200});
    return new Response(JSON.stringify([row]),{status:200});
  };
  const res=response();
  await serveEbefOverview(request(),res,{env:mockEnv,requestFetch:fake});
  assert.equal(res.code,200);
  assert.deepEqual(methods,['GET','GET']);
  assert.equal(res.body.tasks.length,1);
  assert.equal(res.body.tasks[0].id,row.gestta_id);
  assert.equal(res.body.tasks[0].dataMeta,'2026-10-19');
  assert.equal(res.body.tasks[0].categoria,'Verificação');
  assert.equal(res.body.origin,'luce_cloud');
  assert.equal(res.body.transmission,'nao_comprovada');
  assert.equal(res.body.sync,false);
  assert.equal(JSON.stringify(res.body).includes(row.source_key),false);
  assert.ok(urls[1].includes('vencimento'));
  assert.ok(urls[1].includes('source_key.asc'));
});
test('API E-BEF distingue tabela nao criada de dados vazios',async()=>{
  const fake=async (url)=>{
    if(url.includes('/auth/v1/user'))
      return new Response(JSON.stringify(user),{status:200});
    return new Response(JSON.stringify({code:'PGRST205'}),{status:404});
  };
  const res=response();
  await serveEbefOverview(request(),res,{env:mockEnv,requestFetch:fake});
  assert.equal(res.code,503);
  assert.equal(res.body.error,'ebef_database_not_provisioned');
});
test('leitura E-BEF vazia e valido vazio, nunca deve inventar tarefas',async()=>{
  const conf=getEbefCloudConfig(mockEnv);
  const data=await readCloudEbefMonth({
    month:'2026-10',conf,
    requestFetch:async()=>new Response('[]',{status:200})
  });
  assert.deepEqual(data.tasks,[]);
  assert.equal(data.coverage,'usuarios_nao_comprovados');
  assert.equal(data.sync,false);
});
