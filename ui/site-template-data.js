// Catálogo dos modelos de site (galeria em Sites → Novo site → A partir de modelo).
// O HTML de cada modelo é gerado no servidor (site-templates/); aqui ficam só os dados que a galeria mostra.
export const siteTemplateCategories = [
  ['imobiliario', 'Imobiliário'],
  ['interiores', 'Interiores e decoração'],
  ['moveis', 'Móveis e design']
];

const photo = id => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=640&q=70`;

export const siteTemplates = [
  { id: 'corretora', name: 'Corretora', category: 'imobiliario', brand: 'Helena Prado Imóveis',
    description: 'Marca pessoal de corretora: topo emoldurado com foto, serviços em lista editorial, imóvel em destaque, tour em vídeo e depoimentos.',
    pages: ['Início', 'Imóveis', 'Contato'], effects: ['Vídeo', 'Texto palavra a palavra', 'Cursor próprio', 'Números animados'], cover: photo('photo-1600585154340-be6161a56a0c'), tone: 'claro' },
  { id: 'litoral', name: 'Litoral Noturno', category: 'imobiliario', brand: 'Maré Alta Residências',
    description: 'Alto padrão no litoral com clima de cinema: casa acesa em tela cheia, vitrine em colunas, vídeo do mar e regiões que se empilham.',
    pages: ['Início', 'Contato'], effects: ['Vídeo', 'Cartões empilhados', 'Cursor próprio', 'Rolagem suave'], cover: photo('photo-1753151847465-67bebb645b40'), tone: 'escuro' },
  { id: 'interiores', name: 'Ateliê de Interiores', category: 'interiores', brand: 'Ateliê Lume',
    description: 'Página única para estúdio de interiores: nome gigante sobre a foto, manifesto com fotos no texto, ambientes, processo e orçamento.',
    pages: ['Início'], effects: ['Vídeo', 'Galeria em movimento', 'Texto palavra a palavra', 'Perguntas abertas'], cover: photo('photo-1637412816281-f80ec9948fea'), tone: 'claro' },
  { id: 'nordico', name: 'Estúdio Nórdico', category: 'moveis', brand: 'NORDA',
    description: 'Estúdio de mobiliário com a marca ocupando a largura, coleção com foto que aparece no hover, processo em cartões empilhados e materiais.',
    pages: ['Início', 'Contato'], effects: ['Foto no hover', 'Cartões empilhados', 'Parallax', 'Cursor próprio'], cover: photo('photo-1699588772787-1eed3b726e0a'), tone: 'claro' },
  { id: 'bosque', name: 'Bosque & Veio', category: 'moveis', brand: 'Bosque & Veio',
    description: 'Marcenaria autoral em tons de oliva: manifesto revelado na leitura, coleção para arrastar, oficina, diário e encomendas.',
    pages: ['Início', 'Contato'], effects: ['Rolagem lateral', 'Texto palavra a palavra', 'Parallax', 'Cursor próprio'], cover: photo('photo-1768946131536-39b5f3ec329d'), tone: 'escuro' },
  { id: 'casa-natural', name: 'Casa Natural', category: 'moveis', brand: 'Casa Natural',
    description: 'Loja de móveis e decoração: avisos em movimento, topo com oferta, compra por ambiente, produtos com segunda foto e cupom.',
    pages: ['Início', 'Atendimento'], effects: ['Segunda foto no hover', 'Letreiro', 'Cursor próprio', 'Texto palavra a palavra'], cover: photo('photo-1764930680939-bfed8542e40c'), tone: 'claro' }
];

export const findSiteTemplate = id => siteTemplates.find(t => t.id === id) || null;
