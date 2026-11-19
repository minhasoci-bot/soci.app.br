// Communities admin: the group list, and each group's posts, members and settings.
import { icon } from './icons.js';
import { h, fmt, pageShell } from './screens.js';
import { portalTabs } from './client-portal.js';

const levelThresholds = [0, 5, 20, 65, 155, 515, 2015, 8015, 33015];
const roleLabel = { member: 'Membro', moderator: 'Moderador' };
const statusLabel = { active: 'Ativo', requested: 'Pedido de entrada', banned: 'Banido' };
const detailTabs = [['posts', 'Publicações'], ['members', 'Membros'], ['settings', 'Configurações']];
const ui = { tab: 'posts' };
const groupId = () => location.hash.split('/')[1] === 'community' ? decodeURIComponent(location.hash.split('/')[2] || '') : '';
const shell = (content, cta = '') => pageShell({ title: 'Assinaturas', desc: 'Gerencie o portal do cliente, permissões de acesso, cursos e comunidades deste workspace.',
  className: 'cp-admin', cta, tabs: { key: 'memberships', items: portalTabs(), current: 'communities', label: 'Seções de assinaturas' }, content });
const cover = (c, group) => c.s.files.find(file => file.id === group.coverFileId && file.data.startsWith('data:image/'))?.data || '';
const visibility = group => group.visibility === 'private' ? `<span class="badge">${icon('lock',12)} Privada</span>` : '<span class="badge green">Pública</span>';

export function communitiesScreen(c) {
  const id = groupId();
  if (c.tab === 'community' && id) {
    const group = c.s.communities.find(row => row.id === id);
    if (!group) return shell(`<div class="co-empty">${icon('users',28)}<strong>Comunidade não encontrada</strong><p>Ela pode ter sido excluída.</p>
      <a class="secondary" href="#memberships/communities">${icon('left',15)} Voltar para comunidades</a></div>`);
    return `<div class="page cp-admin cm-admin">
      <a class="text-link co-back" href="#memberships/communities">${icon('left',15)} Comunidades</a>
      <header class="cm-head"><span class="cm-head-cover">${cover(c, group) ? `<img src="${h(cover(c, group))}" alt="">` : icon('users',24)}</span>
        <div><h1>${h(group.name)}</h1><p>${visibility(group)} ${group.active === false ? '<span class="badge">Desativada</span>' : ''} <span>${h(group.description || 'Sem descrição')}</span></p></div></header>
      <nav class="cm-tabs" aria-label="Seções da comunidade">${detailTabs.map(([value, label]) => `<button type="button" data-cm="tab" data-id="${value}" ${ui.tab === value ? 'aria-current="page"' : ''}>${label}</button>`).join('')}</nav>
      <div data-community-root="${h(id)}" aria-live="polite">${ui.tab === 'settings' ? settings(c, group) : '<div class="cm-loading">Carregando…</div>'}</div></div>`;
  }
  return shell(`<div class="cp-section-title"><div><h2>Comunidades</h2><p>Grupos de discussão para os clientes do portal, com canais, publicações, enquetes e ranking de participação.</p></div>
      <button type="button" class="primary" data-cm="create">${icon('plus',16)} Criar comunidade</button></div>
    ${c.s.communities.length ? `<div class="co-grid" data-community-list>${c.s.communities.map(group => `<article class="co-card">
      <a class="co-cover" href="#memberships/community/${encodeURIComponent(group.id)}" aria-label="Abrir ${h(group.name)}">${cover(c, group) ? `<img src="${h(cover(c, group))}" alt="">` : `<span>${icon('users',30)}</span>`}</a>
      <div class="co-card-body"><div class="co-card-top">${visibility(group)}${group.active === false ? '<span class="badge">Desativada</span>' : ''}</div>
        <h3><a href="#memberships/community/${encodeURIComponent(group.id)}">${h(group.name)}</a></h3>
        ${group.description ? `<p>${h(group.description)}</p>` : ''}
        <small data-community-stats="${h(group.id)}">${group.channels.length} ${group.channels.length === 1 ? 'canal' : 'canais'}</small>
        <div class="co-card-actions"><a class="secondary" href="#memberships/community/${encodeURIComponent(group.id)}">${icon('edit',15)} Gerenciar</a></div></div></article>`).join('')}</div>`
      : `<div class="co-empty">${icon('users',28)}<strong>Crie sua primeira comunidade</strong>
        <p>Um espaço para seus clientes trocarem ideias, tirarem dúvidas e acompanharem novidades, dentro do portal do cliente.</p>
        <button type="button" class="primary" data-cm="create">${icon('plus',16)} Criar comunidade</button></div>`}`);
}

function settings(c, group) {
  const images = c.s.files.filter(file => file.data.startsWith('data:image/') && !file.trashedAt);
  return `<form class="cm-settings" data-cm-form="settings" data-id="${h(group.id)}">
    <section class="cm-panel"><h2>Detalhes</h2>
      <label>Nome da comunidade<input name="name" required maxlength="80" value="${h(group.name)}"></label>
      <label>Descrição<textarea name="description" rows="3" maxlength="500">${h(group.description || '')}</textarea></label>
      <label>Capa (imagem da Mídia Drive)<select name="coverFileId"><option value="">Sem capa</option>
        ${images.map(file => `<option value="${h(file.id)}" ${file.id === group.coverFileId ? 'selected' : ''}>${h(file.name)}</option>`).join('')}</select></label>
      <fieldset class="co-kinds"><legend>Tipo de grupo</legend>
        <label><input type="radio" name="visibility" value="public" ${group.visibility !== 'private' ? 'checked' : ''}><span>${icon('users',15)} Pública</span></label>
        <label><input type="radio" name="visibility" value="private" ${group.visibility === 'private' ? 'checked' : ''}><span>${icon('lock',15)} Privada</span></label></fieldset>
      <p class="co-hint">Pública: qualquer cliente do portal vê as publicações e entra com um clique. Privada: só membros aprovados veem o conteúdo; os pedidos de entrada aparecem em Membros.</p>
      <label class="cp-checkbox co-check"><input type="checkbox" name="memberPosts" ${group.memberPosts !== false ? 'checked' : ''}><span>Membros podem publicar<small>Desligado, só a equipe e os moderadores publicam. Membros continuam comentando e curtindo.</small></span></label>
      <label class="cp-checkbox co-check"><input type="checkbox" name="active" ${group.active !== false ? 'checked' : ''}><span>Comunidade ativa<small>Desativada, ela some do portal sem perder as publicações.</small></span></label>
      <label>Mensagem de boas-vindas<textarea name="welcome" rows="3" maxlength="1000" placeholder="Aparece para quem acabou de entrar.">${h(group.welcome || '')}</textarea></label></section>
    <section class="cm-panel"><h2>Canais</h2><p class="co-hint">Organize as conversas por assunto. Publicações de canais excluídos vão para o primeiro canal.</p>
      <ol class="cm-channels" data-cm-channels>${group.channels.map(channel => channelRow(channel)).join('')}</ol>
      <button type="button" class="secondary" data-cm="add-channel">${icon('plus',15)} Adicionar canal</button></section>
    <section class="cm-panel"><h2>Gamificação</h2><p class="co-hint">Membros ganham pontos e sobem de nível ao participar. Use 0 para não pontuar uma ação.</p>
      <div class="cm-points">${[['post','Publicação'],['comment','Comentário em publicação de outra pessoa'],['like','Curtida recebida']].map(([key, label]) =>
        `<label>${label}<span><input type="number" name="points.${key}" min="0" max="100" step="1" value="${Number(group.points?.[key] ?? 0)}"> pts</span></label>`).join('')}</div>
      <h3>Níveis</h3><div class="cm-levels">${levelThresholds.map((min, index) => `<label><span class="cm-level-badge">${index + 1}</span>
        <input name="level.${index}" maxlength="30" value="${h(group.levels?.[index]?.name || `Nível ${index + 1}`)}" aria-label="Nome do nível ${index + 1}"><small>${min} pts</small></label>`).join('')}</div></section>
    <p class="form-status" role="alert" data-cm-error></p>
    <div class="cm-settings-actions"><button type="button" class="danger plain" data-cm="delete" data-id="${h(group.id)}">${icon('trash',15)} Excluir comunidade</button>
      <button type="submit" class="primary">${icon('check',16)} Salvar configurações</button></div></form>`;
}
const channelRow = channel => `<li><input type="hidden" name="channel.id" value="${h(channel.id || '')}"><span>#</span>
  <input name="channel.name" required maxlength="40" value="${h(channel.name)}" aria-label="Nome do canal">
  <button type="button" class="icon-btn" data-cm="remove-channel" aria-label="Remover canal ${h(channel.name)}">${icon('trash',15)}</button></li>`;

function postCard(c, post) {
  return `<article class="cm-post ${post.pinned ? 'pinned' : ''}">
    <header><span class="cm-avatar ${post.author.staff ? 'staff' : ''}">${h(post.author.name.slice(0, 2).toUpperCase())}</span>
      <div><strong>${h(post.author.name)}</strong> ${post.author.staff ? '<span class="badge pink">Equipe</span>' : `<span class="cm-level">Nível ${post.author.level}</span>`}
      <small>em #${h(post.channel)} · ${h(fmt(post.created, c.s.profile.timezone, true))}${post.pinned ? ` · ${icon('pin',12)} Fixada` : ''}</small></div>
      <div class="cm-post-actions"><button type="button" class="icon-btn" data-cm="pin" data-id="${h(post.id)}" aria-label="${post.pinned ? 'Desafixar' : 'Fixar'} publicação" title="${post.pinned ? 'Desafixar' : 'Fixar'}">${icon('pin',16)}</button>
      <button type="button" class="icon-btn" data-cm="delete-post" data-id="${h(post.id)}" aria-label="Excluir publicação" title="Excluir">${icon('trash',16)}</button></div></header>
    <h3>${h(post.title)}</h3><p class="cm-body">${h(post.body)}</p>
    ${post.image ? `<img class="cm-image" src="${h(post.image)}" alt="">` : ''}
    ${post.link ? `<a class="text-link" href="${h(post.link)}" target="_blank" rel="noopener noreferrer">${icon('external',14)} ${h(post.link)}</a>` : ''}
    ${post.poll ? `<ul class="cm-poll">${post.poll.options.map(option => { const share = post.poll.total ? Math.round(option.votes / post.poll.total * 100) : 0;
      return `<li><span style="width:${share}%"></span><b>${h(option.text)}</b><small>${option.votes} · ${share}%</small></li>`; }).join('')}</ul>` : ''}
    <footer>${icon('star',14)} ${post.likes} ${post.likes === 1 ? 'curtida' : 'curtidas'} · ${icon('chat',14)} ${post.comments.length} ${post.comments.length === 1 ? 'comentário' : 'comentários'}</footer>
    ${post.comments.length ? `<ul class="cm-comments">${post.comments.map(comment => `<li><strong>${h(comment.author.name)}</strong> ${h(comment.body)}
      <button type="button" class="icon-btn" data-cm="delete-comment" data-id="${h(post.id)}" data-comment="${h(comment.id)}" aria-label="Excluir comentário" title="Excluir">${icon('trash',14)}</button></li>`).join('')}</ul>` : ''}
    <form class="cm-reply" data-cm-form="comment" data-id="${h(post.id)}"><input name="body" maxlength="2000" required placeholder="Responder como equipe…" aria-label="Responder como equipe"><button class="secondary" type="submit">Responder</button></form>
  </article>`;
}

function postsTab(c, group, data) {
  const images = c.s.files.filter(file => file.data.startsWith('data:image/') && !file.trashedAt);
  return `<div class="cm-columns"><div>
    <details class="cm-panel cm-composer" ${data.posts.length ? '' : 'open'}><summary>${icon('edit',16)} Nova publicação da equipe</summary>
      <form data-cm-form="post" class="co-form">
        <div class="cm-row"><label>Canal<select name="channelId">${group.channels.map(channel => `<option value="${h(channel.id)}">#${h(channel.name)}</option>`).join('')}</select></label>
          <label>Imagem (opcional)<select name="imageFileId"><option value="">Sem imagem</option>${images.map(file => `<option value="${h(file.id)}">${h(file.name)}</option>`).join('')}</select></label></div>
        <label>Título<input name="title" required maxlength="200"></label>
        <label>Texto<textarea name="body" required rows="4" maxlength="10000"></textarea></label>
        <label>Link (opcional)<input name="link" type="url" maxlength="500" placeholder="https://…"></label>
        <label>Enquete (opcional, uma opção por linha, de 2 a 6)<textarea name="poll" rows="2" maxlength="500"></textarea></label>
        <label class="cp-checkbox co-check"><input type="checkbox" name="pinned"><span>Fixar no topo</span></label>
        <p class="form-status" role="alert" data-cm-error></p>
        <div class="co-form-actions"><button class="primary" type="submit">Publicar</button></div></form></details>
    ${data.posts.length ? data.posts.map(post => postCard(c, post)).join('') : `<div class="co-empty">${icon('chat',26)}<strong>Nenhuma publicação ainda</strong><p>Publique as boas-vindas e as regras do grupo.</p></div>`}</div>
    <aside class="cm-panel cm-summary"><h2>Resumo</h2><dl>
      <div><dt>Membros ativos</dt><dd>${data.group.memberCount}</dd></div>
      <div><dt>Pedidos de entrada</dt><dd>${data.members.filter(row => row.status === 'requested').length}</dd></div>
      <div><dt>Publicações</dt><dd>${data.group.postCount}</dd></div></dl>
      <h3>Top participação</h3><ol class="cm-top">${data.members.filter(row => row.points).sort((a, b) => b.points - a.points).slice(0, 5)
        .map(row => `<li><span>${h(row.name)}</span><b>${row.points} pts</b></li>`).join('') || '<li class="co-hint">Sem pontos ainda.</li>'}</ol></aside></div>`;
}

function membersTab(c, data) {
  return `<div class="cm-panel"><div class="cm-panel-head"><h2>Membros</h2>
      <button type="button" class="primary" data-cm="add-members" ${data.candidates.length ? '' : 'disabled'}>${icon('plus',15)} Adicionar clientes do portal</button></div>
    ${data.candidates.length ? '' : '<p class="co-hint">Todos os clientes do portal já estão nesta comunidade. Convide novos clientes na aba Clientes.</p>'}
    ${data.members.length ? `<div class="cp-table-scroll"><table class="cm-table"><thead><tr><th scope="col">Membro</th><th scope="col">Situação</th><th scope="col">Função</th><th scope="col">Nível</th><th scope="col">Entrou em</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
      <tbody>${data.members.map(row => `<tr><td><strong>${h(row.name)}</strong><small>${h(row.email)}</small></td>
        <td><span class="badge ${row.status === 'active' ? 'green' : row.status === 'banned' ? 'red' : 'blue'}">${statusLabel[row.status]}</span></td>
        <td>${roleLabel[row.role]}</td><td>${row.level} · ${row.points} pts</td><td>${h(fmt(row.joinedAt, c.s.profile.timezone))}</td>
        <td class="cm-row-actions">${row.status === 'requested' ? `<button type="button" class="primary" data-cm="member" data-id="${h(row.id)}" data-status="active">Aprovar</button>` : ''}
          ${row.status === 'active' ? `<button type="button" class="secondary" data-cm="member" data-id="${h(row.id)}" data-role="${row.role === 'moderator' ? 'member' : 'moderator'}">${row.role === 'moderator' ? 'Tirar moderação' : 'Tornar moderador'}</button>
            <button type="button" class="danger plain" data-cm="member" data-id="${h(row.id)}" data-status="banned">Banir</button>` : ''}
          ${row.status === 'banned' ? `<button type="button" class="secondary" data-cm="member" data-id="${h(row.id)}" data-status="active">Reativar</button>` : ''}
          <button type="button" class="icon-btn" data-cm="remove-member" data-id="${h(row.id)}" aria-label="Remover ${h(row.name)}" title="Remover">${icon('trash',15)}</button></td></tr>`).join('')}</tbody></table></div>`
      : `<div class="co-empty">${icon('users',26)}<strong>Ninguém entrou ainda</strong><p>Adicione clientes do portal ou compartilhe o portal: em comunidades públicas eles entram com um clique.</p></div>`}</div>`;
}

export function installCommunities({ c, api, mutate, flash, dialog, close, render }) {
  const cache = new Map();
  const endpoint = id => `/api/client-portal/${encodeURIComponent(c.workspace)}/community-admin${id ? `/${encodeURIComponent(id)}` : ''}`;
  const active = () => c.view === 'memberships' && ['communities', 'community'].includes(c.tab);
  const paint = () => {
    const root = document.querySelector('[data-community-root]');
    const id = root?.dataset.communityRoot, data = cache.get(`${c.workspace}:${id}`), group = c.s.communities.find(row => row.id === id);
    if (!root || !group || ui.tab === 'settings') return;
    if (!data) return;
    root.innerHTML = ui.tab === 'members' ? membersTab(c, data) : postsTab(c, group, data);
  };
  const load = async id => {
    const key = `${c.workspace}:${id}`;
    try { cache.set(key, await api(endpoint(id))); paint(); }
    catch (error) { const root = document.querySelector('[data-community-root]'); if (root) root.innerHTML = `<div class="co-empty" role="alert">${h(error.message)}</div>`; }
  };
  const send = async (input, id = groupId()) => { cache.set(`${c.workspace}:${id}`, await api(endpoint(id), input)); paint(); };

  const mount = async () => {
    if (!active()) return;
    const id = groupId();
    if (c.tab === 'community' && id) { paint(); if (ui.tab !== 'settings') void load(id); return; }
    if (!document.querySelector('[data-community-list]')) return;
    try {
      const { groups } = await api(endpoint(''));
      for (const row of groups) {
        const slot = document.querySelector(`[data-community-stats="${CSS.escape(row.id)}"]`);
        if (slot) slot.textContent = `${row.memberCount} ${row.memberCount === 1 ? 'membro' : 'membros'} · ${row.postCount} ${row.postCount === 1 ? 'publicação' : 'publicações'}${row.requested ? ` · ${row.requested} ${row.requested === 1 ? 'pedido' : 'pedidos'} de entrada` : ''}`;
      }
    } catch { /* The cards still show the channels without activity numbers. */ }
  };

  document.addEventListener('click', async event => {
    if (!active()) return;
    const control = event.target.closest('[data-cm]');
    if (!control) return;
    const { cm: action, id } = control.dataset;
    try {
      if (action === 'tab') { ui.tab = id; render(); return; }
      if (action === 'create') dialog('Criar comunidade', `<form class="co-form" data-cm-form="create">
        <label>Nome da comunidade<input name="name" required maxlength="80" autocomplete="off" placeholder="Ex.: Clube de Clientes"></label>
        <label>Descrição (opcional)<textarea name="description" rows="3" maxlength="500"></textarea></label>
        <fieldset class="co-kinds"><legend>Tipo de grupo</legend>
          <label><input type="radio" name="visibility" value="public" checked><span>${icon('users',15)} Pública</span></label>
          <label><input type="radio" name="visibility" value="private"><span>${icon('lock',15)} Privada</span></label></fieldset>
        <p class="form-status" role="alert" data-cm-error></p><div class="co-form-actions"><button type="button" class="secondary" data-act="close">Cancelar</button>
        <button class="primary" type="submit">Criar comunidade</button></div></form>`);
      if (action === 'add-channel') {
        document.querySelector('[data-cm-channels]').insertAdjacentHTML('beforeend', channelRow({ id: '', name: '' }));
        document.querySelector('[data-cm-channels] li:last-child input[name="channel.name"]').focus();
      }
      if (action === 'remove-channel') {
        const list = document.querySelector('[data-cm-channels]');
        if (list.children.length === 1) { flash('A comunidade precisa de pelo menos um canal.', true); return; }
        control.closest('li').remove();
      }
      if (action === 'delete') dialog('Excluir comunidade', `<form class="co-form" data-cm-form="delete" data-id="${h(id)}"><p>A comunidade, os canais e a configuração serão excluídos e ela sai do portal. Esta ação não pode ser desfeita.</p>
        <p class="form-status" role="alert" data-cm-error></p><div class="co-form-actions"><button type="button" class="secondary" data-act="close">Cancelar</button><button class="danger" type="submit">Excluir comunidade</button></div></form>`);
      if (action === 'pin') { await send({ action: 'pin', postId: id }); flash('Publicação atualizada.'); }
      if (action === 'delete-post') { await send({ action: 'delete', postId: id }); flash('Publicação excluída.'); }
      if (action === 'delete-comment') { await send({ action: 'delete', postId: id, commentId: control.dataset.comment }); flash('Comentário excluído.'); }
      if (action === 'member') {
        await send({ action: 'member', memberId: id, ...(control.dataset.status ? { status: control.dataset.status } : {}), ...(control.dataset.role ? { role: control.dataset.role } : {}) });
        flash('Membro atualizado.');
      }
      if (action === 'remove-member') { await send({ action: 'remove', memberId: id }); flash('Membro removido da comunidade.'); }
      if (action === 'add-members') {
        const data = cache.get(`${c.workspace}:${groupId()}`);
        dialog('Adicionar clientes do portal', `<form class="co-form" data-cm-form="add"><fieldset class="cp-permissions"><legend>Clientes</legend>
          ${data.candidates.map(row => `<label class="cp-checkbox"><input type="checkbox" name="memberIds" value="${h(row.id)}"><span>${h(row.name)}<small>${h(row.email)}</small></span></label>`).join('')}</fieldset>
          <p class="form-status" role="alert" data-cm-error></p><div class="co-form-actions"><button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary" type="submit">Adicionar</button></div></form>`);
      }
    } catch (error) { flash(error.message, true); }
  });

  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-cm-form]');
    if (!form) return;
    event.preventDefault();
    const fields = new FormData(form), kind = form.dataset.cmForm, submit = form.querySelector('button[type="submit"]'), error = form.querySelector('[data-cm-error]');
    if (submit) submit.disabled = true;
    if (error) error.textContent = '';
    try {
      if (kind === 'create') {
        const id = await mutate({ type: 'save', key: 'communities', data: { name: fields.get('name'), description: fields.get('description'), visibility: fields.get('visibility') } });
        close(); ui.tab = 'posts'; location.hash = `#memberships/community/${encodeURIComponent(id)}`; flash('Comunidade criada.');
      }
      if (kind === 'settings') {
        const ids = fields.getAll('channel.id'), names = fields.getAll('channel.name');
        await mutate({ type: 'save', key: 'communities', id: form.dataset.id, data: {
          name: fields.get('name'), description: fields.get('description'), coverFileId: fields.get('coverFileId'), visibility: fields.get('visibility'),
          memberPosts: fields.has('memberPosts'), active: fields.has('active'), welcome: fields.get('welcome'),
          channels: names.map((name, index) => ({ ...(ids[index] ? { id: ids[index] } : {}), name })),
          points: { post: Number(fields.get('points.post')), comment: Number(fields.get('points.comment')), like: Number(fields.get('points.like')) },
          levels: levelThresholds.map((min, index) => ({ name: fields.get(`level.${index}`) })) } });
        render(); flash('Configurações salvas.');
      }
      if (kind === 'delete') {
        await mutate({ type: 'delete', key: 'communities', id: form.dataset.id });
        close(); location.hash = '#memberships/communities'; flash('Comunidade excluída.');
      }
      if (kind === 'post') {
        await send({ action: 'post', channelId: fields.get('channelId'), imageFileId: fields.get('imageFileId'), title: fields.get('title'), body: fields.get('body'),
          link: fields.get('link'), pinned: fields.has('pinned'), poll: String(fields.get('poll') || '').split('\n').map(line => line.trim()).filter(Boolean) });
        flash('Publicado na comunidade.');
      }
      if (kind === 'comment') { await send({ action: 'comment', postId: form.dataset.id, body: fields.get('body') }); flash('Resposta publicada.'); }
      if (kind === 'add') { await send({ action: 'add', memberIds: fields.getAll('memberIds') }); close(); flash('Clientes adicionados à comunidade.'); }
    } catch (failure) {
      if (error) error.textContent = failure.message; else flash(failure.message, true);
    } finally { if (submit?.isConnected) submit.disabled = false; }
  });

  return mount;
}
