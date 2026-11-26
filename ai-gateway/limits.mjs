// Estado de execução do gateway ('platform-ai-runtime'): cotas, circuit breaker, cooldown, concorrência e orçamento.
// Funções puras sobre o documento; quem chama faz tudo dentro de store.change (compare-and-swap por revisão),
// então reservar cota e orçamento é atômico entre instâncias: duas requisições nunca gastam a mesma folga.

const LEASE_MS = 5 * 60_000;           // concorrência: uma vaga esquecida expira sozinha
const RESERVATION_MS = 10 * 60_000;    // orçamento: reserva sem conciliação expira (a tentativa morreu)
// Sem limites informados para um provedor gratuito, o gateway se segura nestes (conservador).
export const CONSERVATIVE_FREE_LIMITS = Object.freeze({ rpm: 10, rpd: 500, tpm: 0, tpd: 0 });

export function blankRuntime() {
  return { health: {}, models: {}, quota: {}, cooldown: {}, concurrency: {}, budget: blankBudget(), orgDaily: {}, alerts: [] };
}
const blankBudget = () => ({ day: '', dayMicros: 0, month: '', monthMicros: 0, reserved: {}, orgs: {}, features: {}, providers: {} });

export function withRuntimeDefaults(saved = {}) {
  const base = blankRuntime();
  return { ...base, ...saved, budget: { ...base.budget, ...saved.budget } };
}

export function windowsOf(now) {
  const iso = new Date(now).toISOString();
  return { minute: iso.slice(0, 16), day: iso.slice(0, 10), month: iso.slice(0, 7) };
}

function roll(entry, now) {
  const w = windowsOf(now);
  if (entry.minute !== w.minute) { entry.minute = w.minute; entry.rpm = 0; entry.tpm = 0; }
  if (entry.day !== w.day) { entry.day = w.day; entry.rpd = 0; entry.tpd = 0; }
  if (entry.month !== w.month) { entry.month = w.month; entry.tokensMonth = 0; }
  return entry;
}
const quotaEntry = (runtime, scope, now) => {
  if (!runtime.quota[scope]) runtime.quota[scope] = { minute: '', rpm: 0, tpm: 0, day: '', rpd: 0, tpd: 0, month: '', tokensMonth: 0, remote: null };
  return roll(runtime.quota[scope], now);
};

/**
 * Cabe mais uma requisição de `tokens` estimados neste escopo? `limits` com 0 = desconhecido.
 * Devolve { ok: true } ou { ok: false, reason, retryAfterMs }.
 */
export function quotaCheck(runtime, scope, limits, tokens, now) {
  const until = runtime.cooldown[scope] || 0;
  if (until > now) return { ok: false, reason: 'cooldown', retryAfterMs: until - now };
  const entry = quotaEntry(runtime, scope, now);
  const over = (used, limit, add) => limit > 0 && used + add > limit;
  if (over(entry.rpm, limits.rpm, 1)) return { ok: false, reason: 'rpm', retryAfterMs: 60_000 - (now % 60_000) };
  if (over(entry.tpm, limits.tpm, tokens)) return { ok: false, reason: 'tpm', retryAfterMs: 60_000 - (now % 60_000) };
  if (over(entry.rpd, limits.rpd, 1)) return { ok: false, reason: 'rpd', retryAfterMs: msToNextDay(now) };
  if (over(entry.tpd, limits.tpd, tokens)) return { ok: false, reason: 'tpd', retryAfterMs: msToNextDay(now) };
  if (over(entry.tokensMonth, limits.tokensMonth, tokens)) return { ok: false, reason: 'tokensMonth', retryAfterMs: null };
  const remote = entry.remote;
  if (remote && remote.remainingRequests === 0 && (remote.resetRequestsAt || 0) > now) return { ok: false, reason: 'remote-requests', retryAfterMs: remote.resetRequestsAt - now };
  if (remote && remote.remainingTokens !== null && remote.remainingTokens !== undefined && remote.remainingTokens < tokens && (remote.resetTokensAt || 0) > now) {
    return { ok: false, reason: 'remote-tokens', retryAfterMs: remote.resetTokensAt - now };
  }
  return { ok: true };
}
const msToNextDay = now => 86_400_000 - (now % 86_400_000);

export function quotaConsume(runtime, scope, tokens, now) {
  const entry = quotaEntry(runtime, scope, now);
  entry.rpm += 1; entry.rpd += 1; entry.tpm += tokens; entry.tpd += tokens; entry.tokensMonth += tokens;
}

/** Troca a estimativa pelo uso real (só dentro das mesmas janelas; janela nova já começou zerada). */
export function quotaReconcile(runtime, scope, estimated, actual, reservedAt, now) {
  const entry = quotaEntry(runtime, scope, now);
  const then = windowsOf(reservedAt), w = windowsOf(now);
  const delta = actual - estimated;
  if (then.minute === w.minute) entry.tpm = Math.max(0, entry.tpm + delta);
  if (then.day === w.day) entry.tpd = Math.max(0, entry.tpd + delta);
  if (then.month === w.month) entry.tokensMonth = Math.max(0, entry.tokensMonth + delta);
}

/**
 * Guarda o que o provedor contou (cabeçalhos de limite). Groq: "requests" é por DIA e "tokens" por MINUTO.
 */
export function applyRemoteLimits(runtime, scope, rateLimit, now) {
  if (!rateLimit) return;
  const entry = quotaEntry(runtime, scope, now);
  entry.remote = {
    remainingRequests: rateLimit.remainingRequests, remainingTokens: rateLimit.remainingTokens,
    limitRequests: rateLimit.limitRequests, limitTokens: rateLimit.limitTokens,
    resetRequestsAt: rateLimit.resetRequestsMs !== null ? now + rateLimit.resetRequestsMs : null,
    resetTokensAt: rateLimit.resetTokensMs !== null ? now + rateLimit.resetTokensMs : null, at: now
  };
}

export function setCooldown(runtime, scope, ms, now) {
  if (!(ms > 0)) return;
  runtime.cooldown[scope] = Math.max(runtime.cooldown[scope] || 0, now + Math.min(ms, 86_400_000));
}

// ---------- Circuit breaker por provedor ----------
const healthOf = (runtime, provider) => runtime.health[provider] ||= { state: 'closed', failures: 0, openedUntil: 0, lastError: '', lastErrorAt: 0, lastOkAt: 0, latencyMs: null, successRate: 1, calls: 0, probing: 0 };

/** O circuito deixa passar? Aberto e vencido vira meio-aberto: deixa UMA sonda por vez. */
export function breakerAllows(runtime, provider, now) {
  const health = healthOf(runtime, provider);
  if (health.state === 'closed') return true;
  if (health.state === 'open' && now >= health.openedUntil) { health.state = 'half'; health.probing = 0; }
  if (health.state === 'half' && (!health.probing || now - health.probing > 60_000)) { health.probing = now; return true; }
  return false;
}

export function breakerRecord(runtime, provider, { ok, kind = '', latencyMs = null, countsAsFailure = false }, settings, now) {
  const health = healthOf(runtime, provider);
  health.calls += 1;
  health.successRate = Math.round((health.successRate * 0.9 + (ok ? 0.1 : 0)) * 1000) / 1000;
  if (latencyMs !== null && ok) health.latencyMs = health.latencyMs === null ? latencyMs : Math.round(health.latencyMs * 0.8 + latencyMs * 0.2);
  if (ok) { Object.assign(health, { state: 'closed', failures: 0, lastOkAt: now, probing: 0 }); return health; }
  health.lastError = kind; health.lastErrorAt = now;
  if (!countsAsFailure) return health;
  health.failures += 1;
  if (health.state === 'half' || health.failures >= settings.failures) Object.assign(health, { state: 'open', openedUntil: now + settings.cooldownMs, probing: 0 });
  return health;
}

export function observeModel(runtime, key, { ok, latencyMs }) {
  if (!runtime.models[key]) runtime.models[key] = { latencyMs: null, successRate: 1, calls: 0 };
  const model = runtime.models[key];
  model.calls += 1;
  model.successRate = Math.round((model.successRate * 0.9 + (ok ? 0.1 : 0)) * 1000) / 1000;
  if (ok && latencyMs !== null) model.latencyMs = model.latencyMs === null ? latencyMs : Math.round(model.latencyMs * 0.8 + latencyMs * 0.2);
}

// ---------- Concorrência ----------
export function acquire(runtime, scope, max, leaseId, now) {
  if (!runtime.concurrency[scope]) runtime.concurrency[scope] = {};
  const leases = runtime.concurrency[scope];
  for (const [id, expires] of Object.entries(leases)) if (expires <= now) delete leases[id];
  if (max > 0 && Object.keys(leases).length >= max) return false;
  leases[leaseId] = now + LEASE_MS;
  return true;
}
export function release(runtime, scope, leaseId) {
  const leases = runtime.concurrency[scope];
  if (leases) { delete leases[leaseId]; if (!Object.keys(leases).length) delete runtime.concurrency[scope]; }
}

// ---------- Limite diário do plano por organização ----------
export function planDailyAllows(runtime, org, limit, now) {
  const { day } = windowsOf(now);
  const entry = runtime.orgDaily[org];
  const used = entry?.day === day ? entry.requests : 0;
  return !(limit > 0 && used >= limit);
}
export function planDailyCount(runtime, org, now) {
  const { day } = windowsOf(now);
  for (const [id, entry] of Object.entries(runtime.orgDaily)) if (entry.day !== day) delete runtime.orgDaily[id];
  if (!runtime.orgDaily[org]) runtime.orgDaily[org] = { day, requests: 0 };
  const entry = runtime.orgDaily[org];
  entry.requests += 1;
}

// ---------- Orçamento (gasto pago da plataforma) ----------
function rollBudget(budget, now) {
  const w = windowsOf(now);
  if (budget.day !== w.day) { budget.day = w.day; budget.dayMicros = 0; }
  if (budget.month !== w.month) { budget.month = w.month; budget.monthMicros = 0; budget.orgs = {}; budget.features = {}; budget.providers = {}; }
  for (const [id, item] of Object.entries(budget.reserved)) if (now - item.at > RESERVATION_MS) delete budget.reserved[id];
  return budget;
}
const reservedSum = (budget, match = () => true) => Object.values(budget.reserved).filter(match).reduce((sum, item) => sum + item.micros, 0);

/**
 * Reserva `micros` antes de uma chamada paga. Confere orçamento diário/mensal global, por organização, por
 * funcionalidade e por provedor (0 = sem orçamento = nada pago). Devolve { ok } ou { ok: false, reason }.
 */
export function budgetReserve(runtime, { id, micros, org, feature, provider }, limits, now) {
  const budget = rollBudget(runtime.budget, now);
  if (micros <= 0) return { ok: true };
  const checks = [
    ['daily', limits.dailyMicros, budget.dayMicros + reservedSum(budget)],
    ['monthly', limits.monthlyMicros, budget.monthMicros + reservedSum(budget)],
    ['org', limits.perOrgMonthlyMicros, (budget.orgs[org] || 0) + reservedSum(budget, item => item.org === org)],
    ['feature', limits.featureMonthlyMicros, (budget.features[feature] || 0) + reservedSum(budget, item => item.feature === feature)],
    ['provider', limits.providerMonthlyMicros, (budget.providers[provider] || 0) + reservedSum(budget, item => item.provider === provider)]
  ];
  for (const [reason, limit, used] of checks) {
    // Orçamento global zerado = nenhum gasto pago autorizado. Os outros limites com 0 = sem limite extra.
    if ((reason === 'monthly' || reason === 'daily') && !(limit > 0)) return { ok: false, reason: `${reason}-unset` };
    if (limit > 0 && used + micros > limit) return { ok: false, reason };
  }
  budget.reserved[id] = { micros, at: now, org, feature, provider };
  return { ok: true };
}

/** Concilia: tira a reserva e lança o custo real (inclusive de tentativa que falhou, quando o provedor cobrou). */
export function budgetSettle(runtime, { id, micros, org, feature, provider }, now) {
  const budget = rollBudget(runtime.budget, now);
  delete budget.reserved[id];
  if (!(micros > 0)) return;
  budget.dayMicros += micros; budget.monthMicros += micros;
  budget.orgs[org] = (budget.orgs[org] || 0) + micros;
  budget.features[feature] = (budget.features[feature] || 0) + micros;
  budget.providers[provider] = (budget.providers[provider] || 0) + micros;
}

export function budgetView(runtime, now) {
  const budget = rollBudget(runtime.budget, now);
  return { day: budget.day, dayMicros: budget.dayMicros, month: budget.month, monthMicros: budget.monthMicros, reservedMicros: reservedSum(budget), providers: { ...budget.providers }, features: { ...budget.features } };
}
