import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { createTregSealer, publicTreg } from '../soci-chat.mjs';

const SECRET = 'treg-token-seal-test-secret-32ch!';

async function start(t, { store = createSqliteStore(':memory:'), openAISecret = SECRET } = {}) {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store, port: 0, openAISecret });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  return { store, call };
}

const chatRow = store => store.load('chat-agency');

test('o token do Treg fica cifrado no banco e nunca volta para o navegador', async t => {
  const { store, call } = await start(t);
  const token = 'tok-treg-secreto-1234';
  const saved = await call('/api/ask/connectors', { treg: { token, googleMaps: true, instagram: false }, verify: false });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.connectors.treg, publicTreg({ enabled: true, googleMaps: true, instagram: false, token }));
  assert.equal(saved.body.connectors.treg.tokenLast4, '1234');

  const row = chatRow(store);
  assert.ok(row.connectors.treg.tokenSealed, 'guardado cifrado');
  assert.equal(row.connectors.treg.token, undefined);
  assert.ok(!JSON.stringify(row).includes(token), 'o token não aparece em texto puro na linha');

  for (const path of ['/api/ask/connectors', '/api/ask/state']) {
    const response = await call(path);
    assert.ok(!JSON.stringify(response.body).includes(token), `${path} não devolve o token`);
    assert.ok(!JSON.stringify(response.body).includes(row.connectors.treg.tokenSealed), `${path} não devolve o token cifrado`);
    assert.equal(response.body.connectors.treg.hasToken, true);
  }
});

test('salvar sem token mantém o atual; removeToken apaga; só campos conhecidos são gravados', async t => {
  const { store, call } = await start(t);
  await call('/api/ask/connectors', { treg: { token: 'tok-treg-mantido-9999' }, verify: false });
  const sealed = chatRow(store).connectors.treg.tokenSealed;

  const toggled = await call('/api/ask/connectors', { treg: { instagram: false, extra: 'ignorado', tokenSealed: 'forjado' }, verify: false });
  assert.equal(toggled.body.connectors.treg.hasToken, true);
  assert.equal(toggled.body.connectors.treg.instagram, false);
  const kept = chatRow(store).connectors.treg;
  assert.equal(kept.tokenSealed, sealed, 'campo vazio mantém o token');
  assert.equal(kept.extra, undefined);

  const removed = await call('/api/ask/connectors', { treg: { removeToken: true }, verify: false });
  assert.equal(removed.body.connectors.treg.hasToken, false);
  assert.equal(chatRow(store).connectors.treg.tokenSealed, undefined);

  assert.equal((await call('/api/ask/connectors', { treg: { token: 'com espaço inválido' }, verify: false })).status, 400);
});

test('token antigo em texto puro é cifrado na próxima gravação do chat', async t => {
  const store = createSqliteStore(':memory:');
  const { call } = await start(t, { store });
  await call('/api/ask/state');
  store.change('chat-agency', row => { row.connectors = { treg: { enabled: true, token: 'tok-antigo-em-texto-0000', googleMaps: true, instagram: true } }; });

  const before = await call('/api/ask/connectors');
  assert.equal(before.body.connectors.treg.hasToken, true, 'o token antigo continua valendo');
  assert.equal(before.body.connectors.treg.token, undefined);

  assert.equal((await call('/api/ask/settings', { instructions: 'Responda em português.' })).status, 200);
  const row = chatRow(store);
  assert.equal(row.connectors.treg.token, undefined);
  assert.equal(createTregSealer(SECRET).open(row.connectors.treg.tokenSealed, 'chat-agency'), 'tok-antigo-em-texto-0000');
});

test('sem GO_STORAGE_KEY o servidor recusa guardar o token', async t => {
  const { call } = await start(t, { openAISecret: '' });
  const refused = await call('/api/ask/connectors', { treg: { token: 'tok-sem-cofre-0000' }, verify: false });
  assert.equal(refused.status, 503);
  assert.match(refused.body.error, /armazenamento seguro/);
});

test('o selo só abre com o mesmo segredo e a mesma linha', () => {
  const sealer = createTregSealer(SECRET);
  const sealed = sealer.seal('tok-abc-12345', 'chat-agency');
  assert.equal(sealer.open(sealed, 'chat-agency'), 'tok-abc-12345');
  assert.equal(sealer.open(sealed, 'chat-outra-agencia'), '');
  assert.equal(createTregSealer('outro-segredo-qualquer-32-chars!!').open(sealed, 'chat-agency'), '');
  assert.equal(createTregSealer().available, false);
});
