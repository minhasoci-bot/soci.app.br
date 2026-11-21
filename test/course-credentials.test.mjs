import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const lesson = { title: 'Aula 1', kind: 'text', body: 'Oi' };

test('Course look, page options, credentials and checkout offer are validated and unlinked when the offer goes', () => {
  const s = blank();
  const course = save(s, 'courses', { name: 'Curso', modules: [{ title: 'M', lessons: [lesson] }] });
  const plain = s.courses.find(row => row.id === course);
  assert.deepEqual([plain.theme, plain.credentials.badge.enabled, plain.credentials.certificate.enabled, plain.page.productPage], [null, false, false, true], 'older courses issue nothing until turned on');
  assert.throws(() => save(s, 'courses', { theme: { preset: 'custom', tokens: { primary: 'azul' } } }, course), /Principal/);
  assert.throws(() => save(s, 'courses', { page: { crossSellOfferId: 'nada' } }, course), /oferta/);
  assert.throws(() => save(s, 'courses', { instructor: { name: 'Ana', photoFileId: 'nada' } }, course), /foto do instrutor/);
  const offer = save(s, 'offers', { title: 'Curso completo', courseIds: [course], type: 'one_time', price: 197, status: 'published' });
  save(s, 'courses', { theme: { preset: 'floresta' }, instructor: { name: 'Ana Lima', title: 'Mentora', bio: 'Vende há 10 anos' }, offerId: offer,
    page: { crossSellOfferId: offer, crossSellText: 'Leve o pacote', nextCard: false }, credentials: { badge: { enabled: true }, certificate: { enabled: true, title: 'Certificado Ouro', signer: 'Ana Lima', signerRole: 'Mentora' } } }, course);
  const c = s.courses.find(row => row.id === course);
  assert.deepEqual([c.theme.preset, c.theme.tokens.primary, c.instructor.name, c.page.nextCard, c.page.crossSellOfferId, c.offerId], ['floresta', '#1f7a4d', 'Ana Lima', false, offer, offer]);
  assert.deepEqual(c.credentials, { badge: { enabled: true, title: 'Aluno matriculado', templateId: '' }, certificate: { enabled: true, title: 'Certificado Ouro', signer: 'Ana Lima', signerRole: 'Mentora', templateId: '' } });
  assert.equal(c.name, 'Curso', 'saving only the extras keeps the course');
  execute(s, { type: 'delete', key: 'offers', id: offer });
  assert.deepEqual([c.offerId, c.page.crossSellOfferId], ['', '']);
});

test('Portal: the badge comes when the course is opened, the certificate at 100%, once, with a public page', async t => {
  const store = createSqliteStore(':memory:');
  const { server, host } = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body, headers = {}) => {
    const r = await fetch(base + path, body === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const text = await r.text();
    return { status: r.status, cookie: r.headers.get('set-cookie'), csp: r.headers.get('content-security-policy'), body: r.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text };
  };
  const saveRemote = async (key, data) => { const r = await call('/api/action?workspace=demo', { type: 'save', key, data }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.id; };
  const course = await saveRemote('courses', { name: 'Método', active: true, modules: [{ title: 'M', lessons: [{ id: 'a1', ...lesson }, { id: 'a2', title: 'Aula 2', kind: 'text', body: 'Fim' }] }],
    instructor: { name: 'Ana Lima', title: 'Mentora' }, theme: { preset: 'oceano' },
    credentials: { badge: { enabled: true, title: 'Turma 2026' }, certificate: { enabled: true, signer: 'Ana Lima', signerRole: 'Mentora' } } });
  const done = await saveRemote('workflows', { name: 'Formou', active: true, triggers: [{ type: 'course_completed', config: { courseId: course } }], steps: [{ type: 'internal_notification', config: { body: 'Concluiu {{trigger.course}}' } }] });
  const api = '/api/client-portal/demo';
  const { body: invite } = await call(`${api}/admin`, { action: 'invite', email: 'aluno@example.test', courseIds: [course] });
  const cookie = (await call(`${api}/exchange`, { token: invite.accessPath.split('#access=')[1] })).cookie.split(';')[0];
  const as = { Cookie: cookie };
  const opened = (await call(`${api}/course/${course}`, undefined, as)).body.course;
  assert.equal(opened.badge.title, 'Turma 2026');
  assert.equal(opened.certificate, null);
  assert.deepEqual([opened.theme.preset, opened.instructor.name, opened.page.productPage], ['oceano', 'Ana Lima', true]);
  await call(`${api}/course/${course}`, undefined, as);
  let state = (await call('/api/state?workspace=demo')).body.state;
  assert.equal(state.credentialsIssued.filter(row => row.kind === 'badge').length, 1, 'opening again does not issue another badge');

  await call(`${api}/progress/${course}`, { lessonId: 'a1', done: true }, as);
  const finished = (await call(`${api}/progress/${course}`, { lessonId: 'a2', done: true }, as)).body.course;
  assert.equal(finished.progress.percent, 100);
  assert.match(finished.certificate.code, /^[0-9A-F]{12}$/);
  await call(`${api}/progress/${course}`, { lessonId: 'a2', done: false }, as);
  await call(`${api}/progress/${course}`, { lessonId: 'a2', done: true }, as);
  state = (await call('/api/state?workspace=demo')).body.state;
  const certificates = state.credentialsIssued.filter(row => row.kind === 'certificate');
  assert.equal(certificates.length, 1, 'finishing again keeps the same certificate');
  assert.equal(state.runs.filter(row => row.workflowId === done).length, 1);
  assert.ok(state.contacts.some(row => row.email === 'aluno@example.test'));

  const page = await call(`/certificado/demo/${certificates[0].code}`);
  assert.equal(page.status, 200);
  assert.match(page.body, /Certificado de conclusão/);
  assert.match(page.body, /aluno@example\.test|Aluno/i);
  assert.match(page.body, /Método/);
  assert.match(page.csp, /default-src 'none'/);
  assert.equal((await call('/certificado/demo/000000000000')).status, 404);
});
