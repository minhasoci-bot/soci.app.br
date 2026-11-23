import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { academyView, includedCourseGrants, includedCourseIds, withCommunityGrants } from '../community-academy.mjs';
import { memberCourse } from '../course-model.mjs';

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

test('A chosen offer edited to drop the course no longer sells it', () => {
  const { s, a, b, offer, group } = setup();
  save(s, 'communities', { academy: { courses: [{ courseId: b, mode: 'separate', offerId: offer }] } }, group);
  const g = () => s.communities.find(row => row.id === group);
  const card = () => academyView(s, g(), { id: 'm1', courseIds: [] }, { workspace: 'demo', allowed: true })[0];
  save(s, 'offers', { courseIds: [a] }, offer);
  assert.deepEqual([card().state, card().offerUrl], ['unavailable', '']);
  const other = save(s, 'offers', { title: 'B de novo', courseIds: [b], type: 'one_time', price: 50, status: 'published' });
  assert.equal(card().offerUrl, `/oferta/demo/${other}`, 'falls back to a published offer that still has the course');
});

test('Included courses drip from the day the member joined the community', () => {
  const { s, group } = setup();
  const course = save(s, 'courses', { name: 'Com drip', active: true, modules: [{ title: 'M', lessons: [{ title: 'A', kind: 'text', body: 'x' }, { title: 'B', kind: 'text', body: 'y', dripDays: 7 }] }] });
  save(s, 'communities', { academy: { courses: [{ courseId: course }] } }, group);
  const now = Date.now(), joined = new Date(now - 86400e3).toISOString();
  const doc = { groups: { [group]: { members: { m1: { status: 'active', joinedAt: joined } }, posts: [] } } };
  const grants = includedCourseGrants(s, doc, 'm1');
  assert.deepEqual(grants, { [course]: joined });
  assert.deepEqual(includedCourseIds(s, doc, 'm1'), [course]);
  const portalMember = { id: 'm1', courseIds: [], joinedAt: new Date(now - 100 * 86400e3).toISOString() };
  const locked = member => memberCourse(s, s.courses.find(row => row.id === course), member, { now }).modules[0].lessons[1].locked;
  assert.equal(locked(portalMember), false, 'without the grant the portal sign-up opens it');
  assert.equal(locked(withCommunityGrants(portalMember, grants)), true);
  assert.equal(locked(withCommunityGrants({ ...portalMember, courseIds: [course], grantedAt: { [course]: portalMember.joinedAt } }, grants)), false, 'an own grant keeps its date');
});
