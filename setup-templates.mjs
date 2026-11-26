// Catálogo da aba "Templates de setup". Os 123 templates por segmento foram removidos em 24/11/2026.
// Os templates de hoje foram convertidos das subcontas do GHL (scripts/ghl-template/build.mjs) e moram em setup-templates/:
// <id>.json traz o template e os ativos; <id>.sites.json, as páginas dos sites (vários MB), lidas só na hora de instalar.
import { existsSync, readFileSync } from 'node:fs';
import { newSiteDoc } from './studio-site.mjs';

const read = file => JSON.parse(readFileSync(new URL(`./setup-templates/${file}`, import.meta.url), 'utf8'));
const ids = read('index.json');

export const setupTemplateSpecs = ids.map(id => read(`${id}.json`));

/** The site documents of a template ({ [projectId]: doc }), built from its pages each time (the install changes them). */
export function templateSites(id) {
  const spec = setupTemplateSpecs.find(item => item.id === id);
  if (!spec || !existsSync(new URL(`./setup-templates/${id}.sites.json`, import.meta.url))) return {};
  const pages = read(`${id}.sites.json`);
  return Object.fromEntries((spec.assets.studioProjects || []).filter(project => pages[project.id]?.length)
    .map(project => [project.id, newSiteDoc({ workspace: '', project, pages: pages[project.id] })]));
}
