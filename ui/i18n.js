// Rótulos em português para valores que ficam salvos em inglês nos registros
// (status, canais, tipos, gatilhos). O valor salvo não muda; só o texto exibido.
const PT = {
  // Oportunidades, faturas, agendamentos, campanhas
  Open: 'Em aberto', Won: 'Ganha', Lost: 'Perdida', Abandoned: 'Abandonada',
  Confirmed: 'Confirmado', Completed: 'Concluído', Canceled: 'Cancelado', Cancelled: 'Cancelado',
  Draft: 'Rascunho', Paid: 'Pago', Void: 'Anulada', Planned: 'Planejado', Archived: 'Arquivado', Published: 'Publicado',
  // Canais e mensagens
  Social: 'Social', Email: 'E-mail', SMS: 'SMS', Note: 'Nota', Outbound: 'Enviada', Inbound: 'Recebida', Text: 'Texto',
  // Páginas e agentes
  Funnel: 'Funil', Website: 'Site', Support: 'Suporte', Sales: 'Vendas', Scheduling: 'Agendamento',
  // Ações manuais e automações
  Pending: 'Pendente', Skipped: 'Ignorada', Running: 'Em execução', 'Manual Call': 'Ligação manual', 'Manual SMS': 'SMS manual',
  'Add tag': 'Adicionar tag', 'Create task': 'Criar tarefa', 'Create opportunity': 'Criar oportunidade', 'Log message': 'Registrar mensagem',
  'Contact created': 'Contato criado', 'Form submitted': 'Formulário enviado', 'Opportunity stage changed': 'Etapa da oportunidade alterada',
  'Appointment booked': 'Agendamento marcado', 'Trigger link clicked': 'Link de rastreamento clicado',
  // SLA
  Met: 'Cumprido', Breached: 'Estourado', Overdue: 'Atrasado', 'Due soon': 'Vence em breve', Waiting: 'Aguardando', Dismissed: 'Dispensado',
  All: 'Todos',
  // Painel (títulos padrão dos widgets já salvos)
  Dashboard: 'Painel', 'Opportunity status': 'Status das oportunidades', 'Opportunity value': 'Valor das oportunidades',
  'Conversion rate': 'Taxa de conversão', 'Stages distribution': 'Distribuição por etapa', Tasks: 'Tarefas', 'Manual actions': 'Ações manuais',
  'Lead source report': 'Relatório de origem dos leads', 'Google Analytics count': 'Contagem do Google Analytics',
  'Google Analytics chart': 'Gráfico do Google Analytics', 'Meta Ads report': 'Relatório do Meta Ads', 'Google Ads report': 'Relatório do Google Ads',
  'Email health report': 'Saúde do e-mail', 'Sales efficiency': 'Eficiência de vendas', 'Contacts created': 'Contatos criados',
  Appointments: 'Agendamentos', 'Paid invoices': 'Faturas pagas', 'Sticky note': 'Nota adesiva', 'Sales Pipeline': 'Pipeline de vendas',
  // Agência
  Active: 'Ativa', Paused: 'Pausada', Closed: 'Encerrada', New: 'Novo', Contacted: 'Contatado', 'Proposal sent': 'Proposta enviada',
  Trial: 'Teste', Requested: 'Solicitado', Withdrawn: 'Retirado', 'In progress': 'Em andamento', Declined: 'Recusado', 'Under review': 'Em análise',
  'Agency Owner': 'Dono da agência', 'Agency Admin': 'Admin da agência', 'Agency User': 'Usuário da agência',
  'Account Admin': 'Admin da conta', 'Account User': 'Usuário da conta',
  Design: 'Design', Development: 'Desenvolvimento', 'Paid ads': 'Anúncios pagos', Copywriting: 'Redação', Consulting: 'Consultoria', Other: 'Outro',
  Conversations: 'Conversas', Automation: 'Automação', Payments: 'Pagamentos', Reporting: 'Relatórios', Mobile: 'Celular',
  'New tab': 'Nova aba', 'Inside the app': 'Dentro do app', 'Sub-accounts': 'Subcontas', Agency: 'Agência', Both: 'Ambos',
  Information: 'Informação', Success: 'Sucesso', Warning: 'Aviso', Credit: 'Crédito', Charge: 'Cobrança', 'Bank transfer': 'Transferência bancária',
  Subscription: 'Assinatura', 'Subscription + usage': 'Assinatura + uso',
  Automotive: 'Automotivo', Beauty: 'Beleza', Creative: 'Criativo', Financial: 'Financeiro', Health: 'Saúde',
  'Home services': 'Serviços residenciais', Legal: 'Jurídico', 'Real estate': 'Imobiliário', Technology: 'Tecnologia',
  Calendars: 'Calendários', Phone: 'Telefone', Accounting: 'Contabilidade', Team: 'Equipe', Commerce: 'Comércio'
};

export const tr = value => PT[value] ?? value;
