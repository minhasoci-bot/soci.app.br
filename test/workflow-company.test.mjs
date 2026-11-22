import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const flow = (s, name, trigger, steps) => save(s, 'workflows', { name, active: true, triggers: [trigger], steps });
const runsOf = (s, id) => s.runs.filter(row => row.workflowId === id);
const tag = (s, id, tags) => save(s, 'contacts', { ...s.contacts.find(row => row.id === id), tags }, id);
const results = (s, id, contactId) => runsOf(s, id).filter(run => run.contactId === contactId).at(-1).results;

test('T.1 company: create and associate, update and clear the contact company', () => {
  const s = blank();
  const create = flow(s, 'Empresa', { type: 'contact_tag', config: { change: 'added', tag: 'b2b' } }, [
    { id: 'empresa1', type: 'company_create', config: { name: 'Acme Ltda', phone: '(11) 3333-0000', website: 'https://acme.example.test' } },
    { type: 'add_note', config: { body: 'Empresa {{steps.empresa1.name}} criada={{steps.empresa1.created}}' } }
  ]);
  const ana = save(s, 'contacts', { name: 'Ana', email: 'ana@x.test', tags: ['b2b'], custom: {} });
  assert.equal(runsOf(s, create)[0].status, 'Completed', results(s, create, ana).join(' | '));
  const acme = s.companies.find(row => row.name === 'Acme Ltda');
  assert.ok(acme, 'the company was created');
  assert.deepEqual([acme.phone, acme.website], ['(11) 3333-0000', 'https://acme.example.test/']);
  assert.equal(s.contacts.find(row => row.id === ana).company, 'Acme Ltda');
  assert.ok(s.messages.some(row => row.contactId === ana && row.body === 'Empresa Acme Ltda criada=yes'));

  // A second contact with the same company name (other case) joins the existing one.
  const bia = save(s, 'contacts', { name: 'Bia', email: 'bia@x.test', tags: [], custom: {} });
  const createLower = flow(s, 'Empresa 2', { type: 'contact_tag', config: { change: 'added', tag: 'acme' } }, [{ type: 'company_create', config: { name: 'acme ltda' } }]);
  tag(s, bia, ['acme']);
  assert.equal(s.companies.length, 1, 'no duplicate company');
  assert.equal(s.contacts.find(row => row.id === bia).company, 'Acme Ltda');
  assert.match(results(s, createLower, bia).join(' | '), /Acme Ltda associada/);

  // Update one field (validated like the screen) and clear groups of fields.
  const update = flow(s, 'Atualizar', { type: 'contact_tag', config: { change: 'added', tag: 'cidade' } }, [{ type: 'company_update', config: { field: 'city', value: 'Campinas' } }]);
  const badEmail = flow(s, 'E-mail ruim', { type: 'contact_tag', config: { change: 'added', tag: 'email-ruim' } }, [{ type: 'company_update', config: { field: 'email', value: 'não é e-mail' } }]);
  const clear = flow(s, 'Limpar', { type: 'contact_tag', config: { change: 'added', tag: 'limpar' } }, [{ type: 'company_clear', config: { field: 'contact' } }]);
  tag(s, ana, ['b2b', 'cidade']);
  assert.equal(s.companies[0].city, 'Campinas');
  tag(s, ana, ['b2b', 'cidade', 'email-ruim']);
  assert.match(results(s, badEmail, ana).join(' | '), /erro:/, 'invalid values are refused');
  tag(s, ana, ['b2b', 'cidade', 'email-ruim', 'limpar']);
  assert.deepEqual([s.companies[0].name, s.companies[0].phone, s.companies[0].website, s.companies[0].city], ['Acme Ltda', '', '', 'Campinas'], 'contact fields cleared, the rest kept');

  // Renaming through the update keeps every contact linked.
  const rename = flow(s, 'Renomear', { type: 'contact_tag', config: { change: 'added', tag: 'renomear' } }, [{ type: 'company_update', config: { field: 'name', value: 'Acme S.A.' } }]);
  tag(s, ana, ['renomear']);
  assert.deepEqual(s.contacts.filter(row => row.company === 'Acme S.A.').map(row => row.name).sort(), ['Ana', 'Bia']);

  // Without a company in the register, update and clear stop with the reason.
  const caio = save(s, 'contacts', { name: 'Caio', email: 'caio@x.test', company: 'Sem Cadastro', tags: ['cidade', 'limpar'], custom: {} });
  assert.match(results(s, update, caio).join(' | '), /não está no cadastro/);
  assert.match(results(s, clear, caio).join(' | '), /não está no cadastro/);
  assert.ok(rename);
});
