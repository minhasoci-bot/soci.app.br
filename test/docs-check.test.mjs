import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { precisaDeDoc } from '../scripts/docs-check.mjs';
import { textoMdx } from '../docs-site/scripts/catalogo-automacoes.mjs';
import { triggerCatalog, actionCatalog } from '../ui/workflow-data.js';

test('mudança de tela sem artigo reprova e diz onde documentar', () => {
  const r = precisaDeDoc(['ui/agency.js'], '');
  assert.equal(r.ok, false);
  assert.match(r.motivo, /docs-site\/src\/content\/docs\//);
});

test('mudança de tela com artigo no mesmo PR passa', () => {
  assert.equal(precisaDeDoc(['ui/agency.js', 'docs-site/src/content/docs/crm/contatos.mdx'], '').ok, true);
});

test('"não se aplica" com motivo libera o PR', () => {
  assert.equal(precisaDeDoc(['pipeline-model.mjs'], 'Documentação: não se aplica — refatoração').ok, true);
});

test('"não se aplica" sem acento e em maiúsculas também vale', () => {
  assert.equal(precisaDeDoc(['pipeline-model.mjs'], 'documentacao: NAO SE APLICA - teste').ok, true);
});

test('PR que não toca no produto passa sem nada', () => {
  assert.equal(precisaDeDoc(['test/x.test.mjs', 'README.md'], '').ok, true);
});

test('citar um caminho no corpo não substitui o artigo no diff', () => {
  assert.equal(precisaDeDoc(['routes/social.mjs'], 'Documentação: docs-site/src/content/docs/marketing/x.mdx').ok, false);
});

test('"não se aplica" sem motivo não libera', () => {
  assert.equal(precisaDeDoc(['ui/agency.js'], 'Documentação: não se aplica').ok, false);
});

test('catálogo de automações da doc está em dia com o editor de workflows', async () => {
  const docs = new URL('../docs-site/src/content/docs/automacoes/', import.meta.url);
  const gatilhos = await readFile(new URL('gatilhos.mdx', docs), 'utf8');
  const acoes = await readFile(new URL('acoes.mdx', docs), 'utf8');
  for (const { label } of triggerCatalog.flatMap(g => g.items)) assert.ok(gatilhos.includes(`**${textoMdx(label)}**`), `gatilho "${label}" fora da doc: rode npm run docs:catalogo`);
  for (const { label } of actionCatalog.flatMap(g => g.items)) assert.ok(acoes.includes(`**${textoMdx(label)}**`), `ação "${label}" fora da doc: rode npm run docs:catalogo`);
});
