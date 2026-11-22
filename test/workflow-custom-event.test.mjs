import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, emitWorkflow, execute } from '../model.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const flow = (s, name, trigger, steps) => save(s, 'workflows', { name, active: true, triggers: [trigger], steps });
const runsOf = (s, id) => s.runs.filter(row => row.workflowId === id);

test('T.1 custom event: one workflow starts the others listening to the same name, with its data', () => {
  const s = blank();
  const listener = flow(s, 'Aprovado', { type: 'custom_event', config: { event: 'Pedido_Aprovado' } }, [{ type: 'add_tag', config: { tag: 'aprovado {{trigger.valor}} via {{trigger.origem}}' } }]);
  const other = flow(s, 'Outro evento', { type: 'custom_event', config: { event: 'cancelado' } }, [{ type: 'add_tag', config: { tag: 'cancelado' } }]);
  const any = flow(s, 'Qualquer evento', { type: 'custom_event', config: {} }, [{ type: 'add_tag', config: { tag: 'evento {{trigger.event}}' } }]);
  const sender = flow(s, 'Emissor', { type: 'contact_created' }, [
    { type: 'set_variable', config: { name: 'total', value: '150' } },
    { type: 'custom_event', config: { event: 'pedido_aprovado', data: 'valor={{vars.total}}\nOrigem=site\nsem sinal de igual\n=vazio' } }
  ]);
  const ana = save(s, 'contacts', { name: 'Ana', email: 'ana@x.test', tags: [], custom: {} });
  assert.match(runsOf(s, sender)[0].results.join(' '), /evento pedido_aprovado: 2 fluxo\(s\) iniciado\(s\)/);
  assert.equal(runsOf(s, listener)[0].contactId, ana, 'the name matches without case');
  assert.equal(runsOf(s, other).length, 0);
  const tags = s.contacts.find(row => row.id === ana).tags;
  assert.ok(tags.includes('aprovado 150 via site'), 'data reaches {{trigger.*}}');
  assert.ok(tags.includes('evento pedido_aprovado'));
  assert.equal(runsOf(s, any).length, 1);
});

test('T.1 custom event: works without a contact, needs a name and cannot loop forever', () => {
  const s = blank();
  const noContact = flow(s, 'Sem contato', { type: 'custom_event', config: { event: 'diario' } }, [{ type: 'internal_notification', config: { body: 'chegou {{trigger.n}}' } }]);
  flow(s, 'Agendado', { type: 'scheduler', config: { frequency: 'daily', time: '00:00', tag: 'ninguem' } }, [{ type: 'internal_notification', config: { body: 'x' } }]);
  const caller = flow(s, 'Chamador', { type: 'custom_event', config: { event: 'start' } }, [{ type: 'custom_event', config: { event: 'diario', data: 'n=1' } }]);
  const bad = flow(s, 'Sem nome', { type: 'custom_event', config: { event: 'nome' } }, [{ type: 'custom_event', config: { event: '{{vars.nada}}' } }]);
  const loop = flow(s, 'Laço', { type: 'custom_event', config: { event: 'laco' } }, [{ type: 'custom_event', config: { event: 'laco' } }]);
  const starter = flow(s, 'Começo', { type: 'contact_created' }, [{ type: 'custom_event', config: { event: 'start' } }, { type: 'custom_event', config: { event: 'nome' } }, { type: 'custom_event', config: { event: 'laco' } }]);
  save(s, 'contacts', { name: 'Ana', email: 'ana@x.test', tags: [], custom: {} });
  assert.equal(runsOf(s, caller).length, 1);
  assert.equal(runsOf(s, noContact).length, 1);
  assert.ok(s.teamMessages.some(row => row.body.includes('chegou 1')));
  assert.match(runsOf(s, bad)[0].results.join(' '), /informe o nome do evento/);
  assert.equal(runsOf(s, loop).length, 1, 'a running workflow is not enrolled again for the same contact');
  assert.equal(runsOf(s, starter)[0].status, 'Completed');
});

test('T.1 custom event: without a contact, a cascade starts at most 50 workflows', () => {
  const s = blank();
  const many = (event, n) => Array.from({ length: n }, () => ({ type: 'custom_event', config: { event } }));
  for (let i = 0; i < 10; i++) {
    flow(s, `A${i}`, { type: 'custom_event', config: { event: 'x' } }, many('y', 20));
    flow(s, `B${i}`, { type: 'custom_event', config: { event: 'y' } }, many('x', 20));
  }
  const self = flow(s, 'Próprio', { type: 'custom_event', config: { event: 'z' } }, many('z', 3));
  const starter = flow(s, 'Cupom venceu', { type: 'coupon_expired' }, [{ type: 'custom_event', config: { event: 'x' } }, { type: 'custom_event', config: { event: 'z' } }]);
  emitWorkflow(s, 'coupon_expired', { couponId: 'c1' });
  assert.equal(runsOf(s, starter).length, 1);
  assert.equal(s.runs.length, 1 + 50 + 1, 'the starter, 50 in the first cascade and one for the second event');
  assert.equal(runsOf(s, self).length, 1, 'a workflow does not start itself');
  assert.match(runsOf(s, self)[0].results.join(' '), /evento z: 0 fluxo/);
  assert.ok(s.runs.some(run => run.results.some(line => /no máximo 5 eventos|limite de 50 fluxos|encadeados demais/.test(line))));
});
