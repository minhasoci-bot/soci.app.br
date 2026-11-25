// The MCP tool catalog: what an AI can read and do in one sub-account. Reads come from the same filtered view the
// screens get (workspaceView) and writes go through the same commands (/api/action), so a tool can never see or do
// more than the key or person behind it.
import { denies } from './authorization.mjs';

const fail = (message, status = 400) => { throw denies(message, status); };

// ---- Input schemas -------------------------------------------------------------------------
const text = (description, more = {}) => ({ type: 'string', description, ...more });
const flag = description => ({ type: 'boolean', description });
const choice = (values, description) => ({ type: 'string', enum: values, description });
const texts = description => ({ type: 'array', items: { type: 'string' }, description });
const number = (description, more = {}) => ({ type: 'number', description, ...more });
const paging = {
  limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Quantos itens devolver (padrão 20, máximo 100).' },
  offset: { type: 'integer', minimum: 0, description: 'Quantos itens pular; use o nextOffset da resposta anterior.' }
};

const typeNames = { string: 'texto', number: 'número', integer: 'número inteiro', boolean: 'verdadeiro ou falso', array: 'lista' };
const isType = (type, value) => type === 'array' ? Array.isArray(value)
  : type === 'integer' ? Number.isInteger(value)
    : type === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === type;

/** The arguments of a call, checked against the tool's schema: an AI that invents a field is told so. */
export function checkArguments(schema, args) {
  if (args === undefined || args === null) args = {};
  if (typeof args !== 'object' || Array.isArray(args)) fail('Envie os argumentos como um objeto.');
  for (const name of schema.required || []) if (args[name] === undefined || args[name] === '') fail(`Informe o campo "${name}".`);
  for (const [name, value] of Object.entries(args)) {
    const rule = Object.hasOwn(schema.properties, name) ? schema.properties[name] : null;
    if (!rule) fail(`Campo desconhecido: "${name}".`);
    if (!isType(rule.type, value) || (rule.items && value.some(item => typeof item !== rule.items.type))) fail(`O campo "${name}" precisa ser ${typeNames[rule.type]}.`);
    if (rule.enum && !rule.enum.includes(value)) fail(`O campo "${name}" aceita: ${rule.enum.join(', ')}.`);
    if (rule.minimum !== undefined && value < rule.minimum) fail(`O campo "${name}" precisa ser no mínimo ${rule.minimum}.`);
    if (rule.maximum !== undefined && value > rule.maximum) fail(`O campo "${name}" precisa ser no máximo ${rule.maximum}.`);
  }
  return args;
}

// ---- Reading helpers -----------------------------------------------------------------------
function page(key, rows, args, shape) {
  const limit = args.limit ?? 20, offset = args.offset ?? 0;
  const next = offset + limit;
  return { [key]: rows.slice(offset, next).map(shape), total: rows.length, ...(next < rows.length ? { nextOffset: next } : {}) };
}
const newest = field => (a, b) => String(b[field] || b.created || '').localeCompare(String(a[field] || a.created || ''));
const moment = (value, name) => {
  if (value === undefined) return null;
  const at = Date.parse(value);
  return Number.isFinite(at) ? at : fail(`O campo "${name}" precisa ser uma data ISO, como 2026-12-01T14:00:00Z.`);
};
const rowOf = (state, key, id, label) => (state[key] || []).find(row => row.id === id) || fail(`${label} não encontrado(a).`, 404);
const nameOf = (state, id) => state.contacts.find(row => row.id === id)?.name || '';
const contains = (value, query) => String(value || '').toLowerCase().includes(query);

const contactShape = ({ id, name, email, phone, company, tags, created }) => ({ id, name, email, phone, company, tags: tags || [], created });
const postShape = state => post => ({
  id: post.id, summary: post.summary, status: post.status, scheduleDate: post.scheduleDate, type: post.type, error: post.error || '',
  accounts: (post.accountIds || []).map(id => state.socialAccounts.find(row => row.id === id)?.name).filter(Boolean)
});
const messageShape = ({ id, channel, direction, body, subject, created, failed }) => ({ id, channel, direction, body, ...(subject ? { subject } : {}), created, ...(failed ? { failed: true } : {}) });

const sendChannels = ['WhatsApp', 'Email', 'Instagram', 'Facebook'];
const failureText = {
  'not-connected': 'o canal não está conectado nesta subconta', not_connected: 'o canal não está conectado nesta subconta',
  no_phone: 'o contato não tem telefone', no_email: 'o contato não tem e-mail', provider_error: 'o provedor recusou o envio'
};

// ---- Catalog -------------------------------------------------------------------------------
// [name, module, access, title, description, properties, required, run]. access: 'read', 'write' (changes the
// sub-account) or 'send' (reaches people outside it). run gets { state, args, act } and act runs one command.
const read = (name, module, title, description, properties, run, required = []) => ({ name, module, access: 'read', title, description, properties, required, run });
const write = (name, module, title, description, properties, required, run, access = 'write') => ({ name, module, access, title, description, properties, required, run });

const catalog = [
  // Marketing
  read('list_social_accounts', 'marketing', 'Listar redes sociais', 'Lista as redes sociais conectadas na subconta e a situação de cada uma.', {}, ({ state }) => {
    const accounts = state.socialAccounts.map(({ id, provider, name, handle, status }) => ({ id, provider, name, handle, status }));
    return { accounts, count: accounts.length };
  }),
  read('list_scheduled_posts', 'marketing', 'Listar posts', 'Lista os posts do planejador social, do mais recente para o mais antigo.',
    { status: choice(['all', 'scheduled', 'in_review', 'draft', 'in_progress', 'published', 'failed'], 'Situação do post (padrão: todas).'), ...paging },
    ({ state, args }) => page('posts', state.socialPosts.filter(post => !args.status || args.status === 'all' || post.status === args.status).sort(newest('scheduleDate')), args, postShape(state))),
  read('get_social_analytics', 'marketing', 'Resumo dos posts', 'Conta os posts por situação e lista as redes conectadas. Não traz curtidas nem alcance.', {}, ({ state }) => {
    const count = status => state.socialPosts.filter(post => post.status === status).length;
    return {
      totalAccounts: state.socialAccounts.length,
      connectedAccounts: state.socialAccounts.filter(row => row.status === 'connected').map(row => `${row.name} (${row.provider})`),
      postsSummary: { total: state.socialPosts.length, published: count('published'), scheduled: count('scheduled'), inReview: count('in_review'), draft: count('draft'), failed: count('failed') }
    };
  }),
  write('create_social_post', 'marketing', 'Criar post', 'Cria um rascunho, agenda ou publica um post. Sem data e sem modo, vira rascunho.', {
    summary: text('Texto do post.'), accountIds: texts('IDs das redes (de list_social_accounts).'),
    scheduleDate: text('Data e hora ISO, como 2026-12-01T14:00:00Z.'),
    mode: choice(['schedule', 'draft', 'now'], '"schedule" agenda, "draft" guarda o rascunho, "now" publica em seguida.'),
    type: choice(['post', 'story', 'reel'], 'Formato (padrão: post).'), mediaUrls: texts('Endereços https de imagens ou de um vídeo.'),
    link: text('Link do post.'), firstComment: text('Primeiro comentário.'), needsApproval: flag('Se verdadeiro, o post espera aprovação antes de sair.')
  }, ['summary', 'accountIds'], async ({ args, act }) => {
    const { mediaUrls = [], ...data } = args;
    const { id, state } = await act({ type: 'social-post', data: { ...data, mode: args.mode || (args.scheduleDate ? 'schedule' : 'draft'), media: mediaUrls.map(url => ({ url })) } });
    return { success: true, postId: id, status: state.socialPosts.find(post => post.id === id)?.status };
  }, 'send'),
  write('reschedule_social_post', 'marketing', 'Reagendar post', 'Muda a data de um post que ainda não saiu.',
    { postId: text('ID do post.'), scheduleDate: text('Nova data e hora ISO.') }, ['postId', 'scheduleDate'],
    async ({ args, act }) => { await act({ type: 'social-reschedule', id: args.postId, data: { scheduleDate: args.scheduleDate } }); return { success: true, postId: args.postId }; }, 'send'),
  write('review_social_post', 'marketing', 'Aprovar ou recusar post', 'Aprova (o post fica agendado) ou recusa (volta a rascunho) um post em revisão.',
    { postId: text('ID do post.'), decision: choice(['approved', 'rejected'], 'Decisão.'), note: text('Comentário para a equipe.') }, ['postId', 'decision'],
    async ({ args, act }) => { await act({ type: 'social-review', id: args.postId, data: { decision: args.decision, note: args.note } }); return { success: true, postId: args.postId }; }, 'send'),

  // Contacts and tasks
  read('list_crm_contacts', 'contacts', 'Listar contatos', 'Busca contatos por nome, e-mail, telefone, empresa ou etiqueta.',
    { query: text('Trecho do nome, e-mail, telefone ou empresa.'), tag: text('Etiqueta exata.'), ...paging }, ({ state, args }) => {
      const query = (args.query || '').toLowerCase();
      const rows = state.contacts.filter(row => (!args.tag || (row.tags || []).includes(args.tag)) &&
        (!query || [row.name, row.email, row.phone, row.company].some(value => contains(value, query))));
      return page('contacts', rows, args, contactShape);
    }),
  read('get_contact', 'contacts', 'Ver contato', 'Mostra um contato com notas, campos personalizados e tarefas.', { contactId: text('ID do contato.') }, ({ state, args }) => {
    const row = rowOf(state, 'contacts', args.contactId, 'Contato');
    const custom = Object.fromEntries(Object.entries(row.custom || {}).map(([id, value]) => [state.customFields.find(field => field.id === id)?.name || id, value]));
    return { contact: { ...contactShape(row), notes: row.notes || '', dnd: Boolean(row.dnd), custom },
      tasks: state.tasks.filter(task => task.contactId === row.id).map(({ id, title, due, done }) => ({ id, title, due, done })) };
  }, ['contactId']),
  write('create_contact', 'contacts', 'Criar contato', 'Cadastra um contato. Recusa e-mail ou telefone repetido, se a subconta não aceita duplicados.', {
    name: text('Nome.'), email: text('E-mail.'), phone: text('Telefone com DDI e DDD.'), company: text('Empresa.'), tags: texts('Etiquetas.'), notes: text('Observações.')
  }, ['name'], async ({ args, act }) => ({ success: true, contactId: (await act({ type: 'save', key: 'contacts', data: args })).id })),
  write('update_contact', 'contacts', 'Atualizar contato', 'Muda só os campos informados de um contato.', {
    contactId: text('ID do contato.'), name: text('Nome.'), email: text('E-mail.'), phone: text('Telefone.'), company: text('Empresa.'), notes: text('Observações (substitui as atuais).'),
    addTags: texts('Etiquetas para incluir.'), removeTags: texts('Etiquetas para tirar.'), dnd: flag('Não perturbe.')
  }, ['contactId'], async ({ state, args, act }) => {
    const { contactId, addTags = [], removeTags = [], ...changes } = args;
    const row = rowOf(state, 'contacts', contactId, 'Contato');
    const tags = [...new Set([...(row.tags || []), ...addTags])].filter(tag => !removeTags.includes(tag));
    await act({ type: 'save', key: 'contacts', id: contactId, data: { ...row, ...changes, tags } });
    return { success: true, contactId };
  }),
  read('list_tasks', 'contacts', 'Listar tarefas', 'Lista as tarefas, pela data de vencimento.',
    { status: choice(['open', 'done', 'all'], 'Situação (padrão: open).'), contactId: text('Só as deste contato.'), ...paging }, ({ state, args }) => {
      const status = args.status || 'open';
      const rows = state.tasks.filter(row => (status === 'all' || Boolean(row.done) === (status === 'done')) && (!args.contactId || row.contactId === args.contactId));
      return page('tasks', rows.sort((a, b) => String(a.due || '9').localeCompare(String(b.due || '9'))), args,
        ({ id, title, due, done, contactId, owner, notes }) => ({ id, title, due, done: Boolean(done), contactId, contact: nameOf(state, contactId), owner, notes }));
    }),
  write('create_task', 'contacts', 'Criar tarefa', 'Cria uma tarefa, ligada ou não a um contato.',
    { title: text('Título.'), contactId: text('ID do contato.'), due: text('Vencimento em data ISO.'), notes: text('Detalhes.'), owner: text('Responsável.') }, ['title'],
    async ({ args, act }) => ({ success: true, taskId: (await act({ type: 'save', key: 'tasks', data: args })).id })),
  write('complete_task', 'contacts', 'Concluir tarefa', 'Marca uma tarefa como concluída.', { taskId: text('ID da tarefa.') }, ['taskId'], async ({ state, args, act }) => {
    await act({ type: 'save', key: 'tasks', id: args.taskId, data: { ...rowOf(state, 'tasks', args.taskId, 'Tarefa'), done: true } });
    return { success: true, taskId: args.taskId };
  }),

  // Opportunities
  read('list_pipelines', 'opportunities', 'Listar funis', 'Lista os funis de venda e as etapas de cada um.', {}, ({ state }) => ({
    pipelines: state.pipelines.map(({ id, name }) => ({ id, name, stages: state.stages.filter(stage => stage.pipelineId === id).map(stage => ({ id: stage.id, name: stage.name })) }))
  })),
  read('list_opportunities', 'opportunities', 'Listar oportunidades', 'Lista as oportunidades, das mais recentes para as mais antigas.',
    { pipelineId: text('Só deste funil.'), stageId: text('Só desta etapa.'), contactId: text('Só deste contato.'), status: choice(['Open', 'Won', 'Lost', 'Abandoned'], 'Situação.'), ...paging },
    ({ state, args }) => page('opportunities', state.opportunities.filter(row => (!args.pipelineId || row.pipelineId === args.pipelineId) && (!args.stageId || row.stage === args.stageId) &&
      (!args.contactId || row.contactId === args.contactId) && (!args.status || row.status === args.status)).sort(newest('updated')), args,
    ({ id, title, contactId, stage, pipelineId, value, status, owner, closeDate }) => ({ id, title, contactId, contact: nameOf(state, contactId), stageId: stage,
      stage: state.stages.find(row => row.id === stage)?.name || '', pipelineId, value, status, owner, closeDate }))),
  write('create_opportunity', 'opportunities', 'Criar oportunidade', 'Cria uma oportunidade numa etapa do funil.',
    { title: text('Nome.'), contactId: text('ID do contato.'), stageId: text('ID da etapa (de list_pipelines).'), value: number('Valor.', { minimum: 0 }), source: text('Origem.'), closeDate: text('Previsão de fechamento, AAAA-MM-DD.') },
    ['title', 'contactId', 'stageId'], async ({ args, act }) => {
      const { stageId, ...data } = args;
      return { success: true, opportunityId: (await act({ type: 'save', key: 'opportunities', data: { ...data, stage: stageId } })).id };
    }),
  write('move_opportunity', 'opportunities', 'Mover oportunidade', 'Leva uma oportunidade para outra etapa.',
    { opportunityId: text('ID da oportunidade.'), stageId: text('ID da etapa de destino.') }, ['opportunityId', 'stageId'],
    async ({ args, act }) => { await act({ type: 'opportunity-move', id: args.opportunityId, data: { stage: args.stageId } }); return { success: true, opportunityId: args.opportunityId }; }),
  write('set_opportunity_status', 'opportunities', 'Mudar situação da oportunidade', 'Marca uma oportunidade como aberta, ganha, perdida ou abandonada.',
    { opportunityId: text('ID da oportunidade.'), status: choice(['Open', 'Won', 'Lost', 'Abandoned'], 'Situação.'), lostReason: text('Motivo, quando perdida.') }, ['opportunityId', 'status'],
    async ({ state, args, act }) => {
      const row = rowOf(state, 'opportunities', args.opportunityId, 'Oportunidade');
      await act({ type: 'save', key: 'opportunities', id: row.id, data: { ...row, status: args.status, lostReason: args.lostReason ?? row.lostReason } });
      return { success: true, opportunityId: row.id };
    }),

  // Calendars
  read('list_appointments', 'calendars', 'Listar compromissos', 'Lista os compromissos por data de início.',
    { from: text('Início do período, em data ISO.'), to: text('Fim do período, em data ISO.'), contactId: text('Só deste contato.'), ...paging }, ({ state, args }) => {
      const from = moment(args.from, 'from'), to = moment(args.to, 'to');
      const rows = state.appointments.filter(row => (from === null || Date.parse(row.start) >= from) && (to === null || Date.parse(row.start) < to) && (!args.contactId || row.contactId === args.contactId));
      return page('appointments', rows.sort((a, b) => String(a.start).localeCompare(String(b.start))), args,
        ({ id, title, contactId, start, end, status, notes }) => ({ id, title, contactId, contact: nameOf(state, contactId), start, end, status, notes }));
    }),
  write('create_appointment', 'calendars', 'Marcar compromisso', 'Marca um compromisso. Recusa conflito de horário com o mesmo profissional ou recurso.',
    { title: text('Título.'), start: text('Início em data ISO.'), end: text('Fim em data ISO.'), contactId: text('ID do contato.'), notes: text('Observações.') }, ['title', 'start', 'end'],
    async ({ args, act }) => ({ success: true, appointmentId: (await act({ type: 'save', key: 'appointments', data: args })).id })),
  write('cancel_appointment', 'calendars', 'Cancelar compromisso', 'Cancela um compromisso, sem apagar.', { appointmentId: text('ID do compromisso.') }, ['appointmentId'], async ({ state, args, act }) => {
    const row = rowOf(state, 'appointments', args.appointmentId, 'Compromisso');
    await act({ type: 'save', key: 'appointments', id: row.id, data: { ...row, status: 'Canceled' } });
    return { success: true, appointmentId: row.id };
  }),

  // Conversations
  read('list_conversations', 'conversations', 'Listar conversas', 'Lista as conversas, da mensagem mais recente para a mais antiga.',
    { unreadOnly: flag('Só conversas com mensagem não lida.'), ...paging }, ({ state, args }) => {
      const byContact = new Map();
      for (const message of state.messages) {
        const row = byContact.get(message.contactId) || { contactId: message.contactId, contact: nameOf(state, message.contactId), unread: 0 };
        if (message.direction === 'Inbound' && !message.read) row.unread++;
        if (!row.at || String(message.created) >= row.at) Object.assign(row, { lastMessage: message.body, channel: message.channel, direction: message.direction, at: String(message.created) });
        byContact.set(message.contactId, row);
      }
      const rows = [...byContact.values()].filter(row => !args.unreadOnly || row.unread).sort((a, b) => b.at.localeCompare(a.at));
      return page('conversations', rows, args, row => row);
    }),
  read('get_conversation', 'conversations', 'Ver conversa', 'Mostra as mensagens mais recentes de um contato, em ordem de chegada.',
    { contactId: text('ID do contato.'), limit: paging.limit }, ({ state, args }) => {
      const row = rowOf(state, 'contacts', args.contactId, 'Contato');
      const messages = state.messages.filter(message => message.contactId === row.id);
      return { contact: { id: row.id, name: row.name }, messages: messages.slice(-(args.limit ?? 20)).map(messageShape), total: messages.length };
    }, ['contactId']),
  write('send_social_message', 'conversations', 'Enviar mensagem', 'Envia uma mensagem a um contato e registra na conversa. A resposta diz se ela saiu de verdade.',
    { contactId: text('ID do contato.'), body: text('Texto.'), channel: choice([...sendChannels, 'SMS', 'Live chat', 'Note'], 'Canal de envio. "Note" grava uma nota interna.'), subject: text('Assunto, só no e-mail.') },
    ['contactId', 'body', 'channel'], async ({ state, args, act }) => {
      if (args.channel === 'Note') return note({ args, act });
      if (!sendChannels.includes(args.channel)) fail(`O canal ${args.channel} não envia por aqui. Use: ${sendChannels.join(', ')}.`);
      if (rowOf(state, 'contacts', args.contactId, 'Contato').dnd) fail('Este contato está em não perturbe.', 409);
      const { id, delivery } = await act({ type: 'message', data: { ...args, direction: 'Outbound' } });
      const sent = Boolean(delivery?.sent);
      const reason = delivery ? delivery.reason || 'provider_error' : 'no_phone';
      return { sent, messageId: id, ...(sent ? {} : { reason: failureText[reason] || reason }) };
    }, 'send'),
  write('add_contact_note', 'conversations', 'Anotar na conversa', 'Grava uma nota interna na conversa. O contato não recebe.',
    { contactId: text('ID do contato.'), body: text('Texto da nota.') }, ['contactId', 'body'], ({ args, act }) => note({ args, act })),

  // Automation, payments, sites
  read('list_workflows', 'automation', 'Listar fluxos', 'Lista os fluxos de automação e se estão publicados.', paging,
    ({ state, args }) => page('workflows', state.workflows, args, ({ id, name, active }) => ({ id, name, active: Boolean(active) }))),
  write('enroll_contact_in_workflow', 'automation', 'Inscrever em fluxo', 'Inscreve um contato num fluxo publicado. As ações do fluxo, inclusive envios, passam a rodar.',
    { workflowId: text('ID do fluxo.'), contactId: text('ID do contato.') }, ['workflowId', 'contactId'],
    async ({ args, act }) => { await act({ type: 'workflow-enroll', id: args.workflowId, data: { contactId: args.contactId } }); return { success: true }; }, 'send'),
  read('list_invoices', 'payments', 'Listar faturas', 'Lista as faturas, das mais recentes para as mais antigas.',
    { status: choice(['Draft', 'Open', 'Paid', 'Void'], 'Situação.'), contactId: text('Só deste contato.'), ...paging },
    ({ state, args }) => page('invoices', state.invoices.filter(row => (!args.status || row.status === args.status) && (!args.contactId || row.contactId === args.contactId)).sort(newest('created')), args,
      ({ id, title, contactId, value, due, status }) => ({ id, title, contactId, contact: nameOf(state, contactId), value, due, status }))),
  read('list_sites', 'sites', 'Listar sites', 'Lista os sites e funis do estúdio e quando foram publicados.', paging,
    ({ state, args }) => page('sites', state.studioProjects, args, ({ id, name, kind, publishedAt }) => ({ id, name, kind, publishedAt: publishedAt || '' })))
];

async function note({ args, act }) {
  const { id } = await act({ type: 'message', data: { contactId: args.contactId, body: args.body, channel: 'Note', direction: 'Outbound' } });
  return { success: true, messageId: id };
}

export const mcpTools = catalog.map(tool => ({
  ...tool,
  scope: `${tool.module}.${tool.access === 'read' ? 'read' : 'write'}`,
  inputSchema: { type: 'object', properties: tool.properties, required: tool.required, additionalProperties: false }
}));
