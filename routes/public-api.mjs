// API pública de subcontas e contatos (/api/v1/subaccounts...), para as chaves de API e as integrações privadas da agência.
// Recebe do servidor o que vive no fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { NEXT_ROUTE } from './next-route.mjs';

const apiPath = /^\/api\/v1\/subaccounts(?:\/(demo|[0-9a-f-]{36})\/contacts)?$/;

export function createPublicApiRoutes(deps) {
  const { store, error, bearer, payload, change, listWorkspaces, requireWorkspaceAccess, loadAgency } = deps;
  return async function publicApiRoutes({ req, p, method, json }) {
    const apiMatch = p.match(apiPath);
    if (!apiMatch) return NEXT_ROUTE;
    const [, account] = apiMatch;
    if (!account) {
      if (method !== 'GET') throw error('Method not allowed.',405);
      const agencyId = await bearer(req,'subaccounts.read');
      return json({ subaccounts: await listWorkspaces(agencyId) });
    }
    const agencyId = await bearer(req,method === 'POST' ? 'contacts.write' : 'contacts.read');
    const input = method === 'POST' ? await payload(req) : null;
    await requireWorkspaceAccess(await loadAgency(agencyId), { agencyId, modules: null }, account, {
      modules: ['contacts'], hide: true, reason: false
    });
    if (method !== 'POST') {
      return json({ contacts: (await store.load(account)).contacts });
    }
    const created = await change(account,{ type:'save', key:'contacts', data: input });
    return json({ id: created.id },201);
  };
}
