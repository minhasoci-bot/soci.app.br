import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeServer } from '../server.mjs';
import { createSqliteStore, createSupabaseStore } from '../storage.mjs';
import { createWhatsAppHandler } from '../whatsapp.mjs';

const FAKE_QR = 'data:image/png;base64,' + Buffer.from('fake-uazapi-qr').toString('base64');

function fakeUazapi() {
  const calls = [];
  const instances = new Map(); // token -> { name, status, phone, profileName, qrcode, paircode, webhook }
  let seq = 0;

  async function request(url, init = {}) {
    const u = new URL(url);
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    calls.push({ path: u.pathname, method, headers, body });

    if (u.pathname === '/instance/init' && method === 'POST') {
      if (headers.admintoken !== 'uaz-admin-super-secret') {
        return new Response(JSON.stringify({ message: 'Unauthorized admin' }), { status: 401 });
      }
      const token = `inst-token-${++seq}-xyz9`;
      instances.set(token, { name: body.name, status: 'disconnected', phone: '', profileName: '', qrcode: '', paircode: '' });
      return new Response(JSON.stringify({ result: 'success', instance: { name: body.name, status: 'disconnected' }, token }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }

    const inst = instances.get(headers.token);
    if (!inst) return new Response(JSON.stringify({ message: 'Invalid instance token' }), { status: 401 });

    if (u.pathname === '/webhook' && method === 'POST') {
      inst.webhook = body;
      return new Response(JSON.stringify({ result: 'success', webhook: body }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (u.pathname === '/instance/connect' && method === 'POST') {
      inst.status = 'connecting';
      if (body?.phone) {
        inst.paircode = '9988-7766';
        inst.qrcode = '';
      } else {
        inst.qrcode = FAKE_QR;
        inst.paircode = '';
      }
      return new Response(JSON.stringify({
        result: 'success',
        instance: { instanceName: inst.name, status: 'connecting', qrcode: inst.qrcode, paircode: inst.paircode }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (u.pathname === '/instance/status' && method === 'GET') {
      return new Response(JSON.stringify({
        instance: {
          name: inst.name,
          status: inst.status,
          qrcode: inst.status === 'connecting' ? inst.qrcode : '',
          paircode: inst.status === 'connecting' ? inst.paircode : '',
          owner: inst.phone,
          profileName: inst.profileName
        },
        status: { connected: inst.status === 'connected', loggedIn: inst.status === 'connected' }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (u.pathname === '/instance/disconnect' && method === 'POST') {
      inst.status = 'disconnected';
      inst.phone = '';
      inst.qrcode = '';
      return new Response(JSON.stringify({ result: 'success', state: 'disconnected' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (u.pathname === '/send/text' && method === 'POST') {
      return new Response(JSON.stringify({ id: `uaz-msg-${calls.length}`, number: body.number, text: body.text }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response('Not found', { status: 404 });
  }

  function markConnected(token, phone, profileName) {
    const inst = instances.get(token);
    if (inst) { inst.status = 'connected'; inst.phone = phone; inst.profileName = profileName; inst.qrcode = ''; }
  }

  return { request, calls, instances, markConnected };
}

async function boot(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'soci-uazapi-'));
  const store = options.store || createSqliteStore(join(dir, 'go.sqlite'));
  const { server } = makeServer({
    store,
    auth: null,
    allowLocalAccess: true,
    port: 0,
    openAISecret: 'uazapi-test-seal-secret-32-chars!!',
    socialScheduler: false,
    ...options
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });
  async function call(path, body, extraHeaders = {}) {
    const headers = { ...extraHeaders };
    const init = body === undefined
      ? { method: 'GET', headers }
      : { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    const res = await fetch(`${base}${path}`, init);
    return { status: res.status, body: await res.json().catch(() => null) };
  }
  return { base, call, store };
}

test('UAZAPI managed 1-click QR isolates sub-accounts, routes inbound webhooks and dispatches outbound Conversas', async t => {
  const uaz = fakeUazapi();
  const local = await boot(t, {
    whatsappRequest: uaz.request,
    uazapiBaseUrl: 'https://soci.uazapi.com',
    uazapiAdminToken: 'uaz-admin-super-secret'
  });

  // Create a second sub-account
  const created = await local.call('/api/agency/accounts', { name: 'Clínica Sol' });
  assert.equal(created.status, 200);
  const sub2 = created.body.result;

  // Agency sees managed mode active without configuring anything
  const agStatus = await local.call('/api/whatsapp/agency/status');
  assert.equal(agStatus.status, 200);
  assert.equal(agStatus.body.managed, true);
  assert.equal(agStatus.body.configured, true);
  assert.equal(JSON.stringify(agStatus.body).includes('uaz-admin-super-secret'), false);

  // Sub-account 1 (demo) connects with 1 click -> gets QR Code immediately
  const conn1 = await local.call('/api/whatsapp/workspace/connect?workspace=demo', {});
  assert.equal(conn1.status, 200);
  assert.equal(conn1.body.status, 'connecting');
  assert.equal(conn1.body.qrcode, FAKE_QR);
  assert.equal(JSON.stringify(conn1.body).includes('inst-token-1'), false);
  assert.equal(JSON.stringify(conn1.body).includes('uaz-admin-super-secret'), false);

  // Sub-account 2 connects independently via pairing code -> gets its OWN separate instance token
  const conn2 = await local.call(`/api/whatsapp/workspace/connect?workspace=${sub2}`, { phone: '+55 (31) 99999-1111' });
  assert.equal(conn2.status, 200);
  assert.equal(conn2.body.status, 'connecting');
  assert.equal(conn2.body.paircode, '9988-7766');
  assert.equal(uaz.instances.size, 2, 'Each sub-account must provision its own isolated UAZAPI instance');

  // Verify tokens are sealed in DB (no plaintext token stored)
  const rawDoc = await local.store.load('whatsapp-agency');
  assert.equal(rawDoc.profile.name, 'WhatsApp (UAZAPI)');
  assert.equal(JSON.stringify(rawDoc).includes('inst-token-1'), false);
  assert.equal(JSON.stringify(rawDoc).includes('inst-token-2'), false);

  // Simulate user scanning QR code on demo's phone
  const [token1] = [...uaz.instances.keys()];
  uaz.markConnected(token1, '5531988887777', 'Atendimento Demo');

  const polled = await local.call('/api/whatsapp/workspace/status?workspace=demo');
  assert.equal(polled.status, 200);
  assert.equal(polled.body.status, 'connected');
  assert.equal(polled.body.phone, '5531988887777');
  assert.equal(polled.body.profileName, 'Atendimento Demo');

  // Inbound UAZAPI webhook delivers directly into demo's Conversas
  const hookPath = new URL(polled.body.webhookUrl).pathname;
  const badHook = await local.call(`/api/whatsapp/webhook/agency/demo/${'0'.repeat(48)}`, { EventType: 'messages' });
  assert.equal(badHook.status, 403);

  const hook = await local.call(hookPath, {
    EventType: 'messages',
    message: {
      chatid: '5511977776666@c.us',
      senderName: 'Carlos Mendes',
      fromMe: false,
      wasSentByApi: false,
      isGroup: false,
      text: 'Oi! Quero agendar uma demo.'
    }
  });
  assert.equal(hook.status, 200);
  assert.equal(hook.body.stored, true);
  assert.equal(hook.body.workspace, 'demo');

  const demoState = (await local.call('/api/state?workspace=demo')).body.state;
  const contact = demoState.contacts.find(c => c.name === 'Carlos Mendes');
  assert.ok(contact, 'Inbound webhook should auto-create contact');
  const inbound = demoState.messages.find(m => m.contactId === contact.id && m.channel === 'WhatsApp');
  assert.equal(inbound?.body, 'Oi! Quero agendar uma demo.');
  assert.equal(inbound?.direction, 'Inbound');

  // Sending outbound WhatsApp from Conversas dispatches live through UAZAPI /send/text
  const reply = await local.call('/api/action?workspace=demo', {
    type: 'message',
    data: { contactId: contact.id, channel: 'WhatsApp', direction: 'Outbound', body: 'Claro, qual melhor horário?' }
  });
  assert.equal(reply.status, 200);
  assert.equal(reply.body.delivery?.sent, true);
  const sendCall = uaz.calls.find(c => c.path === '/send/text');
  assert.equal(sendCall?.body?.number, '5511977776666');
  assert.equal(sendCall?.body?.text, 'Claro, qual melhor horário?');
  assert.equal(sendCall?.headers?.token, token1);

  // Without a phone the message stays in Conversas, marked as failed ("Falha no envio de mensagem").
  const noPhone = await local.call('/api/action?workspace=demo', { type: 'save', key: 'contacts', data: { name: 'Sem telefone', tags: [], custom: {} } });
  const undelivered = await local.call('/api/action?workspace=demo', {
    type: 'message', data: { contactId: noPhone.body.id, channel: 'WhatsApp', direction: 'Outbound', body: 'Oi' }
  });
  assert.equal(undelivered.status, 200);
  assert.equal(undelivered.body.state.messages.find(m => m.id === undelivered.body.id)?.failed, 'no_phone');

  const message = { EventType: 'messages', message: { chatid: '5511966665555@c.us', senderName: 'Blocked contact', text: 'Suspended message' } };
  const beforePaused = local.store.load('demo');
  const sendCount = uaz.calls.length;
  const plan = await local.call('/api/agency/action', { type: 'save', key: 'plans', data: { name: 'Without conversations', price: 0, modules: ['settings'] } });
  assert.equal(plan.status, 200, plan.body.error);
  const assignedPlan = await local.call('/api/agency/action', { type: 'account-meta', id: 'demo', data: { status: 'Active', plan: plan.body.result } });
  assert.equal(assignedPlan.status, 200);
  assert.equal((await local.call(hookPath, message)).body.reason, 'MODULE_DISABLED');
  assert.deepEqual(local.store.load('demo'), beforePaused);
  for (const status of ['Paused', 'Closed']) {
    assert.equal((await local.call('/api/agency/action', { type: 'account-meta', id: 'demo', data: { status } })).status, 200);
    const ignored = await local.call(hookPath, message);
    assert.equal(ignored.status, 200);
    assert.deepEqual(ignored.body, { ok: true, ignored: true, reason: 'ACCOUNT_SUSPENDED' });
    assert.equal((await local.call('/api/action?workspace=demo', {
      type: 'message', data: { contactId: contact.id, channel: 'WhatsApp', direction: 'Outbound', body: 'Do not send' }
    })).body.code, 'ACCOUNT_SUSPENDED');
    assert.equal((await local.call('/api/whatsapp/workspace/test?workspace=demo', { phone: '5511966665555', text: 'Do not send' })).status, 403);
    assert.deepEqual(local.store.load('demo'), beforePaused);
    assert.equal(uaz.calls.length, sendCount);
  }
  assert.equal(local.store.load('agency').accounts.demo.ignoredWebhooks.uazapi.count, 2);
  assert.ok(rawDoc.subaccounts.demo.tokenSealed);
  assert.equal(local.store.load('whatsapp-agency').subaccounts.demo.tokenSealed, rawDoc.subaccounts.demo.tokenSealed);
  assert.equal((await local.call('/api/agency/action', { type: 'account-reactivate', id: 'demo' })).status, 200);
  assert.equal((await local.call(hookPath, message)).body.stored, true);

  // Disconnect demo cleanly
  const disc = await local.call('/api/whatsapp/workspace/disconnect?workspace=demo', {});
  assert.equal(disc.status, 200);
  assert.equal(disc.body.status, 'disconnected');
});

test('UAZAPI agency config persists through Supabase rules and sub-account users can connect their own QR only', async t => {
  const rows = new Map();
  const supabaseStore = createSupabaseStore({
    projectUrl: 'https://test.supabase.co',
    publishableKey: 'sb_publishable_test',
    storageKey: 'd'.repeat(64),
    async request(url, options = {}) {
      const u = new URL(url);
      const method = options.method || 'GET';
      const idParam = u.searchParams.get('id')?.replace(/^eq\./, '');
      const revParam = u.searchParams.get('revision')?.replace(/^eq\./, '');
      if (method === 'POST') {
        const body = JSON.parse(options.body);
        assert.ok(body.state?.profile?.name, `Row ${body.id} must have profile.name`);
        if (rows.has(body.id)) return new Response(JSON.stringify([]), { status: 200 });
        rows.set(body.id, { id: body.id, name: body.state.profile.name, state: structuredClone(body.state), revision: 'rev-0' });
        return new Response(JSON.stringify([{ id: body.id }]), { status: 201 });
      }
      if (method === 'PATCH') {
        const body = JSON.parse(options.body);
        assert.ok(body.state?.profile?.name, `PATCH ${idParam} must preserve profile.name`);
        const cur = rows.get(idParam);
        if (!cur || (revParam && cur.revision !== revParam)) return new Response(JSON.stringify([]), { status: 200 });
        cur.state = structuredClone(body.state);
        cur.revision = body.revision;
        return new Response(JSON.stringify([{ id: idParam }]), { status: 200 });
      }
      if (method === 'GET') {
        if (idParam) {
          const cur = rows.get(idParam);
          return new Response(JSON.stringify(cur ? [cur] : []), { status: 200 });
        }
        return new Response(JSON.stringify([...rows.values()].map(({ id, name }) => ({ id, name }))), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    }
  });

  const uaz = fakeUazapi();
  const local = await boot(t, {
    store: supabaseStore,
    whatsappRequest: uaz.request,
    uazapiBaseUrl: '',
    uazapiAdminToken: ''
  });

  // Agency configures its UAZAPI server once
  const cfg = await local.call('/api/whatsapp/agency/config', {
    baseUrl: 'https://agencia.uazapi.com',
    adminToken: 'uaz-admin-super-secret'
  });
  assert.equal(cfg.status, 200);
  assert.equal(cfg.body.configured, true);
  assert.equal(cfg.body.adminTokenLast4, 'cret');
  assert.ok(rows.has('whatsapp-agency'));
  assert.equal(JSON.stringify(rows.get('whatsapp-agency')).includes('uaz-admin-super-secret'), false);

  // Create a sub-account-only user with access to demo
  const uRes = await local.call('/api/agency/action', {
    type: 'save',
    key: 'users',
    data: { first: 'Ana', last: 'Cliente', email: 'ana@demo.test', role: 'Account Admin', accounts: ['demo'], permissions: ['conversations', 'settings'] }
  });
  assert.equal(uRes.status, 200);
  const subUserId = uRes.body.result;

  // Sub-account user CANNOT access agency UAZAPI config
  const denied = await local.call('/api/whatsapp/agency/status', undefined, { 'X-Go-User': subUserId });
  assert.equal(denied.status, 403);

  // Sub-account user CAN connect their own WhatsApp with 1-click QR code (without seeing server URL or admin token)
  const subConnect = await local.call('/api/whatsapp/workspace/connect?workspace=demo', {}, { 'X-Go-User': subUserId });
  assert.equal(subConnect.status, 200);
  assert.equal(subConnect.body.qrcode, FAKE_QR);
  assert.equal(JSON.stringify(subConnect.body).includes('agencia.uazapi.com'), false);
  assert.equal(JSON.stringify(subConnect.body).includes('uaz-admin-super-secret'), false);
});

test('UAZAPI: an event message is never repeated inside the call', async t => {
  const uaz = fakeUazapi();
  let reply = null, sends = 0;
  const request = async (url, init) => {
    if (!String(url).endsWith('/send/text') || !reply) return uaz.request(url, init);
    sends++;
    return reply();
  };
  const options = { uazapiBaseUrl: 'https://soci.uazapi.com', uazapiAdminToken: 'uaz-admin-super-secret' };
  const local = await boot(t, { whatsappRequest: request, ...options });
  await local.call('/api/whatsapp/workspace/connect?workspace=demo', {});
  uaz.markConnected([...uaz.instances.keys()][0], '5531988887777', 'Demo');
  await local.call('/api/whatsapp/workspace/status?workspace=demo');
  const handler = createWhatsAppHandler({ store: local.store, secret: 'uazapi-test-seal-secret-32-chars!!', request, envBaseUrl: options.uazapiBaseUrl, envAdminToken: options.uazapiAdminToken });
  const send = () => handler.sendEventMessage('agency', 'demo', { to: '5511977776666', part: { kind: 'text', text: 'Oi' } }, async () => true);
  const broken = { 502: () => new Response('{}', { status: 502 }), ECONNRESET: () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }); } };
  for (const [name, answer] of Object.entries(broken)) {
    reply = answer; sends = 0;
    assert.equal((await send()).outcome, 'unconfirmed', name);
    assert.equal(sends, 1, name);
  }
});
