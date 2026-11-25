// White Label: o domínio das subcontas é validado, é de uma agência só, entra na hospedagem e faz o login
// mostrar a marca da agência. Antes ele era salvo como texto livre e o servidor nunca olhava para ele.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hostingDomains, requestHost, requireFreeDomain, whiteLabelBrand, whiteLabelHost } from '../white-label.mjs';
import { blankAgency, executeAgency } from '../agency-model.mjs';

const agencies = list => ({ findAgency: async filter => list.find(row => row.state.company.domain === filter.company.domain) || null });

test('The domain is cleaned up and checked', () => {
  assert.equal(whiteLabelHost(' https://App.Agencia.com.br/login?x=1 '), 'app.agencia.com.br');
  assert.equal(whiteLabelHost('app.agencia.com.br:443'), 'app.agencia.com.br');
  assert.equal(whiteLabelHost(''), '');
  assert.throws(() => whiteLabelHost('agencia'), /app\.suaagencia/);
  assert.throws(() => whiteLabelHost('app.soci.app.br'), /plataforma/);
  assert.throws(() => whiteLabelHost('x.vercel.app'), /plataforma/);
});

test('The agency settings keep the clean domain', () => {
  const agency = blankAgency();
  executeAgency(agency, { type: 'company', data: { name: 'Agência X', domain: 'HTTPS://app.agenciax.com.br/', timezone: 'America/Sao_Paulo', primary: '#123456' } });
  assert.equal(agency.company.domain, 'app.agenciax.com.br');
  assert.throws(() => executeAgency(agency, { type: 'company', data: { name: 'Agência X', domain: 'nada', timezone: 'America/Sao_Paulo' } }), /domínio/);
});

test('A domain belongs to one agency', async () => {
  const store = agencies([{ id: 'agency-a', state: { company: { domain: 'app.a.com.br', name: 'A' } } }]);
  await requireFreeDomain(store, 'app.a.com.br', 'agency-a');
  await requireFreeDomain(store, 'app.b.com.br', 'agency-b');
  await assert.rejects(requireFreeDomain(store, 'app.a.com.br', 'agency-b'), { status: 409 });
});

test('The login on the agency domain gets its name, logo and color; the platform address gets nothing', async () => {
  const store = agencies([{ id: 'agency-a', state: { company: { domain: 'app.a.com.br', name: 'Agência A', logo: 'data:image/png;base64,AAA', primary: '#FF0000' } } }]);
  assert.deepEqual(await whiteLabelBrand(store, 'app.a.com.br'), { name: 'Agência A', logo: 'data:image/png;base64,AAA', primary: '#FF0000' });
  assert.deepEqual(await whiteLabelBrand(store, 'soci.app.br'), {});
  assert.deepEqual(await whiteLabelBrand(store, 'outro.com.br'), {});
  assert.equal(requestHost({ headers: { 'x-forwarded-host': 'App.A.com.br:443', host: 'interno' } }), 'app.a.com.br');
});

test('With a hosting token the domain is added to the project and its DNS is read back', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push([init.method || 'GET', url.pathname, url.searchParams.get('teamId'), init.body || '']);
    if (url.pathname.endsWith('/config')) return { ok: true, status: 200, json: async () => ({ misconfigured: false }) };
    return { ok: true, status: 200, json: async () => ({ verified: true }) };
  };
  const hosting = hostingDomains({ token: 't', project: 'prj_1', team: 'team_1', fetch });
  assert.equal(await hosting.add('app.a.com.br'), true);
  assert.deepEqual(calls[0], ['POST', '/v10/projects/prj_1/domains', 'team_1', '{"name":"app.a.com.br"}']);
  assert.deepEqual(await hosting.status('app.a.com.br'), { domain: 'app.a.com.br', cname: 'cname.vercel-dns.com', hosting: true, added: true, verified: true, pointing: true });
  const off = hostingDomains({ token: '', project: '', fetch });
  assert.equal(await off.add('app.a.com.br'), false);
  assert.equal((await off.status('app.a.com.br')).hosting, false);
});

test('The login page asks for the brand and the agency screen explains the CNAME', async () => {
  const { readFile } = await import('node:fs/promises');
  assert.match(await readFile(new URL('../ui/login.js', import.meta.url), 'utf8'), /fetch\('\/api\/marca'\)/);
  const agency = await readFile(new URL('../ui/agency.js', import.meta.url), 'utf8');
  assert.match(agency, /cname\.vercel-dns\.com/);
  assert.match(agency, /\/api\/agency\/domain-status/);
});
