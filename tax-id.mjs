// CPF, CNPJ and the fiscal record (cadastro fiscal) of an agency, a sub-account or a contact. Documents are stored
// without the mask. The alphanumeric CNPJ keeps the numeric rule: each character is worth its ASCII code minus 48.
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const str = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';

export const fiscalRegimes = ['', 'simples', 'mei', 'presumido', 'real'];
export const brazilStates = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];
export const invalidTaxId = 'CPF ou CNPJ inválido.';

export const cleanTaxId = value => typeof value === 'string' ? value.replace(/[\s./-]/g, '').toUpperCase() : '';

const checkDigit = (values, weights) => { const rest = values.reduce((sum, value, i) => sum + value * weights[i], 0) % 11; return rest < 2 ? 0 : 11 - rest; };
const cpfWeights = length => Array.from({ length }, (_, i) => length + 1 - i);
const cnpjWeights = length => Array.from({ length }, (_, i) => (length - 1 - i) % 8 + 2);

/** 'cpf', 'cnpj' or '' when the document is not valid. */
export function taxIdKind(value) {
  const id = cleanTaxId(value);
  if (/^(.)\1*$/.test(id)) return '';
  const cpf = /^\d{11}$/.test(id), cnpj = /^[0-9A-Z]{12}\d{2}$/.test(id);
  if (!cpf && !cnpj) return '';
  const values = [...id].map(char => char.charCodeAt(0) - 48), body = id.length - 2, weights = cpf ? cpfWeights : cnpjWeights;
  const ok = checkDigit(values.slice(0, body), weights(body)) === values[body]
    && checkDigit(values.slice(0, body + 1), weights(body + 1)) === values[body + 1];
  return ok ? (cpf ? 'cpf' : 'cnpj') : '';
}

export function formatTaxId(value) {
  const id = cleanTaxId(value);
  if (id.length === 11) return id.replace(/^(.{3})(.{3})(.{3})(.{2})$/, '$1.$2.$3-$4');
  if (id.length === 14) return id.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5');
  return id;
}

/** Hides the ends of a CPF; a CNPJ is public and is shown whole. */
export const maskTaxId = value => {
  const id = cleanTaxId(value);
  return id.length === 11 ? `***.${id.slice(3, 6)}.${id.slice(6, 9)}-**` : formatTaxId(id);
};

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
