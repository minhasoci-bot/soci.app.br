// Rotas da cobrança (/api/billing): o livro da agência e o de cada subconta (lista e CSV), e pagar e reativar a subconta
// pausada por plano não pago. Quem é a agência, a subconta e a camada do livro vem da sessão, nunca do navegador.
// Recebe do servidor o que vive no fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { accountLifecycle, canReactivate, replaceBilling } from '../agency-model.mjs';
import { ledgerCsv, ledgerPeriod, ledgerRow, ledgerTotals } from '../ledger-report.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

const PAGE = 100, MAX_ROWS = 20_000;

export function createBillingRoutes(deps) {
  const { abacate, accessContext, verifiedUser, canOpen, changeAgency, recordAudit, error, pausedError, publicBase, retryPolicyOf, spaceId,
    store, access, requireCapability, workspaceAccess, listWorkspaces } = deps;

  async function reactivate({ req, res, method, id, json }) {
    if (method !== 'POST') throw error('Method not allowed.', 405);
    const { agency, who } = await accessContext(req, await verifiedUser(req, res));
    if (!spaceId.test(id) || !await canOpen(who, id)) throw error('Your user cannot open this sub-account.', 403);
    const lifecycle = accountLifecycle(agency, id), meta = agency.accounts[id];
    if (lifecycle.status === 'Active') throw error('Esta subconta já está ativa.', 409);
    if (!canReactivate(agency, id, who)) throw pausedError(lifecycle);
    const plan = agency.plans.find(row => row.id === meta.plan);
    if (!plan || !await abacate.connected(who.agencyId, abacate.AGENCY_SCOPE)) throw error('Não foi possível gerar o pagamento. Fale com a sua agência.', 409);
    const pendingOf = state => { const b = state.accounts[id]?.billing; return b?.status === 'Pending' && b.url && b.planId === plan.id && b.amount === plan.price ? b : null; };
    if (pendingOf(agency)) return json({ url: pendingOf(agency).url });
    const billing = await abacate.subscribe(who.agencyId, id, plan, publicBase(req), { trial: false, retryPolicy: retryPolicyOf(agency) });
    // Two clicks at once: only the first link is kept and shown, so nobody pays twice.
    const kept = await changeAgency(who.agencyId, current => { const other = pendingOf(current); if (other) return other.url; replaceBilling(current, id, billing); return billing.url; });
    await recordAudit(who, 'Pagamento de reativação gerado', meta.name || id, billing.planName);
    return json({ url: kept });
  }

  async function read(query) {
    try { return await store.ledgerList(query); }
    catch (e) { if (e?.code === 'ledger_unavailable') throw error('O livro ainda não está disponível neste banco de dados.', 503); throw e; }
  }
  // Totals and the file cover the whole period; a period too large is refused instead of cut.
  async function readAll(query) {
    const rows = [];
    for (let after = ''; ;) {
      const page = await read({ ...query, limit: 1000, after });
      rows.push(...page.rows);
      if (rows.length > MAX_ROWS) throw error('São muitos lançamentos. Reduza o período.', 400);
      if (!page.next) return rows;
      after = page.next;
    }
  }
  async function scopeOf({ req, res, p, url, id }) {
    if (p.startsWith('/api/billing/agency-ledger')) {
      const who = await access(req, res);
      requireCapability(who, 'settings', 'Seu usuário não pode ver o livro da agência.');
      const agency = await store.load(who.agencyId), owned = await listWorkspaces(who.agencyId), account = url.searchParams.get('account') || '';
      if (account && !owned.some(w => w.id === account)) throw error('Subconta não encontrada.', 404);
      return { base: { layer: 'agency', agencyId: who.agencyId, ...(account && { workspaceId: account }) }, timezone: agency.company?.timezone || 'America/Sao_Paulo', accounts: Object.fromEntries(owned.map(w => [w.id, w.name])), completeSince: agency.ledgerSince || '' };
    }
    const who = await workspaceAccess(req, res, id, { modules: ['payments'] });
    const state = await store.load(id);
    return { base: { layer: 'account', agencyId: who.agencyId, workspaceId: id }, timezone: state.profile?.timezone || 'America/Sao_Paulo', accounts: { [id]: state.profile?.name || '' }, completeSince: state.ledgerSince || '' };
  }
  async function ledger(ctx) {
    const { res, p, method, url, json } = ctx;
    if (method !== 'GET') throw error('Method not allowed.', 405);
    const { base, timezone, accounts, completeSince } = await scopeOf(ctx);
    const get = name => url.searchParams.get(name) || '', from = get('from'), to = get('to');
    const query = { ...base, ...ledgerPeriod({ from, to, kind: get('kind') }, timezone) };
    if (p.endsWith('.csv')) {
      const csv = ledgerCsv(await readAll(query), { timezone, accounts });
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="livro-${from}-a-${to}.csv"`, 'Cache-Control': 'private, no-store' });
      return res.end(csv);
    }
    const after = get('after').slice(0, 300);
    const page = await read({ ...query, limit: PAGE, after });
    return json({ rows: page.rows.map(row => ledgerRow(row, { timezone, accounts })), next: page.next, totals: ledgerTotals(await readAll(query)), completeSince });
  }

  return async function billingRoute(ctx) {
    if (/^\/api\/billing\/(agency-)?ledger(\.csv)?$/.test(ctx.p)) return ledger(ctx);
    if (ctx.p === '/api/billing/reactivate') return reactivate(ctx);
    return NEXT_ROUTE;
  };
}
