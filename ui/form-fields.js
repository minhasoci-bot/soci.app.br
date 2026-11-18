// Forms builder: the field catalog, validation of a form's fields and of a visitor's answers,
// and the HTML of the public form. Shared by the server (public page, submit) and the builder.

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const clean = (value, limit) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
const slugKey = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };

// input: how it renders and validates. map: the contact property it fills. key: fixed query key.
export const fieldKinds = {
  name: { label: 'Nome completo', input: 'text', map: 'name', key: 'name', auto: 'name', placeholder: 'Seu nome' },
  first_name: { label: 'Nome', input: 'text', map: 'firstName', key: 'first_name', auto: 'given-name' },
  last_name: { label: 'Sobrenome', input: 'text', map: 'lastName', key: 'last_name', auto: 'family-name' },
  email: { label: 'E-mail', input: 'email', map: 'email', key: 'email', auto: 'email', placeholder: 'voce@empresa.com' },
  phone: { label: 'Telefone', input: 'tel', map: 'phone', key: 'phone', auto: 'tel', placeholder: '(11) 99999-0000' },
  birthday: { label: 'Data de nascimento', input: 'date', key: 'date_of_birth', auto: 'bday' },
  address: { label: 'Endereço', input: 'text', key: 'address', auto: 'street-address' },
  city: { label: 'Cidade', input: 'text', key: 'city', auto: 'address-level2' },
  state: { label: 'Estado', input: 'text', key: 'state', auto: 'address-level1' },
  country: { label: 'País', input: 'text', key: 'country', auto: 'country-name' },
  postal_code: { label: 'CEP', input: 'text', key: 'postal_code', auto: 'postal-code' },
  organization: { label: 'Empresa', input: 'text', map: 'company', key: 'organization', auto: 'organization' },
  website: { label: 'Site', input: 'url', key: 'website', auto: 'url', placeholder: 'https://www.exemplo.com.br' },
  text: { label: 'Linha única', input: 'text' },
  textarea: { label: 'Várias linhas', input: 'textarea' },
  select: { label: 'Lista suspensa', input: 'select', choices: true },
  multiselect: { label: 'Seleção múltipla', input: 'multi', choices: true },
  checkbox: { label: 'Caixas de seleção', input: 'checkbox', choices: true },
  radio: { label: 'Opção única', input: 'radio', choices: true },
  rating: { label: 'Avaliação', input: 'rating' },
  date: { label: 'Data', input: 'date' },
  number: { label: 'Número', input: 'number' },
  monetary: { label: 'Valor (R$)', input: 'money' },
  heading: { label: 'Texto', input: 'static' },
  terms: { label: 'Termos e consentimento', input: 'consent' },
  source: { label: 'Origem', input: 'hidden', key: 'source' },
  custom: { label: 'Campo do contato', input: 'custom' }
};

export const fieldCatalog = [
  ['Dados pessoais', ['name', 'first_name', 'last_name', 'email', 'phone', 'birthday']],
  ['Endereço', ['address', 'city', 'state', 'country', 'postal_code', 'organization', 'website']],
  ['Texto', ['text', 'textarea']],
  ['Escolhas', ['select', 'multiselect', 'checkbox', 'radio']],
  ['Avaliação', ['rating']],
  ['Personalizados', ['heading', 'terms', 'source']],
  ['Outros', ['date', 'number', 'monetary']]
];

let counter = 0;
const newId = () => `f${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function newField(type, extra = {}) {
  const kind = fieldKinds[type] || fieldKinds.text;
  const field = { id: newId(), type: fieldKinds[type] ? type : 'text', label: kind.label, placeholder: kind.placeholder || '', key: kind.key || '', required: false, hidden: false, width: 100, options: [], help: '', text: '', value: '' };
  if (kind.choices) field.options = ['Opção 1', 'Opção 2', 'Opção 3'];
  if (type === 'email') field.required = true;
  if (type === 'heading') { field.label = 'Fale com a gente'; field.text = 'Preencha os campos e retornamos em até 1 dia útil.'; }
  if (type === 'terms') { field.required = true; field.label = 'Consentimento'; field.text = 'Concordo em receber contatos sobre este assunto e aceito a política de privacidade.'; }
  if (type === 'source') { field.hidden = true; field.value = 'Formulário'; }
  if (type === 'rating') field.label = 'Como você avalia?';
  return { ...field, ...extra };
}

// The fields of a form saved before the builder existed: name, email and, optionally, phone.
export function formFields(form) {
  if (Array.isArray(form?.fields) && form.fields.length) return form.fields;
  return [
    { ...newField('name'), id: 'legacy-name', required: true },
    { ...newField('email'), id: 'legacy-email' },
    ...(form?.askPhone ? [{ ...newField('phone'), id: 'legacy-phone' }] : [])
  ];
}

// Validates the fields coming from the builder. Throws a message in Portuguese.
export function validFields(input, customFields = []) {
  if (!Array.isArray(input) || !input.length) fail('Adicione pelo menos um campo ao formulário.');
  if (input.length > 60) fail('Um formulário aceita até 60 campos.');
  const keys = new Set(), ids = new Set();
  const fields = input.map(raw => {
    const type = fieldKinds[raw?.type] ? raw.type : fail('Tipo de campo desconhecido.');
    const kind = fieldKinds[type];
    let id = /^[a-z0-9-]{1,40}$/i.test(raw.id || '') ? raw.id : newId();
    while (ids.has(id)) id = newId();
    ids.add(id);
    const field = { id, type, label: clean(raw.label, 200) || kind.label, placeholder: clean(raw.placeholder, 120), key: '',
      required: Boolean(raw.required), hidden: Boolean(raw.hidden), width: Number(raw.width) === 50 ? 50 : 100,
      options: [], help: clean(raw.help, 300), text: String(raw.text ?? '').trim().slice(0, 2000), value: clean(raw.value, 200) };
    if (type === 'custom') {
      const custom = customFields.find(item => item.id === raw.customId && item.object === 'Contact');
      if (!custom) fail(`O campo do contato “${field.label}” não existe mais.`);
      field.customId = custom.id;
      if (custom.type === 'Dropdown (single)') field.options = custom.options.slice(0, 50);
    }
    if (kind.choices) {
      field.options = [...new Set((Array.isArray(raw.options) ? raw.options : String(raw.options || '').split('\n')).map(option => clean(option, 120)).filter(Boolean))].slice(0, 50);
      if (!field.options.length) fail(`Adicione opções ao campo “${field.label}”.`);
    }
    if (kind.input === 'static') { field.required = false; field.hidden = false; }
    if (kind.input === 'hidden') { field.hidden = true; field.required = false; }
    if (field.hidden && kind.input !== 'hidden') field.required = false;
    if (kind.input !== 'static') {
      let key = kind.key || slugKey(raw.key) || slugKey(field.label) || 'campo';
      if (!kind.key) for (let n = 2; keys.has(key); n++) key = `${slugKey(raw.key) || slugKey(field.label) || 'campo'}_${n}`;
      if (keys.has(key)) fail(`O campo “${field.label}” aparece duas vezes. Use apenas um.`);
      keys.add(key);
      field.key = key;
    }
    return field;
  });
  if (!fields.some(field => ['email', 'phone'].includes(field.type) && !field.hidden)) fail('Inclua um campo de e-mail ou de telefone: é com ele que o contato é criado.');
  return fields;
}

const customInput = (field, customFields) => {
  const custom = customFields.find(item => item.id === field.customId);
  return { 'Multi line': 'textarea', Number: 'number', Monetary: 'money', Date: 'date', Checkbox: 'consent', Email: 'email', Phone: 'tel', 'Dropdown (single)': 'select' }[custom?.type] || 'text';
};
export const inputOf = (field, customFields = []) => field.type === 'custom' ? customInput(field, customFields) : fieldKinds[field.type]?.input || 'text';

const empty = value => value === undefined || value === null || (Array.isArray(value) ? !value.length : String(value).trim() === '');

// Reads a visitor's answers. Returns the contact data, custom contact values and the answers to keep.
export function readAnswers(form, input, customFields = []) {
  const fields = formFields(form), errors = {}, values = {}, answers = [], contact = {}, custom = {};
  const strict = Array.isArray(form?.fields) && form.fields.length > 0; // forms made before the builder accepted any phone
  for (const field of fields) {
    const type = inputOf(field, customFields);
    if (type === 'static') continue;
    let raw = input?.[field.key];
    if (type === 'hidden') raw = empty(raw) ? field.value : raw;
    const many = ['multi', 'checkbox'].includes(type);
    let value = many ? (Array.isArray(raw) ? raw : empty(raw) ? [] : [raw]).map(item => clean(item, 120)).filter(Boolean) : clean(Array.isArray(raw) ? raw[0] : raw, type === 'textarea' ? 5000 : 500);
    if (type === 'textarea' && !Array.isArray(raw)) value = String(raw ?? '').trim().slice(0, 5000);
    values[field.key] = value;
    if (empty(value) || (type === 'consent' && value !== 'on' && value !== 'true')) {
      if (field.required && !field.hidden) errors[field.key] = type === 'consent' ? 'Marque para continuar.' : 'Preencha este campo.';
      continue;
    }
    let shown = Array.isArray(value) ? value.join(', ') : value;
    if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors[field.key] = 'Use um e-mail válido.';
    else if (type === 'tel' && strict && !/^[+()\d\s.-]{8,24}$/.test(value)) errors[field.key] = 'Use um telefone válido.';
    else if (type === 'url' && !/^(https?:\/\/)?[^\s.]+\.[^\s]{2,}$/i.test(value)) errors[field.key] = 'Use um endereço válido.';
    else if (type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))) errors[field.key] = 'Use uma data válida.';
    else if ((type === 'number' || type === 'money') && !Number.isFinite(Number(String(value).replace(',', '.')))) errors[field.key] = 'Use um número.';
    else if (type === 'rating' && !['1', '2', '3', '4', '5'].includes(value)) errors[field.key] = 'Escolha de 1 a 5.';
    else if (['select', 'radio'].includes(type) && !field.options.includes(value)) errors[field.key] = 'Escolha uma das opções.';
    else if (many && value.some(item => !field.options.includes(item))) errors[field.key] = 'Escolha entre as opções.';
    if (errors[field.key]) continue;
    if (type === 'consent') shown = 'Sim';
    if (type === 'money') shown = Number(String(value).replace(',', '.')).toFixed(2);
    if (type === 'rating') shown = `${value} / 5`;
    const map = fieldKinds[field.type]?.map;
    if (map) contact[map] = type === 'email' ? value.toLowerCase() : value;
    if (field.type === 'custom') custom[field.customId] = type === 'consent' ? true : type === 'money' || type === 'number' ? Number(String(value).replace(',', '.')) : value;
    answers.push({ key: field.key, label: field.label, value: shown });
  }
  const name = contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(' ');
  if (!Object.keys(errors).length && !contact.email && !contact.phone) errors._form = 'Informe um e-mail ou telefone.';
  return { ok: !Object.keys(errors).length, errors, values, answers: answers.slice(0, 60),
    contact: { name: name || contact.email || contact.phone || '', email: contact.email || '', phone: contact.phone || '', company: contact.company || '' }, custom };
}

export function formOpen(form, at = new Date()) {
  const start = form.schedule?.start ? Date.parse(form.schedule.start) : NaN, end = form.schedule?.end ? Date.parse(form.schedule.end) : NaN;
  return !(at.getTime() < start) && !(at.getTime() > end);
}

/* ───────── HTML ───────── */

export function fieldMarkup(field, { values = {}, errors = {}, customFields = [], disabled = false } = {}) {
  const type = inputOf(field, customFields);
  const value = disabled && type === 'hidden' ? field.value : values[field.key];
  const off = disabled ? ' disabled tabindex="-1"' : '';
  const req = field.required && !disabled ? ' required' : '';
  const id = `sf-${esc(field.id)}`;
  const describe = errors[field.key] ? ` aria-invalid="true" aria-describedby="${id}-error"` : '';
  const hint = field.help ? `<small class="sf-help">${esc(field.help)}</small>` : '';
  const error = errors[field.key] ? `<small class="sf-error" id="${id}-error">${esc(errors[field.key])}</small>` : '';
  const label = `<span class="sf-label">${esc(field.label)}${field.required ? ' <i aria-hidden="true">*</i>' : ''}</span>`;
  const attrs = `id="${id}" name="${esc(field.key)}"${req}${off}${describe}`;
  const auto = fieldKinds[field.type]?.auto ? ` autocomplete="${fieldKinds[field.type].auto}"` : '';
  const ph = field.placeholder ? ` placeholder="${esc(field.placeholder)}"` : '';
  const cls = `sf-field sf-${type}${field.width === 50 ? ' sf-half' : ''}${field.hidden ? ' sf-is-hidden' : ''}`;
  if (type === 'static') return `<div class="${cls}" data-field="${esc(field.id)}">${field.label ? `<h3 class="sf-heading">${esc(field.label)}</h3>` : ''}${field.text ? `<p class="sf-text">${esc(field.text)}</p>` : ''}</div>`;
  if (!disabled && (type === 'hidden' || field.hidden)) return `<input type="hidden" name="${esc(field.key)}" value="${esc(empty(value) ? field.value : value)}">`;
  let control;
  if (type === 'textarea') control = `<textarea ${attrs} rows="4" maxlength="5000"${ph}>${esc(value)}</textarea>`;
  else if (type === 'select') control = `<select ${attrs}><option value="">${esc(field.placeholder || 'Selecione')}</option>${field.options.map(option => `<option${option === value ? ' selected' : ''}>${esc(option)}</option>`).join('')}</select>`;
  else if (type === 'multi') control = `<select ${attrs} multiple size="${Math.min(5, field.options.length)}">${field.options.map(option => `<option${(value || []).includes?.(option) ? ' selected' : ''}>${esc(option)}</option>`).join('')}</select>`;
  else if (type === 'checkbox' || type === 'radio') {
    const kind = type === 'radio' ? 'radio' : 'checkbox';
    return `<fieldset class="${cls}" data-field="${esc(field.id)}"${describe}><legend class="sf-label">${esc(field.label)}${field.required ? ' <i aria-hidden="true">*</i>' : ''}</legend>
      <div class="sf-options">${field.options.map((option, index) => `<label class="sf-option"><input type="${kind}" name="${esc(field.key)}" value="${esc(option)}"${kind === 'radio' && field.required && index === 0 && !disabled ? ' required' : ''}${(Array.isArray(value) ? value.includes(option) : value === option) ? ' checked' : ''}${off}> <span>${esc(option)}</span></label>`).join('')}</div>${hint}${error}</fieldset>`;
  }
  else if (type === 'rating') {
    return `<fieldset class="${cls}" data-field="${esc(field.id)}"${describe}><legend class="sf-label">${esc(field.label)}${field.required ? ' <i aria-hidden="true">*</i>' : ''}</legend>
      <div class="sf-stars">${[5, 4, 3, 2, 1].map(n => `<input type="radio" id="${id}-${n}" name="${esc(field.key)}" value="${n}"${String(value) === String(n) ? ' checked' : ''}${field.required && n === 5 && !disabled ? ' required' : ''}${off}><label for="${id}-${n}" title="${n} de 5"><span class="sf-sr">${n} de 5</span>★</label>`).join('')}</div>${hint}${error}</fieldset>`;
  }
  else if (type === 'consent') return `<div class="${cls}" data-field="${esc(field.id)}"><label class="sf-option sf-consent"><input type="checkbox" ${attrs} value="on"${value === 'on' ? ' checked' : ''}> <span>${esc(field.text || field.label)}${field.required ? ' <i aria-hidden="true">*</i>' : ''}</span></label>${hint}${error}</div>`;
  else {
    const html = { email: 'email', tel: 'tel', url: 'url', date: 'date', number: 'number', money: 'number' }[type] || 'text';
    const extra = type === 'money' ? ' step="0.01" min="0" inputmode="decimal"' : type === 'number' ? ' step="any"' : type === 'url' ? ' inputmode="url"' : '';
    control = `${type === 'money' ? '<span class="sf-prefix">R$</span>' : ''}<input type="${html}" ${attrs}${auto}${ph}${extra} maxlength="500" value="${esc(value)}">`;
  }
  return `<label class="${cls}" data-field="${esc(field.id)}">${label}<span class="sf-control">${control}</span>${hint}${error}</label>`;
}

export function formMarkup(form, { action = '', values = {}, errors = {}, customFields = [], target = '' } = {}) {
  const fields = formFields(form);
  return `<form class="sf" method="post" action="${esc(action)}"${target ? ` target="${esc(target)}"` : ''} novalidate>
    ${errors._form ? `<p class="sf-alert" role="alert">${esc(errors._form)}</p>` : Object.keys(errors).length ? '<p class="sf-alert" role="alert">Confira os campos destacados.</p>' : ''}
    <div class="sf-grid">${fields.map(field => fieldMarkup(field, { values, errors, customFields })).join('')}</div>
    <button class="sf-submit" type="submit">${esc(form.button || 'Enviar')}</button></form>`;
}

export const formCss = `
.sf{--sf-accent:#155eef;display:grid;gap:18px;font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#101828}
.sf-grid{display:flex;flex-wrap:wrap;gap:16px 14px}
.sf-field{flex:1 1 100%;display:grid;gap:6px;min-width:0;margin:0;padding:0;border:0}
.sf-half{flex:1 1 calc(50% - 7px)}
@media (max-width:520px){.sf-half{flex-basis:100%}}
.sf-label{font-weight:600;font-size:14px;padding:0}.sf-label i{color:#d92d20;font-style:normal}
.sf-control{display:flex;align-items:center;gap:6px}
.sf input:not([type=radio]):not([type=checkbox]),.sf select,.sf textarea{width:100%;box-sizing:border-box;min-height:44px;padding:10px 12px;border:1px solid #d0d5dd;border-radius:10px;background:#fff;color:inherit;font:inherit}
.sf textarea{resize:vertical}.sf select[multiple]{min-height:auto}
.sf input:focus-visible,.sf select:focus-visible,.sf textarea:focus-visible{outline:2px solid var(--sf-accent);outline-offset:1px;border-color:var(--sf-accent)}
.sf [aria-invalid=true] input,.sf input[aria-invalid=true],.sf select[aria-invalid=true],.sf textarea[aria-invalid=true]{border-color:#d92d20}
.sf-prefix{color:#667085;font-weight:600}
.sf-options{display:grid;gap:8px}.sf-option{display:flex;align-items:flex-start;gap:8px;font-weight:400;cursor:pointer}
.sf-option input{width:18px;height:18px;margin:2px 0 0;accent-color:var(--sf-accent);flex:none}
.sf-stars{display:inline-flex;flex-direction:row-reverse;justify-content:flex-end;gap:2px}
.sf-stars input{position:absolute;opacity:0;width:1px;height:1px}
.sf-stars label{display:inline-block;flex:none;width:auto;margin:0;font-size:30px;line-height:1;color:#d0d5dd;cursor:pointer;padding:2px}
.sf-stars input:checked~label,.sf-stars label:hover,.sf-stars label:hover~label{color:#f5b301}
.sf-stars input:focus-visible+label{outline:2px solid var(--sf-accent);border-radius:6px}
.sf-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.sf-heading{margin:0;font-size:20px;line-height:1.3}.sf-text{margin:0;color:#475467}
.sf-help{color:#667085;font-size:13px}.sf-error{color:#b42318;font-size:13px;font-weight:600}
.sf-alert{margin:0;padding:10px 12px;border-radius:10px;background:#fef3f2;color:#b42318;font-weight:600}
.sf-submit{min-height:46px;padding:10px 22px;border:0;border-radius:10px;background:var(--sf-accent);color:#fff;font:inherit;font-weight:700;cursor:pointer;justify-self:start}
.sf-submit:hover{filter:brightness(1.08)}.sf-submit:focus-visible{outline:2px solid var(--sf-accent);outline-offset:3px}
`;

// The standalone public page of a form (also used inside an iframe when embedded).
export function formPage(form, { action, values, errors, customFields, embed = false, brand = '', notice = '', accent = '#155eef', target = '' } = {}) {
  const color = /^#[0-9a-f]{6}$/i.test(form.accent || '') ? form.accent : accent;
  const body = notice
    ? `<div class="sf-done" role="status"><span aria-hidden="true">✓</span><h1>${esc(notice.title || 'Obrigado!')}</h1>${notice.text ? `<p>${esc(notice.text)}</p>` : ''}</div>`
    : `${form.showTitle !== false && form.name ? `<header class="sf-head"><h1>${esc(form.name)}</h1>${form.description ? `<p>${esc(form.description)}</p>` : ''}</header>` : ''}${formMarkup(form, { action, values, errors, customFields, target })}`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(form.name || 'Formulário')}${brand ? ` · ${esc(brand)}` : ''}</title><meta name="robots" content="noindex">
<style>${formCss}
html{background:${embed ? 'transparent' : '#f2f4f7'}}body{margin:0;padding:${embed ? '4px' : '40px 16px'}}
.sf-card{max-width:620px;margin:0 auto;${embed ? '' : 'padding:32px;border-radius:18px;background:#fff;box-shadow:0 1px 3px rgba(16,24,40,.1),0 1px 2px rgba(16,24,40,.06);'}font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#101828}
.sf{--sf-accent:${color}}.sf-head{margin-bottom:22px}.sf-head h1{margin:0;font-size:24px;line-height:1.25}.sf-head p{margin:6px 0 0;color:#475467}
.sf-done{display:grid;justify-items:center;gap:8px;text-align:center;padding:24px 0}.sf-done span{display:grid;place-items:center;width:52px;height:52px;border-radius:50%;background:${color};color:#fff;font-size:26px}
.sf-done h1{margin:4px 0 0;font-size:22px}.sf-done p{margin:0;color:#475467;max-width:46ch}
.sf-brand{margin:18px auto 0;max-width:620px;text-align:center;color:#98a2b3;font-size:12px}
</style></head><body><main class="sf-card">${body}</main>${embed || !brand ? '' : `<p class="sf-brand">${esc(brand)}</p>`}
${embed ? `<script>(()=>{const send=()=>parent.postMessage({sociForm:${JSON.stringify(String(form.id || ''))},height:document.documentElement.scrollHeight},'*');addEventListener('load',send);new ResizeObserver(send).observe(document.body)})()</script>` : ''}</body></html>`;
}

/* ───────── Modelos ───────── */

const field = (type, extra) => newField(type, extra);
export const formTemplates = [
  { id: 'contato', name: 'Contato', description: 'Nome, e-mail, telefone e mensagem.', build: () => [field('name', { required: true }), field('email', { width: 50 }), field('phone', { width: 50 }), field('textarea', { label: 'Mensagem', key: 'mensagem', required: true })] },
  { id: 'orcamento', name: 'Pedido de orçamento', description: 'Qualifica o lead com serviço, prazo e verba.', build: () => [field('name', { required: true, width: 50 }), field('organization', { width: 50 }), field('email', { width: 50 }), field('phone', { width: 50, required: true }),
    field('select', { label: 'Qual serviço você procura?', key: 'servico', required: true, options: ['Site', 'Identidade visual', 'Tráfego pago', 'Outro'] }), field('monetary', { label: 'Verba estimada', key: 'verba', width: 50 }), field('date', { label: 'Para quando?', key: 'prazo', width: 50 }), field('textarea', { label: 'Conte sobre o projeto', key: 'projeto' }), field('source', { value: 'Orçamento' })] },
  { id: 'consultoria', name: 'Agendar consultoria', description: 'Data, período preferido e consentimento.', build: () => [field('heading', { label: 'Agende uma conversa', text: 'Escolha o melhor dia e retornamos para confirmar o horário.' }), field('first_name', { required: true, width: 50 }), field('last_name', { width: 50 }), field('email'), field('phone'),
    field('date', { label: 'Melhor data', key: 'melhor_data', required: true, width: 50 }), field('radio', { label: 'Período', key: 'periodo', required: true, width: 50, options: ['Manhã', 'Tarde', 'Noite'] }), field('terms')] },
  { id: 'satisfacao', name: 'Pesquisa de satisfação', description: 'Nota de 1 a 5, recomendação e comentário.', build: () => [field('name', { required: true }), field('email'), field('rating', { label: 'Como você avalia nosso atendimento?', key: 'nota', required: true }),
    field('radio', { label: 'Você nos recomendaria?', key: 'recomendaria', options: ['Sim', 'Talvez', 'Não'] }), field('checkbox', { label: 'O que mais gostou?', key: 'destaques', options: ['Atendimento', 'Prazo', 'Qualidade', 'Preço'] }), field('textarea', { label: 'Comentários', key: 'comentarios' })] },
  { id: 'newsletter', name: 'Newsletter', description: 'Nome, e-mail e consentimento.', build: () => [field('first_name', { required: true }), field('email'), field('terms', { text: 'Quero receber novidades por e-mail. Posso cancelar quando quiser.' })] }
];
