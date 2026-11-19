import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { courseOutline, memberCourse, videoEmbed } from '../course-model.mjs';

const png = 'data:image/png;base64,iVBORw0KGgo=';
const pdf = 'data:application/pdf;base64,JVBERi0=';
const save = (s, data, id) => execute(s, { type: 'save', key: 'courses', id, data });

test('Courses keep modules and lessons, stable ids, and mirror the first lesson for older screens', () => {
  const s = blank();
  const cover = execute(s, { type: 'save', key: 'files', data: { name: 'capa.png', data: png } });
  const handout = execute(s, { type: 'save', key: 'files', data: { name: 'apostila.pdf', data: pdf } });
  const id = save(s, { name: 'Método Vendas', description: 'Do zero à primeira venda', coverFileId: cover, active: true, modules: [
    { id: 'm-intro', title: 'Comece aqui', lessons: [
      { id: 'l-boas-vindas', title: 'Boas-vindas', kind: 'video', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', body: 'Assista antes de tudo.' },
      { title: 'Apostila', kind: 'file', fileId: handout, dripDays: 3 }
    ] },
    { title: 'Prática', lessons: [{ title: 'Exercício 1', kind: 'text', body: 'Liste 10 clientes.', dripDays: 7 }] }
  ] });
  const course = s.courses.find(row => row.id === id);
  assert.deepEqual(course.modules.map(m => m.title), ['Comece aqui', 'Prática']);
  assert.equal(course.modules[0].id, 'm-intro');
  assert.equal(course.modules[0].lessons[0].id, 'l-boas-vindas');
  assert.match(course.modules[0].lessons[1].id, /^[\w-]{8,}$/);
  assert.deepEqual([course.lesson, course.body], ['Boas-vindas', 'Assista antes de tudo.']);
  assert.equal(course.modules[1].lessons[0].dripDays, 7);

  // Saving only the details keeps the outline.
  save(s, { name: 'Método Vendas 2.0' }, id);
  assert.equal(s.courses.find(row => row.id === id).modules.length, 2);

  assert.throws(() => save(s, { name: 'X', modules: [{ title: 'M', lessons: [{ title: 'A', kind: 'video', videoUrl: 'javascript:alert(1)' }] }] }), /https/);
  assert.throws(() => save(s, { name: 'X', modules: [{ title: 'M', lessons: [{ title: 'A', kind: 'file', fileId: 'nada' }] }] }), /Mídia Drive/);
  assert.throws(() => save(s, { name: 'X', coverFileId: handout }), /imagem/);
  assert.throws(() => save(s, { name: 'X', modules: [{ title: 'M', lessons: [{ title: '' }] }] }), /título/);
});

test('A single-lesson course from the old dialog or a snapshot still opens as one module', () => {
  const s = blank();
  const id = save(s, { name: 'Antigo', description: '', lesson: 'Aula única', body: 'Texto', active: true });
  const course = s.courses.find(row => row.id === id);
  assert.deepEqual(courseOutline(course).map(m => m.lessons.map(l => [l.title, l.kind, l.body])), [[['Aula única', 'text', 'Texto']]]);
  const legacy = { id: 'c1', name: 'Snapshot', lesson: 'Aula 1', body: 'Conteúdo', active: true };
  assert.equal(courseOutline(legacy)[0].lessons[0].title, 'Aula 1');
  assert.equal(courseOutline(legacy)[0].lessons[0].id, courseOutline(legacy)[0].lessons[0].id);
});

test('A member sees progress, lessons unlocked by drip days and only the content of the open lesson', () => {
  const s = blank();
  const handout = execute(s, { type: 'save', key: 'files', data: { name: 'apostila.pdf', data: pdf } });
  const id = save(s, { name: 'Curso', active: true, modules: [{ id: 'm1', title: 'M1', lessons: [
    { id: 'a', title: 'A', kind: 'text', body: 'Primeira' },
    { id: 'b', title: 'B', kind: 'file', fileId: handout, dripDays: 2 },
    { id: 'c', title: 'C', kind: 'text', body: 'Terceira', dripDays: 10 }
  ] }] });
  const course = s.courses.find(row => row.id === id);
  const start = Date.parse('2026-11-01T12:00:00Z');
  const member = { joinedAt: new Date(start).toISOString(), grantedAt: {}, progress: { [id]: { a: '2026-11-02T00:00:00Z', zzz: 'x' } } };
  const view = memberCourse(s, course, member, { now: start + 3 * 86400000, lessonId: 'b' });
  assert.deepEqual(view.modules[0].lessons.map(l => [l.id, l.done, l.locked]), [['a', true, false], ['b', false, false], ['c', false, true]]);
  assert.equal(view.modules[0].lessons[2].availableAt, new Date(start + 10 * 86400000).toISOString());
  assert.deepEqual(view.progress, { done: 1, total: 3, percent: 33 });
  assert.equal(view.lesson.id, 'b');
  assert.deepEqual(view.lesson.file, { name: 'apostila.pdf', data: pdf });
  assert.equal(JSON.stringify(view).includes('Terceira'), false);
  assert.throws(() => memberCourse(s, course, member, { now: start, lessonId: 'c' }), /liberada/);
  assert.equal(memberCourse(s, course, member, { now: start }).lesson.id, 'a');
  assert.equal(memberCourse(s, course, member, { now: start + 3 * 86400000 }).lesson.id, 'b');
});

test('Video links become privacy-friendly embeds only for known players', () => {
  assert.equal(videoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.equal(videoEmbed('https://youtu.be/dQw4w9WgXcQ'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.equal(videoEmbed('https://vimeo.com/76979871'), 'https://player.vimeo.com/video/76979871');
  assert.equal(videoEmbed('https://www.loom.com/share/0123456789abcdef0123456789abcdef'), 'https://www.loom.com/embed/0123456789abcdef0123456789abcdef');
  assert.equal(videoEmbed('https://cdn.example/aula.mp4'), '');
});
