// Navegacao de leitura no Gestta: Dashboard v2 -> menu lateral "Tarefas".
// Nao depende dos numeros variaveis dos graficos e nao altera dados de tarefas.
// O seletor do menu deve ser calibrado com Inspector se o texto nao for unico.
export const TASKS_VIEW_SELECTOR = '#date-range';

export async function findTaskView(context, selector = TASKS_VIEW_SELECTOR) {
  for (const page of context.pages()) {
    if (page.isClosed()) continue;
    try {
      if (await page.locator(selector).isVisible({ timeout: 1500 })) return page;
    } catch { /* pode ser outra aba ou tela ainda carregando */ }
  }
  return null;
}

export function sidebarTasksLocator(page, css = process.env.GESTTA_SIDEBAR_TASKS_SELECTOR) {
  return typeof css === 'string' && css.trim()
    ? page.locator(css.trim())
    : page.getByText('Tarefas', { exact: true });
}

function selectGesttaPage(context) {
  return context.pages().find(page => {
    if (page.isClosed()) return false;
    try { return new URL(page.url()).hostname === 'app.gestta.com.br'; }
    catch { return false; }
  });
}

export async function ensureTasksView(context, {
  selector = TASKS_VIEW_SELECTOR,
  timeout = 45000,
} = {}) {
  const already = await findTaskView(context, selector);
  if (already) return already;

  const page = selectGesttaPage(context);
  if (!page) throw new Error('Aba do Gestta nao encontrada no Chromium.');

  const sidebar = sidebarTasksLocator(page);
  try {
    // A Dashboard v2 pode aparecer antes do menu lateral estar montado.
    // O Playwright aguarda o proprio elemento, em vez de supor o tempo de rede.
    await sidebar.first().waitFor({ state: 'visible', timeout: 60000 });
    const count = await sidebar.count();
    if (count !== 1) {
      throw new Error('Existem ' + count + ' elementos Tarefas. ' +
        'Calibre GESTTA_SIDEBAR_TASKS_SELECTOR com Pick Locator no menu esquerdo.');
    }
    console.log('Menu lateral Tarefas localizado; aguardando 5 segundos...');
    await page.waitForTimeout(5000);

    const current = await findTaskView(context, selector);
    if (current) return current;
    if (!(await sidebar.isVisible())) throw new Error('Menu Tarefas desapareceu durante carregamento.');
    await sidebar.click({ timeout: 10000 });
    console.log('Menu lateral Tarefas acionado. Aguardando filtro de datas...');
  } catch (error) {
    throw new Error('Falha ao abrir menu lateral Tarefas: ' + error.message);
  }

  try {
    await page.locator(selector).waitFor({ state: 'visible', timeout });
  } catch {
    const another = await findTaskView(context, selector);
    if (another) return another;
    throw new Error('O menu lateral Tarefas abriu, mas #date-range nao apareceu. ' +
      'A nova tela pode ser diferente da lista de tarefas E-BEF. ' +
      'Confirme qual tela foi aberta antes de alterar a navegacao.');
  }
  const result = await findTaskView(context, selector);
  if (!result) throw new Error('Quadro de tarefas nao confirmado apos navegar pelo menu lateral.');
  return result;
}
