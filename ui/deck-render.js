// SVG renderer for decks. One <svg viewBox="0 0 960 540"> per slide, the same markup for the editor stage,
// the slide rail, the slideshow, the public link and print/PDF (Google Slides renders slides as SVG too).
// Pure string output, no DOM access: also used on the server.
import { PAGE, resolveColor, resolveFont, runsText, themeOf, elementBounds } from './deck-model.js';
import { canonicalSymbolsSvg } from './presentation-data.js';

export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = v => +(+v || 0).toFixed(2);

// ---- Icons (the agency icon set, inlined so every SVG stands alone) ------------------------------
const ICON_BODIES = Object.fromEntries([...canonicalSymbolsSvg().matchAll(/<symbol id="([^"]+)" viewBox="0 0 48 48">([\s\S]*?)<\/symbol>/g)].map(m => [m[1], m[2]]));
export function iconInner(id, color, accent) {
  if (id === 'star') return `<path d="M24 4l5.9 12.6 13.8 1.7-10.2 9.5 2.7 13.6L24 34.6l-12.2 6.8 2.7-13.6L4.3 18.3l13.8-1.7z" fill="${esc(accent)}"/>`;
  return (ICON_BODIES[id] || ICON_BODIES['i-browser'] || '').replaceAll('currentColor', esc(color)).replaceAll('var(--orange,#f65b00)', esc(accent));
}

// ---- Shape geometry ------------------------------------------------------------------------------
function poly(points) { return `M${points.map(([x, y]) => `${n(x)} ${n(y)}`).join(' L')} Z`; }
function regular(count, w, h, start = -Math.PI / 2) {
  return poly(Array.from({ length: count }, (_, i) => { const a = start + (i * 2 * Math.PI) / count; return [w / 2 + (w / 2) * Math.cos(a), h / 2 + (h / 2) * Math.sin(a)]; }));
}
function roundRect(w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  return `M${n(r)} 0 H${n(w - r)} A${n(r)} ${n(r)} 0 0 1 ${n(w)} ${n(r)} V${n(h - r)} A${n(r)} ${n(r)} 0 0 1 ${n(w - r)} ${n(h)} H${n(r)} A${n(r)} ${n(r)} 0 0 1 0 ${n(h - r)} V${n(r)} A${n(r)} ${n(r)} 0 0 1 ${n(r)} 0 Z`;
}
export function shapePath(shape, w, h, radius) {
  const d = Math.min(w, h);
  switch (shape) {
    case 'roundRect': return roundRect(w, h, radius ?? d * 0.16);
    case 'ellipse': return `M0 ${n(h / 2)} A${n(w / 2)} ${n(h / 2)} 0 1 0 ${n(w)} ${n(h / 2)} A${n(w / 2)} ${n(h / 2)} 0 1 0 0 ${n(h / 2)} Z`;
    case 'triangle': return poly([[w / 2, 0], [w, h], [0, h]]);
    case 'rightTriangle': return poly([[0, 0], [w, h], [0, h]]);
    case 'diamond': return poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]);
    case 'parallelogram': return poly([[w * 0.25, 0], [w, 0], [w * 0.75, h], [0, h]]);
    case 'trapezoid': return poly([[w * 0.2, 0], [w * 0.8, 0], [w, h], [0, h]]);
    case 'pentagon': return regular(5, w, h);
    case 'hexagon': return poly([[w * 0.25, 0], [w * 0.75, 0], [w, h / 2], [w * 0.75, h], [w * 0.25, h], [0, h / 2]]);
    case 'octagon': { const o = d * 0.29; return poly([[o, 0], [w - o, 0], [w, o], [w, h - o], [w - o, h], [o, h], [0, h - o], [0, o]]); }
    case 'star5': return poly(Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? 0.4 : 1; return [w / 2 + (w / 2) * r * Math.cos(a), h / 2 + (h / 2) * r * Math.sin(a)]; }));
    case 'arrowRight': { const hx = w - Math.min(w * 0.5, h * 0.5); return poly([[0, h * 0.25], [hx, h * 0.25], [hx, 0], [w, h / 2], [hx, h], [hx, h * 0.75], [0, h * 0.75]]); }
    case 'arrowLeft': { const hx = Math.min(w * 0.5, h * 0.5); return poly([[w, h * 0.25], [hx, h * 0.25], [hx, 0], [0, h / 2], [hx, h], [hx, h * 0.75], [w, h * 0.75]]); }
    case 'arrowUp': { const hy = Math.min(h * 0.5, w * 0.5); return poly([[w * 0.25, h], [w * 0.25, hy], [0, hy], [w / 2, 0], [w, hy], [w * 0.75, hy], [w * 0.75, h]]); }
    case 'arrowDown': { const hy = h - Math.min(h * 0.5, w * 0.5); return poly([[w * 0.25, 0], [w * 0.25, hy], [0, hy], [w / 2, h], [w, hy], [w * 0.75, hy], [w * 0.75, 0]]); }
    case 'chevron': { const t = Math.min(w * 0.5, h * 0.5); return poly([[0, 0], [w - t, 0], [w, h / 2], [w - t, h], [0, h], [t, h / 2]]); }
    case 'homePlate': { const t = Math.min(w * 0.5, h * 0.5); return poly([[0, 0], [w - t, 0], [w, h / 2], [w - t, h], [0, h]]); }
    case 'plus': { const a = w * 0.33, b = h * 0.33; return poly([[a, 0], [w - a, 0], [w - a, b], [w, b], [w, h - b], [w - a, h - b], [w - a, h], [a, h], [a, h - b], [0, h - b], [0, b], [a, b]]); }
    case 'heart': return `M${n(w / 2)} ${n(h * 0.28)} C${n(w / 2)} ${n(-h * 0.05)} 0 ${n(-h * 0.02)} 0 ${n(h * 0.3)} C0 ${n(h * 0.58)} ${n(w * 0.32)} ${n(h * 0.76)} ${n(w / 2)} ${n(h)} C${n(w * 0.68)} ${n(h * 0.76)} ${n(w)} ${n(h * 0.58)} ${n(w)} ${n(h * 0.3)} C${n(w)} ${n(-h * 0.02)} ${n(w / 2)} ${n(-h * 0.05)} ${n(w / 2)} ${n(h * 0.28)} Z`;
    case 'speech': { const bh = h * 0.8, r = Math.min(d * 0.12, w / 4, bh / 4); return `M${n(r)} 0 H${n(w - r)} Q${n(w)} 0 ${n(w)} ${n(r)} V${n(bh - r)} Q${n(w)} ${n(bh)} ${n(w - r)} ${n(bh)} H${n(w * 0.42)} L${n(w * 0.2)} ${n(h)} L${n(w * 0.26)} ${n(bh)} H${n(r)} Q0 ${n(bh)} 0 ${n(bh - r)} V${n(r)} Q0 0 ${n(r)} 0 Z`; }
    case 'cloud': return `M${n(w * 0.24)} ${n(h * 0.9)} A${n(w * 0.2)} ${n(h * 0.24)} 0 0 1 ${n(w * 0.16)} ${n(h * 0.44)} A${n(w * 0.2)} ${n(h * 0.26)} 0 0 1 ${n(w * 0.46)} ${n(h * 0.18)} A${n(w * 0.2)} ${n(h * 0.24)} 0 0 1 ${n(w * 0.8)} ${n(h * 0.32)} A${n(w * 0.19)} ${n(h * 0.3)} 0 0 1 ${n(w * 0.78)} ${n(h * 0.9)} Z`;
    default: return `M0 0 H${n(w)} V${n(h)} H0 Z`;
  }
}

// ---- Text ----------------------------------------------------------------------------------------
export function paragraphs(runs) {
  const out = [[]];
  for (const run of runs || []) {
    String(run.t ?? '').split('\n').forEach((part, i) => {
      if (i > 0) out.push([]);
      if (part) out[out.length - 1].push({ ...run, t: part });
    });
  }
  return out;
}

export function textCss(deck, style = {}, { padding = 0 } = {}) {
  const valign = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[style.valign] || 'flex-start';
  return [
    'box-sizing:border-box', 'width:100%', 'height:100%', 'display:flex', 'flex-direction:column', `justify-content:${valign}`,
    `padding:${padding}px`, `font-family:'${resolveFont(deck, style.font).replace(/'/g, '')}',Arial,sans-serif`, `font-size:${n(style.size || 18)}px`,
    `font-weight:${style.weight || 400}`, `color:${resolveColor(deck, style.color, '#000000')}`, `text-align:${style.align || 'left'}`,
    `line-height:${style.lineHeight || 1.25}`, `letter-spacing:${n(style.letterSpacing || 0)}em`, 'overflow-wrap:break-word', 'word-break:normal',
    style.italic ? 'font-style:italic' : '', style.underline ? 'text-decoration:underline' : '', style.uppercase ? 'text-transform:uppercase' : ''
  ].filter(Boolean).join(';');
}

export function runHtml(deck, run) {
  const css = [
    run.b ? 'font-weight:700' : '', run.i ? 'font-style:italic' : '',
    run.u || run.s ? `text-decoration:${[run.u ? 'underline' : '', run.s ? 'line-through' : ''].filter(Boolean).join(' ')}` : '',
    run.color ? `color:${resolveColor(deck, run.color, 'inherit')}` : '', run.size ? `font-size:${n(run.size)}px` : ''
  ].filter(Boolean).join(';');
  const attrs = [css ? `style="${css}"` : '', run.color?.startsWith('@') ? `data-color="${esc(run.color)}"` : ''].filter(Boolean).join(' ');
  const body = esc(run.t);
  const span = attrs ? `<span ${attrs}>${body}</span>` : body;
  return run.href ? `<a href="${esc(run.href)}" target="_blank" rel="noopener noreferrer" style="color:${resolveColor(deck, '@link')}">${span}</a>` : span;
}

export function runsHtml(deck, runs, style = {}) {
  const paras = paragraphs(runs);
  const list = style.bullets;
  const p = parts => parts.length ? parts.map(r => runHtml(deck, r)).join('') : '<br>';
  if (!list) return paras.map(parts => `<p style="margin:0">${p(parts)}</p>`).join('');
  const marker = list === 'number' ? 'decimal' : list === 'check' ? '"✓  "' : 'disc';
  const tag = list === 'number' ? 'ol' : 'ul';
  return `<${tag} style="margin:0;padding-left:1.3em;list-style:${marker}">${paras.map(parts => `<li style="margin:0 0 .15em">${p(parts)}</li>`).join('')}</${tag}>`;
}

const pad2 = v => String(v).padStart(2, '0');

// ---- Elements ------------------------------------------------------------------------------------
function frameTransform(el) {
  if (!el.rot) return '';
  const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
  return ` transform="rotate(${n(el.rot)} ${n(cx)} ${n(cy)})"`;
}
function flipTransform(el) {
  if (!el.flipH && !el.flipV) return '';
  return ` transform="translate(${el.flipH ? n(el.w) : 0} ${el.flipV ? n(el.h) : 0}) scale(${el.flipH ? -1 : 1} ${el.flipV ? -1 : 1})"`;
}
const dashArray = (dash, width) => dash === 'dash' ? ` stroke-dasharray="${n(width * 4)} ${n(width * 3)}"` : dash === 'dot' ? ` stroke-dasharray="${n(width)} ${n(width * 2)}" stroke-linecap="round"` : '';

function textBlock(deck, el, ctx, padding) {
  let runs = el.runs || [{ t: '' }];
  let style = el.style || {};
  if (el.auto === 'slideNumber') runs = [{ t: `${pad2(ctx.index + 1)} / ${pad2(ctx.total)}` }];
  const empty = !runsText(runs).trim();
  if (empty && el.placeholder) {
    if (!ctx.editing) return '';
    runs = [{ t: el.prompt || 'Clique para adicionar texto' }];
    style = { ...style, color: '#9aa4b2', bullets: null };
  }
  if (empty && !el.placeholder) return '';
  return `<foreignObject x="0" y="0" width="${n(el.w)}" height="${n(el.h)}" style="overflow:visible"><div xmlns="http://www.w3.org/1999/xhtml" class="sd-text" style="${textCss(deck, style, { padding })}">${runsHtml(deck, runs, style)}</div></foreignObject>`;
}

function brandBlock(deck, el) {
  const b = deck.brand || {};
  const c = themeOf(deck).colors;
  const mark = b.logo
    ? `<img src="${esc(b.logo)}" alt="" style="height:${n(el.h * 0.8)}px;width:auto;max-width:${n(el.w * 0.45)}px;object-fit:contain">`
    : `<svg viewBox="0 0 48 48" width="${n(el.h * 0.78)}" height="${n(el.h * 0.78)}" aria-hidden="true"><rect x="1" y="1" width="45" height="45" fill="${esc(c.dk1)}"/><rect x="24" y="1" width="22" height="20" fill="${esc(c.accent1)}"/><path d="M8 15h17v-7h7v15H16v10h20v7H9V25H3v-7h5Z" fill="#fff"/><rect x="28" y="26" width="11" height="7" fill="#fff"/></svg>`;
  return `<foreignObject x="0" y="0" width="${n(el.w)}" height="${n(el.h)}"><div xmlns="http://www.w3.org/1999/xhtml" style="height:100%;display:flex;align-items:center;justify-content:flex-end;gap:${n(el.h * 0.22)}px;font-family:'Arial Narrow',Arial,sans-serif;font-weight:900;font-size:${n(el.h * 0.62)}px;letter-spacing:-0.04em;color:${esc(c.dk2)};white-space:nowrap;overflow:hidden">${mark}<span>${esc(b.name || '')}</span></div></foreignObject>`;
}

export function renderElement(deck, el, ctx) {
  const id = ctx.master ? '' : ` data-el-id="${esc(el.id)}"`;
  const opacity = el.opacity !== undefined && el.opacity !== 1 ? ` opacity="${n(el.opacity)}"` : '';
  const shadow = el.shadow ? ' style="filter:drop-shadow(0 4px 10px rgba(15,23,42,.28))"' : '';
  if (el.type === 'line') {
    const stroke = resolveColor(deck, el.stroke, '#000000');
    const w = el.strokeWidth || 2;
    const mid = `${ctx.prefix}-m-${esc(el.id)}`;
    const marker = (kind, end) => kind ? `<marker id="${mid}-${end}" viewBox="0 0 10 10" refX="${kind === 'circle' ? 5 : end === 's' ? 2 : 8}" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">${kind === 'circle' ? `<circle cx="5" cy="5" r="4" fill="${esc(stroke)}"/>` : `<path d="M0 0 L10 5 L0 10 z" fill="${esc(stroke)}"/>`}</marker>` : '';
    const defs = el.arrowStart || el.arrowEnd ? `<defs>${marker(el.arrowStart, 's')}${marker(el.arrowEnd, 'e')}</defs>` : '';
    const ms = el.arrowStart ? ` marker-start="url(#${mid}-s)"` : '';
    const me = el.arrowEnd ? ` marker-end="url(#${mid}-e)"` : '';
    const hit = ctx.editing ? `<line x1="${n(el.x1)}" y1="${n(el.y1)}" x2="${n(el.x2)}" y2="${n(el.y2)}" stroke="transparent" stroke-width="${n(Math.max(12, w + 8))}"/>` : '';
    return `<g class="sd-el"${id}${opacity}>${defs}${hit}<line x1="${n(el.x1)}" y1="${n(el.y1)}" x2="${n(el.x2)}" y2="${n(el.y2)}" stroke="${esc(stroke)}" stroke-width="${n(w)}"${dashArray(el.dash, w)}${ms}${me}/></g>`;
  }
  if (ctx.hide?.has(el.id) && el.type === 'text') return `<g class="sd-el"${id}><rect x="${n(el.x)}" y="${n(el.y)}" width="${n(el.w)}" height="${n(el.h)}" fill="transparent"/></g>`;
  let body = '';
  if (el.type === 'shape' || el.type === 'text') {
    const fill = resolveColor(deck, el.fill, el.type === 'shape' ? '#e5e7eb' : 'none');
    const stroke = resolveColor(deck, el.stroke, 'none');
    const sw = stroke === 'none' ? 0 : el.strokeWidth || 1;
    const geometry = el.type === 'shape' ? shapePath(el.shape, el.w, el.h, el.radius) : shapePath('rect', el.w, el.h);
    const paint = fill !== 'none' || sw ? `<path d="${geometry}" fill="${esc(fill)}" stroke="${esc(stroke)}" stroke-width="${n(sw)}"${dashArray(el.dash, sw)}${flipTransform(el)}/>` : '';
    const hit = ctx.editing && fill === 'none' && !sw ? `<rect width="${n(el.w)}" height="${n(el.h)}" fill="transparent"/>` : '';
    const text = ctx.hide?.has(el.id) ? '' : textBlock(deck, el, ctx, el.type === 'shape' ? Math.min(10, el.h / 6) : 2);
    const frame = ctx.editing && el.placeholder && !runsText(el.runs).trim() ? `<rect width="${n(el.w)}" height="${n(el.h)}" fill="none" stroke="#b8c2d0" stroke-dasharray="5 4" stroke-width="1" vector-effect="non-scaling-stroke"/>` : '';
    body = `${hit}${paint}${frame}${text}`;
  } else if (el.type === 'image') {
    const clip = `${ctx.prefix}-c-${esc(el.id)}`;
    const ratio = el.fit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice';
    const r = el.radius || 0;
    const stroke = el.stroke && el.stroke !== 'none' ? `<path d="${shapePath('roundRect', el.w, el.h, r)}" fill="none" stroke="${esc(resolveColor(deck, el.stroke, 'none'))}" stroke-width="${n(el.strokeWidth || 1)}"/>` : '';
    body = `<defs><clipPath id="${clip}"><path d="${shapePath('roundRect', el.w, el.h, r)}"/></clipPath></defs><g clip-path="url(#${clip})"${flipTransform(el)}><image href="${esc(el.src)}" x="0" y="0" width="${n(el.w)}" height="${n(el.h)}" preserveAspectRatio="${ratio}"/></g>${stroke}`;
  } else if (el.type === 'icon') {
    body = `<rect width="${n(el.w)}" height="${n(el.h)}" fill="transparent"/><svg viewBox="0 0 48 48" width="${n(el.w)}" height="${n(el.h)}" overflow="visible">${iconInner(el.icon, resolveColor(deck, el.color, '#0b315c'), resolveColor(deck, el.accent, '#f65b00'))}</svg>`;
  } else if (el.type === 'brand') {
    body = brandBlock(deck, el);
  }
  return `<g class="sd-el"${id}${opacity}${frameTransform(el)}${shadow}><g transform="translate(${n(el.x)} ${n(el.y)})">${body}</g></g>`;
}

export function slideBackground(deck, slide) {
  const bg = slide.background ?? themeOf(deck).background ?? '@lt1';
  if (bg && typeof bg === 'object' && bg.image) {
    return `<rect width="${PAGE.width}" height="${PAGE.height}" fill="${esc(resolveColor(deck, '@lt1', '#ffffff'))}"/><image href="${esc(bg.image)}" width="${PAGE.width}" height="${PAGE.height}" preserveAspectRatio="${bg.fit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice'}"/>`;
  }
  return `<rect width="${PAGE.width}" height="${PAGE.height}" fill="${esc(resolveColor(deck, bg, '#ffffff'))}"/>`;
}

export function renderSlideSvg(deck, slide, { index = 0, total = 1, editing = false, prefix = 'd', hide = null, className = 'sd-svg', label = '' } = {}) {
  const ctx = { index, total, editing, prefix: `${prefix}${index}`, hide };
  const master = slide.hideMaster ? '' : (themeOf(deck).master || []).map(el => renderElement(deck, el, { ...ctx, master: true })).join('');
  const elements = (slide.elements || []).map(el => renderElement(deck, el, ctx)).join('');
  return `<svg class="${esc(className)}" data-no-translate="1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE.width} ${PAGE.height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(label || `Slide ${index + 1}`)}" data-slide-id="${esc(slide.id)}">${slideBackground(deck, slide)}<g class="sd-master">${master}</g><g class="sd-content">${elements}</g></svg>`;
}

export function deckSearchText(deck) {
  return (deck.slides || []).map(s => (s.elements || []).map(e => runsText(e.runs)).join(' ')).join(' ');
}

export { elementBounds };
