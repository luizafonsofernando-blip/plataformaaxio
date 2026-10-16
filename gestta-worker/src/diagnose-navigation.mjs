// Diagnostico local, apenas leitura. Nao captura tela/HTML, nao baixa relatórios,
// nao grava dados do Gestta nem envia informações à Luce.
// Logs mostram apenas categorias de rota, presença de controles e contagens.
// Nunca exiba URLs completas (podem conter tokens ou identificadores internos).
import 'dotenv/config';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const target = process.env.GESTTA_REPORT_URL?.trim() || 'https://app.gestta.com.br/';
const configured = new URL(target);
if (configured.protocol !== 'https:' || configured.hostname !== 'app.gestta.com.br') {
  throw new Error('GESTTA_REPORT_URL deve utilizar https://app.gestta.com.br/.');
}

export function classifyPageUrl(rawUrl) {
  let url;
  try { url = new URL(rawUrl); }
  catch { return 'endereco_invalido'; }
  if (url.hostname !== 'app.gestta.com.br') return 'fora_do_gestta';
  const route = decodeURIComponent(url.pathname + url.hash).toLowerCase();
  if (/login|signin|auth|entrar/.test(route)) return 'login_ou_autenticacao';
  if (/sidebar\/task|task\/overview|task\/list/.test(route)) return 'tarefas';
  if (/dashboard/.test(route)) return 'dashboard';
  return 'outra_pagina_do_gestta';
}

async function readPage(page, number) {
  if (page.isClosed()) return;
  const view = classifyPageUrl(page.url());
  if (view === 'fora_do_gestta' || view === 'endereco_invalido') {
    console.log('Aba ' + number + ': tipo=' + view + ' (nao inspecionada).');
    return;
  }
  const count = async (locator) => {
    try { return await locator.count(); }
    catch { return 'indisponivel'; }
  };
  const visible = async (locator) => {
    try { return await locator.isVisible(); }
    catch { return false; }
  };
  const date = page.locator('#date-range');
  const noPrazo = page.getByText('No Prazo', { exact: true });
  const chart = page.getByText(/Tarefas\s+Abertas/i);
  const numericLinks = page.getByRole('link', { name: /^\d+$/ });
  const password = page.locator('input[type="password"]');
  console.log('Aba ' + number + ': ' +
    'tipo=' + view +
    '; calendario=' + (await visible(date) ? 'visivel' : (await count(date) ? 'oculto' : 'ausente')) +
    '; rotulos_No_Prazo=' + await count(noPrazo) +
    '; titulos_grafico=' + await count(chart) +
    '; links_numericos=' + await count(numericLinks) +
    '; campo_de_senha=' + (await count(password) ? 'sim' : 'nao') +
    '; frames=' + page.frames().length);
}

// O Gestta pode desenhar a Dashboard em um iframe; page.locator() nao
// pesquisa dentro de iframes. Verificar cada frame da pagina sem revelar sua URL.
function frameScope(frame) {
  const url = frame.url();
  if (url === 'about:blank') return 'interno_em_branco';
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'app.gestta.com.br' ||
        parsed.hostname.endsWith('.gestta.com.br')) return 'gestta';
    return 'externo_nao_inspecionado';
  } catch {
    return 'endereco_nao_inspecionado';
  }
}

async function readFrames(page) {
  const frames = page.frames();
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const scope = frameScope(frame);
    const label = '  Frame ' + (i + 1) + ' (' +
      (frame === page.mainFrame() ? 'principal' : 'incorporado') + '): ';
    if (scope !== 'gestta' && scope !== 'interno_em_branco') {
      console.log(label + 'origem=' + scope);
      continue;
    }
    const count = async locator => {
      try { return await locator.count(); }
      catch { return 'indisponivel'; }
    };
    const [dates, labels, titles, links] = await Promise.all([
      count(frame.locator('#date-range')),
      count(frame.getByText('No Prazo', { exact: true })),
      count(frame.getByText(/Tarefas\s+Abertas/i)),
      count(frame.getByRole('link', { name: /^\d+$/ })),
    ]);
    console.log(label + 'origem=' + scope + '; calendario=' + dates +
      '; rotulos_No_Prazo=' + labels +
      '; titulos_grafico=' + titles +
      '; links_numericos=' + links);
  }
}

export async function diagnose(context, label) {
  console.log('\n' + label + ': ' + context.pages().filter(p => !p.isClosed()).length + ' aba(s).');
  let index = 0;
  for (const page of context.pages()) {
    if (!page.isClosed()) {
      await readPage(page, ++index);
      await readFrames(page);
    }
  }
}

async function waitForHuman() {
  const rl = createInterface({ input, output });
  try {
    await rl.question(
      '\nOlhe a janela Chromium. Verifique se esta na Dashboard, login ou outra tela.\n' +
      'Se for possivel, navegue normalmente ate o quadro de tarefas (sem alterar tarefas).\n' +
      'Quando o calendario estiver visivel, volte aqui e pressione ENTER... '
    );
  } finally { rl.close(); }
}

const profile = resolve(process.cwd(), '.gestta-profile');
await mkdir(profile, {recursive:true, mode:0o700});
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    headless:false, acceptDownloads:false, viewport:{width:1366,height:860},
  });
  const page = context.pages()[0] || await context.newPage();
  await page.goto(configured.href, {waitUntil:'domcontentloaded',timeout:45000});
  console.log('Somente diagnostico, sem exportacao, escrita ou transmissao.');
  await page.waitForTimeout(8000);
  await diagnose(context, 'Apos abrir o Gestta e aguardar 8 segundos');
  await waitForHuman();
  await diagnose(context, 'Apos sua navegacao manual');
} catch (error) {
  console.error('Diagnostico interrompido: ' + error.message);
  process.exitCode = 1;
} finally {
  if (context) await context.close();
}
