import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute, hydrateWorkspace } from '../model.mjs';
import { inboxThreads, visibleThreads } from '../ui/inbox.js';

function workspace() {
  const s = blank('Inbox');
  const run = (command, actor = 'Ana Lima') => execute(s, { ...command, actor });
  const contact = (name, tags = []) => run({ type:'save', key:'contacts', data:{ name, tags } });
  const message = (contactId, body, direction = 'Inbound', channel = 'SMS') => run({ type:'message', data:{ contactId, body, direction, channel } });
  return { s, run, contact, message };
}
const view = (s, inbox, tab = 'all', name = 'Ana Lima') => visibleThreads({ s, inbox: { box:'team', nav:true, sort:'latest', rules:[], match:'and', picked:[], panel:'contact', ...inbox }, tab, query:'', access:{ name } }).map(t => t.contact.name);

test('Conversations can be assigned, followed and updated in bulk', () => {
  const { s, run, contact, message } = workspace();
  const bia = contact('Bia', ['VIP']), caio = contact('Caio');
  message(bia, 'Oi!'); message(caio, 'Bom dia', 'Inbound', 'Email');

  run({ type:'thread', data:{ contactId:bia, assignee:'Ana Lima' } });
  run({ type:'thread', data:{ contactId:caio, follow:true } }, 'Ana Lima');
  run({ type:'thread', data:{ contactId:caio, follow:true } }, 'Ana Lima');
  assert.deepEqual(s.threads.find(t => t.contactId === caio).followers, ['Ana Lima'], 'following twice keeps one entry');

  assert.equal(run({ type:'thread', data:{ contactIds:[bia, caio], read:true, starred:true } }), 2);
  assert.ok(s.messages.every(m => m.read && m.starred));
  assert.throws(() => run({ type:'thread', data:{ contactIds:[] } }), /between 1 and 200/);
  assert.throws(() => run({ type:'thread', data:{ contactIds:['nope'] } }), /valid contact/);

  assert.deepEqual(view(s, { box:'assigned' }), ['Bia']);
  assert.deepEqual(view(s, { box:'followed' }), ['Caio']);
  assert.deepEqual(view(s, { box:'all' }).sort(), ['Bia', 'Caio']);
  assert.deepEqual(view(s, { box:'assigned' }, 'all', 'Rui'), []);

  run({ type:'thread', data:{ contactId:caio, follow:false } }, 'Ana Lima');
  assert.deepEqual(view(s, { box:'followed' }), []);
  run({ type:'delete', key:'contacts', id:bia });
  assert.equal(s.threads.some(t => t.contactId === bia), false, 'deleting a contact removes its conversation settings');
});

test('Filters, AND/OR matching and sorting pick the right conversations', () => {
  const { s, run, contact, message } = workspace();
  const bia = contact('Bia', ['VIP']), caio = contact('Caio'), duda = contact('Duda', ['VIP']);
  message(bia, 'Primeira', 'Inbound', 'SMS');
  message(caio, 'Segunda', 'Outbound', 'Email');
  message(duda, 'Terceira @Ana Lima', 'Inbound', 'Note');
  s.messages[0].created = '2026-01-01T10:00:00.000Z';
  s.messages[1].created = '2026-01-02T10:00:00.000Z';
  s.messages[2].created = '2026-01-03T10:00:00.000Z';
  run({ type:'thread', data:{ contactId:caio, assignee:'Rui' } });

  assert.deepEqual(view(s, {}), ['Duda', 'Caio', 'Bia']);
  assert.deepEqual(view(s, { sort:'oldest' }), ['Bia', 'Caio', 'Duda']);
  const vip = { field:'tag', op:'is', value:'VIP' }, inbound = { field:'direction', op:'is', value:'Inbound' };
  assert.deepEqual(view(s, { rules:[vip, { field:'channel', op:'is', value:'SMS' }] }), ['Bia']);
  assert.deepEqual(view(s, { rules:[{ field:'channel', op:'is', value:'SMS' }, { field:'assigned', op:'is', value:'Rui' }], match:'or' }), ['Caio', 'Bia']);
  assert.deepEqual(view(s, { rules:[{ field:'assigned', op:'is', value:'' }] }), ['Duda', 'Bia'], 'empty assignee means unassigned');
  assert.deepEqual(view(s, { rules:[{ field:'tag', op:'not', value:'VIP' }] }), ['Caio']);
  assert.deepEqual(view(s, { rules:[{ field:'mention', op:'is', value:'Ana Lima' }] }), ['Duda']);
  assert.deepEqual(view(s, { rules:[inbound] }, 'unread'), ['Duda', 'Bia']);
  assert.deepEqual(view(s, { rules:[{ field:'outboundType', op:'is', value:'human' }] }), ['Caio']);
  assert.equal(inboxThreads(s).find(t => t.contact.id === bia).unread, 1);
});

test('Saved views validate their conditions and team chat keeps who wrote', () => {
  const { s, run } = workspace();
  assert.throws(() => run({ type:'save', key:'inboxViews', data:{ name:'Vazia', rules:[] } }), /between 1 and 10/);
  assert.throws(() => run({ type:'save', key:'inboxViews', data:{ name:'Ruim', rules:[{ field:'channel', op:'is', value:'Fax' }] } }), /valid view condition/);
  const id = run({ type:'save', key:'inboxViews', data:{ name:'VIP', match:'or', rules:[{ field:'tag', op:'is', value:'VIP' }] } });
  assert.equal(s.inboxViews[0].id, id);
  assert.equal(s.inboxViews[0].match, 'or');

  run({ type:'team-message', data:{ body:'Assumo a Bia hoje.' } }, 'Rui');
  assert.equal(s.teamMessages[0].author, 'Rui');
  assert.throws(() => run({ type:'team-message', data:{ body:'  ' } }), /Message is required/);

  const old = blank('Old'); delete old.threads; delete old.teamMessages; delete old.inboxViews;
  const fresh = hydrateWorkspace(old);
  assert.deepEqual([fresh.threads, fresh.teamMessages, fresh.inboxViews], [[], [], []], 'older workspaces gain the new collections');
});
