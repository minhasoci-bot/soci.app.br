// Assinaturas → Certificados: templates for certificates and badges, issuing by hand to contacts, and the
// issued lists (with the public page, revoke and restore). Courses and workflows issue from the same templates.
import { icon } from './icons.js';
import { h, fmt, pageShell } from './screens.js';
import { portalTabs } from './client-portal.js';
import { badgeStarter, certificateCategories, certificateStarters, certificateStyles, credentialKinds } from './certificate-data.js';
import { ask } from './ask.js';

const ui = { view: 'templates', query: '' };
const views = [['templates', 'Modelos'], ['certificate', 'Certificados emitidos'], ['badge', 'Badges emitidos']];
const label = (list, key) => list.find(([value]) => value === key)?.[1] || key;
const sourceLabel = { course: 'Curso', workflow: 'Automação', manual: 'Manual' };
const link = (c, row) => `/certificado/${encodeURIComponent(c.workspace)}/${encodeURIComponent(row.code)}`;

function miniature(t) {
  return `<div class="cf-mini ${h(t.style)}" style="--c:${h(t.color)}">${t.kind === 'badge' ? '<span class="cf-mini-seal">★</span>' : ''}<small>${h(t.lead || '')}</small><b>${h(t.title)}</b><i>Nome do aluno</i><small>${h(t.verb || '')} …</small></div>`;
}

function templatesView(c) {
  const rows = (c.s.certificateTemplates || []).filter(t => !ui.query || `${t.name} ${t.title}`.toLowerCase().includes(ui.query.toLowerCase()));
  const used = id => (c.s.credentialsIssued || []).filter(row => row.templateId === id && !row.revokedAt).length;
  return rows.length ? `<div class="co-grid">${rows.map(t => `<article class="co-card cf-card">${miniature(t)}
    <div class="co-card-body"><div class="co-card-top"><span class="badge ${t.kind === 'badge' ? 'gold' : 'blue'}">${label(credentialKinds, t.kind)}</span><span class="badge">${label(certificateCategories, t.category)}</span></div>
      <h3>${h(t.name)}</h3><small>${used(t.id)} ${used(t.id) === 1 ? 'emitido' : 'emitidos'}</small>
      <div class="co-card-actions"><button type="button" class="primary" data-ce="issue" data-id="${h(t.id)}">${icon('send', 15)} Emitir</button>
        <button type="button" class="secondary" data-ce="edit" data-id="${h(t.id)}">${icon('edit', 15)} Editar</button>
        <button type="button" class="icon-btn" data-ce="delete" data-id="${h(t.id)}" aria-label="Excluir modelo" title="Excluir">${icon('trash', 15)}</button></div></div></article>`).join('')}</div>`
    : `<div class="co-empty">${icon('award', 28)}<strong>Nenhum modelo ainda</strong><p>Crie um modelo de certificado (conclusão, marco, evento ou treinamento) ou de badge. Cursos e automações emitem a partir deles.</p>
      <button type="button" class="primary" data-ce="new">${icon('plus', 16)} Criar modelo</button></div>`;
}

function issuedView(c, kind) {
  const q = ui.query.toLowerCase();
  const rows = (c.s.credentialsIssued || []).filter(row => row.kind === kind && (!q || `${row.name} ${row.email} ${row.title} ${row.courseName} ${row.code}`.toLowerCase().includes(q)))
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)).slice(0, 300);
  return rows.length ? `<div class="surface table-shell"><table><thead><tr><th scope="col">Pessoa</th><th scope="col">${kind === 'badge' ? 'Badge' : 'Certificado'}</th><th scope="col">Sobre</th><th scope="col">Origem</th><th scope="col">Emitido em</th><th scope="col">Código</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead><tbody>
    ${rows.map(row => `<tr class="${row.revokedAt ? 'cf-revoked' : ''}"><td><b>${h(row.name || row.email)}</b><br><small>${h(row.email)}</small></td><td>${h(row.title)}</td><td>${h(row.courseName)}</td>
      <td>${h(sourceLabel[row.source] || 'Curso')}</td><td>${h(fmt(row.issuedAt, c.s.profile.timezone, true))}</td>
      <td><a class="text-link" href="${h(link(c, row))}" target="_blank" rel="noopener">${h(row.code)}</a>${row.revokedAt ? ' <span class="badge red">Revogado</span>' : ''}</td>
      <td class="right">${row.revokedAt ? `<button type="button" class="secondary" data-ce="restore" data-id="${h(row.id)}">Restaurar</button>` : `<button type="button" class="danger plain" data-ce="revoke" data-id="${h(row.id)}">Revogar</button>`}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="co-empty">${icon('award', 26)}<strong>Nenhum ${kind === 'badge' ? 'badge' : 'certificado'} emitido</strong><p>Os emitidos por cursos, automações ou à mão aparecem aqui.</p></div>`;
}

export function certificatesScreen(c) {
  const body = ui.view === 'templates' ? templatesView(c) : issuedView(c, ui.view);
  return pageShell({ title: 'Assinaturas', desc: 'Gerencie o portal do cliente, permissões de acesso, cursos e comunidades deste workspace.', className: 'cp-admin',
    tabs: { key: 'memberships', items: portalTabs(), current: 'certificates', label: 'Seções de assinaturas' },
    content: `<div class="cp-section-title"><div><h2>Certificados</h2><p>Modelos de certificado e badge, emitidos por cursos, por automações ou à mão, cada um com página pública e código de verificação.</p></div>
      <button type="button" class="primary" data-ce="new">${icon('plus', 16)} Criar modelo</button></div>
      <nav class="tk-views" aria-label="Certificados">${views.map(([key, text]) => `<button type="button" class="${ui.view === key ? 'active' : ''}" aria-pressed="${ui.view === key}" data-ce="view" data-id="${key}">${text}</button>`).join('')}</nav>
      <div class="toolbar"><label class="search">${icon('search', 16)}<input data-ce-search value="${h(ui.query)}" placeholder="Buscar…" aria-label="Buscar" autocomplete="off"></label></div>${body}` });
}

function templateForm(c, t) {
  const row = t || { kind: 'certificate', category: 'completion', name: '', ...certificateStarters.completion, signer: '', signerRole: '', color: '#b71889', style: 'classico', logoFileId: '' };
  const images = c.s.files.filter(file => file.data.startsWith('data:image/') && !file.trashedAt);
  const select = (name, list, value) => `<select name="${name}">${list.map(([key, text]) => `<option value="${key}"${key === value ? ' selected' : ''}>${text}</option>`).join('')}</select>`;
  return `<form class="co-form cf-form" data-ce-form="template" data-id="${h(t?.id || '')}">
    <div class="cm-row"><label>Tipo${select('kind', credentialKinds, row.kind)}</label><label>Categoria${select('category', certificateCategories, row.category)}</label></div>
    <label>Nome do modelo (só para você)<input name="name" required maxlength="80" value="${h(row.name)}" placeholder="Ex.: Participação em workshops"></label>
    <label>Título<input name="title" required maxlength="120" value="${h(row.title)}"></label>
    <div class="cm-row"><label>Antes do nome<input name="lead" maxlength="80" value="${h(row.lead)}" placeholder="Certificamos que"></label><label>Depois do nome<input name="verb" maxlength="80" value="${h(row.verb)}" placeholder="concluiu"></label></div>
    <label>Texto extra (opcional)<textarea name="body" rows="2" maxlength="500" placeholder="Ex.: Carga horária de 8 horas">${h(row.body)}</textarea></label>
    <div class="cm-row"><label>Quem assina<input name="signer" maxlength="80" value="${h(row.signer)}"></label><label>Cargo<input name="signerRole" maxlength="80" value="${h(row.signerRole)}"></label></div>
    <div class="cm-row"><label>Estilo${select('style', certificateStyles, row.style)}</label><label>Cor<input type="color" name="color" value="${h(row.color)}"></label>
      <label>Logo<select name="logoFileId"><option value="">Sem logo</option>${images.map(file => `<option value="${h(file.id)}"${file.id === row.logoFileId ? ' selected' : ''}>${h(file.name)}</option>`).join('')}</select></label></div>
    <p class="co-hint">O certificado mostra: título, “antes do nome”, o nome da pessoa, “depois do nome” e o curso, evento ou conquista informado na emissão.</p>
    <p class="form-status" role="alert" data-ce-error></p>
    <div class="co-form-actions"><button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary" type="submit">${t ? 'Salvar modelo' : 'Criar modelo'}</button></div></form>`;
}

function issueForm(c, t) {
  const contacts = c.s.contacts.filter(row => row.email || row.name).slice(0, 400);
  return `<form class="co-form cf-form" data-ce-form="issue" data-id="${h(t.id)}"><p>Modelo: <b>${h(t.name)}</b> · ${h(t.title)}</p>
    <label>Sobre o quê (curso, evento, conquista)<input name="subject" required maxlength="160" placeholder="Ex.: Workshop de Vendas · março de 2026"></label>
    <label class="search">${icon('search', 15)}<input data-ce-filter placeholder="Filtrar contatos" aria-label="Filtrar contatos" autocomplete="off"></label>
    <fieldset class="cp-permissions cf-contacts"><legend>Contatos</legend>${contacts.map(row => `<label class="cp-checkbox" data-ce-name="${h(`${row.name} ${row.email}`.toLowerCase())}"><input type="checkbox" name="contactIds" value="${h(row.id)}"><span>${h(row.name || row.email)}<small>${h(row.email || '')}</small></span></label>`).join('') || '<p class="co-hint">Nenhum contato ainda.</p>'}</fieldset>
    <p class="form-status" role="alert" data-ce-error></p>
    <div class="co-form-actions"><button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary" type="submit">${icon('send', 15)} Emitir</button></div></form>`;
}

export function installCertificates({ c, mutate, flash, dialog, close, render }) {
  const here = () => c.view === 'memberships' && c.tab === 'certificates';
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-ce]');
    if (!el || !here()) return;
    const { ce: act, id } = el.dataset;
    try {
      if (act === 'view') { ui.view = id; render(); }
      if (act === 'new') dialog('Novo modelo', templateForm(c, null));
      if (act === 'edit') dialog('Editar modelo', templateForm(c, c.s.certificateTemplates.find(row => row.id === id)));
      if (act === 'issue') dialog('Emitir', issueForm(c, c.s.certificateTemplates.find(row => row.id === id)));
      if (act === 'delete') {
        if (!await ask('Excluir este modelo?', { text: 'Os já emitidos continuam válidos.', ok: 'Excluir' })) return;
        await mutate({ type: 'delete', key: 'certificateTemplates', id }); render(); flash('Modelo excluído.');
      }
      if (act === 'revoke' || act === 'restore') {
        if (act === 'revoke' && !await ask('Revogar este certificado?', { text: 'A página do certificado passa a dizer que ele não é mais válido.', ok: 'Revogar' })) return;
        await mutate({ type: 'credential-revoke', id, data: { restore: act === 'restore' } }); render(); flash(act === 'revoke' ? 'Revogado.' : 'Restaurado.');
      }
    } catch (error) { flash(error.message, true); }
  });
  document.addEventListener('input', event => {
    if (!here()) return;
    if (event.target.matches('[data-ce-search]')) { ui.query = event.target.value; render(); document.querySelector('[data-ce-search]')?.focus(); }
    if (event.target.matches('[data-ce-filter]')) { const q = event.target.value.toLowerCase(); document.querySelectorAll('[data-ce-name]').forEach(row => { row.hidden = q && !row.dataset.ceName.includes(q); }); }
  });
  document.addEventListener('change', event => {
    const form = event.target.closest('[data-ce-form="template"]');
    if (!form || form.dataset.id || !['category', 'kind'].includes(event.target.name)) return;
    // A new template takes the wording of the chosen category (or the badge starter).
    const starter = form.elements.kind.value === 'badge' ? badgeStarter : certificateStarters[form.elements.category.value];
    for (const key of ['title', 'lead', 'verb']) form.elements[key].value = starter[key];
  });
  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-ce-form]');
    if (!form || !here()) return;
    event.preventDefault();
    const f = new FormData(form), error = form.querySelector('[data-ce-error]'), submit = form.querySelector('button[type="submit"]');
    submit.disabled = true; error.textContent = '';
    try {
      if (form.dataset.ceForm === 'template') {
        await mutate({ type: 'save', key: 'certificateTemplates', id: form.dataset.id || undefined, data: Object.fromEntries(f) });
        close(); ui.view = 'templates'; render(); flash(form.dataset.id ? 'Modelo salvo.' : 'Modelo criado.');
      } else {
        const ids = await mutate({ type: 'credential-issue', data: { templateId: form.dataset.id, subject: f.get('subject'), contactIds: f.getAll('contactIds') } });
        const kind = c.s.certificateTemplates.find(row => row.id === form.dataset.id)?.kind || 'certificate';
        close(); ui.view = kind; render(); flash(`${Array.isArray(ids) ? ids.length : 1} emitido(s).`);
      }
    } catch (failure) { error.textContent = failure.message; submit.disabled = false; }
  });
}
