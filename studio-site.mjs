// AI Studio sites: real HTML pages kept in their own store row (`studio-<projectId>`),
// so the workspace state only carries project metadata.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { randomUUID } from 'node:crypto';

export const SITE_LIMITS = { pages: 8, html: 120000, versions: 12 };
export const siteRowId = projectId => `studio-${projectId}`;
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const now = () => new Date().toISOString();
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

export function slugify(name, taken = []) {
  const base = String(name || 'page').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'page';
  let slug = base, n = 2;
  while (taken.includes(slug) || slug === 'lead') slug = `${base}-${n++}`;
  return slug;
}

// Defence in depth only: every page is also served with a CSP that blocks all scripts.
const blocked = 'script|iframe|frame|frameset|object|embed|applet|base|noscript|template|portal';
export function sanitizeHtml(input) {
  if (typeof input !== 'string' || !input.trim()) fail('The page is empty.');
  if (input.length > SITE_LIMITS.html) fail(`A page can have up to ${SITE_LIMITS.html.toLocaleString('en-US')} characters of HTML.`);
  let html = input
    .replace(new RegExp(`<(${blocked})\\b[\\s\\S]*?<\\/\\1\\s*>`, 'gi'), '')
    .replace(new RegExp(`<\\/?(${blocked})\\b[^>]*>`, 'gi'), '')
    .replace(/<meta\b[^>]*http-equiv[^>]*>/gi, '')
    .replace(/<link\b[^>]*>/gi, tag => /href\s*=\s*["']https:\/\/fonts\.googleapis\.com\//i.test(tag) && /rel\s*=\s*["']?stylesheet/i.test(tag) ? tag : '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(?:srcdoc|formaction)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(?:data-go-(?:ready|hover|selected)|contenteditable)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?(?=[\s>/])/gi, '')
    .replace(/\b(href|src|action|xlink:href|srcset|poster)\s*=\s*(["']?)\s*(?:javascript|vbscript|data:text\/html)[^"'>\s]*\2/gi, '$1="#"');
  if (!/^\s*<!doctype html/i.test(html)) html = `<!doctype html>\n${html}`;
  return html;
}

const palette = { indigo: ['#4f46e5', '#eef0ff'], forest: ['#13795b', '#e7f5ee'], amber: ['#b45309', '#fff4dc'], rose: ['#be185d', '#fcebf0'] };
// Page built from the structured fields (local template mode and projects created before HTML pages existed).
export function pageFromStructure(project, pageName = '') {
  const [accent, tint] = palette[project.theme] || palette.indigo;
  const blocks = (project.blocks || []).map(b => `<article><h3>${esc(b.title)}</h3>${b.body ? `<p>${esc(b.body)}</p>` : '<p>[[Write this section]]</p>'}</article>`).join('');
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(pageName || project.name)}</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#172036;background:#fbfbfd;line-height:1.55}
header{display:flex;justify-content:space-between;align-items:center;padding:18px clamp(16px,5vw,64px);background:#fff;border-bottom:1px solid #e6e8f0}
header b{font-size:18px}header a{color:${accent};font-weight:600;text-decoration:none}
.hero{padding:clamp(56px,10vw,120px) clamp(16px,5vw,64px);background:${tint};text-align:center}
.hero h1{font-size:clamp(32px,6vw,58px);line-height:1.08;letter-spacing:-.03em;margin:0 auto 16px;max-width:900px}
.hero p{max-width:640px;margin:0 auto;font-size:18px;color:#3b4660}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:18px;max-width:1100px;margin:56px auto;padding:0 16px}
.grid article{background:#fff;border:1px solid #e6e8f0;border-radius:14px;padding:22px}.grid h3{margin:0 0 8px}
.lead{max-width:560px;margin:0 auto 72px;padding:28px;background:#fff;border:1px solid #e6e8f0;border-radius:16px}
.lead h2{margin:0 0 14px}.lead label{display:grid;gap:6px;margin-bottom:12px;font-weight:600;font-size:14px}
.lead input{font:inherit;padding:11px 12px;border:1px solid #cdd3e0;border-radius:9px}
.lead button{font:inherit;font-weight:700;color:#fff;background:${accent};border:0;border-radius:9px;padding:12px 18px;cursor:pointer}
footer{text-align:center;padding:28px;color:#6b7590;font-size:14px}
</style></head>
<body><header><b>${esc(project.name)}</b><a href="#contato">Contato</a></header>
<section class="hero"><h1>${esc(pageName || project.headline || project.name)}</h1>${project.summary ? `<p>${esc(project.summary)}</p>` : ''}</section>
<section class="grid">${blocks}</section>
<section class="lead" id="contato"><h2>Fale com a gente</h2><form data-go-lead>
<label>Nome<input name="name" required autocomplete="name"></label><label>E-mail<input name="email" type="email" required autocomplete="email"></label>
<label>Telefone<input name="phone" type="tel" autocomplete="tel"></label><button>Enviar</button></form></section>
<footer>${esc(project.name)}</footer></body></html>`;
}

export function newSiteDoc({ workspace, project, pages }) {
  const doc = { profile: { name: `AI Studio ${project.id}` }, workspace, project: project.id, rev: 1, pages: [], versions: [], published: null };
  for (const page of pages) doc.pages.push({ id: randomUUID(), name: page.name, slug: slugify(page.slug || page.name, doc.pages.map(p => p.slug)), html: sanitizeHtml(page.html), updated: now() });
  doc.pages[0].slug = 'index';
  snapshot(doc, 'Created');
  return doc;
}
function snapshot(doc, label) {
  doc.versions.push({ id: randomUUID(), at: now(), label: String(label || 'Saved').slice(0, 120), pages: doc.pages.map(({ id, name, slug, html }) => ({ id, name, slug, html })) });
  if (doc.versions.length > SITE_LIMITS.versions) doc.versions.splice(0, doc.versions.length - SITE_LIMITS.versions);
  doc.rev = (doc.rev || 0) + 1;
}
export const findPage = (doc, pageId) => doc.pages.find(p => p.id === pageId) || fail('Page not found.', 404);

export function savePage(doc, pageId, html, label) {
  const page = findPage(doc, pageId);
  page.html = sanitizeHtml(html); page.updated = now();
  snapshot(doc, label);
  return page.id;
}
export function addPage(doc, name, html) {
  if (doc.pages.length >= SITE_LIMITS.pages) fail(`A site can have up to ${SITE_LIMITS.pages} pages.`);
  const clean = String(name || '').trim().slice(0, 60) || fail('Page name is required.');
  const page = { id: randomUUID(), name: clean, slug: slugify(clean, doc.pages.map(p => p.slug).concat('index')), html: sanitizeHtml(html), updated: now() };
  doc.pages.push(page);
  snapshot(doc, `Added page ${clean}`);
  return page.id;
}
export function renamePage(doc, pageId, name) {
  const page = findPage(doc, pageId);
  page.name = String(name || '').trim().slice(0, 60) || fail('Page name is required.');
  snapshot(doc, `Renamed page to ${page.name}`);
  return page.id;
}
export function deletePage(doc, pageId) {
  const page = findPage(doc, pageId);
  if (page.slug === 'index') fail('The home page cannot be deleted.');
  doc.pages = doc.pages.filter(p => p.id !== pageId);
  snapshot(doc, `Deleted page ${page.name}`);
  return pageId;
}
export function restoreVersion(doc, versionId) {
  const version = doc.versions.find(v => v.id === versionId) || fail('Version not found.', 404);
  doc.pages = version.pages.map(p => ({ ...p, updated: now() }));
  snapshot(doc, `Restored “${version.label.slice(0, 90)}”`);
  return version.id;
}
export function publish(doc, on) {
  doc.published = on ? { at: now(), rev: doc.rev, pages: doc.pages.map(({ id, name, slug, html }) => ({ id, name, slug, html })) } : null;
  return doc.published?.at || '';
}
// What the browser needs: page HTML for the code editor, version labels without their copies.
export const publicDoc = doc => ({
  rev: doc.rev, pages: doc.pages, published: doc.published ? { at: doc.published.at, rev: doc.published.rev, slugs: doc.published.pages.map(p => p.slug) } : null,
  versions: doc.versions.map(({ id, at, label }) => ({ id, at, label })).reverse()
});

// ---- Serving ----------------------------------------------------------------

const pageCsp = ancestors => `default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src https: data:; form-action 'self'; base-uri 'none'; frame-ancestors ${ancestors}`;
export const previewHeaders = { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': pageCsp("'self'"), 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' };
// same-origin (not no-referrer) so the browser sends a real Origin header when the lead form posts back.
export const publicHeaders = { ...previewHeaders, 'Content-Security-Policy': pageCsp("'none'"), 'Referrer-Policy': 'same-origin' };

export function renderPublic(page, { base, notice = '' }) {
  let html = page.html
    .replace(/(href\s*=\s*["'])page:([a-z0-9-]+)(["'])/gi, (_, a, slug, b) => `${a}${slug === 'index' ? base : `${base}/${slug}`}${b}`)
    .replace(/<form\b([^>]*)>/gi, (_, attrs) => `<form${attrs.replace(/\s(?:action|method|target|enctype)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')} action="${base}" method="post"><input type="hidden" name="_page" value="${esc(page.slug)}">`);
  if (notice) {
    const banner = `<div role="status" style="position:sticky;top:0;z-index:9999;padding:14px 18px;font:600 15px system-ui,sans-serif;text-align:center;${notice.ok ? 'background:#ecfdf3;color:#067647' : 'background:#fef3f2;color:#b42318'}">${esc(notice.text)}</div>`;
    html = /<body\b[^>]*>/i.test(html) ? html.replace(/<body\b[^>]*>/i, m => m + banner) : banner + html;
  }
  return html;
}

// ---- Reference website (layout inspiration) ---------------------------------

function privateAddress(ip) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return privateAddress(v.slice(7));
    return v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('ff');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19));
}
const textOf = html => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

export async function readReference(raw, request = fetch) {
  let url;
  try { url = new URL(String(raw).trim()); } catch { fail('Enter a valid reference address, starting with https://'); }
  for (let hop = 0; hop < 4; hop++) {
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) fail('Use a public http or https address for the reference.');
    const addresses = await lookup(url.hostname, { all: true }).catch(() => []);
    if (!addresses.length) fail('The reference address could not be found.');
    if (addresses.some(a => privateAddress(a.address))) fail('The reference must be a public website.');
    const response = await request(url, { redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'pt-BR,en;q=0.8', 'User-Agent': 'Mozilla/5.0 (compatible; GO-Workspace-Studio/1.0; layout reference)' } }).catch(() => null);
    if (!response) fail('The reference website did not respond.');
    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.get('location')) { url = new URL(response.headers.get('location'), url); continue; }
    if (!response.ok) fail(`The reference website refused the request (status ${response.status}). Try another address or create without a reference.`);
    if (!/text\/html|application\/xhtml/i.test(response.headers.get('content-type') || '')) fail('The reference address did not return a web page.');
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    while (size < 600000) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); size += value.length; }
    reader.cancel().catch(() => {});
    const html = Buffer.concat(chunks).toString('utf8').replace(/<(script|style|svg|noscript)\b[\s\S]*?<\/\1>/gi, '');
    const title = textOf(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
    const headings = [...html.matchAll(/<(h[1-3])\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(m => `${m[1].toUpperCase()}: ${textOf(m[2])}`).filter(l => l.length > 4).slice(0, 40);
    const buttons = [...html.matchAll(/<(?:button|a)\b[^>]*>([\s\S]*?)<\/(?:button|a)>/gi)].map(m => textOf(m[1])).filter(t => t && t.length < 40).slice(0, 25);
    const sections = (html.match(/<section\b/gi) || []).length;
    return { url: url.href, summary: [`Reference page: ${url.hostname}`, title && `Title: ${title}`, `Sections: ${sections}`, 'Heading order:', ...headings, buttons.length ? `Buttons and links: ${[...new Set(buttons)].join(' | ')}` : ''].filter(Boolean).join('\n').slice(0, 5000) };
  }
  return fail('The reference address redirects too many times.');
}
