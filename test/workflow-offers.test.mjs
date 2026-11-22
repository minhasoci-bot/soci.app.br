import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';

// T.1, ofertas e ranking: gatilhos de acesso à oferta e de nível no ranking; ações liberar/remover oferta e dar pontos.
test('T.1 offers and community ranking: offer access, points and level changes', async t => {
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
  const access = (s, id, contactId, n = 0) => (runsOf(s, id).filter(run => run.contactId === contactId)[n]?.results || []).filter(row => row.startsWith('Acesso:'));
  const notes = (s, name) => s.teamMessages.filter(row => row.body.startsWith(`${name}:`)).map(row => row.body);
  const until = async check => {
    for (let i = 0; i < 150; i++) { const s = await state(); if (check(s)) return s; await new Promise(resolve => setTimeout(resolve, 20)); }
    assert.fail('timed out waiting for the workflow delivery');
  };
  const tag = async (id, tags) => { const s = await state(); await saveRemote('contacts', { ...s.contacts.find(row => row.id === id), tags }, id); };

  const course = await saveRemote('courses', { name: 'Método', active: true, modules: [{ title: 'M1', lessons: [{ id: 'l1', title: 'Introdução', kind: 'text', body: 'Leia' }] }] });
  const club = await saveRemote('communities', { name: 'Clube', visibility: 'public' });
  const offer = await saveRemote('offers', { title: 'Pacote Completo', courseIds: [course], communityIds: [club], type: 'free', status: 'published' });
  const flow = (name, trigger, steps = [{ type: 'internal_notification', config: { body: name } }]) => saveRemote('workflows', { name, active: true, triggers: [trigger], steps });
  const grant = await flow('Liberar', { type: 'contact_tag', config: { change: 'added', tag: 'comprou' } }, [{ type: 'grant_offer', config: { offerId: offer } }]);
  const revoke = await flow('Remover', { type: 'contact_tag', config: { change: 'added', tag: 'cancelou' } }, [{ type: 'revoke_offer', config: { offerId: offer } }]);
  const points = await flow('Pontos', { type: 'contact_tag', config: { change: 'added', tag: 'desafio' } }, [{ type: 'community_points', config: { communityId: club, points: 4, note: 'Desafio da semana' } }]);
  const penalty = await flow('Penalidade', { type: 'contact_tag', config: { change: 'added', tag: 'spam' } }, [{ type: 'community_points', config: { communityId: club, points: -50 } }]);
  await flow('Oferta liberada', { type: 'offer_access_granted', config: { offerId: offer } }, [{ type: 'internal_notification', config: { body: '{{trigger.offer}}' } }]);
  await flow('Oferta removida', { type: 'offer_access_revoked', config: {} }, [{ type: 'internal_notification', config: { body: '{{trigger.offer}}' } }]);
  await flow('Subiu', { type: 'community_level_changed', config: { communityId: club, direction: 'up' } }, [{ type: 'internal_notification', config: { body: '{{trigger.levelName}} ({{trigger.previous}} → {{trigger.level}})' } }]);
  await flow('Desceu', { type: 'community_level_changed', config: { direction: 'down' } }, [{ type: 'internal_notification', config: { body: '{{trigger.level}}' } }]);

  // Granting the offer opens its course and community and fires "Acesso à oferta liberado" once.
  const ana = await saveRemote('contacts', { name: 'Ana Souza', email: 'ana.oferta@example.test', tags: ['comprou'], custom: {} });
  let s = await until(s => access(s, grant, ana).length && notes(s, 'Oferta liberada').length);
  assert.deepEqual(access(s, grant, ana), ['Acesso: Pacote Completo: acesso liberado']);
  assert.deepEqual(notes(s, 'Oferta liberada'), ['Oferta liberada: Pacote Completo']);
  const api = '/api/client-portal/demo';
  const { body: invite } = await call(`${api}/admin`, { action: 'invite', email: 'ana.oferta@example.test' });
  const as = { Cookie: (await call(`${api}/exchange`, { token: invite.accessPath.split('#access=')[1] })).cookie.split(';')[0] };
  assert.equal((await call(`${api}/course/${course}`, undefined, as)).status, 200);
  assert.equal((await call(`${api}/community/${club}`, undefined, as)).body.community.membership.status, 'active');
  await tag(ana, []);
  await tag(ana, ['comprou']);
  s = await until(s => access(s, grant, ana, 1).length);
  assert.deepEqual(access(s, grant, ana, 1), ['Acesso: Pacote Completo: já tinha acesso']);
  assert.equal(notes(s, 'Oferta liberada').length, 1, 'a grant that opens nothing does not fire again');

  // Points from a workflow (4: still level 1), then a post (+2 = 6) moves the member to level 2.
  await tag(ana, ['comprou', 'desafio']);
  s = await until(s => access(s, points, ana).length);
  assert.deepEqual(access(s, points, ana), ['Acesso: Clube: +4 ponto(s), total 4 (nível 1 · Nível 1)']);
  assert.equal(notes(s, 'Subiu').length, 0);
  assert.equal((await call(`${api}/community/${club}`, { action: 'post', title: 'Feito', body: 'Terminei o desafio' }, as)).status, 200);
  s = await until(s => notes(s, 'Subiu').length);
  assert.deepEqual(notes(s, 'Subiu'), ['Subiu: Nível 2 (1 → 2)']);
  const board = (await call(`${api}/community/${club}`, undefined, as)).body.community.leaderboard;
  assert.equal(board.me.points, 6, 'the bonus points are in the ranking');

  // Negative points take the member down; the "up" workflow stays quiet.
  await tag(ana, ['comprou', 'desafio', 'spam']);
  s = await until(s => notes(s, 'Desceu').length);
  assert.deepEqual(notes(s, 'Desceu'), ['Desceu: 1']);
  assert.equal(notes(s, 'Subiu').length, 1);

  // Removing the offer takes the course and the group away and fires "Acesso à oferta removido".
  await tag(ana, ['cancelou']);
  s = await until(s => access(s, revoke, ana).length && notes(s, 'Oferta removida').length);
  assert.deepEqual(access(s, revoke, ana), ['Acesso: Pacote Completo: acesso removido']);
  assert.equal((await call(`${api}/course/${course}`, undefined, as)).status, 404);
  const outsider = await saveRemote('contacts', { name: 'Bia', email: 'bia.oferta@example.test', tags: ['desafio'], custom: {} });
  s = await until(s => access(s, points, outsider).length);
  assert.deepEqual(access(s, points, outsider), ['Acesso: Clube: contato não é membro ativo']);

  // A free sign-up through the offer page also fires "Acesso à oferta liberado".
  assert.equal((await call(`/api/offer/demo/${offer}`, { name: 'Caio', email: 'caio.oferta@example.test' })).status, 200);
  s = await until(s => notes(s, 'Oferta liberada').length === 2);
  const caio = s.contacts.find(row => row.email === 'caio.oferta@example.test');
  assert.ok(s.runs.some(run => run.contactId === caio.id && run.name === 'Oferta liberada'));
});
