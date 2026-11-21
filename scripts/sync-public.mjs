// Mirrors the front-end from ui/ into public/.
//
// On Vercel, public/ is served as static files before the rewrite to api/index.mjs, and the function
// cannot read ui/ files that are missing from public/ (they answer 500). A module that exists only in
// ui/ therefore breaks every page that imports it: the app stays on "Abrindo a soci…".
// ui/ is the source of truth; this script only ever copies ui/ → public/, never the other way.
//
//   node scripts/sync-public.mjs          copy what is missing or different
//   node scripts/sync-public.mjs --check  list what is out of sync and exit 1 if anything is
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ui = join(root, 'ui');
const pub = join(root, 'public');

// Top-level .js/.css are always mirrored. HTML pages are served by the server with their own headers
// (CSP), so only the ones public/ already carries are kept in sync. Asset folders are mirrored whole.
const assetDirs = ['brand', 'fonts', 'locales', 'vendor'];

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

export function publicMirrorPlan() {
  const files = readdirSync(ui).filter(name => statSync(join(ui, name)).isFile())
    .filter(name => /\.(js|css)$/.test(name) || (name.endsWith('.html') && existsSync(join(pub, name))))
    .map(name => join(ui, name));
  for (const dir of assetDirs) if (existsSync(join(ui, dir))) files.push(...walk(join(ui, dir)));
  return files.map(source => ({ source, target: join(pub, relative(ui, source)), path: relative(ui, source).replaceAll('\\', '/') }))
    .filter(({ source, target }) => !existsSync(target) || !readFileSync(source).equals(readFileSync(target)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pending = publicMirrorPlan();
  if (process.argv.includes('--check')) {
    for (const { path, target } of pending) console.log(`${existsSync(target) ? 'diferente' : 'faltando'}: public/${path}`);
    if (pending.length) { console.log(`\n${pending.length} arquivo(s) fora de sincronia. Rode: node scripts/sync-public.mjs`); process.exit(1); }
    console.log('public/ está em dia com ui/.');
  } else {
    for (const { source, target, path } of pending) {
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
      console.log(`copiado: public/${path}`);
    }
    console.log(pending.length ? `\n${pending.length} arquivo(s) copiado(s) de ui/ para public/.` : 'public/ já estava em dia com ui/.');
  }
}
