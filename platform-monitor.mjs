// Página Plataforma: confere os serviços de hora em hora (de carona no cron), guarda histórico e avisa o dono.
// Tudo fica numa linha própria do store ('platform-usage'). O estado do alerta é gravado ANTES de enviar:
// se o banco não aceitar a gravação, nada sai (melhor perder um aviso do que repetir o mesmo a cada hora).
import { collectAll } from './platform-collectors.mjs';
import { PLAN_LIMITS, decideAlerts, levelOf, percentOf, projectFull } from './platform-limits.mjs';
import { pushSubscription, sendPush } from './web-push.mjs';

const ROW = 'platform-usage';
const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
const DUE_MS = 55 * MINUTE, MANUAL_MS = 2 * MINUTE;
const HOURLY_MAX = 168, DAILY_MAX = 90, PUSH_MAX = 10;
const PAGE_URL = '/app#agency/plataforma';

/**
 * Serviços sem leitura automática: aparecem na página só como atalho para o painel de cada um.
 * AbacatePay: cada agência usa a própria chave, não há uma conta da plataforma para ler.
 * Google: login e Places não têm API de uso com a chave que o app guarda.
 */
export const UNMONITORED = [
  { name: 'AbacatePay', url: 'https://www.abacatepay.com/app' },
  { name: 'Google', url: 'https://console.cloud.google.com/billing' }
];

const fail = (message, status) => Object.assign(new Error(message), { status });
const blankRow = () => ({
  profile: { name: 'Plataforma' }, readings: [], checkedAt: null, history: {}, alerts: { metrics: {}, failures: {} },
  settings: { alertEmail: '', twilioMinUsd: 10, plans: {}, push: [] }, lastRunAt: 0, lastManualAt: 0, lastSendErrors: []
});
const day = at => new Date(at).toISOString().slice(0, 10);

/** Acrescenta a leitura ao histórico: pontos dos últimos 7 dias (até 168) e o máximo de cada dia (até 90). */
function remember(history, id, value, now) {
  const entry = history[id] ||= { hourly: [], daily: [] };
  entry.hourly = [...entry.hourly, [now, value]].filter(([at]) => at >= now - 7 * DAY).slice(-HOURLY_MAX);
  const today = day(now), last = entry.daily.at(-1);
  if (last?.[0] === today) last[1] = Math.max(last[1], value);
  else entry.daily = [...entry.daily, [today, value]].slice(-DAILY_MAX);
}

export function createPlatformMonitor({ store, env = process.env, request = fetch, mailer = null, now = Date.now, collect = collectAll, pushEnv = env, pushRequest = request }) {
  async function row() {
    try { return await store.load(ROW); }
    catch { await store.insert(ROW, blankRow()); return store.load(ROW); }
  }
  const change = async mutate => { await row(); return store.change(ROW, state => mutate(Object.assign(state, { ...blankRow(), ...state }))); };

  function viewOf(state) {
    const settings = { ...blankRow().settings, ...state.settings };
    const services = (state.readings || []).map(reading => ({
      ...reading,
      metrics: reading.metrics.map(metric => {
        const pct = percentOf(metric);
        const known = state.alerts?.metrics?.[`${reading.service}.${metric.key}`]?.level;
        return { ...metric, pct: pct === null ? null : Math.round(pct * 10) / 10, level: known || levelOf(metric), projection: metric.projection ?? null };
      })
    }));
    return {
      checkedAt: state.checkedAt || null,
      services,
      settings: { alertEmail: settings.alertEmail, twilioMinUsd: settings.twilioMinUsd, plans: settings.plans, pushDevices: settings.push.length },
      channels: { email: Boolean(settings.alertEmail && mailer?.configured), push: settings.push.length > 0 },
      unmonitored: UNMONITORED
    };
  }

  async function view() { return viewOf(await row()); }

  async function deliver(alerts, settings) {
    const problems = [], gone = new Set();
    for (const alert of alerts) {
      if (settings.alertEmail && mailer) {
        const outcome = await mailer.email(settings.alertEmail, { subject: alert.title, text: alert.body },
          `platform-${alert.service}-${alert.key || 'failure'}-${alert.level}-${now()}`).catch(() => 'e-mail não enviado');
        if (!String(outcome).startsWith('e-mail enviado')) problems.push(`${alert.title}: ${outcome}`);
      }
      for (const device of settings.push) {
        const sent = await sendPush(device, { title: alert.title, body: alert.body, url: PAGE_URL, tag: `platform-${alert.service}-${alert.key}` },
          { env: pushEnv, request: pushRequest }).catch(() => ({ ok: false, gone: false, error: 'falhou' }));
        if (sent.gone) gone.add(device.endpoint);
        else if (!sent.ok) problems.push(`${alert.title}: push ${sent.error || 'não enviado'}`);
      }
    }
    if (!problems.length && !gone.size) return;
    await change(state => {
      state.lastSendErrors = problems.slice(0, 20);
      state.settings.push = state.settings.push.filter(device => !gone.has(device.endpoint));
    }).catch(() => {});
  }

  async function check({ manual = false } = {}) {
    if (manual) {
      await change(state => {
        if (now() - (state.lastManualAt || 0) < MANUAL_MS) throw fail('Aguarde 2 minutos entre conferências.', 429);
        state.lastManualAt = now();
        state.lastRunAt = now();
      });
    }
    const current = await row();
    const settings = { ...blankRow().settings, ...current.settings };
    const readings = await collect({ env, request, store, settings, now: now() });
    let toSend = [], saved;
    await change(state => {
      const at = now();
      for (const reading of readings) {
        for (const metric of reading.metrics) {
          const id = `${reading.service}.${metric.key}`;
          if (Number.isFinite(metric.used)) remember(state.history, id, metric.used, at);
          metric.projection = projectFull(state.history[id]?.hourly || [], metric, at);
        }
      }
      const { next, alerts } = decideAlerts(state.alerts, readings, at);
      state.alerts = next;
      state.readings = readings;
      state.checkedAt = at;
      toSend = alerts;
      saved = viewOf(state);
    });
    if (toSend.length) await deliver(toSend, settings);
    return saved;
  }

  async function runIfDue() {
    let claimed = false;
    await change(state => {
      claimed = false;
      if ((state.lastRunAt || 0) > now() - DUE_MS) return;
      state.lastRunAt = now();
      claimed = true;
    });
    if (!claimed) return false;
    await check();
    return true;
  }

  async function saveSettings(input = {}) {
    const updates = {};
    if (input.alertEmail !== undefined) {
      const email = String(input.alertEmail).trim();
      if (email && (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw fail('Informe um e-mail válido.', 400);
      updates.alertEmail = email;
    }
    if (input.twilioMinUsd !== undefined) {
      const value = Number(input.twilioMinUsd);
      if (!Number.isFinite(value) || value < 0 || value > 10_000) throw fail('O saldo mínimo do Twilio deve ficar entre 0 e 10.000.', 400);
      updates.twilioMinUsd = value;
    }
    if (input.plans !== undefined) {
      const plans = {};
      for (const [service, plan] of Object.entries(input.plans || {})) {
        if (!['supabase', 'vercel'].includes(service) || !PLAN_LIMITS[service][plan]) throw fail('Plano desconhecido.', 400);
        plans[service] = plan;
      }
      updates.plans = plans;
    }
    let result;
    await change(state => { Object.assign(state.settings, updates); result = viewOf(state); });
    return result;
  }

  async function ensureEmail(email) {
    const value = String(email || '').trim();
    if (!value || (await row()).settings?.alertEmail) return;
    await change(state => { if (!state.settings.alertEmail) state.settings.alertEmail = value.slice(0, 200); });
  }

  async function subscribe(value) {
    const device = pushSubscription(value);
    if (!device) throw fail('Inscrição de notificação inválida.', 400);
    let result;
    await change(state => {
      state.settings.push = [...state.settings.push.filter(d => d.endpoint !== device.endpoint), device].slice(-PUSH_MAX);
      result = viewOf(state);
    });
    return result;
  }

  return { runIfDue, check, view, saveSettings, ensureEmail, subscribe };
}
