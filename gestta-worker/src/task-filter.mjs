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
