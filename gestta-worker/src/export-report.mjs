import { chromium } from 'playwright';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { brazilRange } from './month-windows.mjs';

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
  // Cookies locais do Gestta permanecem exclusivamente nesta maquina.
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

function requiredSelector(name) {
  const val = process.env[name]?.trim();
  if (!val) throw new Error('Automação mensal não calibrada: configure ' + name + ' no .env.');
  return val;
}
function normalizedText(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

async function applyAndVerifyWindow(page, window) {
  // Seletores devem ser obtidos no Gestta autenticado e conferidos localmente.
  const dateSelector = requiredSelector('GESTTA_DATE_RANGE_SELECTOR');
  const applySelector = requiredSelector('GESTTA_FILTER_APPLY_SELECTOR');
  const clientSelector = requiredSelector('GESTTA_CLIENTS_ALL_SELECTOR');
  const userSelector = requiredSelector('GESTTA_USERS_ALL_SELECTOR');
  const dateModeSelector = requiredSelector('GESTTA_DATE_MODE_SELECTOR');
  const taskSelectorsRaw = requiredSelector('GESTTA_TASK_CHECKBOX_SELECTORS');
  let taskSelectors;
  try { taskSelectors = JSON.parse(taskSelectorsRaw); }
  catch { throw new Error('GESTTA_TASK_CHECKBOX_SELECTORS deve ser JSON de tres seletores CSS.'); }
  if (!Array.isArray(taskSelectors) || taskSelectors.length !== 3 ||
      taskSelectors.some(value => typeof value !== 'string' || !value.trim())) {
    throw new Error('Configure exatamente tres seletores de tarefas E-BEF.');
  }
  const desired = brazilRange(window);
  const dateInput = page.locator(dateSelector).first();
  await dateInput.fill(desired, { timeout: 10000 });
  // Se for date-picker custom ou readonly, a rotina falha; nao forcar clicks cegos.
  await page.locator(applySelector).click({ timeout: 10000 });
  await page.waitForTimeout(1200);
  const applied = (await dateInput.inputValue()).replace(/\s/g, '');
  if (applied !== desired.replace(/\s/g, '')) {
    throw new Error('Intervalo exibido não coincide com o solicitado (' + desired + ').');
  }
  if (!/TODOS.*CLIENTES/.test(normalizedText(await page.locator(clientSelector).first().innerText()))) {
    throw new Error('Filtro de clientes não está em Todos os clientes.');
  }
  if (!/TODOS.*USUARIOS/.test(normalizedText(await page.locator(userSelector).first().innerText()))) {
    throw new Error('Filtro de usuários não está em Todos os usuários.');
  }
  if (!/DATA META/.test(normalizedText(await page.locator(dateModeSelector).first().innerText()))) {
    throw new Error('Modo de exibição não está em Data Meta.');
  }
  for (const css of taskSelectors) {
    const locator = page.locator(css);
    if (await locator.count() !== 1 || !(await locator.isChecked())) {
      throw new Error('Uma das três tarefas E-BEF não está selecionada. Recalibre os seletores.');
    }
  }
}

export async function exportReport({ auto = false, window } = {}) {
  const reportUrl = process.env.GESTTA_REPORT_URL?.trim();
  if (auto && !window) throw new Error('--auto exige janela de datas para validar filtros.');
  if (auto) requiredSelector('GESTTA_EXPORT_SELECTOR');
  const folder = await mkdtemp(join(tmpdir(), 'luce-ebef-'));
  let context;
  try {
    ({ context } = await startBrowser());
    const page = context.pages()[0] || await context.newPage();
    await page.goto(checkUrl(reportUrl || DEFAULT_DASHBOARD), { waitUntil: 'domcontentloaded' });
    const configured = Number(process.env.GESTTA_DOWNLOAD_TIMEOUT_MS || 120000);
    const timeout = Number.isFinite(configured) ? Math.min(Math.max(configured, 10000), 600000) : 120000;
    console.log('\nRelatório desejado: ' + (window ? brazilRange(window) : 'período configurado manualmente'));
    if (!auto) {
      console.log('Confirme: tres tarefas E-BEF (declaracao e as duas verificacoes), todos os clientes, todos os usuarios, Data Meta.');
      console.log('Selecione o periodo indicado e clique em exportar XLSX na janela. O robô aguardará o download.');
    } else {
      await applyAndVerifyWindow(page, window);
    }
    const downloadPromise = page.waitForEvent('download', { timeout });
    if (auto) await page.locator(requiredSelector('GESTTA_EXPORT_SELECTOR')).click({ timeout: 30000 });
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
  } finally { if (context) await context.close(); }
}
