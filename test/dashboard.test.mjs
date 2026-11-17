import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { priorDates, resolveDates, widgets } from '../ui/dashboard-data.js';
import { metricByKind, metricGroups, metricTrend, metricValue } from '../ui/dashboard-metrics.js';

async function start(t) {
  const { server, host } = makeServer({ dbPath: ':memory:', port: 0, auth: null, allowLocalAccess: true, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  return async command => {
    const response = await fetch(`${base}/api/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
    return { status: response.status, body: await response.json() };
  };
}

test('Date presets cover weeks, quarters and next periods, and comparisons use the previous period or year', () => {
  const now = new Date('2026-11-17T15:00:00Z');
  const zone = 'America/Sao_Paulo';
  assert.deepEqual(resolveDates({ period: 'week' }, zone, now), { start: '2026-11-15', end: '2026-11-21' });
  assert.deepEqual(resolveDates({ period: 'previousQuarter' }, zone, now), { start: '2026-07-01', end: '2026-09-30' });
  assert.deepEqual(resolveDates({ period: 'nextMonth' }, zone, now), { start: '2026-12-01', end: '2026-12-31' });
  assert.deepEqual(resolveDates({ period: 'tillDate' }, zone, now), { start: '0001-01-01', end: '2026-11-17' });
  assert.deepEqual(priorDates({ start: '2026-11-01', end: '2026-11-10' }), { start: '2026-10-22', end: '2026-10-31' });
  assert.deepEqual(priorDates({ start: '2024-02-29', end: '2024-03-10' }, 'year'), { start: '2023-02-28', end: '2023-03-10' });
  assert.equal(priorDates({ start: '0001-01-01', end: '2026-11-17' }), null);
});

test('Metric widgets compute counts, sums, averages, groups and time buckets from workspace data', () => {
  const zone = 'America/Sao_Paulo';
  const state = {
    profile: { timezone: zone }, stages: [], forms: [{ id: 'f1', name: 'Contato' }],
    contacts: [
      { created: '2026-11-02T12:00:00Z', tags: ['VIP', 'Lead'], email: 'a@x.test', phone: '' },
      { created: '2026-11-03T12:00:00Z', tags: ['Lead'], email: '', phone: '1' },
      { created: '2026-09-01T12:00:00Z', tags: [], email: '', phone: '' }
    ],
    transactions: [
      { date: '2026-11-05', amount: 100, status: 'Succeeded', method: 'Pix' },
      { date: '2026-11-06', amount: 300, status: 'Succeeded', method: 'Card' },
      { date: '2026-11-06', amount: 999, status: 'Failed', method: 'Card' }
    ],
    reviews: [{ created: '2026-11-04T10:00:00Z', score: 5 }, { created: '2026-11-04T11:00:00Z', score: 4, reply: 'Obrigado' }],
    submissions: [{ created: '2026-11-04T10:00:00Z', formId: 'f1' }]
  };
  const ctx = { range: { start: '2026-11-01', end: '2026-11-17' }, zone, today: '2026-11-17', tag: '' };
  assert.equal(metricValue(metricByKind['m-contacts-count'], state, ctx), 2);
  assert.equal(metricValue(metricByKind['m-contacts-total'], state, ctx), 3);
  assert.equal(metricValue(metricByKind['m-contacts-count'], state, { ...ctx, tag: 'VIP' }), 1);
  assert.equal(metricValue(metricByKind['m-revenue'], state, ctx), 400);
  assert.equal(metricValue(metricByKind['m-ticket'], state, ctx), 200);
  assert.equal(metricValue(metricByKind['m-reviews-average'], state, ctx), 4.5);
  assert.equal(metricValue(metricByKind['m-reviews-unanswered'], state, ctx), 1);
  assert.deepEqual(metricGroups(metricByKind['m-contacts-tags'], state, ctx), [{ name: 'Lead', value: 2 }, { name: 'VIP', value: 1 }]);
  assert.deepEqual(metricGroups(metricByKind['m-revenue-method'], state, ctx), [{ name: 'Card', value: 300 }, { name: 'Pix', value: 100 }]);
  assert.deepEqual(metricGroups(metricByKind['m-submissions-form'], state, ctx), [{ name: 'Contato', value: 1 }]);
  const series = metricTrend(metricByKind['m-revenue-trend'], state, ctx);
  assert.equal(series.unit, 'day');
  assert.equal(series.buckets.length, 17);
  assert.equal(series.buckets.find(bucket => bucket.key === '2026-11-06').value, 300);
  assert.equal(metricTrend(metricByKind['m-contacts-trend'], state, { ...ctx, range: { start: '2026-01-01', end: '2026-11-17' } }).unit, 'month');
});

test('Dashboards import templates, validate elements and support default, timezone and delete', async t => {
  const action = await start(t);
  assert.ok(Object.keys(widgets).length > 80);
  const bad = await action({ type: 'dashboard-create', data: { name: 'Modelo', widgets: [{ kind: 'image', title: 'Logo', url: 'http://example.test/a.png' }] } });
  assert.equal(bad.status, 400);
  const created = await action({ type: 'dashboard-create', data: { name: 'Modelo', theme: 'green', widgets: [
    { kind: 'm-contacts-count', title: 'Contatos' }, { kind: 'heading', title: 'Vendas', note: '' },
    { kind: 'image', title: 'Logo', url: 'https://example.test/logo.png' }
  ] } });
  assert.equal(created.status, 200);
  const id = created.body.id;
  let board = created.body.state.dashboards.find(item => item.id === id);
  assert.equal(board.theme, 'green');
  assert.deepEqual(board.widgets.map(item => item.kind), ['m-contacts-count', 'heading', 'image']);
  assert.equal(new Set(board.widgets.map(item => item.id)).size, 3);

  assert.equal((await action({ type: 'dashboard-timezone', id, data: { timezone: 'Mars/Base' } })).status, 400);
  board = (await action({ type: 'dashboard-timezone', id, data: { timezone: 'Europe/Lisbon' } })).body.state.dashboards.find(item => item.id === id);
  assert.equal(board.timezone, 'Europe/Lisbon');
  const saved = await action({ type: 'dashboard-save', id, data: { ...board, theme: 'unknown', widgets: [...board.widgets, { id: 'txt', kind: 'text', title: 'Texto', note: '' }] } });
  assert.equal(saved.status, 400);
  const resaved = await action({ type: 'dashboard-save', id, data: { ...board, theme: 'purple' } });
  assert.equal(resaved.body.state.dashboards.find(item => item.id === id).theme, 'purple');

  const report = await action({ type: 'dashboard-report', id, data: { name: 'Resumo', period: 'all' } });
  assert.deepEqual(report.body.state.dashboardReports[0].rows, [['Contatos', 'Total', 3]]);

  const chosen = await action({ type: 'dashboard-default', id, data: {} });
  assert.equal(chosen.body.state.defaultDashboard, id);
  const removed = await action({ type: 'dashboard-delete', id, data: {} });
  assert.equal(removed.body.state.defaultDashboard, undefined);
  assert.deepEqual(removed.body.state.dashboards.map(item => item.id), ['dashboard']);
  assert.equal((await action({ type: 'dashboard-delete', id: 'dashboard', data: {} })).status, 400);
});
