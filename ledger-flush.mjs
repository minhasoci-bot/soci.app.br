// Moves the facts queued in `ledgerOutbox` (ledger-model.mjs) to the append-only ledger table. The row is written
// first and the outbox is cleaned after, by key: a crash in between repeats the row, which the table ignores.
// The seller and the payer are copied into the row here, so later changes to their records do not rewrite the past.
const BATCH = 200;
export const isAgencyRow = id => id === 'agency' || /^agency-/.test(id);
const party = (fiscal, name) => ({ name: fiscal?.name || name || '', taxId: fiscal?.taxId || '' });

export function createLedgerFlush({ store, log = console.warn }) {
  const running = new Map();
  const loadOr = async (id, fallback) => { try { return await store.load(id); } catch (error) { if (error?.status === 404) return fallback; throw error; } };
  const sellerAgency = agency => party(agency?.fiscal, agency?.company?.name);
  const account = state => party(state?.fiscal, state?.profile?.name);

  function rowOf(fact, owner, seller, payer) {
    return { key: `${owner.id}:${fact.key}`, layer: fact.layer, agency_id: owner.agencyId, workspace_id: owner.workspaceId, kind: fact.kind, amount_cents: fact.amountCents,
      fee_cents: fact.feeCents ?? null, usage_micros: fact.usageMicros ?? null, method: fact.method || '', provider: fact.provider || '', provider_ref: fact.ref || '',
      source: fact.source || {}, seller, payer, detail: fact.detail || {}, occurred_at: new Date(fact.at).toISOString() };
  }

  async function workspaceRows(id, state, facts) {
    const agencyId = state.agencyId || 'agency', owner = { id, agencyId, workspaceId: id };
    const agency = facts.some(fact => fact.layer === 'agency') ? await loadOr(agencyId, null) : null;
    return facts.map(fact => {
      if (fact.layer === 'agency') return rowOf(fact, owner, sellerAgency(agency), account(state));
      const contact = fact.contactId ? state.contacts?.find(row => row.id === fact.contactId) : null;
      return rowOf(fact, owner, account(state), { name: contact?.name || '', taxId: contact?.taxId || '' });
    });
  }
  async function agencyRows(id, agency, facts) {
    const payers = new Map();
    for (const fact of facts) if (fact.workspaceId && !payers.has(fact.workspaceId)) payers.set(fact.workspaceId, account(await loadOr(fact.workspaceId, null)));
    return facts.map(fact => rowOf(fact, { id, agencyId: id, workspaceId: fact.workspaceId || null }, sellerAgency(agency),
      payers.get(fact.workspaceId) || { name: agency.accounts?.[fact.workspaceId]?.name || '', taxId: '' }));
  }

  async function drain(id, rowsOf) {
    if (typeof store.ledgerAppend !== 'function') return 0;
    let sent = 0;
    for (;;) {
      const state = await store.load(id), facts = (state.ledgerOutbox || []).slice(0, BATCH);
      if (!facts.length) return sent;
      try { await store.ledgerAppend(await rowsOf(id, state, facts)); }
      catch (error) {
        if (error?.code !== 'ledger_unavailable') throw error;
        log(`Livro (${id}): tabela indisponível, ${state.ledgerOutbox.length} fato(s) aguardando.`);
        return sent;
      }
      const keys = new Set(facts.map(fact => fact.key));
      await store.change(id, current => { current.ledgerOutbox = (current.ledgerOutbox || []).filter(fact => !keys.has(fact.key)); });
      sent += facts.length;
    }
  }
  // One run per document at a time; a second call waits for the first and then looks again.
  function once(id, rowsOf) {
    const previous = running.get(id) || Promise.resolve();
    const run = previous.catch(() => {}).then(() => drain(id, rowsOf));
    running.set(id, run);
    const clean = () => { if (running.get(id) === run) running.delete(id); };
    run.then(clean, clean);
    return run;
  }
  return {
    workspace: id => once(id, workspaceRows),
    agency: id => once(id, agencyRows),
    any: id => once(id, isAgencyRow(id) ? agencyRows : workspaceRows)
  };
}

/** The same store, telling `later(id)` whenever a write leaves facts waiting in the document's outbox. */
export function watchLedger(store, later) {
  // The other methods come from the store itself (it may already be a wrapper with its own prototype).
  return Object.setPrototypeOf({ change: async (id, mutate) => {
    let waiting = false;
    const result = await store.change(id, state => { const out = mutate(state); waiting = Boolean(state.ledgerOutbox?.length); return out; });
    if (waiting) later(id);
    return result;
  } }, store);
}
