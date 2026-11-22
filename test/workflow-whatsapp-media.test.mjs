import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
function run(steps, contact = {}) {
  const s = blank();
  const id = save(s, 'workflows', { name: 'Arquivo', active: true, triggers: [{ type: 'contact_created' }], steps });
  const contactId = save(s, 'contacts', { name: 'Ana Lima', email: 'ana@x.test', phone: '+55 81 99999-0000', tags: [], custom: {}, ...contact });
  return { s, results: s.runs.find(row => row.workflowId === id).results.join(' | '), outbox: s.workflowOutbox || [], contactId };
}

test('T.1 WhatsApp file: queued with the merged address and caption, and recorded in Conversas', () => {
  const { s, outbox, results } = run([{ type: 'whatsapp_media', config: { mediaType: 'audio', url: 'https://cdn.test/{{contact.first_name}}.ogg', caption: 'não vai', fileName: '' } }]);
  const item = outbox.find(row => row.kind === 'whatsapp-media');
  assert.deepEqual(item.media, { type: 'audio', url: 'https://cdn.test/Ana.ogg', caption: '', fileName: '' }, 'audio has no caption');
  assert.match(results, /áudio na fila de envio/);
  assert.ok(s.messages.some(row => row.channel === 'WhatsApp' && row.body.startsWith('[Áudio] https://cdn.test/Ana.ogg')));
});

test('T.1 WhatsApp file and typing: http address, no phone and do-not-disturb stop early; seconds are clamped', () => {
  assert.match(run([{ type: 'whatsapp_media', config: { url: 'http://inseguro.test/a.png' } }]).results, /endereço do arquivo inválido/);
  const noPhone = run([{ type: 'whatsapp_media', config: { url: 'https://cdn.test/a.png' } }], { phone: '' });
  assert.match(noPhone.results, /contato sem telefone/);
  assert.equal(noPhone.s.messages.find(row => row.channel === 'WhatsApp').failed, 'no_phone');
  assert.match(run([{ type: 'whatsapp_media', config: { url: 'https://cdn.test/a.png' } }], { dnd: true }).results, /não perturbe/);
  assert.throws(() => run([{ type: 'whatsapp_typing', config: { seconds: 99 } }]), /fora do intervalo/, 'publishing refuses more than 25 seconds');
  const typing = run([{ type: 'whatsapp_typing', config: { seconds: 5 } }]);
  assert.equal(typing.outbox.find(row => row.kind === 'whatsapp-typing').seconds, 5);
  assert.match(typing.results, /"digitando…" por 5 s na fila/);
  assert.match(run([{ type: 'whatsapp_typing', config: { seconds: 2 } }], { phone: '' }).results, /contato sem telefone/);
});
