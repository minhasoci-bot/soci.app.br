import {
  canonicalSymbolsSvg,
  createCanonicalPresentationTemplates,
  createBlankPresentation,
  createPresentationFromTemplate,
  renderSlideInnerHtml,
  PRESENTATION_LAYOUTS,
  PRESENTATION_ICONS
} from './presentation-data.js';

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

// Module State
let activePres = null;
let activeSlideIndex = 0;
let inspectorTab = 'slide'; // 'slide' | 'content' | 'brand'
let slideshowActive = false;
let slideshowIndex = 0;
let saveTimer = null;
let saveStatus = 'saved'; // 'saved' | 'saving' | 'dirty'
let searchQuery = '';

export function getActivePresentation() {
  return activePres;
}

export function closePresentationEditor() {
  activePres = null;
  slideshowActive = false;
}

export function presentationsHtml(agencyState, env) {
  const company = agencyState.company || {};
  const presentations = agencyState.presentations || [];
  const templates = createCanonicalPresentationTemplates(company);

  if (activePres) {
    return renderEditor(company, env);
  }

  return renderGallery(presentations, templates, company, env);
}

/* =========================================================================
   GALLERY VIEW
   ========================================================================= */

function renderGallery(presentations, templates, company, env) {
  const filtered = presentations.filter(p => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (p.title || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q);
  });

  const cardsHtml = filtered.map(p => {
    const slideCount = p.slides?.length || 0;
    const firstSlide = p.slides?.[0] || {};
    const hasShare = p.share?.id && (!p.share.expires || Date.parse(p.share.expires) > Date.now());
    const publicUrl = hasShare ? `${location.origin}/apresentacao/${p.share.id}` : '';

    return `
      <article class="pres-card" data-id="${esc(p.id)}">
        <div class="pres-card-thumb" data-pres-act="edit" data-id="${esc(p.id)}" title="Clique para editar">
          <div class="pres-mini-deck">
            <div class="pres-mini-top">
              <span class="pres-mini-eyebrow">${esc(firstSlide.eyebrow || p.agencyName || company.name || 'Agência')}</span>
              <span style="font-size:8px;color:#a4b2c2;">01 / ${String(slideCount).padStart(2, '0')}</span>
            </div>
            <div class="pres-mini-title">${esc((firstSlide.headline || p.title || '').replace(/<[^>]+>/g, ''))}</div>
            <div class="pres-mini-footer">
              <span>${esc(p.agencyName || company.name || 'Agência')}</span>
              <span>16:9 Widescreen</span>
            </div>
          </div>
        </div>
        <div class="pres-card-body">
          <h2 class="pres-card-title" data-pres-act="edit" data-id="${esc(p.id)}">${esc(p.title)}</h2>
          <div class="pres-card-meta">
            <span>${slideCount} lâmina(s)</span>
            <span>·</span>
            <span>Marca: <b>${esc(p.agencyName || company.name || 'Agência')}</b></span>
            ${hasShare ? `<span class="badge green" title="Link público ativo">Link público ativo</span>` : ''}
          </div>
          <div class="pres-card-actions">
            <button type="button" class="secondary" data-pres-act="edit" data-id="${esc(p.id)}" title="Abrir editor estilo Google Presentations">Editar</button>
            <button type="button" class="secondary" data-pres-act="present" data-id="${esc(p.id)}" title="Apresentar em tela cheia">Apresentar</button>
            <button type="button" class="secondary" data-pres-act="share" data-id="${esc(p.id)}" title="Gerar link público para o cliente">Compartilhar</button>
            <button type="button" class="secondary" data-pres-act="duplicate" data-id="${esc(p.id)}" title="Duplicar apresentação">Duplicar</button>
            <button type="button" class="secondary danger" data-pres-act="delete" data-id="${esc(p.id)}" title="Excluir apresentação">Excluir</button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  const emptyGalleryHtml = `
    <div class="empty" style="grid-column: 1 / -1; padding: 40px 20px; text-align: center;">
      <strong>Nenhuma apresentação criada ainda</strong>
      <p style="color:var(--muted);margin:8px 0 16px;">Crie sua primeira apresentação comercial ou use o modelo oficial CrewSystems validado para propostas.</p>
      <div class="inline-gap" style="justify-content:center;">
        <button type="button" class="primary" data-pres-act="use-template" data-template-id="template-crewsystems">Usar Modelo CrewSystems</button>
        <button type="button" class="secondary" data-pres-act="new-blank">Criar em branco</button>
      </div>
    </div>
  `;

  const templatesHtml = templates.map(t => `
    <div class="pres-tpl-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <h3>${esc(t.title)}</h3>
        <span class="badge blue">Modelo Oficial</span>
      </div>
      <p>${esc(t.description)}</p>
      <div class="pres-tags">
        <span class="pres-tag">${t.slides.length} lâminas</span>
        <span class="pres-tag">16:9 Widescreen</span>
        <span class="pres-tag">Comercial & Vendas</span>
        <span class="pres-tag">Identidade Automática</span>
      </div>
      <div class="inline-gap" style="margin-top:auto;padding-top:10px;">
        <button type="button" class="primary" data-pres-act="use-template" data-template-id="${esc(t.id)}">Usar este modelo</button>
        <button type="button" class="secondary" data-pres-act="preview-template" data-template-id="${esc(t.id)}">Prévia</button>
      </div>
    </div>
  `).join('');

  return `
    <div class="pres-page">
      <header class="pres-header">
        <div>
          <h1>Apresentações da Agência</h1>
          <p>Crie propostas comerciais, diagnósticos e apresentações de alto impacto para fechar clientes com a marca da agência.</p>
        </div>
        <div class="inline-gap">
          <button type="button" class="primary" data-pres-act="new-modal">+ Nova apresentação</button>
        </div>
      </header>

      <section class="pres-templates-shelf">
        <div class="pres-templates-header">
          <h2>Modelos de Apresentação</h2>
          <p>Estruturas completas e testadas para você criar apresentações comerciais em poucos segundos.</p>
        </div>
        <div class="pres-templates-grid">
          ${templatesHtml}
        </div>
      </section>

      <section style="display:flex;flex-direction:column;gap:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
          <h2 style="font-size:18px;margin:0;">Minhas apresentações (${filtered.length})</h2>
          <label class="search" style="width:260px;margin:0;">
            <input type="text" data-pres-search value="${esc(searchQuery)}" placeholder="Buscar apresentação…" aria-label="Buscar apresentação">
          </label>
        </div>
        <div class="pres-grid">
          ${filtered.length ? cardsHtml : emptyGalleryHtml}
        </div>
      </section>
    </div>
  `;
}

/* =========================================================================
   GOOGLE PRESENTATIONS-STYLE INTERACTIVE EDITOR
   ========================================================================= */

function renderEditor(company, env) {
  const p = activePres;
  if (!p) return '';
  const slides = p.slides || [];
  if (activeSlideIndex >= slides.length) activeSlideIndex = 0;
  const currentSlide = slides[activeSlideIndex] || slides[0] || {};
  const totalSlides = slides.length;

  // Filmstrip Thumbnails
  const filmstripHtml = slides.map((s, idx) => {
    const isActive = idx === activeSlideIndex;
    const headlineClean = (s.headline || '').replace(/<[^>]+>/g, '');
    return `
      <div class="pres-thumb-item ${isActive ? 'active' : ''}" data-pres-act="select-slide" data-index="${idx}">
        <div class="pres-thumb-label">
          <span>Lâmina ${String(idx + 1).padStart(2, '0')}</span>
          <span class="pres-thumb-mini-tag">${esc(s.layout || 'cover')}</span>
        </div>
        <div class="pres-thumb-box" style="border-top-color:${esc(p.accentColor || '#f65b00')};">
          <div style="display:flex;justify-content:space-between;font-size:7px;font-weight:800;color:${esc(p.primaryColor || '#0b315c')};">
            <span style="color:${esc(p.accentColor || '#f65b00')};">${esc(s.eyebrow || p.agencyName || '')}</span>
            <span>${String(idx + 1).padStart(2, '0')}/${String(totalSlides).padStart(2, '0')}</span>
          </div>
          <div class="pres-thumb-mini-title" style="color:${esc(p.primaryColor || '#0b315c')};">${esc(headlineClean)}</div>
          <div style="font-size:6px;color:#94a3b8;font-weight:700;">${esc(p.agencyName || company.name || '')}</div>
        </div>
      </div>
    `;
  }).join('');

  // Inspector Content
  let inspectorContentHtml = '';
  if (inspectorTab === 'slide') {
    inspectorContentHtml = renderSlideInspector(currentSlide, p);
  } else if (inspectorTab === 'content') {
    inspectorContentHtml = renderContentInspector(currentSlide);
  } else if (inspectorTab === 'brand') {
    inspectorContentHtml = renderBrandInspector(p, company);
  }

  // Slide Canvas Live Stage
  const slideInnerHtml = renderSlideInnerHtml(currentSlide, activeSlideIndex, totalSlides, p);

  return `
    ${canonicalSymbolsSvg()}
    <div class="pres-editor" id="pres-editor-root">
      <!-- Editor Topbar -->
      <header class="pres-topbar">
        <div class="pres-topbar-left">
          <button type="button" class="pres-back-btn" data-pres-act="back-gallery" title="Voltar à lista de apresentações">
            ← <span>Apresentações</span>
          </button>
          <input type="text" class="pres-title-input" value="${esc(p.title)}" data-pres-input="pres-title" placeholder="Título da apresentação" aria-label="Título da apresentação">
          <span class="pres-save-status">
            ${saveStatus === 'saving' ? 'Salvando…' : saveStatus === 'dirty' ? 'Alterações não salvas' : '✓ Salvo'}
          </span>
        </div>
        <div class="pres-topbar-actions">
          <button type="button" class="pres-tool-btn" data-pres-act="editor-present" style="background:#2563eb;border-color:#3b82f6;color:#ffffff;" title="Apresentar em tela cheia (F)">
            <span>▶</span> Apresentar
          </button>
          <button type="button" class="pres-tool-btn" data-pres-act="editor-share" title="Compartilhar link público com o cliente">
            Compartilhar
          </button>
          <button type="button" class="pres-tool-btn" data-pres-act="editor-pdf" title="Salvar como PDF ou Imprimir (P)">
            Exportar PDF
          </button>
          <button type="button" class="pres-tool-btn" data-pres-act="save-now" style="color:#60a5fa;" title="Salvar alterações agora">
            Salvar
          </button>
        </div>
      </header>

      <!-- Editor Toolbar -->
      <nav class="pres-toolbar">
        <button type="button" class="pres-tool-btn" data-pres-act="add-slide" style="color:#60a5fa;" title="Adicionar nova lâmina">
          + Novo Slide
        </button>
        <span class="pres-tool-divider"></span>
        <button type="button" class="pres-tool-btn" data-pres-act="duplicate-slide" title="Duplicar slide atual">
          Duplicar
        </button>
        <button type="button" class="pres-tool-btn" data-pres-act="move-slide-up" ${activeSlideIndex === 0 ? 'disabled' : ''} title="Mover para cima">
          ↑ Mover para cima
        </button>
        <button type="button" class="pres-tool-btn" data-pres-act="move-slide-down" ${activeSlideIndex >= totalSlides - 1 ? 'disabled' : ''} title="Mover para baixo">
          ↓ Mover para baixo
        </button>
        <span class="pres-tool-divider"></span>
        <button type="button" class="pres-tool-btn" data-pres-act="delete-slide" ${totalSlides <= 1 ? 'disabled' : ''} style="color:#f87171;" title="Excluir slide atual">
          Excluir slide
        </button>
        <span style="margin-left:auto;font-size:12px;color:#94a3b8;">
          Slide <b>${activeSlideIndex + 1}</b> de <b>${totalSlides}</b>
        </span>
      </nav>

      <!-- Editor Workspace (3 Panels) -->
      <div class="pres-workspace">
        <!-- Left: Filmstrip Rail -->
        <aside class="pres-filmstrip" aria-label="Lista de lâminas">
          ${filmstripHtml}
          <button type="button" class="pres-filmstrip-add" data-pres-act="add-slide">
            + Adicionar slide
          </button>
        </aside>

        <!-- Center: Slide Canvas Stage -->
        <main class="pres-stage" id="pres-canvas-container">
          <div class="pres-stage-deck" id="pres-stage-deck" style="--navy:${esc(p.primaryColor || '#0b315c')};--orange:${esc(p.accentColor || '#f65b00')};">
            ${slideInnerHtml}
          </div>
        </main>

        <!-- Right: Inspector Sidebar -->
        <aside class="pres-inspector" aria-label="Painel de propriedades">
          <div class="pres-tabs-bar" role="tablist">
            <button type="button" class="pres-tab-btn ${inspectorTab === 'slide' ? 'active' : ''}" data-pres-tab="slide">Slide</button>
            <button type="button" class="pres-tab-btn ${inspectorTab === 'content' ? 'active' : ''}" data-pres-tab="content">Conteúdo</button>
            <button type="button" class="pres-tab-btn ${inspectorTab === 'brand' ? 'active' : ''}" data-pres-tab="brand">Marca</button>
          </div>
          <div class="pres-tab-content">
            ${inspectorContentHtml}
          </div>
        </aside>
      </div>
    </div>

    ${slideshowActive ? renderSlideshowModal(p) : ''}
  `;
}

function renderSlideInspector(slide, pres) {
  const layouts = [
    ['cover', 'Capa de Impacto (Cover)'],
    ['pain', 'Os 5 Gargalos / Problemas (Pain)'],
    ['solution', 'A Solução em 2 Pilares (Solution)'],
    ['services', 'Grade de Serviços (3 Colunas)'],
    ['sales', 'Detalhe de Vendas (2 Colunas)'],
    ['bundle', 'Pacote Tudo Incluso (5 Colunas)'],
    ['process', 'Processo & Como Funciona (Passos)'],
    ['blank', 'Lâmina Livre / Texto (Blank)']
  ];

  return `
    <div class="pres-field">
      <label for="sl-layout">Tipo de Layout</label>
      <select id="sl-layout" data-pres-input="slide-layout">
        ${layouts.map(([val, label]) => `<option value="${val}" ${slide.layout === val ? 'selected' : ''}>${esc(label)}</option>`).join('')}
      </select>
    </div>

    <div class="pres-field">
      <label for="sl-eyebrow">Etiqueta Superior (Eyebrow)</label>
      <input type="text" id="sl-eyebrow" data-pres-input="slide-eyebrow" value="${esc(slide.eyebrow || '')}" placeholder="Ex.: SITUAÇÃO ATUAL">
    </div>

    <div class="pres-field">
      <label for="sl-headline">Título Principal (Headline)</label>
      <textarea id="sl-headline" data-pres-input="slide-headline" rows="3" placeholder="Título da lâmina">${esc(slide.headline || '')}</textarea>
      <span class="pres-field-hint">Dica: use <code style="color:#60a5fa;">*palavra*</code> ou <code style="color:#60a5fa;">&lt;span class="accent"&gt;texto&lt;/span&gt;</code> para colorir de laranja/destaque. Quebras de linha são respeitadas.</span>
    </div>

    <div class="pres-toggle-row">
      <span style="font-size:13px;font-weight:600;">Linha de destaque sob título</span>
      <label class="ag-sw">
        <input type="checkbox" role="switch" data-pres-input="slide-rule" ${slide.rule ? 'checked' : ''}>
        <span aria-hidden="true"></span>
      </label>
    </div>

    <div class="pres-field">
      <label for="sl-footer">Texto do Rodapé (Esquerda)</label>
      <input type="text" id="sl-footer" data-pres-input="slide-footer" value="${esc(slide.footer || '')}" placeholder="Ex.: O PROBLEMA / PARTE 1 — ATRAÇÃO">
    </div>
  `;
}

function renderContentInspector(slide) {
  switch (slide.layout) {
    case 'cover': {
      const pills = slide.pills || [];
      return `
        <div class="pres-field">
          <label>Pills / Etiquetas de Vantagens</label>
          <div class="pres-items-list">
            ${pills.map((pill, pidx) => `
              <div class="pres-item-box">
                <div class="pres-item-box-header">
                  <span>Pill #${pidx + 1}</span>
                  <button type="button" class="pres-del-item-btn" data-pres-act="del-pill" data-index="${pidx}">Excluir</button>
                </div>
                <input type="text" value="${esc(pill)}" data-pres-input="pill-text" data-index="${pidx}" placeholder="Texto do selo">
              </div>
            `).join('')}
          </div>
          <button type="button" class="pres-add-item-btn" data-pres-act="add-pill">+ Adicionar pill</button>
        </div>
      `;
    }

    case 'pain': {
      const items = slide.items || [];
      return `
        <div class="pres-field">
          <label>Gargalos / Problemas (${items.length})</label>
          <div class="pres-items-list">
            ${items.map((it, idx) => `
              <div class="pres-item-box">
                <div class="pres-item-box-header">
                  <span>Item #${idx + 1}</span>
                  <button type="button" class="pres-del-item-btn" data-pres-act="del-pain-item" data-index="${idx}">Excluir</button>
                </div>
                <label style="font-size:11px;color:#94a3b8;">Ícone</label>
                <select data-pres-input="pain-icon" data-index="${idx}">
                  ${PRESENTATION_ICONS.map(ico => `<option value="${ico.id}" ${it.icon === ico.id ? 'selected' : ''}>${esc(ico.label)}</option>`).join('')}
                </select>
                <input type="text" value="${esc(it.text)}" data-pres-input="pain-text" data-index="${idx}" placeholder="Descrição do problema">
              </div>
            `).join('')}
          </div>
          <button type="button" class="pres-add-item-btn" data-pres-act="add-pain-item">+ Adicionar gargalo</button>
        </div>
      `;
    }

    case 'solution':
    case 'sales': {
      const cards = slide.cards || [];
      return `
        <div class="pres-field">
          <label>Cards de Pilares / Serviços (${cards.length})</label>
          <div class="pres-items-list">
            ${cards.map((c, idx) => `
              <div class="pres-item-box">
                <div class="pres-item-box-header">
                  <span>Card #${idx + 1}</span>
                  <button type="button" class="pres-del-item-btn" data-pres-act="del-card" data-index="${idx}">Excluir</button>
                </div>
                <label style="font-size:11px;color:#94a3b8;">Ícone</label>
                <select data-pres-input="card-icon" data-index="${idx}">
                  ${PRESENTATION_ICONS.map(ico => `<option value="${ico.id}" ${c.icon === ico.id ? 'selected' : ''}>${esc(ico.label)}</option>`).join('')}
                </select>
                <input type="text" value="${esc(c.title)}" data-pres-input="card-title" data-index="${idx}" placeholder="Título do card">
                <textarea data-pres-input="card-desc" data-index="${idx}" rows="2" placeholder="Descrição do card">${esc(c.desc || '')}</textarea>
                <div class="pres-toggle-row">
                  <span style="font-size:12px;color:#cbd5e1;">Borda lateral laranja</span>
                  <input type="checkbox" data-pres-input="card-accent" data-index="${idx}" ${c.accent ? 'checked' : ''}>
                </div>
              </div>
            `).join('')}
          </div>
          <button type="button" class="pres-add-item-btn" data-pres-act="add-card">+ Adicionar card</button>
        </div>
      `;
    }

    case 'services': {
      const cards = slide.cards || [];
      return `
        <div class="pres-field">
          <label>Serviços / Benefícios (${cards.length})</label>
          <div class="pres-items-list">
            ${cards.map((c, idx) => `
              <div class="pres-item-box">
                <div class="pres-item-box-header">
                  <span>Coluna #${idx + 1}</span>
                  <button type="button" class="pres-del-item-btn" data-pres-act="del-card" data-index="${idx}">Excluir</button>
                </div>
                <label style="font-size:11px;color:#94a3b8;">Ícone</label>
                <select data-pres-input="card-icon" data-index="${idx}">
                  ${PRESENTATION_ICONS.map(ico => `<option value="${ico.id}" ${c.icon === ico.id ? 'selected' : ''}>${esc(ico.label)}</option>`).join('')}
                </select>
                <input type="text" value="${esc(c.title)}" data-pres-input="card-title" data-index="${idx}" placeholder="Título do serviço">
                <textarea data-pres-input="card-desc" data-index="${idx}" rows="2" placeholder="Descrição do serviço">${esc(c.desc || '')}</textarea>
              </div>
            `).join('')}
          </div>
          <button type="button" class="pres-add-item-btn" data-pres-act="add-card">+ Adicionar serviço</button>
        </div>
      `;
    }

    case 'bundle': {
      const cards = slide.cards || [];
      const pills = slide.pills || [];
      return `
        <div class="pres-field">
          <label>Itens do Pacote (${cards.length})</label>
          <div class="pres-items-list">
            ${cards.map((c, idx) => `
              <div class="pres-item-box">
                <div class="pres-item-box-header">
                  <span>Item #${idx + 1}</span>
                  <button type="button" class="pres-del-item-btn" data-pres-act="del-card" data-index="${idx}">Excluir</button>
                </div>
                <select data-pres-input="card-icon" data-index="${idx}">
                  ${PRESENTATION_ICONS.map(ico => `<option value="${ico.id}" ${c.icon === ico.id ? 'selected' : ''}>${esc(ico.label)}</option>`).join('')}
                </select>
                <input type="text" value="${esc(c.title)}" data-pres-input="card-title" data-index="${idx}" placeholder="Nome do item">
              </div>
            `).join('')}
          </div>
          <button type="button" class="pres-add-item-btn" data-pres-act="add-card">+ Adicionar item ao pacote</button>
        </div>

        <div class="pres-field" style="margin-top:16px;">
          <label>Pills Inferiores</label>
          <div class="pres-items-list">
            ${pills.map((pill, pidx) => `
              <div class="pres-item-box">
                <div class="pres-item-box-header">
                  <span>Selo #${pidx + 1}</span>
                  <button type="button" class="pres-del-item-btn" data-pres-act="del-pill" data-index="${pidx}">Excluir</button>
                </div>
                <input type="text" value="${esc(pill)}" data-pres-input="pill-text" data-index="${pidx}">
              </div>
            `).join('')}
          </div>
          <button type="button" class="pres-add-item-btn" data-pres-act="add-pill">+ Adicionar selo</button>
        </div>
      `;
    }

    case 'process': {
      const steps = slide.steps || [];
      return `
        <div class="pres-field">
          <label>Passos do Processo (${steps.length})</label>
          <div class="pres-items-list">
            ${steps.map((st, idx) => `
              <div class="pres-item-box">
                <div class="pres-item-box-header">
                  <span>Passo #${idx + 1}</span>
                  <button type="button" class="pres-del-item-btn" data-pres-act="del-step" data-index="${idx}">Excluir</button>
                </div>
                <div style="display:flex;gap:8px;">
                  <input type="text" style="width:50px;text-align:center;" value="${esc(st.number || idx + 1)}" data-pres-input="step-number" data-index="${idx}" placeholder="Nº">
                  <input type="text" style="flex:1;" value="${esc(st.title)}" data-pres-input="step-title" data-index="${idx}" placeholder="Título da etapa">
                </div>
                <textarea data-pres-input="step-desc" data-index="${idx}" rows="2" placeholder="Descrição complementar (opcional)">${esc(st.desc || '')}</textarea>
              </div>
            `).join('')}
          </div>
          <button type="button" class="pres-add-item-btn" data-pres-act="add-step">+ Adicionar passo</button>
        </div>
      `;
    }

    case 'blank':
    default: {
      const items = slide.items || [];
      return `
        <div class="pres-field">
          <label>Parágrafos / Blocos de Texto</label>
          <div class="pres-items-list">
            ${items.map((it, idx) => `
              <div class="pres-item-box">
                <div class="pres-item-box-header">
                  <span>Parágrafo #${idx + 1}</span>
                  <button type="button" class="pres-del-item-btn" data-pres-act="del-pain-item" data-index="${idx}">Excluir</button>
                </div>
                <textarea data-pres-input="pain-text" data-index="${idx}" rows="3">${esc(it.text || '')}</textarea>
              </div>
            `).join('')}
          </div>
          <button type="button" class="pres-add-item-btn" data-pres-act="add-pain-item">+ Adicionar parágrafo</button>
        </div>
      `;
    }
  }
}

function renderBrandInspector(pres, company) {
  const isDefaultBrand = (!pres.agencyName || pres.agencyName === company.name) &&
                         (!pres.agencyLogo || pres.agencyLogo === company.logo);

  return `
    <div style="background:#161e2b;border:1px solid #27364b;border-radius:8px;padding:12px;">
      <strong style="display:block;font-size:13px;color:#f1f5f9;margin-bottom:4px;">Herança de Marca da Agência</strong>
      <p style="font-size:12px;color:#94a3b8;margin:0 0 10px;line-height:1.4;">
        Por padrão, o nome e a logo são puxados diretamente do cadastro da agência (<b>${esc(company.name || 'Minha Agência')}</b>), mas você pode sobrescrever aqui especificamente para esta apresentação.
      </p>
      <button type="button" class="secondary" data-pres-act="reset-brand" style="font-size:11px;padding:4px 8px;">Restaurar dados da agência</button>
    </div>

    <div class="pres-field">
      <label for="br-name">Nome da Agência / Marca Exibida</label>
      <input type="text" id="br-name" data-pres-input="agency-name" value="${esc(pres.agencyName || company.name || '')}" placeholder="Ex.: CrewSystems / Minha Agência">
    </div>

    <div class="pres-field">
      <label for="br-logo">Logo da Marca (URL ou Imagem Base64)</label>
      <input type="text" id="br-logo" data-pres-input="agency-logo" value="${esc(pres.agencyLogo || company.logo || '')}" placeholder="https://... ou data:image/png;base64,...">
      <span class="pres-field-hint">Se vazio, utiliza a logo da agência ou a marca vetorial padrão.</span>
    </div>

    <div class="pres-field">
      <label for="br-primary">Cor Primária (Títulos e Fundo dos Cards)</label>
      <div style="display:flex;gap:8px;align-items:center;">
        <input type="color" id="br-primary" data-pres-input="primary-color" value="${esc(pres.primaryColor || '#0b315c')}" style="width:40px;height:36px;border:none;border-radius:4px;cursor:pointer;background:transparent;">
        <input type="text" style="flex:1;" data-pres-input="primary-color-text" value="${esc(pres.primaryColor || '#0b315c')}">
      </div>
    </div>

    <div class="pres-field">
      <label for="br-accent">Cor de Destaque / Laranja (Bordas e Acentos)</label>
      <div style="display:flex;gap:8px;align-items:center;">
        <input type="color" id="br-accent" data-pres-input="accent-color" value="${esc(pres.accentColor || '#f65b00')}" style="width:40px;height:36px;border:none;border-radius:4px;cursor:pointer;background:transparent;">
        <input type="text" style="flex:1;" data-pres-input="accent-color-text" value="${esc(pres.accentColor || '#f65b00')}">
      </div>
    </div>
  `;
}

/* =========================================================================
   FULLSCREEN SLIDESHOW MODAL
   ========================================================================= */

function renderSlideshowModal(pres) {
  const slides = pres.slides || [];
  const current = Math.min(slides.length - 1, Math.max(0, slideshowIndex));
  const total = slides.length;
  const slide = slides[current] || slides[0] || {};
  const slideInner = renderSlideInnerHtml(slide, current, total, pres);

  return `
    <div class="pres-slideshow-view" id="pres-slideshow-view">
      <button type="button" class="pres-close-show-btn" data-pres-act="close-slideshow" title="Fechar apresentação (Esc)">✕</button>
      <div class="screen" style="position:relative;flex:1;width:100%;display:flex;align-items:center;justify-content:center;overflow:hidden;">
        <div class="pres-stage-deck" id="pres-slideshow-deck" style="--navy:${esc(pres.primaryColor || '#0b315c')};--orange:${esc(pres.accentColor || '#f65b00')};">
          ${slideInner}
        </div>
      </div>
      <nav class="controls" aria-label="Controles da apresentação">
        <button class="ctrl" type="button" data-pres-act="show-prev" ${current === 0 ? 'disabled' : ''} title="Anterior (←)">
          <svg viewBox="0 0 24 24"><path d="m14.5 5-7 7 7 7"/></svg>
        </button>
        <span class="counter">${String(current + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}</span>
        <button class="ctrl" type="button" data-pres-act="show-next" ${current === total - 1 ? 'disabled' : ''} title="Próximo (→)">
          <svg viewBox="0 0 24 24"><path d="m9.5 5 7 7-7 7"/></svg>
        </button>
        <span class="control-divider"></span>
        <button class="ctrl" type="button" data-pres-act="editor-fullscreen" title="Tela cheia (F)">
          <svg viewBox="0 0 24 24"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>
        </button>
        <button class="ctrl" type="button" data-pres-act="editor-pdf" title="Imprimir / Salvar PDF (P)">
          <svg viewBox="0 0 24 24"><path d="M6 9V3h12v6M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14h12v7H6v-7Z"/></svg>
        </button>
      </nav>
      <div class="progress"><div class="progress-inner" style="width:${((current + 1) / (total || 1)) * 100}%;"></div></div>
    </div>
  `;
}

/* =========================================================================
   EVENT DISPATCHER & INTERACTIONS
   ========================================================================= */

export function attachPresentationListeners(root, env, rerender) {
  // Fit scales for 16:9 stage
  function updateScale() {
    const container = root.querySelector('#pres-canvas-container');
    const deck = root.querySelector('#pres-stage-deck');
    if (container && deck) {
      const cw = container.clientWidth - 40;
      const ch = container.clientHeight - 40;
      const scale = Math.max(0.1, Math.min(cw / 1440, ch / 810));
      deck.style.setProperty('--scale', scale.toString());
    }

    const showView = root.querySelector('#pres-slideshow-view');
    const showDeck = root.querySelector('#pres-slideshow-deck');
    if (showView && showDeck) {
      const sw = showView.clientWidth - 44;
      const sh = showView.clientHeight - 96;
      const scale = Math.max(0.1, Math.min(sw / 1440, sh / 810));
      showDeck.style.setProperty('--scale', scale.toString());
    }
  }

  window.addEventListener('resize', updateScale);
  setTimeout(updateScale, 30);

  // Search input
  const searchInput = root.querySelector('[data-pres-search]');
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      searchQuery = e.target.value;
      rerender();
    });
  }

  // Keyboard navigation for slideshow
  function onKeyDown(e) {
    if (!slideshowActive) return;
    if (['ArrowRight', ' ', 'PageDown'].includes(e.key)) {
      e.preventDefault();
      if (activePres && slideshowIndex < activePres.slides.length - 1) {
        slideshowIndex++;
        rerender();
      }
    } else if (['ArrowLeft', 'PageUp'].includes(e.key)) {
      e.preventDefault();
      if (slideshowIndex > 0) {
        slideshowIndex--;
        rerender();
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      slideshowIndex = 0;
      rerender();
    } else if (e.key === 'End') {
      e.preventDefault();
      if (activePres) slideshowIndex = activePres.slides.length - 1;
      rerender();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      slideshowActive = false;
      rerender();
    } else if (e.key.toLowerCase() === 'f') {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
      else document.exitFullscreen?.().catch(() => {});
    } else if (e.key.toLowerCase() === 'p') {
      window.print();
    }
  }

  window.removeEventListener('keydown', onKeyDown);
  window.addEventListener('keydown', onKeyDown);

  // Click actions delegation
  root.addEventListener('click', async ev => {
    const btn = ev.target.closest('[data-pres-act]');
    const tabBtn = ev.target.closest('[data-pres-tab]');

    if (tabBtn) {
      inspectorTab = tabBtn.dataset.presTab;
      rerender();
      return;
    }

    if (!btn) return;
    const act = btn.dataset.presAct;
    const id = btn.dataset.id;
    const company = env.agency?.company || {};

    switch (act) {
      case 'new-modal': {
        env.dialog('Nova Apresentação Comercial', `
          <p style="color:var(--muted);margin-bottom:16px;">Escolha como deseja começar sua apresentação:</p>
          <div style="display:flex;flex-direction:column;gap:12px;">
            <button type="button" class="choice" data-pres-act="use-template" data-template-id="template-crewsystems" style="text-align:left;padding:14px;border:1px solid var(--line);border-radius:10px;background:var(--surface);">
              <strong style="display:block;font-size:15px;color:var(--ink);">Usar Modelo CrewSystems (Recomendado)</strong>
              <span style="font-size:13px;color:var(--muted);">Estrutura validada com 7 lâminas: Capa, 5 Gargalos, Solução Duo, Serviços, Vendas, Pacote Tudo Incluso e Onboarding.</span>
            </button>
            <button type="button" class="choice" data-pres-act="use-template" data-template-id="template-proposta-estrategica" style="text-align:left;padding:14px;border:1px solid var(--line);border-radius:10px;background:var(--surface);">
              <strong style="display:block;font-size:15px;color:var(--ink);">Diagnóstico & Proposta Estratégica</strong>
              <span style="font-size:13px;color:var(--muted);">Estrutura executiva com diagnóstico de gargalos, os 2 motores de crescimento e cronograma de implementação.</span>
            </button>
            <button type="button" class="choice" data-pres-act="new-blank" style="text-align:left;padding:14px;border:1px solid var(--line);border-radius:10px;background:var(--surface);">
              <strong style="display:block;font-size:15px;color:var(--ink);">Começar do Zero (Em Branco)</strong>
              <span style="font-size:13px;color:var(--muted);">Crie uma apresentação do zero e adicione suas próprias lâminas personalizadas.</span>
            </button>
          </div>
        `, { wide: true });
        break;
      }

      case 'use-template': {
        env.closeDialog();
        const tplId = btn.dataset.templateId || 'template-crewsystems';
        const newPres = createPresentationFromTemplate(tplId, company);
        const savedId = await env.act('presentation-save', { data: newPres });
        newPres.id = savedId;
        activePres = newPres;
        activeSlideIndex = 0;
        slideshowActive = false;
        env.flash('Apresentação criada a partir do modelo!');
        rerender();
        break;
      }

      case 'new-blank': {
        env.closeDialog();
        const newPres = createBlankPresentation(company);
        const savedId = await env.act('presentation-save', { data: newPres });
        newPres.id = savedId;
        activePres = newPres;
        activeSlideIndex = 0;
        slideshowActive = false;
        env.flash('Apresentação em branco criada!');
        rerender();
        break;
      }

      case 'edit': {
        const found = (env.agency?.presentations || []).find(p => p.id === id);
        if (found) {
          activePres = JSON.parse(JSON.stringify(found));
          activeSlideIndex = 0;
          slideshowActive = false;
          rerender();
        }
        break;
      }

      case 'back-gallery': {
        if (saveStatus === 'dirty' && activePres) {
          await env.act('presentation-save', { id: activePres.id, data: activePres });
        }
        activePres = null;
        slideshowActive = false;
        rerender();
        break;
      }

      case 'present': {
        const found = (env.agency?.presentations || []).find(p => p.id === id);
        if (found) {
          activePres = JSON.parse(JSON.stringify(found));
          slideshowIndex = 0;
          slideshowActive = true;
          rerender();
        }
        break;
      }

      case 'editor-present': {
        slideshowIndex = activeSlideIndex;
        slideshowActive = true;
        rerender();
        break;
      }

      case 'close-slideshow': {
        slideshowActive = false;
        rerender();
        break;
      }

      case 'show-prev': {
        if (slideshowIndex > 0) {
          slideshowIndex--;
          rerender();
        }
        break;
      }

      case 'show-next': {
        if (activePres && slideshowIndex < activePres.slides.length - 1) {
          slideshowIndex++;
          rerender();
        }
        break;
      }

      case 'editor-fullscreen': {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
        else document.exitFullscreen?.().catch(() => {});
        break;
      }

      case 'editor-pdf': {
        window.print();
        break;
      }

      case 'share':
      case 'editor-share': {
        const presId = id || activePres?.id;
        const presObj = (env.agency?.presentations || []).find(p => p.id === presId) || activePres;
        if (!presObj) return;

        const hasShare = presObj.share?.id && (!presObj.share.expires || Date.parse(presObj.share.expires) > Date.now());
        const publicUrl = hasShare ? `${location.origin}/apresentacao/${presObj.share.id}` : '';

        env.dialog('Compartilhar Apresentação', `
          <p style="color:var(--muted);font-size:13px;margin-bottom:14px;">Gere um link público somente leitura para enviar ao cliente. Qualquer pessoa com o link pode abrir a apresentação diretamente no navegador sem precisar de login.</p>
          ${hasShare ? `
            <div style="background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:12px;margin-bottom:16px;">
              <span style="font-size:11px;font-weight:700;color:var(--done);text-transform:uppercase;">Link Ativo</span>
              <div style="display:flex;gap:8px;margin-top:6px;">
                <input type="text" readonly value="${esc(publicUrl)}" id="pres-share-link" style="flex:1;background:var(--surface);font-size:13px;padding:6px 10px;">
                <button type="button" class="primary" data-pres-act="copy-share-link">Copiar</button>
              </div>
            </div>
          ` : ''}
          <label>Validade do link
            <select name="days" id="pres-share-days">
              <option value="0">Sem prazo de expiração (permanente)</option>
              <option value="7">7 dias</option>
              <option value="30" selected>30 dias</option>
              <option value="90">90 dias</option>
            </select>
          </label>
        `, {
          form: 'pres-share-form',
          id: presId,
          submit: hasShare ? 'Gerar novo link' : 'Criar link público'
        });
        break;
      }

      case 'copy-share-link': {
        const input = root.querySelector('#pres-share-link');
        if (input) {
          await navigator.clipboard.writeText(input.value);
          env.flash('Link copiado para a área de transferência!');
        }
        break;
      }

      case 'duplicate': {
        await env.act('presentation-duplicate', { id });
        env.flash('Apresentação duplicada com sucesso!');
        rerender();
        break;
      }

      case 'delete': {
        env.dialog('Excluir Apresentação', `
          <p>Tem certeza de que deseja excluir permanentemente esta apresentação?</p>
          <div class="inline-gap" style="justify-content:flex-end;margin-top:16px;">
            <button type="button" class="secondary" data-close-dialog>Cancelar</button>
            <button type="button" class="primary danger" data-pres-act="confirm-delete" data-id="${esc(id)}">Sim, excluir</button>
          </div>
        `);
        break;
      }

      case 'confirm-delete': {
        env.closeDialog();
        await env.act('presentation-delete', { id });
        if (activePres?.id === id) activePres = null;
        env.flash('Apresentação excluída.');
        rerender();
        break;
      }

      case 'select-slide': {
        activeSlideIndex = Number(btn.dataset.index) || 0;
        rerender();
        break;
      }

      case 'add-slide': {
        if (!activePres) return;
        const newSlide = {
          id: `slide-${Date.now()}`,
          layout: 'services',
          eyebrow: activePres.agencyName || company.name || 'Agência',
          headline: 'Novo slide comercial.',
          rule: true,
          cards: [
            { icon: 'i-browser', title: 'Primeiro benefício', desc: 'Descrição clara e objetiva do serviço.' },
            { icon: 'i-search', title: 'Segundo benefício', desc: 'Como isso impacta o resultado do cliente.' },
            { icon: 'star', title: 'Terceiro benefício', desc: 'Diferencial competitivo da sua agência.' }
          ],
          footer: 'SERVIÇOS'
        };
        activePres.slides.push(newSlide);
        activeSlideIndex = activePres.slides.length - 1;
        saveStatus = 'dirty';
        triggerAutoSave(env);
        rerender();
        break;
      }

      case 'duplicate-slide': {
        if (!activePres || !activePres.slides.length) return;
        const current = activePres.slides[activeSlideIndex];
        const clone = JSON.parse(JSON.stringify(current));
        clone.id = `slide-${Date.now()}`;
        clone.headline = `${clone.headline} (cópia)`;
        activePres.slides.splice(activeSlideIndex + 1, 0, clone);
        activeSlideIndex++;
        saveStatus = 'dirty';
        triggerAutoSave(env);
        rerender();
        break;
      }

      case 'move-slide-up': {
        if (!activePres || activeSlideIndex <= 0) return;
        const [moved] = activePres.slides.splice(activeSlideIndex, 1);
        activePres.slides.splice(activeSlideIndex - 1, 0, moved);
        activeSlideIndex--;
        saveStatus = 'dirty';
        triggerAutoSave(env);
        rerender();
        break;
      }

      case 'move-slide-down': {
        if (!activePres || activeSlideIndex >= activePres.slides.length - 1) return;
        const [moved] = activePres.slides.splice(activeSlideIndex, 1);
        activePres.slides.splice(activeSlideIndex + 1, 0, moved);
        activeSlideIndex++;
        saveStatus = 'dirty';
        triggerAutoSave(env);
        rerender();
        break;
      }

      case 'delete-slide': {
        if (!activePres || activePres.slides.length <= 1) return;
        activePres.slides.splice(activeSlideIndex, 1);
        if (activeSlideIndex >= activePres.slides.length) activeSlideIndex = activePres.slides.length - 1;
        saveStatus = 'dirty';
        triggerAutoSave(env);
        rerender();
        break;
      }

      case 'reset-brand': {
        if (!activePres) return;
        activePres.agencyName = company.name || 'Minha Agência';
        activePres.agencyLogo = company.logo || '';
        activePres.primaryColor = company.primary || '#0b315c';
        activePres.accentColor = company.secondary || '#f65b00';
        saveStatus = 'dirty';
        triggerAutoSave(env);
        rerender();
        break;
      }

      case 'save-now': {
        if (!activePres) return;
        await env.act('presentation-save', { id: activePres.id, data: activePres });
        saveStatus = 'saved';
        env.flash('Apresentação salva!');
        rerender();
        break;
      }

      // Add/Remove sub-items
      case 'add-pill': {
        const cur = activePres?.slides[activeSlideIndex];
        if (!cur) return;
        cur.pills = cur.pills || [];
        cur.pills.push('Novo diferencial');
        saveStatus = 'dirty';
        triggerAutoSave(env);
        rerender();
        break;
      }

      case 'del-pill': {
        const cur = activePres?.slides[activeSlideIndex];
        const pidx = Number(btn.dataset.index);
        if (cur?.pills) {
          cur.pills.splice(pidx, 1);
          saveStatus = 'dirty';
          triggerAutoSave(env);
          rerender();
        }
        break;
      }

      case 'add-pain-item': {
        const cur = activePres?.slides[activeSlideIndex];
        if (!cur) return;
        cur.items = cur.items || [];
        cur.items.push({ icon: 'i-alert', text: 'Novo problema ou gargalo identificado' });
        saveStatus = 'dirty';
        triggerAutoSave(env);
        rerender();
        break;
      }

      case 'del-pain-item': {
        const cur = activePres?.slides[activeSlideIndex];
        const pidx = Number(btn.dataset.index);
        if (cur?.items) {
          cur.items.splice(pidx, 1);
          saveStatus = 'dirty';
          triggerAutoSave(env);
          rerender();
        }
        break;
      }

      case 'add-card': {
        const cur = activePres?.slides[activeSlideIndex];
        if (!cur) return;
        cur.cards = cur.cards || [];
        cur.cards.push({ icon: 'i-browser', title: 'Novo Card', desc: 'Descrição do diferencial.', accent: false });
        saveStatus = 'dirty';
        triggerAutoSave(env);
        rerender();
        break;
      }

      case 'del-card': {
        const cur = activePres?.slides[activeSlideIndex];
        const cidx = Number(btn.dataset.index);
        if (cur?.cards) {
          cur.cards.splice(cidx, 1);
          saveStatus = 'dirty';
          triggerAutoSave(env);
          rerender();
        }
        break;
      }

      case 'add-step': {
        const cur = activePres?.slides[activeSlideIndex];
        if (!cur) return;
        cur.steps = cur.steps || [];
        cur.steps.push({ number: String(cur.steps.length + 1), title: 'Nova etapa do processo', desc: 'Detalhes da entrega.' });
        saveStatus = 'dirty';
        triggerAutoSave(env);
        rerender();
        break;
      }

      case 'del-step': {
        const cur = activePres?.slides[activeSlideIndex];
        const sidx = Number(btn.dataset.index);
        if (cur?.steps) {
          cur.steps.splice(sidx, 1);
          saveStatus = 'dirty';
          triggerAutoSave(env);
          rerender();
        }
        break;
      }
    }
  });

  // Inputs change delegation
  root.addEventListener('input', ev => {
    const input = ev.target;
    const name = input.dataset.presInput;
    if (!name || !activePres) return;
    const cur = activePres.slides[activeSlideIndex];

    switch (name) {
      case 'pres-title': activePres.title = input.value; break;
      case 'slide-layout':
        if (cur) {
          cur.layout = input.value;
          // Inicializa estruturas necessárias se vazias
          if (cur.layout === 'pain' && !cur.items?.length) cur.items = [{ icon: 'i-browser', text: 'Primeiro desafio' }];
          if (['solution', 'sales'].includes(cur.layout) && !cur.cards?.length) {
            cur.cards = [{ icon: 'i-globe', title: 'Pilar 1', desc: 'Descrição' }, { icon: 'i-tag', title: 'Pilar 2', desc: 'Descrição', accent: true }];
          }
          if (cur.layout === 'services' && !cur.cards?.length) {
            cur.cards = [{ icon: 'i-browser', title: 'Serviço 1', desc: 'Descrição' }, { icon: 'i-search', title: 'Serviço 2', desc: 'Descrição' }, { icon: 'star', title: 'Serviço 3', desc: 'Descrição' }];
          }
          if (cur.layout === 'process' && !cur.steps?.length) {
            cur.steps = [{ number: '1', title: 'Etapa inicial', desc: '' }, { number: '2', title: 'Execução', desc: '' }];
          }
        }
        break;
      case 'slide-eyebrow': if (cur) cur.eyebrow = input.value; break;
      case 'slide-headline': if (cur) cur.headline = input.value; break;
      case 'slide-rule': if (cur) cur.rule = input.checked; break;
      case 'slide-footer': if (cur) cur.footer = input.value; break;
      case 'pill-text':
        if (cur?.pills) cur.pills[Number(input.dataset.index)] = input.value;
        break;
      case 'pain-icon':
        if (cur?.items) cur.items[Number(input.dataset.index)].icon = input.value;
        break;
      case 'pain-text':
        if (cur?.items) cur.items[Number(input.dataset.index)].text = input.value;
        break;
      case 'card-icon':
        if (cur?.cards) cur.cards[Number(input.dataset.index)].icon = input.value;
        break;
      case 'card-title':
        if (cur?.cards) cur.cards[Number(input.dataset.index)].title = input.value;
        break;
      case 'card-desc':
        if (cur?.cards) cur.cards[Number(input.dataset.index)].desc = input.value;
        break;
      case 'card-accent':
        if (cur?.cards) cur.cards[Number(input.dataset.index)].accent = input.checked;
        break;
      case 'step-number':
        if (cur?.steps) cur.steps[Number(input.dataset.index)].number = input.value;
        break;
      case 'step-title':
        if (cur?.steps) cur.steps[Number(input.dataset.index)].title = input.value;
        break;
      case 'step-desc':
        if (cur?.steps) cur.steps[Number(input.dataset.index)].desc = input.value;
        break;
      case 'agency-name': activePres.agencyName = input.value; break;
      case 'agency-logo': activePres.agencyLogo = input.value; break;
      case 'primary-color':
      case 'primary-color-text':
        activePres.primaryColor = input.value;
        break;
      case 'accent-color':
      case 'accent-color-text':
        activePres.accentColor = input.value;
        break;
    }

    saveStatus = 'dirty';
    triggerAutoSave(env);

    // Live update do canvas stage sem piscar a tela inteira
    const deck = root.querySelector('#pres-stage-deck');
    if (deck && cur) {
      deck.style.setProperty('--navy', activePres.primaryColor || '#0b315c');
      deck.style.setProperty('--orange', activePres.accentColor || '#f65b00');
      deck.innerHTML = renderSlideInnerHtml(cur, activeSlideIndex, activePres.slides.length, activePres);
    }
  });
}

function triggerAutoSave(env) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (!activePres) return;
    try {
      saveStatus = 'saving';
      const root = document.querySelector('#pres-editor-root');
      const statusEl = root?.querySelector('.pres-save-status');
      if (statusEl) statusEl.textContent = 'Salvando…';

      await env.act('presentation-save', { id: activePres.id, data: activePres });
      saveStatus = 'saved';
      if (statusEl) statusEl.textContent = '✓ Salvo';
    } catch (e) {
      saveStatus = 'dirty';
      const root = document.querySelector('#pres-editor-root');
      const statusEl = root?.querySelector('.pres-save-status');
      if (statusEl) statusEl.textContent = 'Erro ao salvar';
    }
  }, 1200);
}
