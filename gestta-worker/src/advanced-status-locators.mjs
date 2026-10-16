// Status do painel Filtros avançados do Gestta, confirmados no
// Playwright Inspector em 16/10/2026.
// "Aberta" e "Impedimento" exibiram glifo adicional no nome acessível.
// Por isso, usar expressão ancorada no nome + borda de palavra;
// nunca fixar um caractere de ícone ou um índice de checkbox.
// Estes controles afetam APENAS filtros visuais, não o estado das tarefas.

export const VERIFIED_STATUS_LABELS = Object.freeze({
  ABERTA: 'Aberta',
  CONCLUIDA: 'Concluída',
  IMPEDIMENTO: 'Impedimento',
  DESCONSIDERADA: 'Desconsiderada',
});

const NAME_MATCHERS = Object.freeze({
  ABERTA: /^Aberta\b/i,
  CONCLUIDA: 'Concluída',
  IMPEDIMENTO: /^Impedimento\b/i,
  DESCONSIDERADA: 'Desconsiderada',
});

export function statusCheckbox(page, key) {
  if (!Object.hasOwn(NAME_MATCHERS, key)) {
    throw new Error('Status E-BEF não reconhecido: ' + String(key));
  }
  const name = NAME_MATCHERS[key];
  return page.getByRole('checkbox', typeof name === 'string'
    ? { name, exact: true } : { name });
}

export function concludedStatusCheckbox(page) {
  return statusCheckbox(page, 'CONCLUIDA');
}

export async function inspectConcludedStatus(page) {
  const checkbox = concludedStatusCheckbox(page);
  const count = await checkbox.count();
  if (count !== 1) {
    throw new Error('Checkbox Concluída: esperado 1, encontrados ' + count +
      '. Abra Filtros avançados e confira o localizador.');
  }
  if (!(await checkbox.isVisible())) {
    throw new Error('Checkbox Concluída encontrado, mas não visível.');
  }
  return { found: true, checked: await checkbox.isChecked() };
}

export async function inspectAdvancedStatuses(page) {
  const results = {};
  for (const key of Object.keys(VERIFIED_STATUS_LABELS)) {
    const item = statusCheckbox(page,key);
    try { await item.first().waitFor({ state: 'visible', timeout: 15000 }); }
    catch { /* Capturar contagem detalhada abaixo sem clicar. */ }
    const count = await item.count();
    if (count !== 1 || !(await item.isVisible())) {
      throw new Error('Filtro avançado ' + key + ' não localizado de forma ' +
        'única e visível (correspondências=' + count + ').');
    }
    results[key] = { checked: await item.isChecked() };
  }
  return results;
}

export async function ensureAllAdvancedStatuses(page) {
  // Não modificar sequer os filtros caso algum dos quatro elementos falte.
  await inspectAdvancedStatuses(page);
  for (const key of Object.keys(VERIFIED_STATUS_LABELS)) {
    const item = statusCheckbox(page,key);
    if (!(await item.isChecked())) await item.check({ timeout: 10000 });
  }
  const final = await inspectAdvancedStatuses(page);
  if (Object.values(final).some(x => x.checked !== true)) {
    throw new Error('Nem todos os quatro status permaneceram selecionados.');
  }
  return { selected: 4 };
}
