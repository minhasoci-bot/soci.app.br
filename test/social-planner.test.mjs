// Social Planner 5.3: evergreen queue, recurring posts, RSS feeds, Threads/Bluesky and workflows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute, emitWorkflow } from '../model.mjs';
import { evergreenDue, feedPosts, parseFeed, queueNext, settle, workflowPost } from '../social-model.mjs';
import { nextOccurrence, occurrencesBetween, postIssues } from '../ui/social-data.js';
import { facets, publish, useFetch } from '../social-providers.mjs';

const reply = (body, status = 200, headers = { 'Content-Type': 'application/json' }) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
let n = 0;
const ids = { uid: () => `id${++n}`, now: () => new Date().toISOString() };

test('Recurring posts keep their wall-clock time across daylight saving and month ends', () => {
  // 9:00 in New York on the day before DST starts (UTC-5) → still 9:00 the next day (UTC-4).
  assert.equal(nextOccurrence('2026-03-07T14:00:00.000Z', { freq: 'daily' }, undefined, 'America/New_York'), '2026-03-08T13:00:00.000Z');
  // Monthly on the 31st: last day of shorter months, back to the 31st when the month has one.
  const series = ['2026-01-31T12:00:00.000Z'], rule = { freq: 'monthly', anchor: series[0] };
  for (let k = 0; k < 3; k++) series.push(nextOccurrence(series.at(-1), rule));
  assert.deepEqual(series.slice(1), ['2026-02-28T12:00:00.000Z', '2026-03-31T12:00:00.000Z', '2026-04-30T12:00:00.000Z']);
});

test('Weekly posts can repeat on chosen weekdays every N weeks and end after a count', () => {
  const start = '2026-11-16T12:00:00.000Z', rule = { freq: 'weekly', interval: 2, days: [1, 3], anchor: start }; // Mon and Wed, every other week (São Paulo)
  const dates = [start];
  for (let k = 0; k < 4; k++) dates.push(nextOccurrence(dates.at(-1), rule, dates.at(-1), 'America/Sao_Paulo'));
  assert.deepEqual(dates.map(d => d.slice(0, 10)), ['2026-11-16', '2026-11-18', '2026-11-30', '2026-12-02', '2026-12-14']);
  assert.equal(nextOccurrence(start, { freq: 'daily', count: 3, done: 3 }), '', 'the series ended after 3 posts');
  assert.equal(occurrencesBetween({ scheduleDate: start, recurrence: { freq: 'daily', count: 5, done: 2 } }, Date.parse('2026-11-01'), Date.parse('2026-12-31')).length, 3, 'the calendar shows only what is left');

  const s = blank();
  s.socialAccounts.push({ id: 'b', provider: 'bluesky', name: 'Eu' });
  const monday = '2030-01-07T12:00:00.000Z';
  assert.throws(() => execute(s, { type: 'social-post', data: { summary: 'oi', accountIds: ['b'], mode: 'schedule', scheduleDate: monday, recurrence: { freq: 'weekly', days: [2, 4] } } }), /não está entre os dias/);
  const id = execute(s, { type: 'social-post', data: { summary: 'oi', accountIds: ['b'], mode: 'schedule', scheduleDate: monday, recurrence: { freq: 'weekly', days: [1], count: 2 } } });
  const post = s.socialPosts.find(p => p.id === id);
  assert.deepEqual([post.recurrence.days, post.recurrence.count, post.recurrence.anchor], [[1], 2, monday]);

  post.status = 'in_progress';
  settle(s, id, [{ accountId: 'b', ok: true }], ids);
  assert.equal(post.status, 'scheduled'); assert.equal(post.recurrence.done, 1);
  post.status = 'in_progress';
  settle(s, id, [{ accountId: 'b', ok: true }], ids);
  assert.equal(post.status, 'published', 'the second post ends a series of 2');
  assert.equal(s.socialPosts.filter(p => p.parentId === id).length, 2);
});

test('A recurring occurrence that partly failed still counts as published', () => {
  const s = blank();
  s.socialAccounts.push({ id: 'a', provider: 'facebook' }, { id: 'b', provider: 'bluesky' });
  s.socialPosts.push({ id: 'p', status: 'in_progress', scheduleDate: '2026-01-01T09:00:00.000Z', recurrence: { freq: 'daily', interval: 1 }, accountIds: ['a', 'b'], results: [], media: [] });
  const outcome = settle(s, 'p', [{ accountId: 'a', ok: true, url: 'https://fb/1' }, { accountId: 'b', ok: false, error: 'Bluesky: fora do ar' }], ids);
  const copy = s.socialPosts.find(p => p.parentId === 'p');
  assert.equal(copy.status, 'published'); assert.match(copy.error, /fora do ar/);
  assert.deepEqual([outcome.status, outcome.url, outcome.networks, outcome.failed], ['published', 'https://fb/1', 'facebook,bluesky', 1]);
});

test('The evergreen queue fires each slot once on the local clock, even with several slots a day', () => {
  const s = blank();
  s.socialAccounts.push({ id: 'a', provider: 'facebook', name: 'Página' });
  s.socialCategories.push({ id: 'cat', name: 'Dicas', evergreen: true, slots: [{ day: 1, time: '09:00' }, { day: 1, time: '12:00' }], accountIds: ['a'] });
  s.socialPosts.push({ id: 'p1', created: '1', categoryId: 'cat', status: 'published', summary: 'Dica 1', media: [], accountIds: ['a'], source: 'post' },
    { id: 'p2', created: '2', categoryId: 'cat', status: 'draft', summary: 'Dica 2', media: [], accountIds: [], source: 'post' });
  const zone = 'America/Sao_Paulo'; // UTC-3: Monday 09:00 local = 12:00Z
  assert.equal(evergreenDue(s, new Date('2026-11-16T12:05:00Z'), zone)[0].summary, 'Dica 1');
  assert.equal(evergreenDue(s, new Date('2026-11-16T15:01:00Z'), zone)[0].summary, 'Dica 2', 'the 12:00 slot');
  assert.equal(evergreenDue(s, new Date('2026-11-16T15:20:00Z'), zone).length, 0, 'the 09:00 slot does not fire again after the 12:00 one');
  assert.equal(evergreenDue(s, new Date('2026-11-23T14:30:00Z'), zone).length, 0, 'a slot missed by more than an hour is skipped');
  assert.equal(s.socialPosts.find(p => p.id === 'p1').queueRuns, 1);

  const next = queueNext(s, s.socialCategories[0], new Date('2026-11-17T10:00:00Z'), zone);
  assert.equal(next.post.summary, 'Dica 1'); assert.equal(next.at, '2026-11-23T12:00:00.000Z', 'next Monday 09:00 local');
});

test('An evergreen queue without recycling sends each post once, then stops', () => {
  const s = blank();
  s.socialAccounts.push({ id: 'a', provider: 'facebook', name: 'Página' });
  const cat = execute(s, { type: 'save', key: 'socialCategories', data: { name: 'Uma vez', evergreen: true, recycle: false, slots: [{ day: 1, time: '09:00' }], accountIds: ['a'] } });
  assert.throws(() => execute(s, { type: 'save', key: 'socialCategories', data: { name: 'Sem conta', evergreen: true, slots: [{ day: 1, time: '09:00' }], accountIds: [] } }), /ao menos uma conta/);
  s.socialPosts.push({ id: 'p1', created: '1', categoryId: cat, status: 'published', summary: 'Única', media: [], accountIds: ['a'], source: 'post' });
  assert.equal(evergreenDue(s, new Date('2026-11-16T09:00:00Z'), 'UTC').length, 1);
  assert.equal(evergreenDue(s, new Date('2026-11-23T09:00:00Z'), 'UTC').length, 0, 'already sent once');
  assert.equal(queueNext(s, s.socialCategories.find(c => c.id === cat), new Date(), 'UTC').post, null);
});

const rss = `<?xml version="1.0"?><rss xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
  <item><title>Promoção de verão &#8211; 20% off</title><link>https://loja.example/verao</link><guid>v1</guid>
    <description><![CDATA[<p>Aproveite <b>hoje</b> &amp; amanhã</p>]]></description><media:content url="https://cdn.example/verao.jpg" medium="image"/></item>
  <item><title>Conteúdo patrocinado</title><link>https://loja.example/pub</link><guid>v2</guid><description>Promoção parceira</description></item>
  <item><title>Novidades do mês</title><link>https://loja.example/novidades</link><guid>v3</guid><description>&lt;p&gt;Veja &lt;img src="https://cdn.example/n.png"&gt; tudo&lt;/p&gt;</description></item>
</channel></rss>`;
const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title type="html">Post &amp; mais</title><link rel="self" href="https://blog.example/self"/><link rel="alternate" href="https://blog.example/post"/>
  <id>tag:1</id><summary>Resumo</summary></entry></feed>`;

test('RSS and Atom items are read with entities, links and images', () => {
  const [a, b, c] = parseFeed(rss);
  assert.deepEqual([a.title, a.link, a.guid, a.summary, a.image], ['Promoção de verão – 20% off', 'https://loja.example/verao', 'v1', 'Aproveite hoje & amanhã', 'https://cdn.example/verao.jpg']);
  assert.equal(b.image, '');
  assert.deepEqual([c.summary, c.image], ['Veja tudo', 'https://cdn.example/n.png'], 'escaped HTML in the description');
  const [entry] = parseFeed(atom);
  assert.deepEqual([entry.title, entry.link, entry.guid], ['Post & mais', 'https://blog.example/post', 'tag:1'], 'the alternate link, not rel=self');
});

test('Feeds filter items by keywords, add images and space scheduled posts apart', () => {
  const s = blank();
  s.socialAccounts.push({ id: 'a', provider: 'facebook', name: 'Página' });
  const cat = execute(s, { type: 'save', key: 'socialCategories', data: { name: 'Blog' } });
  const id = execute(s, { type: 'save', key: 'socialFeeds', data: { name: 'Loja', url: 'https://loja.example/rss', accountIds: ['a'], mode: 'schedule', include: 'promoção, novidades', exclude: 'patrocinado', spacing: 30, perCheck: 5, categoryId: cat } });
  const feed = s.socialFeeds.find(f => f.id === id);
  feed.seen = ['old']; // already read once: up to perCheck new items
  const at = Date.parse('2030-01-01T10:00:00Z');
  const made = feedPosts(s, feed, parseFeed(rss), { at, ...ids });
  assert.deepEqual(made.map(p => p.link), ['https://loja.example/novidades', 'https://loja.example/verao'], 'oldest first, sponsored item left out');
  assert.deepEqual(made.map(p => p.scheduleDate), ['2030-01-01T10:05:00.000Z', '2030-01-01T10:35:00.000Z']);
  assert.deepEqual(made.map(p => p.status), ['scheduled', 'scheduled']);
  assert.deepEqual(made[1].media, [{ url: 'https://cdn.example/verao.jpg', type: 'image' }]);
  assert.equal(made[0].categoryId, cat);
  assert.equal(feedPosts(s, feed, parseFeed(rss), { at, ...ids }).length, 0, 'items are not posted twice');

  const later = feedPosts(s, feed, [{ title: 'Novidades 2', link: 'https://loja.example/2', guid: 'v9', summary: '', image: '' }], { at, ...ids });
  assert.equal(later[0].scheduleDate, '2030-01-01T11:05:00.000Z', 'a later read keeps the spacing after the last scheduled post');
});

test('Workflows create social posts and react when a post is published', () => {
  const s = blank();
  s.socialAccounts.push({ id: 'a', provider: 'facebook', name: 'Página', status: 'connected' });
  const made = workflowPost(s, { body: 'Olá {{x}}', mode: 'schedule', delay: 10 }, text => String(text).replace('{{x}}', 'mundo'), { add: (st, key, row) => { const r = { id: 'np', ...row }; st[key].push(r); return r; } });
  assert.equal(made.status, 'scheduled');
  const post = s.socialPosts.find(p => p.id === 'np');
  assert.deepEqual([post.summary, post.accountIds, post.source], ['Olá mundo', ['a'], 'workflow']);
  assert.ok(Date.parse(post.scheduleDate) > Date.now() + 9 * 60_000);

  execute(s, { type: 'save', key: 'workflows', data: { name: 'Avisar falha', active: true, triggers: [{ type: 'social_post_published', config: { status: 'failed', network: 'facebook' } }],
    steps: [{ type: 'internal_notification', config: { body: 'Falhou: {{trigger.summary}}' } }] } });
  execute(s, { type: 'save', key: 'workflows', data: { name: 'Repostar', active: true, triggers: [{ type: 'review_received', config: {} }],
    steps: [{ type: 'create_social_post', config: { body: 'Nova avaliação!', mode: 'draft' } }] } });
  emitWorkflow(s, 'social_post_published', { postId: 'np', status: 'published', networks: 'facebook', summary: 'ok' });
  assert.equal(s.teamMessages.filter(m => /Falhou/.test(m.body)).length, 0, 'only failures');
  emitWorkflow(s, 'social_post_published', { postId: 'np', status: 'failed', networks: 'facebook', summary: 'Olá mundo' });
  assert.ok(s.teamMessages.some(m => m.body.includes('Falhou: Olá mundo')));
  emitWorkflow(s, 'review_received', { contactId: '', score: 5 });
  const draft = s.socialPosts.find(p => p.summary === 'Nova avaliação!');
  assert.deepEqual([draft?.status, draft?.source], ['draft', 'workflow'], 'the action runs without a contact');
});

test('Bluesky posts carry mentions, a link card, a first-comment reply and video', async t => {
  const calls = [];
  useFetch(async (url, init = {}) => {
    const u = new URL(url), body = typeof init.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : init.body;
    calls.push({ path: u.pathname, body, type: init.headers?.['Content-Type'] });
    if (u.pathname.endsWith('refreshSession')) return reply({ accessJwt: 'a2', refreshJwt: 'r2' });
    if (u.pathname.endsWith('resolveHandle')) return u.searchParams.get('handle') === 'amiga.bsky.social' ? reply({ did: 'did:plc:amiga' }) : reply({ error: 'InvalidRequest', message: 'Unable to resolve' }, 400);
    if (u.pathname.endsWith('uploadBlob')) return reply({ blob: { ref: init.headers['Content-Type'] } });
    if (u.pathname.endsWith('createRecord')) return reply({ uri: `at://did:plc:me/app.bsky.feed.post/${calls.filter(c => c.path.endsWith('createRecord')).length}`, cid: 'cid1' });
    if (u.host === 'loja.example' && u.pathname === '/oferta') return reply('<html><head><title>x</title><meta property="og:title" content="Oferta &amp; frete"><meta property="og:description" content="Só hoje"><meta property="og:image" content="https://loja.example/og.jpg"></head></html>', 200, { 'Content-Type': 'text/html' });
    if (u.host === 'loja.example' && u.pathname === '/og.jpg') return new Response(Buffer.from('img'), { headers: { 'Content-Type': 'image/jpeg' } });
    return reply({ error: { message: `unexpected ${u.href}` } }, 500);
  });
  t.after(() => useFetch((...a) => fetch(...a)));

  const f = await facets('Oi @amiga.bsky.social e @ninguem.example #promo');
  assert.deepEqual(f.map(x => x.features[0].$type.split('#')[1]), ['tag', 'mention']);
  assert.equal(f[1].features[0].did, 'did:plc:amiga');

  const account = { provider: 'bluesky', externalId: 'did:plc:me' }, secret = { token: 'a1', refresh: 'r1' };
  await publish(account, secret, { summary: 'Veja https://loja.example/oferta', link: 'https://loja.example/oferta', firstComment: 'Cupom: SOL10', media: [] }, []);
  const records = calls.filter(c => c.path.endsWith('createRecord')).map(c => c.body.record);
  assert.deepEqual(records[0].embed.external, { uri: 'https://loja.example/oferta', title: 'Oferta & frete', description: 'Só hoje', thumb: { ref: 'image/jpeg' } });
  assert.equal(records[1].text, 'Cupom: SOL10');
  assert.equal(records[1].reply.parent.uri, 'at://did:plc:me/app.bsky.feed.post/1');

  calls.length = 0;
  await publish(account, secret, { summary: 'Vídeo', media: [{ type: 'video' }] }, [{ type: 'video', mime: 'video/mp4', bytes: async () => Buffer.from('mp4') }]);
  const video = calls.find(c => c.path.endsWith('createRecord')).body.record.embed;
  assert.deepEqual([video.$type, video.video.ref], ['app.bsky.embed.video', 'video/mp4']);
  assert.match(postIssues({ accountIds: ['b'], summary: 'x', media: [{ type: 'video', url: 'https://x/v.mp4' }, { type: 'image', url: 'https://x/i.jpg' }] }, [{ id: 'b', provider: 'bluesky' }]).join(), /um vídeo por post/);
});

test('Threads posts the first comment as a reply to the new thread', async t => {
  const calls = [];
  useFetch(async (url, init = {}) => {
    const u = new URL(url), body = typeof init.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : init.body;
    calls.push({ path: u.pathname, body });
    if (u.pathname.endsWith('/threads')) return reply({ id: `c${calls.length}` });
    if (u.pathname.endsWith('/threads_publish')) return reply({ id: body.creation_id === 'c1' ? 'post1' : 'reply1' });
    if (/\/c\d+$/.test(u.pathname)) return reply({ status: 'FINISHED' });
    if (u.pathname.endsWith('/post1')) return reply({ permalink: 'https://threads.net/@me/post/1' });
    return reply({ error: { message: `unexpected ${u.href}` } }, 500);
  });
  t.after(() => useFetch((...a) => fetch(...a)));
  const out = await publish({ provider: 'threads', externalId: 'me' }, { token: 't' }, { summary: 'Oi Threads', firstComment: 'Link na bio', media: [] }, []);
  assert.equal(out.url, 'https://threads.net/@me/post/1');
  const replyContainer = calls.filter(c => c.path.endsWith('/threads'))[1].body;
  assert.deepEqual([replyContainer.media_type, replyContainer.text, replyContainer.reply_to_id], ['TEXT', 'Link na bio', 'post1']);
});
