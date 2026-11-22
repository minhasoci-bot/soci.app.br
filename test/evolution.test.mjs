import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';

const API_KEY = 'evo-global-key-super-secret';
const QR = 'data:image/png;base64,' + Buffer.from('fake-evolution-qr').toString('base64');
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// Evolution API v2 falsa: só o que o soci usa.
function fakeEvolution() {
  const calls = [];
  const instances = new Map(); // name -> { state, ownerJid, profileName, webhook, pairing }
  async function request(url, init = {}) {
    const u = new URL(url);
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    calls.push({ path: u.pathname, search: u.search, method, headers, body });
    if (headers.apikey !== API_KEY) return json({ status: 401, error: 'Unauthorized', response: { message: 'Unauthorized' } }, 401);

    if (u.pathname === '/instance/create' && method === 'POST') {
      if (instances.has(body.instanceName)) {
        return json({ status: 403, error: 'Forbidden', response: { message: [`This name "${body.instanceName}" is already in use.`] } }, 403);
      }
      instances.set(body.instanceName, { state: 'close', ownerJid: '', profileName: '', webhook: body.webhook || null, pairing: '' });
      return json({ instance: { instanceName: body.instanceName, status: 'created' }, hash: `hash-${body.instanceName}` }, 201);
    }
    const [, group, action, rawName] = u.pathname.split('/');
    const name = decodeURIComponent(rawName || '');
    if (u.pathname === '/instance/fetchInstances') {
      const wanted = u.searchParams.get('instanceName');
      const inst = instances.get(wanted);
      if (!inst) return json({ status: 404, error: 'Not Found', response: { message: ['Instance not found'] } }, 404);
      return json([{ name: wanted, connectionStatus: inst.state, ownerJid: inst.ownerJid || null, profileName: inst.profileName || null }]);
    }
    const inst = instances.get(name);
    if (!inst) return json({ status: 404, error: 'Not Found', response: { message: [`The "${name}" instance does not exist`] } }, 404);
    if (group === 'instance' && action === 'connect' && method === 'GET') {
      if (inst.state === 'open') return json({ instance: { instanceName: name, state: 'open' } });
      if (inst.state === 'connecting') return json({ pairingCode: inst.pairing || null, code: '2@abc', base64: QR, count: 1 });
      inst.state = 'connecting';
      inst.pairing = u.searchParams.get('number') ? 'WZYX-1234' : '';
      return json({ pairingCode: inst.pairing || null, code: '2@abc', base64: QR, count: 1 });
    }
    if (group === 'instance' && action === 'logout' && method === 'DELETE') {
      inst.state = 'close';
      inst.ownerJid = '';
      return json({ status: 'SUCCESS', error: false, response: { message: 'Instance logged out' } });
    }
    if (group === 'webhook' && action === 'set' && method === 'POST') {
      inst.webhook = body.webhook;
      return json({ webhook: { instanceName: name, ...body.webhook } }, 201);
    }
    if (group === 'message' && action === 'sendText' && method === 'POST') {
      if (inst.state !== 'open') return json({ status: 400, error: 'Bad Request', response: { message: ['Connection Closed'] } }, 400);
      if (body.number === '5511000000000') {
        return json({ status: 400, error: 'Bad Request', response: { message: [{ exists: false, jid: '5511000000000@s.whatsapp.net', number: '5511000000000' }] } }, 400);
      }
      return json({ key: { remoteJid: `${body.number}@s.whatsapp.net`, fromMe: true, id: `EVO${calls.length}` }, status: 'PENDING' }, 201);
    }
    if (group === 'message' && action === 'sendMedia' && method === 'POST') {
      if (inst.state !== 'open') return json({ status: 400, error: 'Bad Request', response: { message: ['Connection Closed'] } }, 400);
      return json({ key: { remoteJid: `${body.number}@s.whatsapp.net`, fromMe: true, id: `EVOM${calls.length}` }, status: 'PENDING' }, 201);
    }
    if (group === 'chat' && action === 'sendPresence' && method === 'POST') return json({ presence: body.presence }, 201);
    return new Response('Not found', { status: 404 });
  }
  const markOpen = (name, phone, profileName) => Object.assign(instances.get(name), { state: 'open', ownerJid: `${phone}@s.whatsapp.net`, profileName });
  return { request, calls, instances, markOpen };
}

async function boot(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'soci-evolution-'));
  const store = createSqliteStore(join(dir, 'go.sqlite'));
  const { server } = makeServer({
    store, auth: null, allowLocalAccess: true, port: 0,
    openAISecret: 'evolution-test-seal-secret-32-chars!',
    socialScheduler: false,
    uazapiBaseUrl: '', uazapiAdminToken: '',
    ...options
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });
  async function call(path, body) {
    const init = body === undefined
      ? { method: 'GET' }
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    const res = await fetch(`${base}${path}`, init);
    return { status: res.status, body: await res.json().catch(() => null) };
  }
  return { call, store };
}

const upsert = (key, message, pushName = 'Cliente') => ({
  event: 'messages.upsert', instance: 'soci_demo',
  data: { key: { fromMe: false, id: 'MSG1', ...key }, pushName, message, messageType: 'conversation' }
});

test('Evolution API gerenciada: QR, status ao vivo, webhooks de entrada e envio pelas Conversas', async t => {
  const evo = fakeEvolution();
  const local = await boot(t, { whatsappRequest: evo.request, evolutionBaseUrl: 'https://evo.soci.test/', evolutionApiKey: API_KEY });

  const agency = await local.call('/api/whatsapp/agency/status');
  assert.equal(agency.status, 200);
  assert.equal(agency.body.provider, 'evolution');
  assert.equal(agency.body.managed, true);
  assert.equal(JSON.stringify(agency.body).includes(API_KEY), false);

  const conn = await local.call('/api/whatsapp/workspace/connect?workspace=demo', {});
  assert.equal(conn.status, 200, conn.body?.error);
  assert.equal(conn.body.provider, 'evolution');
  assert.equal(conn.body.status, 'connecting');
  assert.equal(conn.body.qrcode, QR);
  assert.ok(evo.instances.has('soci_demo'), 'cria a instância soci_<subconta>');
  const create = evo.calls.find(c => c.path === '/instance/create');
  assert.equal(create.body.integration, 'WHATSAPP-BAILEYS');
  assert.equal(create.body.groupsIgnore, true);
  assert.equal(JSON.stringify(conn.body).includes('hash-soci_demo'), false);
  const raw = local.store.load('whatsapp-agency');
  assert.equal(raw.profile.name, 'WhatsApp (Evolution API)');
  assert.equal(raw.subaccounts.demo.provider, 'evolution');
  assert.equal(JSON.stringify(raw).includes('hash-soci_demo'), false, 'token da instância fica selado');

  // Enquanto aguarda a leitura, o status continua trazendo o QR (sem novo create).
  const polling = await local.call('/api/whatsapp/workspace/status?workspace=demo');
  assert.equal(polling.body.status, 'connecting');
  assert.equal(polling.body.qrcode, QR);
  assert.equal(evo.calls.filter(c => c.path === '/instance/create').length, 1);

  evo.markOpen('soci_demo', '5531988887777', 'Atendimento Demo');
  const live = await local.call('/api/whatsapp/workspace/status?workspace=demo');
  assert.equal(live.body.status, 'connected');
  assert.equal(live.body.phone, '5531988887777');
  assert.equal(live.body.profileName, 'Atendimento Demo');
  const hookPath = new URL(live.body.webhookUrl).pathname;

  assert.equal((await local.call(`/api/whatsapp/webhook/agency/demo/${'0'.repeat(48)}`, upsert({ remoteJid: '1@s.whatsapp.net' }, { conversation: 'x' }))).status, 403);

  const inbound = await local.call(hookPath, upsert({ remoteJid: '5511977776666@s.whatsapp.net' }, { conversation: 'Oi! Quero agendar.' }, 'Carlos Mendes'));
  assert.equal(inbound.body.stored, true);
  // Contato identificado por LID: o número real vem em remoteJidAlt.
  await local.call(hookPath, upsert({ remoteJid: '123456789012345@lid', remoteJidAlt: '5521955554444@s.whatsapp.net' }, { extendedTextMessage: { text: 'Mensagem via LID' } }, 'Bia'));
  await local.call(hookPath, upsert({ remoteJid: '5521955554444@s.whatsapp.net' }, { imageMessage: { mimetype: 'image/jpeg' } }, 'Bia'));
  for (const ignored of [
    upsert({ remoteJid: '120363000000000000@g.us', participant: '5511@s.whatsapp.net' }, { conversation: 'grupo' }),
    upsert({ remoteJid: 'status@broadcast' }, { conversation: 'status' }),
    upsert({ remoteJid: '5511977776666@s.whatsapp.net', fromMe: true }, { conversation: 'eco' }),
    upsert({ remoteJid: '999@lid' }, { conversation: 'lid sem número' }),
    { event: 'qrcode.updated', data: { qrcode: { base64: QR } } }
  ]) {
    assert.equal((await local.call(hookPath, ignored)).body.ignored, true);
  }
  const state = (await local.call('/api/state?workspace=demo')).body.state;
  const carlos = state.contacts.find(c => c.name === 'Carlos Mendes');
  assert.equal(carlos.phone, '+5511977776666');
  const bia = state.contacts.filter(c => c.phone === '+5521955554444');
  assert.equal(bia.length, 1, 'LID e número real caem no mesmo contato');
  const biaMsgs = state.messages.filter(m => m.contactId === bia[0].id).map(m => m.body);
  assert.deepEqual(biaMsgs.sort(), ['Mensagem via LID', '[Imagem]'].sort());
  assert.equal(state.messages.some(m => /grupo|status|eco|lid sem/.test(m.body)), false);

  const reply = await local.call('/api/action?workspace=demo', {
    type: 'message', data: { contactId: carlos.id, channel: 'WhatsApp', direction: 'Outbound', body: 'Claro, qual horário?' }
  });
  assert.equal(reply.body.delivery?.sent, true);
  const sent = evo.calls.find(c => c.path === '/message/sendText/soci_demo');
  assert.deepEqual(sent.body, { number: '5511977776666', text: 'Claro, qual horário?' });
  assert.equal(sent.headers.apikey, API_KEY);

  const noWa = await local.call('/api/whatsapp/workspace/test?workspace=demo', { phone: '5511000000000', text: 'teste' });
  assert.equal(noWa.status, 502);
  assert.match(noWa.body.error, /não tem WhatsApp/);

  // Queda: connection.update chega pelo webhook e derruba o status salvo.
  const close = await local.call(hookPath, { event: 'connection.update', instance: 'soci_demo', data: { instance: 'soci_demo', state: 'close', statusReason: 428 } });
  assert.equal(close.body.status, 'disconnected');
  assert.equal(local.store.load('whatsapp-agency').subaccounts.demo.status, 'disconnected');
  // O servidor se reconectou sozinho mas o webhook de "open" se perdeu: o envio confere ao vivo e segue.
  const again = await local.call('/api/action?workspace=demo', {
    type: 'message', data: { contactId: carlos.id, channel: 'WhatsApp', direction: 'Outbound', body: 'Voltei' }
  });
  assert.equal(again.body.delivery?.sent, true);
  assert.equal(local.store.load('whatsapp-agency').subaccounts.demo.status, 'connected');

  const disc = await local.call('/api/whatsapp/workspace/disconnect?workspace=demo', {});
  assert.equal(disc.body.status, 'disconnected');
  assert.ok(evo.calls.some(c => c.path === '/instance/logout/soci_demo' && c.method === 'DELETE'));
});

test('Evolution API: código de pareamento, instância apagada no servidor e servidor próprio da agência', async t => {
  const evo = fakeEvolution();
  const local = await boot(t, { whatsappRequest: evo.request });

  const none = await local.call('/api/whatsapp/agency/status');
  assert.equal(none.body.configured, false);
  assert.equal(none.body.provider, 'evolution');

  const missingKey = await local.call('/api/whatsapp/agency/config', { provider: 'evolution', baseUrl: 'https://wa.agencia.test' });
  assert.equal(missingKey.status, 400);
  assert.match(missingKey.body.error, /API Key global/);
  const cfg = await local.call('/api/whatsapp/agency/config', { provider: 'evolution', baseUrl: 'https://wa.agencia.test/', adminToken: API_KEY });
  assert.equal(cfg.status, 200, cfg.body?.error);
  assert.equal(cfg.body.configured, true);
  assert.equal(cfg.body.customProvider, 'evolution');
  assert.equal(cfg.body.adminTokenLast4, 'cret');

  const pair = await local.call('/api/whatsapp/workspace/connect?workspace=demo', { phone: '+55 (31) 99999-1111' });
  assert.equal(pair.status, 200, pair.body?.error);
  assert.equal(pair.body.paircode, 'WZYX-1234');
  assert.equal(evo.calls.find(c => c.path === '/instance/connect/soci_demo').search, '?number=5531999991111');

  // Já em andamento com QR: pedir código de pareamento reabre a sessão com o número.
  evo.instances.get('soci_demo').pairing = '';
  const pair2 = await local.call('/api/whatsapp/workspace/connect?workspace=demo', { phone: '5531999991111' });
  assert.equal(pair2.body.paircode, 'WZYX-1234');

  // Alguém apagou a instância no manager da Evolution: o status esquece e o próximo conectar recria.
  evo.instances.delete('soci_demo');
  const gone = await local.call('/api/whatsapp/workspace/status?workspace=demo');
  assert.equal(gone.body.status, 'disconnected');
  assert.equal(local.store.load('whatsapp-agency').subaccounts.demo.tokenSealed, '');
  const recreated = await local.call('/api/whatsapp/workspace/connect?workspace=demo', {});
  assert.equal(recreated.status, 200, recreated.body?.error);
  assert.equal(recreated.body.qrcode, QR);
  assert.equal(evo.calls.filter(c => c.path === '/instance/create').length, 2);

  // Banco do soci perdeu o vínculo mas a instância ainda existe: reaproveita em vez de falhar.
  await local.store.change('whatsapp-agency', row => { row.subaccounts.demo.tokenSealed = ''; });
  const reused = await local.call('/api/whatsapp/workspace/connect?workspace=demo', {});
  assert.equal(reused.status, 200, reused.body?.error);
  assert.equal(reused.body.status, 'connecting');

  const wrongKey = await local.call('/api/whatsapp/agency/config', { provider: 'evolution', baseUrl: 'https://wa.agencia.test', adminToken: 'chave-errada' });
  assert.equal(wrongKey.status, 200);
  await local.store.change('whatsapp-agency', row => { row.subaccounts.demo.tokenSealed = ''; });
  const refused = await local.call('/api/whatsapp/workspace/connect?workspace=demo', {});
  assert.equal(refused.status, 422);
  assert.match(refused.body.error, /API Key global/);
});

test('Trocar UAZAPI por Evolution não reaproveita instância nem status antigos', async t => {
  const evo = fakeEvolution();
  const local = await boot(t, { whatsappRequest: evo.request, evolutionBaseUrl: 'https://evo.soci.test', evolutionApiKey: API_KEY });
  await local.store.insert('whatsapp-agency', {
    profile: { name: 'WhatsApp (UAZAPI)' }, provider: 'uazapi', baseUrl: '', adminTokenSealed: '', adminTokenLast4: '',
    subaccounts: { demo: { enabled: true, tokenSealed: 'a.b.c', tokenLast4: 'oldt', status: 'connected', phone: '5511911112222', webhookSecret: 'f'.repeat(48) } }
  });
  const view = await local.call('/api/whatsapp/agency/status');
  assert.equal(view.body.provider, 'evolution');
  assert.equal(view.body.subaccounts.demo.status, 'disconnected');
  assert.equal(view.body.subaccounts.demo.hasInstance, false);

  const sent = await local.call('/api/whatsapp/workspace/test?workspace=demo', { phone: '5511977776666', text: 'oi' });
  assert.equal(sent.status, 409);

  // Um webhook atrasado da UAZAPI não pode marcar a subconta como conectada na Evolution.
  const late = await local.call(`/api/whatsapp/webhook/agency/demo/${'f'.repeat(48)}`, { EventType: 'connection', instance: { status: 'connected' } });
  assert.equal(late.body.ignored, true);

  const conn = await local.call('/api/whatsapp/workspace/connect?workspace=demo', {});
  assert.equal(conn.status, 200, conn.body?.error);
  assert.equal(conn.body.qrcode, QR);
  assert.equal(local.store.load('whatsapp-agency').subaccounts.demo.provider, 'evolution');
  assert.equal(local.store.load('whatsapp-agency').subaccounts.demo.webhookSecret, 'f'.repeat(48), 'mantém a URL do webhook');
});

test('Evolution API nos fluxos: "digitando…", arquivo por https público e endereço interno bloqueado', async t => {
  const evo = fakeEvolution();
  const local = await boot(t, { whatsappRequest: evo.request, evolutionBaseUrl: 'https://evo.soci.test/', evolutionApiKey: API_KEY });
  await local.call('/api/whatsapp/workspace/connect?workspace=demo', {});
  evo.markOpen('soci_demo', '5531988887777', 'Atendimento Demo');
  await local.call('/api/whatsapp/workspace/status?workspace=demo');
  const saved = await local.call('/api/action?workspace=demo', { type: 'save', key: 'workflows', data: { name: 'Catálogo', active: true, triggers: [{ type: 'contact_created' }], steps: [
    { type: 'whatsapp_typing', config: { seconds: 2 } },
    { type: 'whatsapp_media', config: { mediaType: 'document', url: 'https://93.184.216.34/{{contact.first_name}}.pdf', caption: 'Olá, {{contact.first_name}}!', fileName: 'catalogo.pdf' } },
    { type: 'whatsapp_media', config: { mediaType: 'image', url: 'https://10.0.0.5/interno.png' } }
  ] } });
  assert.equal(saved.status, 200, saved.body?.error);
  await local.call('/api/action?workspace=demo', { type: 'save', key: 'contacts', data: { name: 'Carla Souza', phone: '+55 11 97777-6666', tags: [], custom: {} } });
  let run;
  for (let i = 0; i < 50 && !(run?.results || []).some(line => /arquivo não enviado/.test(line)); i++) {
    await new Promise(resolve => setTimeout(resolve, 20));
    run = (await local.call('/api/state?workspace=demo')).body.state.runs.find(row => row.name === 'Catálogo');
  }
  const presence = evo.calls.find(c => c.path === '/chat/sendPresence/soci_demo');
  assert.deepEqual(presence.body, { number: '5511977776666', presence: 'composing', delay: 2000 });
  const media = evo.calls.filter(c => c.path === '/message/sendMedia/soci_demo');
  assert.equal(media.length, 1, 'the internal address never reaches the provider');
  assert.deepEqual(media[0].body, { number: '5511977776666', mediatype: 'document', media: 'https://93.184.216.34/Carla.pdf', caption: 'Olá, Carla!', fileName: 'catalogo.pdf' });
  assert.ok(evo.calls.indexOf(presence) < evo.calls.indexOf(media[0]), 'typing comes before the file');
  assert.ok(run.results.some(line => /"digitando…" por 2 s/.test(line)));
  assert.ok(run.results.some(line => /arquivo enviado/.test(line)));
  assert.ok(run.results.some(line => /arquivo não enviado: endereço de rede interna bloqueado/.test(line)));
  const state = (await local.call('/api/state?workspace=demo')).body.state;
  const blocked = state.messages.find(m => m.body.includes('interno.png'));
  assert.equal(blocked.failed, 'provider_error', 'the blocked file shows as not delivered');
  assert.ok(state.messages.some(m => m.body === '[Documento: catalogo.pdf] https://93.184.216.34/Carla.pdf\nOlá, Carla!'));
});
