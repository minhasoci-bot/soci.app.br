import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pages, page, cssFiles, sitemapUrls, textOf, hrefs, resolves, SITE_URL, LOGIN_URL } from './helpers.mjs';

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

const FUNCIONALIDADES = [
  'crm', 'whatsapp-e-atendimento', 'redes-sociais', 'sites', 'funis-e-landing-pages', 'formularios', 'automacoes',
  'inteligencia-artificial', 'prospeccao', 'agendamentos', 'email-marketing', 'reputacao', 'relatorios',
  'pagamentos-e-pix', 'cursos-e-area-de-membros', 'telefone-e-voz', 'gestao-de-agencias',
];

test('hub de funcionalidades lista as 17 páginas', () => {
  const { html } = page('/funcionalidades/');
  for (const slug of FUNCIONALIDADES) {
    assert.ok(html.includes(`href="/funcionalidades/${slug}/"`), `hub sem ${slug}`);
    page(`/funcionalidades/${slug}/`);
  }
});

test('filtro tem lista completa por padrão (nenhum card escondido no HTML)', () => {
  const { html } = page('/funcionalidades/');
  const cards = html.match(/data-objetivos="[^"]*"/g) || [];
  assert.equal(cards.length, FUNCIONALIDADES.length);
  assert.doesNotMatch(html, /<[^>]+data-objetivos="[^"]*"[^>]*\shidden/);
  assert.match(html, /aria-pressed="true"[^>]*>\s*Todas/);
});

test('pink não é cor de texto', () => {
  for (const css of cssFiles()) assert.doesNotMatch(css, /(^|[;{\s])color:\s*#ff00bb/i);
});

const SOLUCOES = [
  'agencias', 'profissionais-de-marketing', 'pequenas-empresas', 'negocios-locais',
  'captacao-de-leads', 'conversao-de-vendas', 'atendimento-ao-cliente', 'relacionamento-e-recompra',
];

test('cada solução liga a pelo menos 3 funcionalidades e cada funcionalidade é ligada por pelo menos 1 solução', () => {
  const linked = new Set();
  for (const slug of SOLUCOES) {
    const { html } = page(`/solucoes/${slug}/`);
    const main = html.match(/<main[\s\S]*<\/main>/)?.[0] || '';
    const funcs = new Set([...main.matchAll(/href="\/funcionalidades\/([a-z-]+)\/"/g)].map((m) => m[1]));
    assert.ok(funcs.size >= 3, `${slug} liga a ${funcs.size} funcionalidades`);
    funcs.forEach((f) => linked.add(f));
  }
  const orphans = FUNCIONALIDADES.filter((f) => !linked.has(f));
  assert.deepEqual(orphans, []);
});

test('planos e termos têm noindex enquanto houver marcador', () => {
  for (const route of ['/planos/', '/termos/']) {
    const { html } = page(route);
    if (textOf(html).includes('[[')) assert.match(html, /<meta name="robots" content="noindex/, route);
  }
});

test('privacidade contém o texto de ui/privacidade.html', async () => {
  const { readFileSync } = await import('node:fs');
  const original = readFileSync(new URL('../../../ui/privacidade.html', import.meta.url), 'utf8');
  const { html } = page('/privacidade/');
  for (const trecho of ['Lei Geral de Proteção de Dados', 'Quais dados coletamos', 'Transferência internacional']) {
    assert.ok(original.includes(trecho), `original sem "${trecho}"`);
    assert.ok(html.includes(trecho), `página sem "${trecho}"`);
  }
});

test('home tem o H1 oficial e liga aos dois hubs e a todas as etapas da jornada', () => {
  const { html } = page('/');
  assert.match(html, /<h1[^>]*>A plataforma brasileira para Marketing 360\.<\/h1>/);
  const main = html.match(/<main[\s\S]*<\/main>/)?.[0] || '';
  for (const hub of ['/funcionalidades/', '/solucoes/']) assert.ok(main.includes(`href="${hub}"`), `home sem ${hub}`);
  const etapa = {
    atrair: ['redes-sociais', 'sites', 'prospeccao'],
    converter: ['crm', 'funis-e-landing-pages', 'automacoes'],
    atender: ['whatsapp-e-atendimento', 'inteligencia-artificial', 'telefone-e-voz'],
    reter: ['email-marketing', 'reputacao', 'cursos-e-area-de-membros'],
    gerir: ['gestao-de-agencias', 'relatorios'],
  };
  for (const [nome, slugs] of Object.entries(etapa)) {
    assert.ok(slugs.some((s) => main.includes(`href="/funcionalidades/${s}/"`)), `etapa ${nome} sem link`);
  }
});
