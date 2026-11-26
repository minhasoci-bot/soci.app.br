// Rotas de e-mail: o e-mail de teste de uma campanha (/api/email/campaign/test), o domínio de envio da subconta
// (/api/email/workspace/<op>: status, adicionar, verificar, salvar e remover) e o e-mail recebido pelo Resend (/api/email/inbound).
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { applyDomainStatus, emailDomainView, normalizeLocalPart } from '../email-domain.mjs';
import { inboundEmail, inboundWorkspace, svixValid } from '../email-inbound.mjs';
import { execute } from '../model.mjs';
import { mergeValues, normalizeDesign, renderEmail, fillText } from '../ui/email-blocks.js';
import { NEXT_ROUTE } from './next-route.mjs';

export function createEmailRoutes(deps) {
  const {
    store, ready, error, spaceId, privateSpace, stamp, campaignMail, emailDomainApi, flushLater, inboundFetch, payload, publicAccountPolicy, publicBase, recordAudit, sendingAddress, socialRow, testHits, workspaceAccess
  } = deps;
  return async function emailRoute({ req, res, p, method, id, json }) {
    if (p === '/api/email/campaign/test' && method === 'POST') {
      if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Workspace not found.', 404);
      const who = await workspaceAccess(req, res, id, { modules: ['marketing'] });
      const body = await payload(req);
      const to = String(body.to || '').trim().toLowerCase();
      if (!/^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z0-9-]{2,}$/i.test(to)) throw error('Informe um e-mail válido para o teste.', 400);
      const at = Date.now(), hits = (testHits.get(id) || []).filter(time => time > at - 3600_000);
      if (hits.length >= 20) throw error('Limite de 20 e-mails de teste por hora atingido. Tente mais tarde.', 429);
      testHits.set(id, [...hits, at]);
      const state = await store.load(id), design = normalizeDesign(body);
      if (!design.blocks.length) throw error('O e-mail está vazio.', 400);
      const contact = state.contacts.find(row => row.email) || { name: 'Ana Souza', email: to, company: 'Exemplo' };
      const values = mergeValues(contact, state.profile), business = state.profile?.name || '';
      const testOrigin = publicBase(req), sentAt = Math.floor(Date.now() / 1000);
      const { html, text } = renderEmail({ ...design, preheader: fillText(String(body.preheader || ''), values), business, values,
        countdownSrc: timerId => `${testOrigin}/cd/${id}/${timerId}.gif?s=${sentAt}` });
      await campaignMail.sendTest({ to, subject: fillText(String(body.subject || '').slice(0, 200), values) || '(sem assunto)', html, text,
        fromName: String(body.fromName || '').slice(0, 80) || business, replyTo: /^[^\s@<>"]+@[^\s@<>"]+$/.test(body.replyTo || '') ? body.replyTo : '', fromAddress: await sendingAddress(id) });
      await recordAudit(who, 'E-mail de teste enviado', to).catch(() => {});
      return json({ ok: true, to });
    }
    if (p.startsWith('/api/email/workspace/')) {
      if (!spaceId.test(id)) throw error('Subconta não encontrada.', 404);
      const op = p.slice('/api/email/workspace/'.length).replace(/\/+$/, '');
      const who = await workspaceAccess(req, res, id, { modules: ['settings'] });
      const rowId = `email-${id}`;
      // Sem domínio próprio, a subconta pode estar enviando pelo domínio dedicado da agência (White Label).
      const agencyAddress = await sendingAddress(id).catch(() => '');
      const view = row => { const shown = emailDomainView(row, { configured: emailDomainApi.configured, platformFrom: process.env.PORTAL_EMAIL_FROM || '' }); return { ...shown, agencyAddress: shown.sender ? '' : agencyAddress }; };
      // Copies Resend's view of the domain (status and per-record status) into the row.
      const refresh = async () => {
        const row = await socialRow(rowId), d = row.emailDomain;
        if (!d) return row;
        const live = await emailDomainApi.get(d.id);
        await store.change(rowId, r => { if (r.emailDomain?.id === d.id) r.emailDomain = applyDomainStatus(r.emailDomain, live, stamp()); });
        return store.load(rowId);
      };
      if (op === 'status' && method === 'GET') {
        const row = await socialRow(rowId);
        if (!row.emailDomain || row.emailDomain.status === 'verified' || !emailDomainApi.configured) return json(view(row));
        try { return json(view(await refresh())); } catch (e) { return json({ ...view(row), problem: e.message }); }
      }
      if (method !== 'POST') throw error('Method not allowed.', 405);
      const body = await payload(req);
      if (op === 'add') {
        if ((await socialRow(rowId)).emailDomain) throw error('Esta subconta já tem um domínio de envio. Remova o atual para trocar.', 409);
        const localPart = normalizeLocalPart(body.localPart ?? 'contato');
        const live = await emailDomainApi.add(body.domain);
        let clash = false;
        await store.change(rowId, r => {
          if (r.emailDomain) { clash = true; return; }
          r.emailDomain = { ...live, localPart, addedAt: stamp(), checkedAt: stamp(), verifiedAt: live.status === 'verified' ? stamp() : '' };
        });
        if (clash) { await emailDomainApi.remove(live.id).catch(() => {}); throw error('Esta subconta já tem um domínio de envio. Remova o atual para trocar.', 409); }
        await recordAudit(who, 'Domínio de envio adicionado', live.name).catch(() => {});
        return json(view(await store.load(rowId)));
      }
      if (op === 'verify') {
        const row = await socialRow(rowId);
        if (!row.emailDomain) throw error('Adicione um domínio de envio primeiro.', 409);
        await emailDomainApi.verify(row.emailDomain.id);
        return json(view(await refresh()));
      }
      if (op === 'save') {
        const localPart = normalizeLocalPart(body.localPart);
        await socialRow(rowId);
        await store.change(rowId, r => {
          if (!r.emailDomain) throw error('Adicione um domínio de envio primeiro.', 409);
          r.emailDomain.localPart = localPart;
        });
        return json(view(await store.load(rowId)));
      }
      if (op === 'remove') {
        const row = await socialRow(rowId);
        if (row.emailDomain) {
          await emailDomainApi.remove(row.emailDomain.id);
          await store.change(rowId, r => { delete r.emailDomain; });
          await recordAudit(who, 'Domínio de envio removido', row.emailDomain.name).catch(() => {});
        }
        return json(view(await store.load(rowId)));
      }
      throw error('Not found.', 404);
    }
    // E-mail recebido: Resend's "email.received" for conversas+<subconta>@INBOUND_EMAIL_DOMAIN (Svix-signed).
    if (p === '/api/email/inbound' && method === 'POST') {
      await ready;
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 2_000_000) throw error('Payload too large.', 413); chunks.push(chunk); }
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!svixValid(raw, req.headers, process.env.RESEND_INBOUND_SECRET || '')) throw error('Invalid signature.', 401);
      let event;
      try { event = JSON.parse(raw); } catch { throw error('Invalid JSON.', 400); }
      const workspace = inboundWorkspace(event?.data?.to);
      if (!workspace || privateSpace.test(workspace)) return json({ ok: true, ignored: true });
      if (!await publicAccountPolicy(workspace, false, 'conversations').catch(() => false)) return json({ ok: true, ignored: true });
      const email = await inboundEmail(event, { request: inboundFetch });
      if (!email) return json({ ok: true, ignored: true });
      await store.change(workspace, s => execute(s, { type: 'email-inbound', data: { id: email.id, email: email.from.email, name: email.from.name, subject: email.subject, body: email.body } }, { workspace }));
      flushLater(workspace);
      return json({ ok: true });
    }
    return NEXT_ROUTE;
  };
}
