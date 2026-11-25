// CPF and CNPJ, shared by the server (tax-id.mjs) and the app: cleaning, check digits and how they are shown.
// The alphanumeric CNPJ keeps the numeric rule: each character is worth its ASCII code minus 48.
export const fiscalRegimes = ['', 'simples', 'mei', 'presumido', 'real'];
export const brazilStates = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

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
