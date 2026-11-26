// Leituras do cron de cada minuto. Uma volta passa por todas as subcontas e cada tarefa (redes sociais, automações,
// campanhas, cobranças…) lia de novo o mesmo documento: onze vezes por subconta, por minuto, mesmo sem nada a fazer.
// Dentro de `run`, a primeira leitura serve para as tarefas decidirem se há trabalho, e vale por poucos segundos.
// Só para os documentos das subcontas passadas a `prime`: agência (permissões, conta ativa), segredos e conexões são
// sempre lidos de novo. Assim que este servidor grava um documento (em qualquer lugar, não só na volta), a cópia dele
// deixa de valer até o fim da volta: quem está trabalhando nele vê o banco. Quem grava sempre relê antes de gravar.
import { AsyncLocalStorage } from 'node:async_hooks';

/** How long a document read inside `run` can be used again. */
export const SCOPE_MS = 5000;

export function scopedReads(store, { clock = Date.now } = {}) {
  const scopes = new AsyncLocalStorage(), open = new Set();
  const written = id => { for (const scope of open) { scope.allowed.delete(id); scope.docs.delete(id); scope.list = null; } };
  const recent = kept => kept && clock() - kept.at < SCOPE_MS;
  async function writing(id, write) {
    written(id);
    try { return await write(); } finally { written(id); }
  }
  const scoped = {
    load(id) {
      const scope = scopes.getStore();
      if (!scope?.allowed.has(id)) return store.load(id);
      if (!recent(scope.docs.get(id))) {
        const kept = { at: clock(), value: Promise.resolve().then(() => store.load(id)) };
        scope.docs.set(id, kept);
        kept.value.catch(() => { if (scope.docs.get(id) === kept) scope.docs.delete(id); });
      }
      return scope.docs.get(id).value.then(state => structuredClone(state)); // each task gets its own copy
    },
    list(...args) {
      const scope = scopes.getStore();
      if (!scope || args.length) return store.list(...args);
      if (!recent(scope.list)) {
        const kept = { at: clock(), value: Promise.resolve().then(() => store.list()) };
        scope.list = kept;
        kept.value.catch(() => { if (scope.list === kept) scope.list = null; });
      }
      return scope.list.value.then(rows => structuredClone(rows));
    },
    change: (id, mutate) => open.size ? writing(id, () => store.change(id, mutate)) : store.change(id, mutate),
    insert: (id, state) => open.size ? writing(id, () => store.insert(id, state)) : store.insert(id, state),
    remove: id => open.size ? writing(id, () => store.remove(id)) : store.remove(id)
  };
  return {
    // The other methods (findAgency, tracking, audit, kind…) are the ones of the store itself.
    store: Object.assign(Object.create(store), scoped),
    async run(work) {
      const scope = { allowed: new Set(), docs: new Map(), list: null };
      open.add(scope);
      try { return await scopes.run(scope, work); }
      // What the round left running in the background reads the database again.
      finally { open.delete(scope); scope.allowed.clear(); scope.docs.clear(); }
    },
    /** Inside `run`: these documents may be read once; the ones that did not change come from the copies, in one request. */
    async prime(ids) {
      const scope = scopes.getStore();
      if (!scope) return;
      for (const id of ids) scope.allowed.add(id);
      if (!store.unchanged || !ids.length) return;
      const at = clock();
      for (const [id, state] of await store.unchanged(ids)) if (scope.allowed.has(id) && !scope.docs.has(id)) scope.docs.set(id, { at, value: Promise.resolve(state) });
    }
  };
}
