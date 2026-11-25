// WhatsApp: o webhook da Evolution API (/api/whatsapp/webhook/...), a integração global da agência (/api/whatsapp/agency/...),
// a conexão da subconta (/api/whatsapp/workspace/...) e o WAHA (/api/waha/..., webhook e configuração).
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { requireCapability, requireModule } from '../authorization.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

export function createWhatsappWebhookRoutes(deps) {
  const { whatsapp, payload, listWorkspaces, webhookBlockReason, flushLater } = deps;
  return async function whatsappWebhookRoutes({ req, p, method, url, json }) {
    if (p.startsWith('/api/whatsapp/webhook/') && method === 'POST') {
      return await whatsapp.handleWebhook({ req, url, payload, listWorkspaces, webhookBlockReason, json, onStored: flushLater });
    }
    return NEXT_ROUTE;
  };
}

export function createWhatsappRoutes(deps) {
  const { messageMedia, error, spaceId, whatsapp, waha, payload, publicBase, listWorkspaces, requireActiveAccount, webhookBlockReason, access, workspaceAccess } = deps;
  return async function whatsappRoutes({ req, res, p, method, url, id, json }) {
    if (p.startsWith('/api/whatsapp/agency/')) {
      const who = await access(req, res);
      requireCapability(who, 'settings', 'Seu usuário não pode gerenciar a integração global com WhatsApp.');
      return await whatsapp.handleAgencyApi({
        req, url, method, who, payload, publicOrigin: publicBase(req), listWorkspaces, requireActiveAccount, json
      });
    }
    if (p.startsWith('/api/whatsapp/workspace/')) {
      if (!spaceId.test(id)) throw error('Subconta não encontrada.', 404);
      const op = p.replace(/\/+$/, '').slice('/api/whatsapp/workspace/'.length);
      // Uma mídia recebida, para quem vê a conversa.
      if (method === 'GET' && op === 'media') {
        const who = await workspaceAccess(req, res, id, { modules: ['conversations'] });
        const message = await messageMedia.find(id, url.searchParams.get('message') || '');
        if (!message) throw error('Mídia não encontrada.', 404);
        return await messageMedia.serve({ res, agencyId: who.agencyId, workspace: id, message, attachment: url.searchParams.get('download') === '1' });
      }
      // Os grupos são de quem planeja eventos; o resto da conexão, de quem cuida das configurações.
      const who = await workspaceAccess(req, res, id, { modules: method === 'GET' && op === 'groups' ? ['marketing', 'conversations'] : ['settings'] });
      if (method === 'POST' && op === 'test') requireModule(who, 'conversations');
      return await whatsapp.handleWorkspaceApi({
        req, url, method, agencyId: who.agencyId, workspaceId: id, payload, publicOrigin: publicBase(req), requireActiveAccount, json
      });
    }
    if (p.startsWith('/api/waha/webhook/') && method === 'POST') {
      return await waha.handleWebhook({ req, url, payload, listWorkspaces, webhookBlockReason, json });
    }
    if (p.startsWith('/api/waha/')) {
      const who = await access(req, res);
      requireCapability(who, 'settings', 'Seu usuário não pode gerenciar a integração com WhatsApp.');
      if (method === 'POST' && p.replace(/\/+$/, '') === '/api/waha/test') requireModule(who, 'conversations');
      return await waha.handleApi({
        req, res, url, method, who, payload, publicOrigin: publicBase(req), listWorkspaces, requireActiveAccount, json
      });
    }
    return NEXT_ROUTE;
  };
}
