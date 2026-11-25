// Rotas públicas das ofertas (área de membros): a página da oferta (/oferta/<subconta>/<oferta>) e a API de compra
// (/api/offer/<subconta>/<oferta>: matrícula direta na oferta grátis, cobrança pela AbacatePay da agência na paga).
// São duas funções porque o roteador as chama em pontos diferentes, e a ordem das rotas não muda.
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { AGENCY_ID } from '../agency-model.mjs';
import { offerPageCsp, renderOfferPage } from '../offer-page.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

export function createOfferPageRoutes(deps) {
  const { store, ready, error, workspaceSegment, clientPortal, publicAccountPolicy, withPixels } = deps;
  const offerPath = new RegExp(`^/oferta/${workspaceSegment}/([0-9a-f-]{36})/?$`);
  return async function offerPageRoutes({ res, p, method, url }) {
    const offerRoute = p.match(offerPath);
    if (offerRoute && (method === 'GET' || method === 'HEAD')) {
      await ready;
      const [, workspace, offerId] = offerRoute;
      await publicAccountPolicy(workspace, false, 'memberships');
      const state = await store.load(workspace);
      const offer = state.offers?.find(row => row.id === offerId && row.status === 'published');
      if (!offer) throw error('Esta oferta não está disponível.',404);
      const color = (await clientPortal.directory(workspace)).settings?.color || '';
      const status = ['pago','voltou'].includes(url.searchParams.get('status')) ? url.searchParams.get('status') : '';
      const [offerHeaders, offerBody] = withPixels(state, workspace, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'Referrer-Policy':'strict-origin-when-cross-origin', 'Content-Security-Policy':offerPageCsp }, renderOfferPage(state, offer, { workspace, status, color }));
      res.writeHead(200, offerHeaders);
      return res.end(method === 'HEAD' ? undefined : offerBody);
    }
    return NEXT_ROUTE;
  };
}

export function createOfferApiRoutes(deps) {
  const { store, ready, error, workspaceSegment, abacate, change, grantOffer, payload, publicAccountPolicy, publicBase } = deps;
  const offerApi = new RegExp(`^/api/offer/${workspaceSegment}/([0-9a-f-]{36})$`);
  return async function offerApiRoutes({ req, p, method, json }) {
    const offerCall = p.match(offerApi);
    if (offerCall) {
      await ready;
      if (method !== 'POST') throw error('Method not allowed.',405);
      const [, workspace, offerId] = offerCall;
      const input = await payload(req);
      await publicAccountPolicy(workspace, true, 'memberships');
      const current = await store.load(workspace);
      const offer = current.offers?.find(row => row.id === offerId && row.status === 'published');
      if (!offer) throw error('Esta oferta não está disponível.',404);
      const agencyId = current.agencyId || AGENCY_ID;
      if (offer.type !== 'free' && !(await abacate.connected(agencyId, workspace))) throw error('O pagamento online desta oferta ainda não está disponível. Fale com a equipe.',409);
      const result = await change(workspace,{ type:'offer-checkout', id:offerId, data:{ name:input.name, email:input.email } });
      if (offer.type === 'free') {
        const { emailed } = await grantOffer(workspace, offerId, result.id);
        return json({ enrolled:true, emailed });
      }
      const origin = publicBase(req), page = `${origin}/oferta/${workspace}/${offerId}`;
      const payment = await abacate.chargeInvoice(agencyId, workspace, result.id, origin, { returnUrl:`${page}?status=voltou`, completionUrl:`${page}?status=pago` });
      return json({ payUrl:payment.url });
    }
    return NEXT_ROUTE;
  };
}
