import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute, receiveProspects } from '../model.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const flow = (s, name, config, steps = [{ type: 'add_tag', config: { tag: name } }]) => save(s, 'workflows', { name, active: true, triggers: [{ type: 'prospect_received', config }], steps });
const runsOf = (s, id) => s.runs.filter(row => row.workflowId === id);
const prospect = (id, extra = {}) => ({ id, name: `Clínica ${id}`, owner: `Dona ${id}`, email: `${id}@clinica.test`, phone: '',
  website: `${id}.test`, city: 'Recife', category: 'Dentist', ...extra });

test('T.1 prospect received: fires once per prospect, with the business data in {{trigger.*}}', () => {
  const s = blank();
  const id = flow(s, 'Prospect novo', {}, [{ type: 'add_tag', config: { tag: 'prospect {{trigger.city}}' } }]);
  const [first] = receiveProspects(s, [prospect('a')], { opportunity: true });
  const runs = runsOf(s, id);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].contactId, first.contact);
  assert.equal(runs[0].event, 'Prospect recebido da agência');
  assert.equal(runs[0].context.company, 'Clínica a');
  assert.equal(runs[0].context.website, 'a.test');
  assert.equal(runs[0].context.opportunityId, first.opportunity);
  const contact = s.contacts.find(row => row.id === first.contact);
  assert.ok(contact.tags.includes('New Prospect Received'));
  assert.ok(contact.tags.includes('prospect Recife'), 'trigger variables reach the steps');

  // Sending the same prospect again reuses the contact and does not fire again.
  const [again] = receiveProspects(s, [prospect('a')], { opportunity: true });
  assert.deepEqual(again, first);
  assert.equal(runsOf(s, id).length, 1);
});

test('T.1 prospect received: filters by new or existing contact, opportunity and category', () => {
  const s = blank();
  const existing = save(s, 'contacts', { name: 'Já cliente', email: 'b@clinica.test', tags: [], custom: {} });
  const onlyNew = flow(s, 'Só novos', { isNew: 'yes' });
  const onlyExisting = flow(s, 'Já existia', { isNew: 'no' });
  const withOpportunity = flow(s, 'Com oportunidade', { withOpportunity: 'yes' });
  const dentists = flow(s, 'Dentistas', { category: 'dent' });

  receiveProspects(s, [prospect('a')], { opportunity: false });
  const [b] = receiveProspects(s, [prospect('b', { category: 'Bakery' })], { opportunity: true });
  assert.equal(b.contact, existing, 'matching e-mail reuses the contact');

  const contactsOf = id => runsOf(s, id).map(run => s.contacts.find(row => row.id === run.contactId)?.name);
  assert.deepEqual(contactsOf(onlyNew), ['Dona a']);
  assert.deepEqual(contactsOf(onlyExisting), ['Já cliente']);
  assert.deepEqual(contactsOf(withOpportunity), ['Já cliente']);
  assert.deepEqual(contactsOf(dentists), ['Dona a']);
  assert.ok(s.contacts.find(row => row.id === existing).tags.includes('New Prospect Received'));
});
