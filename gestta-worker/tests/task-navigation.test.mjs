import test from 'node:test';
import assert from 'node:assert/strict';
import {findTaskView, sidebarTasksLocator, ensureTasksView} from '../src/task-navigation.mjs';

function mockGestta({
  alreadyInTasks = false, menuCount = 1, menuVisible = true, opensTarget = true,
} = {}) {
  let dateVisible = alreadyInTasks;
  let clicks = 0;
  const waits = [];
  const calendar = {
    isVisible: async () => dateVisible,
    waitFor: async () => { if (!dateVisible) throw new Error('Campo de data ausente'); },
  };
  const sidebar = {
    first: () => sidebar,
    waitFor: async () => { if (!menuVisible) throw new Error('Menu ausente'); },
    count: async () => menuCount,
    isVisible: async () => menuVisible,
    click: async () => { clicks++; if (opensTarget) dateVisible = true; },
  };
  const page = {
    isClosed: () => false,
    url: () => 'https://app.gestta.com.br/dashboard-v2/#/dashboard-v2',
    locator: css => {
      assert.equal(css, '#date-range');
      return calendar;
    },
    getByText: (text, options) => {
      assert.equal(text, 'Tarefas');
      assert.equal(options.exact,true);
      return sidebar;
    },
    waitForTimeout: async value => waits.push(value),
  };
  return {context: {pages:()=>[page]},page,waits:()=>waits,clicks:()=>clicks};
}

test('clica no menu lateral Tarefas e confirma calendario',async () => {
  const {context,page,clicks,waits}=mockGestta();
  assert.equal(await ensureTasksView(context),page);
  assert.equal(clicks(),1);
  assert.deepEqual(waits(),[5000]);
});

test('nao clica se ja abriu a tela de tarefas',async () => {
  const {context,page,clicks,waits}=mockGestta({alreadyInTasks:true});
  assert.equal(await ensureTasksView(context),page);
  assert.equal(clicks(),0);
  assert.deepEqual(waits(),[]);
});

test('rejeita menus ambiguos sem clicar',async () => {
  const {context,clicks}=mockGestta({menuCount:2});
  await assert.rejects(()=>ensureTasksView(context),/Existem 2 elementos Tarefas/);
  assert.equal(clicks(),0);
});

test('rejeita menu ainda invisivel sem clicar',async () => {
  const {context,clicks}=mockGestta({menuVisible:false});
  await assert.rejects(()=>ensureTasksView(context),/Menu ausente/);
  assert.equal(clicks(),0);
});

test('confere calendario em vez de supor que clicar em Tarefas basta',async () => {
  const {context,clicks}=mockGestta({opensTarget:false});
  await assert.rejects(()=>ensureTasksView(context),/nova tela pode ser diferente/);
  assert.equal(clicks(),1);
});

test('aceita seletor calibrado opcional para menu lateral',async () => {
  const css='[data-testid="gestta-sidebar-tarefas"]';
  assert.equal(sidebarTasksLocator({locator:x=>x},css),css);
});

test('reconhece a tela de tarefas previamente aberta',async () => {
  const {context,page}=mockGestta({alreadyInTasks:true});
  assert.equal(await findTaskView(context),page);
});
