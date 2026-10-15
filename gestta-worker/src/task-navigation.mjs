// Gestta: a Dashboard pode ser a pagina inicial apos login.
// Entrada no quadro de tarefas: clique no INDICADOR numerico "No Prazo"
// dentro do grafico "Tarefas Abertas", nunca por numeros fixos (7/17/0).
// Apenas navega, nao altera tarefas nem realiza exportacao.
export const TASKS_VIEW_SELECTOR = '#date-range';
const STARTER_LABEL = 'No Prazo';

export async function findTaskView(context, selector = TASKS_VIEW_SELECTOR) {
  for (const page of context.pages()) {
    try {
      if (!page.isClosed() && await page.locator(selector).isVisible({ timeout: 1500 })) {
        return page;
      }
    } catch (_) { /* Proxima aba */ }
  }
  return null;
}

export function dashboardIndicatorLocator(page, { selector = process.env.GESTTA_DASHBOARD_TASKS_SHORTCUT_SELECTOR } = {}) {
  // Melhor opcao: CSS exato obtido com Pick Locator no numero clicavel da dashboard.
  if (typeof selector === 'string' && selector.trim()) return page.locator(selector.trim());
  // Fallback calibravel: ancora na ETIQUETA, e nao no valor numerico que muda.
  // Localizar unico valor numerico em um ancestral proximo do texto No Prazo.
  return null;
}

export async function findDashboardIndicator(page, { selector = process.env.GESTTA_DASHBOARD_TASKS_SHORTCUT_SELECTOR } = {}) {
  const custom = dashboardIndicatorLocator(page, { selector });
  if (custom) {
    if (await custom.count() !== 1 || !(await custom.isVisible())) {
      throw new Error('Atalho personalizado para tarefas deve localizar um elemento unico e visivel.');
    }
    return custom;
  }
  const label = page.getByText(STARTER_LABEL, { exact: true });
  await label.waitFor({ state: 'visible', timeout: 15000 });
  if (await label.count() !== 1) {
    throw new Error('Etiqueta "No Prazo" ambigua. Configure GESTTA_DASHBOARD_TASKS_SHORTCUT_SELECTOR.');
  }
  // Nunca usa valores absolutos. Procura somente UM numero em um ancestral proximo.
  // Sao permitidos ate dois niveis acima para evitar clicar em outros graficos.
  for (let level = 1; level <= 2; level++) {
    const container = label.locator('xpath=' + '../'.repeat(level).slice(0,-1));
    const numbers = container.getByText(/^\d+$/, { exact: true });
    if (await numbers.count() === 1 && await numbers.first().isVisible()) {
      return numbers.first();
    }
  }
  throw new Error('Indicador numerico "No Prazo" nao localizado com seguranca. ' +
    'Use Pick Locator no NUMERO do grafico e configure GESTTA_DASHBOARD_TASKS_SHORTCUT_SELECTOR.');
}

export async function ensureTasksView(context, { timeout = 20000, selector = TASKS_VIEW_SELECTOR } = {}) {
  const already = await findTaskView(context, selector);
  if (already) return already;
  const pages = context.pages().filter(p => !p.isClosed());
  const page = pages.find(p => {
    try { return new URL(p.url()).hostname === 'app.gestta.com.br'; }
    catch { return false; }
  }) || pages[0];
  if (!page) throw new Error('Chromium sem pagina do Gestta.');

  let indicator;
  try {
    indicator = await findDashboardIndicator(page);
    await indicator.click({ timeout: 10000 });
  } catch (error) {
    throw new Error('Nao foi possivel acessar tarefas pelo grafico da Dashboard: ' + error.message);
  }
  // Aplicativo SPA pode trocar de aba ou atualizar a rota: observar sem supor destino.
  try {
    await page.locator(selector).waitFor({ state: 'visible', timeout });
  } catch (_) {
    const nextPage = await findTaskView(context, selector);
    if (nextPage) return nextPage;
    throw new Error('Indicador da Dashboard foi acionado, mas o quadro de tarefas nao carregou. ' +
      'Inspecione o numero clicavel com Pick Locator.');
  }
  const result = await findTaskView(context, selector);
  if (!result) throw new Error('Visao Tarefas nao confirmada.');
  return result;
}
