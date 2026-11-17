import { randomUUID } from 'node:crypto';
import { auditAreas } from './ui/agency-data.js';
import { blankProspecting, folded, prospectLeadStatus, prospectSections, prospectSources, prospectThemes } from './ui/prospecting-data.js';

const now = () => new Date().toISOString();
function bad(message,status = 400) { throw Object.assign(new Error(message),{status}); }
const text = (v,limit = 150) => typeof v === 'string' ? v.trim().slice(0,limit) : '';
const required = (v,label,limit) => text(v,limit) || bad(`Informe ${label}.`);
const enabled = v => v === true || v === 'true' || v === 'on';
const record = (list,id) => list.find(item => item.id === id) || bad('Registro não encontrado.',404);

function prospectWebsite(value) {
  const input = text(value,1600);
  if (!input) return '';
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(input) ? input : `https://${input}`);
    if (['http:','https:'].includes(url.protocol) && !url.username && !url.password && url.hostname.includes('.')) return url.href;
  } catch { /* Validate below. */ }
  return bad('Informe um endereço de site HTTP ou HTTPS válido.');
}

function email(value) {
  const v = text(value,240).toLowerCase();
  if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) bad('Informe um e-mail válido.');
  return v;
}

function number(value,max) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) bad(`Informe um número entre 0 e ${max}.`);
  return Math.round(n*10)/10;
}

function dataFields(d) {
  return { name:required(d.name,'o nome da empresa',140), website:prospectWebsite(d.website), phone:text(d.phone,40),
    address:text(d.address,220), city:text(d.city,100), region:text(d.region,100), country:text(d.country,80) || 'Brasil', postal:text(d.postal,24),
    category:text(d.category,100), owner:text(d.owner,120), email:email(d.email), contactPhone:text(d.contactPhone,40) };
}

function validCategories(agency, input) {
  const ids = Array.isArray(input) ? input.slice(0,30) : [];
  const allowed = new Set(agency.prospecting.categories.map(item => item.id));
  return [...new Set(ids.filter(id => allowed.has(id)))];
}

function signals(row) {
  const values = Object.fromEntries(auditAreas.map(([key]) => [key,row[`score_${key}`] ?? null]));
  if (values.reviews === null && Number.isFinite(row.rating)) values.reviews = row.rating*2;
  return values;
}

function buildProspectReport(agency,row) {
  const summary = signals(row);
  return { generated:now(), signals:summary, brand:structuredClone(agency.prospecting.brand),
    sections:structuredClone(agency.prospecting.sections), business:{ name:row.name,website:row.website || '',city:row.city || '',
      address:row.address || '',region:row.region || '',postal:row.postal || '',country:row.country || '',category:row.category || '',
      rating:row.rating ?? null,reviews:row.reviews ?? null,placeId:row.placeId || '' } };
}

export function hydrateProspecting(agency) {
  const defaults = blankProspecting();
  agency.prospecting = { ...defaults,...agency.prospecting };
  agency.prospecting.brand = { ...defaults.brand,...agency.prospecting.brand };
  for (const row of agency.prospects) {
    row.source ||= 'Manual';
    row.categories ||= [];
    row.entries ||= row.notes ? [{ id:`legacy-${row.id}`, text:row.notes, created:row.created }] : [];
    row.transfers ||= {};
    row.views ||= {};
    if (!row.report && auditAreas.some(([key]) => Number.isFinite(row[`score_${key}`]))) {
      row.report = { ...buildProspectReport(agency,row), generated:row.updated || row.created };
    }
  }
  return agency;
}

function createProspect(agency,data,source = 'Manual') {
  if (agency.prospects.length >= 500) bad('A agência pode guardar até 500 prospects.');
  const row = { id:randomUUID(), created:now(), ...dataFields(data), status:'Open',source,categories:validCategories(agency,data.categories),
    entries:[],transfers:{},views:{},placeId:text(data.placeId,220),rating:number(data.rating,5),reviews:number(data.reviews,10000000) };
  if (enabled(data.audit)) row.report=buildProspectReport(agency,row);
  agency.prospects.push(row);
  return row;
}

function saveProspect(agency,id,data) {
  if (!id) return createProspect(agency,data).id;
  const row = record(agency.prospects,id);
  Object.assign(row,dataFields(data),{ categories:validCategories(agency,data.categories), updated:now() });
  return id;
}

function saveCategory(agency,id,data) {
  const list = agency.prospecting.categories;
  const name = required(data.name,'o nome da categoria',70);
  if (list.some(item => item.id !== id && folded(item.name) === folded(name))) bad('Já existe uma categoria com esse nome.');
  if (id) { record(list,id).name=name; return id; }
  if (list.length >= 70) bad('Você pode criar até 70 categorias.');
  const item = { id:randomUUID(),name };
  list.push(item);
  return item.id;
}

function saveWidget(agency,id,data) {
  const list = agency.prospecting.widgets;
  const fields = { name:required(data.name,'o nome do widget',80), headline:required(data.headline,'o título do formulário',110),
    description:text(data.description,500), button:text(data.button,50) || 'Enviar', askPhone:enabled(data.askPhone),
    active:enabled(data.active), audit:enabled(data.audit), theme:Object.hasOwn(prospectThemes,data.theme) ? data.theme : 'blue' };
  if (id) { Object.assign(record(list,id),fields); return id; }
  if (list.length >= 30) bad('Você pode criar até 30 widgets.');
  const widget = { ...fields, id:randomUUID(), created:now() };
  list.push(widget);
  return widget.id;
}

function saveAgent(agency,id,data) {
  const list = agency.prospecting.agents;
  const niches = [...new Set(text(data.niches,400).split(',').map(word => word.trim().slice(0,80)).filter(Boolean))];
  if (!niches.length || niches.length > 3) bad('Informe de um a três nichos, separados por vírgulas.');
  const fields = { name:required(data.name,'o nome do agente',90), niches,
    location:required(data.location,'a região de busca',140), radius:[2,5,10,20,30].includes(Number(data.radius)) ? Number(data.radius) : 5 };
  if (id) { Object.assign(record(list,id),fields); return id; }
  if (list.length >= 15) bad('Você pode guardar até 15 agentes.');
  const agent = { ...fields,id:randomUUID() };
  list.push(agent);
  return agent.id;
}

export function runProspectingAction(agency,command) {
  const { op,id,data:d = {} } = command;
  if (op === 'save') return saveProspect(agency,id,d);
  if (op === 'category') return saveCategory(agency,id,d);
  if (op === 'category-delete') {
    record(agency.prospecting.categories,id);
    agency.prospecting.categories = agency.prospecting.categories.filter(item => item.id !== id);
    for (const row of agency.prospects) row.categories=row.categories.filter(key => key !== id);
    return id;
  }
  if (op === 'categorize') {
    const ids = Array.isArray(d.ids) ? [...new Set(d.ids.slice(0,500))] : [];
    const category = record(agency.prospecting.categories,d.category);
    if (!ids.length) bad('Selecione pelo menos um prospect.');
    for (const key of ids) {
      const row = record(agency.prospects,key);
      if (!row.categories.includes(category.id)) row.categories.push(category.id);
    }
    return ids.length;
  }
  if (op === 'widget') return saveWidget(agency,id,d);
  if (op === 'agent') return saveAgent(agency,id,d);
  if (op === 'brand') {
    if (!Object.hasOwn(prospectThemes,d.theme)) bad('Escolha um tema.');
    agency.prospecting.brand = { theme:d.theme, title:required(d.title,'o título do relatório',100),intro:text(d.intro,600),footer:text(d.footer,300) };
    return true;
  }
  if (op === 'sections') {
    const order = Array.isArray(d.order) ? d.order : [];
    if (order.length !== Object.keys(prospectSections).length || new Set(order).size !== order.length || order.some(key => !Object.hasOwn(prospectSections,key))) bad('A ordenação contém uma seção inválida.');
    const visible = Array.isArray(d.visible) ? d.visible : [];
    if (!order.some(key => visible.includes(key))) bad('Mantenha pelo menos uma seção visível.');
    agency.prospecting.sections = order.map(key => ({key,visible:visible.includes(key)}));
    return true;
  }
  if (op === 'save-maps') {
    const placeIds = Array.isArray(d.placeIds) ? [...new Set(d.placeIds.slice(0,20))] : [];
    if (!placeIds.length) bad('Selecione pelo menos um resultado.');
    const created = [];
    for (const placeId of placeIds) {
      if (typeof placeId !== 'string' || !/^[\w-]{1,220}$/.test(placeId)) bad('O identificador do Maps é inválido.');
      if (agency.prospects.some(row => row.placeId === placeId)) continue;
      created.push(createProspect(agency,{ name:'Prospect do Maps', placeId },d.fromAI === true ? 'AI' : 'Maps').id);
    }
    return created;
  }

  const row = record(agency.prospects,id);
  if (op === 'status') {
    if (!Object.hasOwn(prospectLeadStatus,d.value)) bad('Escolha um status válido.');
    row.status=d.value; row.statusAt=now();
  } else if (op === 'note') {
    if (row.entries.length >= 60) bad('Este prospect pode guardar até 60 notas.');
    row.entries.unshift({ id:randomUUID(),text:required(d.text,'a nota',2400),created:now() });
  } else if (op === 'audit') {
    for (const [key] of auditAreas) if (Object.hasOwn(d,`score_${key}`)) row[`score_${key}`]=number(d[`score_${key}`],10);
    row.report=buildProspectReport(agency,row);
  } else if (op === 'share') {
    if (!row.report) bad('Gere uma auditoria primeiro.');
    row.shareId ||= randomUUID();
    return row.shareId;
  } else if (op === 'unshare') {
    delete row.shareId;
  } else if (op === 'archive') {
    row.archived=enabled(d.archived);
  } else {
    bad('Ação de prospecção desconhecida.',404);
  }
  return id;
}

export function captureProspectWidget(agency,id,data) {
  const widget = agency.prospecting.widgets.find(item => item.id === id && item.active);
  if (!widget) bad('Formulário indisponível.',404);
  const contact = email(required(data.email,'o e-mail',240));
  const name = required(data.name,'o nome da empresa',140);
  const existing = agency.prospects.find(row => row.widgetId === id && row.email === contact && folded(row.name) === folded(name));
  if (existing) return existing.id;
  const row = createProspect(agency,{ name,email:contact,website:data.website,phone:widget.askPhone ? data.phone : '',audit:widget.audit },'Widget');
  row.widgetId=id;
  return row.id;
}
