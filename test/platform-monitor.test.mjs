import test from 'node:test';
import assert from 'node:assert/strict';
import { createSqliteStore } from '../storage.mjs';
import { createPlatformMonitor } from '../platform-monitor.mjs';
import { createSocialRoutes } from '../routes/social.mjs';

const HOUR = 3_600_000, MINUTE = 60_000;
const supabase = used => ({ service: 'supabase', name: 'Supabase', status: 'ok', plan: 'free', link: '', metrics: [{ key: 'db', label: 'Banco', used, limit: 100, unit: 'count', cycle: 'total' }] });

function setup({ used = 50, store = createSqliteStore(':memory:'), email = 'dono@example.test' } = {}) {
  let at = Date.UTC(2026, 10, 25, 12);
  const clock = { now: () => at, advance: ms => { at += ms; } };
  const collected = [];
  const state = { used };
  const collect = async context => { collected.push(context); return [supabase(state.used)]; };
  const mails = [];
  const mailer = { configured: true, email: async (to, message, idempotency) => { mails.push({ to, ...message, idempotency }); return 'e-mail enviado'; } };
  const monitor = createPlatformMonitor({ store, env: {}, request: fetch, mailer, now: clock.now, collect });
  return { monitor, store, clock, collected, mails, state, email };
}

test('runIfDue roda uma vez e só volta depois de 55 minutos', async () => {
  const { monitor, clock, collected } = setup();
  assert.equal(await monitor.runIfDue(), true);
  assert.equal(await monitor.runIfDue(), false);
  clock.advance(54 * MINUTE);
  assert.equal(await monitor.runIfDue(), false);
  clock.advance(MINUTE);
  assert.equal(await monitor.runIfDue(), true);
  assert.equal(collected.length, 2);
});

test('duas chamadas de cron ao mesmo tempo conferem uma vez só', async () => {
  const { monitor, collected } = setup();
  const results = await Promise.all([monitor.runIfDue(), monitor.runIfDue()]);
  assert.deepEqual(results.sort(), [false, true]);
  assert.equal(collected.length, 1);
});

test('82% manda um e-mail e a mesma leitura uma hora depois não repete', async () => {
  const { monitor, clock, mails } = setup({ used: 82 });
  await monitor.saveSettings({ alertEmail: 'dono@example.test' });
  await monitor.check();
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, 'dono@example.test');
  assert.match(mails[0].subject, /82%/);
  clock.advance(HOUR);
  await monitor.check();
  assert.equal(mails.length, 1);
});

test('se não conseguir gravar o estado, nenhum alerta sai', async () => {
  const base = createSqliteStore(':memory:');
  const { monitor: first } = setup({ store: base });
  await first.saveSettings({ alertEmail: 'dono@example.test' });
  const broken = { ...base, change(id, mutate) { if (id === 'platform-usage') throw new Error('read-only'); return base.change(id, mutate); } };
  const { monitor, mails } = setup({ store: broken, used: 99 });
  await assert.rejects(monitor.check(), /read-only/);
  assert.equal(mails.length, 0);
});

test('sem e-mail e sem push a conferência grava e avisa que não há canal', async () => {
  const { monitor } = setup({ used: 99 });
  const view = await monitor.check();
  assert.deepEqual(view.channels, { email: false, push: false });
  assert.equal(view.services[0].metrics[0].level, 'critical');
  assert.equal(view.services[0].metrics[0].pct, 99);
  assert.ok(view.checkedAt);
  assert.equal((await monitor.view()).services.length, 1);
});

test('o histórico guarda no máximo 168 pontos por hora e anota a previsão', async () => {
  const { monitor, clock, store, state } = setup();
  for (let i = 0; i < 200; i++) { state.used = 10 + i * 0.1; await monitor.check(); clock.advance(HOUR); }
  const row = store.load('platform-usage');
  assert.ok(row.history['supabase.db'].hourly.length <= 168);
  assert.ok(row.history['supabase.db'].daily.length <= 90);
  const view = await monitor.view();
  assert.match(view.services[0].metrics[0].projection, /^\d{4}-\d{2}-\d{2}$|^safe$/);
});

test('"Conferir agora" só pode rodar a cada 2 minutos', async () => {
  const { monitor, clock } = setup();
  await monitor.check({ manual: true });
  clock.advance(MINUTE);
  await assert.rejects(monitor.check({ manual: true }), problem => problem.status === 429 && /2 minutos/.test(problem.message));
  clock.advance(MINUTE);
  await monitor.check({ manual: true });
});

test('configurações inválidas são recusadas com 400', async () => {
  const { monitor } = setup();
  await assert.rejects(monitor.saveSettings({ alertEmail: 'x' }), problem => problem.status === 400);
  await assert.rejects(monitor.saveSettings({ twilioMinUsd: -1 }), problem => problem.status === 400);
  await assert.rejects(monitor.saveSettings({ plans: { supabase: 'enterprise' } }), problem => problem.status === 400);
  const view = await monitor.saveSettings({ twilioMinUsd: 25, plans: { supabase: 'pro', vercel: 'hobby' } });
  assert.equal(view.settings.twilioMinUsd, 25);
  assert.deepEqual(view.settings.plans, { supabase: 'pro', vercel: 'hobby' });
});

test('ensureEmail só preenche o e-mail de alerta quando está vazio', async () => {
  const { monitor } = setup();
  await monitor.ensureEmail('primeiro@example.test');
  await monitor.ensureEmail('segundo@example.test');
  assert.equal((await monitor.view()).settings.alertEmail, 'primeiro@example.test');
});

test('subscribe valida a inscrição de push e não repete aparelhos', async () => {
  const { monitor } = setup();
  await assert.rejects(monitor.subscribe({ endpoint: 'nada' }), problem => problem.status === 400);
  const sub = { endpoint: 'https://push.example.test/abc123456789', keys: { p256dh: Buffer.alloc(65, 4).toString('base64url'), auth: Buffer.alloc(16, 1).toString('base64url') } };
  await monitor.subscribe(sub);
  const view = await monitor.subscribe(sub);
  assert.equal(view.settings.pushDevices, 1);
  assert.equal(view.channels.push, true);
});

test('/api/social/cron responde mesmo quando a conferência da plataforma falha', async () => {
  process.env.CRON_SECRET = 'cron-test';
  const route = createSocialRoutes({
    error: (message, status) => Object.assign(new Error(message), { status }),
    runAllSocial: async () => 3, publicBase: () => 'http://local.test',
    platformMonitor: { runIfDue: async () => { throw new Error('boom'); } }
  });
  let answered;
  const result = await route({ req: { headers: { authorization: 'Bearer cron-test' } }, res: {}, p: '/api/social/cron', method: 'GET', url: new URL('http://local.test/api/social/cron'), id: '', json: body => { answered = body; return body; }, send: () => {} });
  assert.deepEqual(answered, { published: 3 });
  assert.deepEqual(result, { published: 3 });
});
