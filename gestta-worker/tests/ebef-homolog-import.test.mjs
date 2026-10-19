import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareEbefHomologRows,importEbefHomologOnce,
  EBEF_HOMOLOG_ORIGIN} from '../src/ebef-homolog-import.mjs';

const id=i=>i.toString(16).padStart(24,'0');
const cnpj=i=>String(10000000000000+i%38);
const report=()=>({
  schema:'luce-ebef-local/v1',origin:'arquivo_local',month:'2026-10',
  sync:false,coverage:'usuarios_nao_comprovados',
  transmission:'nao_comprovada',
  tasks:Array.from({length:44},(_,i)=>({
    id:id(i+1),cnpj:cnpj(i),empresa:'CLIENTE SINTETICO '+i,
    categoria:'Verificação',status:i<14?'ABERTA':'CONCLUIDA',
    titulo:'VERIFICAR NECESSIDADE DE EBEF | TECNICO',
    departamento:'Tecnico',responsavel:'EQUIPE SINTETICA',
    dataMeta:'2026-10-19',competencia:'2026-10',
    concluidoEm:i<14?'':'2026-10-19'
  }))
});
test('prepara as 44 tarefas e 38 empresas sem inventar campos do Excel',()=>{
  const {rows,summary}=prepareEbefHomologRows(report());
  assert.equal(rows.length,44);
  assert.equal(summary.companies,38);
  assert.equal(summary.verification,44);
  assert.equal(summary.declaration,0);
  assert.equal(rows[0].data_legal,null);
  assert.equal(rows[0].feito_atrasado,null);
  assert.equal(rows[0].vencimento,'2026-10-19');
  assert.equal(rows[0].cnpj.length,14);
  assert.equal(summary.writesPerformed,false);
  assert.equal(JSON.stringify(summary).includes('CLIENTE SINTETICO'),false);
});
test('falha antes do envio com quantidade diferente ou documento manipulado',()=>{
  const short=report();short.tasks.pop();
  assert.throws(()=>prepareEbefHomologRows(short),/bloqueada/);
  const changed=report();changed.tasks[0].cnpj='123';
  assert.throws(()=>prepareEbefHomologRows(changed),/bloqueada/);
  const dup=report();dup.tasks[1].id=dup.tasks[0].id;
  assert.throws(()=>prepareEbefHomologRows(dup),/bloqueada/);
});
test('nao faz chamada de rede se falta autorizacao ou credencial',async()=>{
  const {rows}=prepareEbefHomologRows(report());
  let calls=0;
  const fake=()=>{calls++;throw Error('sem rede');};
  await assert.rejects(importEbefHomologOnce(rows,{
    confirmed:false,key:'x'.repeat(40),requestFetch:fake
  }),/nao autorizada/);
  await assert.rejects(importEbefHomologOnce(rows,{
    confirmed:true,key:'curta',requestFetch:fake
  }),/invalidos/);
  assert.equal(calls,0);
});
test('envia um unico lote apenas se tabela homol vazia e verifica IDs',async()=>{
  const {rows}=prepareEbefHomologRows(report());
  let db=[],posts=0;
  const fake=async(url,options)=>{
    assert.ok(url.startsWith(EBEF_HOMOLOG_ORIGIN+'/rest/'));
    if(options.method==='GET'){
      if(url.includes('limit=1'))return new Response(JSON.stringify(db.slice(0,1)),{status:200});
      return new Response(JSON.stringify(db.map(x=>({source_key:x.source_key}))),{status:200});
    }
    assert.equal(options.method,'POST');
    assert.equal(options.headers.Prefer,'return=minimal');
    posts++;
    db=JSON.parse(options.body);
    return new Response(null,{status:201});
  };
  const result=await importEbefHomologOnce(rows,{
    confirmed:true,key:'test-only-token'.repeat(4),requestFetch:fake
  });
  assert.deepEqual([result.imported,result.verified,result.companies],[44,44,38]);
  assert.equal(result.productionTouched,false);
  assert.equal(posts,1);
  await assert.rejects(importEbefHomologOnce(rows,{
    confirmed:true,key:'test-only-token'.repeat(4),requestFetch:fake
  }),/ja contem dados/);
  assert.equal(posts,1);
});
