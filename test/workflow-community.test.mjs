import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';

// T.1, comunidades e portal: login no portal, post e comentário, pedido para entrar, pedido recusado e acesso removido.
test('T.1 community and portal triggers: login, posts, comments, join requests and lost access', async t => {
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
  const note = (s, flow) => runsOf(s, flow).map(run => s.teamMessages.find(row => row.body.startsWith(`${run.name}:`) && row.created >= run.created)?.body);
  const flow = (name, trigger, body) => saveRemote('workflows', { name, active: true, triggers: [trigger], steps: [{ type: 'internal_notification', config: { body } }] });

  const club = await saveRemote('communities', { name: 'Clube', visibility: 'public', moderation: { keywords: 'golpe' } });
  const vip = await saveRemote('communities', { name: 'VIP', visibility: 'private', questions: [{ text: 'Por que quer entrar?' }] });
  const portal = '/api/client-portal/demo';
  const signIn = async email => {
    const { body } = await call(`${portal}/admin`, { action: 'invite', email });
    return { Cookie: (await call(`${portal}/exchange`, { token: body.accessPath.split('#access=')[1] })).cookie.split(';')[0] };
  };
  // No workflow listens yet: signing in does not add a contact.
  await signIn('zeca@example.test');
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal((await state()).contacts.some(row => row.email === 'zeca@example.test'), false);
  const login = await flow('Login', { type: 'portal_login', config: {} }, 'primeiro={{trigger.first}}');
  const signup = await flow('Cadastro', { type: 'portal_login', config: { first: 'yes' } }, 'novo');
  const posted = await flow('Post', { type: 'community_post_created', config: { communityId: club } }, '{{trigger.community}}: {{trigger.title}}');
  const commented = await flow('Comentário', { type: 'community_comment_created', config: {} }, '{{trigger.body}} em {{trigger.title}}');
  const requested = await flow('Pedido', { type: 'community_join_requested', config: { communityId: vip } }, '{{trigger.answers}}');
  const rejected = await flow('Recusado', { type: 'community_join_rejected', config: {} }, '{{trigger.community}}');
  const revoked = await flow('Saiu', { type: 'community_access_revoked', config: {} }, '{{trigger.reason}}');
  const banned = await flow('Banido', { type: 'community_access_revoked', config: { reason: 'banned' } }, 'ban');

  // Login: the first sign-in is the signup; the team previewing the portal does not count.
  const ana = await signIn('ana.club@example.test');
  await signIn('ana.club@example.test');
  assert.equal((await call(`${portal}/admin-enter`, {})).status, 200);
  let s = await until(s => runsOf(s, login).length === 2);
  assert.deepEqual(note(s, login), ['Login: primeiro=yes', 'Login: primeiro=no']);
  assert.equal(runsOf(s, signup).length, 1);
  const anaContact = s.contacts.find(row => row.email === 'ana.club@example.test');
  assert.ok(runsOf(s, login).every(run => run.contactId === anaContact.id));

  // Posts and comments; a held post counts when the team approves it.
  const act = (group, body, who = ana) => call(`${portal}/community/${group}`, body, who);
  assert.equal((await act(club, { action: 'join' })).status, 200);
  assert.equal((await act(club, { action: 'post', title: 'Oi, gente', body: 'Cheguei agora' })).status, 200);
  assert.equal((await act(club, { action: 'post', title: 'Oferta', body: 'Isso não é golpe' })).status, 200);
  const doc = async () => (await store.load('community-demo')).groups;
  const memberId = async email => (await store.load('portal-demo')).members.find(row => row.email === email).id;
  const first = (await doc())[club].posts.find(row => row.title === 'Oi, gente');
  assert.equal((await act(club, { action: 'comment', postId: first.id, body: 'Bem-vinda!' })).status, 200);
  s = await until(s => runsOf(s, posted).length === 1 && runsOf(s, commented).length === 1);
  assert.deepEqual(note(s, posted), ['Post: Clube: Oi, gente'], 'the held post does not fire yet');
  assert.deepEqual(note(s, commented), ['Comentário: Bem-vinda! em Oi, gente']);
  const held = (await doc())[club].posts.find(row => row.title === 'Oferta');
  assert.ok(held.held);
  assert.equal((await call(`${portal}/community-admin/${club}`, { action: 'approve', postId: held.id })).status, 200);
  s = await until(s => runsOf(s, posted).length === 2);
  assert.equal(note(s, posted)[1], 'Post: Clube: Oferta');
  assert.equal((await call(`${portal}/community-admin/${club}`, { action: 'approve', postId: held.id })).status, 200);
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(runsOf(await state(), posted).length, 2, 'approving again does not fire twice');

  // A private group: the request, then the team refuses it.
  const bia = await signIn('bia.vip@example.test');
  assert.equal((await act(vip, { action: 'join', answers: [{ id: (await state()).communities.find(row => row.id === vip).questions[0].id, answer: 'Quero aprender' }] }, bia)).status, 200);
  s = await until(s => runsOf(s, requested).length === 1);
  assert.equal(note(s, requested)[0], 'Pedido: Por que quer entrar?: Quero aprender');
  const biaId = await memberId('bia.vip@example.test');
  assert.equal((await doc())[vip].members[biaId].status, 'requested');
  assert.equal((await call(`${portal}/community-admin/${vip}`, { action: 'remove', memberId: biaId })).status, 200);
  s = await until(s => runsOf(s, rejected).length === 1);
  assert.equal(note(s, rejected)[0], 'Recusado: VIP');
  assert.equal(runsOf(s, revoked).length, 0, 'a refused request is not a lost access');

  // Lost access: leaving, being banned, and a workflow taking it away.
  assert.equal((await act(club, { action: 'leave' })).status, 200);
  assert.equal((await act(club, { action: 'join' })).status, 200);
  const anaId = await memberId('ana.club@example.test');
  assert.equal((await call(`${portal}/community-admin/${club}`, { action: 'member', memberId: anaId, status: 'banned' })).status, 200);
  const cleo = await signIn('cleo.club@example.test');
  assert.equal((await act(club, { action: 'join' }, cleo)).status, 200);
  const away = await saveRemote('workflows', { name: 'Tirar', active: true, triggers: [{ type: 'contact_tag', config: { change: 'added', tag: 'sair' } }], steps: [{ type: 'revoke_community_access', config: { communityId: club } }] });
  const cleoContact = (await state()).contacts.find(row => row.email === 'cleo.club@example.test');
  await saveRemote('contacts', { ...cleoContact, tags: ['sair'] }, cleoContact.id);
  s = await until(s => runsOf(s, revoked).length === 3);
  assert.deepEqual(note(s, revoked), ['Saiu: left', 'Saiu: banned', 'Saiu: workflow']);
  assert.deepEqual(runsOf(s, revoked).map(run => run.contactId), [anaContact.id, anaContact.id, cleoContact.id]);
  assert.equal(runsOf(s, banned).length, 1, 'the reason filter keeps only the ban');
  assert.ok(runsOf(s, away)[0].results.includes('Acesso: Clube: membro removido'));
});
