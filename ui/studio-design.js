// Design direction for the AI Studio builder: the questions asked before building,
// their validation, and the local plan used when no OpenAI key is connected.

export const layoutOptions = [
  ['split', 'Tela dividida', 'Texto de um lado, formulário do outro'],
  ['stacked', 'Seções empilhadas', 'Seções de largura total, uma abaixo da outra'],
  ['centered', 'Centralizado', 'Conteúdo e formulário no centro da página'],
  ['sidebar', 'Conteúdo com coluna', 'Conteúdo largo e formulário fixo numa coluna']
];

export const defaultPalettes = [
  { name: 'Noir & Gold', colors: ['#0d0d0f', '#1c1b1f', '#c9a24a', '#f2d58c'] },
  { name: 'Papel & Grafite', colors: ['#f7f5f0', '#ffffff', '#1f2933', '#c4553b'] },
  { name: 'Terracota & Sálvia', colors: ['#fbf4ec', '#ffffff', '#c4623d', '#6b8f71'] },
  { name: 'Oceano', colors: ['#0b1d33', '#12304f', '#2bb3c0', '#9be7e0'] }
];

export const defaultFonts = [
  { name: 'Clássica editorial', heading: 'Playfair Display', body: 'Inter' },
  { name: 'Moderna geométrica', heading: 'Space Grotesk', body: 'Inter' },
  { name: 'Elegante serifada', heading: 'Instrument Serif', body: 'Work Sans' },
  { name: 'Amigável arredondada', heading: 'Nunito', body: 'Nunito Sans' }
];

const hex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim());
const fontName = value => typeof value === 'string' && /^[A-Za-z0-9 ]{2,40}$/.test(value.trim());
const clean = (value, limit) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);

export function questionsFor({ palettes = defaultPalettes, fonts = defaultFonts, kind = 'website' } = {}) {
  return [
    { id: 'palette', type: 'palette', question: `Qual paleta combina com a identidade do ${kind === 'funnel' ? 'negócio' : 'site'}?`,
      options: palettes.slice(0, 4).map((item, index) => ({ id: `p${index}`, label: item.name, colors: item.colors })) },
    { id: 'fonts', type: 'fonts', question: 'Qual combinação de fontes você prefere?',
      options: fonts.slice(0, 4).map((item, index) => ({ id: `f${index}`, label: item.name, heading: item.heading, body: item.body })) },
    { id: 'layout', type: 'layout', question: kind === 'funnel' ? 'Qual estrutura para a página de captura?' : 'Qual estrutura para a página inicial?',
      options: layoutOptions.map(([id, label, text]) => ({ id, label, text })) }
  ];
}

// Validates a design direction coming from the browser or from the model.
export function validDesign(input) {
  const palette = input?.palette || {};
  const fonts = input?.fonts || {};
  const colors = Array.isArray(palette.colors) && palette.colors.length === 4 && palette.colors.every(hex) ? palette.colors.map(color => color.toLowerCase()) : defaultPalettes[0].colors;
  return {
    palette: { name: clean(palette.name, 40) || 'Personalizada', colors },
    fonts: { name: clean(fonts.name, 40) || 'Personalizada', heading: fontName(fonts.heading) ? fonts.heading.trim() : 'Inter', body: fontName(fonts.body) ? fonts.body.trim() : 'Inter' },
    layout: layoutOptions.some(([id]) => id === input?.layout) ? input.layout : 'split',
    notes: clean(input?.notes, 600)
  };
}

export function designSummary(design) {
  const layout = layoutOptions.find(([id]) => id === design.layout)?.[1] || design.layout;
  return `${design.palette.name} · ${design.fonts.heading} + ${design.fonts.body} · ${layout}`;
}

const slug = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export function validPlan(input, kind) {
  const pages = (Array.isArray(input?.pages) ? input.pages : []).slice(0, 6).map(page => ({
    name: clean(page?.name, 60), slug: slug(page?.slug || page?.name), purpose: clean(page?.purpose, 400)
  })).filter(page => page.name);
  if (!pages.length) throw Object.assign(new Error('O plano precisa de pelo menos uma página.'), { status: 400 });
  pages[0].slug = 'index';
  const seen = new Set(['index']);
  for (const page of pages.slice(1)) {
    let candidate = page.slug && page.slug !== 'index' && page.slug !== 'lead' ? page.slug : 'pagina';
    for (let n = 2; seen.has(candidate); n++) candidate = `${page.slug || 'pagina'}-${n}`;
    page.slug = candidate;
    seen.add(candidate);
  }
  return { name: clean(input?.name, 80) || pages[0].name, summary: clean(input?.summary, 400), kind: kind === 'funnel' ? 'funnel' : 'website', pages };
}

// The plan used without OpenAI: a sensible page set for each kind of project.
export function localPlan(brief, kind) {
  const text = clean(brief, 4000);
  const first = text.split(/\r?\n|[.!?:,;]\s|\s[-–—]\s/, 1)[0]
    .replace(/^(um |uma )?(funil|site|landing page|p[áa]gina|loja|portf[óo]lio)( de captura| de vendas)?( para| de| do| da| dos| das)?( o| a| os| as)?\s+/i, '');
  const name = clean(first.charAt(0).toUpperCase() + first.slice(1), 60) || (kind === 'funnel' ? 'Novo funil' : 'Novo site');
  const detail = clean(text.includes(':') ? text.slice(text.indexOf(':') + 1) : text, 300);
  const pages = kind === 'funnel'
    ? [{ name: 'Página de captura', purpose: detail.charAt(0).toUpperCase() + detail.slice(1) },
       { name: 'Obrigado', slug: 'obrigado', purpose: 'Confirma o envio e explica os próximos passos.' }]
    : [{ name: 'Início', purpose: clean(brief, 300) },
       { name: 'Sobre', slug: 'sobre', purpose: 'Apresenta a empresa, a equipe e a forma de trabalhar.' },
       { name: 'Contato', slug: 'contato', purpose: 'Formulário de contato e canais de atendimento.' }];
  return validPlan({ name, summary: clean(brief, 400), pages }, kind);
}
