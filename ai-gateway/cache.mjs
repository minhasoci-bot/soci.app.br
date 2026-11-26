// Cache de respostas do gateway: memória do processo (LRU com TTL), sem Redis obrigatório.
// Na Vercel cada instância tem o seu; é um ganho oportunista, nunca uma garantia. A chave inclui a organização,
// então nada é compartilhado entre organizações. Só entra o que é determinístico e sem efeito externo:
// pedido marcado `cache: true`, sem ferramentas, sem streaming e com temperatura 0 (ou ausente em classificação).
import { createHash } from 'node:crypto';

export function cacheable(req) {
  return req.cache && !req.tools.length && !req.stream && !req.webSearch && (req.temperature === 0 || (req.temperature === undefined && ['classify', 'extract'].includes(req.task)));
}

export function cacheKey(req, ctx, routeId) {
  const material = JSON.stringify({
    org: ctx.org, plan: ctx.plan, feature: req.feature, mode: req.mode, route: routeId, version: req.promptVersion,
    messages: req.messages, schema: req.schema, max: req.maxOutputTokens, temperature: req.temperature ?? null, dataClass: req.dataClass
  });
  return createHash('sha256').update(material).digest('hex');
}

export function createMemoryCache({ max = 500, clock = Date.now } = {}) {
  const entries = new Map();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      if (entry.expires <= clock()) { entries.delete(key); return null; }
      entries.delete(key); entries.set(key, entry); // LRU: volta para o fim
      return structuredClone(entry.value);
    },
    set(key, value, ttlMs) {
      if (!(ttlMs > 0)) return;
      entries.delete(key);
      entries.set(key, { value: structuredClone(value), expires: clock() + ttlMs });
      while (entries.size > max) entries.delete(entries.keys().next().value);
    },
    /** Invalida tudo de uma organização (ou tudo, sem argumento). */
    clear(org) {
      if (!org) { entries.clear(); return; }
      for (const [key, entry] of entries) if (entry.value?.org === org) entries.delete(key);
    },
    size: () => entries.size
  };
}
