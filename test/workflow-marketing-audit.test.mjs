import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { marketingAuditVars } from '../prospect-audit.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const steps = config => [{ type: 'marketing_audit', config: { variable: 'auditoria', ...config } }, { type: 'add_tag', config: { tag: 'nota {{vars.auditoria}}' } }];

const sample = {
  website: { url: 'https://clinica.test/', reachable: true, health: { score: 62, parts: { performance: 50, seo: 70, security: 75, compliance: 50 },
    seo: [{ key: 'title', label: 'Título da página', ok: true }, { key: 'description', label: 'Meta description', ok: false }],
    security: [{ key: 'hsts', label: 'HSTS ativo', ok: false }], compliance: [{ key: 'privacy', label: 'Política de privacidade', ok: null }] } },
  reputation: { score: 7.5 }, social: [{ label: 'Instagram' }]
};

test('T.1 marketing audit: the audit becomes variables and a plain summary', () => {
  const { vars } = marketingAuditVars(sample, 'aud');
  assert.equal(vars.aud, '62');
  assert.equal(vars.aud_seo, '70');
  assert.equal(vars.aud_reputacao, '7.5');
  assert.equal(vars.aud_site_ok, 'sim');
  assert.match(vars.aud_resumo, /Saúde do site: 62\/100/);
  assert.match(vars.aud_resumo, /A melhorar: Meta description; HSTS ativo\./);
  assert.match(vars.aud_resumo, /Redes no site: Instagram/);
  assert.deepEqual(marketingAuditVars({ website: { url: 'https://fora.test/', reachable: false, health: { score: 0 } } }).vars.auditoria_site_ok, 'nao');
  assert.match(marketingAuditVars(null).error, /não foi possível auditar/);
});

test('T.1 marketing audit: the run waits, resumes with the result and can note the summary', () => {
  const s = blank();
  const id = save(s, 'workflows', { name: 'Auditar', active: true, triggers: [{ type: 'contact_created' }], steps: steps({ website: 'https://{{contact.company}}.test', city: 'Recife' }) });
  const ana = save(s, 'contacts', { name: 'Ana', email: 'ana@x.test', company: 'clinica', tags: [], custom: {} });
  const run = s.runs.find(row => row.workflowId === id);
  const item = s.workflowOutbox.find(row => row.kind === 'marketing-audit');
  assert.equal(run.status, 'Waiting');
  assert.deepEqual([item.website, item.business, item.city, item.variable], ['https://clinica.test', 'clinica', 'Recife', 'auditoria'], 'the business name defaults to {{contact.company}}');
  execute(s, { type: 'workflow-ai-result', data: { results: [{ runId: run.id, stepId: item.stepId, ...marketingAuditVars(sample) }] } });
  assert.equal(run.status, 'Completed');
  assert.ok(s.contacts.find(row => row.id === ana).tags.includes('nota 62'));
  const note = s.messages.find(row => row.contactId === ana && row.channel === 'Note');
  assert.match(note.body, /^Auditoria de marketing\nSaúde do site: 62\/100/, 'the summary is noted by default');

  const quiet = blank();
  const q = save(quiet, 'workflows', { name: 'Sem nota', active: true, triggers: [{ type: 'contact_created' }], steps: steps({ website: 'https://x.test', note: 'no' }) });
  save(quiet, 'contacts', { name: 'Bia', email: 'bia@x.test', tags: [], custom: {} });
  const qRun = quiet.runs.find(row => row.workflowId === q), qItem = quiet.workflowOutbox.find(row => row.kind === 'marketing-audit');
  execute(quiet, { type: 'workflow-ai-result', data: { results: [{ runId: qRun.id, stepId: qItem.stepId, ...marketingAuditVars(sample) }] } });
  assert.equal(quiet.messages.filter(row => row.channel === 'Note').length, 0);
});

test('T.1 marketing audit: nothing to audit stops at the step; test runs do not audit', () => {
  const s = blank();
  const id = save(s, 'workflows', { name: 'Sem site', active: true, triggers: [{ type: 'contact_created' }], steps: steps({ business: '{{contact.company}}' }) });
  const ana = save(s, 'contacts', { name: 'Ana', email: 'ana@x.test', company: '', tags: [], custom: {} });
  assert.match(s.runs.find(row => row.workflowId === id).results.join(' '), /informe o site ou o nome da empresa/);
  const tested = execute(s, { type: 'workflow-test', data: { contactId: ana, workflow: { name: 'T', triggers: [{ type: 'contact_created' }], steps: steps({ website: 'https://x.test' }) } } });
  assert.match(JSON.stringify(tested), /\(teste\) auditoria não executada/);
  assert.equal((s.workflowOutbox || []).filter(row => row.kind === 'marketing-audit').length, 0);
});

test('T.1 marketing audit through the server: audited apart from the queue, then the run resumes', async t => {
  const calls = [];
  const prospectAudit = async row => { calls.push(row); return sample; };
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store: createSqliteStore(':memory:'), port: 0, prospectAudit });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => (await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  await call('/api/action?workspace=demo', { type: 'save', key: 'workflows', data: { name: 'Auditar no servidor', active: true, triggers: [{ type: 'contact_created' }], steps: steps({ website: 'https://clinica.test', business: '{{contact.company}}' }) } });
  await call('/api/action?workspace=demo', { type: 'save', key: 'contacts', data: { name: 'Carla', email: 'carla.audit@x.test', company: 'Clínica Carla', tags: [], custom: {} } });
  let run;
  for (let i = 0; i < 50 && run?.status !== 'Completed'; i++) {
    await new Promise(resolve => setTimeout(resolve, 20));
    run = (await call('/api/state?workspace=demo')).state.runs.find(row => row.name === 'Auditar no servidor');
  }
  assert.equal(run.status, 'Completed');
  assert.deepEqual(calls, [{ website: 'https://clinica.test', name: 'Clínica Carla', city: '' }]);
  assert.equal(run.vars.auditoria, '62');
});
