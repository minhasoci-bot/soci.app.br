import test from 'node:test';
import assert from 'node:assert/strict';
import { runInBatches, sameSecret } from '../cron-batch.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

test('processa todos os itens sem passar do limite de paralelismo', async () => {
  let running = 0, peak = 0;
  const seen = [];
  const { done, skipped } = await runInBatches([1, 2, 3, 4, 5, 6, 7], async item => {
    running++; peak = Math.max(peak, running);
    await pause(5);
    seen.push(item);
    running--;
  }, { concurrency: 3 });
  assert.equal(peak, 3);
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(done.length, 7);
  assert.deepEqual(skipped, []);
});

test('a ordem gira com o minuto, para ninguém ficar sempre no fim', async () => {
  const order = [];
  await runInBatches(['a', 'b', 'c', 'd'], async item => { order.push(item); }, { concurrency: 1, start: 6 });
  assert.deepEqual(order, ['c', 'd', 'a', 'b']);
});

test('depois do orçamento de tempo nenhum item novo começa; o resto fica para a próxima rodada', async () => {
  let clock = 0;
  const { done, skipped } = await runInBatches(['a', 'b', 'c', 'd'], async () => { clock += 10; },
    { concurrency: 1, budgetMs: 25, now: () => clock });
  assert.deepEqual(done, ['a', 'b', 'c']);
  assert.deepEqual(skipped, ['d']);
});

test('um erro num workspace não para os outros', async t => {
  t.mock.method(console, 'error', () => {});
  const ok = [];
  const { done } = await runInBatches(['a', 'b', 'c'], async item => { if (item === 'b') throw new Error('falhou'); ok.push(item); });
  assert.deepEqual(ok.sort(), ['a', 'c']);
  assert.equal(done.length, 3);
});

test('lista vazia termina sem erro', async () => {
  assert.deepEqual(await runInBatches([], async () => {}), { done: [], skipped: [] });
});

test('o segredo do cron é comparado por inteiro e falha sem segredo configurado', () => {
  assert.equal(sameSecret('Bearer abc', 'Bearer abc'), true);
  assert.equal(sameSecret('Bearer abd', 'Bearer abc'), false);
  assert.equal(sameSecret('Bearer ab', 'Bearer abc'), false);
  assert.equal(sameSecret('', undefined), false);
  assert.equal(sameSecret('Bearer undefined', undefined), false);
});
