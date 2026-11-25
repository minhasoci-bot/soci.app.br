// Telefone: o webhook da Twilio (/api/phone/twilio/...) e a API da subconta (/api/phone/...), ambos tratados por phone-server.mjs.
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { requireModule } from '../authorization.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

export function createTwilioWebhookRoutes(deps) {
  const { ready, phone } = deps;
  return async function twilioWebhookRoutes({ req, res, p, method, url }) {
    if (p.startsWith('/api/phone/twilio/') && method === 'POST') {
      await ready;
      return await phone.twilioWebhook(req, res, url, p);
    }
    return NEXT_ROUTE;
  };
}

export function createPhoneRoutes(deps) {
  const { error, spaceId, privateSpace, phone, payload, workspaceAccess } = deps;
  return async function phoneRoutes({ req, res, p, method, url, id, json }) {
    if (p.startsWith('/api/phone/')) {
      if (!spaceId.test(id) || privateSpace.test(id)) throw error('Subconta não encontrada.', 404);
      const who = await workspaceAccess(req, res, id, { modules: [] });
      const body = method === 'POST' ? await payload(req) : {};
      return await phone.api(req, res, { url, path: p.replace(/\/+$/, ''), method, workspace: id, who, body, json, needs: module => requireModule(who, module) });
    }
    return NEXT_ROUTE;
  };
}
