// Cobrança pela AbacatePay: o webhook (/api/abacatepay/webhook/...), a conta da agência com as assinaturas das subcontas
// (/api/abacatepay/agency/...), a conta da subconta (/api/abacatepay/workspace/...) e a recarga da carteira de créditos
// (/api/wallet/topup). Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que
// vive no fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { replaceBilling } from '../agency-model.mjs';
import { hasModule, requireCapability, workspaceView } from '../authorization.mjs';
import { addTopup, disputeTopup, paidTopup, reverseTopup, walletLimits } from '../wallet-model.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

export function createAbacatePayRoutes(deps) {
  const { store, ready, error, abacate, access, payload, publicBase, listWorkspaces, loadAgency, changeAgency, agencyPayload, recordAudit, requireFiscal, retryPolicyOf, stamp, documentMail, mailSent, flushLater, grantOffer, grantEventTicket, community } = deps;
  return async function abacatePayRoutes({ req, res, p, method, url, json }) {
    if (p.startsWith('/api/abacatepay/webhook/') && method === 'POST') {
      await ready;
      return await abacate.handleWebhook({ req, url, json, listWorkspaces, changeAgency,
        onSubscription: async (agencyId, { accountId, effect, notify, name, plan, subscriptionId }) => {
          const twice = effect === 'duplicate';
          if (!notify && !twice) return;
          const agency = await loadAgency(agencyId);
          const to = new Set([agency.profile.email, ...agency.users.filter(user => ['Agency Owner', 'Agency Admin'].includes(user.role)).map(user => user.email)].filter(Boolean).map(email => email.toLowerCase()));
          const text = twice ? `A subconta ${name} pagou o plano ${plan} em uma assinatura que já tinha sido trocada por outra, que continua ativa.\n\nAs duas seguem cobrando. No painel do AbacatePay, cancele a assinatura ${subscriptionId} e devolva o pagamento, se for o caso.` : `O pagamento do plano ${plan} da subconta ${name} foi recusado (tentativa ${notify}).\n\nO AbacatePay tenta de novo sozinho. Acompanhe em Configurador SaaS → Subcontas SaaS.`;
          for (const email of to) {
            const outcome = await documentMail.email(email, { subject: `${twice ? 'Pagamento em dobro' : 'Pagamento recusado'}: ${name}`, text }, twice ? `plan-twice-${subscriptionId || accountId}-${email}` : `plan-failed-${subscriptionId || accountId}-${notify}-${email}`, { fromName: agency.company.name });
            if (!mailSent(outcome)) console.warn(`Aviso de plano recusado (${accountId}): ${outcome}`);
          }
        },
        onWalletReversal: async (agencyId, { workspace, checkoutId, event, status, lost }) => {
          if (!(await listWorkspaces(agencyId)).some(w => w.id === workspace)) return false;
          const refunded = /\.refunded$/.test(event), gone = refunded || lost || status === 'REFUNDED';
          return store.change(workspace, s => gone ? reverseTopup(s, { checkoutId, kind: refunded ? 'refund' : 'dispute_lost' }) : disputeTopup(s, { checkoutId, opened: status === 'UNDER_DISPUTE' }));
        },
        onWalletTopup: async (agencyId, { workspace, checkoutId, method, paidCents, feeCents, devMode }) => {
          const owned = (await listWorkspaces(agencyId)).map(w => w.id);
          for (const candidate of workspace ? [workspace].filter(item => owned.includes(item)) : owned) {
            const credited = await store.change(candidate, s => paidTopup(s, { checkoutId, method, paidCents, feeCents, devMode }));
            if (credited) { flushLater(candidate); return credited; }
          }
          return false;
        },
        onInvoicePaid: async (workspace, invoice) => {
          if (invoice.offerId && !invoice.offerGrantedAt) await grantOffer(workspace, invoice.offerId, invoice.contactId, invoice.id);
          if (invoice.eventTicket && !invoice.ticketGrantedAt) await grantEventTicket(workspace, invoice);
          if (invoice.communityPlan) await community.grantPlan(workspace, await store.load(workspace), invoice.communityPlan, invoice.id);
          flushLater(workspace);
        } });
    }
    if (p.startsWith('/api/abacatepay/agency/')) {
      const who = await access(req, res);
      requireCapability(who, 'settings', 'Seu usuário não pode gerenciar a cobrança da agência.');
      const op = p.slice('/api/abacatepay/agency/'.length).replace(/\/+$/, ''), origin = publicBase(req), scope = abacate.AGENCY_SCOPE;
      if (op === 'status' && method === 'GET') return json(await abacate.status(who.agencyId, scope, origin));
      if (method !== 'POST') throw error('Method not allowed.', 405);
      const body = await payload(req);
      if (op === 'connect') {
        await requireFiscal((await loadAgency(who.agencyId)).fiscal, who.agencyId, scope);
        const view = await abacate.connect(who.agencyId, scope, body.apiKey, origin);
        await recordAudit(who, 'AbacatePay conectado', view.storeName || 'Agência');
        return json(view);
      }
      if (op === 'refresh-webhook') {
        const view = await abacate.refreshWebhook(who.agencyId, scope, origin);
        await recordAudit(who, 'Avisos do AbacatePay atualizados', view.storeName || 'Agência');
        return json(view);
      }
      if (op === 'disconnect') {
        const view = await abacate.disconnect(who.agencyId, scope, origin);
        await recordAudit(who, 'AbacatePay desconectado', 'Agência');
        return json(view);
      }
      if (op === 'subscribe' || op === 'cancel') {
        const workspace = String(body.workspace || '');
        if (!(await listWorkspaces(who.agencyId)).some(w => w.id === workspace)) throw error('Subconta não encontrada.', 404);
        const agency = await loadAgency(who.agencyId);
        const meta = agency.accounts[workspace] || {};
        if (op === 'subscribe') {
          const running = billing => billing?.provider === 'abacatepay' && ['Active', 'Trial', 'PastDue'].includes(billing.status), refuse = () => error('Esta subconta já tem uma assinatura ativa. Cancele antes de gerar outra.', 409);
          if (running(meta.billing)) throw refuse();
          const billing = await abacate.subscribe(who.agencyId, workspace, agency.plans.find(plan => plan.id === meta.plan), origin, { retryPolicy: retryPolicyOf(agency) });
          // The customer may have paid the earlier link while this one was being made.
          if (!await changeAgency(who.agencyId, current => !running(current.accounts[workspace]?.billing) && Boolean(replaceBilling(current, workspace, billing)))) throw refuse();
          await recordAudit(who, 'Assinatura AbacatePay gerada', meta.name || workspace, billing.planName);
          return json(await agencyPayload(req, res, { result: billing }));
        }
        await abacate.cancelSubscription(who.agencyId, meta.billing);
        await changeAgency(who.agencyId, current => {
          const billing = current.accounts[workspace]?.billing;
          if (billing) Object.assign(billing, { status: 'Cancelled', cancelledAt: stamp(), updatedAt: stamp() });
        });
        await recordAudit(who, 'Assinatura AbacatePay cancelada', meta.name || workspace);
        return json(await agencyPayload(req, res));
      }
      throw error('Not found.', 404);
    }
    return NEXT_ROUTE;
  };
}

export function createAbacatePayWorkspaceRoutes(deps) {
  const { store, error, abacate, spaceId, workspaceAccess, payload, publicBase, requireFiscal } = deps;
  return async function abacatePayWorkspaceRoutes({ req, res, p, method, id, json }) {
    if (p.startsWith('/api/abacatepay/workspace/')) {
      if (!spaceId.test(id)) throw error('Subconta não encontrada.', 404);
      const op = p.slice('/api/abacatepay/workspace/'.length).replace(/\/+$/, ''), origin = publicBase(req);
      const who = await workspaceAccess(req, res, id, { modules: ['connect', 'disconnect', 'refresh-webhook'].includes(op) ? ['settings', 'payments'] : ['payments'] });
      if (op === 'status' && method === 'GET') {
        const view = await abacate.status(who.agencyId, id, origin);
        return json(hasModule(who, 'settings') ? view : { ...view, webhookSecret: undefined });
      }
      if (method !== 'POST') throw error('Method not allowed.', 405);
      const body = await payload(req);
      if (op === 'connect') {
        await requireFiscal((await store.load(id)).fiscal, who.agencyId, id);
        return json(await abacate.connect(who.agencyId, id, body.apiKey, origin));
      }
      if (op === 'disconnect') return json(await abacate.disconnect(who.agencyId, id, origin));
      if (op === 'refresh-webhook') return json(await abacate.refreshWebhook(who.agencyId, id, origin));
      if (op === 'charge') {
        const payment = await abacate.chargeInvoice(who.agencyId, id, String(body.invoiceId || ''), origin);
        return json({ payment, ...workspaceView(who, await store.load(id)) });
      }
      throw error('Not found.', 404);
    }
    return NEXT_ROUTE;
  };
}

export function createWalletRoutes(deps) {
  const { store, error, abacate, spaceId, workspaceAccess, payload, publicBase, flushLater } = deps;
  return async function walletRoutes({ req, res, p, method, id, json }) {
    // Reselling: the client recharges its wallet by Pix or card, paid to the agency's AbacatePay account.
    if (p === '/api/wallet/topup' && method === 'POST') {
      if (!spaceId.test(id)) throw error('Subconta não encontrada.',404);
      const who = await workspaceAccess(req, res, id, { modules: ['settings'] });
      const body = await payload(req);
      const state = await store.load(id);
      if (!Object.keys(state.wallet?.pricing || {}).length) throw error('Esta subconta não tem carteira de créditos ativa.', 409);
      const amount = Math.round(Number(body.amount) * 100) / 100;
      if (!(amount >= walletLimits.minTopup && amount <= walletLimits.maxTopup)) throw error(`A recarga vai de R$ ${walletLimits.minTopup} a R$ ${walletLimits.maxTopup.toLocaleString('pt-BR')}.`, 400);
      if (!(await abacate.connected(who.agencyId, abacate.AGENCY_SCOPE))) throw error('A recarga por Pix ainda não foi ativada pela agência. Fale com ela para lançar os créditos.', 409);
      const back = `${publicBase(req)}/app?workspace=${encodeURIComponent(id)}#settings/wallet`;
      const payment = await abacate.createCheckout(who.agencyId, abacate.AGENCY_SCOPE, { reference: `wallet-${id}`, name: 'Recarga de créditos', amount, returnUrl: back, completionUrl: back, metadata: { walletTopup: id } });
      await store.change(id, s => { addTopup(s, payment); });
      flushLater(id);
      return json({ url: payment.url, checkoutId: payment.checkoutId, amount: payment.amount });
    }
    return NEXT_ROUTE;
  };
}
