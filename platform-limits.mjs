// Página Plataforma: limites de cada plano, nível de cada métrica, previsão e quando avisar o dono.
// Tudo aqui é puro: recebe leituras e o relógio, devolve decisões. Quem coleta e envia é o platform-monitor.mjs.
import { formatAmount, dayMonth } from './ui/platform-format.js';

const MiB = 1024 * 1024, GiB = 1024 * MiB, DAY = 86_400_000;

/** Limites por serviço e plano. Onde a API não diz o plano, o dono escolhe na página. */
export const PLAN_LIMITS = {
  supabase: {
    free: { db: 500 * MiB, storage: GiB, mau: 50_000 },
    pro: { db: 8 * GiB, storage: 100 * GiB, mau: 100_000 }
  },
  vercel: {
    hobby: { deploys24h: 100 },
    pro: { deploys24h: 6000 }
  },
  cloudflare: {
    free: { r2Storage: 10 * GiB, r2ClassA: 1_000_000, r2ClassB: 10_000_000 }
  }
};

const WARN = 80, CRITICAL = 95, CLEAR = 75;
const DEADLINE_WARN = 15, DEADLINE_CRITICAL = 3;
const REMIND_MS = 24 * 3_600_000;
const FAIL_AFTER = { evolution: 2 };
const rank = { ok: 0, warn: 1, critical: 2 };
const PAGE = '/app#agency/plataforma';

/** Porcentagem de uso (só para métricas de uso), ou null. */
export function percentOf(metric) {
  if ((metric.kind || 'usage') !== 'usage' || metric.used === null || metric.used === undefined || !metric.limit) return null;
  return metric.used / metric.limit * 100;
}

/** 'ok', 'warn' ou 'critical'. Uso tem histerese: depois de avisar, só volta a 'ok' abaixo de 75%. */
export function levelOf(metric, previous = 'ok') {
  const { used, limit } = metric;
  if (used === null || used === undefined) return 'ok';
  const kind = metric.kind || 'usage';
  if (kind === 'deadline') return used <= DEADLINE_CRITICAL ? 'critical' : used <= DEADLINE_WARN ? 'warn' : 'ok';
  if (limit === null || limit === undefined) return 'ok';
  if (kind === 'floor') return used < limit / 2 ? 'critical' : used < limit ? 'warn' : 'ok';
  const pct = percentOf(metric);
  if (pct === null) return 'ok';
  if (pct >= CRITICAL) return 'critical';
  if (pct >= WARN) return 'warn';
  if (pct >= CLEAR && previous !== 'ok') return 'warn';
  return 'ok';
}

/**
 * Quando a métrica chega ao limite no ritmo dos últimos 7 dias (regressão linear).
 * 'YYYY-MM-DD', 'safe' (não chega no ciclo, ou em 90 dias para acumulados) ou null (sem como prever).
 */
export function projectFull(points, metric, now) {
  if (!['total', 'month'].includes(metric.cycle) || !metric.limit || metric.used === null || metric.used === undefined) return null;
  const monthStart = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1);
  const since = metric.cycle === 'month' ? Math.max(now - 7 * DAY, monthStart) : now - 7 * DAY;
  const usable = points.filter(([at, value]) => at >= since && at <= now && Number.isFinite(value));
  if (usable.length < 3) return null;
  const n = usable.length;
  const meanT = usable.reduce((s, [t]) => s + t, 0) / n;
  const meanV = usable.reduce((s, [, v]) => s + v, 0) / n;
  const spread = usable.reduce((s, [t]) => s + (t - meanT) ** 2, 0);
  if (!spread) return null;
  const slope = usable.reduce((s, [t, v]) => s + (t - meanT) * (v - meanV), 0) / spread;
  const day = at => new Date(at).toISOString().slice(0, 10);
  if (metric.used >= metric.limit) return day(now);
  if (slope <= 0) return 'safe';
  const full = now + (metric.limit - metric.used) / slope;
  if (metric.cycle === 'month') {
    const monthEnd = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() + 1, 1);
    return full >= monthEnd ? 'safe' : day(full);
  }
  return full - now > 90 * DAY ? 'safe' : day(full);
}

function metricAlert(reading, metric, level) {
  const kind = metric.kind || 'usage';
  const pct = percentOf(metric);
  const title = kind === 'deadline' ? `${reading.name}: ${metric.label.toLowerCase()} em ${formatAmount(metric.used, 'days')}`
    : kind === 'floor' ? `${reading.name}: ${metric.label} em ${formatAmount(metric.used, metric.unit)}`
    : `${reading.name}: ${metric.label} em ${Math.round(pct)}%`;
  const amount = kind === 'deadline' ? '' : kind === 'floor'
    ? `Mínimo definido: ${formatAmount(metric.limit, metric.unit)}. `
    : `${formatAmount(metric.used, metric.unit)} de ${formatAmount(metric.limit, metric.unit)}. `;
  const forecast = metric.projection && metric.projection !== 'safe' ? `No ritmo atual, enche em ${dayMonth(metric.projection)}. ` : '';
  return { service: reading.service, key: metric.key, level, title, body: `${amount}${forecast}Abra: ${PAGE}` };
}

/**
 * Quais alertas sair agora. Avisa quando o nível sobe, repete o urgente a cada 24 h e avisa uma vez
 * quando a coleta falha 3 vezes seguidas (2 para a Evolution). `next` é o estado a gravar antes de enviar.
 */
export function decideAlerts(previous, readings, now) {
  const next = { metrics: { ...previous?.metrics }, failures: { ...previous?.failures } };
  const alerts = [];
  for (const reading of readings) {
    if (reading.status === 'not-configured') continue;
    if (reading.status === 'error') {
      const count = (next.failures[reading.service] || 0) + 1;
      next.failures[reading.service] = count;
      if (count === (FAIL_AFTER[reading.service] || 3)) {
        alerts.push({ service: reading.service, key: '', level: 'failure', title: `${reading.name}: não consegui ler os dados`,
          body: `Erro: ${reading.error || 'desconhecido'}. ${count} conferências seguidas falharam. Abra: ${PAGE}` });
      }
      continue;
    }
    next.failures[reading.service] = 0;
    for (const metric of reading.metrics) {
      const id = `${reading.service}.${metric.key}`;
      const before = next.metrics[id] || { level: 'ok', sentAt: 0 };
      const level = levelOf(metric, before.level);
      let sentAt = before.sentAt;
      if (rank[level] > rank[before.level] || (level === 'critical' && now - before.sentAt >= REMIND_MS)) {
        alerts.push(metricAlert(reading, metric, level));
        sentAt = now;
      }
      next.metrics[id] = { level, sentAt };
    }
  }
  return { next, alerts };
}
