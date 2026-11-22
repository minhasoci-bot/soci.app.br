import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const flow = (s, name, trigger, steps = [{ type: 'add_tag', config: { tag: name } }]) => save(s, 'workflows', { name, active: true, triggers: [trigger], steps });
const runsOf = (s, id) => s.runs.filter(row => row.workflowId === id);
const person = (s, extra = {}) => save(s, 'contacts', { name: 'Ana', email: 'ana@x.test', phone: '+55 81 99999-0000', tags: [], custom: {}, ...extra });
const say = (s, contactId, data, actor = 'Bruna') => execute(s, { type: 'message', actor, data: { contactId, ...data } });

test('T.1 user replied: fires on team messages, not on notes or customer messages', () => {
  const s = blank();
  const any = flow(s, 'Qualquer resposta', { type: 'user_replied' });
  const whatsappFromBruna = flow(s, 'WhatsApp da Bruna', { type: 'user_replied', config: { channel: 'WhatsApp', user: 'bruna', keyword: 'proposta' } });
  const ana = person(s);
  say(s, ana, { channel: 'WhatsApp', direction: 'Inbound', body: 'Oi' });
  say(s, ana, { channel: 'Note', direction: 'Outbound', body: 'Nota interna' });
  assert.equal(runsOf(s, any).length, 0, 'customer messages and internal notes do not count');
  say(s, ana, { channel: 'Email', direction: 'Outbound', body: 'Segue a proposta', subject: 'Proposta' });
  assert.equal(runsOf(s, any).length, 1);
  assert.equal(runsOf(s, any)[0].context.user, 'Bruna');
  assert.equal(runsOf(s, whatsappFromBruna).length, 0, 'channel filter');
  say(s, ana, { channel: 'WhatsApp', direction: 'Outbound', body: 'Mandei a PROPOSTA' });
  assert.equal(runsOf(s, whatsappFromBruna).length, 1);
  assert.equal(runsOf(s, whatsappFromBruna)[0].context.body, 'Mandei a PROPOSTA');
});

test('T.1 message failed: team and workflow WhatsApp failures, with the reason', () => {
  const s = blank();
  const handler = flow(s, 'Avisar falha', { type: 'message_failed' }, [{ type: 'add_tag', config: { tag: 'falhou {{trigger.reason}}' } }]);
  const disconnected = flow(s, 'Só desconectado', { type: 'message_failed', config: { reason: 'not_connected' } });
  const ana = person(s);
  const sent = say(s, ana, { channel: 'WhatsApp', direction: 'Outbound', body: 'Olá' });
  assert.equal(execute(s, { type: 'message-failed', data: { messageId: sent, reason: 'provider_error' } }), true);
  assert.equal(s.messages.find(row => row.id === sent).failed, 'provider_error');
  assert.equal(runsOf(s, handler).length, 1);
  assert.equal(runsOf(s, disconnected).length, 0, 'reason filter');
  assert.ok(s.contacts.find(row => row.id === ana).tags.includes('falhou provider_error'));
  assert.equal(execute(s, { type: 'message-failed', data: { messageId: sent, reason: 'provider_error' } }), false, 'a message fails once');

  // A workflow's WhatsApp comes back undelivered from the delivery queue.
  const sender = flow(s, 'Boas-vindas', { type: 'contact_tag', config: { change: 'added', tag: 'vip' } }, [{ type: 'send_whatsapp', config: { body: 'Bem-vinda!' } }]);
  const contact = s.contacts.find(row => row.id === ana);
  save(s, 'contacts', { ...contact, tags: [...contact.tags, 'vip'] }, ana);
  const queued = s.workflowOutbox.find(item => item.kind === 'whatsapp');
  assert.equal(queued.contactId, ana);
  execute(s, { type: 'workflow-outbox-result', data: { results: [{ runId: queued.runId, kind: 'whatsapp', text: 'WhatsApp não conectado', failed: 'not_connected', messageId: queued.messageId }] } });
  assert.equal(runsOf(s, disconnected).length, 1);
  assert.equal(runsOf(s, disconnected)[0].context.body, 'Bem-vinda!');
  assert.ok(runsOf(s, sender).length);
});

test('T.1 message failed: a workflow without the phone fails at once, and failure handlers do not loop', () => {
  const s = blank();
  const retry = flow(s, 'Tentar de novo', { type: 'message_failed' }, [{ type: 'send_whatsapp', config: { body: 'Tentando de novo' } }]);
  const sender = flow(s, 'Aviso', { type: 'contact_created' }, [{ type: 'send_whatsapp', config: { body: 'Oi' } }]);
  person(s, { phone: '' });
  assert.match(runsOf(s, sender)[0].results.join(' '), /sem telefone/);
  assert.equal(runsOf(s, retry).length, 1, 'the first failure starts the handler');
  assert.equal(s.messages.filter(row => row.failed === 'no_phone').length, 2, 'the handler message is marked too');
  assert.equal(runsOf(s, retry).length, 1, 'but its own failure does not start it again');
});

test('T.1 WhatsApp window: open for 24 hours after the contact last wrote', () => {
  const s = blank();
  const id = flow(s, 'Janela', { type: 'contact_tag', config: { change: 'added', tag: 'checar' } }, [
    { type: 'whatsapp_window', config: { variable: 'janela' } },
    { type: 'add_tag', config: { tag: 'janela {{vars.janela}}' } }
  ]);
  const check = contactId => {
    const contact = () => s.contacts.find(row => row.id === contactId);
    save(s, 'contacts', { ...contact(), tags: contact().tags.filter(tag => tag !== 'checar') }, contactId);
    save(s, 'contacts', { ...contact(), tags: [...contact().tags, 'checar'] }, contactId);
    return runsOf(s, id).filter(run => run.contactId === contactId).at(-1);
  };
  const ana = person(s);
  assert.equal(check(ana).vars.janela, 'fechada', 'never wrote');
  const inbound = say(s, ana, { channel: 'WhatsApp', direction: 'Inbound', body: 'Oi' });
  s.messages.find(row => row.id === inbound).created = new Date(Date.now() - 2 * 36e5).toISOString();
  const bia = person(s, { name: 'Bia', email: 'bia@x.test', phone: '+55 81 98888-0000' });
  const old = say(s, bia, { channel: 'WhatsApp', direction: 'Inbound', body: 'Oi' });
  s.messages.find(row => row.id === old).created = new Date(Date.now() - 30 * 36e5).toISOString();
  const open = check(ana);
  assert.equal(open.vars.janela, 'aberta');
  assert.ok(Math.abs(Number(open.vars.janela_minutos) - 22 * 60) <= 1);
  assert.ok(s.contacts.find(row => row.id === ana).tags.includes('janela aberta'));
  assert.equal(check(bia).vars.janela, 'fechada', 'older than 24 hours');
});
