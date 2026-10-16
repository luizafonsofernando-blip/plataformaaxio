import { chromium } from 'playwright';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { brazilRange } from './month-windows.mjs';
import { ADVANCED_TASK_TYPES, parseRequiredSelectorMap, assertSelectedDepartmentNames } from './advanced-filter-config.mjs';
import { ensureAllAdvancedStatuses } from './advanced-status-locators.mjs';
import { clickAdvancedApplyButton } from './advanced-action-locators.mjs';
import { applyDateWindow, readControlText } from './date-picker.mjs';
import { ensureTasksView } from './task-navigation.mjs';
import { selectEbefTasks } from './task-filter.mjs';

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

// Ajusta apenas filtros da interface (nao altera tarefas ou dados do Gestta).
// Falha se os seletores nao forem unicos/compativeis com checkbox nativo ou
// se a lista de departamentos nao coincidir com o escopo validado em homologacao.
async function applyAndVerifyAdvancedFilters(page) {
  const openSelector = requiredSelector('GESTTA_ADVANCED_OPEN_SELECTOR');
  const applySelector = process.env.GESTTA_ADVANCED_APPLY_SELECTOR?.trim();
  const departmentSelector = requiredSelector('GESTTA_ADVANCED_DEPARTMENT_SELECTOR');
  const selectAllDepartmentsSelector = requiredSelector('GESTTA_ADVANCED_DEPARTMENT_SELECT_ALL_SELECTOR');
  // Cada item deve conter nome de departamento e UM checkbox de selecao.
  const departmentRowSelector = requiredSelector('GESTTA_ADVANCED_DEPARTMENT_ROW_SELECTOR');
  const departmentRowCheckboxSelector = requiredSelector('GESTTA_ADVANCED_DEPARTMENT_ROW_CHECKBOX_SELECTOR');
  const kinds = parseRequiredSelectorMap(
    requiredSelector('GESTTA_ADVANCED_TASK_TYPE_SELECTORS'), ADVANCED_TASK_TYPES,
    'GESTTA_ADVANCED_TASK_TYPE_SELECTORS'
  );
  await page.locator(openSelector).click({ timeout: 10000 });
  // Quatro status identificados pelo Inspector com getByRole('checkbox'),
  // sem depender de CSS posicional ou de glifos de ícones.
  await ensureAllAdvancedStatuses(page);
  for (const [name, css] of Object.entries(kinds)) {
    const checkbox = page.locator(css);
    if (await checkbox.count() !== 1) {
      throw new Error('Filtro avançado "' + name + '" não localizado de forma única.');
    }
    await checkbox.check({ timeout: 10000 });
    if (!(await checkbox.isChecked())) {
      throw new Error('Filtro avançado "' + name + '" não permaneceu marcado.');
    }
  }
  const department = page.locator(departmentSelector);
  if (await department.count() !== 1) {
    throw new Error('Campo Departamento não localizado de forma única.');
  }
  await department.click({ timeout: 10000 });
  const selectAll = page.locator(selectAllDepartmentsSelector);
  if (await selectAll.count() !== 1) {
    throw new Error('Ação Selecionar todos do departamento não localizada de forma única.');
  }
  await selectAll.click({ timeout: 10000 });
  const rows = page.locator(departmentRowSelector);
  const count = await rows.count();
  const records = [];
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const checkbox = row.locator(departmentRowCheckboxSelector);
    if (await checkbox.count() !== 1) {
      throw new Error('Item de departamento sem checkbox unico. Recalibre o seletor da linha.');
    }
    records.push({
      name: (await row.innerText()).trim(),
      checked: await checkbox.isChecked(),
    });
  }
  // Falha se houver omissao, renomeacao, repeticao, virtualizacao ou departamento desmarcado.
  assertSelectedDepartmentNames(records);
  await clickAdvancedApplyButton(page, applySelector);
  await page.waitForTimeout(1200);
}

async function applyAndVerifyWindow(page, window) {
  const clientSelector = requiredSelector('GESTTA_CLIENTS_ALL_SELECTOR');
  const userSelector = requiredSelector('GESTTA_USERS_ALL_SELECTOR');
  const dateModeSelector = requiredSelector('GESTTA_DATE_MODE_SELECTOR');
  // Localizadores semanticos confirmados pelo Inspector; CSS opcional apenas
  // para nova calibracao se a plataforma mudar.
  const searchCss = process.env.GESTTA_TASK_SEARCH_SELECTOR?.trim();
  const rowCss = process.env.GESTTA_TASK_RESULT_ROW_SELECTOR?.trim();
  const checkboxCss = process.env.GESTTA_TASK_ROW_CHECKBOX_SELECTOR?.trim();
  await applyDateWindow(page, window);
  if (!/TODOS.*CLIENTES/.test(normalizedText(await page.locator(clientSelector).first().innerText()))) {
    throw new Error('Filtro de clientes não está em Todos os clientes.');
  }
  if (!/TODOS.*USUARIOS/.test(normalizedText(await page.locator(userSelector).first().innerText()))) {
    throw new Error('Filtro de usuários não está em Todos os usuários.');
  }
  if (!/DATA META/.test(normalizedText(await page.locator(dateModeSelector).first().innerText()))) {
    throw new Error('Modo de exibição não está em Data Meta.');
  }
  // Buscar 'bef', validar 3 opções e selecioná-las SOMENTE se nenhuma tarefa
  // estiver previamente selecionada (rótulo Todas as tarefas).
  await selectEbefTasks(page, { searchCss, rowCss, checkboxCss });
}

export async function exportReport({ auto = false, window } = {}) {
  const reportUrl = process.env.GESTTA_REPORT_URL?.trim();
  if (auto && !window) throw new Error('--auto exige janela de datas para validar filtros.');
  // A entrada pela Dashboard é normal. ensureTasksView() abrirá Tarefas pelo menu.
  if (reportUrl) checkUrl(reportUrl);
  if (auto) requiredSelector('GESTTA_EXPORT_SELECTOR');
  const folder = await mkdtemp(join(tmpdir(), 'luce-ebef-'));
  let context;
  try {
    ({ context } = await startBrowser());
    const initialPage = context.pages()[0] || await context.newPage();
    // O Gestta inicia na Dashboard. Primeiro abre a plataforma, depois clica em Tarefas.
    await initialPage.goto(checkUrl(reportUrl || DEFAULT_DASHBOARD), { waitUntil: 'domcontentloaded' });
    const page = await ensureTasksView(context, {
      selector: process.env.GESTTA_DATE_RANGE_SELECTOR?.trim() || '#date-range',
    });
    const configured = Number(process.env.GESTTA_DOWNLOAD_TIMEOUT_MS || 120000);
    const timeout = Number.isFinite(configured) ? Math.min(Math.max(configured, 10000), 600000) : 120000;
    console.log('\nRelatório desejado: ' + (window ? brazilRange(window) : 'período configurado manualmente'));
    if (!auto) {
      console.log('Confirme: 3 tarefas E-BEF; 4 status (Aberta, Concluída, Impedimento, Desconsiderada); 3 tipos de tarefa e escopo de departamentos; todos clientes/usuários; Data Meta.');
      console.log('Selecione o periodo indicado e clique em exportar XLSX na janela. O robô aguardará o download.');
    } else {
      await applyAndVerifyWindow(page, window);
      await applyAndVerifyAdvancedFilters(page);
      // O comando Filtrar pode atualizar o dashboard. Confirme que o periodo nao mudou.
      const selectedRange = page.locator(requiredSelector('GESTTA_DATE_RANGE_SELECTOR')).first();
      if ((await readControlText(selectedRange)).replace(/\s/g, '') !== brazilRange(window).replace(/\s/g, '')) {
        throw new Error('Filtro avançado alterou o período da Data Meta; cancelar exportação.');
      }
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
