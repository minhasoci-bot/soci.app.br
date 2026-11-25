// Rotas públicas do que é compartilhado por link: o relatório do grupo de marcas da agência (/marcas/<token>), a
// apresentação (/apresentacao/<token>, com ?print para imprimir) e o relatório da subconta
// (/relatorio/<subconta>/<token>). Todos só leitura, montados no servidor; a página nunca recebe o estado.
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { hydrateAgency } from '../agency-model.mjs';
import { brandGroupPage } from '../brand-group-page.mjs';
import { presentationPageHtml } from '../presentation-model.mjs';
import { findSharedReport, sharedReportPage } from '../report-share.mjs';
import { brandGroupData } from '../ui/brand-group-data.js';
import { NEXT_ROUTE } from './next-route.mjs';

const brandGroupRoute = /^\/marcas\/([0-9a-f]{64})\/?$/;
const presentationRoute = /^\/apresentacao\/([0-9a-f]{64})\/?$/;

export function createShareRoutes(deps) {
  const { store, ready, error, workspaceSegment, brandWorkspaces, publicAccountPolicy } = deps;
  const sharedReportRoute = new RegExp(`^/relatorio/${workspaceSegment}/([0-9a-f]{64})/?$`);
  return async function shareRoutes({ res, p, method, url }) {
    // Brand group reports shared by link: the token finds the agency, so no agency id is exposed.
    const brandGroupShare = p.match(brandGroupRoute);
    if (brandGroupShare && (method === 'GET' || method === 'HEAD')) {
      await ready;
      const token = brandGroupShare[1];
      const match = await store.findAgency({ brandGroups: [{ share: { id: token } }] });
      const agency = match && hydrateAgency(match.state);
      const group = agency?.brandGroups.find(row => row.share?.id === token);
      if (!group || (group.share.expires && Date.parse(group.share.expires) <= Date.now())) throw error('Este relatório não está mais compartilhado.',404);
      const asked = url.searchParams.get('lang');
      const lang = ['pt', 'es'].includes(asked) ? asked : group.share.lang;
      const data = brandGroupData(group, await brandWorkspaces(agency, match.id, group));
      res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer', 'X-Robots-Tag':'noindex',
        'Content-Security-Policy':"default-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" });
      return res.end(method === 'HEAD' ? undefined : brandGroupPage(data, { lang, path: p, agency: agency.company }));
    }
    // Presentations shared by public link:
    const presentationShare = p.match(presentationRoute);
    if (presentationShare && (method === 'GET' || method === 'HEAD')) {
      await ready;
      const token = presentationShare[1];
      const match = await store.findAgency({ presentations: [{ share: { id: token } }] });
      const agency = match && hydrateAgency(match.state);
      const presentation = agency?.presentations?.find(row => row.share?.id === token);
      if (!presentation || (presentation.share.expires && Date.parse(presentation.share.expires) <= Date.now())) throw error('Esta apresentação não está mais compartilhada.', 404);
      const asked = url.searchParams.get('lang');
      const lang = ['pt', 'es'].includes(asked) ? asked : (presentation.share.lang || 'pt');
      const autoPrint = url.searchParams.has('print');
      const html = presentationPageHtml(presentation, { lang, autoPrint, company: agency.company });
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Robots-Tag': 'noindex',
        'Content-Security-Policy': "default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'unsafe-inline'; font-src 'self'; img-src 'self' data: https:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
      });
      return res.end(method === 'HEAD' ? undefined : html);
    }
    // Shared reports: read-only, rendered here so the page never receives the workspace state.
    const sharedReport = p.match(sharedReportRoute);
    if (sharedReport && (method === 'GET' || method === 'HEAD')) {
      await ready;
      const [, workspace, shareId] = sharedReport;
      await publicAccountPolicy(workspace, false, 'reporting');
      const state = await store.load(workspace);
      const report = findSharedReport(state, shareId);
      if (!report) throw error('Este relatório não está mais compartilhado.',404);
      const asked = url.searchParams.get('lang');
      const html = sharedReportPage(state, report, { lang: ['pt', 'es'].includes(asked) ? asked : report.share.lang, path: p });
      res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer', 'X-Robots-Tag':'noindex',
        'Content-Security-Policy':"default-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" });
      return res.end(method === 'HEAD' ? undefined : html);
    }
    return NEXT_ROUTE;
  };
}
