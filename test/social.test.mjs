import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { useFetch, seal, unseal } from '../social-providers.mjs';
import { blank, execute } from '../model.mjs';
import { evergreenDue, settle } from '../social-model.mjs';
import { nextOccurrence, occurrencesBetween, parseCsv, postIssues } from '../ui/social-data.js';

const reply = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

// A fake of every network endpoint the tests touch. `calls` records what the planner sent.
function fakeNetworks() {
  const calls = [];
  useFetch(async (url, init = {}) => {
    const u = new URL(url), body = init.body && typeof init.body === 'string' ? (init.body.startsWith('{') ? JSON.parse(init.body) : Object.fromEntries(new URLSearchParams(init.body))) : init.body;
    calls.push({ url: u.href, method: init.method || 'GET', body, auth: init.headers?.Authorization });
    const path = u.pathname;
    if (u.host === 'graph.facebook.com') {
      if (path.endsWith('/oauth/access_token')) return reply({ access_token: u.searchParams.get('grant_type') ? 'long-user' : 'short-user' });
      if (path.endsWith('/me/accounts')) return reply({ data: [{ id: 'page1', name: 'Padaria Sol', access_token: 'page-token', picture: { data: { url: 'https://cdn.example/p.png' } },
        instagram_business_account: { id: 'ig1', username: 'padariasol', profile_picture_url: 'https://cdn.example/i.png' } }] });
      if (path.endsWith('/page1/feed')) return reply({ id: 'page1_99' });
      if (path.endsWith('/page1/photos')) return reply({ id: 'photo1', post_id: 'page1_77' });
      if (path.endsWith('/ig1/media')) return reply({ id: 'container1' });
      if (path.endsWith('/ig1/media_publish')) return reply({ id: 'igpost1' });
      if (path.endsWith('/igpost1')) return reply({ permalink: 'https://instagram.com/p/abc' });
      if (path.endsWith('/comments')) return reply({ id: 'c1' });
    }
    if (u.host === 'bsky.social') {
      if (path.endsWith('createSession')) return body.password === 'abcd-efgh-ijkl-mnop' ? reply({ did: 'did:plc:me', handle: 'me.bsky.social', accessJwt: 'a1', refreshJwt: 'r1' }) : reply({ error: 'AuthenticationRequired', message: 'Invalid identifier or password' }, 401);
      if (path.endsWith('getProfile')) return reply({ displayName: 'Eu no Bluesky' });
      if (path.endsWith('refreshSession')) return reply({ accessJwt: 'a2', refreshJwt: 'r2' });
      if (path.endsWith('createRecord')) return reply({ uri: 'at://did:plc:me/app.bsky.feed.post/3kxyz', cid: 'c' });
    }
    return reply({ error: { message: `unexpected ${u.href}` } }, 500);
  });
  return calls;
}

async function start() {
  const { server, host } = makeServer({ dbPath: ':memory:', port: 0, socialScheduler: false });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? { redirect: 'manual' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const text = await r.text();
    let json; try { json = JSON.parse(text); } catch { json = null; }
    return { status: r.status, body: json, text, location: r.headers.get('location'), type: r.headers.get('content-type') };
  };
  const workspace = (await call('/api/workspaces', { name: 'Social test' })).body.id;
  const q = path => `${path}${path.includes('?') ? '&' : '?'}workspace=${workspace}`;
  const act = command => call(q('/api/action'), command);
  const state = async () => (await call(q('/api/state'))).body.state;
  return { call, q, act, state, workspace, close: () => new Promise(resolve => server.close(resolve)) };
}

test('Posts validate accounts, media and character limits before they can be scheduled', () => {
  const accounts = [{ id: 'a', provider: 'instagram' }, { id: 'b', provider: 'bluesky' }];
  assert.deepEqual(postIssues({ accountIds: [], summary: 'oi', media: [] }, accounts), ['Escolha ao menos uma conta.']);
  assert.match(postIssues({ accountIds: ['a'], summary: 'oi', media: [] }, accounts).join(), /Instagram: adicione uma imagem/);
  assert.match(postIssues({ accountIds: ['b'], summary: 'x'.repeat(301), media: [] }, accounts).join(), /Bluesky: o texto passa de 300/);
  assert.deepEqual(postIssues({ accountIds: ['b'], summary: 'x'.repeat(301), overrides: { bluesky: 'curto' }, media: [] }, accounts), [], 'a per-network text replaces the main text');

  const s = blank();
  s.socialAccounts.push({ id: 'b', provider: 'bluesky', name: 'Eu' });
  assert.throws(() => execute(s, { type: 'social-post', data: { summary: 'oi', accountIds: ['b'], mode: 'schedule', scheduleDate: '2020-01-01T10:00:00Z' } }), /futuro/);
  assert.throws(() => execute(s, { type: 'social-post', data: { summary: 'oi', accountIds: ['zzz'], mode: 'draft' } }), /desconectada/);
  const draft = execute(s, { type: 'social-post', data: { summary: '', accountIds: [], mode: 'draft' } });
  assert.equal(s.socialPosts.find(p => p.id === draft).status, 'draft', 'drafts may be incomplete');
});

test('Recurring posts repeat and leave a published copy for each occurrence', () => {
  assert.equal(nextOccurrence('2026-01-01T09:00:00.000Z', { freq: 'weekly', interval: 1 }, '2026-01-01T09:00:00.000Z'), '2026-01-08T09:00:00.000Z');
  assert.equal(nextOccurrence('2026-01-01T09:00:00.000Z', { freq: 'daily', interval: 1, until: '2026-01-01T23:59:59.000Z' }), '');
  assert.equal(occurrencesBetween({ scheduleDate: '2026-01-01T09:00:00.000Z', recurrence: { freq: 'daily', interval: 2 } }, Date.parse('2026-01-01'), Date.parse('2026-01-08')).length, 4);

  const s = blank(); let n = 0;
  const ids = { uid: () => `id${++n}`, now: () => '2026-01-01T09:00:00.000Z' };
  s.socialPosts.push({ id: 'p', status: 'in_progress', scheduleDate: '2026-01-01T09:00:00.000Z', recurrence: { freq: 'daily', interval: 1 }, accountIds: ['a'], results: [], media: [] });
  settle(s, 'p', [{ accountId: 'a', ok: true, url: 'https://x' }], ids);
  const [parent, child] = s.socialPosts;
  assert.equal(parent.status, 'scheduled');
  assert.ok(parent.scheduleDate > '2026-01-01T09:00:00.000Z', 'the series moves to its next date');
  assert.equal(child.status, 'published'); assert.equal(child.parentId, 'p'); assert.equal(child.recurrence, null);
});

test('The evergreen queue reschedules category posts in rotation at its slots', () => {
  const s = blank();
  s.socialAccounts.push({ id: 'a', provider: 'facebook', name: 'Página' });
  s.socialCategories.push({ id: 'cat', name: 'Dicas', evergreen: true, slots: [{ day: 1, time: '09:00' }], accountIds: ['a'] });
  s.socialPosts.push({ id: 'p1', categoryId: 'cat', status: 'published', summary: 'Dica 1', media: [], accountIds: ['a'], source: 'post' },
    { id: 'p2', categoryId: 'cat', status: 'draft', summary: 'Dica 2', media: [], accountIds: [], source: 'post' });
  const monday = new Date('2026-11-16T09:05:00Z');
  const first = evergreenDue(s, monday, 'UTC');
  assert.equal(first.length, 1); assert.equal(first[0].summary, 'Dica 1'); assert.deepEqual(first[0].accountIds, ['a']);
  assert.equal(evergreenDue(s, new Date('2026-11-16T09:30:00Z'), 'UTC').length, 0, 'one post per slot');
  assert.equal(evergreenDue(s, new Date('2026-11-23T09:01:00Z'), 'UTC')[0].summary, 'Dica 2', 'the next slot picks the next post');
});

test('CSV reader handles quotes, semicolons and the template columns', () => {
  const rows = parseCsv('date;content;accounts\n2026-12-01 09:00;"Olá; mundo ""bom""";todas\n');
  assert.deepEqual(rows, [{ date: '2026-12-01 09:00', content: 'Olá; mundo "bom"', accounts: 'todas' }]);
});

test('Tokens are sealed so stored rows never hold them in clear text', () => {
  const box = seal({ token: 'secret-token' });
  assert.ok(!box.includes('secret-token'));
  assert.deepEqual(unseal(box), { token: 'secret-token' });
  assert.equal(unseal(box.slice(0, -4) + 'AAAA'), null, 'tampered values are rejected');
});

test('Facebook login connects pages and Instagram accounts, then posts publish to each network', async t => {
  process.env.META_APP_ID = 'app-id'; process.env.META_APP_SECRET = 'app-secret';
  t.after(() => { delete process.env.META_APP_ID; delete process.env.META_APP_SECRET; });
  const calls = fakeNetworks();
  const local = await start(); t.after(local.close);

  assert.equal((await local.call(local.q('/api/state'))).body.features.social.facebook, true);
  assert.equal((await local.call(local.q('/api/social/connect/linkedin'))).status, 409, 'networks without keys cannot start a login');

  const startLogin = await local.call(local.q('/api/social/connect/instagram'));
  assert.equal(startLogin.status, 302);
  const auth = new URL(startLogin.location);
  assert.equal(auth.host, 'www.facebook.com');
  assert.match(auth.searchParams.get('scope'), /instagram_content_publish/);
  assert.match(auth.searchParams.get('redirect_uri'), /\/api\/social\/callback\/facebook$/, 'Instagram shares the Facebook redirect');

  const bad = await local.call(`/api/social/callback/facebook?code=x&state=forged`);
  assert.match(bad.text, /expirou/);
  const back = await local.call(`/api/social/callback/facebook?code=good&state=${auth.searchParams.get('state')}`);
  assert.match(back.type, /text\/html/);
  const requestId = back.text.match(/"requestId":"([^"]+)"/)[1];
  assert.equal((await local.call(`/api/social/callback/facebook?code=good&state=${auth.searchParams.get('state')}`)).text.includes('expirou'), true, 'a state works once');

  const { candidates } = (await local.call(local.q('/api/social/candidates'), { requestId })).body;
  assert.deepEqual(candidates.map(x => [x.provider, x.name]), [['facebook', 'Padaria Sol'], ['instagram', 'padariasol']]);
  const attached = await local.call(local.q('/api/social/attach'), { requestId, picks: [0, 1] });
  assert.equal(attached.status, 200);
  const raw = JSON.stringify(attached.body.state);
  assert.ok(!raw.includes('page-token') && !raw.includes('long-user'), 'tokens never reach the browser');
  const [page, ig] = attached.body.state.socialAccounts;
  assert.equal(page.provider, 'facebook'); assert.equal(ig.provider, 'instagram');
  assert.equal((await local.call(local.q('/api/social/attach'), { requestId, picks: [0] })).status, 404, 'a pending login is used once');

  // Publish now on both networks with an image from the media drive.
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const file = (await local.act({ type: 'save', key: 'files', data: { name: 'foto.png', data: png } })).body.id;
  const media = await local.call(`/m/${local.workspace}/${file}`);
  assert.equal(media.status, 200); assert.equal(media.type, 'image/png');

  const post = (await local.act({ type: 'social-post', data: { summary: 'Pão quentinho saindo agora!', accountIds: [page.id, ig.id], media: [{ fileId: file }], firstComment: '#padaria', mode: 'now' } })).body.id;
  const run = await local.call(local.q('/api/social/run'), {});
  assert.equal(run.body.published, 1);
  const done = run.body.state.socialPosts.find(p => p.id === post);
  assert.equal(done.status, 'published', done.error);
  assert.deepEqual(done.results.map(r => r.url), ['https://www.facebook.com/page1_77', 'https://instagram.com/p/abc']);
  const photo = calls.find(c => c.url.includes('/page1/photos'));
  assert.equal(photo.body.caption, 'Pão quentinho saindo agora!');
  assert.match(photo.body.url, new RegExp(`/m/${local.workspace}/${file}$`), 'the network fetches the image from the public media route');
  assert.ok(calls.some(c => c.url.includes('/igpost1/comments') && c.body.message === '#padaria'), 'first comment is posted');

  // Approval: a post that needs approval waits in review until approved.
  const review = (await local.act({ type: 'social-post', data: { summary: 'Promo de sexta', accountIds: [page.id], needsApproval: true, mode: 'schedule', scheduleDate: new Date(Date.now() + 86_400_000).toISOString() } })).body.id;
  let s = await local.state();
  assert.equal(s.socialPosts.find(p => p.id === review).status, 'in_review');
  await local.act({ type: 'social-review', id: review, data: { decision: 'approved' } });
  s = await local.state();
  assert.equal(s.socialPosts.find(p => p.id === review).status, 'scheduled');
  assert.equal((await local.act({ type: 'social-post', id: post, data: { summary: 'editar', accountIds: [page.id], mode: 'draft' } })).status, 409, 'published posts are locked');

  // CSV: rows become scheduled posts; unknown accounts are reported per line.
  const csv = await local.act({ type: 'social-csv', data: { file: 'lote.csv', offset: '-03:00', rows: [
    { date: '2030-01-10 09:00', content: 'Post do lote', accounts: 'Padaria Sol' },
    { date: '2030-01-11 09:00', content: 'Outro', accounts: 'Conta que não existe' }] } });
  assert.equal(csv.body.id.created, 1); assert.match(csv.body.id.errors[0], /Linha 3/);
  s = await local.state();
  assert.equal(s.socialPosts.find(p => p.summary === 'Post do lote').scheduleDate, '2030-01-10T12:00:00.000Z', 'CSV times use the sub-account offset');

  // Disconnecting an account turns its only-scheduled posts back into drafts.
  await local.call(local.q('/api/social/disconnect'), { id: page.id });
  s = await local.state();
  assert.equal(s.socialPosts.find(p => p.id === review).status, 'draft');
});

test('Bluesky connects with an app password and publishes with link facets', async t => {
  const calls = fakeNetworks();
  const local = await start(); t.after(local.close);
  assert.equal((await local.call(local.q('/api/social/bluesky'), { identifier: 'me.bsky.social', password: 'minha-senha' })).status, 400, 'the main password is refused');
  assert.equal((await local.call(local.q('/api/social/bluesky'), { identifier: 'me.bsky.social', password: 'zzzz-zzzz-zzzz-zzzz' })).status, 502);
  const ok = await local.call(local.q('/api/social/bluesky'), { identifier: '@me.bsky.social', password: 'abcd-efgh-ijkl-mnop' });
  assert.equal(ok.status, 200);
  const account = ok.body.state.socialAccounts[0];
  assert.equal(account.name, 'Eu no Bluesky');
  await local.act({ type: 'social-post', data: { summary: 'Novo post https://graao.com #marketing', accountIds: [account.id], mode: 'now' } });
  const run = await local.call(local.q('/api/social/run'), {});
  const post = run.body.state.socialPosts[0];
  assert.equal(post.status, 'published', post.error);
  assert.equal(post.results[0].url, 'https://bsky.app/profile/did:plc:me/post/3kxyz');
  const record = calls.find(c => c.url.endsWith('createRecord')).body.record;
  assert.deepEqual(record.facets.map(f => f.features[0].$type), ['app.bsky.richtext.facet#link', 'app.bsky.richtext.facet#tag']);
  assert.equal(calls.find(c => c.url.endsWith('createRecord')).auth, 'Bearer a2', 'the session is refreshed before posting');
});
