import { randomUUID } from 'node:crypto';

export const PRANCHETA_COLLECTION = 'pranchetaFiles';

export const pranchetaPresets = [
  { id: 'instagram-feed', name: 'Post Quadrado (Feed)', width: 1080, height: 1080, ratio: '1:1', category: 'social' },
  { id: 'instagram-carousel', name: 'Carrossel / Retrato', width: 1080, height: 1350, ratio: '4:5', category: 'social' },
  { id: 'story-reels', name: 'Story & Reels (9:16)', width: 1080, height: 1920, ratio: '9:16', category: 'social' },
  { id: 'youtube-thumb', name: 'Capa YouTube / Vídeo', width: 1280, height: 720, ratio: '16:9', category: 'video' },
  { id: 'banner-web', name: 'Banner Web / Hero', width: 1920, height: 1080, ratio: '16:9', category: 'web' },
  { id: 'custom', name: 'Personalizado', width: 1080, height: 1080, ratio: 'custom', category: 'custom' }
];

export function createCanonicalTemplates() {
  return [
    {
      id: 'template-head-carousel',
      name: 'Carrossel Método HEAD',
      format: 'instagram-carousel',
      width: 1080,
      height: 1350,
      description: 'Estrutura comprovada: Gancho forte, Tensão, Desenvolvimento e CTA de Conversão.',
      pages: [
        {
          id: 'slide-1',
          name: 'Lâmina 1 · Gancho',
          background: '#101014',
          nodes: [
            { id: 'badge-1', type: 'RECTANGLE', x: 80, y: 100, width: 220, height: 48, cornerRadius: 24, fills: [{ type: 'SOLID', color: '#FF00BB' }], opacity: 1 },
            { id: 'badge-text-1', type: 'TEXT', x: 106, y: 114, text: 'MÉTODO HEAD', fontSize: 18, fontWeight: 800, fills: [{ type: 'SOLID', color: '#FFFFFF' }] },
            { id: 'title-1', type: 'TEXT', x: 80, y: 260, text: 'Como parar o feed e gerar desejo imediato.', fontSize: 68, fontWeight: 800, lineHeight: 1.15, fills: [{ type: 'SOLID', color: '#FFFFFF' }] },
            { id: 'subtitle-1', type: 'TEXT', x: 80, y: 520, text: 'O passo a passo que as maiores marcas usam para reter atenção em carrosséis visuais.', fontSize: 32, fontWeight: 500, lineHeight: 1.4, fills: [{ type: 'SOLID', color: '#B3B3C2' }] },
            { id: 'hint-1', type: 'TEXT', x: 80, y: 1180, text: 'Deslize para ver a estrutura →', fontSize: 24, fontWeight: 600, fills: [{ type: 'SOLID', color: '#FF00BB' }] }
          ]
        },
        {
          id: 'slide-2',
          name: 'Lâmina 2 · Tensão',
          background: '#16161D',
          nodes: [
            { id: 'num-2', type: 'TEXT', x: 80, y: 120, text: '01 / O ERRO COMUM', fontSize: 20, fontWeight: 700, fills: [{ type: 'SOLID', color: '#FF00BB' }] },
            { id: 'title-2', type: 'TEXT', x: 80, y: 220, text: 'A maioria dos posts falha no primeiro segundo.', fontSize: 56, fontWeight: 800, lineHeight: 1.2, fills: [{ type: 'SOLID', color: '#FFFFFF' }] },
            { id: 'box-2', type: 'RECTANGLE', x: 80, y: 440, width: 920, height: 380, cornerRadius: 20, fills: [{ type: 'SOLID', color: '#22222D' }] },
            { id: 'box-text-2', type: 'TEXT', x: 120, y: 490, text: 'Sem um gancho visual e verbal que gere curiosidade imediata, seu público desliza direto para o próximo post. Não comece explicando: comece instigando.', fontSize: 32, fontWeight: 500, lineHeight: 1.5, fills: [{ type: 'SOLID', color: '#FFFFFF' }] },
            { id: 'hint-2', type: 'TEXT', x: 80, y: 1180, text: 'A solução prática na próxima tela →', fontSize: 24, fontWeight: 600, fills: [{ type: 'SOLID', color: '#FF00BB' }] }
          ]
        },
        {
          id: 'slide-3',
          name: 'Lâmina 3 · CTA Final',
          background: '#101014',
          nodes: [
            { id: 'title-3', type: 'TEXT', x: 80, y: 280, text: 'Gostou deste conteúdo?', fontSize: 62, fontWeight: 800, lineHeight: 1.2, fills: [{ type: 'SOLID', color: '#FFFFFF' }] },
            { id: 'desc-3', type: 'TEXT', x: 80, y: 460, text: 'Salve para consultar na hora de criar sua próxima campanha e compartilhe com sua equipe.', fontSize: 34, fontWeight: 500, lineHeight: 1.5, fills: [{ type: 'SOLID', color: '#B3B3C2' }] },
            { id: 'cta-btn-3', type: 'RECTANGLE', x: 80, y: 720, width: 560, height: 80, cornerRadius: 40, fills: [{ type: 'SOLID', color: '#FF00BB' }] },
            { id: 'cta-text-3', type: 'TEXT', x: 140, y: 748, text: 'COMENTE “SOCI” NO DIRECT', fontSize: 24, fontWeight: 800, fills: [{ type: 'SOLID', color: '#FFFFFF' }] },
            { id: 'brand-3', type: 'TEXT', x: 80, y: 1200, text: 'soci · laboratório de interação', fontSize: 22, fontWeight: 700, fills: [{ type: 'SOLID', color: '#707080' }] }
          ]
        }
      ]
    },
    {
      id: 'template-quote-impact',
      name: 'Post Manifesto & Citação',
      format: 'instagram-feed',
      width: 1080,
      height: 1080,
      description: 'Tipografia marcante para frases, posicionamento e insights de autoridade.',
      pages: [
        {
          id: 'slide-quote',
          name: 'Post Feed',
          background: '#101014',
          nodes: [
            { id: 'quote-mark', type: 'TEXT', x: 80, y: 180, text: '“', fontSize: 160, fontWeight: 900, fills: [{ type: 'SOLID', color: '#FF00BB' }] },
            { id: 'quote-text', type: 'TEXT', x: 80, y: 380, text: 'Estratégia precisa ser sentida. Marca não é só o que ela diz: é o que ela faz você fazer.', fontSize: 48, fontWeight: 800, lineHeight: 1.25, fills: [{ type: 'SOLID', color: '#FFFFFF' }] },
            { id: 'quote-author', type: 'TEXT', x: 80, y: 760, text: '— Luiz / Um Cara Caramelo', fontSize: 26, fontWeight: 600, fills: [{ type: 'SOLID', color: '#FF00BB' }] },
            { id: 'quote-sub', type: 'TEXT', x: 80, y: 810, text: 'Laboratório de Interação', fontSize: 20, fontWeight: 500, fills: [{ type: 'SOLID', color: '#888899' }] }
          ]
        }
      ]
    },
    {
      id: 'template-story-promo',
      name: 'Story & Reels Promoção',
      format: 'story-reels',
      width: 1080,
      height: 1920,
      description: 'Anúncio vertical dinâmico com headline de impacto e selo de chamada.',
      pages: [
        {
          id: 'slide-story',
          name: 'Story Promo',
          background: '#0D0D11',
          nodes: [
            { id: 'st-tag', type: 'RECTANGLE', x: 80, y: 160, width: 280, height: 54, cornerRadius: 27, fills: [{ type: 'SOLID', color: '#22222D' }] },
            { id: 'st-tag-text', type: 'TEXT', x: 120, y: 178, text: 'NOVA OPORTUNIDADE', fontSize: 18, fontWeight: 800, fills: [{ type: 'SOLID', color: '#00F0FF' }] },
            { id: 'st-title', type: 'TEXT', x: 80, y: 440, text: 'Transforme o conteúdo da sua marca em clientes reais.', fontSize: 64, fontWeight: 800, lineHeight: 1.18, fills: [{ type: 'SOLID', color: '#FFFFFF' }] },
            { id: 'st-card', type: 'RECTANGLE', x: 80, y: 840, width: 920, height: 420, cornerRadius: 28, fills: [{ type: 'SOLID', color: '#1B1B24' }] },
            { id: 'st-card-title', type: 'TEXT', x: 130, y: 920, text: 'Menos ferramenta. Mais sistema.', fontSize: 38, fontWeight: 800, fills: [{ type: 'SOLID', color: '#FF00BB' }] },
            { id: 'st-card-desc', type: 'TEXT', x: 130, y: 1000, text: 'Centralize CRM, social, automações e design num único fluxo inteligente.', fontSize: 28, fontWeight: 500, lineHeight: 1.45, fills: [{ type: 'SOLID', color: '#E1E1E6' }] },
            { id: 'st-cta-btn', type: 'RECTANGLE', x: 80, y: 1560, width: 920, height: 96, cornerRadius: 48, fills: [{ type: 'SOLID', color: '#FF00BB' }] },
            { id: 'st-cta-text', type: 'TEXT', x: 340, y: 1596, text: 'TOQUE PARA SABER MAIS', fontSize: 26, fontWeight: 800, fills: [{ type: 'SOLID', color: '#FFFFFF' }] }
          ]
        }
      ]
    }
  ];
}

export function sociToDocument(file) {
  if (file && file.document && file.document.nodes && file.document.pages) {
    return {
      ...file.document,
      name: file.name || file.document.name || 'Sem título'
    };
  }
  const pages = [];
  const nodes = {};
  const images = file?.document?.images || {};

  (file.pages || []).forEach((p, pIdx) => {
    const pageId = p.id || `page-${pIdx + 1}`;
    const childIds = [];
    (p.nodes || []).forEach((n, nIdx) => {
      const nodeId = n.id || `node-${pIdx + 1}-${nIdx + 1}`;
      childIds.push(nodeId);
      nodes[nodeId] = {
        id: nodeId,
        type: n.type || 'RECTANGLE',
        name: n.name || n.text || `Elemento ${nIdx + 1}`,
        parentId: pageId,
        x: Number(n.x) || 0,
        y: Number(n.y) || 0,
        width: Number(n.width) || 200,
        height: Number(n.height) || 100,
        rotation: Number(n.rotation) || 0,
        flipX: false,
        flipY: false,
        visible: n.visible !== false,
        locked: Boolean(n.locked),
        opacity: typeof n.opacity === 'number' ? n.opacity : 1,
        fills: Array.isArray(n.fills) ? n.fills : [{ type: 'SOLID', color: n.fill || '#FF00BB', opacity: 1, visible: true }],
        strokes: Array.isArray(n.strokes) ? n.strokes : [],
        strokeWeight: Number(n.strokeWeight) || 0,
        strokeAlign: 'INSIDE',
        effects: Array.isArray(n.effects) ? n.effects : [],
        cornerRadius: Number(n.cornerRadius) || 0,
        constrainProportions: false,
        text: n.text || '',
        fontSize: Number(n.fontSize) || 16,
        fontWeight: Number(n.fontWeight) || 500,
        lineHeight: n.lineHeight || null
      };
    });
    pages.push({
      id: pageId,
      name: p.name || `Página ${pIdx + 1}`,
      background: p.background || '#101014',
      children: childIds
    });
  });

  return {
    version: 1,
    name: file.name || 'Sem título',
    pages: pages.length ? pages : [{ id: 'page-1', name: 'Página 1', background: '#101014', children: [] }],
    nodes,
    images
  };
}

export function documentToSoci(doc, meta = {}) {
  const name = typeof doc?.name === 'string' && doc.name.trim() ? doc.name.trim() : (meta.name || 'Sem título');
  const pages = (doc?.pages || []).map((p, idx) => ({
    id: p.id || `page-${idx + 1}`,
    name: p.name || `Página ${idx + 1}`,
    background: p.background || '#101014',
    nodes: (p.children || []).map(cid => doc.nodes?.[cid]).filter(Boolean)
  }));
  return {
    name,
    format: meta.format || 'custom',
    width: meta.width || 1080,
    height: meta.height || 1080,
    pages: pages.length ? pages : [{ id: 'page-1', name: 'Página 1', background: '#101014', nodes: [] }],
    thumbnail: meta.thumbnail || doc?.thumbnail || '',
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    document: doc
  };
}

export function pranchetaFileRecord(s, d) {
  const name = typeof d.name === 'string' && d.name.trim() ? d.name.trim().slice(0, 150) : (d.document?.name || 'Sem título');
  const width = Math.min(4000, Math.max(100, Number(d.width) || 1080));
  const height = Math.min(4000, Math.max(100, Number(d.height) || 1080));
  const format = typeof d.format === 'string' ? d.format.slice(0, 50) : 'custom';
  
  let pages = Array.isArray(d.pages) && d.pages.length ? d.pages : null;
  if (!pages && d.document && Array.isArray(d.document.pages)) {
    pages = d.document.pages.map((p, idx) => ({
      id: p.id || `page-${idx + 1}`,
      name: p.name || `Página ${idx + 1}`,
      background: p.background || '#101014',
      nodes: (p.children || []).map(cid => d.document.nodes?.[cid]).filter(Boolean)
    }));
  }
  if (!pages || !pages.length) {
    pages = [
      {
        id: 'page-1',
        name: 'Página 1',
        background: d.background || '#101014',
        nodes: Array.isArray(d.nodes) ? d.nodes : []
      }
    ];
  }

  const thumbnail = typeof d.thumbnail === 'string' ? d.thumbnail : '';
  const tags = Array.isArray(d.tags) ? d.tags.map(t => String(t).slice(0, 40)).filter(Boolean).slice(0, 10) : [];
  const document = d.document ? d.document : null;

  return {
    name,
    format,
    width,
    height,
    pages,
    thumbnail,
    tags,
    document
  };
}
