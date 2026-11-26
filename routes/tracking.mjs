// Rastreamento da subconta: os eventos recebidos (/api/tracking/events) e o segredo da API do GA4 (/api/tracking/ga4-secret).
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no fechamento
// de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { workspaceView } from '../authorization.mjs';
import { seal } from '../social-providers.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

export function createTrackingRoutes(deps) {
  const { store, error, spaceId, privateSpace, payload, workspaceAccess, trackingLog, socialRow, change } = deps;
  return async function trackingRoutes({ req, res, p, method, url, id, json }) {
    // Configurações → Rastreamento: the events received, newest first (?type=, ?before=<cursor>).
    if (p==='/api/tracking/events' && method==='GET') {
      if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Workspace not found.',404);
      await workspaceAccess(req, res, id, { modules: ['settings'] });
      return json(await trackingLog.read(id, { type: url.searchParams.get('type') || '', before: url.searchParams.get('before') || '' }));
    }
    // Marketing → Rastreamento: the GA4 Measurement Protocol API secret. Write-only: sealed in the ads-<workspace> row,
    // never sent back; the sub-account state only says whether it is set. An empty value removes it.
    if (p==='/api/tracking/ga4-secret' && method==='POST') {
      if (!spaceId.test(id)) throw error('Workspace not found.',404);
      const who = await workspaceAccess(req, res, id, { modules: ['settings'] });
      const input = await payload(req);
      const secret = typeof input?.secret === 'string' ? input.secret.trim() : '';
      if (secret && !/^[\w-]{8,64}$/.test(secret)) throw error('Segredo da API do GA4 inválido.', 400);
      await socialRow(`ads-${id}`);
      await store.change(`ads-${id}`, row => { if (secret) row.ga4Secret = seal(secret); else delete row.ga4Secret; });
      const result = await change(id, { type: 'tracking-ga4-secret', data: { set: Boolean(secret) } });
      return json(workspaceView(who, result.state));
    }
    return NEXT_ROUTE;
  };
}
