// Ad networks for the Ad Manager and the ads reports: Meta Marketing API and Google Ads API.
// Each sub-account connects its own ad account by OAuth. Tokens are sealed by the caller (server.mjs)
// and never reach the browser. Everything here takes a `secret` and returns plain data.
//
// Configuration (environment):
//   Meta:   META_APP_ID, META_APP_SECRET (same app as the Social Planner; needs ads_read/ads_management)
//   Google: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (the OAuth client's Cloud project needs the Google Ads API
//           enabled; its access level, Test/Explorer/Basic/Standard, is set in the Cloud console), optional
//           GOOGLE_ADS_LOGIN_CUSTOMER_ID (manager account) and GOOGLE_ADS_API_VERSION.
//   Developer tokens were retired by Google on 2026-09-09 and are not sent (future versions reject them).
import { metaObjectives } from './ui/ads-data.js';

const env = name => process.env[name] || '';
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const form = data => new URLSearchParams(Object.entries(data).filter(([, v]) => v !== undefined && v !== ''));
const graph = () => `https://graph.facebook.com/${env('META_GRAPH_VERSION') || 'v23.0'}`;
const gads = () => `https://googleads.googleapis.com/${env('GOOGLE_ADS_API_VERSION') || 'v26'}`;

let fetcher = (...args) => fetch(...args);
export const useAdsFetch = f => { fetcher = f; };

async function call(url, { method = 'GET', token, json, body, headers = {} } = {}) {
  const res = await fetcher(url, { method, body: json ? JSON.stringify(json) : body, signal: AbortSignal.timeout(60_000),
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json ? { 'Content-Type': 'application/json' } : {}), ...headers } });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text.slice(0, 300) }; }
  const err = Array.isArray(data) ? data[0]?.error : data.error;
  if (!res.ok || err) {
    const detail = err?.details?.[0]?.errors?.[0]?.message;
    const message = err?.error_user_msg || detail || err?.message || data.error_description || data.message || `HTTP ${res.status}`;
    const expired = res.status === 401 || err?.code === 190 || err?.status === 'UNAUTHENTICATED';
    throw Object.assign(new Error(String(message).slice(0, 400)), { status: expired ? 401 : res.status === 400 ? 400 : 502 });
  }
  return data;
}

export const adsConfigured = () => ({
  meta: Boolean(env('META_APP_ID') && env('META_APP_SECRET')),
  google: Boolean(env('GOOGLE_CLIENT_ID') && env('GOOGLE_CLIENT_SECRET'))
});
const statusOf = raw => ['ACTIVE', 'ENABLED'].includes(raw) ? 'active' : ['PAUSED'].includes(raw) ? 'paused' : 'other';

// ---- OAuth -----------------------------------------------------------------------------------------
export function adsAuthUrl(network, { redirectUri, state }) {
  if (!adsConfigured()[network]) fail(network === 'meta' ? 'O Meta Ads ainda não foi configurado nesta instalação (META_APP_ID e META_APP_SECRET).' : 'O Google Ads ainda não foi configurado nesta instalação (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET, com a Google Ads API ativada no projeto do Google Cloud).', 409);
  if (network === 'meta') return `https://www.facebook.com/${env('META_GRAPH_VERSION') || 'v23.0'}/dialog/oauth?` + form({ client_id: env('META_APP_ID'), redirect_uri: redirectUri, state, response_type: 'code',
    scope: 'ads_read,ads_management,business_management,pages_show_list,pages_read_engagement' });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + form({ client_id: env('GOOGLE_CLIENT_ID'), redirect_uri: redirectUri, response_type: 'code',
    scope: 'openid email https://www.googleapis.com/auth/adwords', access_type: 'offline', prompt: 'consent', state });
}

/** Finishes the OAuth round trip: the secret and the ad accounts (and, for Meta, the Pages) it can use. */
export async function adsExchange(network, { code, redirectUri }) {
  if (!code) fail('A rede não devolveu a autorização.', 400);
  if (network === 'meta') {
    const short = await call(`${graph()}/oauth/access_token?` + form({ client_id: env('META_APP_ID'), client_secret: env('META_APP_SECRET'), redirect_uri: redirectUri, code }));
    const long = await call(`${graph()}/oauth/access_token?` + form({ grant_type: 'fb_exchange_token', client_id: env('META_APP_ID'), client_secret: env('META_APP_SECRET'), fb_exchange_token: short.access_token }));
    const secret = { token: long.access_token, expiresAt: long.expires_in ? Date.now() + long.expires_in * 1000 : 0 };
    const me = await call(`${graph()}/me?fields=name`, { token: secret.token }).catch(() => ({}));
    return { secret, user: String(me.name || '').slice(0, 120), ...(await metaAccounts(secret)) };
  }
  const t = await call('https://oauth2.googleapis.com/token', { method: 'POST', body: form({ code, client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), redirect_uri: redirectUri, grant_type: 'authorization_code' }) });
  const secret = { token: t.access_token, refresh: t.refresh_token, expiresAt: Date.now() + (t.expires_in || 3600) * 1000 };
  const user = await call('https://openidconnect.googleapis.com/v1/userinfo', { token: secret.token }).catch(() => ({}));
  return { secret, user: String(user.email || '').slice(0, 120), ...(await googleAccounts(secret)), pages: [] };
}

/** A usable secret: Google access tokens are refreshed; Meta long-lived tokens are reused until they expire. */
export async function freshAdsSecret(network, secret) {
  if (!secret?.token) fail('A conta de anúncios precisa ser conectada de novo.', 401);
  if (network === 'meta') { if (secret.expiresAt && secret.expiresAt < Date.now()) fail('O acesso ao Meta Ads expirou. Conecte a conta de novo.', 401); return { secret, changed: false }; }
  if (secret.expiresAt > Date.now() + 60_000) return { secret, changed: false };
  if (!secret.refresh) fail('O acesso ao Google Ads expirou. Conecte a conta de novo.', 401);
  const t = await call('https://oauth2.googleapis.com/token', { method: 'POST', body: form({ client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), refresh_token: secret.refresh, grant_type: 'refresh_token' }) });
  return { secret: { ...secret, token: t.access_token, expiresAt: Date.now() + (t.expires_in || 3600) * 1000 }, changed: true };
}

// ---- Meta Marketing API --------------------------------------------------------------------------
async function metaAccounts(secret) {
  const acts = await call(`${graph()}/me/adaccounts?fields=id,name,account_id,currency,account_status,timezone_name&limit=100`, { token: secret.token });
  const pages = await call(`${graph()}/me/accounts?fields=id,name&limit=100`, { token: secret.token }).catch(() => ({ data: [] }));
  return {
    accounts: (acts.data || []).map(a => ({ id: a.id, name: a.name || a.account_id, currency: a.currency || '', active: a.account_status === 1, timezone: a.timezone_name || '' })),
    pages: (pages.data || []).map(p => ({ id: p.id, name: p.name }))
  };
}
async function metaPaged(url, token, max = 20) {
  const out = [];
  for (let next = url, n = 0; next && n < max; n++) { const page = await call(next, { token }); out.push(...(page.data || [])); next = page.paging?.next || ''; }
  return out;
}
const leadActions = ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'leadgen_grouped'];
async function metaSync(secret, account, from, to) {
  const campaigns = await metaPaged(`${graph()}/${account.id}/campaigns?fields=id,name,status,effective_status,objective,daily_budget,lifetime_budget&limit=200`, secret.token);
  const insights = await metaPaged(`${graph()}/${account.id}/insights?` + form({ level: 'campaign', fields: 'campaign_id,spend,clicks,impressions,actions', time_increment: '1',
    time_range: JSON.stringify({ since: from, until: to }), limit: '500' }), secret.token, 40);
  return {
    campaigns: campaigns.map(c => ({ id: c.id, name: c.name, status: statusOf(c.effective_status === 'ACTIVE' ? 'ACTIVE' : c.status), rawStatus: c.effective_status || c.status, objective: c.objective,
      budget: (Number(c.daily_budget || c.lifetime_budget) || 0) / 100, budgetType: c.daily_budget ? 'daily' : c.lifetime_budget ? 'lifetime' : '' })),
    stats: insights.map(r => ({ campaignId: r.campaign_id, date: r.date_start, spend: Number(r.spend) || 0, clicks: Number(r.clicks) || 0, impressions: Number(r.impressions) || 0,
      leads: Math.max(0, ...(r.actions || []).filter(a => leadActions.includes(a.action_type)).map(a => Number(a.value) || 0)) }))
  };
}

// ---- Google Ads API ------------------------------------------------------------------------------
const gHeaders = () => ({ ...(env('GOOGLE_ADS_LOGIN_CUSTOMER_ID') ? { 'login-customer-id': env('GOOGLE_ADS_LOGIN_CUSTOMER_ID').replace(/-/g, '') } : {}) });
async function gaql(secret, customer, query) {
  const chunks = await call(`${gads()}/customers/${customer}/googleAds:searchStream`, { method: 'POST', token: secret.token, json: { query }, headers: gHeaders(customer) });
  return (Array.isArray(chunks) ? chunks : [chunks]).flatMap(c => c.results || []);
}
async function googleAccounts(secret) {
  const list = await call(`${gads()}/customers:listAccessibleCustomers`, { token: secret.token, headers: gHeaders() });
  const accounts = [];
  for (const name of (list.resourceNames || []).slice(0, 25)) {
    const id = name.split('/').pop();
    try {
      const [row] = await gaql(secret, id, 'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.manager, customer.time_zone FROM customer LIMIT 1');
      if (row?.customer?.manager) continue; // a manager account has no campaigns of its own
      accounts.push({ id, name: row?.customer?.descriptiveName || id, currency: row?.customer?.currencyCode || '', active: true, timezone: row?.customer?.timeZone || '' });
    } catch { accounts.push({ id, name: id, currency: '', active: false, timezone: '' }); }
  }
  return { accounts };
}
async function googleSync(secret, account, from, to) {
  const camps = await gaql(secret, account.id, "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros, campaign_budget.resource_name FROM campaign WHERE campaign.status != 'REMOVED'");
  const daily = await gaql(secret, account.id, `SELECT campaign.id, segments.date, metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date BETWEEN '${from}' AND '${to}'`);
  return {
    campaigns: camps.map(r => ({ id: r.campaign.id, name: r.campaign.name, status: statusOf(r.campaign.status), rawStatus: r.campaign.status, objective: r.campaign.advertisingChannelType || '',
      budget: (Number(r.campaignBudget?.amountMicros) || 0) / 1e6, budgetType: 'daily', budgetResource: r.campaignBudget?.resourceName || '' })),
    stats: daily.map(r => ({ campaignId: r.campaign.id, date: r.segments.date, spend: (Number(r.metrics.costMicros) || 0) / 1e6, clicks: Number(r.metrics.clicks) || 0,
      impressions: Number(r.metrics.impressions) || 0, leads: Math.round(Number(r.metrics.conversions) || 0) }))
  };
}

// ---- Shared operations ---------------------------------------------------------------------------
const isDay = v => /^\d{4}-\d\d-\d\d$/.test(v);
/** Campaigns and daily numbers of [from, to] for the chosen account. */
export async function syncAds(network, secret, account, from, to) {
  if (!account?.id) fail('Escolha a conta de anúncios primeiro.', 409);
  if (!isDay(from) || !isDay(to)) fail('Período inválido.');
  return network === 'meta' ? metaSync(secret, account, from, to) : googleSync(secret, account, from, to);
}

/** Pauses or activates a campaign. */
export async function setCampaignStatus(network, secret, account, campaignId, active) {
  if (!/^\d{1,30}$/.test(String(campaignId))) fail('Campanha inválida.');
  if (network === 'meta') return call(`${graph()}/${campaignId}`, { method: 'POST', token: secret.token, body: form({ status: active ? 'ACTIVE' : 'PAUSED' }) });
  return call(`${gads()}/customers/${account.id}/campaigns:mutate`, { method: 'POST', token: secret.token, headers: gHeaders(account.id),
    json: { operations: [{ update: { resourceName: `customers/${account.id}/campaigns/${campaignId}`, status: active ? 'ENABLED' : 'PAUSED' }, updateMask: 'status' }] } });
}

/** Changes the daily budget (account currency). Meta: campaign budget (Advantage+ budget); Google: the campaign's budget. */
export async function setCampaignBudget(network, secret, account, campaign, amount) {
  const value = Number(amount);
  if (!(value >= 1 && value <= 1_000_000)) fail('Informe um orçamento diário entre 1 e 1.000.000.');
  if (network === 'meta') {
    if (campaign.budgetType !== 'daily') fail('Esta campanha não tem orçamento diário no nível da campanha. Ajuste o orçamento pelos conjuntos de anúncios no Gerenciador da Meta.', 409);
    return call(`${graph()}/${campaign.id}`, { method: 'POST', token: secret.token, body: form({ daily_budget: String(Math.round(value * 100)) }) });
  }
  if (!campaign.budgetResource) fail('Sincronize as campanhas antes de mudar o orçamento.', 409);
  return call(`${gads()}/customers/${account.id}/campaignBudgets:mutate`, { method: 'POST', token: secret.token, headers: gHeaders(account.id),
    json: { operations: [{ update: { resourceName: campaign.budgetResource, amountMicros: String(Math.round(value * 1e6)) }, updateMask: 'amount_micros' }] } });
}


/**
 * Creates a complete Meta ad, paused: campaign, ad set (budget, dates, audience), image, creative and
 * ad. The link carries UTM tags with the campaign id, so leads and sales match the campaign in the reports.
 */
export async function createMetaAd(secret, account, page, ad, image) {
  const objective = metaObjectives.find(o => o[0] === ad.objective) || metaObjectives[0];
  const token = secret.token, act = account.id, post = (path, json) => call(`${graph()}/${path}`, { method: 'POST', token, json });
  const campaign = await post(`${act}/campaigns`, { name: ad.name, objective: objective[2], status: 'PAUSED', special_ad_categories: [], is_adset_budget_sharing_enabled: false });
  const targeting = { geo_locations: { countries: ad.countries }, age_min: ad.ageMin, age_max: ad.ageMax, ...(ad.genders.length ? { genders: ad.genders } : {}), targeting_automation: { advantage_audience: 0 } };
  const adset = await post(`${act}/adsets`, { name: `${ad.name} · público`, campaign_id: campaign.id, daily_budget: Math.round(ad.dailyBudget * 100), billing_event: 'IMPRESSIONS',
    optimization_goal: objective[3], bid_strategy: 'LOWEST_COST_WITHOUT_CAP', targeting, start_time: ad.start, ...(ad.end ? { end_time: ad.end } : {}), status: 'PAUSED' });
  const uploaded = await call(`${graph()}/${act}/adimages`, { method: 'POST', token, body: form({ bytes: image.toString('base64') }) });
  const hash = Object.values(uploaded.images || {})[0]?.hash || fail('A Meta não aceitou a imagem do anúncio.', 502);
  const creative = await post(`${act}/adcreatives`, { name: `${ad.name} · criativo`,
    object_story_spec: { page_id: page.id, link_data: { message: ad.message, link: ad.link, name: ad.headline, image_hash: hash, call_to_action: { type: ad.cta, value: { link: ad.link } } } },
    url_tags: 'utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_id={{campaign.id}}&utm_content={{ad.id}}' });
  const made = await post(`${act}/ads`, { name: ad.name, adset_id: adset.id, creative: { creative_id: creative.id }, status: 'PAUSED' });
  return { campaignId: campaign.id, adsetId: adset.id, adId: made.id };
}

// ---------- Workflows: Conversions API and custom audiences (Meta) ----------
// The contact data arrive already hashed (SHA-256), as Meta asks; nothing in clear text leaves the server.

/** Sends server events to the sub-account's Meta Pixel. Returns how many events Meta received. */
export async function sendMetaEvents(secret, pixelId, events, testCode = '') {
  if (!/^\d{6,20}$/.test(String(pixelId || ''))) fail('ID do Pixel da Meta inválido.');
  const data = await call(`${graph()}/${pixelId}/events`, { method: 'POST', token: secret.token,
    json: { data: events, ...(testCode ? { test_event_code: String(testCode).slice(0, 40) } : {}) } });
  return { received: Number(data.events_received) || 0 };
}

/** Adds or removes people (hashed e-mail and phone) in a Meta custom audience. */
export async function changeMetaAudience(secret, audienceId, rows, remove = false) {
  if (!/^\d{6,25}$/.test(String(audienceId || ''))) fail('ID do público personalizado inválido.');
  const data = await call(`${graph()}/${audienceId}/users`, { method: remove ? 'DELETE' : 'POST', token: secret.token,
    json: { payload: { schema: ['EMAIL_SHA256', 'PHONE_SHA256'], data: rows } } });
  return { received: Number(data.num_received) || 0, invalid: Number(data.num_invalid_entries) || 0 };
}
