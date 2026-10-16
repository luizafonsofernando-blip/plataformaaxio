// Teste de UM período mensal do Gestta. Somente altera o filtro visual de datas.
// Sem Inspector, sem navegação manual, sem clicar Filtrar,
// sem download XLSX, sem alteração de tarefas e sem comunicação à Luce.
import 'dotenv/config';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ensureTasksView } from './task-navigation.mjs';
import { selectEbefTasks } from './task-filter.mjs';
import { DATE_SELECTORS, applyDateWindow, readControlText } from './date-picker.mjs';
import { parsePeriodTestOptions } from './period-test-options.mjs';
import { withDeadline } from './timeout-utils.mjs';

// Validar argumentos ANTES de abrir o navegador.
const {window,expected}=parsePeriodTestOptions(process.argv.slice(2));
const target=new URL(process.env.GESTTA_REPORT_URL?.trim()||'https://app.gestta.com.br/');
if(target.protocol!=='https:' || target.hostname!=='app.gestta.com.br'){
  throw new Error('Somente o Gestta autorizado pode ser consultado.');
}
const profile=resolve(process.cwd(),'.gestta-profile');
await mkdir(profile,{recursive:true,mode:0o700});
const rangeCss=process.env.GESTTA_DATE_RANGE_SELECTOR?.trim()||DATE_SELECTORS.range;
let context;
try {
  console.log('PERIODO: teste do calendario em segundo plano, sem XLSX ou sincronizacao.');
  console.log('PERIODO: solicitado='+expected);
  context=await chromium.launchPersistentContext(profile,{
    headless:true,acceptDownloads:false,viewport:{width:1366,height:860},
  });
  const first=context.pages()[0]||await context.newPage();
  await first.goto(target.href,{waitUntil:'domcontentloaded',timeout:45000});
  const page=await ensureTasksView(context);
  const tasks=await selectEbefTasks(page);
  if(tasks.selected!==3)throw new Error('Selecao de tarefas E-BEF não confirmou 3/3.');
  console.log('PERIODO: tarefas E-BEF=3/3');

  const range=page.locator(rangeCss);
  if(await range.count()!==1 || !(await range.isVisible())){
    throw new Error('Campo de periodo ausente, ambiguo ou oculto.');
  }
  const before=(await readControlText(range)).trim();
  if(!/^\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}$/.test(before)){
    throw new Error('Periodo inicialmente exibido nao reconhecido.');
  }
  console.log('PERIODO: antes='+before);
  const canonical=text=>String(text).replace(/\s/g,'');
  if(canonical(before)!==canonical(expected)){
    console.log('PERIODO: configurando datas no calendario...');
    const result=await applyDateWindow(page,window);
    if(canonical(result.applied)!==canonical(expected)){
      throw new Error('Campo nao confirmou periodo solicitado após Aplicar.');
    }
  } else {
    console.log('PERIODO: periodo solicitado ja estava selecionado.');
  }
  const after=(await readControlText(range)).trim();
  if(canonical(after)!==canonical(expected)){
    throw new Error('Periodo final diferente do solicitado. Teste nao homologado.');
  }
  console.log('PERIODO: depois='+after);
  console.log('PERIODO: SUCESSO SEM FILTRAR, SEM DOWNLOAD, SEM XLSX E SEM SINCRONIZACAO.');
} catch(error){
  // Mensagem apenas com dados estruturais. Não imprimir URL, nomes de clientes,
  // credenciais, screenshots ou arquivos de sessão.
  console.error('FALHA NO TESTE DE PERIODO: '+error.message);
  process.exitCode=1;
} finally {
  if(context){
    try{await withDeadline('Fechamento do Chromium',()=>context.close(),8000);}
    catch{console.error('Chromium de teste demorou a fechar; encerre somente essa instancia.');}
  }
}
