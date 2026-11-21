import { icon } from './icons.js';
import { h, fmt, pageShell } from './screens.js';
import { qrSvg } from './qr.js';
import { outline } from './courses.js';

const pathOf = workspace => `/api/client-portal/${encodeURIComponent(workspace)}/admin`;
const navigation = [['portal','Portal do cliente'], ['portal-members','Clientes'], ['portal-settings','Configurações'], ['courses','Cursos'], ['communities','Comunidades'], ['offers','Ofertas'], ['certificates','Certificados']];
export const portalTabs = () => navigation.map(([id, label]) => ({ value: id, label, href: `#memberships/${id}` }));
export function portalAdminScreen(c) {
  const tab = c.tab || 'portal';
  return pageShell({
    title: 'Assinaturas',
    desc: 'Gerencie o portal do cliente, permissões de acesso e cursos deste workspace.',
    className: 'cp-admin',
    tabs: { key: 'memberships', items: portalTabs(), current: tab, label: 'Seções de assinaturas' },
    content: '<div data-portal-admin aria-live="polite"><div class="cp-empty">Carregando portal do cliente…</div></div>'
  });
}

const button = (action, label, glyph, id = '', cls = 'secondary', disabled = false) =>
  `<button type="button" class="${cls}" data-portal-action="${action}" data-portal-id="${h(id)}" ${disabled ? 'disabled' : ''}>${icon(glyph,16)} ${label}</button>`;
const portalUrl = portal => new URL(portal.path, portal.mailOrigin || location.origin).href;
const enabledStatus = portal => portal.settings.enabled ? 'Ativo' : 'Desativado';
const memberStatus = member => member.revokedAt ? 'Revogado' : member.joinedAt ? 'Ativo' : member.invitedAt ? 'Convidado' : 'Aguardando acesso';

const phone = (variant, lines) => `<span class="cp-phone cp-phone-${variant}"><span class="cp-phone-bar"></span>
  <span class="cp-phone-media"></span>${lines.map(width => `<span class="cp-phone-line" style="width:${width}%"></span>`).join('')}
  <span class="cp-phone-button"></span></span>`;

function overview(portal) {
  const url = portalUrl(portal), off = !portal.settings.enabled;
  const actions = [
    ['magic','Gerar link mágico','link','Gerar'],
    ['invite','Convidar para o portal','users','Convidar'],
    ['login','Enviar e-mail de acesso','send','Enviar', portal.emailConfigured ? '' : 'Configure um remetente de e-mail para usar.']
  ];
  return `<section class="cp-hero" aria-labelledby="cp-hero-title">
      <div class="cp-hero-copy"><h2 id="cp-hero-title">Sua marca. Seu app.</h2>
        <p>Leve cursos e o acesso dos seus clientes para o celular, com a identidade do seu negócio.</p></div>
      <div class="cp-hero-art" aria-hidden="true">${phone('a',[78,52,64])}${phone('b',[60,84])}${phone('c',[70,46,58])}</div>
      <button type="button" class="cp-hero-cta" data-portal-action="app">Saiba mais</button>
    </section>
    <div class="cp-section-title cp-dashboard-title"><div><h2>Painel</h2><p>Gerencie as atividades do portal do cliente</p></div>
      <a class="secondary" href="${h(url)}" target="_blank" rel="noopener">${icon('external',15)} Abrir portal</a></div>
    <section class="cp-card cp-gateway" aria-labelledby="cp-gateway-title">
      <h3 id="cp-gateway-title">Um acesso protegido para interagir com seus clientes</h3>
      <div class="cp-gateway-grid">
        <div class="cp-explainer">
          <h4>O que é o portal do cliente?</h4>
          <p>Seus clientes entram quando quiserem para acessar os cursos que você liberou para cada um.</p>
          <h4>Endereço do portal <span class="cp-state ${off ? '' : 'active'}">${enabledStatus(portal)}</span></h4>
          <div class="cp-url"><a href="${h(url)}" target="_blank" rel="noopener">${h(url)}</a>
            <button type="button" class="icon-btn" data-portal-action="copy-address" aria-label="Copiar endereço do portal" title="Copiar">${icon('copy',16)}</button></div>
        </div>
        <div class="cp-stats">
          <a class="cp-stat" href="#memberships/portal-members"><span>Convidados</span><strong>${portal.stats.invited}</strong></a>
          <a class="cp-stat" href="#memberships/portal-members"><span>Usuários</span><strong>${portal.stats.users}</strong></a>
        </div>
      </div>
    </section>
    <div class="cp-bottom">
      <section class="cp-card cp-actions" aria-labelledby="cp-actions-title"><h3 id="cp-actions-title">Ações</h3>
        <ul>${actions.map(([action, title, glyph, label, note = '']) => `<li class="cp-action-row">
          <span class="cp-action-icon">${icon(glyph,17)}</span><span><strong>${title}</strong>${note ? `<small>${note}</small>` : ''}</span>
          <button type="button" class="cp-tint" data-portal-action="${action}" aria-label="${title}" ${off || note ? 'disabled' : ''}>${label}</button></li>`).join('')}</ul>
      </section>
      <section class="cp-card cp-app" id="cp-app" tabindex="-1" aria-labelledby="cp-app-title">
        <h3 id="cp-app-title"><span class="cp-app-mark">${icon('mobile',18)}</span>App do portal do cliente</h3>
        <div class="cp-app-body"><div class="cp-qr">${qrSvg(url,{ size:148, margin:2, label:'QR Code do endereço do portal' })}</div>
          <div><strong>Abra no celular</strong><p>Aponte a câmera para o código. No navegador do celular, toque em “Adicionar à tela inicial” para usar o portal como app.</p></div>
        </div>
      </section>
    </div>`;
}

// Lessons finished across the member's courses, e.g. "2 cursos · 45%".
function learning(c, member) {
  const courses = c.s.courses.filter(course => member.courseIds.includes(course.id));
  if (!courses.length) return '<span class="cp-muted">Nenhum</span>';
  const ids = courses.map(course => new Set(outline(course).flatMap(module => module.lessons.map(lesson => lesson.id))));
  const total = ids.reduce((sum, set) => sum + set.size, 0);
  const done = courses.reduce((sum, course, index) => sum + Object.keys(member.progress?.[course.id] || {}).filter(id => ids[index].has(id)).length, 0);
  const percent = total ? Math.round(done / total * 100) : 0;
  return `<span class="cp-learning" title="${done} de ${total} aulas concluídas">${courses.length} ${courses.length === 1 ? 'curso' : 'cursos'} · ${percent}%
    <span class="cp-mini-bar"><span style="width:${percent}%"></span></span></span>`;
}

function members(portal, c, query) {
  const results = portal.members.filter(row => `${row.name} ${row.email}`.toLowerCase().includes(query.trim().toLowerCase()));
  return `<div class="cp-section-title"><div><h2>Clientes</h2><p>Gerencie permissões e acompanhe quem já entrou no portal.</p></div>
      ${button('invite','Convidar cliente','plus','','primary',!portal.settings.enabled)}</div>
    <div class="cp-card cp-members"><div class="cp-members-toolbar">
      <input type="search" data-portal-search aria-label="Buscar clientes" placeholder="Buscar nome ou e-mail…" value="${h(query)}">
    </div>
    ${results.length ? `<div class="cp-table-scroll"><table><thead><tr><th scope="col">Cliente</th><th scope="col">Acesso</th><th scope="col">Cursos e progresso</th><th scope="col">Primeiro acesso</th><th scope="col"><span class="sr-only">Gerenciar</span></th></tr></thead>
      <tbody>${results.map(member => `<tr><td><strong>${h(member.name || member.email)}</strong>${member.name ? `<small>${h(member.email)}</small>` : ''}</td>
      <td><span class="cp-state ${memberStatus(member) === 'Ativo' ? 'active' : ''}">${memberStatus(member)}</span></td>
      <td>${learning(c, member)}</td>
      <td>${h(fmt(member.joinedAt,c.s.profile.timezone))}</td>
      <td>${button('manage','Gerenciar','gear',member.id)}</td></tr>`).join('')}</tbody></table></div>` :
      `<div class="cp-empty">${icon('users',22)}${query ? 'Nenhum cliente encontrado.' : 'Convide o primeiro cliente para começar.'}</div>`}</div>`;
}

function settings(portal) {
  const { settings } = portal;
  return `<div class="cp-section-title"><div><h2>Configurações do portal</h2><p>Personalize a página que seus clientes veem ao entrar.</p></div></div>
    <form class="cp-card cp-form" data-portal-form="settings">
      <label>Nome do portal<input name="title" maxlength="100" value="${h(settings.title)}" placeholder="${h(portal.title)}"></label>
      <label>Mensagem de boas-vindas<textarea name="introduction" maxlength="400" rows="3">${h(settings.introduction)}</textarea></label>
      <label class="cp-color">Cor de destaque<input type="color" name="color" value="${h(settings.color)}"></label>
      <label class="cp-checkbox"><input name="enabled" type="checkbox" ${settings.enabled ? 'checked' : ''}>
        <span><strong>Portal ativo</strong><small>Desativar encerra as sessões e invalida os links emitidos.</small></span></label>
      <p role="alert" data-portal-error hidden></p><div><button class="primary" type="submit">Salvar configurações</button></div>
    </form>`;
}

export function installClientPortal({ c, api, flash, dialog, close }) {
  let root, current, workspace, query = '';
  const paint = () => {
    if (!root?.isConnected || !current || c.workspace !== workspace) return;
    const markup = c.tab === 'portal-members' ? members(current,c,query) : c.tab === 'portal-settings' ? settings(current) : overview(current);
    root.innerHTML = markup;
  };
  const request = async input => {
    const opening = c.workspace;
    const result = await api(pathOf(opening), input);
    if (opening === workspace && opening === c.workspace) {
      const { accessPath, expires, sent, email, ...dashboard } = result;
      current = dashboard;
      paint();
    }
    return result;
  };
  const copy = async value => {
    try { await navigator.clipboard.writeText(value); flash('Link copiado.'); }
    catch {
      const field = document.querySelector('[data-portal-link]');
      if (field) { field.focus(); field.select(); flash('Selecione Copiar no navegador.'); }
      else showLink(value);
    }
  };
  const showLink = (value, expires, title) => dialog(title || (expires ? 'Link de acesso pronto' : 'Endereço do portal'), `<div class="cp-link-dialog">
    ${expires ? `<p>Compartilhe com o destinatário. O link pode ser usado uma vez e vale até ${h(fmt(new Date(expires),c.s.profile.timezone,true))}.</p>` : ''}
    ${!expires && title ? '<p>Use este link em menus e botões. Ele abre o app escolhido no portal; quem ainda não entrou vê a tela de acesso.</p>' : ''}
    <label>Link<input data-portal-link readonly value="${h(value)}"></label>
    ${button('copy-link','Copiar link','copy','','primary')}</div>`);
  // Header icon tile above the title, as in the reference dialogs.
  const modal = (title, action, fields, label, { id = '', glyph = '', description = '' } = {}) => {
    dialog(title, `<form data-portal-form="${action}" data-portal-id="${h(id)}" class="cp-modal" novalidate>
      ${fields}<p role="alert" data-portal-error hidden></p>
      <div class="cp-form-actions"><button class="secondary" type="button" data-close-dialog>Cancelar</button>
      <button class="primary" type="submit">${label}</button></div></form>`, { description });
    const header = document.querySelector('#dialog header > div'), form = document.querySelector('#dialog [data-portal-form]');
    if (glyph && header) header.insertAdjacentHTML('afterbegin', `<span class="cp-modal-icon">${icon(glyph,18)}</span>`);
    if (form) ready(form);
  };
  const ready = form => {
    const submit = form.querySelector('button[type="submit"]');
    if (submit && !form.dataset.pending) submit.disabled = !form.checkValidity();
  };
  const contactOptions = action => {
    const mapped = new Set(current.members.map(member => member.contactId));
    const contacts = c.s.contacts.filter(contact => contact.email && (action !== 'login' || !mapped.has(contact.id))).map(contact =>
      `<option value="contact:${h(contact.id)}">${h(contact.name)} · ${h(contact.email)}</option>`);
    const clients = action === 'login' ? current.members.filter(member => !member.revokedAt).map(member =>
      `<option value="member:${h(member.id)}">${h(member.name || member.email)}${member.name ? ` · ${h(member.email)}` : ''}</option>`) : [];
    return [...clients,...contacts].join('');
  };
  const picker = (action, label = 'Contato') => `<label>${label}<select name="recipient" required aria-label="${label}">
      <option value="">Buscar por nome ou e-mail</option>${contactOptions(action)}</select></label>`;
  const emailToggle = (name, text, checked) => current.emailConfigured
    ? `<label class="cp-checkbox"><input name="${name}" type="checkbox" ${checked ? 'checked' : ''}> ${text}</label>`
    : `<label class="cp-checkbox cp-unavailable"><input type="checkbox" disabled> <span>${text}<small>Configure um remetente de e-mail para enviar.</small></span></label>`;
  const magicFields = () => `<fieldset class="cp-choice"><legend>Selecione o tipo de link mágico</legend>
      <label><input type="radio" name="kind" value="contact" checked><span>Contato</span></label>
      <label><input type="radio" name="kind" value="menu"><span>Menu personalizado</span></label></fieldset>
    <fieldset class="cp-kind" data-kind="contact">${picker('magic')}${emailToggle('sendEmail','Enviar e-mail',false)}</fieldset>
    <fieldset class="cp-kind" data-kind="menu" disabled hidden>
      <label>Selecionar app<select name="app" required aria-label="Selecionar app">
        <option value="courses">Cursos</option><option value="home">Início do portal</option></select></label></fieldset>`;
  const inviteFields = () => `<label>Escolha um contato ou informe um e-mail
      <input name="email" type="email" maxlength="254" required list="cp-invite-contacts" autocomplete="off" placeholder="Digite nome ou e-mail"></label>
    <datalist id="cp-invite-contacts">${c.s.contacts.filter(contact => contact.email).map(contact =>
      `<option value="${h(contact.email)}" label="${h(contact.name)}"></option>`).join('')}</datalist>
    ${emailToggle('sendEmail','Enviar convite por e-mail',true)}`;

  document.addEventListener('input', event => {
    if (!event.target.matches('[data-portal-search]')) return;
    query = event.target.value;
    const start = event.target.selectionStart, end = event.target.selectionEnd;
    paint();
    const field = root?.querySelector('[data-portal-search]');
    field?.focus();
    if (start !== null) field?.setSelectionRange(start,end);
  });
  document.addEventListener('click', event => {
    const control = event.target.closest('[data-portal-action]');
    if (!control || !current || c.view !== 'memberships' || c.workspace !== workspace) return;
    const { portalAction: action, portalId: id } = control.dataset;
    if (action === 'copy-address') void copy(portalUrl(current));
    if (action === 'copy-link') void copy(document.querySelector('[data-portal-link]').value);
    if (action === 'app') { const card = root.querySelector('#cp-app'); card?.scrollIntoView({ behavior:'smooth', block:'center' }); card?.focus({ preventScroll:true }); }
    if (action === 'magic') modal('Gerar links mágicos para seus apps',action,magicFields(),'Gerar',
      { glyph:'link', description:'O link de contato pode ser usado uma vez e expira em 15 minutos.' });
    if (action === 'invite') modal('Selecione um contato ou informe um e-mail para convidar ao portal do cliente',action,inviteFields(),
      current.emailConfigured ? 'Enviar convite' : 'Criar convite', { glyph:'users' });
    if (action === 'login') modal('Selecione o contato para enviar o e-mail de acesso',action,picker(action),'Enviar e-mail',
      { glyph:'send', description:'Escolha um contato para receber o link mágico por e-mail.' });
    if (action === 'manage') {
      const member = current.members.find(row => row.id === id);
      const courses = c.s.courses.map(course => `<label class="cp-checkbox"><input type="checkbox" name="courseIds" value="${h(course.id)}"
        ${member.courseIds.includes(course.id) ? 'checked' : ''}><span>${h(course.name)}${course.active ? '' : ' · Rascunho'}</span></label>`).join('');
      modal(member.name || member.email,'permissions',`<fieldset class="cp-permissions"><legend>Cursos com acesso</legend>
        ${courses || '<p>Cadastre um curso na aba Cursos.</p>'}</fieldset>` +
        (member.revokedAt ? button('reactivate','Reativar acesso','refresh',id) : button('revoke','Revogar acesso','lock',id)), 'Salvar permissões',{ id });
    }
    if (action === 'revoke' || action === 'reactivate') {
      close();
      modal(action === 'revoke' ? 'Revogar acesso' : 'Reativar acesso',action,
        action === 'revoke' ? '<p>Os links e sessões deste cliente serão invalidados.</p>' : '<p>Gere um novo link para o cliente voltar a entrar.</p>',
        action === 'revoke' ? 'Revogar acesso' : 'Reativar acesso', { id });
    }
  });
  const refresh = event => {
    const form = event.target.closest?.('[data-portal-form]');
    if (!form) return;
    if (event.target.name === 'kind') form.querySelectorAll('.cp-kind').forEach(panel => {
      panel.hidden = panel.disabled = panel.dataset.kind !== event.target.value;
    });
    ready(form);
  };
  document.addEventListener('change', refresh);
  document.addEventListener('input', refresh);
  document.addEventListener('submit', async event => {
    const form = event.target, action = form.dataset.portalForm;
    if (!action) return;
    event.preventDefault();
    if (form.dataset.pending) return;
    const fields = new FormData(form);
    if (action === 'magic' && fields.get('kind') === 'menu') {
      close();
      showLink(portalUrl(current) + (fields.get('app') === 'courses' ? '#cursos' : ''), 0, 'Link para menu personalizado');
      return;
    }
    const { kind, app, ...values } = Object.fromEntries(fields);
    const input = { ...values, action, id: form.dataset.portalId };
    if (action === 'settings') input.enabled = fields.has('enabled');
    if (action === 'invite' || action === 'magic') input.sendEmail = fields.has('sendEmail');
    if (action === 'invite') {
      const email = String(input.email).trim().toLowerCase();
      const contact = c.s.contacts.find(row => row.email?.trim().toLowerCase() === email);
      if (contact) input.contactId = contact.id;
    }
    if (action === 'permissions') input.courseIds = fields.getAll('courseIds');
    if (input.recipient) {
      const [kind, id] = input.recipient.split(':');
      input[kind === 'member' ? 'memberId' : 'contactId'] = id;
    }
    const submit = form.querySelector('button[type="submit"]'), status = form.querySelector('[data-portal-error]');
    const opening = c.workspace;
    status.hidden = true;
    submit.disabled = true;
    form.dataset.pending = 'yes';
    try {
      const { accessPath, expires, sent, mailOrigin } = await request(input);
      if (c.workspace !== opening || !form.isConnected && action !== 'settings') return;
      if (action !== 'settings') close();
      if (accessPath) showLink(new URL(accessPath,mailOrigin || location.origin).href,expires);
      else flash(sent ? 'E-mail enviado.' : 'Alterações salvas.');
    } catch (error) {
      status.textContent = error.message;
      status.hidden = false;
    } finally {
      submit.disabled = false;
      delete form.dataset.pending;
    }
  });

  return () => {
    const next = document.querySelector('[data-portal-admin]');
    if (!next || root === next) return;
    root = next;
    if (workspace !== c.workspace) { workspace = c.workspace; current = null; query = ''; }
    paint();
    void request().catch(error => {
      if (next.isConnected) next.innerHTML = `<div class="cp-empty" role="alert">${h(error.message)}</div>`;
    });
  };
}
