// O cron de um minuto percorre todos os workspaces. Em série, o tempo cresce com o número de subcontas
// e passa do limite da função. Aqui eles rodam em paralelo limitado e com orçamento de tempo: o que não
// couber fica para o minuto seguinte, e a ordem gira a cada minuto para ninguém ficar sempre no fim.
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Roda `worker(item)` para cada item, no máximo `concurrency` ao mesmo tempo. Depois de `budgetMs`
 * nenhum item novo começa (os que já começaram terminam). `start` gira a ordem (use o minuto atual).
 * `worker` deve tratar os próprios erros; um erro que escapar não para os outros itens.
 * Devolve os itens processados e os que ficaram para a próxima rodada.
 */
export async function runInBatches(items, worker, { concurrency = 4, budgetMs = 45_000, start = 0, now = Date.now } = {}) {
  const offset = items.length ? ((start % items.length) + items.length) % items.length : 0;
  const queue = [...items.slice(offset), ...items.slice(0, offset)];
  const begin = now(), done = [];
  async function lane() {
    while (queue.length && now() - begin < budgetMs) {
      const item = queue.shift();
      try { await worker(item); } catch (error) { console.error(`Cron: ${error?.message || error}`); }
      done.push(item);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, lane));
  return { done, skipped: queue };
}

/** Compara o segredo recebido com o esperado em tempo constante (os hashes têm sempre o mesmo tamanho). */
export function sameSecret(given, expected) {
  if (!expected || typeof given !== 'string') return false;
  const digest = value => createHash('sha256').update(String(value)).digest();
  return timingSafeEqual(digest(given), digest(expected));
}
