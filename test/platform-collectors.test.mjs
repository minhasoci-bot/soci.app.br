import test from 'node:test';
import assert from 'node:assert/strict';
import { collectAll, collectSupabase, collectVercel, collectCloudflare, collectHostinger, collectEvolution, collectTwilio } from '../platform-collectors.mjs';

const NOW = Date.UTC(2026, 10, 25, 12);
const MiB = 1024 * 1024;
const settings = { plans: {}, twilioMinUsd: 10 };
const metric = (reading, key) => reading.metrics.find(m => m.key === key);

/** request falso: responde pela primeira regra cujo trecho aparece na URL e guarda as chamadas. */
function fakeRequest(rules) {
  const calls = [];
  const request = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const rule = rules.find(([part]) => String(url).includes(part));
    if (!rule) return new Response('not found', { status: 404 });
    const answer = typeof rule[1] === 'function' ? await rule[1](String(url), options) : rule[1];
    return answer instanceof Response ? answer : Response.json(answer);
  };
  request.calls = calls;
  return request;
}
const never = () => new Promise(() => {});

test('cada coletor sem as variáveis devolve "não configurado" sem chamar a rede', async () => {
  const request = fakeRequest([]);
  for (const collect of [collectVercel, collectCloudflare, collectHostinger, collectEvolution, collectTwilio]) {
    const reading = await collect({ env: {}, request, store: {}, settings, now: NOW });
    assert.equal(reading.status, 'not-configured', reading.service);
  }
  assert.equal((await collectSupabase({ env: {}, request, store: {}, settings, now: NOW })).status, 'not-configured');
  assert.equal(request.calls.length, 0);
});

test('Supabase: banco, storage e ativos do mês contra os limites do plano Free', async () => {
  const store = { platformUsage: async () => ({ db_bytes: 412 * MiB, storage_bytes: 0, mau: 214 }) };
  const reading = await collectSupabase({ env: { SUPABASE_URL: 'https://zlkhoucdqfxgiorujifj.supabase.co' }, request: fakeRequest([]), store, settings, now: NOW });
  assert.equal(reading.status, 'ok');
  assert.equal(reading.plan, 'free');
  assert.deepEqual([metric(reading, 'db').used, metric(reading, 'db').limit], [412 * MiB, 524288000]);
  assert.equal(metric(reading, 'mau').cycle, 'month');
  assert.equal(metric(reading, 'egress').used, null);
  assert.equal(metric(reading, 'egress').note, 'a API não informa');
  assert.match(reading.link, /zlkhoucdqfxgiorujifj/);
});

test('Supabase: o plano Pro escolhido na página troca os limites', async () => {
  const store = { platformUsage: async () => ({ db_bytes: 1, storage_bytes: 1, mau: 1 }) };
  const reading = await collectSupabase({ env: {}, request: fakeRequest([]), store, settings: { ...settings, plans: { supabase: 'pro' } }, now: NOW });
  assert.equal(metric(reading, 'db').limit, 8 * 1024 * MiB);
});

test('Vercel: soma os deploys das 24 h em todas as páginas e lê o plano do time', async () => {
  const page = n => Array.from({ length: 60 }, (_, i) => ({ uid: `d${n}-${i}` }));
  const request = fakeRequest([
    ['/v2/teams/team_x', { slug: 'soci3', billing: { plan: 'hobby' } }],
    ['until=111', { deployments: page(2), pagination: { next: null } }],
    ['/v6/deployments', { deployments: page(1), pagination: { next: 111 } }]
  ]);
  const reading = await collectVercel({ env: { VERCEL_API_TOKEN: 'tok', VERCEL_TEAM_ID: 'team_x' }, request, store: {}, settings, now: NOW });
  assert.equal(reading.status, 'ok');
  assert.equal(reading.plan, 'hobby');
  assert.equal(metric(reading, 'deploys24h').used, 120);
  assert.equal(metric(reading, 'deploys24h').limit, 100);
  assert.ok(request.calls.some(c => c.url.includes(`since=${NOW - 86_400_000}`)));
  assert.equal(request.calls[0].options.headers.Authorization, 'Bearer tok');
  assert.match(reading.link, /vercel\.com\/soci3/);
});

test('Cloudflare: classe A, classe B e operações grátis do R2', async () => {
  const request = fakeRequest([['/graphql', { data: { viewer: { accounts: [{
    storage: [{ dimensions: { bucketName: 'a' }, max: { payloadSize: 1000, metadataSize: 24 } }, { dimensions: { bucketName: 'b' }, max: { payloadSize: 500, metadataSize: 0 } }],
    operations: [
      { dimensions: { actionType: 'PutObject' }, sum: { requests: 10 } },
      { dimensions: { actionType: 'GetObject' }, sum: { requests: 7 } },
      { dimensions: { actionType: 'DeleteObject' }, sum: { requests: 99 } }
    ] }] } } }]]);
  const reading = await collectCloudflare({ env: { CLOUDFLARE_API_TOKEN: 'cf', R2_ACCOUNT_ID: 'acc' }, request, store: {}, settings, now: NOW });
  assert.equal(reading.status, 'ok');
  assert.equal(metric(reading, 'r2Storage').used, 1524);
  assert.equal(metric(reading, 'r2ClassA').used, 10);
  assert.equal(metric(reading, 'r2ClassB').used, 7);
  assert.equal(metric(reading, 'r2ClassA').limit, 1000000);
  const body = JSON.parse(request.calls[0].options.body);
  assert.equal(body.variables.account, 'acc');
  assert.equal(body.variables.monthStart, '2026-11-01T00:00:00.000Z');
});

test('Cloudflare: erro no GraphQL vira erro curto', async () => {
  const request = fakeRequest([['/graphql', { data: null, errors: [{ message: 'not authorized for that account' }] }]]);
  const reading = await collectCloudflare({ env: { CLOUDFLARE_API_TOKEN: 'cf', R2_ACCOUNT_ID: 'acc' }, request, store: {}, settings, now: NOW });
  assert.equal(reading.status, 'error');
  assert.equal(reading.error, 'not authorized for that account');
});

test('Hostinger: escolhe a VPS da Evolution, lê disco, RAM, CPU e o vencimento', async () => {
  const vms = [
    { id: 1, plan: 'KVM 2', hostname: 'outra.hstgr.cloud', state: 'running', memory: 8192, disk: 102400, subscription_id: 'S1', ipv4: [{ address: '10.0.0.1' }] },
    { id: 2196904, plan: 'KVM 1', hostname: 'srv2196904.hstgr.cloud', state: 'running', memory: 4096, disk: 51200, subscription_id: 'AzysC8VbxAQmHFdH', ipv4: [{ address: '189.24.15.112' }] }
  ];
  const metrics = {
    cpu_usage: { unit: '%', usage: { 100: 2.5, 200: 3.5 } },
    ram_usage: { unit: 'bytes', usage: { 100: 800 * MiB, 200: 822 * MiB } },
    disk_space: { unit: 'bytes', usage: { 100: 8000 * MiB, 200: 8100 * MiB } }
  };
  const subs = [{ id: 'AzysC8VbxAQmHFdH', name: 'KVM 1', status: 'non_renewing', is_auto_renewed: false, expires_at: '2026-12-25T03:48:27Z', next_billing_at: null }];
  const request = fakeRequest([['/metrics', metrics], ['/virtual-machines', vms], ['/subscriptions', subs]]);
  const reading = await collectHostinger({ env: { HOSTINGER_API_TOKEN: 'h', EVOLUTION_BASE_URL: 'http://189.24.15.112:8080' }, request, store: {}, settings, now: NOW });
  assert.equal(reading.status, 'ok');
  assert.equal(reading.plan, 'KVM 1');
  assert.deepEqual([metric(reading, 'disk').used, metric(reading, 'disk').limit], [8100 * MiB, 51200 * MiB]);
  assert.deepEqual([metric(reading, 'ram').used, metric(reading, 'ram').limit], [822 * MiB, 4096 * MiB]);
  assert.equal(metric(reading, 'cpu').used, 3);
  assert.equal(metric(reading, 'expires').used, 29);
  assert.equal(metric(reading, 'expires').kind, 'deadline');
  assert.ok(request.calls.some(c => c.url.includes('/virtual-machines/2196904/metrics')));
});

test('Hostinger: com renovação automática não há métrica de vencimento', async () => {
  const vms = [{ id: 7, plan: 'KVM 1', hostname: 'x', memory: 1024, disk: 1024, subscription_id: 'S', ipv4: [] }];
  const subs = [{ id: 'S', is_auto_renewed: true, status: 'active', expires_at: '2026-12-25T00:00:00Z', next_billing_at: '2026-12-25T00:00:00Z' }];
  const request = fakeRequest([['/metrics', {}], ['/virtual-machines', vms], ['/subscriptions', subs]]);
  const reading = await collectHostinger({ env: { HOSTINGER_API_TOKEN: 'h' }, request, store: {}, settings, now: NOW });
  assert.equal(metric(reading, 'expires'), undefined);
  assert.match(reading.plan, /renova sozinho em 25\/12/);
});

test('Evolution: conta as instâncias e falha quando não responde 2xx', async () => {
  const env = { EVOLUTION_BASE_URL: 'http://evo.test:8080/', EVOLUTION_API_KEY: 'k' };
  const ok = fakeRequest([['/instance/fetchInstances', [{ name: 'a' }, { name: 'b' }]]]);
  const reading = await collectEvolution({ env, request: ok, store: {}, settings, now: NOW });
  assert.equal(metric(reading, 'instances').used, 2);
  assert.equal(ok.calls[0].url, 'http://evo.test:8080/instance/fetchInstances');
  assert.equal(ok.calls[0].options.headers.apikey, 'k');
  const down = fakeRequest([['/instance', new Response('', { status: 502 })]]);
  assert.equal((await collectEvolution({ env, request: down, store: {}, settings, now: NOW })).error, 'HTTP 502');
});

test('Twilio: saldo contra o mínimo definido na página', async () => {
  const request = fakeRequest([['/Balance.json', { balance: '7.50', currency: 'USD' }]]);
  const reading = await collectTwilio({ env: { TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'secret' }, request, store: {}, settings: { ...settings, twilioMinUsd: 20 }, now: NOW });
  assert.equal(metric(reading, 'balance').used, 7.5);
  assert.equal(metric(reading, 'balance').limit, 20);
  assert.equal(metric(reading, 'balance').kind, 'floor');
  assert.match(request.calls[0].options.headers.Authorization, /^Basic /);
});

test('erro HTTP vira texto curto, sem token nem URL', async () => {
  const request = fakeRequest([['api.vercel.com', new Response('{"error":{"message":"token tok-123 invalid"}}', { status: 401 })]]);
  const reading = await collectVercel({ env: { VERCEL_API_TOKEN: 'tok-123', VERCEL_TEAM_ID: 'team_x' }, request, store: {}, settings, now: NOW });
  assert.equal(reading.status, 'error');
  assert.equal(reading.error, 'HTTP 401');
  assert.doesNotMatch(JSON.stringify(reading), /tok-123|api\.vercel\.com/);
});

test('collectAll: um serviço travado não segura os outros', async () => {
  const request = fakeRequest([
    ['/Balance.json', never],
    ['/instance/fetchInstances', []]
  ]);
  const env = { TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 's', EVOLUTION_BASE_URL: 'http://evo.test', EVOLUTION_API_KEY: 'k' };
  const store = { platformUsage: async () => ({ db_bytes: 1, storage_bytes: 0, mau: 0 }) };
  const started = Date.now();
  const readings = await collectAll({ env, request, store, settings, now: NOW, timeoutMs: 50 });
  assert.ok(Date.now() - started < 9000);
  assert.deepEqual(readings.map(r => r.service), ['supabase', 'vercel', 'cloudflare', 'hostinger', 'evolution', 'twilio']);
  const by = Object.fromEntries(readings.map(r => [r.service, r]));
  assert.deepEqual([by.twilio.status, by.twilio.error], ['error', 'tempo esgotado']);
  assert.equal(by.evolution.status, 'ok');
  assert.equal(by.supabase.status, 'ok');
  assert.equal(by.vercel.status, 'not-configured');
});

test('collectAll: uma exceção inesperada num coletor vira erro daquele serviço', async () => {
  const store = { platformUsage: async () => { throw new Error('connection reset by peer at 10.0.0.5'); } };
  const readings = await collectAll({ env: {}, request: fakeRequest([]), store, settings, now: NOW, timeoutMs: 50 });
  const supabase = readings.find(r => r.service === 'supabase');
  assert.equal(supabase.status, 'error');
  assert.equal(supabase.error, 'falha na leitura');
});
