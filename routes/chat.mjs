// Rotas públicas do widget de chat: o script que o site incorpora (/chat/<subconta>/<widget>/widget.js), o painel
// aberto no iframe, a página de demonstração (/demo) e a API do visitante (/api/chat/<subconta>/<widget>/
// start|send|messages, com o token do visitante no cabeçalho x-chat-token).
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { randomBytes } from 'node:crypto';
import { hash } from '../agency-model.mjs';
import { chatHistory } from '../chat-model.mjs';
import { chatPage, demoPage, loaderScript } from '../ui/chat-widget-data.js';
import { NEXT_ROUTE } from './next-route.mjs';

export function createChatRoutes(deps) {
  const { store, ready, error, workspaceSegment, change, payload, publicAccountPolicy, workspaceAccess } = deps;
  const chatPath = new RegExp(`^/chat/${workspaceSegment}/([0-9a-f-]{36})(?:/(widget\\.js|demo))?/?$`);
  const chatApi = new RegExp(`^/api/chat/${workspaceSegment}/([0-9a-f-]{36})/(start|send|messages)$`);
  return async function chatRoutes({ req, res, p, method, json }) {
    // Chat widget: the loader a site embeds, the panel it opens in an iframe, a demo page and the visitor API.
    const chatRoute = p.match(chatPath);
    if (chatRoute && (method === 'GET' || method === 'HEAD')) {
      await ready;
      const [, workspace, widgetId, part] = chatRoute;
      await publicAccountPolicy(workspace, false, 'sites');
      const state = await store.load(workspace);
      const widget = state.chatWidgets?.find(item => item.id === widgetId);
      if (widget && !widget.active) await workspaceAccess(req, res, workspace, { modules: ['sites'], hide: true });
      if (!widget) throw error('Este chat não está publicado.',404);
      if (part === 'widget.js') {
        res.writeHead(200, { 'Content-Type':'text/javascript; charset=utf-8', 'Cache-Control':'no-cache', 'Cross-Origin-Resource-Policy':'cross-origin' });
        return res.end(method === 'HEAD' ? undefined : widget.active ? loaderScript(widget, { workspace }) : '/* chat em rascunho */');
      }
      if (part === 'demo') {
        res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; frame-src 'self'; base-uri 'none'; frame-ancestors 'self'" });
        return res.end(method === 'HEAD' ? undefined : demoPage(widget, { workspace, brand:state.profile?.name || '' }));
      }
      res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Referrer-Policy':'same-origin',
        'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors *" });
      return res.end(method === 'HEAD' ? undefined : chatPage(widget, { workspace }));
    }
    const chatCall = p.match(chatApi);
    if (chatCall) {
      await ready;
      const [, workspace, widgetId, op] = chatCall;
      await publicAccountPolicy(workspace, method === 'POST', 'sites');
      const token = String(req.headers['x-chat-token'] || '');
      const tokenHash = /^[0-9a-f]{48}$/.test(token) ? hash(token) : '';
      if (op === 'messages') {
        if (method !== 'GET') throw error('Method not allowed.',405);
        const state = await store.load(workspace);
        if (!state.chatWidgets?.some(item => item.id === widgetId && item.active)) throw error('Este chat não está disponível.',404);
        return json({ messages:chatHistory(state, widgetId, tokenHash) });
      }
      if (method !== 'POST') throw error('Method not allowed.',405);
      const input = await payload(req);
      if (op === 'start') {
        const fresh = randomBytes(24).toString('hex');
        const result = await change(workspace,{ type:'chat-start', id:widgetId, data:{ name:input.name, email:input.email, phone:input.phone, body:input.body, page:req.headers.referer || '', tokenHash:hash(fresh) } });
        return json({ token:fresh, messages:chatHistory(result.state, widgetId, hash(fresh)) },201);
      }
      const result = await change(workspace,{ type:'chat-send', id:widgetId, data:{ body:input.body, tokenHash } });
      return json({ messages:chatHistory(result.state, widgetId, tokenHash) },201);
    }
    return NEXT_ROUTE;
  };
}
