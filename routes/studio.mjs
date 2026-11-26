// Rotas do Studio (módulo sites): criar um site ou funil (em branco, por modelo, por plano ou pela IA), as perguntas e o
// plano antes de criar (/api/studio/discover e /api/studio/plan), o documento do projeto (/api/studio/doc) e as operações
// de edição e publicação (/api/studio/<op>).
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { workspaceView } from '../authorization.mjs';
import { hasSiteTemplate, siteTemplatePages } from '../site-templates/index.mjs';
import { discoverDesign, generateSite, planSite } from '../studio-ai.mjs';
import { designedPage, newSiteDoc, pageFromStructure, publicDoc, readReference, siteRowId, thankYouPage } from '../studio-site.mjs';
import { findSiteTemplate } from '../ui/site-template-data.js';
import { starterProject, studioTemplates } from '../ui/studio-data.js';
import { localPlan, questionsFor, validDesign, validPlan } from '../ui/studio-design.js';
import { NEXT_ROUTE } from './next-route.mjs';

export function createStudioRoutes(deps) {
  const {
    store, error, change, openAI, payload, siteDoc, studioGuard, studioRequest, syncMeta
  } = deps;
  return async function studioRoute({ req, res, p, method, url, id, json }) {
    if (p==='/api/studio' && method==='POST') {
      const who = await studioGuard(req,res,id);
      const input = await payload(req);
      const kind = input.kind === 'funnel' ? 'funnel' : 'website';
      const blankName = typeof input.name === 'string' ? input.name.trim().slice(0,80) : '';
      const brief = input.mode === 'blank' ? blankName : typeof input.brief === 'string' ? input.brief.trim() : '';
      const template = input.template || 'landing';
      if (input.mode === 'blank' && !blankName) throw error('Dê um nome ao funil ou site.',400);
      if (!brief || brief.length > 4000) throw error('Enter a project description of up to 4,000 characters.',400);
      if (!studioTemplates.some(item => item[0] === template)) throw error('Choose a valid template.',400);
      if (!['model','starter','blank'].includes(input.mode)) throw error('Choose how to create the project.',400);
      const siteTemplate = input.mode === 'starter' && input.siteTemplate ? String(input.siteTemplate) : '';
      if (siteTemplate && !hasSiteTemplate(siteTemplate)) throw error('Escolha um modelo de site válido.',400);
      const existing = await store.load(id);
      if (existing.studioProjects.length >= 60) throw error('A workspace can have up to 60 Studio projects.',400);
      const connection = input.mode === 'model' ? await openAI.requireConnection(who.session) : null;
      const reference = connection && input.reference ? await readReference(input.reference) : null;
      const design = input.design ? validDesign(input.design) : null;
      const plan = input.plan ? validPlan(input.plan, kind) : null;
      let draft, html;
      if (input.mode === 'model') {
        const site = await generateSite(connection,brief,template,reference?.summary,design,plan?.pages[0] || null);
        draft = { name:site.name, headline:site.name, summary:site.summary, theme:site.theme, blocks:[] };
        html = site.html;
      } else if (design && plan) {
        draft = { name:plan.name, headline:plan.name, summary:plan.summary, theme:'indigo', blocks:[] };
        html = designedPage({ siteName:plan.name, page:plan.pages[0], design, summary:plan.summary });
      } else if (input.mode === 'blank') {
        draft = { name:blankName, headline:blankName, summary:'', theme:'indigo', blocks:[] };
        html = pageFromStructure(draft, blankName);
      } else if (siteTemplate) {
        const name = (typeof input.name === 'string' && input.name.trim().slice(0,80)) || findSiteTemplate(siteTemplate).brand;
        draft = { name, headline:name, summary:findSiteTemplate(siteTemplate).description, theme:'indigo', blocks:[] };
      } else {
        draft = starterProject(brief,template);
        html = pageFromStructure(draft);
      }
      if (plan) Object.assign(draft, { name:plan.name, headline:plan.name, summary:plan.summary || draft.summary });
      let pages = [{ name:plan ? plan.pages[0].name : kind === 'funnel' ? 'Página de captura' : 'Home', slug:'index', html }];
      if (siteTemplate) pages = siteTemplatePages(siteTemplate, { brand:draft.name, kind });
      else if (kind === 'funnel' && !plan) pages.push({ name:'Obrigado', slug:'obrigado', html:thankYouPage(draft) });
      const doc = newSiteDoc({ workspace:id, project:{ id:'pending' }, pages });
      const created = await change(id,{type:'save',key:'studioProjects',data:{...draft,brief,template,kind,design,reference:reference?.url || ''}});
      doc.project = created.id; doc.profile.name = `AI Studio ${created.id}`;
      await store.insert(siteRowId(created.id), doc);
      const synced = await syncMeta(id, created.id, doc);
      return json({ id: synced.id, ...workspaceView(who, synced.state) },201);
    }
    if ((p==='/api/studio/discover' || p==='/api/studio/plan') && method==='POST') {
      const who = await studioGuard(req,res,id);
      const input = await payload(req);
      const brief = typeof input.brief === 'string' ? input.brief.trim() : '';
      if (!brief || brief.length > 4000) throw error('Descreva o que você quer construir em até 4.000 caracteres.',400);
      const kind = input.kind === 'funnel' ? 'funnel' : 'website';
      const connection = await openAI.status(who.session).then(s => s.configured ? openAI.requireConnection(who.session) : null);
      if (p === '/api/studio/discover') {
        if (!connection) return json({ ai:false, intro:`Vou montar ${kind === 'funnel' ? 'o funil' : 'o site'} com base na sua descrição. Antes, escolha a direção visual.`, questions:questionsFor({ kind }) });
        const found = await discoverDesign(connection,{ brief, kind });
        const palettes = found.palettes.map(item => validDesign({ palette:item }).palette).slice(0,4);
        const fonts = found.fonts.map(item => validDesign({ fonts:item }).fonts).slice(0,4);
        return json({ ai:true, intro:String(found.intro || '').slice(0,600), questions:questionsFor({ kind, palettes:palettes.length === 4 ? palettes : undefined, fonts:fonts.length === 4 ? fonts : undefined }) });
      }
      const design = validDesign(input.design);
      const plan = connection ? validPlan(await planSite(connection,{ brief, kind, design }), kind) : localPlan(brief, kind);
      if (kind === 'funnel' && !/obrigad|thank/i.test(plan.pages.at(-1).name + plan.pages.at(-1).slug) && plan.pages.length < 6) plan.pages.push({ name:'Obrigado', slug:'obrigado', purpose:'Confirma o envio e explica os próximos passos.' });
      return json({ ai:Boolean(connection), plan, design });
    }
    if (p==='/api/studio/doc' && method!=='POST') {
      await studioGuard(req,res,id);
      const projectId = url.searchParams.get('id') || '';
      return json({ doc: publicDoc(await siteDoc(id, projectId), url.searchParams.get('page') || '') });
    }
    if (p.startsWith('/api/studio/') && method==='POST') {
      const who = await studioGuard(req,res,id);
      const input = await payload(req);
      const result = await studioRequest(id, p.slice('/api/studio/'.length), input, who.session);
      const doc = await siteDoc(id, input.id);
      const synced = await syncMeta(id, input.id, doc);
      return json({ id: synced.id, ...workspaceView(who, synced.state), doc: publicDoc(doc, typeof input.viewPage === 'string' ? input.viewPage : typeof input.pageId === 'string' ? input.pageId : ''), result });
    }
    return NEXT_ROUTE;
  };
}
