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
  communities: s => (s.communities || []).map(row => [row.id, row.name]),
  privateChannels: s => (s.communities || []).flatMap(group => (group.channels || []).filter(channel => channel.private).map(channel => [`${group.id}:${channel.id}`, `${group.name} · #${channel.name}`])),
  courses: s => (s.courses || []).map(row => [row.id, row.name]),
  agents: s => (s.agents || []).filter(row => row.published).map(row => [row.id, row.name]),
  offers: s => (s.offers || []).map(row => [row.id, row.title]),
  sequences: s => (s.emailSequences || []).map(row => [row.id, row.name]),
  rewards: s => (s.loyaltyRewards || []).map(row => [row.id, row.name]),
  topics: s => (s.preferences?.topics || [{ id: 'novidades', name: 'Novidades' }, { id: 'promocoes', name: 'Promoções' }]).map(row => [row.id, row.name]),
  certificateTemplates: s => (s.certificateTemplates || []).filter(row => row.kind === 'certificate').map(row => [row.id, row.name]),
  badgeTemplates: s => (s.certificateTemplates || []).filter(row => row.kind === 'badge').map(row => [row.id, row.name]),
  communityEvents: s => (s.communityEvents || []).map(row => [row.id, `${row.title} · ${(s.communities || []).find(group => group.id === row.communityId)?.name || 'Comunidade'}`]),
  stores: s => (s.stores || []).map(row => [row.id, row.name]),
  services: s => (s.services || []).map(row => [row.id, row.name]),
  coupons: s => (s.coupons || []).map(row => [row.id, `${row.code} · ${row.name}`]),
  customValues: s => (s.customValues || []).map(row => [row.id, row.name]),
  appActions: s => (s.appInstalls || []).flatMap(app => app.actions.map(item => [`${app.appId}:${item.key}`, `${app.name} · ${item.label}`])),
  appTriggers: s => (s.appInstalls || []).flatMap(app => app.triggers.map(item => [`${app.appId}:${item.key}`, `${app.name} · ${item.label}`])),
  products: s => (s.products || []).filter(row => row.kind !== 'Recurring').map(row => [row.id, row.name]),
  documentTemplates: s => (s.documentTemplates || []).map(row => [row.id, row.title]),
  estimates: s => (s.estimates || []).map(row => [row.id, `${row.number} · ${row.title}`]),
  invoiceTemplates: s => (s.invoiceTemplates || []).map(row => [row.id, row.name]),
  emailCampaigns: s => (s.emailCampaigns || []).map(row => [row.id, row.name]),
  videoCollectors: s => (s.videoCollectors || []).map(row => [row.id, row.name]),
  affiliates: s => (s.affiliates || []).map(row => [row.id, `${row.name} (${row.code})`]),
  affiliateCampaigns: s => (s.affiliateCampaigns || []).map(row => [row.id, row.name]),
  socialCategories: s => (s.socialCategories || []).map(row => [row.id, row.name]),
  socialAccounts: s => (s.socialAccounts || []).map(row => [row.id, `${row.name}${row.handle ? ` (${row.handle})` : ''} · ${socialNetworks.find(([id]) => id === row.provider)?.[1] || row.provider}`]),
  dateFields: s => (s.customFields || []).filter(row => row.object === 'Contact' && row.type === 'Date').map(row => [row.id, row.name]),
  contactFields: s => [['name', 'Nome'], ['email', 'E-mail'], ['phone', 'Telefone'], ['company', 'Empresa'], ...(s.customFields || []).filter(row => row.object === 'Contact').map(row => [`custom:${row.id}`, row.name])],
  numberFields: s => [['score', 'Pontuação do lead'], ...(s.customFields || []).filter(row => row.object === 'Contact' && ['Number', 'Monetary'].includes(row.type)).map(row => [`custom:${row.id}`, row.name])],
  textFields: s => [['name', 'Nome'], ['company', 'Empresa'], ...(s.customFields || []).filter(row => row.object === 'Contact' && ['Single line', 'Multi line'].includes(row.type)).map(row => [`custom:${row.id}`, row.name])]
};

const any = label => ['', label];
const socialNetworks = [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['linkedin', 'LinkedIn'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['pinterest', 'Pinterest'], ['threads', 'Threads'], ['bluesky', 'Bluesky'], ['gbp', 'Google Business']];
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
    { type: 'note_changed', label: 'Nota alterada', icon: 'note', description: 'Quando as notas do contato são editadas. Use {{trigger.body}} para o texto novo.', fields: [] },
    { type: 'task_added', label: 'Tarefa adicionada', icon: 'check' },
    { type: 'task_completed', label: 'Tarefa concluída', icon: 'check' },
    { type: 'task_reminder', label: 'Lembrete de tarefa', icon: 'clock', scheduled: true, description: 'Uma vez por dia, para as tarefas em aberto que vencem no dia escolhido.', fields: [f('days', 'Quantos dias antes do prazo', 'number', { value: 0, min: 0, max: 30 }), f('time', 'Horário', 'time', { value: '09:00' })] }
  ] },
  { group: 'Eventos', items: [
    { type: 'inbound_webhook', label: 'Webhook de entrada', icon: 'link', fields: [] },
    { type: 'app_trigger', label: 'App disparou um gatilho', icon: 'grid', description: 'Quando um app instalado do marketplace dispara um dos gatilhos dele. Os dados enviados pelo app ficam em {{trigger.payload}}.', fields: [f('trigger', 'Gatilho do app', 'ref', { source: 'appTriggers', empty: 'Qualquer gatilho de app' })] },
    { type: 'ai_usage_alert', label: 'Uso de IA chegou ao alerta', icon: 'spark', description: 'Quando o gasto do mês com IA passa da faixa de alerta ou atinge o limite definido pela agência. Não tem contato: use ações internas. {{trigger.cost}} e {{trigger.limit}} trazem os valores em US$.', fields: [f('level', 'Quando', 'select', { options: [any('Alerta ou limite'), ['alert', 'Passar da faixa de alerta'], ['blocked', 'Atingir o limite']] })] },
    { type: 'scheduler', label: 'Agendador', icon: 'clock', scheduled: true, fields: [f('frequency', 'Frequência', 'select', { options: [['daily', 'Todo dia'], ['weekly', 'Toda semana']] }), f('weekday', 'Dia da semana', 'select', { options: weekdays, when: { frequency: 'weekly' } }), f('time', 'Horário', 'time', { value: '09:00' }), f('tag', 'Somente contatos com a tag', 'text', { placeholder: 'Obrigatório: limita quem entra', required: true })] },
    { type: 'customer_replied', label: 'Cliente respondeu', icon: 'chat', fields: [f('channel', 'Canal', 'select', { options: channels }), f('keyword', 'Contém a palavra', 'text', { placeholder: 'Ex.: QUERO' })] },
    { type: 'conversation_sla', label: 'SLA da conversa', icon: 'clock', description: 'Quando uma mensagem do cliente fica sem resposta até o prazo de SLA (perto de vencer ou vencido). Precisa do SLA ligado em Conversas → Configurações. Use {{trigger.minutes}} para os minutos sem resposta.', fields: [
      f('state', 'Quando', 'select', { options: [any('Perto de vencer ou vencido'), ['soon', 'Perto de vencer'], ['overdue', 'Vencido']] }),
      f('channel', 'Canal', 'select', { options: [any('Qualquer canal'), ['WhatsApp', 'WhatsApp'], ['Email', 'E-mail'], ['SMS', 'SMS'], ['Live chat', 'Chat ao vivo'], ['Instagram', 'Instagram'], ['Facebook', 'Facebook']] })
    ] },
    { type: 'prospect_received', label: 'Prospect recebido da agência', icon: 'leads', description: 'Quando a agência envia um prospect da Prospecção para esta subconta (uma vez por prospect; reenviar não dispara de novo). O contato chega com a tag New Prospect Received. Use {{trigger.company}}, {{trigger.website}}, {{trigger.city}} e {{trigger.category}}.', fields: [
      f('isNew', 'Contato', 'select', { options: [any('Novo ou já existente'), ['yes', 'Contato novo'], ['no', 'Contato que já existia']] }),
      f('withOpportunity', 'Oportunidade', 'select', { options: [any('Com ou sem oportunidade'), ['yes', 'Com oportunidade criada'], ['no', 'Sem oportunidade']] }),
      f('category', 'Categoria do negócio contém', 'text', { placeholder: 'Qualquer categoria' })
    ] },
    { type: 'form_submitted', label: 'Formulário enviado', icon: 'list', fields: [f('formId', 'Formulário', 'ref', { source: 'forms', empty: 'Qualquer formulário' })] },
    { type: 'survey_submitted', label: 'Pesquisa enviada', icon: 'chart', fields: [f('formId', 'Pesquisa', 'ref', { source: 'surveys', empty: 'Qualquer pesquisa' })] },
    { type: 'quiz_submitted', label: 'Questionário enviado', icon: 'award', fields: [f('formId', 'Questionário', 'ref', { source: 'quizzes', empty: 'Qualquer questionário' }), f('tier', 'Faixa do resultado', 'text', { placeholder: 'Qualquer faixa' })] },
    { type: 'email_event', label: 'Evento de e-mail', icon: 'mail', fields: [f('event', 'Quando o contato', 'select', { options: [any('Abrir, clicar ou sair da lista'), ['opened', 'Abrir o e-mail'], ['clicked', 'Clicar em um link'], ['unsubscribed', 'Cancelar a inscrição']] }),
      f('campaignId', 'Campanha', 'ref', { source: 'emailCampaigns', empty: 'Qualquer campanha' })] },
    { type: 'trigger_link_clicked', label: 'Link de rastreamento clicado', icon: 'link', fields: [f('linkId', 'Link', 'ref', { source: 'links', empty: 'Qualquer link' })] },
    { type: 'chat_started', label: 'Chat do site iniciado', icon: 'chat', fields: [f('widgetId', 'Chat', 'ref', { source: 'chats', empty: 'Qualquer chat' })] },
    { type: 'webinar_registered', label: 'Inscrição em webinar', icon: 'play', fields: [f('webinarId', 'Webinar', 'ref', { source: 'webinars', empty: 'Qualquer webinar' })] },
    { type: 'preferences_changed', label: 'Preferências de comunicação mudaram', icon: 'lock', description: 'Quando o contato muda canais ou assuntos na central de preferências.', fields: [f('all', 'Saiu de tudo?', 'select', { options: [any('Qualquer mudança'), ['yes', 'Saiu de todas as comunicações'], ['no', 'Ajustou canais ou assuntos']] })] },
    { type: 'loyalty_reward_redeemed', label: 'Recompensa de fidelidade resgatada', icon: 'gift', description: 'Quando um contato troca pontos por uma recompensa. Use {{trigger.code}} para o código.', fields: [f('rewardId', 'Recompensa', 'ref', { source: 'rewards', empty: 'Qualquer recompensa' })] },
    { type: 'loyalty_tier_changed', label: 'Nível de fidelidade mudou', icon: 'gift', description: 'Quando o contato sobe de nível no programa de fidelidade. Use {{trigger.tier}}.', fields: [f('tier', 'Novo nível', 'text', { placeholder: 'Qualquer nível' })] },
    { type: 'email_sequence_completed', label: 'Sequência de e-mail concluída', icon: 'mail', description: 'Quando um contato recebe o último e-mail de uma sequência.', fields: [f('sequenceId', 'Sequência', 'ref', { source: 'sequences', empty: 'Qualquer sequência' })] },
    { type: 'ticket_created', label: 'Ticket criado', icon: 'inbox', description: 'Quando um ticket de atendimento é aberto (pela equipe, pelo portal, por automação ou por uma conversa nova). Use {{trigger.number}} e {{trigger.title}}.', fields: [
      f('priority', 'Prioridade', 'select', { options: [any('Qualquer prioridade'), ...[['low', 'Baixa'], ['medium', 'Média'], ['high', 'Alta'], ['urgent', 'Urgente']]] }), f('category', 'Categoria', 'text', { placeholder: 'Qualquer categoria' })
    ] },
    { type: 'ticket_status_changed', label: 'Situação do ticket mudou', icon: 'inbox', description: 'Quando um ticket muda de situação, como resolvido ou aguardando cliente.', fields: [
      f('status', 'Nova situação', 'select', { options: [any('Qualquer situação'), ...[['open', 'Aberto'], ['pending', 'Em andamento'], ['waiting', 'Aguardando cliente'], ['resolved', 'Resolvido'], ['closed', 'Fechado']]] }), f('priority', 'Prioridade', 'select', { options: [any('Qualquer prioridade'), ...[['low', 'Baixa'], ['medium', 'Média'], ['high', 'Alta'], ['urgent', 'Urgente']]] })
    ] },
    { type: 'course_completed', label: 'Curso concluído', icon: 'award', description: 'Quando um aluno chega a 100% de um curso com certificado ligado. Use {{trigger.course}} para o nome do curso.', fields: [f('courseId', 'Curso', 'ref', { source: 'courses', empty: 'Qualquer curso' })] },
    { type: 'lesson_completed', label: 'Aula concluída', icon: 'book', description: 'Quando o aluno marca uma aula como concluída no portal. Use {{trigger.title}} para o nome da aula.', fields: [f('courseId', 'Curso', 'ref', { source: 'courses', empty: 'Qualquer curso' })] },
    { type: 'course_started', label: 'Curso iniciado', icon: 'book', description: 'Quando o aluno conclui a primeira aula de um curso. Use {{trigger.course}} para o nome do curso.', fields: [f('courseId', 'Curso', 'ref', { source: 'courses', empty: 'Qualquer curso' })] },
    { type: 'course_module_started', label: 'Módulo do curso iniciado', icon: 'book', description: 'Quando o aluno conclui a primeira aula de um módulo. Use {{trigger.module}} para o nome do módulo.', fields: [f('courseId', 'Curso', 'ref', { source: 'courses', empty: 'Qualquer curso' })] },
    { type: 'course_module_completed', label: 'Módulo do curso concluído', icon: 'award', description: 'Quando o aluno conclui todas as aulas publicadas de um módulo. Use {{trigger.module}} para o nome do módulo.', fields: [f('courseId', 'Curso', 'ref', { source: 'courses', empty: 'Qualquer curso' })] },
    { type: 'course_access_granted', label: 'Acesso a curso liberado', icon: 'book', description: 'Quando o contato ganha acesso a um curso, por oferta ou por automação.', fields: [f('courseId', 'Curso', 'ref', { source: 'courses', empty: 'Qualquer curso' })] },
    { type: 'offer_access_granted', label: 'Acesso à oferta liberado', icon: 'book', description: 'Quando o contato recebe os cursos e comunidades de uma oferta: na compra, na inscrição gratuita ou por uma automação. Use {{trigger.offer}} para o nome da oferta.', fields: [f('offerId', 'Oferta', 'ref', { source: 'offers', empty: 'Qualquer oferta' })] },
    { type: 'offer_access_revoked', label: 'Acesso à oferta removido', icon: 'book', description: 'Quando uma automação tira do contato os cursos e comunidades de uma oferta.', fields: [f('offerId', 'Oferta', 'ref', { source: 'offers', empty: 'Qualquer oferta' })] },
    { type: 'course_access_revoked', label: 'Acesso a curso removido', icon: 'book', description: 'Quando uma automação tira o acesso do contato a um curso.', fields: [f('courseId', 'Curso', 'ref', { source: 'courses', empty: 'Qualquer curso' })] },
    { type: 'certificate_issued', label: 'Certificado emitido', icon: 'award', description: 'Quando um certificado de conclusão é emitido. Use {{trigger.code}} para o código de verificação.', fields: [f('courseId', 'Curso', 'ref', { source: 'courses', empty: 'Qualquer curso' })] },
    { type: 'badge_issued', label: 'Badge emitido', icon: 'star', description: 'Quando um aluno recebe o badge de matrícula de um curso.', fields: [f('courseId', 'Curso', 'ref', { source: 'courses', empty: 'Qualquer curso' })] },
    { type: 'course_quiz_submitted', label: 'Quiz do curso respondido', icon: 'check', description: 'Quando um aluno envia um quiz no portal. Use {{trigger.score}} para a nota (0 a 100) e {{trigger.title}} para a aula.', fields: [
      f('courseId', 'Curso', 'ref', { source: 'courses', empty: 'Qualquer curso' }),
      f('passed', 'Resultado', 'select', { options: [any('Aprovado ou não'), ['yes', 'Atingiu a nota mínima'], ['no', 'Não atingiu a nota mínima']] })
    ] },
    { type: 'course_assignment_submitted', label: 'Tarefa do curso entregue', icon: 'edit', description: 'Quando um aluno entrega uma tarefa no portal.', fields: [f('courseId', 'Curso', 'ref', { source: 'courses', empty: 'Qualquer curso' })] },
    { type: 'course_assignment_graded', label: 'Tarefa do curso corrigida', icon: 'check', description: 'Quando a equipe aprova ou pede ajustes numa tarefa.', fields: [
      f('courseId', 'Curso', 'ref', { source: 'courses', empty: 'Qualquer curso' }),
      f('status', 'Correção', 'select', { options: [any('Qualquer correção'), ['approved', 'Aprovada'], ['revise', 'Pediu ajustes']] })
    ] },
    { type: 'community_member_joined', label: 'Membro entrou na comunidade', icon: 'users', description: 'Quando um membro entra numa comunidade (gratuita, aprovada, paga ou no teste grátis). Use {{trigger.title}} para o nome da comunidade.', fields: [
      f('communityId', 'Comunidade', 'ref', { source: 'communities', empty: 'Qualquer comunidade' })
    ] },
    { type: 'community_post_created', label: 'Post criado na comunidade', icon: 'edit', description: 'Quando um membro publica numa comunidade (posts retidos pela moderação contam quando são aprovados). Use {{trigger.title}} e {{trigger.body}}.', fields: [
      f('communityId', 'Comunidade', 'ref', { source: 'communities', empty: 'Qualquer comunidade' })
    ] },
    { type: 'community_comment_created', label: 'Comentário na comunidade', icon: 'chat', description: 'Quando um membro comenta um post. Use {{trigger.body}} para o comentário e {{trigger.title}} para o post.', fields: [
      f('communityId', 'Comunidade', 'ref', { source: 'communities', empty: 'Qualquer comunidade' })
    ] },
    { type: 'community_join_requested', label: 'Pedido para entrar na comunidade', icon: 'users', description: 'Quando alguém pede para entrar numa comunidade privada. Use {{trigger.answers}} para as respostas das perguntas de entrada.', fields: [
      f('communityId', 'Comunidade', 'ref', { source: 'communities', empty: 'Qualquer comunidade' })
    ] },
    { type: 'community_join_rejected', label: 'Pedido para entrar recusado', icon: 'close', description: 'Quando a equipe recusa (remove ou bane) um pedido para entrar.', fields: [
      f('communityId', 'Comunidade', 'ref', { source: 'communities', empty: 'Qualquer comunidade' })
    ] },
    { type: 'community_event_checked_in', label: 'Check-in em evento da comunidade', icon: 'check', description: 'Quando a equipe marca a presença de um participante no evento. Use {{trigger.title}} para o nome do evento.', fields: [
      f('communityId', 'Comunidade', 'ref', { source: 'communities', empty: 'Qualquer comunidade' }),
      f('eventId', 'Evento', 'ref', { source: 'communityEvents', empty: 'Qualquer evento' })
    ] },
    { type: 'community_channel_granted', label: 'Acesso a canal privado liberado', icon: 'lock', description: 'Quando um membro recebe acesso a um canal privado da comunidade (pela equipe ou por uma automação). Use {{trigger.channel}} para o nome do canal.', fields: [
      f('channel', 'Canal privado', 'ref', { source: 'privateChannels', empty: 'Qualquer canal privado' })
    ] },
    { type: 'community_channel_revoked', label: 'Acesso a canal privado removido', icon: 'lock', description: 'Quando um membro perde o acesso a um canal privado da comunidade.', fields: [
      f('channel', 'Canal privado', 'ref', { source: 'privateChannels', empty: 'Qualquer canal privado' })
    ] },
    { type: 'community_level_changed', label: 'Nível no ranking da comunidade mudou', icon: 'award', description: 'Quando um membro sobe ou desce de nível no ranking da comunidade (posts, comentários, curtidas recebidas e pontos dados por automações). Use {{trigger.level}} e {{trigger.levelName}}.', fields: [
      f('communityId', 'Comunidade', 'ref', { source: 'communities', empty: 'Qualquer comunidade' }),
      f('direction', 'Quando', 'select', { options: [['', 'Subir ou descer'], ['up', 'Subir de nível'], ['down', 'Descer de nível']] }),
      f('level', 'Novo nível', 'select', { options: [['', 'Qualquer nível'], ...Array.from({ length: 9 }, (_, i) => [String(i + 1), `Nível ${i + 1}`])] })
    ] },
    { type: 'community_access_revoked', label: 'Acesso à comunidade removido', icon: 'close', description: 'Quando um membro ativo sai, é removido ou banido, ou uma automação tira o acesso dele. Use {{trigger.reason}} para o motivo.', fields: [
      f('communityId', 'Comunidade', 'ref', { source: 'communities', empty: 'Qualquer comunidade' }),
      f('reason', 'Motivo', 'select', { options: [any('Qualquer motivo'), ['left', 'Saiu por conta própria'], ['removed', 'Removido pela equipe'], ['banned', 'Banido'], ['workflow', 'Removido por automação']] })
    ] },
    { type: 'portal_login', label: 'Login no portal do cliente', icon: 'lock', description: 'Quando o cliente entra no portal (área de membros) pelo link de acesso. O primeiro acesso conta como cadastro. Entradas da equipe para ver o portal não contam.', fields: [
      f('first', 'Acesso', 'select', { options: [any('Qualquer acesso'), ['yes', 'Só o primeiro acesso (cadastro)'], ['no', 'Só os acessos seguintes']] })
    ] },
    { type: 'community_event_registered', label: 'Inscrição em evento da comunidade', icon: 'cal', description: 'Quando um membro confirma presença ou paga o ingresso de um evento da comunidade. Use {{trigger.title}} para o nome do evento.', fields: [
      f('communityId', 'Comunidade', 'ref', { source: 'communities', empty: 'Qualquer comunidade' }),
      f('eventId', 'Evento', 'ref', { source: 'communityEvents', empty: 'Qualquer evento' }),
      f('paid', 'Ingresso', 'select', { options: [any('Gratuito ou pago'), ['no', 'Gratuito'], ['yes', 'Pago']] })
    ] },
    { type: 'review_received', label: 'Nova avaliação recebida', icon: 'star', fields: [f('maxScore', 'Nota de no máximo', 'select', { options: [['', 'Qualquer nota'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']] })] },
    { type: 'affiliate_created', label: 'Afiliado cadastrado', icon: 'users', fields: [] },
    { type: 'affiliate_lead', label: 'Lead de afiliado', icon: 'users', fields: [f('affiliateId', 'Afiliado', 'ref', { source: 'affiliates', empty: 'Qualquer afiliado' })] },
    { type: 'affiliate_sale', label: 'Nova venda de afiliado', icon: 'pay', fields: [f('affiliateId', 'Afiliado', 'ref', { source: 'affiliates', empty: 'Qualquer afiliado' })] },
    { type: 'affiliate_campaign_enrolled', label: 'Afiliado entrou em campanha', icon: 'users', description: 'Quando um afiliado passa a participar de uma campanha (na tela de afiliados ou por automação). Dispara no contato do afiliado; use {{trigger.campaign}} para o nome da campanha.', fields: [f('campaignId', 'Campanha', 'ref', { source: 'affiliateCampaigns', empty: 'Qualquer campanha' })] },
    { type: 'video_testimonial', label: 'Depoimento em vídeo recebido', icon: 'play', fields: [f('collectorId', 'Coletor', 'ref', { source: 'videoCollectors', empty: 'Qualquer coletor' })] }
  ] },
  { group: 'Redes Sociais', items: [
    { type: 'social_comment_received', label: 'Comentário em post social (ManyChat)', icon: 'chat', fields: [
      f('network', 'Rede', 'select', { options: [['', 'Qualquer rede'], ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok']] }),
      f('keyword', 'Palavra-chave no comentário', 'text', { placeholder: 'Ex.: QUERO, PREÇO, LINK' })
    ] },
    { type: 'social_dm_received', label: 'Mensagem direta / DM recebida', icon: 'send', fields: [
      f('network', 'Rede', 'select', { options: [['', 'Qualquer rede'], ['instagram', 'Instagram Direct'], ['facebook', 'Messenger']] }),
      f('keyword', 'Contém a palavra', 'text', { placeholder: 'Ex.: INFO, QUERO' })
    ] },
    { type: 'ad_lead', label: 'Lead de anúncio', icon: 'meg', description: 'Quando um contato chega de um anúncio (Google Ads, Meta Ads ou outra mídia paga), por um formulário, site, loja ou webinar. Use {{trigger.campaign}} e {{trigger.source}}.', fields: [
      f('network', 'Origem', 'select', { options: [any('Qualquer anúncio'), ['google_ads', 'Google Ads'], ['meta_ads', 'Meta Ads'], ['paid_other', 'Outros anúncios']] }),
      f('campaign', 'Campanha contém', 'text', { placeholder: 'Ex.: black-friday' })
    ] },
    { type: 'external_tracking_event', label: 'Evento do rastreamento externo', icon: 'site', description: 'Quando um contato conhecido visita uma página ou envia um formulário no seu site com o script de rastreamento instalado.', fields: [
      f('event', 'Evento', 'select', { options: [any('Visita ou formulário'), ['pageview', 'Visita de página'], ['form', 'Formulário enviado']] }),
      f('url', 'Endereço contém', 'text', { placeholder: 'Ex.: /precos' })
    ] },
    { type: 'score_changed', label: 'Pontuação do lead mudou', icon: 'star', description: 'Quando a pontuação do contato muda. Com um mínimo, dispara só quando a pontuação chega a esse valor.', fields: [
      f('min', 'Chegou a pelo menos', 'number', { placeholder: 'Qualquer mudança' })
    ] },
    { type: 'social_post_published', label: 'Post social publicado', icon: 'send', description: 'Quando o Social Planner termina de publicar um post (agendado, recorrente, da fila evergreen ou do RSS). Use {{trigger.url}}, {{trigger.summary}} e {{trigger.networks}}.', fields: [
      f('status', 'Resultado', 'select', { options: [['published', 'Publicado'], ['failed', 'Falhou'], any('Publicado ou falhou')] }),
      f('network', 'Rede', 'select', { options: [any('Qualquer rede'), ...socialNetworks] }),
      f('categoryId', 'Categoria', 'ref', { source: 'socialCategories', empty: 'Qualquer categoria' })
    ] }
  ] },
  { group: 'Agendamentos', items: [
    { type: 'appointment_booked', label: 'Agendamento criado', icon: 'cal' },
    { type: 'appointment_status', label: 'Status do agendamento', icon: 'cal', fields: [f('status', 'Novo status', 'select', { options: [any('Qualquer status'), ['Confirmed', 'Confirmado'], ['Completed', 'Concluído'], ['Canceled', 'Cancelado']] })] },
    { type: 'meeting_summarized', label: 'Resumo de reunião gerado', icon: 'note', fields: [f('sentiment', 'Clima do cliente', 'select', { options: [any('Qualquer clima'), ['positive', 'Positivo'], ['neutral', 'Neutro'], ['negative', 'Negativo']] })] },
    { type: 'transcript_generated', label: 'Transcrição de reunião gerada', icon: 'note', description: 'Quando a transcrição de uma reunião ligada ao contato fica pronta (colada, de arquivo ou de áudio).', fields: [] },
    { type: 'service_booked', label: 'Reserva de serviço', icon: 'cal', description: 'Quando o cliente reserva um serviço ou uma locação na página de agendamento.', fields: [f('serviceId', 'Serviço', 'ref', { source: 'services', empty: 'Qualquer serviço' }), f('kind', 'Tipo', 'select', { options: [any('Qualquer tipo'), ['appointment', 'Atendimento no local'], ['field', 'Serviço em campo'], ['rental', 'Locação']] })] },
    { type: 'field_status_changed', label: 'Serviço em campo: situação mudou', icon: 'cal', fields: [f('status', 'Nova situação', 'select', { options: [any('Qualquer situação'), ['en_route', 'A caminho'], ['on_site', 'No local'], ['done', 'Concluído']] })] }
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
      ['started', 'Ativada'], ['issued', 'Fatura emitida'], ['paused', 'Pausada'], ['resumed', 'Retomada'], ['completed', 'Concluída'], ['cancelled', 'Cancelada']] })] },
    { type: 'subscription_status', label: 'Assinatura', icon: 'pay', description: 'Quando uma assinatura é criada ou muda de status.', fields: [f('status', 'Status', 'select', { options: [any('Qualquer status'), ['Active', 'Ativa'], ['Paused', 'Pausada'], ['Canceled', 'Cancelada']] })] },
    { type: 'refund', label: 'Reembolso', icon: 'pay', description: 'Quando um pagamento do contato é marcado como reembolsado. Use {{trigger.total}}.', fields: [] },
    { type: 'coupon_redeemed', label: 'Cupom usado', icon: 'tag', description: 'Quando um pedido da loja usa um cupom. Use {{trigger.code}}.', fields: [f('couponId', 'Cupom', 'ref', { source: 'coupons', empty: 'Qualquer cupom' })] },
    { type: 'coupon_limit_reached', label: 'Cupom atingiu o limite de usos', icon: 'tag', description: 'Quando um cupom chega ao número máximo de usos. Dispara para o contato do último pedido.', fields: [f('couponId', 'Cupom', 'ref', { source: 'coupons', empty: 'Qualquer cupom' })] },
    { type: 'coupon_expired', label: 'Cupom expirou', icon: 'tag', description: 'No dia seguinte ao fim da validade de um cupom. Não tem contato: use para avisar a equipe, criar tarefa ou chamar um webhook. Use {{trigger.code}}.', fields: [f('couponId', 'Cupom', 'ref', { source: 'coupons', empty: 'Qualquer cupom' })] },
    { type: 'cart_updated', label: 'Produtos adicionados ao carrinho', icon: 'pay', description: 'Quando um contato já cadastrado coloca ou muda produtos no carrinho da loja. Use {{trigger.total}}.', fields: [f('storeId', 'Loja', 'ref', { source: 'stores', empty: 'Qualquer loja' })] }
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
  ['trigger', 'Dado do gatilho', [['equals', 'é igual a'], ['contains', 'contém'], ['gt', 'é maior que'], ['lt', 'é menor que'], ['not_empty', 'está preenchido']], 'key'],
  ['var', 'Variável do fluxo', [['equals', 'é igual a'], ['not_equals', 'é diferente de'], ['contains', 'contém'], ['empty', 'está vazia'], ['not_empty', 'está preenchida'], ['gt', 'é maior que'], ['lt', 'é menor que']], 'key']
];

const conditions = f('conditions', 'Condições', 'conditions');
export const actionCatalog = [
  { group: 'Contato', items: [
    { type: 'add_tag', label: 'Adicionar tag', icon: 'tag', fields: [f('tag', 'Tag', 'text', { required: true })] },
    { type: 'remove_tag', label: 'Remover tag', icon: 'tag', fields: [f('tag', 'Tag', 'text', { required: true })] },
    { type: 'update_field', label: 'Atualizar campo do contato', icon: 'edit', fields: [f('field', 'Campo', 'ref', { source: 'contactFields', required: true }), f('value', 'Novo valor (aceita variáveis)', 'text', { required: true })] },
    { type: 'assign_user', label: 'Atribuir a um usuário', icon: 'contacts', fields: [f('user', 'Usuário', 'text', { required: true, placeholder: 'Nome do usuário da equipe' })] },
    { type: 'remove_user', label: 'Remover usuário atribuído', icon: 'contacts' },
    { type: 'edit_conversation', label: 'Editar conversa', icon: 'chat', fields: [f('op', 'O que fazer', 'select', { options: [['read', 'Marcar como lida'], ['unread', 'Marcar como não lida'], ['star', 'Marcar com estrela'], ['unstar', 'Tirar a estrela']] })] },
    { type: 'conversation_followers', label: 'Seguidores da conversa', icon: 'contacts', fields: [f('op', 'O que fazer', 'select', { options: [['add', 'Adicionar seguidores'], ['remove', 'Remover seguidores']] }), f('users', 'Pessoas da equipe (separadas por vírgula)', 'text', { required: true, placeholder: 'Ana, Bruno' })] },
    { type: 'set_dnd', label: 'Ativar ou desativar DND', icon: 'lock', fields: [f('state', 'Não perturbe', 'select', { options: [['on', 'Ativar'], ['off', 'Desativar']] })] },
    { type: 'add_note', label: 'Adicionar nota', icon: 'note', fields: [f('body', 'Nota', 'textarea', { required: true })] },
    { type: 'create_contact', label: 'Criar contato', icon: 'contacts', description: 'Cria outro contato (ex.: a pessoa indicada num formulário). Se já existir um com o mesmo e-mail ou telefone, usa esse. O fluxo segue com o contato atual; o novo fica em {{steps.ID.id}}.', fields: [
      f('name', 'Nome', 'text', { required: true, placeholder: '{{trigger.indicado}}' }), f('email', 'E-mail', 'text', { placeholder: '{{trigger.email_indicado}}' }), f('phone', 'Telefone', 'text'),
      f('tags', 'Tags (separadas por vírgula)', 'text', { placeholder: 'indicação' })] },
    { type: 'find_contact', label: 'Buscar contato', icon: 'search', description: 'Procura um contato pelo e-mail, telefone ou um campo. O resultado fica em {{steps.ID.found}} (yes ou no), {{steps.ID.name}} e {{steps.ID.email}}; dá para seguir o fluxo com o contato encontrado.', fields: [
      f('by', 'Procurar por', 'select', { options: [['email', 'E-mail'], ['phone', 'Telefone'], ['field', 'Campo personalizado']] }),
      f('field', 'Campo', 'ref', { source: 'textFields', when: { by: 'field' } }),
      f('value', 'Valor procurado', 'text', { required: true, placeholder: '{{trigger.email}}' }),
      f('then', 'Depois de achar', 'select', { options: [['keep', 'Seguir com o contato atual'], ['switch', 'Seguir com o contato encontrado']] })] },
    { type: 'delete_contact', label: 'Excluir contato', icon: 'trash', description: 'Manda o contato para a lixeira (60 dias para restaurar). As etapas seguintes ficam sem contato.', fields: [] },
    { type: 'company_create', label: 'Criar e associar empresa', icon: 'grid', description: 'Liga o contato à empresa com este nome; se ela não estiver no cadastro, cria. Use {{steps.ID.name}} depois.', fields: [
      f('name', 'Nome da empresa (aceita variáveis)', 'text', { required: true, placeholder: '{{contact.company}} ou {{trigger.empresa}}' }),
      f('phone', 'Telefone (só para empresa nova)', 'text'), f('email', 'E-mail (só para empresa nova)', 'text'),
      f('website', 'Site (só para empresa nova)', 'text', { placeholder: 'https://' }), f('city', 'Cidade (só para empresa nova)', 'text')
    ] },
    { type: 'company_update', label: 'Atualizar empresa associada', icon: 'grid', description: 'Muda um campo da empresa do contato (a empresa com o nome que está no contato).', fields: [
      f('field', 'Campo', 'select', { options: [['name', 'Nome'], ['phone', 'Telefone'], ['email', 'E-mail'], ['website', 'Site'], ['address', 'Endereço'], ['city', 'Cidade'], ['state', 'Estado'], ['postal', 'CEP'], ['country', 'País'], ['description', 'Descrição']] }),
      f('value', 'Novo valor (aceita variáveis)', 'text', { required: true })
    ] },
    { type: 'company_clear', label: 'Limpar campos da empresa associada', icon: 'grid', description: 'Apaga campos da empresa do contato. O nome nunca é apagado.', fields: [
      f('field', 'O que limpar', 'select', { options: [['all', 'Todos os campos (menos o nome)'], ['contact', 'Telefone, e-mail e site'], ['address', 'Endereço completo'], ...[['name', 'Nome'], ['phone', 'Telefone'], ['email', 'E-mail'], ['website', 'Site'], ['address', 'Endereço'], ['city', 'Cidade'], ['state', 'Estado'], ['postal', 'CEP'], ['country', 'País'], ['description', 'Descrição']].filter(([key]) => key !== 'name')] })
    ] },
    { type: 'email_verify', label: 'Verificar e-mail', icon: 'mail', description: 'Confere o formato do e-mail do contato e se o domínio recebe e-mail (sem enviar nada). O fluxo espera a resposta: use {{vars.email_status}} (valid, invalid ou unknown) e {{vars.email_motivo}} num Se / Senão.', fields: [
      f('invalidTag', 'Tag para e-mail inválido (opcional)', 'text', { value: 'email-invalido', placeholder: 'email-invalido' })
    ] },
    { type: 'merge_contact', label: 'Mesclar contato', icon: 'users', description: 'Junta os contatos duplicados (mesmo e-mail ou telefone) num só: tags, campos vazios, notas, conversas, tarefas, oportunidades, agendamentos e faturas passam para o contato mantido, e os duplicados vão para a lixeira.', fields: [
      f('by', 'Duplicado quando tiver o mesmo', 'select', { options: [['any', 'E-mail ou telefone'], ['email', 'E-mail'], ['phone', 'Telefone']] }),
      f('keep', 'Contato mantido', 'select', { options: [['this', 'Este contato'], ['oldest', 'O mais antigo (o fluxo segue com ele)']] })
    ] },
    { type: 'make_affiliate', label: 'Tornar afiliado', icon: 'users', description: 'Cadastra o contato como afiliado na campanha (precisa de e-mail).', fields: [f('campaignId', 'Campanha de afiliados', 'ref', { source: 'affiliateCampaigns', required: true })] },
    { type: 'update_affiliate', label: 'Atualizar afiliado', icon: 'users', description: 'Muda a situação do afiliado ligado ao contato (pelo e-mail ou por ter sido criado a partir dele).', fields: [
      f('status', 'Situação', 'select', { options: [['active', 'Ativo'], ['paused', 'Pausado'], ['pending', 'Aguardando aprovação']] })
    ] },
    { type: 'add_affiliate_campaign', label: 'Adicionar afiliado a campanha', icon: 'users', description: 'Coloca o afiliado ligado ao contato numa campanha, com o link e a comissão dela.', fields: [f('campaignId', 'Campanha de afiliados', 'ref', { source: 'affiliateCampaigns', required: true, empty: 'Escolha a campanha' })] },
    { type: 'remove_affiliate_campaign', label: 'Tirar afiliado de campanha', icon: 'users', description: 'Tira o afiliado ligado ao contato de uma campanha. Comissões já geradas continuam.', fields: [f('campaignId', 'Campanha de afiliados', 'ref', { source: 'affiliateCampaigns', required: true, empty: 'Escolha a campanha' })] },
    { type: 'assign_affiliate_lead', label: 'Atribuir lead a afiliado', icon: 'users', description: 'Registra que o contato foi indicado pelo afiliado: as próximas faturas pagas dele geram comissão.', fields: [
      f('affiliateId', 'Afiliado', 'ref', { source: 'affiliates', required: true, empty: 'Escolha o afiliado' }),
      f('campaignId', 'Campanha', 'ref', { source: 'affiliateCampaigns', empty: 'Primeira campanha ativa do afiliado' }),
      f('replace', 'Se o contato já tiver afiliado', 'select', { options: [['no', 'Manter o afiliado atual'], ['yes', 'Trocar por este']] })
    ] },
    { type: 'affiliate_manual_sale', label: 'Registrar venda de afiliado', icon: 'pay', description: 'Lança uma venda feita fora das faturas (no balcão, por exemplo) para o afiliado que indicou o contato. A comissão segue a regra da campanha e o prazo de carência.', fields: [
      f('amount', 'Valor da venda (R$)', 'number', { min: 0.01, max: 1000000, required: true }),
      f('note', 'Observação', 'text', { placeholder: 'Ex.: Pedido {{trigger.total}}' })
    ] }
  ] },
  { group: 'Comunicação', items: [
    { type: 'send_email', label: 'Enviar e-mail', icon: 'mail', fields: [f('subject', 'Assunto', 'text', { required: true }), f('body', 'Mensagem', 'textarea', { required: true }), f('topicId', 'Assunto (preferências)', 'ref', { source: 'topics', empty: 'Mensagem de serviço' })] },
    { type: 'send_sms', label: 'Enviar SMS', icon: 'phone', fields: [f('body', 'Mensagem', 'textarea', { required: true }), f('topicId', 'Assunto (preferências)', 'ref', { source: 'topics', empty: 'Mensagem de serviço' })] },
    { type: 'send_whatsapp', label: 'Enviar WhatsApp', icon: 'chat', fields: [f('body', 'Mensagem', 'textarea', { required: true }), f('topicId', 'Assunto (preferências)', 'ref', { source: 'topics', empty: 'Mensagem de serviço' })] },
    { type: 'send_instagram_dm', label: 'Enviar Direct no Instagram', icon: 'send', fields: [f('body', 'Mensagem privada', 'textarea', { required: true })] },
    { type: 'loyalty_points', label: 'Dar ou tirar pontos de fidelidade', icon: 'gift', description: 'Soma (ou subtrai, com número negativo) pontos no programa de fidelidade.', fields: [f('points', 'Pontos', 'number', { required: true, value: 50 }), f('reason', 'Motivo', 'text', { placeholder: 'Ex.: Indicação de amigo' })] },
    { type: 'add_to_sequence', label: 'Inscrever em sequência de e-mail', icon: 'mail', description: 'Coloca o contato numa sequência ativa (uma vez enquanto estiver nela).', fields: [f('sequenceId', 'Sequência', 'ref', { source: 'sequences', required: true, empty: 'Escolha a sequência' })] },
    { type: 'remove_from_sequence', label: 'Tirar de sequência de e-mail', icon: 'mail', description: 'Para os próximos e-mails da sequência para este contato.', fields: [f('sequenceId', 'Sequência', 'ref', { source: 'sequences', required: true, empty: 'Escolha a sequência' })] },
    { type: 'create_ticket', label: 'Criar ticket', icon: 'inbox', description: 'Abre um ticket de atendimento para o contato. Use {{action.<etapa>.number}} para o número.', fields: [
      f('subject', 'Assunto', 'text', { required: true, placeholder: 'Ex.: Retorno sobre o pedido {{trigger.total}}' }), f('description', 'Descrição', 'textarea'),
      f('priority', 'Prioridade', 'select', { options: [['low', 'Baixa'], ['medium', 'Média'], ['high', 'Alta'], ['urgent', 'Urgente']], value: 'medium' }), f('category', 'Categoria', 'text')
    ] },
    { type: 'update_ticket', label: 'Mudar situação do ticket', icon: 'inbox', description: 'Muda a situação do ticket aberto mais recente do contato.', fields: [f('status', 'Nova situação', 'select', { options: [['open', 'Aberto'], ['pending', 'Em andamento'], ['waiting', 'Aguardando cliente'], ['resolved', 'Resolvido'], ['closed', 'Fechado']], required: true, value: 'resolved' })] },
    { type: 'issue_certificate', label: 'Emitir certificado', icon: 'award', description: 'Emite um certificado de um modelo para o contato, com página pública e código de verificação. Use {{action.<etapa>.code}} para o código.', fields: [
      f('templateId', 'Modelo', 'ref', { source: 'certificateTemplates', required: true, empty: 'Escolha o modelo' }),
      f('subject', 'Sobre o quê (curso, evento, conquista)', 'text', { required: true, placeholder: 'Ex.: Workshop de Vendas 2026' })
    ] },
    { type: 'issue_badge', label: 'Emitir badge', icon: 'star', description: 'Concede um badge de um modelo ao contato.', fields: [
      f('templateId', 'Modelo', 'ref', { source: 'badgeTemplates', required: true, empty: 'Escolha o modelo' }),
      f('subject', 'Pelo quê', 'text', { required: true, placeholder: 'Ex.: 10 indicações' })
    ] },
    { type: 'grant_course_access', label: 'Liberar acesso a curso', icon: 'book', description: 'Dá ao contato acesso ao curso no portal do cliente (e envia o link de entrada, se o e-mail do portal estiver configurado). O contato precisa ter e-mail.', fields: [f('courseId', 'Curso', 'ref', { source: 'courses', required: true, empty: 'Escolha o curso' })] },
    { type: 'revoke_course_access', label: 'Remover acesso a curso', icon: 'book', description: 'Tira o acesso do contato ao curso no portal. O progresso fica guardado se o acesso voltar.', fields: [f('courseId', 'Curso', 'ref', { source: 'courses', required: true, empty: 'Escolha o curso' })] },
    { type: 'grant_community_access', label: 'Liberar acesso a comunidade', icon: 'users', description: 'Coloca o contato como membro da comunidade (criando o acesso dele ao portal, se preciso). O contato precisa ter e-mail.', fields: [f('communityId', 'Comunidade', 'ref', { source: 'communities', required: true, empty: 'Escolha a comunidade' })] },
    { type: 'grant_offer', label: 'Liberar oferta', icon: 'book', description: 'Dá ao contato todos os cursos e comunidades de uma oferta, sem cobrança (e envia o link do portal, se o e-mail do portal estiver configurado). O contato precisa ter e-mail.', fields: [f('offerId', 'Oferta', 'ref', { source: 'offers', required: true, empty: 'Escolha a oferta' })] },
    { type: 'revoke_offer', label: 'Remover oferta', icon: 'close', description: 'Tira do contato os cursos e comunidades da oferta.', fields: [f('offerId', 'Oferta', 'ref', { source: 'offers', required: true, empty: 'Escolha a oferta' })] },
    { type: 'register_event', label: 'Inscrever em evento da comunidade', icon: 'cal', description: 'Confirma a presença do contato num evento gratuito da comunidade, se houver vaga. Ele precisa ser membro ativo da comunidade do evento.', fields: [
      f('eventId', 'Evento', 'ref', { source: 'communityEvents', required: true, empty: 'Escolha o evento' })
    ] },
    { type: 'grant_channel_access', label: 'Liberar canal privado', icon: 'lock', description: 'Dá ao contato acesso a um canal privado da comunidade. Ele precisa ser membro ativo da comunidade.', fields: [
      f('channel', 'Canal privado', 'ref', { source: 'privateChannels', required: true, empty: 'Escolha o canal' })
    ] },
    { type: 'revoke_channel_access', label: 'Remover canal privado', icon: 'lock', description: 'Tira do contato o acesso a um canal privado da comunidade. Ele continua na comunidade.', fields: [
      f('channel', 'Canal privado', 'ref', { source: 'privateChannels', required: true, empty: 'Escolha o canal' })
    ] },
    { type: 'community_points', label: 'Dar pontos no ranking da comunidade', icon: 'award', description: 'Soma (ou tira, com número negativo) pontos do contato no ranking da comunidade. Só vale para membros ativos.', fields: [
      f('communityId', 'Comunidade', 'ref', { source: 'communities', required: true, empty: 'Escolha a comunidade' }),
      f('points', 'Pontos (negativo tira)', 'number', { required: true, value: 10, min: -1000, max: 1000 }),
      f('note', 'Motivo (opcional)', 'text', { placeholder: 'Ex.: Concluiu o desafio da semana' })
    ] },
    { type: 'revoke_community_access', label: 'Remover acesso a comunidade', icon: 'users', description: 'Tira o contato da comunidade. Membros banidos continuam banidos.', fields: [f('communityId', 'Comunidade', 'ref', { source: 'communities', required: true, empty: 'Escolha a comunidade' })] },
    { type: 'adjust_score', label: 'Ajustar pontuação do lead', icon: 'star', description: 'Soma ou subtrai pontos da pontuação do contato (use negativo para tirar).', fields: [f('points', 'Pontos', 'number', { required: true, min: -1000, max: 1000, value: 10 })] },
    { type: 'create_social_post', label: 'Criar post social', icon: 'send', description: 'Cria um post no Social Planner como rascunho ou agendado. Sem conta escolhida, usa as contas da fila da categoria ou todas as conectadas.', fields: [
      f('body', 'Texto do post', 'textarea', { required: true, placeholder: 'Ex.: Obrigado pela avaliação, {{contact.first_name}}!' }),
      f('mode', 'Como criar', 'select', { options: [['draft', 'Rascunho para revisar'], ['schedule', 'Agendar']] }),
      f('delay', 'Publicar daqui a (minutos)', 'number', { min: 0, max: 43200, value: 0 }),
      f('accountId', 'Conta', 'ref', { source: 'socialAccounts', empty: 'Contas da categoria ou todas' }),
      f('categoryId', 'Categoria', 'ref', { source: 'socialCategories', empty: 'Sem categoria' }),
      f('link', 'Link (opcional)', 'text'),
      f('image', 'URL da imagem (opcional)', 'text'),
      f('approval', 'Aprovação', 'select', { options: [['', 'Sem aprovação'], ['yes', 'Pedir aprovação antes de publicar']] })
    ] },
    { type: 'reply_social_comment', label: 'Responder comentário público', icon: 'chat', fields: [f('body', 'Resposta pública no post', 'textarea', { required: true })] },
    { type: 'send_live_chat', label: 'Enviar mensagem no chat do site', icon: 'chat', fields: [f('body', 'Mensagem', 'textarea', { required: true })] },
    { type: 'internal_notification', label: 'Notificação interna', icon: 'bell', fields: [f('body', 'Mensagem para a equipe', 'textarea', { required: true })] },
    { type: 'review_request', label: 'Pedir avaliação', icon: 'star', description: 'Envia o link de avaliação pessoal do contato com a mensagem do canal definida em Reputação → Configurações.', fields: [f('channel', 'Canal', 'select', { options: [['WhatsApp', 'WhatsApp'], ['Email', 'E-mail'], ['SMS', 'SMS']] })] },
    { type: 'manual_sms', label: 'Ação manual: SMS', icon: 'phone', fields: [f('body', 'Instruções', 'textarea', { required: true }), f('assignee', 'Responsável', 'text')] },
    { type: 'manual_whatsapp', label: 'Ação manual: WhatsApp', icon: 'whatsapp', fields: [f('body', 'Mensagem sugerida', 'textarea', { required: true, placeholder: 'Oi {{contact.first_name}}, …' }), f('assignee', 'Responsável', 'text')] },
    { type: 'manual_call', label: 'Ação manual: ligação', icon: 'phone', fields: [f('body', 'Instruções', 'textarea', { required: true }), f('assignee', 'Responsável', 'text')] }
  ] },
  { group: 'CRM e pagamentos', items: [
    { type: 'create_task', label: 'Criar tarefa', icon: 'check', fields: [f('title', 'Título', 'text', { required: true }), f('dueDays', 'Prazo em dias', 'number', { min: 0, max: 365, value: 1 }), f('owner', 'Responsável', 'text')] },
    { type: 'create_opportunity', label: 'Criar ou atualizar oportunidade', icon: 'leads', fields: [f('title', 'Nome', 'text', { required: true, value: '{{contact.name}}' }), f('stageId', 'Etapa', 'ref', { source: 'stages', required: true }), f('value', 'Valor (R$)', 'number', { min: 0, value: 0 })] },
    { type: 'opportunity_status', label: 'Mudar status da oportunidade', icon: 'leads', fields: [f('status', 'Status', 'select', { options: [['Won', 'Ganha'], ['Lost', 'Perdida'], ['Open', 'Aberta'], ['Abandoned', 'Abandonada']] })] },
    { type: 'opportunity_owner', label: 'Dono da oportunidade', icon: 'leads', description: 'Define ou tira o dono da oportunidade aberta mais recente do contato.', fields: [
      f('op', 'O que fazer', 'select', { options: [['set', 'Definir dono'], ['clear', 'Tirar o dono']] }), f('owner', 'Pessoa da equipe', 'text', { placeholder: 'Ana', when: { op: 'set' } }),
      f('pipelineId', 'Pipeline', 'ref', { source: 'pipelines', empty: 'Qualquer pipeline' })] },
    { type: 'opportunity_followers', label: 'Seguidores da oportunidade', icon: 'leads', description: 'Adiciona ou remove seguidores da oportunidade aberta mais recente do contato.', fields: [
      f('op', 'O que fazer', 'select', { options: [['add', 'Adicionar seguidores'], ['remove', 'Remover seguidores']] }), f('users', 'Pessoas da equipe (separadas por vírgula)', 'text', { required: true, placeholder: 'Ana, Bruno' }),
      f('pipelineId', 'Pipeline', 'ref', { source: 'pipelines', empty: 'Qualquer pipeline' })] },
    { type: 'find_opportunity', label: 'Buscar oportunidade', icon: 'search', description: 'Acha a oportunidade mais recente do contato. O resultado fica em {{steps.ID.found}}, {{steps.ID.title}}, {{steps.ID.value}}, {{steps.ID.stage}}, {{steps.ID.status}} e {{steps.ID.owner}}.', fields: [
      f('pipelineId', 'Pipeline', 'ref', { source: 'pipelines', empty: 'Qualquer pipeline' }),
      f('status', 'Status', 'select', { options: [['', 'Qualquer status'], ['Open', 'Aberta'], ['Won', 'Ganha'], ['Lost', 'Perdida'], ['Abandoned', 'Abandonada']] })] },
    { type: 'remove_opportunity', label: 'Remover oportunidade', icon: 'leads', description: 'Exclui a oportunidade mais recente do contato (do pipeline escolhido, se houver).', fields: [f('pipelineId', 'Pipeline', 'ref', { source: 'pipelines', empty: 'Qualquer pipeline' })] },
    { type: 'book_appointment', label: 'Agendar horário', icon: 'cal', description: 'Marca o contato no primeiro horário livre do serviço, a partir de alguns dias. Use {{steps.ID.start}} para a data e hora.', fields: [
      f('serviceId', 'Serviço', 'ref', { source: 'services', required: true, empty: 'Escolha o serviço' }),
      f('afterDays', 'A partir de quantos dias', 'number', { value: 1, min: 0, max: 365 }),
      f('address', 'Endereço (serviço em campo, aceita variáveis)', 'text', { placeholder: '{{contact.address}}' })
    ] },
    { type: 'booking_link', label: 'Gerar link de agendamento de uso único', icon: 'cal', description: 'Cria um link pessoal da página de agendamento, já com os dados do contato. Ele vale para um agendamento e vence depois dos dias escolhidos. Use {{vars.link_agendamento}} na mensagem.', fields: [
      f('serviceId', 'Serviço', 'ref', { source: 'services', empty: 'O cliente escolhe o serviço' }),
      f('days', 'Vale por quantos dias', 'number', { value: 7, min: 1, max: 90 }),
      f('variable', 'Guardar o link na variável', 'text', { value: 'link_agendamento', placeholder: 'link_agendamento' })
    ] },
    { type: 'appointment_note', label: 'Nota no agendamento', icon: 'note', description: 'Escreve nas observações do próximo agendamento do contato (ou do último criado).', fields: [
      f('which', 'Agendamento', 'select', { options: [['next', 'O próximo'], ['last', 'O último criado']] }),
      f('body', 'Nota (aceita variáveis)', 'textarea', { required: true }),
      f('mode', 'Como escrever', 'select', { options: [['append', 'Somar às observações'], ['replace', 'Substituir as observações']] })
    ] },
    { type: 'appointment_status_update', label: 'Mudar status do agendamento', icon: 'cal', description: 'Muda o próximo agendamento do contato (ou o último, se não houver próximo).', fields: [f('status', 'Novo status', 'select', { options: [['Confirmed', 'Confirmado'], ['Completed', 'Concluído'], ['Canceled', 'Cancelado']] })] },
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
    { type: 'create_invoice', label: 'Criar fatura', icon: 'pay', fields: [f('title', 'Descrição', 'text', { required: true }), f('value', 'Valor (R$)', 'number', { min: 0, required: true }), f('dueDays', 'Vence em (dias)', 'number', { min: 0, max: 365, value: 7 })] },
    { type: 'update_custom_value', label: 'Atualizar valor personalizado', icon: 'key', description: 'Muda um valor personalizado da conta, usado como {{custom_values.nome}} em todo lugar.', fields: [f('valueId', 'Valor personalizado', 'ref', { source: 'customValues', required: true, empty: 'Escolha um valor' }), f('value', 'Novo valor', 'text', { required: true })] }
  ] },
  { group: 'IA', items: [
    { type: 'ai_agent', label: 'Rodar agente de IA', icon: 'spark', ai: true, description: 'Manda uma mensagem para a versão publicada de um agente de IA desta subconta (com a base de conhecimento e a memória dele) e guarda a resposta em {{vars.nome}}. A execução aparece no histórico do agente.', fields: [
      f('agentId', 'Agente (publicado)', 'ref', { source: 'agents', required: true, empty: 'Escolha o agente' }),
      f('input', 'Mensagem para o agente (aceita variáveis)', 'textarea', { required: true, value: '{{trigger.body}}' }),
      f('variable', 'Guardar a resposta na variável', 'text', { required: true, value: 'resposta_agente' })
    ] },
    { type: 'ai_decision', label: 'Decidir com IA', icon: 'spark', ai: true, description: 'A IA escolhe uma das opções. Use a variável num Se / Senão ou Roteador.',
      fields: [f('question', 'O que a IA deve decidir', 'textarea', { required: true, placeholder: 'Ex.: Este lead está pronto para comprar?' }),
        f('options', 'Opções (separadas por vírgula)', 'text', { required: true, placeholder: 'quente, morno, frio' }),
        f('input', 'Informação para analisar (aceita variáveis)', 'textarea', { value: '{{trigger.body}}' }),
        f('variable', 'Guardar a resposta na variável', 'text', { value: 'decisao', required: true })] },
    { type: 'ai_summarize', label: 'Resumir com IA', icon: 'spark', ai: true, description: 'Resume uma conversa ou um texto em poucas linhas.',
      fields: [f('source', 'O que resumir', 'select', { options: [['conversation', 'Últimas mensagens do contato'], ['text', 'Um texto']] }),
        f('input', 'Texto (aceita variáveis)', 'textarea', { value: '{{trigger.body}}', when: { source: 'text' } }),
        f('length', 'Tamanho', 'select', { options: [['short', 'Uma frase'], ['medium', 'Um parágrafo'], ['bullets', 'Tópicos']] }),
        f('variable', 'Guardar o resumo na variável', 'text', { value: 'resumo', required: true }),
        f('note', 'Também salvar como nota do contato', 'select', { options: [['no', 'Não'], ['yes', 'Sim']] })] },
    { type: 'ai_intent', label: 'Detectar intenção com IA', icon: 'spark', ai: true, description: 'Classifica a mensagem numa das intenções. Sem encaixe, a variável fica “outra”.',
      fields: [f('intents', 'Intenções (separadas por vírgula)', 'text', { required: true, placeholder: 'comprar, agendar, suporte, cancelar' }),
        f('input', 'Mensagem (aceita variáveis)', 'textarea', { value: '{{trigger.body}}' }),
        f('variable', 'Guardar a intenção na variável', 'text', { value: 'intencao', required: true })] },
    { type: 'ai_translate', label: 'Traduzir com IA', icon: 'spark', ai: true,
      fields: [f('input', 'Texto (aceita variáveis)', 'textarea', { required: true, value: '{{trigger.body}}' }),
        f('language', 'Traduzir para', 'select', { options: [['pt', 'Português'], ['es', 'Espanhol'], ['en', 'Inglês']] }),
        f('variable', 'Guardar a tradução na variável', 'text', { value: 'traducao', required: true })] },
    { type: 'ai_extract', label: 'Extrair dados com IA', icon: 'spark', ai: true, description: 'Cada dado vira {{vars.nome}}. Use “Atualizar campo do contato” depois para gravar.',
      fields: [f('fields', 'Dados a extrair (um por linha: nome = descrição)', 'textarea', { required: true, placeholder: 'empresa = nome da empresa\norcamento = valor em reais\nprazo = quando quer começar' }),
        f('input', 'Texto de onde extrair (aceita variáveis)', 'textarea', { value: '{{trigger.body}}' })] },
    { type: 'ai_image', label: 'Analisar imagem com IA', icon: 'spark', ai: true, description: 'Descreve ou responde uma pergunta sobre uma imagem pública (https).',
      fields: [f('image', 'Endereço da imagem (aceita variáveis)', 'text', { required: true, placeholder: 'https://… ou {{trigger.attachment}}' }),
        f('question', 'Pergunta', 'textarea', { value: 'Descreva a imagem em poucas palavras.' }),
        f('variable', 'Guardar a resposta na variável', 'text', { value: 'analise_imagem', required: true })] }
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
    { type: 'split', label: 'Teste A/B', icon: 'flow', branch: true, description: 'Divide os contatos entre caminhos por percentual, para comparar mensagens, ofertas ou tempos de espera. Cada contato cai em um caminho por sorteio.', fields: [] },
    { type: 'loop', label: 'Repetir (loop)', icon: 'updown', branch: true, description: 'Roda as etapas de dentro uma vez para cada item de uma lista (ou um número de vezes) e depois segue o fluxo. Dentro, use {{vars.item}}, {{vars.item_numero}} e {{vars.item_total}}. Até 50 repetições.', fields: [
      f('mode', 'Repetir', 'select', { options: [['list', 'Para cada item de uma lista'], ['count', 'Um número de vezes']] }),
      f('items', 'Lista (aceita variáveis)', 'textarea', { placeholder: '{{contact.tags}} ou maçã, pera, uva' }),
      f('separator', 'Separador dos itens', 'text', { value: ',', placeholder: ', ou \\n para um item por linha' }),
      f('times', 'Quantas vezes', 'number', { value: 3, min: 1, max: 50 }),
      f('variable', 'Nome da variável do item', 'text', { value: 'item', placeholder: 'item' })
    ] },
    { type: 'drip', label: 'Liberar em lotes', icon: 'clock', description: 'Deixa passar só um lote de contatos a cada intervalo; os outros esperam a vez nesta etapa. Útil para não disparar tudo de uma vez.', fields: [
      f('batch', 'Contatos por lote', 'number', { min: 1, max: 1000, value: 50, required: true }),
      f('amount', 'A cada', 'number', { min: 1, max: 1000, value: 1, required: true }),
      f('unit', 'Unidade', 'select', { options: [['minutes', 'minutos'], ['hours', 'horas'], ['days', 'dias']], value: 'hours' })
    ] },
    { type: 'goal', label: 'Evento de meta', icon: 'award', fields: [f('event', 'Meta alcançada quando', 'select', { options: [['contact_tag', 'Receber uma tag'], ['customer_replied', 'Cliente responder'], ['form_submitted', 'Enviar um formulário'], ['appointment_booked', 'Fazer um agendamento'], ['order_paid', 'Pagar um pedido'], ['opportunity_status_changed', 'Oportunidade ganha']] }), f('eventValue', 'Tag ou formulário (opcional)', 'text'),
      f('otherwise', 'Ao chegar aqui sem a meta', 'select', { options: [['continue', 'Seguir o fluxo'], ['wait', 'Esperar a meta'], ['end', 'Encerrar o fluxo']] })] },
    { type: 'goto', label: 'Ir para outra etapa', icon: 'updown', fields: [f('target', 'Etapa de destino', 'step', { required: true })] },
    { type: 'add_to_workflow', label: 'Adicionar a outro fluxo', icon: 'flow', fields: [f('workflowId', 'Fluxo', 'ref', { source: 'workflows', required: true })] },
    { type: 'remove_from_workflow', label: 'Remover de um fluxo', icon: 'close', fields: [f('workflowId', 'Fluxo', 'ref', { source: 'workflows', empty: 'Este fluxo' })] },
    { type: 'remove_from_all_workflows', label: 'Remover de todos os fluxos', icon: 'close', description: 'Tira o contato de todos os fluxos em que ele está rodando ou esperando.', fields: [
      f('scope', 'Incluindo este fluxo?', 'select', { options: [['others', 'Não: este fluxo continua'], ['all', 'Sim: este fluxo também termina aqui']] })
    ] },
    { type: 'math', label: 'Operação matemática', icon: 'sort', fields: [f('field', 'Campo numérico', 'ref', { source: 'numberFields', required: true }), f('op', 'Operação', 'select', { options: [['add', 'Somar'], ['subtract', 'Subtrair'], ['multiply', 'Multiplicar'], ['divide', 'Dividir'], ['set', 'Definir como']] }), f('number', 'Valor', 'number', { required: true, value: 1 })] },
    { type: 'text_format', label: 'Formatar texto', icon: 'edit', fields: [f('field', 'Campo', 'ref', { source: 'textFields', required: true }), f('op', 'Formato', 'select', { options: [['upper', 'MAIÚSCULAS'], ['lower', 'minúsculas'], ['title', 'Primeira Letra Maiúscula'], ['trim', 'Sem espaços nas pontas']] })] },
    { type: 'date_format', label: 'Formatar data', icon: 'clock', description: 'Guarda uma data formatada em {{vars.nome}}. Aceita AAAA-MM-DD, data com hora ou a palavra hoje.', fields: [f('value', 'Data', 'text', { required: true, placeholder: '2026-12-01, {{vars.data}} ou hoje' }), f('days', 'Somar dias', 'number', { value: 0, min: -3650, max: 3650 }), f('format', 'Formato', 'select', { options: [['br', 'DD/MM/AAAA'], ['iso', 'AAAA-MM-DD'], ['long', 'Por extenso (21 de novembro de 2026)'], ['weekday', 'Dia da semana'], ['time', 'Hora (HH:MM)']] }), f('variable', 'Nome da variável', 'text', { required: true, placeholder: 'data' })] },
    { type: 'number_format', label: 'Formatar número', icon: 'sort', description: 'Guarda um número formatado em {{vars.nome}}.', fields: [f('value', 'Número', 'text', { required: true, placeholder: '{{trigger.total}}' }), f('format', 'Formato', 'select', { options: [['brl', 'Moeda (R$ 1.234,56)'], ['decimal', 'Duas casas (1.234,56)'], ['integer', 'Inteiro (1.235)'], ['percent', 'Percentual (12,5%)']] }), f('variable', 'Nome da variável', 'text', { required: true, placeholder: 'valor' })] },
    { type: 'list_format', label: 'Formatar lista', icon: 'list', description: 'Trata um texto como lista (itens separados por vírgula ou outro separador) e guarda o resultado em {{vars.nome}}.', fields: [
      f('value', 'Lista (aceita variáveis)', 'textarea', { required: true, placeholder: '{{contact.tags}} ou maçã, pera, uva' }),
      f('separator', 'Separador dos itens', 'text', { value: ',', placeholder: ', ou \\n para um item por linha' }),
      f('op', 'O que fazer', 'select', { options: [['count', 'Contar os itens'], ['first', 'Primeiro item'], ['last', 'Último item'], ['item', 'Item na posição'], ['contains', 'Contém o valor (yes ou no)'], ['unique', 'Tirar repetidos'], ['sort', 'Ordenar de A a Z'], ['reverse', 'Inverter a ordem'], ['join', 'Juntar de novo']] }),
      f('position', 'Posição (1 = primeiro, -1 = último)', 'number', { value: 1, min: -1000, max: 1000 }),
      f('search', 'Valor procurado', 'text', { placeholder: 'Só para “Contém o valor”' }),
      f('joiner', 'Juntar o resultado com', 'select', { options: [['comma', 'Vírgula (a, b)'], ['semicolon', 'Ponto e vírgula (a; b)'], ['pipe', 'Barra (a | b)'], ['and', 'A palavra e (a e b)'], ['line', 'Um por linha'], ['space', 'Espaço (a b)'], ['none', 'Nada (ab)']] }),
      f('variable', 'Nome da variável', 'text', { required: true, placeholder: 'lista' })
    ] },
    { type: 'app_action', label: 'Ação de app', icon: 'grid', description: 'Envia o contato e o texto abaixo para um app instalado do marketplace. O app recebe a ação no webhook dele.', fields: [f('action', 'Ação', 'ref', { source: 'appActions', empty: 'Escolha a ação de um app', required: true }), f('data', 'Dados enviados ao app', 'textarea', { placeholder: 'Ex.: plano {{contact.custom.plano}}' })] },
    { type: 'webhook', label: 'Webhook de saída', icon: 'send', fields: [f('url', 'Endereço (https://)', 'text', { required: true, placeholder: 'https://' }), f('method', 'Método', 'select', { options: [['POST', 'POST'], ['PUT', 'PUT'], ['GET', 'GET']] })] },
    { type: 'end', label: 'Encerrar fluxo', icon: 'close' }
  ] }
];

export const allTriggers = triggerCatalog.flatMap(group => group.items.map(item => ({ ...item, group: group.group })));
export const allActions = actionCatalog.flatMap(group => group.items.map(item => ({ ...item, group: group.group })));
export const triggerSpec = type => allTriggers.find(item => item.type === type);
export const actionSpec = type => allActions.find(item => item.type === type);

// "nome = descrição" lines of the extract action, as variable names the engine can store.
export const aiVariableName = value => String(value || '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
export function aiExtractFields(text) {
  const seen = new Set();
  return String(text || '').split('\n').map(line => {
    const [name, ...rest] = line.split('=');
    return { name: aiVariableName(name), description: rest.join('=').trim().slice(0, 200) };
  }).filter(item => item.name && !seen.has(item.name) && seen.add(item.name)).slice(0, 12);
}
export const aiOptions = text => [...new Set(String(text || '').split(',').map(item => item.trim()).filter(Boolean))].slice(0, 12);

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
    if (step.type === 'router' || step.type === 'split') (step.routes || []).forEach(route => eachStep(route.steps, visit, [...path, step.id, route.id]));
    if (step.type === 'router') eachStep(step.otherwise, visit, [...path, step.id, 'otherwise']);
    if (step.type === 'loop') eachStep(step.body, visit, [...path, step.id, 'body']);
  }
}

// Teste A/B: the paths' shares as whole percents, 0 to 100 each.
export const splitPercent = value => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

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
    case 'ai_decision': return `${String(c.options || '').slice(0, 50)} → vars.${c.variable || 'decisao'}`;
    case 'ai_intent': return `${String(c.intents || '').slice(0, 50)} → vars.${c.variable || 'intencao'}`;
    case 'ai_agent': return [ref('agents', c.agentId), c.variable ? `→ vars.${c.variable}` : ''].filter(Boolean).join(' ');
    case 'ai_summarize': case 'ai_translate': case 'ai_image': return c.variable ? `→ vars.${c.variable}` : '';
    case 'ai_extract': return aiExtractFields(c.fields).map(item => `vars.${item.name}`).join(', ').slice(0, 80);
    case 'router': return `${(step.routes || []).length} caminho(s)`;
    case 'split': return (step.routes || []).map(route => `${route.label} ${splitPercent(route.percent)}%`).join(' · ').slice(0, 80);
    case 'loop': return c.mode === 'count' ? `${c.times || 0} vez(es)` : `Cada item de ${String(c.items || '').slice(0, 40) || '…'}`;
    case 'drip': return `${c.batch || 0} a cada ${c.amount || 1} ${({ minutes: 'min', hours: 'h', days: 'dia(s)' })[c.unit || 'hours']}`;
    case 'register_event': return ref('communityEvents', c.eventId);
    case 'grant_channel_access': case 'revoke_channel_access': return ref('privateChannels', c.channel);
    case 'grant_offer': case 'revoke_offer': return ref('offers', c.offerId);
    case 'community_points': return [ref('communities', c.communityId), c.points ? `${c.points > 0 ? '+' : ''}${c.points} pts` : ''].filter(Boolean).join(' · ');
    case 'book_appointment': return ref('services', c.serviceId) + (Number(c.afterDays) ? ` · em ${c.afterDays} dia(s)` : '');
    case 'booking_link': return [ref('services', c.serviceId) || 'Qualquer serviço', `${c.days || 7} dia(s)`].join(' · ');
    case 'appointment_note': return String(c.body || '').slice(0, 60);
    case 'company_create': return c.name || '';
    case 'company_update': return c.field ? `${c.field} = ${String(c.value || '').slice(0, 50)}` : '';
    case 'company_clear': return ({ all: 'Todos os campos', contact: 'Telefone, e-mail e site', address: 'Endereço completo' })[c.field] || c.field || '';
    case 'email_verify': return c.invalidTag ? `Inválido → tag ${c.invalidTag}` : '→ vars.email_status';
    case 'merge_contact': return `${({ email: 'Mesmo e-mail', phone: 'Mesmo telefone' })[c.by] || 'Mesmo e-mail ou telefone'} · ${c.keep === 'oldest' ? 'mantém o mais antigo' : 'mantém este'}`;
    case 'list_format': return c.variable ? `→ vars.${c.variable}` : '';
    case 'remove_from_all_workflows': return c.scope === 'all' ? 'Inclusive este' : 'Menos este';
    case 'update_affiliate': return ({ active: 'Ativo', paused: 'Pausado', pending: 'Aguardando aprovação' })[c.status] || '';
    case 'add_affiliate_campaign': case 'remove_affiliate_campaign': return ref('affiliateCampaigns', c.campaignId);
    case 'assign_affiliate_lead': return ref('affiliates', c.affiliateId);
    case 'affiliate_manual_sale': return c.amount ? `R$ ${c.amount}` : '';
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
