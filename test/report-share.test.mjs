import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { blank, execute } from '../model.mjs';
import { reportsDue } from '../report-model.mjs';

async function start(options = {}) {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false, ...options });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body, headers = {}) => {
    const r = await fetch(base + path, body === undefined ? { headers } : { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const text = await r.text();
    let json; try { json = JSON.parse(text); } catch { json = null; }
    return { status: r.status, body: json, text, type: r.headers.get('content-type'), csp: r.headers.get('content-security-policy') };
  };
  const workspace = (await call('/api/workspaces', { name: 'Relatórios' })).body.id;
  const q = path => `${path}${path.includes('?') ? '&' : '?'}workspace=${workspace}`;
  const act = command => call(q('/api/action'), command);
  const state = async () => (await call(q('/api/state'))).body.state;
  return { call, q, act, state, workspace, close: () => new Promise(resolve => server.close(resolve)) };
}

test('A report share link expires, can be renewed and revoking it also cancels the schedule', () => {
  const s = blank();
  const id = execute(s, { type: 'report-create', data: { source: 'template', sourceId: 'social', name: 'Mensal' } });
  const report = () => s.customReports.find(r => r.id === id);
  assert.throws(() => execute(s, { type: 'report-share', id, data: { action: 'create', days: 3 } }), /validade/);
  execute(s, { type: 'report-share', id, data: { action: 'create', days: 30, lang: 'es' } });
  const first = report().share;
  assert.match(first.id, /^[0-9a-f]{64}$/);
  assert.equal(first.lang, 'es');
  assert.ok(Math.abs(Date.parse(first.expires) - Date.now() - 30 * 86_400_000) < 60_000);
  assert.equal(report().version, 1, 'sharing does not conflict with an open editor draft');
  execute(s, { type: 'report-share', id, data: { action: 'create', days: 0 } });
  assert.notEqual(report().share.id, first.id, 'a new link replaces the old one');
  assert.equal(report().share.expires, '');

  assert.throws(() => execute(s, { type: 'report-schedule', id, data: { frequency: 'weekly', weekday: 1, time: '09:00', recipients: '' } }), /ao menos um e-mail/);
  assert.throws(() => execute(s, { type: 'report-schedule', id, data: { frequency: 'weekly', weekday: 1, time: '09:00', recipients: 'a@b.com, não-é-email' } }), /E-mail inválido/);
  assert.throws(() => execute(s, { type: 'report-schedule', id, data: { frequency: 'weekly', weekday: 1, time: '09:00', recipients: Array.from({ length: 11 }, (_, n) => `p${n}@x.com`) } }), /até 10/);
  assert.throws(() => execute(s, { type: 'report-schedule', id, data: { frequency: 'monthly', monthday: 31, time: '09:00', recipients: 'a@b.com' } }), /entre 1 e 28/);
  execute(s, { type: 'report-schedule', id, data: { frequency: 'weekly', weekday: 1, time: '09:00', recipients: 'Cliente@Empresa.com; cliente@empresa.com, dono@empresa.com' } });
  assert.deepEqual(report().schedule.recipients, ['cliente@empresa.com', 'dono@empresa.com']);
  execute(s, { type: 'report-share', id, data: { action: 'revoke' } });
  assert.equal(report().share, undefined);
  assert.equal(report().schedule, undefined);

  execute(s, { type: 'report-schedule', id, data: { frequency: 'monthly', monthday: 5, time: '08:30', recipients: 'a@b.com' } });
  assert.match(report().share.id, /^[0-9a-f]{64}$/, 'a schedule creates the link it sends');
});

test('Scheduled reports fall due once per slot in the workspace time zone', () => {
  const s = blank();
  s.profile.timezone = 'America/Sao_Paulo';
  const id = execute(s, { type: 'report-create', data: { source: 'blank', name: 'Semanal' } });
  execute(s, { type: 'report-schedule', id, data: { frequency: 'weekly', weekday: 1, time: '09:00', recipients: 'a@b.com' } });
  // Monday 2026-11-23, 08:59 and 09:01 in São Paulo (UTC-3).
  assert.deepEqual(reportsDue(s, new Date('2026-11-23T11:59:00Z')), []);
  assert.deepEqual(reportsDue(s, new Date('2026-11-23T12:01:00Z')), [{ id, slot: '2026-11-23' }]);
  assert.deepEqual(reportsDue(s, new Date('2026-11-24T12:01:00Z')), [], 'Tuesday is not the chosen day');
  execute(s, { type: 'report-sent', id, data: { slot: '2026-11-23' } });
  assert.deepEqual(reportsDue(s, new Date('2026-11-23T20:00:00Z')), [], 'the slot is sent only once');
  assert.ok(s.customReports[0].schedule.lastSent);
  execute(s, { type: 'report-sent', id, data: { slot: '2026-11-30', error: 'HTTP 422' } });
  assert.equal(s.customReports[0].schedule.lastError, 'HTTP 422');
  const expired = s.customReports[0];
  expired.share.expires = '2026-01-01T00:00:00.000Z';
  assert.deepEqual(reportsDue(s, new Date('2026-12-07T12:01:00Z')), [], 'an expired link stops the schedule');
});

test('The shared report page renders on the server, in either language, and closes when revoked', async t => {
  const local = await start(); t.after(local.close);
  const id = (await local.act({ type: 'report-create', data: { source: 'template', sourceId: 'activity', name: 'Atividade de novembro' } })).body.id;
  await local.act({ type: 'save', key: 'contacts', data: { name: 'Contato Secreto', email: 'segredo@cliente.com' } });
  await local.act({ type: 'report-share', id, data: { action: 'create', days: 7 } });
  const report = (await local.state()).customReports.find(r => r.id === id);
  const path = `/relatorio/${local.workspace}/${report.share.id}`;

  const page = await local.call(path);
  assert.equal(page.status, 200);
  assert.match(page.type, /text\/html/);
  assert.match(page.text, /Atividade de novembro/);
  assert.match(page.text, /<html lang="pt-BR">/);
  assert.doesNotMatch(page.text, /<script/i, 'the page carries no script');
  assert.doesNotMatch(page.text, /segredo@cliente\.com/, 'data outside the report widgets stays private');
  assert.match(page.csp, /default-src 'none'/);
  const spanish = (await local.call(`${path}?lang=es`)).text;
  assert.match(spanish, /<html lang="es-419">/);
  assert.match(spanish, /Datos actualizados/);
  assert.doesNotMatch(spanish, /Nenhum dado no período|Nenhuma tarefa encontrada/, 'widget text is translated too');

  assert.equal((await local.call(`/relatorio/${local.workspace}/${'0'.repeat(64)}`)).status, 404);
  assert.equal((await local.act({ type: 'report-sent', id, data: { slot: 'x' } })).status, 400, 'only the scheduler records deliveries');
  await local.act({ type: 'report-share', id, data: { action: 'revoke' } });
  assert.equal((await local.call(path)).status, 404);
});

test('The scheduler e-mails the report link once and records the delivery', async t => {
  process.env.CRON_SECRET = 'cron-test';
  t.after(() => { delete process.env.CRON_SECRET; });
  const sent = [];
  const reportMail = { configured: true, async send(workspace, state, report, slot) { sent.push({ workspace, report: report.name, to: report.schedule.recipients, slot }); } };
  const local = await start({ reportMail }); t.after(local.close);
  assert.equal((await local.call(local.q('/api/state'))).body.features.reportEmail, true);
  const id = (await local.act({ type: 'report-create', data: { source: 'blank', name: 'Resumo semanal' } })).body.id;
  const zone = (await local.state()).profile.timezone || 'America/Sao_Paulo';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short' }).format(new Date()));
  await local.act({ type: 'report-schedule', id, data: { frequency: 'weekly', weekday, time: '00:00', recipients: 'cliente@empresa.com' } });
  const cron = () => local.call('/api/social/cron', undefined, { Authorization: 'Bearer cron-test' });
  assert.equal((await cron()).status, 200);
  await cron();
  assert.equal(sent.length, 1, 'one e-mail per slot');
  assert.deepEqual([sent[0].workspace, sent[0].report, sent[0].to], [local.workspace, 'Resumo semanal', ['cliente@empresa.com']]);
  const schedule = (await local.state()).customReports.find(r => r.id === id).schedule;
  assert.ok(schedule.lastSent);
  assert.equal(schedule.lastError, '');
});
