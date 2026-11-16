import { activeDashboard, dashboardRange } from './dashboard.js';
import { dashboardPeriods, dateFields, effectiveWidget, newWidget, reportRows, validDay, widgets } from './dashboard-data.js';
import { h } from './screens.js';

export function dashboardPreferences(workspace) {
  const key = `go.dashboard.${workspace}`;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { /* Use defaults. */ }
  return { key, id:saved.id || '', range:{ period:'30', ...saved.range }, view:{}, showQuick:false, quickTag:'', draft:null, undo:[], redo:[] };
}

const select = (name, label, choices, value) => `<label>${label}<select name="${name}">${choices.map(([key,text]) =>
  `<option value="${h(key)}" ${String(value) === String(key) ? 'selected' : ''}>${h(text)}</option>`).join('')}</select></label>`;
const text = (name,label,value = '') => `<label>${label}<input name="${name}" value="${h(value)}" required maxlength="100"></label>`;
const current = context => context.dash.draft || activeDashboard(context);

export function installDashboardControls({ c, dialog, close, render, load, mutate, flash, go }) {
  const remember = () => localStorage.setItem(c.dash.key,JSON.stringify({ id:c.dash.id, range:c.dash.range }));

  function startEditing() {
    const saved = activeDashboard(c);
    c.dash.draft = { id:saved.id,name:saved.name,version:saved.version,widgets:structuredClone(saved.widgets) };
    c.dash.undo = [];
    c.dash.redo = [];
  }

  function edit(change) {
    c.dash.undo = [...c.dash.undo,structuredClone(c.dash.draft)].slice(-25);
    change(c.dash.draft);
    c.dash.redo = [];
    render();
  }

  function reorder(id, target) {
    if (!c.dash.draft) return;
    const records = c.dash.draft.widgets;
    const index = records.findIndex(item => item.id === id);
    if (index < 0 || target < 0 || target >= records.length || index === target) return;
    edit(board => board.widgets.splice(target,0,...board.widgets.splice(index,1)));
  }

  function dialogForm(title, body, action, options = {}) {
    dialog(title,body,{ ...options,form:`dashboard-${action}` });
    const form = document.querySelector('#dialog form');
    form.dataset.boardForm = action;
    delete form.dataset.form;
  }

  function configureWidget(id) {
    const entry = current(c).widgets.find(item => item.id === id);
    if (!entry) return;
    const config = effectiveWidget(c.s,entry,c.dash.draft ? {} : c.dash.view[id]);
    const definition = widgets[entry.kind];
    const titles = !c.dash.draft ? '' : text('title','Widget title',entry.title) + select('width','Width',
      [[3,'Quarter'],[4,'Third'],[5,'Five columns'],[6,'Half'],[8,'Two thirds'],[12,'Full width']],entry.width);
    const pipeline = definition.pipeline ? select('dateField','Date property',Object.entries(dateFields),config.dateField) +
      select('pipeline','Pipeline',[...(definition.needsPipeline ? [] : [['','All pipelines']]),...c.s.pipelines.map(item => [item.id,item.name])],config.pipeline) : '';
    const notes = config.kind === 'note' ? `<label>Note<textarea name="note" maxlength="2000" required>${h(config.note)}</textarea></label>` : '';
    dialogForm(`Configure ${entry.title}`,titles+pipeline+notes,'widget',{ id });
  }

  async function saveBoard(board) {
    await mutate({ type:'dashboard-save', id:board.id, data:board });
    c.dash.draft = null;
    c.dash.undo = [];
    c.dash.redo = [];
    c.dash.view = {};
    close(); render(); flash('Dashboard saved.');
  }

  const act = {
    switch() {
      dialog('Dashboards',c.s.dashboards.map(board => `<button class="choice" data-dash-act="choose" data-widget="${board.id}"><strong>${h(board.name)}</strong>${board.id === activeDashboard(c).id ? '<span>Current dashboard</span>' : ''}</button>`).join(''));
    },
    choose(id) { c.dash.id=id; c.dash.view={}; c.dash.quickTag=''; remember(); close(); render(); },
    new() { dialogForm('Create dashboard',text('name','Dashboard name') + select('copyFrom','Start with',
      [['','Blank dashboard'],...c.s.dashboards.map(board => [board.id,board.name])],''),'new'); },
    async refresh() { await load(); render(); flash('Dashboard refreshed.'); },
    quick() { c.dash.showQuick=!c.dash.showQuick; render(); },
    dates() {
      const { period,start,end,compare } = c.dash.range;
      dialogForm('Date range',select('period','Period',Object.entries(dashboardPeriods),period) +
        `<fieldset class="dash-date-fields" ${period === 'custom' ? '' : 'hidden disabled'}><div class="field-grid">
          <label>Start date<input type="date" name="start" value="${validDay(start) ? start : ''}" required></label>
          <label>End date<input type="date" name="end" value="${validDay(end) ? end : ''}" required></label></div></fieldset>
        <label class="check"><input type="checkbox" name="compare" ${compare ? 'checked' : ''}> Compare with previous period</label>`,'dates');
    },
    edit() { startEditing(); render(); },
    cancel() { c.dash.draft=null; render(); },
    rename() { dialogForm('Rename dashboard',text('name','Dashboard name',current(c).name),'rename'); },
    save() { return saveBoard(c.dash.draft); },
    undo() {
      const previous = c.dash.undo.pop();
      if (previous) { c.dash.redo.push(c.dash.draft); c.dash.draft=previous; render(); }
    },
    redo() {
      const next = c.dash.redo.pop();
      if (next) { c.dash.undo.push(c.dash.draft); c.dash.draft=next; render(); }
    },
    up(id) { reorder(id,current(c).widgets.findIndex(item => item.id === id)-1); },
    down(id) { reorder(id,current(c).widgets.findIndex(item => item.id === id)+1); },
    remove(id) { edit(board => board.widgets=board.widgets.filter(item => item.id !== id)); },
    'widget-settings':configureWidget,
    'widget-add'() {
      const options = Object.entries(widgets).filter(([kind]) => kind !== 'note').map(([kind,definition]) => [kind,definition.title]);
      dialogForm('Add widget',select('kind','Widget',options,'status'),'add');
    },
    note() { dialogForm('Add sticky note',text('title','Title','Sticky note') + '<label>Note<textarea name="note" maxlength="2000" required></textarea></label>','note'); },
    more() {
      dialog('Dashboard actions','<div class="quick-list"><button class="secondary" data-dash-act="duplicate">Duplicate</button><button class="secondary" data-dash-act="history">Version history</button></div>');
    },
    duplicate() { dialogForm('Duplicate dashboard',text('name','Dashboard name',`${activeDashboard(c).name} copy`),'duplicate'); },
    history() {
      const board = activeDashboard(c);
      const entries = board.history.map(entry => `<button type="button" class="choice" data-dash-act="restore" data-widget="${entry.version}"><strong>Version ${entry.version} · ${h(entry.name)}</strong><span>${h(new Date(entry.when).toLocaleString())} · ${entry.widgets.length} widgets</span></button>`).join('');
      dialog('Version history',entries || '<p>No saved versions yet.</p>',{ description:`Current version ${board.version}` });
    },
    async restore(version) {
      const board = activeDashboard(c);
      await mutate({ type:'dashboard-restore', id:board.id, data:{ version:board.version, restoreVersion:Number(version) } });
      c.dash.view={}; close(); render(); flash('Dashboard version restored.');
    },
    summary() {
      const rows = reportRows(c.s,activeDashboard(c),c.dash.view,dashboardRange(c),c.dash.quickTag);
      dialog('Dashboard summary', reportGrid(rows),{ description:'Metrics for the selected period and widget filters.' });
    },
    report() { dialogForm('Send as report',text('name','Report name',`${activeDashboard(c).name} report`),'report',{ description:'Save a copy in Reporting.' }); }
  };

  document.addEventListener('click', async event => {
    const button = event.target.closest('button[data-dash-act]');
    if (!button || !c.s) return;
    const action = act[button.dataset.dashAct];
    if (!action || button.disabled) return;
    button.disabled = true;
    try { await action(button.dataset.widget); }
    catch (error) { flash(error.message,true); }
    finally { if (button.isConnected) button.disabled=false; }
  });

  document.addEventListener('change', event => {
    const field = event.target;
    const id = field.dataset.dashWidget;
    if (id) {
      const key = field.dataset.dashField;
      if (c.dash.draft && key === 'pipeline') edit(board => { board.widgets.find(item => item.id === id).pipeline=field.value; });
      else {
        (c.dash.view[id] ||= {})[key] = field.value;
        render();
      }
      document.querySelector(`[data-dash-widget="${id}"][data-dash-field="${key}"]`)?.focus();
    }
    if (field.hasAttribute('data-dash-quick')) {
      c.dash.quickTag=field.value; render(); document.querySelector('[data-dash-quick]')?.focus();
    }
    if (field.name === 'period' && field.form?.dataset.boardForm === 'dates') {
      const target = field.form.querySelector('fieldset');
      target.disabled = target.hidden = field.value !== 'custom';
    }
  });

  const submit = {
    async new(data) { act.choose(await mutate({type:'dashboard-create',data})); },
    async duplicate(data) { act.choose(await mutate({type:'dashboard-create',data:{ ...data,copyFrom:activeDashboard(c).id }})); },
    dates(data) {
      const { period,start,end } = data;
      if (period === 'custom' && (!validDay(start) || !validDay(end) || start > end)) throw new Error('Choose a valid start and end date.');
      c.dash.range={ period,start,end,compare:Boolean(data.compare) }; remember(); close(); render();
    },
    rename(data) { close(); edit(board => { board.name=data.name.trim() || board.name; }); },
    add(data) { close(); edit(board => { board.widgets.push(newWidget(data.kind,crypto.randomUUID())); }); },
    async note(data) {
      const board = activeDashboard(c);
      const widget = { ...newWidget('note',crypto.randomUUID()), ...data };
      await saveBoard({ ...board,widgets:[...board.widgets,widget] });
    },
    widget(data,id) {
      close();
      if (c.dash.draft) edit(board => Object.assign(board.widgets.find(item => item.id === id),data,{ width:Number(data.width) }));
      else { (c.dash.view[id] ||= {}); Object.assign(c.dash.view[id],data); render(); }
    },
    async report(data) {
      await mutate({ type:'dashboard-report',id:activeDashboard(c).id,data:{ ...data,...c.dash.range,view:c.dash.view,tag:c.dash.quickTag } });
      close(); go('reporting','snapshots'); flash('Report saved.');
    }
  };

  document.addEventListener('submit', async event => {
    const form = event.target;
    if (!form.dataset.boardForm) return;
    event.preventDefault();
    if (form.dataset.pending) return;
    form.dataset.pending='true';
    const button = form.querySelector('button.primary');
    button.disabled=true;
    try { await submit[form.dataset.boardForm](Object.fromEntries(new FormData(form)),form.dataset.id); }
    catch (error) { form.querySelector('.form-status').textContent=error.message; }
    finally { delete form.dataset.pending; button.disabled=false; }
  });

  document.addEventListener('dragstart',event => {
    const handle = event.target.closest('[data-dash-drag]');
    if (handle) event.dataTransfer.setData('application/go-widget',handle.dataset.dashDrag);
  });
  document.addEventListener('dragover',event => {
    if (c.dash.draft && event.target.closest('[data-dashboard-card]') && event.dataTransfer.types.includes('application/go-widget')) event.preventDefault();
  });
  document.addEventListener('drop',event => {
    const card = event.target.closest('[data-dashboard-card]');
    const id = event.dataTransfer.getData('application/go-widget');
    if (!c.dash.draft || !id || !card) return;
    event.preventDefault();
    reorder(id,c.dash.draft.widgets.findIndex(item => item.id === card.dataset.dashboardCard));
  });
}

export function reportGrid(rows) {
  if (!rows.length) return '<p>No metrics for this dashboard.</p>';
  return `<div class="dash-table"><table><thead><tr><th>Widget</th><th>Measure</th><th>Value</th></tr></thead><tbody>${rows.map(row =>
    `<tr>${row.map(value => `<td>${h(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
