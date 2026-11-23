// Registro dos modelos de site: gera as páginas (HTML estático) de um modelo com o nome da marca.
import { findSiteTemplate } from '../ui/site-template-data.js';
import bosque from './bosque.mjs';
import casaNatural from './casa-natural.mjs';
import corretora from './corretora.mjs';
import interiores from './interiores.mjs';
import litoral from './litoral.mjs';
import nordico from './nordico.mjs';

const builders = Object.fromEntries([corretora, litoral, interiores, nordico, bosque, casaNatural].map(t => [t.id, t]));

export const hasSiteTemplate = id => Boolean(findSiteTemplate(id) && builders[id]);

// Páginas do modelo para um site novo. Funil ganha página de obrigado no estilo do modelo.
export function siteTemplatePages(id, { brand, kind = 'website' } = {}) {
  const meta = findSiteTemplate(id);
  const builder = builders[id];
  if (!meta || !builder) throw Object.assign(new Error('Modelo de site não encontrado.'), { status: 404 });
  const name = String(brand || '').trim().slice(0, 80) || meta.brand;
  const pages = builder.pages(name);
  if (kind === 'funnel' && !pages.some(p => p.slug === 'obrigado')) pages.push({ name: 'Obrigado', slug: 'obrigado', html: builder.thanks(name) });
  return pages;
}

// Uma página do modelo para a prévia da galeria, com os links internos apontando para a própria prévia.
// Com `thumb`, os vídeos viram a imagem de capa (a miniatura da galeria não baixa vídeo).
export function siteTemplatePreview(id, slug, { thumb = false } = {}) {
  const page = siteTemplatePages(id, { kind: 'funnel' }).find(p => p.slug === slug);
  if (!page) throw Object.assign(new Error('Página não encontrada.'), { status: 404 });
  let html = page.html.replace(/(href\s*=\s*["'])page:([a-z0-9-]+)/gi, (_, a, s) => `${a}/studio-template/${id}/${s}`);
  if (thumb) html = html.replace(/<video class="([^"]*)"[^>]*poster="([^"]*)"[^>]*>[\s\S]*?<\/video>/g, '<img class="$1" src="$2" alt="">');
  return html;
}
