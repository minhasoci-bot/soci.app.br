// Prospecção, páginas públicas: os atalhos /prospecting (levam ao painel da agência), o relatório compartilhado
// (/prospecting/report/<id>, conta as visitas) e o formulário incorporável (/prospecting/widget/<id>).
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no fechamento
// de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { hydrateAgency } from '../agency-model.mjs';
import { captureProspectWidget } from '../prospecting-model.mjs';
import { placeSummaries } from '../prospecting-places.mjs';
import { isGooglePlace, shareReportHtml, widgetHtml, withPlace } from '../ui/prospect-report.js';
import { NEXT_ROUTE } from './next-route.mjs';

const prospectPublicPath = /^\/prospecting\/(report|widget)\/([0-9a-f-]{36})$/;

export function createProspectPublicRoutes(deps) {
  const { store, ready, error, changeAgency, csp } = deps;
  return async function prospectPublicRoutes({ req, res, p, method, url, send }) {
    if (['/prospecting','/prospecting/','/prospecting/add-prospect'].includes(p) && method !== 'POST') {
      res.writeHead(302,{Location:p.endsWith('add-prospect') ? '/#agency/prospecting/search' : '/#agency/prospecting'});
      return res.end();
    }
    const prospectPublic = p.match(prospectPublicPath);
    if (prospectPublic) {
      await ready;
      const [,kind,token] = prospectPublic;
      if (kind === 'report') {
        if (method === 'POST') throw error('Method not allowed.',405);
        const findReport = agency => agency.prospects.find(row => row.shareId === token && !row.archived && row.report);
        const match = await store.findAgency({ prospects: [{ shareId: token }] });
        const prospect = match && findReport(hydrateAgency(match.state));
        if (!prospect) throw error('Relatório indisponível.',404);
        if (method === 'GET' && !String(req.headers.purpose || req.headers['sec-purpose'] || '').includes('prefetch')) {
          try {
            await changeAgency(match.id, agency => {
              const row = findReport(agency);
              if (!row) return;
              const date = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
              row.views[date] = (row.views[date] || 0)+1;
              const dates = Object.keys(row.views).sort();
              for (const old of dates.slice(0,Math.max(0,dates.length-370))) delete row.views[old];
            });
          } catch { /* The report remains available if the view count cannot be updated. */ }
        }
        if (method === 'HEAD') return send(200,'text/html; charset=utf-8');
        // Prospect do Google Maps: nome e contatos lidos ao vivo pelo placeId, como na tela da agência.
        const place = isGooglePlace(prospect.placeId) ? (await placeSummaries([prospect.placeId]).catch(() => ({})))[prospect.placeId] : null;
        const report = place ? { ...prospect.report,business:withPlace(prospect.report.business,place) } : prospect.report;
        return send(200,'text/html; charset=utf-8',shareReportHtml(report));
      }
      const match = await store.findAgency({ prospecting: { widgets: [{ id: token, active: true }] } });
      const widget = match?.state.prospecting.widgets.find(item => item.id === token && item.active);
      if (!widget) throw error('Formulário indisponível.',404);
      res.setHeader('Content-Security-Policy',csp.replace("frame-ancestors 'none'",'frame-ancestors *'));
      if (method === 'POST') {
        if (!/^application\/x-www-form-urlencoded/i.test(req.headers['content-type'] || '')) throw error('Envie os campos do formulário.',415);
        let size=0; const chunks=[];
        for await (const part of req) { size+=part.length; if (size>12000) throw error('Formulário muito longo.',413); chunks.push(part); }
        const data = Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
        try { if (!data.fax) await changeAgency(match.id, agency => captureProspectWidget(agency,token,data)); }
        catch (error) { if (error.status) return send(error.status,'text/html; charset=utf-8',widgetHtml(widget,false,error.message)); throw error; }
        res.writeHead(303,{Location:`${p}?sent=1`}); return res.end();
      }
      return send(200,'text/html; charset=utf-8',method === 'HEAD' ? undefined : widgetHtml(widget,url.searchParams.has('sent')));
    }
    return NEXT_ROUTE;
  };
}
