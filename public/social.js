// Marketing → Social Planner: connect networks, compose once and publish everywhere, calendar and list
// of posts, approvals, categories with an evergreen queue, hashtag groups, RSS feeds and CSV bulk upload.
// screens.js renders socialPlanner(c); app.js calls socialEvents once with its helpers.
import { brandHighlight, brandIcon, icon as i, shcLayers } from './icons.js';
import { badge, h, fmt } from './screens.js';
import { bulkCsvColumns, mediaKind, network, networks, occurrencesBetween, parseCsv, postIssues, postTypes, recurrences, statusLabel, statusTone, textFor, weekdays } from './social-data.js';

const ui = { view: 'calendar', mode: 'month', cursor: new Date(), status: 'all', account: '', draft: null, picked: new Set() };
const freshCsv = () => ({ step: 1, file: '', rows: [], accountIds: [], asDraft: false, needsApproval: false, review: [] });
let csv = freshCsv();
let plannerWorkspace;
const views = [['calendar', 'Calendário', 'cal'], ['list', 'Lista', 'note'], ['accounts', 'Contas', 'users'], ['categories', 'Categorias', 'tag'], ['hashtags', 'Hashtags', 'link'], ['rss', 'RSS', 'refresh'], ['csv', 'CSV em massa', 'upload']];
const zoneOf = c => c.s.profile.timezone || 'America/Sao_Paulo';

// ---- Small pieces --------------------------------------------------------------------------------
const logo = (id, size = 34) => { const n = network(id) || { color: '#64748b', glyph: '?' };
  return `<span class="sp-logo" style="--net:${n.color};--size:${size}px" aria-hidden="true">${brandIcon(id, Math.max(10, Math.round(size * 0.62)))}</span>`; };
const accountChip = (a, extra = '') => `<span class="sp-acct" title="${h(`${a.name} · ${network(a.provider)?.name}`)}" ${extra}>${a.avatar ? `<img src="${h(a.avatar)}" alt="" referrerpolicy="no-referrer">` : `<b>${h(a.name.slice(0, 1).toUpperCase())}</b>`}${logo(a.provider, 15)}</span>`;
const status = s => badge(statusLabel[s] || s, statusTone[s] || '');
const wall = (iso, zone) => {
  if (!iso) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone }).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};
function instant(local, zone) {
  if (!local) return '';
  const target = Date.parse(`${local}Z`); let guess = target;
  for (let n = 0; n < 4; n++) { const seen = Date.parse(`${wall(guess, zone)}Z`); if (seen === target) break; guess += target - seen; }
  return new Date(guess).toISOString();
}
const dayKey = (iso, zone) => wall(iso, zone).slice(0, 10);
const clock = (iso, zone) => wall(iso, zone).slice(11, 16);
const accountsOf = (c, p) => p.accountIds.map(id => c.s.socialAccounts.find(a => a.id === id)).filter(Boolean);
const mediaSrc = (c, m) => m.fileId ? c.s.files.find(f => f.id === m.fileId)?.data || '' : m.url;
const visible = (c, p) => (ui.status === 'all' || p.status === ui.status) && (!ui.account || p.accountIds.includes(ui.account));
const segmented = (items, current, attr) => `<div class="sp-seg" role="group">${items.map(([v, label, ico]) => `<button type="button" ${attr}="${v}" class="${v === current ? 'on' : ''}" aria-pressed="${v === current}">${ico ? i(ico, 15) : ''}${label}</button>`).join('')}</div>`;
const emptyBox = (title, text, cta = '') => `<div class="empty">${i('send', 26)}<strong>${title}</strong><p>${text}</p>${cta}</div>`;
const newPost = (label = 'Novo post') => `<button class="primary" data-sp-new>${i('plus', 16)} ${label}</button>`;

// ---- Connect cards (onboarding + accounts view) --------------------------------------------------
function connectGrid(c) {
  const ready = c.features?.social || {};
  const card = n => {
    const count = c.s.socialAccounts.filter(a => a.provider === n.id).length;
    const hl = brandHighlight(n.id);
    return `<button type="button" class="sp-net shc-card${count ? ' is-connected' : ''}" data-sp-connect="${n.id}" style="--shc-highlight:${hl}">
      ${shcLayers()}
      <span class="shc-icon" aria-hidden="true">${brandIcon(n.id, 34)}</span>
      <b>${n.name}</b>
      <span class="sp-net-foot">
        ${count ? `<span class="sp-net-connected">${count} conectada${count > 1 ? 's' : ''}</span>` : ''}
        <span class="sp-net-cta${ready[n.id] ? '' : ' off'}">${ready[n.id] ? '+ Conectar' : 'Configurar chaves'}</span>
      </span>
    </button>`;
  };
  return `<div class="sp-connect"><h3>Redes principais</h3><div class="sp-net-grid">${networks.filter(n => n.group === 'major').map(card).join('')}</div>
    <h3>Também disponíveis</h3><div class="sp-net-grid">${networks.filter(n => n.group === 'more').map(card).join('')}</div></div>`;
}
function onboarding(c) {
  const feature = (ico, title, text, action) => `<button type="button" class="sp-feature" ${action}>${i(ico, 20)}<b>${title}</b><span>${text}</span></button>`;
  return `<section class="surface sp-hero"><h2>Publique em todas as redes em minutos</h2>
    <p>Crie o conteúdo uma vez e publique automaticamente no Facebook, Instagram, LinkedIn, TikTok e muito mais.</p>
    <h3 class="sp-hero-sub">Conecte suas redes sociais</h3><p class="dim">Escolha onde quer publicar. Você pode adicionar ou remover redes quando quiser.</p>
    ${connectGrid(c)}<div class="sp-hero-actions"><button class="secondary" data-sp-invite>${i('link', 16)} Convidar cliente para conectar</button>${newPost('Começar com um rascunho')}</div></section>
    <section aria-label="Mais formas de planejar conteúdo"><h2 class="sp-feature-title">Mais formas de planejar conteúdo</h2><div class="sp-features">
    ${feature('upload', 'Agendamento em massa por CSV', 'Revise e importe várias publicações de uma vez.', 'data-sp-view="csv"')}
    ${feature('refresh', 'Fila evergreen', 'Reaproveite seus melhores posts em horários fixos.', 'data-sp-edit="socialCategories" data-evergreen')}
    ${feature('cal', 'Posts recorrentes', 'Programe posts que se repetem todo dia, semana ou mês.', 'data-sp-new data-recurring')}
    ${feature('link', 'Posts a partir de RSS', 'Crie posts automaticamente a partir de novos itens de um feed.', 'data-sp-view="rss"')}</div></section>`;
}

// ---- Calendar ------------------------------------------------------------------------------------
function calendarItems(c, start, end) {
  const zone = zoneOf(c), out = [];
  for (const p of c.s.socialPosts) {
    if (!visible(c, p)) continue;
    const at = p.status === 'published' ? p.publishedAt || p.scheduleDate : p.scheduleDate;
    if (!at) continue;
    const dates = p.recurrence?.freq && p.status === 'scheduled' ? occurrencesBetween(p, start, end) : Date.parse(at) >= start && Date.parse(at) < end ? [at] : [];
    dates.forEach((d, n) => out.push({ p, at: d, day: dayKey(d, zone), ghost: n > 0 }));
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}
const chip = (c, { p, at, ghost }) => `<button type="button" class="sp-chip st-${p.status}${ghost ? ' ghost' : ''}" data-sp-open="${p.id}" ${!ghost && !['published', 'in_progress'].includes(p.status) ? `draggable="true" data-sp-drag="${p.id}"` : ''}
  title="${h(textFor(p, accountsOf(c, p)[0]?.provider).slice(0, 200))}"><span class="sp-chip-top"><time>${clock(at, zoneOf(c))}</time>${[...new Set(accountsOf(c, p).map(a => a.provider))].slice(0, 4).map(id => logo(id, 14)).join('')}${p.recurrence?.freq ? i('refresh', 12) : ''}</span>
  <span class="sp-chip-text">${h((p.summary || (p.media.length ? '[mídia]' : '(sem texto)')).slice(0, 60))}</span></button>`;
function calendar(c) {
  const zone = zoneOf(c), cur = ui.cursor, today = dayKey(new Date().toISOString(), zone);
  let first, days;
  if (ui.mode === 'month') {
    first = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), 1)); first.setUTCDate(1 - first.getUTCDay()); days = 42;
  } else { first = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), cur.getUTCDate() - cur.getUTCDay())); days = 7; }
  const start = Date.parse(instant(`${first.toISOString().slice(0, 10)}T00:00`, zone)), end = start + days * 86_400_000 + 3_600_000;
  const items = calendarItems(c, start - 86_400_000, end + 86_400_000);
  const label = ui.mode === 'month' ? (m => m[0].toUpperCase() + m.slice(1))(new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(cur))
    : `${fmt(first.toISOString(), 'UTC')} – ${fmt(new Date(+first + 6 * 86_400_000).toISOString(), 'UTC')}`;
  const cells = Array.from({ length: days }, (_, n) => {
    const d = new Date(+first + n * 86_400_000), key = d.toISOString().slice(0, 10), mine = items.filter(x => x.day === key);
    const out = ui.mode === 'month' && d.getUTCMonth() !== cur.getUTCMonth();
    const shown = ui.mode === 'month' ? mine.slice(0, 3) : mine;
    return `<div class="sp-day${out ? ' out' : ''}${key === today ? ' today' : ''}${key < today ? ' past' : ''}" data-sp-day="${key}">
      <div class="sp-day-head"><span>${d.getUTCDate()}</span>${key >= today ? `<button type="button" class="sp-add" data-sp-new data-day="${key}" aria-label="Novo post em ${key}">${i('plus', 13)}</button>` : ''}</div>
      ${shown.map(x => chip(c, x)).join('')}${mine.length > shown.length ? `<button type="button" class="sp-more" data-sp-zoom="${key}">+${mine.length - shown.length} mais</button>` : ''}</div>`;
  }).join('');
  return `<div class="sp-cal-bar"><div class="sp-cal-nav"><button class="icon-btn" data-sp-move="-1" aria-label="Anterior">‹</button><button class="secondary" data-sp-move="0">Hoje</button><button class="icon-btn" data-sp-move="1" aria-label="Próximo">›</button><h2>${h(label)}</h2></div>
    ${segmented([['month', 'Mês'], ['week', 'Semana']], ui.mode, 'data-sp-mode')}</div>
    <div class="surface sp-cal ${ui.mode}"><div class="sp-week">${weekdays.map(w => `<span>${w}</span>`).join('')}</div><div class="sp-grid">${cells}</div></div>
    <p class="dim sp-hint">Arraste um post para outro dia para reagendar. Horários no fuso ${h(zone)}.</p>`;
}

// ---- List ----------------------------------------------------------------------------------------
function postList(c) {
  const zone = zoneOf(c), q = (c.query || '').toLowerCase();
  const rows = [...c.s.socialPosts].filter(p => visible(c, p) && (!q || `${p.summary} ${p.tags.join(' ')}`.toLowerCase().includes(q)))
    .sort((a, b) => (b.scheduleDate || b.created).localeCompare(a.scheduleDate || a.created));
  for (const id of [...ui.picked]) if (!rows.some(p => p.id === id)) ui.picked.delete(id);
  const body = rows.map(p => {
    const thumb = p.media[0] ? (mediaKind(p.media[0]) === 'video' ? `<span class="sp-thumb vid">${i('play', 16)}</span>` : `<img class="sp-thumb" src="${h(mediaSrc(c, p.media[0]))}" alt="">`) : '';
    const links = (p.results || []).filter(r => r.url).map(r => `<a class="text-link" href="${h(r.url)}" target="_blank" rel="noopener">${logo(c.s.socialAccounts.find(a => a.id === r.accountId)?.provider, 14)} ver</a>`).join(' ');
    return `<tr><td class="crm-pick"><input type="checkbox" data-sp-pick value="${p.id}" ${ui.picked.has(p.id) ? 'checked' : ''} aria-label="Selecionar post"></td>
      <td><div class="sp-row">${thumb}<div><b class="sp-row-text">${h((p.summary || '(sem texto)').slice(0, 120))}</b>${p.error ? `<small class="sp-err">${h(p.error.slice(0, 160))}</small>` : ''}${links ? `<small>${links}</small>` : ''}</div></div></td>
      <td><div class="sp-accts">${accountsOf(c, p).slice(0, 5).map(a => accountChip(a)).join('')}</div></td>
      <td>${p.scheduleDate ? `${fmt(p.status === 'published' ? p.publishedAt || p.scheduleDate : p.scheduleDate, zone, true)}${p.recurrence?.freq ? ` ${i('refresh', 12)}` : ''}` : '—'}</td>
      <td>${status(p.status)}${p.source !== 'post' ? ` <span class="dim">${h({ csv: 'CSV', rss: 'RSS', recurring: 'recorrente', queue: 'evergreen' }[p.source] || '')}</span>` : ''}</td>
      <td class="right sp-actions">${p.status === 'in_review' ? `<button class="secondary" data-sp-review="${p.id}">Revisar</button>` : ''}${p.status === 'failed' ? `<button class="secondary" data-sp-retry="${p.id}">${i('refresh', 14)} Tentar de novo</button>` : ''}
        <button class="icon-btn" data-sp-open="${p.id}" aria-label="Abrir post">${i('edit', 16)}</button><button class="icon-btn" data-sp-dup="${p.id}" aria-label="Duplicar post" title="Duplicar">${i('box', 16)}</button></td></tr>`;
  });
  const bulk = ui.picked.size ? `<div class="surface crm-bulk">${badge(`${ui.picked.size} selecionado(s)`, 'blue')}<button class="danger" data-sp-bulk-delete>${i('trash', 15)} Excluir</button><button class="secondary" data-sp-clear>Limpar seleção</button></div>` : '';
  return `${bulk}<div class="surface table-shell"><table><thead><tr><th></th><th>Post</th><th>Contas</th><th>Data</th><th>Status</th><th></th></tr></thead><tbody>${body.join('')}</tbody></table>
    ${rows.length ? '' : emptyBox('Nenhum post aqui', 'Crie um post ou mude os filtros.', newPost())}</div>`;
}
function filters(c) {
  const counts = Object.fromEntries(Object.keys(statusLabel).map(s => [s, c.s.socialPosts.filter(p => p.status === s).length]));
  return `<div class="toolbar sp-filters">${ui.view === 'list' ? `<label class="search">${i('search', 16)}<input id="page-search" value="${h(c.query)}" placeholder="Buscar posts…" aria-label="Buscar posts" autocomplete="off"></label>` : ''}
    <select data-sp-status aria-label="Status"><option value="all">Todos os status (${c.s.socialPosts.length})</option>${Object.entries(statusLabel).map(([k, v]) => `<option value="${k}" ${ui.status === k ? 'selected' : ''}>${v} (${counts[k]})</option>`).join('')}</select>
    <select data-sp-account aria-label="Conta"><option value="">Todas as contas</option>${c.s.socialAccounts.map(a => `<option value="${a.id}" ${ui.account === a.id ? 'selected' : ''}>${h(`${network(a.provider)?.name} · ${a.name}`)}</option>`).join('')}</select></div>`;
}

// ---- Accounts, categories, hashtags, RSS, CSV ----------------------------------------------------
function accountsView(c) {
  const rows = c.s.socialAccounts.map(a => `<tr><td><div class="sp-row">${accountChip(a)}<div><b>${h(a.name)}</b><small class="dim">${h([network(a.provider)?.name, a.kind, a.handle].filter(Boolean).join(' · '))}</small></div></div></td>
    <td>${a.status === 'connected' ? badge('Conectada', 'green') : `${badge('Reconectar', 'red')} <small class="sp-err">${h(a.error || '')}</small>`}</td><td>${fmt(a.connectedAt, zoneOf(c))}</td>
    <td class="right">${a.status !== 'connected' ? `<button class="secondary" data-sp-connect="${a.provider}">Reconectar</button>` : ''}<button class="danger plain" data-sp-disconnect="${a.id}">Desconectar</button></td></tr>`);
  return `${rows.length ? `<div class="surface table-shell"><table><thead><tr><th>Conta</th><th>Status</th><th>Conectada em</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table></div>` : ''}
    <section class="surface padded sp-section"><h2>Conectar outra conta</h2>${connectGrid(c)}<div class="sp-hero-actions"><button class="secondary" data-sp-invite>${i('link', 16)} Convidar cliente para conectar</button></div></section>`;
}
function categoriesView(c) {
  const cards = c.s.socialCategories.map(cat => {
    const n = c.s.socialPosts.filter(p => p.categoryId === cat.id && !p.parentId).length;
    return `<article class="surface sp-card"><div class="sp-card-head"><span class="sp-dot" style="background:${h(cat.color)}"></span><b>${h(cat.name)}</b>${cat.evergreen ? badge('Evergreen', 'green') : ''}</div>
      <p class="dim">${n} post(s)${cat.evergreen ? ` · ${cat.slots.map(s => `${weekdays[s.day]} ${s.time}`).join(', ')}` : ''}</p><button class="secondary" data-sp-edit="socialCategories" data-id="${cat.id}">${i('edit', 15)} Editar</button></article>`;
  }).join('');
  return `<p class="dim sp-intro">Organize posts por tema. Ative a fila evergreen para que os posts publicados ou rascunhos da categoria voltem a ser publicados, em rodízio, nos horários escolhidos.</p>
    <div class="sp-cards">${cards || emptyBox('Nenhuma categoria', 'Crie categorias para organizar e reciclar conteúdo.')}</div>`;
}
function hashtagsView(c) {
  return `<p class="dim sp-intro">Guarde grupos de hashtags e insira com um clique no compositor.</p><div class="sp-cards">${c.s.socialHashtags.map(g => `<article class="surface sp-card"><div class="sp-card-head"><b>${h(g.name)}</b><span class="dim">${g.tags.length} tags</span></div>
    <p class="sp-tags">${g.tags.slice(0, 18).map(t => `#${h(t)}`).join(' ')}</p><button class="secondary" data-sp-edit="socialHashtags" data-id="${g.id}">${i('edit', 15)} Editar</button></article>`).join('') || emptyBox('Nenhum grupo de hashtags', 'Crie grupos para reutilizar nas publicações.')}</div>`;
}
function rssView(c) {
  return `<p class="dim sp-intro">O planejador lê cada feed a cada 30 minutos e cria um post para cada item novo, como rascunho ou já agendado.</p><div class="sp-cards">${c.s.socialFeeds.map(f => `<article class="surface sp-card"><div class="sp-card-head"><b>${h(f.name)}</b>${f.active ? badge(f.mode === 'schedule' ? 'Publica automático' : 'Cria rascunhos', f.mode === 'schedule' ? 'green' : 'blue') : badge('Pausado')}</div>
    <p class="dim sp-break">${h(f.url)}</p><p class="dim">${f.lastChecked ? `Lido em ${fmt(f.lastChecked, zoneOf(c), true)}` : 'Ainda não lido'}${f.error ? ` · <span class="sp-err">${h(f.error)}</span>` : ''}</p>
    <div class="sp-accts">${f.accountIds.map(id => c.s.socialAccounts.find(a => a.id === id)).filter(Boolean).map(a => accountChip(a)).join('')}</div><button class="secondary" data-sp-edit="socialFeeds" data-id="${f.id}">${i('edit', 15)} Editar</button></article>`).join('') || emptyBox('Nenhum feed RSS', 'Adicione um feed para gerar posts automaticamente.')}</div>`;
}
function csvView(c) {
  const history = [...c.s.socialImports].reverse().map(x => `<tr><td>${h(x.file || 'CSV')}</td><td>${typeof x.created === 'string' ? fmt(x.created, zoneOf(c), true) : '—'}</td><td>${x.count ?? x.created} de ${x.total}</td><td>${x.errors.length ? `<details><summary>${x.errors.length} erro(s)</summary><small>${x.errors.map(h).join('<br>')}</small></details>` : badge('Sem erros', 'green')}</td></tr>`).join('');
  const valid = csv.review.filter(r => !r.error).length;
  const steps = ['Carregar arquivo', 'Selecionar contas', 'Revisar conteúdo'];
  const content = [
    `<p class="dim">Carregue até 300 posts em um arquivo CSV de até 1 MB. Use datas no formato AAAA-MM-DD HH:MM, no fuso ${h(zoneOf(c))}. Linhas sem data viram rascunhos.</p>
    <div class="sp-csv-templates"><button type="button" class="secondary" data-sp-template="basic">${i('download', 16)} Modelo básico</button><button type="button" class="secondary" data-sp-template="advanced">${i('download', 16)} Modelo avançado</button></div>
    <label class="sp-csv-file">Arquivo CSV<input type="file" name="file" accept=".csv,text/csv" ${csv.file ? '' : 'required'}></label>${csv.file ? `<p class="dim">${h(csv.file)} · ${csv.rows.length} linhas</p>` : ''}`,
    `<p class="dim">${h(csv.file)} · ${csv.rows.length} linhas. As contas indicadas em cada linha precisam estar entre as selecionadas aqui.</p>
    <fieldset class="sp-block"><legend>Contas de destino</legend><div class="sp-picks">${c.s.socialAccounts.filter(a => a.status === 'connected').map(a => `<label class="sp-pick"><input type="checkbox" name="account" value="${h(a.id)}" ${csv.accountIds.includes(a.id) ? 'checked' : ''}>${accountChip(a)} ${h(a.name)}</label>`).join('') || '<p class="dim">Você pode continuar sem contas se importar como rascunho.</p>'}</div></fieldset>
    <label class="check"><input type="checkbox" name="asDraft" ${csv.asDraft ? 'checked' : ''}> Importar tudo como rascunho</label>
    <label class="check"><input type="checkbox" name="needsApproval" ${csv.needsApproval ? 'checked' : ''}> Enviar posts com data para aprovação</label>`,
    `<p class="dim">${valid} de ${csv.rows.length} linhas prontas para importar. ${valid < csv.rows.length ? 'As linhas com erro serão ignoradas. Para corrigi-las, volte e carregue o arquivo ajustado.' : 'Confira os destinos e as datas antes de confirmar.'}</p>
    <div class="table-shell sp-csv-review"><table><thead><tr><th>Linha</th><th>Conteúdo</th><th>Data</th><th>Resultado</th></tr></thead><tbody>
    ${csv.review.map(r => `<tr><td>${r.index + 2}</td><td>${h((csv.rows[r.index]?.content || '(mídia)').slice(0, 100))}</td><td>${r.date ? fmt(r.date, zoneOf(c), true) : '—'}</td>
    <td>${r.error ? `<span class="sp-err">${h(r.error)}</span>` : `${status(r.status)} <small class="dim">${r.accounts} conta(s)</small>`}</td></tr>`).join('')}</tbody></table></div>`
  ];
  return `<section class="surface padded sp-section"><h2>Agendar posts por CSV</h2>
    <ol class="sp-csv-steps" aria-label="Etapas da importação">${steps.map((step, n) => `<li ${n + 1 === csv.step ? 'aria-current="step"' : ''}><span>${n + 1}</span>${step}</li>`).join('')}</ol>
    <form class="sp-csv" data-sp-csv>${content[csv.step - 1]}<p class="form-status" role="alert"></p><footer class="sp-foot">
    ${csv.step > 1 ? '<button type="button" class="secondary" data-sp-csv-back>Voltar</button>' : ''}
    <span class="spacer"></span><button class="primary" ${csv.step === 3 && !valid ? 'disabled' : ''}>${csv.step === 3 ? `Importar ${valid} post(s)` : csv.step === 2 ? 'Revisar posts' : 'Continuar'}</button></footer></form></section>
    ${history ? `<div class="surface table-shell"><table><thead><tr><th>Arquivo</th><th>Quando</th><th>Criados</th><th>Resultado</th></tr></thead><tbody>${history}</tbody></table></div>` : ''}`;
}

export function socialPlanner(c, { pageShell, utabs, marketingTabs }) {
  if (plannerWorkspace !== c.workspace) {
    plannerWorkspace = c.workspace;
    csv = freshCsv(); ui.account = ''; ui.status = 'all'; ui.picked.clear();
  }
  const hasAccounts = c.s.socialAccounts.length > 0;
  const actions = { categories: `<button class="primary" data-sp-edit="socialCategories">${i('plus', 16)} Nova categoria</button>`, hashtags: `<button class="primary" data-sp-edit="socialHashtags">${i('plus', 16)} Novo grupo</button>`,
    rss: `<button class="primary" data-sp-edit="socialFeeds" ${hasAccounts ? '' : 'disabled'}>${i('plus', 16)} Novo feed</button>` };
  const viewItems = views.map(([v, label, ico]) => ({ value: v, label, icon: ico, attrs: `data-sp-view="${v}" aria-pressed="${v === ui.view}"` }));
  const isEmptyStart = !hasAccounts && !c.s.socialPosts.length && ['calendar', 'list'].includes(ui.view);
  let inner;
  if (isEmptyStart) {
    inner = onboarding(c);
  } else {
    const review = c.s.socialPosts.filter(p => p.status === 'in_review').length, failed = c.s.socialPosts.filter(p => p.status === 'failed').length;
    const notes = `${review ? `<div class="sp-note">${i('bell', 15)} ${review} post(s) aguardando aprovação. <button class="text-link" data-sp-status-pick="in_review">Ver</button></div>` : ''}${failed ? `<div class="sp-note bad">${i('alert', 15)} ${failed} post(s) falharam. <button class="text-link" data-sp-status-pick="failed">Ver</button></div>` : ''}`;
    const content = { calendar: () => filters(c) + calendar(c), list: () => filters(c) + postList(c), accounts: () => accountsView(c), categories: () => categoriesView(c), hashtags: () => hashtagsView(c), rss: () => rssView(c), csv: () => csvView(c) }[ui.view]();
    inner = `${notes}${content}`;
  }
  const plannerCard = utabs({
    key: 'social-views',
    nested: true,
    label: 'Visualizações do planejador social',
    items: viewItems,
    current: ui.view,
    content: inner
  });
  return pageShell({
    title: 'Marketing',
    desc: 'Planeje, aprove e publique nas suas redes sociais a partir de um só lugar.',
    cta: actions[ui.view] || newPost(),
    className: 'sp',
    tabs: { key: 'marketing', items: marketingTabs, current: 'social', label: 'Seções de marketing' },
    content: plannerCard
  });
}

// ---- Composer ------------------------------------------------------------------------------------
const blankDraft = (c, day) => {
  const connected = c.s.socialAccounts.filter(a => a.status === 'connected');
  return { id: '', type: 'post', summary: '', overrides: {}, accountIds: connected.length === 1 ? [connected[0].id] : [],
    media: [], link: '', firstComment: '', categoryId: '', tags: [], needsApproval: false, recurrence: null, mode: connected.length ? 'schedule' : 'draft',
    when: day ? `${day}T09:00` : wall(new Date(Date.now() + 3_600_000).toISOString(), zoneOf(c)), preview: '' };
};
function composerHtml(c) {
  const d = ui.draft, zone = zoneOf(c), locked = d.status === 'published';
  const accts = c.s.socialAccounts.map(a => `<label class="sp-pick ${d.accountIds.includes(a.id) ? 'on' : ''}"><input type="checkbox" name="account" value="${a.id}" ${d.accountIds.includes(a.id) ? 'checked' : ''} ${locked ? 'disabled' : ''}>${accountChip(a)}<span>${h(a.name)}</span></label>`).join('')
    || `<p class="dim">Nenhuma conta conectada. O post ficará como rascunho. <button type="button" class="text-link" data-sp-goto="accounts">Conectar contas</button></p>`;
  const drive = c.s.files.filter(f => f.data.startsWith('data:image/') && !f.trashedAt);
  return `<form class="sp-composer" data-sp-form="post"><div class="sp-compose-main">
    <fieldset class="sp-block"><legend>Publicar em</legend><div class="sp-picks">${accts}</div></fieldset>
    <div class="field-grid"><label>Tipo<select name="type" ${locked ? 'disabled' : ''}>${postTypes.map(([v, l]) => `<option value="${v}" ${d.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Categoria<select name="categoryId"><option value="">Sem categoria</option>${c.s.socialCategories.map(x => `<option value="${x.id}" ${d.categoryId === x.id ? 'selected' : ''}>${h(x.name)}</option>`).join('')}</select></label></div>
    <label>Texto<textarea name="summary" rows="6" placeholder="O que você quer compartilhar?" ${locked ? 'readonly' : ''}>${h(d.summary)}</textarea></label>
    <div class="sp-tools">${c.s.socialHashtags.length ? `<select data-sp-hashtags aria-label="Inserir hashtags"><option value="">#  Inserir grupo de hashtags</option>${c.s.socialHashtags.map(g => `<option value="${g.id}">${h(g.name)}</option>`).join('')}</select>` : ''}<span id="sp-counters" class="sp-counters"></span></div>
    <details class="sp-block" ${Object.keys(d.overrides).length ? 'open' : ''}><summary>Personalizar texto por rede</summary><div id="sp-overrides"></div></details>
    <fieldset class="sp-block"><legend>Mídia</legend><div id="sp-media" class="sp-media"></div>
      ${drive.length ? `<details><summary>Escolher do Mídia Drive (${drive.length})</summary><div class="sp-drive">${drive.map(f => `<button type="button" class="sp-drive-item" data-sp-file="${f.id}" title="${h(f.name)}"><img src="${h(f.data)}" alt="${h(f.name)}"></button>`).join('')}</div></details>` : '<p class="dim">Envie imagens no Mídia Drive para usar aqui.</p>'}
      <div class="sp-url"><input type="url" name="mediaUrl" placeholder="https://… (imagem ou vídeo público)" aria-label="URL da mídia"><button type="button" class="secondary" data-sp-add-url>Adicionar URL</button></div></fieldset>
    <div class="field-grid"><label>Link<input type="url" name="link" value="${h(d.link)}" placeholder="https://"></label><label>Primeiro comentário<input name="firstComment" value="${h(d.firstComment)}" maxlength="2200"></label></div>
    <label>Tags internas<input name="tags" value="${h(d.tags.join(', '))}" placeholder="lançamento, promoção"></label>
    <fieldset class="sp-block"><legend>Quando publicar</legend><div class="sp-seg sp-when">${[['now', 'Publicar agora'], ['schedule', 'Agendar'], ['draft', 'Rascunho']].map(([v, l]) => `<label class="${d.mode === v ? 'on' : ''}"><input type="radio" name="mode" value="${v}" ${d.mode === v ? 'checked' : ''}>${l}</label>`).join('')}</div>
      <div class="field-grid" ${d.mode === 'schedule' ? '' : 'hidden'} data-sp-schedule><label>Data e hora (${h(zone)})<input type="datetime-local" name="when" value="${h(d.when)}"></label>
        <label>Repetir<select name="freq">${recurrences.map(([v, l]) => `<option value="${v}" ${(d.recurrence?.freq || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label ${d.recurrence?.freq ? '' : 'hidden'} data-sp-rec>A cada<input type="number" name="interval" min="1" max="30" value="${d.recurrence?.interval || 1}"></label>
        <label ${d.recurrence?.freq ? '' : 'hidden'} data-sp-rec>Até (opcional)<input type="date" name="until" value="${h((d.recurrence?.until || '').slice(0, 10))}"></label></div>
      <label class="check"><input type="checkbox" name="needsApproval" ${d.needsApproval ? 'checked' : ''}> Exigir aprovação antes de publicar</label></fieldset>
    <ul id="sp-issues" class="sp-issues"></ul>
    ${d.results?.length ? `<fieldset class="sp-block"><legend>Resultado</legend>${d.results.map(r => { const a = c.s.socialAccounts.find(x => x.id === r.accountId); return `<p>${a ? accountChip(a) : ''} ${r.ok ? badge('Publicado', 'green') : badge('Falhou', 'red')} ${r.url ? `<a class="text-link" href="${h(r.url)}" target="_blank" rel="noopener">Abrir</a>` : ''} <small class="sp-err">${h(r.error || '')}</small></p>`; }).join('')}</fieldset>` : ''}
    ${d.reviewNote ? `<p class="sp-note">${i('note', 15)} Revisão: ${h(d.reviewNote)}</p>` : ''}
    </div><aside class="sp-compose-side"><div id="sp-preview"></div></aside>
    <footer class="sp-foot">${d.id && d.status !== 'in_progress' ? `<button type="button" class="danger plain" data-sp-delete="${d.id}">${i('trash', 16)} Excluir</button>` : ''}${d.id ? `<button type="button" class="secondary" data-sp-dup="${d.id}">Duplicar</button>` : ''}<span class="spacer"></span>
      <p class="form-status" role="alert"></p><button type="button" class="secondary" data-act="close">Cancelar</button>${locked ? '' : `<button class="primary" id="sp-submit">Salvar</button>`}</footer></form>`;
}
function previewHtml(c) {
  const d = ui.draft, chosen = c.s.socialAccounts.filter(a => d.accountIds.includes(a.id));
  const providers = [...new Set(chosen.map(a => a.provider))];
  if (!providers.includes(d.preview)) d.preview = providers[0] || '';
  const a = chosen.find(x => x.provider === d.preview), n = network(d.preview);
  const text = textFor(d, d.preview), media = d.media.map(m => ({ ...m, src: mediaSrc(c, m) }));
  const mediaGrid = media.length ? `<div class="sp-pv-media n${Math.min(media.length, 4)}">${media.slice(0, 4).map(m => mediaKind(m) === 'video' ? `<div class="sp-pv-vid">${i('play', 28)}</div>` : `<img src="${h(m.src)}" alt="">`).join('')}</div>` : '';
  const limit = n ? n.limit : 0, cut = d.preview === 'instagram' || d.preview === 'facebook' ? 220 : 400;
  const card = a ? `<div class="sp-pv sp-pv-${d.preview}"><div class="sp-pv-head">${accountChip(a)}<div><b>${h(a.name)}</b><small>agora · ${n.name}</small></div></div>
    ${d.preview === 'instagram' || d.preview === 'tiktok' ? mediaGrid : ''}<p class="sp-pv-text">${h(text.slice(0, cut))}${text.length > cut ? '<span class="dim">… ver mais</span>' : ''}</p>
    ${d.preview !== 'instagram' && d.preview !== 'tiktok' ? mediaGrid : ''}${d.link && !media.length ? `<div class="sp-pv-link">${i('link', 14)} ${h(d.link)}</div>` : ''}
    ${d.firstComment ? `<p class="sp-pv-comment"><b>${h(a.name)}</b> ${h(d.firstComment)}</p>` : ''}${text.length > limit ? `<p class="sp-err">Passa do limite de ${limit} caracteres.</p>` : ''}</div>`
    : `<div class="sp-pv-empty">${i('monitor', 26)}<p>Escolha uma conta para ver a prévia.</p></div>`;
  return `<div class="sp-pv-tabs">${providers.map(p => `<button type="button" data-sp-preview="${p}" class="${p === d.preview ? 'on' : ''}" aria-label="Prévia ${network(p).name}">${logo(p, 22)}</button>`).join('')}</div>${card}`;
}
function refreshComposer(c) {
  const d = ui.draft, form = document.querySelector('[data-sp-form="post"]'); if (!form) return;
  const providers = [...new Set(c.s.socialAccounts.filter(a => d.accountIds.includes(a.id)).map(a => a.provider))];
  document.querySelector('#sp-counters').innerHTML = providers.map(p => { const n = network(p), len = textFor(d, p).length; return `<span class="${len > n.limit ? 'over' : ''}">${logo(p, 14)} ${len}/${n.limit}</span>`; }).join('');
  const over = document.querySelector('#sp-overrides');
  if (over && over.dataset.for !== providers.join()) {
    over.dataset.for = providers.join();
    over.innerHTML = providers.length ? providers.map(p => `<label>${logo(p, 16)} ${network(p).name}<textarea name="override-${p}" rows="3" placeholder="Usa o texto principal">${h(d.overrides[p] || '')}</textarea></label>`).join('') : '<p class="dim">Escolha contas primeiro.</p>';
  }
  document.querySelector('#sp-media').innerHTML = d.media.map((m, n) => `<span class="sp-media-item">${mediaKind(m) === 'video' ? `<span class="sp-thumb vid">${i('play', 16)}</span>` : `<img src="${h(mediaSrc(c, m))}" alt="">`}<button type="button" class="icon-btn" data-sp-unmedia="${n}" aria-label="Remover mídia">${i('close', 13)}</button></span>`).join('') || '<p class="dim">Nenhuma mídia.</p>';
  document.querySelectorAll('[data-sp-file]').forEach(b => b.classList.toggle('on', d.media.some(m => m.fileId === b.dataset.spFile)));
  const issues = d.mode === 'draft' ? [] : postIssues(d, c.s.socialAccounts);
  document.querySelector('#sp-issues').innerHTML = issues.map(x => `<li>${i('alert', 14)} ${h(x)}</li>`).join('');
  document.querySelector('#sp-preview').innerHTML = previewHtml(c);
  const submit = document.querySelector('#sp-submit');
  if (submit) submit.textContent = d.mode === 'draft' ? 'Salvar rascunho' : d.needsApproval && d.approval !== 'approved' ? 'Enviar para aprovação' : d.mode === 'now' ? 'Publicar agora' : 'Agendar';
}
function readComposer(c, form) {
  const d = ui.draft, f = form.elements;
  d.accountIds = [...form.querySelectorAll('[name="account"]:checked')].map(x => x.value);
  form.querySelectorAll('.sp-pick').forEach(l => l.classList.toggle('on', l.querySelector('input').checked));
  Object.assign(d, { type: f.type.value, summary: f.summary.value, categoryId: f.categoryId.value, link: f.link.value.trim(), firstComment: f.firstComment.value,
    tags: f.tags.value.split(',').map(t => t.trim()).filter(Boolean), needsApproval: f.needsApproval.checked, mode: f.mode.value, when: f.when.value });
  d.recurrence = f.freq.value ? { freq: f.freq.value, interval: Number(f.interval.value) || 1, until: f.until.value } : null;
  for (const n of networks) { const t = f[`override-${n.id}`]; if (t) { if (t.value.trim()) d.overrides[n.id] = t.value; else delete d.overrides[n.id]; } }
  form.querySelector('[data-sp-schedule]').hidden = d.mode !== 'schedule';
  form.querySelectorAll('[data-sp-rec]').forEach(x => { x.hidden = !d.recurrence; });
  form.querySelectorAll('.sp-when label').forEach(l => l.classList.toggle('on', l.querySelector('input').checked));
  d.scheduleDate = d.mode === 'schedule' ? instant(d.when, zoneOf(c)) : '';
}

// ---- Events --------------------------------------------------------------------------------------
export function socialEvents({ c, G, api, url, mutate, render, flash, dialog, close, load }) {
  const withState = d => { c.s = d.state; c.m = d.metrics; };
  const user = () => { try { return localStorage.getItem('go.user') || ''; } catch { return ''; } };
  const wide = () => G('#dialog')?.classList.add('sp-dialog');
  const openComposer = (id, day, recurring = false) => {
    const p = id ? c.s.socialPosts.find(x => x.id === id) : null;
    if (id && !p) return;
    ui.draft = p ? { ...structuredClone(p), mode: p.status === 'draft' ? 'draft' : 'schedule', when: wall(p.scheduleDate || new Date(Date.now() + 3_600_000).toISOString(), zoneOf(c)), preview: '' } : blankDraft(c, day);
    if (recurring) Object.assign(ui.draft, { mode: 'schedule', recurrence: { freq: 'weekly', interval: 1, until: '' } });
    const title = !p ? 'Novo post' : p.status === 'published' ? 'Post publicado' : 'Editar post';
    dialog(title, composerHtml(c), { description: p ? `${statusLabel[p.status]}${p.createdBy ? ` · criado por ${p.createdBy}` : ''}` : 'Escreva uma vez e publique em várias redes.' });
    wide(); refreshComposer(c);
  };
  const publishNow = async () => {
    const d = await api(url('/api/social/run'), {}); withState(d);
    const failed = c.s.socialPosts.filter(p => p.status === 'failed' && Date.parse(p.publishedAt || 0) > Date.now() - 120_000);
    flash(d.published ? failed.length ? 'Alguns posts falharam. Veja os detalhes na lista.' : 'Post publicado.' : 'Nada para publicar agora.', Boolean(failed.length));
  };
  const recordDialog = (key, id, evergreen = false) => {
    const r = id ? c.s[key].find(x => x.id === id) : null; if (id && !r) return;
    const acctBoxes = (chosen = []) => `<div class="sp-picks">${c.s.socialAccounts.map(a => `<label class="sp-pick ${chosen.includes(a.id) ? 'on' : ''}"><input type="checkbox" name="accountIds" value="${a.id}" ${chosen.includes(a.id) ? 'checked' : ''}>${accountChip(a)}<span>${h(a.name)}</span></label>`).join('') || '<p class="dim">Conecte contas primeiro.</p>'}</div>`;
    const body = {
      socialCategories: () => `<label>Nome<input name="name" value="${h(r?.name || '')}" required maxlength="60"></label><label>Cor<input type="color" name="color" value="${h(r?.color || '#ea580c')}"></label>
        <label class="check"><input type="checkbox" name="evergreen" ${r?.evergreen || evergreen ? 'checked' : ''}> Fila evergreen (republicar em rodízio)</label>
        <fieldset class="sp-block"><legend>Horários da fila</legend><div data-sp-slots>${(r?.slots || (evergreen ? [undefined] : [])).map(s => slotRow(s)).join('')}</div><button type="button" class="secondary" data-sp-slot>${i('plus', 14)} Horário</button></fieldset>
        <fieldset class="sp-block"><legend>Contas da fila</legend>${acctBoxes(r?.accountIds || [])}</fieldset>`,
      socialHashtags: () => `<label>Nome do grupo<input name="name" value="${h(r?.name || '')}" required maxlength="60"></label><label>Hashtags<textarea name="tags" rows="4" placeholder="#marketing #vendas">${h((r?.tags || []).map(t => `#${t}`).join(' '))}</textarea></label>`,
      socialFeeds: () => `<label>Nome<input name="name" value="${h(r?.name || '')}" required maxlength="80"></label><label>URL do feed (RSS ou Atom)<input type="url" name="url" value="${h(r?.url || '')}" required></label>
        <label>Modelo do texto<textarea name="template" rows="3">${h(r?.template || '{{title}}\n\n{{link}}')}</textarea></label><p class="dim">Use {{title}}, {{link}} e {{summary}}.</p>
        <label>Ao encontrar item novo<select name="mode"><option value="draft">Criar rascunho para revisar</option><option value="schedule" ${r?.mode === 'schedule' ? 'selected' : ''}>Publicar automaticamente</option></select></label>
        <label class="check"><input type="checkbox" name="active" ${!r || r.active ? 'checked' : ''}> Ativo</label><fieldset class="sp-block"><legend>Contas</legend>${acctBoxes(r?.accountIds || [])}</fieldset>`
    }[key]();
    const names = { socialCategories: 'categoria', socialHashtags: 'grupo de hashtags', socialFeeds: 'feed RSS' };
    dialog(`${r ? 'Editar' : 'Novo'} ${names[key]}`, `<form data-sp-record="${key}" data-id="${id || ''}">${body}<p class="form-status" role="alert"></p><footer class="sp-foot">${r ? `<button type="button" class="danger plain" data-sp-remove="${key}" data-id="${id}">${i('trash', 16)} Excluir</button>` : ''}<span class="spacer"></span><button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary">Salvar</button></footer></form>`);
  };
  const slotRow = (s = { day: 1, time: '09:00' }) => `<div class="sp-slot"><select name="slotDay">${weekdays.map((w, n) => `<option value="${n}" ${s.day === n ? 'selected' : ''}>${w}</option>`).join('')}</select><input type="time" name="slotTime" value="${h(s.time)}" required><button type="button" class="icon-btn" data-sp-unslot aria-label="Remover horário">${i('trash', 14)}</button></div>`;
  const connect = provider => {
    const n = network(provider);
    if (provider === 'bluesky') {
      dialog('Conectar Bluesky', `<form data-sp-bluesky><p class="dim">Crie uma senha de app em Bluesky → Configurações → Privacidade e segurança → Senhas de app. Não use sua senha principal.</p>
        <label>Usuário<input name="identifier" placeholder="voce.bsky.social" required autocomplete="off"></label><label>Senha de app<input name="password" placeholder="xxxx-xxxx-xxxx-xxxx" required autocomplete="off"></label>
        <p class="form-status" role="alert"></p><footer class="sp-foot"><span class="spacer"></span><button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary">Conectar</button></footer></form>`);
      return;
    }
    if (!c.features?.social?.[provider]) {
      const cb = `${location.origin}/api/social/callback/${provider === 'instagram' ? 'facebook' : provider}`;
      dialog(`Configurar ${n.name}`, `<p>Para conectar ${n.name}, a plataforma precisa das chaves de um app de desenvolvedor da rede. Defina as variáveis de ambiente abaixo no servidor e reinicie:</p>
        <ul class="sp-env">${n.env.map(e => `<li><code>${e}</code></li>`).join('')}</ul><p>URL de redirecionamento (OAuth) para cadastrar no app:</p><p><code class="sp-break">${h(cb)}</code></p>`, { description: 'Chaves ainda não configuradas' });
      return;
    }
    const acting = c.access?.session ? '' : '&user=' + encodeURIComponent(user());
    window.open(url(`/api/social/connect/${provider}`) + acting, 'soci-social', 'width=620,height=760');
  };
  const pickAccounts = async requestId => {
    const d = await api(url('/api/social/candidates'), { requestId });
    dialog('Escolha as contas', `<form data-sp-attach="${h(requestId)}"><div class="sp-cands">${d.candidates.map(x => `<label class="sp-cand"><input type="checkbox" name="pick" value="${x.index}" ${x.provider === d.provider || d.candidates.length === 1 ? 'checked' : ''}>
      ${x.avatar ? `<img src="${h(x.avatar)}" alt="" referrerpolicy="no-referrer">` : logo(x.provider, 32)}<span><b>${h(x.name)}</b><small class="dim">${h([network(x.provider).name, x.kind, x.handle].filter(Boolean).join(' · '))}${x.connected ? ' · já conectada' : ''}</small></span>${logo(x.provider, 18)}</label>`).join('')}</div>
      <p class="form-status" role="alert"></p><footer class="sp-foot"><span class="spacer"></span><button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary">Conectar selecionadas</button></footer></form>`, { description: 'Selecione as páginas, perfis ou canais que o planejador poderá usar.' });
  };
  window.addEventListener('message', ev => {
    if (ev.origin !== location.origin || (ev.data?.type !== 'soci-social' && ev.data?.type !== 'graao-social')) return;
    if (ev.data.error) { flash(ev.data.error, true); return; }
    pickAccounts(ev.data.requestId).catch(e => flash(e.message, true));
  });
  const fail = (form, e) => { const s = form?.querySelector('.form-status'); if (s) s.textContent = e.message; else flash(e.message, true); };
  const inviteDialog = ({ expires, url: link }) => {
    dialog('Convidar cliente para conectar', `<form data-sp-invite-form>
      <p>Qualquer pessoa com este link pode adicionar contas de redes sociais a esta subconta até o prazo escolhido. Ela precisa autorizar as contas na própria rede.</p>
      ${expires ? `<p class="dim">Convite ativo até ${h(fmt(new Date(expires).toISOString(), zoneOf(c), true))}. Gerar outro invalida o link anterior.</p>` : ''}
      ${link ? '<label>Link do convite<input name="inviteUrl" readonly></label><button type="button" class="secondary" data-sp-copy-invite>Copiar link</button>' : ''}
      <label>Prazo de validade<select name="hours"><option value="1">1 hora</option><option value="24" selected>1 dia</option><option value="72">3 dias</option><option value="168">7 dias</option></select></label>
      <p class="form-status" role="alert"></p><footer class="sp-foot">${expires ? '<button type="button" class="secondary" data-sp-revoke-invite>Revogar convite</button>' : ''}<span class="spacer"></span><button class="primary">Gerar link</button></footer></form>`);
    if (link) G('input[name="inviteUrl"]').value = link;
  };

  document.addEventListener('click', async ev => {
    const t = ev.target.closest('[data-sp-view],[data-sp-mode],[data-sp-move],[data-sp-new],[data-sp-open],[data-sp-dup],[data-sp-retry],[data-sp-review],[data-sp-connect],[data-sp-disconnect],[data-sp-edit],[data-sp-remove],[data-sp-delete],[data-sp-preview],[data-sp-file],[data-sp-add-url],[data-sp-unmedia],[data-sp-goto],[data-sp-zoom],[data-sp-status-pick],[data-sp-bulk-delete],[data-sp-clear],[data-sp-template],[data-sp-slot],[data-sp-unslot],[data-sp-decide],[data-sp-csv-back],[data-sp-invite],[data-sp-copy-invite],[data-sp-revoke-invite]');
    if (!t) return;
    const ds = t.dataset;
    try {
      if (ds.spView) { ui.view = ds.spView; c.query = ''; render(); return; }
      if (ds.spCsvBack !== undefined) { csv.step = Math.max(1, csv.step - 1); render(); return; }
      if (ds.spInvite !== undefined) { inviteDialog(await api(url('/api/social/invite'), { action: 'status' })); return; }
      if (ds.spCopyInvite !== undefined) {
        const field = t.form.elements.inviteUrl;
        field.select();
        try { await navigator.clipboard.writeText(field.value); flash('Link copiado.'); } catch { flash('Link selecionado para copiar.'); }
        return;
      }
      if (ds.spRevokeInvite !== undefined) { inviteDialog(await api(url('/api/social/invite'), { action: 'revoke' })); flash('Convite revogado.'); return; }
      if (ds.spGoto) { close(); ui.view = ds.spGoto; render(); return; }
      if (ds.spMode) { ui.mode = ds.spMode; render(); return; }
      if (ds.spMove !== undefined) {
        const n = Number(ds.spMove), d = new Date(ui.cursor);
        if (!n) ui.cursor = new Date(); else if (ui.mode === 'month') { d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); ui.cursor = d; } else { d.setUTCDate(d.getUTCDate() + 7 * n); ui.cursor = d; }
        render(); return;
      }
      if (ds.spZoom) { ui.mode = 'week'; ui.cursor = new Date(`${ds.spZoom}T12:00:00Z`); render(); return; }
      if (ds.spStatusPick) { ui.status = ds.spStatusPick; ui.view = 'list'; render(); return; }
      if (t.hasAttribute('data-sp-new')) { ev.stopPropagation(); openComposer('', ds.day, ds.recurring !== undefined); return; }
      if (ds.spOpen) { openComposer(ds.spOpen); return; }
      if (ds.spDup) { const id = await mutate({ type: 'social-duplicate', id: ds.spDup }); close(); render(); flash('Post duplicado como rascunho.'); openComposer(id); return; }
      if (ds.spRetry) { await mutate({ type: 'social-retry', id: ds.spRetry }); render(); await publishNow(); render(); return; }
      if (ds.spReview) {
        const p = c.s.socialPosts.find(x => x.id === ds.spReview);
        dialog('Revisar post', `<div class="sp-review"><div class="sp-accts">${accountsOf(c, p).map(a => accountChip(a)).join('')}</div><p class="pre-wrap">${h(p.summary)}</p>
          <p class="dim">${p.scheduleDate ? `Agendado para ${fmt(p.scheduleDate, zoneOf(c), true)}` : ''}</p><label>Comentário (opcional)<textarea id="sp-review-note" rows="3"></textarea></label>
          <footer class="sp-foot"><span class="spacer"></span><button class="secondary" data-sp-decide="rejected" data-id="${p.id}">Rejeitar</button><button class="primary" data-sp-decide="approved" data-id="${p.id}">Aprovar</button></footer></div>`);
        return;
      }
      if (ds.spDecide) {
        await mutate({ type: 'social-review', id: ds.id, data: { decision: ds.spDecide, note: G('#sp-review-note')?.value || '' } });
        close(); render(); flash(ds.spDecide === 'approved' ? 'Post aprovado e agendado.' : 'Post devolvido para rascunho.');
        if (ds.spDecide === 'approved' && Date.parse(c.s.socialPosts.find(p => p.id === ds.id)?.scheduleDate || 0) <= Date.now()) { await publishNow(); render(); }
        return;
      }
      if (ds.spConnect) { connect(ds.spConnect); return; }
      if (ds.spDisconnect) {
        const a = c.s.socialAccounts.find(x => x.id === ds.spDisconnect);
        if (!confirm(`Desconectar ${a.name}? Posts agendados só para esta conta voltam a ser rascunhos.`)) return;
        withState(await api(url('/api/social/disconnect'), { id: a.id })); render(); flash('Conta desconectada.'); return;
      }
      if (ds.spEdit) { recordDialog(ds.spEdit, ds.id, ds.evergreen !== undefined); return; }
      if (ds.spRemove) { if (!confirm('Excluir este item?')) return; await mutate({ type: 'delete', key: ds.spRemove, id: ds.id }); close(); render(); flash('Excluído.'); return; }
      if (ds.spDelete) { if (!confirm('Excluir este post? Isso não remove o que já foi publicado nas redes.')) return; await mutate({ type: 'social-delete', id: ds.spDelete }); close(); render(); flash('Post excluído.'); return; }
      if (ds.spBulkDelete) {
        if (!confirm(`Excluir ${ui.picked.size} post(s)?`)) return;
        await mutate({ type: 'social-bulk-delete', data: { ids: [...ui.picked] } }); ui.picked.clear(); render(); flash('Posts excluídos.'); return;
      }
      if (t.hasAttribute('data-sp-clear')) { ui.picked.clear(); render(); return; }
      if (ds.spPreview) { ui.draft.preview = ds.spPreview; refreshComposer(c); return; }
      if (ds.spFile) {
        const at = ui.draft.media.findIndex(m => m.fileId === ds.spFile);
        if (at >= 0) ui.draft.media.splice(at, 1); else ui.draft.media.push({ fileId: ds.spFile, type: 'image' });
        refreshComposer(c); return;
      }
      if (t.hasAttribute('data-sp-add-url')) {
        const input = t.closest('form').elements.mediaUrl, v = input.value.trim();
        try { const u = new URL(v); if (!/^https?:$/.test(u.protocol)) throw Error(); } catch { flash('Informe uma URL http(s) válida.', true); input.focus(); return; }
        ui.draft.media.push({ url: v, type: /\.(mp4|mov|m4v|webm)(\?|$)/i.test(v) ? 'video' : 'image' }); input.value = ''; refreshComposer(c); return;
      }
      if (ds.spUnmedia !== undefined) { ui.draft.media.splice(Number(ds.spUnmedia), 1); refreshComposer(c); return; }
      if (ds.spTemplate) {
        const columns = bulkCsvColumns[ds.spTemplate];
        const sample = ['\uFEFF' + columns.join(','), columns.map(key => ({ content: 'Conheça nossa nova coleção!', type: 'post', tags: '"coleção,novidades"' })[key] || '').join(',')].join('\r\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([sample], { type: 'text/csv;charset=utf-8' })); a.download = `planejador-social-${ds.spTemplate}.csv`; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000); return;
      }
      if (t.hasAttribute('data-sp-slot')) { t.previousElementSibling.insertAdjacentHTML('beforeend', slotRow()); return; }
      if (t.hasAttribute('data-sp-unslot')) { t.closest('.sp-slot').remove(); return; }
    } catch (e) { fail(t.closest('form'), e); }
  });

  document.addEventListener('change', ev => {
    const el = ev.target;
    if (el.matches('[data-sp-status]')) { ui.status = el.value; render(); return; }
    if (el.matches('[data-sp-account]')) { ui.account = el.value; render(); return; }
    if (el.matches('[data-sp-pick]')) { if (el.checked) ui.picked.add(el.value); else ui.picked.delete(el.value); render(); return; }
    if (el.matches('[data-sp-hashtags]')) {
      const g = c.s.socialHashtags.find(x => x.id === el.value); el.value = ''; if (!g) return;
      const area = el.form.elements.summary; area.value = `${area.value.replace(/\s*$/, '')}${area.value.trim() ? '\n\n' : ''}${g.tags.map(t => `#${t}`).join(' ')}`;
      readComposer(c, el.form); refreshComposer(c); area.focus(); return;
    }
    if (el.closest('[data-sp-form="post"]')) { readComposer(c, el.form); refreshComposer(c); }
    if (el.closest('.sp-picks')) el.closest('.sp-pick')?.classList.toggle('on', el.checked);
  });
  document.addEventListener('input', ev => {
    const form = ev.target.closest('[data-sp-form="post"]'); if (!form || ev.target.name === 'mediaUrl') return;
    readComposer(c, form); refreshComposer(c);
  });

  document.addEventListener('submit', async ev => {
    const form = ev.target;
    if (!form.matches('[data-sp-form],[data-sp-record],[data-sp-bluesky],[data-sp-attach],[data-sp-csv],[data-sp-invite-form]')) return;
    ev.preventDefault(); if (form.dataset.pending) return; form.dataset.pending = '1';
    const button = form.querySelector('.primary'); button?.setAttribute('disabled', '');
    try {
      if (form.dataset.spForm) {
        readComposer(c, form);
        const d = ui.draft;
        if (d.mode === 'schedule' && !d.when) throw Error('Escolha a data e a hora.');
        const id = await mutate({ type: 'social-post', id: d.id, data: { ...d, scheduleDate: d.scheduleDate } });
        close(); render();
        if (d.mode === 'now' && c.s.socialPosts.find(p => p.id === id)?.status === 'scheduled') { flash('Publicando…'); await publishNow(); }
        else flash(d.mode === 'draft' ? 'Rascunho salvo.' : c.s.socialPosts.find(p => p.id === id)?.status === 'in_review' ? 'Enviado para aprovação.' : 'Post agendado.');
        render();
      } else if (form.dataset.spRecord) {
        const key = form.dataset.spRecord, f = form.elements, data = { name: f.name?.value };
        if (key === 'socialCategories') Object.assign(data, { color: f.color.value, evergreen: f.evergreen.checked, accountIds: [...form.querySelectorAll('[name="accountIds"]:checked')].map(x => x.value),
          slots: [...form.querySelectorAll('.sp-slot')].map(r => ({ day: Number(r.querySelector('select').value), time: r.querySelector('input').value })) });
        if (key === 'socialHashtags') data.tags = f.tags.value;
        if (key === 'socialFeeds') Object.assign(data, { url: f.url.value, template: f.template.value, mode: f.mode.value, active: f.active.checked, accountIds: [...form.querySelectorAll('[name="accountIds"]:checked')].map(x => x.value) });
        await mutate({ type: 'save', key, id: form.dataset.id || '', data }); close(); render(); flash('Salvo.');
        if (key === 'socialFeeds') { withState(await api(url('/api/social/run'), {})); render(); }
      } else if (form.dataset.spBluesky !== undefined) {
        withState(await api(url('/api/social/bluesky'), { identifier: form.elements.identifier.value, password: form.elements.password.value }));
        close(); render(); flash('Bluesky conectado.');
      } else if (form.dataset.spAttach) {
        const picks = [...form.querySelectorAll('[name="pick"]:checked')].map(x => Number(x.value));
        withState(await api(url('/api/social/attach'), { requestId: form.dataset.spAttach, picks })); close(); ui.view = ui.view === 'accounts' ? 'accounts' : 'calendar'; render(); flash('Contas conectadas.');
      } else if (form.dataset.spInviteForm !== undefined) {
        const workspace = c.workspace, result = await api(url('/api/social/invite'), { action: 'create', hours: Number(form.elements.hours.value) });
        if (c.workspace === workspace && form.isConnected) inviteDialog(result);
      } else if (form.dataset.spCsv !== undefined) {
        const batch = csv, workspace = c.workspace;
        const current = () => csv === batch && c.workspace === workspace;
        const data = () => ({ rows: batch.rows, file: batch.file, accountIds: batch.accountIds, asDraft: batch.asDraft, needsApproval: batch.needsApproval });
        if (batch.step === 1) {
          const file = form.elements.file.files[0];
          if (file) {
            if (file.size > 1_000_000) throw Error('O CSV pode ter até 1 MB.');
            const rows = parseCsv(await file.text());
            if (!current()) return;
            if (!rows.length || rows.length > 300) throw Error('O CSV precisa ter entre 1 e 300 linhas de conteúdo.');
            if (!Object.hasOwn(rows[0], 'content')) throw Error('Adicione a coluna content ou use um dos modelos.');
            batch.file = file.name; batch.rows = rows;
            batch.accountIds = c.s.socialAccounts.filter(a => a.status === 'connected').map(a => a.id);
          } else if (!batch.file) throw Error('Escolha um arquivo CSV.');
          batch.step = 2;
        } else if (batch.step === 2) {
          batch.accountIds = new FormData(form).getAll('account');
          batch.asDraft = form.elements.asDraft.checked;
          batch.needsApproval = form.elements.needsApproval.checked;
          const { rows } = await api(url('/api/social/csv-preview'), data());
          if (!current()) return;
          batch.review = rows; batch.step = 3;
        } else {
          const reviewed = batch.review.filter(r => !r.error);
          if (!reviewed.length) return;
          const result = await mutate({ type: 'social-csv', data: { ...data(), includeIndices: reviewed.map(r => r.index), requireValid: true } });
          if (!current()) return;
          csv = freshCsv(); flash(`${result.created} post(s) importados${result.errors.length ? ` · ${result.errors.length} linha(s) ignoradas` : ''}.`);
        }
        render();
      }
    } catch (e) { fail(form, e); }
    finally { delete form.dataset.pending; button?.removeAttribute('disabled'); }
  });

  // Drag a post to another day of the calendar to reschedule it (keeps the time of day).
  document.addEventListener('dragstart', ev => { const el = ev.target.closest?.('[data-sp-drag]'); if (el) ev.dataTransfer.setData('text/sp-post', el.dataset.spDrag); });
  document.addEventListener('dragover', ev => { if (ev.target.closest?.('[data-sp-day]') && ev.dataTransfer.types.includes('text/sp-post')) { ev.preventDefault(); ev.target.closest('[data-sp-day]').classList.add('drop'); } });
  document.addEventListener('dragleave', ev => ev.target.closest?.('[data-sp-day]')?.classList.remove('drop'));
  document.addEventListener('drop', async ev => {
    const day = ev.target.closest?.('[data-sp-day]'), id = ev.dataTransfer.getData('text/sp-post'); if (!day || !id) return;
    ev.preventDefault(); day.classList.remove('drop');
    const p = c.s.socialPosts.find(x => x.id === id), zone = zoneOf(c), time = p.scheduleDate ? clock(p.scheduleDate, zone) : '09:00';
    try { await mutate({ type: 'social-reschedule', id, data: { scheduleDate: instant(`${day.dataset.spDay}T${time}`, zone) } }); render(); flash('Post reagendado.'); }
    catch (e) { flash(e.message, true); }
  });

  // Keep the calendar fresh while posts are publishing in the background.
  setInterval(async () => {
    if (c.view !== 'marketing' || (c.tab || 'social') !== 'social' || document.hidden || document.querySelector('#overlay dialog')) return;
    if (!c.s?.socialPosts.some(p => p.status === 'in_progress' || (p.status === 'scheduled' && Date.parse(p.scheduleDate) < Date.now() + 90_000))) return;
    try { await load(); render(); } catch { /* keep the current view */ }
  }, 30_000);
}
