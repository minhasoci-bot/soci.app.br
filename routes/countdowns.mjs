// Contadores (/cd/<subconta>/<contador>): o GIF animado dos e-mails (.gif) e a página que os sites incorporam em iframe.
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { countdownGif } from '../countdown-gif.mjs';
import { deadlineOf, embedPage } from '../ui/countdown-data.js';
import { NEXT_ROUTE } from './next-route.mjs';

// A transparent 1x1 GIF for timers that no longer exist (an e-mail must not show a broken image).
const blankGif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

export function createCountdownRoutes(deps) {
  const { store, ready, workspaceSegment, publicAccountPolicy } = deps;
  const countdownPath = new RegExp(`^/cd/${workspaceSegment}/([0-9a-f-]{36})([.]gif)?$`);
  const countdownCache = new Map();
  return async function countdownRoutes({ res, p, method, url }) {
    // Contadores: the animated GIF for e-mails (?s= is when the e-mail was sent, for evergreen timers)
    // and the page that sites embed in an iframe.
    const countdownRoute = p.match(countdownPath);
    if (countdownRoute && (method === 'GET' || method === 'HEAD')) {
      await ready;
      const [, workspace, timerId, gif] = countdownRoute;
      let timer = null;
      try { await publicAccountPolicy(workspace, false, 'marketing'); timer = (await store.load(workspace)).countdownTimers?.find(row => row.id === timerId) || null; } catch { timer = null; }
      if (gif) {
        let bytes = blankGif;
        if (timer) {
          const now = Date.now(), sent = Number(url.searchParams.get('s')) * 1000, created = Date.parse(timer.created) || 0;
          const start = Number.isFinite(sent) && sent > 0 ? Math.min(now, Math.max(created, sent)) : now;
          const key = `${workspace}:${timerId}:${timer.updated || timer.created}:${start}:${Math.floor(now / 1000)}`;
          bytes = countdownCache.get(key);
          if (!bytes) {
            bytes = countdownGif(timer, deadlineOf(timer, start) - now);
            if (countdownCache.size >= 200) countdownCache.delete(countdownCache.keys().next().value);
            countdownCache.set(key, bytes);
          }
        }
        res.writeHead(200, { 'Content-Type': 'image/gif', 'Content-Length': bytes.length, 'Cache-Control': 'no-store, no-cache, max-age=0', Expires: '0' });
        return res.end(method === 'HEAD' ? undefined : bytes);
      }
      if (!timer) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Contador indisponível.'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors *" });
      return res.end(method === 'HEAD' ? undefined : embedPage(timer, { key: `${workspace}-${timerId}` }));
    }
    return NEXT_ROUTE;
  };
}
