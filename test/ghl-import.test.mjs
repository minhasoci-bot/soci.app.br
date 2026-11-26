// Importar do GHL: o código, o envio em partes pela extensão e a conversão em passos até virar um setup em Importados.
// O GHL é falso: um fetch que serve a pré-visualização das páginas e as imagens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { loadSetupSites } from '../setup-sites-store.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/ghl-location.json', import.meta.url), 'utf8'));
const IMAGE = 'https://assets.cdn.filesafe.space/fx/foto.png';
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
const preview = name => `<!doctype html><html><head><title>${name}</title></head><body><h1>${name}</h1><img src="${IMAGE}"></body></html>`;

/** O GHL falso: pré-visualizações em sites.leadconnectorhq.com/preview/<id> e a imagem; `broken` lista o que responde 404. */
function fakeGhl(broken = []) {
  return async url => {
    url = String(url);
    if (broken.some(part => url.includes(part))) return new Response('não encontrado', { status: 404 });
    const page = url.match(/^https:\/\/sites\.leadconnectorhq\.com\/preview\/([^/?#]+)/);
    if (page) return new Response(preview(`Página ${page[1]}`), { headers: { 'Content-Type': 'text/html' } });
    if (url === IMAGE) return new Response(PNG, { headers: { 'Content-Type': 'image/png' } });
    return new Response('', { status: 404 });
  };
}

async function start({ ghlFetch = fakeGhl() } = {}) {
  const store = createSqliteStore(':memory:');
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store, port: 0, ghlFetch });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body, headers = {}) => {
    const r = await fetch(base + path, body === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: r.status, headers: r.headers, body: await r.json() };
  };
  return { store, call, close: () => new Promise(resolve => server.close(resolve)) };
}

// A extensão roda em chrome-extension://, então o envio chega de outra origem.
const fromExtension = code => ({ 'X-Soci-Import-Code': code, Origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop' });

async function upload(local, code, source) {
  for (const name of ['dump', 'triggers', 'surveys']) {
    const text = JSON.stringify(source[name]);
    const half = Math.ceil(text.length / 2);
    const chunks = name === 'dump' ? [text.slice(0, half), text.slice(half)] : [text];
    for (const [index, data] of chunks.entries()) {
      const sent = await local.call('/api/ghl-import/part', { name, index, total: chunks.length, data }, fromExtension(code));
      assert.equal(sent.status, 200, JSON.stringify(sent.body));
    }
  }
  const done = await local.call('/api/ghl-import/done', {}, fromExtension(code));
  assert.equal(done.status, 200, JSON.stringify(done.body));
  return done.body.jobId;
}

/** Gera o código, envia a extração e avança os passos até o fim. */
async function runImport(t, { ghlFetch, source = fixture } = {}) {
  const local = await start({ ghlFetch }); t.after(local.close);
  const issued = await local.call('/api/agency/ghl-import-code', {});
  assert.equal(issued.status, 200, JSON.stringify(issued.body));
  const jobId = await upload(local, issued.body.code, source);
  assert.equal(jobId, issued.body.jobId);
  let job = null;
  for (let i = 0; i < 40; i++) {
    const step = await local.call(`/api/agency/ghl-import/${jobId}/step`, {});
    assert.equal(step.status, 200, JSON.stringify(step.body));
    job = step.body;
    if (['done', 'failed'].includes(job.status)) break;
  }
  assert.equal(job.status, 'done', job.error);
  const sites = await loadSetupSites(local.store, job.snapshotId);
  const html = Object.values(sites).flatMap(doc => doc.pages.map(page => page.html)).join('\n');
  return { local, job, sites, html };
}

test('imports a GHL location end to end', async t => {
  const { local, job, sites } = await runImport(t);
  const { body } = await local.call('/api/agency');
  const setup = body.agency.snapshots.find(s => s.id === job.snapshotId);
  assert.equal(setup.kind, 'imported');
  assert.equal(setup.origin, 'ghl');
  assert.equal(setup.name, 'Jardim Teste (GHL)');
  assert.equal(setup.sitesStored, true);
  assert.equal(setup.studioSites, undefined);
  assert.ok(body.agency.ghlImports.every(row => !('codeHash' in row)), 'the code hash never leaves the server');
  assert.equal((await local.call(`/api/agency/ghl-import/${job.id}`)).body.status, 'done');
  assert.equal(Object.keys(sites).length, 1);
  // The temporary rows of the upload are gone.
  assert.equal((await local.store.list()).filter(row => row.id.startsWith(`ghl-import-${job.id}`)).length, 0);
  const account = await local.call('/api/agency/accounts', { name: 'Jardim Cliente', snapshotId: job.snapshotId });
  assert.equal(account.status, 200, JSON.stringify(account.body));
  const state = (await local.call(`/api/state?workspace=${account.body.result}`)).body.state;
  assert.equal(state.workflows.length, 2);
  assert.ok(['Item 14', 'Item 15', 'cliente'].every(tag => state.tags.some(row => (row.name || row) === tag)));
  assert.equal(state.studioProjects.length, 1);
  const doc = await local.call(`/api/studio/doc?workspace=${account.body.result}&id=${state.studioProjects[0].id}`);
  assert.equal(doc.body.doc.pages.length, 2);
});

test('rejects expired, used and unknown codes', async t => {
  const local = await start(); t.after(local.close);
  const unknown = await local.call('/api/ghl-import/part', { name: 'dump', index: 0, total: 1, data: '{}' }, fromExtension('AAA-BBB-CCC'));
  assert.equal(unknown.status, 401);
  assert.match(unknown.body.error, /Código inválido ou expirado/);
  const issued = await local.call('/api/agency/ghl-import-code', {});
  await upload(local, issued.body.code, fixture);
  const used = await local.call('/api/ghl-import/part', { name: 'dump', index: 0, total: 1, data: '{}' }, fromExtension(issued.body.code));
  assert.equal(used.status, 401);
});

test('report lists reader errors', async t => {
  const { job } = await runImport(t, { source: { ...fixture, dump: { ...fixture.dump, errors: ['404 surveys'] } } });
  assert.ok(job.notes.includes('Não consegui ler: 404 surveys'), job.notes.join(' | '));
});

test('keeps the original url when an image cannot be copied', async t => {
  const { job, html } = await runImport(t, { ghlFetch: fakeGhl([IMAGE]) });
  assert.ok(html.includes(IMAGE));
  assert.ok(job.notes.some(text => /imagem/.test(text) && /GHL/.test(text)), job.notes.join(' | '));
});

test('saves the site when a page preview fails', async t => {
  const { job, sites } = await runImport(t, { ghlFetch: fakeGhl(['/preview/Fx000000000000000055']) });
  assert.equal(Object.values(sites)[0].pages.length, 2);
  assert.ok(job.notes.includes('A página "Item 266" não pôde ser baixada.'), job.notes.join(' | '));
});

test('replaces copied images with soci asset urls', async t => {
  const { html } = await runImport(t);
  const hash = createHash('sha256').update(PNG).digest('hex');
  assert.ok(html.includes(`https://soci.app.br/asset/${hash}.png`));
  assert.ok(!html.includes(IMAGE));
});
