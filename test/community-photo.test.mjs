import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { makeClientPortal } from '../client-portal.mjs';
import { createSqliteStore } from '../storage.mjs';
import { avatar } from '../ui/portal-community-feed.js';

const PHOTO = 'https://lh3.googleusercontent.com/a/foto-luiz=s96-c';

test('The team account photo is kept when the team enters the portal; only https photos', async () => {
  const store = createSqliteStore(':memory:');
  const { ready } = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, socialScheduler: false });
  await ready;
  const portal = makeClientPortal({ store, loadState: ws => store.load(ws) });
  const state = await store.load('demo');
  await portal.admin('demo', state, { action: 'staff-enter', email: 'luiz@example.test', name: 'Luiz Gustavo', photo: PHOTO });
  const photoOf = async email => (await store.load('portal-demo')).members.find(row => row.email === email).photo;
  assert.equal(await photoOf('luiz@example.test'), PHOTO);
  await portal.admin('demo', state, { action: 'staff-enter', email: 'luiz@example.test', name: 'Luiz Gustavo', photo: 'javascript:alert(1)' });
  assert.equal(await photoOf('luiz@example.test'), PHOTO, 'an invalid photo never replaces a good one');
  await portal.admin('demo', state, { action: 'staff-enter', email: 'bia@example.test', name: 'Bia', photo: 'http://inseguro.example/x.png' });
  assert.equal(await photoOf('bia@example.test'), undefined);
});

test('Community authors, members and the ranking carry the member photo', async t => {
  const store = createSqliteStore(':memory:');
  const { server, host } = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body, headers = {}) => {
    const response = await fetch(base + path, body === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: response.status, cookie: response.headers.get('set-cookie'), body: await response.json() };
  };
  const api = '/api/client-portal/demo';
  const group = (await call('/api/action', { type: 'save', key: 'communities', data: { name: 'Clube', visibility: 'public' } })).body.id;
  const { body } = await call(`${api}/admin`, { action: 'invite', email: 'luiz@example.test', name: 'Luiz Gustavo' });
  const luiz = { Cookie: (await call(`${api}/exchange`, { token: body.accessPath.split('#access=')[1] })).cookie.split(';')[0] };
  await store.change('portal-demo', doc => { doc.members.find(row => row.email === 'luiz@example.test').photo = PHOTO; });
  await call(`${api}/community/${group}`, { action: 'join' }, luiz);
  const posted = (await call(`${api}/community/${group}`, { action: 'post', body: 'Olá, pessoal' }, luiz)).body.community;
  assert.equal(posted.posts[0].author.photo, PHOTO);
  assert.equal(posted.members[0].photo, PHOTO);
  assert.equal(posted.leaderboard.top[0].photo, PHOTO);
  assert.equal((await call(`${api}/home`, undefined, luiz)).body.member.photo, PHOTO);
});

test('Avatars show the photo, keep the level and fall back to initials', () => {
  const html = avatar({ name: 'Luiz Gustavo', level: 2, photo: PHOTO });
  assert.match(html, /<img src="https:\/\/lh3\.googleusercontent\.com\/a\/foto-luiz=s96-c"[^>]*referrerpolicy="no-referrer"/);
  assert.match(html, /<b>2<\/b>/);
  assert.doesNotMatch(avatar({ name: 'Luiz', photo: 'javascript:alert(1)' }), /<img/);
  assert.match(avatar({ name: 'Luiz', photo: 'https://x.example/a"onerror="alert(1)' }), /&quot;onerror=&quot;/);
  assert.match(avatar({ name: 'Luiz Gustavo' }), />LG</);
});
