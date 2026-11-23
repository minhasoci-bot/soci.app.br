import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { academyView, includedCourseIds } from '../community-academy.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const setup = () => {
  const s = blank();
  const a = save(s, 'courses', { name: 'Curso A', lesson: 'Aula 1', body: '', active: true });
  const b = save(s, 'courses', { name: 'Curso B', lesson: 'Aula 1', body: '', active: true });
  const offer = save(s, 'offers', { title: 'Curso B completo', courseIds: [b], type: 'one_time', price: 97, status: 'published' });
  const other = save(s, 'offers', { title: 'Só o A', courseIds: [a], type: 'free', status: 'published' });
  const group = save(s, 'communities', { name: 'Clube' });
  return { s, a, b, offer, other, group, academy: () => s.communities.find(row => row.id === group).academy };
};

test('Academy settings validate courses, modes and offers', () => {
  const { s, a, b, offer, other, group, academy } = setup();
  assert.deepEqual(academy(), { courses: [] });
  save(s, 'communities', { academy: { courses: [{ courseId: a }, { courseId: b, mode: 'separate', offerId: offer }, { courseId: a }] } }, group);
  assert.deepEqual(academy().courses, [{ courseId: a, mode: 'included', offerId: '' }, { courseId: b, mode: 'separate', offerId: offer }]);
  assert.throws(() => save(s, 'communities', { academy: { courses: [{ courseId: 'nao-existe' }] } }, group), /não encontrado/);
  assert.throws(() => save(s, 'communities', { academy: { courses: Array.from({ length: 31 }, () => ({ courseId: a })) } }, group), /30/);
  assert.throws(() => save(s, 'communities', { academy: { courses: [{ courseId: b, mode: 'separate', offerId: other }] } }, group), /não inclui/);
  save(s, 'communities', { name: 'Outro' }, group);
  assert.equal(academy().courses.length, 2, 'saving other fields keeps the academy');
});

test('Academy view gives open, join, buy and unavailable states', () => {
  const { s, a, b, offer, group } = setup();
  save(s, 'communities', { academy: { courses: [{ courseId: a }, { courseId: b, mode: 'separate' }] } }, group);
  const g = () => s.communities.find(row => row.id === group);
  const member = { id: 'm1', courseIds: [], joinedAt: '2026-01-01T00:00:00Z' };
  const states = (who, allowed) => academyView(s, g(), who, { workspace: 'demo', allowed }).map(row => [row.name, row.state]);
  assert.deepEqual(states(member, false), [['Curso A', 'join'], ['Curso B', 'buy']]);
  assert.deepEqual(states(member, true), [['Curso A', 'open'], ['Curso B', 'buy']]);
  const card = academyView(s, g(), member, { workspace: 'demo', allowed: true })[1];
  assert.equal(card.offerUrl, `/oferta/demo/${offer}`);
  assert.equal(card.priceLabel, new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(97));
  assert.equal(card.mode, 'separate');
  assert.equal(typeof academyView(s, g(), member, { workspace: 'demo', allowed: true })[0].progress.total, 'number');
  save(s, 'offers', { status: 'draft' }, offer);
  assert.deepEqual(states(member, true), [['Curso A', 'open'], ['Curso B', 'unavailable']]);
  assert.deepEqual(states({ ...member, courseIds: [b] }, false), [['Curso A', 'join'], ['Curso B', 'open']]);
  save(s, 'courses', { active: false }, a);
  assert.deepEqual(states(member, true).map(([name]) => name), ['Curso B'], 'inactive courses are hidden');
});

test('includedCourseIds respects access and deletes cascade', () => {
  const { s, a, b, offer, group, academy } = setup();
  save(s, 'communities', { academy: { courses: [{ courseId: a }, { courseId: b, mode: 'separate', offerId: offer }] } }, group);
  const doc = status => ({ groups: { [group]: { members: { m1: { status, joinedAt: '2026-01-01T00:00:00Z' } }, posts: [] } } });
  assert.deepEqual(includedCourseIds(s, doc('active'), 'm1'), [a]);
  assert.deepEqual(includedCourseIds(s, doc('banned'), 'm1'), []);
  assert.deepEqual(includedCourseIds(s, doc('active'), 'outro'), []);
  save(s, 'communities', { access: 'paid', plans: [{ name: 'Mensal', price: 10, interval: 'month' }] }, group);
  const expired = doc('active'); expired.groups[group].members.m1.paidUntil = '2020-01-01T00:00:00Z';
  assert.deepEqual(includedCourseIds(s, expired, 'm1'), []);
  execute(s, { type: 'delete', key: 'offers', id: offer });
  assert.deepEqual(academy().courses.map(row => [row.courseId, row.offerId]), [[a, ''], [b, '']]);
  execute(s, { type: 'delete', key: 'courses', id: a });
  assert.deepEqual(academy().courses.map(row => row.courseId), [b]);
});
