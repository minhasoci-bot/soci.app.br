import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));

export async function lerPagina(rota) {
  const limpa = rota.replace(/^\/+|\/+$/g, '');
  return readFile(`${dist}${limpa ? `${limpa}/` : ''}index.html`, 'utf8');
}

test('home publicada com tema da soci', async () => {
  const html = await lerPagina('');
  assert.match(html, /lang="pt-BR"/);
  assert.match(html, /Soci/);
});

test('busca e llms.txt gerados', async () => {
  await access(`${dist}pagefind/pagefind.js`);
  await access(`${dist}llms.txt`);
});
