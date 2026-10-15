// Teste local do calendário do Gestta; leitura e alteracao APENAS do filtro visual.
// Não baixa XLSX, não envia dados nem altera tarefas.
// Se o SPA redirecionar para outra página, permite navegação manual assistida.
import 'dotenv/config';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { applyDateWindow, validateDateWindow, DATE_SELECTORS } from './date-picker.mjs';

const params = Object.fromEntries(
  process.argv.slice(2).filter(s => s.startsWith('--') && s.includes('='))
    .map(s => { const i = s.indexOf('='); return [s.slice(2, i), s.slice(i + 1)]; })
);
const window = { start: params.start, end: params.end };
validateDateWindow(window);
const rawUrl = process.env.GESTTA_REPORT_URL?.trim();
if (!rawUrl) throw new Error('GESTTA_REPORT_URL deve apontar para a página de tarefas no Gestta.');
const url = new URL(rawUrl);
if (url.protocol !== 'https:' || url.hostname !== 'app.gestta.com.br') {
  throw new Error('GESTTA_REPORT_URL precisa pertencer a https://app.gestta.com.br/.');
}
if (!url.hash.startsWith('#/sidebar/task/')) {
  throw new Error('A URL configurada não contém a rota de tarefas do Gestta. ' +
    'Como o endereço usa #, coloque a URL inteira ENTRE ASPAS DUPLAS no arquivo .env, ' +
    'por exemplo: GESTTA_REPORT_URL="https://app.gestta.com.br/#/sidebar/task/overview/dashboard/..."');
}

const profile = resolve(process.cwd(), '.gestta-profile');
await mkdir(profile, { recursive: true, mode: 0o700 });
const dateCss = process.env.GESTTA_DATE_RANGE_SELECTOR?.trim() || DATE_SELECTORS.range;
async function findTaskPage(context) {
  for (const candidate of context.pages()) {
    try {
      if (!candidate.isClosed() && await candidate.locator(dateCss).isVisible({ timeout: 1500 })) return candidate;
    } catch (_) { /* continua buscando outras abas */ }
  }
  return null;
}
async function askUserToNavigate() {
  const rl = createInterface({ input, output });
  try {
    await rl.question(
      '\nO Gestta não abriu diretamente a tela de tarefas.\n' +
      'Na janela Chromium, navegue MANUALMENTE para o quadro de tarefas E-BEF,\n' +
      'até aparecer o filtro de datas no topo.\n' +
      'Volte ao PowerShell e pressione ENTER para continuar... '
    );
  } finally { rl.close(); }
}

let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    headless: false, acceptDownloads: false, viewport: { width: 1366, height: 860 },
  });
  const first = context.pages()[0] || await context.newPage();
  console.log('Teste somente do calendário; nenhuma tarefa será alterada, nenhum dado enviado.');
  await first.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 45000 });
  let page = await findTaskPage(context);
  if (!page) {
    console.log('Campo de datas ainda não visível. Isso pode ocorrer se o Gestta redirecionar para o painel inicial.');
    await askUserToNavigate();
    page = await findTaskPage(context);
  }
  if (!page) {
    throw new Error('O campo #date-range continua ausente após a navegação manual. ' +
      'Confirme que você abriu a visão de tarefas, e não o painel inicial.');
  }
  console.log('Campo de período localizado na página de tarefas.');
  const result = await applyDateWindow(page, window);
  console.log('PERIODO VALIDADO NO GESTTA: ' + result.applied);
  console.log('Teste concluído sem download, envio de dados ou alteração de tarefas.');
} catch (error) {
  console.error('FALHA NO TESTE DE CALENDARIO: ' + error.message);
  process.exitCode = 1;
} finally {
  if (context) await context.close();
}
