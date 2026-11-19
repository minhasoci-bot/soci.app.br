// Workflow builder: triggers side by side, a vertical tree of steps with if/else and router branches in columns,
// "+" connectors between steps, and an inspector drawn from the shared catalog (ui/workflow-data.js).
import { icon } from './icons.js';
import { h } from './screens.js';
import { buildWorkflowContext, resolveTemplate } from './expressions.js';
import { actionCatalog, actionSpec, conditionSubjects, eachStep, refSources, stepId, stepSummary, triggerCatalog, triggerSpec, triggerSummary, upgradeWorkflow, variables } from './workflow-data.js';

const MAX_STEPS = 120;
const opportunityStatuses = [['Open', 'Aberta'], ['Won', 'Ganha'], ['Lost', 'Perdida'], ['Abandoned', 'Abandonada']];
const filterText = value => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const opts = (entries, value) => entries.map(([id, label]) => `<option value="${h(id)}" ${String(id) === String(value ?? '') ? 'selected' : ''}>${h(label)}</option>`).join('')
  + (value && !entries.some(([id]) => String(id) === String(value)) ? `<option value="${h(value)}" selected>Referência removida</option>` : '');
const btn = (op, label, { id = '', cls = 'secondary', glyph = '', disabled = false, data = '' } = {}) =>
  `<button type="button" class="${cls}" data-wf="${op}" data-wf-id="${h(id)}" ${data} ${disabled ? 'disabled' : ''}>${glyph ? icon(glyph, 15) : ''}${label}</button>`;

/* ───────── Árvore ───────── */

export function blankWorkflow(folderId = '') {
  return { name: '', folderId, triggers: [], steps: [], active: false, allowReentry: true };
}

// Old drafts (recipes, AI, saved legacy rows) open in the new shape.
export const asTree = row => {
  const tree = upgradeWorkflow(structuredClone(row));
  for (const trigger of tree.triggers) trigger.config ??= {};
  eachStep(tree.steps, step => { step.config ??= {}; });
  return tree;
};

export function findStep(row, id) {
  let found = null;
  eachStep(row.steps, step => { if (step.id === id) found = step; });
  return found;
}

// A list of steps by key: "root", "<stepId>:yes", "<stepId>:no", "<stepId>:otherwise", "<stepId>:route.<routeId>".
export function listByKey(row, key) {
  if (key === 'root') return row.steps;
  const [id, part] = key.split(':'), step = findStep(row, id);
  if (!step) return null;
  if (part === 'yes' || part === 'no' || part === 'otherwise') return (step[part] ??= []);
  if (part?.startsWith('route.')) { const route = step.routes?.find(item => item.id === part.slice(6)); return route ? (route.steps ??= []) : null; }
  return null;
}

function parentOf(row, id) {
  let result = null;
  const visit = (list, key) => list.forEach((step, index) => {
    if (step.id === id) result = { list, index, key };
    if (step.type === 'if_else') { visit(step.yes || [], `${step.id}:yes`); visit(step.no || [], `${step.id}:no`); }
    if (step.type === 'router') { (step.routes || []).forEach(route => visit(route.steps || [], `${step.id}:route.${route.id}`)); visit(step.otherwise || [], `${step.id}:otherwise`); }
  });
  visit(row.steps, 'root');
  return result;
}

const count = row => { let n = 0; eachStep(row.steps, () => n++); return n; };
const defaults = spec => Object.fromEntries((spec?.fields || []).filter(field => field.kind !== 'conditions').map(field =>
  [field.key, field.value ?? (field.kind === 'select' ? field.options[0][0] : '')]));
const condition = () => ({ subject: 'tag', op: 'has', key: '', value: '' });

export function newStep(type) {
  const spec = actionSpec(type);
  const step = { id: stepId(), type, config: defaults(spec) };
  if (type === 'if_else') Object.assign(step, { yes: [], no: [], config: { match: 'all', conditions: [condition()] } });
  if (type === 'router') Object.assign(step, { routes: [{ id: stepId(), label: 'Caminho 1', match: 'all', conditions: [condition()], steps: [] }], otherwise: [] });
  return step;
}

/* ───────── Canvas ───────── */

function card({ key, kind, label, detail, glyph, current, footer, trigger = false, variant = '' }) {
  return `<button type="button" class="wf-node wfb-node ${trigger ? 'wf-node-trigger' : ''} ${variant} ${current ? 'current' : ''}" data-wf="node" data-wf-id="${h(key)}" aria-expanded="${current}">
    <span class="wf-node-body"><span class="wf-node-icon">${icon(glyph, 20)}</span><span class="wf-node-copy">
    <span class="wf-node-kind">${h(kind)}</span><strong>${h(label)}</strong><small data-wf-detail ${detail ? '' : 'hidden'}>${h(detail || '')}</small></span></span>
    <span class="wf-node-footer"><span>${h(footer)}</span><span data-wf-node-status>${icon(detail || trigger ? 'check' : 'sliders', 13)}</span></span></button>`;
}

const addButton = (key, index, full) => `<div class="wfb-link">${btn('node-add', `<span class="sr-only">Adicionar ação aqui</span>`,
  { cls: 'wf-add', glyph: 'plus', disabled: full, data: `data-wf-list="${h(key)}" data-wf-index="${index}"` })}</div>`;

function drawList(c, editor, steps, key, numbering) {
  const full = count(editor.row) >= MAX_STEPS;
  let out = '';
  steps.forEach((step, index) => {
    const spec = actionSpec(step.type);
    const number = `${numbering}${index + 1}`;
    out += addButton(key, index, full);
    out += card({ key: step.id, kind: spec?.group || 'Ação', label: spec?.label || step.type, detail: stepSummary(step, c.s), glyph: spec?.icon || 'flow',
      current: editor.node === step.id, footer: `#${number}`, variant: spec?.branch ? 'wfb-branch-node' : step.type === 'goal' ? 'wfb-goal' : step.type === 'end' || step.type === 'goto' ? 'wfb-stop' : '' });
    if (step.type === 'if_else') {
      out += `<div class="wfb-branches">${[['yes', 'Sim'], ['no', 'Não']].map(([part, label]) =>
        `<div class="wfb-col"><span class="wfb-branch-label ${part}">${label}</span>${drawList(c, editor, step[part] || [], `${step.id}:${part}`, `${number}.${part === 'yes' ? 'S' : 'N'}`)}</div>`).join('')}</div>`;
    }
    if (step.type === 'router') {
      out += `<div class="wfb-branches">${(step.routes || []).map((route, r) =>
        `<div class="wfb-col"><span class="wfb-branch-label">${h(route.label)}</span>${drawList(c, editor, route.steps || [], `${step.id}:route.${route.id}`, `${number}.${r + 1}`)}</div>`).join('')}
        <div class="wfb-col"><span class="wfb-branch-label no">Caso contrário</span>${drawList(c, editor, step.otherwise || [], `${step.id}:otherwise`, `${number}.C`)}</div></div>`;
    }
    if (step.type === 'end' || step.type === 'goto') { out += `<span class="wfb-stop-mark">${step.type === 'end' ? 'Fim' : 'Salta'}</span>`; }
  });
  out += addButton(key, steps.length, full);
  return `<div class="wfb-list">${out}</div>`;
}

export function builderCanvas(c, editor, controls) {
  const { row } = editor;
  const triggers = row.triggers.map((trigger, index) => {
    const spec = triggerSpec(trigger.type);
    return card({ key: `t:${trigger.id}`, kind: 'Gatilho', label: spec?.label || trigger.type, detail: triggerSummary(trigger, c.s), glyph: spec?.icon || 'bolt',
      current: editor.node === `t:${trigger.id}`, footer: `Gatilho ${index + 1}`, trigger: true });
  }).join('');
  const addTrigger = `<button type="button" class="wfb-add-trigger" data-wf="trigger-add">${icon('plus', 18)}<span><b>Adicionar gatilho</b><small>${row.triggers.length ? 'Qualquer um dos gatilhos inscreve o contato' : 'O que faz o contato entrar no fluxo'}</small></span></button>`;
  const panX = editor.panX || 0, panY = editor.panY || 0, zoom = editor.zoom || 1;
  const steps = count(row);
  return `<div class="wf-workbench"><div class="wf-stage" style="background-position:calc(50% + ${panX}px) calc(50% + ${panY}px)">
    <div class="wf-canvas" tabindex="0" role="region" aria-label="Canvas do fluxo"><div class="wf-canvas-space"><div class="wf-track wfb-track" style="--wf-zoom:${zoom};transform:translate3d(${panX}px,${panY}px,0) scale(${zoom})">
      <div class="wfb-triggers">${triggers}${addTrigger}</div>
      ${drawList(c, editor, row.steps, 'root', '')}
      <span class="wfb-end">Fim do fluxo</span>
    </div></div></div>
    ${controls}
    <div class="wf-dock">${btn('node-add', 'Adicionar ação', { glyph: 'plus', cls: 'wf-dock-add', disabled: steps >= MAX_STEPS, data: `data-wf-list="root" data-wf-index="${row.steps.length}"` })}
      <span>${row.triggers.length} ${row.triggers.length === 1 ? 'gatilho' : 'gatilhos'} · ${steps} ${steps === 1 ? 'etapa' : 'etapas'}</span></div></div>
    ${editor.node ? `<aside class="wf-inspector" aria-label="Configuração do bloco">${inspector(c, editor)}</aside>` : ''}</div>`;
}

/* ───────── Inspector ───────── */

function fieldInput(c, editor, field, config, target) {
  const value = config[field.key] ?? '';
  const attrs = `data-wf-cfg="${h(field.key)}" data-wf-target="${h(target)}"`;
  const label = `<span>${h(field.label)}${field.required ? ' <span class="wfb-req" aria-hidden="true">*</span>' : ''}</span>`;
  if (field.kind === 'select') return `<label>${label}<select ${attrs}>${opts(field.options, value)}</select></label>`;
  if (field.kind === 'ref') {
    const entries = refSources[field.source]?.(c.s).filter(([id]) => !(field.source === 'workflows' && id === editor.key)) || [];
    return `<label>${label}<select ${attrs}>${opts([['', field.empty || 'Selecione…'], ...entries], value)}</select></label>`;
  }
  if (field.kind === 'step') {
    const entries = [];
    eachStep(editor.row.steps, step => { if (step.id !== target) entries.push([step.id, `${actionSpec(step.type)?.label || step.type}${stepSummary(step, c.s) ? ` · ${stepSummary(step, c.s)}` : ''}`]); });
    return `<label>${label}<select ${attrs}>${opts([['', 'Escolha a etapa'], ...entries], value)}</select></label>`;
  }
  if (field.kind === 'textarea') {
    const sample = c.s.contacts?.[0] || { name: 'Lucas Silva', email: 'lucas@exemplo.com', phone: '+55 11 98765-4321', company: 'Acme' };
    const preview = resolveTemplate(String(value), { ...buildWorkflowContext(c.s, editor.row, sample), workspace: { name: c.s.profile?.name || '' } });
    return `<label>${label}<textarea rows="4" maxlength="4000" ${attrs} data-wf-var-target>${h(value)}</textarea></label>
      <div class="wf-var-shelf"><div class="wf-var-shelf-head"><span class="wf-var-title">Variáveis</span><span class="wf-var-hint">Clique para inserir</span></div>
      <div class="wf-var-pills">${variables.map(([token, name]) => `<button type="button" class="wf-var-pill" data-wf-insert-var="${h(token)}"><span class="wf-var-token">${h(token)}</span><span class="wf-var-desc">${h(name)}</span></button>`).join('')}</div></div>
      <div class="wf-var-preview-box"><span class="wf-var-preview-label">Exemplo com ${h(sample.name)}:</span><div class="wf-var-preview" data-wf-preview="${h(field.key)}">${h(typeof preview === 'string' ? preview : JSON.stringify(preview)) || '(vazio)'}</div></div>`;
  }
  const type = field.kind === 'number' ? 'number' : field.kind === 'time' ? 'time' : field.kind === 'datetime' ? 'datetime-local' : 'text';
  const shown = field.kind === 'datetime' && value ? new Date(value).toLocaleString('sv-SE').slice(0, 16).replace(' ', 'T') : value;
  return `<label>${label}<input type="${type}" ${attrs} value="${h(shown)}" ${field.min !== undefined ? `min="${field.min}"` : ''} ${field.max !== undefined ? `max="${field.max}"` : ''} ${field.placeholder ? `placeholder="${h(field.placeholder)}"` : ''} ${type === 'text' ? 'data-wf-var-target maxlength="600"' : ''}></label>`;
}

function fields(c, editor, spec, config, target) {
  return (spec?.fields || []).filter(field => field.kind !== 'conditions' && (!field.when || Object.entries(field.when).every(([key, v]) => (config[key] ?? '') === v)))
    .map(field => fieldInput(c, editor, field, config, target)).join('');
}

function conditionEditor(c, list, match, scope) {
  const rows = list.map((cond, index) => {
    const subject = conditionSubjects.find(item => item[0] === cond.subject) || conditionSubjects[0];
    const at = `data-wf-cond="${h(scope)}" data-wf-cond-index="${index}"`;
    const valueKind = subject[3];
    const needsValue = !['empty', 'not_empty'].includes(cond.op) && valueKind !== 'none';
    let value = '';
    if (valueKind === 'field') value = `<select ${at} data-wf-cond-prop="key" aria-label="Campo">${opts([['', 'Campo…'], ...refSources.contactFields(c.s)], cond.key)}</select>`;
    if (valueKind === 'key') value = `<input ${at} data-wf-cond-prop="key" value="${h(cond.key)}" placeholder="Chave (ex.: body, total)" aria-label="Chave do dado">`;
    if (needsValue) {
      if (valueKind === 'stage') value += `<select ${at} data-wf-cond-prop="value" aria-label="Etapa">${opts([['', 'Etapa…'], ...refSources.stages(c.s)], cond.value)}</select>`;
      else if (valueKind === 'status') value += `<select ${at} data-wf-cond-prop="value" aria-label="Status">${opts(opportunityStatuses, cond.value || 'Won')}</select>`;
      else if (valueKind === 'form') value += `<select ${at} data-wf-cond-prop="value" aria-label="Formulário">${opts([['', 'Qualquer formulário'], ...c.s.forms.map(row => [row.id, row.name])], cond.value)}</select>`;
      else value += `<input ${at} data-wf-cond-prop="value" value="${h(cond.value)}" placeholder="Valor" aria-label="Valor">`;
    }
    return `<div class="wfb-cond">${index ? `<span class="wfb-cond-join">${match === 'any' ? 'ou' : 'e'}</span>` : ''}
      <select ${at} data-wf-cond-prop="subject" aria-label="Condição">${opts(conditionSubjects.map(([id, label]) => [id, label]), cond.subject)}</select>
      <select ${at} data-wf-cond-prop="op" aria-label="Operador">${opts(subject[2], cond.op)}</select>${value}
      ${btn('cond-delete', `<span class="sr-only">Remover condição</span>`, { cls: 'wf-text wfb-icon', glyph: 'close', data: `data-wf-scope="${h(scope)}" data-wf-index="${index}"` })}</div>`;
  }).join('');
  return `<div class="wfb-conditions"><label>Combinar<select data-wf-match="${h(scope)}">${opts([['all', 'Todas as condições (E)'], ['any', 'Qualquer condição (OU)']], match)}</select></label>
    ${rows || '<p class="wf-sub">Sem condições: o caminho sempre é seguido.</p>'}
    ${btn('cond-add', 'Adicionar condição', { glyph: 'plus', cls: 'wf-text', data: `data-wf-scope="${h(scope)}"` })}</div>`;
}

function inspector(c, editor) {
  const close = btn('node-close', '<span class="sr-only">Fechar configuração</span>', { cls: 'wf-canvas-tool', glyph: 'close' });
  if (editor.node.startsWith('t:')) {
    const trigger = editor.row.triggers.find(item => `t:${item.id}` === editor.node);
    if (!trigger) return '';
    const spec = triggerSpec(trigger.type);
    const hook = trigger.type === 'inbound_webhook' ? (trigger.config.secret && editor.key
      ? `<label>Endereço do webhook (POST, JSON)<input readonly value="${h(`${location.origin}/hooks/${c.workspace}/${editor.key}/${trigger.id}?key=${trigger.config.secret}`)}" data-wf-copy></label>
        <p class="wf-sub">Envie <code>email</code> ou <code>phone</code> para o contato ser encontrado ou criado. Os outros campos ficam em <code>{{trigger.campo}}</code>.</p>`
      : '<p class="wf-sub">Salve o fluxo para gerar o endereço do webhook.</p>') : '';
    return `<div class="wf-inspector-head"><h2>${h(spec?.label || 'Gatilho')}</h2>${close}</div>
      <p class="wf-action-desc">${spec?.scheduled ? 'Verificado a cada minuto; dispara uma vez por dia para cada contato que se encaixa.' : 'Filtros vazios aceitam qualquer valor.'}</p>
      ${fields(c, editor, spec, trigger.config, editor.node)}${hook}
      <div class="wf-node-tools">${btn('trigger-delete', 'Remover gatilho', { cls: 'wf-text', glyph: 'trash', id: trigger.id })}</div>`;
  }
  const step = findStep(editor.row, editor.node);
  if (!step) return '';
  const spec = actionSpec(step.type), place = parentOf(editor.row, step.id);
  let body = fields(c, editor, spec, step.config, step.id);
  if (step.type === 'if_else') body += conditionEditor(c, step.config.conditions || [], step.config.match, step.id);
  if (step.type === 'router') {
    body += (step.routes || []).map((route, index) => `<fieldset class="wfb-route"><legend>Caminho ${index + 1}</legend>
      <label>Nome<input value="${h(route.label)}" data-wf-route-label="${h(route.id)}" data-wf-target="${h(step.id)}" maxlength="60"></label>
      ${conditionEditor(c, route.conditions || [], route.match, `${step.id}:${route.id}`)}
      ${btn('route-delete', 'Remover caminho', { cls: 'wf-text', glyph: 'trash', id: route.id, disabled: step.routes.length < 2 })}</fieldset>`).join('')
      + btn('route-add', 'Adicionar caminho', { glyph: 'plus', disabled: (step.routes || []).length >= 6 })
      + '<p class="wf-sub">Os caminhos são testados em ordem; o primeiro que bater é seguido. Se nenhum bater, segue “Caso contrário”.</p>';
  }
  if (step.type === 'goal') body += '<p class="wf-sub">Se a meta acontecer enquanto o contato está em qualquer etapa anterior, ele pula direto para cá.</p>';
  if (['manual_call', 'manual_sms'].includes(step.type)) body += '<p class="wf-sub">O fluxo pausa até alguém concluir ou dispensar a ação na fila de ações manuais.</p>';
  return `<div class="wf-inspector-head"><h2>${h(spec?.label || 'Ação')}</h2>${close}</div>${body}
    <div class="wf-node-tools">${btn('node-up', 'Subir', { glyph: 'left', disabled: !place || place.index === 0 })}
      ${btn('node-down', 'Descer', { glyph: 'right', disabled: !place || place.index === place.list.length - 1 })}
      ${btn('node-duplicate', 'Duplicar', { glyph: 'copy' })}
      ${btn('node-delete', step.type === 'if_else' || step.type === 'router' ? 'Remover com os ramos' : 'Remover', { cls: 'wf-text', glyph: 'trash' })}</div>`;
}

/* ───────── Seletores ───────── */

export function pickerHtml(kind, data = '') {
  const groups = kind === 'trigger' ? triggerCatalog : actionCatalog;
  return `<div class="wf-picker" ${data}>
    <label class="wf-search">${icon('search', 17)}<span class="sr-only">Buscar</span><input type="search" placeholder="Buscar ${kind === 'trigger' ? 'gatilho' : 'ação'}…" data-wf-action-search autofocus></label>
    ${groups.map(group => `<div class="wf-picker-category"><h3 class="wf-picker-category-title">${h(group.group)}</h3><div class="wf-picker-grid">${group.items.map(item =>
      btn(kind === 'trigger' ? 'trigger-insert' : 'node-insert', `<span class="wf-node-icon">${icon(item.icon, 20)}</span><span><strong>${h(item.label)}</strong>${item.scheduled ? '<small>Agendado</small>' : item.branch ? '<small>Cria ramificações</small>' : ''}</span>`,
        { id: item.type, cls: 'wf-picker-option' })).join('')}</div></div>`).join('')}
    <p data-wf-no-actions hidden role="status">Nada encontrado.</p></div>`;
}

/* ───────── Edição ───────── */

const condList = (row, scope) => {
  const [id, routeId] = scope.split(':'), step = findStep(row, id);
  if (!step) return null;
  if (routeId) { const route = step.routes?.find(item => item.id === routeId); return route ? { holder: route, key: 'conditions', matchHolder: route } : null; }
  return { holder: step.config, key: 'conditions', matchHolder: step.config };
};

// Applies a click on a builder control. Returns { focus, reveal } when it changed the draft, or null when the op is not a builder op.
export function builderClick(op, target, editor, { pick }) {
  const row = editor.row, id = target.dataset.wfId;
  switch (op) {
    case 'trigger-add': pick('trigger', ''); return { picked: true };
    case 'node-add': pick('action', `data-wf-list="${h(target.dataset.wfList)}" data-wf-index="${h(target.dataset.wfIndex)}"`); return { picked: true };
    case 'trigger-insert': {
      if (row.triggers.length >= 10) throw Error('Um fluxo aceita até 10 gatilhos.');
      const trigger = { id: stepId(), type: id, config: defaults(triggerSpec(id)) };
      row.triggers.push(trigger);
      editor.node = `t:${trigger.id}`;
      return { changed: true, closePicker: true, focus: '.wf-inspector select, .wf-inspector input' };
    }
    case 'node-insert': {
      if (count(row) >= MAX_STEPS) throw Error(`Um fluxo aceita até ${MAX_STEPS} etapas.`);
      const picker = target.closest('.wf-picker'), list = listByKey(row, picker.dataset.wfList);
      if (!list) return { closePicker: true };
      const step = newStep(id);
      list.splice(Math.min(Number(picker.dataset.wfIndex) || 0, list.length), 0, step);
      editor.node = step.id;
      return { changed: true, closePicker: true, focus: '.wf-inspector textarea, .wf-inspector input, .wf-inspector select', reveal: true };
    }
    case 'trigger-delete':
      row.triggers = row.triggers.filter(item => item.id !== id);
      editor.node = null;
      return { changed: true };
    case 'node-delete': case 'node-up': case 'node-down': case 'node-duplicate': {
      const place = parentOf(row, editor.node);
      if (!place) return null;
      if (op === 'node-delete') { place.list.splice(place.index, 1); editor.node = null; }
      else if (op === 'node-duplicate') {
        if (count(row) >= MAX_STEPS) throw Error(`Um fluxo aceita até ${MAX_STEPS} etapas.`);
        const copy = structuredClone(place.list[place.index]);
        const fresh = node => { node.id = stepId(); (node.routes || []).forEach(route => { route.id = stepId(); route.steps?.forEach(fresh); }); ['yes', 'no', 'otherwise'].forEach(part => node[part]?.forEach(fresh)); };
        fresh(copy);
        let n = 0; eachStep([copy], () => n++);
        if (count(row) + n > MAX_STEPS) throw Error(`Um fluxo aceita até ${MAX_STEPS} etapas.`);
        place.list.splice(place.index + 1, 0, copy);
        editor.node = copy.id;
      } else {
        const to = place.index + (op === 'node-up' ? -1 : 1);
        if (to < 0 || to >= place.list.length) return null;
        [place.list[place.index], place.list[to]] = [place.list[to], place.list[place.index]];
      }
      return { changed: true, focus: '.wf-inspector [data-wf]', reveal: true };
    }
    case 'route-add': {
      const step = findStep(row, editor.node);
      if (!step || (step.routes || []).length >= 6) return null;
      step.routes.push({ id: stepId(), label: `Caminho ${step.routes.length + 1}`, match: 'all', conditions: [condition()], steps: [] });
      return { changed: true };
    }
    case 'route-delete': {
      const step = findStep(row, editor.node);
      if (!step || step.routes.length < 2) return null;
      step.routes = step.routes.filter(route => route.id !== id);
      return { changed: true };
    }
    case 'cond-add': case 'cond-delete': {
      const ref = condList(row, target.dataset.wfScope);
      if (!ref) return null;
      ref.holder.conditions ??= [];
      if (op === 'cond-add') { if (ref.holder.conditions.length >= 10) throw Error('Use até 10 condições.'); ref.holder.conditions.push(condition()); }
      else ref.holder.conditions.splice(Number(target.dataset.wfIndex), 1);
      return { changed: true };
    }
    default: return null;
  }
}

// Applies typing/selection in the inspector. Returns 'render' when the inspector must be redrawn, 'live' when only text changed, or null.
export function builderInput(input, editor, c, finalChange) {
  const row = editor.row;
  if (input.dataset.wfCfg) {
    const target = input.dataset.wfTarget;
    const holder = target.startsWith('t:') ? row.triggers.find(item => `t:${item.id}` === target)?.config : findStep(row, target)?.config;
    if (!holder) return null;
    let value = input.value;
    if (input.type === 'number') value = value === '' ? '' : Number(value);
    if (input.type === 'datetime-local') value = value ? new Date(value).toISOString() : '';
    holder[input.dataset.wfCfg] = value;
    updateCard(c, editor, target);
    if (input.tagName === 'TEXTAREA') {
      const preview = document.querySelector(`[data-wf-preview="${CSS.escape(input.dataset.wfCfg)}"]`);
      if (preview) {
        const sample = c.s.contacts?.[0] || { name: 'Lucas Silva', email: 'lucas@exemplo.com' };
        const out = resolveTemplate(input.value, { ...buildWorkflowContext(c.s, row, sample), workspace: { name: c.s.profile?.name || '' } });
        preview.textContent = (typeof out === 'string' ? out : JSON.stringify(out)) || '(vazio)';
      }
    }
    return input.tagName === 'SELECT' && finalChange ? 'render' : 'live';
  }
  if (input.dataset.wfRouteLabel) {
    const step = findStep(row, input.dataset.wfTarget), route = step?.routes?.find(item => item.id === input.dataset.wfRouteLabel);
    if (!route) return null;
    route.label = input.value.slice(0, 60);
    return finalChange ? 'render' : 'live';
  }
  if (input.dataset.wfMatch) {
    const ref = condList(row, input.dataset.wfMatch);
    if (!ref) return null;
    ref.matchHolder.match = input.value === 'any' ? 'any' : 'all';
    return 'render';
  }
  if (input.dataset.wfCond) {
    const ref = condList(row, input.dataset.wfCond), cond = ref?.holder.conditions?.[Number(input.dataset.wfCondIndex)];
    if (!cond) return null;
    const prop = input.dataset.wfCondProp;
    cond[prop] = input.value;
    if (prop === 'subject') { const subject = conditionSubjects.find(item => item[0] === input.value); Object.assign(cond, { op: subject[2][0][0], key: '', value: '' }); }
    updateCard(c, editor, input.dataset.wfCond.split(':')[0]);
    return input.tagName === 'SELECT' && finalChange ? 'render' : 'live';
  }
  return null;
}

function updateCard(c, editor, target) {
  const node = document.querySelector(`.wfb-node[data-wf-id="${CSS.escape(target)}"]`);
  if (!node) return;
  const detail = target.startsWith('t:') ? triggerSummary(editor.row.triggers.find(item => `t:${item.id}` === target) || {}, c.s) : stepSummary(findStep(editor.row, target) || {}, c.s);
  const small = node.querySelector('[data-wf-detail]');
  small.textContent = detail || '';
  small.hidden = !detail;
}

export const nodeExists = (editor, key) => !key || (key.startsWith('t:') ? editor.row.triggers.some(item => `t:${item.id}` === key) : Boolean(findStep(editor.row, key)));

export function workflowTriggerText(row, s) {
  const tree = upgradeWorkflow(row);
  if (!tree.triggers.length) return 'Sem gatilho (entrada manual ou por outro fluxo)';
  const first = tree.triggers[0], label = triggerSpec(first.type)?.label || first.type, detail = triggerSummary(first, s);
  return `${label}${detail ? ` · ${detail}` : ''}${tree.triggers.length > 1 ? ` + ${tree.triggers.length - 1}` : ''}`;
}
