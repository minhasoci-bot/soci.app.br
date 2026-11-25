// Rota pública dos QR Codes (/q/<subconta>/<qr>): conta a leitura e manda o visitante ao destino, que pode mudar
// depois de impresso; um código pausado ou removido mostra uma página 404 própria.
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { deviceOf, qrTarget } from '../qr-model.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

export function createQrRoutes(deps) {
  const { store, ready, workspaceSegment, change, publicAccountPolicy, publicBase } = deps;
  const qrPath = new RegExp(`^/q/${workspaceSegment}/([0-9a-f-]{36})$`);
  return async function qrRoutes({ req, res, p, method }) {
    // QR Codes: count the scan and send the visitor on. The destination can change after printing.
    const qrRoute = p.match(qrPath);
    if (qrRoute && (method === 'GET' || method === 'HEAD')) {
      await ready;
      const [, workspace, qrId] = qrRoute;
      const active = await publicAccountPolicy(workspace, false, 'sites');
      const state = await store.load(workspace);
      const qr = state.qrCodes?.find(item => item.id === qrId);
      const target = qr?.active ? qrTarget(state, qr, { base:publicBase(req), workspace }) : '';
      if (!target) {
        res.writeHead(404, { 'Content-Type':'text/html; charset=utf-8', 'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'" });
        return res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QR Code indisponível</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;color:#101828;background:#f2f4f7}main{max-width:420px;padding:32px;border-radius:18px;background:#fff;text-align:center}</style></head><body><main><h1 style="font-size:22px;margin:0 0 8px">Este QR Code não está ativo</h1><p style="margin:0;color:#475467">O destino foi pausado ou removido por quem criou o código.</p></main></body></html>`);
      }
      if (active && method === 'GET') {
        const visitor = `${req.headers['x-forwarded-for'] || req.socket?.remoteAddress || ''}|${req.headers['user-agent'] || ''}`;
        await Promise.resolve().then(() => change(workspace,{ type:'qr-scan', id:qrId, data:{ visitor, device:deviceOf(String(req.headers['user-agent'] || '')) } })).catch(() => {});
      }
      res.writeHead(302, { Location:target, 'Cache-Control':'no-store' });
      return res.end();
    }
    return NEXT_ROUTE;
  };
}
