import {icon as i} from './icons.js';
import {tr} from './i18n.js';
import {conversationPage} from './conversations.js';
import {inboxPage} from './inbox.js';
import {dashboard} from './dashboard.js';
import {studio} from './studio.js';
import {bulkBar, contactsTab, crmTabs, opportunitiesTab, paymentsTab, pickBox, pickHead, settingsTab} from './crm.js';
import {socialPlanner} from './social.js';
import {agentsScreen} from './agents.js';
import {sitesScreen} from './sites.js';
import {automationScreen} from './automation.js';
import {portalAdminScreen, portalNav} from './client-portal.js';
import {cardFields, opportunityPreferences, opportunityResults} from './opportunity-data.js';
import {opportunityStatuses} from './dashboard-data.js';

export const nav=[['dashboard','Painel de controle','grid','Dashboard'],['conversations','Conversas','chat','Conversations'],['calendars','Calendários','cal','Calendars'],['contacts','Contatos','contacts','Contacts'],['opportunities','Oportunidades','leads','Opportunities'],['payments','Pagamentos','pay','Payments'],['studio','Estúdio de IA','studio','AI Studio'],['ai-agents','Agentes de IA','spark','AI Agents'],['marketing','Marketing','send','Marketing'],['automation','Automações','flow','Automation'],['sites','Sites','site','Sites'],['memberships','Assinaturas','play','Memberships'],['media','Mídia Drive','folder','Media Storage'],['reputation','Reputação','award','Reputation'],['reporting','Relatórios','chart','Reporting'],['settings','Configurações','gear','Settings']];
export const h=x=>String(x??'').replace(/[&<>"']/g,v=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[v]);
const brl = new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' });
export function money(value) { return brl.format(value || 0); }
export const fmt=(d,tz='America/Sao_Paulo',time=false)=>d ? new Intl.DateTimeFormat('pt-BR',{timeZone:tz,day:'2-digit',month:'short',year:'numeric',...(time?{hour:'2-digit',minute:'2-digit'}:{})}).format(new Date(d)) : '—';
export const initials=n=>n?.trim().split(/\s+/).slice(0,2).map(v=>v[0]?.toUpperCase()).join('')||'GO';
export const badge=(s,t='')=>`<span class="badge ${t}">${h(tr(s))}</span>`;
export const avatar=(n,cls='')=>`<span aria-hidden="true" class="avatar ${cls}">${h(initials(n))}</span>`;
const primary=(label,key,extra='')=>`<button class="primary" data-edit="${key}" ${extra}>${i('plus',16)} ${label}</button>`;
const action=(label,action,ico='')=>`<button class="secondary" data-act="${action}">${ico?i(ico,16):''}${label}</button>`;
const link=(label,view)=>`<a class="text-link" href="#${view}">${label} ${i('arrow',15)}</a>`;
export const tabs=(values,current)=>`<div class="tabs" aria-label="Seção">${values.map(([value,label])=>`<button data-tab="${value}" class="${value===current?'selected':''}" aria-pressed="${value===current}">${label}</button>`).join('')}</div>`;
const head=(title,desc='',cta='',sub='')=>`<header class="page-head"><div><h1>${title}</h1>${desc?`<p>${desc}</p>`:''}</div><div class="head-actions">${cta}</div></header>${sub}`;
const empty=(title,desc,icon='inbox',cta='')=>`<div class="empty">${i(icon,26)}<strong>${title}</strong><p>${desc}</p>${cta}</div>`;
const search=(v,label='Buscar…')=>`<label class="search">${i('search',16)}<input id="page-search" value="${h(v)}" placeholder="${label}" aria-label="${label}" autocomplete="off"></label>`;
const wrap=content=>`<div class="page">${content}</div>`;
const table=(columns,rows,nothing)=>`<div class="surface table-shell"><table><thead><tr>${columns.map(c=>`<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>${rows.length?'':nothing}</div>`;
const row=(cells,key,id)=>`<tr>${cells.map(c=>`<td>${c}</td>`).join('')}<td class="right"><button class="icon-btn" title="Editar registro" aria-label="Editar registro" data-edit="${key}" data-id="${id}">${i('edit',16)}</button></td></tr>`;
const date=(d,c,time=false)=>fmt(d,c.s.profile.timezone,time);
const name=(id,c)=>c.s.contacts.find(r=>r.id===id)?.name||'—';
const mt=money;
const filter=(rows,q,fields)=>rows.filter(r=>!q||fields.some(f=>String(r[f]||'').toLowerCase().includes(q.toLowerCase())));
const top=(rows,q,fields)=>filter([...rows].reverse(),q,fields);
const viewLink=(label,kind,id,c)=>`<a class="secondary" href="/${kind}/${c.workspace}/${id}" target="_blank" rel="noopener">${i('external',14)} ${label}</a>`;

const business=[['small','Tenho um pequeno negócio','Sou corretor de imóveis e preciso de uma plataforma única para gerenciar leads, retornos e clientes.'],['agency','Agência de marketing','Tenho uma agência e preciso de uma plataforma para lançar, automatizar e gerenciar os negócios dos clientes.'],['saas','Negócio SaaS','Quero colocar minha marca nesta plataforma e revendê-la como se fosse minha.'],['other','Outra coisa','Outro segmento, consultoria ou modelo de negócio não listado acima.']];
const goals=[['contacts','Organizar meus contatos','Monte uma lista de contatos e acompanhe cada relacionamento.'],['opportunities','Gerenciar leads e negócios','Crie oportunidades e mova-as pelo seu pipeline.'],['calendars','Marcar agendamentos','Configure um calendário para ligações e reuniões.'],['sites','Criar um site ou formulário','Crie uma página para captar novos leads.'],['automation','Automatizar retornos','Configure ações que rodam quando algo muda.']];
const bubble=(body)=>`<div class="ai-msg"><div class="spark-tile">${i('spark',15)}</div><div>${body}</div></div>`;
export function askAI(c){
  const o=c.s.onboarding, stage=o.done?2:o.kind?1:0;
  const opts=(stage===0?business:goals).map(([id,title,desc])=>`<button class="choice ${c.choice===id?'chosen':''}" data-choice="${id}" aria-pressed="${c.choice===id}"><strong>${title}</strong>${desc?`<span>${stage===0?'ex.: ':''}${desc}</span>`:''}</button>`).join('');
  const content=stage===0?`${bubble('Seu workspace está em configuração guiada. Escolha como vai usá-lo e depois um primeiro objetivo para configurar as ferramentas de que precisa.')}${bubble(`Olá, boas-vindas! Sou seu assistente de configuração. Vou ajudar você a montar o que mais importa, para que o workspace fique pronto do jeito que você trabalha — começando com algumas perguntas rápidas. Leva menos de um minuto.<div class="choices">${opts}</div><button class="continue" data-act="continue-onboarding" ${!c.choice?'disabled':''}>Continuar ${i('arrow',17)}</button>`)}`:stage===1?bubble(`Ótimo! O que você quer fazer primeiro?<div class="choices">${opts}</div><div class="inline-gap"><button class="continue" data-act="continue-onboarding" ${!c.choice?'disabled':''}>Continuar ${i('arrow',17)}</button></div>`):`${bubble(`Seu workspace está pronto. Seu primeiro objetivo é <strong>${goals.find(g=>g[0]===o.goal)?.[1]||'começar'}</strong>. ${link('Abrir módulo recomendado',o.goal)}`)}${bubble('Posso resumir seu workspace e sugerir um próximo passo. Experimente “Como está meu funil?” ou “Quantos agendamentos eu tenho?” <span class="badge pink">Assistente local</span>')}${c.chat.map(x=>x.self?`<div class="user-msg">${h(x.body)}</div>`:bubble(h(x.body))).join('')}`;
  return `<div class="ask-layout"><section class="ask-main" aria-label="Configuração guiada"><div class="ask-scroll"><div class="ask-thread">${content}</div></div><div class="ask-bottom">${stage===2?`<form class="ask-composer" data-form="assistant"><input name="prompt" placeholder="Pergunte sobre seu workspace…" aria-label="Pergunte sobre seu workspace" required><button class="icon-btn" aria-label="Enviar pergunta">${i('send',17)}</button></form>`:`<div class="ask-composer muted">${i('lock',16)}<span>Primeiro, algumas etapas de configuração rápida, depois pergunte qualquer coisa.</span></div>`}</div></section></div>`;
}

function contacts(c){
  if(['bulk','fields','companies'].includes(c.tab)) return contactsTab(c,c.tab);
  const tab=c.tab||'all', list=tab==='tasks'?top(c.s.tasks,c.query,['title']):top(c.s.contacts,c.query,['name','email','phone','company','tags']);
  const tag=c.tag, tags=[...new Set(c.s.contacts.flatMap(x=>x.tags))].sort();
  return wrap(head('Contatos','',tab==='tasks'?primary('Adicionar tarefa','tasks'):`${action('Importar','import','upload')}${primary('Adicionar contato','contacts')}`,tabs(crmTabs.contacts,tab))+`<div class="toolbar">${search(c.query,tab==='tasks'?'Buscar tarefas…':'Busca rápida…')}${tab==='all'?`<label class="tag-filter">${i('filter',15)}<select id="tag-filter" aria-label="Filtrar contatos por tag"><option value="">Todas as tags</option>${tags.map(t=>`<option ${t===tag?'selected':''}>${h(t)}</option>`).join('')}</select></label>`:''}</div>`+(tab==='tasks'?table(['Tarefa','Contato','Prazo','Status',''],list.map(r=>row([`<b>${h(r.title)}</b>`,h(name(r.contactId,c)),date(r.due,c),`<button class="pill-button ${r.done?'completed':''}" data-task="${r.id}">${r.done?'Concluída':'Em aberto'}</button>`],'tasks',r.id)),empty('Nenhuma tarefa encontrada','Adicione uma tarefa para acompanhar os retornos.','check')):(()=>{const shown=list.filter(r=>!tag||r.tags.includes(tag));return bulkBar(c,'contacts')+table([pickHead('contacts',shown.map(r=>r.id)),'Nome','Telefone','E-mail','Empresa','Tags',''],shown.map(r=>row([pickBox('contacts',r.id),`<button class="identity" data-edit="contacts" data-id="${r.id}">${avatar(r.name)}<strong>${h(r.name)}</strong></button>`,h(r.phone||'—'),h(r.email||'—'),h(r.company||'—'),r.tags.map(t=>badge(t,'blue')).join(' ')||'—'],'contacts',r.id)),empty('Nenhum contato encontrado','Crie um contato ou tente outro filtro.','contacts'))})()));
}
function conversations(c) {
  return conversationPage(c,inboxPage);
}
function calendars(c){
  const y=c.month.getFullYear(), m=c.month.getMonth(), title=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(c.month), shift=(new Date(y,m,1).getDay()+6)%7, len=new Date(y,m+1,0).getDate(), tab=c.tab||'calendar';
  const keyFor=n=>`${y}-${String(m+1).padStart(2,'0')}-${String(n).padStart(2,'0')}`;
  const dates=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:c.s.profile.timezone});
  const cells=Array.from({length:Math.ceil((shift+len)/7)*7},(_,j)=>{const n=j+1-shift;if(n<1||n>len)return `<div class="day off" aria-hidden="true"></div>`;const k=keyFor(n), apps=c.s.appointments.filter(a=>dates.format(new Date(a.start))===k);return `<div class="day ${dates.format(new Date())===k?'today':''}"><button class="day-number" data-edit="appointments" data-date="${k}" aria-label="Agendar em ${k}">${n}</button>${apps.map(a=>`<button class="appointment ${a.status==='Canceled'?'cancelled':''}" data-edit="appointments" data-id="${a.id}">${h(a.title)}</button>`).join('')}</div>`;}).join('');
  return wrap(head('Calendários','',primary('Novo agendamento','appointments'),tabs([['calendar','Calendário'],['appointments','Agendamentos']],tab))+(tab==='calendar'?`<div class="surface calendar"><div class="calendar-head"><button class="icon-btn" data-act="prev-month" aria-label="Mês anterior">${i('left')}</button><b>${title}</b><button class="icon-btn" data-act="next-month" aria-label="Próximo mês">${i('right')}</button><div class="spacer"></div>${action('Hoje','this-month')}</div><div class="weekdays">${['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(a=>`<span>${a}</span>`).join('')}</div><div class="calendar-grid">${cells}</div></div>`:table(['Agendamento','Contato','Início','Fim','Status',''],[...c.s.appointments].sort((a,b)=>a.start.localeCompare(b.start)).map(r=>row([`<b>${h(r.title)}</b>`,h(name(r.contactId,c)),date(r.start,c,true),date(r.end,c,true),badge(r.status,r.status==='Canceled'?'red':'blue')],'appointments',r.id)),empty('Nenhum agendamento','Marque um agendamento para começar.','cal'))));
}
function opportunities(c){
  const {s} = c;
  const view = c.tab || 'pipeline';
  if (['forecast','bulk'].includes(view)) return opportunitiesTab(c,view);
  const pipeline = s.pipelines.find(item => item.id === c.pipeline) || s.pipelines[0];
  const stages = s.stages.filter(stage => stage.pipelineId === pipeline.id);
  const local = opportunityResults(s,pipeline.id,c.query,c.opportunityFilters,c.opportunitySort);
  const filters = c.opportunityFilters || { status:'Open' };
  const filterCount = Object.values(filters).filter(Boolean).length;
  const sections = tabs(crmTabs.opportunities.filter(([key]) => key !== 'list'),view === 'list' ? 'pipeline' : view);
  if (view === 'pipelines') {
    return wrap(head('Oportunidades','',action('Novo pipeline','new-pipeline','plus'),sections) + `<div class="card-grid">${s.pipelines.map(item => `
      <article class="surface padded resource"><div class="section-heading"><h2>${h(item.name)}</h2><button class="icon-btn" data-pipeline-edit="${item.id}" aria-label="Renomear ${h(item.name)}">${i('edit',15)}</button></div>
        ${s.stages.filter(stage => stage.pipelineId === item.id).map(stage => `<div class="line-item"><span>${h(stage.name)}${stage.visible === false ? ' · Oculta nos relatórios' : ''}</span>
          <button class="icon-btn" data-stage-edit="${stage.id}" aria-label="Editar ${h(stage.name)}">${i('edit',15)}</button></div>`).join('')}
        <button class="secondary" data-stage-new="${item.id}">${i('plus',15)} Adicionar etapa</button></article>`).join('')}</div>`);
  }
  const stageNames = new Map(stages.map(stage => [stage.id,stage.name]));
  const contacts = new Map(s.contacts.map(contact => [contact.id,contact]));
  const colors = status => status === 'Won' ? 'green' : ['Lost','Abandoned'].includes(status) ? 'red' : 'blue';
  const nothing = filterCount || c.query
    ? empty('Nenhuma oportunidade corresponde aos filtros','', 'filter', action('Limpar filtros','opportunity-clear','close'))
    : empty('Nenhuma oportunidade neste pipeline','', 'leads', primary('Adicionar oportunidade','opportunities'));
  const title = (item, className) => `<button class="${className}" data-edit="opportunities" data-id="${item.id}">${h(item.title)}</button>`;
  const list = table([pickHead('opportunities',local.map(x => x.id)),'Oportunidade','Contato','Etapa','Valor','Status','Responsável','Origem',''],local.map(item => row([pickBox('opportunities',item.id),
    title(item,'text-link'),h(contacts.get(item.contactId)?.name || '—'),h(stageNames.get(item.stage)),mt(item.value,c),
    badge(item.status,colors(item.status)),h(item.owner || '—'),h(item.source || '—')
  ],'opportunities',item.id)),nothing);
  const { layout, fields } = c.opportunityCard || opportunityPreferences(c.workspace,c.access?.session?.id);
  const card = item => {
    const contact = contacts.get(item.contactId);
    const values = {
      contact:h(contact?.name), company:h(item.company || contact?.company), owner:h(item.owner), source:h(item.source),
      value:mt(item.value,c), status:badge(item.status,colors(item.status)), closeDate:item.closeDate ? date(`${item.closeDate}T12:00:00Z`,c) : '',
      tags:item.tags?.map(tag => badge(tag)).join(' '), lostReason:item.status === 'Lost' ? h(item.lostReason) : ''
    };
    return `<article class="deal opportunity-card layout-${layout}" draggable="true" data-drag="${item.id}">
      <div class="opportunity-card-title">${title(item,'deal-title')}${pickBox('opportunities',item.id)}</div>
      <dl>${fields.filter(field => values[field]).map(field => `<div><dt${layout === 'unlabeled' ? ' class="sr-only"' : ''}>${cardFields[field]}</dt><dd>${values[field]}</dd></div>`).join('')}</dl>
      <label><span class="sr-only">Mover ${h(item.title)} para a etapa</span><select data-move="${item.id}">
      ${stages.map(stage => `<option value="${stage.id}" ${stage.id === item.stage ? 'selected' : ''}>${h(stage.name)}</option>`).join('')}</select></label>
    </article>`;
  };
  const board = `<div class="kanban">${stages.map((stage,index) => {
    const matches = local.filter(item => item.stage === stage.id);
    return `<section class="kanban-col tone-${index%4}" data-drop="${stage.id}"><div class="kanban-head">
      <h2>${h(stage.name)} <button class="icon-btn" data-edit="opportunities" data-stage="${stage.id}" aria-label="Adicionar em ${h(stage.name)}">${i('plus',15)}</button></h2>
      <div class="opportunity-stage-totals"><span>${matches.length} ${matches.length === 1 ? 'oportunidade' : 'oportunidades'}</span>
      <b>${mt(matches.reduce((sum,item) => sum + item.value,0),c)}</b></div></div>
      <div class="kanban-cards">${matches.map(card).join('')}</div></section>`;
  }).join('')}</div>${local.length ? '' : nothing}`;
  const quickStatus = [['','Todos os status'],...opportunityStatuses.map(status => [status,tr(status)])];
  return wrap(head('Oportunidades','',action('Importar','opportunity-import','upload') +
    action('Exportar','opportunity-export','download') + primary('Adicionar oportunidade','opportunities'),sections) +
    `<div class="toolbar opportunity-toolbar">
      <label class="tag-filter"><select data-opportunity-pipeline aria-label="Pipeline">${s.pipelines.map(item => `<option value="${item.id}" ${item.id === pipeline.id ? 'selected' : ''}>${h(item.name)}</option>`).join('')}</select></label>
      <span class="dim" role="status">${local.length} ${local.length === 1 ? 'oportunidade' : 'oportunidades'}</span>
      <div class="spacer"></div>
      <div class="opportunity-views" aria-label="Visualização">
        <button class="secondary" data-tab="pipeline" aria-pressed="${view === 'pipeline'}">${i('grid',15)} Quadro</button>
        <button class="secondary" data-tab="list" aria-pressed="${view === 'list'}">${i('list',15)} Lista</button>
      </div>
    </div><div class="toolbar opportunity-toolbar">
      <label class="tag-filter"><select data-opportunity-status aria-label="Status das oportunidades">${quickStatus.map(([value,label]) =>
        `<option value="${value}" ${value === (filters.status || '') ? 'selected' : ''}>${h(label)}</option>`).join('')}</select></label>
      ${action(`Filtros avançados${filterCount ? ` (${filterCount})` : ''}`,'opportunity-filters','filter')}
      ${action('Ordenar','opportunity-sort','sort')}
      <div class="spacer"></div>${search(c.query,'Buscar oportunidades…')}
      ${view === 'pipeline' ? action('Personalizar cartões','opportunity-fields','sliders') : ''}
    </div>${bulkBar(c,'opportunities')}${view === 'list' ? list : board}`);
}
function payments(c){
  if((c.tab||'invoices')!=='invoices') return paymentsTab(c,c.tab);
  const s=c.s, records=top(s.invoices,c.query,['title','status']);
  return wrap(head('Pagamentos','Acompanhe as faturas registradas neste workspace.',primary('Nova fatura','invoices'),tabs(crmTabs.payments,c.tab||'invoices'))+`<div class="metrics three"><div class="surface metric"><span>Saldo em aberto</span><b>${mt(s.invoices.filter(x=>x.status==='Open').reduce((a,r)=>a+r.value,0),c)}</b></div><div class="surface metric"><span>Pagamentos registrados</span><b>${mt(c.m.invoicesPaid,c)}</b></div><div class="surface metric"><span>Total de faturas</span><b>${s.invoices.length}</b></div></div><div class="toolbar">${search(c.query,'Buscar faturas…')}</div>`+table(['Fatura','Contato','Valor','Vencimento','Status',''],records.map(r=>row([`<b>${h(r.title)}</b>`,h(name(r.contactId,c)),mt(r.value,c),date(r.due,c),badge(r.status,r.status==='Paid'?'green':'blue')],'invoices',r.id)),empty('Nenhuma fatura registrada','Crie uma fatura em rascunho. Os pagamentos podem ser marcados manualmente aqui.','pay')));
}
function marketing(c){
  const t=c.tab||'social';
  if(t==='social') return socialPlanner(c,{head,tabsHtml:tabs([['social','Planejador social'],['email','E-mails']],t)});
  const channel='Email', records=top(c.s.campaigns.filter(x=>x.channel===channel),c.query,['name','body','status']);
  return wrap(head('Marketing','Rascunhe e organize campanhas. Publique ou envie pelo seu provedor quando estiver pronto.',primary(t==='social'?'Nova publicação':'Nova campanha','campaigns',`data-channel="${channel}"`),tabs([['social','Planejador social'],['email','E-mails']],t))+`<div class="toolbar">${search(c.query,'Buscar campanhas…')}</div>`+table(['Campanha','Conteúdo','Data planejada','Status',''],records.map(r=>row([`<b>${h(r.name)}</b>`,`<span class="ellipsis">${h(r.body)}</span>`,date(r.date,c),badge(r.status,r.status==='Planned'?'blue':'')],'campaigns',r.id)),empty('Nenhuma campanha','Crie seu primeiro rascunho para planejar o conteúdo.','send')));
}
function sites(c){
  if(!['forms','submissions'].includes(c.tab)) return sitesScreen(c);
  const t=c.tab||'funnels', p=t==='websites'?'Website':'Funnel', s=c.s;
  return wrap(head('Sites','Crie páginas de captura locais e receba envios.',t==='submissions'?'':t==='forms'?primary('Novo formulário','forms'):primary(p==='Website'?'Novo site':'Novo funil','pages',`data-kind="${p}"`),tabs([['funnels','Funis'],['websites','Sites'],['forms','Formulários'],['submissions','Envios']],t))+(t==='submissions'?table(['Formulário','Nome','E-mail','Recebido'],[...s.submissions].reverse().map(r=>`<tr><td>${h(s.forms.find(f=>f.id===r.formId)?.name||'Formulário excluído')}</td><td>${h(r.name||'—')}</td><td>${h(r.email||'—')}</td><td>${date(r.created,c,true)}</td></tr>`),empty('Nenhum envio','Publique um formulário e use o link local para captar um lead.','inbox')):`<div class="card-grid">${[...(t==='forms'?s.forms:s.pages.filter(r=>r.kind===p))].reverse().map(r=>`<article class="surface padded resource"><span class="metric-icon">${i(t==='forms'?'list':'site')}</span><div><h2>${h(r.name)}</h2><p>${h(r.headline||r.description||'')}</p></div>${badge(r.active?'Publicado localmente':'Draft',r.active?'green':'')}<div class="inline-gap">${r.active?viewLink('Abrir',t==='forms'?'f':'p',r.id,c):''}<button class="secondary" data-edit="${t==='forms'?'forms':'pages'}" data-id="${r.id}">${i('edit',15)} Editar</button></div></article>`).join('')||empty(t==='forms'?'Nenhum formulário ainda':t==='websites'?'Nenhum site ainda':'Nenhum funil ainda','Crie um item para visualizá-lo ou publicá-lo localmente.','site')}</div>`));
}
function memberships(c){
  if (c.tab !== 'courses') return portalAdminScreen(c);
  return `<section class="cp-admin"><h1>Assinaturas</h1>${portalNav('courses')}
    <div class="cp-section-title"><div><h2>Cursos</h2><p>Publique aulas para os clientes com acesso ao portal.</p></div>${primary('Novo curso','courses')}</div>
    <div class="card-grid">${c.s.courses.map(r=>`<article class="surface padded resource"><span class="metric-icon">${i('play')}</span>
      <div><h2>${h(r.name)}</h2><p>${h(r.description)}</p></div>${badge(r.active?(r.portalOnly?'No portal':'Publicado'):'Rascunho',r.active?'green':'')}
      <div class="inline-gap">${r.active&&!r.portalOnly?viewLink('Abrir aula','course',r.id,c):''}
        <button class="secondary" data-edit="courses" data-id="${h(r.id)}">${i('edit',15)} Editar</button></div></article>`).join('')
      ||empty('Nenhum curso','Adicione um curso e publique a primeira aula.','play')}</div></section>`;
}
function media(c){
  return wrap(head('Mídia Drive','Guarde imagens e PDFs no drive local.',action('Enviar arquivo','upload','upload'))+`<div class="toolbar">${search(c.query,'Buscar arquivos…')}</div><div class="card-grid">${top(c.s.files,c.query,['name']).map(r=>`<article class="surface resource media-card"><div class="media-preview">${r.data.startsWith('data:image/')?`<img src="${h(r.data)}" alt="">`:`${i('folder',44)} <b>PDF</b>`}</div><div class="media-name"><h2>${h(r.name)}</h2><button class="icon-btn" data-file="${r.id}" title="Baixar" aria-label="Baixar ${h(r.name)}">${i('download',16)}</button><button class="icon-btn" data-delete="files" data-id="${r.id}" title="Remover" aria-label="Remover ${h(r.name)}">${i('trash',16)}</button></div></article>`).join('')||empty('Nenhum arquivo enviado','Adicione uma imagem ou PDF do seu computador.','folder')}</div>`);
}
function reputation(c){
  return wrap(head('Reputação','Leia e responda às avaliações guardadas neste workspace.',primary('Adicionar avaliação','reviews'))+`<div class="metrics three"><div class="surface metric"><span>Nota média</span><b>${c.m.average.toFixed(1)} <small> / 5</small></b></div><div class="surface metric"><span>Total de avaliações</span><b>${c.m.reviews}</b></div><div class="surface metric"><span>Aguardando resposta</span><b>${c.s.reviews.filter(x=>!x.reply).length}</b></div></div>`+table(['Avaliador','Nota','Avaliação','Resposta',''],[...c.s.reviews].reverse().map(r=>row([`<b>${h(r.author)}</b>`,badge(`${r.score} / 5`,'pink'),`<span class="ellipsis">${h(r.text)}</span>`,`<span class="ellipsis">${h(r.reply||'—')}</span>`],'reviews',r.id)),empty('Nenhuma avaliação registrada','Adicione uma avaliação para acompanhar o feedback localmente.','award')));
}
function reporting(c){
  const view=c.tab || 'overview';
  const sections=tabs([['overview','Visão geral'],['snapshots','Relatórios do painel']],view);
  if (view==='snapshots') return wrap(head('Relatórios','', '', sections) + table(['Nome','Painel','Salvo em','Período',''],[...c.s.dashboardReports].reverse().map(report =>
    `<tr><td><b>${h(report.name)}</b></td><td>${h(tr(report.dashboard))}</td><td>${date(report.created,c,true)}</td><td>${h(report.start ? `${report.start} – ${report.end}` : 'Todo o período')}</td><td><button class="secondary" data-dashboard-report="${report.id}">Abrir relatório</button></td></tr>`),empty('Nenhum relatório do painel','Use “Enviar como relatório” em um painel para salvar uma cópia aqui.','chart')));
  const cols=['Módulo','Registros','Observações'], values=[['Contatos',c.m.contacts,'Todos os contatos salvos'],['Oportunidades',c.m.open,`Em aberto · ${mt(c.m.openValue,c)}`],['Negócios ganhos',c.m.won,`Ganhos · ${mt(c.m.wonValue,c)}`],['Agendamentos',c.m.appointments,'Não inclui agendamentos cancelados'],['Faturas',c.s.invoices.length,`${mt(c.m.invoicesPaid,c)} marcados como pagos`],['Envios de formulário',c.s.submissions.length,'Todos os envios recebidos'],['Fluxos',c.s.runs.length,'Execuções registradas']];
  return wrap(head('Relatórios','Resumo do workspace com base nos registros atuais.',action('Exportar relatório','export','download'),sections)+table(cols,values.map(r=>`<tr>${r.map((x,j)=>`<td>${j===0?`<b>${x}</b>`:x}</td>`).join('')}</tr>`),''));
}
function marketplace(c){
  const cards=[['Stripe','pay','Receba pagamentos de faturas e checkout.'],['Google Agenda','cal','Sincronize disponibilidade e agendamentos.'],['Twilio','chat','Ative SMS e voz nas conversas.'],['Perfil da Empresa no Google','award','Sincronize avaliações e dados da empresa.'],['Meta','send','Conecte Facebook e Instagram para publicar nas redes.'],['Provedor de e-mail','mail','Envie campanhas e e-mails para clientes.']];
  return wrap(head('Apps do marketplace','Conheça integrações que ampliariam este workspace.')+`<div class="toolbar">${search(c.query,'Buscar integrações…')}</div><div class="card-grid">${cards.filter(a=>a.join(' ').toLowerCase().includes(c.query.toLowerCase())).map(([n,ico,desc])=>`<article class="surface padded resource"><span class="metric-icon">${i(ico)}</span><div><h2>${n}</h2><p>${desc}</p></div>${badge('Não conectado')}<button class="secondary" data-provider="${n}">Ver requisitos</button></article>`).join('')||empty('Nenhuma integração encontrada','Tente outra busca.','apps')}</div>`);
}
function whatsappSubView(c){
  const w=c.wa;
  if(!w) return `<div class="surface padded sub-wa-card"><span class="ag-waha-icon" aria-hidden="true">${i('whatsapp',22)}</span><h2>WhatsApp</h2><p class="dim">Verificando conexão do WhatsApp desta subconta…</p></div>`;
  if(w.error) return `<div class="surface padded sub-wa-card"><span class="ag-waha-icon" aria-hidden="true">${i('whatsapp',22)}</span><h2>WhatsApp</h2><p class="form-status">${h(w.error)}</p><button class="secondary" data-act="wa-refresh">Tentar novamente</button></div>`;
  if(!w.available) return `<div class="surface padded sub-wa-card"><span class="ag-waha-icon" aria-hidden="true">${i('whatsapp',22)}</span><h2>WhatsApp ainda não disponível</h2><p class="dim">Peça ao administrador da agência para ativar a integração de WhatsApp nas configurações da agência.</p>${c.access?.agency?'<a class="primary" href="#agency/settings/whatsapp">Configurar na agência</a>':''}</div>`;
  if(!w.enabled) return `<div class="surface padded sub-wa-card"><span class="ag-waha-icon" aria-hidden="true">${i('whatsapp',22)}</span><h2>WhatsApp desativado nesta subconta</h2><p class="dim">O recurso de WhatsApp não está habilitado para este workspace no momento.</p></div>`;
  if(w.status==='connected'){
    return `<div class="ag-two">
      <div class="surface padded sub-wa-card">
        <span class="ag-waha-icon" aria-hidden="true">${i('whatsapp',24)}</span>
        <div class="inline-gap"><h2>${h(w.profileName||'WhatsApp conectado')}</h2>${badge('Conectado','green')}</div>
        <p class="dim">${w.phone?`Número conectado: <b>+${h(w.phone)}</b><br>`:''}Mensagens recebidas chegam automaticamente em <b>Conversas</b> e respostas pelo canal WhatsApp são enviadas por este número.</p>
        <div class="inline-gap">
          <a class="primary" href="#conversations">Abrir Conversas</a>
          <button class="secondary" data-act="wa-refresh">Atualizar status</button>
          <button class="secondary" data-act="wa-disconnect">Desconectar</button>
        </div>
      </div>
      <form class="surface padded settings-form" data-form="wa-test">
        <h2>Enviar mensagem de teste</h2>
        <p class="dim">Teste o disparo real pelo WhatsApp conectado nesta subconta.</p>
        <label>Número destino (com DDI)<input name="phone" required inputmode="numeric" placeholder="5511999999999"></label>
        <label>Mensagem<textarea name="text" required maxlength="2000" placeholder="Olá! Mensagem de teste enviada pela Soci."></textarea></label>
        <button class="primary">Enviar teste</button>
        <p class="form-status" role="alert"></p>
      </form>
    </div>`;
  }
  if(w.status==='connecting'){
    return `<div class="surface padded sub-wa-card">
      <div class="inline-gap"><h2>Escaneie o QR Code</h2>${badge('Aguardando leitura','blue')}</div>
      ${w.qrcode
        ? `<div class="ag-waha-qr-frame"><img src="${h(w.qrcode)}" alt="QR Code para conectar o WhatsApp"></div>
           <ol class="sub-wa-steps"><li>Abra o <b>WhatsApp</b> no seu celular</li><li>Toque em <b>Aparelhos conectados → Conectar aparelho</b></li><li>Aponte a câmera para este QR Code</li></ol>
           <small class="dim">A página detecta automaticamente assim que o celular confirmar a conexão.</small>`
        : w.paircode
          ? `<div class="ag-waha-code" aria-label="Código de pareamento">${h(w.paircode)}</div>
             <p class="dim">No WhatsApp: <b>Aparelhos conectados → Conectar aparelho → Conectar com número de telefone</b> e digite o código acima.</p>`
          : `<p class="dim">Preparando QR Code…</p>`}
      <div class="inline-gap">
        <button class="primary" data-act="wa-connect">Atualizar QR Code</button>
        <button class="secondary" data-act="wa-disconnect">Cancelar</button>
      </div>
    </div>`;
  }
  return `<div class="surface padded sub-wa-card">
    <span class="ag-waha-icon" aria-hidden="true">${i('whatsapp',24)}</span>
    <div class="inline-gap"><h2>Conectar WhatsApp</h2>${badge('Desconectado')}</div>
    <p class="dim">Conecte o número desta subconta em segundos: basta clicar abaixo e apontar a câmera do WhatsApp para o QR Code.</p>
    <div class="inline-gap">
      <button class="primary" data-act="wa-connect">${i('whatsapp',16)} Conectar WhatsApp</button>
      <button class="secondary" data-act="wa-toggle-pair">${c.waPairOpen?'Ocultar opção por número':'Conectar por número de telefone'}</button>
    </div>
    ${c.waPairOpen?`<form class="settings-form sub-wa-pair" data-form="wa-pair"><label>Seu número de WhatsApp (com DDI e DDD)<input name="phone" required inputmode="numeric" placeholder="5511999999999"></label><button class="secondary">Gerar código de 8 dígitos</button><p class="form-status" role="alert"></p></form>`:''}
  </div>`;
}
function settings(c){
  if(c.tab&&!['business','workspaces','whatsapp'].includes(c.tab)) return settingsTab(c,c.tab);
  const p=c.s.profile;
  return wrap(head('Configurações','Gerencie o workspace ativo.',action('Novo workspace','new-workspace','plus'),tabs(crmTabs.settings,c.tab||'business'))+(c.tab==='whatsapp'?whatsappSubView(c):c.tab==='workspaces'?`<div class="surface padded"><h2>Seus workspaces</h2>${c.workspaces.map(w=>`<div class="line-item"><b>${h(w.name)}</b>${w.id===c.workspace?badge('Atual','blue'):`<button class="secondary" data-workspace="${w.id}">Trocar</button>`}</div>`).join('')}</div>`:`<form data-form="profile" class="surface padded settings-form"><h2>Perfil da empresa</h2><div class="field-grid"><label>Nome do workspace<input name="name" value="${h(p.name)}" required></label><label>E-mail da empresa<input name="email" type="email" value="${h(p.email)}"></label><label>Telefone<input name="phone" value="${h(p.phone)}" type="tel"></label><label>Fuso horário<input name="timezone" value="${h(p.timezone)}" required></label><label>Moeda<input readonly value="Real brasileiro (BRL)"></label></div><button class="primary">Salvar alterações</button></form>`));
}
export const screens={'ask-ai':dashboard,dashboard,conversations,calendars,contacts,opportunities,automation:automationScreen,payments,marketing,sites,memberships,media,reputation,reporting,settings,studio,'ai-agents':agentsScreen};
export { date, empty, name, primary, row, search, table };

export function publicView(data,workspace){
  const {kind,row:r,form,brand}=data;
  const formHtml=f=>`<form class="surface padded settings-form lead-form" data-form="lead" data-id="${f.id}" data-workspace="${workspace}"><h2>${h(f.name)}</h2><p>${h(f.description)}</p><label>Nome<input name="name" required maxlength="240" autocomplete="name"></label><label>E-mail<input name="email" type="email" required autocomplete="email"></label>${f.askPhone?'<label>Telefone<input name="phone" type="tel" autocomplete="tel"></label>':''}<button class="primary">Enviar ${i('arrow',16)}</button><p class="form-status" role="status"></p></form>`;
  return `<div class="public-page"><header>${h(brand)} ${badge('Prévia local')}</header><main>${kind==='f'?formHtml(r):kind==='course'?`<article class="surface padded"><p class="dim">${h(r.name)}</p><h1>${h(r.lesson)}</h1><p>${h(r.description)}</p><div class="public-body">${h(r.body)}</div></article>`:`<section class="public-hero"><p>${h(r.name)}</p><h1>${h(r.headline)}</h1><p>${h(r.body)}</p>${r.button&&form?`<a class="primary" href="#lead">${h(r.button)} ${i('arrow',16)}</a>`:''}</section>${form?`<div id="lead">${formHtml(form)}</div>`:''}`}</main></div>`;
}
