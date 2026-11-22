import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { actionSpec, triggerSpec } from '../ui/workflow-data.js';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
function run(config, contact = {}) {
  const s = blank();
  const id = save(s, 'workflows', { name: 'Menu', active: true, triggers: [{ type: 'contact_created' }], steps: [{ type: 'whatsapp_interactive', config }] });
  save(s, 'contacts', { name: 'Ana Lima', email: 'ana@x.test', phone: '+55 81 99999-0000', tags: [], custom: {}, ...contact });
  return { s, results: s.runs.find(row => row.workflowId === id).results.join(' | '), outbox: s.workflowOutbox || [] };
}

test('T.1 WhatsApp interactive: buttons, list and poll are queued with their options and recorded in Conversas', () => {
  assert.deepEqual(actionSpec('whatsapp_interactive').fields.map(field => field.key), ['kind', 'body', 'options', 'buttonText', 'footer', 'topicId']);
  const buttons = run({ kind: 'buttons', body: 'Oi, {{contact.first_name}}! Como posso ajudar?', options: 'Agendar\nPreços\n\nAgendar', footer: 'Clínica' });
  const item = buttons.outbox.find(row => row.kind === 'whatsapp-interactive');
  assert.deepEqual(item.interactive, { kind: 'buttons', body: 'Oi, Ana! Como posso ajudar?', options: ['Agendar', 'Preços'], buttonText: '', footer: 'Clínica' });
  assert.match(buttons.results, /botões na fila de envio/);
  assert.equal(buttons.s.messages.find(row => row.id === item.messageId).body, 'Oi, Ana! Como posso ajudar?\n• Agendar\n• Preços');
  assert.equal(run({ kind: 'list', body: 'Escolha', options: 'A\nB', buttonText: 'Abrir' }).outbox[0].interactive.buttonText, 'Abrir');
  assert.match(run({ kind: 'poll', body: 'Qual horário?', options: 'Manhã\nTarde' }).results, /enquete na fila/);
});

test('T.1 WhatsApp interactive: limits, empty message, no phone and do-not-disturb stop before queueing', () => {
  assert.match(run({ kind: 'buttons', body: 'Oi', options: 'A\nB\nC\nD' }).results, /botões aceita de 1 a 3 opções/);
  assert.match(run({ kind: 'poll', body: 'Oi', options: 'Só uma' }).results, /a enquete aceita de 2 a 12 opções/);
  assert.match(run({ kind: 'buttons', body: 'Oi', options: 'Uma opção comprida demais aqui' }).results, /até 20 caracteres/);
  assert.match(run({ kind: 'buttons', body: '{{contact.company}}', options: 'A' }).results, /mensagem vazia/);
  const noPhone = run({ kind: 'buttons', body: 'Oi', options: 'A' }, { phone: '' });
  assert.match(noPhone.results, /contato sem telefone/);
  assert.equal(noPhone.outbox.filter(row => row.kind === 'whatsapp-interactive').length, 0);
  assert.match(run({ kind: 'buttons', body: 'Oi', options: 'A' }, { dnd: true }).results, /não perturbe/);
});

test('T.1 WhatsApp ad click: fires the trigger with the ad and puts it in the attribution', () => {
  assert.deepEqual(triggerSpec('whatsapp_ad_click').fields.map(field => field.key), ['adId', 'keyword']);
  const s = blank();
  const any = save(s, 'workflows', { name: 'Anúncio', active: true, triggers: [{ type: 'whatsapp_ad_click', config: {} }], steps: [{ type: 'add_tag', config: { tag: 'veio-do-anuncio' } }] });
  const other = save(s, 'workflows', { name: 'Outro anúncio', active: true, triggers: [{ type: 'whatsapp_ad_click', config: { adId: '999' } }], steps: [{ type: 'add_tag', config: { tag: 'outro' } }] });
  const contactId = save(s, 'contacts', { name: 'Caio', phone: '+55 11 90000-1111', tags: [], custom: {} });
  execute(s, { type: 'whatsapp-ad-click', data: { contactId, id: '120210', title: 'Clareamento em BH', url: 'https://fb.me/x', clickId: 'CTWA-1', body: 'Olá! Quero saber mais' } });
  const caio = s.contacts.find(row => row.id === contactId);
  assert.ok(caio.tags.includes('veio-do-anuncio'));
  assert.ok(!caio.tags.includes('outro'));
  assert.deepEqual([caio.attribution.last.channel, caio.attribution.last.campaign, caio.attribution.last.content, caio.attribution.last.fbclid], ['meta_ads', 'Clareamento em BH', '120210', 'CTWA-1']);
  assert.equal(s.runs.filter(row => row.workflowId === any).length, 1);
  assert.equal(s.runs.filter(row => row.workflowId === other).length, 0);
  assert.equal(execute(s, { type: 'whatsapp-ad-click', data: { contactId: 'nao-existe', id: '1' } }), '');
});
