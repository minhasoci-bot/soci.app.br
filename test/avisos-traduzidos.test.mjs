import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Os avisos de ui/app.js são escritos em português (a língua das chaves do catálogo) e
// precisam ter tradução em ui/locales/es.js. Um aviso em inglês não é chave do catálogo
// e aparecia em inglês para todo mundo, como "Pipeline saved.".
test('todo aviso fixo de ui/app.js está em português e tem tradução para espanhol', async () => {
  const app = await readFile(new URL('../ui/app.js', import.meta.url), 'utf8');
  const { default: es } = await import('../ui/locales/es.js');
  const avisos = [...new Set([...app.matchAll(/(?:msg ?= ?|flash\()'([^']{3,120})'/g)].map(m => m[1]))];
  assert.ok(avisos.length > 20, `só ${avisos.length} avisos encontrados`);
  const sem = avisos.filter(aviso => !(aviso in es) && !(aviso.replace(/[.!…]+$/, '') in es));
  assert.deepEqual(sem, []);
});

test('o status da nova fatura mostra os nomes em português e guarda o valor de sempre', async () => {
  const app = await readFile(new URL('../ui/app.js', import.meta.url), 'utf8');
  const campo = app.match(/case 'invoices':.*?option\('Status','status',[^;]*;/s)?.[0] || '';
  for (const [valor, nome] of [['Draft', 'Rascunho'], ['Open', 'Em aberto'], ['Paid', 'Paga'], ['Void', 'Cancelada']]) {
    assert.ok(campo.includes(`['${valor}','${nome}']`), `${valor} deveria aparecer como ${nome}`);
  }
});
