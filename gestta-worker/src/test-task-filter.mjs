// Teste local assistido, sem download nem envio à Luce.
// Altera APENAS o filtro visual de tarefas para selecionar as três opções E-BEF.
import 'dotenv/config';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ensureTasksView } from './task-navigation.mjs';
import { selectEbefTasks } from './task-filter.mjs';

const configured = process.env.GESTTA_REPORT_URL?.trim() || 'https://app.gestta.com.br/';
const target = new URL(configured);
if (target.protocol !== 'https:' || target.hostname !== 'app.gestta.com.br') {
  throw new Error('Somente o Gestta autorizado pode ser acessado.');
}

const profile = resolve(process.cwd(), '.gestta-profile');
await mkdir(profile, {recursive:true, mode:0o700});
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    headless:false, acceptDownloads:false, viewport:{width:1366,height:860},
  });
  const first=context.pages()[0] || await context.newPage();
  await first.goto(target.href,{waitUntil:'domcontentloaded',timeout:45000});
  const page=await ensureTasksView(context);
  console.log('Luce E-BEF | teste apenas dos filtros (sem exportacao).');
  console.log('Pesquisando bef no dropdown de tarefas; rolando e validando tres itens...');
  const result=await selectEbefTasks(page);
  console.log('TAREFAS E-BEF SELECIONADAS E VERIFICADAS: '+result.selected+'/3');
  console.log('Nenhum download, transmissao à Luce ou alteracao de tarefas realizada.');
} catch(error) {
  console.error('FALHA NA SELECAO DAS TAREFAS E-BEF: '+error.message);
  process.exitCode=1;
} finally {
  if(context) await context.close();
}
