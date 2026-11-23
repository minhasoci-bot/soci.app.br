import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { levelOf, levelThresholds } from '../community.mjs';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';

test('Community groups get a unique slug, default channel, points and nine levels', () => {
  const s = blank();
  const id = execute(s, { type: 'save', key: 'communities', data: { name: 'Clube das Vendas', description: 'Troca de ideias', visibility: 'public' } });
  const group = s.communities.find(row => row.id === id);
  assert.equal(group.slug, 'clube-das-vendas');
  assert.deepEqual(group.channels.map(channel => channel.name), ['Avisos']);
  assert.deepEqual(group.points, { post: 2, comment: 1, like: 1 });
  assert.equal(group.levels.length, 9);
  const twin = execute(s, { type: 'save', key: 'communities', data: { name: 'Clube das Vendas' } });
  assert.equal(s.communities.find(row => row.id === twin).slug, 'clube-das-vendas-2');
  assert.throws(() => execute(s, { type: 'save', key: 'communities', data: { name: '' } }), /nome/);
  assert.throws(() => execute(s, { type: 'save', key: 'communities', data: { name: 'X', channels: [] } }), /canal/);
  assert.throws(() => execute(s, { type: 'save', key: 'communities', data: { name: 'X', points: { post: -1 } } }), /pontos/);
  execute(s, { type: 'save', key: 'communities', id, data: { name: 'Clube', channels: [{ id: group.channels[0].id, name: 'Avisos' }, { name: 'Dúvidas' }] } });
  assert.equal(s.communities.find(row => row.id === id).slug, 'clube-das-vendas');
  assert.deepEqual(s.communities.find(row => row.id === id).channels.map(channel => channel.name), ['Avisos', 'Dúvidas']);
});

test('Levels follow the point thresholds', () => {
  assert.deepEqual(levelThresholds, [0, 5, 20, 65, 155, 515, 2015, 8015, 33015]);
  assert.deepEqual([0, 4, 5, 64, 65, 40000].map(levelOf), [1, 1, 2, 3, 4, 9]);
});

test('Members join, post, comment, like, vote and climb the leaderboard; moderators keep control', async t => {
  const store = createSqliteStore(':memory:');
  const { server, host } = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body, headers = {}) => {
    const response = await fetch(base + path, body === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: response.status, cookie: response.headers.get('set-cookie'), body: await response.json() };
  };
  const portal = '/api/client-portal/demo';
  const signIn = async email => {
    const { body } = await call(`${portal}/admin`, { action: 'invite', email });
    const token = body.accessPath.split('#access=')[1];
    return (await call(`${portal}/exchange`, { token })).cookie.split(';')[0];
  };
  const save = data => call('/api/action', { type: 'save', key: 'communities', data });
  const open = (await save({ name: 'Clube Aberto', visibility: 'public' })).body.id;
  const closed = (await save({ name: 'Clube Fechado', visibility: 'private' })).body.id;
  const ana = await signIn('ana@example.test'), bia = await signIn('bia@example.test');
  const as = cookie => ({ Cookie: cookie });
  const act = (group, body, cookie) => call(`${portal}/community/${group}`, body, as(cookie));
  const view = (group, cookie, query = '') => call(`${portal}/community/${group}${query}`, undefined, as(cookie));
  const admin = (body, group = '') => call(`${portal}/community-admin${group ? `/${group}` : ''}`, body);

  const home = (await call(`${portal}/home`, undefined, as(ana))).body;
  assert.deepEqual(home.communities.map(row => [row.name, row.membership]), [['Clube Aberto', null], ['Clube Fechado', null]]);
  assert.equal((await view(open, ana)).body.community.posts.length, 0);
  assert.equal((await act(open, { action: 'post', title: 'Oi', body: 'Antes de entrar' }, ana)).status, 403);
  assert.equal((await act(open, { action: 'join' }, ana)).body.community.membership.status, 'active');
  await act(open, { action: 'join' }, bia);

  const channel = (await view(open, ana)).body.community.group.channels[0].id;
  const posted = await act(open, { action: 'post', channelId: channel, title: 'Qual CRM vocês usam?', body: 'Quero indicações.', poll: ['Planilha', 'CRM'] }, ana);
  assert.equal(posted.status, 200);
  const post = posted.body.community.posts[0];
  assert.deepEqual([post.title, post.author.name, post.poll.options.map(option => option.text), post.mine], ['Qual CRM vocês usam?', 'ana', ['Planilha', 'CRM'], true]);
  assert.equal((await act(open, { action: 'post', channelId: channel, title: 'Link', body: 'x', link: 'javascript:alert(1)' }, ana)).status, 400);

  await act(open, { action: 'comment', postId: post.id, body: 'Uso CRM!' }, bia);
  await act(open, { action: 'like', postId: post.id }, bia);
  await act(open, { action: 'vote', postId: post.id, optionId: post.poll.options[1].id }, bia);
  const seen = (await view(open, bia)).body.community;
  const shown = seen.posts[0];
  assert.deepEqual([shown.likes, shown.liked, shown.comments.length, shown.poll.voted, shown.poll.total, shown.mine], [1, true, 1, post.poll.options[1].id, 1, false]);
  assert.deepEqual(seen.leaderboard.top.map(row => [row.name, row.points]), [['ana', 3], ['bia', 1]]);
  assert.equal(seen.leaderboard.me.points, 1);
  assert.equal((await act(open, { action: 'delete', postId: post.id }, bia)).status, 403);

  // Private groups need approval; banned members lose access.
  assert.equal((await act(closed, { action: 'join' }, ana)).body.community.membership.status, 'requested');
  assert.equal((await view(closed, ana)).body.community.posts, undefined);
  const overview = (await admin(undefined, closed)).body;
  const anaId = overview.members.find(row => row.status === 'requested').id;
  await admin({ action: 'member', memberId: anaId, status: 'active', role: 'moderator' }, closed);
  assert.equal((await view(closed, ana)).body.community.membership.role, 'moderator');

  const staff = await admin({ action: 'post', title: 'Bem-vindos', body: 'Regras do grupo', pinned: true }, open);
  const pinned = staff.body.posts.find(row => row.title === 'Bem-vindos');
  assert.equal(pinned.author.staff, true);
  assert.equal((await view(open, bia)).body.community.posts[0].id, pinned.id);
  const biaId = staff.body.members.find(row => row.name === 'bia').id;
  await admin({ action: 'member', memberId: biaId, status: 'banned' }, open);
  assert.equal((await view(open, bia)).status, 403);
  await admin({ action: 'delete', postId: post.id }, open);
  assert.equal((await view(open, ana)).body.community.posts.some(row => row.id === post.id), false);
  assert.equal((await act(open, { action: 'post', title: 'x', body: 'y' })).status, 401);
});

test('Academy courses open for members with access; posts may omit the title', async t => {
  const store = createSqliteStore(':memory:');
  const { server, host } = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body, headers = {}) => {
    const response = await fetch(base + path, body === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: response.status, cookie: response.headers.get('set-cookie'), body: await response.json() };
  };
  const portal = '/api/client-portal/demo';
  const save = (key, data) => call('/api/action', { type: 'save', key, data });
  const courseA = (await save('courses', { name: 'Curso A', lesson: 'Aula 1', body: '', active: true })).body.id;
  const courseB = (await save('courses', { name: 'Curso B', lesson: 'Aula 1', body: '', active: true })).body.id;
  const group = (await save('communities', { name: 'Clube', visibility: 'public', academy: { courses: [{ courseId: courseA }, { courseId: courseB, mode: 'separate' }] } })).body.id;
  const bare = (await save('communities', { name: 'Sem cursos', visibility: 'public' })).body.id;
  const { body } = await call(`${portal}/admin`, { action: 'invite', email: 'ana@example.test' });
  const ana = { Cookie: (await call(`${portal}/exchange`, { token: body.accessPath.split('#access=')[1] })).cookie.split(';')[0] };
  const act = input => call(`${portal}/community/${group}`, input, ana);
  const view = async id => (await call(`${portal}/community/${id}`, undefined, ana)).body.community;

  assert.equal((await call(`${portal}/course/${courseA}`, undefined, ana)).status, 404, 'not a member yet');
  assert.deepEqual((await view(group)).academy.map(row => [row.id, row.state]), [[courseA, 'join'], [courseB, 'unavailable']]);
  await act({ action: 'join' });
  const community = await view(group);
  assert.deepEqual(community.academy.map(row => [row.id, row.state]), [[courseA, 'open'], [courseB, 'unavailable']]);
  assert.equal(community.group.tabs.find(tab => tab.key === 'academy').visible, true);
  assert.deepEqual(community.group.layout.widgets.map(row => row.key), ['about', 'events', 'ranking', 'members']);
  assert.equal((await view(bare)).group.tabs.find(tab => tab.key === 'academy').visible, false, 'no courses, no Academia tab');

  const opened = await call(`${portal}/course/${courseA}`, undefined, ana);
  assert.equal(opened.status, 200);
  assert.equal((await call(`${portal}/course/${courseB}`, undefined, ana)).status, 404);
  assert.deepEqual((await call(`${portal}/home`, undefined, ana)).body.courses.map(row => row.id), [courseA]);
  const lessonId = opened.body.course.modules[0].lessons[0].id;
  assert.equal((await call(`${portal}/progress/${courseA}`, { lessonId, done: true }, ana)).status, 200);

  const posted = await act({ action: 'post', body: '  \nPrimeira linha do texto\nresto' });
  assert.equal(posted.status, 200);
  assert.deepEqual([posted.body.community.posts[0].title, posted.body.community.posts[0].titleAuto], ['Primeira linha do texto', true]);
  const titled = await act({ action: 'post', title: 'Com título', body: 'Texto' });
  assert.equal(titled.body.community.posts.find(row => row.title === 'Com título').titleAuto, false);
  assert.equal((await act({ action: 'post', title: 'Só título', body: '' })).status, 400);

  await act({ action: 'leave' });
  assert.equal((await call(`${portal}/course/${courseA}`, undefined, ana)).status, 404, 'leaving closes the included course');
  assert.equal((await call(`${portal}/progress/${courseA}`, { lessonId, done: false }, ana)).status, 404);
});
