// Página Plataforma: lê plano e uso de cada serviço externo. Um coletor por serviço, `request` injetado.
// Nenhum token sai daqui: erros viram textos curtos ("HTTP 401", "tempo esgotado"), sem URL nem cabeçalho.
import { PLAN_LIMITS } from './platform-limits.mjs';
import { dayMonth } from './ui/platform-format.js';

const MiB = 1024 * 1024, DAY = 86_400_000;
const HOSTINGER = 'https://developers.hostinger.com';
const CLASS_B = new Set(['HeadBucket', 'HeadObject', 'GetObject', 'UsageSummary', 'GetBucketEncryption', 'GetBucketLocation', 'GetBucketCors', 'GetBucketLifecycleConfiguration']);
const FREE_OPS = new Set(['DeleteObject', 'DeleteBucket', 'AbortMultipartUpload']);

class ProviderError extends Error {}
class TimeoutError extends ProviderError { constructor() { super('tempo esgotado'); } }

const reading = (service, name, fields) => ({ service, name, status: 'ok', plan: '', link: '', metrics: [], ...fields });
const notConfigured = (service, name, link = '') => reading(service, name, { status: 'not-configured', link });
const metric = (key, label, used, limit, unit, cycle, extra = {}) => ({ key, label, used, limit, unit, cycle, ...extra });
const failed = (service, name, problem) => ({ ...reading(service, name, { status: 'error' }), error: problem instanceof ProviderError ? problem.message : 'falha na leitura' });
/** Um coletor que nunca lança: qualquer falha vira a leitura de erro daquele serviço. */
const guarded = (service, name, collect) => async context => {
  try { return await collect(context); } catch (problem) { return failed(service, name, problem); }
};

/** GET/POST com tempo máximo; qualquer resposta que não seja 2xx vira "HTTP <status>". */
async function fetchJson(request, url, options, timeoutMs) {
  let response;
  try {
    response = await request(url, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs), ...options });
  } catch (problem) {
    if (problem?.name === 'TimeoutError' || problem?.name === 'AbortError') throw new TimeoutError();
    throw new ProviderError('sem conexão');
  }
  if (!response.ok) throw new ProviderError(`HTTP ${response.status}`);
  try { return await response.json(); } catch { throw new ProviderError('resposta inválida'); }
}

export const collectSupabase = guarded('supabase', 'Supabase', async function collectSupabase({ env, store, settings }) {
  const ref = URL.parse(env.SUPABASE_URL || '')?.hostname.split('.')[0] || '';
  const link = ref ? `https://supabase.com/dashboard/project/${ref}/settings/billing/usage` : 'https://supabase.com/dashboard';
  if (typeof store?.platformUsage !== 'function') return notConfigured('supabase', 'Supabase', link);
  const plan = PLAN_LIMITS.supabase[settings.plans?.supabase] ? settings.plans.supabase : 'free';
  const limits = PLAN_LIMITS.supabase[plan];
  const usage = await store.platformUsage();
  return reading('supabase', 'Supabase', { plan, link, metrics: [
    metric('db', 'Banco', usage.db_bytes ?? null, limits.db, 'bytes', 'total'),
    metric('storage', 'Storage', usage.storage_bytes ?? null, limits.storage, 'bytes', 'total'),
    metric('mau', 'Ativos no mês', usage.mau ?? null, limits.mau, 'count', 'month'),
    metric('egress', 'Tráfego (egress)', null, null, 'bytes', 'month', { note: 'a API não informa' })
  ] });
});

export const collectVercel = guarded('vercel', 'Vercel', async function collectVercel({ env, request, settings, now, timeoutMs = 8000 }) {
  const token = env.VERCEL_API_TOKEN, team = env.VERCEL_TEAM_ID;
  if (!token || !team) return notConfigured('vercel', 'Vercel', 'https://vercel.com/dashboard');
  const headers = { Authorization: `Bearer ${token}` };
  const info = await fetchJson(request, `https://api.vercel.com/v2/teams/${encodeURIComponent(team)}`, { headers }, timeoutMs);
  const detected = String(info?.billing?.plan || '').toLowerCase();
  const plan = PLAN_LIMITS.vercel[detected] ? detected : PLAN_LIMITS.vercel[settings.plans?.vercel] ? settings.plans.vercel : 'hobby';
  const since = now - DAY;
  let count = 0, until = null;
  for (let page = 0; page < 100; page++) {
    const query = new URLSearchParams({ teamId: team, since: String(since), limit: '100', ...(until ? { until: String(until) } : {}) });
    const data = await fetchJson(request, `https://api.vercel.com/v6/deployments?${query}`, { headers }, timeoutMs);
    count += (data.deployments || []).length;
    until = data.pagination?.next;
    if (!until) break;
  }
  return reading('vercel', 'Vercel', {
    plan, link: info?.slug ? `https://vercel.com/${info.slug}/~/usage` : 'https://vercel.com/dashboard',
    metrics: [metric('deploys24h', 'Deploys em 24 h', count, PLAN_LIMITS.vercel[plan].deploys24h, 'count', 'day24h')]
  });
});

const R2_QUERY = `query($account: String!, $since: Time!, $monthStart: Time!, $now: Time!) {
  viewer { accounts(filter: { accountTag: $account }) {
    storage: r2StorageAdaptiveGroups(limit: 1000, filter: { datetime_geq: $since, datetime_leq: $now }) { dimensions { bucketName } max { payloadSize metadataSize } }
    operations: r2OperationsAdaptiveGroups(limit: 1000, filter: { datetime_geq: $monthStart, datetime_leq: $now }) { dimensions { actionType } sum { requests } }
  } }
}`;

export const collectCloudflare = guarded('cloudflare', 'Cloudflare R2', async function collectCloudflare({ env, request, now, timeoutMs = 8000 }) {
  const token = env.CLOUDFLARE_API_TOKEN, account = env.R2_ACCOUNT_ID;
  if (!token || !account) return notConfigured('cloudflare', 'Cloudflare R2', 'https://dash.cloudflare.com/');
  const at = new Date(now);
  const variables = { account, since: new Date(now - DAY).toISOString(), monthStart: new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1)).toISOString(), now: at.toISOString() };
  const data = await fetchJson(request, 'https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: R2_QUERY, variables })
  }, timeoutMs);
  if (data?.errors?.length) throw new ProviderError(String(data.errors[0]?.message || 'erro no GraphQL').slice(0, 120));
  const found = data?.data?.viewer?.accounts?.[0];
  if (!found) throw new ProviderError('conta não encontrada');
  const stored = (found.storage || []).reduce((sum, row) => sum + Number(row.max?.payloadSize || 0) + Number(row.max?.metadataSize || 0), 0);
  let classA = 0, classB = 0;
  for (const row of found.operations || []) {
    const action = row.dimensions?.actionType, requests = Number(row.sum?.requests || 0);
    if (FREE_OPS.has(action)) continue;
    if (CLASS_B.has(action)) classB += requests; else classA += requests;
  }
  const limits = PLAN_LIMITS.cloudflare.free;
  return reading('cloudflare', 'Cloudflare R2', { plan: 'free', link: `https://dash.cloudflare.com/${account}/r2/overview`, metrics: [
    metric('r2Storage', 'Armazenamento', stored, limits.r2Storage, 'bytes', 'total'),
    metric('r2ClassA', 'Operações classe A', classA, limits.r2ClassA, 'count', 'month'),
    metric('r2ClassB', 'Operações classe B', classB, limits.r2ClassB, 'count', 'month')
  ] });
});

/** O valor mais recente de uma série { timestamp: valor } da Hostinger, ou a média. */
const latest = series => { const keys = Object.keys(series?.usage || {}); return keys.length ? Number(series.usage[keys.sort((a, b) => b - a)[0]]) : null; };
const average = series => { const values = Object.values(series?.usage || {}).map(Number); return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; };

export const collectHostinger = guarded('hostinger', 'Hostinger', async function collectHostinger({ env, request, now, timeoutMs = 8000 }) {
  const token = env.HOSTINGER_API_TOKEN;
  const link = 'https://hpanel.hostinger.com/vps';
  if (!token) return notConfigured('hostinger', 'Hostinger', link);
  const headers = { Authorization: `Bearer ${token}` };
  const machines = await fetchJson(request, `${HOSTINGER}/api/vps/v1/virtual-machines`, { headers }, timeoutMs);
  if (!Array.isArray(machines) || !machines.length) throw new ProviderError('nenhuma VPS na conta');
  const evolutionHost = URL.parse(env.EVOLUTION_BASE_URL || '')?.hostname || '';
  const vm = machines.find(m => evolutionHost && (m.hostname === evolutionHost || (m.ipv4 || []).some(ip => ip.address === evolutionHost))) || machines[0];
  const query = new URLSearchParams({ date_from: new Date(now - 6 * 3_600_000).toISOString(), date_to: new Date(now).toISOString() });
  const [usage, subscriptions] = await Promise.all([
    fetchJson(request, `${HOSTINGER}/api/vps/v1/virtual-machines/${vm.id}/metrics?${query}`, { headers }, timeoutMs),
    fetchJson(request, `${HOSTINGER}/api/billing/v1/subscriptions`, { headers }, timeoutMs)
  ]);
  const cpu = average(usage?.cpu_usage);
  const metrics = [
    metric('disk', 'Disco', latest(usage?.disk_space), vm.disk ? vm.disk * MiB : null, 'bytes', 'total'),
    metric('ram', 'Memória', latest(usage?.ram_usage), vm.memory ? vm.memory * MiB : null, 'bytes', 'now'),
    metric('cpu', 'CPU (média 6 h)', cpu === null ? null : Math.round(cpu * 10) / 10, 100, 'percent', 'now')
  ];
  let plan = vm.plan || '';
  const subscription = (Array.isArray(subscriptions) ? subscriptions : []).find(s => s.id === vm.subscription_id);
  const ends = Date.parse(subscription?.expires_at || '');
  if (subscription && Number.isFinite(ends)) {
    if (subscription.is_auto_renewed) plan += ` · renova sozinho em ${dayMonth(new Date(subscription.next_billing_at || subscription.expires_at).toISOString().slice(0, 10))}`;
    else metrics.push(metric('expires', 'Vence', Math.max(0, Math.floor((ends - now) / DAY)), 0, 'days', 'now', { kind: 'deadline' }));
  }
  return reading('hostinger', 'Hostinger', { plan, link, metrics });
});

export const collectEvolution = guarded('evolution', 'Evolution API', async function collectEvolution({ env, request, timeoutMs = 8000 }) {
  const base = String(env.EVOLUTION_BASE_URL || '').replace(/\/+$/, ''), key = env.EVOLUTION_API_KEY;
  if (!base || !key) return notConfigured('evolution', 'Evolution API');
  const instances = await fetchJson(request, `${base}/instance/fetchInstances`, { headers: { apikey: key } }, timeoutMs);
  return reading('evolution', 'Evolution API', { plan: 'VPS própria', link: base, metrics: [
    metric('instances', 'Instâncias', Array.isArray(instances) ? instances.length : null, null, 'count', 'now')
  ] });
});

export const collectTwilio = guarded('twilio', 'Twilio', async function collectTwilio({ env, request, settings, timeoutMs = 8000 }) {
  const sid = env.TWILIO_ACCOUNT_SID, secret = env.TWILIO_AUTH_TOKEN;
  const link = 'https://console.twilio.com/us1/billing/manage-billing/billing-overview';
  if (!sid || !secret) return notConfigured('twilio', 'Twilio', link);
  const data = await fetchJson(request, `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Balance.json`, {
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${secret}`).toString('base64')}` }
  }, timeoutMs);
  const balance = Number.parseFloat(data?.balance);
  return reading('twilio', 'Twilio', { plan: data?.currency ? `Saldo em ${data.currency}` : '', link, metrics: [
    metric('balance', 'Saldo', Number.isFinite(balance) ? balance : null, Number(settings.twilioMinUsd ?? 10), 'usd', 'now', { kind: 'floor' })
  ] });
});

const COLLECTORS = [
  ['supabase', 'Supabase', collectSupabase], ['vercel', 'Vercel', collectVercel], ['cloudflare', 'Cloudflare R2', collectCloudflare],
  ['hostinger', 'Hostinger', collectHostinger], ['evolution', 'Evolution API', collectEvolution], ['twilio', 'Twilio', collectTwilio]
];

/** Os 6 serviços em paralelo, cada um com tempo máximo. Uma falha vira `status: 'error'` só daquele serviço. */
export async function collectAll({ env, request, store, settings, now, timeoutMs = 8000 }) {
  const context = { env, request, store, settings, now, timeoutMs };
  return Promise.all(COLLECTORS.map(async ([service, name, collect]) => {
    let timer;
    const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new TimeoutError()), timeoutMs + 250); });
    try {
      return await Promise.race([collect(context), limit]);
    } catch (problem) {
      return failed(service, name, problem);
    } finally {
      clearTimeout(timer);
    }
  }));
}
