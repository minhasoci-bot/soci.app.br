import test from 'node:test';
import assert from 'node:assert/strict';
import { inBackground, waitUntil } from '../background.mjs';

const REQUEST_CONTEXT = Symbol.for('@vercel/request-context');

test('na Vercel, a tarefa em segundo plano é registrada no waitUntil da requisição', async t => {
  const registered = [];
  globalThis[REQUEST_CONTEXT] = { get: () => ({ waitUntil: promise => registered.push(promise) }) };
  t.after(() => { delete globalThis[REQUEST_CONTEXT]; });

  let ran = false;
  const promise = inBackground('teste', async () => { ran = true; });
  assert.equal(registered.length, 1);
  assert.equal(registered[0], promise);
  await promise;
  assert.equal(ran, true);
});

test('fora da Vercel a tarefa roda solta e o erro só vai para o log', async t => {
  const logged = [];
  t.mock.method(console, 'error', message => logged.push(message));
  await inBackground('Entrega (ws-1)', () => { throw new Error('falhou'); });
  assert.deepEqual(logged, ['Entrega (ws-1): falhou']);
});

test('um contexto quebrado nunca derruba a requisição', async t => {
  globalThis[REQUEST_CONTEXT] = { get: () => { throw new Error('sem contexto'); } };
  t.after(() => { delete globalThis[REQUEST_CONTEXT]; });
  const promise = Promise.resolve(1);
  assert.equal(waitUntil(promise), promise);
  assert.equal(await inBackground('x', () => 2), 2);
});
