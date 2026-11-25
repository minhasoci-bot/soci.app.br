// Conectores de apps (Configurações → Integrações): o webhook que cada app chama (/api/connectors/hook/<subconta>/<app>/<token>)
// e a API da subconta para ver, conectar e desconectar (/api/connectors/status|connect|disconnect).
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { connectorPublic } from '../connector-model.mjs';
import { readWebhook, testConnection } from '../connectors.mjs';
import { seal as sealSecret } from '../social-providers.mjs';
import { connectorById, connectors as connectorCatalog } from '../ui/connectors-data.js';
import { NEXT_ROUTE } from './next-route.mjs';

export function createConnectorHookRoutes(deps) {
  const { store, ready, error, change, flushLater, publicAccountPolicy, connectorAuth } = deps;
  return async function connectorHookRoutes({ req, p, method, json }) {
    const appHook = p.match(/^\/api\/connectors\/hook\/(demo|[0-9a-f-]{36})\/([a-z_]{2,40})\/([\w-]{20,80})$/);
    if (appHook && method === 'POST') {
      await ready;
      const [, workspace, appId, token] = appHook;
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 1_000_000) throw error('Payload too large.', 413); chunks.push(chunk); }
      const state = await Promise.resolve().then(() => store.load(workspace)).catch(() => null), row = state?.connectors?.[appId];
      const given = Buffer.from(token), expected = Buffer.from(String(row?.hook || ''));
      if (!row || given.length !== expected.length || !timingSafeEqual(given, expected)) throw error('Not found.', 404);
      if (!await publicAccountPolicy(workspace, true, 'automation').catch(() => false)) return json({ ok: true, ignored: true });
      const read = readWebhook(appId, { raw: Buffer.concat(chunks).toString('utf8'), headers: req.headers, auth: connectorAuth(row) });
      for (const event of read.events.slice(0, 50)) await change(workspace, { type: 'connector-event', data: { connector: appId, key: event.key, ctx: event.ctx, contact: event.contact } });
      if (read.events.length) flushLater(workspace);
      return json(read.reply || { ok: true });
    }
    return NEXT_ROUTE;
  };
}

export function createConnectorRoutes(deps) {
  const { store, error, spaceId, privateSpace, change, payload, publicBase, requireActiveAccount, workspaceAccess, connectorRequest } = deps;
  return async function connectorRoutes({ req, res, p, method, id, json }) {
    if (p.startsWith('/api/connectors/') && !p.startsWith('/api/connectors/hook/')) {
      if (!spaceId.test(id) || privateSpace.test(id)) throw error('Subconta não encontrada.', 404);
      const who = await workspaceAccess(req, res, id, { modules: ['settings'] });
      const origin = publicBase(req);
      const view = state => Object.fromEntries(connectorCatalog.map(def => {
        const row = state.connectors?.[def.id];
        return [def.id, { ...connectorPublic(row), ...(row?.hook && def.triggers.some(t => !t.poll) ? { hookUrl: `${origin}/api/connectors/hook/${id}/${def.id}/${row.hook}` } : {}) }];
      }));
      if (p === '/api/connectors/status' && method === 'GET') return json({ connectors: view(await store.load(id)) });
      if (method !== 'POST') throw error('Método indisponível.', 405);
      await requireActiveAccount(who.agencyId, id, true);
      const body = await payload(req), def = connectorById(String(body.id || ''));
      if (!def) throw error('Conector não encontrado.', 404);
      if (p === '/api/connectors/connect') {
        const auth = Object.fromEntries(def.auth.map(field => [field.key, String(body.fields?.[field.key] ?? '').trim().slice(0, 20000)]));
        const account = await testConnection(def.id, auth, { request: connectorRequest });
        const result = await change(id, { type: 'connector-save', data: { id: def.id, sealed: sealSecret(JSON.stringify(auth)), account, hook: randomBytes(24).toString('base64url') } });
        return json({ connectors: view(result.state) });
      }
      if (p === '/api/connectors/disconnect') return json({ connectors: view((await change(id, { type: 'connector-remove', data: { id: def.id } })).state) });
      throw error('Not found.', 404);
    }
    return NEXT_ROUTE;
  };
}
