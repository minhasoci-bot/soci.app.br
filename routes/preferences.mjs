// Rota pública da Central de preferências (/preferencias/<subconta>/<token>): a página do próprio contato, aberta
// por um link com token privado, para escolher canais e assuntos ou sair de tudo.
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { preferenceCsp, preferencePage, preferenceView } from '../preference-model.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

export function createPreferenceRoutes(deps) {
  const { store, ready, error, workspaceSegment, change, flushLater, formBody, publicAccountPolicy } = deps;
  const preferencePath = new RegExp(`^/preferencias/${workspaceSegment}/([0-9a-f]{32})/?$`);
  return async function preferenceRoutes({ req, res, p, method }) {
    // Central de preferências: the contact's own page (link with a private token) to choose channels and topics.
    const preference = p.match(preferencePath);
    if (preference && ['GET', 'HEAD', 'POST'].includes(method)) {
      await ready;
      const [, workspace, token] = preference;
      await publicAccountPolicy(workspace, method === 'POST', 'contacts');
      let saved = false;
      if (method === 'POST') {
        const form = await formBody(req), list = value => [].concat(value || []);
        await change(workspace, { type: 'preferences-save', data: { token, channels: list(form.channels), topics: list(form.topics), all: form.all === '1' } });
        flushLater(workspace); saved = true;
      }
      const view = preferenceView(await store.load(workspace), token);
      if (!view) throw error('Link de preferências inválido.',404);
      res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'Referrer-Policy':'same-origin', 'X-Robots-Tag':'noindex', 'Content-Security-Policy':preferenceCsp });
      return res.end(method === 'HEAD' ? undefined : preferencePage(view, { saved }));
    }
    return NEXT_ROUTE;
  };
}
