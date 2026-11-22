import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';

// T.1, área de membros: gatilhos de aula concluída e de acesso a curso, ações de liberar/remover curso e comunidade.
test('T.1 members: course and community access actions, access and lesson triggers', async t => {
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
  // The access actions run after the save, in the server's delivery queue.
  const until = async check => {
    for (let i = 0; i < 100; i++) { const s = await state(); if (check(s)) return s; await new Promise(resolve => setTimeout(resolve, 20)); }
    assert.fail('timed out waiting for the workflow delivery');
  };

  const course = await saveRemote('courses', { name: 'Método', active: true, modules: [{ title: 'M1', lessons: [
    { id: 'l1', title: 'Introdução', kind: 'text', body: 'Leia' }, { id: 'l2', title: 'Prática', kind: 'text', body: 'Faça' }] }] });
  const group = await saveRemote('communities', { name: 'Clube', visibility: 'public' });
  const flow = (name, trigger, steps = [{ type: 'internal_notification', config: { body: name } }]) =>
    saveRemote('workflows', { name, active: true, triggers: [trigger], steps });
  const grant = await flow('Liberar', { type: 'contact_tag', config: { change: 'added', tag: 'aluno' } }, [
    { type: 'grant_course_access', config: { courseId: course } }, { type: 'grant_community_access', config: { communityId: group } }]);
  const revoke = await flow('Remover', { type: 'contact_tag', config: { change: 'added', tag: 'saiu' } }, [
    { type: 'revoke_course_access', config: { courseId: course } }, { type: 'revoke_community_access', config: { communityId: group } }]);
  const granted = await flow('Acesso liberado', { type: 'course_access_granted', config: { courseId: course } });
  const revoked = await flow('Acesso removido', { type: 'course_access_revoked', config: {} });
  const lesson = await flow('Aula feita', { type: 'lesson_completed', config: { courseId: course } }, [{ type: 'internal_notification', config: { body: 'Aula {{trigger.title}}' } }]);
  const joined = await flow('Entrou', { type: 'community_member_joined', config: { communityId: group } });
  const started = await flow('Começou', { type: 'course_started', config: { courseId: course } });
  const moduleDone = await flow('Módulo feito', { type: 'course_module_completed', config: {} }, [{ type: 'internal_notification', config: { body: 'Módulo {{trigger.module}}' } }]);

  const noEmail = await saveRemote('contacts', { name: 'Sem e-mail', tags: ['aluno'], custom: {} });
  assert.match(runsOf(await state(), grant).find(run => run.contactId === noEmail).results.join(' | '), /erro: contato sem e-mail/);

  const ana = await saveRemote('contacts', { name: 'Ana Souza', email: 'ana.membro@example.test', tags: ['aluno'], custom: {} });
  let s = await until(s => runsOf(s, grant).find(run => run.contactId === ana)?.results.filter(row => row.startsWith('Acesso:')).length === 2);
  assert.deepEqual(runsOf(s, grant).find(run => run.contactId === ana).results.filter(row => row.startsWith('Acesso:')), ['Acesso: Método: acesso liberado', 'Acesso: Clube: membro adicionado']);
  s = await until(s => runsOf(s, granted).length && runsOf(s, joined).length);
  assert.deepEqual([runsOf(s, granted).length, runsOf(s, granted)[0].contactId, runsOf(s, joined).length], [1, ana, 1]);

  // The member signs in: the course is there, and finishing a lesson fires "Aula concluída" once.
  const api = '/api/client-portal/demo';
  const { body: invite } = await call(`${api}/admin`, { action: 'invite', email: 'ana.membro@example.test' });
  const as = { Cookie: (await call(`${api}/exchange`, { token: invite.accessPath.split('#access=')[1] })).cookie.split(';')[0] };
  assert.equal((await call(`${api}/course/${course}`, undefined, as)).status, 200);
  assert.equal((await call(`${api}/community/${group}`, undefined, as)).body.community.membership.status, 'active');
  await call(`${api}/progress/${course}`, { lessonId: 'l1', done: true }, as);
  await call(`${api}/progress/${course}`, { lessonId: 'l1', done: true }, as);
  s = await until(s => runsOf(s, lesson).length);
  assert.equal(runsOf(s, lesson).length, 1, 'marking the same lesson again does not fire twice');
  assert.equal(runsOf(s, lesson)[0].contactId, ana);
  assert.ok(s.teamMessages.some(row => row.body === 'Aula feita: Aula Introdução'), 'the lesson title reaches {{trigger.title}}');
  // The portal sends the lessons done so far: the first one starts the course, the last one of M1 completes the module.
  s = await until(s => runsOf(s, started).length);
  assert.equal(runsOf(s, moduleDone).length, 0);
  await call(`${api}/progress/${course}`, { lessonId: 'l2', done: true }, as);
  s = await until(s => runsOf(s, moduleDone).length);
  assert.equal(runsOf(s, started).length, 1);
  assert.ok(s.teamMessages.some(row => row.body === 'Módulo feito: Módulo M1'));

  // Granting again changes nothing and fires nothing.
  const contact = s.contacts.find(row => row.id === ana);
  await saveRemote('contacts', { ...contact, tags: [] }, ana);
  await saveRemote('contacts', { ...contact, tags: ['aluno'] }, ana);
  s = await until(s => runsOf(s, grant).filter(run => run.contactId === ana).length === 2 && runsOf(s, grant).filter(run => run.contactId === ana)[1].results.some(row => row.includes('Clube')));
  assert.deepEqual(runsOf(s, grant).filter(run => run.contactId === ana)[1].results.filter(row => row.startsWith('Acesso:')), ['Acesso: Método: já tinha acesso', 'Acesso: Clube: já era membro (ou está banido)']);
  assert.equal(runsOf(s, granted).length, 1);

  // Removing takes the course and the group away, keeps the progress, and fires "Acesso a curso removido".
  await saveRemote('contacts', { ...contact, tags: ['aluno', 'saiu'] }, ana);
  s = await until(s => runsOf(s, revoke)[0]?.results.filter(row => row.startsWith('Acesso:')).length === 2 && runsOf(s, revoked).length);
  assert.deepEqual(runsOf(s, revoke)[0].results.filter(row => row.startsWith('Acesso:')), ['Acesso: Método: acesso removido', 'Acesso: Clube: membro removido']);
  assert.equal(runsOf(s, revoked)[0].contactId, ana);
  assert.equal((await call(`${api}/course/${course}`, undefined, as)).status, 404);
  assert.notEqual((await call(`${api}/community/${group}`, undefined, as)).body.community?.membership?.status, 'active');
});
