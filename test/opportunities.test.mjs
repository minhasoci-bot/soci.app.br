import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { makeServer } from '../server.mjs';
import { addMonths, closeDateIn, forecast, forecastColumns, riskSettings } from '../ui/crm-data.js';
import { opportunityResults } from '../ui/opportunity-data.js';
import { cleanRules, dayIn, matchesRules, periodOf, prebuiltSmartTags, ruleContext, smartTagsFor, smartTagsOf } from '../ui/opportunity-filters.js';

const at = Date.parse('2026-11-18T15:00:00Z'); // a Wednesday
function workspace() {
  const s = blank();
  s.profile.timezone = 'America/Sao_Paulo';
  const save = (key, data) => execute(s, { type: 'save', key, data });
  const ana = save('contacts', { name: 'Ana', email: 'ana@example.test', tags: 'VIP, Lead', company: 'Norte' });
  const bia = save('contacts', { name: 'Bia', phone: '+55 11 5555-0101' });
  const deal = (data, created) => {
    const id = save('opportunities', { contactId: ana, stage: 'new', value: 0, ...data });
    const row = s.opportunities.find(r => r.id === id);
    if (created) Object.assign(row, { created, updated: created, statusChangedAt: created, stageChangedAt: created });
    return row;
  };
  return { s, ana, bia, deal };
}

test('Rules join conditions with AND inside a group and groups with OR', () => {
  const { s, bia, deal } = workspace();
  const big = deal({ title: 'Big', value: 12000, owner: 'João', source: 'Indicação' });
  const small = deal({ title: 'Small', value: 800, owner: '', contactId: bia });
  const lost = deal({ title: 'Lost', value: 5000, status: 'Lost', lostReason: 'Preço' });
  const ctx = ruleContext(s, { at });
  const run = groups => s.opportunities.filter(d => matchesRules(d, cleanRules(groups), ctx)).map(d => d.title);
  assert.deepEqual(run([]), ['Big', 'Small', 'Lost']);
  assert.deepEqual(run([[{ field: 'value', op: 'gt', value: 1000 }, { field: 'status', op: 'anyOf', value: ['Open'] }]]), ['Big']);
  assert.deepEqual(run([[{ field: 'value', op: 'gt', value: 10000 }], [{ field: 'owner', op: 'empty' }]]), ['Big', 'Small', 'Lost']);
  assert.deepEqual(run([[{ field: 'owner', op: 'notEmpty' }]]), ['Big']);
  assert.deepEqual(run([[{ field: 'source', op: 'contains', value: 'indicacao' }]]), ['Big'], 'text match ignores accents and case');
  assert.deepEqual(run([[{ field: 'contactTags', op: 'hasAny', value: ['vip'] }]]), ['Big', 'Lost']);
  assert.deepEqual(run([[{ field: 'contactTags', op: 'empty' }]]), ['Small']);
  assert.deepEqual(run([[{ field: 'status', op: 'noneOf', value: ['Open'] }]]), ['Lost']);
  assert.deepEqual(run([[{ field: 'lostReason', op: 'is', value: 'preço' }]]), ['Lost']);
  assert.deepEqual(run([[{ field: 'company', op: 'is', value: 'Norte' }]]), ['Big', 'Lost']);
  assert.deepEqual(run([[{ field: 'contact', op: 'contains', value: '5555' }]]), ['Small']);
  assert.deepEqual(run([[{ field: 'value', op: 'lte', value: 800 }]]), ['Small']);
  assert.deepEqual(run([[{ field: 'lostAt', op: 'is', value: 'notEmpty' }]]), ['Lost']);
});

test('Date rules use the workspace time zone and calendar periods', () => {
  const { s, deal } = workspace();
  // 01:30 UTC on the 18th is still the 17th in São Paulo.
  deal({ title: 'Yesterday', closeDate: '2026-11-17' }, '2026-11-18T01:30:00.000Z');
  deal({ title: 'Month start', closeDate: '2026-11-01' }, '2026-11-02T12:00:00.000Z');
  deal({ title: 'Old' }, '2026-06-01T12:00:00.000Z');
  const ctx = ruleContext(s, { at });
  assert.equal(ctx.today, '2026-11-18');
  assert.equal(dayIn('2026-11-18T01:30:00.000Z', 'America/Sao_Paulo'), '2026-11-17');
  assert.deepEqual(periodOf('week', '2026-11-18'), ['2026-11-16', '2026-11-22']);
  assert.deepEqual(periodOf('quarter', '2026-11-18'), ['2026-10-01', '2026-12-31']);
  const run = rule => s.opportunities.filter(d => matchesRules(d, cleanRules([[rule]]), ctx)).map(d => d.title);
  assert.deepEqual(run({ field: 'created', op: 'is', value: 'yesterday' }), ['Yesterday']);
  assert.deepEqual(run({ field: 'created', op: 'is', value: 'thisWeek' }), ['Yesterday']);
  assert.deepEqual(run({ field: 'created', op: 'is', value: 'thisMonth' }), ['Yesterday', 'Month start']);
  assert.deepEqual(run({ field: 'created', op: 'isNot', value: 'thisYear' }), []);
  assert.deepEqual(run({ field: 'created', op: 'is', value: 'moreThan', days: 30 }), ['Old']);
  assert.deepEqual(run({ field: 'created', op: 'is', value: 'inLast', days: 3 }), ['Yesterday']);
  assert.deepEqual(run({ field: 'closeDate', op: 'is', value: 'between', date: '2026-11-01', date2: '2026-11-10' }), ['Month start']);
  assert.deepEqual(run({ field: 'closeDate', op: 'is', value: 'empty' }), ['Old']);
  assert.deepEqual(run({ field: 'closeDate', op: 'is', value: 'before', date: '2026-11-05' }), ['Month start']);
  assert.deepEqual(run({ field: 'lateDays', op: 'gte', value: 10 }), ['Month start']);
});

test('Untrusted rules are cleaned and the board filters with them', () => {
  assert.deepEqual(cleanRules([[{ field: 'nope', op: 'is' }, { field: 'value', op: 'weird', value: 'x' }], 'bad', []]),
    [[{ field: 'value', op: 'eq', value: '' }]]);
  assert.deepEqual(cleanRules([[{ field: 'created', op: 'is', value: 'inLast', days: '-4' }]]), [[{ field: 'created', op: 'is', value: 'inLast', days: 0 }]]);
  const { s, deal } = workspace();
  deal({ title: 'A', value: 100 }); deal({ title: 'B', value: 900 });
  const rows = opportunityResults(s, s.pipelines[0].id, '', { status: 'Open', rules: [[{ field: 'value', op: 'gt', value: 500 }]] });
  assert.deepEqual(rows.map(r => r.title), ['B']);
});

test('Smart tags are validated, shared across pipelines on request and computed per deal', () => {
  const { s, deal } = workspace();
  const pipelineId = s.pipelines[0].id;
  const high = prebuiltSmartTags.find(t => t.key === 'high-value');
  const tagId = execute(s, { type: 'smart-tag', data: { pipelineId, ...high } });
  assert.throws(() => execute(s, { type: 'smart-tag', data: { pipelineId, name: 'alto valor', rules: high.rules } }), /already has/);
  assert.throws(() => execute(s, { type: 'smart-tag', data: { pipelineId, name: 'Empty', rules: [] } }), /at least one rule/);
  const other = execute(s, { type: 'pipeline', data: { name: 'Parcerias' } });
  execute(s, { type: 'smart-tag', data: { pipelineId: other, name: 'Sem dono', color: 'blue', allPipelines: true, rules: [[{ field: 'owner', op: 'empty' }]] } });
  const big = deal({ title: 'Big', value: 15000, owner: '' });
  const ctx = ruleContext(s, { at });
  const tags = smartTagsFor(s, pipelineId);
  assert.deepEqual(tags.map(t => t.name), ['Alto valor', 'Sem dono']);
  assert.deepEqual(smartTagsOf(big, tags, ctx).map(t => t.name), ['Alto valor', 'Sem dono']);
  assert.deepEqual(smartTagsFor(s, other).map(t => t.name), ['Sem dono']);
  execute(s, { type: 'smart-tag-delete', id: tagId, data: { pipelineId } });
  assert.deepEqual(smartTagsFor(s, pipelineId).map(t => t.name), ['Sem dono']);
});

test('Pipelines can be reordered, duplicated and deleted only when empty; stages too', () => {
  const { s, deal } = workspace();
  const first = s.pipelines[0].id;
  const second = execute(s, { type: 'pipeline', data: { name: 'Second' } });
  execute(s, { type: 'pipeline-order', data: { ids: [second, first] } });
  assert.deepEqual(s.pipelines.map(p => p.id), [second, first]);
  assert.throws(() => execute(s, { type: 'pipeline-order', data: { ids: [second] } }), /every item/);
  execute(s, { type: 'pipeline-settings', id: first, data: { dealProbability: false, colorMode: 'dot' } });
  execute(s, { type: 'stage', id: 'new', data: { name: 'New Lead', probability: 12.5, color: 'blue' } });
  const copy = execute(s, { type: 'pipeline-duplicate', id: first });
  assert.deepEqual(s.pipelines.map(p => p.id), [second, first, copy]);
  const copied = s.stages.filter(st => st.pipelineId === copy);
  assert.deepEqual(copied.map(st => st.name), s.stages.filter(st => st.pipelineId === first).map(st => st.name));
  assert.equal(copied[0].probability, 12.5);
  assert.equal(copied[0].color, 'blue');
  assert.equal(s.pipelines.find(p => p.id === copy).dealProbability, false);
  const stageIds = s.stages.filter(st => st.pipelineId === second).map(st => st.id);
  execute(s, { type: 'stage-order', data: { pipelineId: second, ids: [...stageIds].reverse() } });
  assert.deepEqual(s.stages.filter(st => st.pipelineId === second).map(st => st.id), [...stageIds].reverse());
  // A workflow that starts on a deleted stage is unpublished.
  s.workflows.push({ id: 'w1', name: 'On stage', trigger: 'Opportunity stage changed', stageId: stageIds[0], active: true, actions: [] });
  execute(s, { type: 'stage-delete', id: stageIds[0] });
  assert.deepEqual([s.workflows[0].stageId, s.workflows[0].active], ['', false]);
  deal({ title: 'Busy' });
  assert.throws(() => execute(s, { type: 'stage-delete', id: 'new' }), /Move the 1 opportunity/);
  assert.throws(() => execute(s, { type: 'pipeline-delete', id: first }), /Move or delete the 1 opportunity/);
  execute(s, { type: 'pipeline-delete', id: second });
  assert.ok(!s.stages.some(st => st.pipelineId === second));
  execute(s, { type: 'pipeline-delete', id: copy });
  assert.throws(() => execute(s, { type: 'pipeline-delete', id: first }), /at least one pipeline/);
});

test('Stage moves stamp the stage change date and the timeline moves close dates with slips', () => {
  const { s, deal } = workspace();
  const row = deal({ title: 'A', value: 1000, closeDate: '2026-11-20' });
  execute(s, { type: 'opportunity-move', id: row.id, data: { stage: 'qualified' } });
  assert.ok(row.stageChangedAt >= row.created);
  execute(s, { type: 'opportunity-close', id: row.id, data: { closeDate: '2026-12-20' } });
  execute(s, { type: 'opportunity-close', id: row.id, data: { closeDate: '2026-12-01' } });
  assert.equal(row.slips, 1, 'only a later date counts as a slip');
  execute(s, { type: 'opportunity-close', id: row.id, data: { closeDate: '' } });
  assert.equal(row.closeDate, '');
  assert.throws(() => execute(s, { type: 'opportunity-close', id: row.id, data: { closeDate: '2026-13-01' } }), /valid close date/);
});

test('Forecast honors stage-only probability, risk settings, quality lists and groups; timeline columns', () => {
  const { s, deal } = workspace();
  execute(s, { type: 'stage', id: 'new', data: { name: 'New Lead', probability: 10 } });
  deal({ title: 'A', value: 1000, probability: 50, closeDate: '2026-11-10', owner: 'Ana' });
  deal({ title: 'B', value: 0, closeDate: '2026-12-05' });
  deal({ title: 'C', value: 400, status: 'Won', closeDate: '2026-11-15', owner: 'Ana' });
  const base = forecast(s, { at });
  assert.equal(base.expected, 500);
  execute(s, { type: 'pipeline-settings', id: s.pipelines[0].id, data: { dealProbability: false } });
  const stageOnly = forecast(s, { at });
  assert.equal(stageOnly.expected, 100);
  assert.deepEqual(stageOnly.missingValue.map(d => d.title), ['B']);
  assert.deepEqual(stageOnly.overdue.map(d => d.title), ['A']);
  assert.deepEqual(stageOnly.risk.Medium.map(x => x.deal.title), ['A'], '8 days late is medium by default');
  const strict = forecast(s, { at, risk: { High: { slips: 0, days: 5 } } });
  assert.deepEqual(strict.risk.High.map(x => x.deal.title), ['A']);
  assert.deepEqual(strict.riskTotals.High, { count: 1, value: 1000 });
  assert.deepEqual(riskSettings({ Low: { slips: 'x', days: -1 } }).Low, { slips: 1, days: 1 });
  const byOwner = forecast(s, { at, groupBy: 'owner' });
  assert.deepEqual(byOwner.groups.map(g => [g.key, g.count, g.potential, g.won]), [['Ana', 2, 1000, 400], ['', 1, 0, 0]]);
  const filtered = forecast(s, { at, match: d => d.owner === 'Ana' });
  assert.equal(filtered.open, 1);
  const columns = forecastColumns(stageOnly.deals, { start: '2026-11', count: 2, expectedOf: stageOnly.expectedOf });
  assert.deepEqual(columns.map(col => [col.from, col.deals.map(d => d.title)]), [['', []], ['2026-11', ['A', 'C']], ['2026-12', ['B']]]);
  assert.deepEqual([columns[1].won, columns[1].total, columns[1].expected, columns[1].share], [400, 1400, 100, 7]);
  const quarters = forecastColumns(stageOnly.deals, { granularity: 'quarter', start: '2026-11', count: 1 });
  assert.equal(quarters[1].from, '2026-10');
  assert.equal(quarters[1].deals.length, 3);
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(closeDateIn({ from: '2027-02' }, '2026-11-30'), '2027-02-28');
  assert.equal(closeDateIn({ from: '' }, '2026-11-30'), '');
});

test('The pipeline admin and timeline commands are accepted by the API', async t => {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0 });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => {
    const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  const workspace = (await call('/api/workspaces', { name: 'Pipelines' })).body.id;
  const act = command => call(`/api/action?workspace=${workspace}`, command);
  const first = await act({ type: 'pipeline', data: { name: 'Second' } });
  const pipelineId = first.body.state.pipelines[0].id;
  const ok = async command => { const result = await act(command); assert.equal(result.status, 200, `${command.type}: ${result.body.error}`); return result.body; };
  await ok({ type: 'pipeline-settings', id: pipelineId, data: { colorMode: 'tint', dealProbability: false } });
  await ok({ type: 'smart-tag', data: { pipelineId, name: 'Alto valor', rules: [[{ field: 'value', op: 'gt', value: 10 }]] } });
  const copied = await ok({ type: 'pipeline-duplicate', id: first.body.id });
  const ids = copied.state.pipelines.map(p => p.id).reverse();
  assert.deepEqual((await ok({ type: 'pipeline-order', data: { ids } })).state.pipelines.map(p => p.id), ids);
  await ok({ type: 'pipeline-delete', id: copied.id });
  const contact = (await act({ type: 'save', key: 'contacts', data: { name: 'Ana' } })).body.id;
  const deal = (await act({ type: 'save', key: 'opportunities', data: { title: 'A', contactId: contact, stage: 'new', value: 10, closeDate: '2026-11-20' } })).body.id;
  const moved = await act({ type: 'opportunity-close', id: deal, data: { closeDate: '2026-12-20' } });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.state.opportunities[0].slips, 1);
  assert.equal(moved.body.state.pipelines.find(p => p.id === pipelineId).colorMode, 'tint');
});
