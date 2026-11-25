// Rotas da cobrança (/api/billing): pagar e reativar a subconta pausada por plano não pago.
// Recebe do servidor o que vive no fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { accountLifecycle, canReactivate, replaceBilling } from '../agency-model.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

export function createBillingRoutes(deps) {
  const { abacate, accessContext, verifiedUser, canOpen, changeAgency, recordAudit, error, pausedError, publicBase, retryPolicyOf, spaceId } = deps;

  async function reactivate({ req, res, method, id, json }) {
    if (method !== 'POST') throw error('Method not allowed.', 405);
    const { agency, who } = await accessContext(req, await verifiedUser(req, res));
    if (!spaceId.test(id) || !await canOpen(who, id)) throw error('Your user cannot open this sub-account.', 403);
    const lifecycle = accountLifecycle(agency, id), meta = agency.accounts[id];
    if (lifecycle.status === 'Active') throw error('Esta subconta já está ativa.', 409);
    if (!canReactivate(agency, id, who)) throw pausedError(lifecycle);
    const plan = agency.plans.find(row => row.id === meta.plan);
    if (!plan || !await abacate.connected(who.agencyId, abacate.AGENCY_SCOPE)) throw error('Não foi possível gerar o pagamento. Fale com a sua agência.', 409);
    const pendingOf = state => { const b = state.accounts[id]?.billing; return b?.status === 'Pending' && b.reactivation && b.url && b.planId === plan.id && b.amount === plan.price ? b : null; };
    if (pendingOf(agency)) return json({ url: pendingOf(agency).url });
    const billing = await abacate.subscribe(who.agencyId, id, plan, publicBase(req), { trial: false, retryPolicy: retryPolicyOf(agency) });
    // Two clicks at once: only the first link is kept and shown, so nobody pays twice.
    // Paid meanwhile, by a link the agency had sent: the sub-account is already active.
    const kept = await changeAgency(who.agencyId, current => {
      if (accountLifecycle(current, id).status === 'Active') return '';
      const other = pendingOf(current);
      return other ? other.url : replaceBilling(current, id, { ...billing, reactivation: true }).url;
    });
    if (!kept) throw error('Esta subconta já está ativa.', 409);
    await recordAudit(who, 'Pagamento de reativação gerado', meta.name || id, billing.planName);
    return json({ url: kept });
  }

  return async function billingRoute(ctx) {
    if (ctx.p === '/api/billing/reactivate') return reactivate(ctx);
    return NEXT_ROUTE;
  };
}
