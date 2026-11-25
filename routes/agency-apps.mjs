// Rotas públicas dos apps da agência: o app móvel (/mobile/<agência>/: página de instalação, manifest, ícones,
// service worker com push e config.json), o service worker de push do próprio app (/push/sw.js), o
// /.well-known/assetlinks.json do domínio do app na loja e o app de computador (/desktop/<agência>/: tela de
// entrada com a marca, manifest, ícones e service worker).
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { desktopCsp, desktopLaunchPage, desktopManifest, desktopOf, desktopWorker } from '../agency-desktop.mjs';
import { assetLinksFor, mobileConfig, mobileCsp, mobileLaunchPage, mobileManifest, mobileOf, mobileWorker } from '../agency-mobile.mjs';
import { assetBytes } from '../asset-store.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

const desktopPath = /^\/desktop\/([\w-]{1,60})\/(manifest\.webmanifest|sw\.js|icon-(?:192|512|1024)\.png)?$/;
const mobilePath = /^\/mobile\/([\w-]{1,60})\/(manifest\.webmanifest|sw\.js|config\.json|icon-(?:192|512|1024)\.png|cover)?$/;

export function createAgencyAppRoutes(deps) {
  const { store, auth, ready, error, loadAgency } = deps;
  return async function agencyAppRoutes({ req, res, p, method }) {
    // The agency's mobile app (6.6): install page, manifest, icons, service worker (push) and the app-mode config.
    const mobile = p.match(mobilePath);
    if (mobile && (method === 'GET' || method === 'HEAD')) {
      await ready;
      const [, agencyId, part = ''] = mobile;
      let agency;
      try { agency = await loadAgency(agencyId); } catch { throw error('App não encontrado.',404); }
      const app = mobileOf(structuredClone(agency));
      if (app.status !== 'published') throw error('Este app ainda não foi publicado pela agência.',404);
      const done = (type, body, extra = {}) => { res.writeHead(200, { 'Content-Type':type, 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff', ...extra }); return res.end(method === 'HEAD' ? undefined : body); };
      if (part === 'manifest.webmanifest') return done('application/manifest+json; charset=utf-8', JSON.stringify(mobileManifest(app, agencyId)));
      if (part === 'sw.js') return done('text/javascript; charset=utf-8', mobileWorker(agencyId), { 'Service-Worker-Allowed':`/mobile/${agencyId}/` });
      if (part === 'config.json') return done('application/json; charset=utf-8', JSON.stringify(mobileConfig(app, agencyId)));
      if (part.startsWith('icon-')) {
        const size = part.slice(5, -4), source = (size === '192' && app.icon192) || (size === '512' && app.icon512) || app.icon;
        const image = source && await assetBytes(store, source);
        if (!image) throw error('Ícone não encontrado.',404);
        return done('image/png', image.bytes);
      }
      if (part === 'cover') {
        const image = app.cover && await assetBytes(store, app.cover);
        if (!image) throw error('Capa não encontrada.',404);
        return done(image.mime, image.bytes);
      }
      return done('text/html; charset=utf-8', mobileLaunchPage(app, agencyId), { 'Content-Security-Policy':mobileCsp, 'Referrer-Policy':'no-referrer' });
    }
    if (p === '/push/sw.js' && (method === 'GET' || method === 'HEAD')) {
      res.writeHead(200, { 'Content-Type':'text/javascript; charset=utf-8', 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff' });
      return res.end(method === 'HEAD' ? undefined : mobileWorker('push').replaceAll('/mobile/push/icon-192.png', '/favicon.svg'));
    }
    if (p === '/.well-known/assetlinks.json' && (method === 'GET' || method === 'HEAD')) {
      await ready;
      const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase().split(':')[0];
      const found = await Promise.resolve().then(() => store.findAgency({ mobileApp: { store: { domain: host } } })).catch(() => null);
      const links = found && assetLinksFor([found.state], host);
      if (!links) throw error('Not found.',404);
      res.writeHead(200, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'public, max-age=3600' });
      return res.end(method === 'HEAD' ? undefined : JSON.stringify(links));
    }
    // The agency's installable desktop app: the branded sign-in screen, its manifest, icons and service worker.
    const desktop = p.match(desktopPath);
    if (desktop && (method === 'GET' || method === 'HEAD')) {
      await ready;
      const [, agencyId, part = ''] = desktop;
      let agency;
      try { agency = await loadAgency(agencyId); } catch { throw error('App não encontrado.',404); }
      const app = desktopOf(structuredClone(agency));
      if (app.status !== 'published') throw error('Este app ainda não foi publicado pela agência.',404);
      const done = (type, body, extra = {}) => { res.writeHead(200, { 'Content-Type':type, 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff', ...extra }); return res.end(method === 'HEAD' ? undefined : body); };
      if (part === 'manifest.webmanifest') return done('application/manifest+json; charset=utf-8', JSON.stringify(desktopManifest(app, agencyId)));
      if (part === 'sw.js') return done('text/javascript; charset=utf-8', desktopWorker, { 'Service-Worker-Allowed':`/desktop/${agencyId}/` });
      if (part.startsWith('icon-')) {
        const size = part.slice(5, -4), source = (size === '192' && app.icon192) || (size === '512' && app.icon512) || app.icon;
        const image = source && await assetBytes(store, source);
        if (!image) throw error('Ícone não encontrado.',404);
        return done('image/png', image.bytes);
      }
      return done('text/html; charset=utf-8', desktopLaunchPage(app, agencyId, { signedIn: Boolean(auth?.hasSession?.(req)) }), { 'Content-Security-Policy':desktopCsp, 'Referrer-Policy':'no-referrer' });
    }
    return NEXT_ROUTE;
  };
}
