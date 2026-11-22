import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const flow = (s, name, trigger, steps) => save(s, 'workflows', { name, active: true, triggers: [trigger], steps });
const runsOf = (s, id) => s.runs.filter(row => row.workflowId === id);
const tagged = (s, tag) => s.contacts.filter(row => (row.tags || []).includes(tag)).length;
const people = (s, n, tag = 'entra') => Array.from({ length: n }, (_, i) => save(s, 'contacts', { name: `Pessoa ${i + 1}`, email: `p${i + 1}@x.test`, tags: [tag], custom: {} }));

test('T.1 drip: lets a batch through each interval and holds the rest', () => {
  const s = blank();
  const id = flow(s, 'Em lotes', { type: 'contact_created' }, [
    { type: 'drip', config: { batch: 2, amount: 1, unit: 'hours' } },
    { type: 'add_tag', config: { tag: 'liberado' } }
  ]);
  people(s, 5);
  const runs = runsOf(s, id);
  assert.equal(tagged(s, 'liberado'), 2, 'first batch goes now');
  assert.deepEqual(runs.map(run => run.status), ['Completed', 'Completed', 'Waiting', 'Waiting', 'Waiting']);
  const hour = 36e5, gap = run => Date.parse(run.wakeAt) - Date.now();
  assert.ok(Math.abs(gap(runs[2]) - hour) < 60e3 && Math.abs(gap(runs[3]) - hour) < 60e3, 'second batch in one hour');
  assert.ok(Math.abs(gap(runs[4]) - 2 * hour) < 60e3, 'third batch in two hours');
  execute(s, { type: 'workflow-tick', data: { at: new Date(Date.now() + hour + 60e3).toISOString() } });
  assert.equal(tagged(s, 'liberado'), 4);
  execute(s, { type: 'workflow-tick', data: { at: new Date(Date.now() + 2 * hour + 60e3).toISOString() } });
  assert.equal(tagged(s, 'liberado'), 5);
});

test('T.1 remove from all workflows: stops the contact elsewhere, optionally here too', () => {
  const s = blank();
  const waiting = flow(s, 'Nutrição', { type: 'contact_created' }, [{ type: 'wait', config: { mode: 'delay', amount: 3, unit: 'days' } }, { type: 'add_tag', config: { tag: 'nutrido' } }]);
  const other = flow(s, 'Boas-vindas', { type: 'contact_created' }, [{ type: 'wait', config: { mode: 'delay', amount: 1, unit: 'days' } }]);
  const [ana] = people(s, 1, 'lead');
  assert.equal(runsOf(s, waiting)[0].status, 'Waiting');
  const stopper = flow(s, 'Comprou', { type: 'contact_tag', config: { change: 'added', tag: 'cliente' } }, [
    { type: 'remove_from_all_workflows', config: { scope: 'others' } }, { type: 'add_tag', config: { tag: 'seguiu' } }
  ]);
  const contact = s.contacts.find(row => row.id === ana);
  save(s, 'contacts', { ...contact, tags: [...contact.tags, 'cliente'] }, ana);
  assert.equal(runsOf(s, waiting)[0].status, 'Removed');
  assert.equal(runsOf(s, other)[0].status, 'Removed');
  assert.equal(runsOf(s, stopper)[0].status, 'Completed');
  assert.ok(s.contacts.find(row => row.id === ana).tags.includes('seguiu'), 'scope "others" keeps this workflow going');

  const ending = flow(s, 'Sair de tudo', { type: 'contact_tag', config: { change: 'added', tag: 'sair' } }, [
    { type: 'remove_from_all_workflows', config: { scope: 'all' } }, { type: 'add_tag', config: { tag: 'nao-chega' } }
  ]);
  const now = s.contacts.find(row => row.id === ana);
  save(s, 'contacts', { ...now, tags: [...now.tags, 'sair'] }, ana);
  assert.equal(runsOf(s, ending)[0].status, 'Completed');
  assert.ok(!s.contacts.find(row => row.id === ana).tags.includes('nao-chega'), 'scope "all" ends this workflow too');
});

test('T.1 note changed: fires when the contact notes are edited, with the new text', () => {
  const s = blank();
  const id = flow(s, 'Nota mudou', { type: 'note_changed' }, [{ type: 'add_note', config: { body: 'Nova nota: {{trigger.body}}' } }]);
  const [ana] = people(s, 1);
  assert.equal(runsOf(s, id).length, 0, 'creating the contact is not a note change');
  const contact = s.contacts.find(row => row.id === ana);
  save(s, 'contacts', { ...contact, notes: 'Quer o plano anual.' }, ana);
  assert.equal(runsOf(s, id).length, 1);
  assert.ok(s.messages.some(row => row.contactId === ana && row.channel === 'Note' && row.body === 'Nova nota: Quer o plano anual.'));
  save(s, 'contacts', { ...s.contacts.find(row => row.id === ana), company: 'Outra' }, ana);
  assert.equal(runsOf(s, id).length, 1, 'other changes do not fire it');
});
