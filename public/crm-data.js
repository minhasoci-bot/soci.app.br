// Shared by the server (validation) and the browser (forms and screens) for the CRM tabs:
// custom fields and values, tags, companies, products and payments, bulk actions and the forecast.

export const customObjects = ['Contact', 'Opportunity', 'Company'];
export const fieldTypes = ['Single line', 'Multi line', 'Number', 'Monetary', 'Date', 'Dropdown (single)', 'Checkbox', 'Email', 'Phone'];
export const productKinds = ['One time', 'Recurring'];
export const intervals = ['Weekly', 'Monthly', 'Yearly'];
export const subscriptionStatuses = ['Active', 'Paused', 'Canceled'];
export const paymentMethods = ['Manual', 'Cash', 'Bank transfer', 'Pix', 'Card', 'Boleto'];
export const transactionSources = ['Invoice', 'Subscription', 'Payment link', 'Manual'];
export const transactionStatuses = ['Succeeded', 'Refunded', 'Failed'];
export const couponKinds = ['Percent', 'Fixed'];
export const bulkOperations = {
  contacts: [['add-tag', 'Add tag'], ['remove-tag', 'Remove tag'], ['delete', 'Delete']],
  opportunities: [['move-stage', 'Move to stage'], ['status', 'Change status'], ['delete', 'Delete']]
};

// "Promotion Name" → "promotion_name"; used for {{contact.x}} and {{custom_values.x}} keys.
export const slug = text => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'field';

const day = 86400000;
const startOfDay = value => { const d = new Date(value); d.setUTCHours(0, 0, 0, 0); return +d; };

/** Coupon status the way the coupon list filters it. */
export function couponStatus(coupon, at = Date.now()) {
  if (!coupon.active) return 'Inactive';
  if (coupon.start && +new Date(coupon.start) > at) return 'Scheduled';
  if (coupon.end && startOfDay(coupon.end) + day <= at) return 'Expired';
  return 'Active';
}

export const defaultRiskSettings = { High: { slips: 2, days: 14 }, Medium: { slips: 1, days: 7 }, Low: { slips: 1, days: 1 } };
/** Risk thresholds from untrusted input; each level needs a slip count and a number of late days. */
export function riskSettings(input) {
  const out = {};
  const pick = (value, fallback) => value !== '' && value != null && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 365 ? Number(value) : fallback;
  for (const [level, base] of Object.entries(defaultRiskSettings))
    out[level] = { slips: pick(input?.[level]?.slips, base.slips), days: pick(input?.[level]?.days, base.days) };
  return out;
}
export const forecastGroups = { status: 'Status', owner: 'Responsável', closeMonth: 'Previsão de fechamento' };

/**
 * Forecast of open opportunities.
 * Probability comes from the opportunity, else from its stage; without either it counts as 0 and is flagged.
 * A pipeline with `dealProbability: false` always uses the stage probability.
 * Risk: an expected close date that slipped (moved later) or is already past while the deal is open.
 * `match` narrows the deals (the advanced filters); `risk` overrides the thresholds of each level.
 */
export function forecast(state, { pipelineId = '', at = Date.now(), match = () => true, risk: thresholds, groupBy = 'status' } = {}) {
  const stages = new Map(state.stages.map(stage => [stage.id, stage]));
  const pipelines = new Map(state.pipelines.map(pipeline => [pipeline.id, pipeline]));
  const limits = riskSettings(thresholds);
  const deals = state.opportunities.filter(deal => (!pipelineId || deal.pipelineId === pipelineId) && match(deal));
  const open = deals.filter(deal => deal.status === 'Open');
  const chance = deal => pipelines.get(deal.pipelineId)?.dealProbability === false
    ? stages.get(deal.stage)?.probability ?? null
    : deal.probability ?? stages.get(deal.stage)?.probability ?? null;
  const expected = deal => deal.status === 'Open' ? deal.value * (chance(deal) ?? 0) / 100 : 0;
  const late = deal => deal.closeDate ? Math.floor((startOfDay(at) - startOfDay(deal.closeDate)) / day) : 0;
  const reaches = (deal, level) => (limits[level].slips > 0 && (deal.slips || 0) >= limits[level].slips)
    || (limits[level].days > 0 && Math.max(0, late(deal)) >= limits[level].days);
  const risk = deal => ['High', 'Medium', 'Low'].find(level => reaches(deal, level)) || '';
  const months = new Map();
  for (const deal of open.filter(item => item.closeDate)) {
    const month = deal.closeDate.slice(0, 7);
    const row = months.get(month) || { month, count: 0, value: 0, expected: 0 };
    row.count++; row.value += deal.value; row.expected += expected(deal);
    months.set(month, row);
  }
  const atRisk = open.map(deal => ({ deal, level: risk(deal), late: Math.max(0, late(deal)) })).filter(item => item.level);
  const levels = { High: atRisk.filter(x => x.level === 'High'), Medium: atRisk.filter(x => x.level === 'Medium'), Low: atRisk.filter(x => x.level === 'Low') };
  const sum = list => list.reduce((total, deal) => total + deal.value, 0);
  const round = value => Math.round(value * 100) / 100;
  const keyOf = { status: deal => deal.status, owner: deal => deal.owner || '', closeMonth: deal => deal.closeDate ? deal.closeDate.slice(0, 7) : '' }[groupBy] || (deal => deal.status);
  const groups = new Map(groupBy === 'status' ? ['Open', 'Won', 'Lost', 'Abandoned'].map(key => [key, []]) : []);
  for (const deal of deals) { const key = keyOf(deal); groups.set(key, [...(groups.get(key) || []), deal]); }
  const groupRows = [...groups].map(([key, list]) => {
    const openList = list.filter(deal => deal.status === 'Open'), won = sum(list.filter(deal => deal.status === 'Won'));
    return { key, count: list.length, potential: sum(openList), expected: round(openList.reduce((total, deal) => total + expected(deal), 0)), won, total: sum(openList) + won };
  });
  if (groupBy !== 'status') groupRows.sort((a, b) => Number(a.key === '') - Number(b.key === '') || a.key.localeCompare(b.key));
  return {
    potential: sum(open),
    expected: round(open.reduce((total, deal) => total + expected(deal), 0)),
    won: sum(deals.filter(deal => deal.status === 'Won')),
    open: open.length,
    timeline: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    risk: levels,
    riskTotals: Object.fromEntries(Object.entries(levels).map(([level, list]) => [level, { count: list.length, value: sum(list.map(x => x.deal)) }])),
    missingClose: open.filter(deal => !deal.closeDate),
    missingChance: open.filter(deal => chance(deal) === null),
    missingValue: open.filter(deal => !deal.value),
    overdue: open.filter(deal => deal.closeDate && late(deal) > 0),
    groups: groupRows,
    deals,
    expectedOf: expected
  };
}

const monthKey = (year, month) => new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
/** Moves a YYYY-MM month by `months`. */
export const addMonths = (month, months) => { const [y, m] = month.split('-').map(Number); return monthKey(y, m - 1 + months); };
/**
 * Columns of the forecast timeline board: "no close date" first, then `count` months or quarters from the period
 * holding `start` (a YYYY-MM month). Each column lists its deals with the total, won value and expected revenue.
 */
export function forecastColumns(deals, { granularity = 'month', start, count = 4, expectedOf = () => 0 } = {}) {
  const [y, m] = start.split('-').map(Number);
  const step = granularity === 'quarter' ? 3 : 1;
  const first = granularity === 'quarter' ? Math.floor((m - 1) / 3) * 3 : m - 1;
  const columns = [{ key: '', from: '', to: '', deals: deals.filter(deal => !deal.closeDate) }];
  for (let n = 0; n < count; n++) {
    const from = monthKey(y, first + n * step), to = monthKey(y, first + (n + 1) * step);
    columns.push({ key: from, from, to, quarter: granularity === 'quarter',
      deals: deals.filter(deal => deal.closeDate && deal.closeDate.slice(0, 7) >= from && deal.closeDate.slice(0, 7) < to) });
  }
  return columns.map(column => {
    const won = column.deals.filter(deal => deal.status === 'Won').reduce((total, deal) => total + deal.value, 0);
    const total = column.deals.filter(deal => ['Open', 'Won'].includes(deal.status)).reduce((total, deal) => total + deal.value, 0);
    const expected = Math.round(column.deals.reduce((sum, deal) => sum + expectedOf(deal), 0) * 100) / 100;
    return { ...column, won, total, expected, share: total ? Math.round(expected / total * 100) : 0 };
  });
}
/** Close date for a deal dropped on a timeline column: same day of month in the period's first month, clamped. */
export function closeDateIn(column, previous) {
  if (!column.from) return '';
  const [y, m] = column.from.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dayOf = previous ? Number(previous.slice(8, 10)) : 15;
  return `${column.from}-${String(Math.min(dayOf, last)).padStart(2, '0')}`;
}
