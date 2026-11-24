import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTaxId, formatTaxId, maskTaxId, sanitizeFiscal, taxIdKind } from '../tax-id.mjs';
import { blank, execute, hydrateWorkspace } from '../model.mjs';
import { blankAgency, executeAgency, hydrateAgency } from '../agency-model.mjs';
import { requireAgencyCommand, requireWorkspaceCommand, workspaceView } from '../authorization.mjs';

const fiscal = { person: 'pj', name: 'Loja Ltda', taxId: '11.222.333/0001-81', regime: 'simples', email: 'Fiscal@Loja.com',
  address: { zip: '30110-000', street: 'Rua A', number: '1', district: 'Centro', city: 'Belo Horizonte', ibge: '3106200', state: 'mg' } };

test('CPF e CNPJ são conferidos pelo dígito verificador, inclusive o CNPJ alfanumérico', () => {
  assert.equal(taxIdKind('529.982.247-25'), 'cpf');
  assert.equal(taxIdKind('529.982.247-24'), '', 'dígito errado');
  assert.equal(taxIdKind('111.111.111-11'), '', 'repetido');
  assert.equal(taxIdKind('11.222.333/0001-81'), 'cnpj');
  assert.equal(taxIdKind('11.222.333/0001-80'), '');
  assert.equal(taxIdKind('00.000.000/0000-00'), '');
  assert.equal(taxIdKind('12.ABC.345/01DE-35'), 'cnpj');
  assert.equal(taxIdKind('12.abc.345/01de-35'), 'cnpj');
  assert.equal(taxIdKind('12.ABC.345/01DE-3A'), '', 'o dígito verificador é sempre número');
  for (const value of ['', null, undefined, 42, {}, '123']) assert.equal(taxIdKind(value), '');
  assert.equal(cleanTaxId(' 12.abc.345/01de-35 '), '12ABC34501DE35');
  assert.equal(formatTaxId('12ABC34501DE35'), '12.ABC.345/01DE-35');
  assert.equal(formatTaxId('52998224725'), '529.982.247-25');
  assert.equal(formatTaxId(''), '');
  assert.equal(maskTaxId('52998224725'), '***.982.247-**');
  assert.equal(maskTaxId('11222333000181'), '11.222.333/0001-81', 'CNPJ é público');
});

test('O cadastro fiscal guarda o documento sem máscara e confere tipo de pessoa, município e UF', () => {
  const saved = sanitizeFiscal(fiscal);
  assert.equal(saved.taxId, '11222333000181');
  assert.equal(saved.email, 'fiscal@loja.com');
  assert.equal(saved.address.zip, '30110000');
  assert.equal(saved.address.state, 'MG');
  assert.throws(() => sanitizeFiscal({ ...fiscal, taxId: '52998224725' }), /Informe um CNPJ válido/);
  assert.throws(() => sanitizeFiscal({ ...fiscal, person: 'pf' }), /Informe um CPF válido/);
  assert.equal(sanitizeFiscal({ ...fiscal, person: 'pf', taxId: '52998224725', regime: '' }).person, 'pf');
  assert.throws(() => sanitizeFiscal({ ...fiscal, name: ' ' }), /nome|razão/i);
  assert.throws(() => sanitizeFiscal({ ...fiscal, regime: 'x' }), /regime/i);
  assert.throws(() => sanitizeFiscal({ ...fiscal, address: { ...fiscal.address, ibge: '31' } }), /município/i);
  assert.throws(() => sanitizeFiscal({ ...fiscal, address: { ...fiscal.address, state: 'XX' } }), /UF/);
  assert.throws(() => sanitizeFiscal({ ...fiscal, address: { ...fiscal.address, zip: '123' } }), /CEP/);
  assert.throws(() => sanitizeFiscal({ ...fiscal, email: 'sem arroba' }), /e-mail/i);
});

test('Agência e subconta salvam o cadastro fiscal; editar o perfil não o apaga', () => {
  const s = blank();
  assert.equal(s.fiscal, null);
  execute(s, { type: 'fiscal', data: fiscal });
  execute(s, { type: 'profile', data: { name: 'Loja', email: 'a@b.com', phone: '', timezone: 'America/Sao_Paulo' } });
  assert.equal(s.fiscal.taxId, '11222333000181');
  const agency = blankAgency();
  assert.equal(agency.fiscal, null);
  executeAgency(agency, { type: 'fiscal', data: fiscal }, { actor: 'Dono' });
  assert.equal(agency.fiscal.name, 'Loja Ltda');
  assert.doesNotMatch(JSON.stringify(agency.audit), /11222333000181/, 'a auditoria não repete o documento');
  const old = blank(); delete old.fiscal;
  assert.equal(hydrateWorkspace(old).fiscal, null);
  const oldAgency = blankAgency(); delete oldAgency.fiscal;
  assert.equal(hydrateAgency(oldAgency).fiscal, null);
});

test('Só quem tem Configurações altera ou vê o cadastro fiscal', () => {
  assert.throws(() => requireWorkspaceCommand({ modules: ['contacts'] }, { type: 'fiscal', data: {} }), error => error.status === 403);
  assert.doesNotThrow(() => requireWorkspaceCommand({ modules: ['settings'] }, { type: 'fiscal', data: {} }));
  assert.throws(() => requireAgencyCommand({ settings: false }, { type: 'fiscal' }, blankAgency()), error => error.status === 403);
  const s = blank(); execute(s, { type: 'fiscal', data: fiscal });
  assert.equal(workspaceView({ modules: ['contacts'] }, s).state.fiscal, null);
  assert.equal(workspaceView({ modules: ['settings'] }, s).state.fiscal.taxId, '11222333000181');
});

test('Contato: documento inválido é recusado; na importação o contato entra sem ele', () => {
  const s = blank();
  const id = execute(s, { type: 'save', key: 'contacts', data: { name: 'Ana', email: 'ana@x.com', taxId: '529.982.247-25' } });
  assert.equal(s.contacts.find(row => row.id === id).taxId, '52998224725');
  execute(s, { type: 'save', key: 'contacts', id, data: { name: 'Ana Maria', email: 'ana@x.com' } });
  assert.equal(s.contacts.find(row => row.id === id).taxId, '52998224725', 'salvar sem o campo não apaga');
  execute(s, { type: 'save', key: 'contacts', id, data: { name: 'Ana Maria', email: 'ana@x.com', taxId: '' } });
  assert.equal(s.contacts.find(row => row.id === id).taxId, '');
  assert.throws(() => execute(s, { type: 'save', key: 'contacts', data: { name: 'Bia', taxId: '123' } }), /CPF ou CNPJ inválido\./);
  execute(s, { type: 'import', data: { file: 'a.csv', rows: [{ name: 'Caio', email: 'caio@x.com', taxId: '123' }, { name: 'Davi', email: 'davi@x.com', taxId: '11222333000181' }] } });
  assert.equal(s.contacts.find(row => row.email === 'caio@x.com').taxId, '');
  assert.equal(s.contacts.find(row => row.email === 'davi@x.com').taxId, '11222333000181');
});
