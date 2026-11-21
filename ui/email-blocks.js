// E-mail builder blocks, shared by the browser (editor preview) and the server (validation and sending).
// A design is { blocks, style }. renderEmail turns it into table-based HTML with inline styles, which is
// what mail clients render reliably, plus a plain-text version. Text blocks take a tiny markup:
// **negrito**, *itálico*, [texto](https://link) and line breaks. Merge fields use the workflow syntax
// ({{contact.first_name}}) and are filled after escaping, so a contact's data never becomes HTML.

export const BLOCK_TYPES = [
  ['heading', 'Título', 'type'], ['text', 'Texto', 'menu'], ['button', 'Botão', 'arrow'],
  ['image', 'Imagem', 'image'], ['countdown', 'Contador', 'clock'], ['divider', 'Divisor', 'minus'], ['spacer', 'Espaçador', 'move']
];
export const FONTS = [['Arial, Helvetica, sans-serif', 'Arial'], ['Georgia, serif', 'Georgia'], ['Verdana, Geneva, sans-serif', 'Verdana'], ["'Trebuchet MS', sans-serif", 'Trebuchet']];
export const MERGE_FIELDS = [['{{contact.first_name}}', 'Primeiro nome'], ['{{contact.name}}', 'Nome completo'], ['{{contact.email}}', 'E-mail'], ['{{contact.company}}', 'Empresa'], ['{{workspace.name}}', 'Nome da empresa']];
export const MAX_BLOCKS = 60;

const DEFAULT_STYLE = { background: '#f4f4f5', card: '#ffffff', text: '#1f2937', accent: '#d6246e', font: FONTS[0][0] };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clip = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || '') ? value.toLowerCase() : fallback;
const pick = (value, list, fallback) => list.includes(value) ? value : fallback;
const range = (value, min, max, fallback) => Number.isFinite(Number(value)) && value !== '' ? Math.min(max, Math.max(min, Math.round(Number(value)))) : fallback;

/** http(s) for links (mailto/tel too); images must be https so mail clients load them. */
export function safeUrl(value, { image = false } = {}) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (!image && /^(mailto|tel):[^\s<>"']{3,200}$/i.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (image ? url.protocol !== 'https:' : !['https:', 'http:'].includes(url.protocol)) return '';
    return url.href.length <= 2000 ? url.href : '';
  } catch { return ''; }
}

export const newBlock = type => ({
  heading: { type, text: 'Um título para chamar atenção', level: 1, align: 'left' },
  text: { type, text: 'Olá, {{contact.first_name}}!\n\nEscreva aqui a sua mensagem. Use **negrito**, *itálico* e [links](https://exemplo.com.br).', align: 'left' },
  button: { type, label: 'Saiba mais', url: '', color: '', align: 'center' },
  image: { type, src: '', alt: '', url: '', width: 100, align: 'center' },
  countdown: { type, timerId: '', align: 'center' },
  divider: { type },
  spacer: { type, height: 24 }
})[type];

export const starterDesign = () => ({
  style: { ...DEFAULT_STYLE },
  blocks: [newBlock('heading'), newBlock('text'), newBlock('button')]
});

/** Cleans a design coming from the browser: unknown blocks dropped, strings clipped, colors and URLs checked. */
export function normalizeDesign(d = {}) {
  const s = d.style && typeof d.style === 'object' ? d.style : {};
  const style = { background: color(s.background, DEFAULT_STYLE.background), card: color(s.card, DEFAULT_STYLE.card), text: color(s.text, DEFAULT_STYLE.text),
    accent: color(s.accent, DEFAULT_STYLE.accent), font: pick(s.font, FONTS.map(([v]) => v), DEFAULT_STYLE.font) };
  const blocks = [];
  for (const b of Array.isArray(d.blocks) ? d.blocks.slice(0, MAX_BLOCKS) : []) {
    const align = pick(b?.align, ['left', 'center', 'right'], 'left');
    if (b?.type === 'heading') blocks.push({ type: 'heading', text: clip(b.text, 300), level: b.level === 2 ? 2 : 1, align });
    else if (b?.type === 'text') blocks.push({ type: 'text', text: clip(b.text, 8000), align });
    else if (b?.type === 'button') blocks.push({ type: 'button', label: clip(b.label, 80), url: safeUrl(b.url), color: color(b.color, ''), align: pick(b.align, ['left', 'center', 'right'], 'center') });
    else if (b?.type === 'image') blocks.push({ type: 'image', src: safeUrl(b.src, { image: true }), alt: clip(b.alt, 200), url: safeUrl(b.url), width: range(b.width, 20, 100, 100), align: pick(b.align, ['left', 'center', 'right'], 'center') });
    else if (b?.type === 'countdown') blocks.push({ type: 'countdown', timerId: /^[0-9a-f-]{36}$/.test(b.timerId || '') ? b.timerId : '', align: pick(b.align, ['left', 'center', 'right'], 'center') });
    else if (b?.type === 'divider') blocks.push({ type: 'divider' });
    else if (b?.type === 'spacer') blocks.push({ type: 'spacer', height: range(b.height, 8, 80, 24) });
  }
  return { style, blocks };
}

const LINK = /\[([^\]\n]{1,200})\]\(([^)\s]{1,2000})\)/g;

/** Every trackable link, in the order renderEmail numbers them (text links, buttons, linked images). */
export function collectLinks(blocks = []) {
  const links = [];
  for (const b of blocks) {
    if (b.type === 'text') for (const [, , url] of String(b.text || '').matchAll(LINK)) { if (safeUrl(url)) links.push(safeUrl(url)); }
    if (b.type === 'button' && b.url && b.label) links.push(b.url);
    if (b.type === 'image' && b.src && b.url) links.push(b.url);
  }
  return links;
}

/** Values for the merge fields of one contact. */
export function mergeValues(contact = {}, profile = {}) {
  const name = String(contact.name || '').trim();
  return { 'contact.first_name': name.split(/\s+/)[0] || '', 'contact.name': name, 'contact.email': contact.email || '', 'contact.phone': contact.phone || '',
    'contact.company': contact.company || '', 'workspace.name': profile.name || '' };
}
/** Fills {{...}} in plain text (subjects); unknown fields are left as typed when keep is true (preview). */
export const fillText = (text, values, keep = false) => String(text || '').replace(/\{\{\s*([a-z_.]+)\s*\}\}/g, (m, key) => Object.hasOwn(values, key) ? values[key] : keep ? m : '');
const fillHtml = (html, values, keep) => html.replace(/\{\{\s*([a-z_.]+)\s*\}\}/g, (m, key) => Object.hasOwn(values, key) ? esc(values[key]) : keep ? m : '');

/**
 * { html, text } for one recipient.
 * link(url, index) → the href to use (the click-tracking URL when sending); pixel and unsubscribe are URLs or ''.
 */
export function renderEmail({ blocks = [], style: rawStyle = {}, preheader = '', business = '', values = {}, link = url => url, pixel = '', unsubscribe = '', keepUnknown = false, countdownSrc = null } = {}) {
  const style = { ...DEFAULT_STYLE, ...rawStyle };
  let index = 0;
  const href = url => esc(link(url, index++));
  const texts = [];
  const markup = text => {
    let html = esc(text);
    html = html.replace(/\[([^\]\n]{1,200})\]\(([^)\s]{1,2000})\)/g, (m, label, url) => {
      const safe = safeUrl(url.replace(/&amp;/g, '&'));
      return safe ? `<a href="${href(safe)}" style="color:${style.accent};text-decoration:underline">${label}</a>` : label;
    });
    html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    return html.split(/\n{2,}/).map(p => `<p style="margin:0 0 14px">${p.replace(/\n/g, '<br>')}</p>`).join('');
  };
  const plain = text => String(text || '').replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/\*([^*\n]+)\*/g, '$1').replace(LINK, '$1 ($2)');
  const rows = blocks.map(b => {
    const pad = 'padding:0 32px';
    if (b.type === 'heading') {
      texts.push(fillText(b.text, values, keepUnknown).toUpperCase());
      const size = b.level === 2 ? 20 : 26;
      return `<tr><td style="${pad};text-align:${b.align}"><h${b.level} style="margin:0 0 12px;font-size:${size}px;line-height:1.25;font-weight:700;color:${style.text}">${esc(b.text)}</h${b.level}></td></tr>`;
    }
    if (b.type === 'text') { texts.push(fillText(plain(b.text), values, keepUnknown)); return `<tr><td style="${pad};text-align:${b.align};font-size:16px;line-height:1.6;color:${style.text}">${markup(b.text)}</td></tr>`; }
    if (b.type === 'button') {
      // Without a link the button is left out of the e-mail, but the editor preview (keepUnknown) still shows it.
      if (!b.label || (!b.url && !keepUnknown)) return '';
      if (b.url) texts.push(`${fillText(b.label, values, keepUnknown)}: ${b.url}`);
      const bg = b.color || style.accent;
      return `<tr><td style="${pad} 0;padding-bottom:14px;text-align:${b.align}"><a href="${b.url ? href(b.url) : '#'}" style="display:inline-block;background:${bg};color:#ffffff;font-weight:700;font-size:16px;line-height:1;text-decoration:none;padding:14px 26px;border-radius:8px">${esc(b.label)}</a></td></tr>`;
    }
    if (b.type === 'image') {
      if (!b.src) return '';
      const img = `<img src="${esc(b.src)}" alt="${esc(b.alt)}" width="${Math.round(536 * b.width / 100)}" style="display:inline-block;width:${b.width}%;max-width:100%;height:auto;border:0;border-radius:6px">`;
      if (b.alt) texts.push(`[${b.alt}]`);
      return `<tr><td style="${pad};padding-bottom:14px;text-align:${b.align}">${b.url ? `<a href="${href(b.url)}">${img}</a>` : img}</td></tr>`;
    }
    if (b.type === 'countdown') {
      // The animated GIF of a timer from Marketing → Contadores; countdownSrc builds its absolute URL.
      const src = b.timerId && countdownSrc ? countdownSrc(b.timerId) : '';
      if (!src) return keepUnknown ? `<tr><td style="${pad};padding-bottom:14px;text-align:center;color:#71717a;font-size:13px">[Escolha o contador deste bloco]</td></tr>` : '';
      return `<tr><td style="${pad};padding-bottom:14px;text-align:${b.align}"><img src="${esc(src)}" alt="Contagem regressiva" width="400" height="122" style="display:inline-block;width:400px;max-width:100%;height:auto;border:0"></td></tr>`;
    }
    if (b.type === 'divider') { texts.push('———'); return `<tr><td style="${pad};padding-bottom:14px"><hr style="border:0;border-top:1px solid #e4e4e7;margin:4px 0"></td></tr>`; }
    if (b.type === 'spacer') return `<tr><td style="height:${b.height}px;line-height:${b.height}px;font-size:0">&nbsp;</td></tr>`;
    return '';
  }).join('');
  const who = esc(business || 'esta empresa');
  const foot = `<p style="margin:0">Você recebeu este e-mail porque está na lista de contatos de ${who}.</p>${unsubscribe ? `<p style="margin:6px 0 0"><a href="${esc(unsubscribe)}" style="color:#71717a;text-decoration:underline">Cancelar inscrição</a></p>` : ''}`;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title></title></head>
<body style="margin:0;padding:0;background:${style.background}">${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${style.background};font-family:${esc(style.font)}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${style.card};border-radius:12px">
<tr><td style="height:32px;line-height:32px;font-size:0">&nbsp;</td></tr>${rows}<tr><td style="height:18px;line-height:18px;font-size:0">&nbsp;</td></tr></table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px"><tr><td style="padding:16px 32px;text-align:center;font-size:12px;line-height:1.5;color:#71717a">${foot}</td></tr></table>
</td></tr></table>${pixel ? `<img src="${esc(pixel)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">` : ''}</body></html>`;
  const text = `${texts.filter(Boolean).join('\n\n')}\n\n—\nVocê recebeu este e-mail porque está na lista de contatos de ${business || 'esta empresa'}.${unsubscribe ? `\nCancelar inscrição: ${unsubscribe}` : ''}`;
  return { html: fillHtml(html, values, keepUnknown), text };
}
