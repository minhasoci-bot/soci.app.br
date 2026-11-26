// Agência: o painel da agência (/api/agency), os logs de auditoria da agência e da subconta (/api/agency/audit e
// /api/audit) e as operações da agência (/api/agency/<op>).
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no fechamento
// de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { hasModule, requireCapability } from '../authorization.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

export function createAgencyRoutes(deps) {
  const { error, spaceId, privateSpace, access, accessContext, verifiedUser, requireWorkspaceAccess, visibleWorkspaces, agencyPayload, agencyRequest, auditLog, payload } = deps;
  return async function agencyRoutes({ req, res, p, method, url, id, json }) {
    if (p==='/api/agency' && method!=='POST') {
      return json(await agencyPayload(req,res));
    }
    // Configurações da agência → Logs de auditoria: newest first (?q=, ?before=<cursor>, ?limit=).
    if (p==='/api/agency/audit' && method==='GET') {
      const who = await access(req,res);
      requireCapability(who, 'agency', 'Seu usuário não pode abrir a visualização da agência.');
      if (!who.settings) throw error('Seu usuário não tem acesso às configurações da agência.',403);
      return json(await auditLog.read(who.agencyId, { q: url.searchParams.get('q') || '', before: url.searchParams.get('before') || '', limit: url.searchParams.get('limit') || '' }));
    }
    // Configurações da subconta → Log de auditoria: só as entradas desta subconta.
    if (p==='/api/audit' && method==='GET') {
      if (privateSpace.test(id)) return json({ entries: [], next: '' });
      if (!spaceId.test(id)) throw error('Workspace not found.',404);
      const { agency, who: actor } = await accessContext(req,await verifiedUser(req,res));
      const who = await requireWorkspaceAccess(agency, actor, id, { support: true });
      if (!who.support && !hasModule(who, 'settings')) throw error('Seu usuário não tem acesso às configurações.',403);
      const account = (await visibleWorkspaces(who)).find(w => w.id === id)?.name || id;
      return json(await auditLog.read(who.agencyId, { targets: [account, id], before: url.searchParams.get('before') || '', limit: url.searchParams.get('limit') || '' }));
    }
    if (p.startsWith('/api/agency/') && method==='POST') {
      const who = await access(req,res);
      requireCapability(who, 'agency', 'Seu usuário não pode abrir a visualização da agência.');
      const op = p.slice('/api/agency/'.length), body = await payload(req);
      const result = await agencyRequest(op, who, body);
      // Opening a sub-account only stamps lastLogin; skip rebuilding the full agency payload (it loads every sub-account).
      if ((op === 'action' && body?.type === 'account-open') || op === 'domain-status') return json({ result });
      return json(await agencyPayload(req,res, { result }));
    }
    return NEXT_ROUTE;
  };
}
