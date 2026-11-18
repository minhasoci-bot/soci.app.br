// Sites → Webinars: sessions, registration page, reminders and registrants.
import { icon } from './icons.js';
import { h, pageShell } from './screens.js';
import { siteTabs } from './forms.js';
import { sessionEnd, whenLong } from './webinar-data.js';

export const webinarTabs = ['webinars', 'webinar'];
const wv = { id: '', rev: '', draft: null, dirty: false, section: 'setup' };
let env = null;
const badge = (label, tone = '') => `<span class="badge ${tone}">${h(label)}</span>`;
const when = iso => iso ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—';
const local = iso => iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '';
const pageUrl = (c, webinar) => `/w/${c.workspace}/${webinar.id}`;
const nextSession = webinar => webinar.sessions.filter(session => sessionEnd(session) > Date.now()).sort((a, b) => a.start.localeCompare(b.start))[0];
const regsOf = (c, id) => c.s.webinarRegistrations.filter(row => !id || row.webinarId === id);
const rate = (a, b) => b ? `${Math.round(a / b * 100)}%` : '—';
const presets = [[10080, '7 dias antes'], [1440, '1 dia antes'], [180, '3 horas antes'], [60, '1 hora antes'], [15, '15 minutos antes'], [10, '10 minutos antes'], [0, 'Na hora do início']];

function listView(c) {
  const button = `<button class="primary" data-wb-new>${icon('plus', 16)} Novo webinar</button>`;
  const regs = regsOf(c), attended = regs.filter(row => row.attendedAt).length;
  const rows = [...c.s.webinars].sort((a, b) => String(b.updated || b.created).localeCompare(String(a.updated || a.created))).map(webinar => {
    const next = nextSession(webinar), count = regsOf(c, webinar.id).length;
    return `<tr><td><a class="site-name" href="#sites/webinar/${webinar.id}">${icon('play', 16)}<span>${h(webinar.name)}</span></a></td><td>${next ? when(next.start) : '<span class="dim">Sem sessões futuras</span>'}</td><td>${count}</td><td>${rate(regsOf(c, webinar.id).filter(row => row.attendedAt).length, count)}</td><td>${webinar.active ? badge('Inscrições abertas', 'green') : badge('Rascunho')}</td>
      <td class="site-row-actions">${webinar.active ? `<a class="icon-btn" href="${pageUrl(c, webinar)}" target="_blank" rel="noopener" title="Página de inscrição" aria-label="Abrir inscrição de ${h(webinar.name)}">${icon('external', 15)}</a>` : ''}<a class="secondary site-open" href="#sites/webinar/${webinar.id}">Abrir</a></td></tr>`;
  }).join('');
  return pageShell({ title: 'Sites', desc: 'Crie funis, sites e formulários com IA, publique e acompanhe visitas e conversões.', cta: button, className: 'sites-page',
    tabs: { key: 'sites', label: 'Seções de sites', current: 'webinars', items: siteTabs },
    content: `<div class="metrics three"><div class="surface metric"><span>Webinars</span><b>${c.s.webinars.length}</b></div><div class="surface metric"><span>Inscritos</span><b>${regs.length}</b></div><div class="surface metric"><span>Presença</span><b>${rate(attended, regs.length)}</b></div></div>
      ${rows ? `<div class="surface table-shell"><table class="site-table"><thead><tr><th scope="col">Webinar</th><th scope="col">Próxima sessão</th><th scope="col">Inscritos</th><th scope="col">Presença</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead><tbody>${rows}</tbody></table></div>`
        : `<div class="surface empty site-empty">${icon('play', 26)}<strong>Nenhum webinar ainda</strong><p>Página de inscrição com sessões, sala com contagem regressiva, lembretes automáticos e lista de presença.</p>${button}</div>`}` });
}

function loadDraft(c) {
  const webinar = c.s.webinars.find(row => row.id === c.studio.project);
  if (!webinar) return null;
  if (wv.id !== webinar.id || (!wv.dirty && wv.rev !== (webinar.updated || webinar.created))) {
    if (wv.id !== webinar.id) wv.section = 'setup';
    Object.assign(wv, { id: webinar.id, rev: webinar.updated || webinar.created, dirty: false, draft: structuredClone(webinar) });
  }
  return webinar;
}

function setupHtml() {
  const d = wv.draft;
  const set = (key, label, value, extra = '') => `<label>${label}<input data-wb-set="${key}" value="${h(value)}"${extra}></label>`;
  return `<div class="fb-settings">
    <section class="surface padded"><h2>Webinar</h2>${set('name', 'Nome', d.name, ' maxlength="120"')}<label>Descrição (aparece na página de inscrição)<textarea data-wb-set="description" rows="4" maxlength="2000">${h(d.description)}</textarea></label>
      <div class="fb-two">${set('host', 'Apresentado por', d.host, ' maxlength="80"')}<label>Cor<span class="fb-color"><input type="color" data-wb-set="color" value="${h(d.color)}"><code>${h(d.color)}</code></span></label></div></section>
    <section class="surface padded"><div class="bl-side-head"><h2>Sessões</h2><button type="button" class="secondary" data-wb-add-session>${icon('plus', 14)} Adicionar sessão</button></div>
      ${d.sessions.length ? d.sessions.map((session, index) => `<div class="wb-row${sessionEnd(session) <= Date.now() ? ' past' : ''}"><label>Início<input type="datetime-local" data-wb-session="${index}" data-key="start" value="${local(session.start)}"></label>
        <label>Duração (min)<input type="number" min="10" max="480" data-wb-session="${index}" data-key="duration" value="${session.duration}"></label>${sessionEnd(session) <= Date.now() ? '<span class="badge">Encerrada</span>' : ''}<button type="button" class="icon-btn" data-wb-del-session="${index}" aria-label="Remover sessão" title="Remover">${icon('trash', 15)}</button></div>`).join('')
        : '<p class="dim">Adicione pelo menos uma sessão para abrir as inscrições.</p>'}</section>
    <section class="surface padded"><h2>Sala</h2>${set('joinUrl', 'Link da transmissão (Meet, Zoom, YouTube…)', d.joinUrl, ' type="url" maxlength="600" placeholder="https://"')}
      <div class="fb-two"><label>Abrir a sala antes (min)<input type="number" min="0" max="60" data-wb-set="openBefore" value="${d.openBefore}"></label>${set('replayUrl', 'Link da gravação (depois)', d.replayUrl, ' type="url" maxlength="600" placeholder="https://"')}</div>
      <p class="dim">O link só aparece para quem se inscreveu, na sala, a partir do horário de abertura.</p></section>
    <section class="surface padded"><h2>Inscrição</h2><label class="check"><input type="checkbox" data-wb-set="requirePhone"${d.requirePhone ? ' checked' : ''}> WhatsApp obrigatório</label>
      ${set('addTags', 'Tags para o contato', (d.addTags || []).join(', '), ' maxlength="400" placeholder="webinar-marca"')}<label>Mensagem na confirmação<textarea data-wb-set="thanks" rows="2" maxlength="400">${h(d.thanks)}</textarea></label></section>
    <div class="inline-gap"><button class="secondary danger" data-wb-delete>Excluir webinar</button></div></div>`;
}

function remindersHtml() {
  const d = wv.draft;
  return `<div class="fb-settings"><section class="surface padded"><h2>Lembretes</h2><p class="dim">No horário de cada lembrete, a mensagem fica registrada na conversa do inscrito em Conversas. Lembretes de WhatsApp também são enviados quando o WhatsApp da subconta está conectado. Use <code>{{nome}}</code>, <code>{{webinar}}</code>, <code>{{data}}</code> e <code>{{link}}</code> (o link da sala).</p></section>
    ${d.reminders.map((reminder, index) => `<section class="surface padded wb-reminder"><div class="fb-two"><label>Quando<select data-wb-rem="${index}" data-key="minutes">${presets.map(([minutes, label]) => `<option value="${minutes}"${reminder.minutes === minutes ? ' selected' : ''}>${label}</option>`).join('')}${presets.some(([m]) => m === reminder.minutes) ? '' : `<option value="${reminder.minutes}" selected>${reminder.minutes} min antes</option>`}</select></label>
      <label>Canal<select data-wb-rem="${index}" data-key="channel">${['Email', 'SMS', 'WhatsApp'].map(channel => `<option${reminder.channel === channel ? ' selected' : ''}>${channel}</option>`).join('')}</select></label></div>
      <label>Mensagem<textarea data-wb-rem="${index}" data-key="body" rows="3" maxlength="600">${h(reminder.body)}</textarea></label><div><button type="button" class="secondary danger" data-wb-del-rem="${index}">Remover lembrete</button></div></section>`).join('')}
    ${d.reminders.length < 6 ? `<button type="button" class="secondary" data-wb-add-rem>${icon('plus', 15)} Adicionar lembrete</button>` : ''}</div>`;
}

function registrantsHtml(c, webinar) {
  const regs = regsOf(c, webinar.id).sort((a, b) => String(b.created).localeCompare(String(a.created)));
  const session = id => webinar.sessions.find(row => row.id === id);
  const attended = regs.filter(row => row.attendedAt).length;
  return `<div class="metrics three"><div class="surface metric"><span>Inscritos</span><b>${regs.length}</b></div><div class="surface metric"><span>Presentes</span><b>${attended}</b></div><div class="surface metric"><span>Presença</span><b>${rate(attended, regs.length)}</b></div></div>
    ${regs.length ? `<div class="toolbar"><span class="spacer"></span><button class="secondary" data-wb-csv>${icon('download', 15)} Exportar CSV</button></div><div class="surface table-shell"><table class="site-table"><thead><tr><th scope="col">Nome</th><th scope="col">Contato</th><th scope="col">Sessão</th><th scope="col">Inscrito em</th><th scope="col">Lembretes</th><th scope="col">Presença</th></tr></thead><tbody>
      ${regs.map(row => `<tr><td><b>${h(row.name)}</b></td><td>${h(row.email)}${row.phone ? `<small class="dim">${h(row.phone)}</small>` : ''}</td><td>${session(row.sessionId) ? when(session(row.sessionId).start) : '<span class="dim">Removida</span>'}</td><td>${when(row.created)}</td><td>${Object.keys(row.sent || {}).length} de ${webinar.reminders.length}</td><td>${row.attendedAt ? badge('Presente', 'green') : badge('—')}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="surface empty"><strong>Nenhum inscrito ainda</strong><p>Abra as inscrições e compartilhe a página.</p></div>'}`;
}

function shareHtml(c, webinar) {
  if (!webinar.active) return `<div class="surface empty fb-integrate-off">${icon('lock', 24)}<strong>Abra as inscrições para compartilhar</strong><p>A página funciona depois de publicar.</p><button class="primary" data-wb-publish="on">Abrir inscrições</button></div>`;
  const link = `${location.origin}${pageUrl(c, webinar)}`;
  return `<div class="fb-settings"><section class="surface padded"><h2>${icon('link', 16)} Página de inscrição</h2><div class="fb-copy"><input readonly value="${h(link)}" aria-label="Link de inscrição"><button class="secondary" data-wb-copy="${h(link)}">Copiar</button><a class="secondary" href="${h(link)}" target="_blank" rel="noopener">${icon('external', 14)} Abrir</a></div>
    <p class="dim">Crie um QR Code para esta página em Sites → QR Codes.</p></section></div>`;
}

function editorView(c) {
  const webinar = loadDraft(c);
  if (!webinar) return `<div class="page sites-page"><div class="surface empty"><strong>Webinar não encontrado</strong><a class="primary" href="#sites/webinars">Voltar aos webinars</a></div></div>`;
  const d = wv.draft;
  const body = wv.section === 'reminders' ? remindersHtml() : wv.section === 'people' ? registrantsHtml(c, webinar) : wv.section === 'share' ? shareHtml(c, webinar) : setupHtml();
  return `<div class="fb dw-workspace wb-editor"><header class="fb-top dw-header"><a class="secondary fb-back" href="#sites/webinars">${icon('left', 15)} Webinars</a>
      <div class="fb-title"><h1>${h(d.name)}</h1>${webinar.active ? badge('Inscrições abertas', 'green') : badge('Rascunho')}${wv.dirty ? badge('Alterações não salvas', 'blue') : ''}</div>
      <div class="fb-top-actions"><a class="secondary" href="${pageUrl(c, webinar)}${webinar.active ? '' : '?preview=1'}" target="_blank" rel="noopener">${icon('external', 14)} ${webinar.active ? 'Ver inscrição' : 'Prévia'}</a>
        <button class="secondary" data-wb-publish="${webinar.active ? 'off' : 'on'}">${webinar.active ? 'Fechar inscrições' : 'Abrir inscrições'}</button><button class="primary" data-wb-save${wv.dirty ? '' : ' disabled'}>Salvar</button></div></header>
    <nav class="fb-sections" aria-label="Seções do webinar">${[['setup', 'Configurar'], ['reminders', `Lembretes (${d.reminders.length})`], ['people', `Inscritos (${regsOf(c, webinar.id).length})`], ['share', 'Compartilhar']].map(([id, label]) => `<button class="${wv.section === id ? 'selected' : ''}" aria-current="${wv.section === id ? 'page' : 'false'}" data-wb-section="${id}">${label}</button>`).join('')}</nav>
    <div class="st-body">${body}</div></div>`;
}

export function webinarScreen(c) { return c.tab === 'webinar' ? editorView(c) : listView(c); }

function dialog(title, body, label, onSubmit) {
  const overlay = document.getElementById('overlay');
  overlay.innerHTML = `<dialog id="dialog" class="site-dialog fm-dialog" aria-labelledby="wb-title"><header><div><h2 id="wb-title">${h(title)}</h2></div><button class="icon-btn" type="button" aria-label="Fechar" data-wb-close>${icon('close', 17)}</button></header>
    <form><div class="modal-body">${body}<p class="form-status" role="alert"></p></div><footer><button type="button" class="secondary" data-wb-close>Cancelar</button><button class="primary">${h(label)}</button></footer></form></dialog>`;
  const el = document.getElementById('dialog');
  el.showModal(); el.querySelector('input')?.focus();
  el.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const status = el.querySelector('.form-status'), button = el.querySelector('button.primary');
    button.disabled = true; status.textContent = '';
    try { await onSubmit(Object.fromEntries(new FormData(event.target))); close(); } catch (error) { status.textContent = error.message; button.disabled = false; }
  });
}
const close = () => { const overlay = document.getElementById('overlay'); overlay.querySelector('dialog')?.close(); overlay.innerHTML = ''; };

export function installWebinars(environment) {
  env = environment;
  const { c, mutate, flash, render } = env;
  const inEditor = () => c.view === 'sites' && c.tab === 'webinar';
  const current = () => c.s.webinars.find(row => row.id === wv.id);
  const touch = () => { if (wv.dirty) return; wv.dirty = true; const save = document.querySelector('[data-wb-save]'); if (save) save.disabled = false; document.querySelector('.wb-editor .fb-title')?.insertAdjacentHTML('beforeend', badge('Alterações não salvas', 'blue')); };
  const save = async (extra = {}) => { await mutate({ type: 'save', key: 'webinars', id: wv.id, data: { ...wv.draft, ...extra } }); wv.dirty = false; wv.rev = ''; };

  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-wb-close],[data-wb-new],[data-wb-section],[data-wb-add-session],[data-wb-del-session],[data-wb-add-rem],[data-wb-del-rem],[data-wb-save],[data-wb-publish],[data-wb-delete],[data-wb-copy],[data-wb-csv]');
    if (!target || !(c.view === 'sites' || target.closest('#overlay'))) return;
    const d = target.dataset;
    try {
      if ('wbClose' in d) { close(); return; }
      if ('wbNew' in d) {
        const tomorrow = new Date(Date.now() + 7 * 864e5); tomorrow.setHours(19, 0, 0, 0);
        dialog('Novo webinar', `<label>Nome<input name="name" required maxlength="120" placeholder="Ex. Marca forte em 60 minutos"></label><label>Primeira sessão<input name="start" type="datetime-local" required value="${local(tomorrow.toISOString())}"></label><label>Duração (min)<input name="duration" type="number" min="10" max="480" value="60"></label>`, 'Criar webinar', async data => {
          const reminders = [{ minutes: 1440, channel: 'Email', body: 'Oi, {{nome}}! Amanhã tem “{{webinar}}”, {{data}}. Seu link de acesso: {{link}}' }, { minutes: 60, channel: 'Email', body: '{{nome}}, “{{webinar}}” começa em 1 hora ({{data}}). Entre por aqui: {{link}}' }, { minutes: 10, channel: 'WhatsApp', body: 'Estamos começando em 10 minutos! Link: {{link}}' }];
          const id = await mutate({ type: 'save', key: 'webinars', data: { name: data.name, active: false, sessions: [{ start: new Date(data.start).toISOString(), duration: Number(data.duration) }], reminders, openBefore: 15 } });
          wv.id = ''; location.hash = `#sites/webinar/${id}`; flash('Webinar criado. Revise e abra as inscrições.');
        });
        return;
      }
      if ('wbCsv' in d) {
        const webinar = current(), cell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
        const lines = [['Nome', 'E-mail', 'Telefone', 'Sessão', 'Inscrito em', 'Presente'].map(cell).join(','), ...regsOf(c, webinar.id).map(row => [row.name, row.email, row.phone, webinar.sessions.find(s => s.id === row.sessionId)?.start || '', row.created, row.attendedAt ? 'Sim' : 'Não'].map(cell).join(','))];
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })), download: 'inscritos.csv' }); a.click(); return;
      }
      if (!inEditor()) return;
      if (d.wbSection) { wv.section = d.wbSection; render(); return; }
      if ('wbAddSession' in d) { const last = wv.draft.sessions.at(-1); wv.draft.sessions.push({ start: new Date((last ? Date.parse(last.start) : Date.now()) + 7 * 864e5).toISOString(), duration: last?.duration || 60 }); wv.dirty = true; render(); return; }
      if (d.wbDelSession) { wv.draft.sessions.splice(Number(d.wbDelSession), 1); wv.dirty = true; render(); return; }
      if ('wbAddRem' in d) { wv.draft.reminders.push({ minutes: 60, channel: 'Email', body: '{{nome}}, “{{webinar}}” começa em breve: {{link}}' }); wv.dirty = true; render(); return; }
      if (d.wbDelRem) { wv.draft.reminders.splice(Number(d.wbDelRem), 1); wv.dirty = true; render(); return; }
      if (d.wbCopy) { await navigator.clipboard.writeText(d.wbCopy); flash('Link copiado.'); return; }
      if ('wbSave' in d) { target.disabled = true; await save(); render(); flash('Webinar salvo.'); return; }
      if (d.wbPublish) { target.disabled = true; await save({ active: d.wbPublish === 'on' }); render(); flash(d.wbPublish === 'on' ? 'Inscrições abertas.' : 'Inscrições fechadas.'); return; }
      if ('wbDelete' in d) {
        const webinar = current(), n = regsOf(c, webinar.id).length;
        dialog('Excluir webinar?', `<p>“${h(webinar.name)}” sai do ar${n ? ` e as ${n} inscrições são apagadas (os contatos continuam)` : ''}. Isso não pode ser desfeito.</p>`, 'Excluir', async () => { await mutate({ type: 'delete', key: 'webinars', id: webinar.id }); wv.id = ''; location.hash = '#sites/webinars'; flash('Webinar excluído.'); });
      }
    } catch (error) { flash(error.message, true); render(); }
  });

  const onEdit = event => {
    const el = event.target;
    if (!inEditor() || !wv.draft) return;
    if (el.dataset.wbSession !== undefined) { const session = wv.draft.sessions[Number(el.dataset.wbSession)]; if (el.dataset.key === 'start') { if (el.value) session.start = new Date(el.value).toISOString(); } else session.duration = Number(el.value); touch(); return; }
    if (el.dataset.wbRem !== undefined) { const reminder = wv.draft.reminders[Number(el.dataset.wbRem)]; reminder[el.dataset.key] = el.dataset.key === 'minutes' ? Number(el.value) : el.value; touch(); return; }
    if (!el.dataset.wbSet) return;
    const key = el.dataset.wbSet;
    wv.draft[key] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : key === 'addTags' ? el.value.split(',').map(tag => tag.trim()).filter(Boolean) : el.value;
    if (key === 'color') el.nextElementSibling.textContent = el.value;
    if (key === 'name') document.querySelector('.wb-editor .fb-title h1').textContent = el.value;
    touch();
  };
  document.addEventListener('input', onEdit);
  document.addEventListener('change', event => { if (event.target.tagName === 'SELECT') onEdit(event); });
}
