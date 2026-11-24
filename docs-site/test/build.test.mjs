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

test('componentes renderizam mídia do R2', async () => {
  const html = await lerPagina('interno/componentes');
  assert.match(html, /src="https:\/\/midia\.soci\.app\.br\/docs\/exemplo\/x\/01-a\.0000abcd\.webp"/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /<video[^>]*preload="none"/);
  assert.doesNotMatch(html, /<video[^>]*autoplay/);
  assert.match(html, /<source src="https:\/\/midia\.soci\.app\.br\/docs\/exemplo\/x\/video\.0000abcd\.mp4" type="video\/mp4"/);
  assert.match(html, /noindex/);
  assert.match(html, /Antes de começar/);
  assert.match(html, /Gatilhos/);
  assert.match(html, /Ações/);
});

test('vitrine fora da busca e do menu', async () => {
  const home = await lerPagina('');
  assert.doesNotMatch(home, /interno\/componentes/);
  const html = await lerPagina('interno/componentes');
  assert.doesNotMatch(html, /data-pagefind-body/);
});
