// i18n: Suporte completo a Português (Brasil) e Espanhol Latinoamericano (es-419).
// O idioma padrão é Português. O usuário escolhe o idioma via interface,
// e a seleção persiste no localStorage ('soci_lang').

let currentLang = 'pt';
try {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('soci_lang');
    if (saved === 'es' || saved === 'pt') currentLang = saved;
  }
} catch {}

export function getLanguage() {
  return currentLang;
}

export const languages = [
  { id: 'pt', label: 'Português', flag: 'PT' },
  { id: 'es', label: 'Español Latino', flag: 'ES' }
];

export function setLanguage(lang) {
  if (lang !== 'es' && lang !== 'pt') return;
  currentLang = lang;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('soci_lang', lang);
    }
  } catch {}
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang === 'es' ? 'es-419' : 'pt-BR';
    document.querySelectorAll('[data-lang-choice]').forEach(btn => {
      const isThis = btn.dataset.langChoice === lang;
      btn.classList.toggle('active', isThis);
      btn.setAttribute('aria-pressed', String(isThis));
    });
    document.querySelectorAll('[data-lang-choice-select]').forEach(sel => {
      sel.value = lang;
    });
    if (lang === 'es') {
      translateDom(document.body);
    } else {
      restoreDom(document.body);
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('soci:languagechange', { detail: { lang } }));
  }
}

export function langToggle() {
  const lang = getLanguage();
  return `<div class="lang-switcher" role="group" aria-label="${lang === 'es' ? 'Seleccionar idioma' : 'Selecionar idioma'}">
    <button type="button" class="lang-btn ${lang === 'pt' ? 'active' : ''}" data-lang-choice="pt" data-tip="Português" data-tip-pos="bottom" aria-label="Português" aria-pressed="${lang === 'pt'}">PT</button>
    <button type="button" class="lang-btn ${lang === 'es' ? 'active' : ''}" data-lang-choice="es" data-tip="Español Latino" data-tip-pos="bottom" aria-label="Español Latino" aria-pressed="${lang === 'es'}">ES</button>
  </div>`;
}

// Rótulos em português para valores que ficam salvos em inglês nos registros
export const PT = {
  // Oportunidades, faturas, agendamentos, campanhas
  Open: 'Em aberto', Won: 'Ganha', Lost: 'Perdida', Abandoned: 'Abandonada',
  Confirmed: 'Confirmado', Completed: 'Concluído', Canceled: 'Cancelado', Cancelled: 'Cancelado',
  Draft: 'Rascunho', Paid: 'Pago', Void: 'Anulada', Planned: 'Planejado', Archived: 'Arquivado', Published: 'Publicado',
  // Etapas e pipelines padrão
  'New Lead': 'Novo lead', 'New lead': 'Novo lead', Qualified: 'Qualificado', qualified: 'Qualificado',
  Proposal: 'Proposta', proposal: 'Proposta', 'Sales Pipeline': 'Pipeline de vendas',
  // Canais e mensagens
  Social: 'Social', Email: 'E-mail', SMS: 'SMS', Note: 'Nota', 'Live chat': 'Chat ao vivo', Outbound: 'Enviada', Inbound: 'Recebida', Text: 'Texto',
  // Páginas e agentes
  Funnel: 'Funil', Website: 'Site', Support: 'Suporte', Sales: 'Vendas', Scheduling: 'Agendamento',
  // Ações manuais e automações
  Pending: 'Pendente', Skipped: 'Ignorada', Running: 'Em execução', 'Manual Call': 'Ligação manual', 'Manual SMS': 'SMS manual',
  'Add tag': 'Adicionar tag', 'Create task': 'Criar tarefa', 'Create opportunity': 'Criar oportunidade', 'Log message': 'Registrar mensagem',
  'Contact created': 'Contato criado', 'Form submitted': 'Formulário enviado', 'Opportunity stage changed': 'Etapa da oportunidade alterada',
  'Appointment booked': 'Agendamento marcado', 'Trigger link clicked': 'Link de rastreamento clicado',
  Unassigned: 'Não atribuído', 'Contact removed': 'Contato removido', 'Good Work!': 'Bom trabalho!',
  // SLA
  Met: 'Cumprido', Breached: 'Estourado', Overdue: 'Atrasado', 'Due soon': 'Vence em breve', Waiting: 'Aguardando', Dismissed: 'Dispensado',
  All: 'Todos', 'Waiting for reply': 'Aguardando resposta', 'Average response': 'Tempo médio de resposta',
  // Filtros e opções comuns
  'All workflows': 'Todos os fluxos', 'All assignees': 'Todos os responsáveis', 'All statuses': 'Todos os status',
  'Any type': 'Qualquer tipo', 'All channels': 'Todos os canais', 'All pipelines': 'Todos os pipelines',
  'All folders': 'Todas as pastas', 'No folder': 'Nenhuma pasta',
  // Snippets e links
  Snippets: 'Respostas rápidas', Snippet: 'Resposta rápida', 'All Snippets': 'Todas as respostas',
  Folders: 'Pastas', 'Snippet folders': 'Pastas de respostas rápidas',
  'Trigger Links': 'Links de rastreamento', 'Trigger links': 'Links de rastreamento',
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
  Calendars: 'Calendários', Phone: 'Telefone', Accounting: 'Contabilidade', Team: 'Equipe', Commerce: 'Comércio',
  // Configurador SaaS e recursos por subconta
  'Phone calls and SMS': 'Ligações e SMS', 'Email sending': 'Envio de e-mails', 'Premium workflow actions': 'Ações premium de workflow',
  'Conversation and content AI': 'IA de conversas e conteúdo', 'WhatsApp messages': 'Mensagens de WhatsApp', 'Voice AI minutes': 'Minutos de IA de voz',
  'Contact enrichment': 'Enriquecimento de contatos', Cash: 'Dinheiro', Pix: 'Pix', Card: 'Cartão', Manual: 'Manual', 'Domain purchases': 'Compra de domínios',
  'Workflow - Premium Features': 'Workflow: recursos premium', 'Workflow - External AI Models': 'Workflow: modelos de IA externos', 'Domain Purchase': 'Compra de domínios',
  'Look up the line type and carrier of phone numbers before sending SMS.': 'Consulta o tipo de linha e a operadora do número antes de enviar SMS.',
  'Premium triggers and actions in the workflow builder of each sub-account.': 'Gatilhos e ações premium no construtor de workflows de cada subconta.',
  'Workflow actions that call external AI models from a sub-account.': 'Ações de workflow que chamam modelos de IA externos a partir da subconta.',
  'Let sub-accounts buy domains from inside Sites settings.': 'Permite que as subcontas comprem domínios nas configurações de Sites.'
};

// Rótulos em Espanhol Latino (es-419) para valores em inglês nos registros
export const ES = {
  // Oportunidades, facturas, citas, campañas
  Open: 'Abierta', Won: 'Ganada', Lost: 'Perdida', Abandoned: 'Abandonada',
  Confirmed: 'Confirmado', Completed: 'Completado', Canceled: 'Cancelado', Cancelled: 'Cancelado',
  Draft: 'Borrador', Paid: 'Pagado', Void: 'Anulada', Planned: 'Planificado', Archived: 'Archivado', Published: 'Publicado',
  // Etapas y pipelines estándar
  'New Lead': 'Nuevo lead', 'New lead': 'Nuevo lead', Qualified: 'Calificado', qualified: 'Calificado',
  Proposal: 'Propuesta', proposal: 'Propuesta', 'Sales Pipeline': 'Pipeline de ventas',
  // Canales y mensajes
  Social: 'Social', Email: 'Correo electrónico', SMS: 'SMS', Note: 'Nota', 'Live chat': 'Chat en vivo', Outbound: 'Enviada', Inbound: 'Recibida', Text: 'Texto',
  // Páginas y agentes
  Funnel: 'Embudo', Website: 'Sitio web', Support: 'Soporte', Sales: 'Ventas', Scheduling: 'Agendamiento',
  // Acciones manuales y automatizaciones
  Pending: 'Pendiente', Skipped: 'Omitida', Running: 'En ejecución', 'Manual Call': 'Llamada manual', 'Manual SMS': 'SMS manual',
  'Add tag': 'Agregar etiqueta', 'Create task': 'Crear tarea', 'Create opportunity': 'Crear oportunidad', 'Log message': 'Registrar mensaje',
  'Contact created': 'Contacto creado', 'Form submitted': 'Formulario enviado', 'Opportunity stage changed': 'Etapa de oportunidad cambiada',
  'Appointment booked': 'Cita agendada', 'Trigger link clicked': 'Enlace de rastreo clickeado',
  Unassigned: 'Sin asignar', 'Contact removed': 'Contacto eliminado', 'Good Work!': '¡Buen trabajo!',
  // SLA
  Met: 'Cumplido', Breached: 'Incumplido', Overdue: 'Vencido', 'Due soon': 'Por vencer', Waiting: 'En espera', Dismissed: 'Descartado',
  All: 'Todos', 'Waiting for reply': 'Esperando respuesta', 'Average response': 'Tiempo promedio de respuesta',
  // Filtros y opciones comunes
  'All workflows': 'Todos los flujos', 'All assignees': 'Todos los responsables', 'All statuses': 'Todos los estados',
  'Any type': 'Cualquier tipo', 'All channels': 'Todos los canales', 'All pipelines': 'Todos los pipelines',
  'All folders': 'Todas las carpetas', 'No folder': 'Sin carpeta',
  // Snippets y enlaces
  Snippets: 'Respuestas rápidas', Snippet: 'Respuesta rápida', 'All Snippets': 'Todas las respuestas',
  Folders: 'Carpetas', 'Snippet folders': 'Carpetas de respuestas rápidas',
  'Trigger Links': 'Enlaces de rastreo', 'Trigger links': 'Enlaces de rastreo',
  // Panel
  Dashboard: 'Panel de control', 'Opportunity status': 'Estado de las oportunidades', 'Opportunity value': 'Valor de las oportunidades',
  'Conversion rate': 'Tasa de conversión', 'Stages distribution': 'Distribución por etapa', Tasks: 'Tareas', 'Manual actions': 'Acciones manuales',
  'Lead source report': 'Informe de origen de leads', 'Google Analytics count': 'Conteo de Google Analytics',
  'Google Analytics chart': 'Gráfico de Google Analytics', 'Meta Ads report': 'Informe de Meta Ads', 'Google Ads report': 'Informe de Google Ads',
  'Email health report': 'Salud del correo electrónico', 'Sales efficiency': 'Eficiencia de ventas', 'Contacts created': 'Contactos creados',
  Appointments: 'Citas', 'Paid invoices': 'Facturas pagadas', 'Sticky note': 'Nota adhesiva',
  // Agencia
  Active: 'Activa', Paused: 'Pausada', Closed: 'Cerrada', New: 'Nuevo', Contacted: 'Contactado', 'Proposal sent': 'Propuesta enviada',
  Trial: 'Prueba', Requested: 'Solicitado', Withdrawn: 'Retirado', 'In progress': 'En progreso', Declined: 'Rechazado', 'Under review': 'En revisión',
  'Agency Owner': 'Dueño de la agencia', 'Agency Admin': 'Admin de la agencia', 'Agency User': 'Usuario de la agencia',
  'Account Admin': 'Admin de la cuenta', 'Account User': 'Usuario de la cuenta',
  Design: 'Diseño', Development: 'Desarrollo', 'Paid ads': 'Anuncios pagados', Copywriting: 'Redacción', Consulting: 'Consultoría', Other: 'Otro',
  Conversations: 'Conversaciones', Automation: 'Automatización', Payments: 'Pagos', Reporting: 'Informes', Mobile: 'Celular',
  'New tab': 'Nueva pestaña', 'Inside the app': 'Dentro de la app', 'Sub-accounts': 'Subcuentas', Agency: 'Agencia', Both: 'Ambos',
  Information: 'Información', Success: 'Éxito', Warning: 'Advertencia', Credit: 'Crédito', Charge: 'Cobro', 'Bank transfer': 'Transferencia bancaria',
  Subscription: 'Suscripción', 'Subscription + usage': 'Suscripción + uso',
  Automotive: 'Automotriz', Beauty: 'Belleza', Creative: 'Creativo', Financial: 'Financiero', Health: 'Salud',
  'Home services': 'Servicios para el hogar', Legal: 'Legal', 'Real estate': 'Bienes raíces', Technology: 'Tecnología',
  Calendars: 'Calendarios', Phone: 'Teléfono', Accounting: 'Contabilidad', Team: 'Equipo', Commerce: 'Comercio',
  // Configurador SaaS
  'Phone calls and SMS': 'Llamadas y SMS', 'Email sending': 'Envío de correos', 'Premium workflow actions': 'Acciones premium de workflow',
  'Conversation and content AI': 'IA de conversaciones y contenido', 'WhatsApp messages': 'Mensajes de WhatsApp', 'Voice AI minutes': 'Minutos de IA de voz',
  'Contact enrichment': 'Enriquecimiento de contactos', Cash: 'Efectivo', Pix: 'Pix', Card: 'Tarjeta', Manual: 'Manual', 'Domain purchases': 'Compra de dominios',
  'Workflow - Premium Features': 'Workflow: funciones premium', 'Workflow - External AI Models': 'Workflow: modelos de IA externos', 'Domain Purchase': 'Compra de dominios',
  'Look up the line type and carrier of phone numbers before sending SMS.': 'Consulta el tipo de línea y operadora del número antes de enviar SMS.',
  'Premium triggers and actions in the workflow builder of each sub-account.': 'Disparadores y acciones premium en el constructor de workflows de cada subcuenta.',
  'Workflow actions that call external AI models from a sub-account.': 'Acciones de workflow que invocan modelos de IA externos desde la subcuenta.',
  'Let sub-accounts buy domains from inside Sites settings.': 'Permite a las subcuentas comprar dominios desde la configuración de Sitios.'
};

// Mapeamento extensivo de termos em Português para Espanhol Latino (es-419)
export const PT_TO_ES = {
  // Navegação e Topo
  'Launchpad': 'Launchpad',
  'Painel de controle': 'Panel de control',
  'Painel da agência': 'Panel de la agencia',
  'Painel': 'Panel',
  'Conversas': 'Conversaciones',
  'Calendários': 'Calendarios',
  'Contatos': 'Contactos',
  'Oportunidades': 'Oportunidades',
  'Pagamentos': 'Pagos',
  'Agentes de IA': 'Agentes de IA',
  'Marketing': 'Marketing',
  'Automações': 'Automatizaciones',
  'Sites': 'Sitios web',
  'Assinaturas': 'Membresías',
  'Mídia Drive': 'Almacenamiento multimedia',
  'Reputação': 'Reputación',
  'Relatórios': 'Informes',
  'Configurações': 'Configuraciones',
  'Pergunte à Soci': 'Pregunta a Soci',
  'Central de IA': 'Central de IA',
  'Configurador SaaS': 'Configurador SaaS',
  'Prospecção': 'Prospección',
  'Subcontas': 'Subcuentas',
  'Setups de conta': 'Setups de cuenta',
  'Portal de afiliados': 'Portal de afiliados',
  'Biblioteca de templates': 'Biblioteca de plantillas',
  'Parceiros': 'Aliados y Socios',
  'Universidade': 'Universidad',
  'Ideias e sugestões': 'Ideas y sugerencias',
  'Aplicativo móvel': 'Aplicación móvil',
  'Principal': 'Principal',
  'Crescimento': 'Crecimiento',
  'Atalhos': 'Accesos directos',
  'Visão geral': 'Resumen general',
  'Aprender e apps': 'Aprendizaje y apps',
  'Comunidade': 'Comunidad',
  'Visão da agência': 'Vista de la agencia',
  'Subconta · trocar': 'Subcuenta · cambiar',
  'Trocar de workspace': 'Cambiar espacio de trabajo',
  'Perfil do workspace': 'Perfil del espacio de trabajo',
  'Configurações da agência': 'Configuraciones de la agencia',
  'Alternar tema': 'Cambiar tema',
  'Alternar entre tema claro e escuro': 'Alternar entre tema claro y oscuro',
  'Notificações': 'Notificaciones',
  'Buscar no workspace': 'Buscar en el espacio de trabajo',
  'Buscar módulos e contatos…': 'Buscar módulos y contactos…',
  'Recolher menu': 'Contraer menú',
  'Expandir menu': 'Expandir menú',
  'Você está em': 'Estás en',
  'Ferramentas': 'Herramientas',
  'Módulos': 'Módulos',
  'Navegação': 'Navegación',
  'Navegação da agência': 'Navegación de la agencia',
  'Agindo como': 'Actuando como',
  'Parar': 'Detener',
  'Verificar acesso': 'Verificar acceso',
  'Voltar ao guia': 'Volver a la guía',
  'Continue a configuração. Seu progresso será reconhecido ao voltar.': 'Continúa la configuración. Tu progreso se reconocerá al volver.',
  'Fechar lembrete do guia': 'Cerrar recordatorio de la guía',

  // Ações universais e botões
  'Salvar': 'Guardar',
  'Salvar alterações': 'Guardar cambios',
  'Cancelar': 'Cancelar',
  'Fechar': 'Cerrar',
  'Excluir': 'Eliminar',
  'Editar': 'Editar',
  'Criar': 'Crear',
  'Novo': 'Nuevo',
  'Nova': 'Nueva',
  'Buscar': 'Buscar',
  'Filtrar': 'Filtrar',
  'Voltar': 'Volver',
  'Avançar': 'Avanzar',
  'Próximo': 'Siguiente',
  'Anterior': 'Anterior',
  'Continuar': 'Continuar',
  'Confirmar': 'Confirmar',
  'Enviar': 'Enviar',
  'Publicar': 'Publicar',
  'Despublicar': 'Despublicar',
  'Visualizar': 'Vista previa',
  'Abrir': 'Abrir',
  'Copiar': 'Copiar',
  'Copiar link': 'Copiar enlace',
  'Link copiado!': '¡Enlace copiado!',
  'Adicionar': 'Agregar',
  'Remover': 'Eliminar',
  'Exportar': 'Exportar',
  'Importar': 'Importar',
  'Limpar': 'Limpiar',
  'Aplicar': 'Aplicar',
  'Carregando…': 'Cargando…',
  'Concluído': 'Completado',
  'Pendente': 'Pendiente',
  'Em andamento': 'En progreso',
  'Rascunho': 'Borrador',
  'Publicado': 'Publicado',
  'Ativo': 'Activo',
  'Ativa': 'Activa',
  'Inativo': 'Inactivo',
  'Pausado': 'Pausado',
  'Pausada': 'Pausada',
  'Encerrado': 'Cerrado',
  'Encerrada': 'Cerrada',
  'Alterações salvas.': 'Cambios guardados.',
  'Alterações não salvas': 'Cambios sin guardar',

  // Cursos e Membros (Memberships)
  'Criar curso': 'Crear curso',
  'Editar curso': 'Editar curso',
  'Meus cursos': 'Mis cursos',
  'Buscar cursos': 'Buscar cursos',
  'Ordenar por': 'Ordenar por',
  'Situação': 'Estado',
  'Mais recentes': 'Más recientes',
  'Mais antigos': 'Más antiguos',
  'Nome: A a Z': 'Nombre: A a Z',
  'Nome: Z a A': 'Nombre: Z a A',
  'Publicados': 'Publicados',
  'Rascunhos': 'Borradores',
  'curso': 'curso',
  'cursos': 'cursos',
  'módulo': 'módulo',
  'módulos': 'módulos',
  'aula': 'lección',
  'aulas': 'lecciones',
  'Nova aula': 'Nueva lección',
  'Adicionar aula': 'Agregar lección',
  'Adicionar módulo': 'Agregar módulo',
  'Aula pública': 'Lección pública',
  'Crie seu primeiro curso': 'Crea tu primer curso',
  'Nenhum curso encontrado': 'Ningún curso encontrado',
  'Tente outra busca ou outro filtro.': 'Prueba otra búsqueda u otro filtro.',
  'Organize o conteúdo em módulos e aulas com vídeo, texto ou arquivos da Mídia Drive.': 'Organiza el contenido en módulos y lecciones con video, texto o archivos multimedia.',
  'Nome do curso': 'Nombre del curso',
  'Descrição (opcional)': 'Descripción (opcional)',
  'Criar e editar': 'Crear y editar',
  'Curso salvo.': 'Curso guardado.',
  'Curso publicado.': 'Curso publicado.',
  'Curso voltou para rascunho.': 'El curso volvió a borrador.',
  'Um curso precisa de pelo menos um módulo.': 'Un curso necesita al menos un módulo.',
  'Excluir curso': 'Eliminar curso',
  'Excluir módulo': 'Eliminar módulo',
  'Excluir aula': 'Eliminar lección',
  'Título do módulo': 'Título del módulo',
  'Título da aula': 'Título de la lección',
  'Tipo de conteúdo': 'Tipo de contenido',
  'Vídeo': 'Video',
  'Texto': 'Texto',
  'Arquivo': 'Archivo',
  'Liberação (dias após inscrição)': 'Liberación (días tras inscripción)',
  'Imediato (dia 0)': 'Inmediato (día 0)',
  'Link do vídeo (YouTube, Vimeo ou Loom)': 'Enlace del video (YouTube, Vimeo o Loom)',
  'Conteúdo da aula': 'Contenido de la lección',
  'Selecionar arquivo': 'Seleccionar archivo',
  'Portal do cliente': 'Portal del cliente',
  'Configurações do portal': 'Configuraciones del portal',
  'Alunos': 'Alumnos',
  'Progresso': 'Progreso',
  'Começar': 'Comenzar',
  'Continuar': 'Continuar',
  'Rever curso': 'Repasar curso',
  'Concluir aula': 'Completar lección',
  'Aula concluída': 'Lección completada',
  'Material da aula': 'Material de la lección',
  'Baixar': 'Descargar',

  // Sites, Formulários, Funis, Chat, Blogs
  'Funis': 'Embudos',
  'Novo funil': 'Nuevo embudo',
  'Novo site': 'Nuevo sitio',
  'Novo formulário': 'Nuevo formulario',
  'Nova pesquisa': 'Nueva encuesta',
  'Novo questionário': 'Nuevo cuestionario',
  'Formulários': 'Formularios',
  'Pesquisas': 'Encuestas',
  'Questionários': 'Cuestionarios',
  'Lojas': 'Tiendas',
  'Loja': 'Tienda',
  'Blogs': 'Blogs',
  'Blog': 'Blog',
  'QR Codes': 'Códigos QR',
  'Análises': 'Analíticas',
  'Páginas': 'Páginas',
  'Campos': 'Campos',
  'Envios': 'Envíos',
  'Submissões': 'Envíos',
  'Novo chat': 'Nuevo chat',
  'Chat ao vivo': 'Chat en vivo',
  'Criar formulário': 'Crear formulario',
  'Criar pesquisa': 'Crear encuesta',
  'Criar questionário': 'Crear cuestionario',
  'Em branco': 'En blanco',
  'Começar com': 'Comenzar con',
  'Nome completo': 'Nombre completo',
  'E-mail': 'Correo electrónico',
  'Telefone': 'Teléfono',
  'Mensagem': 'Mensaje',
  'Seus dados': 'Tus datos',
  'Primeira pergunta': 'Primera pregunta',
  'Ver meu resultado': 'Ver mi resultado',
  'Configurações do formulário': 'Configuraciones del formulario',
  'Todos os formulários': 'Todos los formularios',
  'Todas as pesquisas': 'Todas las encuestas',
  'Todos os questionários': 'Todos los cuestionarios',
  'Novo artigo': 'Nuevo artículo',
  'Criar artigo': 'Crear artículo',
  'Novo produto': 'Nuevo producto',
  'Criar produto': 'Crear producto',
  'Novo webinar': 'Nuevo webinar',
  'Criar webinar': 'Crear webinar',
  'Chat do site': 'Chat del sitio',
  'Fale com a gente': 'Contáctenos',
  'Fale conosco': 'Contáctenos',
  'Preencha os campos e retornamos em breve.': 'Complete los campos y responderemos a la brevedad.',

  // CRM, Oportunidades, Leads, Contatos
  'Novo contato': 'Nuevo contacto',
  'Nova oportunidade': 'Nueva oportunidad',
  'Importar contatos': 'Importar contactos',
  'Todos os contatos': 'Todos los contactos',
  'Todos os status': 'Todos los estados',
  'Todos os pipelines': 'Todos los pipelines',
  'Qualquer responsável': 'Cualquier responsable',
  'Pipeline de vendas': 'Pipeline de ventas',
  'Etapas': 'Etapas',
  'Novo lead': 'Nuevo lead',
  'Qualificado': 'Calificado',
  'Proposta': 'Propuesta',
  'Ganha': 'Ganada',
  'Perdida': 'Perdida',
  'Abandonada': 'Abandonada',
  'Em aberto': 'Abierta',
  'Valor da oportunidade': 'Valor de la oportunidad',
  'Status da oportunidade': 'Estado de la oportunidad',
  'Previsão de vendas': 'Pronóstico de ventas',
  'Campos personalizados': 'Campos personalizados',
  'Tags': 'Etiquetas',
  'Adicionar tag': 'Agregar etiqueta',
  'Empresas': 'Empresas',
  'Nova empresa': 'Nueva empresa',
  'Importar dados': 'Importar datos',
  'Logs de auditoria': 'Registros de auditoría',
  'Workspaces': 'Espacios de trabajo',
  'Seus workspaces': 'Tus espacios de trabajo',
  'Perfil da empresa': 'Perfil de la empresa',
  'Nome do workspace': 'Nombre del espacio de trabajo',
  'E-mail da empresa': 'Correo de la empresa',
  'Fuso horário': 'Zona horaria',
  'Moeda': 'Moneda',
  'Idioma da plataforma': 'Idioma de la plataforma',

  // Automações e Workflows
  'Novo fluxo': 'Nuevo flujo',
  'Criar fluxo': 'Crear flujo',
  'Gatilhos': 'Disparadores',
  'Adicionar gatilho': 'Agregar disparador',
  'Ações': 'Acciones',
  'Adicionar ação': 'Agregar acción',
  'Histórico de execuções': 'Historial de ejecuciones',
  'Publicar fluxo': 'Publicar flujo',
  'Fluxo publicado': 'Flujo publicado',
  'Fluxo salvo': 'Flujo guardado',
  'Execuções': 'Ejecuciones',

  // Agentes de IA
  'Novo agente': 'Nuevo agente',
  'Criar agente': 'Crear agente',
  'Estúdio de agentes': 'Estudio de agentes',
  'Instruções': 'Instrucciones',
  'Fontes de conhecimento': 'Fuentes de conocimiento',
  'Testar agente': 'Probar agente',
  'Histórico de testes': 'Historial de pruebas',
  'Atendimento ao cliente': 'Atención al cliente',
  'Qualificação de leads': 'Calificación de leads',
  'Pedido de avaliação': 'Solicitud de reseña',

  // Pagamentos, Faturas, Lojas
  'Faturas': 'Facturas',
  'Cobrar': 'Cobrar',
  'Nova fatura': 'Nueva factura',
  'Produtos': 'Productos',
  'Transações': 'Transacciones',
  'Cupons': 'Cupones',
  'Novo cupom': 'Nuevo cupón',
  'Pedidos': 'Pedidos',
  'Novo pedido': 'Nuevo pedido',
  'Carrinho': 'Carrito',
  'Finalizar compra': 'Finalizar compra',

  // Configurações e Equipe
  'Membros da equipe': 'Miembros del equipo',
  'Adicionar membro': 'Agregar miembro',
  'Permissões': 'Permisos',
  'Domínios': 'Dominios',
  'Integrações': 'Integraciones',
  'Chaves de API': 'Claves de API',
  'Horário de atendimento': 'Horario de atención',

  // Prospecção
  'Buscar prospects': 'Buscar prospectos',
  'Adicionar prospect': 'Agregar prospecto',
  'Auditoria do site': 'Auditoría del sitio',
  'Velocidade': 'Velocidad',
  'Segurança': 'Seguridad',
  'Consentimento': 'Consentimiento',

  // Relatórios
  'Visão geral de vendas': 'Resumen de ventas',
  'Eficiência de vendas': 'Eficiencia de ventas',
  'Contatos criados': 'Contactos creados',
  'Agendamentos marcados': 'Citas agendadas',
  'Faturas pagas': 'Facturas pagadas'
};

export const tr = value => {
  if (typeof value !== 'string') return value;
  const lang = getLanguage();
  if (lang === 'pt') {
    return PT[value] ?? value;
  }
  // Espanhol Latino
  if (ES[value]) return ES[value];
  if (PT_TO_ES[value]) return PT_TO_ES[value];
  const ptVal = PT[value];
  if (ptVal && PT_TO_ES[ptVal]) return PT_TO_ES[ptVal];
  return value;
};

// Regex de substituições dinâmicas para Espanhol Latino
const DYNAMIC_PATTERNS = [
  [/^(\d+)\s+contatos?$/i, '$1 contactos'],
  [/^(\d+)\s+oportunidades?$/i, '$1 oportunidades'],
  [/^(\d+)\s+módulos?$/i, '$1 módulos'],
  [/^(\d+)\s+aulas?$/i, '$1 lecciones'],
  [/^(\d+)\s+cursos?$/i, '$1 cursos'],
  [/^(\d+)\s+formulários?$/i, '$1 formularios'],
  [/^(\d+)\s+pesquisas?$/i, '$1 encuestas'],
  [/^(\d+)\s+questionários?$/i, '$1 cuestionarios'],
  [/^atualizado em\s+(.+)$/i, 'actualizado el $1'],
  [/^criado em\s+(.+)$/i, 'creado el $1'],
  [/^agindo como\s+(.+)$/i, 'actuando como $1'],
  [/^subconta\s+(.+)$/i, 'subcuenta $1']
];

export function translateText(text) {
  if (!text || typeof text !== 'string') return text;
  const trimmed = text.trim();
  if (!trimmed) return text;

  if (PT_TO_ES[trimmed]) {
    return text.replace(trimmed, PT_TO_ES[trimmed]);
  }
  if (ES[trimmed]) {
    return text.replace(trimmed, ES[trimmed]);
  }
  for (const [pattern, replacement] of DYNAMIC_PATTERNS) {
    if (pattern.test(trimmed)) {
      return text.replace(trimmed, trimmed.replace(pattern, replacement));
    }
  }
  return text;
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'SVG', 'NOSCRIPT', 'TEXTAREA']);

export function translateDom(root = document.body) {
  if (!root || typeof document === 'undefined') return;
  if (getLanguage() !== 'es') return;

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (SKIP_TAGS.has(node.tagName) || node.dataset?.noTranslate) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
        if (node.nodeType === Node.TEXT_NODE) {
          if (node.parentElement && (SKIP_TAGS.has(node.parentElement.tagName) || node.parentElement.dataset?.noTranslate)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      }
    }
  );

  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      const val = current.nodeValue;
      if (val && val.trim()) {
        const translated = translateText(val);
        if (translated !== val) {
          if (current.__sociOrig === undefined) current.__sociOrig = val;
          current.nodeValue = translated;
        }
      }
    } else if (current.nodeType === Node.ELEMENT_NODE) {
      const attrs = ['placeholder', 'title', 'aria-label', 'data-tip'];
      for (const attr of attrs) {
        const val = current.getAttribute(attr);
        if (val && val.trim()) {
          const translated = translateText(val);
          if (translated !== val) {
            current.__sociOrigAttrs ??= {};
            if (current.__sociOrigAttrs[attr] === undefined) {
              current.__sociOrigAttrs[attr] = val;
            }
            current.setAttribute(attr, translated);
          }
        }
      }
    }
    current = walker.nextNode();
  }
}

export function restoreDom(root = document.body) {
  if (!root || typeof document === 'undefined') return;

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    null
  );

  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE && current.__sociOrig !== undefined) {
      current.nodeValue = current.__sociOrig;
      delete current.__sociOrig;
    } else if (current.nodeType === Node.ELEMENT_NODE && current.__sociOrigAttrs) {
      for (const [attr, val] of Object.entries(current.__sociOrigAttrs)) {
        current.setAttribute(attr, val);
      }
      delete current.__sociOrigAttrs;
    }
    current = walker.nextNode();
  }
}

let observer = null;
export function initI18n() {
  if (typeof document === 'undefined') return;

  document.documentElement.lang = currentLang === 'es' ? 'es-419' : 'pt-BR';

  if (!observer && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(mutations => {
      if (getLanguage() !== 'es') return;
      for (const m of mutations) {
        if (m.type === 'childList') {
          for (const node of m.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              translateDom(node);
            }
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener('click', e => {
    const btn = e.target instanceof Element && e.target.closest('[data-lang-choice]');
    if (!btn) return;
    const choice = btn.dataset.langChoice;
    if (choice) setLanguage(choice);
  });

  document.addEventListener('change', e => {
    const sel = e.target instanceof Element && e.target.closest('[data-lang-choice-select]');
    if (!sel) return;
    if (sel.value) setLanguage(sel.value);
  });

  if (currentLang === 'es') {
    translateDom(document.body);
  }
}
