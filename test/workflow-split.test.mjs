import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { splitRoute } from '../workflow-engine.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const runsOf = (s, id) => s.runs.filter(row => row.workflowId === id);
const split = (a, b, extra = {}) => ({ type: 'split', routes: [
  { label: 'Versão A', percent: a, steps: [{ type: 'add_tag', config: { tag: 'versao-a' } }] },
  { label: 'Versão B', percent: b, steps: [{ type: 'add_tag', config: { tag: 'versao-b' } }] }], ...extra });

test('T.1 A/B split: the percentage picks the path, the same contact always lands on the same one', () => {
  const routes = [{ percent: 30 }, { percent: 70 }];
  const picks = Array.from({ length: 2000 }, (_, i) => splitRoute(`contato-${i}:passo`, routes));
  assert.equal(picks.every(index => index === 0 || index === 1), true);
  const share = picks.filter(index => index === 0).length / picks.length;
  assert.ok(share > 0.25 && share < 0.35, `about 30% on the first path, got ${share}`);
  assert.equal(splitRoute('ana:passo', routes), splitRoute('ana:passo', routes), 'stable for the same contact');
  assert.equal(splitRoute('x', [{ percent: 0 }, { percent: 100 }]), 1);
  assert.equal(splitRoute('x', [{ percent: 0 }, { percent: 0 }]), -1, 'no path when every share is zero');
  // Shares that do not add up to 100 are read as weights.
  assert.equal(Array.from({ length: 200 }, (_, i) => splitRoute(`c${i}`, [{ percent: 1 }, { percent: 1 }])).includes(1), true);
});

test('T.1 A/B split in a running flow: each contact takes one path and the flow merges after it', () => {
  const s = blank();
  const id = save(s, 'workflows', { name: 'Teste A/B', active: true, triggers: [{ type: 'contact_created', config: {} }],
    steps: [split(50, 50), { type: 'add_tag', config: { tag: 'depois' } }] });
  const contacts = Array.from({ length: 24 }, (_, i) => save(s, 'contacts', { name: `Contato ${i}`, email: `c${i}@x.test`, tags: [] }));
  assert.equal(runsOf(s, id).length, 24);
  const tags = contacts.map(cid => s.contacts.find(c => c.id === cid).tags);
  assert.equal(tags.every(list => list.includes('depois')), true, 'the step after the split runs on both paths');
  assert.equal(tags.every(list => list.includes('versao-a') !== list.includes('versao-b')), true, 'exactly one path per contact');
  assert.ok(tags.some(list => list.includes('versao-a')) && tags.some(list => list.includes('versao-b')), 'both paths get contacts');
  assert.match(runsOf(s, id)[0].results.join('\n'), /Divisão A\/B: Versão [AB]/);

  const all = save(s, 'workflows', { name: 'Tudo em A', active: true, triggers: [{ type: 'contact_created', config: {} }], steps: [split(100, 0)] });
  const ana = save(s, 'contacts', { name: 'Ana', email: 'ana@x.test', tags: [] });
  assert.equal(runsOf(s, all).length, 1);
  const results = runsOf(s, all)[0].results.join('\n');
  assert.match(results, /Divisão A\/B: Versão A/);
  assert.doesNotMatch(results, /Versão B/, 'a 0% path never gets contacts');
});

test('T.1 A/B split: publishing needs at least two paths adding up to 100%, drafts save as they are', () => {
  const s = blank();
  const flow = (active, step) => () => save(s, 'workflows', { name: 'A/B', active, triggers: [{ type: 'contact_created', config: {} }], steps: [step] });
  assert.throws(flow(true, split(60, 30)), /100%/);
  assert.throws(flow(true, { type: 'split', routes: [{ label: 'Só um', percent: 100, steps: [] }] }), /dois caminhos/);
  const draft = flow(false, split(60, 30))();
  const step = s.workflows.find(row => row.id === draft).steps[0];
  assert.deepEqual(step.routes.map(route => [route.label, route.percent]), [['Versão A', 60], ['Versão B', 30]]);
  assert.equal(step.otherwise, undefined, 'a split has no fallback path');
  const clamped = flow(false, { type: 'split', routes: [{ percent: 250, steps: [] }, { percent: -5, steps: [] }] })();
  assert.deepEqual(s.workflows.find(row => row.id === clamped).steps[0].routes.map(route => [route.label, route.percent]), [['Caminho A', 100], ['Caminho B', 0]]);
  assert.ok(flow(true, split(50, 50))());
});
