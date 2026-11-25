// Monta o bloco "## Artigos" de cada página de seção (src/content/docs/<grupo>/index.mdx) com um cartão
// para cada artigo do grupo, na ordem do menu (sidebar.order, depois título).
// Uso: npm run docs:secoes   (rodar depois de criar ou renomear um artigo)
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const IMPORTACAO = "import { CardGrid, LinkCard } from '@astrojs/starlight/components';";
const INICIO = '{/* artigos: gerado por docs-site/scripts/secoes.mjs */}';
const FIM = '{/* fim dos artigos */}';

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

export function blocoArtigos(grupo, artigos) {
  if (!artigos.length) return '';
  const cartoes = artigos.map(a => `  <LinkCard title="${atributo(a.title)}" href="/${grupo}/${a.slug}/" description="${atributo(a.description)}" />`);
  return [INICIO, '## Artigos', '', '<CardGrid>', ...cartoes, '</CardGrid>', FIM].join('\n');
}

export function atualizarIndice(indice, grupo, artigos) {
  let texto = indice.replace(/\r\n/g, '\n');
  const bloco = blocoArtigos(grupo, artigos);
  const inicio = texto.indexOf(INICIO), fim = texto.indexOf(FIM);
  if (inicio >= 0 && fim > inicio) texto = texto.slice(0, inicio).trimEnd() + (bloco ? `\n\n${bloco}` : '') + texto.slice(fim + FIM.length);
  else if (bloco) texto = `${texto.trimEnd()}\n\n${bloco}\n`;
  if (bloco && !texto.includes(IMPORTACAO)) texto = texto.replace(/^(---\n[\s\S]*?\n---\n)/, `$1\n${IMPORTACAO}\n`);
  return texto.endsWith('\n') ? texto : `${texto}\n`;
}

async function gerar() {
  const docs = new URL('../src/content/docs/', import.meta.url);
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
    const atual = await readFile(caminho, 'utf8');
    const novo = atualizarIndice(atual, grupo, artigos);
    if (novo !== atual.replace(/\r\n/g, '\n')) { await writeFile(caminho, novo); console.log(`${grupo}: ${artigos.length} artigo(s)`); }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await gerar();
