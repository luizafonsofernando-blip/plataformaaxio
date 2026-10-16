import test from 'node:test';
import assert from 'node:assert/strict';
import {withDeadline} from '../src/timeout-utils.mjs';

test('resolves value from delayed asynchronous callback', async () => {
  const value = await withDeadline('Leitura ANTES', async () => 21, 100);
  assert.equal(value, 21);
});

test('accepts callback returning a promise', async () => {
  const value = await withDeadline('Contagem toggles',
    () => Promise.resolve(12), 100);
  assert.equal(value, 12);
});

test('rejects a pre-started promise, preventing task-is-not-a-function', async () => {
  await assert.rejects(
    () => withDeadline('Leitura', Promise.resolve(3), 100),
    /requer uma funcao assincrona/
  );
});

test('propagates synchronous and async errors', async () => {
  await assert.rejects(
    () => withDeadline('Leitura', () => {throw new Error('erro de leitura');}, 100),
    /erro de leitura/
  );
  await assert.rejects(
    () => withDeadline('Leitura', async () => {throw new Error('erro async');}, 100),
    /erro async/
  );
});

test('times out without dropping a late rejection', async () => {
  let rejectTask;
  const pending=new Promise((_,reject)=>{rejectTask=reject;});
  await assert.rejects(
    () => withDeadline('Leitura ANTES', () => pending, 5),
    /excedeu/
  );
  // Promise.race has a rejection handler attached even after timing out.
  rejectTask(new Error('pagina encerrada'));
  await Promise.resolve();
});

test('invalid timeout is rejected', async () => {
  await assert.rejects(
    () => withDeadline('Leitura', () => 1, 0),
    /Tempo limite invalido/
  );
});
