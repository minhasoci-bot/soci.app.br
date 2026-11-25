// Cadastro fiscal: the form used by the agency (Configurações) and by each sub-account. The server validates it (tax-id.mjs).
import { brazilStates, fiscalRegimes, formatTaxId } from './tax-id.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const regimeLabels = { '': 'Não se aplica', simples: 'Simples Nacional', mei: 'MEI', presumido: 'Lucro presumido', real: 'Lucro real' };
const option = (value, label, current) => `<option value="${esc(value)}" ${value === current ? 'selected' : ''}>${esc(label)}</option>`;

export function fiscalForm(fiscal, { attr = '', intro = '' } = {}) {
  const f = fiscal || {}, a = f.address || {};
  const field = (name, label, value, extra = '') => `<label>${label}<input name="${name}" value="${esc(value)}" autocomplete="off" ${extra}></label>`;
  return `<form class="surface padded settings-form" ${attr}><h2>Cadastro fiscal</h2>
    <p class="dim">${intro || 'Estes dados identificam quem vende nas faturas e recibos e vão para o livro que o contador usa.'}</p>
    <div class="field-grid">
      <label>Tipo<select name="person">${option('pj', 'Pessoa jurídica', f.person || 'pj')}${option('pf', 'Pessoa física', f.person)}</select></label>
      ${field('taxId', 'CPF ou CNPJ', formatTaxId(f.taxId || ''), 'required maxlength="18"')}
      ${field('name', 'Razão social ou nome completo', f.name, 'required maxlength="160"')}
      ${field('email', 'E-mail fiscal', f.email, 'type="email" required maxlength="160"')}
      <label>Regime tributário<select name="regime">${fiscalRegimes.map(value => option(value, regimeLabels[value], f.regime || '')).join('')}</select></label>
      ${field('cityRegistration', 'Inscrição municipal (opcional)', f.cityRegistration, 'maxlength="30"')}
      ${field('zip', 'CEP', (a.zip || '').replace(/^(\d{5})(\d{3})$/, '$1-$2'), 'required inputmode="numeric" maxlength="9"')}
      ${field('street', 'Endereço', a.street, 'required maxlength="160"')}
      ${field('number', 'Número', a.number, 'required maxlength="20"')}
      ${field('complement', 'Complemento (opcional)', a.complement, 'maxlength="80"')}
      ${field('district', 'Bairro', a.district, 'required maxlength="80"')}
      ${field('city', 'Município', a.city, 'required maxlength="80"')}
      <label>UF<select name="state" required>${option('', 'Escolha', a.state || '')}${brazilStates.map(value => option(value, value, a.state)).join('')}</select></label>
      ${field('ibge', 'Código IBGE do município', a.ibge, 'required inputmode="numeric" maxlength="7"')}
    </div>
    <p class="form-status" role="status"></p><button class="primary">Salvar cadastro fiscal</button></form>`;
}

/** The form's flat fields in the shape the server expects. */
export const readFiscal = d => ({ person: d.person, name: d.name, taxId: d.taxId, cityRegistration: d.cityRegistration, regime: d.regime, email: d.email,
  address: { zip: d.zip, street: d.street, number: d.number, complement: d.complement, district: d.district, city: d.city, ibge: d.ibge, state: d.state } });

/** The notice for an account that charges without the record. */
export const fiscalMissing = href => `<div class="surface padded ag-notice"><div><b>Complete o cadastro fiscal</b><p>Sem CPF ou CNPJ, as faturas e o livro não identificam quem vende.</p></div><a class="secondary" href="${esc(href)}">Completar</a></div>`;
