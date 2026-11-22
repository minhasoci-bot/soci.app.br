// Monta os componentes do Beautiful UI nas telas da plataforma depois de cada render.
// As telas continuam gerando HTML em string; onde um componente entra, elas deixam um
// marcador `data-bui="…"` (com os dados em JSON quando preciso) e este módulo troca o
// marcador pelo componente. Ações reaproveitam os handlers globais do app clicando num
// botão sintético com os mesmos data-atributos (data-edit, data-go, data-task…).
import { recommendationCard } from './beautiful-ui.js';
import { codeBlock, filterTable, fineTuneCard, flowchart, insightCards, mention, monoValue, recordsTable } from './beautiful-ui-more.js';
import { pickedIds, setPicked } from './crm.js';
import { actionSpec, triggerSpec } from './workflow-data.js';

const parse = (text, fallback) => { try { return JSON.parse(text); } catch { return fallback; } };
const DAY = 86400000;

/** Clica num botão sintético com os data-atributos dados, dentro de `root`, para usar os handlers do app. */
export function clickWith(root, data) {
  const b = document.createElement('button');
  b.type = 'button';
  b.hidden = true;
  for (const [key, value] of Object.entries(data)) b.dataset[key] = value;
  root.append(b);
  b.click();
  b.remove();
}

/** Troca blocos `<pre data-bui-code>` pelo CodeBlock (numeração, destaque e copiar). */
export function enhanceCode(root) {
  for (const pre of root.querySelectorAll('pre[data-bui-code]')) {
    const text = pre.textContent.replace(/\n+$/, '');
    const block = codeBlock({ filename: pre.dataset.buiCode || 'código', lines: text.split('\n'), code: text, labels: { copy: 'Copiar', copied: 'Copiado' } });
    block.el.classList.add('bui-code-embed');
    const wrap = pre.closest('[data-bui-code-wrap]');
    (wrap || pre).replaceWith(block.el);
  }
}

export function mountBeautifulUI(root, c, { render } = {}) {
  if (!root || !c?.s) return;
  enhanceCode(root);
  for (const slot of root.querySelectorAll('[data-bui="contacts-records"]')) mountContacts(slot, c, render);
  for (const slot of root.querySelectorAll('[data-bui="tasks-filter"]')) mountTasks(slot);
  for (const slot of root.querySelectorAll('[data-bui="dashboard-ai"]')) mountDashboard(slot, c);
  for (const slot of root.querySelectorAll('[data-bui="email-tune"]')) mountEmailTune(slot);
  if (root.querySelector('[data-bui-flow]')) mountWorkflowPreviews(root, c);
}

/* ── Contatos: RecordsTable ─────────────────────────────── */

function mountContacts(slot, c, render) {
  const rows = parse(slot.dataset.rows, []);
  const table = recordsTable({
    columns: [
      { key: 'name', label: 'Nome', type: 'title', width: 250 },
      { key: 'phone', label: 'Telefone', type: 'text', width: 150 },
      { key: 'email', label: 'E-mail', type: 'text', width: 220 },
      { key: 'company', label: 'Empresa', type: 'text', width: 170 },
      { key: 'scoreText', label: 'Pontuação', type: 'text', width: 120, sort: (a, b) => (a.score || 0) - (b.score || 0) },
      { key: 'tags', label: 'Tags', type: 'tags', width: 230 }
    ],
    rows,
    selected: pickedIds('contacts'),
    footerLabel: rows.length === 1 ? 'contato' : 'contatos',
    onSelect: ids => { setPicked('contacts', ids); render?.(); },
    onOpen: row => clickWith(slot, { edit: 'contacts', id: row.id })
  });
  slot.replaceChildren(table.el);
}

/* ── Tarefas: FilterTable ───────────────────────────────── */

function mountTasks(slot) {
  const rows = parse(slot.dataset.rows, []);
  const table = filterTable({
    label: 'Tarefas',
    allLabel: 'Todas',
    statusKey: 'status',
    statuses: [
      { key: 'overdue', label: 'Atrasada', color: 'oklch(0.64 0.19 27)' },
      { key: 'open', label: 'Em aberto', color: 'oklch(0.671 0.118 219.351)' },
      { key: 'done', label: 'Concluída', color: 'oklch(0.652 0.131 162.865)' }
    ],
    columns: [
      { key: 'title', label: 'Tarefa', width: '1.4fr' },
      { key: 'contact', label: 'Contato', width: '1fr' },
      { key: 'due', label: 'Prazo', width: '0.8fr' },
      { key: 'status', label: 'Status', width: '0.8fr', render: row => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `bui-status bui-task-toggle is-${row.status}`;
        b.dataset.task = row.id;
        b.title = row.done ? 'Marcar como em aberto' : 'Marcar como concluída';
        b.textContent = row.done ? 'Concluída' : row.status === 'overdue' ? 'Atrasada' : 'Em aberto';
        b.style.setProperty('--tag-base', row.done ? 'oklch(0.652 0.131 162.865)' : row.status === 'overdue' ? 'oklch(0.64 0.19 27)' : 'oklch(0.671 0.118 219.351)');
        return b;
      } },
      { key: 'edit', label: '', width: '44px', render: row => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'icon-btn bui-task-edit';
        b.setAttribute('aria-label', `Editar ${row.title}`);
        b.dataset.edit = 'tasks';
        b.dataset.id = row.id;
        b.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
        return b;
      } }
    ],
    rows
  });
  slot.replaceChildren(table.el);
}

/* ── Painel: InsightCards + RecommendationCard ──────────── */

function weekly(items, dateOf, valueOf, weeks = 8, now = Date.now()) {
  const out = Array(weeks).fill(0);
  for (const item of items) {
    const t = Date.parse(dateOf(item));
    if (!Number.isFinite(t)) continue;
    const age = Math.floor((now - t) / (7 * DAY));
    if (age >= 0 && age < weeks) out[weeks - 1 - age] += valueOf(item);
  }
  return out;
}

function mountDashboard(slot, c) {
  const currency = c.s.profile?.currency || 'BRL';
  const money = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v || 0);
  const deals = c.s.opportunities || [];
  const contacts = c.s.contacts || [];
  const tasks = c.s.tasks || [];
  const now = Date.now();
  const pages = [];

  const closedAt = d => d.statusChangedAt || d.updated || d.created;
  const won = weekly(deals.filter(d => d.status === 'Won'), closedAt, d => Number(d.value) || 0);
  const lost = weekly(deals.filter(d => d.status === 'Lost'), closedAt, d => Number(d.value) || 0);
  if (won.some(Boolean) || lost.some(Boolean)) {
    const wonTotal = won.reduce((a, b) => a + b, 0);
    const lostTotal = lost.reduce((a, b) => a + b, 0);
    const prose = document.createElement('span');
    prose.append('Nas últimas 8 semanas o funil ganhou ', monoValue(money(wonTotal), 'green'), ' e perdeu ', monoValue(money(lostTotal), 'red'), '.');
    const recent = d => now - Date.parse(closedAt(d)) < 56 * DAY;
    const count = status => deals.filter(d => d.status === status && recent(d)).length;
    const deals_ = n => `${n} negócio${n === 1 ? '' : 's'}`;
    pages.push({ key: 'won-lost', prose, pill: 'Ver oportunidades', href: '#opportunities', card: { type: 'compare', caption: 'Por semana', format: money, series: [
      { name: 'Ganhos (última semana)', values: won, sub: deals_(count('Won')), tone: 'green', color: '#2fb37a' },
      { name: 'Perdidos (última semana)', values: lost, sub: deals_(count('Lost')), tone: 'red', color: '#ee5c61' }
    ] } });
  }

  const newContacts = weekly(contacts, x => x.created, () => 1);
  const newDeals = weekly(deals, x => x.created, () => 1);
  if (newContacts.some(Boolean) || newDeals.some(Boolean)) {
    const last30 = contacts.filter(x => now - Date.parse(x.created) < 30 * DAY).length;
    const prev = newContacts.slice(0, 4).reduce((a, b) => a + b, 0);
    const recent = newContacts.slice(4).reduce((a, b) => a + b, 0);
    const delta = prev ? Math.round(((recent - prev) / prev) * 100) : null;
    pages.push({ key: 'growth', prose: `Entraram ${last30} contato${last30 === 1 ? '' : 's'} nos últimos 30 dias${delta === null ? '' : `, ${delta >= 0 ? 'alta' : 'queda'} de ${Math.abs(delta)}% sobre as 4 semanas anteriores`}.`,
      pill: 'Ver contatos', href: '#contacts', card: { type: 'metric', title: 'Entrada no funil', total: `${last30} contatos em 30 dias`, delta: delta === null ? '' : `${delta >= 0 ? '+' : ''}${delta}%`, note: 'vs 4 semanas antes', color: '#3d9aff', tag: '8 semanas', metrics: [
        { label: 'Contatos', caption: 'Novos por semana', values: newContacts, format: v => `${Math.round(v)} contatos` },
        { label: 'Oportunidades', caption: 'Novas por semana', values: newDeals, format: v => `${Math.round(v)} oportunidades` }
      ] } });
  }

  const open = deals.filter(d => d.status === 'Open');
  if (open.length) {
    const groups = new Map();
    for (const d of open) {
      const key = d.source || 'Sem origem';
      const g = groups.get(key) || { count: 0, value: 0 };
      g.count++;
      g.value += Number(d.value) || 0;
      groups.set(key, g);
    }
    const ranked = [...groups.entries()].sort((a, b) => b[1].count - a[1].count);
    const top = ranked.slice(0, 3);
    const rest = ranked.slice(3).reduce((acc, [, g]) => ({ count: acc.count + g.count, value: acc.value + g.value }), { count: 0, value: 0 });
    if (rest.count) top.push(['Outras', rest]);
    const colors = ['var(--bui-orange)', 'var(--bui-accent)', '#3d9aff', 'var(--bui-line-strong)'];
    const segments = top.map(([label, g], i) => ({ name: label.slice(0, 4).toUpperCase(), label, pct: Math.round((g.count / open.length) * 1000) / 10, amount: money(g.value), color: colors[i], note: `${g.count} oportunidade${g.count === 1 ? '' : 's'} em aberto vindas daqui.` }));
    const prose = document.createElement('span');
    prose.append('A maior parte do funil aberto vem de ', mention(segments[0].label, colors[0]), ` (${segments[0].pct.toLocaleString('pt-BR')}%).`);
    pages.push({ key: 'sources', prose, pill: 'Abrir funil', href: '#opportunities', card: { type: 'allocation', title: `Funil aberto · ${money(open.reduce((s, d) => s + (Number(d.value) || 0), 0))}`, segments } });
  }

  const options = [];
  const overdue = tasks.filter(t => !t.done && t.due && Date.parse(t.due) < now);
  if (overdue.length) options.push({ key: 'tasks', body: `Você tem ${overdue.length} tarefa${overdue.length === 1 ? '' : 's'} atrasada${overdue.length === 1 ? '' : 's'}. Comece pela mais antiga.`, short: `${overdue.length} tarefa(s) atrasada(s)`, signal: 3, tone: 'var(--bui-green)', label: 'Mais urgente', cta: 'Abrir tarefas', ctaVariant: 'accent', href: '#contacts/tasks' });
  const stale = open.filter(d => now - Date.parse(d.updated || d.created) > 14 * DAY);
  if (stale.length) options.push({ key: 'stale', body: `${stale.length} oportunidade${stale.length === 1 ? '' : 's'} sem movimento há mais de 14 dias. Vale um follow-up.`, short: `${stale.length} oportunidade(s) parada(s)`, signal: 2, tone: 'var(--bui-orange)', label: 'Importante', cta: 'Ver oportunidades', ctaVariant: 'primary', href: '#opportunities' });
  const untagged = contacts.filter(x => !x.tags?.length);
  if (untagged.length) options.push({ key: 'tags', body: `${untagged.length} contato${untagged.length === 1 ? '' : 's'} sem tag. Etiquetar ajuda a segmentar campanhas.`, short: `${untagged.length} contato(s) sem tag`, signal: 1, tone: 'var(--bui-ink-3)', label: 'Quando der', cta: 'Ver contatos', ctaVariant: 'primary', href: '#contacts' });

  if (!pages.length && !options.length) { slot.remove(); return; }
  const kids = [];
  if (pages.length) kids.push(insightCards({ title: 'Insights', pages, onPill: p => { location.hash = p.href; } }).el);
  if (options.length) kids.push(recommendationCard({ title: 'Próximo passo sugerido', options, labels: { alternatives: 'Outras', other: 'Outras sugestões', accepted: 'Abrindo…' }, onAccept: o => { location.hash = o.href; } }).el);
  slot.replaceChildren(...kids);
}

/* ── E-mail: FineTuneCard nos blocos de imagem e espaçador ─ */
// Os campos originais continuam no DOM (escondidos) e recebem o valor com os mesmos eventos,
// então o editor de e-mail salva como sempre.

function mountEmailTune(slot) {
  const source = slot.nextElementSibling?.classList.contains('bui-tune-source') ? slot.nextElementSibling : null;
  if (!source) return;
  const set = (selector, value, type) => {
    const el = source.querySelector(selector);
    if (!el || String(el.value) === String(value)) return;
    el.value = value;
    el.dispatchEvent(new Event(type, { bubbles: true }));
  };
  const card = slot.dataset.kind === 'image'
    ? fineTuneCard({
      title: 'Imagem',
      labels: { layout: 'Alinhamento' },
      segments: [{ key: 'left', label: 'Esquerda', shape: 'alignLeft' }, { key: 'center', label: 'Centro', shape: 'alignCenter' }, { key: 'right', label: 'Direita', shape: 'alignRight' }],
      segment: slot.dataset.align,
      fields: [{ key: 'width', label: 'Largura', value: Number(slot.dataset.width) || 100, min: 20, max: 100, step: 5, suffix: '%' }],
      onChange: state => {
        set('[data-em-b="width"]', state.values.width, 'input');
        set('select[data-em-b="align"]', state.segment, 'change');
      }
    })
    : fineTuneCard({
      title: 'Espaçador',
      segments: [],
      fields: [{ key: 'height', label: 'Altura', value: Number(slot.dataset.height) || 24, min: 8, max: 80, step: 4, suffix: 'px' }],
      onChange: state => set('[data-em-b="height"]', state.values.height, 'input')
    });
  source.hidden = true;
  slot.replaceChildren(card.el);
}

/* ── Workflows: prévia do fluxo com Flowchart ───────────── */

function mountWorkflowPreviews(root, c) {
  if (root.dataset.buiFlowBound) return;
  root.dataset.buiFlowBound = '1';
  root.addEventListener('click', event => {
    const btn = event.target.closest('[data-bui-flow]');
    if (!btn) return;
    const tr = btn.closest('tr');
    const next = tr?.nextElementSibling;
    if (next?.classList.contains('bui-flow-row')) {
      next.remove();
      btn.setAttribute('aria-expanded', 'false');
      btn.textContent = 'Ver fluxo';
      return;
    }
    const row = c.s.workflows.find(item => item.id === btn.dataset.buiFlow);
    if (!row || !tr) return;
    const cell = document.createElement('td');
    cell.colSpan = tr.children.length;
    const line = document.createElement('tr');
    line.className = 'bui-flow-row';
    line.append(cell);
    tr.after(line);
    btn.setAttribute('aria-expanded', 'true');
    btn.textContent = 'Ocultar fluxo';
    const steps = [];
    const edges = [];
    const triggers = (row.triggers || []).slice(0, 2);
    triggers.forEach((t, i) => steps.push({ id: `t${i}`, row: 0, x: triggers.length === 1 ? 0.5 : 0.28 + i * 0.44, w: 270, kind: { label: 'Gatilho', hue: '#9a5cff' }, hue: '#9a5cff', title: triggerSpec(t.type)?.label || t.type, caption: t.name || triggerSpec(t.type)?.group || '' }));
    if (!triggers.length) steps.push({ id: 't0', row: 0, x: 0.5, w: 270, kind: { label: 'Gatilho', hue: '#9a5cff' }, hue: '#9a5cff', title: 'Sem gatilho', caption: 'Inicia só manualmente' });
    const top = (row.steps || []).slice(0, 4);
    top.forEach((s, i) => {
      const spec = actionSpec(s.type);
      const branch = Boolean(spec?.branch);
      steps.push({ id: `s${i}`, row: i + 1, x: 0.5, w: 300, kind: { label: branch ? 'Se / Senão' : spec?.group || 'Ação', hue: branch ? '#f09a2f' : '#3d9aff' }, hue: branch ? '#f09a2f' : '#3d9aff', title: spec?.label || s.type, caption: s.name || (branch ? 'Divide o caminho' : '') });
      if (i === 0) (triggers.length ? triggers : [0]).forEach((_, k) => edges.push({ from: `t${k}`, to: 's0' }));
      else edges.push({ from: `s${i - 1}`, to: `s${i}` });
    });
    const chart = flowchart({ steps, edges });
    cell.append(chart.el);
    if ((row.steps || []).length > top.length) {
      const more = document.createElement('p');
      more.className = 'wf-sub bui-flow-more';
      more.textContent = `+ ${(row.steps || []).length - top.length} etapa(s). Abra o fluxo para ver tudo.`;
      cell.append(more);
    }
  });
}
