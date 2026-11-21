// Faturas recorrentes e modelos de fatura: the schedule math and labels shared by the server (issuing on
// the per-minute tick) and the app (list, editor and the "próximas emissões" preview). Dates are calendar
// days (YYYY-MM-DD) in the workspace time zone; monthly and yearly cycles keep the start day and fall back
// to the last day of shorter months (31/01 → 28/02 → 31/03).

export const frequencies = [['daily', 'Diária', 'dia', 'dias'], ['weekly', 'Semanal', 'semana', 'semanas'],
  ['monthly', 'Mensal', 'mês', 'meses'], ['yearly', 'Anual', 'ano', 'anos']];
export const endModes = [['never', 'Sem data para acabar'], ['count', 'Depois de um número de faturas'], ['date', 'Numa data']];
export const recurringStatuses = [['draft', 'Rascunho', ''], ['active', 'Ativa', 'green'], ['paused', 'Pausada', 'gold'],
  ['completed', 'Concluída', 'blue'], ['cancelled', 'Cancelada', 'red']];
export const recurringTabs = [['all', 'Todas'], ['active', 'Ativas'], ['paused', 'Pausadas'], ['draft', 'Rascunhos'], ['completed', 'Concluídas'], ['cancelled', 'Canceladas']];
export const recurringEvents = [['started', 'Ativada'], ['issued', 'Fatura emitida'], ['paused', 'Pausada'], ['resumed', 'Retomada'],
  ['completed', 'Concluída'], ['cancelled', 'Cancelada']];
export const MAX_INTERVAL = 30;

const isDay = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

/** The calendar day of an instant in a time zone (falls back to UTC for an unknown zone). */
export function localDay(at = Date.now(), zone = 'America/Sao_Paulo') {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: zone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at)); }
  catch { return new Date(at).toISOString().slice(0, 10); }
}

export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The index-th issue date (0 = the start date) of a schedule. */
export function occurrence(start, frequency, interval, index) {
  const [y, m, d] = start.split('-').map(Number);
  const step = Math.max(1, Number(interval) || 1) * index;
  if (frequency === 'daily' || frequency === 'weekly') return new Date(Date.UTC(y, m - 1, d + step * (frequency === 'weekly' ? 7 : 1))).toISOString().slice(0, 10);
  const months = m - 1 + (frequency === 'yearly' ? step * 12 : step);
  const year = y + Math.floor(months / 12), month = ((months % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(d, last))).toISOString().slice(0, 10);
}

/** The first schedule index whose date is on or after `from`. */
export function indexFrom(rec, from) {
  if (!isDay(rec.startDate)) return 0;
  for (let k = 0; k < 40000; k += 1) if (occurrence(rec.startDate, rec.frequency, rec.interval, k) >= from) return k;
  return 40000;
}

/** Whether a schedule has nothing left to issue after `issued` invoices with the next date `next`. */
export function scheduleOver(rec, issued, next) {
  if (rec.endMode === 'count') return issued >= (Number(rec.endCount) || 0);
  if (rec.endMode === 'date') return Boolean(rec.endDate) && next > rec.endDate;
  return false;
}

/** The next issue dates of a schedule (for the editor preview), starting at `from`. */
export function upcoming(rec, from, limit = 4) {
  if (!isDay(rec.startDate)) return [];
  const out = [];
  let issued = Number(rec.issuedCount) || 0;
  const after = isDay(rec.lastIssuedOn) ? addDays(rec.lastIssuedOn, 1) : '';
  for (let k = indexFrom(rec, after > from ? after : from); out.length < limit; k += 1) {
    const next = occurrence(rec.startDate, rec.frequency, rec.interval, k);
    if (scheduleOver(rec, issued, next)) break;
    out.push(next);
    issued += 1;
  }
  return out;
}

/** "Mensal", "A cada 2 semanas"… */
export function frequencyLabel(frequency, interval = 1) {
  const [, name, one, many] = frequencies.find(([key]) => key === frequency) || frequencies[2];
  const n = Math.max(1, Number(interval) || 1);
  return n === 1 ? name : `A cada ${n} ${n === 1 ? one : many}`;
}

export function endLabel(rec) {
  if (rec.endMode === 'count') return `${rec.endCount} fatura${Number(rec.endCount) === 1 ? '' : 's'}`;
  if (rec.endMode === 'date' && rec.endDate) return `até ${rec.endDate.split('-').reverse().join('/')}`;
  return 'sem fim';
}

/* Pagamentos → Configurações: receipt defaults and the variables of the receipt e-mail. */
export const RECEIPT_MESSAGE = 'Olá, {{cliente}}.\n\nRecebemos o pagamento de {{valor}} referente a {{fatura}}. Obrigado!';
export const receiptVariables = [['numero_recibo', 'Número do recibo'], ['titulo', 'Título do recibo'], ['fatura', 'Número e nome da fatura'], ['valor', 'Valor pago'],
  ['cliente', 'Nome do cliente'], ['empresa', 'Nome da empresa'], ['data_pagamento', 'Data do pagamento']];
export const paymentDefaults = () => ({
  receipts: { enabled: true, title: 'Recibo', prefix: 'REC-', startNumber: 1, fromName: '', replyTo: '', subject: '{{titulo}} {{numero_recibo}} · {{empresa}}', message: RECEIPT_MESSAGE },
  taxes: []
});
