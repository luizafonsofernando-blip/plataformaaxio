// Identifica SOMENTE a posição estrutural do comando Exportar.
// Não aciona exportação, não habilita downloads nem transmite dados.
// Operação protegida pelo perfil de navegador local autenticado.
import 'dotenv/config';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ensureTasksView } from './task-navigation.mjs';
import { inspectExportControl } from './export-control-diagnostic.mjs';
import { withDeadline } from './timeout-utils.mjs';

const target=new URL(process.env.GESTTA_REPORT_URL?.trim()||'https://app.gestta.com.br/');
if(target.protocol!=='https:'||target.hostname!=='app.gestta.com.br'){
  throw new Error('Apenas o dominio autorizado do Gestta pode ser consultado.');
}
const profile=resolve(process.cwd(),'.gestta-profile');
await mkdir(profile,{recursive:true,mode:0o700});
let context;
try{
  console.log('EXPORTAR: diagnostico SEM DOWNLOAD, SEM XLSX E SEM TRANSMISSAO.');
  context=await chromium.launchPersistentContext(profile,{
    headless:true,acceptDownloads:false,viewport:{width:1366,height:860},
  });
  const first=context.pages()[0]||await context.newPage();
  await first.goto(target.href,{waitUntil:'domcontentloaded',timeout:45000});
  const page=await ensureTasksView(context);
  await page.waitForTimeout(2500);
  const result=await withDeadline('Inspecao de botao Exportar',
    ()=>inspectExportControl(page),15000);
  console.log('EXPORT_CONTROL: '+JSON.stringify(result));
  console.log(result.exportClassAndIconConfirmed
    ? 'EXPORTAR: controle estrutural unico identificado; NENHUM clique realizado.'
    : 'EXPORTAR: controle ainda nao confirmado; NENHUM clique realizado.');
}catch(error){
  console.error('FALHA DIAGNOSTICO EXPORTAR: '+error.message);
  process.exitCode=1;
}finally{
  if(context){
    try{await withDeadline('Fechar Chromium',()=>context.close(),8000);}
    catch{console.error('Instancia de teste demorou a encerrar.');}
  }
}
