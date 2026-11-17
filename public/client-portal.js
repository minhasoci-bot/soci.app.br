import { icon } from './icons.js';
import { h, fmt } from './screens.js';

const pathOf = workspace => `/api/client-portal/${encodeURIComponent(workspace)}/admin`;
const navigation = [['portal','Portal do cliente'], ['portal-members','Clientes'], ['portal-settings','Configurações'], ['courses','Cursos']];
export const portalNav = tab => `<nav class="cp-tabs" aria-label="Assinaturas">${navigation.map(([id, label]) =>
  `<a href="#memberships/${id}" ${tab === id ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
export function portalAdminScreen(c) {
  const tab = c.tab || 'portal';
  return `<section class="cp-admin">
    <h1>Assinaturas</h1>${portalNav(tab)}
    <div data-portal-admin aria-live="polite"><div class="cp-empty">Carregando portal do cliente…</div></div>
  </section>`;
}

const button = (action, label, glyph, id = '', cls = 'secondary', disabled = false) =>
  `<button type="button" class="${cls}" data-portal-action="${action}" data-portal-id="${h(id)}" ${disabled ? 'disabled' : ''}>${icon(glyph,16)} ${label}</button>`;
const portalUrl = portal => new URL(portal.path, portal.mailOrigin || location.origin).href;
const enabledStatus = portal => portal.settings.enabled ? 'Ativo' : 'Desativado';
const memberStatus = member => member.revokedAt ? 'Revogado' : member.joinedAt ? 'Ativo' : member.invitedAt ? 'Convidado' : 'Aguardando acesso';

function overview(portal) {
  const actions = [
    ['magic','Gerar link mágico','Crie um link de uso único para um contato. Validade de 15 minutos.','key','Gerar link'],
    ['invite','Convidar para o portal','Convide um contato da Soci ou informe outro e-mail.','users','Convidar'],
    ['login','Enviar e-mail de acesso',portal.emailConfigured ? 'Envie um novo link de acesso por e-mail.' : 'O envio automático de e-mail está indisponível até configurar um remetente.','mail','Enviar e-mail']
  ];
  return `<div class="cp-section-title"><div><h2>Painel do portal</h2><p>Gerencie o acesso dos clientes aos seus cursos.</p></div>
    <a class="secondary" href="${h(portalUrl(portal))}" target="_blank" rel="noopener">${icon('external',15)} Abrir portal</a></div>
    <div class="cp-overview"><div class="cp-card cp-address">
      <div class="cp-address-icon">${icon('lock',23)}</div>
      <div><span class="cp-state ${portal.settings.enabled ? 'active' : ''}">${enabledStatus(portal)}</span>
        <h3>${h(portal.title)}</h3><p>Endereço do portal</p></div>
      <div class="cp-address-link"><a href="${h(portalUrl(portal))}" target="_blank" rel="noopener">${h(portalUrl(portal))}</a>
        ${button('copy-address','Copiar','link')}</div>
    </div><div class="cp-counters">
      <a class="cp-card" href="#memberships/portal-members">${icon('mail',17)}<span>Convidados</span><strong>${portal.stats.invited}</strong></a>
      <a class="cp-card" href="#memberships/portal-members">${icon('users',17)}<span>Usuários ativos</span><strong>${portal.stats.users}</strong></a>
    </div></div>
    <section class="cp-card cp-action-panel"><h3>Ações</h3>
      ${actions.map(([action, title, description, glyph, label]) =>
        `<div class="cp-action-row"><span class="cp-action-icon">${icon(glyph,19)}</span><div><strong>${title}</strong><p>${description}</p></div>
        ${button(action,label,glyph,'','secondary',!portal.settings.enabled || (action === 'login' && !portal.emailConfigured))}</div>`).join('')}</section>`;
}

function members(portal, c, query) {
  const results = portal.members.filter(row => `${row.name} ${row.email}`.toLowerCase().includes(query.trim().toLowerCase()));
  return `<div class="cp-section-title"><div><h2>Clientes</h2><p>Gerencie permissões e acompanhe quem já entrou no portal.</p></div>
      ${button('invite','Convidar cliente','plus','','primary',!portal.settings.enabled)}</div>
    <div class="cp-card cp-members"><div class="cp-members-toolbar">
      <input type="search" data-portal-search aria-label="Buscar clientes" placeholder="Buscar nome ou e-mail…" value="${h(query)}">
    </div>
    ${results.length ? `<div class="cp-table-scroll"><table><thead><tr><th scope="col">Cliente</th><th scope="col">Acesso</th><th scope="col">Cursos</th><th scope="col">Primeiro acesso</th><th scope="col"><span class="sr-only">Gerenciar</span></th></tr></thead>
      <tbody>${results.map(member => `<tr><td><strong>${h(member.name || member.email)}</strong>${member.name ? `<small>${h(member.email)}</small>` : ''}</td>
      <td><span class="cp-state ${memberStatus(member) === 'Ativo' ? 'active' : ''}">${memberStatus(member)}</span></td>
      <td>${c.s.courses.filter(course => member.courseIds.includes(course.id)).length}</td>
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
  const showLink = (value, expires) => dialog(expires ? 'Link de acesso pronto' : 'Endereço do portal', `<div class="cp-link-dialog">
    ${expires ? `<p>Compartilhe com o destinatário. O link pode ser usado uma vez e vale até ${h(fmt(new Date(expires),c.s.profile.timezone,true))}.</p>` : ''}
    <label>Link<input data-portal-link readonly value="${h(value)}"></label>
    ${button('copy-link','Copiar link','link','','primary')}</div>`);
  const modal = (title, action, fields, label, id = '') => dialog(title, `
    <form data-portal-form="${action}" data-portal-id="${h(id)}" class="cp-modal">
      ${fields}<p role="alert" data-portal-error hidden></p>
      <div class="cp-form-actions"><button class="secondary" type="button" data-close-dialog>Cancelar</button>
      <button class="primary" type="submit">${label}</button></div></form>`);
  const picker = action => {
    const mapped = new Set(current.members.map(member => member.contactId));
    const contacts = c.s.contacts.filter(contact => contact.email && (action !== 'login' || !mapped.has(contact.id))).map(contact =>
      `<option value="contact:${h(contact.id)}">${h(contact.name)} · ${h(contact.email)}</option>`);
    const clients = action === 'login' ? current.members.filter(member => !member.revokedAt).map(member =>
      `<option value="member:${h(member.id)}">${h(member.name || member.email)}${member.name ? ` · ${h(member.email)}` : ''}</option>`) : [];
    return `<label>${action === 'login' ? 'Destinatário' : 'Contato'}<select name="recipient" ${action === 'invite' ? '' : 'required'}>
      <option value="">Selecione um contato</option>${[...clients,...contacts].join('')}</select></label>`;
  };

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
    if (action === 'magic') modal('Gerar link mágico',action,picker(action) + '<p>O link expira em 15 minutos.</p>','Gerar link');
    if (action === 'invite') modal('Convidar para o portal',action,picker(action) +
      '<label>Ou informe um e-mail<input name="email" type="email" maxlength="254"></label>' +
      (current.emailConfigured ? '<label class="cp-checkbox"><input name="sendEmail" type="checkbox" checked> Enviar convite por e-mail</label>' :
        '<p>Gere um link de convite para compartilhar diretamente com o cliente.</p>'), 'Criar convite');
    if (action === 'login') modal('Enviar e-mail de acesso',action,picker(action),'Enviar e-mail');
    if (action === 'manage') {
      const member = current.members.find(row => row.id === id);
      const courses = c.s.courses.map(course => `<label class="cp-checkbox"><input type="checkbox" name="courseIds" value="${h(course.id)}"
        ${member.courseIds.includes(course.id) ? 'checked' : ''}><span>${h(course.name)}${course.active ? '' : ' · Rascunho'}</span></label>`).join('');
      modal(member.name || member.email,'permissions',`<fieldset class="cp-permissions"><legend>Cursos com acesso</legend>
        ${courses || '<p>Cadastre um curso na aba Cursos.</p>'}</fieldset>` +
        (member.revokedAt ? button('reactivate','Reativar acesso','refresh',id) : button('revoke','Revogar acesso','lock',id)), 'Salvar permissões',id);
    }
    if (action === 'revoke' || action === 'reactivate') {
      close();
      modal(action === 'revoke' ? 'Revogar acesso' : 'Reativar acesso',action,
        action === 'revoke' ? '<p>Os links e sessões deste cliente serão invalidados.</p>' : '<p>Gere um novo link para o cliente voltar a entrar.</p>',
        action === 'revoke' ? 'Revogar acesso' : 'Reativar acesso', id);
    }
  });
  document.addEventListener('submit', async event => {
    const form = event.target, action = form.dataset.portalForm;
    if (!action) return;
    event.preventDefault();
    if (form.dataset.pending) return;
    const fields = new FormData(form);
    const input = { ...Object.fromEntries(fields), action, id: form.dataset.portalId };
    if (action === 'settings') input.enabled = fields.has('enabled');
    if (action === 'invite') input.sendEmail = fields.has('sendEmail');
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
