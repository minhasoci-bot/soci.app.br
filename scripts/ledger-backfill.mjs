// Importa para o livro da cobrança o que existia antes dele: transações, planos pagos e o extrato das carteiras.
//   node scripts/ledger-backfill.mjs            só conta (não grava nada)
//   node scripts/ledger-backfill.mjs --apply    grava
// Pode rodar de novo: cada fato tem a mesma chave sempre. O que já tinha sido cortado dos extratos não volta.
// Rode depois do primeiro dia com o livro no ar: o consumo do dia do deploy só entra no dia seguinte.
import { pathToFileURL } from 'node:url';
import { hydrateAgency } from '../agency-model.mjs';
import { createLedgerFlush, isAgencyRow } from '../ledger-flush.mjs';
import { importTransaction, postFact, cents } from '../ledger-model.mjs';
import { importWallet } from '../wallet-model.mjs';
import { isDocument, supabaseFromEnv } from '../storage.mjs';

/** Queues what the workspace had before the ledger. Returns how many facts. */
export function importWorkspace(s, at = Date.now()) {
  const before = s.ledgerOutbox?.length || 0;
  for (const row of s.transactions || []) importTransaction(s, row);
  importWallet(s, at);
  return (s.ledgerOutbox?.length || 0) - before;
}

/** Queues the plan payments the agency had before the ledger. */
export function importAgency(agency) {
  const before = agency.ledgerOutbox?.length || 0;
  for (const [workspaceId, meta] of Object.entries(agency.accounts || {})) {
    for (const billing of meta?.billing ? [meta.billing, ...(meta.billing.previous || [])] : []) {
      if (billing.devMode) continue;
      for (const payment of billing.payments || []) {
        if (payment.test || payment.booked || !(payment.amount > 0)) continue;
        payment.booked = true;
        postFact(agency, { layer: 'agency', kind: 'plan_payment', key: `plan:abacatepay:${payment.id || `${billing.checkoutId}:${payment.at}`}`, workspaceId, amountCents: cents(payment.amount), method: billing.method || '',
          provider: 'abacatepay', ref: payment.id || billing.checkoutId, source: { type: 'plan', id: billing.planId || '' }, at: payment.at, detail: { plan: billing.planName || '', imported: true } });
      }
    }
  }
  return (agency.ledgerOutbox?.length || 0) - before;
}

export async function backfill({ store, dryRun = true, log = console.log }) {
  const flush = createLedgerFlush({ store, log });
  const report = { accounts: 0, facts: 0, skipped: [] };
  for (const { id } of await store.list()) {
    const agency = isAgencyRow(id);
    if (!agency && isDocument(id)) continue;
    try {
      const run = state => agency ? importAgency(hydrateAgency(state)) : importWorkspace(state);
      const facts = run(structuredClone(await store.load(id)));
      if (facts && !dryRun) await store.change(id, state => { run(state); });
      if (!dryRun) await flush.any(id);
      report.accounts++;
      report.facts += facts;
      if (facts) log(`${id}: ${facts} fato(s)${dryRun ? ' a importar' : ' importado(s)'}`);
    } catch (error) {
      report.skipped.push(id);
      log(`${id}: não importada (${error.message})`);
    }
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const store = supabaseFromEnv();
  if (!store) throw new Error('Defina SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY e GO_STORAGE_KEY.');
  const dryRun = !process.argv.includes('--apply');
  const report = await backfill({ store, dryRun });
  console.log(`${dryRun ? 'Simulação' : 'Importação'}: ${report.accounts} conta(s), ${report.facts} fato(s), ${report.skipped.length} com erro.`);
}
