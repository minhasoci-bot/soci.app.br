import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';

// T.1, canais privados da comunidade: gatilhos de acesso liberado/removido e ações de liberar/remover o canal.
test('T.1 private channels: only members with access see and use them; grant and revoke by the team and by workflows', async t => {
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

  const refused = await call('/api/action?workspace=demo', { type: 'save', key: 'communities', data: { name: 'Fechada', channels: [{ name: 'Só VIP', private: true }] } });
  assert.equal(refused.status, 400, 'at least one channel stays open');
  const club = await saveRemote('communities', { name: 'Clube', visibility: 'public', channels: [{ name: 'Geral' }, { name: 'VIP', private: true }] });
  const [general, vip] = (await state()).communities.find(row => row.id === club).channels;
  assert.deepEqual([general.private, vip.private], [false, true]);
  const channel = `${club}:${vip.id}`;
  const flow = (name, trigger, steps = [{ type: 'internal_notification', config: { body: '{{trigger.channel}}' } }]) => saveRemote('workflows', { name, active: true, triggers: [trigger], steps });
  const join = await flow('Entrar', { type: 'contact_tag', config: { change: 'added', tag: 'membro' } }, [{ type: 'grant_community_access', config: { communityId: club } }]);
  const grant = await flow('Liberar VIP', { type: 'contact_tag', config: { change: 'added', tag: 'vip' } }, [{ type: 'grant_channel_access', config: { channel } }]);
  const revoke = await flow('Tirar VIP', { type: 'contact_tag', config: { change: 'added', tag: 'sem-vip' } }, [{ type: 'revoke_channel_access', config: { channel } }]);
  await flow('Canal liberado', { type: 'community_channel_granted', config: { channel } });
  await flow('Canal removido', { type: 'community_channel_revoked', config: {} });

  const ana = await saveRemote('contacts', { name: 'Ana Souza', email: 'ana.canal@example.test', tags: ['membro'], custom: {} });
  let s = await until(s => access(s, join, ana).length);
  const api = '/api/client-portal/demo';
  const { body: invite } = await call(`${api}/admin`, { action: 'invite', email: 'ana.canal@example.test' });
  const as = { Cookie: (await call(`${api}/exchange`, { token: invite.accessPath.split('#access=')[1] })).cookie.split(';')[0] };
  const view = async () => (await call(`${api}/community/${club}`, undefined, as)).body.community;

  // The team posts in VIP: Ana does not see the channel nor the post, and cannot post there.
  assert.equal((await call(`${api}/community-admin/${club}`, { action: 'post', channelId: vip.id, title: 'Só para VIPs', body: 'Bastidores' })).status, 200);
  let mine = await view();
  assert.deepEqual(mine.group.channels.map(row => row.name), ['Geral']);
  assert.ok(!mine.posts.some(post => post.title === 'Só para VIPs'));
  assert.equal((await call(`${api}/community/${club}`, { action: 'post', channelId: vip.id, title: 'Oi', body: 'Entrei?' }, as)).status, 403);
  const hidden = (await call(`${api}/community-admin/${club}`)).body.posts.find(post => post.title === 'Só para VIPs');
  assert.equal((await call(`${api}/community/${club}`, { action: 'comment', postId: hidden.id, body: 'Olá' }, as)).status, 403);

  // A workflow gives VIP: Ana sees it, comments, and "Acesso a canal privado liberado" fires once.
  await tag(ana, ['membro', 'vip']);
  s = await until(s => access(s, grant, ana).length && notes(s, 'Canal liberado').length);
  assert.deepEqual(access(s, grant, ana), ['Acesso: #VIP: acesso liberado']);
  assert.deepEqual(notes(s, 'Canal liberado'), ['Canal liberado: VIP']);
  mine = await view();
  assert.deepEqual(mine.group.channels.map(row => row.name), ['Geral', 'VIP']);
  assert.ok(mine.posts.some(post => post.title === 'Só para VIPs'));
  assert.equal((await call(`${api}/community/${club}`, { action: 'comment', postId: hidden.id, body: 'Olá' }, as)).status, 200);
  const admin = (await call(`${api}/community-admin/${club}`)).body;
  const anaMember = admin.members.find(row => row.email === 'ana.canal@example.test');
  assert.deepEqual(anaMember.channels, [vip.id], 'the team sees who has each private channel');

  // The team takes it away: the trigger fires for the team's change too.
  assert.equal((await call(`${api}/community-admin/${club}`, { action: 'channel-access', memberId: anaMember.id, channelId: vip.id, grant: false })).status, 200);
  s = await until(s => notes(s, 'Canal removido').length);
  assert.deepEqual(notes(s, 'Canal removido'), ['Canal removido: VIP']);
  assert.deepEqual((await view()).group.channels.map(row => row.name), ['Geral']);
  await tag(ana, ['membro', 'vip', 'sem-vip']);
  s = await until(s => access(s, revoke, ana).length);
  assert.deepEqual(access(s, revoke, ana), ['Acesso: #VIP: contato não tinha acesso']);
  assert.equal(notes(s, 'Canal removido').length, 1, 'no change, no trigger');
  assert.equal((await call(`${api}/community-admin/${club}`, { action: 'channel-access', memberId: anaMember.id, channelId: general.id, grant: true })).status, 404, 'open channels have no access list');
});
