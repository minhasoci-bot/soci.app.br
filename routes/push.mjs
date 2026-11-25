// Notificações push da equipe (/api/push/key|subscribe|unsubscribe) e o pacote do app móvel da agência para as lojas
// (/api/mobile-app/package).
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { AGENCY_ID } from '../agency-model.mjs';
import { mobileOf, storePackage } from '../agency-mobile.mjs';
import { requireCapability } from '../authorization.mjs';
import { pushConfigured, pushSubscription } from '../web-push.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

export function createPushRoutes(deps) {
  const { error, spaceId, privateSpace, change, payload, pushEnv, access, loadAgency, workspaceAccess } = deps;
  return async function pushRoutes({ req, res, p, method, id, json, isVercel }) {
    if (p === '/api/push/key' && method === 'GET') return json({ key: pushConfigured(pushEnv) ? pushEnv.WEB_PUSH_PUBLIC_KEY : '' });
    if ((p === '/api/push/subscribe' || p === '/api/push/unsubscribe') && method === 'POST') {
      if (!spaceId.test(id) || privateSpace.test(id)) throw error('Subconta não encontrada.', 404);
      const who = await workspaceAccess(req, res, id, { modules: ['conversations'] });
      const body = await payload(req);
      if (p === '/api/push/unsubscribe') return json({ removed: (await change(id, { type: 'push-unsubscribe', data: { endpoint: String(body.endpoint || '') } })).id });
      const sub = pushSubscription(body.subscription);
      if (!sub) throw error('Inscrição de notificação inválida.', 400);
      return json({ id: (await change(id, { type: 'push-subscribe', data: { ...sub, kind: 'team', userId: who.userId || 'local', app: String(body.app || '').slice(0, 80), messages: body.messages !== false } })).id });
    }
    if (p === '/api/mobile-app/package' && method === 'GET') {
      const who = await access(req, res);
      requireCapability(who, 'agency', 'Seu usuário não pode abrir a visualização da agência.');
      const agencyId = who.agencyId || AGENCY_ID;
      return json(storePackage(mobileOf(structuredClone(await loadAgency(agencyId))), agencyId, `${isVercel || req.socket?.encrypted ? 'https' : 'http'}://${req.headers.host}`));
    }
    return NEXT_ROUTE;
  };
}
