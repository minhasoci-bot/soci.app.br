// Content AI inside the editors: a small "IA" button next to a text field opens a menu of actions
// (improve, shorten, expand, grammar, tone, translate). The result replaces the selection or the
// whole field, fires an input event so each editor saves it as usual, and can be undone.
import { icon } from './icons.js';
import { h } from './screens.js';
import { contentActions, contentTones } from './content-ai-data.js';

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
    const width = Math.min(260, window.innerWidth - 16);
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.max(8, Math.min(box.right - width, window.innerWidth - width - 8)) + window.scrollX}px`;
    const below = box.bottom + 6;
    const height = menu.offsetHeight || 320;
    menu.style.top = `${(below + height > window.innerHeight && box.top - height - 6 > 0 ? box.top - height - 6 : below) + window.scrollY}px`;
  }
  function showActions() {
    const target = field();
    const selected = target && target.selectionStart !== target.selectionEnd && target.selectionStart !== undefined;
    menu.innerHTML = `<p class="ai-menu-scope">${selected ? 'Aplicar ao trecho selecionado' : 'Aplicar ao campo inteiro'}</p>
      ${contentActions.filter(([id]) => id !== 'tone').map(([id, label]) => `<button type="button" role="menuitem" data-ai-action="${id}">${h(label)}</button>`).join('')}
      <div class="ai-menu-tone"><label class="sr-only" for="ai-tone">Tom</label><select id="ai-tone">${contentTones.map(([id, label]) => `<option value="${id}">${h(label)}</option>`).join('')}</select>
        <button type="button" role="menuitem" data-ai-action="tone">Mudar o tom</button></div>`;
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

  async function run(action) {
    const target = field();
    if (!target || busy) return;
    const start = target.selectionStart ?? 0, end = target.selectionEnd ?? 0;
    const partial = typeof target.selectionStart === 'number' && start !== end;
    const before = target.value;
    const text = partial ? before.slice(start, end) : before;
    if (!text.trim()) { showMessage('Escreva algo no campo antes de usar a IA.', { error: true }); return; }
    busy = true;
    const mine = ++request;
    menu.innerHTML = `<p class="ai-menu-msg" role="status"><span class="ai-spinner" aria-hidden="true"></span> Escrevendo…</p>`;
    try {
      const tone = menu.ownerDocument.getElementById('ai-tone')?.value;
      const result = await api(`/api/content-ai/transform?workspace=${encodeURIComponent(workspace())}`, {
        action, kind: opener.dataset.aiKind, field: opener.dataset.aiField, text, ...(action === 'tone' && { tone })
      });
      if (mine !== request) return;
      const live = field();
      if (!live) { close(); return; }
      if (live.value !== before) { showMessage('O campo mudou enquanto a IA escrevia. Tente de novo.', { error: true }); return; }
      const next = partial ? `${before.slice(0, start)}${result.text}${before.slice(end)}` : result.text;
      if (live.maxLength > 0 && next.length > live.maxLength) { showMessage(`O texto novo passaria do limite de ${live.maxLength.toLocaleString('pt-BR')} caracteres do campo.`, { error: true }); return; }
      write(live, next);
      undo = { selector: opener.dataset.aiTarget, before, after: next };
      showMessage('Texto atualizado.', { canUndo: true });
    } catch (error) {
      if (mine === request) showMessage(error.message, { error: true });
    } finally {
      if (mine === request) busy = false;
    }
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
    if (!menu.contains(event.target)) { close(); return; }
    const action = event.target.closest('[data-ai-action]');
    if (action) { void run(action.dataset.aiAction); return; }
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
