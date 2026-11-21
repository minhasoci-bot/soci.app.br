import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { blank, execute } from '../model.mjs';
import { seal } from '../social-providers.mjs';
import { listGoogleReviews, replyGoogleReview, updateLocation, useGoogleFetch } from '../google-integrations.mjs';
import { gbpChecklist, hoursPeriods, hoursRows } from '../ui/gbp-data.js';

const respond = data => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('The optimization checklist weighs a complete profile, posts and replied Google reviews', () => {
  const empty = gbpChecklist({});
  assert.equal(empty.score, 0);
  const full = gbpChecklist({ title: 'Loja', categories: { primaryCategory: { displayName: 'Café' }, additionalCategories: [{}] }, profile: { description: 'x'.repeat(260) },
    phoneNumbers: { primaryPhone: '11 9999' }, websiteUri: 'https://loja.test', regularHours: { periods: [{}] }, storefrontAddress: { addressLines: ['Rua A'] } },
  { reviews: [{ googleName: 'a', reply: 'Obrigado' }, { googleName: 'b', reply: 'Valeu' }], posts: 1 });
  assert.equal(full.score, 100);
  const partial = gbpChecklist({ title: 'Loja' }, { reviews: [{ googleName: 'a' }, { googleName: 'b', reply: 'ok' }] });
  assert.match(partial.items.find(item => item.id === 'replies').tip, /1 de 2/);
});

test('Hours convert between Google periods and one row per weekday', () => {
  const rows = hoursRows({ periods: [{ openDay: 'MONDAY', openTime: { hours: 8 }, closeDay: 'MONDAY', closeTime: { hours: 12 } }, { openDay: 'MONDAY', openTime: { hours: 14 }, closeDay: 'MONDAY', closeTime: { hours: 18, minutes: 30 } }] });
  assert.deepEqual(rows[0], { day: 'MONDAY', label: 'Segunda', open: true, from: '08:00', to: '12:00', split: true });
  assert.equal(rows[6].open, false);
  assert.deepEqual(hoursPeriods([{ day: 'TUESDAY', open: true, from: '09:00', to: '18:30' }, { day: 'SUNDAY', open: false }]),
    [{ openDay: 'TUESDAY', openTime: { hours: 9, minutes: 0 }, closeDay: 'TUESDAY', closeTime: { hours: 18, minutes: 30 } }]);
  assert.throws(() => hoursPeriods([{ day: 'FRIDAY', open: true, from: '18:00', to: '09:00' }]), /Sexta/);
});

test('Profile updates send only the edited fields, and reviews are read page by page', async t => {
  const calls = [];
  useGoogleFetch(async (url, init) => {
    calls.push({ url: String(url), method: init.method, body: init.body ? JSON.parse(init.body) : null });
    if (String(url).includes('/reviews?')) {
      return respond(String(url).includes('pageToken=p2')
        ? { reviews: [{ name: 'accounts/9/locations/1/reviews/r2', reviewer: { isAnonymous: true }, starRating: 'TWO', comment: 'Demorou (Translated by Google) Took long' }] }
        : { reviews: [{ name: 'accounts/9/locations/1/reviews/r1', reviewer: { displayName: 'Ana' }, starRating: 'FIVE', comment: 'Ótimo', reviewReply: { comment: 'Obrigado' }, createTime: '2026-10-01T10:00:00Z' }], nextPageToken: 'p2' });
    }
    return respond({});
  });
  t.after(() => useGoogleFetch((...args) => fetch(...args)));
  await updateLocation('tok', 'locations/1', { description: 'Café na Vila', hours: [] });
  assert.match(calls[0].url, /updateMask=profile\.description%2CregularHours/);
  assert.deepEqual(calls[0].body, { profile: { description: 'Café na Vila' }, regularHours: { periods: [] } });
  const reviews = await listGoogleReviews('tok', 'accounts/9', 'locations/1');
  assert.deepEqual(reviews.map(row => [row.author, row.score, row.text, row.reply]), [['Ana', 5, 'Ótimo', 'Obrigado'], ['Cliente do Google', 2, 'Demorou', '']]);
  await replyGoogleReview('tok', 'accounts/9/locations/1/reviews/r1', 'Valeu!');
  assert.equal(calls.at(-1).method, 'PUT');
  await replyGoogleReview('tok', 'accounts/9/locations/1/reviews/r1', '');
  assert.equal(calls.at(-1).method, 'DELETE');
  await assert.rejects(() => replyGoogleReview('tok', 'accounts/9/../../x', 'oi'), /inválida/);
});

test('Importing Google reviews adds, updates and only triggers workflows after the first sync', () => {
  const s = blank('Loja');
  const flow = execute(s, { type: 'save', key: 'workflows', data: { name: 'Nota', active: true, triggers: [{ type: 'review_received', config: {} }], steps: [{ type: 'internal_notification', config: { body: 'Nova avaliação' } }] } });
  const first = execute(s, { type: 'gbp-reviews-import', data: { reviews: [{ googleName: 'accounts/9/locations/1/reviews/r1', author: 'Ana', score: 5, text: 'Ótimo', created: '2026-10-01T10:00:00Z' }] } });
  assert.deepEqual(first, { added: 1, updated: 0, first: true });
  assert.equal(s.runs.filter(row => row.workflowId === flow).length, 0, 'old reviews do not run workflows');
  assert.equal(s.reviews.at(-1).created, '2026-10-01T10:00:00.000Z');
  const second = execute(s, { type: 'gbp-reviews-import', data: { reviews: [
    { googleName: 'accounts/9/locations/1/reviews/r1', author: 'Ana', score: 4, text: 'Bom' },
    { googleName: 'accounts/9/locations/1/reviews/r2', author: 'Bia', score: 3, text: 'Ok' }] } });
  assert.deepEqual(second, { added: 1, updated: 1, first: false });
  assert.equal(s.runs.filter(row => row.workflowId === flow).length, 1);
  assert.throws(() => execute(s, { type: 'listing-save', data: { id: 'orkut', status: 'ok' } }), /desconhecido/);
  execute(s, { type: 'listing-save', data: { id: 'apple', url: 'https://maps.apple.com/loja', status: 'divergent' } });
  assert.equal(s.listings.apple.status, 'divergent');
});

test('Business Profile routes: status, profile edit, review sync and replies published on Google', async t => {
  const store = createSqliteStore(':memory:');
  const google = [];
  useGoogleFetch(async (url, init) => {
    const href = String(url);
    google.push({ href, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    if (href.includes('/reviews?')) return respond({ reviews: [{ name: 'accounts/9/locations/1/reviews/r1', reviewer: { displayName: 'Ana' }, starRating: 'FOUR', comment: 'Bom café' }] });
    if (href.includes('mybusinessbusinessinformation') && (init.method || 'GET') === 'GET') return respond({ title: 'Café da Vila', profile: { description: 'Curta' }, phoneNumbers: { primaryPhone: '11 3333-4444' } });
    return respond({});
  });
  t.after(() => useGoogleFetch((...args) => fetch(...args)));
  const { server, host, ready } = makeServer({ store, port: 0, auth: null, allowLocalAccess: true, socialScheduler: false });
  await ready;
  store.insert('google-demo', { profile: { name: 'Google' }, google: { token: seal({ token: 'tok', refresh: 'ref', expiresAt: Date.now() + 3600_000 }), gbpLocation: 'locations/1',
    locations: [{ id: 'locations/1', name: 'Café da Vila', accountId: 'accounts/9' }] } });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, ...await r.json() }));

  const status = await fetch(`${base}/api/gbp/status`).then(r => r.json());
  assert.equal(status.name, 'Café da Vila');
  assert.ok(status.checklist.score > 0 && status.checklist.score < 100);
  assert.equal((await post('/api/gbp/profile', { description: 'Veja https://x.test' })).status, 400);
  assert.equal((await post('/api/gbp/profile', { hours: [{ day: 'MONDAY', open: true, from: '18:00', to: '08:00' }] })).status, 400);
  await post('/api/gbp/profile', { description: 'Café especial na Vila Madalena, com grãos de pequenos produtores.', website: 'https://cafe.test' });
  const patch = google.find(call => call.method === 'PATCH');
  assert.match(patch.href, /updateMask=profile\.description%2CwebsiteUri/);

  const sync = await post('/api/gbp/sync', {});
  assert.equal(sync.added, 1);
  const review = sync.state.reviews.find(row => row.googleName);
  assert.equal(review.source, 'Google');
  const reply = await post('/api/gbp/reply', { reviewId: review.id, reply: 'Obrigado, Ana!' });
  assert.equal(reply.ok, true);
  const put = google.find(call => call.method === 'PUT');
  assert.equal(put.href, 'https://mybusiness.googleapis.com/v4/accounts/9/locations/1/reviews/r1/reply');
  assert.deepEqual(put.body, { comment: 'Obrigado, Ana!' });
  assert.equal(reply.state.reviews.find(row => row.id === review.id).reply, 'Obrigado, Ana!');
  const other = await post('/api/action', { type: 'save', key: 'reviews', data: { author: 'Local', score: 5, text: 'Oi' } });
  assert.equal((await post('/api/gbp/reply', { reviewId: other.id, reply: 'x' })).status, 404, 'only Google reviews go to Google');
});
