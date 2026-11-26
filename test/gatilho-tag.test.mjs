// "Tag do contato" dispara por qualquer caminho que põe ou tira uma tag, não só pelo cadastro na tela
// ou pela ação "Adicionar tag" da automação: ação em massa, formulário, chat, loja, webinar e leads de anúncio.
import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { newField } from '../ui/form-fields.js';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });

// Uma automação por tag e mudança; cada execução deixa o nome da automação como tag no contato.
function watching(...specs) {
  const s = blank();
  for (const [change, tag] of specs) {
    save(s, 'workflows', { name: `${change}-${tag}`, active: true, triggers: [{ type: 'contact_tag', config: { change, tag } }],
      steps: [{ type: 'add_tag', config: { tag: `viu-${change}-${tag}` } }] });
  }
  return s;
}
const contact = (s, email) => s.contacts.find(row => row.email === email);
const runs = (s, name) => s.runs.filter(row => row.name === name).length;

test('Bulk add and remove tag fire "Tag do contato" once per contact that changed', () => {
  const s = watching(['added', 'vip'], ['removed', 'vip']);
  const ana = save(s, 'contacts', { name: 'Ana', email: 'ana@exemplo.com' });
  const bia = save(s, 'contacts', { name: 'Bia', email: 'bia@exemplo.com', tags: ['vip'] });
  assert.equal(runs(s, 'added-vip'), 1, 'Bia was created with the tag');
  execute(s, { type: 'bulk', data: { object: 'contacts', ids: [ana, bia], operation: 'add-tag', value: 'vip' } });
  assert.equal(runs(s, 'added-vip'), 2, 'only Ana gained the tag; Bia already had it');
  assert.ok(contact(s, 'ana@exemplo.com').tags.includes('viu-added-vip'));
  execute(s, { type: 'bulk', data: { object: 'contacts', ids: [ana, bia], operation: 'remove-tag', value: 'VIP' } });
  assert.equal(runs(s, 'removed-vip'), 2, 'both lost the tag, matched without case');
});

test('A form adds its tags to new and returning contacts and fires the trigger for each new tag', () => {
  const s = watching(['added', 'lead-site']);
  const id = save(s, 'forms', { name: 'Contato', active: true, addTags: ['lead-site'], fields: [{ ...newField('email'), id: 'mail' }] });
  const key = s.forms.find(row => row.id === id).fields[0].key;
  execute(s, { type: 'submit', id, data: { [key]: 'novo@exemplo.com' } });
  assert.equal(runs(s, 'added-lead-site'), 1, 'a contact the form creates');
  save(s, 'contacts', { name: 'Caio', email: 'caio@exemplo.com' });
  execute(s, { type: 'submit', id, data: { [key]: 'caio@exemplo.com' } });
  assert.equal(runs(s, 'added-lead-site'), 2, 'a contact that already existed');
  execute(s, { type: 'submit', id, data: { [key]: 'caio@exemplo.com' } });
  assert.equal(runs(s, 'added-lead-site'), 2, 'sending again adds nothing new, so nothing fires');
});

test('Ad lead forms fire the trigger for the network tag, new contact or not', () => {
  const s = watching(['added', 'Lead do Facebook']);
  execute(s, { type: 'ad-form-lead', data: { network: 'meta', leadId: 'l1', fields: { email: 'dani@exemplo.com', full_name: 'Dani' } } });
  save(s, 'contacts', { name: 'Edu', email: 'edu@exemplo.com' });
  execute(s, { type: 'ad-form-lead', data: { network: 'meta', leadId: 'l2', fields: { email: 'edu@exemplo.com' } } });
  assert.equal(runs(s, 'added-Lead do Facebook'), 2);
});

test('A contact saved on screen still fires the trigger once, not twice', () => {
  const s = watching(['added', 'cliente']);
  const id = save(s, 'contacts', { name: 'Fê', email: 'fe@exemplo.com', tags: ['cliente'] });
  save(s, 'contacts', { ...s.contacts.find(row => row.id === id), tags: ['cliente', 'outra'] }, id);
  assert.equal(runs(s, 'added-cliente'), 1);
});
