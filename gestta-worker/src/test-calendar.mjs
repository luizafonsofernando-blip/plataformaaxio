// Teste local do date-picker Gestta. Altera APENAS o filtro visual, sem download,
// chamadas à API Luce, gravação em banco ou modificação de tarefas.
import 'dotenv/config';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { applyDateWindow, validateDateWindow } from './date-picker.mjs';

const params = Object.fromEntries(
  process.argv.slice(2).filter(s => s.startsWith('--') && s.includes('='))
    .map(s => { const pos = s.indexOf('='); return [s.slice(2,pos),s.slice(pos + 1)]; })
);
const window = {start: params.start, end: params.end};
validateDateWindow(window);
const rawUrl = process.env.GESTTA_REPORT_URL?.trim();
if (!rawUrl) throw new Error('Configure GESTTA_REPORT_URL no .env com a URL da tela de tarefas Gestta.');
const url = new URL(rawUrl);
if (url.protocol !== 'https:' || url.hostname !== 'app.gestta.com.br') {
  throw new Error('GESTTA_REPORT_URL precisa pertencer a https://app.gestta.com.br/.');
}

const profile = resolve(process.cwd(), '.gestta-profile');
await mkdir(profile, {recursive:true,mode:0o700});
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    headless:false, acceptDownloads:false,
    viewport:{width:1366,height:860},
  });
  const page = context.pages()[0] || await context.newPage();
  await page.goto(url.href, {waitUntil:'domcontentloaded'});
  console.log('Teste local: apenas configuração do calendário; sem download nem envio de dados.');
  const result = await applyDateWindow(page,window);
  console.log('PERIODO VALIDADO NO GESTTA: ' + result.applied);
  console.log('Teste concluído. Nenhuma informação foi transmitida à Luce.');
} catch (error) {
  console.error('FALHA NO TESTE DE CALENDARIO: ' + error.message);
  process.exitCode = 1;
} finally {
  if (context) await context.close();
}
