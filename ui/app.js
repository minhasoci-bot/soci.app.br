import {icon as i, logo, brandName, bootScreen} from './icons.js';
import {nav,h,avatar,screens,publicView,money} from './screens.js';
import { conversationSections, manualQueue, slaRecords } from './conversations.js';
import { inboxChange, inboxClick, inboxSubmit } from './inbox.js';
import { dashboardPreferences, installDashboardControls, reportGrid } from './dashboard-controls.js';
import { drawDashboardGauges } from './dashboard.js';
import { opportunityStatuses } from './dashboard-data.js';
import { tr } from './i18n.js';
import { cardFields, cardLayouts, opportunityCsv, opportunityCsvColumns, opportunityPreferences, opportunityResults, opportunitySorts } from './opportunity-data.js';
import { parseCsv } from './social-data.js';
import { afterStudioRender, exportStudioProject, installStudio, studioBlock } from './studio.js';
import { studioTemplates } from './studio-data.js';
import { startAgency } from './agency.js';
import { sidebar } from './sidebar.js';
import { topbar } from './topbar.js';
import { crmEntityNames, crmEvents, crmForm, crmTabs, customInputs } from './crm.js';
import { socialEvents } from './social.js';
import { mountAgentScreen } from './agents.js';
import { afterSitesRender, installSites } from './sites.js';
import { afterFormsRender, installForms } from './forms.js';
import { unmountDesignStage } from './design-workspace.js';
import { installBuilder, startBuild } from './studio-builder.js';
import { installAutomation } from './automation.js';
import { installClientPortal } from './client-portal.js';
import { applyBrandColor, setThemeAccount } from './graao.js';

const app=document.querySelector('#app'), overlay=document.querySelector('#overlay'), toast=document.querySelector('#toast');
const isAppPath=['/','/index.html','/app','/app/','/painel','/painel/'].includes(location.pathname);
const viewPath=!isAppPath ? location.pathname : '';
const c={workspace:new URLSearchParams(location.search).get('workspace')||localStorage.getItem('go.workspace')||'demo',view:'dashboard',tab:'',query:'',tag:'',thread:'',chat:[],month:new Date(),choice:'',askOpen:false,navOpen:false,workspaces:[],conversationFilters:{},wa:null,waPairOpen:false};
let waSubPoll=null;
function stopSubWaPoll(){ if(waSubPoll){ clearInterval(waSubPoll); waSubPoll=null; } }
function startSubWaPoll(){
  stopSubWaPoll();
  const ws=c.workspace;
  waSubPoll=setInterval(async()=>{
    if(c.mode==='agency'||c.view!=='settings'||c.tab!=='whatsapp'||c.workspace!==ws){ stopSubWaPoll(); return; }
    try{
      const live=await api(url('/api/whatsapp/workspace/status'));
      if(c.workspace!==ws||c.view!=='settings'||c.tab!=='whatsapp') return;
      const was=c.wa?.status;
      c.wa=live;
      if(live.status==='connected'){
        stopSubWaPoll();
        if(was!=='connected') flash('WhatsApp conectado com sucesso!');
      }
      render();
    }catch{}
  },3000);
}
async function refreshSubWa(){
  const ws=c.workspace;
  try{
    const live=await api(url('/api/whatsapp/workspace/status'));
    if(c.workspace!==ws) return;
    c.wa=live;
    if(live.status==='connecting'&&c.view==='settings'&&c.tab==='whatsapp') startSubWaPoll();
    else stopSubWaPoll();
  }catch(e){
    if(c.workspace===ws) c.wa={error:e.message};
  }
  if(c.mode!=='agency'&&c.view==='settings'&&c.tab==='whatsapp') render();
}
c.dash = dashboardPreferences(c.workspace);
c.pipeline = '';
c.studio = { brief:'',template:'landing',project:'' };
let toastTimer, modalReturn, busy=false, renderedView='', editor, mountClientPortal;
const G=s=>document.querySelector(s);
const url=path=>`${path}?workspace=${encodeURIComponent(c.workspace)}`;
function flash(msg,isError=false){ clearTimeout(toastTimer);toast.className=isError?'issue':'success';toast.textContent=msg;toastTimer=setTimeout(()=>{toast.className='';toast.textContent='';},4600); }
const actingUser = () => { try { return localStorage.getItem('go.user') || ''; } catch { return ''; } };
async function api(path,body){
  const headers = c.access?.session ? {} : { 'X-Go-User': actingUser() };
  const response = await fetch(path,body===undefined?{headers}:{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data = await response.json();
  if (response.status === 401 && isAppPath && !path.startsWith('/api/auth/')) {
    const next = (location.pathname === '/' || location.pathname === '/index.html' ? '/app' : location.pathname) + location.search + location.hash;
    location.replace('/login?' + new URLSearchParams({ next }));
  }
  if (!response.ok) throw Object.assign(Error(data.error||'The request failed.'),{status:response.status});
  if (isAppPath && data.access) setThemeAccount(data.access.session?.id);
  return data;
}
async function load(){
  const workspace = c.workspace;
  const data = await api(url('/api/state'));
  if (workspace === c.workspace) Object.assign(c,{s:data.state,m:data.metrics,workspaces:data.workspaces,features:data.features,agency:data.agency,access:data.access,audit:data.audit});
}
const allowedView = id => id==='dashboard' || !c.access?.modules || c.access.modules.includes(id);
let agencyUI, openingWorkspace;
const sessionDismissed=new Set();
const inboxContext=()=>({c,mutate,render,flash,dialog,close});
async function mutate(command){ const workspace=c.workspace;const d=await api(url('/api/action'),command);if(workspace===c.workspace){c.s=d.state;c.m=d.metrics;}return d.id; }
const go=(view,tab='')=>{const next=`#${view}${tab?`/${tab}`:''}`; if(location.hash===next) route(); else location.hash=next;};
const validTabs={contacts:crmTabs.contacts.map(t=>t[0]),conversations:['all','unread','recent','starred',...conversationSections],calendars:['calendar','appointments'],opportunities:crmTabs.opportunities.map(t=>t[0]),automation:['workflows','folder','smart','review','deleted','overview','builder','settings','enrollments','logs'],payments:crmTabs.payments.map(t=>t[0]),sites:['funnels','websites','forms','submissions','funnel','form','form-analytics'],marketing:['social','email'],memberships:['portal','portal-members','portal-settings','courses'],reporting:['overview','snapshots'],studio:['recent','projects','starred','templates','project','build'],'ai-agents':['agent','edit'],settings:crmTabs.settings.map(t=>t[0])};
function leaveAgentEditor() {
  if (editor) void editor.flush();
  editor = null;
}
async function openInitialWorkspace() {
  const workspace = c.workspace;
  try { await load(); }
  catch (e) {
    if (workspace !== c.workspace) return;
    if (![403,404].includes(e.status)) throw e;
    const {workspaces:open,agency} = await api('/api/workspaces');
    if (workspace !== c.workspace) return;
    if (!open.length && agency) {
      if (c.mode !== 'agency') location.replace('#agency/dashboard');
      return;
    }
    if (!open.length) throw Error('Sua conta ainda não tem acesso a uma subconta.');
    c.workspace = open[0].id;
    c.dash = dashboardPreferences(c.workspace);
    localStorage.setItem('go.workspace',c.workspace);
    await load();
  }
}
function route(){ const [key,tab,project]=location.hash.slice(1).split('/');
  if(key==='agency'){
    if (c.access && !c.access.agency) { location.replace('#dashboard'); return; }
    stopSubWaPoll();
    c.mode='agency'; leaveAgentEditor(); close(); agencyUI.show(tab,project); return;
  }
  if(c.mode==='agency'){ agencyUI.leave(); c.mode=''; renderedView=''; }
  if (!c.s) {
    app.innerHTML = bootScreen('Abrindo o soci…');
    openingWorkspace ??= openInitialWorkspace()
      .then(() => {
        if (c.s && c.mode !== 'agency') {
          if ((!location.hash || location.hash === '#' || location.hash === '') && c.access?.agency) {
            location.replace('#agency/dashboard');
            return;
          }
          route();
        }
      })
      .catch(e => {
        if (c.mode !== 'agency') app.innerHTML = `<div class="boot boot-error" role="alert"><h1>Não foi possível abrir o workspace</h1><p>${h(e.message)}</p><a class="primary" href="${h(location.pathname + location.search + location.hash)}">Tentar de novo</a></div>`;
      })
      .finally(() => { openingWorkspace = null; });
    return;
  }
  if ((!location.hash || location.hash === '#' || location.hash === '') && c.access?.agency) {
    location.replace('#agency/dashboard');
    return;
  }
  if (key === 'ask-ai' || key === 'marketplace') { location.hash = '#dashboard'; return; }
  const view=key==='link'?'link':Object.hasOwn(screens,key)&&allowedView(key)?key:'dashboard', nextTab=view==='link'?tab||'':validTabs[view]?.includes(tab)?tab:'';
  const automationId = view === 'automation' ? project || '' : '';
  const opportunityViews = ['', 'pipeline', 'list'];
  const switchingOpportunityView = c.view === 'opportunities' && view === c.view &&
    opportunityViews.includes(c.tab) && opportunityViews.includes(nextTab);
  if((c.view!==view||c.tab!==nextTab) && !switchingOpportunityView){c.query='';c.tag='';}
  if(view==='automation' && (c.view!==view || c.tab!==nextTab || c.automationId!==automationId)) c.workflowList=null;
  c.view=view;c.tab=nextTab;c.automationId=automationId;c.studio.project=project||'';
  c.agentId=view==='ai-agents'&&['agent','edit'].includes(nextTab)?project:'';
  if(view==='settings'&&nextTab==='whatsapp'){ render(); void refreshSubWa(); return; }
  stopSubWaPoll();
  render(); }
const iconBtn=(name,label,attributes='',cls='icon-btn')=>`<button class="${cls}" aria-label="${label}" title="${label}" ${attributes}>${i(name,17)}</button>`;
const navItem=([id,pt,ico])=>({href:`#${id}`,label:pt,icon:ico,current:c.view===id});
function appSidebar(brand){
  const items=nav.slice(0,-1).map((n,k)=>[n,k]).filter(([n])=>allowedView(n[0]));
  const links=(c.agency?.menuLinks||[]).map(l=>l.openIn==='Inside the app'?{href:`#link/${l.id}`,label:l.title,icon:l.icon,current:c.view==='link'&&c.tab===l.id}:{href:l.url,label:l.title,icon:l.icon,external:true});
  return sidebar({label:'Navegação',home:c.access?.agency?'#agency/dashboard':'#dashboard',brand,mark:c.agency?.logo?`<img class="ag-logo" src="${h(c.agency.logo)}" alt="">`:logo,
    account:{name:c.s.profile.name,caption:'Subconta · trocar',attr:'data-act="workspaces"',tip:'Trocar de workspace'},
    toggle:'data-act="nav"',open:c.navOpen,
    groups:[{title:'Principal',items:items.filter(([,k])=>k<6).map(([n])=>navItem(n))},{title:'Crescimento',items:items.filter(([,k])=>k>=6).map(([n])=>navItem(n))},{title:'Atalhos',items:links}],
    footer:[...(c.access?.agency?[{href:'#agency/dashboard',label:'Visão da agência',icon:'users'}]:[]),...(allowedView('settings')?[navItem(nav.at(-1))]:[])]});
}
function appTopbar(){
  const session = c.access?.session;
  const active=nav.find(x=>x[0]===c.view), page=c.view==='link'?c.agency?.menuLinks.find(l=>l.id===c.tab)?.title||'Link':active?.[1];
  const profileLabel = session?.name || 'Perfil do workspace';
  const profileText = session?.name?.slice(0, 2).toUpperCase() || 'gr';
  return topbar({crumbs:[{label:c.s.profile.name,href:'#dashboard'},{label:page}],search:'data-act="search"',
    tools:[{icon:'bell',label:'Notificações',attr:'data-act="notifications"'}],
    profile:{text:profileText,picture:session?.picture||'',label:profileLabel,attr:session?'data-act="account"':'data-go="settings"'}});
}
function render(){
  if(viewPath||c.mode==='agency')return;
  unmountDesignStage(G('.dw-stage'));
  const viewKey = `${c.workspace}:${c.view}:${c.tab}:${c.studio.project}`;
  const previousScroll = renderedView === viewKey ? G('#screen')?.scrollTop || 0 : 0;
  const kanbanScroll = renderedView === viewKey ? G('.kanban')?.scrollLeft || 0 : 0;
  renderedView = viewKey;
  const agencyName=c.agency?.name&&!['My Agency','Minha agência'].includes(c.agency.name)?c.agency.name:'';
  const brand=agencyName||brandName(c.agency?.brand), customLink=c.agency?.menuLinks.find(l=>l.id===c.tab);
  const active=nav.find(x=>x[0]===c.view);
  document.title=brand;
  applyBrandColor(c.agency?.primary, c.agency?.secondary);
  const notices=(c.agency?.announcements||[]).filter(a=>!sessionDismissed.has(a.id)).map(a=>`<div class="ag-banner ${a.tone==='Warning'?'warn':a.tone==='Success'?'ok':''}" role="status"><b>${h(a.title)}</b><span>${h(a.body)}</span><button class="icon-btn" data-dismiss-notice="${h(a.id)}" aria-label="Dispensar aviso">${i('close',15)}</button></div>`).join('');
  const screenHtml=c.view==='link'?(customLink?`<div class="ag-frame"><iframe src="${h(customLink.url)}" title="${h(customLink.title)}" referrerpolicy="no-referrer" sandbox="allow-scripts allow-forms allow-same-origin allow-popups"></iframe><p class="dim">Se a página ficar em branco, o site não permite incorporação. <a class="text-link" href="${h(customLink.url)}" target="_blank" rel="noopener">Abrir em nova aba</a></p></div>`:'<div class="page"><p>Este link não está mais disponível.</p></div>'):screens[c.view](c);
  app.innerHTML=`<div class="shell ${c.navOpen?'wide':''}">${appSidebar(brand)}<div class="workspace">${appTopbar()}${c.access?.name&&!c.access.session&&actingUser()?`<div class="ag-banner acting" role="status"><b>Agindo como ${h(c.access.name)}</b><span>Módulos e subcontas seguem as permissões deste usuário.</span><button class="secondary" data-act="stop-acting">Parar</button></div>`:''}${notices}<main id="screen" class="screen">${screenHtml}</main></div></div>`;
  if(c.view==='conversations'&&c.thread) {const area=G('.thread-messages');if(area)area.scrollTop=area.scrollHeight;}
  if(c.view==='dashboard') { G('#screen').scrollTop=previousScroll; }
  if(c.view==='dashboard' || c.view==='reporting') { drawDashboardGauges(app); }
  if(c.view==='opportunities') {
    G('#screen').scrollTop = previousScroll;
    const board = G('.kanban');
    if(board) board.scrollLeft = kanbanScroll;
  }
  if(c.view==='studio') afterStudioRender();
  if(c.view==='sites') { afterSitesRender(); afterFormsRender(); }
  if(c.view==='memberships') mountClientPortal?.();
  const agentScreen = G('[data-agent-screen]');
  if (agentScreen?.dataset.agentId && editor?.id === agentScreen.dataset.agentId && editor.workspace === c.workspace) {
    agentScreen.replaceWith(editor.root);
    G('#screen').scrollTop = previousScroll;
  } else {
    leaveAgentEditor();
    if (agentScreen) {
      const workspace = c.workspace;
      editor = mountAgentScreen({
        root: agentScreen, workspace, model: c.features?.agentModel,
        startAgent: c.s.agents.find(agent => agent.id === c.agentId),
        agents: () => c.s.agents,
        request: (operation, data) => api(`/api/agents/${operation}?workspace=${encodeURIComponent(workspace)}`, data),
        updateAgent(id, agent, rerender = true) {
          if (c.workspace !== workspace) return;
          const index = c.s.agents.findIndex(item => item.id === id);
          if (index !== -1) c.s.agents.splice(index, 1, ...(agent ? [agent] : []));
          else if (agent) c.s.agents.push(agent);
          if (!agent) c.s.agentRuns = (c.s.agentRuns || []).filter(run => run.agent !== id);
          if (rerender && c.mode !== 'agency' && c.view === 'ai-agents' && c.tab !== 'edit') render();
        },
        addRun(run) {
          if (c.workspace !== workspace) return;
          c.s.agentRuns = [run, ...(c.s.agentRuns || [])].slice(0, 100);
          if (c.mode !== 'agency' && c.view === 'ai-agents' && c.tab !== 'edit') render();
        },
        refresh() { if (c.workspace === workspace && c.mode !== 'agency' && c.view === 'ai-agents' && c.tab !== 'edit') render(); }
      });
    }
  }
}
window.addEventListener('beforeunload', event => {
  if (editor?.dirty()) event.preventDefault();
});
function rerenderSearch(focusId,value,start,end){ G('#screen').innerHTML=screens[c.view](c);const el=G(`#${focusId}`);if(el){el.value=value;el.focus();el.setSelectionRange(start,end);} }
function close(){ const d=G('#dialog');if(d?.open)d.close();overlay.innerHTML='';if(modalReturn?.isConnected)modalReturn.focus(); }
function dialog(title,body,{form='',description='',buttons='',key='',id=''}={}){
  modalReturn=document.activeElement;
  overlay.innerHTML=`<dialog id="dialog" aria-labelledby="modal-title"><header><div><h2 id="modal-title">${h(title)}</h2>${description?`<p>${h(description)}</p>`:''}</div>${iconBtn('close','Fechar','data-act="close"')}</header>${form?`<form data-form="${form}" data-key="${key}" data-id="${id}"><div class="modal-body">${body}<p class="form-status" role="alert"></p></div><footer>${buttons||'<button class="secondary" type="button" data-act="close">Cancelar</button><button class="primary">Salvar</button>'}</footer></form>`:`<div class="modal-body">${body}</div>`}</dialog>`;
  const d=G('#dialog');d.showModal();d.addEventListener('cancel',ev=>{ev.preventDefault();close();});
  let downTarget=null;d.addEventListener('mousedown',ev=>{downTarget=ev.target;});
  d.addEventListener('click',ev=>{
    if(ev.target===d&&downTarget===d){
      const r=d.getBoundingClientRect();
      if(ev.clientY<r.top||ev.clientY>r.bottom||ev.clientX<r.left||ev.clientX>r.right)close();
    }
  });
}
const list=(arr)=>arr.map(item=>Array.isArray(item)?item:[item,item]);
function field(label,key,v='',type='text',required=false,options=[]){
  const o=required?' required':'';
  if(type==='textarea')return `<label>${label}<textarea name="${key}"${o}>${h(v)}</textarea></label>`;
  if(type==='check')return `<label class="check"><input name="${key}" type="checkbox" ${v?'checked':''}> ${label}</label>`;
  if(type==='select')return `<label>${label}<select name="${key}"${o}>${list(options).map(([id,label])=>`<option value="${h(id)}" ${String(id)===String(v)?'selected':''}>${h(label)}</option>`).join('')}</select></label>`;
  return `<label>${label}<input name="${key}" type="${type}" value="${h(v)}"${o}${type==='number'?' min="0" max="1000000000" step="0.01"':''}></label>`;
}
const localTime=(value,zone)=>{
  if(!value)return '';
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:zone}).formatToParts(new Date(value)).map(a=>[a.type,a.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};
function toInstant(wall,zone){
  if(!wall)return '';
  let target=Date.parse(`${wall}Z`), guess=target;
  for(let n=0;n<4;n++){const represented=Date.parse(`${localTime(guess,zone)}Z`);if(represented===target)break;guess+=target-represented;}
  if(localTime(guess,zone)!==wall)throw Error('This local time is not valid in the workspace time zone.');
  return new Date(guess).toISOString();
}
const contactChoices=()=>[['','Select a contact'],...c.s.contacts.map(r=>[r.id,r.name])];
const option=(label,key,value,choices,required=true)=>field(label,key,value,'select',required,choices);
const opportunityStatusChoices=()=>opportunityStatuses.map(status=>[status,tr(status)]);
const pipelineChoices=()=>c.s.pipelines.map(item=>[item.id,item.name]);
const stageChoices=pipelineId=>c.s.stages.filter(stage=>stage.pipelineId===pipelineId).map(stage=>[stage.id,stage.name]);
const input=(label,key,value,required=false,type='text')=>field(label,key,value,type,required);
const area=(label,key,value,required=false)=>field(label,key,value,'textarea',required);
const check=(label,key,value)=>field(label,key,value,'check');
const zones=()=>c.s.profile.timezone;
const entityNames={contacts:'Contato',tasks:'Tarefa',opportunities:'Oportunidade',appointments:'Agendamento',workflows:'Fluxo',invoices:'Fatura',campaigns:'Campanha',pages:'Página',forms:'Formulário',courses:'Curso',reviews:'Avaliação',snippets:'Snippet',snippetFolders:'Pasta',triggerLinks:'Link de rastreamento',...crmEntityNames};
// Grammatical gender of each record name, so titles read "Nova tarefa" and "Novo contato".
const feminine=new Set(['tasks','opportunities','invoices','campaigns','pages','reviews','snippetFolders','companies','subscriptions','transactions']);
const lowerName=key=>{const n=entityNames[key]||'';return key==='tags'?n:n.charAt(0).toLowerCase()+n.slice(1);};
const newTitle=key=>`${feminine.has(key)?'Nova':'Novo'} ${lowerName(key)}`;
const optionalGroup = (attribute, visible, content) => `<fieldset ${attribute} ${visible ? '' : 'hidden disabled'}>${content}</fieldset>`;
function edit(key,id,preset={}){
  const entry=c.s[key]?.find(r=>r.id===id); if(id&&!entry)return;
  const r=entry||preset; let body='';
  switch(key){
    case 'contacts':body=input('Nome completo','name',r.name,true)+`<div class="field-grid">${input('E-mail','email',r.email,false,'email')}${input('Telefone','phone',r.phone,false,'tel')}</div>`+`<label>Empresa<input name="company" list="crm-companies" value="${h(r.company||'')}"></label><datalist id="crm-companies">${c.s.companies.map(x=>`<option value="${h(x.name)}">`).join('')}</datalist>`+input('Tags (separadas por vírgula)','tags',r.tags?.join(', '))+area('Notas','notes',r.notes)+customInputs(c,'Contact',r)+(id?`<div class="inline-gap"><button type="button" class="secondary" data-start-thread="${id}">${i('chat',16)} Abrir conversa</button><button type="button" class="secondary" data-edit="tasks" data-contact="${id}">${i('plus',16)} Nova tarefa</button></div>`:'');break;
    case 'tasks':body=input('Título','title',r.title,true)+option('Contato','contactId',r.contactId,contactChoices(),false)+input('Prazo','due',r.due?r.due.slice(0,10):'',false,'date')+input('Responsável','owner',r.owner)+area('Notas','notes',r.notes)+check('Concluída','done',r.done);break;
    case 'opportunities': {
      const pipelineId = c.s.stages.find(stage => stage.id === r.stage)?.pipelineId ||
        c.s.pipelines.find(item => item.id === c.pipeline)?.id || c.s.pipelines[0].id;
      const stages = stageChoices(pipelineId);
      const contact = c.s.contacts.find(item => item.id === r.contactId);
      body='<h3>Contato principal</h3>'+option('Contato','contactId',r.contactId,[['','Selecione um contato'],...contactChoices().slice(1)])+
        `<div class="field-grid"><label>E-mail <output data-opportunity-email>${h(contact?.email || '—')}</output></label>
        <label>Telefone <output data-opportunity-phone>${h(contact?.phone || '—')}</output></label></div>`+
        '<h3>Dados da oportunidade</h3>'+input('Nome da oportunidade','title',r.title,true)+
        `<div class="field-grid">${option('Pipeline','pipelineId',pipelineId,pipelineChoices())}${option('Etapa','stage',r.stage || stages[0]?.[0],stages)}</div>`+
        `<div class="field-grid">${input(`Valor (${c.s.profile.currency})`,'value',r.value??0,true,'number')}${option('Status','status',r.status||'Open',opportunityStatusChoices())}</div>`+
        optionalGroup('data-opportunity-loss',r.status === 'Lost',input('Motivo da perda','lostReason',r.lostReason))+
        `<div class="field-grid">${input('Origem','source',r.source)}${input('Responsável','owner',r.owner)}</div>`+
        `<div class="field-grid">${input('Empresa','company',r.company)}${input('Seguidores (separados por vírgula)','followers',r.followers?.join(', '))}</div>`+
        `<div class="field-grid">${input('Previsão de fechamento','closeDate',r.closeDate,false,'date')}${input('Probabilidade (%), vazio usa a da etapa','probability',r.probability??'',false,'number')}</div>`+
        input('Tags (separadas por vírgula)','tags',r.tags?.join(', '))+customInputs(c,'Opportunity',r);
      break;
    }
    case 'appointments':body=input('Título','title',r.title,true)+option('Contato','contactId',r.contactId,contactChoices(),false)+`<p class="dim">Horários no fuso ${h(zones())}.</p><div class="field-grid">${input('Início','start',localTime(r.start,zones())||(r.date?`${r.date}T09:00`:''),true,'datetime-local')}${input('Fim','end',localTime(r.end,zones())||(r.date?`${r.date}T09:30`:''),true,'datetime-local')}</div>`+option('Status','status',r.status||'Confirmed',['Confirmed','Completed','Canceled'])+area('Notas','notes',r.notes);break;
    case 'snippetFolders': body = input('Folder name','name',r.name,true); break;
    case 'snippets': {
      const type = r.type || r.kind || 'Text';
      body = input('Snippet name','name',r.name,true) + option('Type','type',type,['Text','Email']) +
        option('Folder','folderId',r.folderId || c.conversationFilters.folder || '',[['','No folder'],...c.s.snippetFolders.map(folder => [folder.id,folder.name])],false) +
        optionalGroup('data-snippet-subject',type === 'Email',input('Subject','subject',r.subject,true)) +
        area('Body','body',r.body,true) + '<p class="dim">Use {{contact.first_name}}, {{contact.name}}, {{contact.email}} or {{location.name}} to personalize the message.</p>';
      break;
    }
    case 'triggerLinks': body = input('Name','name',r.name,true) + input('Link URL','url',r.url,true,'url'); break;
    case 'invoices':body=input('Nome da fatura','title',r.title,true)+option('Contato','contactId',r.contactId,contactChoices())+`<div class="field-grid">${input(`Valor (${c.s.profile.currency})`,'value',r.value??0,true,'number')}${input('Vencimento','due',r.due?.slice(0,10),true,'date')}</div>`+option('Status','status',r.status||'Draft',['Draft','Open','Paid','Void']);break;
    case 'campaigns':body=input('Campaign name','name',r.name,true)+option('Channel','channel',r.channel||'Social',['Social','Email'])+area('Content','body',r.body,true)+input('Planned date','date',r.date?.slice(0,10),false,'date')+option('Status','status',r.status||'Draft',['Draft','Planned','Archived']);break;
    case 'pages':body=input('Page name','name',r.name,true)+option('Type','kind',r.kind||'Funnel',['Funnel','Website'])+input('Headline','headline',r.headline,true)+area('Page copy','body',r.body)+input('Button label','button',r.button)+option('Form','formId',r.formId,[['','No form'],...c.s.forms.map(a=>[a.id,`${a.name}${a.active?'':' (Draft)'}`])],false)+check('Publish locally','active',r.active);break;
    case 'forms':body=input('Form name','name',r.name,true)+area('Description','description',r.description)+check('Ask for phone number','askPhone',r.askPhone)+check('Publish locally','active',r.active);break;
    case 'courses':body=input('Nome do curso','name',r.name,true)+area('Descrição','description',r.description)+input('Título da aula','lesson',r.lesson,true)+area('Conteúdo da aula','body',r.body)+check('Apenas no portal do cliente','portalOnly',r.portalOnly ?? !id)+check('Publicar curso','active',r.active);break;
    case 'reviews':body=input('Reviewer','author',r.author,true)+option('Rating','score',r.score||5,[5,4,3,2,1])+area('Review','text',r.text,true)+area('Reply','reply',r.reply);break;
    default:body=crmForm(c,key,r,preset);if(!body)return;
  }
  dialog(id?`Editar ${lowerName(key)}`:newTitle(key),body,{form:'record',key,id:id||'',buttons:`${id?`<button class="danger plain" type="button" data-delete="${key}" data-id="${id}">${i('trash',16)} Excluir</button>`:''}<span class="spacer"></span><button class="secondary" type="button" data-act="close">Cancelar</button><button class="primary">${id?'Salvar alterações':`Criar ${lowerName(key)}`}</button>`});
}

function workspaces(){
  const agency = c.access?.agency ? '<button class="choice" data-act="agency-view"><strong>Visão da agência</strong></button>' : '';
  const choices = c.workspaces.map(w => `<button class="choice" data-workspace="${w.id}"><strong>${h(w.name)}</strong>${w.id === c.workspace ? '<span>Workspace atual</span>' : ''}</button>`).join('');
  const create = c.access?.agency ? `<button class="secondary" data-act="new-workspace">${i('plus',16)} Novo workspace</button>` : '';
  dialog('Trocar de workspace', `${agency}${choices}${create}`);
}
function switchingCover(name){
  const cover=document.createElement('div');
  cover.className='switch-cover';
  cover.innerHTML=bootScreen(`Abrindo ${h(name||'a subconta')}…`);
  document.body.append(cover);
  return cover;
}
async function useWorkspace(id, view='dashboard', name){
  const cover=switchingCover(name||c.workspaces.find(w=>w.id===id)?.name);
  try { await enterWorkspace(id, view); } finally { cover.remove(); }
}
async function enterWorkspace(id, view){ leaveAgentEditor();stopSubWaPoll();c.workspace=id;c.wa=null;c.waPairOpen=false;c.choice='';c.thread='';c.chat=[];c.query='';c.tag='';c.conversationFilters={};c.inbox=undefined;c.dash=dashboardPreferences(id);c.pipeline='';c.opportunityFilters=undefined;c.opportunitySort=undefined;c.opportunityCard=undefined;c.studio={brief:'',template:'landing',project:''};await load(); localStorage.setItem('go.workspace',id);close();go(view); }
function downloads(name,content,type='text/csv;charset=utf-8'){
  const data=typeof content==='string'?new Blob([content],{type}):content, a=document.createElement('a'), u=URL.createObjectURL(data);
  a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),3000);
}
function parseCSV(csv){
  const source=csv.replace(/^\uFEFF/,''), sep=source.split(/\r?\n/,1)[0].includes(';')?';':',';
  const rows=[];let r=[],v='',quoted=false;
  function push(){r.push(v);if(r.some(x=>x.trim()))rows.push(r);r=[];v='';}
  for(let n=0;n<source.length;n++){const a=source[n];if(quoted){if(a==='"'&&source[n+1]==='"'){v+='"';n++;}else if(a==='"')quoted=false;else v+=a;}else if(a==='"'&&!v)quoted=true;else if(a===sep){r.push(v);v='';}else if(a==='\n'||a==='\r'){if(a==='\r'&&source[n+1]==='\n')n++;push();}else v+=a;}
  if(quoted)throw Error('An opening quote in the CSV was not closed.');push();
  const keys=(rows.shift()||[]).map(k=>k.trim().toLowerCase());
  if(!keys.includes('name'))throw Error('The CSV needs a name column. Optional columns: email, phone, company, tags and notes.');
  return rows.map(row=>Object.fromEntries(keys.map((k,n)=>[k,row[n]||''])));
}
async function thread(id){ c.thread=id;await mutate({type:'thread',data:{contactId:id,read:true}});close();go('conversations',c.view==='conversations' && !conversationSections.includes(c.tab) ? c.tab : ''); }
async function move(id,stage){
  const record=c.s.opportunities.find(item=>item.id===id);
  if(!record || record.stage===stage)return;
  await mutate({type:'opportunity-move',id,data:{stage}});
  render();
  flash('Oportunidade movida.');
}

function opportunityDialog(action) {
  const pipelineId = c.s.pipelines.find(item => item.id === c.pipeline)?.id || c.s.pipelines[0].id;
  const filters = c.opportunityFilters || { status:'Open' };
  const cancel = '<button class="secondary" type="button" data-act="close">Cancelar</button>';
  const apply = cancel + '<button class="primary">Aplicar</button>';
  if (action === 'opportunity-filters') {
    const status = option('Status','status',filters.status,[['','Todos'],...opportunityStatusChoices()],false);
    const stage = option('Etapa','stage',filters.stage,[['','Todas'],...stageChoices(pipelineId)],false);
    dialog('Filtros avançados', `<div class="field-grid">${status}${stage}</div>
      <div class="field-grid">${input('Responsável','owner',filters.owner)}${input('Origem','source',filters.source)}</div>
      ${input('Tag','tag',filters.tag)}<div class="field-grid">
      ${input('Valor mínimo','minValue',filters.minValue,false,'number')}${input('Valor máximo','maxValue',filters.maxValue,false,'number')}</div>`,
      {form:action,buttons:'<button class="secondary" type="button" data-act="opportunity-clear">Limpar filtros</button><span class="spacer"></span>'+apply});
  } else if (action === 'opportunity-sort') {
    const sort = c.opportunitySort || {};
    dialog('Ordenar oportunidades',option('Campo','field',sort.field || 'created',Object.entries(opportunitySorts))+
      option('Direção','direction',sort.direction || 'desc',[['desc','Decrescente'],['asc','Crescente']]),{form:action,buttons:apply});
  } else if (action === 'opportunity-fields') {
    const {layout,fields} = c.opportunityCard || opportunityPreferences(c.workspace,c.access?.session?.id);
    dialog('Personalizar cartões',option('Layout','layout',layout,Object.entries(cardLayouts))+
      '<fieldset class="opportunity-fieldset"><legend>Campos exibidos</legend>'+
      Object.entries(cardFields).map(([key,label])=>`<label class="check"><input type="checkbox" name="field" value="${key}" ${fields.includes(key)?'checked':''}> ${label}</label>`).join('')+
      '</fieldset>',{form:action,buttons:apply});
  } else if (action === 'opportunity-import') {
    const history = c.s.imports.filter(row=>row.object === 'opportunities').slice(-5).reverse();
    dialog('Importar oportunidades',option('Pipeline padrão','pipelineId',pipelineId,pipelineChoices())+
      '<p>Envie até 500 linhas. Informe <b>title</b> e o <b>email</b> ou <b>contactid</b> de um contato existente. Sem etapa indicada, a Soci usa a primeira do pipeline.</p>'+
      '<button class="secondary" type="button" data-act="opportunity-template">Baixar modelo CSV</button>'+
      '<label>Arquivo CSV<input name="file" type="file" accept=".csv,text/csv" required></label>'+
      (history.length ? '<h3>Importações recentes</h3>'+history.map(row=>`<div class="line-item"><span>${h(row.file || 'CSV')}</span><span>${row.added} importada(s)</span></div>`).join('') : ''),
      {form:action,buttons:cancel+'<button class="primary">Importar</button>'});
  }
}

function manualDetails(id, queueMode = false) {
  const item = c.s.manualActions.find(entry => entry.id === id);
  if (!item) return;
  const contact = c.s.contacts.find(entry => entry.id === item.contactId);
  const details = `<div class="manual-details"><b>${h(contact?.name || 'Contact removed')}</b>
    ${contact?.phone ? `<p>Phone · ${h(contact.phone)}</p>` : ''}
    <p>${h(item.workflowName)} · ${h(item.assignee || 'Unassigned')}</p>
    <p class="pre-wrap">${h(item.instructions)}</p>
    ${item.note ? `<p class="pre-wrap">${h(item.note)}</p>` : ''}
    ${contact ? `<button type="button" class="secondary" data-start-thread="${contact.id}">${i('chat',16)} Open conversation</button>` : ''}
  </div>`;
  if (item.status !== 'Pending') {
    dialog(item.type, details, { description:item.status });
    return;
  }
  dialog(item.type, details + area('Outcome note','note',''), { form:'manual-action', id,
    buttons:'<button type="button" class="secondary" data-act="close">Cancel</button><button class="secondary" name="status" value="Skipped">Skip</button><button class="primary" name="status" value="Completed">Mark completed</button>' });
  G('form[data-form="manual-action"]').dataset.queue = String(queueMode);
}

function composer() {
  return G('form[data-form="message"]');
}

function showEmailSubject(form) {
  const isEmail = form.elements.channel.value === 'Email';
  form.querySelector('.message-email').hidden = !isEmail;
  form.elements.subject.disabled = !isEmail;
}

function insertIntoComposer(value) {
  const body = composer().elements.body;
  const start = body.selectionStart;
  const end = body.selectionEnd;
  const prefix = start > 0 && !/\s/.test(body.value[start - 1]) ? ' ' : '';
  const suffix = end < body.value.length && !/\s/.test(body.value[end]) ? ' ' : '';
  body.setRangeText(`${prefix}${value}${suffix}`, start, end, 'end');
  close();
  body.focus();
}

function useSnippet(id) {
  const snippet = c.s.snippets.find(item => item.id === id);
  const contact = c.s.contacts.find(item => item.id === c.thread);
  const values = { 'contact.name':contact.name, 'contact.first_name':contact.name.split(/\s+/)[0],
    'contact.email':contact.email, 'contact.phone':contact.phone, 'location.name':c.s.profile.name };
  const merge = text => text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (whole,key) => Object.hasOwn(values,key) ? values[key] || '' : whole);
  const form = composer();
  form.elements.channel.value = snippet.type === 'Email' ? 'Email' : 'SMS';
  showEmailSubject(form);
  if (snippet.type === 'Email' && !form.elements.subject.value) form.elements.subject.value = merge(snippet.subject);
  insertIntoComposer(merge(snippet.body));
}

function pickComposerItem(kind) {
  const snippets = kind === 'snippet';
  const collection = snippets ? c.s.snippets : c.s.triggerLinks;
  const label = snippets ? 'snippet' : 'trigger link';
  const editor = snippets ? '#conversations/snippets' : '#conversations/trigger-links';
  if (!collection.length) {
    dialog(`Insert ${label}`, `<p>No ${label}s have been created yet.</p><a href="${editor}" class="secondary" data-close-dialog>Open ${snippets ? 'Snippets' : 'Trigger Links'}</a>`);
    return;
  }
  dialog(`Insert ${label}`, `<label>Search<input id="composer-search" autocomplete="off"></label><div class="composer-options">${collection.map(item =>
    `<button type="button" class="choice" data-composer-item ${snippets ? 'data-use-snippet' : 'data-use-link'}="${item.id}">
      <strong>${h(item.name)}</strong>${snippets ? `<span>${h(item.type)} · ${h(item.body.slice(0,120))}</span>` : `<span>${h(item.url)}</span>`}</button>`).join('')}</div>`);
}

async function copyLink(path) {
  const url = new URL(path, location.origin).href;
  try {
    await navigator.clipboard.writeText(url);
    flash('Trigger link copied.');
  } catch {
    dialog('Copy trigger link', `<label>URL<input readonly value="${h(url)}"></label>`);
    G('#dialog input').select();
  }
}

function showFieldset(fieldset, visible) {
  if (!fieldset) return;
  fieldset.hidden = !visible;
  fieldset.disabled = !visible;
}

function editStage(id, pipelineId) {
  const stage = c.s.stages.find(item => item.id === id);
  dialog(stage ? 'Edit stage' : 'Add stage',input('Stage name','name',stage?.name,true) +
    `<input type="hidden" name="pipelineId" value="${h(stage?.pipelineId || pipelineId)}">` +
    input('Win probability (%) for the forecast','probability',stage?.probability ?? '',false,'number') +
    check('Show in funnel and stage distribution','visible',stage?.visible !== false),{ form:'stage',id:stage?.id || '' });
}

function viewReport(id) {
  const report = c.s.dashboardReports.find(item => item.id === id);
  if (!report) return;
  dialog(report.name,reportGrid(report.rows) + `<button class="secondary" data-report-download="${id}">${i('download',15)} Download CSV</button>`);
}

function downloadReport(id) {
  const report = c.s.dashboardReports.find(item => item.id === id);
  if (!report) return;
  const csv = value => {
    let content=String(value);
    if (typeof value === 'string' && /^[\s]*[=+@-]/.test(content)) content=`'${content}`;
    return `"${content.replaceAll('"','""')}"`;
  };
  downloads('dashboard-report.csv',[['Widget','Measure','Value'],...report.rows].map(line => line.map(csv).join(',')).join('\r\n'));
}

function conversationFormControls(element) {
  const form = element.form;
  if (!form) return;
  if (form.dataset.form === 'message' && element.name === 'channel') showEmailSubject(form);
  if (form.dataset.key === 'snippets' && element.name === 'type') showFieldset(form.querySelector('[data-snippet-subject]'),element.value === 'Email');
  if (form.dataset.form !== 'conversation-sla') return;
  if (element.name === 'mode') {
    for (const group of form.querySelectorAll('[data-sla-mode]')) showFieldset(group,group.dataset.slaMode === element.value);
  }
  if (element.name === 'automation') {
    const label = form.querySelector('[data-sla-workflows]');
    label.hidden = element.value !== 'selected';
    label.querySelector('select').disabled = label.hidden;
  }
}
function assistant(prompt){const q=prompt.toLowerCase(), m=c.m;if(/deal|pipeline|opportun|lead|venda|funil/.test(q))return `There are ${m.open} open opportunities worth ${money(m.openValue)}, and ${m.won} won deals. Open Opportunities to review the current stages.`;if(/agenda|appointment|book|calendar/.test(q))return `There are ${m.appointments} appointments that haven’t been canceled. Open Calendars for dates and details.`;if(/contact|contat/.test(q))return `You have ${m.contacts} contacts. Open Contacts to search, filter, or import more.`;if(/invoice|pagamento|payment/.test(q))return `${money(m.invoicesPaid)} has been marked paid. Open Payments to see the invoices and balances.`;return `This workspace has ${m.contacts} contacts, ${m.open} open opportunities and ${m.unread} unread messages. I can summarize contacts, opportunities, appointments, or invoices.`;}

document.addEventListener('click',async ev=>{
  const studioLink = ev.target.closest('[data-studio-open]');
  if (studioLink && !ev.defaultPrevented && !ev.metaKey && !ev.ctrlKey && !ev.shiftKey && !ev.altKey) {
    ev.preventDefault();
    const href = studioLink.getAttribute('href');
    try { await mutate({type:'studio-visit',id:studioLink.dataset.studioOpen}); }
    catch { /* The project still opens if the visit could not be recorded. */ }
    if (location.hash === href) render(); else location.hash = href;
    return;
  }
  if (ev.target.closest('[data-close-dialog]')) { close(); return; }
  if (c.inbox?.sortOpen && !ev.target.closest('.inbox-menu,[data-inbox-sort]')) { c.inbox.sortOpen=false; render(); }
  const b=ev.target.closest('button,a[data-act]');if(!b)return;
  const d=b.dataset;
  try {
    if (await inboxClick(b,d,inboxContext())) return;
    if (d.studioTemplate) {
      const template = studioTemplates.find(item => item[0] === d.studioTemplate);
      c.studio.template=template[0];
      if (!c.studio.brief.trim()) c.studio.brief=template[2];
      render(); G('.studio-prompt textarea').focus(); return;
    }
    if (d.studioStar) {
      const project = c.s.studioProjects.find(item => item.id === d.studioStar);
      await mutate({type:'studio-star',id:project.id,data:{starred:!project.starred}});
      if (c.tab === 'project') {
        b.setAttribute('aria-pressed',String(!project.starred));
      } else render();
      return;
    }
    if (d.studioExport) {
      const project = c.s.studioProjects.find(item => item.id === d.studioExport);
      downloads('studio-project.html',exportStudioProject(project),'text/html;charset=utf-8'); return;
    }
    if ('studioAddBlock' in d) {
      const container = G('[data-studio-blocks]');
      if (container.children.length < 12) {
        container.insertAdjacentHTML('beforeend',studioBlock()); container.lastElementChild.querySelector('input').focus();
      }
      return;
    }
    if ('studioRemoveBlock' in d) { b.closest('.studio-block').remove(); return; }
    if (d.dashboardReport) { viewReport(d.dashboardReport); return; }
    if (d.reportDownload) { downloadReport(d.reportDownload); return; }
    if (d.stageNew || d.stageEdit) { editStage(d.stageEdit,d.stageNew); return; }
    if (d.pipelineEdit) {
      const pipeline = c.s.pipelines.find(item => item.id === d.pipelineEdit);
      dialog('Rename pipeline',input('Pipeline name','name',pipeline.name,true),{form:'pipeline',id:pipeline.id}); return;
    }
    if (d.manual) { manualDetails(d.manual); return; }
    if (d.dismissSla) { await mutate({type:'dismiss-sla',id:d.dismissSla}); render(); flash('SLA timer dismissed.'); return; }
    if (d.manualPage) { c.conversationFilters.manualPage = Number(d.manualPage); render(); return; }
    if (d.openFolder) { c.conversationFilters.folder = d.openFolder; go('conversations','snippets'); return; }
    if (d.copyPath) { await copyLink(d.copyPath); return; }
    if (d.useSnippet) { useSnippet(d.useSnippet); return; }
    if (d.useLink) { insertIntoComposer(`{{trigger_link.${d.useLink}}}`); return; }
    if(d.edit){edit(d.edit,d.id,{date:d.date,stage:d.stage,kind:d.kind,channel:d.channel,contactId:d.contact,object:d.object,name:d.name});return;}
    if(d.dismissNotice){sessionDismissed.add(d.dismissNotice);render();return;}
    if(d.go){close();go(d.go);return;}
    if(d.agGo){close();location.hash='#agency/'+d.agGo;return;}
    if(d.tab){go(c.view,d.tab);return;}
    if(d.choice){c.choice=d.choice;G('.choices')?.querySelectorAll('button').forEach(el=>{const sel=el.dataset.choice===d.choice;el.classList.toggle('chosen',sel);el.setAttribute('aria-pressed',String(sel));});G('[data-act="continue-onboarding"]').disabled=false;return;}
    if(d.workspace){await useWorkspace(d.workspace);return;}
    if(d.thread||d.startThread){await thread(d.thread||d.startThread);return;}
    if(d.task){const r=c.s.tasks.find(a=>a.id===d.task);await mutate({type:'save',key:'tasks',id:r.id,data:{...r,done:!r.done}});render();return;}
    if(d.file){const f=c.s.files.find(a=>a.id===d.file);const [header,body]=f.data.split(',');const data=new Blob([Uint8Array.from(atob(body),x=>x.charCodeAt(0))],{type:header.slice(5).split(';')[0]});downloads(f.name,data);return;}
    if(d.provider){dialog(d.provider,'<p>This integration is unavailable in the local workspace. A provider account and an authorized connection are required.</p>');return;}
    if(d.delete){dialog('Delete this record?',`<p>${d.delete==='contacts'?'This will also delete associated messages, tasks, opportunities, appointments, and invoices.':'This removes the record from this workspace.'}</p>`,{form:'delete',key:d.delete,id:d.id,buttons:'<button class="secondary" type="button" data-act="close">Cancel</button><button class="danger">Delete</button>'});return;}
    switch(d.act){
      case 'start-manual': {
        const first = manualQueue(c).find(item => item.status === 'Pending');
        if (first) manualDetails(first.id,true);
        break;
      }
      case 'new-snippet': dialog('New Snippet', '<div class="quick-list"><button class="secondary" data-edit="snippets" data-kind="Text">Add Text Snippet</button><button class="secondary" data-edit="snippets" data-kind="Email">Add Email Snippet</button></div>'); break;
      case 'insert-snippet': pickComposerItem('snippet'); break;
      case 'insert-link': pickComposerItem('link'); break;
      case 'close':close();break;
      case 'nav':c.navOpen=!c.navOpen;render();G('[data-act="nav"]')?.focus();break;
      case 'ask-rail':c.askOpen=!c.askOpen;render();G('[data-act="ask-rail"]').focus();break;
      case 'continue-onboarding': {
        if(busy||!c.choice)break;busy=true;b.disabled=true;
        try {const was=c.s.onboarding;await mutate({type:'onboarding',data:was.kind?{kind:was.kind,goal:c.choice,done:true}:{kind:c.choice}});c.choice='';render();(G('.choice')||G('.ask-composer input'))?.focus();} finally {busy=false;if(b.isConnected)b.disabled=false;}
        break;
      }
      case 'workspaces':workspaces();break;
      case 'agency-view':close();location.hash='#agency/dashboard';break;
      case 'stop-acting':localStorage.removeItem('go.user');location.reload();break;
      case 'account': {
        const session = c.access?.session || agencyUI.session();
        if (session) dialog('Minha conta', '<p>' + h(session.name) + '<br>' + h(session.email) + '</p><button type="button" class="secondary" data-act="sign-out">Sair da conta</button>');
        break;
      }
      case 'sign-out':
        await api('/api/auth/logout', {});
        localStorage.removeItem('go.workspace');
        location.assign('/login');
        break;
      case 'new-workspace':dialog('Criar workspace',input('Nome do workspace','name','',true),{form:'workspace',buttons:'<button class="secondary" type="button" data-act="close">Cancelar</button><button class="primary">Criar workspace</button>'});break;
      case 'search':dialog('Buscar no workspace','<label>Encontre um módulo ou contato<input id="global-search" placeholder="Buscar módulos e contatos…" autocomplete="off"></label><div id="search-results"></div>');globalSearch('');break;
      case 'dialer':dialog('Discador','<p>O discador não está conectado. Chamadas de voz exigem a configuração de um provedor de telefonia autorizado.</p>');break;
      case 'updates':dialog('Novidades','<p>O soci está rodando localmente com tudo atualizado.</p>');break;
      case 'notifications':dialog('Notificações',`<p>${c.m.unread} mensage${c.m.unread===1?'m não lida':'ns não lidas'}.</p><button class="secondary" data-go="conversations">Abrir conversas</button>`);break;
      case 'help':dialog('Ajuda','<p>Gerencie contatos, oportunidades, agendamentos, formulários e automações. Acesse Configurações para gerenciar workspaces.</p><button class="secondary" data-go="dashboard">Abrir painel</button>');break;
      case 'reload':await load();render();flash('Workspace atualizado.');break;
      case 'import':dialog('Importar contatos',`<p>Escolha um arquivo CSV com a coluna <b>name</b>. Opcional: email, phone, company, tags e notes. Até 500 contatos.</p><label>Arquivo CSV<input name="file" type="file" accept=".csv,text/csv" required></label>`,{form:'import',buttons:'<button class="secondary" type="button" data-act="close">Cancelar</button><button class="primary">Importar contatos</button>'});break;
      case 'opportunity-clear':
        c.opportunityFilters={};c.query='';close();render();G('[data-act="opportunity-filters"]')?.focus();break;
      case 'opportunity-filters': case 'opportunity-sort': case 'opportunity-fields': case 'opportunity-import':
        opportunityDialog(d.act);break;
      case 'opportunity-template':
        downloads('modelo-oportunidades.csv',opportunityCsvColumns.join(',')+'\r\n');break;
      case 'opportunity-export': {
        const pipelineId=c.s.pipelines.find(item=>item.id===c.pipeline)?.id || c.s.pipelines[0].id;
        const rows=opportunityResults(c.s,pipelineId,c.query,c.opportunityFilters,c.opportunitySort);
        downloads('oportunidades.csv',opportunityCsv(c.s,rows));break;
      }
      case 'upload':dialog('Enviar arquivo','<p>PNG, JPEG, GIF, WebP ou PDF de até 700 KB.</p><label>Arquivo<input name="file" type="file" accept="image/png,image/jpeg,image/gif,image/webp,application/pdf" required></label>',{form:'upload',buttons:'<button class="secondary" type="button" data-act="close">Cancelar</button><button class="primary">Enviar arquivo</button>'});break;
      case 'new-thread':dialog('Nova conversa',option('Contato','contactId','',contactChoices()),{form:'thread',buttons:'<button class="secondary" type="button" data-act="close">Cancelar</button><button class="primary">Abrir conversa</button>'});break;
      case 'new-pipeline':dialog('Novo pipeline',input('Nome do pipeline','name','',true),{form:'pipeline',buttons:'<button class="secondary" type="button" data-act="close">Cancelar</button><button class="primary">Criar pipeline</button>'});break;
      case 'toggle-star': {const starred=c.s.messages.some(x=>x.contactId===c.thread&&x.starred);await mutate({type:'thread',data:{contactId:c.thread,starred:!starred}});render();break;}
      case 'mark-unread':await mutate({type:'thread',data:{contactId:c.thread,read:false}});c.thread='';render();flash('Marcada como não lida.');break;
      case 'back-inbox':c.thread='';render();break;
      case 'prev-month':case 'next-month':c.month=new Date(c.month.getFullYear(),c.month.getMonth()+(d.act==='prev-month'?-1:1),1);render();break;
      case 'this-month':c.month=new Date();render();break;
      case 'export': downloads('go-workspace-relatorio.csv',['Métrica,Valor',...Object.entries(c.m).map(([k,v])=>`${k},${v}`)].join('\r\n'));break;
      case 'wa-refresh': await refreshSubWa(); flash('Status do WhatsApp atualizado.'); break;
      case 'wa-toggle-pair': c.waPairOpen=!c.waPairOpen; render(); break;
      case 'wa-connect': {
        stopSubWaPoll();
        c.wa={...(c.wa||{}),available:true,enabled:true,status:'connecting',qrcode:'',paircode:''};
        render();
        const live=await api(url('/api/whatsapp/workspace/connect'),{});
        c.wa=live;
        render();
        if(live.status==='connecting'){ startSubWaPoll(); flash('QR Code gerado! Escaneie com o WhatsApp.'); }
        else if(live.status==='connected') flash('WhatsApp conectado!');
        break;
      }
      case 'wa-disconnect': {
        stopSubWaPoll();
        c.wa=await api(url('/api/whatsapp/workspace/disconnect'),{});
        c.waPairOpen=false;
        render();
        flash('WhatsApp desconectado.');
        break;
      }
    }
  } catch(e){flash(e.message,true);}
});

function globalSearch(value){
  const q=value.toLowerCase();
  if (location.hash.startsWith('#agency')) {
    const agNavList = [
      ['dashboard', 'Painel da agência', 'layout'],
      ['prospecting', 'Prospecção', 'search'],
      ['accounts', 'Subcontas', 'users'],
      ['snapshots', 'Setups de conta', 'box'],
      ['affiliate', 'Portal de afiliados', 'gift'],
      ['templates', 'Biblioteca de modelos', 'doc'],
      ['partners', 'Parceiros', 'users'],
      ['university', 'Universidade', 'book'],
      ['ideas', 'Ideias', 'lightbulb'],
      ['mobile-app', 'Aplicativo móvel', 'phone'],
      ['settings', 'Configurações', 'cog']
    ];
    let agAccounts = [];
    try {
      const db = JSON.parse(localStorage.getItem('ag_db_v1') || '{}');
      agAccounts = db.accounts || [];
    } catch {}
    const navHits = agNavList.filter(x => x.join(' ').toLowerCase().includes(q)).slice(0, 8);
    const accHits = q ? agAccounts.filter(x => (x.name || '').toLowerCase().includes(q)).slice(0, 5) : [];
    G('#search-results').innerHTML = `<div class="quick-list">${navHits.map(([k, pt, ico]) => `<button class="secondary" data-ag-go="${k}">${i(ico, 17)} ${pt}</button>`).join('')}${accHits.map(a => `<button class="secondary" data-ag-go="accounts">${avatar(a.name)} ${h(a.name)}</button>`).join('')}</div>`;
    return;
  }
  G('#search-results').innerHTML=`<div class="quick-list">${nav.filter(x=>x.join(' ').toLowerCase().includes(q)).slice(0,8).map(([k,pt,ico])=>`<button class="secondary" data-go="${k}">${i(ico,17)} ${pt}</button>`).join('')}${q?c.s.contacts.filter(x=>`${x.name} ${x.email}`.toLowerCase().includes(q)).slice(0,5).map(x=>`<button class="secondary" data-edit="contacts" data-id="${x.id}">${avatar(x.name)} ${h(x.name)}</button>`).join(''):''}</div>`;
}
document.addEventListener('input', e => {
  const el = e.target;
  if (el.name === 'brief' && el.form?.dataset.form === 'studio-create') c.studio.brief=el.value;
  if (el.id === 'page-search') { c.query=el.value; rerenderSearch(el.id,el.value,el.selectionStart,el.selectionEnd); }
  if (el.id === 'global-search') globalSearch(el.value);
  if (el.id === 'composer-search') {
    for (const item of G('#dialog').querySelectorAll('[data-composer-item]')) item.hidden = !item.textContent.toLowerCase().includes(el.value.toLowerCase());
  }
});
document.addEventListener('change', async e => {
  const el = e.target;
  conversationFormControls(el);
  try { if (await inboxChange(el,inboxContext())) return; } catch (error) { render(); flash(error.message,true); return; }
  if (el.name === 'template' && el.form?.dataset.form === 'studio-create') {
    c.studio.template=el.value;
    const label=G('.studio-mode'), chosen=studioTemplates.find(item=>item[0]===el.value);
    if (label && chosen) label.textContent=`${c.features?.studioAI ? 'Template' : 'Local template'} · ${chosen[1]}`;
  }
  if (el.dataset.convFilter) {
    const filter = el.dataset.convFilter;
    c.conversationFilters[filter] = el.value;
    c.conversationFilters.manualPage = 0;
    render();
    G(`[data-conv-filter="${filter}"]`)?.focus();
  }
  if (el.id === 'tag-filter') { c.tag=el.value; render(); G('#tag-filter')?.focus(); }
  if (el.hasAttribute('data-opportunity-pipeline')) {
    c.pipeline=el.value;
    if(c.opportunityFilters) delete c.opportunityFilters.stage;
    render(); G('[data-opportunity-pipeline]')?.focus();
  }
  if (el.hasAttribute('data-opportunity-status')) {
    c.opportunityFilters={...c.opportunityFilters,status:el.value};
    render();G('[data-opportunity-status]')?.focus();
  }
  if(el.form?.dataset.key==='opportunities') {
    const form=el.form;
    if(el.name==='pipelineId') form.elements.stage.replaceChildren(...stageChoices(el.value).map(([id,name])=>new Option(name,id)));
    if(el.name==='contactId') {
      const contact=c.s.contacts.find(item=>item.id===el.value);
      form.querySelector('[data-opportunity-email]').textContent=contact?.email || '—';
      form.querySelector('[data-opportunity-phone]').textContent=contact?.phone || '—';
      if(contact && !form.elements.title.value.trim()) form.elements.title.value=contact.name;
    }
    if(el.name==='status') {
      const loss=form.querySelector('[data-opportunity-loss]');
      loss.hidden=loss.disabled=el.value!=='Lost';
    }
  }
  if (el.dataset.move) try { await move(el.dataset.move,el.value); } catch (error) { render(); flash(error.message,true); }
});
document.addEventListener('dragstart',ev=>{const el=ev.target.closest('[data-drag]');if(el){ev.dataTransfer.effectAllowed='move';ev.dataTransfer.setData('text/plain',el.dataset.drag);}});
document.addEventListener('dragover',ev=>{if(ev.target.closest('[data-drop]'))ev.preventDefault();});
document.addEventListener('drop',async ev=>{const el=ev.target.closest('[data-drop]');if(!el)return;ev.preventDefault();try{await move(ev.dataTransfer.getData('text/plain'),el.dataset.drop);}catch(e){flash(e.message,true);}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&c.inbox?.sortOpen&&c.view==='conversations'){c.inbox.sortOpen=false;render();G('[data-inbox-sort]')?.focus();return;}if(!viewPath&&c.s&&c.mode!=='agency'&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();G('[data-act="search"]').click();}});

document.addEventListener('submit',async ev=>{
  const f=ev.target;if(!f.dataset.form)return;ev.preventDefault();if(f.dataset.pending)return;f.dataset.pending='true';
  const name=f.dataset.form, fd=new FormData(f,ev.submitter), data=Object.fromEntries(fd), status=f.querySelector('.form-status');
  if(status)status.textContent='';
  const btn=f.querySelector('button[type="submit"],button:not([type])');if(btn)btn.disabled=true;
  try {
    let msg='Saved.';
    if(name==='record'){
      const {key,id}=f.dataset;
      for(const el of f.querySelectorAll('input[type="checkbox"]'))data[el.name]=el.checked;
      if(key==='appointments'){data.start=toInstant(data.start,zones());data.end=toInstant(data.end,zones());}
      await mutate({type:'save',key,id,data});msg=id?'Alterações salvas.':`${entityNames[key]} ${feminine.has(key)?'criada':'criado'}.`;
    } else if(name==='delete'){await mutate({type:'delete',key:f.dataset.key,id:f.dataset.id});msg='Record deleted.';}
    else if(name==='profile'){await mutate({type:'profile',data});await load();msg='Business profile saved.';}
    else if(name==='wa-pair'){
      stopSubWaPoll();
      const live=await api(url('/api/whatsapp/workspace/connect'),{phone:data.phone});
      c.wa=live;
      if(live.status==='connecting') startSubWaPoll();
      msg=live.paircode?'Código de pareamento gerado!':'Conexão iniciada.';
    }
    else if(name==='wa-test'){
      await api(url('/api/whatsapp/workspace/test'),{phone:data.phone,text:data.text});
      msg='Mensagem de teste enviada pelo WhatsApp!';
    }
    else if (name==='stage') { await mutate({type:'stage',id:f.dataset.id,data:{ ...data,visible:f.elements.visible.checked }}); msg='Stage saved.'; }
    else if (name==='pipeline') { await mutate({type:'pipeline',id:f.dataset.id,data}); msg='Pipeline saved.'; }
    else if(name==='thread'){await thread(data.contactId);return;}
    else if(name.startsWith('inbox-')||name==='team-message'){flash(await inboxSubmit(name,f,data,inboxContext()));return;}
    else if(name==='workspace'){const d=await api('/api/workspaces',data);await useWorkspace(d.id);flash('Workspace created.');return;}
    else if(name==='message'){await mutate({type:'message',data:{...data,contactId:c.thread}});msg='Message logged.';}
    else if (name === 'manual-action') {
      await mutate({ type:'manual-action', id:f.dataset.id, data });
      msg = data.status === 'Skipped' ? 'Action skipped.' : 'Action completed.';
      const next = f.dataset.queue === 'true' && manualQueue(c).find(item => item.status === 'Pending');
      close(); render(); flash(msg);
      if (next) manualDetails(next.id,true);
      return;
    }
    else if (name === 'conversation-sla') {
      const targets = key => ({ soon: data[`${key}Soon`], overdue: data[`${key}Overdue`] });
      await mutate({ type:'conversation-sla', data:{ enabled:f.elements.enabled.checked, mode:data.mode, automation:data.automation,
        workflows:fd.getAll('workflows'), common:targets('common'), channels:{ SMS:targets('SMS'), Email:targets('Email') } } });
      msg = 'SLA settings saved.';
    }
    else if(name==='assistant'){const q=data.prompt.trim();if(q){c.chat.push({self:true,body:q},{body:assistant(q)});render();G('.ask-composer input')?.focus();}return;}
    else if(name==='lead'){await api(`/api/view/f/${f.dataset.workspace}/${f.dataset.id}`,data);f.reset();status.textContent='Thank you. Your information was submitted.';status.classList.add('confirmed');return;}
    else if(name==='import'){if(data.file.size>500000)throw Error('Choose a CSV file under 500 KB.');const n=await mutate({type:'import',data:{rows:parseCSV(await data.file.text()),file:data.file.name}});msg=`${n} contact${n===1?'':'s'} imported. Existing emails were skipped.`;}
    else if(name==='opportunity-import') {
      if(data.file.size>500000)throw Error('Escolha um CSV de até 500 KB.');
      const n=await mutate({type:name,data:{pipelineId:data.pipelineId,rows:parseCsv(await data.file.text()),file:data.file.name}});
      msg=n===1?'1 oportunidade importada.':`${n} oportunidades importadas.`;
    }
    else if(name==='opportunity-filters' || name==='opportunity-sort' || name==='opportunity-fields') {
      if(name==='opportunity-filters') {
        if(data.minValue && data.maxValue && Number(data.minValue)>Number(data.maxValue)) throw Error('O valor máximo deve ser maior ou igual ao mínimo.');
        c.opportunityFilters=Object.fromEntries(Object.entries(data).map(([key,value])=>[key,value.trim()]));
      }
      if(name==='opportunity-sort') c.opportunitySort={field:data.field,direction:data.direction};
      if(name==='opportunity-fields') c.opportunityCard=opportunityPreferences(c.workspace,c.access?.session?.id,{layout:data.layout,fields:fd.getAll('field')});
      close();render();G(`[data-act="${name}"]`)?.focus();return;
    }
    else if(name==='upload'){ const file=data.file;if(file.size>700000)throw Error('Choose a file under 700 KB.');const encoded=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('File could not be read.'));reader.readAsDataURL(file);});await mutate({type:'save',key:'files',data:{name:file.name,data:encoded}});msg='File uploaded.';}
    else if (name === 'studio-create') {
      const generating=data.engine==='model', submitter=ev.submitter, original=submitter?.innerHTML;
      const buttons=[...f.querySelectorAll('button')];
      buttons.forEach(button=>{button.disabled=true;});
      f.setAttribute('aria-busy','true');
      if (generating) {
        if (submitter) submitter.textContent='Generating…';
        if (status) { status.classList.add('pending'); status.textContent='Generating your project. This can take up to a minute.'; }
      }
      try {
        c.studio.brief='';
        startBuild({ c, api, url, flash, render },{ brief:data.brief.trim(), kind:'website', template:data.template, reference:(data.reference || '').trim(), ai:data.engine==='model' && Boolean(c.features?.studioAI) });
        return;
      } finally {
        buttons.forEach(button=>{button.disabled=false;});
        f.removeAttribute('aria-busy');
        if (submitter && original !== undefined) submitter.innerHTML=original;
        if (status && generating) { status.classList.remove('pending'); status.textContent=''; }
      }
    }
    else if (name === 'studio-edit') {
      const project=c.s.studioProjects.find(item=>item.id===f.dataset.id);
      const blocks=fd.getAll('blockTitle').map((title,index)=>({title,body:fd.getAll('blockBody')[index]}));
      await mutate({type:'save',key:'studioProjects',id:project.id,data:{...project,...data,blocks}}); msg='Project saved.';
    }
    close();render();flash(msg);
  } catch(e){if(status){status.classList.remove('confirmed');status.textContent=e.message;}else flash(e.message,true);}
  finally {delete f.dataset.pending;if(btn)btn.disabled=false;}
});

if(viewPath){
  try{const result=await api(`/api/view${viewPath}`), workspace=viewPath.split('/')[2]; document.title='soci';app.innerHTML=publicView(result,workspace);}
  catch(e){app.innerHTML=`<div class="boot"><h1>Página indisponível</h1><p>${h(e.message)}</p><a href="/">Voltar para a plataforma</a></div>`;}
}else{
  installDashboardControls({ c,dialog,close,render,load,mutate,flash,go,download:downloads });
  agencyUI = startAgency({ app, overlay, api, flash, openWorkspace: useWorkspace, onBrandColorChange: (primary, secondary) => {
    if (!c.agency || c.workspace.startsWith('user-')) return;
    c.agency.primary = primary;
    if (secondary) c.agency.secondary = secondary;
    if (c.mode !== 'agency') render();
  }, onOpenAIChange: connection => {
    if (!c.features) return;
    c.features.studioAI = connection.configured;
    c.features.agentModel = connection.configured && allowedView('ai-agents') ? connection.model : '';
  } });
  installStudio({ c, api, url, flash, render });
  installSites({ c, api, url, mutate, flash, render });
  installForms({ c, api, url, mutate, flash, render });
  installBuilder({ c, api, url, flash, render });
  installAutomation({ c, mutate, render, flash, dialog, close });
  mountClientPortal = installClientPortal({ c, api, flash, dialog, close });
  crmEvents({ G, mutate, render, flash, dialog, close });
  socialEvents({ c, G, api, url, mutate, render, flash, dialog, close, load });
  window.addEventListener('hashchange',route);
  setInterval(() => {
    if (!c.s?.conversationSla.enabled || c.view !== 'conversations' || document.hidden || overlay.innerHTML) return;
    if (c.tab === 'analytics') { if (!G('select:focus')) render(); return; }
    const clocks = [...document.querySelectorAll('[data-sla-clock]')];
    if (!clocks.length) return;
    const records = slaRecords(c.s);
    for (const clock of clocks) {
      const active = records.find(item => item.id === clock.dataset.slaClock);
      if (!active) continue;
      clock.textContent = `${active.channel} · ${active.state}`;
      clock.classList.toggle('red', active.state === 'Overdue');
      clock.classList.toggle('blue', active.state !== 'Overdue');
    }
  },15000);
  window.addEventListener('focus',async()=>{
    if (!c.s || overlay.innerHTML || busy || G('form :focus')) return;
    const live = (c.view === 'sites' && c.tab === 'submissions') ||
      (c.view === 'conversations' && ['analytics','link-analysis','manual-actions'].includes(c.tab));
    if (live) try { await load(); render(); } catch { /* The current view remains available. */ }
  });
  route();
}
