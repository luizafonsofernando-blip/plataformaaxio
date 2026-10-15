import { chromium } from 'playwright';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const ROOT = resolve(process.cwd(), '.gestta-profile');
const DEFAULT_DASHBOARD = 'https://app.gestta.com.br/';

function checkUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'app.gestta.com.br') {
    throw new Error('A URL deve pertencer a https://app.gestta.com.br/.');
  }
  return url.href;
}

async function waitForEnter(message) {
  const rl = createInterface({ input, output });
  try { await rl.question(message + '\nPressione Enter para continuar... '); }
  finally { rl.close(); }
}

async function startBrowser() {
  await mkdir(ROOT, { recursive: true, mode: 0o700 });
  // Cookies de autenticação ficam no navegador local e nunca são enviados à Luce.
  const context = await chromium.launchPersistentContext(ROOT, {
    headless: false, acceptDownloads: true, viewport: { width: 1366, height: 860 },
  });
  const page = context.pages()[0] || await context.newPage();
  return { context, page };
}

export async function setupLogin() {
  const { context, page } = await startBrowser();
  try {
    await page.goto(DEFAULT_DASHBOARD, { waitUntil: 'domcontentloaded' });
    console.log('Faça login normalmente no Gestta, inclusive MFA, caso solicitado.');
    await waitForEnter('Depois de confirmar o login, retorne a este terminal.');
    console.log('Sessão salva exclusivamente no perfil local.');
  } finally { await context.close(); }
}

export async function exportReport({ auto = false } = {}) {
  const reportUrl = process.env.GESTTA_REPORT_URL?.trim();
  const selector = process.env.GESTTA_EXPORT_SELECTOR?.trim();
  if (auto && (!reportUrl || !selector)) {
    throw new Error('Para --auto configure GESTTA_REPORT_URL e GESTTA_EXPORT_SELECTOR após calibrar o Gestta.');
  }
  const folder = await mkdtemp(join(tmpdir(), 'luce-ebef-'));
  const { context, page } = await startBrowser();
  try {
    await page.goto(checkUrl(reportUrl || DEFAULT_DASHBOARD), { waitUntil: 'domcontentloaded' });
    const configured = Number(process.env.GESTTA_DOWNLOAD_TIMEOUT_MS || 120000);
    const timeout = Number.isFinite(configured) ? Math.min(Math.max(configured, 10000), 600000) : 120000;
    const downloadPromise = page.waitForEvent('download', { timeout });
    if (auto) {
      await page.locator(selector).click({ timeout: 30000 });
    } else {
      console.log('No Gestta, selecione SOMENTE as tarefas E-BEF da competência desejada e exporte XLSX.');
      console.log('O robô apenas aguardará o download. Não é necessário pressionar Enter.');
    }
    const download = await downloadPromise;
    if (!/\.xlsx$/i.test(download.suggestedFilename())) {
      throw new Error('Formato de exportação não suportado. Utilize XLSX.');
    }
    const filepath = join(folder, 'gestta-export.xlsx');
    await download.saveAs(filepath);
    return { filepath, folder };
  } catch (error) {
    await rm(folder, { recursive: true, force: true });
    throw error;
  } finally { await context.close(); }
}
