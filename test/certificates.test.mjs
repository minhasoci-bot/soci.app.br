import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { certificatePage } from '../course-credentials.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });

test('Templates, manual issuing (once per contact and subject), revoking and the page look', () => {
  const s = blank();
  assert.throws(() => save(s, 'certificateTemplates', { name: 'X' }), /título/);
  const tpl = save(s, 'certificateTemplates', { name: 'Evento', kind: 'certificate', category: 'event', title: 'Certificado de participação', lead: 'Certificamos que', verb: 'participou de', body: 'Carga horária: 8h', color: '#0E6BA8', style: 'moderno', signer: 'Ana', signerRole: 'Diretora' });
  const badge = save(s, 'certificateTemplates', { name: 'Indicador', kind: 'badge', title: 'Super indicador', verb: 'por' });
  const ana = save(s, 'contacts', { name: 'Ana Souza', email: 'ana@x.test', tags: [] }), bia = save(s, 'contacts', { name: 'Bia', email: 'bia@x.test', tags: [] });
  assert.throws(() => execute(s, { type: 'credential-issue', data: { templateId: tpl, contactIds: [ana] } }), /curso, evento/);
  const ids = execute(s, { type: 'credential-issue', data: { templateId: tpl, contactIds: [ana, bia, 'nada'], subject: 'Workshop de Vendas' } });
  assert.equal(ids.length, 2);
  assert.deepEqual(execute(s, { type: 'credential-issue', data: { templateId: tpl, contactIds: [ana], subject: 'Workshop de Vendas' } }), [ids[0]], 'same template, contact and subject: not twice');
  execute(s, { type: 'credential-issue', data: { templateId: badge, contactIds: [ana], subject: '10 indicações' } });
  const row = s.credentialsIssued.find(item => item.id === ids[0]);
  assert.deepEqual([row.kind, row.title, row.courseName, row.name, row.source], ['certificate', 'Certificado de participação', 'Workshop de Vendas', 'Ana Souza', 'manual']);
  let html = certificatePage(s, row);
  assert.match(html, /participou de <b>Workshop de Vendas<\/b>/);
  assert.match(html, /Carga horária: 8h/);
  assert.match(html, /class="moderno"/);
  assert.match(html, /--c:#0e6ba8/);
  execute(s, { type: 'credential-revoke', id: ids[0] });
  assert.ok(row.revokedAt);
  assert.match(certificatePage(s, row), /foi revogado/);
  execute(s, { type: 'credential-revoke', id: ids[0], data: { restore: true } });
  assert.equal(row.revokedAt, undefined);
  execute(s, { type: 'delete', key: 'certificateTemplates', id: tpl });
  html = certificatePage(s, row);
  assert.match(html, /Certificado de participação/, 'issued ones keep their title after the template goes');
});

test('Workflows issue certificates and badges from templates', () => {
  const s = blank();
  const tpl = save(s, 'certificateTemplates', { name: 'Treino', kind: 'certificate', category: 'training', title: 'Certificado de treinamento' });
  const badge = save(s, 'certificateTemplates', { name: 'VIP', kind: 'badge', title: 'Cliente VIP' });
  save(s, 'workflows', { name: 'Formatura', active: true, triggers: [{ type: 'contact_tag', config: { change: 'added', tag: 'formado' } }],
    steps: [{ type: 'issue_certificate', config: { templateId: tpl, subject: 'Turma de {{contact.first_name}}' } }, { type: 'issue_badge', config: { templateId: badge, subject: 'fidelidade' } }] });
  const notified = save(s, 'workflows', { name: 'Avisa', active: true, triggers: [{ type: 'certificate_issued', config: {} }], steps: [{ type: 'internal_notification', config: { body: 'Código {{trigger.code}}' } }] });
  const id = save(s, 'contacts', { name: 'Caio Lima', email: 'caio@x.test', tags: [] });
  const contact = s.contacts.find(row => row.id === id);
  save(s, 'contacts', { ...contact, tags: ['formado'] }, id);
  for (let i = 0; i < 5; i++) execute(s, { type: 'workflow-tick', data: { at: new Date(Date.now() + i * 1000).toISOString() } });
  const issued = s.credentialsIssued.filter(row => row.contactId === id);
  assert.deepEqual(issued.map(row => [row.kind, row.title, row.courseName, row.source]).sort(), [['badge', 'Cliente VIP', 'fidelidade', 'workflow'], ['certificate', 'Certificado de treinamento', 'Turma de Caio', 'workflow']]);
  assert.equal(s.runs.filter(row => row.workflowId === notified).length, 1);
});

test('Course analytics: students, completion, the lesson funnel and quiz and assignment numbers', async t => {
  const store = createSqliteStore(':memory:');
  const { server, host } = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body, headers = {}) => {
    const r = await fetch(base + path, body === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: r.status, cookie: r.headers.get('set-cookie'), body: await r.json() };
  };
  const saveRemote = async (key, data) => (await call('/api/action?workspace=demo', { type: 'save', key, data })).body.id;
  const tpl = await saveRemote('certificateTemplates', { name: 'Ouro', kind: 'certificate', title: 'Certificado Ouro' });
  const course = await saveRemote('courses', { name: 'Curso', active: true, credentials: { certificate: { enabled: true, templateId: tpl } }, modules: [{ title: 'M', lessons: [
    { id: 'l1', title: 'Aula', kind: 'text' },
    { id: 'l2', title: 'Prova', kind: 'quiz', quiz: { passScore: 100, questions: [{ id: 'q', text: 'Sim?', options: [{ id: 'y', text: 'Sim', correct: true }, { id: 'n', text: 'Não' }] }] } }] }] });
  const api = '/api/client-portal/demo';
  const join = async email => {
    const { body } = await call(`${api}/admin`, { action: 'invite', email, courseIds: [course] });
    return { Cookie: (await call(`${api}/exchange`, { token: body.accessPath.split('#access=')[1] })).cookie.split(';')[0] };
  };
  const ana = await join('ana@example.test'), bia = await join('bia@example.test');
  await join('caio@example.test');
  await call(`${api}/progress/${course}`, { lessonId: 'l1', done: true }, ana);
  await call(`${api}/progress/${course}`, { lessonId: 'l2', action: 'quiz', answers: [{ questionId: 'q', optionIds: ['y'] }] }, ana);
  await call(`${api}/progress/${course}`, { lessonId: 'l1', done: true }, bia);
  await call(`${api}/progress/${course}`, { lessonId: 'l2', action: 'quiz', answers: [{ questionId: 'q', optionIds: ['n'] }] }, bia);
  const { analytics: a } = (await call(`${api}/admin`, { action: 'course-analytics', courseId: course, days: 7 })).body;
  assert.deepEqual([a.days, a.students, a.started, a.completed, a.completionRate, a.averageProgress, a.active, a.certificates], [7, 3, 2, 1, 33, 50, 2, 1]);
  assert.deepEqual(a.funnel.map(row => [row.title, row.done, row.percent]), [['Aula', 2, 67], ['Prova', 1, 33]]);
  assert.deepEqual([a.funnel[1].takers, a.funnel[1].passed, a.funnel[1].averageScore], [2, 1, 50]);
  assert.deepEqual(a.rows.map(row => [row.email, row.percent, Boolean(row.certificate)]), [['ana@example.test', 100, true], ['bia@example.test', 50, false], ['caio@example.test', 0, false]]);
  const state = (await call('/api/state?workspace=demo')).body.state;
  assert.equal(state.credentialsIssued.find(row => row.kind === 'certificate').title, 'Certificado Ouro', 'the course used its template');
  const { summaries } = (await call(`${api}/admin`, { action: 'course-analytics' })).body;
  assert.deepEqual(summaries[course], { students: 3, completed: 1, average: 50 });
});
