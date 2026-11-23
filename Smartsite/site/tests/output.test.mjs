import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pages, cssFiles, sitemapUrls, textOf, hrefs, resolves, SITE_URL, LOGIN_URL } from './helpers.mjs';

const FORBIDDEN = [
  'highlevel', 'gohighlevel', 'ghl', 'hubspot', 'rd station', 'kommo', 'activecampaign', 'wix', 'hotmart', 'kajabi',
  '24h', '24/7', 'grátis', 'gratis', 'garantido', 'teste gratuito', 'chat.whatsapp.com', 'aggregaterating',
];

test('toda página tem lang pt-BR, um único h1, title, description e canonical em SITE_URL', () => {
  for (const { route, html } of pages()) {
    assert.match(html, /<html[^>]*lang="pt-BR"/, `${route}: lang`);
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${route}: h1 único`);
    assert.match(html, /<title>[^<]{5,}<\/title>/, `${route}: title`);
    assert.match(html, /<meta name="description" content="[^"]{30,}"/, `${route}: description`);
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    assert.equal(canonical, SITE_URL + route, `${route}: canonical`);
  }
});

test('links internos resolvem', () => {
  const broken = [];
  for (const { route, html } of pages()) {
    for (const href of hrefs(html)) {
      if (href.startsWith('/') && !href.startsWith('//') && !resolves(href)) broken.push(`${route} → ${href}`);
    }
  }
  assert.deepEqual(broken, []);
});

test('nenhum termo proibido', () => {
  const hits = [];
  for (const { route, html } of pages()) {
    const text = html.toLowerCase();
    for (const term of FORBIDDEN) {
      const re = new RegExp(`(^|[^a-z0-9à-ú])${term.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}([^a-z0-9à-ú]|$)`, 'i');
      if (re.test(text)) hits.push(`${route}: ${term}`);
    }
  }
  assert.deepEqual(hits, []);
});

test('páginas com marcador têm noindex e estão fora do sitemap', () => {
  const urls = new Set(sitemapUrls());
  assert.ok(urls.size > 0, 'sitemap existe');
  for (const { route, html } of pages()) {
    const marked = textOf(html).includes('[[');
    const noindex = /<meta name="robots" content="noindex/.test(html);
    if (marked) {
      assert.ok(noindex, `${route}: marcador sem noindex`);
      assert.ok(!urls.has(SITE_URL + route), `${route}: marcador no sitemap`);
    }
    if (noindex) assert.ok(!urls.has(SITE_URL + route), `${route}: noindex no sitemap`);
  }
});

test('CTA comecar aponta para LOGIN_URL', () => {
  let count = 0;
  for (const { route, html } of pages()) {
    for (const m of html.matchAll(/<a\b[^>]*data-cta="comecar"[^>]*>/g)) {
      count++;
      assert.match(m[0], new RegExp(`href="${LOGIN_URL}"`), `${route}: ${m[0]}`);
    }
  }
  assert.ok(count > 0, 'existe ao menos um CTA comecar');
});

test('JSON-LD é JSON válido', () => {
  for (const { route, html } of pages()) {
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      assert.doesNotThrow(() => JSON.parse(m[1]), `${route}: JSON-LD inválido`);
    }
  }
});

test('menu e filtro funcionam sem JS: todo link do NAV está no header como <a href>', async () => {
  const { default: NAV } = await import('../src/data/nav.json', { with: { type: 'json' } });
  const wanted = NAV.primary.flatMap((item) => [item.href, ...(item.groups || []).flatMap((g) => g.links.map((l) => l.href))]);
  for (const { route, html } of pages()) {
    const header = html.match(/<header[\s\S]*?<\/header>/)?.[0] || '';
    for (const href of wanted) assert.ok(header.includes(`href="${href}"`), `${route}: header sem ${href}`);
    assert.match(header, /aria-expanded="false"/, `${route}: botão de menu com estado`);
  }
});

test('pink não é cor de texto', () => {
  for (const css of cssFiles()) assert.doesNotMatch(css, /(^|[;{\s])color:\s*#ff00bb/i);
});
