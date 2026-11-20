// Workflows: the catalog shared by the engine (server) and the builder (browser) — triggers with their
// filters, actions with their fields, condition subjects and operators, and template variables.
import { tr } from './i18n.js';

// Field kinds: text, textarea, number, select (static options), ref (options from workspace records), tags, time, datetime, conditions.
const f = (key, label, kind = 'text', extra = {}) => ({ key, label, kind, ...extra });

export const refSources = {
  forms: s => s.forms.filter(row => (row.kind || 'form') === 'form').map(row => [row.id, row.name]),
  surveys: s => s.forms.filter(row => row.kind === 'survey').map(row => [row.id, row.name]),
  quizzes: s => s.forms.filter(row => row.kind === 'quiz').map(row => [row.id, row.name]),
  links: s => s.triggerLinks.map(row => [row.id, row.name]),
  stages: s => s.stages.map(stage => [stage.id, [s.pipelines.find(p => p.id === stage.pipelineId)?.name, stage.name].filter(Boolean).map(tr).join(' / ')]),
  pipelines: s => s.pipelines.map(row => [row.id, tr(row.name)]),
  workflows: s => s.workflows.map(row => [row.id, row.name]),
  chats: s => (s.chatWidgets || []).map(row => [row.id, row.name]),
  webinars: s => (s.webinars || []).map(row => [row.id, row.name]),
  stores: s => (s.stores || []).map(row => [row.id, row.name]),
  products: s => (s.products || []).filter(row => row.kind !== 'Recurring').map(row => [row.id, row.name]),
  documentTemplates: s => (s.documentTemplates || []).map(row => [row.id, row.title]),
  estimates: s => (s.estimates || []).map(row => [row.id, `${row.number} · ${row.title}`]),
  invoiceTemplates: s => (s.invoiceTemplates || []).map(row => [row.id, row.name]),
  dateFields: s => (s.customFields || []).filter(row => row.object === 'Contact' && row.type === 'Date').map(row => [row.id, row.name]),
  contactFields: s => [['name', 'Nome'], ['email', 'E-mail'], ['phone', 'Telefone'], ['company', 'Empresa'], ...(s.customFields || []).filter(row => row.object === 'Contact').map(row => [`custom:${row.id}`, row.name])],
  numberFields: s => (s.customFields || []).filter(row => row.object === 'Contact' && ['Number', 'Monetary'].includes(row.type)).map(row => [`custom:${row.id}`, row.name]),
  textFields: s => [['name', 'Nome'], ['company', 'Empresa'], ...(s.customFields || []).filter(row => row.object === 'Contact' && ['Single line', 'Multi line'].includes(row.type)).map(row => [`custom:${row.id}`, row.name])]
};

const any = label => ['', label];
export const channels = [['', 'Qualquer canal'], ['WhatsApp', 'WhatsApp'], ['SMS', 'SMS'], ['Email', 'E-mail'], ['Live chat', 'Chat ao vivo']];
const weekdays = [['1', 'Segunda'], ['2', 'Terça'], ['3', 'Quarta'], ['4', 'Quinta'], ['5', 'Sexta'], ['6', 'Sábado'], ['0', 'Domingo']];

export const triggerCatalog = [
  { group: 'Contato', items: [
    { type: 'contact_created', label: 'Contato criado', icon: 'contacts' },
    { type: 'contact_changed', label: 'Contato alterado', icon: 'edit', fields: [f('field', 'Campo alterado', 'ref', { source: 'contactFields', empty: 'Qualquer campo' })] },
    { type: 'contact_tag', label: 'Tag do contato', icon: 'tag', fields: [f('change', 'Quando a tag for', 'select', { options: [['added', 'Adicionada'], ['removed', 'Removida']] }), f('tag', 'Tag', 'text', { placeholder: 'Qualquer tag' })] },
    { type: 'contact_dnd', label: 'Não perturbe (DND)', icon: 'lock', fields: [f('state', 'Quando', 'select', { options: [['on', 'Ativado'], ['off', 'Desativado']] })] },
    { type: 'birthday_reminder', label: 'Lembrete de aniversário', icon: 'gift', scheduled: true, fields: [f('field', 'Campo de data de nascimento', 'ref', { source: 'dateFields', required: true }), f('days', 'Dias antes', 'number', { min: 0, max: 60, value: 0 }), f('time', 'Horário', 'time', { value: '09:00' })] },
    { type: 'custom_date_reminder', label: 'Lembrete de data personalizada', icon: 'cal', scheduled: true, fields: [f('field', 'Campo de data', 'ref', { source: 'dateFields', required: true }), f('offset', 'Dias em relação à data (negativo = antes)', 'number', { min: -365, max: 365, value: 0 }), f('time', 'Horário', 'time', { value: '09:00' })] },
    { type: 'note_added', label: 'Nota adicionada', icon: 'note' },
    { type: 'task_added', label: 'Tarefa adicionada', icon: 'check' },
    { type: 'task_completed', label: 'Tarefa concluída', icon: 'check' }
  ] },
  { group: 'Eventos', items: [
    { type: 'inbound_webhook', label: 'Webhook de entrada', icon: 'link', fields: [] },
    { type: 'scheduler', label: 'Agendador', icon: 'clock', scheduled: true, fields: [f('frequency', 'Frequência', 'select', { options: [['daily', 'Todo dia'], ['weekly', 'Toda semana']] }), f('weekday', 'Dia da semana', 'select', { options: weekdays, when: { frequency: 'weekly' } }), f('time', 'Horário', 'time', { value: '09:00' }), f('tag', 'Somente contatos com a tag', 'text', { placeholder: 'Obrigatório: limita quem entra', required: true })] },
    { type: 'customer_replied', label: 'Cliente respondeu', icon: 'chat', fields: [f('channel', 'Canal', 'select', { options: channels }), f('keyword', 'Contém a palavra', 'text', { placeholder: 'Ex.: QUERO' })] },
    { type: 'form_submitted', label: 'Formulário enviado', icon: 'list', fields: [f('formId', 'Formulário', 'ref', { source: 'forms', empty: 'Qualquer formulário' })] },
    { type: 'survey_submitted', label: 'Pesquisa enviada', icon: 'chart', fields: [f('formId', 'Pesquisa', 'ref', { source: 'surveys', empty: 'Qualquer pesquisa' })] },
    { type: 'quiz_submitted', label: 'Questionário enviado', icon: 'award', fields: [f('formId', 'Questionário', 'ref', { source: 'quizzes', empty: 'Qualquer questionário' }), f('tier', 'Faixa do resultado', 'text', { placeholder: 'Qualquer faixa' })] },
    { type: 'trigger_link_clicked', label: 'Link de rastreamento clicado', icon: 'link', fields: [f('linkId', 'Link', 'ref', { source: 'links', empty: 'Qualquer link' })] },
    { type: 'chat_started', label: 'Chat do site iniciado', icon: 'chat', fields: [f('widgetId', 'Chat', 'ref', { source: 'chats', empty: 'Qualquer chat' })] },
    { type: 'webinar_registered', label: 'Inscrição em webinar', icon: 'play', fields: [f('webinarId', 'Webinar', 'ref', { source: 'webinars', empty: 'Qualquer webinar' })] },
    { type: 'review_received', label: 'Nova avaliação recebida', icon: 'star', fields: [f('maxScore', 'Nota de no máximo', 'select', { options: [['', 'Qualquer nota'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']] })] }
  ] },
  { group: 'Redes Sociais', items: [
    { type: 'social_comment_received', label: 'Comentário em post social (ManyChat)', icon: 'chat', fields: [
      f('network', 'Rede', 'select', { options: [['', 'Qualquer rede'], ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok']] }),
      f('keyword', 'Palavra-chave no comentário', 'text', { placeholder: 'Ex.: QUERO, PREÇO, LINK' })
    ] },
    { type: 'social_dm_received', label: 'Mensagem direta / DM recebida', icon: 'send', fields: [
      f('network', 'Rede', 'select', { options: [['', 'Qualquer rede'], ['instagram', 'Instagram Direct'], ['facebook', 'Messenger']] }),
      f('keyword', 'Contém a palavra', 'text', { placeholder: 'Ex.: INFO, QUERO' })
    ] }
  ] },
  { group: 'Agendamentos', items: [
    { type: 'appointment_booked', label: 'Agendamento criado', icon: 'cal' },
    { type: 'appointment_status', label: 'Status do agendamento', icon: 'cal', fields: [f('status', 'Novo status', 'select', { options: [any('Qualquer status'), ['Confirmed', 'Confirmado'], ['Completed', 'Concluído'], ['Canceled', 'Cancelado']] })] }
  ] },
  { group: 'Oportunidades', items: [
    { type: 'opportunity_created', label: 'Oportunidade criada', icon: 'leads', fields: [f('pipelineId', 'Pipeline', 'ref', { source: 'pipelines', empty: 'Qualquer pipeline' })] },
    { type: 'opportunity_status_changed', label: 'Status da oportunidade alterado', icon: 'leads', fields: [f('status', 'Novo status', 'select', { options: [any('Qualquer status'), ['Open', 'Aberta'], ['Won', 'Ganha'], ['Lost', 'Perdida'], ['Abandoned', 'Abandonada']] })] },
    { type: 'pipeline_stage_changed', label: 'Etapa do pipeline alterada', icon: 'flow', fields: [f('stageId', 'Etapa de destino', 'ref', { source: 'stages', empty: 'Qualquer etapa' })] },
    { type: 'opportunity_changed', label: 'Oportunidade alterada', icon: 'edit' },
    { type: 'stale_opportunity', label: 'Oportunidade parada', icon: 'clock', scheduled: true, fields: [f('days', 'Sem alteração há (dias)', 'number', { min: 1, max: 365, value: 7 }), f('stageId', 'Somente na etapa', 'ref', { source: 'stages', empty: 'Qualquer etapa' })] }
  ] },
  { group: 'Pagamentos e lojas', items: [
    { type: 'invoice_status', label: 'Fatura', icon: 'pay', fields: [f('status', 'Quando a fatura ficar', 'select', { options: [any('Qualquer status'), ['Open', 'Em aberto'], ['Paid', 'Paga'], ['Void', 'Anulada']] })] },
    { type: 'payment_received', label: 'Pagamento recebido', icon: 'pay' },
    { type: 'order_submitted', label: 'Pedido feito na loja', icon: 'box', fields: [f('storeId', 'Loja', 'ref', { source: 'stores', empty: 'Qualquer loja' })] },
    { type: 'order_paid', label: 'Pedido pago', icon: 'box', fields: [f('storeId', 'Loja', 'ref', { source: 'stores', empty: 'Qualquer loja' })] },
    { type: 'order_fulfilled', label: 'Pedido entregue', icon: 'box', fields: [f('storeId', 'Loja', 'ref', { source: 'stores', empty: 'Qualquer loja' })] },
    { type: 'product_review', label: 'Avaliação de produto enviada', icon: 'star', fields: [f('storeId', 'Loja', 'ref', { source: 'stores', empty: 'Qualquer loja' }),
      f('rating', 'Quando a nota for', 'select', { options: [any('Qualquer nota'), ['2', '2 estrelas ou menos'], ['3', '3 estrelas ou menos']] })] },
    { type: 'abandoned_checkout', label: 'Checkout abandonado', icon: 'box', fields: [f('storeId', 'Loja', 'ref', { source: 'stores', empty: 'Qualquer loja' }),
      f('status', 'Quando o checkout for', 'select', { options: [['abandoned', 'Abandonado'], ['recovered', 'Recuperado']] })] },
    { type: 'document_status', label: 'Documento ou contrato', icon: 'file', fields: [f('status', 'Quando o documento for', 'select', { options: [any('Qualquer mudança'), ['sent', 'Enviado'], ['viewed', 'Visualizado'],
      ['signed', 'Assinado por um destinatário'], ['completed', 'Assinado por todos'], ['declined', 'Recusado'], ['expired', 'Vencido'], ['void', 'Anulado']] }),
      f('templateId', 'Modelo', 'ref', { source: 'documentTemplates', empty: 'Qualquer modelo' })] },
    { type: 'document_paid', label: 'Documento pago', icon: 'pay', fields: [f('templateId', 'Modelo', 'ref', { source: 'documentTemplates', empty: 'Qualquer modelo' })] },
    { type: 'estimate_status', label: 'Orçamento', icon: 'pay', fields: [f('status', 'Quando o orçamento for', 'select', { options: [any('Qualquer mudança'), ['sent', 'Enviado'], ['viewed', 'Visualizado'],
      ['accepted', 'Aceito'], ['declined', 'Recusado'], ['invoiced', 'Faturado'], ['paid', 'Pago'], ['expired', 'Vencido']] })] },
    { type: 'recurring_invoice_status', label: 'Fatura recorrente', icon: 'pay', fields: [f('status', 'Quando a fatura recorrente for', 'select', { options: [any('Qualquer mudança'),
      ['started', 'Ativada'], ['issued', 'Fatura emitida'], ['paused', 'Pausada'], ['resumed', 'Retomada'], ['completed', 'Concluída'], ['cancelled', 'Cancelada']] })] }
  ] }
];

export const conditionSubjects = [
  ['tag', 'Tag do contato', [['has', 'tem'], ['not_has', 'não tem']], 'text'],
  ['field', 'Campo do contato', [['equals', 'é igual a'], ['not_equals', 'é diferente de'], ['contains', 'contém'], ['not_contains', 'não contém'], ['empty', 'está vazio'], ['not_empty', 'está preenchido'], ['gt', 'é maior que'], ['lt', 'é menor que']], 'field'],
  ['dnd', 'Não perturbe', [['on', 'está ativado'], ['off', 'está desativado']], 'none'],
  ['stage', 'Oportunidade na etapa', [['in', 'está em'], ['not_in', 'não está em']], 'stage'],
  ['opportunity_status', 'Status da oportunidade', [['is', 'é'], ['is_not', 'não é']], 'status'],
  ['replied', 'Respondeu desde a inscrição', [['yes', 'sim'], ['no', 'não']], 'none'],
  ['submitted', 'Já enviou o formulário', [['yes', 'sim'], ['no', 'não']], 'form'],
  ['trigger', 'Dado do gatilho', [['equals', 'é igual a'], ['contains', 'contém'], ['gt', 'é maior que'], ['lt', 'é menor que'], ['not_empty', 'está preenchido']], 'key']
];

const conditions = f('conditions', 'Condições', 'conditions');
export const actionCatalog = [
  { group: 'Contato', items: [
    { type: 'add_tag', label: 'Adicionar tag', icon: 'tag', fields: [f('tag', 'Tag', 'text', { required: true })] },
    { type: 'remove_tag', label: 'Remover tag', icon: 'tag', fields: [f('tag', 'Tag', 'text', { required: true })] },
    { type: 'update_field', label: 'Atualizar campo do contato', icon: 'edit', fields: [f('field', 'Campo', 'ref', { source: 'contactFields', required: true }), f('value', 'Novo valor (aceita variáveis)', 'text', { required: true })] },
    { type: 'assign_user', label: 'Atribuir a um usuário', icon: 'contacts', fields: [f('user', 'Usuário', 'text', { required: true, placeholder: 'Nome do usuário da equipe' })] },
    { type: 'remove_user', label: 'Remover usuário atribuído', icon: 'contacts' },
    { type: 'set_dnd', label: 'Ativar ou desativar DND', icon: 'lock', fields: [f('state', 'Não perturbe', 'select', { options: [['on', 'Ativar'], ['off', 'Desativar']] })] },
    { type: 'add_note', label: 'Adicionar nota', icon: 'note', fields: [f('body', 'Nota', 'textarea', { required: true })] }
  ] },
  { group: 'Comunicação', items: [
    { type: 'send_email', label: 'Enviar e-mail', icon: 'mail', fields: [f('subject', 'Assunto', 'text', { required: true }), f('body', 'Mensagem', 'textarea', { required: true })] },
    { type: 'send_sms', label: 'Enviar SMS', icon: 'phone', fields: [f('body', 'Mensagem', 'textarea', { required: true })] },
    { type: 'send_whatsapp', label: 'Enviar WhatsApp', icon: 'chat', fields: [f('body', 'Mensagem', 'textarea', { required: true })] },
    { type: 'send_instagram_dm', label: 'Enviar Direct no Instagram', icon: 'send', fields: [f('body', 'Mensagem privada', 'textarea', { required: true })] },
    { type: 'reply_social_comment', label: 'Responder comentário público', icon: 'chat', fields: [f('body', 'Resposta pública no post', 'textarea', { required: true })] },
    { type: 'send_live_chat', label: 'Enviar mensagem no chat do site', icon: 'chat', fields: [f('body', 'Mensagem', 'textarea', { required: true })] },
    { type: 'internal_notification', label: 'Notificação interna', icon: 'bell', fields: [f('body', 'Mensagem para a equipe', 'textarea', { required: true })] },
    { type: 'review_request', label: 'Pedir avaliação', icon: 'star', fields: [f('channel', 'Canal', 'select', { options: [['WhatsApp', 'WhatsApp'], ['SMS', 'SMS'], ['Email', 'E-mail']] }), f('body', 'Mensagem', 'textarea', { required: true, value: 'Oi, {{contact.first_name}}! Como foi sua experiência com a {{workspace.name}}? Sua avaliação ajuda muito.' })] },
    { type: 'manual_sms', label: 'Ação manual: SMS', icon: 'phone', fields: [f('body', 'Instruções', 'textarea', { required: true }), f('assignee', 'Responsável', 'text')] },
    { type: 'manual_call', label: 'Ação manual: ligação', icon: 'phone', fields: [f('body', 'Instruções', 'textarea', { required: true }), f('assignee', 'Responsável', 'text')] }
  ] },
  { group: 'CRM e pagamentos', items: [
    { type: 'create_task', label: 'Criar tarefa', icon: 'check', fields: [f('title', 'Título', 'text', { required: true }), f('dueDays', 'Prazo em dias', 'number', { min: 0, max: 365, value: 1 }), f('owner', 'Responsável', 'text')] },
    { type: 'create_opportunity', label: 'Criar ou atualizar oportunidade', icon: 'leads', fields: [f('title', 'Nome', 'text', { required: true, value: '{{contact.name}}' }), f('stageId', 'Etapa', 'ref', { source: 'stages', required: true }), f('value', 'Valor (R$)', 'number', { min: 0, value: 0 })] },
    { type: 'opportunity_status', label: 'Mudar status da oportunidade', icon: 'leads', fields: [f('status', 'Status', 'select', { options: [['Won', 'Ganha'], ['Lost', 'Perdida'], ['Open', 'Aberta'], ['Abandoned', 'Abandonada']] })] },
    { type: 'send_document', label: 'Enviar documento ou contrato', icon: 'file', fields: [f('templateId', 'Modelo', 'ref', { source: 'documentTemplates', required: true }),
      f('title', 'Título do documento', 'text', { value: '' }), f('channel', 'Enviar por', 'select', { options: [['email', 'E-mail'], ['email_whatsapp', 'E-mail e WhatsApp']] }),
      f('expiresDays', 'Validade em dias (0 = sem prazo)', 'number', { min: 0, max: 365, value: 15 })] },
    { type: 'send_estimate', label: 'Enviar orçamento', icon: 'pay', fields: [f('estimateId', 'Orçamento modelo (é enviada uma cópia)', 'ref', { source: 'estimates', required: true }),
      f('channel', 'Enviar por', 'select', { options: [['email', 'E-mail'], ['email_whatsapp', 'E-mail e WhatsApp']] }), f('expiresDays', 'Validade em dias (0 = sem prazo)', 'number', { min: 0, max: 365, value: 15 })] },
    { type: 'send_invoice', label: 'Enviar fatura', icon: 'pay', fields: [f('templateId', 'Modelo de fatura', 'ref', { source: 'invoiceTemplates', required: true }),
      f('channel', 'Enviar por', 'select', { options: [['email', 'E-mail'], ['email_whatsapp', 'E-mail e WhatsApp']] })] },
    { type: 'update_inventory', label: 'Atualizar estoque', icon: 'box', fields: [f('productId', 'Produto', 'ref', { source: 'products', required: true }),
      f('mode', 'Operação', 'select', { options: [['add', 'Somar'], ['subtract', 'Subtrair'], ['set', 'Definir em']] }), f('quantity', 'Quantidade', 'number', { min: 0, max: 1000000, value: 1 })] },
    { type: 'start_recurring_invoice', label: 'Iniciar fatura recorrente', icon: 'pay', fields: [f('templateId', 'Modelo de fatura', 'ref', { source: 'invoiceTemplates', required: true }),
      f('frequency', 'Frequência', 'select', { options: [['monthly', 'Mensal'], ['weekly', 'Semanal'], ['daily', 'Diária'], ['yearly', 'Anual']] }),
      f('interval', 'A cada (períodos)', 'number', { min: 1, max: 30, value: 1 }), f('count', 'Número de faturas (0 = sem fim)', 'number', { min: 0, max: 240, value: 0 }),
      f('channel', 'Enviar por', 'select', { options: [['email', 'E-mail'], ['email_whatsapp', 'E-mail e WhatsApp']] })] },
    { type: 'create_invoice', label: 'Criar fatura', icon: 'pay', fields: [f('title', 'Descrição', 'text', { required: true }), f('value', 'Valor (R$)', 'number', { min: 0, required: true }), f('dueDays', 'Vence em (dias)', 'number', { min: 0, max: 365, value: 7 })] }
  ] },
  { group: 'Fluxo', items: [
    { type: 'wait', label: 'Aguardar', icon: 'clock', fields: [f('mode', 'Aguardar', 'select', { options: [['delay', 'Um tempo'], ['until', 'Até uma data e hora'], ['event', 'Até um evento acontecer']] }),
      f('amount', 'Quanto', 'number', { min: 1, max: 1000, value: 1, when: { mode: 'delay' } }), f('unit', 'Unidade', 'select', { options: [['minutes', 'minutos'], ['hours', 'horas'], ['days', 'dias']], value: 'days', when: { mode: 'delay' } }),
      f('until', 'Data e hora', 'datetime', { when: { mode: 'until' } }),
      f('event', 'Evento', 'select', { when: { mode: 'event' }, options: [['customer_replied', 'Cliente responder'], ['contact_tag', 'Receber uma tag'], ['form_submitted', 'Enviar um formulário'], ['appointment_booked', 'Fazer um agendamento'], ['order_paid', 'Pagar um pedido']] }),
      f('eventValue', 'Tag ou formulário (opcional)', 'text', { when: { mode: 'event' } }),
      f('timeoutDays', 'Desistir de esperar após (dias)', 'number', { min: 1, max: 365, value: 3, when: { mode: 'event' } })] },
    { type: 'if_else', label: 'Se / Senão', icon: 'flow', branch: true, fields: [conditions] },
    { type: 'filter', label: 'Filtro', icon: 'filter', description: 'Só continua se a condição for verdadeira', fields: [conditions] },
    { type: 'set_variable', label: 'Definir variável', icon: 'key', description: 'Guarda um valor para usar depois como {{vars.nome}}', fields: [f('name', 'Nome da variável', 'text', { required: true, placeholder: 'ex.: cupom' }), f('value', 'Valor (texto ou expressão)', 'text', { required: true, placeholder: '{{upper(contact.first_name)}}' })] },
    { type: 'router', label: 'Roteador', icon: 'flow', branch: true, fields: [] },
    { type: 'goal', label: 'Evento de meta', icon: 'award', fields: [f('event', 'Meta alcançada quando', 'select', { options: [['contact_tag', 'Receber uma tag'], ['customer_replied', 'Cliente responder'], ['form_submitted', 'Enviar um formulário'], ['appointment_booked', 'Fazer um agendamento'], ['order_paid', 'Pagar um pedido'], ['opportunity_status_changed', 'Oportunidade ganha']] }), f('eventValue', 'Tag ou formulário (opcional)', 'text'),
      f('otherwise', 'Ao chegar aqui sem a meta', 'select', { options: [['continue', 'Seguir o fluxo'], ['wait', 'Esperar a meta'], ['end', 'Encerrar o fluxo']] })] },
    { type: 'goto', label: 'Ir para outra etapa', icon: 'updown', fields: [f('target', 'Etapa de destino', 'step', { required: true })] },
    { type: 'add_to_workflow', label: 'Adicionar a outro fluxo', icon: 'flow', fields: [f('workflowId', 'Fluxo', 'ref', { source: 'workflows', required: true })] },
    { type: 'remove_from_workflow', label: 'Remover de um fluxo', icon: 'close', fields: [f('workflowId', 'Fluxo', 'ref', { source: 'workflows', empty: 'Este fluxo' })] },
    { type: 'math', label: 'Operação matemática', icon: 'sort', fields: [f('field', 'Campo numérico', 'ref', { source: 'numberFields', required: true }), f('op', 'Operação', 'select', { options: [['add', 'Somar'], ['subtract', 'Subtrair'], ['multiply', 'Multiplicar'], ['divide', 'Dividir'], ['set', 'Definir como']] }), f('number', 'Valor', 'number', { required: true, value: 1 })] },
    { type: 'text_format', label: 'Formatar texto', icon: 'edit', fields: [f('field', 'Campo', 'ref', { source: 'textFields', required: true }), f('op', 'Formato', 'select', { options: [['upper', 'MAIÚSCULAS'], ['lower', 'minúsculas'], ['title', 'Primeira Letra Maiúscula'], ['trim', 'Sem espaços nas pontas']] })] },
    { type: 'webhook', label: 'Webhook de saída', icon: 'send', fields: [f('url', 'Endereço (https://)', 'text', { required: true, placeholder: 'https://' }), f('method', 'Método', 'select', { options: [['POST', 'POST'], ['PUT', 'PUT'], ['GET', 'GET']] })] },
    { type: 'end', label: 'Encerrar fluxo', icon: 'close' }
  ] }
];

export const allTriggers = triggerCatalog.flatMap(group => group.items.map(item => ({ ...item, group: group.group })));
export const allActions = actionCatalog.flatMap(group => group.items.map(item => ({ ...item, group: group.group })));
export const triggerSpec = type => allTriggers.find(item => item.type === type);
export const actionSpec = type => allActions.find(item => item.type === type);

export const variables = [['{{contact.first_name}}', 'Primeiro nome'], ['{{contact.name}}', 'Nome completo'], ['{{contact.email}}', 'E-mail'], ['{{contact.phone}}', 'Telefone'], ['{{contact.company}}', 'Empresa'], ['{{workspace.name}}', 'Nome do workspace'], ['{{trigger.body}}', 'Mensagem recebida'], ['{{trigger.form}}', 'Formulário'], ['{{trigger.total}}', 'Total do pedido']];

// Old one-trigger, linear workflows in the new shape.
const legacyTrigger = { 'Contact created': 'contact_created', 'Form submitted': 'form_submitted', 'Opportunity stage changed': 'pipeline_stage_changed', 'Appointment booked': 'appointment_booked', 'Trigger link clicked': 'trigger_link_clicked', 'Customer replied': 'customer_replied' };
const legacyAction = { 'Add tag': ['add_tag', a => ({ tag: a.value })], 'Remove tag': ['remove_tag', a => ({ tag: a.value })], 'Create task': ['create_task', a => ({ title: a.value, dueDays: 1 })],
  'Create opportunity': ['create_opportunity', a => ({ title: a.value, stageId: '', value: 0 })], 'Log message': ['add_note', a => ({ body: a.value })], 'Send WhatsApp': ['send_whatsapp', a => ({ body: a.value })], 'Send SMS': ['send_sms', a => ({ body: a.value })],
  'Manual Call': ['manual_call', a => ({ body: a.value, assignee: a.assignee || '' })], 'Manual SMS': ['manual_sms', a => ({ body: a.value, assignee: a.assignee || '' })] };
export const legacyTriggerType = name => legacyTrigger[name] || '';

let seq = 0;
export const stepId = () => `n${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function upgradeWorkflow(row) {
  // A row in the new shape, unless an old client sent the legacy trigger/actions fields on top of it.
  if (Array.isArray(row?.triggers) && Array.isArray(row?.steps) && !row.trigger && !Array.isArray(row.actions)) return row;
  const type = legacyTrigger[row?.trigger];
  const config = type === 'form_submitted' ? { formId: row.formId || '' } : type === 'pipeline_stage_changed' ? { stageId: row.stageId || '' }
    : type === 'trigger_link_clicked' ? { linkId: row.linkId || '' } : type === 'customer_replied' ? { channel: row.channel || '', keyword: row.keyword || '' } : {};
  const steps = (row?.actions || []).map(action => {
    const [kind, map] = legacyAction[action.type] || ['add_note', a => ({ body: a.value })];
    return { id: stepId(), type: kind, config: map(action) };
  });
  const { trigger, actions, linkId, formId, stageId, channel, keyword, ...rest } = row || {};
  return { ...rest, triggers: type ? [{ id: stepId(), type, config }] : [], steps };
}

// The steps of a workflow as a flat list (with branches), for goto targets and validation.
export function eachStep(steps, visit, path = []) {
  for (const step of steps || []) {
    visit(step, path);
    if (step.type === 'if_else') { eachStep(step.yes, visit, [...path, step.id, 'yes']); eachStep(step.no, visit, [...path, step.id, 'no']); }
    if (step.type === 'router') { (step.routes || []).forEach(route => eachStep(route.steps, visit, [...path, step.id, route.id])); eachStep(step.otherwise, visit, [...path, step.id, 'otherwise']); }
  }
}

export function stepSummary(step, s) {
  const c = step.config || {};
  const ref = (source, id) => (refSources[source]?.(s) || []).find(([key]) => key === id)?.[1] || '';
  switch (step.type) {
    case 'add_tag': case 'remove_tag': return c.tag;
    case 'update_field': return `${ref('contactFields', c.field) || 'Campo'} = ${c.value || ''}`;
    case 'send_email': return c.subject;
    case 'wait': return c.mode === 'until' ? (c.until ? new Date(c.until).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Data a definir') : c.mode === 'event' ? `Até: ${(actionSpec('wait').fields.find(x => x.key === 'event').options.find(([k]) => k === c.event) || [])[1] || 'evento'}${c.timeoutDays ? ` (até ${c.timeoutDays} d)` : ''}` : `${c.amount || 1} ${({ minutes: 'min', hours: 'h', days: 'dia(s)' })[c.unit || 'days']}`;
    case 'if_else': case 'filter': return `${(step.config?.conditions || []).length || 0} condição(ões)`;
    case 'set_variable': return c.name ? `vars.${c.name}` : '';
    case 'router': return `${(step.routes || []).length} caminho(s)`;
    case 'create_task': case 'create_opportunity': case 'create_invoice': return c.title;
    case 'add_to_workflow': case 'remove_from_workflow': return ref('workflows', c.workflowId) || (step.type === 'remove_from_workflow' ? 'Este fluxo' : '');
    case 'webhook': return c.url;
    case 'math': return `${ref('numberFields', c.field)} ${({ add: '+', subtract: '−', multiply: '×', divide: '÷', set: '=' })[c.op] || ''} ${c.number ?? ''}`;
    default: return String(c.body || c.user || c.status || '').slice(0, 80);
  }
}

export function triggerSummary(trigger, s) {
  const spec = triggerSpec(trigger.type), c = trigger.config || {};
  const parts = (spec?.fields || []).map(field => {
    const value = c[field.key];
    if (value === undefined || value === '') return '';
    if (field.kind === 'ref') return (refSources[field.source]?.(s) || []).find(([key]) => key === value)?.[1] || '';
    if (field.kind === 'select') return (field.options.find(([key]) => key === String(value)) || [])[1] || '';
    return String(value);
  }).filter(Boolean);
  return parts.join(' · ');
}
