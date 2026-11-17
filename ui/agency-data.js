// Shared by the server (validation) and the browser (forms and catalogs).
// Every catalog entry below is written for this local project; no record is copied from the original service.

export const agencyRoles = ['Agency Owner', 'Agency Admin', 'Agency User', 'Account Admin', 'Account User'];
export const agencyLevel = role => role.startsWith('Agency');

export const subAccountModules = [
  ['dashboard', 'Painel'], ['conversations', 'Conversas'], ['calendars', 'Calendários'], ['contacts', 'Contatos'],
  ['opportunities', 'Oportunidades'], ['payments', 'Pagamentos'], ['studio', 'AI Studio'], ['ai-agents', 'Agentes de IA'],
  ['marketing', 'Marketing'], ['automation', 'Automação'], ['sites', 'Sites e Funis'], ['memberships', 'Área de Membros'],
  ['media', 'Arquivos e Mídia'], ['reputation', 'Reputação'], ['reporting', 'Relatórios'],
  ['settings', 'Configurações']
];

// Record key of a sub-account mutation → module that must be permitted for the acting user.
export const moduleOfRecord = {
  contacts: 'contacts', tasks: 'contacts', opportunities: 'opportunities', appointments: 'calendars', workflows: 'automation',
  workflowFolders: 'automation', workflowLists: 'automation',
  invoices: 'payments', campaigns: 'marketing', pages: 'sites', forms: 'sites', courses: 'memberships', reviews: 'reputation',
  agents: 'ai-agents', agentRuns: 'ai-agents', files: 'media', snippetFolders: 'conversations', snippets: 'conversations', triggerLinks: 'conversations',
  studioProjects: 'studio', pipelines: 'opportunities', stages: 'opportunities',
  customFields: 'settings', customValues: 'settings', tags: 'contacts', companies: 'contacts',
  products: 'payments', paymentLinks: 'payments', subscriptions: 'payments', transactions: 'payments', coupons: 'payments',
  socialCategories: 'marketing', socialHashtags: 'marketing', socialFeeds: 'marketing'
};

export const accountStatuses = ['Active', 'Paused', 'Closed'];
export const prospectStatuses = ['New', 'Contacted', 'Proposal sent', 'Won', 'Lost'];
export const auditAreas = [['website', 'Site'], ['reviews', 'Avaliações'], ['listings', 'Listagens'], ['social', 'Redes sociais'], ['ads', 'Anúncios pagos']];

// [key, label, type, required, options]
// Option tokens: '@accounts' (sub-accounts), '@modules' (sub-account modules).
export const collections = {
  prospects: { label: 'Prospect', max: 500, fields: [
    ['name', 'Nome da empresa', 'text', true], ['website', 'Site', 'url'], ['category', 'Categoria', 'text'], ['city', 'Cidade', 'text'],
    ['email', 'E-mail', 'email'], ['phone', 'Telefone', 'tel'], ['status', 'Status', 'select', true, prospectStatuses],
    ...auditAreas.map(([key, label]) => [`score_${key}`, `Pontuação em ${label} (0–10)`, 'score']),
    ['notes', 'Observações', 'textarea']
  ] },
  partners: { label: 'Parceiro', max: 200, fields: [
    ['name', 'Nome do parceiro', 'text', true], ['service', 'Serviço', 'select', true, ['Design', 'Development', 'Paid ads', 'Copywriting', 'Consulting', 'Other']],
    ['contact', 'Pessoa de contato', 'text'], ['email', 'E-mail', 'email'], ['website', 'Site', 'url'], ['notes', 'Observações', 'textarea']
  ] },
  ideas: { label: 'Ideia', max: 300, fields: [
    ['title', 'Título', 'text', true], ['category', 'Área', 'select', true, ['CRM', 'Conversations', 'Automation', 'Sites', 'Payments', 'Reporting', 'Mobile', 'Other']],
    ['body', 'Descrição', 'textarea', true]
  ] },
  menuLinks: { label: 'Link de menu personalizado', max: 30, fields: [
    ['title', 'Título do link', 'text', true], ['url', 'URL', 'url', true], ['icon', 'Ícone', 'select', true, ['external', 'grid', 'chart', 'folder', 'help', 'star']],
    ['openIn', 'Abrir em', 'select', true, ['New tab', 'Inside the app']], ['showOn', 'Exibir em', 'select', true, ['Sub-accounts', 'Agency', 'Both']],
    ['accounts', 'Subcontas (nenhuma selecionada = todas)', 'multi', false, '@accounts']
  ] },
  announcements: { label: 'Comunicado', max: 100, fields: [
    ['title', 'Título', 'text', true], ['body', 'Mensagem', 'textarea', true], ['tone', 'Estilo', 'select', true, ['Information', 'Success', 'Warning']],
    ['accounts', 'Subcontas (nenhuma selecionada = todas)', 'multi', false, '@accounts'], ['published', 'Publicado', 'check']
  ] },
  users: { label: 'Usuário', max: 100, fields: [
    ['first', 'Nome', 'text', true], ['last', 'Sobrenome', 'text', true], ['email', 'E-mail', 'email', true], ['phone', 'Telefone', 'tel'],
    ['role', 'Função', 'select', true, agencyRoles], ['accounts', 'Acesso a subcontas (funções de conta)', 'multi', false, '@accounts'],
    ['permissions', 'Permissões de módulos', 'multi', false, '@modules']
  ] },
  plans: { label: 'Plano SaaS', max: 20, fields: [
    ['name', 'Nome do plano', 'text', true], ['price', 'Preço mensal (R$)', 'number', true], ['trialDays', 'Dias de teste', 'number'],
    ['features', 'Recursos inclusos (um por linha)', 'textarea']
  ] },
  templates: { label: 'Template', max: 200, fields: [
    ['name', 'Nome do template', 'text', true], ['category', 'Categoria', 'select', true, ['Automotive', 'Beauty', 'Coaching', 'Creative', 'Financial', 'Health', 'Home services', 'Legal', 'Real estate', 'Technology']],
    ['headline', 'Título de impacto', 'text', true], ['body', 'Conteúdo', 'textarea'], ['button', 'Texto do botão', 'text'], ['withForm', 'Incluir formulário de captura', 'check']
  ] },
  referrals: { label: 'Indicação', max: 500, fields: [
    ['name', 'Empresa indicada', 'text', true], ['email', 'E-mail', 'email'], ['plan', 'Plano', 'select', true, ['Starter', 'Unlimited', 'Pro']],
    ['amount', 'Assinatura mensal (R$)', 'number', true], ['status', 'Status', 'select', true, ['Trial', 'Active', 'Cancelled']]
  ] }
};

export const affiliateRate = 0.4;

// Reselling products. `base` is the agency cost per month (0 when the cost depends on usage).
export const resellProducts = [
  { key: 'ad-manager', name: 'Ad Manager', base: 0, kind: 'Subscription', text: 'Manage paid ad campaigns from inside a sub-account.' },
  { key: 'ai-employee', name: 'AI Employee', base: 97, kind: 'Subscription + usage', text: 'Unlimited AI features for the subscribed sub-account.' },
  { key: 'client-portal-app', name: 'Branded Client Portal App', base: 0, kind: 'Subscription', text: 'Client portal app published under your brand.' },
  { key: 'dedicated-ip', name: 'Dedicated IP', base: 0, kind: 'Subscription', text: 'Dedicated sending IP for email reputation.' },
  { key: 'listings', name: 'Listings', base: 30, kind: 'Subscription', text: 'Business listing distribution to directories.' },
  { key: 'prospecting', name: 'Prospecting', base: 0, kind: 'Subscription', text: 'Prospect audit reports inside the sub-account.' },
  { key: 'seo', name: 'SEO', base: 0, kind: 'Subscription', text: 'Search ranking reports and site audits.' },
  { key: 'whatsapp', name: 'WhatsApp', base: 0, kind: 'Subscription + usage', text: 'WhatsApp messaging in Conversations.' },
  { key: 'wordpress', name: 'WordPress', base: 0, kind: 'Subscription', text: 'Managed WordPress hosting.' },
  { key: 'workflow-pro', name: 'Workflow Pro', base: 0, kind: 'Subscription + usage', text: 'Premium workflow actions and triggers.' }
];

export const addOns = [
  { key: 'zapier', group: 'Custom branding', name: 'White-label automation connector', price: 50, period: '/mo', points: ['Your brand on the connector listing', 'Branded automations for clients'] },
  { key: 'mobile', group: 'Custom branding', name: 'White-label mobile app', price: 497, period: '/mo', points: ['Custom login screen and layout', 'Color palette and module order', 'Custom modules from your URLs'] },
  { key: 'hipaa', group: 'Compliance', name: 'Health data compliance', price: 297, period: '/mo', points: ['Business associate agreement', 'Stricter data controls for health clients'] },
  { key: 'premium-support', group: 'Setup & support', name: 'Premium support', price: 500, period: '/mo', points: ['Dedicated account manager', 'Private support channel', 'Quarterly business reviews'] },
  { key: 'advanced-setup', group: 'Setup & support', name: 'Advanced account setup', price: 1000, period: ' one-time', points: ['Five consulting sessions', 'Done-with-you CRM and dashboard setup', 'Team onboarding'] }
];

export const agencyPlans = [['Starter', 97], ['Unlimited', 297], ['Agency Pro', 497]];

export const integrationCatalog = [
  ['stripe', 'Stripe', 'pay', 'Payments', 'Collect invoices and SaaS subscriptions.'],
  ['google', 'Google Workspace', 'cal', 'Calendars', 'Calendar sync and Business Profile reviews.'],
  ['meta', 'Meta', 'send', 'Social', 'Facebook and Instagram messages, leads and posts.'],
  ['twilio', 'Twilio', 'chat', 'Phone', 'SMS and voice through your own carrier account.'],
  ['mailgun', 'Mailgun', 'mail', 'Email', 'Transactional and campaign email delivery.'],
  ['quickbooks', 'QuickBooks', 'chart', 'Accounting', 'Sync invoices and payments to accounting.'],
  ['slack', 'Slack', 'chat', 'Team', 'Send workflow notifications to channels.'],
  ['zoom', 'Zoom', 'cal', 'Calendars', 'Video meeting links for appointments.'],
  ['shopify', 'Shopify', 'pay', 'Commerce', 'Import orders and customers.'],
  ['wordpress', 'WordPress', 'site', 'Sites', 'Embed forms and calendars on WordPress.']
];

// Template library catalog: [id, name, category, headline, body, button]
export const templateCatalog = [
  ['tpl-auto-repair', 'Auto Repair Shop', 'Automotive', 'Honest repairs, done on time', 'Book a diagnostic and get a written quote before any work starts.', 'Book a diagnostic'],
  ['tpl-car-detail', 'Car Detailing', 'Automotive', 'Showroom shine at your door', 'Mobile detailing packages for daily drivers and fleets.', 'See packages'],
  ['tpl-salon', 'Hair Salon', 'Beauty', 'Cuts and color that fit your week', 'Choose a stylist and a time that works for you.', 'Reserve a chair'],
  ['tpl-spa', 'Day Spa', 'Beauty', 'An afternoon that resets everything', 'Massage, facials and packages for two.', 'Plan a visit'],
  ['tpl-coach', 'Business Coach', 'Coaching', 'Grow without working more hours', 'A twelve-week program for owners who want clear numbers and a calmer calendar.', 'Apply now'],
  ['tpl-life-coach', 'Life Coach', 'Coaching', 'Decide what comes next', 'One-on-one sessions to set goals and keep them.', 'Book a free call'],
  ['tpl-photo', 'Photography Studio', 'Creative', 'Portraits people actually keep', 'Studio and on-location sessions with fast delivery.', 'Check availability'],
  ['tpl-design', 'Design Studio', 'Creative', 'Brands that look as good as they work', 'Identity, packaging and web design for growing companies.', 'Start a project'],
  ['tpl-mortgage', 'Mortgage Broker', 'Financial', 'Compare rates in one conversation', 'We shop lenders so you can focus on the move.', 'Get a quote'],
  ['tpl-accounting', 'Accounting Firm', 'Financial', 'Books closed every month, on time', 'Bookkeeping, payroll and tax filing for small businesses.', 'Talk to an accountant'],
  ['tpl-dental', 'Dental Clinic', 'Health', 'Gentle care for the whole family', 'Cleanings, whitening and emergency visits.', 'Book an appointment'],
  ['tpl-therapy', 'Wellness Therapy', 'Health', 'A calmer week starts here', 'Licensed therapists for individuals and couples.', 'Find a time'],
  ['tpl-hvac', 'HVAC Repair', 'Home services', 'Heating and cooling fixed today', 'Same-day service across the metro area.', 'Request service'],
  ['tpl-painting', 'Painting Contractor', 'Home services', 'Clean lines, no mess left behind', 'Interior and exterior painting with a written warranty.', 'Get an estimate'],
  ['tpl-law', 'Defense Attorney', 'Legal', 'Clear advice when it matters most', 'Free first consultation for criminal and traffic cases.', 'Request a consultation'],
  ['tpl-realtor', 'Real Estate Agent', 'Real estate', 'Find out what your home is worth', 'A local market report delivered within 24 hours.', 'Get my report'],
  ['tpl-saas', 'Software Product', 'Technology', 'Ship the work, skip the busywork', 'Automate the repetitive parts of your team’s day.', 'Start free trial'],
  ['tpl-agency', 'Digital Marketing Agency', 'Technology', 'More leads from the budget you have', 'Ads, landing pages and follow-up handled by one team.', 'Book a strategy call']
];

// Learning tracks for University and SaaS Education: [trackId, title, [[lessonId, title, summary], …]]
export const learningTracks = {
  university: [
    ['start', 'Getting started', [
      ['u-1', 'Set up your agency profile', 'Fill in company details and branding so every sub-account inherits them.'],
      ['u-2', 'Create your first sub-account', 'Create an account for a client and load a snapshot to start from a working setup.'],
      ['u-3', 'Invite your team', 'Add users with the right role and limit each one to the accounts they serve.']
    ]],
    ['crm', 'CRM and pipelines', [
      ['u-4', 'Import contacts', 'Bring a CSV of contacts into a sub-account and tag them by source.'],
      ['u-5', 'Design a pipeline', 'Map the stages a lead passes through and move deals between them.']
    ]],
    ['automation', 'Automation', [
      ['u-6', 'Your first workflow', 'Use the form submission trigger to create a task and an opportunity.'],
      ['u-7', 'Manual call and SMS steps', 'Queue follow-ups that a person completes from Conversations.']
    ]],
    ['sites', 'Sites and forms', [
      ['u-8', 'Publish a landing page', 'Start from a template, connect a form and publish it locally.'],
      ['u-9', 'Track submissions', 'Read submissions and follow their workflow runs.']
    ]]
  ],
  saas: [
    ['plans', 'Packaging your offer', [
      ['s-1', 'Define SaaS plans', 'Group features into plans with a monthly price and an optional trial.'],
      ['s-2', 'Assign plans to sub-accounts', 'Each account’s plan feeds monthly recurring revenue on the agency dashboard.']
    ]],
    ['rebilling', 'Reselling and rebilling', [
      ['s-3', 'Set reselling prices', 'Choose what clients pay for each product and see your profit per account.'],
      ['s-4', 'Turn products on per account', 'Enable a product only for the accounts that bought it.']
    ]],
    ['retention', 'Onboarding and retention', [
      ['s-5', 'Snapshot-based onboarding', 'Load a standard snapshot so every new client starts with the same assets.'],
      ['s-6', 'Announcements', 'Publish messages that appear inside your clients’ accounts.']
    ]]
  ]
};

export const systemEmailKeys = [
  ['welcome', 'Welcome email', 'Welcome to {{agency.name}}', 'Hi {{user.first_name}}, your account is ready. Sign in at {{agency.domain}}.'],
  ['password', 'Password reset', 'Reset your password', 'Hi {{user.first_name}}, use the link below to choose a new password.'],
  ['invite', 'User invitation', 'You were invited to {{agency.name}}', '{{inviter.name}} invited you to join {{account.name}}.'],
  ['appointment', 'Appointment reminder', 'Reminder: {{appointment.title}}', 'Your appointment starts at {{appointment.start}}.']
];

export const labFeatures = [
  ['workflowAi', 'AI workflow builder', 'Describe a workflow and get a draft in the builder.'],
  ['newInbox', 'Unified inbox preview', 'Group conversations from every channel in one list.'],
  ['bulkSnapshots', 'Bulk snapshot loading', 'Load one snapshot into several sub-accounts at once.'],
  ['darkSidebar', 'Compact sidebar', 'Narrower navigation for small screens.']
];

export const mobileModules = [['dashboard', 'Dashboard'], ['conversations', 'Conversations'], ['contacts', 'Contacts'], ['opportunities', 'Opportunities'], ['calendars', 'Calendars'], ['payments', 'Payments'], ['reputation', 'Reviews']];

export const snapshotAssets = [
  ['pipelines', 'Pipelines'], ['stages', 'Pipeline stages'], ['workflows', 'Workflows'], ['forms', 'Forms'], ['pages', 'Pages'],
  ['snippetFolders', 'Snippet folders'], ['snippets', 'Snippets'], ['triggerLinks', 'Trigger links'], ['courses', 'Courses'],
  ['agents', 'AI agents'], ['studioProjects', 'Studio projects']
];

// SaaS Configurator: wallet products whose usage the agency can rebill with a markup (1× = at cost, up to 10×).
export const rebillProducts = [
  ['phone', 'Phone calls and SMS'], ['email', 'Email sending'], ['automations', 'Premium workflow actions'], ['ai', 'Conversation and content AI'],
  ['whatsapp', 'WhatsApp messages'], ['voice-ai', 'Voice AI minutes'], ['enrichment', 'Contact enrichment'], ['domains', 'Domain purchases']
];
export const maxMarkup = 10;

// Per-sub-account switches shown on Settings tabs: [key, title, description, enabled by default].
export const subFeatures = [
  ['number-intelligence', 'Number Intelligence', 'Look up the line type and carrier of phone numbers before sending SMS.', false],
  ['workflow-premium', 'Workflow - Premium Features', 'Premium triggers and actions in the workflow builder of each sub-account.', true],
  ['external-ai', 'Workflow - External AI Models', 'Workflow actions that call external AI models from a sub-account.', true],
  ['domain-purchase', 'Domain Purchase', 'Let sub-accounts buy domains from inside Sites settings.', true]
];
export const workflowBuilders = ['Standard', 'Advanced'];
export const appScopes = ['Agency', 'Sub-account'];
