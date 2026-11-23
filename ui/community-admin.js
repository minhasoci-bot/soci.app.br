// Communities admin, 6.2: the extra settings sections (access plans, join questions, welcome, appearance, tabs,
// moderation, newsletter, badges), the moderation queue, the analytics tab and the members CSV.
import { icon } from './icons.js';
import { h, fmt } from './screens.js';
import { badgeCatalog, communityTabKeys, composerPromptDefault, defaultLayout, defaultTabs, defaultTheme, planIntervals, planPrice, themePresets, themeStyle, themeTokens, weekdays, widgetKeys, withAcademyTab } from './community-data.js';

const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const remove = label => `<button type="button" class="icon-btn" data-cm="row-remove" aria-label="Remover ${label}">${icon('trash', 15)}</button>`;

// The workspace's courses and offers, for the Academia rows (set each time the settings form is drawn).
let catalog = { courses: [], offers: [] };
const offerOptions = (courseId, chosen = '') => `<option value="">Oferta automática</option>${catalog.offers.filter(offer => offer.courseIds?.includes(courseId))
  .map(offer => `<option value="${h(offer.id)}"${offer.id === chosen ? ' selected' : ''}>${h(offer.title)}${offer.status === 'published' ? '' : ' (rascunho)'}</option>`).join('')}`;
const moveButtons = `<span class="ca-move"><button type="button" class="icon-btn" data-cm="row-up" aria-label="Subir"><span aria-hidden="true">↑</span></button><button type="button" class="icon-btn" data-cm="row-down" aria-label="Descer"><span aria-hidden="true">↓</span></button></span>`;

export const rowTemplates = {
  academy: (row = {}) => {
    const courseId = row.courseId || catalog.courses[0]?.id || '', mode = row.mode === 'separate' ? 'separate' : 'included';
    return `<li class="ca-row ca-academy">
    <select name="academy.courseId" aria-label="Curso">${catalog.courses.map(course => `<option value="${h(course.id)}"${course.id === courseId ? ' selected' : ''}>${h(course.name)}${course.active === false ? ' (inativo)' : ''}</option>`).join('')}</select>
    <select name="academy.mode" aria-label="Acesso"><option value="included"${mode === 'included' ? ' selected' : ''}>Incluso para membros</option><option value="separate"${mode === 'separate' ? ' selected' : ''}>Vendido à parte</option></select>
    <select name="academy.offerId" aria-label="Oferta"${mode === 'separate' ? '' : ' disabled'}>${offerOptions(courseId, row.offerId)}</select>
    ${moveButtons}${remove('curso')}</li>`;
  },
  plans: (row = {}) => `<li class="ca-row ca-plan"><input type="hidden" name="plan.id" value="${h(row.id || '')}">
    <input name="plan.name" maxlength="60" placeholder="Nome (ex.: Mensal)" value="${h(row.name || '')}" aria-label="Nome do plano">
    <input name="plan.price" type="number" min="1" step="0.01" placeholder="Preço" value="${h(row.price ?? '')}" aria-label="Preço do plano">
    <select name="plan.interval" aria-label="Cobrança">${planIntervals.map(([key, , label]) => `<option value="${key}"${row.interval === key ? ' selected' : ''}>${label}</option>`).join('')}</select>${remove('plano')}</li>`,
  questions: (row = {}) => `<li class="ca-row ca-question"><input type="hidden" name="question.id" value="${h(row.id || '')}">
    <input name="question.text" maxlength="200" placeholder="Pergunta (ex.: Qual é o seu objetivo?)" value="${h(row.text || '')}" aria-label="Pergunta">
    <label class="cp-checkbox"><input type="checkbox" name="question.required" value="${h(row.id || 'new')}"${row.required !== false ? ' checked' : ''}><span>Obrigatória</span></label>${remove('pergunta')}</li>`,
  onboarding: (row = {}) => `<li class="ca-row ca-step"><input type="hidden" name="step.id" value="${h(row.id || '')}">
    <input name="step.title" maxlength="80" placeholder="Etapa (ex.: Apresente-se no canal Avisos)" value="${h(row.title || '')}" aria-label="Título da etapa">
    <input name="step.description" maxlength="300" placeholder="Detalhe (opcional)" value="${h(row.description || '')}" aria-label="Descrição da etapa">
    <input name="step.link" type="url" maxlength="500" placeholder="https://… (opcional)" value="${h(row.link || '')}" aria-label="Link da etapa">${remove('etapa')}</li>`
};

const tabRow = row => `<li class="ca-row ca-tab"><input type="hidden" name="tab.key" value="${h(row.key)}">
  <input name="tab.label" maxlength="30" value="${h(row.label)}" aria-label="Nome da aba ${h(row.label)}">
  <label class="cp-checkbox"><input type="checkbox" name="tab.visible" value="${h(row.key)}"${row.visible !== false ? ' checked' : ''}><span>Visível</span></label>
  <span class="ca-move"><button type="button" class="icon-btn" data-cm="row-up" aria-label="Subir"><span aria-hidden="true">↑</span></button><button type="button" class="icon-btn" data-cm="row-down" aria-label="Descer"><span aria-hidden="true">↓</span></button></span></li>`;

const preview = theme => `<div class="ca-preview" data-ca-preview style="${themeStyle(theme)}">
  <div class="ca-preview-side"><b>Comunidade</b><span class="on">Discussão</span><span>Academia</span><span>Eventos</span><small>Canais</small><span># Avisos</span></div>
  <div class="ca-preview-main"><div class="ca-preview-card"><b>Bem-vindos!</b><p>Assim fica uma publicação.</p><span class="ca-preview-button">Publicar</span> <span class="ca-preview-error">Erro</span></div></div>
  <div class="ca-preview-aside"><div class="ca-preview-card"><b>Top do ranking</b><p>1 · Ana</p></div></div></div>`;

const widgetRow = row => `<li class="ca-row ca-tab"><input type="hidden" name="widget.key" value="${h(row.key)}"><span>${h(widgetKeys.find(([key]) => key === row.key)?.[1] || row.key)}</span>
  <label class="cp-checkbox"><input type="checkbox" name="widget.visible" value="${h(row.key)}"${row.visible !== false ? ' checked' : ''}><span>Visível</span></label>${moveButtons}</li>`;

/** The 6.2 sections of the settings form. */
export function settingsSections(group, { courses = [], offers = [] } = {}) {
  catalog = { courses, offers };
  const layout = group.layout || defaultLayout();
  const theme = group.theme || defaultTheme(), tabs = withAcademyTab(group.tabs || defaultTabs()), news = group.newsletter || { enabled: false, frequency: 'weekly', weekday: 1, hour: 9 };
  const nav = [['ca-access', 'Assinatura'], ['ca-join', 'Adesão'], ['ca-welcome', 'Boas-vindas'], ['ca-look', 'Aparência'], ['ca-layout', 'Layout'], ['ca-academy', 'Academia'], ['ca-tabs', 'Abas'], ['ca-moderation', 'Moderação'], ['ca-news', 'Newsletter'], ['ca-badges', 'Emblemas']];
  return `<nav class="ca-jump" aria-label="Seções das configurações">${nav.map(([id, label]) => `<button type="button" data-cm="jump" data-id="${id}">${label}</button>`).join('')}</nav>
    <section class="cm-panel" id="ca-access"><h2>Assinatura</h2>
      <fieldset class="co-kinds"><legend>Acesso</legend>
        <label><input type="radio" name="access" value="free"${group.access !== 'paid' ? ' checked' : ''}><span>${icon('users', 15)} Gratuita</span></label>
        <label><input type="radio" name="access" value="paid"${group.access === 'paid' ? ' checked' : ''}><span>${icon('pay', 15)} Paga</span></label></fieldset>
      <p class="co-hint">Paga: o cliente escolhe um plano no portal e paga pela AbacatePay. O acesso abre quando o pagamento entra e vence no fim do período (planos vitalícios não vencem). Quem você adiciona em Membros entra sem pagar.</p>
      <ul class="ca-rows" data-ca-list="plans">${(group.plans || []).map(rowTemplates.plans).join('')}</ul>
      <button type="button" class="secondary" data-cm="row-add" data-list="plans">${icon('plus', 15)} Adicionar plano</button>
      <label class="ca-narrow">Teste grátis (dias, 0 = sem teste)<input name="trialDays" type="number" min="0" max="30" value="${h(group.trialDays || 0)}"></label></section>
    <section class="cm-panel" id="ca-join"><h2>Perguntas de adesão</h2><p class="co-hint">Até 5 perguntas respondidas antes de entrar. As respostas aparecem em Membros, junto do pedido de entrada.</p>
      <ul class="ca-rows" data-ca-list="questions">${(group.questions || []).map(rowTemplates.questions).join('')}</ul>
      <button type="button" class="secondary" data-cm="row-add" data-list="questions">${icon('plus', 15)} Adicionar pergunta</button></section>
    <section class="cm-panel" id="ca-welcome"><h2>Boas-vindas</h2>
      <label>Mensagem automática para quem entra (por e-mail)<textarea name="welcomeDm" rows="4" maxlength="1500" placeholder="Oi {{nome}}, que bom ter você na {{comunidade}}! Comece se apresentando no canal Avisos.">${h(group.welcomeDm || '')}</textarea></label>
      <p class="co-hint">Use {{nome}} e {{comunidade}}. Vazia, ninguém recebe e-mail, mas o gatilho "Membro entrou na comunidade" continua disparando nas automações.</p>
      <h3>Etapas de boas-vindas</h3><p class="co-hint">Até 5 tarefas que o novo membro vê como uma lista para marcar no portal.</p>
      <ul class="ca-rows" data-ca-list="onboarding">${(group.onboarding || []).map(rowTemplates.onboarding).join('')}</ul>
      <button type="button" class="secondary" data-cm="row-add" data-list="onboarding">${icon('plus', 15)} Adicionar etapa</button></section>
    <section class="cm-panel" id="ca-look"><h2>Aparência</h2>
      <div class="ca-presets" role="radiogroup" aria-label="Temas prontos">${themePresets.map(row => `<label class="ca-preset"><input type="radio" name="theme.preset" value="${row.id}"${theme.preset === row.id ? ' checked' : ''}>
        <span class="ca-swatch" style="${themeStyle(row)}"><i></i><i></i><i></i></span><b>${h(row.name)}</b></label>`).join('')}
        <label class="ca-preset"><input type="radio" name="theme.preset" value="custom"${theme.preset === 'custom' ? ' checked' : ''}><span class="ca-swatch ca-custom">${icon('edit', 14)}</span><b>Personalizar</b></label></div>
      <div class="ca-tokens">${themeTokens.map(([key, label]) => `<label>${label}<input type="color" name="theme.${key}" value="${h(theme.tokens[key])}" data-ca-token="${key}"></label>`).join('')}</div>
      ${preview(theme)}</section>
    <section class="cm-panel" id="ca-layout"><h2>Layout</h2>
      <label>Convite para publicar<input name="layout.composerPrompt" maxlength="80" placeholder="${h(composerPromptDefault)}" value="${h(layout.composerPrompt || '')}"></label>
      <p class="co-hint">O texto que aparece no campo de publicar do feed. Vazio, usa o padrão.</p>
      <h3>Blocos da lateral</h3><p class="co-hint">Mostre, esconda e ordene os blocos da coluna direita. Um bloco só aparece quando a aba dele está visível e tem conteúdo.</p>
      <ol class="ca-rows" data-ca-list="widgets">${layout.widgets.map(widgetRow).join('')}</ol></section>
    <section class="cm-panel" id="ca-academy"><h2>Academia</h2><p class="co-hint">Escolha os cursos que aparecem na aba Academia. <b>Incluso para membros</b>: abre para quem é membro com acesso em dia. <b>Vendido à parte</b>: mostra o botão Quero acesso, que leva à oferta escolhida (ou à primeira oferta publicada com o curso).</p>
      ${courses.length ? `<ol class="ca-rows" data-ca-list="academy">${(group.academy?.courses || []).map(rowTemplates.academy).join('')}</ol>
      <button type="button" class="secondary" data-cm="row-add" data-list="academy">${icon('plus', 15)} Adicionar curso</button>` : '<p class="co-hint">Crie um curso em Cursos para montar a Academia.</p>'}</section>
    <section class="cm-panel" id="ca-tabs"><h2>Abas da comunidade</h2><p class="co-hint">Renomeie, esconda e mude a ordem das abas no portal.</p>
      <ol class="ca-rows" data-ca-list="tabs">${tabs.map(tabRow).join('')}</ol></section>
    <section class="cm-panel" id="ca-moderation"><h2>Moderação de conteúdo</h2>
      <label>Palavras que seguram a publicação para revisão (uma por linha ou separadas por vírgula)<textarea name="moderation.keywords" rows="3" maxlength="3000">${h((group.moderation?.keywords || []).join('\n'))}</textarea></label>
      <label class="cp-checkbox co-check"><input type="checkbox" name="moderation.spamPack"${group.moderation?.spamPack ? ' checked' : ''}><span>Pacote inicial anti-spam<small>Segura textos com golpes comuns, links de grupos e mais de 2 links. Moderadores e a equipe não passam pelo filtro.</small></span></label>
      <p class="co-hint">O que for retido ou denunciado aparece na aba Moderação.</p></section>
    <section class="cm-panel" id="ca-news"><h2>Newsletter</h2>
      <label class="cp-checkbox co-check"><input type="checkbox" name="newsletter.enabled"${news.enabled ? ' checked' : ''}><span>Enviar resumo por e-mail<small>As publicações com mais curtidas e comentários desde o último envio, para todos os membros com acesso. Sem publicações novas, não envia.</small></span></label>
      <div class="cm-row"><label>Frequência<select name="newsletter.frequency"><option value="weekly"${news.frequency !== 'daily' ? ' selected' : ''}>Semanal</option><option value="daily"${news.frequency === 'daily' ? ' selected' : ''}>Diária</option></select></label>
        <label>Dia (semanal)<select name="newsletter.weekday">${weekdays.map(([value, label]) => `<option value="${value}"${String(news.weekday) === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
        <label>Hora<select name="newsletter.hour">${Array.from({ length: 24 }, (_, n) => `<option value="${n}"${news.hour === n ? ' selected' : ''}>${String(n).padStart(2, '0')}:00</option>`).join('')}</select></label></div>
      <p class="co-hint">No fuso da subconta.</p></section>
    <section class="cm-panel" id="ca-badges"><h2>Emblemas</h2><p class="co-hint">Concedidos automaticamente. Os de engajamento são renovados a cada trimestre.</p>
      <div class="ca-badges">${badgeCatalog.map(row => `<label class="cp-checkbox"><input type="checkbox" name="badge.on" value="${row.key}"${(group.badgesOff || []).includes(row.key) ? '' : ' checked'}><span>${h(row.label)}<small>${h(row.description)}</small></span></label>`).join('')}</div></section>`;
}

/** The 6.2 fields of the settings form, in the shape the server expects. */
export function readSettings(form) {
  const f = new FormData(form), all = name => f.getAll(name).map(String);
  const planIds = all('plan.id'), planNames = all('plan.name'), prices = all('plan.price'), intervals = all('plan.interval');
  const questionIds = all('question.id'), texts = all('question.text');
  const requiredFlags = [...form.querySelectorAll('[name="question.required"]')].map(box => box.checked);
  const stepIds = all('step.id'), titles = all('step.title'), descriptions = all('step.description'), links = all('step.link');
  const tabKeys = all('tab.key'), tabLabels = all('tab.label'), visible = new Set(all('tab.visible'));
  const academyCourses = all('academy.courseId'), academyModes = all('academy.mode');
  const academyOffers = [...form.querySelectorAll('[name="academy.offerId"]')].map(select => select.value);
  const widgetShown = new Set(all('widget.visible'));
  const presetValue = f.get('theme.preset') || 'custom';
  const tokens = Object.fromEntries(themeTokens.map(([key]) => [key, f.get(`theme.${key}`)]));
  const preset = themePresets.find(row => row.id === presetValue);
  const changed = preset && themeTokens.some(([key]) => tokens[key] !== preset.tokens[key]);
  return {
    access: f.get('access'), trialDays: Number(f.get('trialDays') || 0),
    plans: planNames.map((name, i) => ({ id: planIds[i] || undefined, name, price: Number(prices[i]), interval: intervals[i] })).filter(row => row.name.trim() || row.price),
    questions: texts.map((text, i) => ({ id: questionIds[i] || undefined, text, required: requiredFlags[i] })).filter(row => row.text.trim()),
    welcomeDm: f.get('welcomeDm'),
    onboarding: titles.map((title, i) => ({ id: stepIds[i] || undefined, title, description: descriptions[i], link: links[i] })).filter(row => row.title.trim()),
    theme: { preset: changed ? 'custom' : presetValue, tokens },
    tabs: tabKeys.map((key, i) => ({ key, label: tabLabels[i], visible: visible.has(key) })),
    moderation: { keywords: f.get('moderation.keywords'), spamPack: f.has('moderation.spamPack') },
    newsletter: { enabled: f.has('newsletter.enabled'), frequency: f.get('newsletter.frequency'), weekday: Number(f.get('newsletter.weekday')), hour: Number(f.get('newsletter.hour')) },
    badgesOff: badgeCatalog.map(row => row.key).filter(key => !all('badge.on').includes(key)),
    layout: { composerPrompt: f.get('layout.composerPrompt') || '', widgets: all('widget.key').map(key => ({ key, visible: widgetShown.has(key) })) },
    ...(form.querySelector('[data-ca-list="academy"]') ? { academy: { courses: academyCourses.map((courseId, i) => ({ courseId, mode: academyModes[i], offerId: academyModes[i] === 'separate' ? academyOffers[i] : '' })) } } : {})
  };
}

/** An Academia row: the offer list follows the course, and only "sold separately" picks an offer. */
export function academyInput(target) {
  const row = target.closest('.ca-academy');
  if (!row || !target.matches('[name="academy.courseId"], [name="academy.mode"]')) return;
  const offer = row.querySelector('[name="academy.offerId"]');
  if (target.name === 'academy.courseId') offer.innerHTML = offerOptions(target.value);
  offer.disabled = row.querySelector('[name="academy.mode"]').value !== 'separate';
}

/** Repaint the theme preview after a preset or a color changes. */
export function themeInput(form, target) {
  if (target.name === 'theme.preset') {
    const preset = themePresets.find(row => row.id === target.value);
    if (preset) for (const [key] of themeTokens) form.querySelector(`[data-ca-token="${key}"]`).value = preset.tokens[key];
  } else if (target.matches('[data-ca-token]')) {
    const custom = form.querySelector('[name="theme.preset"][value="custom"]'); if (custom) custom.checked = true;
  } else return;
  const tokens = Object.fromEntries(themeTokens.map(([key]) => [key, form.querySelector(`[data-ca-token="${key}"]`).value]));
  form.querySelector('[data-ca-preview]').setAttribute('style', themeStyle({ tokens }));
}

export function moderationTab(c, data) {
  const zone = c.s.profile.timezone;
  return `<div class="cm-panel"><div class="cm-panel-head"><h2>Moderação</h2></div>
    <p class="co-hint">Publicações e comentários retidos pelas palavras-chave ou pelo anti-spam, e o que os membros denunciaram. Retidos só aparecem para o autor e os moderadores até você aprovar.</p>
    ${data.queue.length ? `<ul class="ca-queue">${data.queue.map(row => `<li class="cm-post">
      <header><div><strong>${h(row.author)}</strong> <small>${row.kind === 'post' ? 'Publicação' : `Comentário em “${h(row.title)}”`} · ${h(fmt(row.created, zone, true))}</small>
        <p>${row.held ? `<span class="badge gold">Precisa de avaliação</span> <small class="co-hint">${h(row.held)}</small>` : ''}${row.reports.length ? ` <span class="badge red">${row.reports.length} ${row.reports.length === 1 ? 'denúncia' : 'denúncias'}</span>` : ''}</p></div></header>
      ${row.kind === 'post' ? `<h3>${h(row.title)}</h3>` : ''}<p class="cm-body">${h(row.body)}</p>
      ${row.reports.length ? `<ul class="ca-reports">${row.reports.map(report => `<li><b>${h(report.name)}</b>: ${h(report.reason || 'sem motivo')}</li>`).join('')}</ul>` : ''}
      <div class="cm-row-actions">${row.held ? `<button type="button" class="primary" data-cm="mod" data-act="approve" data-id="${h(row.postId)}" data-comment="${h(row.commentId)}">Aprovar</button>`
        : `<button type="button" class="secondary" data-cm="mod" data-act="dismiss" data-id="${h(row.postId)}" data-comment="${h(row.commentId)}">Manter e limpar denúncias</button>`}
        <button type="button" class="danger plain" data-cm="mod" data-act="reject" data-id="${h(row.postId)}" data-comment="${h(row.commentId)}">${icon('trash', 15)} Excluir</button></div></li>`).join('')}</ul>`
      : `<div class="co-empty">${icon('check', 26)}<strong>Nada para revisar</strong><p>Quando algo for retido ou denunciado, aparece aqui.</p></div>`}</div>`;
}

export function analyticsTab(c, data, days) {
  const a = data.analytics, byDay = new Map(a.series.map(row => [row.day, row]));
  const series = Array.from({ length: a.days }, (_, i) => { const day = new Date(Date.now() - (a.days - 1 - i) * 86400000).toISOString().slice(0, 10); return byDay.get(day) || { day, posts: 0, comments: 0, likes: 0 }; });
  const max = Math.max(1, ...series.map(row => row.posts + row.comments + row.likes));
  const heatMax = Math.max(1, ...a.heat.flat());
  const tile = (label, value, note = '') => `<div class="surface metric"><span>${label}</span><b>${value}</b>${note ? `<small class="dim">${note}</small>` : ''}</div>`;
  return `<div class="cm-panel"><div class="cm-panel-head"><h2>Analytics</h2>
      <div class="ca-actions"><label class="ca-period">Período<select data-ca-days>${[[7, '7 dias'], [30, '30 dias'], [90, '90 dias'], [365, '12 meses']].map(([value, label]) => `<option value="${value}"${days === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
        <button type="button" class="secondary" data-cm="export-members">${icon('download', 15)} Exportar membros (CSV)</button></div></div>
    <div class="metrics">${tile('Ganhos', money(a.earnings), `${a.sales} ${a.sales === 1 ? 'venda' : 'vendas'} (planos e ingressos)`)}${tile('Membros ativos', a.members, `${a.paying} com plano pago`)}${tile('Novos membros', a.newMembers)}${tile('Inativos', a.inactive, 'sem atividade há 30 dias')}</div>
    <div class="metrics">${tile('Publicações', a.posts)}${tile('Comentários', a.comments)}${tile('Curtidas', a.likes)}${tile('Pedidos e pagamentos pendentes', a.requested + a.pendingPayment, `${a.banned} banido(s)`)}</div>
    <h3>Atividade por dia</h3>
    ${a.series.length ? `<div class="ca-daybars" role="img" aria-label="Atividade por dia">${series.map(row => { const total = row.posts + row.comments + row.likes;
      return `<span title="${h(row.day)}: ${row.posts} publicações, ${row.comments} comentários, ${row.likes} curtidas" style="height:${total ? Math.max(4, Math.round(total / max * 100)) : 1}%"></span>`; }).join('')}</div>`
      : '<p class="co-hint">Sem atividade no período.</p>'}
    <h3>Horários de pico</h3><p class="co-hint">Publicações, comentários e curtidas por dia da semana e hora, no fuso da subconta.</p>
    <div class="ca-heat" role="table" aria-label="Horários de pico"><div role="row"><span></span>${Array.from({ length: 24 }, (_, n) => `<b role="columnheader">${n % 3 === 0 ? n : ''}</b>`).join('')}</div>
      ${a.heat.map((row, day) => `<div role="row"><b role="rowheader">${weekdays[day][1].slice(0, 3)}</b>${row.map((count, hour) => `<i role="cell" title="${weekdays[day][1]} ${hour}h: ${count}" style="--v:${(count / heatMax).toFixed(2)}"></i>`).join('')}</div>`).join('')}</div>
    <p class="co-hint">De onde vêm os visitantes: veja Relatórios → Atribuição (as páginas do portal guardam a origem da visita).</p></div>`;
}

/** Members as a CSV file. */
export function membersCsv(group, data) {
  const cell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const plan = id => (group.plans || []).find(row => row.id === id);
  const header = ['Nome', 'E-mail', 'Situação', 'Função', 'Entrou em', 'Última atividade', 'Pontos', 'Nível', 'Plano', 'Acesso até', 'Emblemas', 'Respostas'];
  const rows = data.members.map(row => [row.name, row.email, row.status, row.role, row.joinedAt, row.lastActive, row.points, row.level, plan(row.planId) ? `${plan(row.planId).name} (${planPrice(plan(row.planId))})` : '',
    row.paidUntil, row.badges.map(badge => badge.label).join('; '), row.answers.map(answer => `${answer.question}: ${answer.answer}`).join(' | ')]);
  return [header, ...rows].map(line => line.map(cell).join(',')).join('\r\n');
}

/** The member's extra details in the members table. */
export function memberDetails(group, row) {
  const plan = (group.plans || []).find(item => item.id === row.planId);
  const bits = [
    row.badges?.length ? row.badges.map(badge => `<span class="badge">${h(badge.label)}</span>`).join(' ') : '',
    plan ? `<small>${h(plan.name)}${row.paidUntil ? ` · ${row.expired ? 'venceu' : 'até'} ${h(new Date(row.paidUntil).toLocaleDateString('pt-BR'))}` : ' · vitalício'}</small>`
      : row.paidUntil ? `<small>Teste grátis ${row.expired ? 'venceu em' : 'até'} ${h(new Date(row.paidUntil).toLocaleDateString('pt-BR'))}</small>` : '',
    group.onboarding?.length ? `<small>Boas-vindas: ${row.onboarding}/${group.onboarding.length}</small>` : '',
    row.answers?.length ? `<details class="ca-answers"><summary>Respostas</summary>${row.answers.map(answer => `<p><b>${h(answer.question)}</b><br>${h(answer.answer || '—')}</p>`).join('')}</details>` : ''
  ].filter(Boolean);
  return bits.length ? `<div class="ca-member-extra">${bits.join('')}</div>` : '';
}
export { communityTabKeys };
