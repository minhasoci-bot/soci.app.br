// Conversas ao vivo: enquanto a caixa de entrada está à vista, pergunta ao servidor o que mudou e troca na tela só isso.
// Não redesenha a página: o que a pessoa está escrevendo, o campo em foco, a rolagem e o áudio tocando ficam como estão.
const EVERY = 5000, IDLE_EVERY = 20000, IDLE_AFTER = 120000, RETRY = 30000;

/** Põe a resposta no estado da tela. Falso quando não há o que mudar, ou quando uma ação trocou o estado no meio. */
export function applyChanges(c, before, { state, metrics }) {
  if (!state || c.s !== before) return false;
  Object.assign(c.s, state);
  if (metrics) c.m = metrics;
  return true;
}

/** request(marca) → resposta · watching(): a caixa está à vista · changed(apply): apply() grava no estado; a tela se ajusta. */
export function createInboxFollower({ c, request, watching, changed, clock = Date.now }) {
  let running = false, failed = false, next = 0, usedAt = clock(), mark = '', markedState = null, markedWorkspace = '';
  return {
    used() {
      usedAt = clock();
      if (!failed) next = Math.min(next, usedAt + EVERY);
    },
    async tick({ now = false } = {}) {
      if (running || !c.s || !watching() || (!now && clock() < next)) return;
      running = true;
      const before = c.s, workspace = c.workspace;
      try {
        // Uma ação trocou o estado desde a última busca: a marca antiga não diz mais o que a tela tem.
        const answer = await request(markedState === before && markedWorkspace === workspace ? mark : '');
        failed = false;
        next = clock() + (clock() - usedAt > IDLE_AFTER ? IDLE_EVERY : EVERY);
        if (c.workspace !== workspace || c.s !== before) return;
        mark = answer.mark; markedState = before; markedWorkspace = workspace;
        if (answer.state) await changed(() => c.workspace === workspace && applyChanges(c, before, answer));
      } catch { failed = true; next = clock() + RETRY; }
      finally { running = false; }
    }
  };
}

/** Lista na tela (before) → lista nova (after): o que trocar, o que acrescentar e quantos sobram no fim. */
export function patchPlan(before, after, same) {
  const common = Math.min(before.length, after.length), replace = [], append = [];
  for (let index = 0; index < common; index++) if (!same(before[index], after[index])) replace.push(index);
  for (let index = common; index < after.length; index++) append.push(index);
  return { replace, append, remove: before.length - common };
}

const fresh = node => document.importNode(node, true);
// Compara o desenho de antes com o de agora, e não com a tela: o que mudou sozinho na tela (um arquivo indisponível,
// um relógio) não conta como diferença.
function patchChildren(real, before, after) {
  if (!real || !before || !after) return;
  if (real.children.length !== before.children.length) { if (!before.isEqualNode(after)) real.replaceChildren(...[...after.children].map(fresh)); return; }
  const now = [...real.children], plan = patchPlan([...before.children], [...after.children], (a, b) => a.isEqualNode(b));
  for (const index of plan.replace) now[index].replaceWith(fresh(after.children[index]));
  for (const index of plan.append) real.append(fresh(after.children[index]));
  for (const node of plan.remove ? now.slice(-plan.remove) : []) node.remove();
}
function patchOptional(root, before, after, selector, place) {
  const real = root.querySelector(selector), old = before.querySelector(selector), now = after.querySelector(selector);
  if (old && now ? old.isEqualNode(now) : old === now) return;
  if (real && now) real.replaceWith(fresh(now));
  else if (real) real.remove();
  else if (now) place(fresh(now));
}

/** root: a caixa na tela; before e after: a mesma página desenhada antes e depois. Falso: só redesenhando a página. */
export function patchInbox(root, before, after) {
  const area = root.querySelector('.thread-messages'), drawn = after.querySelector('.thread-messages');
  if (!area !== !drawn || !root.querySelector('.thread-items') !== !after.querySelector('.thread-items')) return false;
  const focused = document.activeElement;
  const key = root.contains(focused) && ['thread', 'inboxPick', 'inboxBox'].find(name => focused.dataset[name]);
  const value = key && focused.dataset[key];
  const atEnd = area && area.scrollHeight - area.scrollTop - area.clientHeight < 80;
  patchChildren(area, before.querySelector('.thread-messages'), drawn);
  for (const part of ['.thread-items', '.inbox-nav']) patchChildren(root.querySelector(part), before.querySelector(part), after.querySelector(part));
  const panel = root.querySelector('.contact-panel-body');
  if (panel && !panel.contains(focused)) patchChildren(panel, before.querySelector('.contact-panel-body'), after.querySelector('.contact-panel-body'));
  patchOptional(root, before, after, '.wa-notice', node => root.querySelector('.inbox-shell')?.before(node));
  patchOptional(root, before, after, '.thread-sla', node => area?.before(node));
  const pickAll = root.querySelector('[data-inbox-pick-all]'), drawnPick = after.querySelector('[data-inbox-pick-all]');
  if (pickAll && drawnPick) pickAll.disabled = drawnPick.disabled;
  if (atEnd) { delete area.dataset.moved; area.scrollTop = area.scrollHeight; }
  if (key && !focused.isConnected) [...root.querySelectorAll('button, input')].find(node => node.dataset[key] === value)?.focus({ preventScroll: true });
  return true;
}
