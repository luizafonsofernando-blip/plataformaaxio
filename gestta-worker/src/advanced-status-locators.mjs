// Mapeamento incremental de controles de status no filtro avançado do Gestta.
// 16/10/2026: Playwright Inspector confirmou:
// getByRole('checkbox', { name: 'Concluída' })
// Os outros status ainda aguardam homologação individual na interface real.
// Este módulo só consulta elementos; nunca altera tarefas ou filtros.

export const VERIFIED_STATUS_LABELS = Object.freeze({
  CONCLUIDA: 'Concluída',
});

export function concludedStatusCheckbox(page) {
  return page.getByRole('checkbox', {name: VERIFIED_STATUS_LABELS.CONCLUIDA, exact:true});
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
  return {found:true, checked:await checkbox.isChecked()};
}
