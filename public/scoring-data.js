// Pontuação de leads: the data shared by the server (scoring-model.mjs) and the Settings screen.

/** Trigger types a scoring rule may use: events about one contact (same filters as the workflows). */
export const scoreEvents = ['contact_created', 'contact_tag', 'form_submitted', 'survey_submitted', 'quiz_submitted', 'email_event', 'trigger_link_clicked', 'customer_replied',
  'appointment_booked', 'appointment_status', 'opportunity_created', 'pipeline_stage_changed', 'webinar_registered', 'chat_started', 'review_received', 'ad_lead', 'external_tracking_event',
  'order_paid', 'invoice_status', 'social_comment_received', 'social_dm_received', 'community_event_registered', 'community_member_joined', 'course_quiz_submitted', 'course_assignment_submitted'];

/** Temperature bands shown next to a score. */
export const scoreBands = [[100, 'Quente', 'red'], [50, 'Morno', 'gold'], [1, 'Frio', 'blue']];
export const scoreBand = score => scoreBands.find(([min]) => Number(score) >= min) || null;

/** Ready-made rules offered when the list is empty. */
export const scoreStarters = [
  { name: 'Enviou um formulário', trigger: { type: 'form_submitted', config: {} }, points: 10, once: false },
  { name: 'Abriu um e-mail', trigger: { type: 'email_event', config: { event: 'opened' } }, points: 2, once: false },
  { name: 'Clicou em um e-mail', trigger: { type: 'email_event', config: { event: 'clicked' } }, points: 5, once: false },
  { name: 'Agendou um horário', trigger: { type: 'appointment_booked', config: {} }, points: 20, once: false },
  { name: 'Visitou o site', trigger: { type: 'external_tracking_event', config: { event: 'pageview' } }, points: 1, once: false },
  { name: 'Visitou a página de preços', trigger: { type: 'external_tracking_event', config: { event: 'pageview', url: '/precos' } }, points: 10, once: true }
];
