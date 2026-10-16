// Diagnóstico do filtro "Todos usuários" no Gestta.
// Não clica no botão Exportar nem aciona Filtrar; não permite download,
// não imprime texto livre de clientes, usuários ou HTML da página.
import 'dotenv/config';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {ensureTasksView} from './task-navigation.mjs';
import {selectEbefTasks} from './task-filter.mjs';
import {inspectGlobalFilters} from './global-filters-diagnostic.mjs';
import {withDeadline} from './timeout-utils.mjs';

const target=new URL(process.env.GESTTA_REPORT_URL?.trim()||'https://app.gestta.com.br/');
if(target.protocol!=='https:'||target.hostname!=='app.gestta.com.br'){
  throw new Error('Diagnostico restrito ao dominio autorizado do Gestta.');
}
const profile=resolve(process.cwd(),'.gestta-profile');
await mkdir(profile,{recursive:true,mode:0o700});
let context;
try{
  console.log('GLOBAIS: DIAGNOSTICO SEM DOWNLOAD, SEM FILTRAR E SEM SINCRONIZAR.');
  context=await chromium.launchPersistentContext(profile,{
    headless:true,acceptDownloads:false,viewport:{width:1366,height:860},
  });
  const page=context.pages()[0]||await context.newPage();
  await page.goto(target.href,{waitUntil:'domcontentloaded',timeout:45000});
  const tasksPage=await ensureTasksView(context);
  const result=await selectEbefTasks(tasksPage);
  if(result.selected!==3)throw new Error('As tres tarefas E-BEF nao foram confirmadas.');
  await tasksPage.waitForTimeout(600);
  console.log('GLOBAIS: tarefas E-BEF=3/3.');
  const info=await withDeadline('Leitura da barra de filtros',
    ()=>inspectGlobalFilters(tasksPage),20000);
  console.log('GLOBAL_FILTERS: '+JSON.stringify(info));
  console.log('GLOBAIS: nenhuma exportacao, download ou sincronizacao realizada.');
}catch(error){
  // Evitar texto de página ou URLs sensíveis em erros de Playwright.
  console.error('FALHA DIAGNOSTICO GLOBAIS: etapa nao concluida; verifique sessao e barra superior do Gestta.');
  process.exitCode=1;
}finally{
  if(context){
    try{await withDeadline('Fechar Chromium',()=>context.close(),8000);}
    catch{console.error('Chromium demorou a fechar; encerre somente esta instancia.');}
  }
}
