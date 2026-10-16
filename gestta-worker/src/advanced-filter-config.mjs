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

export function assertCompleteDepartmentSelection(states, expectedTotal) {
  if (!Number.isInteger(expectedTotal) || expectedTotal < 1) {
    throw new Error('GESTTA_ADVANCED_DEPARTMENT_TOTAL_COUNT deve ser inteiro positivo.');
  }
  if (!Array.isArray(states) || states.length !== expectedTotal || !states.every(v => v === true)) {
    throw new Error('Nem todos os departamentos foram confirmados como selecionados. ' +
      'Encontrados ' + (Array.isArray(states) ? states.length : 0) +
      ' de ' + expectedTotal + ' checkboxes.');
  }
  return true;
}


// Relação integral confirmada pela ORTECONTE em 15/10/2026.
// Sempre confrontar o NOME e a seleção. Uma contagem de 21, isoladamente, não basta.
export const REQUIRED_DEPARTMENTS = Object.freeze([
  'Administrativo',
  'Arquivo',
  'Atendimento',
  'Auditoria',
  'BPO | Financeiro',
  'Certificadora Digital',
  'Comercial',
  'Compliance',
  'Contábil',
  'Financeiro',
  'Fiscal',
  'Gestta',
  'Jurídico',
  'Marketing',
  'Pessoal',
  'Processos',
  'Processos / Regularização',
  'Relacionamento',
  'Societário',
  'Tecnologia',
  'Técnico',
]);

function normalizeDepartmentName(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().replace(/\s+/g, ' ').toUpperCase();
}

export function assertSelectedDepartmentNames(records) {
  if (!Array.isArray(records) || records.length !== REQUIRED_DEPARTMENTS.length) {
    throw new Error('Departamento: esperado ' + REQUIRED_DEPARTMENTS.length +
      ' opcoes visiveis/inspecionaveis, recebidas ' +
      (Array.isArray(records) ? records.length : 0) +
      '. Se a lista usar virtualizacao, configurar outra estrategia de leitura.');
  }
  const expected = new Set(REQUIRED_DEPARTMENTS.map(normalizeDepartmentName));
  const seen = new Set();
  for (const record of records) {
    if (!record || typeof record.name !== 'string' || typeof record.checked !== 'boolean') {
      throw new Error('Departamento: nome ou estado da selecao invalido.');
    }
    const name = normalizeDepartmentName(record.name);
    if (!expected.has(name)) {
      throw new Error('Departamento desconhecido/renomeado: ' + record.name);
    }
    if (seen.has(name)) {
      throw new Error('Departamento duplicado: ' + record.name);
    }
    if (!record.checked) {
      throw new Error('Departamento desmarcado: ' + record.name);
    }
    seen.add(name);
  }
  if (seen.size !== expected.size) {
    throw new Error('Departamento: ha opcoes obrigatorias ausentes.');
  }
  return true;
}
