// Rotas do Google: o retorno do login OAuth (/api/google/callback), a conexão da subconta com Analytics, Perfil da Empresa
// e Search Console (/api/google/workspace/<op>: conectar, status, escolher e desconectar) e o webhook dos formulários de
// lead do Google Ads (/api/google-leads/<subconta>).
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { hasModule, workspaceView } from '../authorization.mjs';
import { exchangeGoogle, googleAuthUrl, googleError, listGoogleReviews, replyGoogleReview, revokeGoogle, updateLocation } from '../google-integrations.mjs';
import { googleLeadFields, googleLeadKeyValid } from '../lead-forms.mjs';
import { execute, uid } from '../model.mjs';
import { seal, unseal } from '../social-providers.mjs';
import { hoursPeriods } from '../ui/gbp-data.js';
import { NEXT_ROUTE } from './next-route.mjs';

export function createGoogleRoutes(deps) {
  const {
    store, ready, localAccess, error, spaceId, privateSpace, stamp, workspaceSegment, flushLater, googleCache, googleCallbackPath, googleData, googlePopup, googleView, payload, publicAccountPolicy, publicBase, recordAudit, searchCache, socialActor, socialRow, workspaceAccess
  } = deps;
  return async function googleRoute({ req, res, p, method, url, id, json, send }) {
    if (p === googleCallbackPath && method === 'GET') {
      const base = publicBase(req);
      res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
      try {
        await socialRow('google-oauth');
        const nonce = url.searchParams.get('state') || '';
        const pending = await store.change('google-oauth', row => { const v = row.states[nonce]; delete row.states[nonce]; return v; });
        if (!pending || Date.parse(pending.at) < Date.now() - 15 * 60_000) throw error('Este login expirou. Tente conectar de novo.',400);
        if (localAccess && pending.actor !== 'local-owner') req.localSocialUser = pending.actor;
        const who = await workspaceAccess(req, res, pending.workspace, { modules: ['settings'] });
        if (pending.actor !== socialActor(who)) throw error('Esta autorização pertence a outra sessão.',403);
        if (url.searchParams.get('error')) throw error(url.searchParams.get('error') === 'access_denied' ? 'A autorização foi cancelada.' : 'O Google recusou a autorização.',400);
        const found = await exchangeGoogle({ code: url.searchParams.get('code') || '', redirectUri: base + googleCallbackPath });
        await socialRow(`google-${pending.workspace}`);
        await store.change(`google-${pending.workspace}`, row => {
          const prior = row.google || {};
          const keep = (list, value) => list.some(item => item.id === value) ? value : '';
          row.google = { token: seal(found.secret), email: found.email, properties: found.properties, locations: found.locations, sites: found.sites || [], errors: found.errors,
            gscSite: keep(found.sites || [], prior.gscSite) || (found.sites?.length === 1 ? found.sites[0].id : ''),
            connectedAt: stamp(), gaProperty: keep(found.properties, prior.gaProperty) || (found.properties.length === 1 ? found.properties[0].id : ''),
            gbpLocation: keep(found.locations, prior.gbpLocation) || (found.locations.length === 1 ? found.locations[0].id : '') };
        });
        googleCache.delete(pending.workspace); searchCache.delete(pending.workspace);
        await recordAudit(who, 'Google conectado', found.email || pending.workspace).catch(() => {});
        return send(200,'text/html; charset=utf-8',googlePopup(base, {}));
      } catch (e) {
        return send(200,'text/html; charset=utf-8',googlePopup(base, { error: e.message }));
      }
    }
    if (p.startsWith('/api/google/workspace/')) {
      if (!spaceId.test(id)) throw error('Subconta não encontrada.', 404);
      const op = p.slice('/api/google/workspace/'.length).replace(/\/+$/, '');
      const manage = ['connect', 'select', 'disconnect'].includes(op);
      const who = await workspaceAccess(req, res, id, manage ? { modules: ['settings'] } : {});
      const rowId = `google-${id}`;
      if (op === 'connect' && method === 'GET') {
        const nonce = uid();
        const target = googleAuthUrl({ redirectUri: publicBase(req) + googleCallbackPath, state: nonce });
        await socialRow('google-oauth');
        await store.change('google-oauth', row => {
          for (const [k, v] of Object.entries(row.states)) if (Date.parse(v.at) < Date.now() - 15 * 60_000) delete row.states[k];
          row.states[nonce] = { workspace: id, at: stamp(), actor: socialActor(who) };
        });
        res.writeHead(302, { Location: target }); return res.end();
      }
      if (op === 'status' && method === 'GET') {
        const row = await socialRow(rowId);
        const view = googleView(row, hasModule(who, 'settings'));
        if (url.searchParams.get('data') === '1' && view.connected) view.data = await googleData(id, row);
        return json(view);
      }
      if (method !== 'POST') throw error('Method not allowed.', 405);
      const body = await payload(req);
      if (op === 'select') {
        await socialRow(rowId);
        await store.change(rowId, row => {
          if (!row.google?.token) throw error('Conecte uma conta Google primeiro.', 409);
          const pick = (list, value) => value === '' || list.some(item => item.id === value) ? value : null;
          const ga = pick(row.google.properties, String(body.gaProperty ?? row.google.gaProperty ?? ''));
          const gbp = pick(row.google.locations, String(body.gbpLocation ?? row.google.gbpLocation ?? ''));
          const gsc = pick(row.google.sites || [], String(body.gscSite ?? row.google.gscSite ?? ''));
          if (ga === null || gbp === null || gsc === null) throw error('Escolha uma propriedade, um local e um site desta conta Google.', 400);
          Object.assign(row.google, { gaProperty: ga, gbpLocation: gbp, gscSite: gsc });
        });
        googleCache.delete(id); searchCache.delete(id);
        const row = await store.load(rowId);
        return json({ ...googleView(row, true), data: await googleData(id, row) });
      }
      if (op === 'disconnect') {
        const row = await socialRow(rowId);
        if (row.google?.token) await revokeGoogle(unseal(row.google.token));
        await store.change(rowId, r => { delete r.google; });
        googleCache.delete(id); searchCache.delete(id);
        await recordAudit(who, 'Google desconectado', id).catch(() => {});
        return json(googleView(await store.load(rowId), true));
      }
      throw error('Not found.', 404);
    }
    // Google Ads lead form webhook: the URL and key from Marketing → Rastreamento; Google retries on non-200.
    const googleLead = p.match(new RegExp(`^/api/google-leads/${workspaceSegment}$`));
    if (googleLead && method === 'POST') {
      await ready;
      const workspace = googleLead[1];
      if (privateSpace.test(workspace)) throw error('Not found.', 404);
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 100_000) throw error('Payload too large.', 413); chunks.push(chunk); }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw error('Invalid JSON.', 400); }
      await publicAccountPolicy(workspace, true, 'marketing');
      if (!googleLeadKeyValid(await store.load(workspace), body?.google_key)) throw error('Invalid key.', 403);
      const gclid = String(body.gcl_id || '').slice(0, 200);
      const touch = { source: 'google', medium: 'cpc', campaign: String(body.campaign_id || ''), gclid, at: new Date().toISOString(), channel: 'google_ads' };
      await store.change(workspace, s => execute(s, { type: 'ad-form-lead', data: { network: 'google', leadId: String(body.lead_id || ''), formId: String(body.form_id || ''),
        campaignId: String(body.campaign_id || ''), campaign: String(body.campaign_id || ''), test: body.is_test === true, fields: googleLeadFields(body) } },
        { workspace, attribution: { first: touch, last: touch } }));
      flushLater(workspace);
      return json({});
    }
    return NEXT_ROUTE;
  };
}

// Perfil da Empresa no Google (/api/gbp/<op>): status do local, edição do perfil (descrição, telefone, site e horários),
// importação das avaliações e respostas publicadas no Google. Mesma origem e mesmo contrato das rotas acima.
export function createGbpRoutes(deps) {
  const {
    store, error, spaceId, change, flushLater, gbpAccess, gbpStatus, payload, recordAudit, workspaceAccess
  } = deps;
  return async function gbpRoute({ req, res, p, method, url, id, json }) {
    const gbpAction = p.match(/^\/api\/gbp\/(status|profile|sync|reply)$/);
    if (gbpAction) {
      if (!spaceId.test(id)) throw error('Subconta não encontrada.', 404);
      const who = await workspaceAccess(req, res, id, { modules: ['reputation'] });
      const op = gbpAction[1];
      if (op === 'status' && method === 'GET') return json(await gbpStatus(id, url.searchParams.get('refresh') === '1'));
      if (method !== 'POST') throw error('Method not allowed.', 405);
      const input = await payload(req);
      const access = await gbpAccess(id);
      if (op === 'profile') {
        const patch = {};
        if (input.description !== undefined) {
          const text = String(input.description || '').trim();
          if (text.length > 750) throw error('A descrição do Google aceita até 750 caracteres.', 400);
          if (/https?:\/\/|www\./i.test(text)) throw error('O Google não aceita links na descrição.', 400);
          patch.description = text;
        }
        if (input.phone !== undefined) patch.phone = String(input.phone || '').trim().slice(0, 30);
        if (input.website !== undefined) {
          const site = String(input.website || '').trim();
          if (site && !/^https?:\/\/[^\s]+$/i.test(site)) throw error('Use um site que comece com https://', 400);
          patch.website = site;
        }
        if (Array.isArray(input.hours)) patch.hours = hoursPeriods(input.hours);
        await updateLocation(access.token, access.location, patch).catch(problem => { throw problem.status === 400 ? problem : googleError(problem); });
        await recordAudit(who, 'Perfil do Google atualizado', id, Object.keys(patch).join(', ')).catch(() => {});
        return json(await gbpStatus(id, true));
      }
      if (op === 'sync') {
        if (!access.account) throw error('Não encontramos a conta deste local. Escolha o local de novo em Configurações → Google.', 409);
        const reviews = await listGoogleReviews(access.token, access.account, access.location).catch(problem => { throw googleError(problem); });
        const result = await change(id, { type: 'gbp-reviews-import', data: { reviews } });
        if (result.state.workflowOutbox?.length) flushLater(id);
        return json({ ...result.id, total: reviews.length, ...workspaceView(who, result.state) });
      }
      if (op === 'reply') {
        const state = await store.load(id);
        const review = state.reviews.find(row => row.id === input.reviewId && row.googleName);
        if (!review) throw error('Avaliação do Google não encontrada.', 404);
        if (!review.googleName.startsWith(`${access.account}/${access.location}/`)) throw error('Esta avaliação é de outro local do Google.', 409);
        const reply = String(input.reply || '').trim().slice(0, 2500);
        await replyGoogleReview(access.token, review.googleName, reply).catch(problem => { throw googleError(problem); });
        const result = await change(id, { type: 'save', key: 'reviews', id: review.id, data: { author: review.author, score: review.score, text: review.text, reply } }, who);
        return json({ ok: true, ...workspaceView(who, result.state) });
      }
      throw error('Not found.', 404);
    }
    return NEXT_ROUTE;
  };
}
