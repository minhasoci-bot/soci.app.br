import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { formatList } from '../workflow-engine.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const flow = (s, name, trigger, steps) => save(s, 'workflows', { name, active: true, triggers: [trigger], steps });
const runsOf = (s, id) => s.runs.filter(row => row.workflowId === id);
const tick = (s, at) => execute(s, { type: 'workflow-tick', data: { at: new Date(at).toISOString() } });
const notes = (s, contactId) => s.messages.filter(row => row.contactId === contactId && row.channel === 'Note').map(row => row.body);

test('T.1 list formatter: counts, picks, searches, dedupes and sorts a list', () => {
  assert.equal(formatList('maçã, pera, , uva', { op: 'count' }), '3', 'empty items do not count');
  assert.equal(formatList('maçã, pera, uva', { op: 'first' }), 'maçã');
  assert.equal(formatList('maçã, pera, uva', { op: 'last' }), 'uva');
  assert.equal(formatList('maçã, pera, uva', { op: 'item', position: 2 }), 'pera');
  assert.equal(formatList('maçã, pera, uva', { op: 'item', position: -1 }), 'uva');
  assert.equal(formatList('maçã, pera, uva', { op: 'item', position: 9 }), '');
  assert.equal(formatList('VIP, lead', { op: 'contains', search: 'vip' }), 'yes', 'contains ignores case');
  assert.equal(formatList('VIP, lead', { op: 'contains', search: 'cliente' }), 'no');
  assert.equal(formatList('Lead, vip, lead, VIP', { op: 'unique' }), 'Lead, vip');
  assert.equal(formatList('item 10, item 2, Ábaco', { op: 'sort', joiner: 'pipe' }), 'Ábaco | item 2 | item 10');
  assert.equal(formatList('a; b; c', { op: 'reverse', separator: ';', joiner: 'none' }), 'cba');
  assert.equal(formatList('um\ndois\ntrês', { op: 'count', separator: '\\n' }), '3', '"\\n" splits by line');
  assert.equal(formatList('["lead","vip"]', { op: 'last' }), 'vip', 'a JSON array (like {{contact.tags}}) is read as the list');
});

test('T.1 list formatter action: stores the result in a variable for later steps', () => {
  const s = blank();
  const id = flow(s, 'Lista', { type: 'contact_created' }, [
    { type: 'list_format', config: { value: '{{contact.tags}}', op: 'count', variable: 'quantas' } },
    { type: 'list_format', config: { value: 'b, a, b', op: 'unique', joiner: 'and', variable: 'itens' } },
    { type: 'add_note', config: { body: '{{vars.quantas}} tags; itens: {{vars.itens}}' } }
  ]);
  const ana = save(s, 'contacts', { name: 'Ana', email: 'ana@x.test', tags: ['lead', 'vip'], custom: {} });
  assert.equal(runsOf(s, id)[0].status, 'Completed');
  assert.deepEqual(notes(s, ana), ['2 tags; itens: b e a']);
});

test('T.1 merge contact: duplicates by e-mail or phone become one, with all their records', () => {
  const s = blank();
  const ana = save(s, 'contacts', { name: 'Ana', email: 'ana@x.test', tags: ['lead'], notes: 'Primeiro contato.', custom: {} });
  const twin = save(s, 'contacts', { name: 'Ana Souza', email: 'ANA@x.test', phone: '+55 11 98888-0000', company: 'Acme', tags: ['cliente', 'LEAD'], notes: 'Comprou em 2025.', custom: {} });
  const other = save(s, 'contacts', { name: 'Bia', email: 'bia@x.test', tags: [], custom: {} });
  save(s, 'tasks', { title: 'Ligar para a Ana', contactId: twin, due: '2026-12-01' });
  execute(s, { type: 'message', data: { contactId: twin, channel: 'WhatsApp', direction: 'Inbound', body: 'Oi!' } });
  const tagFlow = flow(s, 'Cliente', { type: 'contact_tag', config: { change: 'added', tag: 'cliente' } }, [{ type: 'add_tag', config: { tag: 'avisado' } }]);
  const id = flow(s, 'Mesclar', { type: 'contact_tag', config: { change: 'added', tag: 'mesclar' } }, [
    { id: 'junta1', type: 'merge_contact', config: { by: 'any', keep: 'this' } },
    { type: 'add_note', config: { body: 'Mesclados: {{steps.junta1.merged}}' } }
  ]);
  const contact = s.contacts.find(row => row.id === ana);
  save(s, 'contacts', { ...contact, tags: [...contact.tags, 'mesclar'] }, ana);

  assert.equal(runsOf(s, id)[0].status, 'Completed');
  assert.ok(!s.contacts.some(row => row.id === twin), 'the duplicate left the contacts');
  assert.ok(s.contactTrash.some(row => row.id === twin), 'and went to the trash');
  assert.ok(s.contacts.some(row => row.id === other), 'other contacts stay');
  const kept = s.contacts.find(row => row.id === ana);
  assert.equal(kept.name, 'Ana', 'the kept contact wins');
  assert.equal(kept.phone, '+55 11 98888-0000', 'empty fields take the duplicate values');
  assert.equal(kept.company, 'Acme');
  assert.deepEqual(kept.tags.filter(tag => tag !== 'avisado'), ['lead', 'mesclar', 'cliente'], 'tags join without repeating');
  assert.equal(kept.notes, 'Primeiro contato.\n\nComprou em 2025.');
  assert.equal(s.tasks.find(row => row.title === 'Ligar para a Ana').contactId, ana, 'tasks move');
  assert.ok(s.messages.some(row => row.contactId === ana && row.body === 'Oi!'), 'conversations move');
  assert.equal(runsOf(s, tagFlow).length, 1, 'a tag that arrives with the merge fires its trigger');
  assert.ok(notes(s, ana).includes('Mesclados: 1'));
});

test('T.1 merge contact: can keep the oldest contact and the flow goes on with it', () => {
  const s = blank();
  const first = save(s, 'contacts', { name: 'Carlos', phone: '(11) 97777-0000', tags: [], custom: {} });
  const id = flow(s, 'Novo lead', { type: 'contact_created' }, [
    { type: 'merge_contact', config: { by: 'phone', keep: 'oldest' } },
    { type: 'add_tag', config: { tag: 'mesclado' } }
  ]);
  const late = save(s, 'contacts', { name: 'Carlos Lima', email: 'carlos@x.test', phone: '+5511977770000', tags: ['site'], custom: {} });
  const run = runsOf(s, id).find(row => row.contactId === first);
  assert.ok(run, 'the run switched to the oldest contact');
  assert.equal(run.status, 'Completed');
  assert.ok(!s.contacts.some(row => row.id === late));
  const kept = s.contacts.find(row => row.id === first);
  assert.equal(kept.email, 'carlos@x.test');
  assert.deepEqual(kept.tags, ['site', 'mesclado']);
  const single = save(s, 'contacts', { name: 'Sozinho', phone: '(21) 90000-1111', tags: [], custom: {} });
  assert.ok(runsOf(s, id).find(row => row.contactId === single).results.some(line => /nenhum duplicado/.test(line)));
});

test('T.1 conversation SLA: fires once when a customer message is due soon and once when overdue', () => {
  const s = blank();
  execute(s, { type: 'conversation-sla', data: { enabled: true, mode: 'common', automation: 'none', common: { soon: 3, overdue: 5 } } });
  const anyState = flow(s, 'SLA', { type: 'conversation_sla', config: {} }, [{ type: 'add_note', config: { body: 'SLA {{trigger.state}} no {{trigger.channel}} após {{trigger.minutes}} min' } }]);
  const lateOnly = flow(s, 'SLA vencido', { type: 'conversation_sla', config: { state: 'overdue', channel: 'WhatsApp' } }, [{ type: 'add_tag', config: { tag: 'sla-vencido' } }]);
  const ana = save(s, 'contacts', { name: 'Ana', phone: '+5511988880000', tags: [], custom: {} });
  const start = Date.now();
  execute(s, { type: 'message', data: { contactId: ana, channel: 'WhatsApp', direction: 'Inbound', body: 'Preciso de ajuda' } });
  tick(s, start + 60e3);
  assert.equal(runsOf(s, anyState).length, 0, 'still inside the target');
  tick(s, start + 3.5 * 60e3);
  assert.equal(runsOf(s, anyState).length, 1);
  assert.match(notes(s, ana)[0], /^SLA soon no WhatsApp após 3 min$/);
  assert.equal(runsOf(s, lateOnly).length, 0);
  tick(s, start + 4 * 60e3);
  assert.equal(runsOf(s, anyState).length, 1, 'once per state');
  tick(s, start + 6 * 60e3);
  assert.equal(runsOf(s, lateOnly).length, 1);
  assert.ok(s.contacts.find(row => row.id === ana).tags.includes('sla-vencido'));
  tick(s, start + 9 * 60e3);
  assert.equal(runsOf(s, lateOnly).length, 1, 'overdue fires once');

  const bia = save(s, 'contacts', { name: 'Bia', email: 'bia@x.test', tags: [], custom: {} });
  execute(s, { type: 'message', data: { contactId: bia, channel: 'Email', direction: 'Inbound', body: 'Oi' } });
  execute(s, { type: 'message', data: { contactId: bia, channel: 'Email', direction: 'Outbound', body: 'Olá, Bia!' } });
  tick(s, Date.now() + 10 * 60e3);
  assert.ok(!runsOf(s, anyState).some(row => row.contactId === bia), 'answered messages never fire');
});

test('T.1 conversation SLA: does nothing while SLA is off', () => {
  const s = blank();
  const id = flow(s, 'SLA', { type: 'conversation_sla', config: {} }, [{ type: 'add_tag', config: { tag: 'x' } }]);
  const ana = save(s, 'contacts', { name: 'Ana', phone: '+5511988880000', tags: [], custom: {} });
  execute(s, { type: 'message', data: { contactId: ana, channel: 'WhatsApp', direction: 'Inbound', body: 'Oi' } });
  tick(s, Date.now() + 60 * 60e3);
  assert.equal(runsOf(s, id).length, 0);
});

test('T.1 coupon expired: fires once, the day after the last valid day, without a contact', () => {
  const s = blank();
  const black = save(s, 'coupons', { name: 'Black Friday', code: 'BLACK', kind: 'Percent', amount: 10, end: '2026-11-27', active: true });
  save(s, 'coupons', { name: 'Natal', code: 'NATAL', kind: 'Percent', amount: 5, end: '2026-12-25', active: true });
  const id = flow(s, 'Cupom acabou', { type: 'coupon_expired', config: { couponId: black } }, [{ type: 'internal_notification', config: { body: 'Cupom {{trigger.code}} expirou em {{trigger.end}}' } }]);
  const anyCoupon = flow(s, 'Qualquer cupom', { type: 'coupon_expired', config: {} }, [{ type: 'end' }]);
  tick(s, Date.parse('2026-11-27T15:00:00Z'));
  assert.equal(runsOf(s, id).length, 0, 'the last valid day still counts');
  tick(s, Date.parse('2026-11-28T15:00:00Z'));
  assert.equal(runsOf(s, id).length, 1);
  assert.equal(runsOf(s, id)[0].contactId, '');
  assert.equal(runsOf(s, id)[0].status, 'Completed');
  tick(s, Date.parse('2026-11-29T15:00:00Z'));
  assert.equal(runsOf(s, id).length, 1, 'once per coupon');
  const coupon = s.coupons.find(row => row.id === black);
  save(s, 'coupons', { ...coupon, name: 'Black Friday 2026' }, black);
  tick(s, Date.parse('2026-11-30T15:00:00Z'));
  assert.equal(runsOf(s, anyCoupon).length, 1, 'editing the coupon does not fire it again');
  save(s, 'coupons', { ...s.coupons.find(row => row.id === black), end: '2026-12-05' }, black);
  tick(s, Date.parse('2026-12-06T15:00:00Z'));
  assert.equal(runsOf(s, id).length, 2, 'a new end date expires again');
});
