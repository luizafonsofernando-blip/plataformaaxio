// Diagnostico curto do ponto de entrada do Gestta, sem login automatizado,
// screenshot, Inspector, clique, selecao de filtros, download ou transmissao.
import 'dotenv/config';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { inspectEntry, classifyEntryUrl } from './entry-diagnostics.mjs';
import { withDeadline } from './timeout-utils.mjs';

const url=new URL(process.env.GESTTA_REPORT_URL?.trim()||'https://app.gestta.com.br/');
if(url.protocol!=='https:' || url.hostname!=='app.gestta.com.br'){
  throw new Error('Apenas o endereco autorizado do Gestta pode ser acessado.');
}
const profile=resolve(process.cwd(),'.gestta-profile');
await mkdir(profile,{recursive:true,mode:0o700});
let context;
async function snapshot(page,label) {
  const route=classifyEntryUrl(page.url());
  if(route==='fora_do_gestta' || route==='endereco_indisponivel'){
    console.log(label+': '+JSON.stringify({rota:route,diagnostico:'possivel_redirecionamento_de_autenticacao'}));
    return {rota:route};
  }
  const state=await withDeadline('Inspecao da entrada',
    ()=>inspectEntry(page),10000);
  console.log(label+': '+JSON.stringify(state));
  return state;
}
try{
  console.log('Diagnostico do carregamento inicial SEM Inspector e SEM clique.');
  context=await chromium.launchPersistentContext(profile,{
    headless:true,acceptDownloads:false,viewport:{width:1366,height:860},
  });
  const page=context.pages()[0]||await context.newPage();
  await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForTimeout(8000);
  const first=await snapshot(page,'ENTRADA_8S');
  if(first.diagnostico==='tarefas_carregadas' ||
     first.diagnostico==='menu_tarefas_disponivel' ||
     first.diagnostico==='autenticacao_possivelmente_necessaria' ||
     first.rota==='fora_do_gestta') {
    console.log('ENTRADA: diagnóstico realizado; nenhum controle foi acionado.');
  }else{
    await page.waitForTimeout(6000);
    await snapshot(page,'ENTRADA_14S');
    console.log('ENTRADA: diagnostico concluido, sem operacoes no Gestta.');
  }
}catch(error){
  console.error('FALHA DIAGNOSTICO ENTRADA: '+error.message);
  process.exitCode=1;
}finally{
  if(context){
    try{await withDeadline('Encerrar navegador',()=>context.close(),8000);}
    catch{console.error('Navegador de teste demorou para encerrar.');}
  }
}
