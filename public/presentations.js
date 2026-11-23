// Agency presentations: gallery + the deck editor (ui/deck-editor.js).
// Legacy (form-based) presentations are converted to the deck format the first time they are opened.
import { createCanonicalPresentationTemplates, createBlankPresentation, createPresentationFromTemplate } from './presentation-data.js';
import { isDeck, deckFromLegacy, createDeck } from './deck-model.js';
import { renderSlideSvg } from './deck-render.js';
import { openDeckEditor, mountDeckEditor, deckEditorOpen, closeDeckEditor, flushSave } from './deck-editor.js';

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let searchQuery = '';
let latest = { env: null, rerender: () => {} };
let documentBound = false;
const deckCache = new Map(); // id+updated → converted deck, for gallery thumbnails of legacy rows

export function getActivePresentation() { return null; }

export function closePresentationEditor() {
  if (deckEditorOpen()) flushSave();
  closeDeckEditor();
}

function asDeck(p, company) {
  if (isDeck(p)) return p;
  const key = `${p.id}:${p.updated || ''}`;
  if (!deckCache.has(key)) deckCache.set(key, deckFromLegacy(p, company));
  return deckCache.get(key);
}

export function presentationsHtml(agencyState, env) {
  if (deckEditorOpen()) return '<div class="sd-host" id="sd-host"></div>';
  const company = agencyState.company || {};
  return renderGallery(agencyState.presentations || [], createCanonicalPresentationTemplates(company), company);
}

function cardThumb(p, company) {
  try {
    const deck = asDeck(p, company);
    const first = deck.slides.find(s => !s.skipped) || deck.slides[0];
    return first ? renderSlideSvg(deck, first, { index: 0, total: deck.slides.length, prefix: `g${esc(p.id).slice(0, 12)}` }) : '';
  } catch { return ''; }
}

function renderGallery(presentations, templates, company) {
  const q = searchQuery.toLowerCase();
  const filtered = presentations.filter(p => !q || (p.title || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q));

  const cardsHtml = filtered.map(p => {
    const slideCount = p.slides?.length || 0;
    const hasShare = p.share?.id && (!p.share.expires || Date.parse(p.share.expires) > Date.now());
    return `
      <article class="pres-card" data-id="${esc(p.id)}">
        <div class="pres-card-thumb" data-pres-act="edit" data-id="${esc(p.id)}" title="Abrir no editor">${cardThumb(p, company)}</div>
        <div class="pres-card-body">
          <h2 class="pres-card-title" data-pres-act="edit" data-id="${esc(p.id)}">${esc(p.title)}</h2>
          <div class="pres-card-meta">
            <span>${slideCount} slide(s)</span>
            <span>·</span>
            <span>Marca: <b>${esc(p.agencyName || company.name || 'Agência')}</b></span>
            ${hasShare ? '<span class="badge green" title="Link público ativo">Link público ativo</span>' : ''}
          </div>
          <div class="pres-card-actions">
            <button type="button" class="secondary" data-pres-act="edit" data-id="${esc(p.id)}">Editar</button>
            <button type="button" class="secondary" data-pres-act="present" data-id="${esc(p.id)}" title="Apresentar em tela cheia">Apresentar</button>
            <button type="button" class="secondary" data-pres-act="share" data-id="${esc(p.id)}" title="Gerar link público para o cliente">Compartilhar</button>
            <button type="button" class="secondary" data-pres-act="duplicate" data-id="${esc(p.id)}">Duplicar</button>
            <button type="button" class="secondary danger" data-pres-act="delete" data-id="${esc(p.id)}">Excluir</button>
          </div>
        </div>
      </article>`;
  }).join('');

  const emptyGalleryHtml = `
    <div class="empty" style="grid-column: 1 / -1; padding: 40px 20px; text-align: center;">
      <strong>Nenhuma apresentação criada ainda</strong>
      <p style="color:var(--muted);margin:8px 0 16px;">Crie sua primeira apresentação em branco ou comece por um dos modelos.</p>
      <div class="inline-gap" style="justify-content:center;">
        <button type="button" class="primary" data-pres-act="use-template" data-template-id="template-crewsystems">Usar Modelo CrewSystems</button>
        <button type="button" class="secondary" data-pres-act="new-blank">Criar em branco</button>
      </div>
    </div>`;

  const templatesHtml = templates.map(t => `
    <div class="pres-tpl-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <h3>${esc(t.title)}</h3>
        <span class="badge blue">Modelo Oficial</span>
      </div>
      <p>${esc(t.description)}</p>
      <div class="pres-tags">
        <span class="pres-tag">${t.slides.length} slides</span>
        <span class="pres-tag">16:9 Widescreen</span>
        <span class="pres-tag">Identidade Automática</span>
      </div>
      <div class="inline-gap" style="margin-top:auto;padding-top:10px;">
        <button type="button" class="primary" data-pres-act="use-template" data-template-id="${esc(t.id)}">Usar este modelo</button>
        <button type="button" class="secondary" data-pres-act="preview-template" data-template-id="${esc(t.id)}">Prévia</button>
      </div>
    </div>`).join('');

  return `
    <div class="pres-page">
      <header class="pres-header">
        <div>
          <h1>Apresentações da Agência</h1>
          <p>Crie propostas, diagnósticos e apresentações com a marca da agência: editor livre com temas, layouts, formas, imagens e link público.</p>
        </div>
        <div class="inline-gap"><button type="button" class="primary" data-pres-act="new-modal">+ Nova apresentação</button></div>
      </header>
      <section class="pres-templates-shelf">
        <div class="pres-templates-header">
          <h2>Modelos de Apresentação</h2>
          <p>Estruturas completas para começar em segundos. Tudo continua editável no editor.</p>
        </div>
        <div class="pres-templates-grid">${templatesHtml}</div>
      </section>
      <section style="display:flex;flex-direction:column;gap:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
          <h2 style="font-size:18px;margin:0;">Minhas apresentações (${filtered.length})</h2>
          <label class="search" style="width:260px;margin:0;">
            <input type="text" data-pres-search value="${esc(searchQuery)}" placeholder="Buscar apresentação…" aria-label="Buscar apresentação">
          </label>
        </div>
        <div class="pres-grid">${filtered.length ? cardsHtml : emptyGalleryHtml}</div>
      </section>
    </div>`;
}

// ---- Editor lifecycle ----------------------------------------------------------------------------
function editorEnv(env) {
  return { act: env.act, flash: env.flash, getAgency: env.getAgency || (() => env.agency), share: id => openShareDialog(env, id) };
}

async function openInEditor(env, id, { present = false } = {}) {
  const agency = env.getAgency?.() || env.agency || {};
  const row = (agency.presentations || []).find(p => p.id === id);
  if (!row) { env.flash('Apresentação não encontrada.', true); return; }
  let deck = row;
  if (!isDeck(row)) {
    deck = deckFromLegacy(row, agency.company || {});
    await env.act('presentation-save', { id: row.id, data: deck });
    deck = ((env.getAgency?.() || {}).presentations || []).find(p => p.id === id) || deck;
  }
  openDeckEditor(deck, { rev: deck.rev });
  latest.rerender();
  if (present) setTimeout(() => document.querySelector('#sd-app [data-sd="present"]')?.click(), 50);
}

async function createAndOpen(env, deck, message) {
  const savedId = await env.act('presentation-save', { data: deck });
  env.flash(message);
  await openInEditor(env, savedId);
}

function openShareDialog(env, presId) {
  const agency = env.getAgency?.() || env.agency || {};
  const presObj = (agency.presentations || []).find(p => p.id === presId);
  if (!presObj) return;
  const hasShare = presObj.share?.id && (!presObj.share.expires || Date.parse(presObj.share.expires) > Date.now());
  const publicUrl = hasShare ? `${location.origin}/apresentacao/${presObj.share.id}` : '';
  env.dialog('Compartilhar apresentação', `
    <p style="color:var(--muted);font-size:13px;margin-bottom:14px;">Gere um link público somente leitura para enviar ao cliente. Qualquer pessoa com o link abre a apresentação no navegador, sem login.</p>
    ${hasShare ? `
      <div style="background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:12px;margin-bottom:16px;">
        <span style="font-size:11px;font-weight:700;color:var(--done);text-transform:uppercase;">Link ativo</span>
        <div style="display:flex;gap:8px;margin-top:6px;">
          <input type="text" readonly value="${esc(publicUrl)}" id="pres-share-link" style="flex:1;background:var(--surface);font-size:13px;padding:6px 10px;" aria-label="Link público">
          <button type="button" class="primary" data-pres-act="copy-share-link">Copiar</button>
        </div>
      </div>` : ''}
    <label>Validade do link
      <select name="days" id="pres-share-days">
        <option value="0">Sem prazo de expiração (permanente)</option>
        <option value="7">7 dias</option>
        <option value="30" selected>30 dias</option>
        <option value="90">90 dias</option>
      </select>
    </label>`, { form: 'pres-share-form', id: presId, submit: hasShare ? 'Gerar novo link' : 'Criar link público' });
}

function previewTemplate(env, templateId) {
  const company = (env.getAgency?.() || env.agency || {}).company || {};
  const tpl = createCanonicalPresentationTemplates(company).find(t => t.id === templateId);
  if (!tpl) return;
  const brand = { ...company, primaryColor: company.primary || company.primaryColor, accentColor: company.secondary || company.accentColor };
  const deck = deckFromLegacy(createPresentationFromTemplate(templateId, brand), company);
  env.dialog(`Prévia: ${tpl.title}`, `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;max-height:60vh;overflow:auto;padding:2px;">
      ${deck.slides.map((s, i) => `<div style="border:1px solid var(--line);border-radius:8px;overflow:hidden;line-height:0">${renderSlideSvg(deck, s, { index: i, total: deck.slides.length, prefix: `tp${i}` })}</div>`).join('')}
    </div>
    <div class="inline-gap" style="justify-content:flex-end;margin-top:16px;">
      <button type="button" class="secondary" data-close-dialog>Fechar</button>
      <button type="button" class="primary" data-pres-act="use-template" data-template-id="${esc(templateId)}">Usar este modelo</button>
    </div>`, { wide: true });
}

// ---- Listeners -----------------------------------------------------------------------------------
export function attachPresentationListeners(root, env, rerender) {
  latest = { env, rerender };
  const host = root.querySelector('#sd-host');
  if (host) mountDeckEditor(host, editorEnv(env), () => { closeDeckEditor(); rerender(); });

  const searchInput = root.querySelector('[data-pres-search]');
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      searchQuery = e.target.value;
      const pos = e.target.selectionStart;
      rerender();
      const again = document.querySelector('[data-pres-search]');
      if (again) { again.focus(); again.setSelectionRange(pos, pos); }
    });
  }

  if (documentBound) return;
  documentBound = true;
  // Bound once: the agency shell re-renders into the same container, so per-render listeners would stack up.
  document.addEventListener('click', async ev => {
    const btn = ev.target.closest('[data-pres-act]');
    if (!btn || !latest.env) return;
    if (!document.querySelector('.pres-page, #sd-host')) return;
    const { env: e, rerender: re } = latest;
    const company = (e.getAgency?.() || e.agency || {}).company || {};
    const id = btn.dataset.id;
    try {
      switch (btn.dataset.presAct) {
        case 'new-modal':
          e.dialog('Nova apresentação', `
            <p style="color:var(--muted);margin-bottom:16px;">Escolha como começar:</p>
            <div style="display:flex;flex-direction:column;gap:12px;">
              ${createCanonicalPresentationTemplates(company).map(t => `
                <button type="button" class="choice" data-pres-act="use-template" data-template-id="${esc(t.id)}" style="text-align:left;padding:14px;border:1px solid var(--line);border-radius:10px;background:var(--surface);">
                  <strong style="display:block;font-size:15px;color:var(--ink);">${esc(t.title)}</strong>
                  <span style="font-size:13px;color:var(--muted);">${esc(t.description)}</span>
                </button>`).join('')}
              <button type="button" class="choice" data-pres-act="new-blank" style="text-align:left;padding:14px;border:1px solid var(--line);border-radius:10px;background:var(--surface);">
                <strong style="display:block;font-size:15px;color:var(--ink);">Começar do zero</strong>
                <span style="font-size:13px;color:var(--muted);">Apresentação em branco com o tema da agência: adicione slides, textos, formas e imagens livremente.</span>
              </button>
            </div>`, { wide: true });
          break;
        case 'use-template': {
          e.closeDialog();
          const tplId = btn.dataset.templateId || 'template-crewsystems';
          // "Identidade automática": the agency's own colors win over the template's defaults.
          const brand = { ...company, primaryColor: company.primary || company.primaryColor, accentColor: company.secondary || company.accentColor };
          const deck = deckFromLegacy(createPresentationFromTemplate(tplId, brand), company);
          await createAndOpen(e, deck, 'Apresentação criada a partir do modelo.');
          break;
        }
        case 'new-blank': {
          e.closeDialog();
          const deck = createDeck({ title: 'Nova apresentação', company });
          await createAndOpen(e, deck, 'Apresentação em branco criada.');
          break;
        }
        case 'preview-template': previewTemplate(e, btn.dataset.templateId); break;
        case 'edit': await openInEditor(e, id); break;
        case 'present': await openInEditor(e, id, { present: true }); break;
        case 'share': openShareDialog(e, id); break;
        case 'copy-share-link': {
          const input = document.querySelector('#pres-share-link');
          if (input) { await navigator.clipboard.writeText(input.value); e.flash('Link copiado.'); }
          break;
        }
        case 'duplicate':
          await e.act('presentation-duplicate', { id });
          e.flash('Apresentação duplicada.');
          re();
          break;
        case 'delete':
          e.dialog('Excluir apresentação', `
            <p>Tem certeza de que deseja excluir permanentemente esta apresentação?</p>
            <div class="inline-gap" style="justify-content:flex-end;margin-top:16px;">
              <button type="button" class="secondary" data-close-dialog>Cancelar</button>
              <button type="button" class="primary danger" data-pres-act="confirm-delete" data-id="${esc(id)}">Sim, excluir</button>
            </div>`);
          break;
        case 'confirm-delete':
          e.closeDialog();
          await e.act('presentation-delete', { id });
          e.flash('Apresentação excluída.');
          re();
          break;
      }
    } catch (err) { e.flash(err.message || 'Não foi possível concluir a ação.', true); }
  });
}

// Kept for older imports.
export { createBlankPresentation };
