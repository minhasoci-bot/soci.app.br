import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute, hydrateWorkspace } from '../model.mjs';
import { importedFile, mediaKind } from '../media-model.mjs';
import { requireRecordEffects, requireWorkspaceCommand } from '../authorization.mjs';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';

const png = 'data:image/png;base64,iVBORw0KGgo=';
const mp3 = 'data:audio/mpeg;base64,SUQz';
const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });

test('Media folders nest, refuse cycles and hand their contents to the parent when deleted', () => {
  const s = blank();
  const top = save(s, 'mediaFolders', { name: 'Campanhas' });
  const child = save(s, 'mediaFolders', { name: 'Black Friday', parentId: top });
  assert.throws(() => save(s, 'mediaFolders', { name: 'Campanhas', parentId: child }, top), /dentro dela mesma/);
  assert.throws(() => save(s, 'mediaFolders', { name: 'X', parentId: 'nao-existe' }), /Pasta não encontrada/);
  const photo = save(s, 'files', { name: 'banner.png', data: png, folderId: child });
  execute(s, { type: 'delete', key: 'mediaFolders', id: child });
  assert.equal(s.files.find(f => f.id === photo).folderId, top);
  execute(s, { type: 'delete', key: 'mediaFolders', id: top });
  assert.equal(s.files.find(f => f.id === photo).folderId, '');
});

test('Files rename and move without resending data, go to trash, restore and empty the trash', () => {
  const s = blank();
  const folder = save(s, 'mediaFolders', { name: 'Áudios' });
  const song = save(s, 'files', { name: 'vinheta.mp3', data: mp3 });
  const photo = save(s, 'files', { name: 'foto.png', data: png });
  save(s, 'files', { name: 'vinheta-final.mp3', folderId: folder }, song);
  const moved = s.files.find(f => f.id === song);
  assert.deepEqual([moved.name, moved.folderId, moved.data], ['vinheta-final.mp3', folder, mp3]);
  assert.equal(mediaKind(moved.data), 'audio');

  execute(s, { type: 'media-trash', data: { ids: [song, photo] } });
  assert.ok(s.files.every(f => f.trashedAt));
  execute(s, { type: 'delete', key: 'mediaFolders', id: folder });
  execute(s, { type: 'media-restore', data: { ids: [song] } });
  assert.deepEqual([s.files.find(f => f.id === song).trashedAt, s.files.find(f => f.id === song).folderId], ['', '']);
  execute(s, { type: 'media-empty-trash' });
  assert.deepEqual(s.files.map(f => f.id), [song]);
});

test('Only supported media types are stored', () => {
  const s = blank();
  assert.throws(() => save(s, 'files', { name: 'x.svg', data: 'data:image/svg+xml;base64,PHN2Zz4=' }), /arquivo/);
  for (const data of ['data:video/mp4;base64,AAAA', 'data:text/csv;base64,YSxi', 'data:application/pdf;base64,JVBE']) save(s, 'files', { name: 'ok', data });
  assert.deepEqual(s.files.map(f => mediaKind(f.data)), ['video', 'doc', 'doc']);
});

test('Older workspaces gain media folders and trash commands need the media module', () => {
  const legacy = blank();
  delete legacy.mediaFolders;
  assert.deepEqual(hydrateWorkspace(legacy).mediaFolders, []);
  const marketingOnly = { modules: ['marketing'] };
  assert.throws(() => requireWorkspaceCommand(marketingOnly, { type: 'media-trash', data: { ids: [] } }));
  assert.throws(() => requireWorkspaceCommand(marketingOnly, { type: 'save', key: 'mediaFolders', data: {} }));
  requireWorkspaceCommand({ modules: ['media'] }, { type: 'media-empty-trash' });

  const s = blank();
  const used = save(s, 'files', { name: 'post.png', data: png });
  s.socialPosts.push({ id: 'p1', status: 'draft', media: [{ fileId: used }] });
  execute(s, { type: 'media-trash', data: { ids: [used] } });
  assert.throws(() => requireRecordEffects({ modules: ['media'] }, s, { type: 'media-empty-trash' }));
});

test('URL imports keep the remote type and name, and refuse pages and oversized files', () => {
  const ok = importedFile({ status: 200, headers: { 'content-type': 'image/png; charset=binary' }, body: Buffer.from('png'), truncated: false },
    'https://cdn.example/fotos/Logo%20Final.png?v=2');
  assert.deepEqual(ok, { name: 'Logo Final.png', data: 'data:image/png;base64,cG5n' });
  assert.throws(() => importedFile({ status: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from('<html>') }, 'https://youtube.com/watch'), /link direto/);
  assert.throws(() => importedFile({ status: 200, headers: { 'content-type': 'image/png' }, body: Buffer.alloc(10), truncated: true }, 'https://a.example/x.png'), /700 KB/);
  assert.throws(() => importedFile({ status: 404, headers: {}, body: Buffer.alloc(0) }, 'https://a.example/x.png'), /404/);
});

test('Upload URL imports a remote file into the chosen folder through the media route', async t => {
  const requested = [];
  const store = createSqliteStore(':memory:');
  const { server, host } = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, socialScheduler: false,
    fetchMedia: async (address, options) => {
      requested.push([address, options.maxBytes]);
      return { status: 200, headers: { 'content-type': 'image/gif' }, body: Buffer.from('GIF89a'), truncated: false };
    } });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const post = async (path, body) => {
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const folder = await post('/api/action?workspace=demo', { type: 'save', key: 'mediaFolders', data: { name: 'Importados' } });
  const imported = await post('/api/media/import?workspace=demo', { url: 'https://cdn.example/a/anim.gif', folderId: folder.body.id });
  assert.equal(imported.status, 200);
  const file = imported.body.state.files.find(row => row.id === imported.body.id);
  assert.deepEqual([file.name, file.folderId, file.data], ['anim.gif', folder.body.id, 'data:image/gif;base64,R0lGODlh']);
  assert.deepEqual(requested, [['https://cdn.example/a/anim.gif', 700_001]]);
  assert.equal((await post('/api/media/import?workspace=demo', { url: 42 })).status, 400);
});
