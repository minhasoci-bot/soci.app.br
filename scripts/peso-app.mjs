// Peso da carga inicial de /app: index.html + CSS + grafo de módulos JS (imports estáticos e dinâmicos separados).
// Uso: node scripts/peso-app.mjs [raiz do repositório]   (brotli nível 11, como a CDN da Vercel)
import { readFileSync, existsSync } from 'node:fs';
import { resolve, posix } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';
const ui = resolve(process.argv[2] || '.', 'ui');
const br = b => brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
const html = readFileSync(resolve(ui, 'app.html'), 'utf8'); // o app; index.html é a tela de login
const css = [...html.matchAll(/<link[^>]+href="\/?([^"?#]+\.css)"/g)].map(m => m[1]);
const entry = [...html.matchAll(/<script[^>]+src="\/?([^"?#]+\.js)"/g)].map(m => m[1]);
const seen = new Map(), lazy = new Set();
const walk = (file, isLazy) => {
  const path = resolve(ui, file); if (!existsSync(path)) return;
  if (seen.has(file)) { if (!isLazy && lazy.has(file)) { lazy.delete(file); scan(file, false); } return; }
  seen.set(file, readFileSync(path)); if (isLazy) lazy.add(file);
  scan(file, isLazy);
};
const scan = (file, isLazy) => {
  const text = seen.get(file).toString();
  for (const m of text.matchAll(/(?:^|[;\n])\s*(?:import|export)\s[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|^\s*import\s*['"](\.{1,2}\/[^'"]+)['"]/gm)) walk(posix.join(posix.dirname(file), m[1] || m[2]), isLazy);
  for (const m of text.matchAll(/import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) walk(posix.join(posix.dirname(file), m[1]), true);
};
entry.forEach(f => walk(f, false));
const sum = files => files.reduce((a, [, b]) => [a[0] + b.length, a[1] + br(b)], [0, 0]);
const eager = [...seen].filter(([f]) => !lazy.has(f)), later = [...seen].filter(([f]) => lazy.has(f));
const cssFiles = css.map(f => [f, readFileSync(resolve(ui, f))]);
const kb = n => (n / 1024).toFixed(0) + ' KB';
const out = (label, files) => { const [r, b] = sum(files); console.log(`${label.padEnd(28)} ${String(files.length).padStart(3)} arq.  bruto ${kb(r).padStart(8)}  brotli ${kb(b).padStart(7)}`); return [r, b]; };
const totals = [out('app.html', [['app.html', Buffer.from(html)]]), out('CSS', cssFiles), out('JS carregado na abertura', eager)];
out('JS sob demanda (import())', later);
const [r, b] = totals.reduce((a, x) => [a[0] + x[0], a[1] + x[1]], [0, 0]);
console.log(`ABERTURA TOTAL bruto ${kb(r)}  brotli ${kb(b)}`);
console.log('Maiores na abertura:', eager.map(([f, x]) => [f, x.length]).sort((a, c) => c[1] - a[1]).slice(0, 8).map(([f, n]) => `${f} ${kb(n)}`).join(', '));
