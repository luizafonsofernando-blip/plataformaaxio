// Filtro principal de tarefas. Localizador validado com Pick Locator em 16/10/2026:
// getByText('Todas as tarefas'). Nao confundir com menu lateral 'Tarefas'.
// O rotulo e confiavel apenas enquanto nenhuma tarefa especifica esta selecionada.
export const TASK_FILTER_DEFAULT_LABEL = 'Todas as tarefas';

export function taskFilterTrigger(page) {
  return page.getByText(TASK_FILTER_DEFAULT_LABEL, { exact: true });
}

export async function verifyTaskFilterTrigger(page) {
  const trigger = taskFilterTrigger(page);
  const count = await trigger.count();
  if (count !== 1) {
    throw new Error('Filtro principal "Todas as tarefas" nao localizado de forma unica (' +
      count + ' correspondencias). Inspecione a caixa superior ou calibre o seletor.');
  }
  if (!(await trigger.isVisible())) {
    throw new Error('Filtro principal de tarefas ainda nao esta visivel.');
  }
  return trigger;
}


// Não pressupor que a seleção inicial persista vazia entre execuções.
// O seletor do X de limpeza precisa ser capturado do próprio Gestta:
// jamais clicar genericamente em todos os botões X da página.
export async function ensureUnfilteredTaskPicker(page, clearCss = process.env.GESTTA_TASK_FILTER_CLEAR_SELECTOR) {
  const trigger = taskFilterTrigger(page);
  const initialCount = await trigger.count();
  if (initialCount === 1 && await trigger.isVisible()) return trigger;
  if (initialCount > 1) {
    throw new Error('Campo Todas as tarefas ambiguo (' + initialCount +
      ' elementos). Inspecione o filtro superior antes de continuar.');
  }
  if (!clearCss?.trim()) {
    throw new Error('Filtro principal Todas as tarefas ausente (0 correspondencias). ' +
      'O Gestta pode ter preservado uma selecao anterior. ' +
      'Abra o Inspector e capture o X de LIMPAR SOMENTE o filtro de tarefas. ' +
      'Nao usar --auto nem clicar no X de outros filtros.');
  }

  const clear = page.locator(clearCss.trim());
  if (await clear.count() !== 1 || !(await clear.isVisible())) {
    throw new Error('Controle de limpeza do filtro de tarefas nao identificado ' +
      'de forma unica e visivel. Cancelando sem alterar filtros.');
  }
  await clear.click({timeout:10000});
  try {
    await trigger.first().waitFor({state:'visible',timeout:15000});
  } catch {
    throw new Error('Filtro de tarefas nao voltou a Todas as tarefas apos limpeza.');
  }
  if (await trigger.count() !== 1 || !(await trigger.isVisible())) {
    throw new Error('Nao foi possivel confirmar filtro inicial apos limpeza.');
  }
  return trigger;
}

export const EBEF_SEARCH_TERM = 'bef';

// A interface é filtrável por "bef", conforme confirmado pelo operador.
// Seleção automática somente quando os seletores internos forem calibrados.
// Escopo estrito: uma opção DECLARAÇÃO e duas VERIFICAR NECESSIDADE.
// Pré-condição: nenhuma tarefa previamente selecionada (rótulo Todas as tarefas).
// Isso evita incluir tarefas fora do E-BEF em uma exportação.
export function validateEbefOptionNames(names) {
  if (!Array.isArray(names) || names.length !== 3) {
    throw new Error('Busca E-BEF deve retornar exatamente tres opcoes; recebidas ' +
      (Array.isArray(names) ? names.length : 'valor invalido') + '.');
  }
  const norm = text => String(text).normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g,' ').trim();
  const normalized = names.map(norm);
  if (normalized.some(name => !name.includes('EBEF'))) {
    throw new Error('Busca incluiu opcao que nao corresponde a E-BEF.');
  }
  const declarations = normalized.filter(name => name.includes('DECLARACAO DE EBEF')).length;
  const verifications = normalized.filter(name => name.includes('VERIFICAR NECESSIDADE DE EBEF')).length;
  if (declarations !== 1 || verifications !== 2) {
    throw new Error('Escopo incorreto: esperado 1 Declaracao de EBEF e 2 Verificar Necessidade de EBEF.');
  }
  if (new Set(normalized).size !== 3) {
    throw new Error('Tarefas E-BEF repetidas na lista de resultados.');
  }
  return true;
}

// Playwright Inspector confirmou o input e os menuitems em 16/10/2026.
// Em vez de arrastar a scrollbar por pixels, scrollIntoViewIfNeeded() rola
// SOMENTE o suficiente para revelar a opção alvo (se existir no DOM).
export function taskSearchLocator(page, css) {
  return css?.trim()
    ? page.locator(css.trim())
    // O Inspector forneceu getByRole('textbox', { name: 'Buscar por tarefa' }),
    // SEM exact:true. Usar regex tolera eventuais espacos e sufixos da label.
    : page.getByRole('textbox', { name: /Buscar\s+por\s+tarefa/i });
}

export function ebefMenuItemsLocator(page, css) {
  return css?.trim()
    ? page.locator(css.trim())
    : page.getByRole('menuitem', { name: /EBEF/i });
}

export function menuItemCheckbox(item, css) {
  return css?.trim()
    ? item.locator(css.trim())
    : item.getByRole('checkbox');
}

export async function selectEbefTasks(page, { searchCss, rowCss, checkboxCss, clearCss } = {}) {
  // Antes de pesquisar é importante não haver seleção prévia de outras
  // tarefas. O texto inicial "Todas as tarefas" foi confirmado no Inspector.
  const trigger = await ensureUnfilteredTaskPicker(page, clearCss);
  await trigger.click({ timeout: 10000 });

  const search = taskSearchLocator(page, searchCss);
  // A lista do Gestta pode abrir de forma assincrona. Antes, count()
  // executado imediatamente após click() devolvia 0 de modo intermitente.
  // .first() aqui apenas aguarda o primeiro campo; a cardinalidade eh
  // conferida antes de digitar, portanto nunca selecionamos um ambiguo.
  let timedOut = false;
  try {
    await search.first().waitFor({ state: 'visible', timeout: 15000 });
  } catch {
    timedOut = true;
  }
  const matches = await search.count();
  const visible = matches === 1 && await search.isVisible();
  if (timedOut || matches !== 1 || !visible) {
    // Logar somente contagens de controles, nunca texto digitado por usuarios,
    // nomes de clientes, DOM, URLs de sessao ou outros dados privados.
    const textboxes = await page.getByRole('textbox').count();
    const items = await page.getByRole('menuitem').count();
    const selectAll = await page.getByText('Selecionar todas ativas', { exact: true }).count();
    throw new Error('Campo Buscar por tarefa indisponivel: ' +
      'correspondencias=' + matches + ', visivel=' + visible +
      ', total_textboxes=' + textboxes +
      ', total_menuitems=' + items +
      ', acao_selecionar_todas=' + selectAll +
      '. O dropdown pode estar fechado ou o nome acessivel pode ter mudado.');
  }
  await search.fill(EBEF_SEARCH_TERM, { timeout: 10000 });
  if ((await search.inputValue()).trim().toLowerCase() !== EBEF_SEARCH_TERM) {
    throw new Error('Busca do Gestta nao confirmou o texto bef.');
  }

  const rows = ebefMenuItemsLocator(page, rowCss);
  // Se o Gestta renderizar os itens fora da área visível, o Playwright faz
  // a rolagem interna quando necessário. Se a lista for virtualizada
  // (ainda não houver 3 elementos no DOM), falhar com diagnóstico.
  try {
    await rows.nth(2).waitFor({ state: 'attached', timeout: 15000 });
  } catch {
    throw new Error('A busca bef nao carregou tres itens no DOM. ' +
      'Inspecione a rolagem ou a lista virtualizada antes de automatizar.');
  }
  const total = await rows.count();
  if (total !== 3) {
    throw new Error('A busca bef localizou ' + total +
      ' menuitems E-BEF; esperado exatamente tres.');
  }

  const names = [];
  const boxes = [];
  for (let i = 0; i < total; i++) {
    const row = rows.nth(i);
    try {
      await row.scrollIntoViewIfNeeded({ timeout: 10000 });
    } catch {
      throw new Error('Nao foi possivel rolar a lista ate a opcao E-BEF ' +
        (i + 1) + '. Inspecione o contêiner da barra de rolagem.');
    }
    if (!(await row.isVisible())) {
      throw new Error('A opcao E-BEF ' + (i + 1) + ' continua invisivel.');
    }
    names.push((await row.innerText()).trim());
    const checkbox = menuItemCheckbox(row, checkboxCss);
    if (await checkbox.count() !== 1) {
      throw new Error('A opcao E-BEF ' + (i + 1) + ' nao possui checkbox unico.');
    }
    boxes.push(checkbox);
  }
  validateEbefOptionNames(names); // Falhar ANTES de marcar qualquer checkbox.
  for (const box of boxes) {
    await box.scrollIntoViewIfNeeded({ timeout: 10000 });
    if (!(await box.isChecked())) await box.check({ timeout: 10000 });
  }
  for (const box of boxes) {
    if (!(await box.isChecked())) {
      throw new Error('Uma tarefa E-BEF nao permaneceu selecionada.');
    }
  }
  return { selected: 3 };
}
