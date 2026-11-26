// Lista os textos em inglês que ainda faltam no dicionário (traducao-pt.json), a partir de setup-templates/.
//   node scripts/ghl-template/textos.mjs [saida.json]
// Sem saída, só conta. Com saída, grava { "texto": vezes } dos que faltam, do mais usado para o menos.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadDictionary, looksEnglish, mapAssets, mapPage, shapeOf, translator } from './traduzir.mjs';

const dir = new URL('../../setup-templates/', import.meta.url);
const read = file => JSON.parse(readFileSync(new URL(file, dir), 'utf8'));

/** Os textos (na forma, com {v1} e {n1}) que parecem inglês e não têm tradução. */
export function missing(dict = loadDictionary()) {
  const found = new Map();
  const tr = translator(dict);
  const visit = text => {
    if (!text || tr(text) !== undefined || !looksEnglish(text)) return undefined;
    const { shape } = shapeOf(text);
    found.set(shape, (found.get(shape) || 0) + 1);
    return undefined;
  };
  for (const id of read('index.json')) {
    const spec = read(`${id}.json`);
    for (const field of ['title', 'summary', 'description']) visit(spec[field]);
    mapAssets(spec.assets, visit, '', { onlyText: true });
    let sites = {};
    try { sites = read(`${id}.sites.json`); } catch { sites = {}; }
    for (const pages of Object.values(sites)) for (const page of pages) { visit(page.name); mapPage(page.html, visit); }
  }
  return new Map([...found].sort((a, b) => b[1] - a[1]));
}

if (process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const list = missing();
  const chars = [...list.keys()].reduce((n, t) => n + t.length, 0);
  console.log(`${list.size} textos em inglês fora do dicionário (${chars} caracteres).`);
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(Object.fromEntries(list), null, 1));
}
