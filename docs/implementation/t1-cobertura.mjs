// T.1 — mapa de cobertura do motor de workflows: cada gatilho e ação do editor do GoHighLevel (04c §1.3)
// ligado ao que a Soci tem em ui/workflow-data.js.
//
// status:
//   'coberto'  — `soci` lista os tipos da Soci que fazem o mesmo (test/t1-cobertura.test.mjs confere que existem);
//   'falta'    — ainda não existe; `plano` diz o tipo previsto e em que item do roadmap entra;
//   'conector' — vem pelo catálogo de conectores (T.2: Google Sheets, Slack, Shopify, LinkedIn, TikTok);
//   'fora'     — fora do escopo, com o motivo em `nota`.
// O T.1 termina quando não sobrar nenhum 'falta'.

const c = (ghl, soci, nota = '') => ({ ghl, status: 'coberto', soci: [].concat(soci), nota });
const falta = (ghl, plano, nota = '') => ({ ghl, status: 'falta', plano, nota });
const conector = (ghl, nota = '') => ({ ghl, status: 'conector', nota });
const fora = (ghl, nota) => ({ ghl, status: 'fora', nota });

const objetos = 'A Soci não tem objetos personalizados com registros próprios: Configurações → Objetos cobre campos em Contato, Oportunidade e Empresa, e a Empresa tem as ações company_*.';
const eliza = 'Produto proprietário do GHL (Eliza); o equivalente na Soci é o agente de IA da subconta (ai_agent).';

export const gatilhos = [
  // Contact (12)
  c('Birthday reminder', 'birthday_reminder'), c('Contact changed', 'contact_changed'), c('Contact created', 'contact_created'),
  c('Contact DND', 'contact_dnd'), c('Contact tag', 'contact_tag'), c('Custom date reminder', 'custom_date_reminder'),
  c('Note added', 'note_added'), c('Note changed', 'note_changed'), c('Task added', 'task_added'), c('Task reminder', 'task_reminder'),
  c('Contact engagement score', 'score_changed'), c('Task completed', 'task_completed'),
  // Events (26)
  c('Inbound webhook', 'inbound_webhook'), c('Scheduler', 'scheduler'),
  falta('Call details', 'call_details', 'Telefonia Twilio (2.4).'),
  c('Email events', 'email_event'), c('Customer replied', 'customer_replied'),
  falta('Inbound email', 'email_received', 'E-mail recebido na caixa de entrada da subconta.'),
  falta('Conversation AI trigger', 'conversation_ai_event', 'Bot de IA nas conversas.'),
  c('Custom trigger', 'custom_event'), c('Form submitted', 'form_submitted'), c('Survey submitted', 'survey_submitted'),
  c('Trigger link clicked', 'trigger_link_clicked'),
  falta('Facebook lead form submitted', 'meta_lead_form', 'Formulário de cadastro dos anúncios da Meta (Lead Ads).'),
  conector('TikTok form submitted', 'Formulários de leads do TikTok pelo conector.'),
  falta('Video tracking', 'video_watched', 'Vídeos das aulas e páginas da Soci.'),
  falta('Number validation', 'phone_validated', 'Twilio Lookup (2.4).'),
  c('Messaging error - SMS', 'message_failed'),
  conector('LinkedIn lead form submitted', 'Formulários de leads do LinkedIn pelo conector.'),
  c('Funnel/website pageview', 'site_page_viewed'), c('Quiz submitted', 'quiz_submitted'),
  c('External tracking event', 'external_tracking_event'), c('Prospect generated', 'prospect_received'),
  falta('Click to WhatsApp ads', 'whatsapp_ad_click', 'Mensagem de WhatsApp que chega de um anúncio de clique para o WhatsApp.'),
  c('User replied', 'user_replied'),
  c('AI studio form submitted', 'form_submitted', 'Os sites do Studio da Soci mandam os formulários como Formulário enviado.'),
  c('New review received', 'review_received'), c('Video testimonial received', 'video_testimonial'),
  // Appointments (4)
  c('Appointment status', 'appointment_status'), c('Customer booked appointment', 'appointment_booked'),
  c('Service booking', 'service_booked'), c('Rental booking', 'service_booked', 'Reserva de serviço cobre atendimento, campo e locação.'),
  // Opportunities (5)
  c('Opportunity status changed', 'opportunity_status_changed'), c('Opportunity created', 'opportunity_created'),
  c('Opportunity changed', 'opportunity_changed'), c('Pipeline stage changed', 'pipeline_stage_changed'), c('Stale opportunities', 'stale_opportunity'),
  // Affiliate (4)
  c('Affiliate created', 'affiliate_created'), c('New affiliate sales', 'affiliate_sale'),
  c('Affiliate enrolled in campaign', 'affiliate_campaign_enrolled'), c('Lead created', 'affiliate_lead'),
  // Courses (11)
  c('Category started', 'course_module_started'), c('Category completed', 'course_module_completed'),
  c('Lesson started', 'lesson_started'), c('Lesson completed', 'lesson_completed'),
  c('New signup', 'portal_login', 'O primeiro acesso ao portal conta como cadastro (filtro Primeiro acesso).'),
  c('Offer access granted', 'offer_access_granted'), c('Offer access removed', 'offer_access_revoked'),
  c('Product access granted', 'course_access_granted'), c('Product access removed', 'course_access_revoked'),
  c('Product started', 'course_started'), c('Product completed', 'course_completed'),
  // Payments (12)
  c('Invoice', 'invoice_status'), c('Payment received', 'payment_received'), c('Order form submission', 'order_submitted'),
  c('Order submitted', 'order_submitted'), c('Documents & contracts', 'document_status'), c('Estimates', 'estimate_status'),
  c('Subscription', 'subscription_status'), c('Refund', 'refund'), c('Coupon code redeemed', 'coupon_redeemed'),
  c('Coupon code expired', 'coupon_expired'), c('Coupon code applied', 'coupon_applied'), c('Coupon redemption limit reached', 'coupon_limit_reached'),
  // Ecommerce stores (8)
  fora('Shopify abandoned cart (deprecating soon)', 'Sendo descontinuado no próprio GHL; o Shopify entra pelo conector (T.2).'),
  conector('Shopify order placed', 'Pedido do Shopify pelo conector.'),
  fora('Shopify order fulfilled (deprecating soon)', 'Sendo descontinuado no próprio GHL; o Shopify entra pelo conector (T.2).'),
  c('Order fulfilled', 'order_fulfilled'), c('Product review submitted', 'product_review'), c('Abandoned checkout', 'abandoned_checkout'),
  c('Add products to cart', 'cart_updated'), c('Product viewed', 'product_viewed'),
  // IVR (1)
  falta('Start IVR trigger', 'ivr_call', 'URA na telefonia Twilio (2.4).'),
  // Facebook/Instagram events (2)
  c('Facebook - Comment(s) on a post', 'social_comment_received'), c('Instagram - Comment(s) on a post', 'social_comment_received'),
  // Communities (10)
  c('Private channel access granted', 'community_channel_granted'), c('Private channel access revoked', 'community_channel_revoked'),
  c('Group access granted', 'community_member_joined'), c('Community group member leaderboard level changed', 'community_level_changed'),
  c('Group access revoked', 'community_access_revoked'), c('Group post created', 'community_post_created'),
  c('Requested to join group', 'community_join_requested'), c('Group joining request rejected', 'community_join_rejected'),
  c('Member registered for group event', 'community_event_registered'), c('Group comment created', 'community_comment_created'),
  // Certificates (2)
  c('Certificates issued', 'certificate_issued'), c('Badges issued', 'badge_issued'),
  // Communication (3)
  c('TikTok - comment(s) on a video', 'social_comment_received'), c('Transcript generated', 'transcript_generated'), c('Conversations SLA', 'conversation_sla'),
  // Social planner (1)
  c('Social planner posts', 'social_post_published'),
  // Client portal (3)
  c('User login (client portal / memberships)', 'portal_login'),
  falta('Client portal file uploaded', 'portal_file_uploaded', 'Envio de arquivo pelo cliente no portal.'),
  c('User signup (client portal / memberships)', 'portal_login', 'O primeiro acesso conta como cadastro.'),
  // Associations (1)
  falta('Association created (beta)', 'association_created', 'Contato ligado a uma empresa ou a uma oportunidade.'),
  // Events management (2)
  c('Event registration', 'community_event_registered'), c('Event checked in', 'community_event_checked_in'),
  // Google ads (1)
  falta('Google lead form submitted', 'google_lead_form', 'Formulário de lead do Google Ads (webhook com chave).'),
  // Google sheets (3) e Slack (5)
  conector('New spreadsheet row (polling 5 mins) (beta)'), conector('New spreadsheet (polling 5 mins) (beta)'), conector('New worksheet (polling 5 mins) (beta)'),
  conector('New mention (instant)'), conector('User invited to channel (instant)'), conector('New direct message (instant)'),
  conector('New message posted to channel (instant)'), conector('New reaction added (instant)')
];

export const acoes = [
  // Contact (18)
  c('Create contact', 'create_contact'), c('Find contact', 'find_contact'), c('Update contact field', 'update_field'),
  c('Add contact tag', 'add_tag'), c('Remove contact tag', 'remove_tag'), c('Assign to user', 'assign_user'),
  c('Remove assigned user', 'remove_user'), c('Enable/disable DND', 'set_dnd'), c('Add to notes', 'add_note'),
  c('Copy contact', 'copy_contact'), c('Delete contact', 'delete_contact'), c('Remove contact followers', 'conversation_followers'),
  c('Edit conversation', 'edit_conversation'), c('Add task', 'create_task'), c('Modify contact engagement score', 'adjust_score'),
  c('Add contact followers', 'conversation_followers'), c('Merge contact', 'merge_contact'), c('Email verification', 'email_verify'),
  // Custom objects (3)
  fora('Create Associated Record for Contact', objetos), fora('Update Associated Record for Contact', objetos), fora('Clear fields of Associated Record for Contact', objetos),
  // Communication (32)
  c('Send email', 'send_email'), c('Send SMS', 'send_sms'),
  falta('Call', 'call', 'Telefonia Twilio (2.4).'), falta('Voicemail', 'voicemail_drop', 'Telefonia Twilio (2.4).'),
  c('Messenger', 'send_messenger'),
  c('Instagram DM', 'send_instagram_dm'), c('Manual action to SMS', 'manual_sms'), c('Manual action to call', 'manual_call'),
  fora('GMB messaging', 'O Google encerrou o Business Messages (mensagens do Perfil da Empresa) em julho de 2024.'),
  c('Send internal notification', 'internal_notification'), c('Send review request', 'review_request'),
  falta('Conversation AI', 'conversation_ai', 'Bot de IA nas conversas.'),
  c('Facebook interactive messenger', 'send_messenger', 'Respostas rápidas (botões) no Messenger.'),
  c('Instagram interactive messenger', 'send_instagram_dm', 'Respostas rápidas (botões) no Direct.'),
  c('Reply in comments', 'reply_social_comment'),
  falta('Appointment booking conversation AI bot', 'conversation_ai', 'Bot de IA nas conversas, com agendamento.'),
  c('Send live chat message', 'send_live_chat'),
  falta('Log external call', 'log_call', 'Registra uma ligação feita fora da Soci no histórico do contato.'),
  c('WhatsApp', 'send_whatsapp'), c('Whatsapp: customer service window check', 'whatsapp_window'), c('Book appointment', 'book_appointment'),
  falta('Update conversation AI bot and status', 'conversation_ai_status', 'Bot de IA nas conversas.'),
  fora('Whatsapp: send flows', 'WhatsApp Flows existe só na API oficial da Meta (Cloud API); a Soci usa a Evolution API.'),
  c('WhatsApp media', 'whatsapp_media'),
  falta('WhatsApp interactive messages', 'whatsapp_interactive', 'Enquete (opções clicáveis) pela Evolution API.'),
  fora('TikTok interactive messenger', 'O TikTok não abre a API de mensagens diretas para contas comerciais em geral.'),
  falta('Send opt-in message (beta)', 'send_optin', 'Pede o consentimento do contato e grava nas preferências de comunicação.'),
  c('Add internal comments', 'add_note', 'Nota interna na conversa.'),
  fora('Send RCS', 'RCS Business Messaging exige marca aprovada pelo Google e um provedor RCS; nenhum dos canais da Soci oferece.'),
  fora('RCS interactive message', 'RCS Business Messaging exige marca aprovada pelo Google e um provedor RCS; nenhum dos canais da Soci oferece.'),
  falta('Live chat interactive messenger (beta)', 'send_live_chat', 'Botões de resposta no chat do site.'),
  c('Show WhatsApp typing indicator', 'whatsapp_typing'),
  // Slack (6)
  conector('Send Message'), conector('Invite user to channel (beta)'), conector('Find channel by name (beta)'),
  conector('Find user by email (beta)'), conector('Update message (beta)'), conector('Create channel (beta)'),
  // Send data (2)
  c('Webhook', 'webhook'), c('Custom webhook', 'custom_webhook'),
  // Google Sheets (11)
  conector('Create spreadsheet row'), conector('Create multiple spreadsheet row(s)'), conector('Lookup spreadsheet row'),
  conector('Lookup multiple spreadsheet row(s)'), conector('Update specific spreadsheet row'), conector('Update multiple spreadsheet row(s)'),
  conector('Update spreadsheet row using lookup'), conector('Clear specific spreadsheet row'), conector('Clear spreadsheet row using lookup'),
  conector('Format spreadsheet row(s)'), conector('Remove spreadsheet row(s)'),
  // Internal (18)
  c('If / else', 'if_else'), c('Router', 'router'), c('Loop (beta)', 'loop'), c('Wait', 'wait'), c('Goal event', 'goal'), c('Split', 'split'),
  c('Update custom value', 'update_custom_value'), c('Go to', 'goto'), c('Date/time formatter', 'date_format'), c('Number formatter', 'number_format'),
  c('Math operation', 'math'),
  falta('Set event start date', 'set_event_date', 'Define a data de referência que a espera “até a data do evento” usa.'),
  c('Add to workflow', 'add_to_workflow'), c('Remove from workflow', 'remove_from_workflow'), c('Array formatter', 'list_format'), c('Drip', 'drip'),
  c('Text formatter', 'text_format'),
  falta('Custom code', 'custom_code', 'Código JavaScript em área isolada, sem rede nem disco.'),
  // Workflow AI (7)
  c('AI Agent', 'ai_agent'), c('External AI models', 'ai_prompt'), c('GPT powered by OpenAI', 'ai_prompt'),
  falta('AI image generation', 'ai_image_generate', 'Imagem gerada pela OpenAI, guardada em Arquivos.'),
  fora('Eliza', eliza), fora('Eliza AI appointment booking', eliza), fora('Send to Eliza agent platform', eliza),
  // Appointments (3)
  c('Update appointment status', 'appointment_status_update'), c('Generate one time booking link', 'booking_link'), c('Create appointment / booking note', 'appointment_note'),
  // Opportunity (14)
  c('Create/update opportunity', 'create_opportunity'), c('Remove opportunity', 'remove_opportunity'), c('Remove owner from opportunity', 'opportunity_owner'),
  c('Find opportunity', 'find_opportunity'), c('Create opportunity', 'create_opportunity'),
  c('Update opportunity', ['create_opportunity', 'opportunity_status'], 'Criar ou atualizar muda etapa e valor; Mudar status fecha como ganha ou perdida.'),
  c('Remove follower(s) from opportunity', 'opportunity_followers'), c('Add follower(s) to opportunity', 'opportunity_followers'), c('Add owner to opportunity', 'opportunity_owner'),
  fora('Associate record(s) to opportunity (beta)', objetos), fora('Remove associated record(s) of an opportunity from workflow (beta)', objetos),
  fora('Create associated records of an opportunity (beta)', objetos), fora('Update associated records of an opportunity (beta)', objetos),
  fora('Add associated record(s) of an opportunity to workflow (beta)', objetos),
  // Payments (6)
  falta('Stripe one time charge', 'charge', 'Cobrança avulsa pela AbacatePay (Pix ou cartão), com link enviado ao contato.'),
  c('Send estimate', 'send_estimate'), c('Send documents & contracts', 'send_document'), c('Send invoice', 'send_invoice'),
  c('Send recurring invoice', 'start_recurring_invoice'), c('Update inventory', 'update_inventory'),
  // Marketing (6)
  c('Add to Google Analytics', 'ga4_event'), c('Add to Google Ads', 'google_ads_conversion'), c('Facebook - Add to custom audience', 'meta_audience'),
  c('Facebook - Remove from custom audience', 'meta_audience'), c('Meta conversion API', 'meta_conversion'), c('Generate marketing audit report', 'marketing_audit'),
  // Affiliate (6)
  c('Add to affiliate manager', 'make_affiliate'), c('Update affiliate', 'update_affiliate'), c('Add to affiliate campaign', 'add_affiliate_campaign'),
  c('Remove from affiliate campaign', 'remove_affiliate_campaign'), c('Add leads under an affiliate', 'assign_affiliate_lead'), c('Add manual sales for an affiliate', 'affiliate_manual_sale'),
  // Membership (4)
  c('Course grant offer', 'grant_offer'), c('Course revoke offer', 'revoke_offer'), c('Revoke course access', 'revoke_course_access'), c('Grant course access', 'grant_course_access'),
  // IVR (5)
  falta('Gather input on call', 'ivr_gather', 'URA Twilio (2.4).'), falta('SAY OR PLAY MESSAGE', 'ivr_say', 'URA Twilio (2.4).'),
  falta('Connect to call', 'ivr_connect', 'URA Twilio (2.4).'), falta('End call', 'ivr_hangup', 'URA Twilio (2.4).'), falta('Record voicemail', 'ivr_record', 'URA Twilio (2.4).'),
  // Certificates (2)
  c('Issue certificate', 'issue_certificate'), c('Issue badge', 'issue_badge'),
  // Agent Studio (2)
  c('Invoke flow agents', 'ai_agent'), c('Invoke managed agents', 'ai_agent'),
  // AI Actions (11)
  c('AI decision maker', 'ai_decision'), c('AI summarize', 'ai_summarize'), c('AI intent detection', 'ai_intent'), c('AI translate', 'ai_translate'),
  c('AI extract data (beta)', 'ai_extract'), c('AI email parser (beta)', 'ai_extract', 'O e-mail entra como texto de onde extrair.'),
  c('AI analyze image', 'ai_image'), c('Claude action', 'ai_prompt'),
  falta('AI video generation', 'ai_video_generate', 'Vídeo gerado pela OpenAI (Sora), guardado em Arquivos.'),
  fora('AI analyze video', 'A conexão de IA da Soci é a OpenAI, cuja API não recebe vídeo como entrada.'),
  c('Gemini action', 'ai_prompt'),
  // Associations (3)
  fora('Add associated records to workflow', objetos), fora('Remove associated records from workflow', objetos), fora('Associate records with Contact (beta)', objetos),
  // Communities (6)
  c('Grant private channel access', 'grant_channel_access'), c('Revoke private channel access', 'revoke_channel_access'),
  c('Revoke group access', 'revoke_community_access'),
  falta('Smart push notification', 'push_notification', 'Notificação no app mobile white-label (6.6).'),
  c('Grant community group leaderboard points', 'community_points'), c('Grant group access', 'grant_community_access'),
  // Company (3)
  c('Clear associated company fields', 'company_clear'), c('Create and associate company', 'company_create'), c('Update associated company', 'company_update'),
  // Conversation AI (9)
  ...['Continue conversation', 'AI message', 'Transfer bot', 'AI splitter', 'Custom message', 'AI capture information', 'End conversation', 'Book appointment', 'Services booking']
    .map(name => falta(name, 'conversation_ai', 'Etapa do bot de IA nas conversas.')),
  // Events Management (2)
  falta('Register for ticketed event (beta)', 'register_event', 'Inscrição em evento pago sem cobrar (cortesia).'),
  c('Register for rsvp event (beta)', 'register_event'),
  // Voice AI (1)
  falta('Voice AI outbound call (beta)', 'voice_ai_call', 'Voice AI com Twilio (3.2).')
];
