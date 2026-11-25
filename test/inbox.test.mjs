import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute, hydrateWorkspace } from '../model.mjs';
import { inboxPage, inboxThreads, visibleThreads } from '../ui/inbox.js';
import { composerAction, replyChannel } from '../ui/inbox-data.js';

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

test('A conversa abre no canal da última mensagem, e a nota escolhida não vira mensagem ao cliente', () => {
  const at = (channel, minute, direction = 'Inbound') => ({ channel, direction, created:`2026-11-25T04:${String(minute).padStart(2, '0')}:00.000Z` });
  assert.equal(replyChannel([]), 'Note', 'sem conversa, continua em nota');
  assert.equal(replyChannel([at('Note', 1)]), 'Note');
  assert.equal(replyChannel([at('WhatsApp', 1)]), 'WhatsApp');
  // A nota interna (a resposta que não saiu) não muda o canal do contato.
  assert.equal(replyChannel([at('WhatsApp', 1), at('Note', 2, 'Outbound')]), 'WhatsApp');
  assert.equal(replyChannel([at('WhatsApp', 5), at('Email', 2)]), 'WhatsApp', 'vale a mais recente, em qualquer ordem');
  assert.equal(replyChannel([at('WhatsApp', 1), at('Instagram', 3)]), 'Instagram');
  assert.equal(replyChannel([at('WhatsApp', 1), at('Call', 4)]), 'WhatsApp', 'canal que o formulário não oferece é ignorado');
  // Quem escolheu "Nota" continua em nota quando a tela se atualiza ou chega mensagem nova.
  assert.equal(replyChannel([at('WhatsApp', 1), at('WhatsApp', 9)], 'Note'), 'Note');
  assert.equal(replyChannel([at('WhatsApp', 1)], 'Canal inexistente'), 'WhatsApp');
});

test('O botão diz o que vai acontecer: nota interna, envio ao contato ou só registro', () => {
  assert.equal(composerAction('Note', 'Outbound'), 'Salvar nota');
  for (const channel of ['WhatsApp', 'Email', 'Instagram', 'Facebook', 'Live chat']) assert.equal(composerAction(channel, 'Outbound'), 'Enviar');
  assert.equal(composerAction('SMS', 'Outbound'), 'Registrar mensagem', 'SMS não sai por aqui');
  assert.equal(composerAction('WhatsApp', 'Inbound'), 'Registrar mensagem');
});

test('O formulário renderizado já vem no canal certo e respeita a escolha de cada conversa', () => {
  const { s, ana } = (() => {
    const { s, run, contact } = workspace();
    const ana = contact('Ana Reply');
    run({ type:'message', data:{ contactId:ana, body:'Oi', direction:'Inbound', channel:'WhatsApp' } });
    return { s, ana };
  })();
  const c = { s, thread:ana, tab:'all', workspace:'demo', access:{ name:'Ana Lima' }, features:{}, query:'' };
  const selected = () => inboxPage(c).match(/<option value="([^"]+)" selected>/)?.[1];
  assert.equal(selected(), 'WhatsApp');
  assert.match(inboxPage(c), /data-compose-submit>.*<span>Enviar<\/span><\/button>/s);
  c.composer = { thread:ana, channel:'Note' };
  assert.equal(selected(), 'Note');
  assert.match(inboxPage(c), /data-compose-submit>.*<span>Salvar nota<\/span><\/button>/s);
  c.composer = { thread:'outra-conversa', channel:'Note' };
  assert.equal(selected(), 'WhatsApp', 'a escolha vale só para a conversa em que foi feita');
});
