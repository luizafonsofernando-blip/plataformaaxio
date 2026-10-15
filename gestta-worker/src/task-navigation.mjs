// Navegação Gestta: Dashboard inicial -> menu Tarefas -> quadro com filtros.
// Somente navega na interface. Nenhum download, mudança de tarefa ou envio.
// O menu ainda requer homologação: seletor fornecido pelo Inspector tem preferência.
export const TASKS_VIEW_SELECTOR = '#date-range';

export async function findTaskView(context, selector = TASKS_VIEW_SELECTOR) {
  for (const page of context.pages()) {
    try {
      if (!page.isClosed() && await page.locator(selector).isVisible({ timeout: 1500 })) {
        return page;
      }
    } catch (_) { /* próxima aba, não lê dados de clientes */ }
  }
  return null;
}

export function tasksMenuLocator(page, selector = process.env.GESTTA_TASKS_MENU_SELECTOR) {
  // Evita clicar em menus imprecisos. Um seletor CSS calibrado substitui o fallback.
  return selector?.trim()
    ? page.locator(selector.trim())
    : page.getByText('Tarefas', { exact: true });
}

export async function ensureTasksView(context, { timeout = 20000, selector = TASKS_VIEW_SELECTOR } = {}) {
  const existing = await findTaskView(context, selector);
  if (existing) return existing;

  const pages = context.pages().filter(p => !p.isClosed());
  const page = pages.find(p => {
    try { return new URL(p.url()).hostname === 'app.gestta.com.br'; }
    catch { return false; }
  }) || pages[0];
  if (!page) throw new Error('Chromium sem pagina aberta para acessar o Gestta.');

  const menu = tasksMenuLocator(page);
  try {
    await menu.waitFor({ state: 'visible', timeout });
    if (await menu.count() !== 1) {
      throw new Error('Mais de uma opcao Tarefas localizada. Configure GESTTA_TASKS_MENU_SELECTOR pelo Inspector.');
    }
    await menu.click({ timeout: 10000 });
  } catch (error) {
    throw new Error('Nao foi possivel clicar em Tarefas na Dashboard: ' + error.message);
  }
  try {
    await page.locator(selector).waitFor({ state: 'visible', timeout });
  } catch (_) {
    throw new Error('O menu Tarefas foi acionado mas o filtro de datas nao apareceu. ' +
      'Inspecione se existe um segundo submenu ou se a sessao expirou.');
  }
  const result = await findTaskView(context, selector);
  if (!result) throw new Error('Visao Tarefas nao confirmada.');
  return result;
}
