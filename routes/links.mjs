// Links curtos das conversas (/r/<subconta>/<link>): conta o clique (se a conta está ativa) e redireciona ao destino.
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { execute } from '../model.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

export function createLinkRoutes(deps) {
  const { store, ready, workspaceSegment, publicAccountPolicy } = deps;
  const redirectPath = new RegExp(`^/r/${workspaceSegment}/([0-9a-f-]{36})$`);
  return async function linkRoutes({ res, p, method }) {
    const redirect = p.match(redirectPath);
    if (redirect && method === 'GET') {
      await ready;
      const [, workspace, linkId] = redirect;
      const active = await publicAccountPolicy(workspace, false, 'conversations');
      const target = active
        ? await store.change(workspace, state => execute(state, { type: 'link-click', id: linkId }))
        : execute(await store.load(workspace), { type: 'link-click', id: linkId }, { trackClick: false });
      res.writeHead(302, { Location: target });
      return res.end();
    }
    return NEXT_ROUTE;
  };
}
