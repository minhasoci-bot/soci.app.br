// The fiscal record (cadastro fiscal) of an agency or a sub-account, and the optional document of a contact.
// Documents are stored without the mask; ui/tax-id.js has the check digits, shared with the app.
import { brazilStates, cleanTaxId, fiscalRegimes, taxIdKind } from './ui/tax-id.js';
export * from './ui/tax-id.js';

const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const str = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';

export const invalidTaxId = 'CPF ou CNPJ inválido.';

/** An optional document typed on a contact: '' or a valid one. */
export function optionalTaxId(value) {
  const id = cleanTaxId(value);
  if (id && !taxIdKind(id)) fail(invalidTaxId);
  return id;
}

export function sanitizeFiscal(d) {
  const input = d && typeof d === 'object' ? d : {}, a = input.address && typeof input.address === 'object' ? input.address : {};
  const person = input.person === 'pf' ? 'pf' : input.person === 'pj' ? 'pj' : fail('Escolha pessoa física ou jurídica.');
  const name = str(input.name, 160) || fail(person === 'pf' ? 'Informe o nome completo.' : 'Informe a razão social.');
  const taxId = cleanTaxId(input.taxId);
  if (taxIdKind(taxId) !== (person === 'pf' ? 'cpf' : 'cnpj')) fail(person === 'pf' ? 'Informe um CPF válido.' : 'Informe um CNPJ válido.');
  const regime = input.regime ?? '';
  if (!fiscalRegimes.includes(regime)) fail('Escolha um regime tributário válido.');
  const email = str(input.email, 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Informe um e-mail fiscal válido.');
  const zip = str(a.zip, 12).replace(/\D/g, ''), state = str(a.state, 2).toUpperCase(), ibge = str(a.ibge, 10).replace(/\D/g, '');
  if (!/^\d{8}$/.test(zip)) fail('Informe um CEP com 8 números.');
  if (!brazilStates.includes(state)) fail('Escolha uma UF válida.');
  if (!/^\d{7}$/.test(ibge)) fail('Informe o código IBGE do município, com 7 números.');
  return { person, name, taxId, cityRegistration: str(input.cityRegistration, 30), regime, email,
    address: { zip, street: str(a.street, 160) || fail('Informe o endereço.'), number: str(a.number, 20) || fail('Informe o número do endereço.'),
      complement: str(a.complement, 80), district: str(a.district, 80) || fail('Informe o bairro.'), city: str(a.city, 80) || fail('Informe o município.'), ibge, state } };
}
