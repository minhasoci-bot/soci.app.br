import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
export const SITE_URL = 'https://www.soci.app.br';
export const LOGIN_URL = 'https://soci.app.br/login';

function walk(dir, ext) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full, ext) : full.endsWith(ext) ? [full] : [];
  });
}

/** Every built page: { file, route, html }. route is like "/funcionalidades/crm/". */
export function pages() {
  const files = walk(DIST, '.html').filter((f) => !relative(DIST, f).split(sep).join('/').startsWith('assets/'));
  if (!files.length) throw new Error('dist/ vazio: rode npm run build antes dos testes');
  return files.map((file) => {
    const rel = relative(DIST, file).split(sep).join('/');
    const route = '/' + rel.replace(/index\.html$/, '').replace(/\.html$/, '/');
    return { file, route, html: readFileSync(file, 'utf8') };
  });
}

export function page(route) {
  const found = pages().find((p) => p.route === route);
  if (!found) throw new Error(`página ${route} não existe em dist/`);
  return found;
}

export function cssFiles() {
  return walk(DIST, '.css').map((f) => readFileSync(f, 'utf8'));
}

export function sitemapUrls() {
  return walk(DIST, '.xml')
    .filter((f) => /sitemap-\d+\.xml$/.test(f))
    .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
}

/** Visible text + attribute values, without <script>/<style> bodies (JSON-LD is checked apart). */
export function textOf(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
}

export function hrefs(html) {
  return [...html.matchAll(/\shref="([^"]*)"/g)].map((m) => m[1]);
}

export function resolves(href) {
  const path = href.split('#')[0].split('?')[0];
  if (!path) return true;
  const target = join(DIST, decodeURI(path));
  if (existsSync(target) && statSync(target).isFile()) return true;
  return existsSync(join(target, 'index.html'));
}
