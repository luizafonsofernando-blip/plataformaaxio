import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADVANCED_STATUSES, ADVANCED_TASK_TYPES, parseRequiredSelectorMap,
} from '../src/advanced-filter-config.mjs';

test('cobre os quatro status do Gestta', () => {
  assert.deepEqual(ADVANCED_STATUSES, [
    'ABERTA', 'CONCLUIDA', 'IMPEDIMENTO', 'DESCONSIDERADA',
  ]);
  const mapping = Object.fromEntries(ADVANCED_STATUSES.map((x, i) => [x, '#status-' + i]));
  assert.deepEqual(parseRequiredSelectorMap(
    JSON.stringify(mapping), ADVANCED_STATUSES, 'GESTTA_ADVANCED_STATUS_SELECTORS'
  ), mapping);
});

test('cobre todos os tres tipos de tarefa do filtro avancado', () => {
  assert.deepEqual(ADVANCED_TASK_TYPES, [
    'FLUXO DE TAREFAS', 'SOLICITACAO DE SERVICO', 'RECORRENTE',
  ]);
});

test('falha fechado se faltar um status ou se um seletor for reutilizado', () => {
  const mapping = Object.fromEntries(ADVANCED_STATUSES.map((x, i) => [x, '#status-' + i]));
  delete mapping.CONCLUIDA;
  assert.throws(() => parseRequiredSelectorMap(
    JSON.stringify(mapping), ADVANCED_STATUSES, 'ADV_STATUS'
  ), /conjunto completo/);
  mapping.CONCLUIDA = mapping.ABERTA;
  assert.throws(() => parseRequiredSelectorMap(
    JSON.stringify(mapping), ADVANCED_STATUSES, 'ADV_STATUS'
  ), /nao repita/);
  assert.throws(() => parseRequiredSelectorMap('[]', ADVANCED_STATUSES, 'ADV_STATUS'));
  assert.throws(() => parseRequiredSelectorMap('invalido', ADVANCED_STATUSES, 'ADV_STATUS'));
});
