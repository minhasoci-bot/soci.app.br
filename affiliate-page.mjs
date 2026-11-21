// Public pages of the business's affiliate program: sign-up and the affiliate's private dashboard.
import { affiliateSettings } from './affiliate-model.mjs';

export const affiliatePageCsp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const brl = value => `R$ ${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = iso => { const [y, m, d] = String(iso || '').split('-'); return d ? `${d}/${m}/${y}` : ''; };
const statusLabel = { pending: 'Em análise', approved: 'Aprovada', paid: 'Paga', reversed: 'Estornada' };

const layout = (title, business, body, script = '') => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${h(title)}</title>
<style>
:root{--ink:#101828;--dim:#475467;--line:#e4e7ec;--bg:#f5f6f8;--card:#fff;--accent:#d6246e}
@media (prefers-color-scheme:dark){:root{--ink:#f2f4f7;--dim:#a6adbb;--line:#2a2f3a;--bg:#0f1115;--card:#171a21}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;padding:24px 16px;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--bg)}
main{max-width:720px;margin:0 auto;display:grid;gap:16px}.card{padding:20px;border-radius:16px;background:var(--card);border:1px solid var(--line)}
.brand{margin:0;color:var(--dim);font-size:14px;font-weight:600}h1{margin:0;font-size:24px;line-height:1.25}h2{margin:0 0 10px;font-size:17px}p{margin:0;color:var(--dim)}
form{display:grid;gap:12px}label{display:grid;gap:4px;font-size:14px;font-weight:600}input{padding:10px 12px;border:1px solid var(--line);border-radius:10px;font:inherit;color:inherit;background:transparent}
.check{display:flex;gap:8px;align-items:flex-start;font-weight:400;color:var(--dim)}.check input{margin-top:4px}
button{min-height:44px;padding:0 18px;border:0;border-radius:12px;background:var(--accent);color:#fff;font:600 15px system-ui,sans-serif;cursor:pointer}button.ghost{background:transparent;color:var(--ink);border:1px solid var(--line);min-height:36px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}.stat{padding:14px;border-radius:12px;border:1px solid var(--line);background:var(--card)}.stat b{display:block;font-size:22px}.stat span{color:var(--dim);font-size:13px}
.link{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px}.link code{flex:1 1 240px;padding:9px 10px;border-radius:8px;background:color-mix(in srgb,var(--line) 50%,transparent);font-size:13px;overflow-wrap:anywhere}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:8px 6px;border-bottom:1px solid var(--line);text-align:left}th{color:var(--dim);font-size:12px}td.num{text-align:right;font-variant-numeric:tabular-nums}
.status{min-height:1.5em;font-size:14px;color:#b42318}.hp{position:absolute;left:-9999px}.terms{max-height:180px;overflow:auto;white-space:pre-wrap;font-size:13px;padding:10px;border:1px solid var(--line);border-radius:10px;color:var(--dim)}
.ok{padding:12px 14px;border-radius:12px;background:color-mix(in srgb,#12b76a 12%,transparent);color:var(--ink)}
</style></head><body><main>
<p class="brand">${h(business)}</p>
${body}
</main>${script ? `<script>${script}</script>` : ''}</body></html>`;

export function renderSignup(state, { workspace }) {
  const settings = affiliateSettings(state);
  const business = state.profile?.name || 'Programa de afiliados';
  const campaigns = (state.affiliateCampaigns || []).filter(row => row.active);
  if (!settings.signup || !campaigns.length) {
    return layout(`Afiliados de ${business}`, business, '<section class="card"><h1>As inscrições estão fechadas</h1><p>Fale com a empresa para participar do programa de afiliados.</p></section>');
  }
  const offer = campaigns.map(row => `<li><b>${h(row.name)}</b>: ${row.commissionType === 'fixed' ? brl(row.commissionValue) : `${row.commissionValue.toLocaleString('pt-BR')}%`} ${row.recurring === 'all' ? 'em cada pagamento do cliente' : 'na primeira compra do cliente'}${row.description ? ` · ${h(row.description)}` : ''}</li>`).join('');
  return layout(`Seja afiliado de ${business}`, business, `
<section class="card" style="display:grid;gap:10px"><h1>Indique e ganhe</h1><p>Receba um link só seu. Quando alguém chega por ele e compra, você ganha comissão.</p><ul style="margin:0;padding-left:20px">${offer}</ul></section>
<section class="card"><form data-signup novalidate>
  <label>Nome<input name="name" required maxlength="80" autocomplete="name"></label>
  <label>E-mail<input name="email" type="email" required maxlength="160" autocomplete="email"></label>
  <label>WhatsApp<input name="phone" maxlength="30" autocomplete="tel"></label>
  <label>Chave PIX para receber as comissões<input name="pix" maxlength="120"></label>
  <label class="hp" aria-hidden="true">Site<input name="website" tabindex="-1" autocomplete="off"></label>
  ${settings.terms ? `<div class="terms">${h(settings.terms)}</div><label class="check"><input type="checkbox" name="terms" required> Li e aceito os termos do programa.</label>` : ''}
  <button>Quero ser afiliado</button><p class="status" role="alert" data-status></p>
</form><div data-done hidden></div></section>`, `
const form = document.querySelector('[data-signup]');
form.addEventListener('submit', async event => {
  event.preventDefault();
  const status = form.querySelector('[data-status]'), button = form.querySelector('button');
  if (!form.reportValidity()) return;
  button.disabled = true; status.textContent = '';
  try {
    const data = Object.fromEntries(new FormData(form)); data.terms = Boolean(form.elements.terms?.checked);
    const response = await fetch(${JSON.stringify(`/api/afiliados/${workspace}/signup`)}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Não foi possível concluir. Tente de novo.');
    const done = document.querySelector('[data-done]'); form.hidden = true; done.hidden = false;
    done.innerHTML = '<p class="ok">' + (body.approval === 'active' ? 'Inscrição confirmada!' : 'Inscrição recebida! A empresa vai analisar e liberar o seu link.') + '</p><p style="margin-top:10px">Guarde o link do seu painel. Ele é pessoal:</p><p class="link"><code></code></p>';
    done.querySelector('code').textContent = location.origin + body.portal;
  } catch (error) { status.textContent = error.message; button.disabled = false; }
});`);
}

export function renderPortal(state, portal, { workspace, origin }) {
  const business = state.profile?.name || 'Programa de afiliados';
  const { affiliate, campaigns, stats, commissions, payouts } = portal;
  const active = affiliate.status === 'active';
  const links = campaigns.map(row => {
    const href = `${origin}/r/${workspace}/${affiliate.code}${campaigns.length > 1 ? `/${row.id}` : ''}`;
    return `<div class="card"><h2>${h(row.name)}</h2><p>${h(row.commission)}${row.recurring === 'all' ? ' (pagamentos recorrentes também)' : ''}. Vale para quem chegar pelo seu link nos próximos ${row.cookieDays} dias.</p>
      ${row.description ? `<p>${h(row.description)}</p>` : ''}${active ? `<div class="link"><code>${h(href)}</code><button type="button" class="ghost" data-copy="${h(href)}">Copiar</button></div>` : ''}</div>`;
  }).join('');
  return layout(`Painel de afiliado · ${business}`, business, `
<section class="card" style="display:grid;gap:6px"><h1>Olá, ${h(affiliate.name.split(' ')[0])}!</h1>
  <p>${active ? `Seu código: <b>${h(affiliate.code)}</b>` : affiliate.status === 'pending' ? 'Sua inscrição está em análise. O link aparece aqui quando for aprovada.' : 'Sua participação está pausada. Fale com a empresa.'}</p>
  ${affiliate.pix ? `<p>Comissões pagas via PIX (${h(affiliate.pix)}).</p>` : '<p>Informe à empresa a sua chave PIX para receber as comissões.</p>'}</section>
<div class="stats">
  <div class="stat"><b>${stats.clicks}</b><span>cliques no link</span></div><div class="stat"><b>${stats.leads}</b><span>contatos indicados</span></div>
  <div class="stat"><b>${stats.sales}</b><span>vendas</span></div><div class="stat"><b>${brl(stats.pending)}</b><span>em análise</span></div>
  <div class="stat"><b>${brl(stats.approved)}</b><span>a receber</span></div><div class="stat"><b>${brl(stats.paid)}</b><span>já recebido</span></div></div>
${links}
<section class="card"><h2>Comissões</h2>${commissions.length ? `<table><thead><tr><th>Data</th><th>Situação</th><th class="num">Valor</th></tr></thead><tbody>${commissions.map(row => `<tr><td>${day(row.date)}</td><td>${statusLabel[row.status] || row.status}</td><td class="num">${brl(row.value)}</td></tr>`).join('')}</tbody></table>` : '<p>Nenhuma comissão ainda.</p>'}</section>
<section class="card"><h2>Pagamentos recebidos</h2>${payouts.length ? `<table><thead><tr><th>Data</th><th>Forma</th><th class="num">Valor</th></tr></thead><tbody>${payouts.map(row => `<tr><td>${day(row.date)}</td><td>${row.method === 'pix' ? 'PIX' : row.method === 'transfer' ? 'Transferência' : 'Outro'}</td><td class="num">${brl(row.amount)}</td></tr>`).join('')}</tbody></table>` : '<p>Nenhum pagamento ainda.</p>'}</section>`,
  `document.addEventListener('click', async e => { const b = e.target.closest('[data-copy]'); if (!b) return; try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copiado'; } catch { b.textContent = 'Copie o link ao lado'; } });`);
}
