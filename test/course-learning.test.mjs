import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { makeServer } from '../server.mjs';
import { gradeQuiz } from '../course-learning.mjs';
import { createSqliteStore } from '../storage.mjs';

const save = (s, data, id) => execute(s, { type: 'save', key: 'courses', id, data });
const quiz = (extra = {}) => ({ passScore: 60, completionMessage: 'Mandou bem!', questions: [
  { id: 'q1', text: 'Qual é a capital do Brasil?', options: [{ id: 'a', text: 'Brasília', correct: true }, { id: 'b', text: 'Rio' }], explanation: 'Desde 1960.' },
  { id: 'q2', text: 'Quais são cores da bandeira?', multiple: true, options: [{ id: 'c', text: 'Verde', correct: true }, { id: 'd', text: 'Amarelo', correct: true }, { id: 'e', text: 'Roxo' }] }
], ...extra });

test('Courses keep submodules, quizzes, assignments, draft lessons and live sessions', () => {
  const s = blank();
  s.files.push({ id: 'pdf1', name: 'Roteiro.pdf', data: 'data:application/pdf;base64,AAAA' });
  assert.throws(() => save(s, { name: 'C', modules: [{ title: 'M', lessons: [{ title: 'Q', kind: 'quiz', quiz: { questions: [] } }] }] }), /pelo menos uma pergunta/);
  assert.throws(() => save(s, { name: 'C', modules: [{ title: 'M', lessons: [{ title: 'Q', kind: 'quiz', quiz: { questions: [{ text: 'P?', options: [{ text: 'a' }, { text: 'b' }] }] } }] }] }), /Marque a resposta certa/);
  assert.throws(() => save(s, { name: 'C', modules: [{ title: 'M', lessons: [{ title: 'Q', kind: 'quiz', quiz: { questions: [{ text: 'P?', options: [{ text: 'a', correct: true }, { text: 'b', correct: true }] }] } }] }] }), /escolha única/);
  assert.throws(() => save(s, { name: 'C', modules: [{ title: 'M', lessons: [{ title: 'T', kind: 'assignment', assignment: { attachments: ['nada'] } }] }] }), /Mídia Drive/);
  assert.throws(() => save(s, { name: 'C', modules: [{ title: 'M', lessons: [{ title: 'A' }] }], liveSessions: [{ title: 'Live', start: 'amanhã' }] }), /data e a hora/);
  const id = save(s, { name: 'Curso', sequential: true, modules: [{ title: 'Módulo 1', submodules: [{ id: 'sub1', title: 'Parte A' }], lessons: [
    { title: 'Boas-vindas', kind: 'text', body: 'Oi' }, { title: 'Prova', kind: 'quiz', quiz: quiz(), submoduleId: 'sub1' },
    { title: 'Entrega', kind: 'assignment', assignment: { attachments: ['pdf1'], graded: false }, submoduleId: 'nao-existe' },
    { title: 'Bônus', kind: 'text', published: false }] }],
    liveSessions: [{ title: 'Mentoria', start: '2026-12-01T22:00:00Z', duration: 90, joinUrl: 'https://meet.google.com/abc', recordingUrl: 'https://youtu.be/abcdefghijk' }] });
  const course = s.courses.find(row => row.id === id);
  const [m] = course.modules;
  assert.deepEqual(m.submodules, [{ id: 'sub1', title: 'Parte A' }]);
  assert.deepEqual(m.lessons.map(row => [row.kind, row.submoduleId, row.published]), [['text', '', true], ['assignment', '', true], ['text', '', false], ['quiz', 'sub1', true]], 'straight lessons first, then the submodule, as students see them');
  assert.equal(m.lessons[3].quiz.passScore, 60);
  assert.deepEqual(m.lessons[1].assignment, { attachments: ['pdf1'], graded: false, completionMessage: 'Recebemos sua entrega. Obrigado!' });
  assert.equal(course.sequential, true);
  assert.equal(course.liveSessions[0].duration, 90);
});

test('A quiz question counts only when the chosen options are exactly the right ones', () => {
  const lesson = { quiz: { passScore: 60, questions: quiz().questions.map(q => ({ ...q, options: q.options.map(o => ({ correct: false, ...o })) })) } };
  assert.deepEqual(gradeQuiz(lesson, [{ questionId: 'q1', optionIds: ['a'] }, { questionId: 'q2', optionIds: ['c', 'd'] }]).score, 100);
  const half = gradeQuiz(lesson, [{ questionId: 'q1', optionIds: ['a'] }, { questionId: 'q2', optionIds: ['c'] }]);
  assert.deepEqual([half.score, half.passed], [50, false]);
  assert.throws(() => gradeQuiz(lesson, [{ questionId: 'q1', optionIds: ['a'] }]), /todas as perguntas/);
  assert.throws(() => gradeQuiz(lesson, [{ questionId: 'q1', optionIds: ['a', 'b'] }, { questionId: 'q2', optionIds: ['c'] }]), /só uma opção/);
});

test('Portal: lessons in order, quiz with minimum score, graded assignment, live sessions and the course triggers', async t => {
  const store = createSqliteStore(':memory:');
  const { server, host } = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body, headers = {}) => {
    const r = await fetch(base + path, body === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: r.status, cookie: r.headers.get('set-cookie'), body: await r.json() };
  };
  const saveRemote = async (key, data) => { const r = await call('/api/action?workspace=demo', { type: 'save', key, data }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.id; };
  const later = new Date(Date.now() + 10 * 60000).toISOString(), past = new Date(Date.now() - 3 * 86400000).toISOString();
  const course = await saveRemote('courses', { name: 'Método', active: true, sequential: true, modules: [{ title: 'M1', lessons: [
    { id: 'l1', title: 'Introdução', kind: 'text', body: 'Leia' }, { id: 'l2', title: 'Prova', kind: 'quiz', quiz: quiz() },
    { id: 'l3', title: 'Plano de ação', kind: 'assignment', body: 'Monte seu plano', assignment: { graded: true, completionMessage: 'Vamos corrigir em 48h.' } }] }],
    liveSessions: [{ title: 'Ao vivo', start: later, duration: 60, joinUrl: 'https://meet.google.com/aaa' }, { title: 'Passada', start: past, duration: 60, joinUrl: 'https://meet.google.com/bbb', recordingUrl: 'https://vimeo.com/123456789' }] });
  const passedFlow = await saveRemote('workflows', { name: 'Passou', active: true, triggers: [{ type: 'course_quiz_submitted', config: { passed: 'yes' } }], steps: [{ type: 'internal_notification', config: { body: 'Nota {{trigger.score}}' } }] });
  const gradedFlow = await saveRemote('workflows', { name: 'Corrigida', active: true, triggers: [{ type: 'course_assignment_graded', config: { status: 'approved' } }], steps: [{ type: 'internal_notification', config: { body: 'ok' } }] });
  const api = '/api/client-portal/demo';
  const { body: invite } = await call(`${api}/admin`, { action: 'invite', email: 'aluna@example.test', courseIds: [course] });
  const cookie = (await call(`${api}/exchange`, { token: invite.accessPath.split('#access=')[1] })).cookie.split(';')[0];
  const as = { Cookie: cookie };
  const open = lesson => call(`${api}/course/${course}?lesson=${lesson}`, undefined, as);
  const progress = body => call(`${api}/progress/${course}`, body, as);

  const first = (await call(`${api}/course/${course}`, undefined, as)).body.course;
  assert.deepEqual(first.modules[0].lessons.map(row => [row.id, row.locked]), [['l1', false], ['l2', true], ['l3', true]]);
  assert.deepEqual(first.live.map(row => [row.title, Boolean(row.joinUrl), row.recordingEmbed]), [['Ao vivo', true, ''], ['Passada', false, 'https://player.vimeo.com/video/123456789']]);
  assert.equal((await open('l2')).status, 403);
  await progress({ lessonId: 'l1', done: true });
  const quizLesson = (await open('l2')).body.course.lesson;
  assert.equal(quizLesson.quiz.questions[0].options.some(option => 'correct' in option), false, 'right answers stay hidden before an attempt');
  assert.equal((await progress({ lessonId: 'l2', done: true })).status, 409, 'a quiz is not marked by hand');
  const failed = (await progress({ lessonId: 'l2', action: 'quiz', answers: [{ questionId: 'q1', optionIds: ['b'] }, { questionId: 'q2', optionIds: ['c', 'd'] }] })).body.course;
  assert.deepEqual([failed.lesson.quiz.attempt.score, failed.lesson.quiz.attempt.passed, failed.lesson.quiz.questions[0].explanation], [50, false, 'Desde 1960.']);
  assert.equal(failed.modules[0].lessons[2].locked, true, 'still locked after failing');
  const passed = (await progress({ lessonId: 'l2', action: 'quiz', answers: [{ questionId: 'q1', optionIds: ['a'] }, { questionId: 'q2', optionIds: ['c', 'd'] }] })).body.course;
  assert.deepEqual([passed.lesson.quiz.attempt.score, passed.lesson.quiz.attempt.message, passed.lesson.quiz.attempt.count], [100, 'Mandou bem!', 2]);
  assert.equal(passed.modules[0].lessons[1].done, true);

  assert.equal((await progress({ lessonId: 'l3', action: 'assignment', text: '', link: '' })).status, 400);
  const sent = (await progress({ lessonId: 'l3', action: 'assignment', text: 'Meu plano: vender mais', link: 'https://docs.google.com/x' })).body.course;
  assert.deepEqual([sent.lesson.assignment.submission.status, sent.lesson.assignment.message, sent.modules[0].lessons[2].done], ['submitted', 'Vamos corrigir em 48h.', false]);
  const list = (await call(`${api}/admin`, { action: 'submissions', courseId: course })).body.submissions;
  assert.deepEqual(list.map(row => [row.email, row.lesson, row.status, row.text]), [['aluna@example.test', 'Plano de ação', 'submitted', 'Meu plano: vender mais']]);
  const graded = (await call(`${api}/admin`, { action: 'grade', memberId: list[0].memberId, courseId: course, lessonId: 'l3', status: 'approved', feedback: 'Ótimo plano!' })).body.submissions;
  assert.deepEqual([graded[0].status, graded[0].feedback], ['approved', 'Ótimo plano!']);
  const done = (await open('l3')).body.course;
  assert.deepEqual(done.progress, { done: 3, total: 3, percent: 100 });
  assert.equal((await progress({ lessonId: 'l3', action: 'assignment', text: 'de novo' })).status, 409);

  const state = (await call('/api/state?workspace=demo')).body.state;
  assert.equal(state.runs.filter(row => row.workflowId === passedFlow).length, 1, 'only the passing attempt');
  assert.equal(state.runs.filter(row => row.workflowId === gradedFlow).length, 1);
  assert.ok(state.contacts.some(row => row.email === 'aluna@example.test'));
});
