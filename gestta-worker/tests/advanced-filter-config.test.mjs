import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADVANCED_STATUSES, ADVANCED_TASK_TYPES, parseRequiredSelectorMap, assertCompleteDepartmentSelection,
  REQUIRED_DEPARTMENTS, assertSelectedDepartmentNames,
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

test('selecionar todos exige cada checkbox marcado e total conhecido', () => {
  assert.equal(assertCompleteDepartmentSelection([true, true, true], 3), true);
  assert.throws(() => assertCompleteDepartmentSelection([true, false, true], 3),
    /Nem todos os departamentos/);
  assert.throws(() => assertCompleteDepartmentSelection([true, true], 3),
    /Nem todos os departamentos/);
  assert.throws(() => assertCompleteDepartmentSelection([true], 0),
    /inteiro positivo/);
});

test('valida exatamente os 21 departamentos pelo nome e pela seleção', () => {
  assert.equal(REQUIRED_DEPARTMENTS.length, 21);
  const selection = REQUIRED_DEPARTMENTS.map(name => ({ name, checked: true }));
  assert.equal(assertSelectedDepartmentNames(selection), true);
  assert.equal(assertSelectedDepartmentNames(selection.map(r => ({
    ...r, name: r.name.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
  }))), true);
});

test('distingue Financeiro de BPO Financeiro e os dois setores Processos', () => {
  const selected = REQUIRED_DEPARTMENTS.map(name => ({ name, checked: true }));
  assert(selected.some(x => x.name === 'Financeiro'));
  assert(selected.some(x => x.name === 'BPO | Financeiro'));
  assert(selected.some(x => x.name === 'Processos'));
  assert(selected.some(x => x.name === 'Processos / Regularização'));
  assert.equal(assertSelectedDepartmentNames(selected), true);
});

test('bloqueia departamento ausente, extra, duplicado ou desmarcado', () => {
  const selected = REQUIRED_DEPARTMENTS.map(name => ({ name, checked: true }));
  assert.throws(() => assertSelectedDepartmentNames(selected.slice(1)), /21 opcoes/);
  assert.throws(() => assertSelectedDepartmentNames([
    ...selected.slice(1), {name:'Departamento novo', checked:true},
  ]), /desconhecido/);
  assert.throws(() => assertSelectedDepartmentNames([
    ...selected.slice(1), {...selected[1]},
  ]), /duplicado/);
  assert.throws(() => assertSelectedDepartmentNames(
    selected.map(row => ({ ...row, checked: row.name === 'Arquivo' ? false : true }))
  ), /desmarcado/);
});
