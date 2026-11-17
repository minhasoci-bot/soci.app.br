import { icon } from './icons.js';
import { h } from './screens.js';
import { agentDraft, agentLimits, agentRevision, changedAgentFields } from './agents-data.js';

const sections = [['instructions', 'Instruções', 'edit'], ['knowledge', 'Conhecimento', 'folder'], ['release', 'Publicação', 'check']];
const fieldNames = { name: 'Nome', role: 'Função', instructions: 'Instruções', knowledge: 'Conhecimento' };
const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const agentLink = id => `#ai-agents/edit/${encodeURIComponent(id)}`;
const listLink = '<a class="agent-back" href="#ai-agents">← Agentes de IA</a>';

function badges(agent) {
  if (!agent.published) return '<span class="badge">Rascunho</span>';
  return `<span class="badge green">Publicado · v${h(agent.published.version)}</span>
    ${changedAgentFields(agent).length ? '<span class="badge blue">Alterações no rascunho</span>' : ''}`;
}

function agentList(agents) {
  const cards = agents.map(agent => {
    const draft = agentDraft(agent);
    return `<a class="surface agent-card" href="${agentLink(agent.id)}" data-agent-card data-search="${h(`${draft.name} ${draft.role}`)}">
      <span class="metric-icon">${icon('spark', 18)}</span><div><h2>${h(draft.name)}</h2><p class="dim">${h(draft.role)}</p></div>
      <div class="agent-badges">${badges(agent)}</div></a>`;
  }).join('');
  return `<div class="page agent-page" data-agent-screen="list">
    <header class="page-head"><div><h1>Agentes de IA</h1><p>Crie, teste e publique agentes para esta subconta.</p></div>
      <a class="primary" href="#ai-agents/new">${icon('plus', 16)} Novo agente</a></header>
    ${agents.length ? '<label class="search agent-search"><input type="search" aria-label="Buscar agentes" placeholder="Buscar por nome ou função"></label>' : ''}
    <div class="agent-grid">${cards}</div>
    <div class="surface empty" data-agent-empty ${agents.length ? 'hidden' : ''}>
      ${icon('spark', 24)}<strong>${agents.length ? 'Nenhum agente encontrado' : 'Nenhum agente criado'}</strong>
      ${agents.length ? '' : '<p>Comece definindo a função e as instruções do seu agente.</p><a class="secondary" href="#ai-agents/new">Criar primeiro agente</a>'}
    </div>
  </div>`;
}

function sourceFields(source = {}) {
  return `<fieldset class="agent-source">
    <legend>Fonte de conhecimento</legend>
    <label>Título<input name="sourceTitle" required maxlength="${agentLimits.sourceName}" value="${h(source.title)}"></label>
    <label>Conteúdo<textarea name="sourceText" required rows="4" maxlength="${agentLimits.sourceText}">${h(source.text)}</textarea></label>
    <button class="secondary danger" type="button" data-agent-remove-source>Remover fonte</button>
  </fieldset>`;
}

function agentEditor(agent, model) {
  const draft = agentDraft(agent);
  return `<div class="page agent-page" data-agent-screen="editor" data-agent-id="${h(agent.id)}">
    ${listLink}
    <header class="page-head agent-header"><div><h1 data-agent-name>${h(draft.name)}</h1><div class="agent-badges" data-agent-badges>${badges(agent)}</div></div>
      <div class="agent-header-actions"><span role="status" data-agent-save-status>Rascunho salvo</span>
        <button class="secondary" type="submit" form="agent-draft">Salvar rascunho</button></div></header>
    <div class="agent-layout">
      <section class="surface agent-config">
        <nav class="agent-sections" aria-label="Configuração do agente">
          ${sections.map(([key, label, ico]) => `<button type="button" data-agent-section="${key}" aria-pressed="${key === 'instructions'}">${icon(ico, 16)} ${label}</button>`).join('')}
        </nav>
        <form id="agent-draft" class="agent-fields" novalidate>
          <section data-agent-panel="instructions">
            <h2>Identidade e instruções</h2>
            <label>Nome<input name="name" required maxlength="${agentLimits.name}" value="${h(draft.name)}"></label>
            <label>Função<input name="role" required maxlength="${agentLimits.role}" value="${h(draft.role)}" placeholder="Ex. Assistente de atendimento"></label>
            <label>Instruções<textarea name="instructions" required maxlength="${agentLimits.instructions}" rows="10">${h(draft.instructions)}</textarea></label>
            <small class="dim" data-agent-count></small>
          </section>
          <section data-agent-panel="knowledge" hidden>
            <h2>Conhecimento</h2>
            <p class="dim">Adicione textos que o agente deve consultar ao responder, como políticas, FAQs ou informações de produtos.</p>
            <div class="agent-sources" data-agent-sources>${draft.knowledge.map(sourceFields).join('')}</div>
            <button class="secondary" type="button" data-agent-add-source>${icon('plus', 16)} Adicionar fonte</button>
            <small class="dim" data-agent-source-count></small>
          </section>
        </form>
        <section class="agent-fields" data-agent-panel="release" hidden>
          <h2>Publicação</h2>
          <div class="agent-release-info" data-agent-release-info></div>
          <div class="agent-actions"><button class="primary" type="button" data-agent-action="publish">Publicar agente</button>
            <button class="secondary" type="button" data-agent-action="unpublish">Despublicar</button></div>
          <button class="secondary danger agent-delete" type="button" data-agent-confirm-delete>Excluir agente</button>
        </section>
      </section>
      <aside class="surface agent-preview" aria-label="Teste do agente">
        <header><div><h2>Testar agente</h2><p class="dim" data-agent-model>${model ? h(model) : 'Modelo do AI Studio não configurado'}</p></div>
          <button class="icon-btn" type="button" data-agent-reset title="Nova conversa" aria-label="Nova conversa">${icon('refresh', 16)}</button></header>
        <label class="agent-preview-version">Versão<select data-agent-test-version><option value="draft">Rascunho</option><option value="published">Publicada</option></select></label>
        <div class="agent-transcript" role="log" aria-label="Conversa de teste">
          <p class="dim">${model ? 'Envie uma mensagem de exemplo para conferir como o agente responde.' : 'Configure o modelo do AI Studio para habilitar as respostas de teste.'}</p>
        </div>
        <form class="agent-message" data-agent-test>
          <label class="sr-only" for="agent-test-message">Mensagem de teste</label>
          <textarea id="agent-test-message" name="message" rows="2" maxlength="${agentLimits.message}" placeholder="Escreva uma mensagem de teste…" required ${model ? '' : 'disabled'}></textarea>
          <p data-agent-test-status class="form-status" role="status"></p>
          <button class="primary" ${model ? '' : 'disabled'}>Enviar mensagem ${icon('send', 15)}</button>
        </form>
      </aside>
    </div>
    <dialog class="agent-confirm" aria-labelledby="agent-delete-title"><header><h2 id="agent-delete-title">Excluir agente?</h2></header>
      <div class="modal-body"><p>O rascunho e a versão publicada deste agente serão removidos.</p></div>
      <footer><button class="secondary" type="button" data-agent-cancel-delete>Cancelar</button>
        <button type="button" class="secondary danger" data-agent-action="delete">Excluir agente</button></footer></dialog>
  </div>`;
}

export function agentsScreen(c) {
  if (c.tab === 'new') return `<div class="page agent-page" data-agent-screen="new">${listLink}
    <header class="page-head"><div><h1>Novo agente</h1><p>Crie um rascunho para começar a configuração.</p></div></header>
    <form class="surface agent-create" data-agent-create>
      <label>Nome do agente<input name="name" required maxlength="${agentLimits.name}" placeholder="Ex. Atendimento ao cliente"></label>
      <p class="form-status" role="alert"></p><button class="primary">Criar rascunho</button>
    </form></div>`;
  if (c.tab === 'edit') {
    const agent = c.s.agents.find(item => item.id === c.agentId);
    return agent ? agentEditor(agent, c.features?.agentModel) : `<div class="page agent-page">${listLink}<div class="surface empty"><strong>Agente não encontrado nesta subconta</strong></div></div>`;
  }
  return agentList(c.s.agents);
}

export function mountAgentScreen({ root, workspace, model = '', startAgent, request, updateAgent }) {
  if (root.dataset.agentScreen === 'list') {
    const search = root.querySelector('input[type=search]');
    search?.addEventListener('input', () => {
      const normalized = text => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
      const query = normalized(search.value.trim());
      const cards = [...root.querySelectorAll('[data-agent-card]')];
      for (const card of cards) card.hidden = !normalized(card.dataset.search).includes(query);
      root.querySelector('[data-agent-empty]').hidden = cards.some(card => !card.hidden);
    });
    return;
  }
  if (root.dataset.agentScreen === 'new') {
    const form = root.querySelector('form');
    form.elements.name.focus();
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('button');
      const status = form.querySelector('.form-status');
      if (button.disabled) return;
      button.disabled = true;
      status.textContent = '';
      try {
        const { agent } = await request('create', { name: form.elements.name.value });
        updateAgent(agent.id, agent);
        if (root.isConnected) location.hash = agentLink(agent.id);
      } catch (error) {
        status.textContent = error.message;
      } finally { button.disabled = false; }
    });
    return;
  }
  return mountEditor({ root, workspace, model, agent: startAgent, request, updateAgent });
}

function mountEditor({ root, workspace, model, agent, request, updateAgent }) {
  const get = selector => root.querySelector(selector);
  const form = get('#agent-draft');
  const sources = get('[data-agent-sources]');
  const saveStatus = get('[data-agent-save-status]');
  const publish = get('[data-agent-action="publish"]');
  const testVersion = get('[data-agent-test-version]');
  const transcript = get('.agent-transcript');
  const testForm = get('[data-agent-test]');
  const testStatus = get('[data-agent-test-status]');
  const testButton = testForm.querySelector('button');
  const confirm = get('.agent-confirm');
  const welcome = transcript.innerHTML;
  let timer, saving, actionPending = false, committing = false, deleted = false, testPending = false, conflict = false;
  let baseline = JSON.stringify(agentDraft(agent)), messages = [], chatConfig = '';

  function openSection(section) {
    for (const panel of root.querySelectorAll('[data-agent-panel]')) panel.hidden = panel.dataset.agentPanel !== section;
    for (const button of root.querySelectorAll('[data-agent-section]')) button.setAttribute('aria-pressed', button.dataset.agentSection === section);
    form.hidden = section === 'release';
  }
  function readDraft() {
    return {
      name: form.elements.name.value.trim(),
      role: form.elements.role.value.trim(),
      instructions: form.elements.instructions.value.trim(),
      knowledge: [...sources.children].map(source => ({
        title: source.querySelector('input').value.trim(), text: source.querySelector('textarea').value.trim()
      }))
    };
  }
  function dirty() { return !deleted && JSON.stringify(readDraft()) !== baseline; }
  function describe(message, isError = false) {
    saveStatus.textContent = message;
    saveStatus.toggleAttribute('data-error', isError);
  }
  function refreshCounters() {
    get('[data-agent-count]').textContent = `${form.elements.instructions.value.length.toLocaleString('pt-BR')} / ${agentLimits.instructions.toLocaleString('pt-BR')} caracteres`;
    get('[data-agent-source-count]').textContent = `${sources.childElementCount} de ${agentLimits.sources} fontes`;
    get('[data-agent-add-source]').disabled = sources.childElementCount >= agentLimits.sources;
  }
  function refreshRelease() {
    const release = agent.published;
    const changes = changedAgentFields(agent).map(field => fieldNames[field]);
    const modelChanged = release && release.model !== model;
    if (modelChanged) changes.push('Modelo');
    get('[data-agent-name]').textContent = agent.name;
    get('[data-agent-badges]').innerHTML = badges(agent);
    get('[data-agent-release-info]').innerHTML = release
      ? `<b>Versão ${h(release.version)} publicada em ${dateFormat.format(new Date(release.at))}</b>
         <p class="dim">${changes.length ? `Alterações para publicar em ${h(changes.join(', '))}.` : 'O rascunho corresponde à versão publicada.'}</p>`
      : '<p class="dim">Publique para guardar uma versão do rascunho. Você poderá testá-la mesmo depois de editar as instruções ou as fontes.</p>';
    publish.textContent = release ? 'Publicar nova versão' : 'Publicar agente';
    publish.disabled = Boolean(release && !changes.length && !dirty()) || conflict || actionPending;
    get('[data-agent-action="unpublish"]').hidden = !release;
    testVersion.querySelector('[value="published"]').disabled = !release;
    testVersion.closest('label').hidden = !release;
    if (!release && testVersion.value === 'published') {
      testVersion.value = 'draft';
      resetChat();
    }
    showModel();
  }
  function showModel() {
    const selected = testVersion.value === 'published' ? agent.published?.model || model : model;
    get('[data-agent-model]').textContent = selected || 'Modelo do AI Studio não configurado';
  }
  function validDraft(report) {
    const invalid = [...form.elements].find(field => field.validity && (!field.validity.valid || (field.required && !field.value.trim())));
    if (!invalid) return true;
    if (report) {
      openSection(invalid.closest('[data-agent-panel]').dataset.agentPanel);
      invalid.focus();
      invalid.reportValidity();
    }
    describe('Preencha todos os campos para salvar.', true);
    return false;
  }
  function save(report = false) {
    clearTimeout(timer);
    if (saving) return saving;
    if (conflict || committing || deleted) return Promise.resolve(false);
    if (!dirty()) return Promise.resolve(true);
    if (!validDraft(report)) return Promise.resolve(false);
    saving = (async () => {
      try {
        while (dirty()) {
          if (!validDraft(report)) return false;
          const draft = readDraft();
          describe('Salvando rascunho…');
          const response = await request('save', { ...draft, id: agent.id, revision: agentRevision(agent) });
          agent = response.agent;
          baseline = JSON.stringify(agentDraft(agent));
          updateAgent(agent.id, agent);
          refreshRelease();
        }
        describe('Rascunho salvo');
        return true;
      } catch (error) {
        conflict = error.status === 409;
        describe(error.message, true);
        refreshRelease();
        return false;
      } finally { saving = null; }
    })();
    return saving;
  }
  function scheduleSave() {
    refreshCounters();
    refreshRelease();
    clearTimeout(timer);
    if (conflict) return;
    describe(dirty() ? 'Alterações pendentes' : 'Rascunho salvo');
    timer = setTimeout(() => save(), 950);
  }
  function addMessage(content, role) {
    const bubble = document.createElement('div');
    bubble.className = `agent-bubble ${role}`;
    const label = document.createElement('strong');
    label.textContent = role === 'user' ? 'Você' : agent.name;
    const body = document.createElement('p');
    body.textContent = content;
    bubble.append(label, body);
    transcript.append(bubble);
    transcript.scrollTop = transcript.scrollHeight;
    return bubble;
  }
  function resetChat() {
    messages = [];
    chatConfig = '';
    transcript.innerHTML = welcome;
    testStatus.textContent = '';
  }

  form.addEventListener('input', scheduleSave);
  form.addEventListener('submit', event => { event.preventDefault(); void save(true); });
  testVersion.addEventListener('change', () => { resetChat(); showModel(); });
  root.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;
    const { agentSection, agentAction } = button.dataset;
    if (agentSection) openSection(agentSection);
    if (button.hasAttribute('data-agent-add-source')) {
      sources.insertAdjacentHTML('beforeend', sourceFields());
      sources.lastElementChild.querySelector('input').focus();
      scheduleSave();
    }
    if (button.hasAttribute('data-agent-remove-source')) {
      button.closest('fieldset').remove();
      get('[data-agent-add-source]').focus();
      scheduleSave();
    }
    if (button.hasAttribute('data-agent-reset')) resetChat();
    if (button.hasAttribute('data-agent-confirm-delete')) confirm.showModal();
    if (button.hasAttribute('data-agent-cancel-delete')) confirm.close();
    if (!agentAction || actionPending) return;
    actionPending = true;
    button.disabled = true;
    if (confirm.open) confirm.close();
    try {
      if (agentAction === 'publish' && !await save(true)) return;
      if (saving && !await saving) return;
      clearTimeout(timer);
      committing = form.inert = true;
      const id = agent.id;
      const result = await request(agentAction, { id, revision: agentRevision(agent) });
      deleted = agentAction === 'delete';
      updateAgent(id, result.agent);
      if (deleted) {
        if (root.isConnected) location.hash = '#ai-agents';
        return;
      }
      agent = result.agent;
      describe(agentAction === 'publish' ? 'Versão publicada' : 'Agente despublicado');
      if (dirty()) timer = setTimeout(() => save(), 950);
    } catch (error) {
      conflict = error.status === 409;
      describe(error.message, true);
    } finally {
      actionPending = committing = form.inert = false;
      button.disabled = false;
      if (!deleted) refreshRelease();
    }
  });
  testForm.addEventListener('submit', async event => {
    event.preventDefault();
    const input = testForm.elements.message;
    const message = input.value.trim();
    if (!model || !message || testPending) return;
    testPending = true;
    const version = testVersion.value;
    const reset = get('[data-agent-reset]');
    testButton.disabled = testVersion.disabled = reset.disabled = input.disabled = true;
    testStatus.textContent = 'Preparando teste…';
    let bubble;
    try {
      if (version === 'draft' && !await save(true)) {
        testStatus.textContent = 'Resolva as pendências do rascunho e tente novamente.';
        return;
      }
      const config = version === 'published' ? `published:${agent.published?.version}` : baseline;
      if (chatConfig !== config) resetChat();
      chatConfig = config;
      if (!messages.length) transcript.replaceChildren();
      bubble = addMessage(message, 'user');
      testStatus.textContent = 'Aguardando resposta…';
      const history = [...messages.slice(-8), message];
      const { reply } = await request('test', { id: agent.id, revision: agentRevision(agent), version, messages: history });
      messages = [...history, reply];
      addMessage(reply, 'assistant');
      input.value = '';
      testStatus.textContent = '';
    } catch (error) {
      bubble?.remove();
      if (!messages.length) transcript.innerHTML = welcome;
      testStatus.textContent = error.message;
    } finally {
      testPending = false;
      testButton.disabled = testVersion.disabled = reset.disabled = input.disabled = false;
      if (root.isConnected) input.focus();
    }
  });

  refreshCounters();
  refreshRelease();
  return { root, workspace, id: agent.id, flush: () => save(), dirty };
}
