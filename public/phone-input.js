// phone-input: Campo de telefone internacional inteligente com detecção de país, DDI e formatação de DDD.
import { tr, getLanguage } from './i18n.js';

export const COUNTRIES = [
  { iso: 'BR', name: 'Brasil', dial: '+55', flag: '🇧🇷', placeholder: '(00) 00000-0000' },
  { iso: 'MX', name: 'México', dial: '+52', flag: '🇲🇽', placeholder: '(00) 0000-0000' },
  { iso: 'AR', name: 'Argentina', dial: '+54', flag: '🇦🇷', placeholder: '(00) 0000-0000' },
  { iso: 'CO', name: 'Colômbia', dial: '+57', flag: '🇨🇴', placeholder: '000 000 0000' },
  { iso: 'CL', name: 'Chile', dial: '+56', flag: '🇨🇱', placeholder: '0 0000 0000' },
  { iso: 'PE', name: 'Peru', dial: '+51', flag: '🇵🇪', placeholder: '000 000 000' },
  { iso: 'US', name: 'Estados Unidos', dial: '+1', flag: '🇺🇸', placeholder: '(000) 000-0000' },
  { iso: 'ES', name: 'Espanha', dial: '+34', flag: '🇪🇸', placeholder: '000 00 00 00' },
  { iso: 'PT', name: 'Portugal', dial: '+351', flag: '🇵🇹', placeholder: '000 000 000' },
  { iso: 'UY', name: 'Uruguai', dial: '+598', flag: '🇺🇾', placeholder: '0 000 0000' },
  { iso: 'PY', name: 'Paraguai', dial: '+595', flag: '🇵🇾', placeholder: '(000) 000-000' },
  { iso: 'BO', name: 'Bolívia', dial: '+591', flag: '🇧🇴', placeholder: '0000 0000' },
  { iso: 'EC', name: 'Equador', dial: '+593', flag: '🇪🇨', placeholder: '00 000 0000' },
  { iso: 'VE', name: 'Venezuela', dial: '+58', flag: '🇻🇪', placeholder: '(000) 000-0000' },
  { iso: 'PA', name: 'Panamá', dial: '+507', flag: '🇵🇦', placeholder: '0000-0000' },
  { iso: 'CR', name: 'Costa Rica', dial: '+506', flag: '🇨🇷', placeholder: '0000-0000' },
  { iso: 'DO', name: 'Rep. Dominicana', dial: '+1', flag: '🇩🇴', placeholder: '(000) 000-0000' },
  { iso: 'GT', name: 'Guatemala', dial: '+502', flag: '🇬🇹', placeholder: '0000 0000' },
  { iso: 'GB', name: 'Reino Unido', dial: '+44', flag: '🇬🇧', placeholder: '0000 000000' }
];

export function getCountry(isoOrDial) {
  if (!isoOrDial) return COUNTRIES[0];
  const q = String(isoOrDial).trim().toUpperCase();
  return COUNTRIES.find(c => c.iso === q || c.dial === isoOrDial) || COUNTRIES[0];
}

export function formatLocalNumber(digits, iso = 'BR') {
  const d = String(digits || '').replace(/\D/g, '');
  if (!d) return '';

  if (iso === 'BR') {
    // DDD (2 dígitos: 11..99) + 8 dígitos (fixo) ou 9 dígitos (celular)
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
  }

  if (iso === 'MX' || iso === 'AR') {
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6, 10)}`;
  }

  if (iso === 'US' || iso === 'DO') {
    if (d.length <= 3) return `(${d}`;
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
  }

  if (iso === 'CO') {
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
    return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 10)}`;
  }

  if (iso === 'CL') {
    if (d.length <= 1) return d;
    if (d.length <= 5) return `${d.slice(0, 1)} ${d.slice(1)}`;
    return `${d.slice(0, 1)} ${d.slice(1, 5)} ${d.slice(5, 9)}`;
  }

  if (iso === 'PT' || iso === 'PE') {
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
    return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)}`;
  }

  if (iso === 'ES') {
    if (d.length <= 3) return d;
    if (d.length <= 5) return `${d.slice(0, 3)} ${d.slice(3)}`;
    if (d.length <= 7) return `${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5)}`;
    return `${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
  }

  if (d.length <= 4) return d;
  if (d.length <= 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 8)}-${d.slice(8, 12)}`;
}

export function parsePhone(raw, defaultIso = 'BR') {
  const str = String(raw || '').trim();
  if (!str) {
    const c = getCountry(defaultIso);
    return { country: c, localDigits: '', formattedLocal: '', fullValue: '' };
  }

  // 1. Número iniciado por '+'
  if (str.startsWith('+')) {
    const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
    for (const c of sorted) {
      if (str.startsWith(c.dial)) {
        const remaining = str.slice(c.dial.length).replace(/\D/g, '');
        return {
          country: c,
          localDigits: remaining,
          formattedLocal: formatLocalNumber(remaining, c.iso),
          fullValue: remaining ? `${c.dial} ${formatLocalNumber(remaining, c.iso)}` : ''
        };
      }
    }
  }

  // 2. Dígitos puros
  const allDigits = str.replace(/\D/g, '');

  // 2a. Começa com 55 e tem 12 ou 13 dígitos (DDI 55 + DDD 2 dígitos + número 8 ou 9 dígitos)
  if (allDigits.startsWith('55') && (allDigits.length === 12 || allDigits.length === 13)) {
    const c = getCountry('BR');
    const local = allDigits.slice(2);
    return {
      country: c,
      localDigits: local,
      formattedLocal: formatLocalNumber(local, 'BR'),
      fullValue: `${c.dial} ${formatLocalNumber(local, 'BR')}`
    };
  }

  // 2b. Outros DDI internacionais comuns
  const otherCountries = [...COUNTRIES].filter(c => c.dial !== '+55').sort((a, b) => b.dial.length - a.dial.length);
  for (const c of otherCountries) {
    const dialDigits = c.dial.replace(/\D/g, '');
    if (allDigits.startsWith(dialDigits) && allDigits.length >= dialDigits.length + 8) {
      const local = allDigits.slice(dialDigits.length);
      return {
        country: c,
        localDigits: local,
        formattedLocal: formatLocalNumber(local, c.iso),
        fullValue: `${c.dial} ${formatLocalNumber(local, c.iso)}`
      };
    }
  }

  // 2c. Número brasileiro com DDD e sem DDI (10 ou 11 dígitos, ex.: 31985869015)
  if (allDigits.length === 10 || allDigits.length === 11) {
    const ddd = Number.parseInt(allDigits.slice(0, 2), 10);
    if (ddd >= 11 && ddd <= 99) {
      const c = getCountry('BR');
      return {
        country: c,
        localDigits: allDigits,
        formattedLocal: formatLocalNumber(allDigits, 'BR'),
        fullValue: `${c.dial} ${formatLocalNumber(allDigits, 'BR')}`
      };
    }
  }

  // Fallback
  const c = getCountry(defaultIso);
  return {
    country: c,
    localDigits: allDigits,
    formattedLocal: formatLocalNumber(allDigits, c.iso),
    fullValue: allDigits ? `${c.dial} ${formatLocalNumber(allDigits, c.iso)}` : ''
  };
}

export function phoneField({
  name = 'phone',
  label = 'Telefone',
  value = '',
  id = '',
  required = false,
  placeholder = ''
} = {}) {
  const currentLang = typeof getLanguage === 'function' ? getLanguage() : 'pt';
  const defaultIso = currentLang === 'es' ? 'MX' : 'BR';
  const parsed = parsePhone(value, defaultIso);
  const country = parsed.country;
  const inputId = id || `phone-field-${name}-${Math.random().toString(36).slice(2, 7)}`;
  const ph = placeholder || country.placeholder;
  const translatedLabel = tr(label);

  const countryOptions = COUNTRIES.map(c => {
    const sel = c.iso === country.iso ? ' selected' : '';
    return `<option value="${c.dial}" data-iso="${c.iso}"${sel}>${c.flag} ${c.dial} (${tr(c.name)})</option>`;
  }).join('');

  return `<label class="field-phone" data-phone-field for="${inputId}">
    <span>${translatedLabel}</span>
    <div class="phone-combo" data-phone-combo>
      <div class="phone-country-wrap" data-phone-country-wrap>
        <select class="phone-country-select" data-phone-country aria-label="${tr('Código do país')}">
          ${countryOptions}
        </select>
        <div class="phone-country-display" data-phone-country-display aria-hidden="true">
          <span class="phone-flag" data-phone-flag>${country.flag}</span>
          <span class="phone-dial" data-phone-dial>${country.dial}</span>
          <span class="phone-arrow" aria-hidden="true">▾</span>
        </div>
      </div>
      <input type="tel" id="${inputId}" class="phone-number-input" data-phone-input value="${parsed.formattedLocal}" placeholder="${ph}" autocomplete="tel-national"${required ? ' required' : ''}>
      <input type="hidden" name="${name}" data-phone-hidden value="${parsed.fullValue}">
    </div>
  </label>`;
}

function updateComboState(combo, rawDigits = null) {
  if (!combo) return;
  const select = combo.querySelector('[data-phone-country]');
  const flagEl = combo.querySelector('[data-phone-flag]');
  const dialEl = combo.querySelector('[data-phone-dial]');
  const input = combo.querySelector('[data-phone-input]');
  const hidden = combo.querySelector('[data-phone-hidden]');
  if (!select || !input || !hidden) return;

  const opt = select.selectedOptions[0] || select.options[0];
  const iso = opt?.dataset?.iso || 'BR';
  const dial = opt?.value || '+55';
  const c = getCountry(iso);

  if (flagEl) flagEl.textContent = c.flag;
  if (dialEl) dialEl.textContent = dial;
  input.placeholder = c.placeholder;

  const digits = rawDigits !== null ? rawDigits : input.value.replace(/\D/g, '');
  const formatted = formatLocalNumber(digits, iso);
  input.value = formatted;
  hidden.value = digits ? `${dial} ${formatted}` : '';
}

function handleInputEvent(ev) {
  const input = ev.target;
  if (!input || !input.matches('[data-phone-input]')) return;
  const combo = input.closest('[data-phone-combo]');
  if (!combo) return;

  const select = combo.querySelector('[data-phone-country]');
  const opt = select?.selectedOptions[0];
  const iso = opt?.dataset?.iso || 'BR';

  const prevVal = input.value;
  const prevPos = input.selectionStart || prevVal.length;
  const digitsBeforeCursor = prevVal.slice(0, prevPos).replace(/\D/g, '').length;

  const digits = prevVal.replace(/\D/g, '');
  const formatted = formatLocalNumber(digits, iso);
  input.value = formatted;

  const hidden = combo.querySelector('[data-phone-hidden]');
  const dial = opt?.value || '+55';
  if (hidden) hidden.value = digits ? `${dial} ${formatted}` : '';

  // Restore cursor smoothly
  let newPos = formatted.length;
  let count = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) {
      count++;
      if (count === digitsBeforeCursor) {
        newPos = i + 1;
        break;
      }
    }
  }
  if (typeof input.setSelectionRange === 'function') {
    input.setSelectionRange(newPos, newPos);
  }
}

function handleChangeEvent(ev) {
  const select = ev.target;
  if (!select || !select.matches('[data-phone-country]')) return;
  const combo = select.closest('[data-phone-combo]');
  if (!combo) return;
  updateComboState(combo);
}

function handlePasteEvent(ev) {
  const input = ev.target;
  if (!input || !input.matches('[data-phone-input]')) return;
  const combo = input.closest('[data-phone-combo]');
  if (!combo) return;

  const clipboardData = ev.clipboardData || window.clipboardData;
  if (!clipboardData) return;
  const pastedText = clipboardData.getData('text');
  if (!pastedText) return;

  const parsed = parsePhone(pastedText);
  if (parsed.country && parsed.country.iso) {
    ev.preventDefault();
    const select = combo.querySelector('[data-phone-country]');
    if (select) {
      for (const opt of select.options) {
        if (opt.dataset.iso === parsed.country.iso) {
          opt.selected = true;
          break;
        }
      }
    }
    updateComboState(combo, parsed.localDigits);
  }
}

let listenersAttached = false;
export function setupPhoneListeners() {
  if (listenersAttached || typeof document === 'undefined') return;
  listenersAttached = true;
  document.addEventListener('input', handleInputEvent);
  document.addEventListener('change', handleChangeEvent);
  document.addEventListener('paste', handlePasteEvent);
}

// Auto-inicializar no ambiente do navegador
if (typeof document !== 'undefined') {
  setupPhoneListeners();
}
