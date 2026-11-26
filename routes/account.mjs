// Conta de quem entrou: a marca do White Label no login (/api/marca), a conexão com a OpenAI (/api/openai) e a lista
// de subcontas com a criação de uma nova (/api/workspaces).
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no fechamento
// de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { requireCapability } from '../authorization.mjs';
import { requestHost, whiteLabelBrand } from '../white-label.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

export function createWhiteLabelRoutes(deps) {
  const { store, ready } = deps;
  return async function whiteLabelRoutes({ req, p, method, json }) {
    // White Label: o login aberto no domínio de uma agência mostra a marca dela.
    if (p === '/api/marca' && method === 'GET') { await ready; return json(await whiteLabelBrand(store, requestHost(req))); }
    return NEXT_ROUTE;
  };
}

export function createAccountRoutes(deps) {
  const { error, verifiedUser, openAI, payload, access, createAccount, listWorkspaces, visibleWorkspaces } = deps;
  return async function accountRoutes({ req, res, p, method, json }) {
    if (p === '/api/openai') {
      const session = await verifiedUser(req,res);
      if (!session) throw error('Entre na sua conta para conectar sua chave da OpenAI.',401);
      res.setHeader('Cache-Control','no-store');
      if (method !== 'POST') return json(await openAI.status(session));
      const input = await payload(req);
      if (input.action === 'connect') return json(await openAI.connect(session,input.apiKey));
      if (input.action === 'disconnect') return json(await openAI.disconnect(session));
      throw error('Escolha uma ação válida para a conexão com a OpenAI.',400);
    }
    if (p==='/api/workspaces') {
      const who = await access(req,res);
      if (method==='POST') {
        requireCapability(who, 'agency', 'Only agency users can create sub-accounts.');
        const newId = await createAccount(who, await payload(req));
        return json({id:newId,workspaces:await listWorkspaces(who.agencyId)},201);
      }
      return json({workspaces:await visibleWorkspaces(who), agency:who.agency});
    }
    return NEXT_ROUTE;
  };
}
