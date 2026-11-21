import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { blank, execute } from '../model.mjs';
import { CHUNK_BYTES, widgetContent } from '../reputation-media.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });

test('Widgets show only visible reviews above the minimum score, with short names and approved videos', () => {
  const s = blank('Loja');
  const a = save(s, 'reviews', { author: 'Ana Maria Lima', score: 5, text: 'Ótimo', reply: 'Obrigado!' });
  save(s, 'reviews', { author: 'Bruno', score: 2, text: 'Ruim' });
  const c = save(s, 'reviews', { author: 'Carla Dias', score: 4, text: 'Bom' });
  execute(s, { type: 'review-visibility', id: c, data: { hidden: true } });
  s.videoTestimonials.push({ id: 'v1', name: 'Davi Souza', status: 'approved', mime: 'video/webm' }, { id: 'v2', name: 'Eva', status: 'pending', mime: 'video/webm' });
  const widget = save(s, 'reviewWidgets', { name: 'Site', minScore: 4, showReplies: true, showVideos: true });
  const content = widgetContent(s, s.reviewWidgets.find(row => row.id === widget));
  assert.deepEqual(content.reviews.map(row => row.author), ['Ana L.']);
  assert.equal(content.reviews[0].reply, 'Obrigado!');
  assert.deepEqual(content.videos, [{ id: 'v1', name: 'Davi S.', mime: 'video/webm' }]);
  assert.equal(content.total, 3);
  assert.equal(s.reviews.find(row => row.id === a).hidden, undefined);
  assert.throws(() => save(s, 'videoTestimonials', { status: 'approved' }), /chegam pelo link/);
});

test('Video testimonials upload in ordered chunks, wait for approval and stream with ranges', async t => {
  const { server, host } = makeServer({ dbPath: ':memory:', port: 0, auth: null, allowLocalAccess: true, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, ...await r.json() }));
  const state = async () => (await fetch(`${base}/api/state`).then(r => r.json())).state;

  const collectorId = (await post('/api/action', { type: 'save', key: 'videoCollectors', data: { name: 'Clientes', question: 'O que mudou depois de nos contratar?', maxSeconds: 30 } })).id;
  await post('/api/action', { type: 'save', key: 'workflows', data: { name: 'Vídeo', active: true, triggers: [{ type: 'video_testimonial', config: { collectorId } }], steps: [{ type: 'internal_notification', config: { body: 'Novo depoimento' } }] } });
  const page = await fetch(`${base}/depoimento/demo/${collectorId}`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('permissions-policy'), /camera=\(self\)/);
  assert.match(await page.text(), /O que mudou depois de nos contratar/);

  const video = Buffer.alloc(CHUNK_BYTES * 2 + 1234, 7);
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3]).copy(video);
  const api = step => `/api/depoimento/demo/${collectorId}/${step}`;
  assert.equal((await post(api('start'), { mime: 'video/webm', size: 16 * 1024 * 1024, seconds: 10 })).status, 413);
  assert.equal((await post(api('start'), { mime: 'video/webm', size: video.length, seconds: 90 })).status, 400);
  const { uploadId, chunkBytes, total } = await post(api('start'), { mime: 'video/webm;codecs=vp8', size: video.length, seconds: 12 });
  assert.equal(total, 3);
  const chunk = i => video.subarray(i * chunkBytes, (i + 1) * chunkBytes).toString('base64');
  assert.equal((await post(api('chunk'), { uploadId, index: 1, data: chunk(1) })).status, 409, 'chunks arrive in order');
  for (let i = 0; i < total; i++) assert.equal((await post(api('chunk'), { uploadId, index: i, data: chunk(i) })).status, 200);
  assert.equal((await post(api('finish'), { uploadId, name: 'Fábio Reis', consent: false })).status, 400);
  assert.equal((await post(api('finish'), { uploadId, name: 'Fábio Reis', consent: true })).status, 201);

  let s = await state();
  const [row] = s.videoTestimonials;
  assert.equal(row.status, 'pending');
  assert.equal(row.size, video.length);
  assert.equal(JSON.stringify(s).length < 100000, true, 'the video bytes stay out of the workspace state');
  assert.ok(s.teamMessages.some(m => /Novo depoimento/.test(m.body)), 'the trigger ran');
  assert.equal((await fetch(`${base}/v/demo/${row.id}`)).status, 404, 'pending videos are not public');
  const admin = await fetch(`${base}/api/video?id=${row.id}`);
  assert.equal(admin.status, 200);
  assert.deepEqual(Buffer.from(await admin.arrayBuffer()), video);

  await post('/api/action', { type: 'save', key: 'videoTestimonials', id: row.id, data: { status: 'approved', name: 'Fábio' } });
  const ranged = await fetch(`${base}/v/demo/${row.id}`, { headers: { Range: 'bytes=0-3' } });
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers.get('content-range'), `bytes 0-3/${video.length}`);
  assert.deepEqual([...Buffer.from(await ranged.arrayBuffer())], [0x1a, 0x45, 0xdf, 0xa3]);

  const widgetId = (await post('/api/action', { type: 'save', key: 'reviewWidgets', data: { name: 'Site', layout: 'grid', showVideos: true, minScore: 1 } })).id;
  const widget = await fetch(`${base}/rw/demo/${widgetId}`);
  assert.match(widget.headers.get('content-security-policy'), /frame-ancestors \*/);
  assert.match(await widget.text(), new RegExp(`/v/demo/${row.id}`));
  const loader = await fetch(`${base}/rw/demo/${widgetId}/widget.js`).then(r => r.text());
  assert.match(loader, new RegExp(`/rw/demo/${widgetId}`));

  await post('/api/action', { type: 'delete', key: 'videoTestimonials', id: row.id });
  s = await state();
  assert.equal(s.videoTestimonials.length, 0);
  assert.equal((await fetch(`${base}/api/video?id=${row.id}`)).status, 404);
});

test('A file that is not a video is refused at the first chunk', async t => {
  const { server, host } = makeServer({ dbPath: ':memory:', port: 0, auth: null, allowLocalAccess: true, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, ...await r.json() }));
  const collectorId = (await post('/api/action', { type: 'save', key: 'videoCollectors', data: { name: 'C', question: 'Q?' } })).id;
  const fake = Buffer.from('<html>not a video</html>'.repeat(100));
  const { uploadId } = await post(`/api/depoimento/demo/${collectorId}/start`, { mime: 'video/mp4', size: fake.length, seconds: 5 });
  const refused = await post(`/api/depoimento/demo/${collectorId}/chunk`, { uploadId, index: 0, data: fake.toString('base64') });
  assert.equal(refused.status, 400);
  assert.match(refused.error, /vídeo válido/);
});
