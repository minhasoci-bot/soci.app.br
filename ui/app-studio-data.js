// App Studio and the app marketplace (7.3), shared by the server and the screens.
// An agency builds apps that receive sub-account events, add workflow actions and triggers, read or create
// contacts through the API and add a link to the sub-account; sub-accounts install them from the marketplace.

// Workflow events an app can subscribe to (same names as the workflow triggers).
export const appEvents = [
  'contact_created', 'contact_tag', 'opportunity_created', 'pipeline_stage_changed', 'opportunity_status_changed',
  'appointment_booked', 'form_submitted', 'customer_replied', 'invoice_status', 'payment_received'
];

// What an installed app may do with its token on /api/v1 (one sub-account only).
export const appApiScopes = [
  ['contacts.read', 'Ler os contatos da subconta'],
  ['contacts.write', 'Criar contatos na subconta']
];

export const appCategories = ['CRM', 'Comunicação', 'Vendas', 'Pagamentos', 'Marketing', 'Agendamentos', 'Relatórios', 'Produtividade', 'Outros'];

export const appLimits = { apps: 50, name: 60, tagline: 140, description: 2000, actions: 10, triggers: 10, itemLabel: 60, itemText: 200, log: 50 };

// "Enviar lead para o ERP" → "enviar-lead-para-o-erp"
export const appSlug = text => String(text || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

// The app's link, with the sub-account it opens from.
export const appMenuUrl = (url, workspace) => String(url || '').replaceAll('{{location.id}}', encodeURIComponent(workspace || ''));
