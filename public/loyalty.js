// Marketing → Fidelidade (6b.3): the program (on/off, name, points per R$, sign-up and review bonus, levels),
// the rewards catalog, the members ranking with adjust and redeem, and the latest movements.
import { icon } from './icons.js';
import { badge, fmt, h, pageShell } from './screens.js';
import { ask } from './ask.js';

const kinds = [['coupon_percent', 'Cupom de % de desconto'], ['coupon_fixed', 'Cupom de valor em R$'], ['product', 'Produto grátis'], ['custom', 'Benefício personalizado']];
const nf = n => new Intl.NumberFormat('pt-BR').format(n);
const defaults = { enabled: false, name: 'Clube de pontos', pointsName: 'pontos', perReal: 1, signup: 0, review: 0, tiers: [{ name: 'Bronze', min: 0 }, { name: 'Prata', min: 500 }, { name: 'Ouro', min: 2000 }] };

function accounts(c) {
  const l = { ...defaults, ...(c.s.loyalty || {}) }, by = new Map();
  for (const row of c.s.loyaltyLedger || []) { const a = by.get(row.contactId) || { balance: 0, earned: 0 }; a.balance += row.points; if (row.points > 0) a.earned += row.points; by.set(row.contactId, a); }
  return [...by].map(([id, a]) => ({ id, name: c.s.contacts.find(row => row.id === id)?.name || 'Contato excluído', ...a,
    tier: l.tiers.reduce((at, tier) => a.earned >= tier.min ? tier.name : at, l.tiers[0]?.name || '') })).sort((a, b) => b.balance - a.balance);
}

export function loyaltyScreen(c, ctx) {
  const l = { ...defaults, ...(c.s.loyalty || {}) }, rows = accounts(c), rewards = c.s.loyaltyRewards || [];
  const outstanding = rows.reduce((sum, row) => sum + row.balance, 0);
  const ledger = (c.s.loyaltyLedger || []).slice(-15).reverse();
  return pageShell({ title: 'Marketing', desc: 'Programa de fidelidade: pontos por compras e ações, níveis e recompensas.', tabs: { key: 'marketing', items: ctx.marketingTabs, current: 'loyalty', label: 'Seções de marketing' },
    content: `<div class="metrics">${[['Programa', l.enabled ? 'Ligado' : 'Desligado'], ['Participantes', nf(rows.length)], [`Saldo em aberto (${h(l.pointsName)})`, nf(outstanding)], ['Resgates', nf(rewards.reduce((sum, r) => sum + (r.redeemed || 0), 0))]].map(([t, v]) => `<div class="surface metric"><span>${t}</span><b>${v}</b></div>`).join('')}</div>
      <div class="ly-grid"><form class="surface settings-form set-form" data-ly-form="settings"><section class="set-section"><header class="set-head"><h2>Programa</h2></header><div class="set-body"><label class="switch-row"><span><b>Programa de fidelidade ligado</b><br><small class="dim">Os clientes veem saldo, nível e recompensas no portal do cliente.</small></span><input type="checkbox" name="enabled"${l.enabled ? ' checked' : ''}></label>
        <div class="field-grid"><label>Nome do programa<input name="name" maxlength="60" value="${h(l.name)}"></label><label>Nome dos pontos<input name="pointsName" maxlength="20" value="${h(l.pointsName)}"></label></div>
        <div class="field-grid"><label>Pontos a cada R$ 1 pago<input name="perReal" type="number" min="0" max="100" step="0.1" value="${h(l.perReal)}"></label><label>Bônus de cadastro<input name="signup" type="number" min="0" value="${h(l.signup)}"></label><label>Bônus por avaliação<input name="review" type="number" min="0" value="${h(l.review)}"></label></div>
        <p class="dim">Contam faturas e pedidos pagos. Os níveis seguem os pontos ganhos no total (resgatar não rebaixa).</p>
        <h3>Níveis</h3><div class="ly-tiers">${[...l.tiers, { name: '', min: '' }].map((t, i) => `<input name="tierName" maxlength="30" value="${h(t.name)}" placeholder="Nível ${i + 1}" aria-label="Nome do nível ${i + 1}"><input name="tierMin" type="number" min="0" value="${h(t.min)}" placeholder="a partir de" aria-label="Pontos do nível ${i + 1}" ${i === 0 ? 'readonly' : ''}>`).join('')}</div></div></section><footer class="set-foot"><p class="form-status" role="alert"></p><button class="primary">Salvar programa</button></footer></form>
      <section class="surface padded"><div class="ly-head"><h2>Recompensas</h2><button type="button" class="secondary" data-ly="reward-new">${icon('plus', 15)} Nova recompensa</button></div>
        ${rewards.length ? `<ul class="ly-rewards">${rewards.map(r => `<li><div><b>${h(r.name)}</b><small>${h(kinds.find(([k]) => k === r.kind)?.[1] || '')}${r.kind === 'coupon_percent' ? ` · ${r.amount}%` : r.kind === 'coupon_fixed' ? ` · R$ ${r.amount}` : ''} · ${r.redeemed || 0} resgates${r.stock ? ` de ${r.stock}` : ''}</small></div>
          ${badge(`${nf(r.cost)} ${l.pointsName}`, 'blue')}${r.active ? '' : badge('Pausada')}<button type="button" class="icon-btn" data-ly="reward-edit" data-id="${h(r.id)}" aria-label="Editar recompensa">${icon('edit', 15)}</button></li>`).join('')}</ul>`
          : '<p class="dim">Crie recompensas como um cupom de 10% ou um brinde. Cupons são gerados na hora do resgate, de uso único, por 90 dias.</p>'}</section></div>
      <section class="surface padded"><h2>Participantes</h2>${rows.length ? `<div class="table-shell"><table><thead><tr><th scope="col">Contato</th><th scope="col">Saldo</th><th scope="col">Ganhos no total</th><th scope="col">Nível</th><th scope="col"></th></tr></thead><tbody>
        ${rows.slice(0, 200).map(row => `<tr><td><button type="button" class="text-link" data-edit="contacts" data-id="${h(row.id)}">${h(row.name)}</button></td><td><b>${nf(row.balance)}</b></td><td>${nf(row.earned)}</td><td>${badge(row.tier, 'pink')}</td>
          <td class="right"><button type="button" class="secondary" data-ly="adjust" data-id="${h(row.id)}">Ajustar</button> <button type="button" class="secondary" data-ly="redeem" data-id="${h(row.id)}">Resgatar</button></td></tr>`).join('')}</tbody></table></div>`
        : '<p class="dim">Ninguém tem pontos ainda. Ligue o programa: as próximas faturas e pedidos pagos já pontuam. Para dar pontos agora, use Ajustar na ficha de um participante ou a automação "Dar ou tirar pontos de fidelidade".</p>'}
        <button type="button" class="secondary" data-ly="adjust">${icon('plus', 15)} Dar pontos a um contato</button></section>
      ${ledger.length ? `<section class="surface padded"><h2>Movimentos recentes</h2><ul class="ly-ledger">${ledger.map(row => `<li><span>${h(c.s.contacts.find(x => x.id === row.contactId)?.name || '—')} · ${h(row.reason)}${row.code ? ` · <code>${h(row.code)}</code>` : ''}</span><small>${h(fmt(row.created, c.s.profile.timezone, true))}</small><b class="${row.points < 0 ? 'neg' : ''}">${row.points > 0 ? '+' : ''}${nf(row.points)}</b></li>`).join('')}</ul></section>` : ''}` });
}

function rewardForm(c, r) {
  const row = r || { name: '', description: '', kind: 'coupon_percent', cost: 500, amount: 10, productId: '', stock: 0, active: true };
  return `<form class="settings-form" data-ly-form="reward" data-id="${h(r?.id || '')}"><label>Nome<input name="name" required maxlength="80" value="${h(row.name)}" placeholder="Ex.: 10% de desconto"></label>
    <label>Descrição<input name="description" maxlength="300" value="${h(row.description)}"></label>
    <div class="field-grid"><label>Tipo<select name="kind">${kinds.map(([k, l]) => `<option value="${k}"${row.kind === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label><label>Custo em pontos<input name="cost" type="number" min="1" required value="${h(row.cost)}"></label></div>
    <div class="field-grid"><label>Desconto (% ou R$)<input name="amount" type="number" min="0" step="0.01" value="${h(row.amount)}"></label>
      <label>Produto (para Produto grátis)<select name="productId"><option value="">—</option>${c.s.products.map(p => `<option value="${h(p.id)}"${p.id === row.productId ? ' selected' : ''}>${h(p.name)}</option>`).join('')}</select></label>
      <label>Estoque (0 = sem limite)<input name="stock" type="number" min="0" value="${h(row.stock)}"></label></div>
    <label class="switch-row"><span><b>Disponível para resgate</b></span><input type="checkbox" name="active"${row.active ? ' checked' : ''}></label>
    <div class="tx-actions">${r ? `<button type="button" class="danger plain" data-ly="reward-delete" data-id="${h(r.id)}">Excluir</button>` : ''}<button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary">Salvar</button></div><p class="form-status" role="alert"></p></form>`;
}

export function installLoyalty({ c, mutate, flash, dialog, close, render }) {
  const here = () => c.view === 'marketing' && c.tab === 'loyalty';
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-ly]');
    if (!el || !here()) return;
    const act = el.dataset.ly, id = el.dataset.id;
    try {
      if (act === 'reward-new') dialog('Nova recompensa', rewardForm(c));
      if (act === 'reward-edit') dialog('Editar recompensa', rewardForm(c, c.s.loyaltyRewards.find(r => r.id === id)));
      if (act === 'reward-delete') { if (!await ask('Excluir esta recompensa?', { text: 'Os resgates já feitos continuam valendo.', ok: 'Excluir' })) return; await mutate({ type: 'delete', key: 'loyaltyRewards', id }); close(); render(); flash('Recompensa excluída.'); }
      if (act === 'adjust') dialog('Ajustar pontos', `<form class="settings-form" data-ly-form="adjust"><label>Contato<select name="contactId" required>${c.s.contacts.map(x => `<option value="${h(x.id)}"${x.id === id ? ' selected' : ''}>${h(x.name || x.email)}</option>`).join('')}</select></label>
        <div class="field-grid"><label>Pontos (negativo tira)<input name="points" type="number" required></label><label>Motivo<input name="reason" maxlength="160" placeholder="Ex.: Indicação"></label></div>
        <div class="tx-actions"><button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary">Salvar</button></div><p class="form-status" role="alert"></p></form>`);
      if (act === 'redeem') dialog('Resgatar recompensa', `<form class="settings-form" data-ly-form="redeem" data-id="${h(id)}"><label>Recompensa<select name="rewardId" required>${(c.s.loyaltyRewards || []).filter(r => r.active).map(r => `<option value="${h(r.id)}">${h(r.name)} · ${nf(r.cost)}</option>`).join('')}</select></label>
        <div class="tx-actions"><button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary">Resgatar</button></div><p class="form-status" role="alert"></p></form>`);
    } catch (error) { flash(error.message, true); }
  });
  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-ly-form]');
    if (!form || !here()) return;
    event.preventDefault();
    const f = new FormData(form), status = form.querySelector('.form-status');
    try {
      if (form.dataset.lyForm === 'settings') {
        const names = f.getAll('tierName'), mins = f.getAll('tierMin');
        await mutate({ type: 'loyalty-settings', data: { enabled: f.has('enabled'), name: f.get('name'), pointsName: f.get('pointsName'), perReal: f.get('perReal'), signup: f.get('signup'), review: f.get('review'),
          tiers: names.map((name, i) => ({ name, min: mins[i] })).filter(t => t.name.trim()) } });
        render(); flash('Programa salvo.');
      }
      if (form.dataset.lyForm === 'reward') { await mutate({ type: 'save', key: 'loyaltyRewards', id: form.dataset.id || undefined, data: { ...Object.fromEntries(f), active: f.has('active') } }); close(); render(); flash('Recompensa salva.'); }
      if (form.dataset.lyForm === 'adjust') { await mutate({ type: 'loyalty-adjust', data: Object.fromEntries(f) }); close(); render(); flash('Pontos ajustados.'); }
      if (form.dataset.lyForm === 'redeem') { await mutate({ type: 'loyalty-redeem', data: { contactId: form.dataset.id, rewardId: f.get('rewardId') } }); close(); render(); flash('Resgate feito. O código está nos movimentos.'); }
    } catch (error) { if (status) status.textContent = error.message; else flash(error.message, true); }
  });
}
