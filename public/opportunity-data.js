export const cardFields = {
  contact:'Contato', company:'Empresa', owner:'Responsável', source:'Origem',
  value:'Valor', status:'Status', closeDate:'Previsão de fechamento', tags:'Tags', lostReason:'Motivo da perda'
};
export const cardLayouts = { default:'Padrão', compact:'Compacto', unlabeled:'Sem rótulos' };
export const opportunitySorts = {
  created:'Data de criação', updated:'Última alteração', title:'Nome da oportunidade',
  value:'Valor', closeDate:'Previsão de fechamento'
};

const initialFields = ['contact','owner','source','value','status','closeDate'];
export function opportunityPreferences(workspace, user, update) {
  const key = `soci.opportunities.${workspace}.${user || 'local'}`;
  try {
    if (update) localStorage.setItem(key, JSON.stringify(update));
    const saved = update || JSON.parse(localStorage.getItem(key) || '{}');
    return {
      layout:Object.hasOwn(cardLayouts,saved.layout) ? saved.layout : 'default',
      fields:Array.isArray(saved.fields) ? Object.keys(cardFields).filter(field => saved.fields.includes(field)) : initialFields
    };
  } catch { return update || { layout:'default', fields:initialFields }; }
}

const fold = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim();
const collator = new Intl.Collator('pt-BR', { sensitivity:'base', numeric:true });
export function opportunityResults(state, pipelineId, query, filters = { status:'Open' }, sort = {}) {
  const contacts = new Map(state.contacts.map(contact => [contact.id,contact]));
  const sortField = Object.hasOwn(opportunitySorts,sort.field) ? sort.field : 'created';
  const term = fold(query);
  const rows = state.opportunities.filter(record => {
    if (record.pipelineId !== pipelineId) return false;
    const contact = contacts.get(record.contactId);
    if (filters.status && record.status !== filters.status) return false;
    if (filters.stage && record.stage !== filters.stage) return false;
    if (filters.owner && !fold(record.owner).includes(fold(filters.owner))) return false;
    if (filters.source && !fold(record.source).includes(fold(filters.source))) return false;
    if (filters.tag && !record.tags?.some(tag => fold(tag).includes(fold(filters.tag)))) return false;
    if (filters.minValue && record.value < Number(filters.minValue)) return false;
    if (filters.maxValue && record.value > Number(filters.maxValue)) return false;
    return !term || [record.title,record.company,record.source,record.owner,contact?.name,contact?.email,contact?.phone]
      .some(value => fold(value).includes(term));
  });
  return rows.sort((left,right) => {
    const a = sortField === 'updated' ? left.updated || left.created : left[sortField];
    const b = sortField === 'updated' ? right.updated || right.created : right[sortField];
    if (a === b) return (right.created || '').localeCompare(left.created || '');
    if (a === '' || a == null) return 1;
    if (b === '' || b == null) return -1;
    const order = sortField === 'value' ? a - b : collator.compare(a,b);
    return sort.direction === 'asc' ? order : -order;
  });
}

export const opportunityCsvColumns = ['title','email','contactid','pipeline','stage','status','value','owner','source','company','closedate','tags','followers','lostreason'];
export function opportunityCsv(state, rows) {
  const lookup = records => new Map(records.map(row => [row.id,row.name]));
  const contacts = new Map(state.contacts.map(row => [row.id,row.email]));
  const pipelines = lookup(state.pipelines), stages = lookup(state.stages);
  const escape = value => {
    const raw = String(value ?? '');
    const safe = typeof value === 'string' && /^[\s]*[=+\-@]/.test(raw) ? "'" + raw : raw;
    return '"' + safe.replaceAll('"','""') + '"';
  };
  return '\uFEFF' + [opportunityCsvColumns,...rows.map(row => [
    row.title,contacts.get(row.contactId),row.contactId,pipelines.get(row.pipelineId),stages.get(row.stage),row.status,row.value,
    row.owner,row.source,row.company,row.closeDate,row.tags?.join(', '),row.followers?.join(', '),row.lostReason
  ])].map(line => line.map(escape).join(',')).join('\r\n');
}
