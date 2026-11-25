// Caixa de entrada ao vivo (GET /api/conversations/live?mark=): a tela pergunta o que mudou enquanto está à vista.
import { workspaceView } from '../authorization.mjs';
import { inboxChanges } from '../inbox-live.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

export function createInboxRoutes(deps) {
  const { store, error, spaceId, privateSpace, workspaceAccess } = deps;
  return async function inboxRoutes({ req, res, p, method, url, id, json }) {
    if (p !== '/api/conversations/live' || method !== 'GET') return NEXT_ROUTE;
    if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Subconta não encontrada.', 404);
    const who = await workspaceAccess(req, res, id, { modules: ['conversations'], support: true });
    return json(inboxChanges(workspaceView(who, await store.load(id)), url.searchParams.get('mark') || ''));
  };
}
