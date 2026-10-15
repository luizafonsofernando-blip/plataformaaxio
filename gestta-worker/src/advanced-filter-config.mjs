// Os filtros avancados sao obrigatorios para a sincronizacao completa.
// O mapeamento CSS e obtido manualmente na interface autenticada; nunca inferido de screenshots.
export const ADVANCED_STATUSES = Object.freeze([
  'ABERTA', 'CONCLUIDA', 'IMPEDIMENTO', 'DESCONSIDERADA',
]);
export const ADVANCED_TASK_TYPES = Object.freeze([
  'FLUXO DE TAREFAS', 'SOLICITACAO DE SERVICO', 'RECORRENTE',
]);

export function parseRequiredSelectorMap(raw, expected, variableName) {
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error(variableName + ' deve ser objeto JSON de seletores CSS.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(variableName + ' deve ser objeto JSON de seletores CSS.');
  }
  const actualKeys = Object.keys(parsed);
  if (actualKeys.length !== expected.length ||
      expected.some(key => !actualKeys.includes(key))) {
    throw new Error(variableName + ': esperado o conjunto completo: ' + expected.join(', '));
  }
  if (actualKeys.some(key => typeof parsed[key] !== 'string' || !parsed[key].trim())) {
    throw new Error(variableName + ': todos os seletores CSS devem ser preenchidos.');
  }
  if (new Set(Object.values(parsed)).size !== actualKeys.length) {
    throw new Error(variableName + ': nao repita o mesmo seletor em filtros distintos.');
  }
  return parsed;
}
