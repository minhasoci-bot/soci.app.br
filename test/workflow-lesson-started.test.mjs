import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { triggerSpec } from '../ui/workflow-data.js';
import { makeClientPortal } from '../client-portal.mjs';
import { blank, execute } from '../model.mjs';

test('Staff previewing the portal never "start" a lesson; a student does', async t => {
  const store = createSqliteStore(':memory:');
  t.after(store.close);
  const events = [];
  const portal = makeClientPortal({ store, onCourseActivity: async (workspace, data) => { events.push(data); } });
  const state = blank();
  const courseId = execute(state, { type: 'save', key: 'courses', data: { name: 'Método', active: true, modules: [{ title: 'M1', lessons: [{ id: 'l1', title: 'Introdução', kind: 'text', body: 'Leia' }] }] } });
  const staff = await portal.admin('demo', state, { action: 'staff-enter', email: 'equipe@example.test', name: 'Equipe' });
  const staffSession = await portal.exchange('demo', staff.token, { staff: true });
  assert.equal((await portal.content('demo', state, staffSession, courseId)).course.lesson.id, 'l1');
  assert.deepEqual(events.filter(row => row.event === 'lesson_started'), []);

  const { accessPath } = await portal.admin('demo', state, { action: 'invite', email: 'aluno@example.test', courseIds: [courseId] });
  const session = await portal.exchange('demo', accessPath.split('#access=')[1]);
  await portal.content('demo', state, session, courseId);
  assert.deepEqual(events.filter(row => row.event === 'lesson_started'), [], 'the course page alone is not a lesson');
  await portal.content('demo', state, session, courseId, 'l1', { track: false });
  assert.deepEqual(events.filter(row => row.event === 'lesson_started'), [], 'a paused sub-account records nothing');
  await portal.content('demo', state, session, courseId, 'l1');
  await portal.content('demo', state, session, courseId, 'l1');
  assert.deepEqual(events.filter(row => row.event === 'lesson_started').map(row => [row.email, row.lessonId, row.lessonTitle]), [['aluno@example.test', 'l1', 'Introdução']]);
});

// T.1, área de membros: gatilho "Aula iniciada" (Lesson started do GHL).
test('"Aula iniciada" is a course trigger with a course filter', () => {
  const spec = triggerSpec('lesson_started');
  assert.equal(spec.label, 'Aula iniciada');
  assert.deepEqual(spec.fields.map(field => [field.key, field.source]), [['courseId', 'courses']]);
});

test('Opening a lesson in the portal fires "Aula iniciada" once per lesson; done lessons and other courses do not', async t => {
  const store = createSqliteStore(':memory:');
  const { server, host } = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body, headers = {}) => {
    const r = await fetch(base + path, body === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, ...headers }, body: JSON.stringify(body) });
    return { status: r.status, cookie: r.headers.get('set-cookie'), body: await r.json() };
  };
  const saveRemote = async (key, data, id) => { const r = await call('/api/action?workspace=demo', { type: 'save', key, id, data }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.id; };
  const state = async () => (await call('/api/state?workspace=demo')).body.state;
  const runsOf = (s, id) => s.runs.filter(row => row.workflowId === id);
  const until = async check => {
    for (let i = 0; i < 100; i++) { const s = await state(); if (check(s)) return s; await new Promise(resolve => setTimeout(resolve, 20)); }
    assert.fail('timed out waiting for the workflow');
  };

  const course = await saveRemote('courses', { name: 'Método', active: true, modules: [{ title: 'M1', lessons: [
    { id: 'l1', title: 'Introdução', kind: 'text', body: 'Leia' }, { id: 'l2', title: 'Prática', kind: 'text', body: 'Faça' }, { id: 'l3', title: 'Revisão', kind: 'text', body: 'Revise' }] }] });
  const other = await saveRemote('courses', { name: 'Outro', active: true, page: { productPage: false }, modules: [{ title: 'A', lessons: [{ id: 'o1', title: 'Só', kind: 'text', body: 'x' }] }] });
  const flow = (name, trigger, steps) => saveRemote('workflows', { name, active: true, triggers: [trigger], steps });
  const grant = await flow('Liberar', { type: 'contact_tag', config: { change: 'added', tag: 'aluno' } }, [
    { type: 'grant_course_access', config: { courseId: course } }, { type: 'grant_course_access', config: { courseId: other } }]);
  const started = await flow('Abriu aula', { type: 'lesson_started', config: { courseId: course } }, [{ type: 'internal_notification', config: { body: 'Abriu {{trigger.title}} de {{trigger.course}}' } }]);
  const any = await flow('Abriu qualquer', { type: 'lesson_started', config: {} }, [{ type: 'add_tag', config: { tag: 'abriu-aula' } }]);

  const ana = await saveRemote('contacts', { name: 'Ana Souza', email: 'ana.aula@example.test', tags: ['aluno'], custom: {} });
  await until(s => runsOf(s, grant).find(run => run.contactId === ana)?.results.filter(row => row.startsWith('Acesso:')).length === 2);

  const api = '/api/client-portal/demo';
  const { body: invite } = await call(`${api}/admin`, { action: 'invite', email: 'ana.aula@example.test' });
  const as = { Cookie: (await call(`${api}/exchange`, { token: invite.accessPath.split('#access=')[1] })).cookie.split(';')[0] };

  // The course's product page alone is not a lesson; "Começar o curso" asks for the lesson, once.
  assert.equal((await call(`${api}/course/${course}`, undefined, as)).body.course.lesson.id, 'l1');
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(runsOf(await state(), any).length, 0, 'the course page does not start a lesson');
  await call(`${api}/course/${course}?lesson=l1`, undefined, as);
  let s = await until(s => runsOf(s, started).length === 1);
  assert.equal(runsOf(s, started)[0].contactId, ana);
  assert.ok(s.teamMessages.some(row => row.body === 'Abriu aula: Abriu Introdução de Método'));
  await call(`${api}/course/${course}`, undefined, as);
  await call(`${api}/course/${course}?lesson=l1`, undefined, as);

  await call(`${api}/course/${course}?lesson=l2`, undefined, as);
  s = await until(s => runsOf(s, started).length === 2);

  // A lesson marked done before it was ever opened does not "start" afterwards.
  await call(`${api}/progress/${course}`, { lessonId: 'l3', done: true }, as);
  await call(`${api}/course/${course}?lesson=l3`, undefined, as);

  // Another course, with no product page, opens straight on its lesson: only the unfiltered workflow fires.
  await call(`${api}/course/${other}`, undefined, as);
  s = await until(s => runsOf(s, any).length === 3);
  assert.equal(runsOf(s, started).length, 2, 'reopening, done lessons and other courses never fire the filtered flow');
  assert.ok(s.contacts.find(row => row.id === ana).tags.includes('abriu-aula'));

  // A visitor without a session gets the sign-in error and fires nothing.
  assert.equal((await call(`${api}/course/${course}?lesson=l2`)).status, 401);
  assert.equal(runsOf(await state(), any).length, 3);
});
