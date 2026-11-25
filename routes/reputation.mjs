// Rotas públicas da Reputação: o widget de avaliações (página do iframe e script /rw/<subconta>/<id>/widget.js),
// os vídeos de depoimento aprovados (/v/...), o coletor de depoimentos em vídeo (/depoimento/... e a API
// start|chunk|finish) e o link de avaliação (/avaliar/<subconta>[/<token>] e /api/avaliar/<subconta>).
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { reviewTokenHash } from '../reputation-model.mjs';
import { renderReviewPage, reviewPageCsp } from '../reputation-page.mjs';
import { mediaRowId } from '../reputation-media.mjs';
import { collectorCsp, renderCollector, renderWidget, widgetCsp, widgetLoader } from '../reputation-widget.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

export function createReputationRoutes(deps) {
  const {
    store, ready, error, workspaceSegment, allowSign, change, clientPortal, flushLater, moveVideoToR2, payload, publicAccountPolicy, publicBase, sendVideo
  } = deps;
  const reviewPagePath = new RegExp(`^/avaliar/${workspaceSegment}(?:/([0-9a-f]{48}))?/?$`);
  const reviewApi = new RegExp(`^/api/avaliar/${workspaceSegment}$`);
  const widgetPath = new RegExp(`^/rw/${workspaceSegment}/([0-9a-f-]{36})(?:/(widget\\.js))?/?$`);
  const videoPath = new RegExp(`^/v/${workspaceSegment}/([0-9a-f-]{36})$`);
  const collectorPath = new RegExp(`^/depoimento/${workspaceSegment}/([0-9a-f-]{36})/?$`);
  const collectorApi = new RegExp(`^/api/depoimento/${workspaceSegment}/([0-9a-f-]{36})/(start|chunk|finish)$`);
  return async function reputationRoute({ req, res, p, method, json }) {
    const widgetRoute = p.match(widgetPath);
    if (widgetRoute && (method === 'GET' || method === 'HEAD')) {
      await ready;
      const [, workspace, widgetId, part] = widgetRoute;
      await publicAccountPolicy(workspace, false, 'reputation');
      const state = await store.load(workspace);
      const widget = state.reviewWidgets?.find(row => row.id === widgetId && row.active);
      if (part) {
        res.writeHead(widget ? 200 : 404, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' });
        return res.end(method === 'HEAD' || !widget ? undefined : widgetLoader({ origin: publicBase(req), workspace, widgetId }));
      }
      if (!widget) throw error('Este widget não está ativo.', 404);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=120', 'Content-Security-Policy': widgetCsp, 'Referrer-Policy': 'no-referrer' });
      return res.end(method === 'HEAD' ? undefined : renderWidget(state, widget, { workspace }));
    }
    const videoRoute = p.match(videoPath);
    if (videoRoute && (method === 'GET' || method === 'HEAD')) {
      await ready;
      const [, workspace, videoId] = videoRoute;
      await publicAccountPolicy(workspace, false, 'reputation');
      const row = (await store.load(workspace)).videoTestimonials?.find(item => item.id === videoId && item.status === 'approved');
      if (!row) throw error('Vídeo não encontrado.', 404);
      return await sendVideo(req, res, method, workspace, row, 'public, max-age=600');
    }
    const collectorRoute = p.match(collectorPath);
    if (collectorRoute && (method === 'GET' || method === 'HEAD')) {
      await ready;
      const [, workspace, collectorId] = collectorRoute;
      await publicAccountPolicy(workspace, false, 'reputation');
      const state = await store.load(workspace);
      const collector = state.videoCollectors?.find(row => row.id === collectorId && row.active);
      if (!collector) throw error('Este link de depoimento não está ativo.', 404);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': collectorCsp, 'Permissions-Policy': 'camera=(self), microphone=(self)', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' });
      return res.end(method === 'HEAD' ? undefined : renderCollector(state, collector, { workspace }));
    }
    const collectorCall = p.match(collectorApi);
    if (collectorCall && method === 'POST') {
      await ready;
      const [, workspace, collectorId, step] = collectorCall;
      await publicAccountPolicy(workspace, true, 'reputation');
      const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);
      if (step !== 'chunk' && !allowSign(ip)) throw error('Muitas tentativas a partir desta conexão. Aguarde alguns minutos.', 429);
      const input = await payload(req);
      const result = (await change(workspace, { type: `video-${step}`, id: collectorId, data: input })).id;
      if (step === 'chunk') {
        const rowId = mediaRowId(workspace, result.upload.id, result.index);
        if (!await store.insert(rowId, { data: result.data })) await store.change(rowId, row => { row.data = result.data; });
        return json({ ok: true, index: result.index });
      }
      if (step === 'finish') { await moveVideoToR2(workspace, result); flushLater(workspace); return json({ ok: true }, 201); }
      return json(result);
    }
    // Review link: the public page (generic or personal) and the review it sends.
    const reviewRoute = p.match(reviewPagePath);
    if (reviewRoute && (method === 'GET' || method === 'HEAD')) {
      await ready;
      const [, workspace, token = ''] = reviewRoute;
      const active = await publicAccountPolicy(workspace, false, 'reputation');
      const state = await store.load(workspace);
      const tokenHash = token ? reviewTokenHash(token) : '';
      const request = tokenHash ? state.reviewRequests?.find(row => row.tokenHash === tokenHash) : null;
      if (token && !request) throw error('Este link de avaliação não é válido.', 404);
      if (request && active && method === 'GET' && request.status === 'sent') await Promise.resolve().then(() => change(workspace, { type: 'review-open', data: { tokenHash } })).catch(() => {});
      const contact = request ? state.contacts.find(row => row.id === request.contactId) : null;
      const tint = (await clientPortal.directory(workspace).catch(() => null))?.settings?.color || '';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': reviewPageCsp, 'X-Robots-Tag': 'noindex' });
      return res.end(method === 'HEAD' ? undefined : renderReviewPage(state, { workspace, token, contactName: contact?.name || '', done: request?.status === 'reviewed', tint }));
    }
    const reviewSubmit = p.match(reviewApi);
    if (reviewSubmit && method === 'POST') {
      await ready;
      const [, workspace] = reviewSubmit;
      await publicAccountPolicy(workspace, true, 'reputation');
      const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);
      if (!allowSign(ip)) throw error('Muitas tentativas a partir desta conexão. Aguarde alguns minutos.', 429);
      const input = await payload(req);
      const tokenHash = input.token ? reviewTokenHash(String(input.token)) : '';
      if (input.token && !tokenHash) throw error('Este link de avaliação não é válido.', 404);
      const result = await change(workspace, { type: 'review-submit', data: { tokenHash, score: input.score, text: input.text, name: input.name, website: input.website } });
      if (result.state.workflowOutbox?.length) flushLater(workspace);
      return json({ ok: true }, 201);
    }
    return NEXT_ROUTE;
  };
}
