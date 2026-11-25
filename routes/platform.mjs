// Página Plataforma (admin geral): uso e limites dos serviços externos, só para o dono da plataforma
// (a sessão de GO_AGENCY_OWNER_ID, ou o servidor local sem login). Para qualquer outro, as rotas não existem: 404.
import { NEXT_ROUTE } from './next-route.mjs';

export function createPlatformRoutes({ monitor, verifiedUser, agencyOwnerId, auth, localAccess, error, payload }) {
  async function owner(req, res) {
    if (!auth) {
      if (localAccess) return { email: '' };
      throw error('Not found.', 404);
    }
    const session = await Promise.resolve(verifiedUser(req, res)).catch(() => null);
    if (!session || !agencyOwnerId || session.id !== agencyOwnerId) throw error('Not found.', 404);
    return session;
  }

  return async function platformRoute({ req, res, p, method, json }) {
    if (!p.startsWith('/api/platform/')) return NEXT_ROUTE;
    const route = `${method} ${p}`;
    if (!['GET /api/platform/usage', 'POST /api/platform/check', 'POST /api/platform/settings', 'POST /api/platform/push'].includes(route)) return NEXT_ROUTE;
    const session = await owner(req, res);
    if (route === 'GET /api/platform/usage') {
      await monitor.ensureEmail(session.email);
      // Primeira visita: confere na hora em vez de mostrar a página vazia até o próximo cron.
      if (!(await monitor.view()).checkedAt) await monitor.check();
      return json(await monitor.view());
    }
    if (route === 'POST /api/platform/check') return json(await monitor.check({ manual: true }));
    const body = await payload(req);
    if (route === 'POST /api/platform/settings') return json(await monitor.saveSettings(body || {}));
    return json(await monitor.subscribe(body?.subscription));
  };
}
