import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { invoiceView } from '../invoice-model.mjs';
import { staticFiles } from '../server.mjs';
import { fiscalForm, fiscalMissing, readFiscal } from '../ui/fiscal.js';
import { sanitizeFiscal } from '../tax-id.mjs';
import { KEY_AGENCY, KEY_SHOP, startBilling } from './helpers/abacate.mjs';
import { demoFiscal, saveFiscal } from './helpers/fiscal.mjs';

test('Conectar um gateway pela primeira vez pede o cadastro fiscal; depois conecta', async t => {
  const b = await startBilling(t);
  for (const [path, apiKey, save] of [
    ['/api/abacatepay/workspace/connect?workspace=demo', KEY_SHOP, () => b.send('/api/action?workspace=demo', saveFiscal)],
    ['/api/abacatepay/agency/connect', KEY_AGENCY, () => b.send('/api/agency/action', saveFiscal)]
  ]) {
    const refused = await b.send(path, { apiKey });
    assert.deepEqual([refused.status, refused.body.code], [409, 'FISCAL_REQUIRED'], path);
    assert.equal((await save()).status, 200);
    assert.equal((await b.send(path, { apiKey })).status, 200);
  }
});

test('Conta já conectada continua cobrando e pode trocar a chave sem o cadastro', async t => {
  const b = await startBilling(t);
  await b.connect();
  b.store.change('demo', s => { s.fiscal = null; });
  const contactId = (await b.save('contacts', { name: 'Ana', email: 'ana@x.com' })).body.id;
  const invoiceId = (await b.save('invoices', { title: 'Projeto', contactId, value: 150, due: '2026-12-01', status: 'Open' })).body.id;
  assert.equal((await b.send('/api/abacatepay/workspace/charge?workspace=demo', { invoiceId })).status, 200);
  assert.equal((await b.send('/api/abacatepay/workspace/connect?workspace=demo', { apiKey: KEY_SHOP })).status, 200);
});

test('A fatura pública mostra quem vende e nunca o documento de quem compra', () => {
  const s = blank('Loja da Ana');
  const contactId = execute(s, { type: 'save', key: 'contacts', data: { name: 'Bia', email: 'bia@x.com', taxId: '529.982.247-25' } });
  const id = execute(s, { type: 'save', key: 'invoices', data: { title: 'A', contactId, value: 150, due: '2026-12-01', status: 'Open' } });
  const view = () => invoiceView(s, s.invoices.find(row => row.id === id));
  assert.deepEqual(view().seller, { name: 'Loja da Ana', taxId: '' }, 'sem cadastro, o nome da subconta');
  assert.match(view().html, /Vendido por/);
  assert.match(view().html, /Loja da Ana/);
  execute(s, saveFiscal);
  assert.deepEqual(view().seller, { name: 'Loja Exemplo Ltda', taxId: '11.222.333/0001-81' });
  assert.match(view().html, /Vendido por[^]*Loja Exemplo Ltda[^]*11\.222\.333\/0001-81/);
  assert.doesNotMatch(JSON.stringify(view()), /52998224725|529\.982/);
  assert.doesNotMatch(view().html, /[Ss]oci\b/);
  s.fiscal = { ...demoFiscal, name: '<b>x</b>' };
  assert.doesNotMatch(view().html, /<b>x<\/b>/, 'o nome é escapado');
});

test('Pessoa física: o CPF do vendedor aparece formatado', () => {
  const s = blank('Ana');
  execute(s, { type: 'fiscal', data: { ...demoFiscal, person: 'pf', name: 'Ana Lima', taxId: '52998224725', regime: '' } });
  const contactId = execute(s, { type: 'save', key: 'contacts', data: { name: 'Bia', email: 'bia@x.com' } });
  const id = execute(s, { type: 'save', key: 'invoices', data: { title: 'A', contactId, value: 1, due: '2026-12-01', status: 'Open' } });
  assert.equal(invoiceView(s, s.invoices.find(row => row.id === id)).seller.taxId, '529.982.247-25');
});

test('O formulário fiscal vai e volta sem perder nada e escapa o que mostra', () => {
  const saved = sanitizeFiscal({ ...demoFiscal, cityRegistration: '123' });
  const html = fiscalForm(saved, { attr: 'data-form="fiscal"' });
  assert.match(html, /data-form="fiscal"/);
  assert.match(html, /11\.222\.333\/0001-81/);
  const flat = { person: 'pj', name: saved.name, taxId: '11.222.333/0001-81', cityRegistration: '123', regime: 'simples', email: saved.email,
    zip: '30110-000', street: 'Rua A', number: '1', complement: '', district: 'Centro', city: 'Belo Horizonte', ibge: '3106200', state: 'MG' };
  assert.deepEqual(sanitizeFiscal(readFiscal(flat)), saved);
  for (const name of Object.keys(flat)) assert.match(html, new RegExp(`name="${name}"`), name);
  assert.doesNotMatch(fiscalForm({ ...saved, name: '"><img src=x>' }, {}), /<img/);
  assert.match(fiscalForm(null, {}), /name="taxId"/);
  assert.match(fiscalMissing('#settings/fiscal'), /#settings\/fiscal/);
});

test('Os módulos novos da interface são servidos', () => {
  for (const file of ['/fiscal.js', '/tax-id.js']) assert.ok(staticFiles.has(file), file);
});
