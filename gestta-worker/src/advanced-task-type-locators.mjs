// Tipos de tarefa no painel Filtros avançados do Gestta.
// Confirmados via Playwright Inspector em 16/10/2026.
// Os nomes acessíveis contêm um glifo decorativo após o texto. Não usar
// ícone, número, ordem ou coordenadas como identificador.
// Alterar estes checkboxes ajusta somente os filtros de leitura do Gestta.
export const VERIFIED_TASK_TYPES = Object.freeze({
  'FLUXO DE TAREFAS': 'Fluxo de tarefas',
  'SOLICITACAO DE SERVICO': 'Solicitação de serviço',
  'RECORRENTE': 'Recorrente',
});

// Chave compatível com a configuração anterior:
// "SOLICITACAO DE SERVICO" (sem cedilha).
export const TASK_TYPE_KEYS = Object.freeze([
  'FLUXO DE TAREFAS',
  'SOLICITACAO DE SERVICO',
  'RECORRENTE',
]);
const NAME_MATCHERS = Object.freeze({
  'FLUXO DE TAREFAS': /^Fluxo de tarefas\b/i,
  'SOLICITACAO DE SERVICO': /^Solicitação de serviço\b/i,
  'RECORRENTE': /^Recorrente\b/i,
});

export function taskTypeCheckbox(page, key) {
  if (!Object.hasOwn(NAME_MATCHERS, key)) {
    throw new Error('Tipo de tarefa desconhecido: ' + String(key));
  }
  return page.getByRole('checkbox', { name: NAME_MATCHERS[key] });
}

export async function inspectTaskTypes(page) {
  const result = {};
  for (const key of TASK_TYPE_KEYS) {
    const checkbox = taskTypeCheckbox(page, key);
    try { await checkbox.first().waitFor({ state: 'visible', timeout: 15000 }); }
    catch { /* erro detalhado abaixo, sem clicar. */ }
    const matches = await checkbox.count();
    if (matches !== 1 || !(await checkbox.isVisible())) {
      throw new Error('Tipo ' + key + ' não localizado de forma única e visível ' +
        '(correspondências=' + matches + ').');
    }
    result[key] = { checked: await checkbox.isChecked() };
  }
  return result;
}

export async function ensureAllTaskTypes(page) {
  // Pré-validação integral impede uma seleção parcial se faltar um checkbox.
  await inspectTaskTypes(page);
  for (const key of TASK_TYPE_KEYS) {
    const checkbox = taskTypeCheckbox(page, key);
    if (!(await checkbox.isChecked())) await checkbox.check({timeout:10000});
  }
  const final = await inspectTaskTypes(page);
  if (Object.values(final).some(value => value.checked !== true)) {
    throw new Error('A configuração dos três tipos de tarefa não foi confirmada.');
  }
  return { selected: 3 };
}
