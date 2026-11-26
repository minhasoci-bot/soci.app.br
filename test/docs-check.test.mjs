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

test('lista de cobertura da documentação bate com os artigos escritos', async () => {
  const { readdir } = await import('node:fs/promises');
  const cobertura = JSON.parse(await readFile(new URL('../docs-site/cobertura.json', import.meta.url), 'utf8'));
  for (const item of cobertura) {
    const existe = await readFile(new URL(`../docs-site/src/content/docs/${item.grupo}/${item.artigo}.mdx`, import.meta.url)).then(() => true, () => false);
    assert.equal(existe, item.status !== 'pendente', `${item.grupo}/${item.artigo} está "${item.status}" na cobertura`);
  }
  const docs = new URL('../docs-site/src/content/docs/', import.meta.url);
  for (const grupo of await readdir(docs, { withFileTypes: true })) {
    if (!grupo.isDirectory() || grupo.name === 'interno') continue;
    for (const arquivo of await readdir(new URL(`${grupo.name}/`, docs))) {
      if (!arquivo.endsWith('.mdx') || arquivo === 'index.mdx' || arquivo.startsWith('_')) continue;
      if (grupo.name === 'comece-aqui' && ['bem-vindo.mdx', 'conceitos.mdx', 'novidades.mdx'].includes(arquivo)) continue;
      if (grupo.name === 'automacoes' && ['gatilhos.mdx', 'acoes.mdx'].includes(arquivo)) continue;
      const artigo = arquivo.replace(/\.mdx$/, '');
      assert.ok(cobertura.some(i => i.grupo === grupo.name && i.artigo === artigo), `${grupo.name}/${artigo} falta em docs-site/cobertura.json`);
    }
  }
});

test('a checagem de documentação roda de novo quando o corpo do PR é editado', async () => {
  const yml = await readFile(new URL('../.github/workflows/docs.yml', import.meta.url), 'utf8');
  assert.match(yml, /types:\s*\[[^\]]*\bedited\b[^\]]*\]/);
  assert.match(yml, /node scripts\/docs-check\.mjs/);
  const ci = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(ci, /docs-check\.mjs/, 'o job saiu do ci.yml para não reiniciar os testes do app a cada edição do corpo');
});

test('a página inicial da central lista as seções na ordem do menu e regerar não muda nada', async () => {
  const { secoesDoMenu, atualizarInicio } = await import('../docs-site/scripts/secoes.mjs');
  const config = await readFile(new URL('../docs-site/astro.config.mjs', import.meta.url), 'utf8');
  const secoes = secoesDoMenu(config);
  assert.deepEqual(secoes.slice(0, 2), [{ label: 'Comece aqui', grupo: 'comece-aqui' }, { label: 'Agência', grupo: 'agencia' }]);
  const inicio = await readFile(new URL('../docs-site/src/content/docs/index.mdx', import.meta.url), 'utf8');
  for (const { grupo } of secoes) assert.ok(inicio.includes(`href="/${grupo}/"`), `página inicial sem o cartão de ${grupo} (rode npm run docs:secoes)`);
  const uma = atualizarInicio('---\ntitle: X\n---\n', [{ grupo: 'crm', label: 'CRM', description: 'Contatos "e" mais' }]);
  assert.match(uma, /<LinkCard title="CRM" href="\/crm\/" description="Contatos &quot;e&quot; mais" \/>/);
  assert.equal(atualizarInicio(uma, [{ grupo: 'crm', label: 'CRM', description: 'Contatos "e" mais' }]), uma);
});
