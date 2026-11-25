// Rastreio das campanhas de e-mail (/e/o|c|u/<subconta>/<token>): o pixel de abertura, o redirecionamento do clique e a
// página de cancelar a inscrição (com o POST de um clique dos clientes de e-mail, RFC 8058).
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { execute } from '../model.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createEmailTrackingRoutes(deps) {
  const { store, ready, workspaceSegment, change, flushLater, publicAccountPolicy } = deps;
  const emailTrackPath = new RegExp(`^/e/(o|c|u)/${workspaceSegment}/([0-9a-f]{24})(?:/([0-9]{1,3}))?$`);
  return async function emailTrackingRoutes({ res, p, method }) {
    // E-mail campaigns: open pixel, click redirect and unsubscribe page of one recipient.
    const tracked = p.match(emailTrackPath);
    if (tracked && ['GET', 'HEAD', 'POST'].includes(method)) {
      await ready;
      const [, kind, workspace, token, index] = tracked;
      const page = (status, title, body) => {
        res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'" });
        return res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;color:#18181b;background:#f4f4f5}main{max-width:440px;margin:16px;padding:32px;border-radius:16px;background:#fff;text-align:center}h1{font-size:22px;margin:0 0 8px}p{margin:0 0 16px;color:#52525b}button{font:inherit;font-weight:600;border:0;border-radius:8px;padding:12px 20px;background:#18181b;color:#fff;cursor:pointer}</style></head><body><main><h1>${esc(title)}</h1>${body}</main></body></html>`);
      };
      let active = false;
      try { active = await publicAccountPolicy(workspace, false, 'marketing'); }
      catch { if (kind !== 'o') return page(404, 'Link indisponível', '<p>Este e-mail não está mais disponível.</p>'); }
      const track = async (event, write) => {
        if (!write) return execute(await store.load(workspace), { type: 'email-track', data: { token, event: 'info' } });
        const result = await change(workspace, { type: 'email-track', data: { token, event, index } });
        if (result.state.workflowOutbox?.length) flushLater(workspace);
        return result.id;
      };
      if (kind === 'o') {
        res.writeHead(200, { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, max-age=0' });
        res.end(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
        if (active && method === 'GET') { const seen = await track('info', false).catch(() => null); if (seen && !seen.opened) await track('open', true).catch(() => null); }
        return;
      }
      if (kind === 'c') {
        const found = active ? await track('click', true) : execute(await store.load(workspace), { type: 'email-track', data: { token, event: 'click', index } });
        if (!found?.url) return page(404, 'Link indisponível', '<p>Este link não existe mais.</p>');
        res.writeHead(302, { Location: found.url, 'Cache-Control': 'no-store' }); return res.end();
      }
      const info = await track('info', false);
      if (!info) return page(404, 'Link indisponível', '<p>Não encontramos esta inscrição.</p>');
      // The contact's preference center: choose topics and channels instead of leaving everything.
      let prefToken = '';
      if (info.contactId) { try { prefToken = (await change(workspace, { type: 'preferences-link', data: { contactId: info.contactId } })).id; } catch { /* The page still works without the link. */ } }
      const prefLink = prefToken ? `<p><a href="/preferencias/${workspace}/${prefToken}">Escolher o que quero receber</a></p>` : '';
      // POST is the confirmation button and the one-click unsubscribe of mail clients (RFC 8058). It works even while the account is paused.
      if (method === 'POST') { await track('unsubscribe', true); return page(200, 'Inscrição cancelada', `<p>Você não vai mais receber e-mails de marketing de ${esc(info.business || 'esta empresa')}.</p>${prefLink}`); }
      if (info.unsubscribed) return page(200, 'Inscrição cancelada', `<p>Você já saiu da lista de e-mails de ${esc(info.business || 'esta empresa')}.</p>${prefLink}`);
      return page(200, 'Cancelar inscrição', `<p>Deixar de receber os e-mails de marketing de <b>${esc(info.business || 'esta empresa')}</b>?</p><form method="post"><button>Cancelar inscrição</button></form>${prefLink}`);
    }
    return NEXT_ROUTE;
  };
}
