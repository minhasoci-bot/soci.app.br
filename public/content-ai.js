// Content AI inside the editors: a small "IA" button next to a text field opens a menu of actions
// (improve, shorten, expand, grammar, tone, translate). The result replaces the selection or the
// whole field, fires an input event so each editor saves it as usual, and can be undone.
import { icon } from './icons.js';
import { h } from './screens.js';
import { contentActions, contentTones } from './content-ai-data.js';
import { selectionActions } from './beautiful-ui-more.js';

export function aiTool(target, kind, field = '') {
  return `<button type="button" class="ai-tool" data-ai-tool data-ai-kind="${h(kind)}" data-ai-target="${h(target)}" data-ai-field="${h(field)}" aria-haspopup="menu" aria-expanded="false" title="IA de conteúdo${field ? `: ${h(field)}` : ''}">${icon('spark', 13)}<span>IA</span></button>`;
}

let installed = false;

export function installContentAI({ api, workspace, flash, enabled }) {
  if (installed) return;
  installed = true;
  const menu = document.createElement('div');
  menu.className = 'ai-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'IA de conteúdo');
  document.body.append(menu);
  let opener = null, undo = null, busy = false, request = 0;

  const field = () => (opener?.isConnected ? document.querySelector(opener.dataset.aiTarget) : null);
  function close(restoreFocus = false) {
    if (menu.hidden) return;
    menu.hidden = true;
    request += 1;
    busy = false;
    opener?.setAttribute('aria-expanded', 'false');
    if (restoreFocus && opener?.isConnected) opener.focus();
  }
  function place() {
    const box = opener.getBoundingClientRect();
    const width = Math.min(menu.querySelector('.bui-selection') ? 480 : 260, window.innerWidth - 16);
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.max(8, Math.min(box.right - width, window.innerWidth - width - 8)) + window.scrollX}px`;
    const below = box.bottom + 6;
    const height = menu.offsetHeight || 320;
    menu.style.top = `${(below + height > window.innerHeight && box.top - height - 6 > 0 ? box.top - height - 6 : below) + window.scrollY}px`;
  }
  // Barra de IA do Beautiful UI (SelectionActions): o trecho fica em destaque, a IA reescreve
  // em prévia e o campo só muda quando a pessoa escolhe "Manter".
  const label = id => contentActions.find(([key]) => key === id)?.[1] || id;
  const ACTIONS = {
    primary: [
      { id: 'improve', label: 'Melhorar', icon: 'improve', busy: 'Melhorando', run: 'improve' },
      { id: 'shorten', label: 'Encurtar', icon: 'shorten', busy: 'Encurtando', run: 'shorten' }
    ],
    more: [
      { id: 'expand', label: 'Expandir', icon: 'improve', busy: 'Expandindo', run: 'expand' },
      { id: 'grammar', label: 'Gramática', icon: 'grammar', busy: 'Revisando', run: 'grammar' },
      { id: 'tone', label: 'Tom', icon: 'tone', busy: 'Ajustando o tom', run: 'tone' },
      { id: 'translate-es', label: 'Espanhol', icon: 'explain', busy: 'Traduzindo', run: 'translate-es' },
      { id: 'translate-pt', label: 'Português', icon: 'explain', busy: 'Traduzindo', run: 'translate-pt' }
    ]
  };
  let bar = null;
  function showActions() {
    bar?.destroy();
    bar = null;
    const target = field();
    if (!target) return;
    const start = target.selectionStart ?? 0, end = target.selectionEnd ?? 0;
    const partial = typeof target.selectionStart === 'number' && start !== end;
    const before = target.value;
    const text = partial ? before.slice(start, end) : before;
    if (!text.trim()) { showMessage('Escreva algo no campo antes de usar a IA.', { error: true }); return; }
    const head = partial ? before.slice(0, start) : '';
    const lead = head.length > 140 ? `…${head.slice(-140)}` : head;
    menu.innerHTML = `<p class="ai-menu-scope">${partial ? 'Trecho selecionado' : 'Campo inteiro'} · a mudança só entra quando você clicar em Manter</p>
      <div class="ai-menu-tone"><label for="ai-tone">Tom</label><select id="ai-tone">${contentTones.map(([id, name]) => `<option value="${id}">${h(name)}</option>`).join('')}</select></div>`;
    bar = selectionActions({
      lead,
      original: text,
      prompt: false,
      actions: ACTIONS,
      labels: { keep: 'Manter', discard: 'Descartar' },
      onRun: async action => {
        if (busy) return null;
        busy = true;
        const mine = ++request;
        try {
          const tone = menu.querySelector('#ai-tone')?.value;
          const result = await api(`/api/content-ai/transform?workspace=${encodeURIComponent(workspace())}`, {
            action, kind: opener.dataset.aiKind, field: opener.dataset.aiField, text, ...(action === 'tone' && { tone })
          });
          return mine === request ? result.text : null;
        } finally {
          if (mine === request) busy = false;
        }
      },
      onKeep: rewritten => {
        const live = field();
        if (!live) { close(); return; }
        if (live.value !== before) { showMessage('O campo mudou enquanto a IA escrevia. Tente de novo.', { error: true }); return; }
        const next = partial ? `${before.slice(0, start)}${rewritten}${before.slice(end)}` : rewritten;
        if (live.maxLength > 0 && next.length > live.maxLength) { showMessage(`O texto novo passaria do limite de ${live.maxLength.toLocaleString('pt-BR')} caracteres do campo.`, { error: true }); return; }
        write(live, next);
        undo = { selector: opener.dataset.aiTarget, before, after: next };
        showMessage('Texto atualizado.', { canUndo: true });
      },
      onDiscard: () => close(true),
      onError: error => showMessage(error.message || `Não deu para ${label(error.action || 'improve').toLowerCase()}.`, { error: true })
    });
    menu.insertBefore(bar.el, menu.lastElementChild);
  }
  function showMessage(text, { error = false, canUndo = false } = {}) {
    menu.innerHTML = `<p class="ai-menu-msg${error ? ' error' : ''}" role="${error ? 'alert' : 'status'}">${h(text)}</p>
      <div class="ai-menu-row">${canUndo ? '<button type="button" class="secondary" data-ai-undo>Desfazer</button>' : ''}<button type="button" class="secondary" data-ai-back>Outra ação</button></div>`;
    place();
  }
  function write(target, value) {
    target.value = value;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
  }

  document.addEventListener('click', event => {
    const tool = event.target.closest('[data-ai-tool]');
    if (tool) {
      event.preventDefault();
      if (!menu.hidden && opener === tool) { close(); return; }
      close();
      if (!enabled(tool.dataset.aiKind)) { flash('Conecte a OpenAI em Visão da agência → Configurações → OpenAI para usar a IA de conteúdo.', true); return; }
      opener = tool;
      tool.setAttribute('aria-expanded', 'true');
      showActions();
      menu.hidden = false;
      place();
      menu.querySelector('button')?.focus();
      return;
    }
    if (menu.hidden) return;
    // composedPath: o botão clicado pode já ter saído do DOM (a barra troca os botões no clique).
    if (!event.composedPath().includes(menu)) { close(); return; }
    if (event.target.closest('[data-ai-back]')) { showActions(); place(); menu.querySelector('button')?.focus(); return; }
    if (event.target.closest('[data-ai-undo]') && undo) {
      const target = document.querySelector(undo.selector);
      if (target && target.value === undo.after) { write(target, undo.before); showMessage('Texto anterior restaurado.'); }
      else showMessage('O campo mudou depois da IA. Não dá para desfazer.', { error: true });
      undo = null;
    }
  });
  // Keep the field's selection when the menu button is pressed.
  document.addEventListener('mousedown', event => { if (event.target.closest('[data-ai-tool]')) event.preventDefault(); }, true);
  document.addEventListener('keydown', event => {
    if (menu.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    if (['ArrowDown', 'ArrowUp'].includes(event.key) && menu.contains(document.activeElement)) {
      const items = [...menu.querySelectorAll('button, select')];
      const index = items.indexOf(document.activeElement);
      items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      event.preventDefault();
    }
  });
  window.addEventListener('hashchange', () => close());
  window.addEventListener('resize', () => { if (!menu.hidden && opener?.isConnected) place(); else close(); });
}
