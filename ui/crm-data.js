// Shared by the server (validation) and the browser (forms and screens) for the CRM tabs:
// custom fields and values, tags, companies, products and payments, bulk actions and the forecast.

export const customObjects = ['Contact', 'Opportunity', 'Company'];
export const fieldTypes = ['Single line', 'Multi line', 'Number', 'Monetary', 'Date', 'Dropdown (single)', 'Checkbox', 'Email', 'Phone'];
export const productKinds = ['One time', 'Recurring'];
export const intervals = ['Weekly', 'Monthly', 'Yearly'];
export const subscriptionStatuses = ['Active', 'Paused', 'Canceled'];
export const paymentMethods = ['Manual', 'Cash', 'Bank transfer', 'Pix', 'Card'];
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

/**
 * Forecast of open opportunities.
 * Probability comes from the opportunity, else from its stage; without either it counts as 0 and is flagged.
 * Risk: an expected close date that slipped (moved later) or is already past while the deal is open.
 */
export function forecast(state, { pipelineId = '', at = Date.now() } = {}) {
  const stages = new Map(state.stages.map(stage => [stage.id, stage]));
  const deals = state.opportunities.filter(deal => !pipelineId || deal.pipelineId === pipelineId);
  const open = deals.filter(deal => deal.status === 'Open');
  const chance = deal => deal.probability ?? stages.get(deal.stage)?.probability ?? null;
  const expected = deal => deal.value * (chance(deal) ?? 0) / 100;
  const late = deal => deal.closeDate ? Math.floor((startOfDay(at) - startOfDay(deal.closeDate)) / day) : 0;
  const risk = deal => {
    const slips = deal.slips || 0, days = Math.max(0, late(deal));
    if (slips >= 2 || days >= 14) return 'High';
    if (slips >= 1 || days >= 7) return 'Medium';
    if (days >= 1) return 'Low';
    return '';
  };
  const months = new Map();
  for (const deal of open.filter(item => item.closeDate)) {
    const month = deal.closeDate.slice(0, 7);
    const row = months.get(month) || { month, count: 0, value: 0, expected: 0 };
    row.count++; row.value += deal.value; row.expected += expected(deal);
    months.set(month, row);
  }
  const atRisk = open.map(deal => ({ deal, level: risk(deal), late: Math.max(0, late(deal)) })).filter(item => item.level);
  return {
    potential: open.reduce((sum, deal) => sum + deal.value, 0),
    expected: Math.round(open.reduce((sum, deal) => sum + expected(deal), 0) * 100) / 100,
    won: deals.filter(deal => deal.status === 'Won').reduce((sum, deal) => sum + deal.value, 0),
    open: open.length,
    timeline: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    risk: { High: atRisk.filter(x => x.level === 'High'), Medium: atRisk.filter(x => x.level === 'Medium'), Low: atRisk.filter(x => x.level === 'Low') },
    missingClose: open.filter(deal => !deal.closeDate),
    missingChance: open.filter(deal => chance(deal) === null)
  };
}
