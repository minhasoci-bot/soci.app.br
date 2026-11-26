// Monta os cartões da central de ajuda:
// - o bloco "## Artigos" de cada página de seção (src/content/docs/<grupo>/index.mdx), um cartão por artigo
//   do grupo, na ordem do menu (sidebar.order, depois título);
// - o bloco "## Seções" da página inicial (src/content/docs/index.mdx), um cartão por seção, na ordem do menu
//   lateral de astro.config.mjs.
// Uso: npm run docs:secoes   (rodar depois de criar ou renomear um artigo ou uma seção)
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const IMPORTACAO = "import { CardGrid, LinkCard } from '@astrojs/starlight/components';";
const ARTIGOS = { inicio: '{/* artigos: gerado por docs-site/scripts/secoes.mjs */}', fim: '{/* fim dos artigos */}' };
const SECOES = { inicio: '{/* seções: gerado por docs-site/scripts/secoes.mjs */}', fim: '{/* fim das seções */}' };

// Lê title, description e sidebar.order do frontmatter (YAML simples, como nos artigos da doc).
export function frontmatter(texto) {
  const bloco = /^---\r?\n([\s\S]*?)\r?\n---/.exec(texto)?.[1] || '';
  const valor = chave => {
    const linha = new RegExp(`^${chave}:\\s*(.+)$`, 'm').exec(bloco)?.[1]?.trim() || '';
    return linha.startsWith('"') ? JSON.parse(linha) : linha.replace(/^'(.*)'$/, '$1');
  };
  const ordem = /^\s+order:\s*(\d+)/m.exec(bloco)?.[1];
  return { title: valor('title'), description: valor('description'), order: ordem === undefined ? 999 : Number(ordem) };
}

const atributo = valor => String(valor).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const cartao = (title, href, description) => `  <LinkCard title="${atributo(title)}" href="${href}" description="${atributo(description)}" />`;
const grade = (marcas, titulo, cartoes) => cartoes.length ? [marcas.inicio, titulo, '', '<CardGrid>', ...cartoes, '</CardGrid>', marcas.fim].join('\n') : '';

export function blocoArtigos(grupo, artigos) {
  return grade(ARTIGOS, '## Artigos', artigos.map(a => cartao(a.title, `/${grupo}/${a.slug}/`, a.description)));
}

// secoes: [{ grupo, label, description }] na ordem do menu lateral.
export function blocoSecoes(secoes) {
  return grade(SECOES, '## Seções', secoes.map(s => cartao(s.label, `/${s.grupo}/`, s.description)));
}

// Ordem e nome das seções como no menu lateral: { label: 'CRM', items: [{ autogenerate: { directory: 'crm' } }] }.
export function secoesDoMenu(config) {
  return [...config.matchAll(/label:\s*'([^']+)',\s*items:\s*\[\{\s*autogenerate:\s*\{\s*directory:\s*'([^']+)'/g)]
    .map(([, label, grupo]) => ({ label, grupo }));
}

function trocarBloco(indice, marcas, bloco) {
  let texto = indice.replace(/\r\n/g, '\n');
  const inicio = texto.indexOf(marcas.inicio), fim = texto.indexOf(marcas.fim);
  if (inicio >= 0 && fim > inicio) texto = texto.slice(0, inicio).trimEnd() + (bloco ? `\n\n${bloco}` : '') + texto.slice(fim + marcas.fim.length);
  else if (bloco) texto = `${texto.trimEnd()}\n\n${bloco}\n`;
  if (bloco && !texto.includes(IMPORTACAO)) texto = texto.replace(/^(---\n[\s\S]*?\n---\n)/, `$1\n${IMPORTACAO}\n`);
  return texto.endsWith('\n') ? texto : `${texto}\n`;
}

export const atualizarIndice = (indice, grupo, artigos) => trocarBloco(indice, ARTIGOS, blocoArtigos(grupo, artigos));
export const atualizarInicio = (indice, secoes) => trocarBloco(indice, SECOES, blocoSecoes(secoes));

async function regravar(caminho, gerar, rotulo) {
  const atual = await readFile(caminho, 'utf8');
  const novo = gerar(atual);
  if (novo !== atual.replace(/\r\n/g, '\n')) { await writeFile(caminho, novo); console.log(rotulo); }
}

async function gerar() {
  const docs = new URL('../src/content/docs/', import.meta.url);
  const descricoes = {};
  for (const entrada of await readdir(docs, { withFileTypes: true })) {
    if (!entrada.isDirectory() || entrada.name === 'interno') continue;
    const grupo = entrada.name;
    const pasta = new URL(`${grupo}/`, docs);
    const artigos = [];
    for (const arquivo of await readdir(pasta)) {
      if (!arquivo.endsWith('.mdx') || arquivo === 'index.mdx' || arquivo.startsWith('_')) continue;
      artigos.push({ slug: arquivo.replace(/\.mdx$/, ''), ...frontmatter(await readFile(new URL(arquivo, pasta), 'utf8')) });
    }
    artigos.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'pt-BR'));
    const caminho = new URL('index.mdx', pasta);
    descricoes[grupo] = frontmatter(await readFile(caminho, 'utf8')).description;
    await regravar(caminho, atual => atualizarIndice(atual, grupo, artigos), `${grupo}: ${artigos.length} artigo(s)`);
  }
  const config = await readFile(new URL('../astro.config.mjs', import.meta.url), 'utf8');
  const secoes = secoesDoMenu(config).filter(s => s.grupo in descricoes).map(s => ({ ...s, description: descricoes[s.grupo] }));
  await regravar(new URL('index.mdx', docs), atual => atualizarInicio(atual, secoes), `página inicial: ${secoes.length} seção(ões)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await gerar();
