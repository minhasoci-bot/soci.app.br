// AI Studio builder: questions about the visual direction, a page plan, then each page is
// built in order while the checklist and the preview follow along.
import { icon } from './icons.js';
import { h } from './screens.js';
import { designSummary, layoutOptions, validDesign } from './studio-design.js';

const B = { run: 0, phase: 'idle', brief: '', kind: 'website', template: 'landing', reference: '', ai: false, intro: '', questions: [], index: 0, answers: {}, notes: {},
  design: null, plan: null, tasks: [], projectId: '', previewPage: '', rev: 0, summary: '', error: '', busy: false };
let env = null;
const tips = [
  ['Formulários ligados ao CRM', 'Cada envio vira contato e dispara os workflows de “Formulário enviado”.'],
  ['Funis com etapas', 'Num funil publicado, o formulário de uma etapa leva o visitante para a próxima.'],
  ['Edite pelo chat', 'Depois de pronto, peça mudanças à IA e desfaça qualquer uma delas.'],
  ['SEO e estatísticas', 'Em Sites, acompanhe visitas, envios e o título de cada página no Google.']
];

const kindWord = kind => kind === 'funnel' ? 'funil' : 'site';
const active = () => env && env.c.view === 'studio' && env.c.tab === 'build';
const refresh = () => { if (active()) env.render(); };

function loadFonts(questions) {
  const fonts = questions.find(item => item.type === 'fonts')?.options.flatMap(option => [option.heading, option.body]) || [];
  const families = [...new Set(fonts)].filter(Boolean).map(name => `family=${name.trim().replace(/ /g, '+')}:wght@400;700`).join('&');
  if (!families) return;
  let link = document.getElementById('studio-builder-fonts');
  if (!link) { link = document.createElement('link'); link.id = 'studio-builder-fonts'; link.rel = 'stylesheet'; document.head.append(link); }
  link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

export function startBuild(environment, { brief, kind = 'website', template = 'landing', reference = '', ai = false }) {
  env = environment;
  Object.assign(B, { run: B.run + 1, phase: 'discovering', brief, kind, template, reference, ai, intro: '', questions: [], index: 0, answers: {}, notes: {},
    design: null, plan: null, tasks: [], projectId: '', previewPage: '', rev: 0, summary: '', error: '', busy: false });
  location.hash = '#studio/build';
  discover(B.run);
}

async function discover(run) {
  try {
    const result = await env.api(env.url('/api/studio/discover'), { brief: B.brief, kind: B.kind });
    if (run !== B.run) return;
    Object.assign(B, { phase: 'asking', intro: result.intro, questions: result.questions, ai: B.ai && result.ai });
    for (const question of B.questions) B.answers[question.id] = question.options[0].id;
    loadFonts(B.questions);
  } catch (error) { if (run === B.run) Object.assign(B, { phase: 'error', error: error.message }); }
  refresh();
}

function chosen(question) {
  const custom = B.notes[question.id]?.trim();
  const option = question.options.find(item => item.id === B.answers[question.id]) || question.options[0];
  return { option, custom };
}

function designFromAnswers() {
  const byType = type => B.questions.find(item => item.type === type);
  const palette = chosen(byType('palette')).option;
  const fonts = chosen(byType('fonts')).option;
  const layout = chosen(byType('layout')).option;
  const notes = B.questions.map(question => B.notes[question.id]?.trim() ? `${question.question} ${B.notes[question.id].trim()}` : '').filter(Boolean).join(' ');
  return validDesign({ palette: { name: palette.label, colors: palette.colors }, fonts: { name: fonts.label, heading: fonts.heading, body: fonts.body }, layout: layout.id, notes });
}

async function build(run) {
  const task = (index, state) => { if (B.tasks[index]) B.tasks[index].state = state; refresh(); };
  try {
    B.phase = 'planning'; refresh();
    const { plan } = await env.api(env.url('/api/studio/plan'), { brief: B.brief, kind: B.kind, design: B.design });
    if (run !== B.run) return;
    B.plan = plan;
    B.tasks = [{ label: `Identidade visual: ${designSummary(B.design)}`, state: 'done' },
      ...plan.pages.map(page => ({ label: page.name, sub: `/${page.slug === 'index' ? '' : page.slug}`, state: 'pending' })),
      { label: 'Formulário ligado ao CRM ao publicar', state: 'pending' }];
    B.phase = 'building';
    task(1, 'running');
    const created = await env.api(env.url('/api/studio'), { mode: B.ai ? 'model' : 'starter', kind: B.kind, brief: B.brief, template: B.template,
      reference: B.ai && B.reference ? B.reference : undefined, design: B.design, plan });
    if (run !== B.run) return;
    env.c.s = created.state; env.c.m = created.metrics;
    B.projectId = created.id;
    const { doc } = await env.api(`${env.url('/api/studio/doc')}&id=${encodeURIComponent(created.id)}`);
    Object.assign(B, { previewPage: doc.pages[0].id, rev: doc.rev });
    task(1, 'done');
    for (const [offset, page] of plan.pages.slice(1).entries()) {
      if (run !== B.run) return;
      task(offset + 2, 'running');
      const result = await env.api(env.url('/api/studio/page'), { id: created.id, action: 'add', name: page.name, slug: page.slug, description: page.purpose, ai: B.ai });
      env.c.s = result.state; env.c.m = result.metrics;
      Object.assign(B, { previewPage: result.result || result.doc.pages.at(-1).id, rev: result.doc.rev });
      task(offset + 2, 'done');
    }
    task(B.tasks.length - 1, 'done');
    B.summary = `Construí ${B.kind === 'funnel' ? 'o funil' : 'o site'} “${plan.name}” com ${designSummary(B.design)}:\n${plan.pages.map(page => `• /${page.slug === 'index' ? '' : page.slug} — ${page.name}${page.purpose ? `: ${page.purpose}` : ''}`).join('\n')}\n\nAo publicar, os envios do formulário viram contatos no CRM${B.kind === 'funnel' ? ' e cada etapa leva o visitante para a próxima' : ''}.`;
    await env.api(env.url('/api/studio/note'), { id: created.id, ask: B.brief, reply: B.summary }).catch(() => {});
    B.phase = 'done';
  } catch (error) {
    if (run !== B.run) return;
    const running = B.tasks.findIndex(item => item.state === 'running');
    if (running >= 0) B.tasks[running].state = 'error';
    Object.assign(B, { phase: 'error', error: error.message });
  }
  refresh();
}

/* ───────── Render ───────── */

function optionButton(question, option) {
  const pressed = B.answers[question.id] === option.id;
  const visual = question.type === 'palette'
    ? `<span class="vb-swatches">${option.colors.map(color => `<i style="background:${h(color)}"></i>`).join('')}</span>`
    : question.type === 'fonts'
      ? `<span class="vb-font"><b style="font-family:'${h(option.heading)}',serif">Aa</b><small style="font-family:'${h(option.body)}',sans-serif">${h(option.heading)} + ${h(option.body)}</small></span>`
      : `<span class="vb-layout vb-layout-${h(option.id)}"><i></i><i></i><i></i></span>`;
  return `<button type="button" class="vb-option" data-vb-option="${h(option.id)}" aria-pressed="${pressed}" title="${h(option.text || option.label)}">${visual}<span>${h(option.label)}</span></button>`;
}

function questionCard() {
  if (B.phase === 'review') {
    return `<div class="vb-card"><h3>Revise as respostas</h3><dl class="vb-review">${B.questions.map(question => {
      const { option, custom } = chosen(question);
      return `<div><dt>${h(question.question)}</dt><dd>${h(custom || option.label)}</dd></div>`;
    }).join('')}</dl>
      <footer class="vb-card-foot"><button type="button" class="icon-btn" data-vb-nav="back" aria-label="Voltar">${icon('left', 16)}</button><span class="spacer"></span>
        <button type="button" class="secondary" data-vb-skip>Pular todas</button><button type="button" class="primary" data-vb-submit>Enviar</button></footer></div>`;
  }
  const question = B.questions[B.index];
  const last = B.index === B.questions.length - 1;
  return `<div class="vb-card"><p class="vb-step">Pergunta ${B.index + 1} de ${B.questions.length}</p><h3>${h(question.question)}</h3>
    <div class="vb-options">${question.options.map(option => optionButton(question, option)).join('')}</div>
    <label class="sr-only" for="vb-custom">Escreva a sua resposta</label>
    <input id="vb-custom" class="vb-custom" data-vb-custom="${h(question.id)}" maxlength="200" value="${h(B.notes[question.id] || '')}" placeholder="Ou escreva a sua…">
    <footer class="vb-card-foot"><button type="button" class="icon-btn" data-vb-nav="back" aria-label="Pergunta anterior" ${B.index ? '' : 'disabled'}>${icon('left', 16)}</button>
      <button type="button" class="icon-btn" data-vb-nav="next" aria-label="Próxima pergunta">${icon('right', 16)}</button><span class="spacer"></span>
      <button type="button" class="secondary" data-vb-skip>Pular todas</button><button type="button" class="primary" data-vb-nav="next">${last ? 'Revisar' : 'Próxima'}</button></footer></div>`;
}

function taskList() {
  const mark = state => state === 'done' ? icon('check', 14) : state === 'error' ? icon('alert', 14) : state === 'running' ? '<span class="vb-spin" aria-hidden="true"></span>' : '';
  return `<ol class="vb-tasks">${B.tasks.map(task => `<li class="${task.state}"><span class="vb-mark">${mark(task.state)}</span><span>${h(task.label)}${task.sub ? ` <small>${h(task.sub)}</small>` : ''}</span>
    <span class="sr-only">${{ done: 'concluída', running: 'em andamento', pending: 'na fila', error: 'com erro' }[task.state]}</span></li>`).join('')}</ol>`;
}

function chat(c) {
  const parts = [`<div class="vb-msg you">${h(B.brief)}</div>`];
  if (B.phase === 'discovering') parts.push('<p class="vb-thinking"><span class="vb-spin"></span> Pensando na direção visual…</p>');
  if (B.intro) parts.push(`<p class="vb-msg ai">${h(B.intro)}${B.ai ? '' : ' <small class="dim">(sem OpenAI: as páginas saem do gerador local)</small>'}</p>`);
  if (['asking', 'review'].includes(B.phase)) parts.push(questionCard());
  if (B.design) parts.push(`<div class="vb-msg you small">${h(designSummary(B.design))}${B.design.notes ? `<br><small>${h(B.design.notes)}</small>` : ''}</div>`);
  if (B.phase === 'planning') parts.push('<p class="vb-thinking"><span class="vb-spin"></span> Planejando as páginas…</p>');
  if (B.tasks.length) parts.push(`<div class="vb-card"><h3>${h(B.plan?.name || 'Plano')}</h3>${B.plan?.summary ? `<p class="dim">${h(B.plan.summary)}</p>` : ''}${taskList()}
    ${B.phase === 'building' ? `<p class="vb-thinking"><span class="vb-spin"></span> ${B.ai ? 'A IA está escrevendo as páginas. Cada uma leva de 1 a 3 minutos.' : 'Montando as páginas…'}</p>` : ''}</div>`);
  if (B.phase === 'done') {
    parts.push(`<div class="vb-msg ai vb-summary">${h(B.summary).replace(/\n/g, '<br>')}</div>
      <div class="vb-actions"><a class="primary" href="#studio/project/${B.projectId}">${icon('edit', 15)} Abrir no editor</a>
        ${B.kind === 'funnel' ? `<a class="secondary" href="#sites/funnel/${B.projectId}">${icon('flow', 15)} Ver etapas do funil</a>` : `<a class="secondary" href="#sites/funnel/${B.projectId}">${icon('site', 15)} Ver em Sites</a>`}</div>`);
  }
  if (B.phase === 'error') parts.push(`<div class="vb-msg ai vb-error">${icon('alert', 15)} ${h(B.error)}<div class="vb-actions"><button class="secondary" data-vb-retry>Tentar de novo</button>
    ${B.projectId ? `<a class="text-link" href="#studio/project/${B.projectId}">Abrir o que já foi criado</a>` : ''}</div></div>`);
  return parts.join('');
}

function preview(c) {
  const page = B.previewPage && B.projectId ? c.s.studioProjects.find(item => item.id === B.projectId)?.pages?.find(item => item.id === B.previewPage) : null;
  const tip = tips[Math.floor(Date.now() / 6000) % tips.length];
  return `<div class="vb-preview-bar"><span class="vb-address">${icon('monitor', 14)} /${page && page.slug !== 'index' ? h(page.slug) : ''}</span>
      ${B.projectId ? `<a class="icon-btn" href="/studio-preview/${c.workspace}/${B.projectId}/${B.previewPage}" target="_blank" rel="noopener" aria-label="Abrir prévia em nova aba">${icon('external', 15)}</a>` : ''}</div>
    ${page ? `<iframe class="vb-frame" title="Prévia de ${h(page.name)}" sandbox="allow-same-origin" src="/studio-preview/${c.workspace}/${B.projectId}/${B.previewPage}?r=${B.rev}"></iframe>`
      : `<div class="vb-waiting"><span class="vb-getting">${['done', 'error'].includes(B.phase) ? 'Sem prévia' : '<span class="vb-spin"></span> Preparando…'}</span>
        <div class="vb-tip"><b>${h(tip[0])}</b><p>${h(tip[1])}</p></div></div>`}`;
}

export function builderView(c) {
  if (B.phase === 'idle') {
    return `<section class="vb vb-empty"><div><h1>Nenhuma construção em andamento</h1><p class="dim">Descreva o que você quer criar na página inicial do AI Studio.</p><a class="primary" href="#studio">Ir para o AI Studio</a></div></section>`;
  }
  return `<section class="vb" aria-label="Construtor com IA">
    <aside class="vb-chat"><header class="vb-head"><a class="icon-btn" href="#studio" aria-label="Voltar ao AI Studio">${icon('left', 16)}</a>
      <b>${h(B.plan?.name || `Novo ${kindWord(B.kind)}`)}</b><span class="badge ${B.ai ? 'pink' : ''}">${B.ai ? 'IA' : 'Gerador local'}</span></header>
      <div class="vb-log" role="log" aria-live="polite">${chat(c)}</div></aside>
    <section class="vb-preview" aria-label="Prévia">${preview(c)}</section></section>`;
}

/* ───────── Behaviour ───────── */

export function installBuilder(environment) {
  env = environment;
  document.addEventListener('input', event => {
    const field = event.target.closest?.('[data-vb-custom]');
    if (field) B.notes[field.dataset.vbCustom] = field.value;
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || !button.closest('.vb')) return;
    const d = button.dataset;
    if (d.vbOption) { B.answers[B.questions[B.index].id] = d.vbOption; refresh(); return; }
    if (d.vbNav === 'back') { if (B.phase === 'review') B.phase = 'asking'; else B.index = Math.max(0, B.index - 1); refresh(); return; }
    if (d.vbNav === 'next') { if (B.index < B.questions.length - 1) B.index++; else B.phase = 'review'; refresh(); return; }
    if ('vbSkip' in d) { B.notes = {}; for (const question of B.questions) B.answers[question.id] = question.options[0].id; }
    if ('vbSkip' in d || 'vbSubmit' in d) { B.design = designFromAnswers(); build(B.run); return; }
    if ('vbRetry' in d) {
      if (B.projectId) { location.hash = `#studio/project/${B.projectId}`; return; }
      if (B.design) { B.tasks = []; B.error = ''; build(B.run); } else { B.phase = 'discovering'; refresh(); discover(B.run); }
    }
  });
  setInterval(() => { if (active() && !['done', 'error'].includes(B.phase) && !B.previewPage) { const tip = document.querySelector('.vb-tip'); if (tip) { const next = tips[Math.floor(Date.now() / 6000) % tips.length]; tip.innerHTML = `<b>${h(next[0])}</b><p>${h(next[1])}</p>`; } } }, 6000);
}

export { layoutOptions };
