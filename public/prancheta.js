import { icon as i } from './icons.js';
import { h, pageShell, utabs, empty } from './screens.js';

// Canonical Presets for social & content creators
export const pranchetaPresets = [
  { id: 'instagram-carousel', name: 'Carrossel / Retrato', width: 1080, height: 1350, ratio: '4:5', badge: 'Método HEAD' },
  { id: 'instagram-feed', name: 'Post Quadrado (Feed)', width: 1080, height: 1080, ratio: '1:1', badge: '1:1' },
  { id: 'story-reels', name: 'Story & Reels', width: 1080, height: 1920, ratio: '9:16', badge: '9:16' },
  { id: 'youtube-thumb', name: 'Capa Vídeo / YouTube', width: 1280, height: 720, ratio: '16:9', badge: '16:9' },
  { id: 'banner-web', name: 'Banner Web / Hero', width: 1920, height: 1080, ratio: '16:9', badge: 'Web' }
];

// Active editor session state in memory
let activeFile = null;
let activeSlideIndex = 0;
let selectedNodeId = null;
let currentTool = 'select'; // select, hand, rect, circle, text, line, arrow
let zoomLevel = 0.45;
let panOffset = { x: 0, y: 0 };
let isDraggingNode = false;
let isPanning = false;
let dragStart = { x: 0, y: 0 };
let nodeStartPos = { x: 0, y: 0 };
let saveTimeout = null;
let saveStatus = 'saved'; // 'saved' | 'saving' | 'dirty'

// soci brand palette
const sociPalette = [
  '#FF00BB', // soci Hot Pink
  '#00F0FF', // Electric Sky
  '#FFE600', // Acid Yellow
  '#7000FF', // Electric Violet
  '#101014', // Ink Dark
  '#17171E', // Surface Dark
  '#22222D', // Card Dark
  '#FFF4E8', // Warm Cream
  '#FFFFFF', // Pure White
  '#B3B3C2'  // Muted Grey
];

/**
 * Main router for the Prancheta view in soci
 */
export function pranchetaScreen(c) {
  const hash = location.hash.slice(1);
  const parts = hash.split('/');
  const isAgency = parts[0] === 'agency';
  const subview = isAgency ? (parts[2] || 'files') : (parts[1] || 'files');
  const fileId = isAgency ? (parts[3] || '') : (parts[2] || '');

  if (subview === 'editor' && fileId) {
    return renderEditor(c, fileId);
  }

  return renderGallery(c);
}

/**
 * Renders the gallery of subaccount design files and templates
 */
function renderGallery(c) {
  const files = (c.s.pranchetaFiles || []).slice().reverse();
  const query = (c.query || '').toLowerCase().trim();
  const filtered = query
    ? files.filter(f => (f.name || '').toLowerCase().includes(query) || (f.format || '').toLowerCase().includes(query))
    : files;

  const presetsHtml = `
    <div class="pr-presets-bar" role="region" aria-label="Formatos rápidos de criação">
      ${pranchetaPresets.map(p => `
        <button type="button" class="pr-preset-chip" data-act="pr-create-preset" data-preset="${h(p.id)}" data-w="${p.width}" data-h="${p.height}" data-name="${h(p.name)}">
          ${i('palette', 15)}
          <span>${h(p.name)}</span>
          <span class="pr-preset-dim">${p.width}×${p.height}</span>
        </button>
      `).join('')}
    </div>
  `;

  const templatesHtml = `
    <section class="pr-section-title">
      <h2>${i('spark', 16)} Modelos Estratégicos <span class="pr-badge-pill">Prontos para Usar</span></h2>
    </section>
    <div class="pr-template-grid">
      <article class="pr-template-card" data-act="pr-use-template" data-tpl="template-head-carousel">
        <div class="pr-template-preview">
          <span class="tpl-badge">MÉTODO HEAD · 3 SLIDES</span>
          <div class="tpl-headline">Como parar o feed e gerar desejo imediato.</div>
          <div class="tpl-sub">Carrossel estruturado: Gancho → Tensão → CTA</div>
        </div>
        <div class="pr-template-info">
          <h3>Carrossel de Alto Impacto</h3>
          <p>Estrutura visual comprovada para engajamento e retenção de carrosséis no Instagram.</p>
        </div>
      </article>

      <article class="pr-template-card" data-act="pr-use-template" data-tpl="template-quote-impact">
        <div class="pr-template-preview" style="background:#0D0D11">
          <span class="tpl-badge" style="color:var(--pr-sky)">EDITORIAL · AUTORIDADE</span>
          <div class="tpl-headline">“Estratégia precisa ser sentida. Marca é o que ela faz você fazer.”</div>
          <div class="tpl-sub">— Citação minimalista com contraste forte</div>
        </div>
        <div class="pr-template-info">
          <h3>Post Manifesto & Citação</h3>
          <p>Tipografia elegante e contrastante para frases, posicionamento e tweets de autoridade.</p>
        </div>
      </article>

      <article class="pr-template-card" data-act="pr-use-template" data-tpl="template-story-promo">
        <div class="pr-template-preview" style="background:#14141E">
          <span class="tpl-badge" style="color:var(--pr-yellow)">VERTICAL 9:16</span>
          <div class="tpl-headline">Transforme o conteúdo da marca em clientes reais.</div>
          <div class="tpl-sub">Story com headline de choque e botão de chamada</div>
        </div>
        <div class="pr-template-info">
          <h3>Story & Reels Promoção</h3>
          <p>Anúncio vertical dinâmico para lançamentos, ofertas e chamadas no Instagram.</p>
        </div>
      </article>
    </div>
  `;

  const isAgency = c.mode === 'agency' || location.hash.startsWith('#agency');
  const orgName = isAgency ? (c.s.company?.name || c.agency?.company?.name || 'Agência') : (c.s.profile?.name || 'Subconta');

  const filesHtml = filtered.length ? `
    <section class="pr-section-title">
      <h2>${i('folder', 16)} ${isAgency ? 'Artes da Agência' : 'Artes desta Subconta'} <span class="pr-badge-pill">${filtered.length}</span></h2>
    </section>
    <div class="pr-files-grid">
      ${filtered.map(f => {
        const slidesCount = (f.pages && f.pages.length) || 1;
        const updatedDate = f.updated ? new Date(f.updated).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—';
        return `
          <article class="pr-file-card" data-id="${h(f.id)}">
            <div class="pr-file-thumb" data-act="pr-open-editor" data-id="${h(f.id)}">
              ${f.thumbnail ? `<img src="${h(f.thumbnail)}" alt="${h(f.name)}" loading="lazy">` : `
                <div class="pr-file-thumb-fallback">
                  ${i('palette', 36)}
                  <span>${f.width || 1080} × ${f.height || 1080}</span>
                </div>
              `}
              <span class="pr-file-format-tag">${h(f.format || 'custom')}</span>
              ${slidesCount > 1 ? `<span class="pr-file-slides-tag">${slidesCount} slides</span>` : ''}
            </div>
            <div class="pr-file-body">
              <h3 class="pr-file-title" data-act="pr-open-editor" data-id="${h(f.id)}" title="${h(f.name)}">${h(f.name)}</h3>
              <div class="pr-file-meta">
                <span>${f.width || 1080}×${f.height || 1080} px</span>
                <span>${updatedDate}</span>
              </div>
            </div>
            <div class="pr-file-actions">
              <button type="button" class="primary-btn" data-act="pr-open-editor" data-id="${h(f.id)}" title="Abrir editor">
                ${i('edit', 13)} Editar
              </button>
              ${isAgency ? '' : `
              <button type="button" data-act="pr-export-drive" data-id="${h(f.id)}" title="Salvar no Mídia Drive da subconta">
                ${i('folder', 13)}
              </button>
              <button type="button" data-act="pr-to-social" data-id="${h(f.id)}" title="Agendar post com esta arte">
                ${i('send', 13)}
              </button>
              `}
              <button type="button" data-act="pr-duplicate" data-id="${h(f.id)}" title="Duplicar">
                ${i('copy', 13)}
              </button>
              <button type="button" data-act="pr-delete" data-id="${h(f.id)}" title="Excluir">
                ${i('trash', 13)}
              </button>
            </div>
          </article>
        `;
      }).join('')}
    </div>
  ` : `
    <div class="pr-empty-box">
      ${i('palette', 48)}
      <h3>${isAgency ? 'Nenhuma arte criada na agência' : 'Nenhuma arte criada nesta subconta'}</h3>
      <p>${isAgency ? 'Crie sua primeira arte vetorial para a agência, escolha um modelo estratégico ou clique num formato acima.' : 'Crie sua primeira arte vetorial, escolha um modelo estratégico ou clique num formato acima para começar.'}</p>
      <button type="button" class="primary" data-act="pr-create-modal">${i('plus', 16)} Nova arte em branco</button>
    </div>
  `;

  const content = `
    <div class="pr-gallery-wrap">
      ${presetsHtml}
      ${templatesHtml}
      ${filesHtml}
    </div>
  `;

  return pageShell({
    title: 'Prancheta Criativa',
    desc: isAgency
      ? 'Estúdio de design vetorial da agência. Crie carrosséis, posts, stories e capas com visual oficial da soci.'
      : `Estúdio de design vetorial da subconta ${h(orgName)}. Crie carrosséis, posts, stories e capas com visual oficial da soci.`,
    cta: `
      <button type="button" class="secondary" data-act="pr-import-json">${i('upload', 15)} Importar JSON</button>
      <button type="button" class="primary" data-act="pr-create-modal">${i('plus', 15)} Nova Arte</button>
    `,
    tabs: {
      key: 'prancheta-view',
      items: [
        ['files', 'Minhas Artes'],
        ['templates', 'Modelos Oficiais']
      ],
      current: 'files',
      label: 'Navegação da Prancheta'
    },
    content
  });
}

/**
 * Renders the Interactive Canvas Editor for a specific file
 */
function renderEditor(c, fileId) {
  const isAgency = c.mode === 'agency' || location.hash.startsWith('#agency');
  const file = (c.s.pranchetaFiles || []).find(f => f.id === fileId);
  if (!file) {
    return pageShell({
      title: 'Arte não encontrada',
      desc: isAgency ? 'O arquivo solicitado não existe ou foi excluído da agência.' : 'O arquivo solicitado não existe ou foi excluído desta subconta.',
      cta: `<a class="secondary" href="${isAgency ? '#agency/prancheta' : '#prancheta'}">Voltar para galeria</a>`,
      content: empty('Design indisponível', 'Retorne à galeria de artes para selecionar outro projeto.', 'palette')
    });
  }

  // Load into memory
  activeFile = file;
  if (!activeFile.pages || !activeFile.pages.length) {
    activeFile.pages = [{ id: 'p1', name: 'Lâmina 1', background: '#101014', nodes: [] }];
  }
  if (activeSlideIndex >= activeFile.pages.length) {
    activeSlideIndex = 0;
  }

  const currentSlide = activeFile.pages[activeSlideIndex] || activeFile.pages[0];
  const nodes = currentSlide.nodes || [];
  const selectedNode = nodes.find(n => n.id === selectedNodeId) || null;

  // Compute scaled preview size for the artboard
  const boardWidth = file.width || 1080;
  const boardHeight = file.height || 1080;
  const scaledWidth = Math.round(boardWidth * zoomLevel);
  const scaledHeight = Math.round(boardHeight * zoomLevel);

  return `
    <div class="pr-editor-view" data-file-id="${h(file.id)}">
      <!-- Topbar -->
      <header class="pr-topbar">
        <div class="pr-topbar-left">
          <button type="button" class="pr-back-btn" data-act="pr-back-gallery">
            ${i('arrowLeft', 14)} <span>Artes</span>
          </button>
          <input type="text" class="pr-file-name-input" value="${h(file.name)}" data-act="pr-rename" title="Clique para renomear" maxlength="150" aria-label="Nome do design">
          <span class="pr-save-indicator ${saveStatus}">
            ${saveStatus === 'saving' ? i('refresh', 12) + ' Salvando…' : saveStatus === 'dirty' ? 'Alterações pendentes' : (isAgency ? '✓ Salvo na agência' : '✓ Salvo na subconta')}
          </span>
        </div>

        <div class="pr-topbar-center">
          <div class="pr-slide-nav" role="group" aria-label="Navegação de lâminas do carrossel">
            <button type="button" data-act="pr-prev-slide" title="Lâmina anterior" ${activeSlideIndex === 0 ? 'disabled' : ''}>${i('arrowLeft', 13)}</button>
            <span class="pr-slide-count">Slide ${activeSlideIndex + 1} de ${activeFile.pages.length}</span>
            <button type="button" data-act="pr-next-slide" title="Próxima lâmina" ${activeSlideIndex >= activeFile.pages.length - 1 ? 'disabled' : ''}>${i('arrow', 13)}</button>
            <button type="button" data-act="pr-add-slide" title="Adicionar nova lâmina ao carrossel" style="margin-left:4px;color:var(--pr-pink)">${i('plus', 13)} Lâmina</button>
          </div>
        </div>

        <div class="pr-topbar-right">
          ${isAgency ? '' : `
          <button type="button" class="pr-back-btn" data-act="pr-save-drive" title="Salvar PNG de alta resolução no Mídia Drive da subconta">
            ${i('folder', 14)} <span>Salvar no Drive</span>
          </button>
          <button type="button" class="pr-back-btn" data-act="pr-post-social" title="Criar post no Planejador Social com esta arte">
            ${i('send', 14)} <span>Agendar Post</span>
          </button>
          `}
          <button type="button" class="pr-back-btn" data-act="pr-download-png" title="Baixar imagem em PNG">
            ${i('download', 14)} <span>PNG</span>
          </button>
          <button type="button" class="pr-back-btn" data-act="pr-download-json" title="Baixar arquivo JSON">
            ${i('download', 14)} <span>JSON</span>
          </button>
        </div>
      </header>

      <!-- Main Workspace Body -->
      <div class="pr-editor-body">
        <!-- Left Panel: Layers and Slides -->
        <aside class="pr-left-panel">
          <div class="pr-panel-tabs">
            <button type="button" class="pr-panel-tab active" data-left-tab="layers">Camadas</button>
            <button type="button" class="pr-panel-tab" data-left-tab="slides">Slides (${activeFile.pages.length})</button>
          </div>
          <div class="pr-panel-content" id="pr-left-content">
            <div class="pr-layers-list">
              ${nodes.slice().reverse().map(n => `
                <div class="pr-layer-item ${n.id === selectedNodeId ? 'selected' : ''}" data-act="pr-select-node" data-node-id="${h(n.id)}">
                  <div class="pr-layer-info">
                    ${n.type === 'TEXT' ? i('type', 13) : n.type === 'IMAGE' ? i('image', 13) : i('palette', 13)}
                    <span>${h(n.text ? n.text.slice(0, 18) : n.name || n.type)}</span>
                  </div>
                  <div class="pr-layer-actions">
                    <button type="button" data-act="pr-node-bring-front" data-node-id="${h(n.id)}" title="Trazer para frente">↑</button>
                    <button type="button" data-act="pr-node-send-back" data-node-id="${h(n.id)}" title="Enviar para trás">↓</button>
                    <button type="button" data-act="pr-delete-node" data-node-id="${h(n.id)}" title="Remover camada">${i('trash', 12)}</button>
                  </div>
                </div>
              `).join('') || '<p style="color:var(--text-muted);font-size:12px;text-align:center;padding:16px 0">Nenhum elemento neste slide. Adicione formas ou textos pela barra de ferramentas.</p>'}
            </div>
          </div>
        </aside>

        <!-- Canvas Stage -->
        <main class="pr-canvas-stage" id="pr-stage">
          <!-- Floating Toolbar -->
          <nav class="pr-toolbar" role="toolbar" aria-label="Ferramentas de desenho">
            <button type="button" class="pr-tool-btn ${currentTool === 'select' ? 'active' : ''}" data-tool="select" title="Seleção (V)">${i('arrow', 16)}</button>
            <button type="button" class="pr-tool-btn ${currentTool === 'hand' ? 'active' : ''}" data-tool="hand" title="Mão / Pan (H)">${i('hand', 16)}</button>
            <div class="pr-tool-separator"></div>
            <button type="button" class="pr-tool-btn" data-act="pr-add-rect" title="Adicionar Retângulo (R)">${i('grid', 16)}</button>
            <button type="button" class="pr-tool-btn" data-act="pr-add-circle" title="Adicionar Círculo (O)">${i('sun', 16)}</button>
            <button type="button" class="pr-tool-btn" data-act="pr-add-text" title="Adicionar Texto (T)">${i('edit', 16)}</button>
            <button type="button" class="pr-tool-btn" data-act="pr-add-image-modal" title="Inserir Imagem do PC ou Drive">${i('image', 16)}</button>
            <div class="pr-tool-separator"></div>
            <button type="button" class="pr-tool-btn" data-act="pr-undo" title="Desfazer (Ctrl+Z)">${i('arrowLeft', 15)}</button>
            <button type="button" class="pr-tool-btn" data-act="pr-redo" title="Refazer (Ctrl+Y)">${i('arrow', 15)}</button>
          </nav>

          <!-- Artboard Container -->
          <div class="pr-board-wrapper" id="pr-board-wrapper" style="width:${scaledWidth}px;height:${scaledHeight}px;background:${currentSlide.background || '#101014'};transform:translate(${panOffset.x}px, ${panOffset.y}px);">
            <div class="pr-artboard" id="pr-artboard" style="width:${boardWidth}px;height:${boardHeight}px;transform:scale(${zoomLevel});transform-origin:0 0;">
              ${nodes.map(n => renderNodeElement(n, n.id === selectedNodeId)).join('')}
            </div>
          </div>

          <!-- Bottom Zoom Dock -->
          <div class="pr-bottom-dock">
            <button type="button" data-act="pr-zoom-out" title="Diminuir zoom">−</button>
            <span style="font-size:11px;font-weight:700;padding:0 6px">${Math.round(zoomLevel * 100)}%</span>
            <button type="button" data-act="pr-zoom-in" title="Aumentar zoom">+</button>
            <button type="button" data-act="pr-zoom-fit" title="Ajustar tela">Ajustar</button>
          </div>
        </main>

        <!-- Right Property Inspector -->
        <aside class="pr-right-panel">
          ${selectedNode ? renderNodeInspector(selectedNode) : renderSlideInspector(currentSlide, file)}
        </aside>
      </div>
    </div>
  `;
}

/**
 * Renders an individual node onto the DOM artboard
 */
function renderNodeElement(node, isSelected) {
  const x = node.x || 0;
  const y = node.y || 0;
  const w = node.width || 200;
  const h = node.height || 60;
  const rot = node.rotation || 0;
  const op = node.opacity !== undefined ? node.opacity : 1;
  const fill = (node.fills && node.fills[0]?.color) || '#FFFFFF';
  const radius = node.cornerRadius || 0;

  const style = [
    `left:${x}px`,
    `top:${y}px`,
    `width:${w}px`,
    `height:${h}px`,
    `transform:rotate(${rot}deg)`,
    `opacity:${op}`,
    `border-radius:${radius}px`
  ];

  if (node.type === 'RECTANGLE' || node.type === 'SHAPE') {
    style.push(`background-color:${fill}`);
    if (node.stroke) style.push(`border:${node.stroke.width || 1}px solid ${node.stroke.color || '#000'}`);
  } else if (node.type === 'ELLIPSE') {
    style.push(`background-color:${fill}`);
    style.push(`border-radius:50%`);
  } else if (node.type === 'TEXT') {
    style.push(`color:${fill}`);
    style.push(`font-size:${node.fontSize || 32}px`);
    style.push(`font-weight:${node.fontWeight || 700}`);
    style.push(`line-height:${node.lineHeight || 1.2}`);
    style.push(`font-family:${node.fontFamily || 'Plus Jakarta Sans, Inter, sans-serif'}`);
    style.push(`white-space:pre-wrap`);
    style.push(`word-break:break-word`);
  } else if (node.type === 'IMAGE' && node.src) {
    style.push(`background-image:url(${node.src})`);
    style.push(`background-size:cover`);
    style.push(`background-position:center`);
  }

  const handles = isSelected ? `
    <span class="pr-handle nw" data-handle="nw"></span>
    <span class="pr-handle ne" data-handle="ne"></span>
    <span class="pr-handle sw" data-handle="sw"></span>
    <span class="pr-handle se" data-handle="se"></span>
    <span class="pr-handle n" data-handle="n"></span>
    <span class="pr-handle s" data-handle="s"></span>
    <span class="pr-handle w" data-handle="w"></span>
    <span class="pr-handle e" data-handle="e"></span>
  ` : '';

  return `
    <div class="pr-node ${isSelected ? 'selected' : ''}" id="node-${h(node.id)}" data-node-id="${h(node.id)}" style="${style.join(';')}">
      ${node.type === 'TEXT' ? h(node.text || 'Texto') : ''}
      ${handles}
    </div>
  `;
}

/**
 * Inspector panel when an object is selected
 */
function renderNodeInspector(node) {
  const fill = (node.fills && node.fills[0]?.color) || '#FFFFFF';

  return `
    <div class="pr-prop-section">
      <h4>${i('palette', 14)} ${h(node.name || node.type)}</h4>
      
      <div class="pr-prop-row">
        <label class="pr-prop-field">
          <span>X</span>
          <input type="number" value="${Math.round(node.x || 0)}" data-prop="x">
        </label>
        <label class="pr-prop-field">
          <span>Y</span>
          <input type="number" value="${Math.round(node.y || 0)}" data-prop="y">
        </label>
      </div>

      <div class="pr-prop-row">
        <label class="pr-prop-field">
          <span>L</span>
          <input type="number" value="${Math.round(node.width || 100)}" data-prop="width">
        </label>
        <label class="pr-prop-field">
          <span>A</span>
          <input type="number" value="${Math.round(node.height || 100)}" data-prop="height">
        </label>
      </div>

      <div class="pr-prop-row">
        <label class="pr-prop-field">
          <span>Cantos</span>
          <input type="number" value="${node.cornerRadius || 0}" data-prop="cornerRadius" min="0" max="200">
        </label>
        <label class="pr-prop-field">
          <span>Opacidade</span>
          <input type="number" value="${Math.round((node.opacity !== undefined ? node.opacity : 1) * 100)}" data-prop="opacity" min="0" max="100">
        </label>
      </div>
    </div>

    ${node.type === 'TEXT' ? `
      <div class="pr-prop-section">
        <h4>${i('edit', 14)} Tipografia</h4>
        <div class="pr-prop-row single">
          <label class="pr-prop-field">
            <span>Conteúdo</span>
            <input type="text" value="${h(node.text || '')}" data-prop="text" placeholder="Digite seu texto…">
          </label>
        </div>
        <div class="pr-prop-row">
          <label class="pr-prop-field">
            <span>Tamanho</span>
            <input type="number" value="${node.fontSize || 32}" data-prop="fontSize" min="10" max="200">
          </label>
          <label class="pr-prop-field">
            <span>Peso</span>
            <select data-prop="fontWeight">
              <option value="400" ${node.fontWeight === 400 || node.fontWeight === '400' ? 'selected' : ''}>Normal 400</option>
              <option value="600" ${node.fontWeight === 600 || node.fontWeight === '600' ? 'selected' : ''}>Semibold 600</option>
              <option value="700" ${node.fontWeight === 700 || node.fontWeight === '700' || !node.fontWeight ? 'selected' : ''}>Bold 700</option>
              <option value="800" ${node.fontWeight === 800 || node.fontWeight === '800' ? 'selected' : ''}>ExtraBold 800</option>
              <option value="900" ${node.fontWeight === 900 || node.fontWeight === '900' ? 'selected' : ''}>Black 900</option>
            </select>
          </label>
        </div>
      </div>
    ` : ''}

    <div class="pr-prop-section">
      <h4>${i('palette', 14)} Preenchimento</h4>
      <div class="pr-prop-row single">
        <label class="pr-prop-field">
          <span>Cor</span>
          <input type="color" value="${fill}" data-prop="fillColor">
        </label>
      </div>

      <div class="pr-swatches">
        ${sociPalette.map(hex => `
          <div class="pr-swatch" style="background:${hex}" data-act="pr-pick-swatch" data-color="${hex}" title="${hex}"></div>
        `).join('')}
      </div>
    </div>

    <div class="pr-prop-section" style="margin-top:auto">
      <button type="button" class="secondary" data-act="pr-delete-selected-node" style="width:100%;color:#FF3D8D">
        ${i('trash', 14)} Excluir elemento
      </button>
    </div>
  `;
}

/**
 * Inspector panel when no node is selected (Slide settings)
 */
function renderSlideInspector(slide, file) {
  return `
    <div class="pr-prop-section">
      <h4>${i('palette', 14)} Prancheta / Slide</h4>
      <div class="pr-prop-row">
        <label class="pr-prop-field">
          <span>Largura</span>
          <input type="number" value="${file.width || 1080}" disabled>
        </label>
        <label class="pr-prop-field">
          <span>Altura</span>
          <input type="number" value="${file.height || 1080}" disabled>
        </label>
      </div>
    </div>

    <div class="pr-prop-section">
      <h4>${i('sun', 14)} Cor de Fundo</h4>
      <div class="pr-prop-row single">
        <label class="pr-prop-field">
          <span>Fundo</span>
          <input type="color" value="${slide.background || '#101014'}" data-slide-prop="background">
        </label>
      </div>
      <div class="pr-swatches">
        ${sociPalette.map(hex => `
          <div class="pr-swatch" style="background:${hex}" data-act="pr-pick-slide-bg" data-color="${hex}" title="${hex}"></div>
        `).join('')}
      </div>
    </div>

    <div class="pr-prop-section">
      <h4>${i('spark', 14)} Atalhos Rápidos</h4>
      <p style="font-size:12px;color:var(--text-muted);line-height:1.5">
        • <b>V</b>: Seleção<br>
        • <b>H</b> ou Espaço: Mover canvas<br>
        • <b>R</b>: Retângulo<br>
        • <b>T</b>: Texto<br>
        • <b>Delete</b>: Apagar selecionado<br>
        • <b>Ctrl+Z</b>: Desfazer
      </p>
    </div>
  `;
}

/**
 * Installs interactive event listeners and actions for Prancheta
 */
export function installPrancheta({ c, api, url, mutate, flash, render, getState }) {
  const isAgencyRoute = () => location.hash.startsWith('#agency');
  const getBaseHash = () => isAgencyRoute() ? '#agency/prancheta' : '#prancheta';
  const getFiles = () => (getState ? getState() : c.s)?.pranchetaFiles || [];

  // Preset creation buttons
  document.addEventListener('click', async (e) => {
    // Blank creation modal / button
    const createModalBtn = e.target.closest('[data-act="pr-create-modal"]');
    if (createModalBtn) {
      const newId = await mutate({
        type: 'prancheta-save',
        data: {
          name: `Arte em Branco #${(getFiles().length || 0) + 1}`,
          format: 'instagram-feed',
          width: 1080,
          height: 1080,
          pages: [
            {
              id: 'slide-1',
              name: 'Lâmina 1',
              background: '#101014',
              nodes: [
                {
                  id: 'headline-1',
                  type: 'TEXT',
                  x: 108,
                  y: 400,
                  width: 864,
                  height: 120,
                  text: 'Seu título de impacto aqui',
                  fontSize: 60,
                  fontWeight: 800,
                  fills: [{ type: 'SOLID', color: '#FFFFFF' }]
                }
              ]
            }
          ]
        }
      });
      location.hash = `${getBaseHash()}/editor/${newId}`;
      return;
    }

    const chip = e.target.closest('[data-act="pr-create-preset"]');
    if (chip) {
      const format = chip.dataset.preset;
      const width = Number(chip.dataset.w) || 1080;
      const height = Number(chip.dataset.h) || 1080;
      const formatName = chip.dataset.name || 'Nova Arte';

      const newId = await mutate({
        type: 'prancheta-save',
        data: {
          name: `${formatName} #${(getFiles().length || 0) + 1}`,
          format,
          width,
          height,
          pages: [
            {
              id: 'slide-1',
              name: 'Lâmina 1',
              background: '#101014',
              nodes: [
                {
                  id: 'headline-1',
                  type: 'TEXT',
                  x: Math.round(width * 0.1),
                  y: Math.round(height * 0.35),
                  width: Math.round(width * 0.8),
                  height: 120,
                  text: 'Seu título de impacto aqui',
                  fontSize: Math.round(width * 0.055),
                  fontWeight: 800,
                  fills: [{ type: 'SOLID', color: '#FFFFFF' }]
                }
              ]
            }
          ]
        }
      });

      location.hash = `${getBaseHash()}/editor/${newId}`;
      return;
    }

    // Use strategic canonical template
    const tplCard = e.target.closest('[data-act="pr-use-template"]');
    if (tplCard) {
      const templateId = tplCard.dataset.tpl;
      const newId = await mutate({
        type: 'prancheta-template',
        data: { templateId }
      });
      flash('Modelo criado com sucesso!');
      location.hash = `${getBaseHash()}/editor/${newId}`;
      return;
    }

    // Open editor
    const openBtn = e.target.closest('[data-act="pr-open-editor"]');
    if (openBtn) {
      const id = openBtn.dataset.id;
      if (id) location.hash = `${getBaseHash()}/editor/${id}`;
      return;
    }

    // Duplicate
    const dupBtn = e.target.closest('[data-act="pr-duplicate"]');
    if (dupBtn) {
      const id = dupBtn.dataset.id;
      if (id) {
        await mutate({ type: 'prancheta-duplicate', id });
        flash('Arte duplicada com sucesso!');
        render();
      }
      return;
    }

    // Delete
    const delBtn = e.target.closest('[data-act="pr-delete"]');
    if (delBtn) {
      const id = delBtn.dataset.id;
      if (id && confirm('Deseja excluir esta arte?')) {
        await mutate({ type: 'prancheta-delete', id });
        flash('Arte excluída.');
        render();
      }
      return;
    }

    // Export to Mídia Drive
    const driveBtn = e.target.closest('[data-act="pr-export-drive"]');
    if (driveBtn) {
      const id = driveBtn.dataset.id;
      const file = getFiles().find(f => f.id === id);
      if (file) {
        // Generate a clean PNG data URL from the first slide
        const dataUri = await renderFileToDataUri(file, 0);
        await mutate({
          type: 'prancheta-export-media',
          id,
          data: { data: dataUri, name: file.name }
        });
        flash('Arte exportada para o Mídia Drive desta subconta!');
        render();
      }
      return;
    }

    // Send to Social Planner
    const socialBtn = e.target.closest('[data-act="pr-to-social"]');
    if (socialBtn) {
      const id = socialBtn.dataset.id;
      const file = getFiles().find(f => f.id === id);
      if (file) {
        const dataUri = await renderFileToDataUri(file, 0);
        await mutate({
          type: 'prancheta-to-social',
          id,
          data: { data: dataUri, body: `Novo post: ${file.name}` }
        });
        flash('Post rascunhado no Planejador Social!');
        location.hash = '#marketing/social';
      }
      return;
    }

    // Editor: Back to gallery
    if (e.target.closest('[data-act="pr-back-gallery"]')) {
      if (activeFile) await saveActiveFile(mutate);
      location.hash = getBaseHash();
      return;
    }

    // Editor: Add slide
    if (e.target.closest('[data-act="pr-add-slide"]')) {
      if (!activeFile) return;
      const newSlide = {
        id: `slide-${activeFile.pages.length + 1}`,
        name: `Lâmina ${activeFile.pages.length + 1}`,
        background: activeFile.pages[activeSlideIndex]?.background || '#101014',
        nodes: []
      };
      activeFile.pages.push(newSlide);
      activeSlideIndex = activeFile.pages.length - 1;
      selectedNodeId = null;
      triggerAutosave(mutate);
      render();
      return;
    }

    // Editor: Prev/Next slide
    if (e.target.closest('[data-act="pr-prev-slide"]')) {
      if (activeSlideIndex > 0) {
        activeSlideIndex--;
        selectedNodeId = null;
        render();
      }
      return;
    }
    if (e.target.closest('[data-act="pr-next-slide"]')) {
      if (activeFile && activeSlideIndex < activeFile.pages.length - 1) {
        activeSlideIndex++;
        selectedNodeId = null;
        render();
      }
      return;
    }

    // Editor Toolbar: Add Rectangle
    if (e.target.closest('[data-act="pr-add-rect"]')) {
      addShapeNode('RECTANGLE');
      triggerAutosave(mutate);
      render();
      return;
    }

    // Editor Toolbar: Add Circle
    if (e.target.closest('[data-act="pr-add-circle"]')) {
      addShapeNode('ELLIPSE');
      triggerAutosave(mutate);
      render();
      return;
    }

    // Editor Toolbar: Add Text
    if (e.target.closest('[data-act="pr-add-text"]')) {
      addTextNode();
      triggerAutosave(mutate);
      render();
      return;
    }

    // Editor: Delete Selected Node
    if (e.target.closest('[data-act="pr-delete-selected-node"]') || e.target.closest('[data-act="pr-delete-node"]')) {
      const btn = e.target.closest('[data-act="pr-delete-node"]');
      const targetId = btn ? btn.dataset.nodeId : selectedNodeId;
      if (targetId && activeFile) {
        const slide = activeFile.pages[activeSlideIndex];
        if (slide) {
          slide.nodes = (slide.nodes || []).filter(n => n.id !== targetId);
          if (selectedNodeId === targetId) selectedNodeId = null;
          triggerAutosave(mutate);
          render();
        }
      }
      return;
    }

    // Editor: Node Layer reordering
    const bringFront = e.target.closest('[data-act="pr-node-bring-front"]');
    if (bringFront && activeFile) {
      const nid = bringFront.dataset.nodeId;
      const slide = activeFile.pages[activeSlideIndex];
      const idx = slide.nodes.findIndex(n => n.id === nid);
      if (idx < slide.nodes.length - 1) {
        const item = slide.nodes.splice(idx, 1)[0];
        slide.nodes.push(item);
        triggerAutosave(mutate);
        render();
      }
      return;
    }
    const sendBack = e.target.closest('[data-act="pr-node-send-back"]');
    if (sendBack && activeFile) {
      const nid = sendBack.dataset.nodeId;
      const slide = activeFile.pages[activeSlideIndex];
      const idx = slide.nodes.findIndex(n => n.id === nid);
      if (idx > 0) {
        const item = slide.nodes.splice(idx, 1)[0];
        slide.nodes.unshift(item);
        triggerAutosave(mutate);
        render();
      }
      return;
    }

    // Editor: Select node from layer list
    const selectLayer = e.target.closest('[data-act="pr-select-node"]');
    if (selectLayer) {
      selectedNodeId = selectLayer.dataset.nodeId;
      render();
      return;
    }

    // Editor: Swatch pick for fill
    const swatch = e.target.closest('[data-act="pr-pick-swatch"]');
    if (swatch && selectedNodeId && activeFile) {
      const color = swatch.dataset.color;
      const slide = activeFile.pages[activeSlideIndex];
      const node = slide?.nodes?.find(n => n.id === selectedNodeId);
      if (node) {
        node.fills = [{ type: 'SOLID', color }];
        triggerAutosave(mutate);
        render();
      }
      return;
    }

    // Editor: Swatch pick for slide background
    const bgSwatch = e.target.closest('[data-act="pr-pick-slide-bg"]');
    if (bgSwatch && activeFile) {
      const color = bgSwatch.dataset.color;
      const slide = activeFile.pages[activeSlideIndex];
      if (slide) {
        slide.background = color;
        triggerAutosave(mutate);
        render();
      }
      return;
    }

    // Editor: Zoom controls
    if (e.target.closest('[data-act="pr-zoom-in"]')) {
      zoomLevel = Math.min(2.0, zoomLevel + 0.1);
      render();
      return;
    }
    if (e.target.closest('[data-act="pr-zoom-out"]')) {
      zoomLevel = Math.max(0.15, zoomLevel - 0.1);
      render();
      return;
    }
    if (e.target.closest('[data-act="pr-zoom-fit"]')) {
      zoomLevel = 0.45;
      panOffset = { x: 0, y: 0 };
      render();
      return;
    }

    // Editor: Save to Drive button inside editor
    if (e.target.closest('[data-act="pr-save-drive"]')) {
      if (activeFile) {
        const dataUri = await renderFileToDataUri(activeFile, activeSlideIndex);
        await mutate({
          type: 'prancheta-export-media',
          id: activeFile.id,
          data: { data: dataUri, name: `${activeFile.name} - Slide ${activeSlideIndex + 1}` }
        });
        flash('Slide salvo no Mídia Drive com sucesso!');
      }
      return;
    }

    // Editor: Agendar post from editor
    if (e.target.closest('[data-act="pr-post-social"]')) {
      if (activeFile) {
        const dataUri = await renderFileToDataUri(activeFile, activeSlideIndex);
        await mutate({
          type: 'prancheta-to-social',
          id: activeFile.id,
          data: { data: dataUri, body: `${activeFile.name} · Slide ${activeSlideIndex + 1}` }
        });
        flash('Post rascunhado no Planejador Social!');
        location.hash = '#marketing/social';
      }
      return;
    }

    // Editor: Download PNG
    if (e.target.closest('[data-act="pr-download-png"]')) {
      if (activeFile) {
        const dataUri = await renderFileToDataUri(activeFile, activeSlideIndex);
        downloadDataUri(dataUri, `${activeFile.name || 'arte'}-slide-${activeSlideIndex + 1}.png`);
      }
      return;
    }

    // Editor: Download JSON
    if (e.target.closest('[data-act="pr-download-json"]')) {
      if (activeFile) {
        const jsonStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(activeFile, null, 2));
        downloadDataUri(jsonStr, `${activeFile.name || 'arte'}.prancheta.json`);
      }
      return;
    }

    // Canvas click on a node directly
    const nodeEl = e.target.closest('.pr-node');
    if (nodeEl && !e.target.closest('.pr-handle')) {
      selectedNodeId = nodeEl.dataset.nodeId;
      render();
      return;
    }

    // Clicked stage background -> deselect
    if (e.target.classList?.contains('pr-canvas-stage') || e.target.id === 'pr-stage' || e.target.id === 'pr-artboard') {
      if (selectedNodeId) {
        selectedNodeId = null;
        render();
      }
    }
  });

  // Input changes for Property Inspector
  document.addEventListener('input', (e) => {
    const propInput = e.target.closest('[data-prop]');
    if (propInput && selectedNodeId && activeFile) {
      const prop = propInput.dataset.prop;
      const slide = activeFile.pages[activeSlideIndex];
      const node = slide?.nodes?.find(n => n.id === selectedNodeId);
      if (node) {
        let val = propInput.value;
        if (['x', 'y', 'width', 'height', 'cornerRadius', 'fontSize'].includes(prop)) {
          val = Number(val) || 0;
        } else if (prop === 'opacity') {
          val = Math.max(0, Math.min(1, (Number(val) || 100) / 100));
        } else if (prop === 'fillColor') {
          node.fills = [{ type: 'SOLID', color: val }];
          triggerAutosave(mutate);
          updateDomNode(node);
          return;
        }
        node[prop] = val;
        triggerAutosave(mutate);
        updateDomNode(node);
      }
      return;
    }

    // Slide background input
    const slideBg = e.target.closest('[data-slide-prop="background"]');
    if (slideBg && activeFile) {
      const slide = activeFile.pages[activeSlideIndex];
      if (slide) {
        slide.background = slideBg.value;
        const board = document.getElementById('pr-board-wrapper');
        if (board) board.style.backgroundColor = slideBg.value;
        triggerAutosave(mutate);
      }
      return;
    }

    // File rename input in topbar
    if (e.target.dataset?.act === 'pr-rename' && activeFile) {
      activeFile.name = e.target.value;
      triggerAutosave(mutate);
    }
  });

  // Canvas Mouse Dragging & Moving of Nodes
  document.addEventListener('mousedown', (e) => {
    const nodeEl = e.target.closest('.pr-node');
    if (nodeEl && !e.target.closest('.pr-handle') && currentTool === 'select') {
      const nid = nodeEl.dataset.nodeId;
      selectedNodeId = nid;
      const slide = activeFile?.pages[activeSlideIndex];
      const node = slide?.nodes?.find(n => n.id === nid);
      if (node) {
        isDraggingNode = true;
        dragStart = { x: e.clientX, y: e.clientY };
        nodeStartPos = { x: node.x || 0, y: node.y || 0 };
      }
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (isDraggingNode && selectedNodeId && activeFile) {
      const slide = activeFile.pages[activeSlideIndex];
      const node = slide?.nodes?.find(n => n.id === selectedNodeId);
      if (node) {
        const dx = (e.clientX - dragStart.x) / zoomLevel;
        const dy = (e.clientY - dragStart.y) / zoomLevel;
        node.x = Math.round(nodeStartPos.x + dx);
        node.y = Math.round(nodeStartPos.y + dy);
        updateDomNode(node);
      }
    }
  });

  document.addEventListener('mouseup', () => {
    if (isDraggingNode) {
      isDraggingNode = false;
      triggerAutosave(mutate);
    }
  });

  // Keyboard Shortcuts: Delete, Arrows, Ctrl+Z
  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if ((location.hash.startsWith('#prancheta/editor') || location.hash.startsWith('#agency/prancheta/editor')) && activeFile) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId) {
          const slide = activeFile.pages[activeSlideIndex];
          if (slide) {
            slide.nodes = (slide.nodes || []).filter(n => n.id !== selectedNodeId);
            selectedNodeId = null;
            triggerAutosave(mutate);
            render();
          }
        }
      }
      if (e.key.startsWith('Arrow') && selectedNodeId) {
        const slide = activeFile.pages[activeSlideIndex];
        const node = slide?.nodes?.find(n => n.id === selectedNodeId);
        if (node) {
          const step = e.shiftKey ? 10 : 1;
          if (e.key === 'ArrowLeft') node.x = (node.x || 0) - step;
          if (e.key === 'ArrowRight') node.x = (node.x || 0) + step;
          if (e.key === 'ArrowUp') node.y = (node.y || 0) - step;
          if (e.key === 'ArrowDown') node.y = (node.y || 0) + step;
          updateDomNode(node);
          triggerAutosave(mutate);
          e.preventDefault();
        }
      }
    }
  });
}

/**
 * Updates DOM node directly during drag/resize for 60fps responsiveness
 */
function updateDomNode(node) {
  const el = document.getElementById(`node-${node.id}`);
  if (!el) return;
  el.style.left = `${node.x || 0}px`;
  el.style.top = `${node.y || 0}px`;
  el.style.width = `${node.width || 100}px`;
  el.style.height = `${node.height || 100}px`;
  if (node.cornerRadius !== undefined) el.style.borderRadius = `${node.cornerRadius}px`;
  if (node.opacity !== undefined) el.style.opacity = `${node.opacity}`;
  if (node.fills && node.fills[0]?.color) {
    if (node.type === 'TEXT') {
      el.style.color = node.fills[0].color;
    } else {
      el.style.backgroundColor = node.fills[0].color;
    }
  }
  if (node.type === 'TEXT') {
    if (node.text) el.textContent = node.text;
    if (node.fontSize) el.style.fontSize = `${node.fontSize}px`;
    if (node.fontWeight) el.style.fontWeight = `${node.fontWeight}`;
  }
}

function addShapeNode(type) {
  if (!activeFile) return;
  const slide = activeFile.pages[activeSlideIndex];
  if (!slide) return;
  const width = activeFile.width || 1080;
  const height = activeFile.height || 1080;
  const newNode = {
    id: `node-${Date.now()}`,
    type,
    name: type === 'ELLIPSE' ? 'Círculo' : 'Retângulo',
    x: Math.round(width * 0.35),
    y: Math.round(height * 0.35),
    width: 280,
    height: type === 'ELLIPSE' ? 280 : 180,
    cornerRadius: type === 'RECTANGLE' ? 16 : 0,
    fills: [{ type: 'SOLID', color: '#FF00BB' }]
  };
  slide.nodes.push(newNode);
  selectedNodeId = newNode.id;
}

function addTextNode() {
  if (!activeFile) return;
  const slide = activeFile.pages[activeSlideIndex];
  if (!slide) return;
  const width = activeFile.width || 1080;
  const height = activeFile.height || 1080;
  const newNode = {
    id: `text-${Date.now()}`,
    type: 'TEXT',
    name: 'Texto',
    x: Math.round(width * 0.2),
    y: Math.round(height * 0.4),
    width: Math.round(width * 0.6),
    height: 100,
    text: 'Novo texto',
    fontSize: 48,
    fontWeight: 800,
    lineHeight: 1.2,
    fills: [{ type: 'SOLID', color: '#FFFFFF' }]
  };
  slide.nodes.push(newNode);
  selectedNodeId = newNode.id;
}

function triggerAutosave(mutate) {
  saveStatus = 'saving';
  const ind = document.querySelector('.pr-save-indicator');
  if (ind) {
    ind.className = 'pr-save-indicator saving';
    ind.innerHTML = i('refresh', 12) + ' Salvando…';
  }
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    await saveActiveFile(mutate);
  }, 700);
}

async function saveActiveFile(mutate) {
  if (!activeFile) return;
  try {
    // Generate thumbnail from first slide
    activeFile.thumbnail = await renderFileToDataUri(activeFile, 0);
    await mutate({
      type: 'prancheta-save',
      id: activeFile.id,
      data: activeFile
    });
    saveStatus = 'saved';
    const ind = document.querySelector('.pr-save-indicator');
    if (ind) {
      ind.className = 'pr-save-indicator saved';
      ind.textContent = '✓ Salvo na subconta';
    }
  } catch (err) {
    saveStatus = 'dirty';
  }
}

/**
 * Renders a prancheta file slide into a high-res PNG Data URL using HTML5 Canvas
 */
async function renderFileToDataUri(file, slideIdx = 0) {
  const canvas = document.createElement('canvas');
  const w = file.width || 1080;
  const h = file.height || 1080;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const slide = (file.pages && file.pages[slideIdx]) || (file.pages && file.pages[0]) || { background: '#101014', nodes: [] };

  // Draw background
  ctx.fillStyle = slide.background || '#101014';
  ctx.fillRect(0, 0, w, h);

  // Draw nodes
  const nodes = slide.nodes || [];
  for (const node of nodes) {
    ctx.save();
    const nx = node.x || 0;
    const ny = node.y || 0;
    const nw = node.width || 100;
    const nh = node.height || 100;
    const fill = (node.fills && node.fills[0]?.color) || '#FFFFFF';
    ctx.globalAlpha = node.opacity !== undefined ? node.opacity : 1;

    if (node.type === 'RECTANGLE' || node.type === 'SHAPE') {
      ctx.fillStyle = fill;
      const r = node.cornerRadius || 0;
      if (r > 0) {
        ctx.beginPath();
        ctx.roundRect(nx, ny, nw, nh, r);
        ctx.fill();
      } else {
        ctx.fillRect(nx, ny, nw, nh);
      }
    } else if (node.type === 'ELLIPSE') {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.ellipse(nx + nw / 2, ny + nh / 2, nw / 2, nh / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (node.type === 'TEXT') {
      ctx.fillStyle = fill;
      const fsize = node.fontSize || 32;
      const fweight = node.fontWeight || 700;
      ctx.font = `${fweight} ${fsize}px 'Plus Jakarta Sans', Inter, sans-serif`;
      ctx.textBaseline = 'top';

      const lines = (node.text || '').split('\n');
      let currY = ny;
      for (const line of lines) {
        ctx.fillText(line, nx, currY);
        currY += fsize * (node.lineHeight || 1.25);
      }
    }
    ctx.restore();
  }

  return canvas.toDataURL('image/png', 0.95);
}

function downloadDataUri(uri, filename) {
  const a = document.createElement('a');
  a.href = uri;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
