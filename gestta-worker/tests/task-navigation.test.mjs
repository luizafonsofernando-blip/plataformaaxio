import test from 'node:test';
import assert from 'node:assert/strict';
import { TASKS_VIEW_SELECTOR, tasksMenuLocator, ensureTasksView } from '../src/task-navigation.mjs';

function mockGestta({ alreadyInTasks = false, duplicateMenu = false } = {}) {
  let visible = alreadyInTasks;
  let clickCount = 0;
  const date = {
    isVisible: async () => visible,
    waitFor: async () => { if (!visible) throw new Error('campo não visível'); },
  };
  const menu = {
    waitFor: async () => {},
    count: async () => duplicateMenu ? 2 : 1,
    click: async () => { clickCount++; visible = true; },
  };
  const page = {
    url: () => 'https://app.gestta.com.br/#/dashboard',
    isClosed: () => false,
    locator: css => { if (css !== TASKS_VIEW_SELECTOR) throw new Error('seletor inesperado'); return date; },
    getByText: (label, opts) => {
      assert.equal(label, 'Tarefas');
      assert.equal(opts.exact, true);
      return menu;
    },
  };
  return { context: { pages: () => [page] }, page, getClickCount: () => clickCount };
}
test('acessa Tarefas no menu da Dashboard', async () => {
  const { context, page, getClickCount } = mockGestta();
  assert.equal(await ensureTasksView(context), page);
  assert.equal(getClickCount(), 1);
});
test('não clica novamente se a visão Tarefas já estiver aberta', async () => {
  const { context, page, getClickCount } = mockGestta({ alreadyInTasks: true });
  assert.equal(await ensureTasksView(context), page);
  assert.equal(getClickCount(), 0);
});
test('bloqueia menu duplicado em vez de clicar numa opção incerta', async () => {
  const { context, getClickCount } = mockGestta({duplicateMenu:true});
  await assert.rejects(() => ensureTasksView(context), /Mais de uma opcao/);
  assert.equal(getClickCount(), 0);
});
test('usa seletor CSS calibrado quando fornecido', () => {
  const stub = {locator: css => css};
  assert.equal(tasksMenuLocator(stub, 'a[data-test="tarefas"]'), 'a[data-test="tarefas"]');
});
