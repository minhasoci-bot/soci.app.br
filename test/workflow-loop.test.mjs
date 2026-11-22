import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { compile } from '../workflow-engine.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const flow = (s, name, trigger, steps, active = true) => save(s, 'workflows', { name, active, triggers: [trigger], steps });
const runsOf = (s, id) => s.runs.filter(row => row.workflowId === id);
const notes = (s, contactId) => s.messages.filter(row => row.contactId === contactId && row.channel === 'Note').map(row => row.body);

test('T.1 loop: the body runs once per list item, then the flow goes on', () => {
  const s = blank();
  const id = flow(s, 'Cada tag', { type: 'contact_created' }, [
    { type: 'loop', config: { mode: 'list', items: '{{contact.tags}}', variable: 'tag' }, body: [
      { type: 'add_note', config: { body: '{{vars.tag_numero}}/{{vars.tag_total}}: {{vars.tag}}' } }
    ] },
    { type: 'add_note', config: { body: 'Fim: {{vars.tag}}' } }
  ]);
  const ana = save(s, 'contacts', { name: 'Ana', email: 'ana@x.test', tags: ['lead', 'vip', 'site'], custom: {} });
  assert.equal(runsOf(s, id)[0].status, 'Completed');
  assert.deepEqual(notes(s, ana), ['1/3: lead', '2/3: vip', '3/3: site', 'Fim: site']);
  assert.match(runsOf(s, id)[0].results[0], /3 repetição/);
});

test('T.1 loop: a number of times, nested in a branch, and an empty list skips the body', () => {
  const s = blank();
  const id = flow(s, 'Vezes', { type: 'contact_created' }, [
    { type: 'if_else', config: { conditions: [{ subject: 'tag', op: 'has', value: 'vip' }] }, yes: [
      { type: 'loop', config: { mode: 'count', times: 2, variable: 'volta' }, body: [{ type: 'add_note', config: { body: 'Volta {{vars.volta}}' } }] }
    ], no: [
      { type: 'loop', config: { mode: 'list', items: '{{contact.company}}', variable: 'x' }, body: [{ type: 'add_note', config: { body: 'nunca' } }] }
    ] },
    { type: 'add_tag', config: { tag: 'passou' } }
  ]);
  const vip = save(s, 'contacts', { name: 'Vip', email: 'v@x.test', tags: ['vip'], custom: {} });
  const plain = save(s, 'contacts', { name: 'Comum', email: 'c@x.test', tags: [], custom: {} });
  assert.deepEqual(notes(s, vip), ['Volta 1', 'Volta 2']);
  assert.deepEqual(notes(s, plain), [], 'an empty list runs nothing');
  assert.ok(s.contacts.every(row => row.tags.includes('passou')), 'both continue after the loop');
  assert.deepEqual(runsOf(s, id).map(run => run.status), ['Completed', 'Completed']);
});

test('T.1 loop: a wait inside the body pauses and the loop resumes where it was', () => {
  const s = blank();
  const id = flow(s, 'Com espera', { type: 'contact_created' }, [
    { type: 'loop', config: { mode: 'list', items: 'a; b', separator: ';' }, body: [
      { type: 'add_note', config: { body: 'Item {{vars.item}}' } },
      { type: 'wait', config: { mode: 'delay', amount: 1, unit: 'hours' } }
    ] },
    { type: 'add_note', config: { body: 'Pronto' } }
  ]);
  const ana = save(s, 'contacts', { name: 'Ana', email: 'ana@x.test', tags: [], custom: {} });
  assert.deepEqual(notes(s, ana), ['Item a']);
  execute(s, { type: 'workflow-tick', data: { at: new Date(Date.now() + 36e5 + 6e4).toISOString() } });
  assert.deepEqual(notes(s, ana), ['Item a', 'Item b']);
  execute(s, { type: 'workflow-tick', data: { at: new Date(Date.now() + 2 * 36e5 + 12e4).toISOString() } });
  assert.deepEqual(notes(s, ana), ['Item a', 'Item b', 'Pronto']);
  assert.equal(runsOf(s, id)[0].status, 'Completed');
});

test('T.1 loop: at most 50 repetitions, publishing rules and the compiled back edge', () => {
  const s = blank();
  const many = Array.from({ length: 80 }, (_, i) => `i${i}`).join(',');
  const id = flow(s, 'Muitos', { type: 'contact_created' }, [{ type: 'loop', config: { mode: 'list', items: many }, body: [{ type: 'add_tag', config: { tag: '{{vars.item}}' } }] }]);
  save(s, 'contacts', { name: 'Ana', email: 'ana@x.test', tags: [], custom: {} });
  assert.equal(runsOf(s, id)[0].status, 'Completed');
  assert.match(runsOf(s, id)[0].results[0], /50 repetição/);
  assert.throws(() => flow(s, 'Sem lista', { type: 'contact_created' }, [{ type: 'loop', config: { mode: 'list', items: '' }, body: [{ type: 'end' }] }]), /informe a lista/);
  assert.throws(() => flow(s, 'Vazio', { type: 'contact_created' }, [{ type: 'loop', config: { mode: 'count', times: 2 }, body: [] }]), /pelo menos uma etapa/);
  assert.ok(flow(s, 'Rascunho', { type: 'contact_created' }, [{ type: 'loop', config: { mode: 'list', items: '' }, body: [] }], false), 'drafts can be incomplete');
  const graph = compile([{ id: 'repete1', type: 'loop', config: {}, body: [{ id: 'dentro1', type: 'add_tag', config: {} }] }, { id: 'depois1', type: 'end', config: {} }]);
  assert.deepEqual([graph.nodes.repete1.body, graph.nodes.dentro1.next, graph.nodes.repete1.next], ['dentro1', 'repete1', 'depois1']);
});
