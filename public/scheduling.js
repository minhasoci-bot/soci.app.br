// Calendários → Serviços, Recursos, Serviço em campo e Página de agendamento (6b.6).
import { icon } from './icons.js';
import { badge, h, pageShell } from './screens.js';
import { ask } from './ask.js';
import { destinationField, readDestination } from './destination-field.js';

export const schedulingTabs = [['services', 'Serviços'], ['resources', 'Recursos'], ['field', 'Serviço em campo'], ['booking', 'Página de agendamento']];
const kinds = [['appointment', 'Atendimento no local'], ['field', 'Serviço em campo'], ['rental', 'Locação']];
const resourceKinds = [['room', 'Sala'], ['equipment', 'Equipamento'], ['vehicle', 'Veículo'], ['rental', 'Item para locação']];
const fieldStatuses = [['scheduled', 'Agendado', ''], ['en_route', 'A caminho', 'blue'], ['on_site', 'No local', 'pink'], ['done', 'Concluído', 'green']];
const weekdayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const defaults = { enabled: false, title: 'Agende um horário', intro: 'Escolha o serviço, o dia e o horário.', step: 30, leadMinutes: 120, horizonDays: 30, staff: [],
  hours: { 0: [], 1: ['09:00', '18:00'], 2: ['09:00', '18:00'], 3: ['09:00', '18:00'], 4: ['09:00', '18:00'], 5: ['09:00', '18:00'], 6: ['09:00', '13:00'] } };
const conf = c => ({ ...defaults, ...(c.s.scheduling || {}) });
const brl = n => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);
const zone = c => c.s.profile.timezone || 'America/Sao_Paulo';
const today = c => new Intl.DateTimeFormat('en-CA', { timeZone: zone(c), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const dayOf = (c, iso) => new Intl.DateTimeFormat('en-CA', { timeZone: zone(c), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
const clock = (c, iso) => new Intl.DateTimeFormat('pt-BR', { timeZone: zone(c), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
const ui = { day: '', staff: '' };
const staffName = (c, id) => conf(c).staff.find(p => p.id === id)?.name || '';
const bookingUrl = c => `${location.origin}/agendar/${c.workspace || new URLSearchParams(location.search).get('workspace') || 'demo'}`;
const empty = (title, text, act, label) => `<div class="surface empty-state sch-empty">${icon('cal', 22)}<b>${title}</b><p class="dim">${text}</p>${act ? `<button type="button" class="primary" data-sch="${act}">${icon('plus', 15)} ${label}</button>` : ''}</div>`;

function servicesView(c) {
  const rows = c.s.services || [];
  if (!rows.length) return empty('Nenhum serviço ainda', 'Cadastre os serviços que seus clientes podem agendar: duração, preço, quem atende e o que é usado.', 'service-new', 'Novo serviço');
  return `<div class="sch-bar"><button type="button" class="primary" data-sch="service-new">${icon('plus', 15)} Novo serviço</button></div>
    <div class="surface table-shell"><table><thead><tr><th scope="col">Serviço</th><th scope="col">Tipo</th><th scope="col">Duração</th><th scope="col">Preço</th><th scope="col">Quem atende</th><th scope="col">Recursos</th><th scope="col"></th></tr></thead><tbody>
    ${rows.map(x => `<tr><td><span class="sch-dot" style="background:${h(x.color)}"></span><b>${h(x.name)}</b>${x.active ? '' : ` ${badge('Pausado')}`}</td><td>${h(kinds.find(([k]) => k === x.kind)?.[1] || '')}</td>
      <td>${x.kind === 'rental' ? `por ${x.rentalUnit === 'day' ? 'dia' : 'hora'} (até ${x.maxUnits})` : `${x.duration} min${x.buffer ? ` + ${x.buffer} min` : ''}`}</td><td>${brl(x.price)}</td>
      <td>${h(x.staffIds.map(id => staffName(c, id)).filter(Boolean).join(', ') || '—')}</td><td>${h(x.resourceIds.map(id => (c.s.resources || []).find(r => r.id === id)?.name).filter(Boolean).join(', ') || '—')}</td>
      <td class="right"><button type="button" class="icon-btn" data-sch="service-edit" data-id="${h(x.id)}" aria-label="Editar ${h(x.name)}">${icon('edit', 15)}</button></td></tr>`).join('')}</tbody></table></div>`;
}

function serviceForm(c, x) {
  const row = x || { name: '', description: '', kind: 'appointment', duration: 60, buffer: 0, price: 0, staffIds: [], resourceIds: [], rentalUnit: 'hour', maxUnits: 8, active: true, color: '#b71889' };
  const staff = conf(c).staff, resources = c.s.resources || [];
  return `<form class="settings-form sch-form" data-sch-form="service" data-id="${h(x?.id || '')}">
    <div class="field-grid"><label>Nome<input name="name" required maxlength="80" value="${h(row.name)}" placeholder="Ex.: Corte de cabelo"></label>
      <label>Tipo<select name="kind">${kinds.map(([k, l]) => `<option value="${k}"${row.kind === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <label>Descrição<input name="description" maxlength="500" value="${h(row.description)}"></label>
    <div class="field-grid"><label>Duração (minutos)<input name="duration" type="number" min="5" max="720" value="${h(row.duration)}"></label><label>Intervalo depois (minutos)<input name="buffer" type="number" min="0" max="240" value="${h(row.buffer)}"></label>
      <label>Preço (R$)<input name="price" type="number" min="0" step="0.01" value="${h(row.price)}"></label></div>
    <fieldset class="sch-rental"><legend>Locação</legend><div class="field-grid"><label>Cobrança<select name="rentalUnit"><option value="hour"${row.rentalUnit !== 'day' ? ' selected' : ''}>Por hora</option><option value="day"${row.rentalUnit === 'day' ? ' selected' : ''}>Por dia</option></select></label>
      <label>Máximo de horas ou dias<input name="maxUnits" type="number" min="1" max="90" value="${h(row.maxUnits)}"></label></div><p class="dim">Na locação, o preço é por hora ou dia e a quantidade disponível vem do recurso escolhido.</p></fieldset>
    <fieldset><legend>Quem atende</legend>${staff.length ? `<div class="sch-checks">${staff.map(p => `<label class="sch-check"><input type="checkbox" name="staffIds" value="${h(p.id)}"${row.staffIds.includes(p.id) ? ' checked' : ''}> ${h(p.name)}</label>`).join('')}</div><p class="dim">O cliente fica com o primeiro profissional livre no horário.</p>` : '<p class="dim">Cadastre a equipe em Página de agendamento.</p>'}</fieldset>
    <fieldset><legend>Regras deste serviço</legend><div class="field-grid"><label>Antecedência mínima (minutos)<input name="leadMinutes" type="number" min="0" max="20160" value="${h(row.leadMinutes ?? '')}" placeholder="${h(conf(c).leadMinutes)} (padrão da agenda)"></label>
      <label>Agenda aberta por (dias)<input name="horizonDays" type="number" min="1" max="365" value="${h(row.horizonDays ?? '')}" placeholder="${h(conf(c).horizonDays)} (padrão da agenda)"></label></div>
      <p class="dim">Vazio segue o padrão. Para reuniões de venda, 1080 minutos (18 horas) e 4 dias dão tempo de confirmar sem deixar o lead esfriar.</p>
      ${destinationField(c, row.after, { attrs: key => `name="after.${key}"`, actions: ['message', 'redirect', 'page'], label: 'Depois de agendar', messageHint: 'A agenda mostra a confirmação com dia e horário.' })}</fieldset>
    <fieldset><legend>Recursos usados</legend>${resources.length ? `<div class="sch-checks">${resources.map(r => `<label class="sch-check"><input type="checkbox" name="resourceIds" value="${h(r.id)}"${row.resourceIds.includes(r.id) ? ' checked' : ''}> ${h(r.name)} <small class="dim">(${r.quantity})</small></label>`).join('')}</div>` : '<p class="dim">Cadastre salas, equipamentos, veículos ou itens de locação em Recursos.</p>'}</fieldset>
    <div class="field-grid"><label>Cor<input name="color" type="color" value="${h(row.color)}"></label><label class="switch-row"><span><b>Disponível para agendar</b></span><input type="checkbox" name="active"${row.active ? ' checked' : ''}></label></div>
    <div class="tx-actions">${x ? `<button type="button" class="danger plain" data-sch="service-delete" data-id="${h(x.id)}">Excluir</button>` : ''}<button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary">Salvar</button></div><p class="form-status" role="alert"></p></form>`;
}

function resourcesView(c) {
  const rows = c.s.resources || [];
  if (!rows.length) return empty('Nenhum recurso ainda', 'Recursos são salas, equipamentos, veículos ou itens de locação. Cada um tem uma quantidade, e a agenda não deixa usar mais do que existe no mesmo horário.', 'resource-new', 'Novo recurso');
  const now = Date.now();
  return `<div class="sch-bar"><button type="button" class="primary" data-sch="resource-new">${icon('plus', 15)} Novo recurso</button></div>
    <div class="surface table-shell"><table><thead><tr><th scope="col">Recurso</th><th scope="col">Tipo</th><th scope="col">Quantidade</th><th scope="col">Em uso agora</th><th scope="col">Próximos usos</th><th scope="col"></th></tr></thead><tbody>
    ${rows.map(r => { const uses = c.s.appointments.filter(a => a.status !== 'Canceled' && (a.resourceIds || []).includes(r.id));
      const inUse = uses.filter(a => Date.parse(a.start) <= now && Date.parse(a.end) > now).reduce((n, a) => n + (a.quantity || 1), 0);
      return `<tr><td><b>${h(r.name)}</b>${r.active ? '' : ` ${badge('Pausado')}`}${r.notes ? `<br><small class="dim">${h(r.notes)}</small>` : ''}</td><td>${h(resourceKinds.find(([k]) => k === r.kind)?.[1] || '')}</td><td>${r.quantity}</td>
        <td>${inUse ? badge(`${inUse} de ${r.quantity}`, 'blue') : '—'}</td><td>${uses.filter(a => Date.parse(a.end) > now).length}</td>
        <td class="right"><button type="button" class="icon-btn" data-sch="resource-edit" data-id="${h(r.id)}" aria-label="Editar ${h(r.name)}">${icon('edit', 15)}</button></td></tr>`; }).join('')}</tbody></table></div>`;
}

function resourceForm(r) {
  const row = r || { name: '', kind: 'room', quantity: 1, notes: '', active: true };
  return `<form class="settings-form" data-sch-form="resource" data-id="${h(r?.id || '')}"><div class="field-grid"><label>Nome<input name="name" required maxlength="80" value="${h(row.name)}" placeholder="Ex.: Sala 1"></label>
    <label>Tipo<select name="kind">${resourceKinds.map(([k, l]) => `<option value="${k}"${row.kind === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label><label>Quantidade<input name="quantity" type="number" min="1" max="999" value="${h(row.quantity)}"></label></div>
    <label>Observações<input name="notes" maxlength="300" value="${h(row.notes)}"></label><label class="switch-row"><span><b>Disponível</b></span><input type="checkbox" name="active"${row.active ? ' checked' : ''}></label>
    <div class="tx-actions">${r ? `<button type="button" class="danger plain" data-sch="resource-delete" data-id="${h(r.id)}">Excluir</button>` : ''}<button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary">Salvar</button></div><p class="form-status" role="alert"></p></form>`;
}

function fieldView(c) {
  const day = ui.day || today(c), staff = conf(c).staff;
  const jobs = c.s.appointments.filter(a => a.fieldStatus && a.status !== 'Canceled' && dayOf(c, a.start) === day && (!ui.staff || a.staffId === ui.staff)).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const stops = jobs.map(a => a.address).filter(Boolean);
  const maps = stops.length ? `https://www.google.com/maps/dir/${stops.map(encodeURIComponent).join('/')}` : '';
  const head = `<div class="sch-bar"><label>Dia<input type="date" data-sch-filter="day" value="${h(day)}"></label>
    <label>Técnico<select data-sch-filter="staff"><option value="">Todos</option>${staff.map(p => `<option value="${h(p.id)}"${p.id === ui.staff ? ' selected' : ''}>${h(p.name)}</option>`).join('')}</select></label>
    ${maps ? `<a class="secondary button" href="${h(maps)}" target="_blank" rel="noopener">${icon('pin', 15)} Abrir rota do dia no Google Maps</a>` : ''}</div>`;
  if (!jobs.length) return head + empty('Nenhum serviço em campo neste dia', 'Serviços do tipo "Serviço em campo" têm o endereço do cliente. Agende um pelo calendário ou pela página de agendamento, e acompanhe aqui a rota e a situação de cada visita.');
  return head + `<ol class="sch-route">${jobs.map((a, i) => { const who = c.s.contacts.find(x => x.id === a.contactId); const st = fieldStatuses.find(([k]) => k === a.fieldStatus) || fieldStatuses[0];
    return `<li class="surface"><span class="sch-stop">${i + 1}</span><div class="sch-job"><b>${clock(c, a.start)}–${clock(c, a.end)} · ${h(a.title)}</b>
      <small>${h(who?.name || 'Sem contato')}${who?.phone ? ` · ${h(who.phone)}` : ''}${a.staffId ? ` · ${h(staffName(c, a.staffId))}` : ''}</small>
      <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.address)}" target="_blank" rel="noopener">${icon('pin', 14)} ${h(a.address)}</a></div>
      ${badge(st[1], st[2])}<div class="sch-steps">${fieldStatuses.slice(1).map(([k, l]) => `<button type="button" class="${a.fieldStatus === k ? 'primary' : 'secondary'}" data-sch="field" data-id="${h(a.id)}" data-status="${k}"${a.fieldStatus === k ? ' aria-pressed="true"' : ''}>${l}</button>`).join('')}</div></li>`; }).join('')}</ol>
    <p class="dim">Use a automação "Serviço em campo: situação mudou" para avisar o cliente quando o técnico estiver a caminho.</p>`;
}

function bookingSettings(c) {
  const k = conf(c), url = bookingUrl(c);
  return `<form class="surface settings-form set-form sch-settings" data-sch-form="settings">
    <section class="set-section"><header class="set-head"><h2>Página pública</h2><p class="dim">O endereço que você envia para o cliente agendar sozinho.</p></header><div class="set-body"><label class="switch-row"><span><b>Página de agendamento ligada</b><br><small class="dim">Clientes escolhem o serviço, o dia e um horário livre. O contato é criado ou encontrado pelo e-mail.</small></span><input type="checkbox" name="enabled"${k.enabled ? ' checked' : ''}></label>
    ${k.enabled ? `<div class="sch-link"><code>${h(url)}</code><button type="button" class="secondary" data-sch="copy">${icon('copy', 15)} Copiar link</button><a class="secondary button" href="${h(url)}" target="_blank" rel="noopener">${icon('external', 15)} Abrir</a></div>` : ''}
    <div class="field-grid"><label>Título<input name="title" maxlength="100" value="${h(k.title)}"></label><label>Texto de abertura<input name="intro" maxlength="400" value="${h(k.intro)}"></label></div></div></section>
    <section class="set-section"><header class="set-head"><h2>Horário de funcionamento</h2><p class="dim">Os dias e as horas em que é possível marcar.</p></header><div class="set-body"><div class="sch-hours">${[1, 2, 3, 4, 5, 6, 0].map(w => { const [open, close] = k.hours[w] || [];
      return `<label class="sch-check"><input type="checkbox" name="open${w}"${open ? ' checked' : ''}> ${weekdayNames[w]}</label><input type="time" name="from${w}" value="${h(open || '09:00')}" aria-label="${weekdayNames[w]}: abre"><input type="time" name="to${w}" value="${h(close || '18:00')}" aria-label="${weekdayNames[w]}: fecha">`; }).join('')}</div></div></section>
    <section class="set-section"><header class="set-head"><h2>Regras da agenda</h2><p class="dim">De quanto em quanto tempo, com que antecedência e até quando.</p></header><div class="set-body"><div class="field-grid is-three"><label>Horários a cada<select name="step">${[10, 15, 20, 30, 45, 60, 90, 120].map(n => `<option value="${n}"${k.step === n ? ' selected' : ''}>${n} min</option>`).join('')}</select></label>
      <label>Antecedência mínima (minutos)<input name="leadMinutes" type="number" min="0" max="20160" value="${h(k.leadMinutes)}"></label><label>Agenda aberta por (dias)<input name="horizonDays" type="number" min="1" max="365" value="${h(k.horizonDays)}"></label></div></div></section>
    <section class="set-section"><header class="set-head"><h2>Equipe</h2><p class="dim">Profissionais e técnicos que atendem os serviços. Cada um tem a própria agenda: dois clientes não marcam com a mesma pessoa no mesmo horário.</p></header><div class="set-body"><ul class="sch-staff">${[...k.staff, { id: '', name: '' }].map((p, i) => `<li><input name="staffName" data-id="${h(p.id)}" maxlength="60" value="${h(p.name)}" placeholder="Nome do profissional" aria-label="Profissional ${i + 1}">${p.id ? `<button type="button" class="icon-btn" data-sch="staff-remove" aria-label="Remover ${h(p.name)}">${icon('trash', 15)}</button>` : ''}</li>`).join('')}</ul></div></section>
    <footer class="set-foot"><p class="form-status" role="alert"></p><button class="primary">Salvar</button></footer></form>`;
}

export function schedulingScreen(c, tabs) {
  const tab = c.tab;
  const body = tab === 'services' ? servicesView(c) : tab === 'resources' ? resourcesView(c) : tab === 'field' ? fieldView(c) : bookingSettings(c);
  const desc = { services: 'Serviços que podem ser agendados, com duração, preço, equipe e recursos.', resources: 'Salas, equipamentos, veículos e itens de locação, com a quantidade disponível.', field: 'A rota do dia dos técnicos, com endereço e situação de cada visita.', booking: 'A página pública onde os clientes agendam, o horário de funcionamento e a equipe.' }[tab];
  return pageShell({ title: 'Calendários', desc, tabs, content: body });
}

export function installScheduling({ c, mutate, flash, dialog, close, render }) {
  const here = () => c.view === 'calendars' && schedulingTabs.some(([k]) => k === c.tab);
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-sch]');
    if (!el || !here()) return;
    const act = el.dataset.sch, id = el.dataset.id;
    try {
      if (act === 'service-new') dialog('Novo serviço', serviceForm(c));
      if (act === 'service-edit') dialog('Editar serviço', serviceForm(c, c.s.services.find(x => x.id === id)));
      if (act === 'resource-new') dialog('Novo recurso', resourceForm());
      if (act === 'resource-edit') dialog('Editar recurso', resourceForm(c.s.resources.find(x => x.id === id)));
      if (act === 'service-delete' || act === 'resource-delete') {
        if (!await (act === 'service-delete' ? ask('Excluir este serviço?', { text: 'Os agendamentos já feitos continuam na agenda.', ok: 'Excluir' }) : ask('Excluir este recurso?', { text: 'Ele sai dos serviços que o usam.', ok: 'Excluir' }))) return;
        await mutate({ type: 'delete', key: act === 'service-delete' ? 'services' : 'resources', id }); close(); render(); flash('Excluído.');
      }
      if (act === 'field') { await mutate({ type: 'field-status', data: { id, status: el.dataset.status } }); render(); flash('Situação atualizada.'); }
      if (act === 'copy') await navigator.clipboard.writeText(bookingUrl(c)).then(() => flash('Link copiado.'), () => flash(bookingUrl(c)));
      if (act === 'staff-remove') el.closest('li').remove();
    } catch (error) { flash(error.message, true); }
  });
  document.addEventListener('change', event => {
    const el = event.target.closest('[data-sch-filter]');
    if (!el || !here()) return;
    ui[el.dataset.schFilter] = el.value;
    render();
  });
  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-sch-form]');
    if (!form || !here()) return;
    event.preventDefault();
    const f = new FormData(form), status = form.querySelector('.form-status');
    try {
      if (form.dataset.schForm === 'service') {
        await mutate({ type: 'save', key: 'services', id: form.dataset.id || undefined, data: { ...Object.fromEntries([...f].filter(([key]) => !key.startsWith('after.'))), after: readDestination(key => f.get(`after.${key}`)), staffIds: f.getAll('staffIds'), resourceIds: f.getAll('resourceIds'), active: f.has('active') } });
        close(); render(); flash('Serviço salvo.');
      }
      if (form.dataset.schForm === 'resource') { await mutate({ type: 'save', key: 'resources', id: form.dataset.id || undefined, data: { ...Object.fromEntries(f), active: f.has('active') } }); close(); render(); flash('Recurso salvo.'); }
      if (form.dataset.schForm === 'settings') {
        const hours = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(w => [w, f.has(`open${w}`) ? [f.get(`from${w}`), f.get(`to${w}`)] : []]));
        const staff = [...form.querySelectorAll('[name="staffName"]')].map(el => ({ id: el.dataset.id, name: el.value.trim() })).filter(p => p.name);
        await mutate({ type: 'scheduling-settings', data: { enabled: f.has('enabled'), title: f.get('title'), intro: f.get('intro'), step: Number(f.get('step')), leadMinutes: Number(f.get('leadMinutes')), horizonDays: Number(f.get('horizonDays')), hours, staff, origin: location.origin } });
        render(); flash('Agenda salva.');
      }
    } catch (error) { if (status) status.textContent = error.message; else flash(error.message, true); }
  });
}
