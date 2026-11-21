import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { scoreAnswer } from '../seo-model.mjs';
import { searchReport, useGoogleFetch } from '../google-integrations.mjs';

const settings = { brand: 'Clínica Sorriso', aliases: ['Sorriso Odonto'], domain: 'www.clinicasorriso.com.br',
  competitors: [{ name: 'Dental Prime', domain: 'dentalprime.com.br' }, { name: 'OdontoMais', domain: '' }],
  prompts: ['Qual o melhor dentista em Curitiba?', 'Onde fazer clareamento em Curitiba?'] };

test('Visibility AI settings and scoring: mentions, citations, position and share of voice', () => {
  const s = blank();
  assert.throws(() => execute(s, { type: 'visibility-settings', data: { ...settings, brand: '' } }), /nome da marca/);
  assert.throws(() => execute(s, { type: 'visibility-settings', data: { ...settings, prompts: [] } }), /pergunta/);
  execute(s, { type: 'visibility-settings', data: { ...settings, prompts: [...settings.prompts, ' qual o melhor dentista em curitiba? '] } });
  assert.equal(s.visibility.domain, 'clinicasorriso.com.br');
  assert.equal(s.visibility.prompts.length, 2, 'repeated questions are dropped');

  const answer = scoreAnswer({ prompt: 'x', text: 'Boas opções: 1. Dental Prime, no Batel. 2. A clinica sorriso (Água Verde) tem ótimas avaliações. Evite confundir com OdontoMaisClub.',
    sources: [{ url: 'https://clinicasorriso.com.br/tratamentos', title: 'Tratamentos' }, { url: 'https://g.co/x', title: 'Maps' }] }, s.visibility);
  assert.deepEqual([answer.mentioned, answer.cited, answer.position, answer.competitors], [true, true, 2, ['Dental Prime']], 'accents and case ignored; whole words only');
  assert.equal(scoreAnswer({ prompt: 'x', text: 'Veja clinicasorriso.com.br, ótima opção.', sources: [] }, s.visibility).position, 1, 'the site written in the answer counts as a mention');

  execute(s, { type: 'visibility-run', data: { model: 'gpt-x', answers: [
    { prompt: settings.prompts[0], text: 'Recomendo a Dental Prime e a Sorriso Odonto.', sources: [] },
    { prompt: settings.prompts[1], text: 'A OdontoMais faz clareamento.', sources: [{ url: 'https://dentalprime.com.br', title: 'Dental Prime' }] }
  ] } });
  const run = s.visibilityRuns[0];
  assert.deepEqual([run.mentioned, run.mentionRate, run.avgPosition], [1, 50, 2]);
  assert.deepEqual(run.share.map(row => [row.name, row.mentions, row.brand]), [['Clínica Sorriso', 1, true], ['Dental Prime', 2, false], ['OdontoMais', 1, false]], 'a competitor cited as a source counts too');
  assert.throws(() => execute(s, { type: 'visibility-run', data: { answers: [] } }), /resposta/);
});

test('SEO settings and site audits keep the last 12', () => {
  const s = blank();
  assert.throws(() => execute(s, { type: 'seo-settings', data: { siteUrl: 'ftp://x' } }), /endereço/);
  execute(s, { type: 'seo-settings', data: { siteUrl: 'clinicasorriso.com.br', keywords: ['Dentista Curitiba', 'dentista curitiba', '', 'clareamento dental'] } });
  assert.deepEqual([s.seo.siteUrl, s.seo.keywords], ['https://clinicasorriso.com.br/', ['dentista curitiba', 'clareamento dental']]);
  const website = { url: 'https://clinicasorriso.com.br/', reachable: true, status: 200, title: 'Clínica', health: { score: 71, parts: { performance: 60, seo: 80, security: 75, compliance: 50 },
    performance: { score: 60, source: 'estimate' }, seo: [{ key: 'title', label: 'Título', ok: true, detail: '' }, { key: 'description', label: 'Meta description', ok: false, detail: 'Ausente' }],
    security: [{ key: 'https', label: 'HTTPS', ok: true }], securityInfo: [], compliance: [{ key: 'privacy', label: 'Política de privacidade', ok: false }] } };
  for (let i = 0; i < 13; i++) execute(s, { type: 'seo-audit', data: website });
  assert.equal(s.seoAudits.length, 12);
  const audit = s.seoAudits[0];
  assert.equal(audit.score, 71);
  assert.deepEqual(audit.issues.map(item => item.key), ['description', 'privacy'], 'only failed checks become issues, with a tip each');
  assert.ok(audit.issues.every(item => item.tip));
});

test('Search Console report: tracked keywords with previous period, opportunities and totals', async t => {
  const calls = [];
  useGoogleFetch(async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push([url, body.dimensions.join(','), body.startDate]);
    const rows = body.dimensions[0] === 'date'
      ? [{ keys: ['2026-11-01'], clicks: 3, impressions: 100, ctr: 0.03, position: 8 }, { keys: ['2026-11-02'], clicks: 1, impressions: 300, ctr: 0.003, position: 12 }]
      : body.startDate === '2026-10-23'
        ? [{ keys: ['dentista curitiba'], clicks: 3, impressions: 120, ctr: 0.025, position: 6.4 }, { keys: ['implante dentário curitiba'], clicks: 0, impressions: 220, ctr: 0, position: 11.2 }, { keys: ['clínica sorriso'], clicks: 9, impressions: 20, ctr: 0.45, position: 1 }]
        : [{ keys: ['dentista curitiba'], clicks: 1, impressions: 90, ctr: 0.011, position: 9.1 }];
    return new Response(JSON.stringify({ rows }), { status: 200 });
  });
  t.after(() => useGoogleFetch((...args) => fetch(...args)));
  const report = await searchReport('token', 'sc-domain:clinicasorriso.com.br', ['dentista curitiba', 'clareamento'], new Date('2026-11-22T12:00:00Z'));
  assert.ok(calls[0][0].includes(encodeURIComponent('sc-domain:clinicasorriso.com.br')));
  assert.deepEqual(report.range, { start: '2026-10-23', end: '2026-11-19' });
  assert.deepEqual(report.keywords.map(k => [k.keyword, k.position, k.previous, k.change]), [['dentista curitiba', 6.4, 9.1, 2.7], ['clareamento', null, null, null]]);
  assert.deepEqual(report.opportunities.map(k => k.keyword), ['implante dentário curitiba', 'dentista curitiba']);
  assert.deepEqual([report.totals.clicks, report.totals.impressions, report.totals.position], [4, 400, 11]);
  await assert.rejects(searchReport('token', 'not a site', []), /Search Console/);
});

test('SEO audit and Visibility AI endpoints (audit stubbed, AI metered as "visibility")', async t => {
  const asked = [];
  const contentAI = { askAssistant: async (connection, { prompt }) => { asked.push(prompt); return { text: prompt.includes('clareamento') ? 'Clínica Sorriso é referência.' : 'Dental Prime.', sources: [] }; } };
  const audited = [];
  const prospectAudit = async (row, options) => { audited.push([row.website, options?.places]); return { website: { url: row.website, reachable: true, status: 200, title: 'Oi', health: { score: 50, parts: {}, seo: [], security: [], securityInfo: [], compliance: [] } } }; };
  const store = createSqliteStore(':memory:');
  const { server, host } = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, socialScheduler: false, contentAI, prospectAudit });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const post = (path, body) => fetch(`${base}${path}?workspace=demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  assert.equal((await post('/api/seo/audit')).status, 400, 'no site yet');
  assert.equal((await post('/api/seo/audit', { url: 'http://127.0.0.1/' })).status, 400, 'private addresses are refused');
  const audit = await post('/api/seo/audit', { url: 'https://clinicasorriso.com.br' });
  assert.equal(audit.status, 200, await audit.clone().text());
  assert.deepEqual(audited, [['https://clinicasorriso.com.br/', false]]);
  assert.equal((await post('/api/visibility/run')).status, 409, 'settings first');
  await post('/api/action', { type: 'visibility-settings', data: settings });
  const run = await post('/api/visibility/run');
  assert.equal(run.status, 200, await run.clone().text());
  const state = (await fetch(`${base}/api/state?workspace=demo`).then(r => r.json())).state;
  assert.deepEqual(asked.sort(), [...settings.prompts].sort());
  assert.deepEqual([state.seoAudits[0].url, state.visibilityRuns[0].mentioned], ['https://clinicasorriso.com.br/', 1]);
  assert.ok(state.ai.ledger.some(e => e.kind === 'visibility'));
  const search = await fetch(`${base}/api/seo/search?workspace=demo`).then(r => r.json());
  assert.equal(search.connected, false);
});
