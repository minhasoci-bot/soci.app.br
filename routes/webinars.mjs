// Rotas públicas dos webinars: a inscrição (/w/<subconta>/<webinar>), a sala (/sala, que marca a presença quando
// está aberta), o arquivo de agenda (/agenda.ics) e a API de inscrição (/api/webinar/<subconta>/<webinar>/register).
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { calendarFile, registrationPage, roomPage } from '../ui/webinar-data.js';
import { NEXT_ROUTE } from './next-route.mjs';

export function createWebinarRoutes(deps) {
  const { store, ready, error, workspaceSegment, change, payload, publicAccountPolicy, publicBase, publicPreview } = deps;
  const webinarPath = new RegExp(`^/w/${workspaceSegment}/([0-9a-f-]{36})(?:/(sala|agenda\\.ics))?/?$`);
  const webinarApi = new RegExp(`^/api/webinar/${workspaceSegment}/([0-9a-f-]{36})/register$`);
  return async function webinarRoutes({ req, res, p, method, url, json }) {
    // Webinars: registration, watch room (attendance when the room is open) and calendar file.
    const webinarRoute = p.match(webinarPath);
    if (webinarRoute && (method === 'GET' || method === 'HEAD')) {
      await ready;
      const [, workspace, webinarId, part] = webinarRoute;
      const active = await publicAccountPolicy(workspace, false, 'sites');
      const state = await store.load(workspace);
      const webinar = state.webinars?.find(item => item.id === webinarId);
      const preview = await publicPreview(req, res, url, workspace);
      if (!webinar || (!webinar.active && !preview)) throw error('Este webinar não está disponível.',404);
      const zone = state.profile?.timezone || 'America/Sao_Paulo';
      const page = body => { res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer',
        'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'" }); return res.end(method === 'HEAD' ? undefined : body); };
      if (!part) return page(registrationPage(webinar, { workspace, zone }));
      const registration = state.webinarRegistrations.find(item => item.webinarId === webinarId && item.token === String(url.searchParams.get('t') || ''));
      if (!registration) throw error('Inscrição não encontrada. Use o link que você recebeu.',404);
      const session = webinar.sessions.find(item => item.id === registration.sessionId);
      if (part === 'agenda.ics') {
        if (!session) throw error('Sessão não encontrada.',404);
        res.writeHead(200, { 'Content-Type':'text/calendar; charset=utf-8', 'Content-Disposition':'attachment; filename="webinar.ics"' });
        return res.end(calendarFile(webinar, session, `${publicBase(req)}/w/${workspace}/${webinarId}/sala?t=${registration.token}`));
      }
      const now = Date.now();
      if (active && session && webinar.active && method === 'GET' && now >= Date.parse(session.start) - webinar.openBefore * 60000 && now < Date.parse(session.start) + session.duration * 60000)
        await Promise.resolve().then(() => change(workspace,{ type:'webinar-attend', id:webinarId, data:{ token:registration.token } })).catch(() => {});
      return page(roomPage(webinar, registration, { workspace, zone, at:now }));
    }
    const webinarCall = p.match(webinarApi);
    if (webinarCall) {
      await ready;
      if (method !== 'POST') throw error('Method not allowed.',405);
      const [, workspace, webinarId] = webinarCall;
      const input = await payload(req);
      await publicAccountPolicy(workspace, true, 'sites');
      const result = await change(workspace,{ type:'webinar-register', id:webinarId, data:{ name:input.name, email:input.email, phone:input.phone, sessionId:input.sessionId } });
      const registration = result.state.webinarRegistrations.find(item => item.id === result.id);
      return json({ room:`/w/${workspace}/${webinarId}/sala?t=${registration.token}` },201);
    }
    return NEXT_ROUTE;
  };
}
