// Sites → Análises: one view over what Sites measures — form and blog visits, QR scans, opt-ins
// (form submissions, webinar registrations, chats started) and store sales.
import { icon } from './icons.js';
import { h, pageShell } from './screens.js';
import { siteTabs } from './forms.js';
import { brl } from './store-data.js';

export const analyticsTabs = ['analytics'];
const av = { range: 30 };
const pct = (a, b) => b ? `${(Math.round(a / b * 1000) / 10).toLocaleString('pt-BR')}%` : '—';
const dayOf = iso => String(iso || '').slice(0, 10);

function days(range) {
  const out = [];
  for (let i = range - 1; i >= 0; i--) out.push(new Date(Date.now() - i * 864e5).toISOString().slice(0, 10));
  return out;
}

export function sitesNumbers(s, range) {
  const list = days(range), first = list[0], inRange = iso => dayOf(iso) >= first;
  const sum = (byDay, pick = n => n) => Object.entries(byDay || {}).filter(([day]) => day >= first).reduce((total, [, n]) => total + pick(n), 0);
  const formViews = s.forms.reduce((total, form) => total + sum(form.viewsByDay), 0);
  const blogViews = s.blogPosts.reduce((total, post) => total + sum(post.viewsByDay), 0);
  const qrScans = s.qrCodes.reduce((total, qr) => total + sum(qr.byDay, n => n.scans || 0), 0);
  const submissions = s.submissions.filter(row => inRange(row.created)).length;
  const registrations = s.webinarRegistrations.filter(row => inRange(row.created)).length;
  const chats = s.chatSessions.filter(row => inRange(row.created)).length;
  const orders = s.orders.filter(row => inRange(row.created));
  const paid = orders.filter(row => ['Paid', 'Fulfilled'].includes(row.status));
  const perDay = list.map(day => ({ day,
    visits: s.forms.reduce((t, f) => t + (f.viewsByDay?.[day] || 0), 0) + s.blogPosts.reduce((t, p) => t + (p.viewsByDay?.[day] || 0), 0) + s.qrCodes.reduce((t, q) => t + (q.byDay?.[day]?.scans || 0), 0),
    optins: s.submissions.filter(r => dayOf(r.created) === day).length + s.webinarRegistrations.filter(r => dayOf(r.created) === day).length + s.chatSessions.filter(r => dayOf(r.created) === day).length }));
  return { formViews, blogViews, qrScans, visits: formViews + blogViews + qrScans, submissions, registrations, chats, optins: submissions + registrations + chats, orders: orders.length, sales: paid.reduce((t, o) => t + o.total, 0), paid: paid.length, perDay };
}

function chart(rows) {
  const max = Math.max(1, ...rows.map(row => row.visits));
  const label = day => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(`${day}T12:00:00`));
  return `<figure class="surface fm-chart"><figcaption><b>Visitas por dia</b><span class="dim">Formulários, blogs e QR Codes</span></figcaption><div class="fm-bars" role="img" aria-label="Visitas por dia no período, máximo de ${max}"><span class="fm-axis" aria-hidden="true"><i>${max}</i><i>0</i></span>
    ${rows.map(row => `<span class="fm-bar" data-tip="${label(row.day)}: ${row.visits} visitas · ${row.optins} opt-ins"><i style="height:${row.visits ? Math.max(4, row.visits / max * 100) : 0}%"></i></span>`).join('')}</div><div class="fm-chart-foot dim"><span>${label(rows[0].day)}</span><span>${label(rows.at(-1).day)}</span></div></figure>`;
}

export function analyticsScreen(c) {
  const n = sitesNumbers(c.s, av.range);
  const tops = [
    ...c.s.forms.map(form => [form.name, { form: 'Formulário', survey: 'Pesquisa', quiz: 'Questionário' }[form.kind || 'form'], form.views || 0, c.s.submissions.filter(row => row.formId === form.id).length, `#sites/form/${form.id}`]),
    ...c.s.blogPosts.map(post => [post.title, 'Artigo', post.views || 0, 0, `#sites/post/${post.id}`]),
    ...c.s.qrCodes.map(qr => [qr.name, 'QR Code', qr.scans || 0, 0, `#sites/qr/${qr.id}`]),
    ...c.s.webinars.map(w => [w.name, 'Webinar', 0, c.s.webinarRegistrations.filter(row => row.webinarId === w.id).length, `#sites/webinar/${w.id}`]),
    ...c.s.chatWidgets.map(w => [w.name, 'Chat', 0, c.s.chatSessions.filter(row => row.widgetId === w.id).length, `#sites/chat/${w.id}`])
  ].filter(row => row[2] || row[3]).sort((a, b) => (b[2] + b[3] * 10) - (a[2] + a[3] * 10)).slice(0, 12);
  const sources = [['Formulários e pesquisas', n.formViews, n.submissions], ['Blogs', n.blogViews, 0], ['QR Codes', n.qrScans, 0], ['Webinars', 0, n.registrations], ['Chat do site', 0, n.chats]];
  return pageShell({ title: 'Sites', desc: 'Crie funis, sites e formulários com IA, publique e acompanhe visitas e conversões.', className: 'sites-page',
    tabs: { key: 'sites', label: 'Seções de sites', current: 'analytics', items: siteTabs },
    content: `<div class="fm-range" role="group" aria-label="Período">${[7, 30, 90].map(range => `<button class="${av.range === range ? 'selected' : ''}" aria-pressed="${av.range === range}" data-an-range="${range}">${range} dias</button>`).join('')}</div>
      <div class="metrics an-metrics"><div class="surface metric"><span>Visitas</span><b>${n.visits}</b></div><div class="surface metric"><span>Opt-ins</span><b>${n.optins}</b></div><div class="surface metric"><span>Vendas pagas</span><b>${brl(n.sales)}</b></div><div class="surface metric"><span>Conversão</span><b>${pct(n.submissions, n.formViews)}</b></div></div>
      ${chart(n.perDay)}
      <div class="an-two"><div class="surface table-shell"><table class="site-table"><caption>Por origem</caption><thead><tr><th scope="col">Origem</th><th scope="col">Visitas</th><th scope="col">Opt-ins</th></tr></thead><tbody>${sources.map(([name, visits, optins]) => `<tr><td>${name}</td><td>${visits}</td><td>${optins}</td></tr>`).join('')}
        <tr><td>Lojas</td><td>—</td><td>${n.orders} pedido${n.orders === 1 ? '' : 's'} · ${n.paid} pago${n.paid === 1 ? '' : 's'}</td></tr></tbody></table></div>
      <div class="surface table-shell"><table class="site-table"><caption>Mais acessados (desde o início)</caption><thead><tr><th scope="col">Nome</th><th scope="col">Tipo</th><th scope="col">Visitas</th><th scope="col">Opt-ins</th></tr></thead><tbody>
        ${tops.length ? tops.map(([name, kind, visits, optins, href]) => `<tr><td><a href="${href}">${h(name)}</a></td><td>${kind}</td><td>${visits}</td><td>${optins}</td></tr>`).join('') : '<tr><td colspan="4" class="dim">Ainda sem acessos.</td></tr>'}</tbody></table></div></div>
      <p class="dim fm-note">${icon('help', 14)} Conversão = envios de formulários ÷ visitas aos formulários. Funis e sites do AI Studio têm visitas e opt-ins próprios, em cada funil. Navegador, país e origem do tráfego ainda não são coletados.</p>` });
}

export function installAnalytics({ c, render }) {
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-an-range]');
    if (!target || c.view !== 'sites') return;
    av.range = Number(target.dataset.anRange); render();
  });
}
