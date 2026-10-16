// Inspecao assistida SOMENTE dos filtros avancados Gestta.
// Abre a tela de tarefas e seleciona as 3 tarefas E-BEF (apenas filtros
// visuais, sem modificar tarefas, baixar arquivos ou enviar dados).
import 'dotenv/config';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ensureTasksView } from './task-navigation.mjs';
import { selectEbefTasks } from './task-filter.mjs';

process.env.PWDEBUG = '1';
const { chromium } = await import('playwright');

const target = process.env.GESTTA_REPORT_URL?.trim() || 'https://app.gestta.com.br/';
const u = new URL(target);
if (u.protocol !== 'https:' || u.hostname !== 'app.gestta.com.br') {
  throw new Error('Apenas https://app.gestta.com.br/ pode ser aberto.');
}
const profile = resolve(process.cwd(), '.gestta-profile');
await mkdir(profile, { recursive: true, mode: 0o700 });
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    headless: false,
    acceptDownloads: false,
    viewport: { width: 1366, height: 860 },
  });
  const first = context.pages()[0] || await context.newPage();
  await first.goto(u.href, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const page = await ensureTasksView(context);
  const result = await selectEbefTasks(page);
  if (result.selected !== 3) throw new Error('Tres tarefas E-BEF nao confirmadas.');
  console.log('TAREFAS E-BEF SELECIONADAS E VERIFICADAS: 3/3');
  console.log('Inspector pausado para inspecionar filtros avancados (SEM EXPORTAR).');
  console.log('Use Pick Locator no botao do FUNIL de filtros avancados no topo.');
  console.log('Depois inspecione os checkboxes de Aberta, Concluida, Impedimento e Desconsiderada.');
  console.log('Nao clique em concluir/descartar tarefas. Nao envie dados de clientes.');
  await page.pause();
} catch (error) {
  console.error('INSPECAO AVANCADA NAO INICIADA: ' + error.message);
  process.exitCode = 1;
} finally {
  if (context) await context.close();
}
