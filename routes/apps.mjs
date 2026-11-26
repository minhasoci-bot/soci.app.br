// Apps do marketplace: o gatilho que um app dispara na subconta onde está instalado (/api/apps/v1/trigger), a API pública
// de subcontas e contatos (/api/v1/subaccounts...) e a instalação e remoção de um app pela subconta (/api/apps/install|uninstall).
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no fechamento
// de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { AGENCY_ID } from '../agency-model.mjs';
import { addInstall, installedCopy, removeInstall } from '../app-studio-model.mjs';
import { workspaceView } from '../authorization.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

const apiPath = /^\/api\/v1\/subaccounts(?:\/(demo|[0-9a-f-]{36})\/contacts)?$/;

export function createAppApiRoutes(deps) {
  const { store, error, appBearer, bearer, payload, change, flushLater, listWorkspaces, requireWorkspaceAccess, loadAgency } = deps;
  return async function appApiRoutes({ req, p, method, json }) {
    // A marketplace app fires one of its workflow triggers in the sub-account it is installed in.
    if (p === '/api/apps/v1/trigger' && method === 'POST') {
      const { install } = await appBearer(req);
      const body = await payload(req);
      const result = await change(install.account, { type: 'app-trigger', data: { appId: install.appId, key: String(body.trigger || ''),
        contact: body.contact && typeof body.contact === 'object' ? body.contact : {}, payload: body.data } });
      flushLater(install.account);
      return json({ ok: true, ...result.id }, 202);
    }
    const apiMatch = p.match(apiPath);
    if (apiMatch) {
      const [, account] = apiMatch;
      if (!account) {
        if (method !== 'GET') throw error('Method not allowed.',405);
        if (String(req.headers.authorization || '').includes('soci_app_')) {
          const { agencyId, install } = await appBearer(req);
          return json({ subaccounts: (await listWorkspaces(agencyId)).filter(w => w.id === install.account) });
        }
        const agencyId = await bearer(req,'subaccounts.read');
        return json({ subaccounts: await listWorkspaces(agencyId) });
      }
      const agencyId = await bearer(req,method === 'POST' ? 'contacts.write' : 'contacts.read');
      if (req.appAccount && req.appAccount !== account) throw error('O token deste app só vale para a subconta onde ele foi instalado.', 403);
      const input = method === 'POST' ? await payload(req) : null;
      await requireWorkspaceAccess(await loadAgency(agencyId), { agencyId, modules: null }, account, {
        modules: ['contacts'], hide: true, reason: false
      });
      if (method !== 'POST') {
        return json({ contacts: (await store.load(account)).contacts });
      }
      const created = await change(account,{ type:'save', key:'contacts', data: input });
      return json({ id: created.id },201);
    }
    return NEXT_ROUTE;
  };
}

export function createAppInstallRoutes(deps) {
  const { store, error, spaceId, workspaceAccess, payload, changeAgency, change, logTo, deliverToApp, publicBase } = deps;
  return async function appInstallRoutes({ req, res, p, method, id, json }) {
    // App marketplace (7.3): a sub-account installs or removes an app its agency published.
    const appAction = p.match(/^\/api\/apps\/(install|uninstall)$/);
    if (appAction && method === 'POST') {
      if (!spaceId.test(id)) throw error('Subconta não encontrada.', 404);
      const who = await workspaceAccess(req, res, id, { modules: ['settings'] });
      const body = await payload(req);
      const agencyId = (await store.load(id)).agencyId || AGENCY_ID;
      if (appAction[1] === 'install') {
        const { app, install, token } = await changeAgency(agencyId, agency => {
          const made = addInstall(agency, String(body.appId || ''), id, who.name);
          logTo(agency, who, 'App installed', made.app.name, id);
          return made;
        });
        await change(id, { type: 'app-installed', data: { copy: installedCopy(app, install) } });
        // The app gets its token once, in the signed "app.installed" notice; Soci keeps only its hash.
        const sent = app.webhookUrl
          ? await deliverToApp(agencyId, id, app.id, { type: 'app.installed', token: app.scopes.length ? token : '', scopes: app.scopes, events: app.events,
            api: { base: `${publicBase(req)}/api/v1`, trigger: `${publicBase(req)}/api/apps/v1/trigger` } })
          : { name: app.name, text: 'sem webhook' };
        await change(id, { type: 'app-log', data: { entries: [{ app: app.name, appId: app.id, kind: 'install', text: `Instalado por ${who.name}: ${sent.text}` }] } });
        return json({ ...workspaceView(who, (await store.load(id))), installed: app.id, delivery: sent.text }, 201);
      }
      const removed = await changeAgency(agencyId, agency => {
        const made = removeInstall(agency, String(body.installId || ''), id);
        logTo(agency, who, 'App uninstalled', made.app?.name || made.install.appId, id);
        return made;
      });
      await change(id, { type: 'app-removed', data: { appId: removed.install.appId } });
      if (removed.app?.webhookUrl) {
        const sent = await deliverToApp(agencyId, id, removed.app.id, { type: 'app.uninstalled', installId: removed.install.id });
        await change(id, { type: 'app-log', data: { entries: [{ app: removed.app.name, appId: removed.app.id, kind: 'uninstall', text: `Desinstalado por ${who.name}: ${sent.text}` }] } });
      }
      return json({ ...workspaceView(who, (await store.load(id))), removed: removed.install.appId });
    }
    return NEXT_ROUTE;
  };
}
