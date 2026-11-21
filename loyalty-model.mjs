// Fidelidade (6b.3): contacts earn points for paid invoices and orders (per real spent), signing up and
// reviewing; levels follow the points earned over time; points buy rewards (a one-use discount coupon, a
// product or a custom benefit) from the portal or by the team. Every movement is a line in `loyaltyLedger`.
import { randomBytes } from 'node:crypto';

export const loyaltyCollections = ['loyaltyRewards', 'loyaltyLedger'];
export const rewardKinds = [['coupon_percent', 'Cupom de % de desconto'], ['coupon_fixed', 'Cupom de valor em R$'], ['product', 'Produto grátis'], ['custom', 'Benefício personalizado']];
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';

export const loyaltyDefaults = () => ({ enabled: false, name: 'Clube de pontos', pointsName: 'pontos', perReal: 1, signup: 0, review: 0,
  tiers: [{ name: 'Bronze', min: 0 }, { name: 'Prata', min: 500 }, { name: 'Ouro', min: 2000 }] });
export const loyaltyOf = s => { s.loyalty = { ...loyaltyDefaults(), ...(s.loyalty || {}) }; return s.loyalty; };

export function saveLoyalty(s, d) {
  const l = loyaltyOf(s);
  const num = (value, label, max) => { const n = Number(value); if (!(n >= 0 && n <= max)) fail(`${label}: de 0 a ${max}.`); return Math.round(n * 100) / 100; };
  if (d.enabled !== undefined) l.enabled = Boolean(d.enabled);
  if (d.name !== undefined) l.name = str(d.name, 60) || 'Clube de pontos';
  if (d.pointsName !== undefined) l.pointsName = str(d.pointsName, 20) || 'pontos';
  if (d.perReal !== undefined) l.perReal = num(d.perReal, 'Pontos por R$ 1', 100);
  if (d.signup !== undefined) l.signup = Math.round(num(d.signup, 'Pontos de cadastro', 100000));
  if (d.review !== undefined) l.review = Math.round(num(d.review, 'Pontos por avaliação', 100000));
  if (d.tiers !== undefined) {
    const tiers = (Array.isArray(d.tiers) ? d.tiers : []).map(row => ({ name: str(row?.name, 30), min: Math.round(Number(row?.min) || 0) })).filter(row => row.name);
    if (!tiers.length || tiers.length > 8) fail('Use de 1 a 8 níveis.');
    tiers.sort((a, b) => a.min - b.min); tiers[0].min = 0;
    l.tiers = tiers;
  }
  return l;
}

export const loyaltyFields = {
  loyaltyRewards: (s, d) => {
    const kind = rewardKinds.some(([k]) => k === d.kind) ? d.kind : 'custom';
    const cost = Math.round(Number(d.cost));
    if (!(cost >= 1 && cost <= 10000000)) fail('O custo em pontos vai de 1 a 10.000.000.');
    const amount = Math.round(Number(d.amount || 0) * 100) / 100;
    if (kind === 'coupon_percent' && !(amount >= 1 && amount <= 100)) fail('O desconto vai de 1% a 100%.');
    if (kind === 'coupon_fixed' && !(amount >= 1)) fail('Informe o valor do cupom (a partir de R$ 1).');
    const productId = str(d.productId, 60);
    if (kind === 'product' && !s.products.some(row => row.id === productId)) fail('Escolha o produto da recompensa.');
    const stock = Math.round(Number(d.stock || 0));
    if (stock < 0 || stock > 1000000) fail('Estoque de 0 (sem limite) a 1.000.000.');
    return { name: str(d.name, 80) || fail('Dê um nome à recompensa.'), description: str(d.description, 300), kind, cost, amount: kind.startsWith('coupon') ? amount : 0,
      productId: kind === 'product' ? productId : '', stock, redeemed: Math.max(0, Number(d.redeemed) || 0), active: d.active === undefined ? true : Boolean(d.active) };
  }
};

/** Balance, points earned over time and the level of one contact. */
export function loyaltyAccount(s, contactId) {
  const rows = (s.loyaltyLedger || []).filter(row => row.contactId === contactId);
  const balance = rows.reduce((sum, row) => sum + row.points, 0), earned = rows.filter(row => row.points > 0).reduce((sum, row) => sum + row.points, 0);
  const tiers = loyaltyOf(s).tiers, index = tiers.reduce((at, tier, i) => earned >= tier.min ? i : at, 0);
  return { balance, earned, tier: tiers[index]?.name || '', next: tiers[index + 1] ? { name: tiers[index + 1].name, missing: tiers[index + 1].min - earned } : null, rows };
}

/** A movement of points; fires "Nível de fidelidade mudou" when the level goes up. */
export function addPoints(s, contactId, points, reason, { add, run, source = 'manual', code = '', by = '' }) {
  points = Math.round(points);
  if (!points) return null;
  const before = loyaltyAccount(s, contactId).tier;
  const row = add(s, 'loyaltyLedger', { contactId, points, reason: str(reason, 160), source, code, by: str(by, 80) });
  if ((s.loyaltyLedger || []).length > 50000) s.loyaltyLedger.splice(0, s.loyaltyLedger.length - 50000);
  const account = loyaltyAccount(s, contactId);
  const contact = s.contacts.find(c => c.id === contactId);
  if (contact) contact.loyaltyPoints = account.balance;
  if (account.tier !== before) run(s, 'loyalty_tier_changed', { contactId, tier: account.tier, previous: before, title: account.tier });
  return row;
}

/** Points spent on a reward: a one-use coupon for coupon rewards, a code to show for the others. */
export function redeem(s, contactId, rewardId, { add, run, by = '' }) {
  const reward = (s.loyaltyRewards || []).find(row => row.id === rewardId && row.active) || fail('Recompensa indisponível.', 404);
  if (!loyaltyOf(s).enabled) fail('O programa de fidelidade está desligado.', 409);
  if (reward.stock && reward.redeemed >= reward.stock) fail('Esta recompensa esgotou.', 409);
  const account = loyaltyAccount(s, contactId);
  if (account.balance < reward.cost) fail(`Faltam ${reward.cost - account.balance} ${loyaltyOf(s).pointsName} para esta recompensa.`, 409);
  const code = `PTS-${randomBytes(4).toString('hex').toUpperCase()}`;
  if (reward.kind.startsWith('coupon')) {
    const today = new Date().toISOString().slice(0, 10), end = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
    add(s, 'coupons', { name: `Fidelidade: ${reward.name}`, code, kind: reward.kind === 'coupon_percent' ? 'Percent' : 'Fixed', amount: reward.amount, start: today, end, limit: 1, active: true, redemptions: 0, contactId });
  }
  reward.redeemed = (reward.redeemed || 0) + 1;
  addPoints(s, contactId, -reward.cost, `Resgate: ${reward.name}`, { add, run, source: 'redeem', code, by });
  run(s, 'loyalty_reward_redeemed', { contactId, rewardId: reward.id, title: reward.name, code, cost: reward.cost });
  return { code, reward: reward.name, kind: reward.kind };
}

/** Every event: points for paid invoices and orders, sign-ups and reviews. */
export function loyaltyEvent(s, type, ctx, { add, run }) {
  const l = s.loyalty;
  if (!l?.enabled || !ctx.contactId) return;
  const spend = Number(ctx.total) || 0;
  if (type === 'invoice_status' && ctx.status === 'Paid' && spend > 0) addPoints(s, ctx.contactId, Math.floor(spend * l.perReal), 'Fatura paga', { add, run, source: 'invoice' });
  if (type === 'order_paid' && spend > 0) addPoints(s, ctx.contactId, Math.floor(spend * l.perReal), 'Pedido pago', { add, run, source: 'order' });
  if (type === 'contact_created' && l.signup) addPoints(s, ctx.contactId, l.signup, 'Boas-vindas ao clube', { add, run, source: 'signup' });
  if (type === 'review_received' && l.review) addPoints(s, ctx.contactId, l.review, 'Avaliação enviada', { add, run, source: 'review' });
}

export function loyaltyCommand(s, command, { add, run, actor = '' }) {
  const { type, data: d = {} } = command;
  if (type === 'loyalty-settings') return saveLoyalty(s, d) && 'ok';
  const contact = s.contacts.find(row => row.id === d.contactId) || fail('Contato não encontrado.', 404);
  if (type === 'loyalty-adjust') {
    const points = Math.round(Number(d.points));
    if (!points || Math.abs(points) > 10000000) fail('Informe os pontos (positivo soma, negativo tira).');
    if (points < 0 && loyaltyAccount(s, contact.id).balance + points < 0) fail('O saldo não pode ficar negativo.');
    return addPoints(s, contact.id, points, str(d.reason, 160) || 'Ajuste manual', { add, run, source: 'manual', by: actor }).id;
  }
  if (type === 'loyalty-redeem') return redeem(s, contact.id, d.rewardId, { add, run, by: actor });
  fail('Comando de fidelidade desconhecido.');
}

/** What the client portal shows to a member: balance, level, rewards and the latest movements. */
export function loyaltyView(s, contactId) {
  const l = loyaltyOf(s);
  if (!l.enabled) return null;
  const account = contactId ? loyaltyAccount(s, contactId) : { balance: 0, earned: 0, tier: l.tiers[0]?.name || '', next: l.tiers[1] ? { name: l.tiers[1].name, missing: l.tiers[1].min } : null, rows: [] };
  return { name: l.name, pointsName: l.pointsName, perReal: l.perReal, balance: account.balance, tier: account.tier, next: account.next,
    rewards: (s.loyaltyRewards || []).filter(row => row.active && !(row.stock && row.redeemed >= row.stock)).map(row => ({ id: row.id, name: row.name, description: row.description, cost: row.cost, kind: row.kind })),
    history: account.rows.slice(-10).reverse().map(row => ({ at: row.created, points: row.points, reason: row.reason, code: row.code || '' })) };
}
