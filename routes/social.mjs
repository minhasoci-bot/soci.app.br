// Rotas da rede social (Social Planner): agendador (cron), arquivos públicos dos posts, convite para o cliente
// conectar as próprias contas, link de aprovação, login OAuth das redes e as ações do planejador.
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AGENCY_ID, hash } from '../agency-model.mjs';
import { workspaceView } from '../authorization.mjs';
import { sameSecret } from '../cron-batch.mjs';
import { uid } from '../model.mjs';
import { captionRequest } from '../social-ai.mjs';
import { attachAccounts, reviewSocialCsv } from '../social-model.mjs';
import { availability, blueskyLogin, seal, exchange as socialExchange, unseal } from '../social-providers.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

export function createSocialRoutes(deps) {
  const {
    store, auth, localAccess, redirectToR2, ready, root, error, spaceId, privateSpace, stamp, socialFilePath, socialInvitePath, socialApprovePath, accountIsActive, approvalView, brandVoiceOf, callbackPath, change, content, fileBytes, inviteAttach, meteredAI, openAI, payload, publicAccountPolicy, publicBase, routeMetaAccounts, runAllSocial, runSocial, socialActor, socialPopup, socialRow, socialSecrets, startSocialOAuth, validateApproval, validateInvite, whatsapp, workspaceAccess
  } = deps;
  return async function socialRoute({ req, res, p, method, url, id, json, send }) {
    if (p === '/api/social/cron' && (method === 'GET' || method === 'POST')) {
      if (!sameSecret(String(req.headers.authorization || ''), process.env.CRON_SECRET && `Bearer ${process.env.CRON_SECRET}`)) throw error('Not allowed.',401);
      const published = await runAllSocial(publicBase(req));
      // Página Plataforma: de hora em hora confere os limites dos serviços. Depois das publicações e sem derrubá-las.
      await deps.platformMonitor?.runIfDue().catch(problem => console.error(`Plataforma: ${problem.message}`));
      return json({ published });
    }
    const socialFile = p.match(socialFilePath);
    if (socialFile && method === 'GET') {
      await ready;
      const [, workspace, fileId] = socialFile;
      await publicAccountPolicy(workspace);
      const state = await store.load(workspace);
      const referenced = state.socialPosts.some(post => ['in_progress', 'published'].includes(post.status) &&
        post.media?.some(item => item.fileId === fileId)) || state.files.some(f => f.id === fileId && f.public === true);
      if (referenced) {
        await publicAccountPolicy(workspace, false, 'marketing');
      } else {
        if (!localAccess && !auth?.hasSession(req)) throw error('File not found.',404);
        try { await workspaceAccess(req, res, workspace, { modules: ['media'], support: true, hide: true }); }
        catch (e) {
          if ([401, 403, 404].includes(e.status)) throw error('File not found.',404);
          throw e;
        }
      }
      const file = state.files.find(f => f.id === fileId);
      // A file kept in R2 is served by the bucket, through a short-lived signed link.
      if (file?.r2Key) return redirectToR2(res, file.r2Key, { filename: file.name, type: file.mime, attachment: url.searchParams.get('download') === '1' });
      if (!file || !file.data.startsWith('data:image/')) throw error('File not found.',404);
      const { mime, bytes } = fileBytes(file.data);
      res.writeHead(200, { 'Content-Type': mime, 'Content-Length': bytes.length });
      return res.end(bytes);
    }
    const socialStart = p.match(/^\/api\/social\/connect\/([a-z]+)$/);
    const invitePage = p.match(socialInvitePath);
    if (invitePage && method === 'GET') {
      await ready;
      await publicAccountPolicy(invitePage[1], false, 'marketing');
      res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
      return send(200, 'text/html; charset=utf-8', readFileSync(resolve(root, 'ui/social-connect.html')));
    }
    const approvePage = p.match(socialApprovePath);
    if (approvePage && method === 'GET') {
      await ready;
      await publicAccountPolicy(approvePage[1], false, 'marketing');
      res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; img-src 'self' data: https:; media-src https:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
      res.setHeader('Referrer-Policy', 'no-referrer');
      return send(200, 'text/html; charset=utf-8', readFileSync(resolve(root, 'ui/social-approve.html')));
    }
    if (p === '/api/social/approval' && method === 'POST') {
      if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Link de aprovação inválido.',404);
      const input = await payload(req);
      if (typeof input.token !== 'string' || !/^[a-f0-9]{64}$/.test(input.token)) throw error('Link de aprovação inválido.',404);
      const key = hash(input.token);
      const link = validateApproval(await socialRow(`social-${id}`), key);
      await publicAccountPolicy(id, input.action === 'decide', 'marketing');
      if (input.action === 'list') return json({ expires: link.expires, ...approvalView(await store.load(id)) });
      if (input.action === 'decide') {
        const name = String(input.name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
        if (!name) throw error('Informe seu nome para registrar a decisão.',400);
        if (!['approved', 'rejected'].includes(input.decision)) throw error('Escolha aprovar ou pedir ajustes.',400);
        if (input.decision === 'rejected' && !String(input.note || '').trim()) throw error('Conte o que precisa mudar neste post.',400);
        await change(id, { type: 'social-review', id: String(input.postId || ''), data: { decision: input.decision, note: input.note }, actor: `${name} (cliente)` });
        return json({ expires: link.expires, ...approvalView(await store.load(id)) });
      }
      throw error('Ação inválida para este link.',400);
    }
    if (p === '/api/social/invited' && method === 'POST') {
      if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Convite inválido.',404);
      const input = await payload(req);
      if (typeof input.token !== 'string' || !/^[a-f0-9]{64}$/.test(input.token)) throw error('Convite inválido.',404);
      const key = hash(input.token);
      const row = await store.load(`social-${id}`);
      const invite = validateInvite(row, key);
      await publicAccountPolicy(id, input.action !== 'info', 'marketing');
      if (input.action === 'info') return json({ expires: invite.expires, providers: availability() });
      if (input.action === 'start') return json({ url: await startSocialOAuth(req, id, input.provider, key) });
      if (input.action === 'bluesky') {
        const candidates = await blueskyLogin(input.identifier, input.password);
        return json(await inviteAttach(id, key, candidates));
      }
      if (input.action === 'candidates' || input.action === 'attach') {
        const requestId = String(input.requestId || ''), pending = row.pending[requestId];
        if (!pending || pending.inviteKey !== key || Date.parse(pending.at) < Date.now() - 30 * 60_000) throw error('Esta autorização expirou.',404);
        const candidates = unseal(pending.candidates) || [];
        const state = await store.load(id);
        if (input.action === 'candidates') return json({ candidates: candidates.map((c, index) => ({ index, provider: c.provider, name: c.name }))
          .filter((_, n) => !state.socialAccounts.some(a => a.provider === candidates[n].provider && a.externalId === candidates[n].externalId)) });
        const picks = [...new Set(Array.isArray(input.picks) ? input.picks : [])].filter(n => Number.isInteger(n) && candidates[n]);
        if (!picks.length) throw error('Escolha ao menos uma conta.',400);
        await socialSecrets(id, current => {
          validateInvite(current, key);
          if (current.pending[requestId]?.inviteKey !== key) throw error('Esta autorização expirou.',404);
          delete current.pending[requestId];
        });
        return json(await inviteAttach(id, key, picks.map(n => candidates[n])));
      }
      throw error('Ação inválida para este convite.',400);
    }
    if (socialStart && method === 'GET') {
      if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Workspace not found.',404);
      if (localAccess) req.localSocialUser = url.searchParams.get('user');
      const who = await workspaceAccess(req, res, id, { modules: ['marketing'] });
      const target = await startSocialOAuth(req, id, socialStart[1], '', socialActor(who));
      res.writeHead(302, { Location: target }); return res.end();
    }
    const socialBack = p.match(/^\/api\/social\/callback\/([a-z]+)$/);
    if (socialBack && method === 'GET') {
      const base = publicBase(req);
      res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
      let provider = socialBack[1];
      try {
        await socialRow('social-oauth');
        const nonce = url.searchParams.get('state') || '';
        const pending = await store.change('social-oauth', row => { const v = row.states[nonce]; delete row.states[nonce]; return v; });
        if (!pending || Date.parse(pending.at) < Date.now() - 15 * 60_000 || callbackPath(pending.provider) !== p) throw error('Este login expirou. Tente conectar de novo.',400);
        if (pending.inviteKey) {
          validateInvite(await store.load(`social-${pending.workspace}`), pending.inviteKey);
        } else {
          if (localAccess && pending.actor !== 'local-owner') req.localSocialUser = pending.actor;
          const who = await workspaceAccess(req, res, pending.workspace, { modules: ['marketing'] });
          if (pending.actor !== socialActor(who)) throw error('Esta autorização pertence a outra sessão.',403);
        }
        await publicAccountPolicy(pending.workspace, true, 'marketing');
        provider = pending.provider;
        if (url.searchParams.get('error')) throw error(url.searchParams.get('error_description') || 'A autorização foi cancelada.',400);
        const candidates = await socialExchange(provider, { code: url.searchParams.get('code') || '', redirectUri: base + callbackPath(provider) });
        await publicAccountPolicy(pending.workspace, true, 'marketing');
        const requestId = uid();
        await socialSecrets(pending.workspace, row => {
          for (const [k, v] of Object.entries(row.pending)) if (Date.parse(v.at) < Date.now() - 30 * 60_000) delete row.pending[k];
          if (pending.inviteKey) validateInvite(row, pending.inviteKey);
          row.pending[requestId] = { provider, at: stamp(), candidates: seal(candidates), inviteKey: pending.inviteKey || '', actor: pending.actor };
        });
        return send(200,'text/html; charset=utf-8',socialPopup(base, { requestId, provider }));
      } catch (e) {
        return send(200,'text/html; charset=utf-8',socialPopup(base, { provider, error: e.message }));
      }
    }
    if (p.startsWith('/api/social/') && method === 'POST') {
      if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Workspace not found.',404);
      const input = await payload(req), op = p.slice('/api/social/'.length);
      const who = await workspaceAccess(req, res, id, { modules: ['marketing'] });
      if (op === 'csv-preview') return json({ rows: reviewSocialCsv(await store.load(id), input).map(({ index, fields, error }) =>
        fields ? { index, status: fields.status, date: fields.scheduleDate, accounts: fields.accountIds.length } : { index, error }) });
      if (op === 'invite') {
        if (input.action === 'status') {
          const invite = (await socialRow(`social-${id}`)).invite;
          return json({ expires: invite?.expires > Date.now() ? invite.expires : null });
        }
        if (input.action === 'revoke') {
          await socialSecrets(id, row => { delete row.invite; });
          return json({ expires: null });
        }
        if (input.action !== 'create' || ![1, 24, 72, 168].includes(input.hours)) throw error('Escolha um prazo para o convite.',400);
        const token = (uid() + uid()).replaceAll('-', ''), expires = Date.now() + input.hours * 3_600_000;
        await socialSecrets(id, row => { row.invite = { hash: hash(token), expires }; });
        return json({ url: `${publicBase(req)}/social-connect/${id}#${token}`, expires });
      }
      if (op === 'interactions' || op === 'incoming-interaction') {
        const result = await change(id, { type: 'social-interaction-trigger', data: input }, who);
        return json({ ok: true, ...(typeof result?.id === 'object' ? result.id : { result: result?.id }) });
      }
      if (op === 'approval-link') {
        const current = (await socialRow(`social-${id}`)).approval;
        if (input.action === 'status') return json({ expires: current?.expires > Date.now() ? current.expires : null });
        if (input.action === 'revoke') {
          await socialSecrets(id, row => { delete row.approval; });
          return json({ expires: null });
        }
        if (input.action === 'send-whatsapp') {
          const rawPhone = String(input.phone || '').trim();
          if (!rawPhone) throw error('Informe o número de WhatsApp para envio.', 400);
          const hours = [24, 72, 168, 720].includes(Number(input.hours)) ? Number(input.hours) : 168;
          let token = '';
          let expires = current?.expires > Date.now() ? current.expires : 0;
          if (!expires || !input.url) {
            token = (uid() + uid()).replaceAll('-', '');
            expires = Date.now() + hours * 3_600_000;
            await socialSecrets(id, row => { row.approval = { hash: hash(token), expires }; });
          }
          const approvalUrl = token ? `${publicBase(req)}/aprovar/${id}#${token}` : input.url;
          const state = await store.load(id);
          const pending = state.socialPosts.filter(p => p.status === 'in_review').length;
          const brand = state.profile?.name || '';
          const defaultMsg = `Olá! ${pending ? `Há ${pending} post(s)` : 'Os próximos posts'}${brand ? ` da marca *${brand}*` : ''} aguardando sua aprovação.\n\nRevise, aprove ou solicite ajustes com um comentário por este link:\n${approvalUrl}`;
          const message = String(input.message || '').trim() || defaultMsg;
          const agencyId = state.agencyId || who.agencyId || AGENCY_ID;
          const sent = await whatsapp.sendWorkspaceText(
            agencyId, id, rawPhone, message,
            (agId, ws) => accountIsActive(agId, ws, 'conversations')
          ).catch(err => {
            throw error(err.message || 'Erro ao enviar pelo WhatsApp.', err.status || 502);
          });
          if (!sent?.sent) {
            if (sent?.reason === 'not-connected') throw error('O WhatsApp desta subconta não está conectado. Conecte em Conversas para disparar.', 400);
            if (sent?.reason === 'invalid-phone') throw error('Número de WhatsApp inválido. Digite com DDD (ex.: 11999999999).', 400);
            throw error('Não foi possível enviar a mensagem por WhatsApp.', 502);
          }
          return json({ ok: true, sent: true, phone: rawPhone, expires, url: approvalUrl });
        }
        if (input.action !== 'create' || ![24, 72, 168, 720].includes(input.hours)) throw error('Escolha um prazo para o link de aprovação.',400);
        const token = (uid() + uid()).replaceAll('-', ''), expires = Date.now() + input.hours * 3_600_000;
        await socialSecrets(id, row => { row.approval = { hash: hash(token), expires }; });
        return json({ url: `${publicBase(req)}/aprovar/${id}#${token}`, expires });
      }
      if (op === 'ai') {
        captionRequest(input);
        input.voice = await brandVoiceOf(id);
        const status = who.session ? await openAI.status(who.session) : { configured: false };
        if (!status.configured) throw error('Conecte a OpenAI em Visão da agência → Configurações → OpenAI para gerar legendas com IA.',409);
        return json(await meteredAI(who, id, 'social', connection => content.writeCaption(connection, input)));
      }
      const withState = async extra => {
        const state = await store.load(id);
        return json({ ...workspaceView(who, state), ...extra });
      };
      if (op === 'candidates' || op === 'attach') {
        const row = await socialRow(`social-${id}`), pending = row.pending[String(input.requestId || '')];
        if (!pending || pending.inviteKey || pending.actor !== socialActor(who) ||
            Date.parse(pending.at) < Date.now() - 30 * 60_000) throw error('Esta autorização expirou. Conecte a conta de novo.',404);
        const candidates = unseal(pending.candidates) || [];
        if (op === 'candidates') {
          const state = await store.load(id);
          return json({ provider: pending.provider, candidates: candidates.map((c, index) => ({ index, provider: c.provider, name: c.name, handle: c.handle || '', avatar: c.avatar || '', kind: c.kind || '',
            connected: state.socialAccounts.some(a => a.provider === c.provider && a.externalId === c.externalId) })) });
        }
        const picks = [...new Set((Array.isArray(input.picks) ? input.picks : []).map(Number))].filter(n => candidates[n]);
        if (!picks.length) throw error('Escolha ao menos uma conta.',400);
        const chosen = picks.map(n => candidates[n]);
        const ids = await store.change(id, s => attachAccounts(s, chosen, { uid, now: stamp }));
        await socialSecrets(id, r => { ids.forEach((accountId, n) => { r.tokens[accountId] = seal(chosen[n].secret); }); delete r.pending[input.requestId]; });
        if (chosen.some(row => ['facebook', 'instagram'].includes(row.provider))) await routeMetaAccounts(id).catch(problem => console.error(`Meta routes (${id}): ${problem.message}`));
        return withState({ id: ids });
      }
      if (op === 'bluesky') {
        const [found] = await blueskyLogin(input.identifier, input.password);
        const [accountId] = await store.change(id, s => attachAccounts(s, [found], { uid, now: stamp }));
        await socialSecrets(id, r => { r.tokens[accountId] = seal(found.secret); });
        return withState({ id: accountId });
      }
      if (op === 'run') { const published = await runSocial(id, publicBase(req)); return withState({ published }); }
      if (op === 'disconnect') {
        await change(id, { type: 'social-account-remove', id: String(input.id || '') });
        await socialSecrets(id, r => { delete r.tokens[input.id]; });
        await routeMetaAccounts(id).catch(problem => console.error(`Meta routes (${id}): ${problem.message}`));
        return withState({});
      }
      throw error('Unknown social request.',404);
    }
    return NEXT_ROUTE;
  };
}
