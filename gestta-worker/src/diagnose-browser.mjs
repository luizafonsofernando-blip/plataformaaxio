// Diagnóstico do Chromium para o RPA Gestta. Não exige nenhuma interação
// manual no Gestta; não faz screenshot, download, exportação ou envio de dados.
// Somente interage com os filtros visuais de tarefas E-BEF já homologados.
import 'dotenv/config';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ensureTasksView } from './task-navigation.mjs';
import { selectEbefTasks } from './task-filter.mjs';

const target = new URL(process.env.GESTTA_REPORT_URL?.trim() || 'https://app.gestta.com.br/');
if (target.protocol !== 'https:' || target.hostname !== 'app.gestta.com.br') {
  throw new Error('Somente o Gestta autorizado pode ser acessado.');
}
const profile = resolve(process.cwd(), '.gestta-profile');
await mkdir(profile, { recursive:true, mode:0o700 });

async function probe(page, stage) {
  const start = Date.now();
  const deadlineMs = 6500;
  let timeout;
  const timeoutPromise = new Promise(resolve => {
    timeout = setTimeout(() => resolve({error:'sem_resposta_em_6s'}), deadlineMs);
  });
  try {
    const read = page.evaluate(() => ({
      readyState: document.readyState,
      visibility: document.visibilityState,
      hasFocus: document.hasFocus(),
      calendarElements: document.querySelectorAll('#date-range').length,
    })).then(value => ({ok:true, ...value}), error => ({error:error.name||'falha_na_leitura'}));
    const result = await Promise.race([read,timeoutPromise]);
    const elapsed = Date.now() - start;
    console.log('BROWSER_'+stage+': ' + JSON.stringify({ ...result, elapsedMs:elapsed }));
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

let context;
try {
  console.log('Teste somente de responsividade do Chromium (sem exportacao).');
  const args=process.env.GESTTA_DISABLE_GPU==='1' ? ['--disable-gpu'] : [];
  console.log('Modo_grafico='+(args.length?'gpu_desativada':'padrao'));
  context=await chromium.launchPersistentContext(profile,{
    headless:false,acceptDownloads:false,viewport:{width:1366,height:860},
    args,
  });
  const first=context.pages()[0]||await context.newPage();
  await first.goto(target.href,{waitUntil:'domcontentloaded',timeout:45000});
  const page=await ensureTasksView(context);
  const selected=await selectEbefTasks(page);
  if(selected.selected!==3)throw new Error('As tres tarefas nao foram confirmadas.');
  console.log('TAREFAS E-BEF SELECIONADAS E VERIFICADAS: 3/3');
  await page.bringToFront();
  console.log('Chromium trazido para frente; verificando resposta da pagina...');
  const before = await probe(page,'ANTES');
  if (before.error) throw new Error('Pagina nao responde apos selecao de tarefas: '+before.error);
  await page.waitForTimeout(8000);
  const after = await probe(page,'DEPOIS_8S');
  if (after.error) throw new Error('Pagina deixou de responder apos aguardar: '+after.error);
  console.log('Diagnostico concluido. Nenhum relatorio baixado ou transmitido.');
} catch (error) {
  console.error('DIAGNOSTICO CHROMIUM: ' + error.message);
  process.exitCode=1;
} finally {
  if(context) {
    try {
      await Promise.race([
        context.close(),
        new Promise(resolve => setTimeout(resolve,8000)),
      ]);
    } catch {
      console.error('O Chromium nao encerrou normalmente; feche somente a janela de teste.');
    }
  }
}
