import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });

test('Deleted contacts go to the trash with their records and come back whole', () => {
  const s = blank();
  const id = save(s, 'contacts', { name: 'Ana Souza', email: 'ana@x.test', tags: ['vip'] });
  save(s, 'tasks', { title: 'Ligar', contactId: id, due: '2026-12-01', done: false });
  execute(s, { type: 'message', data: { contactId: id, channel: 'Email', direction: 'Inbound', body: 'Oi' } });
  const before = { tasks: s.tasks.filter(r => r.contactId === id).length, messages: s.messages.filter(r => r.contactId === id).length };
  execute(s, { type: 'delete', key: 'contacts', id });
  assert.equal(s.contacts.some(r => r.id === id), false);
  assert.equal(s.tasks.some(r => r.contactId === id), false);
  assert.equal(s.contactTrash.length, 1);
  // Another contact took the e-mail meanwhile: restore asks to fix it first.
  const twin = save(s, 'contacts', { name: 'Outra Ana', email: 'ana@x.test', tags: [] });
  assert.throws(() => execute(s, { type: 'contact-restore', id }), /Outra Ana/);
  execute(s, { type: 'delete', key: 'contacts', id: twin });
  execute(s, { type: 'contact-restore', id });
  const back = s.contacts.find(r => r.id === id);
  assert.deepEqual([back.name, back.tags], ['Ana Souza', ['vip']]);
  assert.deepEqual({ tasks: s.tasks.filter(r => r.contactId === id).length, messages: s.messages.filter(r => r.contactId === id).length }, before);
  assert.deepEqual(s.contactTrash.map(r => r.contact.name), ['Outra Ana']);
  assert.throws(() => execute(s, { type: 'contact-restore', id }), /não está na lixeira/);
  execute(s, { type: 'contact-trash-purge', id: twin });
  assert.equal(s.contactTrash.length, 0);
  // Entries older than 60 days leave on their own; emptying removes the rest.
  execute(s, { type: 'delete', key: 'contacts', id });
  s.contactTrash[0].deletedAt = new Date(Date.now() - 61 * 86400000).toISOString();
  const other = save(s, 'contacts', { name: 'Bia', email: 'bia@x.test', tags: [] });
  execute(s, { type: 'delete', key: 'contacts', id: other });
  assert.deepEqual(s.contactTrash.map(r => r.contact.name), ['Bia']);
  assert.equal(execute(s, { type: 'contact-trash-empty' }), 1);
  assert.equal(s.contactTrash.length, 0);
});
