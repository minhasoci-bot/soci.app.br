// White Label: a tela de entrada no domínio da agência. Produção, 26/11 (graao.com): a página chegava com a marca da
// soci e só depois trocava o nome; o texto, o rodapé, o ícone da aba e as cores seguiam da soci, e o logotipo
// guardado como /asset/<hash>.png nunca aparecia (o login só aceitava data:image). Agora o servidor monta a marca.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brandedPage } from '../white-label.mjs';

const login = readFileSync(new URL('../ui/login.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../ui/app.html', import.meta.url), 'utf8');
const logo = `/asset/${'a'.repeat(64)}.png`;

test('The login on an agency domain arrives with its name, logo, color and footer, and nothing of soci', () => {
  const page = brandedPage(login, { name: 'graao', logo, primary: '#2f9e44' });
  assert.match(page, /<title>Entrar · graao<\/title>/);
  assert.match(page, new RegExp(`<img class="brand-logo" src="${logo}" alt="graao">`));
  assert.match(page, new RegExp(`<link rel="icon" href="${logo}">`));
  assert.match(page, /<meta name="theme-color" content="#2f9e44">/);
  assert.match(page, /Acesse a plataforma graao com a sua conta Google\./);
  assert.match(page, /© \d{4} graao\.</);
  assert.match(page, /<html lang="pt-BR" data-marca="agencia" data-marca-nome="graao"/, 'o login.js não troca de novo o que o servidor já montou');
  assert.match(page, /--marca:#2f9e44/);
  const shown = [...page.matchAll(/(?:alt|aria-label|content)="([^"]*)"/g)].map(m => m[1]).join(' ');
  const text = page.replace(/<style[\s\S]*?<\/style>|<[^>]+>/g, ' ');
  assert.doesNotMatch(`${text} ${shown}`, /soci/i, 'nenhum "soci" visível na tela da agência');
});

test('Without a logo the name stands in; names are escaped; a bad color keeps the default', () => {
  const page = brandedPage(login, { name: 'Ag<ência> & Cia', logo: 'javascript:alert(1)', primary: 'red;}' });
  assert.match(page, /<div class="brand" aria-label="Ag&lt;ência&gt; &amp; Cia">Ag&lt;ência&gt; &amp; Cia<\/div>/);
  assert.doesNotMatch(page, /javascript:/);
  assert.doesNotMatch(page, /red;\}/);
  assert.match(page, /href="\/favicon\.svg"/);
});

test('The app on an agency domain opens with its name and icon in the tab', () => {
  const page = brandedPage(app, { name: 'graao', logo, primary: '' });
  assert.match(page, /<title>graao<\/title>/);
  assert.match(page, new RegExp(`<link rel="icon" href="${logo}">`));
});

test('The server sends /login branded on the agency domain and unchanged on soci.app.br', async t => {
  const http = await import('node:http');
  const { makeServer } = await import('../server.mjs');
  const { createSqliteStore } = await import('../storage.mjs');
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store: createSqliteStore(':memory:'), port: 0, hosting: { add: async () => true, remove: async () => true, status: async () => ({}) } });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  const get = (path, forwarded) => new Promise((resolve, reject) => http.get({ host, port, path, headers: { 'x-forwarded-host': forwarded } }, res => { let body = ''; res.on('data', chunk => { body += chunk; }); res.on('end', () => resolve(body)); }).on('error', reject));
  const saved = await fetch(`http://${host}:${port}/api/agency/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'company', data: { name: 'graao', timezone: 'America/Sao_Paulo', primary: '#2f9e44', secondary: '#c4a7ff', domain: 'graao.com' } }) });
  assert.equal(saved.status, 200);
  assert.match(await get('/login', 'graao.com'), /<title>Entrar · graao<\/title>[\s\S]*Acesse a plataforma graao/);
  assert.match(await get('/login', 'soci.app.br'), /<title>Entrar · soci<\/title>/);
});
