import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';

async function publishedSite(t) {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const post = async (path, body) => (await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  const { id } = await post('/api/studio?workspace=demo', { mode: 'starter', kind: 'website', siteTemplate: 'corretora', name: 'Site', brief: 'Site' });
  await post('/api/studio/publish?workspace=demo', { id, publish: true });
  const send = fields => fetch(`${base}/s/demo/${id}`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _page: 'index', ...fields }) });
  const submission = async email => (await (await fetch(`${base}/api/state?workspace=demo`)).json()).state.submissions.find(s => s.email === email);
  return { send, submission };
}

test('The extra answer of a published site form is kept with the submission', async t => {
  const { send, submission } = await publishedSite(t);
  const sent = await send({ name: 'Ana', email: 'ana@example.test', phone: '11999990000', message: '  Vender meu imóvel\nno centro  ' });
  assert.equal(sent.status, 303);
  assert.match(sent.headers.get('location'), /sent=1/);
  assert.deepEqual((await submission('ana@example.test')).answers.at(-1), { key: 'message', label: 'Mensagem', value: 'Vender meu imóvel\nno centro' });

  await send({ name: 'Bia', email: 'bia@example.test' });
  assert.ok(!(await submission('bia@example.test')).answers.some(a => a.key === 'message'), 'no empty answer');

  await send({ name: 'Caio', email: 'caio@example.test', message: 'x'.repeat(6000) });
  assert.equal((await submission('caio@example.test')).answers.at(-1).value.length, 2000, 'long answers are cut, not refused');
});
