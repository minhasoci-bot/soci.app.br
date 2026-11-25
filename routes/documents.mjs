// Rotas públicas dos documentos enviados ao cliente: a página e a API de cada link com token privado.
// Contrato para assinar (/assinar/<subconta>, /api/assinar/<subconta>), orçamento (/orcamento, /api/orcamento) e
// fatura (/fatura, /api/fatura): abrir, assinar ou aceitar, recusar e pagar pela AbacatePay da agência.
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AGENCY_ID } from '../agency-model.mjs';
import { tokenHash as documentTokenHash } from '../document-model.mjs';
import { estimateTokenHash } from '../estimate-model.mjs';
import { invoiceTokenHash } from '../invoice-model.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

export function createDocumentRoutes(deps) {
  const {
    store, ready, root, error, workspaceSegment, abacate, allowSign, change, flushLater, payload, publicAccountPolicy, publicBase
  } = deps;
  const signPagePath = new RegExp(`^/assinar/${workspaceSegment}/?$`);
  const signApiPath = new RegExp(`^/api/assinar/${workspaceSegment}$`);
  const estimatePagePath = new RegExp(`^/orcamento/${workspaceSegment}/?$`);
  const estimateApiPath = new RegExp(`^/api/orcamento/${workspaceSegment}$`);
  const invoicePagePath = new RegExp(`^/fatura/${workspaceSegment}/?$`);
  const invoiceApiPath = new RegExp(`^/api/fatura/${workspaceSegment}$`);
  return async function documentRoute({ req, res, p, method, json, send }) {
    const signPage = p.match(signPagePath);
    if (signPage && method === 'GET') {
      await ready;
      await publicAccountPolicy(signPage[1], false, 'payments');
      res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; img-src 'self' data: https:; frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://www.loom.com; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Robots-Tag', 'noindex');
      return send(200, 'text/html; charset=utf-8', readFileSync(resolve(root, 'ui/document-sign.html')));
    }
    const signCall = p.match(signApiPath);
    if (signCall) {
      await ready;
      if (method !== 'POST') throw error('Method not allowed.',405);
      const workspace = signCall[1];
      const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);
      if (!allowSign(ip)) throw error('Muitas tentativas a partir desta conexão. Aguarde alguns minutos.',429);
      const input = await payload(req);
      const action = ['open', 'sign', 'decline', 'pay'].includes(input.action) ? input.action : '';
      if (!action) throw error('Ação inválida para este link.',400);
      const digest = documentTokenHash(input.token);
      if (!digest) throw error('Este link não é válido.',404);
      await publicAccountPolicy(workspace, action !== 'open', 'payments');
      if (action === 'pay') {
        const due = (await change(workspace, { type: 'document-payable', data: { tokenHash: digest } })).id;
        const current = await store.load(workspace), agencyId = current.agencyId || AGENCY_ID;
        if (!(await abacate.connected(agencyId, workspace))) throw error('O pagamento online ainda não está disponível. Fale com quem enviou o documento.',409);
        const page = `${publicBase(req)}/assinar/${workspace}`;
        const back = { returnUrl: `${page}?pagamento=voltou`, completionUrl: `${page}?pagamento=ok` };
        if (due.kind === 'invoice') return json({ url: (await abacate.chargeInvoice(agencyId, workspace, due.invoiceId, publicBase(req), back)).url });
        if (due.checkout) return json({ url: due.checkout.url });
        const checkout = await abacate.subscribeWorkspace(agencyId, workspace, { reference: `doc-${due.docId}`, name: due.title, amount: due.amount, ...back, metadata: { workspace, documentId: due.docId } });
        await change(workspace, { type: 'document-subscription-checkout', data: { docId: due.docId, checkout } });
        return json({ url: checkout.url });
      }
      const result = await change(workspace, { type: `document-${action}`, data: { tokenHash: digest, ip, userAgent: String(req.headers['user-agent'] || ''), origin: publicBase(req),
        values: input.values, items: input.items, accept: input.accept, reason: input.reason } });
      if (result.state.workflowOutbox?.length) flushLater(workspace);
      if (result.id?.payment) result.id.payment.online = await abacate.connected(result.state.agencyId || AGENCY_ID, workspace).catch(() => false);
      return json(result.id);
    }
    const estimatePage = p.match(estimatePagePath);
    if (estimatePage && method === 'GET') {
      await ready;
      await publicAccountPolicy(estimatePage[1], false, 'payments');
      res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; img-src 'self' data: https:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Robots-Tag', 'noindex');
      return send(200, 'text/html; charset=utf-8', readFileSync(resolve(root, 'ui/estimate-view.html')));
    }
    const estimateCall = p.match(estimateApiPath);
    if (estimateCall) {
      await ready;
      if (method !== 'POST') throw error('Method not allowed.',405);
      const workspace = estimateCall[1];
      const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);
      if (!allowSign(ip)) throw error('Muitas tentativas a partir desta conexão. Aguarde alguns minutos.',429);
      const input = await payload(req);
      const action = ['open', 'accept', 'decline', 'pay'].includes(input.action) ? input.action : '';
      if (!action) throw error('Ação inválida para este link.',400);
      const digest = estimateTokenHash(input.token);
      if (!digest) throw error('Este link não é válido.',404);
      await publicAccountPolicy(workspace, action !== 'open', 'payments');
      if (action === 'pay') {
        const due = (await change(workspace, { type: 'estimate-payable', data: { tokenHash: digest } })).id;
        const current = await store.load(workspace), agencyId = current.agencyId || AGENCY_ID;
        if (!(await abacate.connected(agencyId, workspace))) throw error('O pagamento online ainda não está disponível. Fale com quem enviou o orçamento.',409);
        const page = `${publicBase(req)}/orcamento/${workspace}`;
        return json({ url: (await abacate.chargeInvoice(agencyId, workspace, due.invoiceId, publicBase(req), { returnUrl: `${page}?pagamento=voltou`, completionUrl: `${page}?pagamento=ok` })).url });
      }
      const result = await change(workspace, { type: `estimate-${action}`, data: { tokenHash: digest, ip, userAgent: String(req.headers['user-agent'] || ''), origin: publicBase(req),
        name: input.name, items: input.items, reason: input.reason } });
      if (result.state.workflowOutbox?.length) flushLater(workspace);
      if (result.id?.invoice) result.id.online = await abacate.connected(result.state.agencyId || AGENCY_ID, workspace).catch(() => false);
      return json(result.id);
    }
    const invoicePage = p.match(invoicePagePath);
    if (invoicePage && method === 'GET') {
      await ready;
      await publicAccountPolicy(invoicePage[1], false, 'payments');
      res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; img-src 'self' data: https:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Robots-Tag', 'noindex');
      return send(200, 'text/html; charset=utf-8', readFileSync(resolve(root, 'ui/invoice-view.html')));
    }
    const invoiceCall = p.match(invoiceApiPath);
    if (invoiceCall) {
      await ready;
      if (method !== 'POST') throw error('Method not allowed.',405);
      const workspace = invoiceCall[1];
      const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);
      if (!allowSign(ip)) throw error('Muitas tentativas a partir desta conexão. Aguarde alguns minutos.',429);
      const input = await payload(req);
      const action = ['open', 'pay'].includes(input.action) ? input.action : '';
      if (!action) throw error('Ação inválida para este link.',400);
      const digest = invoiceTokenHash(input.token);
      if (!digest) throw error('Este link não é válido.',404);
      await publicAccountPolicy(workspace, action !== 'open', 'payments');
      if (action === 'pay') {
        const due = (await change(workspace, { type: 'invoice-payable', data: { tokenHash: digest } })).id;
        const current = await store.load(workspace), agencyId = current.agencyId || AGENCY_ID;
        if (!(await abacate.connected(agencyId, workspace))) throw error('O pagamento online ainda não está disponível. Fale com quem enviou a fatura.',409);
        const page = `${publicBase(req)}/fatura/${workspace}`;
        return json({ url: (await abacate.chargeInvoice(agencyId, workspace, due.invoiceId, publicBase(req), { returnUrl: `${page}?pagamento=voltou`, completionUrl: `${page}?pagamento=ok` })).url });
      }
      const result = await change(workspace, { type: 'invoice-open', data: { tokenHash: digest } });
      result.id.online = result.id.payable ? await abacate.connected(result.state.agencyId || AGENCY_ID, workspace).catch(() => false) : false;
      return json(result.id);
    }
    return NEXT_ROUTE;
  };
}
