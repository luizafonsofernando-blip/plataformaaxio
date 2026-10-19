import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalEbefDashboard} from '../src/ebef-dashboard-local-http.mjs';

const synthetic={
  schema:'luce-ebef-local/v1',
  origin:'arquivo_local',month:'2026-10',sync:false,
  transmission:'nao_comprovada',coverage:'usuarios_nao_comprovados',
  tasks:[{
    id:'a'.repeat(24),cnpj:'01234567000189',
    empresa:'EMPRESA FICTICIA',categoria:'Verificação',
    titulo:'VERIFICAR NECESSIDADE E-BEF',
    status:'ABERTA',responsavel:'EQUIPE',
  }],
};
const assets={
  html:'<!doctype html><meta http-equiv="Content-Security-Policy" content="connect-src \'none\'"><p>Painel LUCE</p>',
  script:"console.log('visualizacao sem dados')",
  style:'body{color:#123}',
};

test('servidor de painel usa somente loopback, URL secreta e sem cache',async()=>{
  const app=createLocalEbefDashboard({report:synthetic,...assets});
  const url=await app.listen();
  try{
    assert.match(url,/^http:\/\/127\.0\.0\.1:\d+\/session\/[a-f0-9]{64}\/$/);
    assert.equal(app.server.address().address,'127.0.0.1');
    const authorized=await fetch(url+'report');
    assert.equal(authorized.status,200);
    assert.equal(authorized.headers.get('access-control-allow-origin'),null);
    assert.equal(authorized.headers.get('cache-control'),'no-store, max-age=0');
    const data=await authorized.json();
    assert.equal(data.tasks.length,1);
    const page=await fetch(url);
    assert.equal(page.status,200);
    assert.match(await page.text(),/connect-src 'self'/);
    const denied=await fetch(url.replace(/\/session\/[a-f0-9]{64}\//,
      '/session/'+'b'.repeat(64)+'/')+'report');
    assert.equal(denied.status,404);
    const nonExisting=await fetch(url+'../../reports/arquivo.xlsx');
    assert.equal(nonExisting.status,404);
    const post=await fetch(url+'report',{method:'POST'});
    assert.equal(post.status,405);
  }finally{
    await app.close();
  }
});
test('nao inicia servidor se nao ha relatorio validado',()=>{
  assert.throws(()=>createLocalEbefDashboard({
    ...assets,report:{...synthetic,sync:true},
  }),/validado/);
  assert.throws(()=>createLocalEbefDashboard({
    ...assets,report:{...synthetic,tasks:[]},
  }),/validado/);
});
