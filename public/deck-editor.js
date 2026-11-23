// Presentations editor (Google Slides-style) for decks: slide rail, free canvas, contextual toolbar,
// rich text editing, theme/background panels, undo/redo and autosave as batches of operations.
import {
  PAGE, SHAPES, ICONS, THEMES, LAYOUTS, THEME_COLOR_KEYS, THEME_COLOR_LABELS, FONT_CHOICES,
  applyOps, clone, createSlide, elementBounds, newId, resolveColor, runsText, themeOf, layoutById, withLegacyMirror
} from './deck-model.js';
import { renderSlideSvg, runsHtml, textCss, shapePath, iconInner, esc } from './deck-render.js';
import { tr } from './i18n.js';

// ---- State ---------------------------------------------------------------------------------------
let S = null;            // editor state for the open deck
let host = null;         // mount point
let env = null;          // { act, flash, getAgency }
let onExit = null;
let globalBound = false;
let clipboard = null;

const STANDARD_COLORS = ['#000000', '#434343', '#666666', '#999999', '#cccccc', '#ffffff', '#e11d48', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#78350f'];
const ICON_LABELS = { 'i-browser': 'Navegador', 'i-search': 'Busca', 'i-people': 'Pessoas', 'i-chart': 'Gráfico', 'i-alert': 'Alerta', 'i-globe': 'Globo', 'i-tag': 'Etiqueta', 'i-crm': 'CRM', 'i-mobile': 'Celular', 'i-plussearch': 'Busca avançada', star: 'Estrela' };
const SVG_ICON = {
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  cursor: '<path d="m4 4 7 16 2.5-6.5L20 11z"/>',
  text: '<path d="M4 7V5h16v2M9 19h6M12 5v14"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  shape: '<circle cx="9" cy="9" r="5"/><rect x="11" y="11" width="9" height="9" rx="1"/>',
  line: '<path d="M5 19 19 5"/>',
  icon: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>',
  italic: '<path d="M10 5h8M6 19h8M14 5l-4 14"/>',
  underline: '<path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14"/>',
  color: '<path d="m6 17 6-13 6 13M8.5 12h7"/>',
  fill: '<path d="m19 11-8-8-8 8 8 8z"/><path d="M20 15s2 2.4 2 3.5a2 2 0 0 1-4 0c0-1.1 2-3.5 2-3.5"/>',
  stroke: '<rect x="4" y="4" width="16" height="16" rx="2"/>',
  alignL: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>', alignC: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
  alignR: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>', alignJ: '<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>',
  vtop: '<path d="M4 4h16M12 20V8m-4 4 4-4 4 4"/>', vmid: '<path d="M4 12h16M12 3v6m0 6v6"/>', vbot: '<path d="M4 20h16M12 4v12m-4-4 4 4 4-4"/>',
  bullets: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  numbers: '<path d="M10 6h10M10 12h10M10 18h10M4 5h1v4M4 9h2M4 14.5a1.2 1.2 0 0 1 2 .9L4 18h2"/>',
  front: '<rect x="8" y="8" width="12" height="12" rx="1"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>',
  back: '<rect x="4" y="4" width="12" height="12" rx="1"/><path d="M20 8v11a1 1 0 0 1-1 1H8"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  play: '<path d="M7 4v16l13-8z"/>', plus: '<path d="M12 5v14M5 12h14"/>', back2: '<path d="m15 18-6-6 6-6"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.4 5.2A10 10 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-3 3.8M6.3 6.3C4 7.8 2.5 10 2 12c1 2.5 5 7 10 7 1.6 0 3-.4 4.3-1"/>',
  palette: '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2a10 10 0 0 0 0 20c1 0 1.5-.8 1.5-1.6 0-.5-.3-.9-.5-1.2-.3-.4-.5-.8-.5-1.2 0-.9.7-1.5 1.6-1.5H16a6 6 0 0 0 6-6c0-4.6-4.5-8.5-10-8.5Z"/>',
  bg: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m3 15 5-5 4 4 3-3 6 6"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>', share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  pdf: '<path d="M6 9V3h12v6M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14h12v7H6z"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>'
};
const ico = (name, size = 18) => `<svg class="sd-ico" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${SVG_ICON[name] || ''}</svg>`;

// ---- Public API ----------------------------------------------------------------------------------
export function openDeckEditor(deck, { rev } = {}) {
  S = {
    deck: clone(deck), rev: Number(rev ?? deck.rev) || 0, slideId: deck.slides[0]?.id, sel: new Set(), tool: 'select', insertShape: 'rect', insertLine: 'line',
    zoom: 'fit', scale: 1, editingId: null, undo: [], redo: [], pending: [], saving: false, status: 'saved', conflict: false,
    panel: null, menu: null, present: null, drag: null
  };
  return S;
}
export const deckEditorOpen = () => Boolean(S);
export function closeDeckEditor() { S = null; host = null; }

export function mountDeckEditor(target, environment, exit) {
  if (!S) return;
  host = target; env = environment; onExit = exit;
  if (!globalBound) {
    globalBound = true;
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', () => { if (S && host?.isConnected) { fitStage(); renderStage(); } });
    window.addEventListener('beforeunload', ev => { if (S && (S.pending.length || S.saving)) { ev.preventDefault(); ev.returnValue = ''; } });
  }
  renderAll();
}

// ---- Helpers -------------------------------------------------------------------------------------
const $ = sel => host?.querySelector(sel);
const slide = () => S.deck.slides.find(s => s.id === S.slideId) || S.deck.slides[0];
const slideIndex = () => S.deck.slides.findIndex(s => s.id === slide().id);
const selected = () => slide().elements.filter(e => S.sel.has(e.id));
const single = () => { const list = selected(); return list.length === 1 ? list[0] : null; };
const isTextual = el => el && (el.type === 'text' || el.type === 'shape');
const round = v => Math.round(v * 100) / 100;
const flash = (msg, bad) => env?.flash?.(msg, bad);

function commit(ops, { render = 'all', keepRedo = false } = {}) {
  if (!ops.length) return;
  let inverse;
  try { inverse = applyOps(S.deck, ops); }
  catch (e) { flash(e.message, true); return; }
  withLegacyMirror(S.deck);
  S.undo.push({ ops: clone(ops), inverse, slideId: S.slideId });
  if (S.undo.length > 200) S.undo.shift();
  if (!keepRedo) S.redo = [];
  queueSave(ops);
  if (render === 'all') renderAll(); else if (render === 'stage') { renderStage(); renderRailThumb(S.slideId); renderToolbar(); }
}

function undo() {
  const entry = S.undo.pop();
  if (!entry) return;
  const redoOps = applyOps(S.deck, entry.inverse);
  withLegacyMirror(S.deck);
  S.redo.push({ ops: entry.inverse, inverse: redoOps, slideId: entry.slideId });
  queueSave(entry.inverse);
  if (S.deck.slides.some(s => s.id === entry.slideId)) S.slideId = entry.slideId;
  else S.slideId = S.deck.slides[0].id;
  pruneSelection();
  renderAll();
}
function redo() {
  const entry = S.redo.pop();
  if (!entry) return;
  const inverse = applyOps(S.deck, entry.inverse);
  withLegacyMirror(S.deck);
  S.undo.push({ ops: entry.inverse, inverse, slideId: entry.slideId });
  queueSave(entry.inverse);
  if (S.deck.slides.some(s => s.id === entry.slideId)) S.slideId = entry.slideId;
  pruneSelection();
  renderAll();
}
function pruneSelection() { const ids = new Set(slide().elements.map(e => e.id)); for (const id of [...S.sel]) if (!ids.has(id)) S.sel.delete(id); }

// ---- Autosave (batches of ops + revision, like Slides' /save) -----------------------------------
let saveTimer = null;
function queueSave(ops) {
  S.pending.push(...clone(ops));
  S.status = 'dirty';
  renderStatus();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 900);
}
export async function flushSave() {
  if (!S || S.saving || !S.pending.length || S.conflict) return;
  const state = S;
  const batch = state.pending.splice(0, 300);
  state.saving = true; state.status = 'saving'; renderStatus();
  try {
    const rev = await env.act('presentation-ops', { id: state.deck.id, data: { rev: state.rev, ops: batch } });
    state.rev = Number(rev) || state.rev + 1;
    state.status = state.pending.length ? 'dirty' : 'saved';
  } catch (e) {
    if (e.status === 409) { state.conflict = true; state.status = 'conflict'; }
    else { state.pending.unshift(...batch); state.status = 'error'; flash(e.message || 'Não foi possível salvar.', true); }
  } finally {
    state.saving = false;
    if (S === state) {
      renderStatus();
      if (state.pending.length && state.status !== 'error' && !state.conflict) { clearTimeout(saveTimer); saveTimer = setTimeout(flushSave, 400); }
    }
  }
}
function reloadFromServer() {
  const row = (env.getAgency?.()?.presentations || []).find(p => p.id === S.deck.id);
  if (!row) { flash('A apresentação não foi encontrada.', true); return; }
  const keepSlide = S.slideId;
  openDeckEditor(row, { rev: row.rev });
  if (S.deck.slides.some(s => s.id === keepSlide)) S.slideId = keepSlide;
  renderAll();
}

// ---- Rendering -----------------------------------------------------------------------------------
function renderAll() {
  if (!host) return;
  const d = S.deck;
  host.innerHTML = `
    <div class="sd-app" id="sd-app">
      <header class="sd-top">
        <button type="button" class="sd-btn sd-ghost" data-sd="exit" title="Voltar às apresentações">${ico('back2')}<span>Apresentações</span></button>
        <input class="sd-title" data-sd-input="title" value="${esc(d.title)}" aria-label="Título da apresentação" maxlength="120">
        <span class="sd-status" id="sd-status"></span>
        <span class="sd-spacer"></span>
        <button type="button" class="sd-btn" data-sd="pdf" title="Imprimir ou salvar em PDF">${ico('pdf')}<span>PDF</span></button>
        <button type="button" class="sd-btn" data-sd="share" title="Compartilhar link público">${ico('share')}<span>Compartilhar</span></button>
        <button type="button" class="sd-btn sd-primary" data-sd="present" title="Apresentar a partir deste slide (Ctrl+Enter)">${ico('play')}<span>Apresentar</span></button>
      </header>
      <div class="sd-toolbar" id="sd-toolbar" role="toolbar" aria-label="Ferramentas"></div>
      <div class="sd-body">
        <aside class="sd-rail" id="sd-rail" aria-label="Slides"></aside>
        <section class="sd-center">
          <div class="sd-stage" id="sd-stage"><div class="sd-canvas" id="sd-canvas"></div></div>
          <div class="sd-notes"><textarea id="sd-notes" placeholder="${esc(tr('Clique para adicionar anotações do apresentador'))}" aria-label="${esc(tr('Anotações do apresentador'))}"></textarea></div>
        </section>
        <aside class="sd-panel" id="sd-panel" hidden></aside>
      </div>
      <div class="sd-pop" id="sd-pop" hidden></div>
      <div class="sd-banner" id="sd-banner" hidden></div>
    </div>`;
  bindChrome();
  renderToolbar();
  renderRail();
  fitStage();
  renderStage();
  renderNotes();
  renderPanel();
  renderStatus();
  if (S.present) renderPresent();
}

function renderStatus() {
  const el = $('#sd-status');
  if (!el) return;
  const text = { saved: 'Todas as alterações foram salvas', saving: 'Salvando…', dirty: 'Alterações não salvas', error: 'Erro ao salvar — tentando de novo na próxima alteração', conflict: 'Alterada em outro lugar' }[S.status] || '';
  el.textContent = text;
  el.dataset.state = S.status;
  const banner = $('#sd-banner');
  if (banner) {
    banner.hidden = !S.conflict;
    banner.innerHTML = S.conflict ? `<span>Esta apresentação foi alterada em outra aba ou por outra pessoa. Suas últimas alterações não foram salvas.</span><button type="button" class="sd-btn sd-primary" data-sd="reload">Recarregar a versão salva</button>` : '';
  }
}

function toolBtn(action, icon, title, { active = false, attrs = '', label = '' } = {}) {
  return `<button type="button" class="sd-tb${active ? ' on' : ''}" data-sd="${action}" title="${esc(title)}" aria-label="${esc(title)}"${active ? ' aria-pressed="true"' : ''} ${attrs}>${ico(icon)}${label ? `<span>${esc(label)}</span>` : ''}</button>`;
}
const sep = '<span class="sd-sep"></span>';

function renderToolbar() {
  const bar = $('#sd-toolbar');
  if (!bar) return;
  const el = single();
  const list = selected();
  const textual = list.length && list.every(isTextual);
  const style = isTextual(el) ? el.style || {} : list.find(isTextual)?.style || {};
  const allRunsBold = list.length && list.filter(isTextual).every(e => (e.runs || []).every(r => r.b || !r.t) || (e.style?.weight || 400) >= 700);
  const zoomOptions = [['fit', 'Ajustar'], [0.5, '50%'], [0.75, '75%'], [1, '100%'], [1.5, '150%'], [2, '200%']];
  let html = `
    ${toolBtn('undo', 'undo', 'Desfazer (Ctrl+Z)', { attrs: S.undo.length ? '' : 'disabled' })}
    ${toolBtn('redo', 'redo', 'Refazer (Ctrl+Y)', { attrs: S.redo.length ? '' : 'disabled' })}
    <select data-native-select class="sd-select sd-zoom" data-sd-input="zoom" aria-label="Zoom">${zoomOptions.map(([v, l]) => `<option value="${v}"${String(S.zoom) === String(v) ? ' selected' : ''}>${l}</option>`).join('')}</select>
    ${sep}
    ${toolBtn('tool-select', 'cursor', 'Selecionar (Esc)', { active: S.tool === 'select' })}
    ${toolBtn('tool-text', 'text', 'Caixa de texto: clique ou arraste no slide', { active: S.tool === 'text' })}
    ${toolBtn('insert-image', 'image', 'Inserir imagem')}
    ${toolBtn('menu-shape', 'shape', 'Forma', { active: S.tool === 'shape' })}
    ${toolBtn('menu-line', 'line', 'Linha', { active: S.tool === 'line' })}
    ${toolBtn('menu-icon', 'icon', 'Ícone')}
    ${sep}`;
  if (list.length) {
    if (textual) {
      html += `
        <select data-native-select class="sd-select sd-font" data-sd-input="font" aria-label="Fonte">${['@heading', '@body', ...FONT_CHOICES].map(f => `<option value="${esc(f)}"${(style.font || '@body') === f ? ' selected' : ''}>${f === '@heading' ? `Título (${esc(themeOf(S.deck).fonts.heading)})` : f === '@body' ? `Corpo (${esc(themeOf(S.deck).fonts.body)})` : esc(f)}</option>`).join('')}</select>
        <span class="sd-size"><button type="button" class="sd-tb sd-mini" data-sd="size-down" title="Diminuir fonte" aria-label="Diminuir fonte">−</button><input data-sd-input="size" value="${Math.round((style.size || 18) * 10) / 10}" aria-label="Tamanho da fonte" inputmode="decimal"><button type="button" class="sd-tb sd-mini" data-sd="size-up" title="Aumentar fonte" aria-label="Aumentar fonte">+</button></span>
        ${toolBtn('bold', 'bold', 'Negrito (Ctrl+B)', { active: allRunsBold })}
        ${toolBtn('italic', 'italic', 'Itálico (Ctrl+I)', { active: Boolean(style.italic) })}
        ${toolBtn('underline', 'underline', 'Sublinhado (Ctrl+U)', { active: Boolean(style.underline) })}
        ${toolBtn('menu-textcolor', 'color', 'Cor do texto', { attrs: `style="--swatch:${esc(resolveColor(S.deck, style.color, '#000'))}"` })}
        ${sep}
        ${toolBtn('align-left', 'alignL', 'Alinhar à esquerda', { active: (style.align || 'left') === 'left' })}
        ${toolBtn('align-center', 'alignC', 'Centralizar', { active: style.align === 'center' })}
        ${toolBtn('align-right', 'alignR', 'Alinhar à direita', { active: style.align === 'right' })}
        ${toolBtn('align-justify', 'alignJ', 'Justificar', { active: style.align === 'justify' })}
        ${toolBtn('menu-valign', style.valign === 'middle' ? 'vmid' : style.valign === 'bottom' ? 'vbot' : 'vtop', 'Alinhamento vertical')}
        ${toolBtn('bullets', 'bullets', 'Lista com marcadores', { active: style.bullets === 'disc' })}
        ${toolBtn('numbers', 'numbers', 'Lista numerada', { active: style.bullets === 'number' })}
        ${sep}`;
    }
    const fillable = list.some(e => e.type === 'shape' || e.type === 'text');
    const strokable = list.some(e => e.type !== 'icon');
    if (fillable) html += toolBtn('menu-fill', 'fill', 'Cor de preenchimento', { attrs: `style="--swatch:${esc(resolveColor(S.deck, (el || list[0]).fill, 'transparent'))}"` });
    if (strokable) html += toolBtn('menu-stroke', 'stroke', 'Cor e espessura da borda', { attrs: `style="--swatch:${esc(resolveColor(S.deck, (el || list[0]).stroke, 'transparent'))}"` });
    if (list.some(e => e.type === 'icon')) html += toolBtn('menu-iconcolor', 'color', 'Cor do ícone', { attrs: `style="--swatch:${esc(resolveColor(S.deck, list.find(e => e.type === 'icon').color, '#000'))}"` });
    html += `${sep}${toolBtn('front', 'front', 'Trazer para a frente (Ctrl+↑)')}${toolBtn('back', 'back', 'Enviar para trás (Ctrl+↓)')}${toolBtn('duplicate', 'copy', 'Duplicar (Ctrl+D)')}${toolBtn('delete', 'trash', 'Excluir (Delete)')}${sep}`;
    html += toolBtn('panel-format', 'sliders', 'Opções de formatação', { active: S.panel === 'format', label: 'Formatar' });
  } else {
    html += `
      ${toolBtn('panel-background', 'bg', 'Plano de fundo do slide', { active: S.panel === 'background', label: 'Plano de fundo' })}
      ${toolBtn('menu-layout', 'layout', 'Novo slide com layout', { label: 'Layout' })}
      ${toolBtn('panel-theme', 'palette', 'Tema da apresentação', { active: S.panel === 'theme', label: 'Tema' })}`;
  }
  bar.innerHTML = html;
}

function renderRail() {
  const rail = $('#sd-rail');
  if (!rail) return;
  const total = S.deck.slides.length;
  rail.innerHTML = S.deck.slides.map((s, i) => `
    <div class="sd-thumb${s.id === S.slideId ? ' on' : ''}${s.skipped ? ' skipped' : ''}" data-slide="${esc(s.id)}" draggable="true" tabindex="0" role="button" aria-label="Slide ${i + 1}${s.skipped ? ' (pulado)' : ''}" aria-current="${s.id === S.slideId}">
      <span class="sd-num">${i + 1}</span>
      <div class="sd-thumb-svg">${renderSlideSvg(S.deck, s, { index: i, total, prefix: 'r' })}</div>
      <span class="sd-thumb-actions">
        <button type="button" data-sd="slide-duplicate" data-id="${esc(s.id)}" title="Duplicar slide" aria-label="Duplicar slide">${ico('copy', 14)}</button>
        <button type="button" data-sd="slide-skip" data-id="${esc(s.id)}" title="${s.skipped ? 'Mostrar slide' : 'Pular slide'}" aria-label="${s.skipped ? 'Mostrar slide' : 'Pular slide'}">${ico('eyeOff', 14)}</button>
        <button type="button" data-sd="slide-delete" data-id="${esc(s.id)}" title="Excluir slide" aria-label="Excluir slide" ${total <= 1 ? 'disabled' : ''}>${ico('trash', 14)}</button>
      </span>
    </div>`).join('') + `<button type="button" class="sd-add-slide" data-sd="menu-layout">${ico('plus', 16)} Novo slide</button>`;
}
function renderRailThumb(slideId) {
  const box = host?.querySelector(`.sd-thumb[data-slide="${CSS.escape(slideId)}"] .sd-thumb-svg`);
  const i = S.deck.slides.findIndex(s => s.id === slideId);
  if (box && i >= 0) box.innerHTML = renderSlideSvg(S.deck, S.deck.slides[i], { index: i, total: S.deck.slides.length, prefix: 'r' });
}

function fitStage() {
  const stage = $('#sd-stage');
  if (!stage) return;
  if (S.zoom === 'fit') S.scale = Math.max(0.15, Math.min((stage.clientWidth - 56) / PAGE.width, (stage.clientHeight - 56) / PAGE.height));
  else S.scale = Number(S.zoom);
  const canvas = $('#sd-canvas');
  canvas.style.width = `${PAGE.width * S.scale}px`;
  canvas.style.height = `${PAGE.height * S.scale}px`;
}

function renderStage() {
  const canvas = $('#sd-canvas');
  if (!canvas) return;
  const i = slideIndex();
  const hide = S.editingId ? new Set([S.editingId]) : null;
  const editorEl = canvas.querySelector('.sd-textedit');
  canvas.innerHTML = renderSlideSvg(S.deck, slide(), { index: i, total: S.deck.slides.length, editing: true, prefix: 'st', hide, className: 'sd-svg sd-stage-svg' }) + `<div class="sd-overlay" id="sd-overlay"></div>`;
  if (editorEl) canvas.appendChild(editorEl);
  canvas.dataset.tool = S.tool;
  renderOverlay();
}

function renderOverlay(guides = []) {
  const ov = $('#sd-overlay');
  if (!ov) return;
  const k = S.scale;
  const list = selected();
  let html = '';
  for (const el of list) {
    if (el.type === 'line') {
      html += `<div class="sd-linesel" style="left:${el.x1 * k}px;top:${el.y1 * k}px;width:${Math.hypot(el.x2 - el.x1, el.y2 - el.y1) * k}px;transform:rotate(${Math.atan2(el.y2 - el.y1, el.x2 - el.x1)}rad)"></div>`;
      if (list.length === 1 && !el.locked) html += `<span class="sd-h sd-h-pt" data-handle="p1" style="left:${el.x1 * k}px;top:${el.y1 * k}px"></span><span class="sd-h sd-h-pt" data-handle="p2" style="left:${el.x2 * k}px;top:${el.y2 * k}px"></span>`;
      continue;
    }
    const handles = list.length === 1 && !el.locked && S.editingId !== el.id
      ? ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(h => `<span class="sd-h sd-h-${h}" data-handle="${h}"></span>`).join('') + '<span class="sd-rot" data-handle="rot" title="Girar (Shift: 15°)"></span>'
      : '';
    html += `<div class="sd-selbox${el.locked ? ' locked' : ''}${S.editingId === el.id ? ' editing' : ''}" style="left:${el.x * k}px;top:${el.y * k}px;width:${el.w * k}px;height:${el.h * k}px;transform:rotate(${el.rot || 0}deg)">${handles}</div>`;
  }
  if (list.length > 1) {
    const b = boundsOf(list);
    html += `<div class="sd-groupbox" style="left:${b.x * k}px;top:${b.y * k}px;width:${b.w * k}px;height:${b.h * k}px"></div>`;
  }
  for (const g of guides) {
    html += g.axis === 'x' ? `<div class="sd-guide sd-guide-x" style="left:${g.v * k}px"></div>` : `<div class="sd-guide sd-guide-y" style="top:${g.v * k}px"></div>`;
  }
  if (S.drag?.marquee) { const m = S.drag.marquee; html += `<div class="sd-marquee" style="left:${m.x * k}px;top:${m.y * k}px;width:${m.w * k}px;height:${m.h * k}px"></div>`; }
  if (S.drag?.draft) { const m = S.drag.draft; html += `<div class="sd-marquee sd-draft" style="left:${m.x * k}px;top:${m.y * k}px;width:${m.w * k}px;height:${m.h * k}px"></div>`; }
  ov.innerHTML = html;
}

function renderNotes() {
  const t = $('#sd-notes');
  if (t) t.value = slide().notes || '';
}

function boundsOf(list) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const el of list) { const b = elementBounds(el); x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h); }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

// ---- Side panels (theme, background, format) ----------------------------------------------------
function colorField(name, value, label) {
  return `<label class="sd-field sd-colorfield"><span>${esc(label)}</span><input type="color" data-sd-input="${esc(name)}" value="${esc(/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000')}"></label>`;
}

function renderPanel() {
  const panel = $('#sd-panel');
  if (!panel) return;
  if (S.panel === 'format' && !selected().length) S.panel = null;
  panel.hidden = !S.panel;
  if (!S.panel) { panel.innerHTML = ''; return; }
  const head = title => `<header class="sd-panel-head"><h2>${esc(title)}</h2><button type="button" class="sd-tb" data-sd="panel-close" aria-label="Fechar painel">${ico('close')}</button></header>`;
  const theme = themeOf(S.deck);
  if (S.panel === 'theme') {
    panel.innerHTML = `${head('Tema')}
      <div class="sd-panel-body">
        <p class="sd-help">O tema define cores, fontes e os elementos que se repetem em todos os slides. Trocar o tema atualiza a apresentação inteira.</p>
        <div class="sd-themes">${Object.values(THEMES).map(t => {
          const preview = { ...S.deck, theme: { ...clone(t), colors: t.id === 'proposta' ? { ...t.colors, dk1: theme.id === 'proposta' ? theme.colors.dk1 : t.colors.dk1, accent1: theme.id === 'proposta' ? theme.colors.accent1 : t.colors.accent1 } : t.colors } };
          const s = { ...createSlide('title'), id: 'preview' };
          s.elements[0].runs = [{ t: t.name }];
          s.elements[1].runs = [{ t: 'Aa Bb Cc' }];
          return `<button type="button" class="sd-theme${theme.id === t.id ? ' on' : ''}" data-sd="theme-apply" data-id="${esc(t.id)}">${renderSlideSvg(preview, s, { prefix: `th${t.id}` })}<span>${esc(t.name)}</span></button>`;
        }).join('')}</div>
        <h3>Cores do tema</h3>
        <div class="sd-grid2">${THEME_COLOR_KEYS.map(k => colorField(`theme-color:${k}`, theme.colors[k], THEME_COLOR_LABELS[k])).join('')}</div>
        <h3>Fontes</h3>
        <label class="sd-field"><span>Títulos</span><select data-native-select class="sd-select" data-sd-input="theme-font:heading">${FONT_CHOICES.map(f => `<option${theme.fonts.heading === f ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
        <label class="sd-field"><span>Corpo</span><select data-native-select class="sd-select" data-sd-input="theme-font:body">${FONT_CHOICES.map(f => `<option${theme.fonts.body === f ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
        <h3>Marca</h3>
        <label class="sd-field"><span>Nome exibido</span><input data-sd-input="brand-name" value="${esc(S.deck.brand?.name || '')}" maxlength="80"></label>
        <div class="sd-row"><button type="button" class="sd-btn" data-sd="brand-logo">${S.deck.brand?.logo ? 'Trocar logo' : 'Enviar logo'}</button>${S.deck.brand?.logo ? '<button type="button" class="sd-btn sd-ghost" data-sd="brand-logo-remove">Remover logo</button>' : ''}</div>
      </div>`;
  } else if (S.panel === 'background') {
    const bg = slide().background;
    const current = typeof bg === 'string' ? bg : null;
    panel.innerHTML = `${head('Plano de fundo')}
      <div class="sd-panel-body">
        <h3>Cor</h3>
        ${swatchGrid('bg-color', current)}
        <h3>Imagem</h3>
        <div class="sd-row"><button type="button" class="sd-btn" data-sd="bg-image">Escolher imagem</button>${bg ? '<button type="button" class="sd-btn sd-ghost" data-sd="bg-reset">Redefinir</button>' : ''}</div>
        <p class="sd-help">Sem cor própria, o slide usa o fundo do tema.</p>
        <button type="button" class="sd-btn" data-sd="bg-all">Aplicar a todos os slides</button>
        <label class="sd-check"><input type="checkbox" data-sd-input="hide-master" ${slide().hideMaster ? 'checked' : ''}> Ocultar elementos do tema neste slide</label>
      </div>`;
  } else if (S.panel === 'format') {
    const el = single();
    const list = selected();
    const b = el ? elementBounds(el) : boundsOf(list);
    const num = (name, label, value, step = 1) => `<label class="sd-field"><span>${label}</span><input type="number" step="${step}" data-sd-input="${name}" value="${round(value)}"></label>`;
    panel.innerHTML = `${head('Opções de formatação')}
      <div class="sd-panel-body">
        <h3>Tamanho e posição</h3>
        ${el && el.type !== 'line' ? `<div class="sd-grid2">${num('geo:x', 'X', b.x)}${num('geo:y', 'Y', b.y)}${num('geo:w', 'Largura', b.w)}${num('geo:h', 'Altura', b.h)}${num('geo:rot', 'Rotação (°)', el.rot || 0)}</div>
          <div class="sd-row"><button type="button" class="sd-btn" data-sd="flip-h">Inverter horizontal</button><button type="button" class="sd-btn" data-sd="flip-v">Inverter vertical</button></div>` : el ? `<div class="sd-grid2">${num('line:x1', 'X inicial', el.x1)}${num('line:y1', 'Y inicial', el.y1)}${num('line:x2', 'X final', el.x2)}${num('line:y2', 'Y final', el.y2)}</div>` : '<p class="sd-help">Vários objetos selecionados.</p>'}
        <h3>Alinhar no slide</h3>
        <div class="sd-row sd-wrap">${[['left', 'Esquerda'], ['hcenter', 'Centro'], ['right', 'Direita'], ['top', 'Topo'], ['vcenter', 'Meio'], ['bottom', 'Embaixo']].map(([a, l]) => `<button type="button" class="sd-btn sd-small" data-sd="align-${a}">${l}</button>`).join('')}</div>
        ${list.length > 2 ? `<div class="sd-row"><button type="button" class="sd-btn sd-small" data-sd="distribute-h">Distribuir na horizontal</button><button type="button" class="sd-btn sd-small" data-sd="distribute-v">Distribuir na vertical</button></div>` : ''}
        <h3>Aparência</h3>
        <label class="sd-field"><span>Opacidade: ${Math.round((el?.opacity ?? 1) * 100)}%</span><input type="range" min="0" max="100" data-sd-input="opacity" value="${Math.round((el?.opacity ?? 1) * 100)}"></label>
        ${list.some(e => e.type !== 'line' && e.type !== 'icon') ? `<label class="sd-check"><input type="checkbox" data-sd-input="shadow" ${list.every(e => e.shadow) ? 'checked' : ''}> Sombra projetada</label>` : ''}
        ${el?.type === 'shape' && el.shape === 'roundRect' || el?.type === 'image' ? num('radius', 'Arredondamento', el.radius ?? Math.min(el.w, el.h) * 0.16) : ''}
        ${el?.type === 'image' ? `<label class="sd-field"><span>Ajuste da imagem</span><select data-native-select class="sd-select" data-sd-input="fit"><option value="cover"${el.fit !== 'contain' ? ' selected' : ''}>Preencher e cortar</option><option value="contain"${el.fit === 'contain' ? ' selected' : ''}>Mostrar inteira</option></select></label>
          <button type="button" class="sd-btn" data-sd="image-replace">Substituir imagem</button>` : ''}
        ${el?.type === 'line' ? `<label class="sd-field"><span>Início</span><select data-native-select class="sd-select" data-sd-input="arrowStart"><option value="">Nenhum</option><option value="arrow"${el.arrowStart === 'arrow' ? ' selected' : ''}>Seta</option><option value="circle"${el.arrowStart === 'circle' ? ' selected' : ''}>Círculo</option></select></label>
          <label class="sd-field"><span>Fim</span><select data-native-select class="sd-select" data-sd-input="arrowEnd"><option value="">Nenhum</option><option value="arrow"${el.arrowEnd === 'arrow' ? ' selected' : ''}>Seta</option><option value="circle"${el.arrowEnd === 'circle' ? ' selected' : ''}>Círculo</option></select></label>` : ''}
        ${isTextual(el) ? `<h3>Texto</h3>
          <label class="sd-field"><span>Espaçamento entre linhas</span><input type="number" step="0.05" min="0.6" max="4" data-sd-input="lineHeight" value="${el.style?.lineHeight ?? 1.25}"></label>
          <label class="sd-field"><span>Espaçamento entre letras (em)</span><input type="number" step="0.01" min="-0.2" max="1" data-sd-input="letterSpacing" value="${el.style?.letterSpacing ?? 0}"></label>
          <label class="sd-check"><input type="checkbox" data-sd-input="uppercase" ${el.style?.uppercase ? 'checked' : ''}> Tudo em maiúsculas</label>
          ${el.type === 'text' ? `<label class="sd-check"><input type="checkbox" data-sd-input="autoHeight" ${el.autoHeight ? 'checked' : ''}> Ajustar a altura ao texto</label>` : ''}` : ''}
        <h3>Acessibilidade</h3>
        ${el ? `<label class="sd-field"><span>Texto alternativo</span><textarea data-sd-input="alt" rows="2" maxlength="300">${esc(el.alt || '')}</textarea></label>` : ''}
        <label class="sd-check"><input type="checkbox" data-sd-input="locked" ${list.every(e => e.locked) ? 'checked' : ''}> Travar posição</label>
      </div>`;
  }
}

function swatchGrid(action, current, { allowNone = false } = {}) {
  const theme = themeOf(S.deck);
  const sw = (value, color, title) => `<button type="button" class="sd-swatch${current === value ? ' on' : ''}" data-sd="${action}" data-value="${esc(value)}" title="${esc(title)}" style="--c:${esc(color)}"></button>`;
  return `<div class="sd-swatch-label">Cores do tema</div><div class="sd-swatches">${THEME_COLOR_KEYS.map(k => sw(`@${k}`, theme.colors[k], THEME_COLOR_LABELS[k])).join('')}</div>
    <div class="sd-swatch-label">Padrão</div><div class="sd-swatches">${STANDARD_COLORS.map(c => sw(c, c, c)).join('')}</div>
    <div class="sd-row">${allowNone ? `<button type="button" class="sd-btn sd-small" data-sd="${action}" data-value="none">Transparente</button>` : ''}<label class="sd-btn sd-small sd-custom">Personalizada <input type="color" data-sd-color="${action}" value="${esc(/^#[0-9a-f]{6}$/i.test(current || '') ? current : '#000000')}"></label></div>`;
}

// ---- Popovers (shape, line, icon, colors, layouts) ----------------------------------------------
function openPop(kind, anchor) {
  const pop = $('#sd-pop');
  if (!pop) return;
  if (S.menu === kind && !pop.hidden) { closePop(); return; }
  S.menu = kind;
  const el = single() || selected()[0];
  let html = '';
  if (kind === 'shape') html = `<div class="sd-pop-grid">${SHAPES.map(([id, label]) => `<button type="button" data-sd="pick-shape" data-value="${id}" title="${esc(label)}" aria-label="${esc(label)}"><svg viewBox="-2 -2 28 24" width="26" height="22"><path d="${shapePath(id, 24, 20)}" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>`).join('')}</div>`;
  else if (kind === 'line') html = `<div class="sd-pop-list">${[['line', 'Linha'], ['arrow', 'Seta'], ['double', 'Seta dupla'], ['dashed', 'Linha tracejada']].map(([v, l]) => `<button type="button" data-sd="pick-line" data-value="${v}">${esc(l)}</button>`).join('')}</div>`;
  else if (kind === 'icon') html = `<div class="sd-pop-grid">${ICONS.map(id => `<button type="button" data-sd="pick-icon" data-value="${id}" title="${esc(ICON_LABELS[id])}" aria-label="${esc(ICON_LABELS[id])}"><svg viewBox="0 0 48 48" width="26" height="26">${iconInner(id, 'currentColor', '#f65b00')}</svg></button>`).join('')}</div>`;
  else if (kind === 'textcolor') html = swatchGrid('set-textcolor', el?.style?.color);
  else if (kind === 'fill') html = swatchGrid('set-fill', el?.fill, { allowNone: true });
  else if (kind === 'iconcolor') html = swatchGrid('set-iconcolor', el?.color);
  else if (kind === 'stroke') html = `${swatchGrid('set-stroke', el?.stroke, { allowNone: el?.type !== 'line' })}<div class="sd-swatch-label">Espessura</div><div class="sd-row sd-wrap">${[0.5, 1, 2, 3, 4, 6, 8].map(w => `<button type="button" class="sd-btn sd-small${(el?.strokeWidth || 0) === w ? ' on' : ''}" data-sd="set-strokewidth" data-value="${w}">${w}</button>`).join('')}</div><div class="sd-swatch-label">Traço</div><div class="sd-row">${[['', 'Contínuo'], ['dash', 'Tracejado'], ['dot', 'Pontilhado']].map(([v, l]) => `<button type="button" class="sd-btn sd-small" data-sd="set-dash" data-value="${v}">${l}</button>`).join('')}</div>`;
  else if (kind === 'valign') html = `<div class="sd-pop-list">${[['top', 'Topo'], ['middle', 'Meio'], ['bottom', 'Embaixo']].map(([v, l]) => `<button type="button" data-sd="set-valign" data-value="${v}">${l}</button>`).join('')}</div>`;
  else if (kind === 'layout') html = `<div class="sd-layouts">${LAYOUTS.map(l => { const s = { ...createSlide(l.id), id: 'lp' }; return `<button type="button" data-sd="add-slide" data-value="${l.id}" title="${esc(l.name)}">${renderSlideSvg(S.deck, s, { editing: true, prefix: `lp${l.id}` })}<span>${esc(l.name)}</span></button>`; }).join('')}</div>`;
  pop.innerHTML = html;
  pop.hidden = false;
  const r = anchor.getBoundingClientRect();
  const app = $('#sd-app').getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(r.left - app.left, app.width - pop.offsetWidth - 8))}px`;
  pop.style.top = `${r.bottom - app.top + 6}px`;
}
function closePop() { const pop = $('#sd-pop'); if (pop) { pop.hidden = true; pop.innerHTML = ''; } S.menu = null; }

// ---- Element ops helpers -------------------------------------------------------------------------
const setOps = (list, fn) => list.map(el => ({ t: 'el.set', s: S.slideId, id: el.id, v: fn(el) })).filter(op => op.v && Object.keys(op.v).length);

function applyToSelection(fn, opts) {
  if (S.editingId) commitTextEdit({ keepSelection: true });
  commit(setOps(selected(), fn), opts);
}
function styleOp(patch, { clearRuns = [] } = {}) {
  applyToSelection(el => {
    if (!isTextual(el)) return null;
    const v = { style: { ...el.style, ...patch } };
    if (clearRuns.length) v.runs = (el.runs || []).map(r => { const c = { ...r }; for (const k of clearRuns) delete c[k]; return c; });
    return v;
  });
}

function addElement(el, { edit = false } = {}) {
  el.id = newId('e');
  commit([{ t: 'el.add', s: S.slideId, el }], { render: 'none' });
  S.sel = new Set([el.id]);
  S.tool = 'select';
  renderAll();
  if (edit) startTextEdit(el.id);
}

function defaultsFor(kind, x, y, w, h) {
  if (kind === 'text') return { type: 'text', x, y, w, h, autoHeight: true, runs: [{ t: '' }], style: { font: '@body', size: 18, weight: 400, color: '@dk1', align: 'left', valign: 'top', lineHeight: 1.25, letterSpacing: 0 }, fill: 'none', stroke: 'none' };
  if (kind === 'shape') return { type: 'shape', shape: S.insertShape, x, y, w, h, fill: '@accent1', stroke: 'none', runs: [{ t: '' }], style: { font: '@body', size: 16, weight: 600, color: '@lt1', align: 'center', valign: 'middle', lineHeight: 1.2, letterSpacing: 0 } };
  return null;
}

// ---- Text editing --------------------------------------------------------------------------------
function startTextEdit(id) {
  const el = slide().elements.find(e => e.id === id);
  if (!isTextual(el) || el.locked || el.auto) return;
  if (S.editingId) commitTextEdit({ keepSelection: true });
  S.editingId = id;
  S.sel = new Set([id]);
  closePop();
  renderStage();
  const canvas = $('#sd-canvas');
  const k = S.scale;
  const wrap = document.createElement('div');
  wrap.className = 'sd-textedit';
  wrap.dataset.noTranslate = '1'; // what the user types is content, not interface text
  wrap.style.cssText = `left:${el.x * k}px;top:${el.y * k}px;width:${el.w * k}px;height:${el.h * k}px;transform:rotate(${el.rot || 0}deg)`;
  const padding = el.type === 'shape' ? Math.min(10, el.h / 6) : 2;
  const inner = document.createElement('div');
  inner.className = 'sd-textedit-inner';
  inner.contentEditable = 'true';
  inner.spellcheck = true;
  inner.setAttribute('role', 'textbox');
  inner.setAttribute('aria-multiline', 'true');
  inner.setAttribute('aria-label', 'Editar texto');
  inner.style.cssText = `${textCss(S.deck, el.style, { padding })};width:${el.w}px;height:${el.h}px;transform:scale(${k});transform-origin:0 0;outline:none`;
  inner.innerHTML = runsText(el.runs) ? runsHtml(S.deck, el.runs, el.style) : (el.style?.bullets ? runsHtml(S.deck, [{ t: '' }], el.style) : '<p style="margin:0"><br></p>');
  inner.dataset.placeholder = el.prompt || '';
  inner.addEventListener('paste', ev => {
    const text = ev.clipboardData?.getData('text/plain');
    if (text == null) return;
    ev.preventDefault();
    document.execCommand('insertText', false, text);
  });
  inner.addEventListener('input', () => { if (el.type === 'text' && el.autoHeight) growEditor(inner, wrap, el); });
  wrap.appendChild(inner);
  canvas.appendChild(wrap);
  try { document.execCommand('styleWithCSS', false, false); } catch {}
  inner.focus();
  const range = document.createRange();
  range.selectNodeContents(inner);
  if (runsText(el.runs)) { const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); }
  renderOverlay();
  renderToolbar();
}

function growEditor(inner, wrap, el) {
  const h = measureText(inner);
  if (h > el.h) { inner.style.height = `${h}px`; wrap.style.height = `${h * S.scale}px`; }
}
function measureText(inner) {
  const prev = inner.style.height;
  inner.style.height = 'auto';
  const h = inner.offsetHeight;
  inner.style.height = prev;
  return h;
}

const rgbToHex = value => {
  const m = String(value).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return '#' + [m[1], m[2], m[3]].map(v => Number(v).toString(16).padStart(2, '0')).join('');
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
};

export function domToRuns(root) {
  const runs = [];
  let paraStarted = false;
  const push = (t, fmt) => {
    if (!t) return;
    const last = runs[runs.length - 1];
    const same = last && ['b', 'i', 'u', 's', 'color', 'href'].every(k => (last[k] || null) === (fmt[k] || null));
    if (same) last.t += t; else runs.push({ t, ...Object.fromEntries(Object.entries(fmt).filter(([, v]) => v)) });
  };
  const newPara = () => { if (paraStarted) push('\n', {}); paraStarted = true; };
  const walk = (node, fmt) => {
    if (node.nodeType === 3) { if (!paraStarted) paraStarted = true; push(node.nodeValue.replace(/ /g, ' '), fmt); return; }
    if (node.nodeType !== 1) return;
    const tag = node.tagName;
    if (tag === 'BR') { push('\n', {}); return; }
    const f = { ...fmt };
    if (tag === 'B' || tag === 'STRONG') f.b = true;
    if (tag === 'I' || tag === 'EM') f.i = true;
    if (tag === 'U') f.u = true;
    if (tag === 'S' || tag === 'STRIKE') f.s = true;
    if (tag === 'A' && node.getAttribute('href')) f.href = node.getAttribute('href');
    const st = node.style;
    if (st) {
      if (st.fontWeight === 'bold' || Number(st.fontWeight) >= 600) f.b = true;
      if (st.fontWeight === 'normal' || (st.fontWeight && Number(st.fontWeight) < 600)) f.b = false;
      if (st.fontStyle === 'italic') f.i = true;
      if (/underline/.test(st.textDecoration || st.textDecorationLine || '')) f.u = true;
      if (/line-through/.test(st.textDecoration || st.textDecorationLine || '')) f.s = true;
    }
    const themeColor = node.getAttribute('data-color');
    const color = tag === 'FONT' ? node.getAttribute('color') : st?.color;
    if (themeColor && /^@/.test(themeColor)) f.color = themeColor;
    else if (color) f.color = rgbToHex(color) || f.color;
    const block = ['P', 'DIV', 'LI'].includes(tag);
    if (block) newPara();
    for (const child of node.childNodes) walk(child, f);
  };
  for (const child of root.childNodes) {
    if (child.nodeType === 1 && ['UL', 'OL'].includes(child.tagName)) { for (const li of child.childNodes) walk(li, {}); }
    else walk(child, {});
  }
  // A paragraph that only holds a <br> yields "\n\n"; collapse the doubled break the walk produces.
  const text = runs.map(r => r.t).join('');
  if (!text.replace(/\n/g, '')) return [{ t: '' }];
  return runs.length ? runs.map(r => ({ ...r, t: r.t.replace(/\n\n/g, '\n') })).filter(r => r.t) : [{ t: '' }];
}

function commitTextEdit({ keepSelection = false } = {}) {
  const id = S.editingId;
  if (!id) return;
  const wrap = host?.querySelector('.sd-textedit');
  const inner = wrap?.querySelector('.sd-textedit-inner');
  S.editingId = null;
  const el = slide().elements.find(e => e.id === id);
  if (!el || !inner) { wrap?.remove(); renderStage(); return; }
  const runs = domToRuns(inner);
  const v = {};
  if (JSON.stringify(runs) !== JSON.stringify(el.runs)) v.runs = runs;
  if (el.type === 'text' && el.autoHeight) {
    const h = round(Math.max(20, measureText(inner)));
    if (Math.abs(h - el.h) > 0.5) v.h = h;
  }
  wrap.remove();
  if (!keepSelection) S.sel = new Set([id]);
  if (el.type === 'text' && !el.placeholder && !runsText(runs).trim()) {
    commit([{ t: 'el.del', s: S.slideId, id }], { render: 'none' });
    S.sel.delete(id);
    renderAll();
    return;
  }
  if (Object.keys(v).length) commit([{ t: 'el.set', s: S.slideId, id, v }], { render: 'stage' });
  else { renderStage(); renderToolbar(); }
}

function execInEditor(cmd, value) {
  const inner = host?.querySelector('.sd-textedit-inner');
  if (!inner) return false;
  inner.focus();
  document.execCommand(cmd, false, value);
  if (single()?.autoHeight) growEditor(inner, inner.parentElement, single());
  return true;
}

// ---- Pointer interaction on the canvas ----------------------------------------------------------
function toSlide(ev) {
  const r = $('#sd-canvas').getBoundingClientRect();
  return { x: (ev.clientX - r.left) / S.scale, y: (ev.clientY - r.top) / S.scale };
}

function snapMove(rect, ignore) {
  const t = 6 / S.scale;
  const xs = [0, PAGE.width / 2, PAGE.width], ys = [0, PAGE.height / 2, PAGE.height];
  for (const el of slide().elements) {
    if (ignore.has(el.id)) continue;
    const b = elementBounds(el);
    xs.push(b.x, b.x + b.w / 2, b.x + b.w); ys.push(b.y, b.y + b.h / 2, b.y + b.h);
  }
  const guides = [];
  let dx = 0, dy = 0, bestX = t, bestY = t;
  for (const [edge, off] of [[rect.x, 0], [rect.x + rect.w / 2, 0], [rect.x + rect.w, 0]]) for (const v of xs) { const d = v - edge - off; if (Math.abs(d) < Math.abs(bestX)) { bestX = d; dx = d; guides[0] = { axis: 'x', v }; } }
  for (const [edge] of [[rect.y], [rect.y + rect.h / 2], [rect.y + rect.h]]) for (const v of ys) { const d = v - edge; if (Math.abs(d) < Math.abs(bestY)) { bestY = d; dy = d; guides[1] = { axis: 'y', v }; } }
  return { dx: Math.abs(bestX) < t ? dx : 0, dy: Math.abs(bestY) < t ? dy : 0, guides: guides.filter(Boolean) };
}

function onCanvasDown(ev) {
  if (ev.button !== 0 || S.present) return;
  const canvas = $('#sd-canvas');
  if (ev.target.closest('.sd-textedit')) return;
  if (S.editingId) commitTextEdit({ keepSelection: true });
  closePop();
  const p = toSlide(ev);
  const handle = ev.target.closest('[data-handle]')?.dataset.handle;
  const el = single();
  if (handle && el) { beginHandleDrag(ev, el, handle, p); return; }
  if (S.tool !== 'select') { beginDraw(ev, p); return; }
  const hitId = ev.target.closest('[data-el-id]')?.getAttribute('data-el-id');
  if (hitId) {
    if (ev.shiftKey || ev.ctrlKey || ev.metaKey) { if (S.sel.has(hitId)) S.sel.delete(hitId); else S.sel.add(hitId); }
    else if (!S.sel.has(hitId)) S.sel = new Set([hitId]);
    renderOverlay(); renderToolbar(); renderPanel();
    beginMove(ev, p);
    return;
  }
  S.sel.clear();
  S.drag = { kind: 'marquee', start: p, marquee: { x: p.x, y: p.y, w: 0, h: 0 } };
  canvas.setPointerCapture(ev.pointerId);
  renderOverlay(); renderToolbar(); renderPanel();
}

function beginMove(ev, p) {
  const list = selected().filter(e => !e.locked);
  if (!list.length) return;
  S.drag = { kind: 'move', start: p, orig: list.map(e => clone(e)), moved: false };
  $('#sd-canvas').setPointerCapture(ev.pointerId);
}

function beginHandleDrag(ev, el, handle, p) {
  S.drag = { kind: handle === 'rot' ? 'rotate' : handle === 'p1' || handle === 'p2' ? 'endpoint' : 'resize', handle, start: p, orig: clone(el), moved: false };
  $('#sd-canvas').setPointerCapture(ev.pointerId);
}

function beginDraw(ev, p) {
  S.drag = { kind: 'draw', start: p, draft: { x: p.x, y: p.y, w: 0, h: 0 }, moved: false };
  $('#sd-canvas').setPointerCapture(ev.pointerId);
}

function onCanvasMove(ev) {
  const d = S.drag;
  if (!d) return;
  const p = toSlide(ev);
  let dx = p.x - d.start.x, dy = p.y - d.start.y;
  if (!d.moved && Math.hypot(dx, dy) * S.scale < 3) return;
  d.moved = true;
  const els = slide().elements;
  if (d.kind === 'marquee' || d.kind === 'draw') {
    const box = { x: Math.min(p.x, d.start.x), y: Math.min(p.y, d.start.y), w: Math.abs(dx), h: Math.abs(dy) };
    if (d.kind === 'draw' && S.tool === 'line') {
      let x2 = p.x, y2 = p.y;
      if (ev.shiftKey) { const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4); const len = Math.hypot(dx, dy); x2 = d.start.x + Math.cos(a) * len; y2 = d.start.y + Math.sin(a) * len; }
      d.line = { x1: d.start.x, y1: d.start.y, x2, y2 };
      d.draft = { x: Math.min(d.start.x, x2), y: Math.min(d.start.y, y2), w: Math.abs(x2 - d.start.x), h: Math.abs(y2 - d.start.y) };
    } else if (d.kind === 'draw' && ev.shiftKey) { const s = Math.max(box.w, box.h); d.draft = { x: dx < 0 ? d.start.x - s : d.start.x, y: dy < 0 ? d.start.y - s : d.start.y, w: s, h: s }; }
    else d[d.kind === 'draw' ? 'draft' : 'marquee'] = box;
    if (d.kind === 'marquee') {
      S.sel = new Set(els.filter(e => { const b = elementBounds(e); return b.x < box.x + box.w && b.x + b.w > box.x && b.y < box.y + box.h && b.y + b.h > box.y; }).map(e => e.id));
    }
    renderOverlay();
    return;
  }
  if (d.kind === 'move') {
    if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    const moving = d.orig.map(o => ({ ...o, ...(o.type === 'line' ? { x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy } : { x: o.x + dx, y: o.y + dy }) }));
    const snap = ev.altKey ? { dx: 0, dy: 0, guides: [] } : snapMove(boundsOf(moving), new Set(d.orig.map(o => o.id)));
    for (const o of d.orig) {
      const live = els.find(e => e.id === o.id);
      if (o.type === 'line') Object.assign(live, { x1: round(o.x1 + dx + snap.dx), y1: round(o.y1 + dy + snap.dy), x2: round(o.x2 + dx + snap.dx), y2: round(o.y2 + dy + snap.dy) });
      else Object.assign(live, { x: round(o.x + dx + snap.dx), y: round(o.y + dy + snap.dy) });
    }
    liveRender(snap.guides);
    return;
  }
  const o = d.orig;
  const live = els.find(e => e.id === o.id);
  if (d.kind === 'endpoint') {
    const key = d.handle === 'p1' ? ['x1', 'y1'] : ['x2', 'y2'];
    const other = d.handle === 'p1' ? [o.x2, o.y2] : [o.x1, o.y1];
    let nx = o[key[0]] + dx, ny = o[key[1]] + dy;
    if (ev.shiftKey) { const a = Math.round(Math.atan2(ny - other[1], nx - other[0]) / (Math.PI / 4)) * (Math.PI / 4); const len = Math.hypot(nx - other[0], ny - other[1]); nx = other[0] + Math.cos(a) * len; ny = other[1] + Math.sin(a) * len; }
    live[key[0]] = round(nx); live[key[1]] = round(ny);
    liveRender();
    return;
  }
  if (d.kind === 'rotate') {
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    let a = Math.atan2(p.y - cy, p.x - cx) * 180 / Math.PI + 90;
    if (ev.shiftKey) a = Math.round(a / 15) * 15;
    else for (const s of [0, 90, 180, 270, 360, -90]) if (Math.abs(a - s) < 3) a = s;
    a = ((a + 540) % 360) - 180;
    live.rot = round(a);
    if (!live.rot) delete live.rot;
    liveRender();
    return;
  }
  if (d.kind === 'resize') {
    const h = d.handle;
    const sx = h.includes('e') ? 1 : h.includes('w') ? -1 : 0;
    const sy = h.includes('s') ? 1 : h.includes('n') ? -1 : 0;
    const th = (o.rot || 0) * Math.PI / 180, cos = Math.cos(th), sin = Math.sin(th);
    const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos;
    let nw = Math.max(4, o.w + sx * lx), nh = Math.max(4, o.h + sy * ly);
    const keepRatio = sx && sy && (o.type === 'image' || o.type === 'icon' ? !ev.shiftKey : ev.shiftKey);
    if (keepRatio) { const r = Math.max(nw / o.w, nh / o.h); nw = o.w * r; nh = o.h * r; }
    const ax = -sx * o.w / 2, ay = -sy * o.h / 2;
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    const Ax = cx + ax * cos - ay * sin, Ay = cy + ax * sin + ay * cos;
    const bx = -sx * nw / 2, by = -sy * nh / 2;
    const ncx = Ax - (bx * cos - by * sin), ncy = Ay - (bx * sin + by * cos);
    Object.assign(live, { x: round(ncx - nw / 2), y: round(ncy - nh / 2), w: round(nw), h: round(nh) });
    if (live.autoHeight && sy) delete live.autoHeight;
    liveRender();
  }
}

let liveFrame = 0;
function liveRender(guides = []) {
  cancelAnimationFrame(liveFrame);
  liveFrame = requestAnimationFrame(() => { renderStage(); renderOverlay(guides); });
}

function onCanvasUp(ev) {
  const d = S.drag;
  if (!d) return;
  S.drag = null;
  cancelAnimationFrame(liveFrame); // a frame queued by the last pointermove would redraw the snap guides
  const canvas = $('#sd-canvas');
  if (canvas?.hasPointerCapture?.(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId);
  if (d.kind === 'marquee') { renderOverlay(); renderToolbar(); renderPanel(); return; }
  if (d.kind === 'draw') { finishDraw(d); return; }
  if (!d.moved) {
    renderOverlay();
    return;
  }
  const origs = d.kind === 'move' ? d.orig : [d.orig];
  const ops = [];
  for (const o of origs) {
    const live = slide().elements.find(e => e.id === o.id);
    const keys = ['x', 'y', 'w', 'h', 'rot', 'x1', 'y1', 'x2', 'y2', 'autoHeight'];
    const v = {};
    for (const k of keys) if (live[k] !== o[k]) v[k] = live[k] === undefined ? null : live[k];
    for (const k of keys) { if (o[k] === undefined) delete live[k]; else live[k] = o[k]; }
    if (Object.keys(v).length) ops.push({ t: 'el.set', s: S.slideId, id: o.id, v });
  }
  commit(ops, { render: 'stage' });
  renderPanel();
}

function finishDraw(d) {
  const tool = S.tool;
  const p = d.start;
  if (tool === 'line') {
    const line = d.moved && d.line ? d.line : { x1: p.x, y1: p.y, x2: p.x + 200, y2: p.y };
    const kind = S.insertLine;
    addElement({ type: 'line', ...Object.fromEntries(Object.entries(line).map(([k, v]) => [k, round(v)])), stroke: '@dk1', strokeWidth: 2,
      ...(kind === 'arrow' ? { arrowEnd: 'arrow' } : kind === 'double' ? { arrowStart: 'arrow', arrowEnd: 'arrow' } : kind === 'dashed' ? { dash: 'dash' } : {}) });
    return;
  }
  const box = d.moved && d.draft.w > 4 && d.draft.h > 4 ? d.draft : tool === 'text' ? { x: p.x, y: p.y, w: 320, h: 40 } : { x: p.x - 80, y: p.y - 50, w: 160, h: 100 };
  const el = defaultsFor(tool, round(box.x), round(box.y), round(box.w), round(box.h));
  if (tool === 'text' && d.moved) el.autoHeight = false;
  addElement(el, { edit: tool === 'text' });
}

function onCanvasDbl(ev) {
  if (ev.target.closest('.sd-textedit')) return;
  // Pointer capture retargets click/dblclick to the canvas, so hit-test at the pointer position instead.
  const hit = document.elementFromPoint(ev.clientX, ev.clientY);
  const id = (hit?.closest('[data-el-id]') || ev.target.closest('[data-el-id]'))?.getAttribute('data-el-id');
  if (id) startTextEdit(id);
}

// ---- Images ----------------------------------------------------------------------------------------
function pickImage() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
}

export async function compressImage(file, { max = 1600 } = {}) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw Error('Use uma imagem PNG, JPG, WebP ou GIF.');
  if (file.size > 25_000_000) throw Error('A imagem pode ter até 25 MB.');
  // data: URL instead of blob: — the app's CSP allows img-src data: but not blob:.
  const url = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(Error('Não foi possível ler a imagem.')); r.readAsDataURL(file); });
  {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(Error('Não foi possível ler a imagem.')); i.src = url; });
    const limit = 450_000 * 1.33;
    for (const [dim, quality] of [[max, 0.88], [max, 0.78], [1280, 0.74], [1024, 0.7], [800, 0.66]]) {
      const ratio = Math.min(1, dim / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * ratio)), h = Math.max(1, Math.round(img.naturalHeight * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const keepAlpha = file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/gif';
      const data = canvas.toDataURL(keepAlpha ? 'image/webp' : 'image/jpeg', quality);
      if (data.length <= limit) return { src: data, width: w, height: h };
    }
    throw Error('A imagem é grande demais. Tente uma imagem menor.');
  }
}

async function insertImageFile(file, at) {
  try {
    const { src, width, height } = await compressImage(file);
    const scale = Math.min(1, (PAGE.width * 0.6) / width, (PAGE.height * 0.6) / height);
    const w = round(width * scale), h = round(height * scale);
    const x = at ? at.x - w / 2 : (PAGE.width - w) / 2, y = at ? at.y - h / 2 : (PAGE.height - h) / 2;
    addElement({ type: 'image', src, x: round(x), y: round(y), w, h, fit: 'cover' });
  } catch (e) { flash(e.message, true); }
}

// ---- Commands ------------------------------------------------------------------------------------
function zOrder(dir) {
  const els = slide().elements;
  const ids = selected().map(e => e.id);
  const ops = [];
  const order = dir > 0 ? [...ids].sort((a, b) => els.findIndex(e => e.id === b) - els.findIndex(e => e.id === a)) : [...ids].sort((a, b) => els.findIndex(e => e.id === a) - els.findIndex(e => e.id === b));
  order.forEach((id, n) => ops.push({ t: 'el.z', s: S.slideId, id, i: dir > 0 ? els.length - 1 - n : n }));
  commit(ops, { render: 'stage' });
}

function duplicateSelection(offset = 12) {
  const list = selected();
  if (!list.length) return;
  const copies = list.map(el => {
    const c = clone(el); c.id = newId('e');
    if (c.type === 'line') { c.x1 += offset; c.x2 += offset; c.y1 += offset; c.y2 += offset; } else { c.x += offset; c.y += offset; }
    delete c.placeholder; delete c.prompt;
    return c;
  });
  commit(copies.map(el => ({ t: 'el.add', s: S.slideId, el })), { render: 'none' });
  S.sel = new Set(copies.map(c => c.id));
  renderAll();
}

function deleteSelection() {
  const ids = selected().map(e => e.id);
  if (!ids.length) return;
  commit(ids.map(id => ({ t: 'el.del', s: S.slideId, id })), { render: 'none' });
  S.sel.clear();
  renderAll();
}

function nudge(dx, dy) {
  const list = selected().filter(e => !e.locked);
  commit(setOps(list, el => el.type === 'line' ? { x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy } : { x: round(el.x + dx), y: round(el.y + dy) }), { render: 'stage' });
}

function alignSelection(mode) {
  const list = selected().filter(e => !e.locked);
  if (!list.length) return;
  const ref = list.length > 1 ? boundsOf(list) : { x: 0, y: 0, w: PAGE.width, h: PAGE.height };
  commit(setOps(list, el => {
    const b = elementBounds(el);
    let dx = 0, dy = 0;
    if (mode === 'left') dx = ref.x - b.x; if (mode === 'right') dx = ref.x + ref.w - (b.x + b.w); if (mode === 'hcenter') dx = ref.x + ref.w / 2 - (b.x + b.w / 2);
    if (mode === 'top') dy = ref.y - b.y; if (mode === 'bottom') dy = ref.y + ref.h - (b.y + b.h); if (mode === 'vcenter') dy = ref.y + ref.h / 2 - (b.y + b.h / 2);
    if (!dx && !dy) return null;
    return el.type === 'line' ? { x1: round(el.x1 + dx), y1: round(el.y1 + dy), x2: round(el.x2 + dx), y2: round(el.y2 + dy) } : { x: round(el.x + dx), y: round(el.y + dy) };
  }), { render: 'stage' });
  renderPanel();
}

function distribute(axis) {
  const list = selected().filter(e => !e.locked && e.type !== 'line');
  if (list.length < 3) return;
  const key = axis === 'h' ? 'x' : 'y', size = axis === 'h' ? 'w' : 'h';
  const sorted = [...list].sort((a, b) => a[key] - b[key]);
  const total = sorted.reduce((s, e) => s + e[size], 0);
  const span = sorted.at(-1)[key] + sorted.at(-1)[size] - sorted[0][key];
  const gap = (span - total) / (sorted.length - 1);
  let pos = sorted[0][key];
  const target = new Map();
  for (const e of sorted) { target.set(e.id, round(pos)); pos += e[size] + gap; }
  commit(setOps(list, el => target.get(el.id) !== el[key] ? { [key]: target.get(el.id) } : null), { render: 'stage' });
}

function addSlide(layoutId) {
  const s = createSlide(layoutId);
  commit([{ t: 'slide.add', slide: s, i: slideIndex() + 1 }], { render: 'none' });
  S.slideId = s.id; S.sel.clear();
  closePop();
  renderAll();
  $(`.sd-thumb[data-slide="${CSS.escape(s.id)}"]`)?.scrollIntoView({ block: 'nearest' });
}

function duplicateSlide(id) {
  const i = S.deck.slides.findIndex(s => s.id === id);
  const copy = clone(S.deck.slides[i]);
  copy.id = newId('s');
  copy.elements = copy.elements.map(e => ({ ...e, id: newId('e') }));
  commit([{ t: 'slide.add', slide: copy, i: i + 1 }], { render: 'none' });
  S.slideId = copy.id; S.sel.clear();
  renderAll();
}

function selectSlide(id) {
  if (S.editingId) commitTextEdit();
  if (id === S.slideId) return;
  S.slideId = id; S.sel.clear(); closePop();
  if (S.panel === 'format') S.panel = null;
  host.querySelectorAll('.sd-thumb').forEach(t => { const on = t.dataset.slide === id; t.classList.toggle('on', on); t.setAttribute('aria-current', String(on)); });
  renderStage(); renderToolbar(); renderNotes(); renderPanel();
}

function setTheme(theme) {
  commit([{ t: 'deck.set', v: { theme } }]);
}

// ---- Present mode --------------------------------------------------------------------------------
function visibleSlides() { return S.deck.slides.filter(s => !s.skipped); }
function startPresent(fromCurrent = true) {
  if (S.editingId) commitTextEdit();
  const list = visibleSlides();
  if (!list.length) { flash('Todos os slides estão marcados para pular.', true); return; }
  const i = fromCurrent ? Math.max(0, list.findIndex(s => s.id === S.slideId)) : 0;
  S.present = { index: i };
  renderPresent();
  document.documentElement.requestFullscreen?.().catch(() => {});
}
function renderPresent() {
  let layer = host.querySelector('.sd-present');
  if (!S.present) { layer?.remove(); return; }
  const list = visibleSlides();
  S.present.index = Math.max(0, Math.min(list.length - 1, S.present.index));
  if (!layer) { layer = document.createElement('div'); layer.className = 'sd-present'; layer.setAttribute('role', 'dialog'); layer.setAttribute('aria-label', 'Apresentação'); host.querySelector('.sd-app').appendChild(layer); }
  const s = list[S.present.index];
  layer.innerHTML = `<div class="sd-present-slide">${renderSlideSvg(S.deck, s, { index: S.present.index, total: list.length, prefix: 'pr' })}</div>
    <div class="sd-present-bar"><button type="button" data-sd="present-prev" aria-label="Slide anterior">‹</button><span>${S.present.index + 1} / ${list.length}</span><button type="button" data-sd="present-next" aria-label="Próximo slide">›</button><button type="button" data-sd="present-exit" aria-label="Sair da apresentação">Sair</button></div>`;
}
function stopPresent() { S.present = null; renderPresent(); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); }

// ---- Print / PDF ---------------------------------------------------------------------------------
function printDeck() {
  if (S.editingId) commitTextEdit();
  document.querySelector('.sd-print')?.remove();
  const box = document.createElement('div');
  box.className = 'sd-print';
  const list = visibleSlides();
  box.innerHTML = list.map((s, i) => `<div class="sd-print-page">${renderSlideSvg(S.deck, s, { index: i, total: list.length, prefix: `pp${i}` })}</div>`).join('');
  document.body.appendChild(box);
  document.body.classList.add('sd-printing');
  const done = () => { box.remove(); document.body.classList.remove('sd-printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 60);
}

// ---- Event wiring --------------------------------------------------------------------------------
function bindChrome() {
  const app = $('#sd-app');
  app.addEventListener('click', onClick);
  app.addEventListener('mousedown', ev => { if (ev.target.closest('.sd-toolbar button, .sd-pop button') && S.editingId) ev.preventDefault(); });
  app.addEventListener('change', onChange);
  app.addEventListener('input', onInput);
  const canvas = $('#sd-canvas');
  canvas.addEventListener('pointerdown', onCanvasDown);
  canvas.addEventListener('pointermove', onCanvasMove);
  canvas.addEventListener('pointerup', onCanvasUp);
  canvas.addEventListener('pointercancel', onCanvasUp);
  canvas.addEventListener('dblclick', onCanvasDbl);
  const stage = $('#sd-stage');
  stage.addEventListener('pointerdown', ev => { if (ev.target === stage) { if (S.editingId) commitTextEdit(); S.sel.clear(); closePop(); renderOverlay(); renderToolbar(); renderPanel(); } });
  stage.addEventListener('dragover', ev => { if ([...(ev.dataTransfer?.items || [])].some(i => i.kind === 'file')) ev.preventDefault(); });
  stage.addEventListener('drop', ev => {
    const file = [...(ev.dataTransfer?.files || [])].find(f => f.type.startsWith('image/'));
    if (!file) return;
    ev.preventDefault();
    insertImageFile(file, $('#sd-canvas').contains(ev.target) ? toSlide(ev) : null);
  });
  stage.addEventListener('wheel', ev => {
    if (!ev.ctrlKey) return;
    ev.preventDefault();
    const steps = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];
    const cur = S.scale;
    const next = ev.deltaY < 0 ? steps.find(s => s > cur + 0.01) : [...steps].reverse().find(s => s < cur - 0.01);
    if (next) { S.zoom = next; fitStage(); renderStage(); renderToolbar(); }
  }, { passive: false });
  const notes = $('#sd-notes');
  notes.addEventListener('change', () => { const v = notes.value.slice(0, 5000); if (v !== (slide().notes || '')) commit([{ t: 'slide.set', id: S.slideId, v: { notes: v } }], { render: 'none' }); });
  const rail = $('#sd-rail');
  rail.addEventListener('dragstart', ev => { const t = ev.target.closest('.sd-thumb'); if (!t) return; ev.dataTransfer.setData('text/x-sd-slide', t.dataset.slide); ev.dataTransfer.effectAllowed = 'move'; t.classList.add('dragging'); });
  rail.addEventListener('dragend', ev => ev.target.closest('.sd-thumb')?.classList.remove('dragging'));
  rail.addEventListener('dragover', ev => {
    if (![...ev.dataTransfer.types].includes('text/x-sd-slide')) return;
    ev.preventDefault();
    rail.querySelectorAll('.drop-before,.drop-after').forEach(n => n.classList.remove('drop-before', 'drop-after'));
    const t = ev.target.closest('.sd-thumb');
    if (t) { const r = t.getBoundingClientRect(); t.classList.add(ev.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after'); }
  });
  rail.addEventListener('drop', ev => {
    const id = ev.dataTransfer.getData('text/x-sd-slide');
    const t = ev.target.closest('.sd-thumb');
    rail.querySelectorAll('.drop-before,.drop-after').forEach(n => n.classList.remove('drop-before', 'drop-after'));
    if (!id || !t || t.dataset.slide === id) return;
    ev.preventDefault();
    const r = t.getBoundingClientRect();
    const from = S.deck.slides.findIndex(s => s.id === id);
    let to = S.deck.slides.findIndex(s => s.id === t.dataset.slide) + (ev.clientY < r.top + r.height / 2 ? 0 : 1);
    if (from < to) to -= 1;
    if (from !== to) commit([{ t: 'slide.move', id, i: to }]);
  });
  rail.addEventListener('keydown', ev => {
    const t = ev.target.closest('.sd-thumb');
    if (!t) return;
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selectSlide(t.dataset.slide); }
  });
}

async function onClick(ev) {
  const thumb = ev.target.closest('.sd-thumb');
  const btn = ev.target.closest('[data-sd]');
  if (thumb && !btn) { selectSlide(thumb.dataset.slide); return; }
  if (!btn || btn.disabled) { if (!ev.target.closest('.sd-pop') && !ev.target.closest('.sd-toolbar')) closePop(); return; }
  const a = btn.dataset.sd;
  const value = btn.dataset.value;
  const el = single();
  switch (a) {
    case 'exit': if (S.editingId) commitTextEdit(); await flushSave(); onExit?.(); return;
    case 'reload': reloadFromServer(); return;
    case 'present': startPresent(true); return;
    case 'present-prev': S.present.index--; renderPresent(); return;
    case 'present-next': S.present.index++; renderPresent(); return;
    case 'present-exit': stopPresent(); return;
    case 'pdf': printDeck(); return;
    case 'share': if (S.editingId) commitTextEdit(); await flushSave(); env.share?.(S.deck.id); return;
    case 'undo': if (S.editingId) commitTextEdit(); undo(); return;
    case 'redo': if (S.editingId) commitTextEdit(); redo(); return;
    case 'tool-select': S.tool = 'select'; renderToolbar(); $('#sd-canvas').dataset.tool = 'select'; return;
    case 'tool-text': S.tool = S.tool === 'text' ? 'select' : 'text'; S.sel.clear(); renderToolbar(); renderOverlay(); $('#sd-canvas').dataset.tool = S.tool; return;
    case 'insert-image': { const f = await pickImage(); if (f) insertImageFile(f); return; }
    case 'menu-shape': openPop('shape', btn); return;
    case 'menu-line': openPop('line', btn); return;
    case 'menu-icon': openPop('icon', btn); return;
    case 'menu-textcolor': openPop('textcolor', btn); return;
    case 'menu-fill': openPop('fill', btn); return;
    case 'menu-stroke': openPop('stroke', btn); return;
    case 'menu-iconcolor': openPop('iconcolor', btn); return;
    case 'menu-valign': openPop('valign', btn); return;
    case 'menu-layout': openPop('layout', btn); return;
    case 'pick-shape': S.insertShape = value; S.tool = 'shape'; S.sel.clear(); closePop(); renderToolbar(); renderOverlay(); $('#sd-canvas').dataset.tool = 'shape'; return;
    case 'pick-line': S.insertLine = value; S.tool = 'line'; S.sel.clear(); closePop(); renderToolbar(); renderOverlay(); $('#sd-canvas').dataset.tool = 'line'; return;
    case 'pick-icon': closePop(); addElement({ type: 'icon', icon: value, x: 440, y: 230, w: 80, h: 80, color: '@dk1', accent: '@accent1' }); return;
    case 'add-slide': addSlide(value); return;
    case 'set-textcolor':
      if (S.editingId) { const hex = value.startsWith('@') ? resolveColor(S.deck, value) : value; execInEditor('foreColor', hex); return; }
      closePop(); styleOp({ color: value }, { clearRuns: ['color'] }); return;
    case 'set-fill': closePop(); applyToSelection(e => (e.type === 'shape' || e.type === 'text') ? { fill: value } : null); return;
    case 'set-stroke': closePop(); applyToSelection(e => e.type === 'icon' ? null : { stroke: value, ...(value !== 'none' && !e.strokeWidth ? { strokeWidth: e.type === 'line' ? 2 : 1 } : {}) }); return;
    case 'set-strokewidth': closePop(); applyToSelection(e => e.type === 'icon' ? null : { strokeWidth: Number(value), ...(e.type !== 'line' && (!e.stroke || e.stroke === 'none') ? { stroke: '@dk1' } : {}) }); return;
    case 'set-dash': closePop(); applyToSelection(e => e.type === 'icon' || e.type === 'image' ? null : { dash: value || null }); return;
    case 'set-iconcolor': closePop(); applyToSelection(e => e.type === 'icon' ? { color: value } : null); return;
    case 'set-valign': closePop(); styleOp({ valign: value }); return;
    case 'bold': {
      if (execInEditor('bold')) return;
      const on = !selected().filter(isTextual).every(e => (e.runs || []).every(r => r.b || !r.t) || (e.style?.weight || 400) >= 700);
      applyToSelection(e => isTextual(e) ? { runs: (e.runs || []).map(r => ({ ...r, b: on || undefined })).map(r => { if (!r.b) delete r.b; return r; }), style: { ...e.style, weight: on ? Math.max(700, e.style?.weight || 400) : 400 } } : null);
      return;
    }
    case 'italic': if (execInEditor('italic')) return; styleOp({ italic: !(single() || selected()[0])?.style?.italic }); return;
    case 'underline': if (execInEditor('underline')) return; styleOp({ underline: !(single() || selected()[0])?.style?.underline }); return;
    case 'align-left': case 'align-center': case 'align-right': case 'align-justify': styleOp({ align: a.slice(6) }); refreshEditorStyle(); return;
    case 'bullets': styleOp({ bullets: (el?.style?.bullets === 'disc') ? null : 'disc' }); return;
    case 'numbers': styleOp({ bullets: (el?.style?.bullets === 'number') ? null : 'number' }); return;
    case 'size-up': case 'size-down': {
      const steps = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 96, 120, 160];
      applyToSelection(e => {
        if (!isTextual(e)) return null;
        const cur = e.style?.size || 18;
        const next = a === 'size-up' ? steps.find(s => s > cur + 0.01) || cur + 8 : [...steps].reverse().find(s => s < cur - 0.01) || Math.max(4, cur - 1);
        return { style: { ...e.style, size: next }, runs: (e.runs || []).map(r => { const c = { ...r }; delete c.size; return c; }) };
      });
      refreshEditorStyle();
      return;
    }
    case 'front': zOrder(1); return;
    case 'back': zOrder(-1); return;
    case 'duplicate': duplicateSelection(); return;
    case 'delete': deleteSelection(); return;
    case 'panel-format': case 'panel-theme': case 'panel-background': { const p = a.slice(6); S.panel = S.panel === p ? null : p; renderPanel(); renderToolbar(); return; }
    case 'panel-close': S.panel = null; renderPanel(); renderToolbar(); return;
    case 'theme-apply': {
      const t = clone(THEMES[btn.dataset.id]);
      if (t.id === 'proposta') { const cur = themeOf(S.deck); if (cur.id === 'proposta') { t.colors.dk1 = cur.colors.dk1; t.colors.accent1 = cur.colors.accent1; } }
      setTheme(t); return;
    }
    case 'brand-logo': {
      const f = await pickImage();
      if (!f) return;
      try { const { src } = await compressImage(f, { max: 600 }); commit([{ t: 'deck.set', v: { brand: { ...S.deck.brand, logo: src } } }]); } catch (e) { flash(e.message, true); }
      return;
    }
    case 'brand-logo-remove': commit([{ t: 'deck.set', v: { brand: { ...S.deck.brand, logo: '' } } }]); return;
    case 'bg-color': commit([{ t: 'slide.set', id: S.slideId, v: { background: value } }]); return;
    case 'bg-reset': commit([{ t: 'slide.set', id: S.slideId, v: { background: null } }]); return;
    case 'bg-image': {
      const f = await pickImage();
      if (!f) return;
      try { const { src } = await compressImage(f); commit([{ t: 'slide.set', id: S.slideId, v: { background: { image: src, fit: 'cover' } } }]); } catch (e) { flash(e.message, true); }
      return;
    }
    case 'bg-all': { const bg = slide().background ?? null; commit(S.deck.slides.filter(s => s.id !== S.slideId).map(s => ({ t: 'slide.set', id: s.id, v: { background: clone(bg) } }))); flash('Plano de fundo aplicado a todos os slides.'); return; }
    case 'flip-h': applyToSelection(e => e.type === 'line' ? null : { flipH: e.flipH ? null : true }); return;
    case 'flip-v': applyToSelection(e => e.type === 'line' ? null : { flipV: e.flipV ? null : true }); return;
    case 'image-replace': {
      const f = await pickImage();
      if (!f || el?.type !== 'image') return;
      try { const { src } = await compressImage(f); commit([{ t: 'el.set', s: S.slideId, id: el.id, v: { src } }], { render: 'stage' }); } catch (e) { flash(e.message, true); }
      return;
    }
    case 'distribute-h': distribute('h'); return;
    case 'distribute-v': distribute('v'); return;
    case 'slide-duplicate': ev.stopPropagation(); duplicateSlide(btn.dataset.id); return;
    case 'slide-skip': { ev.stopPropagation(); const s = S.deck.slides.find(x => x.id === btn.dataset.id); commit([{ t: 'slide.set', id: s.id, v: { skipped: !s.skipped } }]); return; }
    case 'slide-delete': {
      ev.stopPropagation();
      const i = S.deck.slides.findIndex(x => x.id === btn.dataset.id);
      commit([{ t: 'slide.del', id: btn.dataset.id }], { render: 'none' });
      if (S.slideId === btn.dataset.id) { S.slideId = S.deck.slides[Math.max(0, i - 1)].id; S.sel.clear(); }
      renderAll();
      return;
    }
    default:
      if (a.startsWith('align-')) alignSelection(a.slice(6));
  }
}

function refreshEditorStyle() {
  const inner = host?.querySelector('.sd-textedit-inner');
  const el = single();
  if (!inner || !el) return;
  const k = S.scale;
  inner.style.cssText = `${textCss(S.deck, el.style, { padding: el.type === 'shape' ? Math.min(10, el.h / 6) : 2 })};width:${el.w}px;height:${el.h}px;transform:scale(${k});transform-origin:0 0;outline:none`;
}

function onInput(ev) {
  const name = ev.target.dataset.sdInput;
  if (name === 'opacity') { const label = ev.target.previousElementSibling; if (label) label.textContent = `Opacidade: ${ev.target.value}%`; }
}

function onChange(ev) {
  const t = ev.target;
  const name = t.dataset.sdInput || (t.dataset.sdColor ? `color:${t.dataset.sdColor}` : '');
  if (!name) return;
  const el = single();
  const val = t.type === 'checkbox' ? t.checked : t.value;
  const theme = themeOf(S.deck);
  if (name === 'title') { const v = val.trim().slice(0, 120); if (v && v !== S.deck.title) commit([{ t: 'deck.set', v: { title: v } }], { render: 'none' }); return; }
  if (name === 'zoom') { S.zoom = val === 'fit' ? 'fit' : Number(val); fitStage(); renderStage(); return; }
  if (name === 'font') { styleOp({ font: val }); refreshEditorStyle(); return; }
  if (name === 'size') { const n = Number(String(val).replace(',', '.')); if (n >= 4 && n <= 400) { applyToSelection(e => isTextual(e) ? { style: { ...e.style, size: n }, runs: (e.runs || []).map(r => { const c = { ...r }; delete c.size; return c; }) } : null); refreshEditorStyle(); } return; }
  if (name.startsWith('theme-color:')) { const key = name.slice(12); setTheme({ ...clone(theme), id: theme.id, colors: { ...theme.colors, [key]: val } }); return; }
  if (name.startsWith('theme-font:')) { const key = name.slice(11); setTheme({ ...clone(theme), fonts: { ...theme.fonts, [key]: val } }); return; }
  if (name === 'brand-name') { commit([{ t: 'deck.set', v: { brand: { ...S.deck.brand, name: val.slice(0, 80) } } }]); return; }
  if (name === 'hide-master') { commit([{ t: 'slide.set', id: S.slideId, v: { hideMaster: val } }]); return; }
  if (name.startsWith('color:')) {
    const action = name.slice(6);
    const fake = { dataset: { sd: action, value: val }, disabled: false, closest: () => null };
    onClick({ target: { closest: sel => sel === '[data-sd]' ? fake : null }, stopPropagation() {} });
    return;
  }
  if (name.startsWith('geo:')) {
    const key = name.slice(4); const n = Number(val);
    if (!el || !Number.isFinite(n)) return;
    if (key === 'w' || key === 'h') { if (n < 1) return; commit([{ t: 'el.set', s: S.slideId, id: el.id, v: { [key]: n, ...(key === 'h' && el.autoHeight ? { autoHeight: null } : {}) } }], { render: 'stage' }); }
    else commit([{ t: 'el.set', s: S.slideId, id: el.id, v: { [key]: key === 'rot' ? (n ? ((n + 540) % 360) - 180 : null) : n } }], { render: 'stage' });
    return;
  }
  if (name.startsWith('line:')) { const n = Number(val); if (el && Number.isFinite(n)) commit([{ t: 'el.set', s: S.slideId, id: el.id, v: { [name.slice(5)]: n } }], { render: 'stage' }); return; }
  if (name === 'opacity') { const n = Number(val) / 100; applyToSelection(() => ({ opacity: n >= 1 ? null : n }), { render: 'stage' }); return; }
  if (name === 'shadow') { applyToSelection(e => e.type === 'line' || e.type === 'icon' ? null : { shadow: val || null }, { render: 'stage' }); return; }
  if (name === 'locked') { applyToSelection(() => ({ locked: val || null }), { render: 'stage' }); renderPanel(); return; }
  if (name === 'radius') { if (el) commit([{ t: 'el.set', s: S.slideId, id: el.id, v: { radius: Math.max(0, Number(val) || 0) } }], { render: 'stage' }); return; }
  if (name === 'fit') { if (el) commit([{ t: 'el.set', s: S.slideId, id: el.id, v: { fit: val } }], { render: 'stage' }); return; }
  if (name === 'arrowStart' || name === 'arrowEnd') { if (el) commit([{ t: 'el.set', s: S.slideId, id: el.id, v: { [name]: val || null } }], { render: 'stage' }); return; }
  if (name === 'lineHeight' || name === 'letterSpacing') { const n = Number(val); if (Number.isFinite(n)) styleOp({ [name]: n }); return; }
  if (name === 'uppercase') { styleOp({ uppercase: val || undefined }); return; }
  if (name === 'autoHeight') { if (el) commit([{ t: 'el.set', s: S.slideId, id: el.id, v: { autoHeight: val || null } }], { render: 'stage' }); return; }
  if (name === 'alt') { if (el) commit([{ t: 'el.set', s: S.slideId, id: el.id, v: { alt: val.slice(0, 300) || null } }], { render: 'none' }); }
}

function onKey(ev) {
  if (!S || !host?.isConnected) return;
  if (document.querySelector('dialog[open]')) return;
  const mod = ev.ctrlKey || ev.metaKey;
  const key = ev.key;
  if (S.present) {
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(key)) { ev.preventDefault(); S.present.index++; renderPresent(); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(key)) { ev.preventDefault(); S.present.index--; renderPresent(); }
    else if (key === 'Home') { ev.preventDefault(); S.present.index = 0; renderPresent(); }
    else if (key === 'End') { ev.preventDefault(); S.present.index = 1e9; renderPresent(); }
    else if (key === 'Escape') { ev.preventDefault(); stopPresent(); }
    return;
  }
  if (S.editingId) {
    if (key === 'Escape') { ev.preventDefault(); commitTextEdit(); }
    else if (mod && (key === 'b' || key === 'i' || key === 'u')) { ev.preventDefault(); execInEditor(key === 'b' ? 'bold' : key === 'i' ? 'italic' : 'underline'); }
    return;
  }
  const typing = ev.target.closest?.('input, textarea, select, [contenteditable="true"]');
  if (typing) return;
  if (!host.contains(document.activeElement) && document.activeElement !== document.body) return;
  const list = selected();
  if (mod && key.toLowerCase() === 'z' && !ev.shiftKey) { ev.preventDefault(); undo(); return; }
  if (mod && (key.toLowerCase() === 'y' || (key.toLowerCase() === 'z' && ev.shiftKey))) { ev.preventDefault(); redo(); return; }
  if (mod && key === 'Enter') { ev.preventDefault(); startPresent(true); return; }
  if (mod && key.toLowerCase() === 'm') { ev.preventDefault(); addSlide('title-body'); return; }
  if (mod && key.toLowerCase() === 'a') { ev.preventDefault(); S.sel = new Set(slide().elements.map(e => e.id)); renderOverlay(); renderToolbar(); return; }
  if (mod && key.toLowerCase() === 'd' && list.length) { ev.preventDefault(); duplicateSelection(); return; }
  if (mod && key.toLowerCase() === 'c' && list.length) { ev.preventDefault(); clipboard = clone(list); return; }
  if (mod && key.toLowerCase() === 'x' && list.length) { ev.preventDefault(); clipboard = clone(list); deleteSelection(); return; }
  if (mod && key.toLowerCase() === 'v' && clipboard?.length) {
    ev.preventDefault();
    const copies = clipboard.map(el => { const c = clone(el); c.id = newId('e'); delete c.placeholder; delete c.prompt; if (slide().elements.some(e => e.x === c.x && e.y === c.y)) { if (c.type === 'line') { c.x1 += 12; c.x2 += 12; c.y1 += 12; c.y2 += 12; } else { c.x += 12; c.y += 12; } } return c; });
    commit(copies.map(el => ({ t: 'el.add', s: S.slideId, el })), { render: 'none' });
    S.sel = new Set(copies.map(c => c.id));
    renderAll();
    return;
  }
  if (mod && (key === 'ArrowUp' || key === 'ArrowDown') && list.length) { ev.preventDefault(); zOrder(key === 'ArrowUp' ? 1 : -1); return; }
  if (mod && key.toLowerCase() === 'b' && list.length) { ev.preventDefault(); onClick({ target: { closest: s => s === '[data-sd]' ? { dataset: { sd: 'bold' }, disabled: false } : null } }); return; }
  if ((key === 'Delete' || key === 'Backspace') && list.length) { ev.preventDefault(); deleteSelection(); return; }
  if (key === 'Escape') { if (S.tool !== 'select') S.tool = 'select'; S.sel.clear(); closePop(); renderOverlay(); renderToolbar(); renderPanel(); $('#sd-canvas').dataset.tool = 'select'; return; }
  if (key === 'Enter' && list.length === 1 && isTextual(list[0])) { ev.preventDefault(); startTextEdit(list[0].id); return; }
  if (key.startsWith('Arrow') && list.length) {
    ev.preventDefault();
    const step = ev.shiftKey ? 10 : 1;
    nudge(key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0, key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0);
    return;
  }
  if ((key === 'PageDown' || key === 'PageUp' || key === 'ArrowDown' || key === 'ArrowUp') && !list.length) {
    const i = slideIndex() + (key === 'PageDown' || key === 'ArrowDown' ? 1 : -1);
    if (S.deck.slides[i]) { ev.preventDefault(); selectSlide(S.deck.slides[i].id); }
  }
}

// Paste images from the clipboard straight onto the slide.
window.addEventListener('paste', ev => {
  if (!S || !host?.isConnected || S.editingId) return;
  if (ev.target.closest?.('input, textarea, [contenteditable="true"]')) return;
  const file = [...(ev.clipboardData?.files || [])].find(f => f.type.startsWith('image/'));
  if (file) { ev.preventDefault(); insertImageFile(file); }
});

export const _test = { domToRuns, layoutById };
