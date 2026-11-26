// Baixa o HTML renderizado de cada página dos funis e sites de uma extração do GHL (pré-visualização pública).
// Uso: node scripts/ghl-template/fetch-pages.mjs <pasta-da-extração>
// Lê <pasta>/<locationId>.json e grava <pasta>/pages/<pageId>.html. Páginas já baixadas são puladas.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('Informe a pasta da extração.'); process.exit(1); }
const out = join(dir, 'pages');
mkdirSync(out, { recursive: true });

const pages = [];
for (const file of readdirSync(dir).filter(name => /^[A-Za-z0-9]{20}\.json$/.test(name))) {
  const dump = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  for (const funnel of dump.funnels || []) {
    if (/\bcopy$/i.test(funnel.name.trim())) continue;
    for (const page of funnel.pages || []) pages.push(page._id);
  }
}

let fetched = 0, skipped = 0, failed = 0;
for (const id of pages) {
  const target = join(out, `${id}.html`);
  if (existsSync(target)) { skipped++; continue; }
  const res = await fetch(`https://sites.leadconnectorhq.com/preview/${id}`);
  if (!res.ok) { failed++; console.error(`falhou ${id}: ${res.status}`); continue; }
  writeFileSync(target, await res.text());
  fetched++;
}
console.log(`páginas: ${pages.length} · baixadas ${fetched} · já existiam ${skipped} · falharam ${failed}`);
