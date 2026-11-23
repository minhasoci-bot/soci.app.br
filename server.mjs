import { createServer } from 'node:http';
import { checkEmailAddress } from './email-verify.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { blank, seed, uid, execute, find, emitWorkflow, receiveProspects } from './model.mjs';
import { createSqliteStore, supabaseFromEnv } from './storage.mjs';
import { accountProfile, afterLogin, authFromEnv } from './auth.mjs';
import { discoverDesign, generatePage, generateSite, planSite, revisePage, suggestSeo } from './studio-ai.mjs';
import { localPlan, questionsFor, validDesign, validPlan } from './ui/studio-design.js';
import { designAgent, replyAsAgent } from './agent-ai.mjs';
import { createOpenAI, openAIModel } from './openai.mjs';
import { agentBuildRequest, agentWorkflowRequest, agentPreview, applyAgentDesign, editAgent, recordAgentRun } from './agent-model.mjs';
import { agencyAiUsage, checkAiBudget, editAgentTemplate, editKnowledgeBase, setAiAccess, setAiLimit, usageMeter } from './ai-model.mjs';
import { requireLab, setLabsOffer } from './labs-model.mjs';
import { conversationRequest, writeConversationReply, writeConversationSummary } from './conversation-ai.mjs';
import { addInstall, appSecret, appSignature, installedCopy, removeInstall, tokenHash as appTokenHash } from './app-studio-model.mjs';
import { usageSummary } from './ui/ai-data.js';
import { brandVoiceRequest, emailRequest, reviewReplyRequest, transformRequest, transformText, writeBrandVoice, writeEmail, writeReviewReply } from './content-ai.mjs';
import { brandFromPage, fetchPublicPage } from './brand-model.mjs';
import { brandVoicePrompt, defaultBoard, voiceTraits } from './ui/brand-data.js';
import { contentModule } from './ui/content-ai-data.js';
import { runWorkflowAI } from './workflow-ai.mjs';
import { reviewTokenHash } from './reputation-model.mjs';
import { renderReviewPage, reviewPageCsp } from './reputation-page.mjs';
import { mediaRowId } from './reputation-media.mjs';
import { collectorCsp, renderCollector, renderWidget, widgetCsp, widgetLoader } from './reputation-widget.mjs';

function meteredUsage() {
  const meter = usageMeter();
  return {
    onUsage: meter.onUsage,
    record(state, kind, agent, run, error = '') {
      const charged = meter.charge(state, kind, agent, error);
      return recordAgentRun(state, { ...run, ...charged, error });
    }
  };
}
import { addPage, chatEntry, countVisit, designedPage, deletePage, duplicatePage, findPage, movePage, resetStats, setSeo, setSlug, thankYouPage, newSiteDoc, pageFromStructure, previewHeaders, publicDoc, publicHeaders, publish, readReference, renamePage, renderPublic, restoreVersion, savePage, siteRowId } from './studio-site.mjs';
import { starterProject, studioTemplates } from './ui/studio-data.js';
import { formOpen, formPage, readAnswers } from './ui/form-fields.js';
import { AGENCY_ID, agencyForWorkspace, agencyOverview, applySnapshot, blankAgency, catalogTemplate, executeAgency, extractSnapshot, hash, hydrateAgency, installTemplate, previewSnapshot, userAccess } from './agency-model.mjs';
import { MARKETPLACE_DOC_ID, emptyMarketplace, findMarketplaceSetup, hydrateMarketplace, publicMarketplaceList, publishToMarketplace, recordMarketplaceInstall, templateGallery, unpublishFromMarketplace } from './setup-marketplace.mjs';
import { captureProspectWidget, runProspectingAction } from './prospecting-model.mjs';
import { auditableUrl, collectProspectAudit, fetchPage, marketingAuditVars } from './prospect-audit.mjs';
import { importedFile, mediaLimitBytes } from './media-model.mjs';
import { mapsEmbedKey, placesConfigured, placesSearch } from './prospecting-places.mjs';
import { osmLookup, osmSearch } from './prospecting-osm.mjs';
import { adsAuthUrl, adsConfigured, adsExchange, changeMetaAudience, createMetaAd, freshAdsSecret, sendMetaEvents, setCampaignBudget, setCampaignStatus, sendGa4Event, syncAds, uploadGoogleConversion } from './ads-providers.mjs';
import { hasPixels, injectPixels, originAllowed, pixelsScript, trackerScript, trackingOf, touchesFrom, widenCsp } from './tracking.mjs';
import { adSettingsOf, markAdConnection, metaAdInput, patchAdCampaign, storeAdSync } from './ads-model.mjs';
import { cleanTouch, touchFromVisit } from './ui/ads-data.js';
import { exchangeGoogle, freshSecret, googleAuthUrl, googleConfigured, googleError, googleReports, listGoogleReviews, listLocations, locationDetails, replyGoogleReview, revokeGoogle, searchError, searchReport, updateLocation } from './google-integrations.mjs';
import { gbpChecklist, hoursPeriods } from './ui/gbp-data.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { affiliatePortal, portalTokenHash } from './affiliate-model.mjs';
import { affiliatePageCsp, renderPortal, renderSignup } from './affiliate-page.mjs';

// Per request: the affiliate referral cookies a public visitor carries (one per workspace).
const requestScope = new AsyncLocalStorage();
// Per request: where the visitor came from, per workspace (first and last touch; see ui/ads-data.js).
const touchCookie = workspace => `soci_at_${workspace.replace(/[^\w-]/g, '')}`;
function touchesOf(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [name, value = ''] = part.trim().split('=');
    if (!name?.startsWith('soci_at_')) continue;
    try { const v = JSON.parse(Buffer.from(decodeURIComponent(value), 'base64url').toString('utf8')); out[name.slice(8)] = { first: cleanTouch(v.f), last: cleanTouch(v.l) }; } catch { /* a broken cookie is ignored */ }
  }
  return out;
}
// Sites and funnels published on the Soci: a random visitor id, linked to the contact when the visitor sends
// the site's form, so later page views can fire "Página do site ou funil visitada".
const siteVisitorCookie = workspace => `soci_sv_${workspace.replace(/[^\w-]/g, '')}`;
function siteVisitorOf(req, workspace) {
  const name = siteVisitorCookie(workspace);
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [key, value = ''] = part.trim().split('=');
    if (key === name && /^[a-z0-9]{6,40}$/i.test(value)) return value;
  }
  return '';
}
const affiliateCookie = workspace => `soci_af_${workspace.replace(/[^\w-]/g, '')}`;
function referralsOf(req) {
  const refs = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [name, value = ''] = part.trim().split('=');
    if (!name?.startsWith('soci_af_')) continue;
    const [affiliateId, campaignId, at] = decodeURIComponent(value).split('.');
    if (/^[0-9a-f-]{36}$/.test(affiliateId || '') && /^[0-9a-f-]{36}$/.test(campaignId || '') && /^\d{13}$/.test(at || '')) refs[name.slice(8)] = { affiliateId, campaignId, at: Number(at) };
  }
  return refs;
}
// Visitor-facing requests (pages, forms, store, chat, webinar, offers). App screens never attribute.
const publicRequest = path => !path.startsWith('/api/') || /^\/api\/(store|chat|webinar|offer|avaliar|depoimento)\//.test(path);
import { folded, prospectSearchText } from './ui/prospecting-data.js';
import { shareReportHtml, widgetHtml } from './ui/prospect-report.js';
import { snapshotAssets } from './ui/agency-data.js';
import { effectiveAccess, hasModule, requireAgencyCommand, requireCapability, requireModule, requireRecordEffects, requireSetupModules, requireWorkspaceCommand, workspaceView } from './authorization.mjs';
import { attachAccounts, claimDue, evergreenDue, feedPosts, parseFeed, reviewSocialCsv, settle } from './social-model.mjs';
import { authUrl, availability, blueskyLogin, exchange as socialExchange, publish as socialPublish, seal, unseal } from './social-providers.mjs';
import { fetchMetaLead, metaInbound, metaLeads, metaSenderName, metaSignatureValid, quickReplies, sendMetaMessage, subscribeMetaPage } from './meta-messaging.mjs';
import { googleLeadFields, googleLeadKeyValid, metaLeadFields } from './lead-forms.mjs';
import { generateImage, startVideo, videoContent, videoStatus } from './openai-media.mjs';
import { inboundAddress, inboundEmail, inboundWorkspace, svixValid } from './email-inbound.mjs';
import { createPhoneHandler } from './phone-server.mjs';
import { CHUNK_BYTES } from './reputation-media.mjs';
import { network } from './ui/social-data.js';
import { captionRequest, writeCaption } from './social-ai.mjs';
import { findSharedReport, reportMailer, sharedReportPage } from './report-share.mjs';
import { documentMailer, documentMessage } from './document-mail.mjs';
import { campaignMailer } from './email-campaign-send.mjs';
import { countdownGif } from './countdown-gif.mjs';
import { deadlineOf, embedPage } from './ui/countdown-data.js';
import { mergeValues, normalizeDesign, renderEmail, fillText } from './ui/email-blocks.js';
import { applyDomainStatus, emailDomainView, emailDomains, normalizeLocalPart, workspaceSender } from './email-domain.mjs';
import { tokenHash as documentTokenHash } from './document-model.mjs';
import { estimateTokenHash } from './estimate-model.mjs';
import { invoiceTokenHash } from './invoice-model.mjs';
import { cartTokenHash, abandonedOf } from './checkout-model.mjs';
import { reportsDue } from './report-model.mjs';
import { brandGroupData } from './ui/brand-group-data.js';
import { brandGroupPage } from './brand-group-page.mjs';
import { presentationPageHtml } from './presentation-model.mjs';
import { createAskHandler } from './soci-chat.mjs';
import { createWahaHandler } from './waha.mjs';
import { createWhatsAppHandler } from './whatsapp.mjs';
import { createAbacatePayHandler } from './abacatepay.mjs';
import { makeClientPortal, portalCookie } from './client-portal.mjs';
import { makeCommunity } from './community.mjs';
import { fillWelcome } from './community-config.mjs';
import { certificateCsp, certificatePage } from './course-credentials.mjs';
import { loyaltyView } from './loyalty-model.mjs';
import { preferenceCsp, preferencePage, preferenceView } from './preference-model.mjs';
import { bookingCsp, bookingPage, bookingView, clockIn, zoneOf } from './scheduling-model.mjs';
import { audioLimit, audioTypes, summarizeMeeting, transcribeAudio } from './meeting-ai.mjs';
import { askAssistant } from './seo-ai.mjs';
import { addTopup, paidTopup, pricingFor, setPricing, walletAdjust, walletLimits } from './wallet-model.mjs';
import { desktopCsp, desktopLaunchPage, desktopManifest, desktopOf, desktopWorker } from './agency-desktop.mjs';
import { assetLinksFor, mobileConfig, mobileCsp, mobileLaunchPage, mobileManifest, mobileOf, mobileWorker, storePackage } from './agency-mobile.mjs';
import { pushConfigured, pushSubscription, sendPush } from './web-push.mjs';
import { pushTargets } from './push-model.mjs';
import { pollConnector, readWebhook, runConnectorAction, testConnection } from './connectors.mjs';
import { connectorPublic, pollJobs } from './connector-model.mjs';
import { connectorById, connectors as connectorCatalog } from './ui/connectors-data.js';
import { seal as sealSecret, unseal as unsealSecret } from './social-providers.mjs';
import { createMcpHandler } from './mcp-server.mjs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { chatHistory } from './chat-model.mjs';
import { chatPage, demoPage, loaderScript } from './ui/chat-widget-data.js';
import { blogHome, blogPost, blogRss, isLive } from './ui/blog-data.js';
import { localDraft, postSeo, writePost } from './blog-ai.mjs';
import { catalog, methodLabel, storeCart, storeHome, storeProduct } from './ui/store-data.js';
import { quoteOrder } from './store-model.mjs';
import { renderOfferPage, offerPageCsp } from './offer-page.mjs';
import { deliverCustomWebhook, deliverWebhook, publicTarget } from './workflow-delivery.mjs';
import { eachStep } from './ui/workflow-data.js';
import { calendarFile, registrationPage, roomPage } from './ui/webinar-data.js';
import { deviceOf, qrTarget } from './qr-model.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const staticFiles = new Map([
  ['/launchpad.js','text/javascript; charset=utf-8'], ['/launchpad-data.js','text/javascript; charset=utf-8'], ['/launchpad.css','text/css; charset=utf-8'],
  ['/app.js','text/javascript; charset=utf-8'], ['/icons.js','text/javascript; charset=utf-8'],
  ['/screens.js','text/javascript; charset=utf-8'], ['/conversations.js','text/javascript; charset=utf-8'], ['/conversation-analytics.js','text/javascript; charset=utf-8'], ['/conversation-sla.js','text/javascript; charset=utf-8'],
  ['/dashboard.js','text/javascript; charset=utf-8'], ['/dashboard-data.js','text/javascript; charset=utf-8'],
  ['/dashboard-controls.js','text/javascript; charset=utf-8'], ['/dashboard-metrics.js','text/javascript; charset=utf-8'], ['/dashboard.css','text/css; charset=utf-8'],
  ['/reports.js','text/javascript; charset=utf-8'], ['/report-data.js','text/javascript; charset=utf-8'], ['/reports.css','text/css; charset=utf-8'],
  ['/studio.js','text/javascript; charset=utf-8'], ['/sites.js','text/javascript; charset=utf-8'], ['/forms.js','text/javascript; charset=utf-8'], ['/form-fields.js','text/javascript; charset=utf-8'], ['/forms.css','text/css; charset=utf-8'], ['/blogs.js','text/javascript; charset=utf-8'], ['/stores.js','text/javascript; charset=utf-8'], ['/webinars.js','text/javascript; charset=utf-8'], ['/webinar-data.js','text/javascript; charset=utf-8'], ['/qr.js','text/javascript; charset=utf-8'], ['/qr-codes.js','text/javascript; charset=utf-8'], ['/sites-analytics.js','text/javascript; charset=utf-8'], ['/marketing-sites.css','text/css; charset=utf-8'], ['/stores.css','text/css; charset=utf-8'], ['/store-data.js','text/javascript; charset=utf-8'], ['/blogs.css','text/css; charset=utf-8'], ['/blog-data.js','text/javascript; charset=utf-8'], ['/chat-widgets.js','text/javascript; charset=utf-8'], ['/chat-widgets.css','text/css; charset=utf-8'], ['/chat-widget-data.js','text/javascript; charset=utf-8'], ['/studio-builder.js','text/javascript; charset=utf-8'], ['/studio-design.js','text/javascript; charset=utf-8'], ['/studio-builder.css','text/css; charset=utf-8'], ['/sites.css','text/css; charset=utf-8'], ['/studio-data.js','text/javascript; charset=utf-8'], ['/studio.css','text/css; charset=utf-8'],
  ['/design-workspace.js','text/javascript; charset=utf-8'], ['/design-workspace.css','text/css; charset=utf-8'],
  ['/automation.js','text/javascript; charset=utf-8'], ['/automation.css','text/css; charset=utf-8'], ['/expressions.js','text/javascript; charset=utf-8'], ['/workflow-data.js','text/javascript; charset=utf-8'], ['/workflow-builder.js','text/javascript; charset=utf-8'],
  ['/client-portal.js','text/javascript; charset=utf-8'], ['/media.js','text/javascript; charset=utf-8'], ['/media.css','text/css; charset=utf-8'], ['/scheduling.js','text/javascript; charset=utf-8'], ['/meetings.js','text/javascript; charset=utf-8'], ['/seo.js','text/javascript; charset=utf-8'], ['/wallet.js','text/javascript; charset=utf-8'], ['/wallet.css','text/css; charset=utf-8'], ['/labs.js','text/javascript; charset=utf-8'], ['/app-studio-data.js','text/javascript; charset=utf-8'], ['/app-marketplace.js','text/javascript; charset=utf-8'], ['/apps.css','text/css; charset=utf-8'], ['/conversation-ai.js','text/javascript; charset=utf-8'], ['/labs-data.js','text/javascript; charset=utf-8'], ['/labs.css','text/css; charset=utf-8'], ['/seo.css','text/css; charset=utf-8'], ['/scheduling.css','text/css; charset=utf-8'], ['/portal-page.js','text/javascript; charset=utf-8'], ['/portal-community.js','text/javascript; charset=utf-8'], ['/portal-community-feed.js','text/javascript; charset=utf-8'], ['/portal-community-academy.js','text/javascript; charset=utf-8'], ['/portal-community.css','text/css; charset=utf-8'], ['/portal-smooth-scroll.js','text/javascript; charset=utf-8'],['/portal-loyalty.js','text/javascript; charset=utf-8'], ['/portal-course-extra.js','text/javascript; charset=utf-8'], ['/phone-input.js','text/javascript; charset=utf-8'], ['/locales/es.js','text/javascript; charset=utf-8'], ['/client-portal.css','text/css; charset=utf-8'], ['/courses.js','text/javascript; charset=utf-8'], ['/courses.css','text/css; charset=utf-8'], ['/communities.js','text/javascript; charset=utf-8'], ['/community-events.js','text/javascript; charset=utf-8'], ['/community-data.js','text/javascript; charset=utf-8'], ['/community-admin.js','text/javascript; charset=utf-8'], ['/course-builder-extra.js','text/javascript; charset=utf-8'], ['/certificates.js','text/javascript; charset=utf-8'], ['/tickets.js','text/javascript; charset=utf-8'], ['/sequences.js','text/javascript; charset=utf-8'], ['/loyalty.js','text/javascript; charset=utf-8'], ['/preferences.js','text/javascript; charset=utf-8'], ['/contact-trash.js','text/javascript; charset=utf-8'], ['/ticket-data.js','text/javascript; charset=utf-8'], ['/agency-desktop.js','text/javascript; charset=utf-8'], ['/certificate-data.js','text/javascript; charset=utf-8'],['/offers.js','text/javascript; charset=utf-8'], ['/documents.js','text/javascript; charset=utf-8'], ['/document-render.js','text/javascript; charset=utf-8'], ['/document-sign.js','text/javascript; charset=utf-8'], ['/document-sign.css','text/css; charset=utf-8'], ['/estimate-render.js','text/javascript; charset=utf-8'], ['/estimate-view.js','text/javascript; charset=utf-8'], ['/estimates.js','text/javascript; charset=utf-8'], ['/estimates.css','text/css; charset=utf-8'], ['/invoices.js','text/javascript; charset=utf-8'], ['/invoices.css','text/css; charset=utf-8'], ['/invoice-data.js','text/javascript; charset=utf-8'], ['/invoice-render.js','text/javascript; charset=utf-8'], ['/invoice-view.js','text/javascript; charset=utf-8'], ['/payment-settings.js','text/javascript; charset=utf-8'], ['/email-services.js','text/javascript; charset=utf-8'], ['/phone-settings.js','text/javascript; charset=utf-8'], ['/call-report.js','text/javascript; charset=utf-8'], ['/dialer.js','text/javascript; charset=utf-8'], ['/mobile-shell.js','text/javascript; charset=utf-8'], ['/agency-mobile.js','text/javascript; charset=utf-8'], ['/connectors.js','text/javascript; charset=utf-8'], ['/connectors-data.js','text/javascript; charset=utf-8'], ['/email-blocks.js','text/javascript; charset=utf-8'], ['/email-marketing.js','text/javascript; charset=utf-8'], ['/countdown-data.js','text/javascript; charset=utf-8'], ['/countdowns.js','text/javascript; charset=utf-8'], ['/checkout-data.js','text/javascript; charset=utf-8'], ['/catalog.js','text/javascript; charset=utf-8'], ['/orders.js','text/javascript; charset=utf-8'], ['/line-items.js','text/javascript; charset=utf-8'], ['/document-data.js','text/javascript; charset=utf-8'], ['/documents.css','text/css; charset=utf-8'], ['/communities.css','text/css; charset=utf-8'],
  ['/agents.js','text/javascript; charset=utf-8'], ['/agents-data.js','text/javascript; charset=utf-8'], ['/ai-data.js','text/javascript; charset=utf-8'], ['/content-ai.js','text/javascript; charset=utf-8'], ['/content-ai-data.js','text/javascript; charset=utf-8'], ['/content-ai.css','text/css; charset=utf-8'], ['/reputation.js','text/javascript; charset=utf-8'], ['/gbp-data.js','text/javascript; charset=utf-8'], ['/affiliates.js','text/javascript; charset=utf-8'], ['/ads.js','text/javascript; charset=utf-8'], ['/ads-data.js','text/javascript; charset=utf-8'], ['/ads.css','text/css; charset=utf-8'], ['/affiliates.css','text/css; charset=utf-8'], ['/brand-data.js','text/javascript; charset=utf-8'], ['/brand.js','text/javascript; charset=utf-8'], ['/brand.css','text/css; charset=utf-8'], ['/tracking.js','text/javascript; charset=utf-8'], ['/tracking.css','text/css; charset=utf-8'], ['/scoring-data.js','text/javascript; charset=utf-8'],['/reputation.css','text/css; charset=utf-8'], ['/agent-hub.js','text/javascript; charset=utf-8'], ['/agents.css','text/css; charset=utf-8'],
  ['/agency.js','text/javascript; charset=utf-8'], ['/agency-data.js','text/javascript; charset=utf-8'], ['/setup-art.js','text/javascript; charset=utf-8'], ['/agency.css','text/css; charset=utf-8'],
  ['/presentations.js','text/javascript; charset=utf-8'], ['/presentation-data.js','text/javascript; charset=utf-8'], ['/presentations.css','text/css; charset=utf-8'],
  ['/soci-chat.js','text/javascript; charset=utf-8'], ['/soci-chat.css','text/css; charset=utf-8'],
  ['/beautiful-ui.js','text/javascript; charset=utf-8'], ['/beautiful-ui.css','text/css; charset=utf-8'],
  ['/beautiful-ui-more.js','text/javascript; charset=utf-8'], ['/beautiful-ui.html','text/html; charset=utf-8'], ['/bui-mounts.js','text/javascript; charset=utf-8'],
  ['/highlight.js','text/javascript; charset=utf-8'], ['/toast.js','text/javascript; charset=utf-8'], ['/toast.css','text/css; charset=utf-8'],
  ['/vendor/marked.js','text/javascript; charset=utf-8'], ['/vendor/purify.js','text/javascript; charset=utf-8'],
  ['/color-picker.js','text/javascript; charset=utf-8'],
  ['/prospecting.js','text/javascript; charset=utf-8'], ['/prospecting-data.js','text/javascript; charset=utf-8'],
  ['/prospect-report.js','text/javascript; charset=utf-8'], ['/prospecting.css','text/css; charset=utf-8'],
  ['/crm.js','text/javascript; charset=utf-8'], ['/crm-data.js','text/javascript; charset=utf-8'],
  ['/opportunity-data.js','text/javascript; charset=utf-8'], ['/opportunity-filters.js','text/javascript; charset=utf-8'], ['/opportunities.js','text/javascript; charset=utf-8'], ['/opportunities.css','text/css; charset=utf-8'],
  ['/social.js','text/javascript; charset=utf-8'], ['/social-data.js','text/javascript; charset=utf-8'], ['/social.css','text/css; charset=utf-8'],
  ['/social-connect.js','text/javascript; charset=utf-8'], ['/social-approve.js','text/javascript; charset=utf-8'], ['/brand-group-data.js','text/javascript; charset=utf-8'], ['/brand-groups.css','text/css; charset=utf-8'],
  ['/prancheta.js','text/javascript; charset=utf-8'], ['/prancheta.css','text/css; charset=utf-8'],
  ['/style.css','text/css; charset=utf-8'], ['/index.html','text/html; charset=utf-8'],
  ['/graao.css','text/css; charset=utf-8'], ['/lucide-animated.css','text/css; charset=utf-8'], ['/inbox.css','text/css; charset=utf-8'], ['/inbox.js','text/javascript; charset=utf-8'], ['/inbox-data.js','text/javascript; charset=utf-8'], ['/graao-dark.css','text/css; charset=utf-8'], ['/graao.js','text/javascript; charset=utf-8'], ['/sidebar.js','text/javascript; charset=utf-8'],
  ['/topbar.js','text/javascript; charset=utf-8'], ['/i18n.js','text/javascript; charset=utf-8'],
  ['/fonts/plus-jakarta-sans.woff2','font/woff2'], ['/favicon.svg','image/svg+xml'],
  ['/landing.html','text/html; charset=utf-8'], ['/landing.css','text/css; charset=utf-8'], ['/landing.js','text/javascript; charset=utf-8'],
  ['/privacidade.html','text/html; charset=utf-8'], ['/skull_flame.svg','image/svg+xml'], ['/skull_flame_animated.svg','image/svg+xml']
]);
// Ilustrações dos templates de setup (ui/setup-art/*.svg), uma por segmento.
for (const file of readdirSync(resolve(root, 'ui', 'setup-art'))) if (/^[a-z0-9-]+\.svg$/.test(file)) staticFiles.set(`/setup-art/${file}`, 'image/svg+xml');
const host = '127.0.0.1';
const defaultPort = Number(process.env.GO_PORT || 4317);
const csp = "default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com https://cdnjs.cloudflare.com https://unpkg.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://accounts.google.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; media-src 'self' data: https:; connect-src 'self' https://accounts.google.com; frame-src 'self' https: https://accounts.google.com; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'";
const error = (message,status) => Object.assign(new Error(message),{status});
const spaceId = /^[0-9a-f-]{36}$|^demo$/;
const privateSpace = /^user-[0-9a-f-]{36}$/;
// Why a WhatsApp message was not delivered, as the "Falha no envio de mensagem" trigger names it.
// documentMail.email answers with a sentence: "e-mail enviado…" when Resend accepted it, anything else is a failure.
const mailSent = outcome => typeof outcome === 'string' ? /^e-mail enviado/.test(outcome) : Boolean(outcome);
const deliveryFailure = reason => ({ 'not-connected': 'not_connected', 'invalid-phone': 'invalid_phone', 'account-suspended': 'suspended' })[reason] || 'provider_error';
const personalId = session => `user-${session.id}`;
const workspaceSegment = '(demo|(?:user-)?[0-9a-f-]{36})';
const portalPage = new RegExp(`^/portal/${workspaceSegment}/?$`);
const portalApi = new RegExp(`^/api/client-portal/${workspaceSegment}/(admin|home|exchange|logout|course|progress|community-admin|community|offer-grant|loyalty|admin-enter|files|push)(?:/([0-9a-f-]{36}))?$`);
const paths = new RegExp(`^/(p|f|course)/${workspaceSegment}/([0-9a-f-]{36})$`);
const chatPath = new RegExp(`^/chat/${workspaceSegment}/([0-9a-f-]{36})(?:/(widget\\.js|demo))?/?$`);
const chatApi = new RegExp(`^/api/chat/${workspaceSegment}/([0-9a-f-]{36})/(start|send|messages)$`);
const webinarPath = new RegExp(`^/w/${workspaceSegment}/([0-9a-f-]{36})(?:/(sala|agenda\\.ics))?/?$`);
const webinarApi = new RegExp(`^/api/webinar/${workspaceSegment}/([0-9a-f-]{36})/register$`);
const qrPath = new RegExp(`^/q/${workspaceSegment}/([0-9a-f-]{36})$`);
const storePath = new RegExp(`^/loja/${workspaceSegment}/([0-9a-f-]{36})(?:/(carrinho)|/p/([a-z0-9-]{1,80}))?/?$`);
const reviewPagePath = new RegExp(`^/avaliar/${workspaceSegment}(?:/([0-9a-f]{48}))?/?$`);
const reviewApi = new RegExp(`^/api/avaliar/${workspaceSegment}$`);
const widgetPath = new RegExp(`^/rw/${workspaceSegment}/([0-9a-f-]{36})(?:/(widget\\.js))?/?$`);
const videoPath = new RegExp(`^/v/${workspaceSegment}/([0-9a-f-]{36})$`);
const collectorPath = new RegExp(`^/depoimento/${workspaceSegment}/([0-9a-f-]{36})/?$`);
const collectorApi = new RegExp(`^/api/depoimento/${workspaceSegment}/([0-9a-f-]{36})/(start|chunk|finish)$`);
const affiliateLink = new RegExp(`^/r/${workspaceSegment}/([a-z0-9]{3,20})(?:/([0-9a-f-]{36}))?/?$`);
const affiliatePagePath = new RegExp(`^/afiliados/${workspaceSegment}(?:/([0-9a-f]{48}))?/?$`);
const affiliateSignupApi = new RegExp(`^/api/afiliados/${workspaceSegment}/signup$`);
const offerPath = new RegExp(`^/oferta/${workspaceSegment}/([0-9a-f-]{36})/?$`);
const certificatePath = new RegExp(`^/certificado/${workspaceSegment}/([0-9A-F]{12})/?$`);
const preferencePath = new RegExp(`^/preferencias/${workspaceSegment}/([0-9a-f]{32})/?$`);
const bookingPath = new RegExp(`^/agendar/${workspaceSegment}/?$`);
const desktopPath = /^\/desktop\/([\w-]{1,60})\/(manifest\.webmanifest|sw\.js|icon-(?:192|512|1024)\.png)?$/;
const mobilePath = /^\/mobile\/([\w-]{1,60})\/(manifest\.webmanifest|sw\.js|config\.json|icon-(?:192|512|1024)\.png)?$/;
const offerApi = new RegExp(`^/api/offer/${workspaceSegment}/([0-9a-f-]{36})$`);
const storeApi = new RegExp(`^/api/store/${workspaceSegment}/([0-9a-f-]{36})/(quote|checkout|cart|restore|review|view)$`);
const blogPath = new RegExp(`^/b/${workspaceSegment}/([0-9a-f-]{36})(?:/([a-z0-9-]{1,80}|rss\\.xml))?/?$`);
const formPath = new RegExp(`^/form/${workspaceSegment}/([0-9a-f-]{36})/?$`);
const redirectPath = new RegExp(`^/r/${workspaceSegment}/([0-9a-f-]{36})$`);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const emailTrackPath = new RegExp(`^/e/(o|c|u)/${workspaceSegment}/([0-9a-f]{24})(?:/([0-9]{1,3}))?$`);
const countdownPath = new RegExp(`^/cd/${workspaceSegment}/([0-9a-f-]{36})([.]gif)?$`);
// A transparent 1x1 GIF for timers that no longer exist (an e-mail must not show a broken image).
const blankGif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const hookPath = new RegExp(`^/hooks/${workspaceSegment}/([0-9a-f-]{36})/([a-z0-9]{6,40})$`, 'i');
const socialFilePath = new RegExp(`^/m/${workspaceSegment}/([0-9a-f-]{36})$`);
const socialInvitePath = new RegExp(`^/social-connect/${workspaceSegment}/?$`);
const socialApprovePath = new RegExp(`^/aprovar/${workspaceSegment}/?$`);
const signPagePath = new RegExp(`^/assinar/${workspaceSegment}/?$`);
const signApiPath = new RegExp(`^/api/assinar/${workspaceSegment}$`);
const estimatePagePath = new RegExp(`^/orcamento/${workspaceSegment}/?$`);
const estimateApiPath = new RegExp(`^/api/orcamento/${workspaceSegment}$`);
const invoicePagePath = new RegExp(`^/fatura/${workspaceSegment}/?$`);
const invoiceApiPath = new RegExp(`^/api/fatura/${workspaceSegment}$`);
const brandGroupRoute = /^\/marcas\/([0-9a-f]{64})\/?$/;
const presentationRoute = /^\/apresentacao\/([0-9a-f]{64})\/?$/;
const sharedReportRoute = new RegExp(`^/relatorio/${workspaceSegment}/([0-9a-f]{64})/?$`);
const previewPath = new RegExp(`^/studio-preview/${workspaceSegment}/([0-9a-f-]{36})/([0-9a-f-]{36})$`);
// Pages a visitor lands on (sites, forms, offers, store, blog, webinars, QR codes and links): they remember the visit's source.
// The tracking script (/t/<workspace>.js), the pixels loader (/t/<workspace>/pixels.js) and events (/t/<workspace>/e).
const trackingPath = new RegExp(`^/t/${workspaceSegment}(\\.js|/pixels\\.js|/e)$`);
const landingPath = new RegExp(`^/(s|form|oferta|loja|b|w|q|r)/${workspaceSegment}(?:/|$)`);
const sitePath = new RegExp(`^/s/${workspaceSegment}/([0-9a-f-]{36})(?:/([a-z0-9-]{1,48}))?$`);
const prospectPublicPath = /^\/prospecting\/(report|widget)\/([0-9a-f-]{36})$/;
const apiPath = /^\/api\/v1\/subaccounts(?:\/(demo|[0-9a-f-]{36})\/contacts)?$/;
function publicAgency(agency, who) {
  const view = { ...agency,
    snapshots: agency.snapshots.map(({ studioSites: _studioSites, ...rest }) => rest),
    apiKeys: agency.apiKeys.map(({ hash: _hash, ...rest }) => rest),
    privateIntegrations: agency.privateIntegrations.map(({ hash: _hash, ...rest }) => rest)
  };
  if (!who.settings) {
    const empty = blankAgency();
    for (const key of ['profile', 'users', 'billing', 'apiKeys', 'privateIntegrations', 'audit', 'emailServices', 'systemEmails', 'compliance']) {
      if (Object.hasOwn(empty, key)) view[key] = empty[key];
    }
    view.accounts = Object.fromEntries(Object.entries(agency.accounts).map(([id, { statusHistory, ignoredWebhooks, suspendedReason, billing, ...meta }]) => [id, meta]));
  }
  if (who.modules !== null || !who.settings) view.snapshots = view.snapshots.map(({ assets, shareCode, ...snap }) => snap);
  // Setups imported with asset protection show only how many records each type has, never the records.
  view.snapshots = view.snapshots.map(({ assets, ...snap }) => snap.protected || !assets ? snap : { ...snap, assets });
  return view;
}
const stamp = () => new Date().toISOString();
// What a snapshot load or preview asked for: the records picked per asset type and the conflict rule per type.
function loadChoices(input) {
  const known = new Set(snapshotAssets.map(([key]) => key));
  let items = null;
  if (input.items && typeof input.items === 'object' && !Array.isArray(input.items)) {
    items = {};
    for (const [key, value] of Object.entries(input.items)) {
      if (!known.has(key)) continue;
      if (value === '*') items[key] = '*';
      else if (Array.isArray(value)) items[key] = value.filter(id => typeof id === 'string').slice(0, 2000);
    }
  }
  const modes = {};
  if (input.modes && typeof input.modes === 'object') for (const [key, value] of Object.entries(input.modes)) {
    if (known.has(key) && (value === 'skip' || value === 'overwrite')) modes[key] = value;
  }
  return { items, modes };
}

const defaultDbPath = process.env.GO_DB_PATH ? resolve(process.env.GO_DB_PATH) : (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
  ? resolve(tmpdir(), 'go.sqlite')
  : resolve(root, '.data', 'go.sqlite');

export function makeServer({
  pushEnv=process.env, pushRequest=fetch, connectorRequest=fetch, dbPath=defaultDbPath, port=defaultPort, store=createSqliteStore(dbPath), socialScheduler=!process.env.VERCEL,
  auth=authFromEnv(), agencyOwnerId=process.env.GO_AGENCY_OWNER_ID, agentModel=openAIModel, generateAgentReply=replyAsAgent, contentAI=null, workflowAI=null, mediaAI=null, brandFetch=fetch, metaFetch=fetch, inboundFetch=fetch, twilioRequest=fetch, phoneEnv=process.env, brandResolve=null, designAgentConfig=designAgent,
  emailResolver=undefined, openAISecret=process.env.GO_STORAGE_KEY, openAIRequest=fetch, fetchMedia=fetchPage, wahaRequest=fetch, whatsappRequest=fetch, abacatePayRequest=fetch, appRequest=null, appResolve=null,
  uazapiBaseUrl=process.env.UAZAPI_BASE_URL || '', uazapiAdminToken=process.env.UAZAPI_ADMIN_TOKEN || '',
  evolutionBaseUrl=process.env.EVOLUTION_BASE_URL || '', evolutionApiKey=process.env.EVOLUTION_API_KEY || '',
  portalOptions={}, prospectAudit=collectProspectAudit, reportMail=reportMailer(), documentMail=documentMailer(), emailDomainApi=emailDomains(), campaignMail=campaignMailer(),
  allowLocalAccess=process.env.GO_DEV_NO_AUTH === '1'
}={}) {
  const localAccess = !auth && !process.env.VERCEL && allowLocalAccess;
  const content = { transformText, writeEmail, writeReviewReply, writeBrandVoice, writeCaption, writePost, postSeo, transcribeAudio, summarizeMeeting, askAssistant, writeConversationReply, writeConversationSummary, ...contentAI };
  // The default brand board's voice, added by the server to every AI writer (never taken from the browser).
  const brandVoiceOf = async workspace => brandVoicePrompt(defaultBoard((await store.load(workspace)).brandBoards));
  // One AI request for a sub-account: checks the monthly limit, meters every OpenAI call and books it.
  // Tests inject `contentAI` and run locally with only the meter, never a key.
  async function meteredAI(who, id, kind, run) {
    checkAiBudget(await store.load(id));
    const meter = usageMeter();
    const connection = localAccess && contentAI ? { onUsage: meter.onUsage, model: agentModel }
      : { ...await openAI.requireConnection(who.session), onUsage: meter.onUsage };
    try {
      const result = await run(connection);
      await store.change(id, state => { meter.charge(state, kind, ''); });
      return result;
    } catch (problem) {
      await store.change(id, state => { meter.charge(state, kind, '', problem.message); });
      throw problem;
    }
  }
  const openAI = createOpenAI({ store, model: agentModel, secret: openAISecret, request: openAIRequest });
  // Marketplace apps (7.3): signing secrets derive from the storage key; without one (local runs) from a per-process key.
  const appSigningKey = openAISecret || randomBytes(32).toString('hex');
  const appDeliveryOptions = { ...(appRequest && { fetchImpl: appRequest }), ...(appResolve && { resolve: appResolve }) };
  // One signed POST to an app's webhook. `body` is the event, action or lifecycle notice.
  async function deliverToApp(agencyId, workspace, appId, body) {
    const agency = await loadAgency(agencyId);
    const app = (agency.studioApps || []).find(row => row.id === appId);
    const install = (agency.appInstalls || []).find(row => row.appId === appId && row.account === workspace);
    if (!app) return { name: 'App', text: 'app excluído: não enviado' };
    if (!install && body.type !== 'app.uninstalled') return { name: app.name, text: 'app desinstalado: não enviado' };
    if (!app.webhookUrl) return { name: app.name, text: 'o app não tem webhook' };
    const payload = { ...body, app: { id: app.id, name: app.name }, workspace, installId: install?.id || body.installId || '', sentAt: stamp() };
    const raw = JSON.stringify(payload), timestamp = String(Math.floor(Date.now() / 1000));
    const headers = { 'x-soci-app': app.id, 'x-soci-event': body.event || body.type, 'x-soci-timestamp': timestamp,
      'x-soci-signature': appSignature(appSecret(appSigningKey, agencyId, app), timestamp, raw) };
    return { name: app.name, text: await deliverWebhook({ url: app.webhookUrl, method: 'POST', body: payload, raw, headers }, appDeliveryOptions) };
  }
  async function voiceAgentReply(workspace, { agentId, input, workflowId = '', voiceKey = null }) {
    const state = await store.load(workspace);
    const connection = localAccess && generateAgentReply !== replyAsAgent ? { model: agentModel }
      : workflowId ? await workflowConnection(workspace, state, workflowId)
      : await keyConnection(workspace, state, voiceKey, 'Voice AI: salve o número de novo, com a OpenAI conectada', 'quem ligou o Voice AI não tem mais acesso a esta subconta; salve o número de novo', 'conecte a OpenAI de quem ligou o Voice AI (Visão da agência → Configurações → OpenAI)');
    checkAiBudget(state);
    const meter = usageMeter();
    const request = agentWorkflowRequest(state, agentId, input);
    const reply = String(await generateAgentReply({ ...request, model: request.model || agentModel }, { ...connection, onUsage: meter.onUsage }) || '');
    await store.change(workspace, current => {
      meter.charge(current, 'workflow', '');
      recordAgentRun(current, { agent: agentId, version: 'published', input, output: reply, kind: 'voice', model: request.model || agentModel, sources: [...new Set(request.retrieved.map(row => row.title))] });
    });
    return reply;
  }
  // Telefonia (2.4): Twilio numbers, calls and IVR (phone-server.mjs).
  const phone = createPhoneHandler({ store, change: (workspace, command) => change(workspace, command), flushLater: workspace => flushLater(workspace), request: twilioRequest, env: phoneEnv,
    accountActive: workspace => publicAccountPolicy(workspace, false, 'conversations'), agentReply: (workspace, options) => voiceAgentReply(workspace, options) });
  const phoneOrigin = () => String(phoneEnv.PHONE_PUBLIC_ORIGIN || phoneEnv.SOCIAL_PUBLIC_URL || phoneEnv.PORTAL_PUBLIC_ORIGIN || '').replace(/\/+$/, '');
  const handleAsk = createAskHandler({ store, openAI, openAIRequest });
  const waha = createWahaHandler({ store, secret: openAISecret, request: wahaRequest });
  const abacate = createAbacatePayHandler({ store, secret: openAISecret, request: abacatePayRequest });
  const whatsapp = createWhatsAppHandler({
    store, secret: openAISecret, request: whatsappRequest, envBaseUrl: uazapiBaseUrl, envAdminToken: uazapiAdminToken,
    evolutionBaseUrl, evolutionApiKey
  });
  // A quiz, an assignment or a grade: the student's contact gets the course triggers in the workflows.
  const onCourseActivity = async (workspace, data) => { await change(workspace, { type: 'course-activity', data }); flushLater(workspace); };
  // A member signed in to the portal: "Login no portal do cliente" (first sign-in = signup).
  const onPortalLogin = async (workspace, data) => { await change(workspace, { type: 'portal-login', data }); flushLater(workspace); };
  const clientPortal = makeClientPortal({ ...portalOptions, store, onCourseActivity, onLogin: onPortalLogin, loadState: workspace => store.load(workspace),
    extraCourses: (workspace, state, memberId) => community.includedCourses(workspace, state, memberId) });
  // A member confirmed or paid an event: find or create the contact and fire "Inscrição em evento da comunidade".
  const onEventJoin = async (workspace, { eventId, memberId, paid }) => {
    const member = (await clientPortal.directory(workspace)).members?.find(row => row.id === memberId);
    if (!member) return;
    await change(workspace, { type: 'community-event-joined', id: eventId, data: { email: member.email, name: member.name, contactId: member.contactId || '', paid } });
    flushLater(workspace);
  };
  // Someone became an active member: the welcome e-mail (when set) and "Membro entrou na comunidade".
  const onMemberJoin = async (workspace, { groupId, memberId }) => {
    const [state, directory] = await Promise.all([store.load(workspace), clientPortal.directory(workspace)]);
    const group = state.communities.find(row => row.id === groupId), member = directory.members?.find(row => row.id === memberId);
    if (!group || !member?.email) return;
    const body = fillWelcome(group.welcomeDm, { name: member.name || member.email.split('@')[0], group: group.name });
    await change(workspace, { type: 'community-welcome', id: group.id, data: { items: [{ email: member.email, name: member.name, contactId: member.contactId || '', group: group.name, subject: `Boas-vindas à ${group.name}`, body }] } });
    flushLater(workspace);
  };
  // Posts, comments, join requests and lost access in a group: the community triggers on the member's contact.
  const onCommunityActivity = async (workspace, { groupId, memberId, ...data }) => {
    const member = (await clientPortal.directory(workspace)).members?.find(row => row.id === memberId);
    if (!member?.email) return;
    await change(workspace, { type: 'community-activity', id: groupId, data: { ...data, email: member.email, name: member.name, contactId: member.contactId || '' } });
    flushLater(workspace);
  };
  const community = makeCommunity({ store, onEventJoin, onMemberJoin, onActivity: onCommunityActivity });
  // A paid ticket invoice: the member gets the seat (once per invoice).
  async function grantEventTicket(workspace, invoice) {
    await community.grantTicket(workspace, invoice.eventTicket, invoice.id);
    await store.change(workspace, current => {
      const row = current.invoices.find(item => item.id === invoice.id);
      if (row) row.ticketGrantedAt = new Date().toISOString();
    });
  }
  // Courses the contact gained or lost: "Acesso a curso liberado / removido" in the workflows.
  async function courseAccessChanged(workspace, contact, courseIds, event) {
    for (const courseId of courseIds || []) await onCourseActivity(workspace, { event, courseId, email: contact.email, name: contact.name || '', contactId: contact.id || contact.contactId || '' });
  }
  // An offer's courses and communities given or taken: "Acesso à oferta liberado / removido" in the workflows.
  async function offerAccessChanged(workspace, contact, offerId, event) {
    await change(workspace, { type: 'offer-access', data: { event, offerId, email: contact.email || '', name: contact.name || '', contactId: contact.id || contact.contactId || '' } });
    flushLater(workspace);
  }
  // Workflows: "Copiar contato" into another sub-account of the same agency (checked again at run time).
  async function workflowCopyContact(workspace, state, item) {
    const target = String(item.workspace || '');
    if (privateSpace.test(workspace)) return 'não disponível na conta pessoal';
    if (target === workspace) return 'a subconta de destino é esta mesma';
    const agencyId = state.agencyId || AGENCY_ID;
    const account = (await listWorkspaces(agencyId)).find(row => row.id === target);
    if (!account) return 'subconta de destino não encontrada nesta agência';
    if (!await accountIsActive(agencyId, target, 'contacts').catch(() => false)) return `${account.name}: subconta sem contatos ativos`;
    const copied = await change(target, { type: 'contact-copy-in', data: { ...(item.contact || {}), tags: [...(item.contact?.tags || []), ...(item.tags || [])], from: state.profile?.name || workspace } });
    if (copied.state.workflowOutbox?.length) flushLater(target);
    return `${account.name}: ${copied.id?.created ? 'contato criado' : 'contato já existia (campos vazios e tags completados)'}`;
  }
  // Workflows: the access actions (courses in the portal, communities, offers, ranking points), applied after the run was saved.
  async function workflowAccess(workspace, item) {
    const state = await store.load(workspace);
    const who = { email: item.email, name: item.name, contactId: item.contactId };
    if (item.action === 'grant_offer' || item.action === 'revoke_offer') {
      const offer = state.offers.find(row => row.id === item.offerId);
      if (!offer) return 'oferta não encontrada';
      if (item.action === 'grant_offer') {
        const { memberId, emailed, added } = await clientPortal.enroll(workspace, state, who, offer.courseIds);
        if (!memberId) return 'acesso ao portal revogado para este contato';
        const joined = await community.enroll(workspace, memberId, offer.communityIds);
        await courseAccessChanged(workspace, who, added, 'granted');
        // Only a grant that opened something fires the trigger, so a workflow that grants on the trigger cannot loop.
        if (!added.length && !joined.length) return `${offer.title}: já tinha acesso`;
        await offerAccessChanged(workspace, who, offer.id, 'granted');
        return `${offer.title}: acesso liberado${emailed ? ' (link enviado)' : ''}`;
      }
      const removed = await clientPortal.revokeCourses(workspace, who, offer.courseIds);
      const left = await community.unenroll(workspace, await clientPortal.memberOf(workspace, who), offer.communityIds);
      await courseAccessChanged(workspace, who, removed, 'revoked');
      if (!removed.length && !left.length) return `${offer.title}: contato não tinha acesso`;
      await offerAccessChanged(workspace, who, offer.id, 'revoked');
      return `${offer.title}: acesso removido`;
    }
    if (item.action === 'register_event') {
      const event = (state.communityEvents || []).find(row => row.id === item.eventId);
      if (!event) return 'evento não encontrado';
      const outcome = await community.registerEvent(workspace, state, await clientPortal.memberOf(workspace, who), event.id, { comp: item.comp === true });
      return `${event.title}: ${({ registered: item.comp ? 'inscrito como cortesia' : 'presença confirmada', already: 'já estava confirmado', full: 'vagas esgotadas', ended: 'evento já terminou', paid: 'evento pago (use o ingresso)', missing: 'evento não publicado', 'not-member': 'contato não é membro ativo da comunidade' })[outcome]}`;
    }
    if (item.action === 'grant_channel_access' || item.action === 'revoke_channel_access') {
      const group = state.communities.find(row => row.id === item.communityId), channel = group?.channels.find(row => row.id === item.channelId);
      if (!channel) return 'canal não encontrado';
      const grant = item.action === 'grant_channel_access';
      const outcome = await community.channelAccess(workspace, state, await clientPortal.memberOf(workspace, who), group.id, channel.id, grant);
      if (!outcome) return `${group.name}: contato não é membro ativo (ou o canal não é privado)`;
      return outcome === 'same' ? `#${channel.name}: ${grant ? 'já tinha acesso' : 'contato não tinha acesso'}` : `#${channel.name}: acesso ${grant ? 'liberado' : 'removido'}`;
    }
    if (item.action === 'community_points') {
      const group = state.communities.find(row => row.id === item.communityId);
      if (!group) return 'comunidade não encontrada';
      const given = await community.grantPoints(workspace, state, await clientPortal.memberOf(workspace, who), group.id, item.points, item.note);
      if (!given) return `${group.name}: contato não é membro ativo`;
      return `${group.name}: ${item.points > 0 ? '+' : ''}${item.points} ponto(s), total ${given.total} (nível ${given.level}${given.name ? ` · ${given.name}` : ''})`;
    }
    const course = item.courseId && state.courses.find(row => row.id === item.courseId);
    const group = item.communityId && state.communities.find(row => row.id === item.communityId);
    if (item.action === 'grant_course_access') {
      if (!course) return 'curso não encontrado';
      const { memberId, emailed, added } = await clientPortal.enroll(workspace, state, who, [course.id]);
      if (!memberId) return 'acesso ao portal revogado para este contato';
      await courseAccessChanged(workspace, who, added, 'granted');
      return added.length ? `${course.name}: acesso liberado${emailed ? ' (link enviado)' : ''}` : `${course.name}: já tinha acesso`;
    }
    if (item.action === 'revoke_course_access') {
      if (!course) return 'curso não encontrado';
      const removed = await clientPortal.revokeCourses(workspace, who, [course.id]);
      await courseAccessChanged(workspace, who, removed, 'revoked');
      return removed.length ? `${course.name}: acesso removido` : `${course.name}: contato não tinha acesso`;
    }
    if (!group) return 'comunidade não encontrada';
    if (item.action === 'grant_community_access') {
      const { memberId } = await clientPortal.enroll(workspace, state, who, []);
      if (!memberId) return 'acesso ao portal revogado para este contato';
      const joined = await community.enroll(workspace, memberId, [group.id]);
      return joined.length ? `${group.name}: membro adicionado` : `${group.name}: já era membro (ou está banido)`;
    }
    const memberId = await clientPortal.memberOf(workspace, who);
    const removed = await community.unenroll(workspace, memberId, [group.id]);
    return removed.length ? `${group.name}: membro removido` : `${group.name}: contato não era membro`;
  }
  // Gives an offer's courses and communities to the contact who bought it (once per invoice).
  async function grantOffer(workspace, offerId, contactId, invoiceId = '') {
    const state = await store.load(workspace);
    const offer = state.offers.find(row => row.id === offerId);
    const contact = state.contacts.find(row => row.id === contactId);
    if (!offer || !contact?.email) throw error('Oferta ou contato não encontrado.',404);
    if (invoiceId && state.invoices.find(row => row.id === invoiceId)?.offerGrantedAt) return { enrolled: true, alreadyGranted: true, emailed: false };
    const { memberId, emailed, added } = await clientPortal.enroll(workspace, state, { email: contact.email, name: contact.name, contactId }, offer.courseIds);
    if (!memberId) throw error('O acesso deste cliente ao portal foi revogado. Reative-o na aba Clientes.',409);
    await community.enroll(workspace, memberId, offer.communityIds);
    await courseAccessChanged(workspace, contact, added, 'granted');
    await offerAccessChanged(workspace, contact, offer.id, 'granted');
    if (invoiceId) await store.change(workspace, current => {
      const invoice = current.invoices.find(row => row.id === invoiceId);
      if (invoice) invoice.offerGrantedAt = new Date().toISOString();
    });
    return { enrolled: true, emailed };
  }
  const ready = Promise.all([store.insert('demo', seed()), store.insert(AGENCY_ID, blankAgency())]);
  ready.catch(() => {});
  const workspaceOwner = id => id === AGENCY_ID ? null : id;
  const listWorkspaces = async agencyId => (await store.list(workspaceOwner(agencyId))).filter(w => spaceId.test(w.id));
  const agencyCache = new Map();
  const AGENCY_CACHE_TTL = 30000;
  const loadAgency = async id => {
    const cached = agencyCache.get(id);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return structuredClone(cached.data);
    const fresh = hydrateAgency(await store.load(id));
    agencyCache.set(id, { data: structuredClone(fresh), expiresAt: now + AGENCY_CACHE_TTL });
    return fresh;
  };
  const changeAgency = async (id, mutate) => {
    agencyCache.delete(id);
    const result = await store.change(id, state => mutate(hydrateAgency(state)));
    agencyCache.delete(id);
    return result;
  };
  async function loadMarketplace() {
    try { return hydrateMarketplace(await store.load(MARKETPLACE_DOC_ID)); }
    catch (e) {
      if (e.status !== 404) throw e;
      await store.insert(MARKETPLACE_DOC_ID, emptyMarketplace());
      return hydrateMarketplace(await store.load(MARKETPLACE_DOC_ID));
    }
  }
  async function changeMarketplace(mutate) {
    await store.insert(MARKETPLACE_DOC_ID, emptyMarketplace());
    return store.change(MARKETPLACE_DOC_ID, doc => mutate(hydrateMarketplace(doc)));
  }
  async function extractStudioSites(assets) {
    const sites = {};
    for (const project of assets.studioProjects || []) {
      try {
        const doc = await store.load(siteRowId(project.id));
        const copy = structuredClone(doc);
        copy.published = false;
        if (copy.stats) copy.stats = { visits: 0, leads: 0 };
        sites[project.id] = copy;
      } catch (e) { if (e.status !== 404) throw e; }
    }
    return sites;
  }
  async function applyStudioSites(snap, studioMap, targetWorkspaceId) {
    if (!snap.studioSites || !studioMap?.size) return;
    for (const [oldId, newId] of studioMap.entries()) {
      const sourceDoc = snap.studioSites[oldId];
      if (!sourceDoc) continue;
      const copy = structuredClone(sourceDoc);
      copy.profile = { name: copy.profile?.name || 'Studio Site' };
      copy.workspace = targetWorkspaceId;
      copy.projectId = newId;
      copy.published = null;
      copy.updatedAt = stamp();
      if (Array.isArray(copy.pages)) copy.pages = copy.pages.map(pg => ({ ...pg, id: uid() }));
      const rowId = siteRowId(newId);
      const inserted = await store.insert(rowId, copy);
      if (!inserted) await store.change(rowId, state => Object.assign(state, copy));
    }
  }
  const logTo = (agency, who, action, target = '', details = '') => {
    agency.audit.push({ id: uid(), at: stamp(), actor: who.name, action, target, details });
    if (agency.audit.length > 1000) agency.audit.splice(0, agency.audit.length - 1000);
  };
  const ensureAccounts = (agency, workspaces) => {
    for (const w of workspaces) {
      agency.accounts[w.id] ??= { status: 'Active', created: w.id === 'demo' ? '' : stamp(), lastLogin: '', plan: '', address: '', phone: '', website: '' };
      if (w.name) agency.accounts[w.id].name = w.name;
    }
  };
  const requestUsers = new WeakMap();
  function verifiedUser(req, res) {
    if (!auth) return null;
    if (!requestUsers.has(req)) {
      requestUsers.set(req, auth.user(req,res).then(user => {
        if (!user) throw error('Entre na sua conta para continuar.',401);
        return accountProfile(user);
      }));
    }
    return requestUsers.get(req);
  }
  async function accessContext(req,session) {
    if (!session && !localAccess) throw error('O login do Supabase ainda não foi configurado.',503);
    const agencyId = !session || session.id === agencyOwnerId ? AGENCY_ID : `agency-${session.id}`;
    let agency;
    try { agency = await loadAgency(agencyId); }
    catch (e) { if (e.status !== 404 || agencyId === AGENCY_ID) throw e; }
    if (!agency) {
      const email = session.email.toLowerCase();
      const invite = await store.findAgency({ users: [{ email, loginEnabled: true }] });
      if (invite) {
        agency = hydrateAgency(invite.state);
        const member = agency.users.find(user => user.loginEnabled && user.email === email);
        const who = { ...userAccess(agency,member.id), agencyId: invite.id, userId: member.id, session, owner: member.role === 'Agency Owner' };
        return { agency, who };
      }
      const initial = blankAgency();
      Object.assign(initial.profile, { name: session.name, email: session.email });
      const [first, ...last] = (session.name === session.email ? '' : session.name).split(/\s+/);
      initial.profile.first = first || 'Responsável';
      initial.profile.last = last.join(' ');
      initial.company.name = 'Minha agência';
      await store.insert(agencyId,initial);
      agency = await loadAgency(agencyId);
    }
    const userId = localAccess ? String(req.headers['x-go-user'] || req.localSocialUser || '') : '';
    const result = userAccess(agency,userId);
    if (!result) throw error('The selected user no longer exists. Choose another user.',403);
    const who = { ...result, agencyId, userId, session, ...(session ? { name: session.name, owner: true } : {}) };
    return { agency, who };
  }
  const access = async (req,res) => (await accessContext(req,await verifiedUser(req,res))).who;
  const canOpenPersonal = (who,id) => Boolean(who.owner && who.session && personalId(who.session) === id);
  const belongsCache = new Map();
  const BELONGS_CACHE_TTL = 60000;
  async function canOpen(who,id) {
    if (privateSpace.test(id)) return canOpenPersonal(who,id);
    if (who.accounts && !who.accounts.includes(id)) return false;
    const cacheKey = `${who.agencyId}:${id}`;
    const cached = belongsCache.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.result;
    const result = await store.belongsToAgency(id,workspaceOwner(who.agencyId));
    belongsCache.set(cacheKey, { result, expiresAt: now + BELONGS_CACHE_TTL });
    return result;
  }
  const pausedError = (lifecycle, showReason = false) => Object.assign(
    error(lifecycle.status === 'Closed' ? 'Esta subconta foi encerrada.' : 'Esta subconta está pausada.', 403),
    { code: 'ACCOUNT_SUSPENDED', account: showReason ? lifecycle : { status: lifecycle.status } }
  );
  async function systemWorkspaceAccess(id, agencyId) {
    const actor = { modules: null };
    if (privateSpace.test(id)) return effectiveAccess({}, actor, id, true);
    const owner = agencyId || (await store.load(id)).agencyId || AGENCY_ID;
    return effectiveAccess(await store.load(owner), actor, id);
  }
  const accountIsActive = async (agencyId, id, module) => {
    const access = await systemWorkspaceAccess(id, agencyId);
    return access.account.status === 'Active' && (!module || hasModule(access, module));
  };
  async function requireActiveAccount(agencyId, id, showReason = false, module) {
    const access = await systemWorkspaceAccess(id, agencyId);
    const lifecycle = access.account;
    if (lifecycle.status !== 'Active') throw pausedError(lifecycle, showReason);
    if (module) requireModule(access, module);
  }
  const mcp = createMcpHandler({ store, change, accountIsActive });
  async function webhookBlockReason(agencyId, id, provider) {
    const access = await systemWorkspaceAccess(id, agencyId);
    if (access.account.status === 'Active') return hasModule(access, 'conversations') ? null : 'MODULE_DISABLED';
    await changeAgency(agencyId, agency => {
      const meta = agency.accounts[id];
      meta.ignoredWebhooks ??= {};
      const prior = meta.ignoredWebhooks[provider];
      meta.ignoredWebhooks[provider] = { count: (prior?.count || 0) + 1, lastAt: stamp() };
    });
    return 'ACCOUNT_SUSPENDED';
  }
  async function publicAccountPolicy(id, write = false, module) {
    const access = await systemWorkspaceAccess(id);
    const lifecycle = access.account;
    if (lifecycle.status === 'Closed') throw Object.assign(error('Este conteúdo está indisponível.', 404), { publicAccount: true });
    if (module && !hasModule(access, module)) throw Object.assign(error('Este conteúdo está indisponível.', 404), { publicAccount: true });
    if (write && lifecycle.status !== 'Active') throw Object.assign(pausedError(lifecycle), { publicAccount: true });
    return lifecycle.status === 'Active';
  }
  async function requireWorkspaceAccess(agency, actor, id, { modules = [], support = false, hide = false, reason = true } = {}) {
    if ((!spaceId.test(id) && !privateSpace.test(id)) || !await canOpen(actor, id)) {
      throw error('Your user cannot open this sub-account.', hide ? 404 : 403);
    }
    const who = effectiveAccess(agency, actor, id, privateSpace.test(id));
    requireModule(who, ...modules);
    if (who.account.status !== 'Active' && !(support && who.support)) throw pausedError(who.account, reason);
    return who;
  }
  async function workspaceAccess(req, res, id, options) {
    const { agency, who } = await accessContext(req, await verifiedUser(req, res));
    return requireWorkspaceAccess(agency, who, id, options);
  }
  async function publicPreview(req, res, url, workspace) {
    if (url.searchParams.get('preview') !== '1') return false;
    await workspaceAccess(req, res, workspace, { modules: ['sites'], hide: true });
    return true;
  }
  async function existingPersonalWorkspace(who) {
    if (!who.owner || !who.session) return;
    const id = personalId(who.session);
    try { return { id, name: (await store.load(id)).profile.name }; }
    catch (e) { if (e.status !== 404) throw e; }
  }
  async function visibleWorkspaces(who) {
    const [workspaces, personalWorkspace] = await Promise.all([listWorkspaces(who.agencyId), existingPersonalWorkspace(who)]);
    const visible = workspaces.filter(w => !who.accounts || who.accounts.includes(w.id));
    return personalWorkspace ? [...visible, personalWorkspace] : visible;
  }
  async function agencyPayload(req, res, extra = {}) {
    const { agency, who } = await accessContext(req,await verifiedUser(req,res));
    requireCapability(who, 'agency', 'Seu usuário não pode abrir a visualização da agência.');
    const [workspaces, personalWorkspace, marketplaceDoc] = await Promise.all([
      listWorkspaces(who.agencyId),
      existingPersonalWorkspace(who),
      loadMarketplace()
    ]);
    ensureAccounts(agency, workspaces);
    const states = await agencyWorkspaceViews(agency, who, workspaces);
    const gateway = await abacate.status(who.agencyId, abacate.AGENCY_SCOPE, publicBase(req));
    return { agency: { ...publicAgency(agency, who), abacatepay: { connected: gateway.connected, storeName: gateway.storeName || '', devMode: Boolean(gateway.devMode) } }, overview: agencyOverview(agency, states), marketplace: publicMarketplaceList(marketplaceDoc, who.agencyId), workspaces, personalWorkspace, access: who,
      features:{prospectingMaps:placesConfigured,prospectingMapsEmbed:mapsEmbedKey}, ...extra };
  }
  // Sub-accounts of a brand group that still belong to the agency and are not closed, with their state.
  async function brandWorkspaces(agency, agencyId, group) {
    const wanted = new Set(group.accountIds);
    const rows = (await listWorkspaces(agencyId)).filter(w => wanted.has(w.id) && agency.accounts?.[w.id]?.status !== 'Closed');
    return Promise.all(rows.map(async w => ({ id: w.id, name: w.name, state: await store.load(w.id) })));
  }
  const agencyWorkspaceViews = (agency, who, workspaces) => Promise.all(workspaces.map(async w => ({
    ...w, ...workspaceView(effectiveAccess(agency, who, w.id), await store.load(w.id))
  })));
  // Reselling: the agency's prices for each sub-account, copied into its wallet so every send can charge locally.
  async function syncWallets(agencyId, workspaces) {
    const agency = await loadAgency(agencyId);
    for (const w of workspaces) await store.change(w.id, s => { setPricing(s, pricingFor(agency, w.id)); });
  }
  // Labs: the agency's mode for each feature, copied into every sub-account.
  async function syncLabs(agencyId, workspaces) {
    const agency = await loadAgency(agencyId);
    for (const w of workspaces) await store.change(w.id, s => { setLabsOffer(s, agency.labs); });
  }
  async function recordAudit(who, action, target, details = '') {
    try { await changeAgency(who.agencyId, agency => logTo(agency, who, action, target, details)); }
    catch { /* Audit entries are best effort and never undo the action itself. */ }
  }
  async function createAccount(who, input) {
    const name = typeof input.name === 'string' ? input.name.trim().slice(0,70) : '';
    if (!name) throw error('O nome da subconta é obrigatório.',400);
    const state = blank(name);
    if (who.agencyId !== AGENCY_ID) state.agencyId = who.agencyId;
    const mail = typeof input.email === 'string' ? input.email.trim().toLowerCase().slice(0,240) : '';
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) throw error('Informe um endereço de e-mail válido.',400);
    Object.assign(state.profile, { email: mail, phone: String(input.phone || '').slice(0,48) });
    if (['America/Sao_Paulo','America/New_York','Europe/London','UTC'].includes(input.timezone)) state.profile.timezone = input.timezone;
    const agency = await loadAgency(who.agencyId);
    if (input.plan) {
      requireCapability(who, 'settings', 'Somente administradores podem atribuir um plano à subconta.');
      if (!agency.plans.some(p => p.id === input.plan)) throw error('Escolha um plano válido.',400);
    }
    const newId = uid();
    let loaded = null;
    const studioMap = new Map();
    if (input.snapshotId || input.templateId) {
      // A setup from the agency library, or a segment template straight from the gallery (like GHL snapshot templates).
      const template = input.templateId ? findMarketplaceSetup(await loadMarketplace(), input.templateId) : null;
      const snap = template?.template ? { id: template.id, name: template.title, assets: template.assets, studioSites: template.studioSites || {} } : agency.snapshots.find(item => item.id === input.snapshotId);
      if (!snap) throw error('Choose a valid snapshot.',400);
      const planned = { ...agency, accounts: { [newId]: { plan: input.plan } } };
      requireSetupModules(effectiveAccess(planned, who, newId), Object.keys(snap.assets || {}));
      loaded = { snap, report: applySnapshot(state, snap, 'skip', studioMap) };
    }
    // Central de IA defaults and the agency's Labs offer start with the new sub-account.
    const aiDefaults = agency.aiDefaults || {};
    state.ai = { ...state.ai, limit: Number(aiDefaults.limit) || 0, alertAt: Number(aiDefaults.alertAt) || 0.8 };
    setAiAccess(state, aiDefaults.enabled !== false);
    setLabsOffer(state, agency.labs);
    await store.insert(newId, state);
    if (loaded) await applyStudioSites(loaded.snap, studioMap, newId);
    if (loaded && input.templateId && loaded.snap.id === input.templateId) await changeMarketplace(doc => recordMarketplaceInstall(doc, input.templateId));
    await changeAgency(who.agencyId, a => {
      a.accounts[newId] = { name, status: 'Active', created: stamp(), lastLogin: '', plan: input.plan || '', address: String(input.address || '').slice(0,240), phone: state.profile.phone, website: '' };
      logTo(a, who, 'Sub-account created', name, loaded ? `Snapshot ${loaded.snap.name}` : '');
      if (loaded) a.snapshotLoads.push({ id: uid(), snapshotId: loaded.snap.id, snapshot: loaded.snap.name, workspace: newId, account: name, at: stamp(), mode: 'skip', ...loaded.report });
    });
    return newId;
  }
  async function appBearer(req) {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i,'');
    if (!/^soci_app_[0-9a-f]{48}$/.test(token)) throw error('Envie o token de instalação do app no cabeçalho Authorization.', 401);
    const digest = appTokenHash(token);
    const match = await store.findAgency({ appInstalls: [{ tokenHash: digest }] });
    if (!match) throw error('Token de app inválido ou o app foi desinstalado.', 401);
    return changeAgency(match.id, agency => {
      const install = (agency.appInstalls || []).find(row => row.tokenHash === digest);
      const app = install && (agency.studioApps || []).find(row => row.id === install.appId);
      if (!install || !app) throw error('Token de app inválido ou o app foi desinstalado.', 401);
      install.lastUsed = stamp();
      return { agencyId: match.id, install: { ...install }, app: { ...app } };
    });
  }
  async function bearer(req, scope) {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i,'');
    if (!token) throw error('Send an API key in the Authorization header.',401);
    const digest = hash(token);
    // A marketplace app's install token: only its own sub-account and the scopes the app declared.
    if (token.startsWith('soci_app_')) {
      const { agencyId, install, app } = await appBearer(req);
      if (!app.scopes.includes(scope)) throw error(`O app ${app.name} não tem a permissão ${scope}.`, 403);
      req.appAccount = install.account;
      return agencyId;
    }
    const matches = await Promise.all([store.findAgency({ apiKeys: [{ hash: digest }] }), store.findAgency({ privateIntegrations: [{ hash: digest }] })]);
    const match = matches.find(Boolean);
    if (!match) throw error('This key is invalid or lacks the required scope.',401);
    const allowed = await changeAgency(match.id, agency => {
      const key = agency.apiKeys.find(k => k.hash === digest) || agency.privateIntegrations.find(k => k.hash === digest);
      if (!key) return false;
      key.lastUsed = stamp();
      return !key.scopes || key.scopes.includes(scope);
    });
    if (!allowed) throw error('This key is invalid or lacks the required scope.',401);
    return match.id;
  }
  // ---- AI Studio sites ----
  async function studioGuard(req, res, workspace) {
    if (!spaceId.test(workspace) && !privateSpace.test(workspace)) throw error('Workspace not found.',404);
    return workspaceAccess(req, res, workspace, { modules: ['sites'] });
  }
  const siteDocCache = new Map();
  const SITE_DOC_CACHE_TTL = 300000;
  async function siteDoc(workspace, projectId, create = true) {
    if (!/^[0-9a-f-]{36}$/.test(String(projectId))) throw error('Project not found.',404);
    const cached = siteDocCache.get(projectId);
    const now = Date.now();
    if (cached && cached.expiresAt > now && cached.doc.workspace === workspace) {
      return structuredClone(cached.doc);
    }
    let doc = await Promise.resolve().then(() => store.load(siteRowId(projectId))).catch(e => { if (e.status === 404) return null; throw e; });
    if (doc && doc.workspace !== workspace) throw error('Project not found.',404);
    if (doc || !create) {
      if (doc) siteDocCache.set(projectId, { doc: structuredClone(doc), expiresAt: now + SITE_DOC_CACHE_TTL });
      return doc;
    }
    const project = (await store.load(workspace)).studioProjects.find(item => item.id === projectId);
    if (!project) throw error('Project not found.',404);
    doc = newSiteDoc({ workspace, project, pages:[{ name:'Home', slug:'index', html:pageFromStructure(project) }] });
    await store.insert(siteRowId(projectId), doc);
    const loaded = await store.load(siteRowId(projectId));
    siteDocCache.set(projectId, { doc: structuredClone(loaded), expiresAt: now + SITE_DOC_CACHE_TTL });
    return loaded;
  }
  const changeSite = async (projectId, mutate) => {
    siteDocCache.delete(projectId);
    const result = await store.change(siteRowId(projectId), mutate);
    siteDocCache.delete(projectId);
    return result;
  };
  const syncMeta = (workspace, projectId, doc) => change(workspace,{ type:'studio-meta', id:projectId, data:{
    pages:doc.pages.map(({ id:pageId, name, slug }) => ({ id:pageId, name, slug })), rev:doc.rev,
    publishedAt:doc.published?.at || '', publishedRev:doc.published?.rev || 0 } });
  async function studioRequest(workspace, op, input, session) {
    const project = (await store.load(workspace)).studioProjects.find(item => item.id === input.id);
    if (!project) throw error('Project not found.',404);
    const doc = await siteDoc(workspace, project.id);
    const text = (value, label, limit) => { const v = typeof value === 'string' ? value.trim() : ''; if (!v) throw error(`${label} is required.`,400); if (v.length > limit) throw error(`${label} can have up to ${limit} characters.`,400); return v; };
    if (op === 'save') return changeSite(project.id, d => savePage(d, input.pageId, input.html, typeof input.label === 'string' ? input.label : 'Saved'));
    if (op === 'revise') {
      const instruction = text(input.instruction,'Request',2000);
      const selection = typeof input.selection === 'string' ? input.selection.slice(0,8000) : '';
      const page = findPage(doc, input.pageId);
      const revised = await revisePage(await openAI.requireConnection(session), { html:page.html, instruction, selection });
      const before = doc.versions.at(-1)?.id || '';
      await changeSite(project.id, d => { savePage(d, page.id, revised.html, `AI: ${instruction}`); return chatEntry(d, { ask:instruction, reply:revised.change, before, page:page.name }); });
      return { change: revised.change };
    }
    if (op === 'page') {
      if (input.action === 'add') {
        const name = text(input.name,'Page name',60);
        const description = typeof input.description === 'string' ? input.description.trim().slice(0,1500) : '';
        const home = doc.pages.find(item => item.slug === 'index') || doc.pages[0];
        const design = project.design ? validDesign(project.design) : null;
        const role = /obrigad|thank/i.test(`${name} ${input.slug || ''}`) ? 'thanks' : /contato|contact/i.test(name) ? 'contact' : 'page';
        const html = input.ai ? (await generatePage(await openAI.requireConnection(session), { name, description, home:home.html, slugs:doc.pages.map(item => item.slug), design })).html
          : design ? designedPage({ siteName:project.name, page:{ name, slug:input.slug || '', purpose:description }, design, role, summary:project.summary })
          : pageFromStructure({ ...project, blocks:[], summary:description }, name);
        const pageId = await changeSite(project.id, d => addPage(d, name, html));
        if (typeof input.slug === 'string' && input.slug.trim()) await changeSite(project.id, d => setSlug(d, pageId, input.slug));
        return pageId;
      }
      if (input.action === 'rename') return changeSite(project.id, d => renamePage(d, input.pageId, input.name));
      if (input.action === 'duplicate') return changeSite(project.id, d => duplicatePage(d, input.pageId));
      if (input.action === 'move') return changeSite(project.id, d => movePage(d, input.pageId, input.direction === 'up' ? 'up' : 'down'));
      if (input.action === 'slug') return changeSite(project.id, d => setSlug(d, input.pageId, input.slug));
      if (input.action === 'delete') return changeSite(project.id, d => deletePage(d, input.pageId));
      throw error('Choose a valid page action.',400);
    }
    if (op === 'restore') return changeSite(project.id, d => restoreVersion(d, input.versionId));
    if (op === 'note') return changeSite(project.id, d => chatEntry(d, { ask:text(input.ask,'Pedido',4000), reply:text(input.reply,'Resposta',4000), before:'' }));
    if (op === 'chat-undo') {
      return changeSite(project.id, d => {
        const entry = (d.chat || []).find(item => item.id === input.entryId);
        if (!entry?.before) throw error('Esta mensagem não tem uma alteração para desfazer.',400);
        if (entry.undone) throw error('Esta alteração já foi desfeita.',409);
        restoreVersion(d, entry.before);
        entry.undone = new Date().toISOString();
        return entry.id;
      });
    }
    if (op === 'seo') return changeSite(project.id, d => setSeo(d, input.pageId, input));
    if (op === 'seo-ai') {
      const page = findPage(doc, input.pageId);
      const seo = await suggestSeo(await openAI.requireConnection(session), { name:page.name, html:page.html });
      await changeSite(project.id, d => setSeo(d, page.id, seo));
      return seo;
    }
    if (op === 'stats-reset') return changeSite(project.id, d => resetStats(d));
    if (op === 'publish') {
      if (input.publish) {
        const state = await store.load(workspace);
        const form = project.formId && state.forms.find(item => item.id === project.formId);
        if (form) { if (!form.active) await change(workspace,{ type:'save', key:'forms', id:form.id, data:{ ...form, active:true } }); }
        else {
          const created = await change(workspace,{ type:'save', key:'forms', data:{ name:`${project.name} · AI Studio`, description:'Leads from the published AI Studio site.', askPhone:true, active:true } });
          await change(workspace,{ type:'studio-meta', id:project.id, data:{ formId:created.id } });
        }
      }
      return changeSite(project.id, d => publish(d, Boolean(input.publish)));
    }
    throw error('Unknown AI Studio request.',404);
  }
  // Every field of a public form post, keeping repeated keys (checkboxes, multiple choice) as lists.
  async function formBody(req) {
    if (!/^application\/x-www-form-urlencoded/i.test(req.headers['content-type'] || '')) throw error('Envie os campos do formulário.',415);
    let size = 0; const chunks = [];
    for await (const part of req) { size += part.length; if (size > 60000) throw error('Formulário muito longo.',413); chunks.push(part); }
    const params = new URLSearchParams(Buffer.concat(chunks).toString('utf8')), out = {};
    for (const key of new Set(params.keys())) { if (key.length > 60) continue; const all = params.getAll(key).slice(0,50).map(v => v.slice(0,5000)); out[key] = all.length > 1 ? all : all[0]; }
    return out;
  }
  async function formFields(req) {
    if (!/^application\/x-www-form-urlencoded/i.test(req.headers['content-type'] || '')) throw error('Send the form fields.',415);
    let size = 0; const chunks = [];
    for await (const part of req) { size += part.length; if (size > 20000) throw error('Request is too large.',413); chunks.push(part); }
    const params = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    return Object.fromEntries(['name','email','phone','_page'].map(key => [key, (params.get(key) || '').slice(0,240)]));
  }
  async function findProspects(who,input) {
    const agency = await loadAgency(who.agencyId);
    const agent = input.agent ? agency.prospecting.agents.find(row => row.id === input.agent) : null;
    if (input.agent && !agent) throw error('Agente não encontrado.',404);
    const term = typeof input.keyword === 'string' ? input.keyword.trim().slice(0,120) : '';
    const keywords = agent?.niches || (term ? [term] : []);
    const location = agent?.location || (typeof input.location === 'string' ? input.location.trim().slice(0,140) : '');
    const radius = agent?.radius || ([2,5,10,20,30].includes(Number(input.radius)) ? Number(input.radius) : 5);
    if (!keywords.length || !location) throw error('Informe a empresa ou nicho e a região.',400);
    const saved = new Map(agency.prospects.filter(row => row.placeId).map(row => [row.placeId,row.id]));
    if (!placesConfigured) {
      const { center,rows } = await osmSearch(keywords,location,radius);
      return { provider:'osm',center,radius,rows:rows.map(row => ({...row,saved:saved.get(row.placeId) || ''})) };
    }
    const results = await placesSearch(keywords,location,radius);
    const items = new Map(results.map(row => [row.placeId,row]));
    return { provider:'maps',rows:[...items.values()].slice(0,20).map(row => ({...row,saved:saved.get(row.placeId) || ''})) };
  }

  async function transferProspects(who,input) {
    const workspace = typeof input.workspace === 'string' ? input.workspace : '';
    if (!spaceId.test(workspace)) throw error('Escolha uma subconta à qual você tem acesso.',400);
    await requireWorkspaceAccess(await loadAgency(who.agencyId), who, workspace, {
      modules: input.opportunity === true ? ['contacts', 'opportunities'] : ['contacts']
    });
    const ids = Array.isArray(input.ids) ? [...new Set(input.ids.slice(0,100))] : [];
    if (!ids.length) throw error('Selecione pelo menos um prospect.',400);
    const agency = await loadAgency(who.agencyId);
    const prospects = ids.map(id => agency.prospects.find(row => row.id === id && !row.archived));
    if (prospects.some(row => !row)) throw error('Um dos prospects não está disponível para envio.',404);
    const imported = await store.change(workspace,state => receiveProspects(state,prospects,{opportunity:input.opportunity === true}));
    const at = stamp();
    await changeAgency(who.agencyId, current => {
      for (const item of imported) {
        const row = current.prospects.find(prospect => prospect.id === item.id);
        if (row) row.transfers[workspace] = { contact:item.contact,opportunity:item.opportunity,at:row.transfers[workspace]?.at || at };
      }
      logTo(current,who,'Prospects sent to CRM',workspace,`${imported.length} prospect(s)`);
    });
    return imported;
  }

  async function agencyRequest(op, who, input) {
    if (op === 'prospecting-search') return findProspects(who,input);
    if (op === 'prospecting-transfer') return transferProspects(who,input);
    if (op === 'prospecting-action') {
      if (['brand','sections','widget'].includes(input.op)) requireCapability(who, 'settings', 'Somente administradores podem alterar essas configurações.');
      const data = input.data && typeof input.data === 'object' && !Array.isArray(input.data) ? input.data : {};
      const apply = (command,trusted) => changeAgency(who.agencyId, agency => {
        const result = runProspectingAction(agency,command,trusted);
        logTo(agency,who,`Prospecting: ${command.op}`,typeof command.id === 'string' ? command.id : '');
        return result;
      });
      // The automated audit reaches the network, so it runs outside the agency write and is applied afterwards.
      const audited = async (id,manual = {}) => {
        const row = (await loadAgency(who.agencyId)).prospects.find(item => item.id === id);
        if (!row) throw error('Registro não encontrado.',404);
        const audit = await prospectAudit({ ...row }).catch(() => null);
        return apply({ op:'audit',id,data:manual },{ audit });
      };
      if (input.op === 'audit' && typeof input.id === 'string') return audited(input.id,data);
      if (input.op === 'save-maps' && Array.isArray(data.placeIds) && data.placeIds.some(id => typeof id === 'string' && id.startsWith('osm-'))) {
        // OpenStreetMap details are re-read here so the saved prospect never trusts client-supplied fields.
        const ids = data.placeIds.filter(id => typeof id === 'string' && id.startsWith('osm-')).slice(0,20);
        return apply({ ...input,data },{ places:await osmLookup(ids) });
      }
      if (input.op === 'save' && !input.id && [true,'true','on'].includes(data.audit)) {
        const id = await apply({ ...input,data:{ ...data,audit:false } });
        await audited(id);
        return id;
      }
      return apply({ ...input,data });
    }
    if (op === 'subaccount-wallet') {
      requireCapability(who, 'settings', 'Seu usuário não pode lançar créditos nas carteiras.');
      const workspace = String(input.workspace || '');
      if (!(await listWorkspaces(who.agencyId)).some(w => w.id === workspace)) throw error('Subconta não encontrada.', 404);
      const kind = input.kind === 'debit' ? 'debit' : 'credit';
      const balance = await store.change(workspace, s => walletAdjust(s, { kind, amount: input.amount, note: input.note, by: who.name, method: 'Lançamento da agência' }));
      await recordAudit(who, kind === 'credit' ? 'Crédito lançado na carteira' : 'Débito lançado na carteira', workspace, `R$ ${Number(input.amount).toFixed(2)}`);
      flushLater(workspace);
      return balance;
    }
    if (op === 'action') {
      const workspaces = await listWorkspaces(who.agencyId);
      const shareCode = input.type === 'snapshot-import' && typeof input.data?.code === 'string' ? input.data.code.trim().toLowerCase() : '';
      const shared = /^[0-9a-f]{12}$/.test(shareCode) ? await store.findAgency({ snapshots: [{ shareCode, shared: true }] }) : null;
      const sharedSnapshot = shared?.state.snapshots.find(item => item.shareCode === shareCode && item.shared);
      const outcome = await changeAgency(who.agencyId, agency => {
        const currentActor = userAccess(agency, who.userId);
        if (!currentActor) throw error('The selected user no longer exists.',403);
        requireCapability(currentActor, 'agency', 'Your user cannot open the agency view.');
        requireAgencyCommand(currentActor, input, agency);
        if (sharedSnapshot) requireSetupModules(currentActor, Object.keys(sharedSnapshot.assets || {}));
        ensureAccounts(agency, workspaces);
        const result = executeAgency(agency, input, { accountIds: workspaces.map(w => w.id), actor: who.name, sharedSnapshot });
        if (who.session && input.type === 'save' && input.key === 'users') {
          agency.users.find(user => user.id === result).loginEnabled = true;
        }
        return result;
      });
      // Reselling prices are copied into each sub-account's wallet.
      if (['saas-rebilling', 'rebill-account'].includes(input.type)) await syncWallets(who.agencyId, workspaces);
      if (input.type === 'labs') await syncLabs(who.agencyId, workspaces);
      // An edited app reaches the sub-accounts where it is installed (new actions, triggers, events, link).
      if (input.type === 'studio-app-save') {
        const agency = await loadAgency(who.agencyId), app = agency.studioApps.find(row => row.id === outcome);
        for (const install of (agency.appInstalls || []).filter(row => row.appId === outcome)) {
          await change(install.account, { type: 'app-installed', data: { copy: installedCopy(app, install) } });
        }
      }
      return outcome;
    }
    // App Studio: the signing secret of one app, for the agency's developers to check the deliveries.
    if (op === 'studio-app-secret') {
      requireCapability(who, 'settings', 'Seu usuário não pode ver o segredo dos apps.');
      const agency = await loadAgency(who.agencyId);
      const app = (agency.studioApps || []).find(row => row.id === String(input.id || '')) || (() => { throw error('App não encontrado.', 404); })();
      await recordAudit(who, 'Segredo de assinatura do app consultado', app.name);
      return { secret: appSecret(appSigningKey, who.agencyId, app), version: app.secretVersion || 1 };
    }
    // Central de IA: usage over a period, and the agency's limit and switch for each sub-account.
    if (op === 'ai-usage') {
      const workspaces = await listWorkspaces(who.agencyId);
      const rows = await Promise.all(workspaces.map(async w => ({ id: w.id, name: w.name, ai: (await store.load(w.id)).ai })));
      return agencyAiUsage(rows, String(input.period || '30'));
    }
    if (['ai-limit', 'ai-access', 'ai-apply-defaults'].includes(op)) {
      requireCapability(who, 'settings', 'Seu usuário não pode mudar os limites de IA das subcontas.');
      const workspaces = await listWorkspaces(who.agencyId);
      if (op === 'ai-apply-defaults') {
        const { limit = 0, alertAt = 0.8 } = (await loadAgency(who.agencyId)).aiDefaults || {};
        const all = input.scope === 'all';
        let changed = 0;
        for (const w of workspaces) {
          const done = await store.change(w.id, s => {
            if (!all && Number(s.ai?.limit) > 0) return false;
            setAiLimit(s, { limit, alertAt });
            return true;
          });
          if (done) changed += 1;
        }
        await recordAudit(who, 'Limite padrão de IA aplicado', all ? 'Todas as subcontas' : 'Subcontas sem limite', `US$ ${Number(limit).toFixed(2)} em ${changed} subconta(s)`);
        return changed;
      }
      const workspace = workspaces.find(w => w.id === String(input.workspace || ''));
      if (!workspace) throw error('Subconta não encontrada.', 404);
      if (op === 'ai-limit') {
        const usage = await store.change(workspace.id, s => setAiLimit(s, input));
        await recordAudit(who, 'Limite de IA alterado', workspace.name, usage.limit ? `US$ ${usage.limit.toFixed(2)} por mês, alerta em ${Math.round((Number(input.alertAt) || 0.8) * 100)}%` : 'Sem limite');
        return usage.limit;
      }
      const on = input.on === true || input.on === 'true';
      await store.change(workspace.id, s => setAiAccess(s, on));
      await recordAudit(who, on ? 'IA ligada na subconta' : 'IA desligada na subconta', workspace.name);
      return on;
    }
    if (op === 'brand-group-report') {
      const agency = await loadAgency(who.agencyId);
      const group = agency.brandGroups?.find(row => row.id === input.id);
      if (!group) throw error('Grupo de marcas não encontrado.',404);
      return brandGroupData(group, await brandWorkspaces(agency, who.agencyId, group));
    }
    if (op === 'accounts') return createAccount(who, input);
    if (op === 'snapshot-create' || op === 'snapshot-refresh') {
      const agency = await loadAgency(who.agencyId);
      const prior = op === 'snapshot-refresh' ? agency.snapshots.find(s => s.id === input.id) : null;
      if (op === 'snapshot-refresh' && !prior) throw error('Snapshot not found.',404);
      if (prior && prior.kind !== 'mine') throw error('Only your own snapshots can be refreshed from their source.',400);
      const source = prior ? prior.workspace : input.workspace;
      if (!(await listWorkspaces(who.agencyId)).some(w => w.id === source)) throw error('Choose a valid source sub-account.',400);
      const sourceAccess = await requireWorkspaceAccess(agency, who, source);
      const include = prior ? prior.include : Array.isArray(input.include) && input.include.length ? input.include.filter(k => snapshotAssets.some(a => a[0] === k)) : snapshotAssets.map(a => a[0]);
      if (!include.length) throw error('Choose at least one asset type.',400);
      requireSetupModules(sourceAccess, include);
      const name = prior ? prior.name : String(input.name || '').trim().slice(0,100);
      if (!name) throw error('Snapshot name is required.',400);
      const { assets, counts } = extractSnapshot(await store.load(source), include);
      const studioSites = await extractStudioSites(assets);
      return changeAgency(who.agencyId, a => {
        if (prior) {
          const snap = a.snapshots.find(s => s.id === prior.id);
          Object.assign(snap, { assets, studioSites, counts, updated: stamp(), version: (snap.version || 1) + 1 });
          logTo(a, who, 'Snapshot refreshed', snap.name, `Version ${snap.version}`);
          return snap.id;
        }
        if (a.snapshots.length >= 50) throw error('You can keep up to 50 snapshots.',400);
        const snap = { id: uid(), name, kind: 'mine', workspace: source, include, assets, studioSites, counts, version: 1, created: stamp(), updated: stamp(), shareCode: '', shared: false };
        a.snapshots.push(snap);
        logTo(a, who, 'Snapshot created', name);
        return snap.id;
      });
    }
    if (op === 'snapshot-preview') {
      // Conflict check before a load: nothing is written.
      const agency = await loadAgency(who.agencyId);
      const snap = agency.snapshots.find(s => s.id === input.id);
      if (!snap) throw error('Snapshot not found.',404);
      const targets = Array.isArray(input.workspaces) ? (await listWorkspaces(who.agencyId)).filter(w => input.workspaces.includes(w.id)) : [];
      if (!targets.length) throw error('Choose at least one sub-account.',400);
      const { items } = loadChoices(input);
      const out = [];
      for (const target of targets) {
        await requireWorkspaceAccess(agency, who, target.id);
        const categories = previewSnapshot(await store.load(target.id), snap, items);
        // A protected setup reveals counts, never record names.
        out.push({ workspace: target.id, account: target.name, categories: snap.protected ? categories.map(({ conflicts, ...c }) => ({ ...c, conflicts: conflicts.map(() => '') })) : categories });
      }
      return out;
    }
    if (op === 'snapshot-load') {
      const agency = await loadAgency(who.agencyId);
      const snap = agency.snapshots.find(s => s.id === input.id);
      if (!snap) throw error('Snapshot not found.',404);
      const targets = Array.isArray(input.workspaces) ? (await listWorkspaces(who.agencyId)).filter(w => input.workspaces.includes(w.id)) : [];
      if (!targets.length) throw error('Choose at least one sub-account.',400);
      for (const target of targets) {
        const targetAccess = await requireWorkspaceAccess(agency, who, target.id);
        requireSetupModules(targetAccess, Object.keys(snap.assets || {}));
      }
      const mode = input.mode === 'overwrite' ? 'overwrite' : 'skip';
      const { items, modes } = loadChoices(input);
      const loads = [];
      for (const target of targets) {
        const studioMap = new Map();
        const report = await store.change(target.id, state => applySnapshot(state, snap, mode, studioMap, { items, modes }));
        await applyStudioSites(snap, studioMap, target.id);
        loads.push({ id: uid(), snapshotId: snap.id, snapshot: snap.name, workspace: target.id, account: target.name, at: stamp(), mode,
          ...(items ? { partial: true } : {}), ...(Object.keys(modes).length ? { modes } : {}), ...report });
      }
      await changeAgency(who.agencyId, a => {
        a.snapshotLoads.push(...loads);
        if (a.snapshotLoads.length > 500) a.snapshotLoads.splice(0, a.snapshotLoads.length - 500);
        logTo(a, who, 'Snapshot loaded', snap.name, targets.map(t => t.name).join(', '));
      });
      return loads;
    }
    if (op === 'marketplace-publish') {
      const agency = await loadAgency(who.agencyId);
      const snap = agency.snapshots.find(s => s.id === input.snapshotId && s.kind === 'mine');
      if (!snap) throw error('Escolha um setup criado pela sua agência para publicar.',400);
      requireSetupModules(who, Object.keys(snap.assets || {}));
      const author = agency.company?.name || who.name || 'Agência da comunidade';
      const { listing, updated } = await changeMarketplace(doc => publishToMarketplace(doc, {
        agencyId: who.agencyId, author, snap, studioSites: snap.studioSites || {}, input
      }));
      await changeAgency(who.agencyId, a => {
        const localSnap = a.snapshots.find(s => s.id === snap.id);
        if (localSnap) {
          Object.assign(localSnap, {
            published: true,
            marketplaceId: listing.id,
            publishedVersion: listing.version,
            marketplaceCategory: listing.category,
          ...(listing.segment ? { marketplaceSegment: listing.segment } : {}),
            marketplaceSummary: listing.summary,
            marketplaceDescription: listing.description,
            marketplaceTags: listing.tags
          });
        }
        logTo(a, who, updated ? 'Setup updated on marketplace' : 'Setup published to marketplace', listing.title, `v${listing.version}`);
      });
      return { listingId: listing.id, updated };
    }
    if (op === 'marketplace-unpublish') {
      const removed = await changeMarketplace(doc => unpublishFromMarketplace(doc, { agencyId: who.agencyId, listingId: input.id }));
      await changeAgency(who.agencyId, a => {
        for (const s of a.snapshots) {
          if (s.marketplaceId === removed.id) {
            s.published = false;
            s.marketplaceId = '';
          }
        }
        logTo(a, who, 'Setup unpublished from marketplace', removed.title);
      });
      return removed.id;
    }
    if (op === 'setup-templates') return templateGallery(await loadMarketplace());
    if (op === 'marketplace-install') {
      const listing = findMarketplaceSetup(await loadMarketplace(), input.id);
      if (!listing) throw error('Setup não encontrado no marketplace.',404);
      const copy = await changeAgency(who.agencyId, a => {
        if (a.snapshots.length >= 50) throw error('Você atingiu o limite de 50 setups salvos na agência.',400);
        const snap = {
          id: uid(),
          name: listing.title,
          kind: 'marketplace',
          workspace: '',
          include: Object.keys(listing.assets || {}),
          assets: structuredClone(listing.assets || {}),
          studioSites: structuredClone(listing.studioSites || {}),
          counts: structuredClone(listing.counts || {}),
          version: listing.version || 1,
          created: stamp(),
          updated: stamp(),
          shareCode: '',
          shared: false,
          marketplaceId: listing.id,
          marketplaceAuthor: listing.author,
          marketplaceCategory: listing.category,
          official: Boolean(listing.official)
        };
        a.snapshots.push(snap);
        logTo(a, who, 'Setup installed from marketplace', listing.title, listing.author);
        return { snapshotId: snap.id, name: snap.name };
      });
      await changeMarketplace(doc => recordMarketplaceInstall(doc, listing.id));
      return copy;
    }
    if (op === 'template-install') {
      const agency = await loadAgency(who.agencyId);
      const template = catalogTemplate(input.template, agency);
      const target = (await listWorkspaces(who.agencyId)).find(w => w.id === input.workspace);
      if (!target) throw error('Choose a valid sub-account.',400);
      await requireWorkspaceAccess(agency, who, target.id, { modules: ['sites'] });
      const page = await store.change(target.id, state => installTemplate(state, template));
      await changeAgency(who.agencyId, a => {
        a.templateInstalls.push({ id: uid(), template: template.id, name: template.name, workspace: target.id, account: target.name, at: stamp() });
        logTo(a, who, 'Template installed', template.name, target.name);
      });
      return { workspace: target.id, page };
    }
    if (op === 'prospect-convert') {
      const prospect = (await loadAgency(who.agencyId)).prospects.find(r => r.id === input.id);
      if (!prospect) throw error('Prospect not found.',404);
      if (prospect.workspace) throw error('This prospect already has a sub-account.',400);
      const newId = await createAccount(who, { name: prospect.name, email: prospect.email, phone: prospect.phone, address: prospect.city, snapshotId: input.snapshotId || '' });
      await changeAgency(who.agencyId, a => { const row = a.prospects.find(r => r.id === input.id); if (row) Object.assign(row, { workspace: newId, status: 'Won' }); });
      return newId;
    }
    throw error('Unknown agency request.',404);
  }
  function change(id,command,who) {
    const scope = requestScope.getStore();
    const affiliate = !who && scope?.public ? scope.refs[id] || null : null;
    // Visitor actions on landing pages and the public store/chat/webinar/offer APIs carry the visit's source.
    const attribution = !who && scope?.attribute ? scope.touches[id] || {} : null;
    return store.change(id, state => {
      if (who) requireRecordEffects(who, state, command);
      const result = execute(state, command, { workspace: id, affiliate, attribution });
      return { id:result, state };
    });
  }
  // ---- Social Planner: OAuth secrets, scheduler and media ------------------------------------
  const socialRow = async rowId => {
    try { return await store.load(rowId); }
    // Supabase derives a NOT NULL name column from profile.name, so secret rows carry one too.
    catch { await store.insert(rowId, { profile:{ name:'Social Planner' }, tokens:{}, pending:{}, states:{} }); return store.load(rowId); }
  };
  const socialSecrets = async (workspace, mutate) => { await socialRow(`social-${workspace}`); return store.change(`social-${workspace}`, mutate); };
  const publicBase = req => process.env.SOCIAL_PUBLIC_URL || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers['x-forwarded-host'] || req.headers.host}`;
  // Documentos e contratos: signing links by e-mail/WhatsApp, and a per-IP limit on the public signing API.
  // Serviços de e-mail: the sub-account's verified sending domain, or '' to send from the platform address.
  const sendingAddress = async workspace => { try { return workspaceSender(await store.load(`email-${workspace}`)); } catch { return ''; } };
  const signHits = new Map(), testHits = new Map(), countdownCache = new Map(), trackingHits = new Map();
  // Tracking events: up to 300 per connection every 10 minutes.
  const allowTracking = ip => {
    const at = Date.now(), hit = trackingHits.get(ip);
    if (!hit || hit.reset < at) { if (trackingHits.size > 5000) trackingHits.clear(); trackingHits.set(ip, { count: 1, reset: at + 600000 }); return true; }
    return ++hit.count <= 300;
  };
  // The sub-account's pixels (GA4, Tag Manager, Meta) on a public page: the loader tag and a CSP that allows them.
  const withPixels = (state, workspace, headers, body) => {
    if (!hasPixels(state?.tracking) || typeof body !== 'string') return [headers, body];
    return [{ ...headers, 'Content-Security-Policy': widenCsp(headers['Content-Security-Policy']) }, injectPixels(body, workspace)];
  };
  const allowSign = ip => {
    const at = Date.now(), hit = signHits.get(ip);
    if (!hit || hit.reset < at) { if (signHits.size > 5000) signHits.clear(); signHits.set(ip, { count: 1, reset: at + 600000 }); return true; }
    return ++hit.count <= 120;
  };
  const callbackPath = provider => `/api/social/callback/${provider === 'instagram' ? 'facebook' : provider}`;
  const validateInvite = (row, key) => {
    const invite = row.invite;
    if (!key || invite?.hash !== key || invite.expires <= Date.now()) throw error('Este convite expirou ou foi revogado.',404);
    return invite;
  };
  const validateApproval = (row, key) => {
    const link = row.approval;
    if (!key || link?.hash !== key || link.expires <= Date.now()) throw error('Este link de aprovação expirou ou foi revogado.',404);
    return link;
  };
  // What the client sees on the approval page: posts waiting for review, with media inlined so Mídia
  // Drive images (private until published) can be shown without opening the file route.
  const approvalView = state => {
    const zone = state.profile?.timezone || 'America/Sao_Paulo';
    const posts = state.socialPosts.filter(post => post.status === 'in_review')
      .sort((a, b) => (a.scheduleDate || a.created || '').localeCompare(b.scheduleDate || b.created || '')).slice(0, 40)
      .map(post => ({ id: post.id, type: post.type, summary: post.summary, link: post.link || '', firstComment: post.firstComment || '', scheduleDate: post.scheduleDate || '',
        overrides: Object.entries(post.overrides || {}).map(([provider, text]) => ({ network: network(provider)?.name || provider, text })),
        accounts: post.accountIds.map(accountId => state.socialAccounts.find(a => a.id === accountId)).filter(Boolean)
          .map(a => ({ name: a.name, provider: a.provider, network: network(a.provider)?.name || a.provider })),
        media: (post.media || []).slice(0, 6).map(m => ({ type: m.type || 'image',
          src: m.fileId ? state.files.find(f => f.id === m.fileId)?.data || '' : m.url })).filter(m => m.src) }));
    const reviewed = state.socialPosts.filter(post => /\(cliente\)$/.test(post.reviewedBy || '') && Date.parse(post.updated || 0) > Date.now() - 14 * 86_400_000)
      .map(post => ({ id: post.id, summary: String(post.summary || '').slice(0, 140), approval: post.approval, by: post.reviewedBy.replace(/ \(cliente\)$/, ''), note: post.reviewNote || '', at: post.updated }))
      .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20);
    return { brand: state.profile?.name || '', zone, posts, reviewed };
  };
  const socialActor = who => who.session?.id || who.userId || 'local-owner';
  async function startSocialOAuth(req, workspace, provider, inviteKey = '', actor = null) {
    const nonce = uid();
    const target = authUrl(provider, { redirectUri: publicBase(req) + callbackPath(provider), state: nonce });
    await socialRow('social-oauth');
    await store.change('social-oauth', row => {
      for (const [k, v] of Object.entries(row.states)) if (Date.parse(v.at) < Date.now() - 15 * 60_000) delete row.states[k];
      row.states[nonce] = { workspace, provider, at: stamp(), inviteKey, actor };
    });
    return target;
  }
  async function inviteAttach(workspace, key, chosen) {
    validateInvite(await store.load(`social-${workspace}`), key);
    await publicAccountPolicy(workspace, true, 'marketing');
    const ids = await store.change(workspace, s => {
      const fresh = chosen.filter(x => !s.socialAccounts.some(a => a.provider === x.provider && a.externalId === x.externalId));
      if (fresh.length !== chosen.length) throw error('Uma das contas já está conectada. Selecione somente novas contas.',409);
      return attachAccounts(s, fresh, { uid, now: stamp });
    });
    await socialSecrets(workspace, row => ids.forEach((id, n) => { row.tokens[id] = seal(chosen[n].secret); }));
    if (chosen.some(row => ['facebook', 'instagram'].includes(row.provider))) await routeMetaAccounts(workspace).catch(problem => console.error(`Meta routes (${workspace}): ${problem.message}`));
    return { connected: ids.length };
  }
  const fileBytes = data => { const [, mime, b64] = String(data).match(/^data:([^;]+);base64,(.*)$/) || []; return { mime, bytes: Buffer.from(b64 || '', 'base64') }; };
  const socialMedia = (state, workspace, base, post) => (post.media || []).map(m => {
    if (m.fileId) {
      const file = state.files.find(f => f.id === m.fileId);
      if (!file) throw error('Uma imagem do post foi removida do Mídia Drive.',400);
      const { mime, bytes } = fileBytes(file.data);
      return { ...m, mime, url: `${base}/m/${workspace}/${m.fileId}`, bytes: async () => bytes };
    }
    return { ...m, bytes: async () => { const r = await fetch(m.url, { signal: AbortSignal.timeout(120_000) }); if (!r.ok) throw error(`Não foi possível baixar a mídia (${r.status}).`,502); return Buffer.from(await r.arrayBuffer()); } };
  });
  async function checkFeeds(workspace, agencyId, at) {
    const state = await store.load(workspace);
    const stale = state.socialFeeds.filter(f => f.active && Date.parse(f.lastChecked || 0) < at - 30 * 60_000);
    for (const feed of stale) {
      if (!await accountIsActive(agencyId, workspace, 'marketing')) return;
      let items = [], problem = '';
      try {
        const r = await fetch(feed.url, { signal: AbortSignal.timeout(20_000), headers: { Accept: 'application/rss+xml, application/atom+xml, text/xml' } });
        if (!r.ok) throw Error(`HTTP ${r.status}`);
        items = parseFeed((await r.text()).slice(0, 2_000_000));
      } catch (e) { problem = `Não foi possível ler o feed: ${e.message}`.slice(0, 200); }
      if (!await accountIsActive(agencyId, workspace, 'marketing')) return;
      await store.change(workspace, s => {
        const row = s.socialFeeds.find(f => f.id === feed.id); if (!row) return;
        row.lastChecked = new Date(at).toISOString(); row.error = problem; if (problem) return;
        const made = feedPosts(s, row, items, { at, uid, now: stamp });
        if (made.length) row.lastItemAt = stamp();
      });
    }
  }
  async function runSocial(workspace, base, at = Date.now()) {
    let state = await store.load(workspace);
    if (!state.socialFeeds?.length && !state.socialAccounts?.length) return 0;
    const agencyId = state.agencyId || AGENCY_ID;
    if (!await accountIsActive(agencyId, workspace, 'marketing')) return 0;
    if (state.socialFeeds?.length) {
      await checkFeeds(workspace, agencyId, at).catch(e => console.error(e.message));
      if (!await accountIsActive(agencyId, workspace, 'marketing')) return 0;
    }
    if (!state.socialAccounts?.length) return 0;
    // Pages and Instagram accounts connected before Messenger/Direct existed get their webhook route here, once.
    const metaAccounts = state.socialAccounts.filter(row => ['facebook', 'instagram'].includes(row.provider));
    if (metaAccounts.length && !privateSpace.test(workspace)) {
      const routes = (await metaRoutesRow().catch(() => null))?.routes || {};
      if (metaAccounts.some(row => !routes[row.externalId])) await routeMetaAccounts(workspace).catch(problem => console.error(`Meta routes (${workspace}): ${problem.message}`));
    }
    const due = await store.change(workspace, s => {
      for (const copy of evergreenDue(s, new Date(at), s.profile.timezone)) s.socialPosts.push({ ...copy, id: uid(), created: stamp() });
      return claimDue(s, at);
    });
    if (!due.length) return 0;
    state = await store.load(workspace);
    const secrets = await socialRow(`social-${workspace}`);
    const refreshed = {}, broken = {};
    let completed = 0;
    for (const post of due) {
      if (!await accountIsActive(agencyId, workspace, 'marketing')) {
        const pending = new Map(due.slice(completed).map(row => [row.id, row.claimedAt]));
        await store.change(workspace, current => {
          for (const row of current.socialPosts) {
            if (row.status === 'in_progress' && pending.get(row.id) === row.claimedAt && pending.has(row.id)) {
              row.status = 'scheduled';
              delete row.claimedAt;
            }
          }
        });
        break;
      }
      const results = [];
      let media = [];
      try { media = socialMedia(state, workspace, base, post); }
      catch (e) { results.push(...post.accountIds.map(accountId => ({ accountId, ok: false, error: e.message }))); }
      if (!results.length) for (const [index, accountId] of post.accountIds.entries()) {
        if (index && !await accountIsActive(agencyId, workspace, 'marketing')) {
          results.push(...post.accountIds.slice(index).map(id => ({ accountId: id, ok: false, error: 'Subconta suspensa durante a publicação.' })));
          break;
        }
        const account = state.socialAccounts.find(a => a.id === accountId);
        if (!account) { results.push({ accountId, ok: false, error: 'Conta desconectada.' }); continue; }
        try {
          const secret = refreshed[accountId] || unseal(secrets.tokens[accountId]);
          const { secret: next, ...outcome } = await socialPublish(account, secret, post, media);
          refreshed[accountId] = next; results.push({ accountId, ...outcome });
        } catch (e) {
          if (e.status === 401) broken[accountId] = e.message;
          results.push({ accountId, ok: false, error: `${network(account.provider)?.name}: ${e.message}`.slice(0, 500) });
        }
      }
      const publishedOk = results.filter(r => r.ok);
      const publishedFail = results.filter(r => !r.ok);
      const queued = await store.change(workspace, s => {
        const outcome = settle(s, post.id, results, { uid, now: stamp });
        for (const [accountId, message] of Object.entries(broken)) { const a = s.socialAccounts.find(x => x.id === accountId); if (a) Object.assign(a, { status: 'expired', error: message }); }
        // "Post social publicado" workflows run here, outside a member's command.
        if (outcome && s.workflows?.some(w => w.active)) emitWorkflow(s, 'social_post_published', outcome);
        return s.workflowOutbox?.length || 0;
      });
      if (queued) flushLater(workspace);
      completed++;
      const activeWebhooks = (state.socialWebhooks || []).filter(w => w.active);
      if (activeWebhooks.length) {
        for (const wh of activeWebhooks) {
          if (publishedOk.length && wh.events?.includes('post.published')) {
            deliverWebhook({ url: wh.url, method: 'POST', body: { event: 'post.published', workspace, postId: post.id, postType: post.type, summary: post.summary, results: publishedOk, timestamp: stamp } }).catch(() => null);
          }
          if (publishedFail.length && wh.events?.includes('post.failed')) {
            deliverWebhook({ url: wh.url, method: 'POST', body: { event: 'post.failed', workspace, postId: post.id, summary: post.summary, results: publishedFail, timestamp: stamp } }).catch(() => null);
          }
          if (Object.keys(broken).length && wh.events?.includes('account.disconnected')) {
            deliverWebhook({ url: wh.url, method: 'POST', body: { event: 'account.disconnected', workspace, brokenAccounts: broken, timestamp: stamp } }).catch(() => null);
          }
        }
      }
    }
    if (Object.keys(refreshed).length) await socialSecrets(workspace, row => { for (const [k, v] of Object.entries(refreshed)) if (v) row.tokens[k] = seal(v); });
    return completed;
  }
  // Webinar reminders that fell due are written to Conversas; WhatsApp ones are also sent when the sub-account has WhatsApp connected.
  async function runWebinarReminders(workspace, base, at = Date.now()) {
    const state = await store.load(workspace);
    if (!state.webinarRegistrations?.length) return 0;
    const result = await change(workspace,{ type:'webinar-reminders', data:{ base, workspace, at:new Date(at).toISOString() } });
    const sent = Array.isArray(result.id) ? result.id : [];
    if (!privateSpace.test(workspace)) for (const item of sent.filter(row => row.channel === 'WhatsApp' && row.phone)) {
      await whatsapp.sendWorkspaceText(state.agencyId || AGENCY_ID, workspace, item.phone, item.body, (agencyId, id) => accountIsActive(agencyId, id, 'conversations')).catch(() => null);
    }
    return sent.length;
  }
  // Community events: one day before each date, attendees get an e-mail reminder in Conversas.
  async function runEventReminders(workspace, base, at = Date.now()) {
    const state = await store.load(workspace);
    if (!state.communityEvents?.length) return 0;
    const due = await community.dueReminders(workspace, state, at);
    if (!due.length) return 0;
    const members = new Map(((await clientPortal.directory(workspace)).members || []).map(row => [row.id, row]));
    const items = due.map(row => { const member = members.get(row.memberId);
      return member && { eventId: row.eventId, start: row.start, email: member.email, name: member.name, contactId: member.contactId || '', link: `${base}/portal/${workspace}` }; }).filter(Boolean);
    if (!items.length) return 0;
    const result = await change(workspace, { type: 'community-event-reminders', data: { items } });
    return Number(result.id) || 0;
  }
  // Community newsletters: at the chosen hour, the best posts go by e-mail to every member with access.
  async function runNewsletters(workspace, base, at = Date.now()) {
    const state = await store.load(workspace);
    if (!state.communities?.some(group => group.newsletter?.enabled)) return 0;
    const due = await community.dueNewsletters(workspace, state, at);
    if (!due.length) return 0;
    const members = new Map(((await clientPortal.directory(workspace)).members || []).map(row => [row.id, row]));
    const items = due.flatMap(digest => digest.memberIds.map(id => members.get(id)).filter(member => member?.email && !member.revokedAt).map(member => ({
      email: member.email, name: member.name, contactId: member.contactId || '', subject: `Novidades da comunidade ${digest.groupName}`,
      body: [`Oi${member.name ? `, ${member.name.split(' ')[0]}` : ''}! Veja o que movimentou a comunidade ${digest.groupName}:`, '',
        ...digest.posts.map(post => `• ${post.title} (${post.likes} curtidas, ${post.comments} comentários)`), '', `Entre para participar: ${base}/portal/${workspace}`].join('\n') })));
    if (!items.length) return 0;
    const result = await change(workspace, { type: 'community-newsletter', data: { items } });
    return Number(result.id) || 0;
  }
  async function sendVideo(req, res, method, workspace, row, cache) {
    const parts = [];
    for (let index = 0; index < row.chunks; index++) {
      const chunk = await Promise.resolve().then(() => store.load(mediaRowId(workspace, row.id, index))).catch(() => null);
      if (!chunk?.data) throw error('Vídeo indisponível.', 404);
      parts.push(Buffer.from(chunk.data, 'base64'));
    }
    const bytes = Buffer.concat(parts);
    const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
    const headers = { 'Content-Type': row.mime, 'Accept-Ranges': 'bytes', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'cross-origin' };
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, bytes.length - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
      if (start >= bytes.length || start > end) { res.writeHead(416, { 'Content-Range': `bytes */${bytes.length}` }); return res.end(); }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1 });
      return res.end(method === 'HEAD' ? undefined : bytes.subarray(start, end + 1));
    }
    res.writeHead(200, { ...headers, 'Content-Length': bytes.length });
    return res.end(method === 'HEAD' ? undefined : bytes);
  }
  // AI steps run in the background with the OpenAI key of whoever saved the workflow, and only while that
  // person still belongs to the agency that owns the sub-account (or it is their own personal account).
  async function workflowConnection(workspace, state, workflowId) {
    if (localAccess && workflowAI) return { model: agentModel };
    return keyConnection(workspace, state, state.workflows.find(row => row.id === workflowId)?.aiKey, 'salve o fluxo de novo, com a OpenAI conectada, para usar as ações de IA', 'quem salvou o fluxo não tem mais acesso a esta subconta; salve o fluxo de novo', 'conecte a OpenAI de quem salvou o fluxo (Visão da agência → Configurações → OpenAI)');
  }
  async function keyConnection(workspace, state, key, missing, revoked, disconnected) {
    if (!key?.session) throw error(missing, 409);
    const agencyId = state.agencyId || AGENCY_ID;
    let allowed = false;
    if (privateSpace.test(workspace)) allowed = workspace === personalId({ id: key.session });
    else if (key.agency === agencyId) {
      if (key.user) allowed = Boolean((await loadAgency(agencyId).catch(() => null))?.users.some(user => user.id === key.user && user.loginEnabled));
      else allowed = agencyId === `agency-${key.session}` || (agencyId === AGENCY_ID && key.session === agencyOwnerId);
    }
    if (!allowed) throw error(revoked, 403);
    const connection = await openAI.optionalConnection({ id: key.session });
    if (!connection) throw error(disconnected, 409);
    return connection;
  }
  async function workflowAIStep(workspace, state, item) {
    // The bot switched on in a conversation has no run: its answer goes back by contact.
    const base = item.bot ? { runId: '', stepId: '', bot: true, contactId: item.contactId } : { runId: item.runId, stepId: item.stepId };
    try {
      const connection = await workflowConnection(workspace, state, item.workflowId);
      checkAiBudget(await store.load(workspace));
      const meter = usageMeter();
      try {
        if (item.action === 'ai_image_generate') {
          // "Gerar imagem com IA": the image becomes a public file; its link goes to the flow variable.
          const data = await (mediaAI?.image || generateImage)({ ...connection, onUsage: meter.onUsage }, item);
          const fileId = (await change(workspace, { type: 'ai-media-file', data: { name: `imagem-ia-${Date.now()}.webp`, data } })).id;
          await store.change(workspace, current => { meter.charge(current, 'workflow', ''); });
          return { ...base, vars: { [item.variable]: documentMail.linkOf({ path: `/m/${workspace}/${fileId}` }), [`${item.variable}_id`]: fileId } };
        }
        if (item.action === 'ai_video_generate') {
          // "Gerar vídeo com IA": the job runs for minutes; runWorkflows checks it every cycle (pollAiVideos).
          const jobId = await (mediaAI?.start || startVideo)({ ...connection, onUsage: meter.onUsage }, item);
          await change(workspace, { type: 'ai-video-job', data: { jobId, runId: item.runId, stepId: item.stepId, workflowId: item.workflowId, variable: item.variable, prompt: item.prompt } });
          await store.change(workspace, current => { meter.charge(current, 'workflow', ''); });
          return null;
        }
        if (item.action === 'ai_agent' || item.action === 'conversation_ai') {
          // "Rodar agente de IA" and the bot of Conversas: the published agent answers; the run shows in the agent's history.
          const request = agentWorkflowRequest(state, item.agentId, item.input);
          const reply = String(await generateAgentReply({ ...request, model: request.model || agentModel }, { ...connection, onUsage: meter.onUsage }) || '');
          await store.change(workspace, current => {
            meter.charge(current, 'workflow', '');
            recordAgentRun(current, { agent: item.agentId, version: 'published', input: item.input, output: reply, kind: 'workflow', model: request.model || agentModel, sources: [...new Set(request.retrieved.map(row => row.title))] });
          });
          return { ...base, vars: { [item.variable]: reply } };
        }
        const { vars } = await (workflowAI || runWorkflowAI)({ ...connection, onUsage: meter.onUsage }, item);
        await store.change(workspace, current => { meter.charge(current, 'workflow', ''); });
        return { ...base, vars };
      } catch (problem) {
        await store.change(workspace, current => { meter.charge(current, 'workflow', '', problem.message); });
        throw problem;
      }
    } catch (problem) {
      return { ...base, error: problem.status === 402 ? 'limite mensal de IA da subconta atingido' : problem.message };
    }
  }
  // Workflows: deliver what the engine queued (outbound webhooks, WhatsApp) and record the outcome on each run.
  async function flushWorkflows(workspace) {
    const state = await store.load(workspace);
    if (!state.workflowOutbox?.length) return 0;
    const items = (await change(workspace, { type: 'workflow-outbox-take' })).id || [];
    const results = [], aiResults = [], appEntries = [];
    const fromAddress = items.some(item => ['document', 'document-owner', 'review-email', 'email'].includes(item.kind)) ? await sendingAddress(workspace) : '';
    const absolute = item => (item.path && !item.origin ? String(item.body || '').split(item.path).join(documentMail.linkOf(item)) : item.body);
    for (const item of items) {
      if (item.kind === 'webhook') results.push({ runId: item.runId, kind: 'webhook', text: await deliverWebhook(item) });
      if (item.kind === 'app') {
        const sent = await deliverToApp(state.agencyId || AGENCY_ID, workspace, item.appId, item.body || {});
        if (item.runId) results.push({ runId: item.runId, kind: 'app', text: sent.text });
        const what = item.body?.type === 'action' ? `Ação ${item.body.action}` : `Evento ${item.body?.event}`;
        appEntries.push({ app: sent.name, appId: item.appId, kind: item.body?.type || 'event', text: `${what}: ${sent.text}` });
      }
      if (item.kind === 'ai') { const answered = await workflowAIStep(workspace, state, item); if (answered) aiResults.push(answered); }
      if (item.kind === 'marketing-audit') auditLater(workspace, item);
      if (item.kind === 'ga4-event') results.push({ runId: item.runId, kind: 'ga4', text: await workflowGa4(workspace, item).catch(problem => `erro: ${problem.message}`) });
      if (item.kind === 'google-ads-conversion') results.push({ runId: item.runId, kind: 'google', text: await workflowGoogleAds(workspace, item).catch(problem => `erro: ${problem.message}`) });
      if (item.kind === 'meta-capi' || item.kind === 'meta-audience') results.push({ runId: item.runId, kind: 'meta', text: await workflowMeta(workspace, item).catch(problem => `erro: ${problem.message}`) });
      if (item.kind === 'copy-contact') results.push({ runId: item.runId, kind: 'copy', text: await workflowCopyContact(workspace, state, item).catch(problem => `erro: ${problem.message}`) });
      if (item.kind === 'custom-webhook') aiResults.push({ runId: item.runId, stepId: item.stepId, ...(await deliverCustomWebhook(item).catch(() => ({ error: 'falha de conexão' }))) });
      if (item.kind === 'connector') {
        const row = state.connectors?.[item.connector];
        const answered = !row ? { error: 'conector desconectado' } : await runConnectorAction(item.connector, item.action, connectorAuth(row), item.input || {}, { request: connectorRequest }).then(vars => ({ vars }), problem => ({ error: problem.message }));
        aiResults.push({ runId: item.runId, stepId: item.stepId, ...answered });
      }
      if (item.kind === 'push') {
        const devices = pushTargets(state, { target: item.target, contactId: item.contactId, messagesOnly: item.messagesOnly });
        const sent = await Promise.all(devices.map(device => sendPush(device, { title: item.title, body: item.body, url: item.url, tag: item.tag }, { env: pushEnv, request: pushRequest }).catch(() => ({ ok: false }))));
        const gone = devices.filter((device, index) => sent[index].gone).map(device => device.endpoint);
        if (gone.length) await change(workspace, { type: 'push-gone', data: { endpoints: gone } });
        if (item.runId) results.push({ runId: item.runId, kind: 'push', text: devices.length ? `enviada para ${sent.filter(row => row.ok).length} de ${devices.length} aparelho(s)` : 'nenhum aparelho com notificações ativadas' });
      }
      if (item.kind === 'phone-call' || item.kind === 'voicemail-drop' || item.kind === 'voice-ai-call') {
        const text = !phoneOrigin() ? 'erro: defina PHONE_PUBLIC_ORIGIN para a Twilio chamar a Soci'
          : await phone.workflowItem(workspace, item, phoneOrigin()).catch(problem => `erro: ${problem.message}`);
        results.push({ runId: item.runId, kind: 'phone', text });
      }
      if (item.kind === 'phone-lookup') {
        const found = await phone.workflowItem(workspace, item, phoneOrigin()).catch(problem => ({ error: problem.message }));
        aiResults.push({ runId: item.runId, stepId: item.stepId, ...found });
      }
      if (item.kind === 'email-verify') {
        const checked = await checkEmailAddress(item.email, emailResolver).catch(() => ({ status: 'unknown', reason: 'não foi possível consultar o domínio agora' }));
        aiResults.push({ runId: item.runId, stepId: item.stepId, vars: { email_status: checked.status, email_motivo: checked.reason } });
      }
      if (item.kind === 'access') results.push({ runId: item.runId, kind: 'access', text: await workflowAccess(workspace, item).catch(problem => `erro: ${problem.message}`) });
      if (item.kind === 'review-email') {
        const outcome = await documentMail.email(item.email, { subject: item.subject, text: absolute(item) }, `review-${workspace}-${item.requestId}`,
          { fromName: state.profile?.name || '', fromAddress }).catch(problem => problem.message);
        results.push({ runId: item.runId, kind: 'email', text: typeof outcome === 'string' ? outcome : 'pedido de avaliação enviado' });
      }
      if (item.kind === 'document' || item.kind === 'document-owner') {
        const message = documentMessage(item, documentMail.linkOf(item)), outcomes = [];
        if (item.kind === 'document-owner' || item.channels?.includes('email')) {
          outcomes.push(await documentMail.email(item.email, message, `doc-${workspace}-${item.docId || item.estimateId || item.invoiceId || item.checkoutId || item.giftCardId}-${item.recipientId || 'owner'}-${item.event || (item.final ? 'final' : 'request')}-${String(item.path || '').slice(-12)}`, { fromName: item.fromName || (fromAddress ? state.profile?.name || '' : ''), replyTo: item.replyTo, fromAddress }));
        }
        if (item.kind === 'document' && item.channels?.includes('whatsapp')) {
          if (!item.phone) outcomes.push('WhatsApp: contato sem telefone');
          else if (privateSpace.test(workspace)) outcomes.push('WhatsApp não enviado (conta pessoal)');
          else {
            const sent = await whatsapp.sendWorkspaceText(state.agencyId || AGENCY_ID, workspace, item.phone, message.text, (agencyId, id) => accountIsActive(agencyId, id, 'conversations')).catch(() => null);
            outcomes.push(sent?.sent ? 'WhatsApp enviado' : sent?.reason === 'not-connected' ? 'WhatsApp não conectado' : 'WhatsApp não enviado');
          }
        }
        results.push({ docId: item.docId, estimateId: item.estimateId, invoiceId: item.invoiceId, checkoutId: item.checkoutId, giftCardId: item.giftCardId, kind: 'document', text: `${item.kind === 'document-owner' ? 'Aviso ao remetente' : item.name}${item.final ? ' (cópia final)' : ''}: ${outcomes.join(' · ')}` });
      }
      if (item.kind === 'whatsapp') {
        if (privateSpace.test(workspace)) { results.push({ runId: item.runId, kind: 'whatsapp', text: 'não enviado (conta pessoal)' }); continue; }
        const sent = await whatsapp.sendWorkspaceText(state.agencyId || AGENCY_ID, workspace, item.phone, absolute(item), (agencyId, id) => accountIsActive(agencyId, id, 'conversations')).catch(() => null);
        results.push({ runId: item.runId, kind: 'whatsapp', text: sent?.sent ? 'enviado' : sent?.reason === 'not-connected' ? 'WhatsApp não conectado' : 'não enviado',
          ...(sent?.sent ? {} : { failed: deliveryFailure(sent?.reason), messageId: item.messageId || '' }) });
      }
      if (item.kind === 'whatsapp-media') {
        if (privateSpace.test(workspace)) { results.push({ runId: item.runId, kind: 'whatsapp', text: 'não enviado (conta pessoal)' }); continue; }
        // The provider downloads the file: only public https addresses (never the internal network of its server).
        const target = await publicTarget(item.media?.url || '');
        if (typeof target === 'string') { results.push({ runId: item.runId, kind: 'whatsapp', text: `arquivo não enviado: ${target}`, failed: 'provider_error', messageId: item.messageId || '' }); continue; }
        const sent = await whatsapp.sendWorkspaceMedia(state.agencyId || AGENCY_ID, workspace, item.phone, item.media, (agencyId, id) => accountIsActive(agencyId, id, 'conversations')).catch(() => null);
        results.push({ runId: item.runId, kind: 'whatsapp', text: sent?.sent ? 'arquivo enviado' : sent?.reason === 'not-connected' ? 'WhatsApp não conectado' : sent?.reason === 'unsupported' ? 'o provedor de WhatsApp não envia arquivos' : 'arquivo não enviado',
          ...(sent?.sent ? {} : { failed: deliveryFailure(sent?.reason), messageId: item.messageId || '' }) });
      }
      if (item.kind === 'whatsapp-typing') {
        if (privateSpace.test(workspace)) { results.push({ runId: item.runId, kind: 'whatsapp', text: '"digitando" não mostrado (conta pessoal)' }); continue; }
        const shown = await whatsapp.sendWorkspacePresence(state.agencyId || AGENCY_ID, workspace, item.phone, item.seconds, (agencyId, id) => accountIsActive(agencyId, id, 'conversations')).catch(() => null);
        results.push({ runId: item.runId, kind: 'whatsapp', text: shown?.sent ? `"digitando…" por ${shown.seconds} s` : shown?.reason === 'not-connected' ? 'WhatsApp não conectado' : shown?.reason === 'unsupported' ? 'o provedor de WhatsApp não mostra "digitando"' : '"digitando" não mostrado' });
      }
      if (item.kind === 'email') {
        if (privateSpace.test(workspace)) { results.push({ runId: item.runId, kind: 'email', text: 'não enviado (conta pessoal)' }); continue; }
        const outcome = await documentMail.email(item.to, { subject: item.subject, text: absolute(item) }, `wf-email-${workspace}-${item.messageId}`,
          { fromName: state.profile?.name || '', fromAddress, replyTo: inboundAddress(workspace) }).catch(problem => problem.message);
        const ok = mailSent(outcome);
        results.push({ runId: item.runId, kind: 'email', text: ok ? 'enviado' : `não enviado: ${outcome}`,
          ...(ok ? {} : { failed: /não configurado/.test(outcome) ? 'not_connected' : 'provider_error', messageId: item.messageId || '' }) });
      }
      if (item.kind === 'whatsapp-interactive') {
        if (privateSpace.test(workspace)) { results.push({ runId: item.runId, kind: 'whatsapp', text: 'não enviada (conta pessoal)' }); continue; }
        const sent = await whatsapp.sendWorkspaceInteractive(state.agencyId || AGENCY_ID, workspace, item.phone, item.interactive, (agencyId, id) => accountIsActive(agencyId, id, 'conversations')).catch(() => null);
        results.push({ runId: item.runId, kind: 'whatsapp', text: sent?.sent ? 'mensagem interativa enviada' : sent?.reason === 'not-connected' ? 'WhatsApp não conectado' : sent?.reason === 'unsupported' ? 'o provedor de WhatsApp não envia mensagens interativas' : 'mensagem interativa não enviada',
          ...(sent?.sent ? {} : { failed: sent?.reason === 'not-connected' ? 'not_connected' : sent?.reason === 'invalid-phone' ? 'invalid_phone' : sent?.reason === 'account-suspended' ? 'suspended' : 'provider_error', messageId: item.messageId || '' }) });
      }
      if (item.kind === 'meta-message') {
        const sent = await deliverMetaMessage(workspace, state, item).catch(() => ({ sent: false, reason: 'provider_error' }));
        const place = item.network === 'facebook' ? 'Messenger' : 'Direct';
        const why = { not_connected: 'conta não conectada no Social Planner', no_recipient: 'o contato ainda não escreveu nesse canal', window_closed: 'fora da janela de 24 horas', suspended: 'subconta suspensa' }[sent.reason] || 'erro da Meta';
        results.push({ runId: item.runId, kind: 'meta', text: sent.sent ? `${place}: enviada` : `${place}: não enviada (${why})`, ...(sent.sent ? {} : { failed: sent.reason, messageId: item.messageId || '' }) });
      }
    }
    if (results.length) {
      // A failed WhatsApp can start "Falha no envio de mensagem" workflows, which queue their own deliveries.
      const reported = await change(workspace, { type: 'workflow-outbox-result', data: { results } });
      if (results.some(item => item.failed) && reported.state.workflowOutbox?.length) flushLater(workspace);
    }
    if (appEntries.length) await change(workspace, { type: 'app-log', data: { entries: appEntries } });
    if (aiResults.length) {
      // Resuming can queue the next AI step or webhook of the same run.
      const resumed = await change(workspace, { type: 'workflow-ai-result', data: { results: aiResults } });
      if (resumed.state.workflowOutbox?.length) flushLater(workspace);
    }
    return results.length + aiResults.length;
  }
  const flushLater = workspace => { Promise.resolve().then(() => flushWorkflows(workspace)).catch(e => console.error(`Workflow delivery (${workspace}): ${e.message}`)); };
  // "Gerar auditoria de marketing": the audit can take a minute (PageSpeed), so it runs apart from the delivery queue
  // and resumes the waiting run with the result. The audit fetches only public addresses (prospect-audit.mjs).
  const auditLater = (workspace, item) => {
    Promise.resolve().then(async () => {
      const audit = await prospectAudit({ website: item.website, name: item.business, city: item.city }).catch(() => null);
      const done = await change(workspace, { type: 'workflow-ai-result', data: { results: [{ runId: item.runId, stepId: item.stepId, ...marketingAuditVars(audit, item.variable) }] } });
      if (done.state.workflowOutbox?.length) flushLater(workspace);
    }).catch(e => console.error(`Marketing audit (${workspace}): ${e.message}`));
  };
  // "Gerar vídeo com IA": each running job is checked; a finished video is stored in chunks and resumes the run
  // with its public link, a failed one resumes it with the error (and a job older than 40 minutes gives up).
  async function pollAiVideos(workspace, state) {
    for (const job of state.aiVideoJobs || []) {
      const finish = async (data, result) => {
        await change(workspace, { type: 'ai-video-done', data: { jobId: job.jobId, ...data } });
        await change(workspace, { type: 'workflow-ai-result', data: { results: [{ runId: job.runId, stepId: job.stepId, ...result }] } });
      };
      try {
        const connection = await workflowConnection(workspace, state, job.workflowId);
        const status = await (mediaAI?.status || videoStatus)(connection, job.jobId);
        if (status.status === 'failed') { await finish({}, { error: status.error || 'a OpenAI não conseguiu gerar o vídeo' }); continue; }
        if (status.status !== 'completed') {
          if (Date.now() - Date.parse(job.started) > 40 * 60000) await finish({}, { error: 'o vídeo não ficou pronto em 40 minutos' });
          continue;
        }
        const bytes = await (mediaAI?.content || videoContent)(connection, job.jobId);
        if (!bytes?.length || bytes.length > 15 * 1024 * 1024) { await finish({}, { error: 'o vídeo gerado passou de 15 MB' }); continue; }
        const id = uid(), chunks = Math.ceil(bytes.length / CHUNK_BYTES);
        for (let index = 0; index < chunks; index++) {
          const rowId = mediaRowId(workspace, id, index);
          await store.insert(rowId, { profile: { name: 'Vídeo gerado com IA' }, data: bytes.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES).toString('base64') });
        }
        await finish({ id, chunks, bytes: bytes.length, prompt: job.prompt, workflowId: job.workflowId },
          { vars: { [job.variable]: documentMail.linkOf({ path: `/m/${workspace}/video/${id}` }), [`${job.variable}_id`]: id } });
      } catch (problem) {
        if (problem.status === 403 || problem.status === 409 || problem.status === 422) await finish({}, { error: problem.message }).catch(() => {});
        else console.error(`AI video job (${workspace}): ${problem.message}`);
      }
    }
    flushLater(workspace);
  }
  // Every minute: wake waiting runs and fire scheduled triggers (birthdays, custom dates, scheduler, stale deals).
  // T.2: the credentials of a connected app (sealed in the sub-account).
  const connectorAuth = row => { try { return JSON.parse(unsealSecret(row.sealed) || '{}'); } catch { return {}; } };
  async function pollConnectors(workspace, state, at = Date.now()) {
    const byApp = new Map();
    for (const job of pollJobs(state)) byApp.set(job.id, [...(byApp.get(job.id) || []), job]);
    for (const [id, jobs] of byApp) {
      const row = state.connectors[id];
      if (row.polledAt && at - Date.parse(row.polledAt) < 5 * 60000) continue;
      const auth = connectorAuth(row), cursors = {};
      for (const job of jobs) {
        try {
          const found = await pollConnector(id, job.key, job.config, auth, row.cursors?.[job.scope], { request: connectorRequest, now: at });
          cursors[job.scope] = found.cursor;
          for (const event of found.events) await change(workspace, { type: 'connector-event', data: { connector: id, key: event.key, ctx: event.ctx } });
        } catch (e) { console.error(`Conector ${id} (${workspace}): ${e.message}`); }
      }
      await change(workspace, { type: 'connector-cursor', data: { id, cursors } });
    }
  }
  async function runWorkflows(workspace, at = Date.now()) {
    const state = await store.load(workspace);
    if (!state.workflows?.some(row => row.active) && !state.runs?.some(row => row.status === 'Waiting')) return null;
    if (!privateSpace.test(workspace) && !(await accountIsActive(state.agencyId || AGENCY_ID, workspace, 'automation').catch(() => false))) return null;
    if (state.aiVideoJobs?.length) await pollAiVideos(workspace, state).catch(e => console.error(`AI video (${workspace}): ${e.message}`));
    await pollConnectors(workspace, state, at).catch(e => console.error(`Conectores (${workspace}): ${e.message}`));
    const result = (await change(workspace, { type: 'workflow-tick', data: { at: new Date(at).toISOString() } })).id;
    await flushWorkflows(workspace);
    return result;
  }
  // Recurring invoices: every minute, issue what is due today and deliver the e-mails with the payment links.
  async function runRecurringInvoices(workspace, at = Date.now()) {
    const state = await store.load(workspace);
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: state.profile?.timezone || 'UTC' }).format(new Date(at));
    if (!state.recurringInvoices?.some(row => row.status === 'active' && row.nextIssueOn && row.nextIssueOn <= day)) return [];
    if (!privateSpace.test(workspace) && !(await accountIsActive(state.agencyId || AGENCY_ID, workspace, 'payments').catch(() => false))) return [];
    const issued = (await change(workspace, { type: 'invoice-tick', data: { at: new Date(at).toISOString() } })).id || [];
    if (issued.length) await flushWorkflows(workspace);
    return issued;
  }
  // Abandoned checkouts: open carts idle for longer than the configured wait become abandoned (contact,
  // workflow trigger and recovery e-mail).
  async function runAbandonedCheckouts(workspace, at = Date.now()) {
    const state = await store.load(workspace);
    const limit = at - abandonedOf(state).afterMinutes * 60000;
    if (!state.abandonedCheckouts?.some(row => row.status === 'open' && Date.parse(row.updated) <= limit)) return 0;
    if (!privateSpace.test(workspace) && !(await accountIsActive(state.agencyId || AGENCY_ID, workspace, 'payments').catch(() => false))) return 0;
    const count = (await change(workspace, { type: 'checkout-tick', data: { at: new Date(at).toISOString() } })).id || 0;
    if (count) await flushWorkflows(workspace);
    return count;
  }
  // Scheduled report e-mails: each due report is sent once per slot; failures are kept on the
  // schedule (lastError) and the slot is not retried, so a broken address does not resend all day.
  async function runReportMail(workspace, at = new Date()) {
    const state = await store.load(workspace);
    if (!state.customReports?.some(report => report.schedule)) return 0;
    const due = reportsDue(state, at);
    if (!due.length) return 0;
    if (!privateSpace.test(workspace) && !(await accountIsActive(state.agencyId || AGENCY_ID, workspace, 'reporting').catch(() => false))) return 0;
    let sent = 0;
    const fromAddress = await sendingAddress(workspace);
    for (const { id: reportId, slot } of due) {
      const report = state.customReports.find(row => row.id === reportId);
      let problem = '';
      try { await reportMail.send(workspace, state, report, slot, { fromAddress }); sent++; } catch (e) { problem = e.message; }
      await change(workspace, { type: 'report-sent', id: reportId, data: { slot, error: problem } });
    }
    return sent;
  }
  // E-mail campaigns: start what is scheduled, pick the A/B winner when the test ends and send the queue
  // in batches of 100 (at most 2.000 a minute per sub-account). One run per sub-account at a time.
  const emailRuns = new Set();
  async function runEmailCampaigns(workspace, at = Date.now()) {
    const state = await store.load(workspace);
    if (!state.emailCampaigns?.some(row => ['scheduled', 'sending', 'testing'].includes(row.status)) && !state.emailSequences?.some(row => row.status === 'active' && row.enrolled?.some(item => item.status === 'active'))) return 0;
    if (!privateSpace.test(workspace) && !(await accountIsActive(state.agencyId || AGENCY_ID, workspace, 'marketing').catch(() => false))) return 0;
    if (emailRuns.has(workspace)) return 0;
    emailRuns.add(workspace);
    try {
      const queued = (await change(workspace, { type: 'email-tick', data: { at: new Date(at).toISOString() } })).id;
      if (!queued) return 0;
      const fromAddress = await sendingAddress(workspace);
      let sent = 0;
      for (let round = 0; round < 20; round++) {
        const batch = (await change(workspace, { type: 'email-take', data: { limit: 100 } })).id;
        if (!batch.items.length) break;
        const results = await campaignMail.sendBatch({ workspace, ...batch, fromAddress });
        if (!results) break;
        const done = await change(workspace, { type: 'email-result', data: { results } });
        sent += results.filter(row => row.ok).length;
        if (done.state.workflowOutbox?.length) flushLater(workspace);
      }
      return sent;
    } finally { emailRuns.delete(workspace); }
  }
  const emailLater = workspace => { Promise.resolve().then(() => runEmailCampaigns(workspace)).catch(e => console.error(`E-mail campaigns (${workspace}): ${e.message}`)); };
  async function runAllSocial(base) {
    let total = 0;
    for (const w of (await store.list()).filter(w => spaceId.test(w.id) || privateSpace.test(w.id))) {
      try { total += await runSocial(w.id, base); } catch (e) { console.error(`Social planner (${w.id}): ${e.message}`); }
      try { await runWebinarReminders(w.id, base); } catch (e) { console.error(`Webinar reminders (${w.id}): ${e.message}`); }
      try { await runEventReminders(w.id, base); } catch (e) { console.error(`Community event reminders (${w.id}): ${e.message}`); }
      try { await runNewsletters(w.id, base); } catch (e) { console.error(`Community newsletters (${w.id}): ${e.message}`); }
      try { await runWorkflows(w.id); } catch (e) { console.error(`Workflows (${w.id}): ${e.message}`); }
      try { await runReportMail(w.id); } catch (e) { console.error(`Report e-mail (${w.id}): ${e.message}`); }
      try { await runRecurringInvoices(w.id); } catch (e) { console.error(`Recurring invoices (${w.id}): ${e.message}`); }
      try { await runAbandonedCheckouts(w.id); } catch (e) { console.error(`Abandoned checkouts (${w.id}): ${e.message}`); }
      try { await runEmailCampaigns(w.id); } catch (e) { console.error(`E-mail campaigns (${w.id}): ${e.message}`); }
      try { await runAllAds(w.id); } catch (e) { console.error(`Ads (${w.id}): ${e.message}`); }
    }
    return total;
  }
  const socialTimer = socialScheduler ? setInterval(() => { ready.then(() => runAllSocial(process.env.SOCIAL_PUBLIC_URL || `http://${host}:${port}`)).catch(() => {}); }, 60_000) : null;
  socialTimer?.unref?.();
  const socialPopup = (base, message) => `<!doctype html><meta charset="utf-8"><title>soci</title><body style="font-family:system-ui;padding:24px">
<p>${message.error ? 'Não foi possível conectar.' : 'Conta autorizada. Você pode fechar esta janela.'}</p><script>
const m=${JSON.stringify({ type: 'soci-social', ...message }).replace(/</g, '\\u003c')};
if (window.opener) { window.opener.postMessage(m, ${JSON.stringify(base)}); window.close(); } else location.href='/app#marketing/social';
</script>`;
  // ---- Anúncios (Meta Ads, Google Ads) --------------------------------------------------------
  // Tokens live sealed in the `ads-<workspace>` row; the workspace keeps campaigns and daily numbers.
  const adsCallbackPath = '/api/ads/callback';
  const adsPopup = (base, message) => `<!doctype html><meta charset="utf-8"><title>soci</title><body style="font-family:system-ui;padding:24px">
<p>${message.error ? 'Não foi possível conectar a conta de anúncios.' : 'Conta de anúncios conectada. Você pode fechar esta janela.'}</p><script>
const m=${JSON.stringify({ type: 'soci-ads', ...message }).replace(/</g, '\\u003c')};
if (window.opener) { window.opener.postMessage(m, ${JSON.stringify(base)}); window.close(); } else location.href='/app#marketing/ads';
</script>`;
  const adsView = row => ({ configured: adsConfigured(), ...Object.fromEntries(['meta', 'google'].map(network => {
    const a = row[network] || {};
    return [network, { connected: Boolean(a.token), user: a.user || '', connectedAt: a.connectedAt || '', accounts: a.accounts || [], accountId: a.accountId || '', pages: a.pages || [], pageId: a.pageId || '' }];
  })) });
  async function adsAccess(workspace, network) {
    const rowId = `ads-${workspace}`, a = (await socialRow(rowId))[network];
    if (!a?.token) throw error(`Conecte o ${network === 'meta' ? 'Meta Ads' : 'Google Ads'} primeiro.`, 409);
    const account = a.accounts.find(item => item.id === a.accountId);
    if (!account) throw error('Escolha a conta de anúncios.', 409);
    const fresh = await freshAdsSecret(network, unseal(a.token));
    if (fresh.changed) await store.change(rowId, row => { if (row[network]) row[network].token = seal(fresh.secret); });
    return { secret: fresh.secret, account, page: (a.pages || []).find(item => item.id === a.pageId) || null };
  }
  // Workflows (Conversions API, custom audiences): only the Meta token matters, not the chosen ad account.
  async function metaSecret(workspace) {
    const rowId = `ads-${workspace}`, a = (await socialRow(rowId)).meta;
    if (!a?.token) throw error('conecte o Meta Ads em Marketing → Anúncios', 409);
    const fresh = await freshAdsSecret('meta', unseal(a.token));
    if (fresh.changed) await store.change(rowId, row => { if (row.meta) row.meta.token = seal(fresh.secret); });
    return fresh.secret;
  }
  async function workflowMeta(workspace, item) {
    if (privateSpace.test(workspace)) return 'não disponível na conta pessoal';
    const secret = await metaSecret(workspace);
    if (item.kind === 'meta-capi') {
      const sent = await sendMetaEvents(secret, item.pixel, [item.event], item.testCode);
      return `${item.event.event_name}: ${sent.received ? 'recebido pela Meta' : 'não recebido'}${item.testCode ? ' (teste)' : ''}`;
    }
    const changed = await changeMetaAudience(secret, item.audience, [item.row], item.remove);
    return `${item.remove ? 'removido do' : 'incluído no'} público ${item.audience}${changed.invalid ? ' (dados inválidos)' : ''}`;
  }
  // Messenger and Direct (meta-messaging.mjs). "social-meta-routes" maps each connected page / Instagram account to its
  // sub-account, so the webhook knows where a message belongs; it is rebuilt whenever accounts change.
  const metaRoutesRow = async () => { try { return await store.load('social-meta-routes'); } catch { await store.insert('social-meta-routes', { profile: { name: 'Meta routes' }, routes: {} }); return store.load('social-meta-routes'); } };
  async function routeMetaAccounts(workspace) {
    if (privateSpace.test(workspace)) return;
    const accounts = ((await store.load(workspace)).socialAccounts || []).filter(row => ['facebook', 'instagram'].includes(row.provider));
    const secrets = (await socialRow(`social-${workspace}`)).tokens || {};
    await metaRoutesRow();
    await store.change('social-meta-routes', row => {
      row.routes ||= {};
      for (const [key, value] of Object.entries(row.routes)) if (value.workspace === workspace) delete row.routes[key];
      for (const account of accounts) row.routes[account.externalId] = { workspace, accountId: account.id, network: account.provider };
    });
    // Ask Meta to send each page's messages to this app (best effort: the page may lack the messaging permission).
    for (const account of accounts.filter(row => row.provider === 'facebook')) {
      const secret = (() => { try { return unseal(secrets[account.id]); } catch { return null; } })();
      await subscribeMetaPage({ token: secret?.token, pageId: account.externalId }, metaFetch).catch(() => false);
    }
  }
  // The page token and page id that send on this channel for this contact id key ("facebook:<pageId>").
  async function metaSender(workspace, state, key) {
    const [network, externalId] = key.split(':');
    const account = (state.socialAccounts || []).find(row => row.provider === network && row.externalId === externalId);
    if (!account) return null;
    let secret = null;
    try { secret = unseal(((await socialRow(`social-${workspace}`)).tokens || {})[account.id]); } catch { secret = null; }
    if (!secret?.token) return null;
    return { token: secret.token, pageId: network === 'instagram' ? secret.pageId : externalId };
  }
  // One message to a contact on Messenger or Direct, trying each connected account the contact has written to.
  async function deliverMetaMessage(workspace, state, { network, recipients, body, buttons = [] }) {
    if (privateSpace.test(workspace)) return { sent: false, reason: 'not_connected' };
    if (!await accountIsActive(state.agencyId || AGENCY_ID, workspace, 'conversations')) return { sent: false, reason: 'suspended' };
    let last = { sent: false, reason: 'no_recipient' };
    for (const [key, recipientId] of Object.entries(recipients || {}).filter(([key]) => key.startsWith(`${network}:`))) {
      const sender = await metaSender(workspace, state, key);
      if (!sender) { last = { sent: false, reason: 'not_connected' }; continue; }
      last = await sendMetaMessage({ ...sender, recipientId, text: body, buttons: quickReplies(buttons.join('\n')) }, metaFetch);
      if (last.sent) return last;
    }
    return last;
  }
  // Workflows: an event to the GA4 property, with the sealed Measurement Protocol secret.
  async function workflowGa4(workspace, item) {
    if (privateSpace.test(workspace)) return 'não disponível na conta pessoal';
    const row = await socialRow(`ads-${workspace}`);
    const secret = row.ga4Secret ? unseal(row.ga4Secret) : '';
    await sendGa4Event({ measurementId: item.measurementId, secret, clientId: item.clientId, userId: item.userId, event: item.event });
    return `${item.event.name} enviado`;
  }
  // Workflows: an offline conversion to the Google Ads account chosen in Marketing → Anúncios.
  async function workflowGoogleAds(workspace, item) {
    if (privateSpace.test(workspace)) return 'não disponível na conta pessoal';
    const { secret, account } = await adsAccess(workspace, 'google');
    const sent = await uploadGoogleConversion(secret, account.id, item);
    return sent.accepted ? `conversão registrada em ${account.name}` : 'o Google Ads não registrou a conversão';
  }
  const adsRuns = new Set();
  /** Syncs campaigns and the daily numbers of the last 7 days (90 on the first sync or when `full`). */
  async function runAds(workspace, network, { full = false } = {}) {
    const key = `${workspace}|${network}`;
    if (adsRuns.has(key)) throw error('A sincronização já está em andamento.', 409);
    adsRuns.add(key);
    try {
      const { secret, account } = await adsAccess(workspace, network);
      const state = await store.load(workspace);
      let today;
      try { today = new Intl.DateTimeFormat('en-CA', { timeZone: state.profile?.timezone || 'UTC' }).format(new Date()); } catch { today = stamp().slice(0, 10); }
      const back = full || !state.adSettings?.lastSync?.[network] ? 89 : 6;
      const from = new Date(Date.parse(`${today}T12:00:00Z`) - back * 864e5).toISOString().slice(0, 10);
      const data = await syncAds(network, secret, account, from, today);
      return await store.change(workspace, s => storeAdSync(s, network, { account, ...data, from, to: today }));
    } catch (e) {
      await store.change(workspace, s => { const settings = adSettingsOf(s); settings.syncErrors[network] = String(e.message || e).slice(0, 300); (settings.lastAttempt ??= {})[network] = stamp(); }).catch(() => {});
      throw e;
    } finally { adsRuns.delete(key); }
  }
  // Scheduler: every connected network syncs every 3 hours (an error waits an hour before retrying).
  async function runAllAds(workspace) {
    const state = await store.load(workspace), settings = state.adSettings;
    if (!settings?.connected?.meta && !settings?.connected?.google) return;
    if (!await accountIsActive(state.agencyId || AGENCY_ID, workspace, 'marketing')) return;
    for (const network of ['meta', 'google']) {
      if (!settings.connected[network] || Date.parse(settings.lastSync?.[network] || 0) > Date.now() - 3 * 3600_000) continue;
      if (Date.parse(settings.lastAttempt?.[network] || 0) > Date.now() - 3600_000) continue;
      await runAds(workspace, network).catch(e => console.error(`Ads sync (${workspace}, ${network}): ${e.message}`));
    }
  }
  // ---- Google Analytics + Business Profile (sub-account dashboard) ----------------------------
  const googleCallbackPath = '/api/google/callback';
  const googleCache = new Map();
  const searchCache = new Map();
  const googlePopup = (base, message) => `<!doctype html><meta charset="utf-8"><title>soci</title><body style="font-family:system-ui;padding:24px">
<p>${message.error ? 'Não foi possível conectar o Google.' : 'Conta Google conectada. Você pode fechar esta janela.'}</p><script>
const m=${JSON.stringify({ type: 'soci-google', ...message }).replace(/</g, '\\u003c')};
if (window.opener) { window.opener.postMessage(m, ${JSON.stringify(base)}); window.close(); } else location.href='/app#settings/google';
</script>`;
  const googleView = (row, manage) => {
    const g = row.google || {};
    const pick = (list, value) => list?.find(item => item.id === value) || null;
    return { configured: googleConfigured(), connected: Boolean(g.token), email: manage ? g.email || '' : '', connectedAt: g.connectedAt || '',
      properties: manage ? g.properties || [] : [], locations: manage ? g.locations || [] : [], errors: manage ? g.errors || {} : {},
      sites: manage ? g.sites || [] : [], gaProperty: g.gaProperty || '', gbpLocation: g.gbpLocation || '', gscSite: g.gscSite || '',
      gaName: pick(g.properties, g.gaProperty)?.name || '', gbpName: pick(g.locations, g.gbpLocation)?.name || '', gscName: pick(g.sites, g.gscSite)?.name || '' };
  };
  async function googleData(workspace, row) {
    const g = row.google;
    if (!g?.token || (!g.gaProperty && !g.gbpLocation)) return { ga: null, gbp: null };
    const key = `${g.gaProperty}|${g.gbpLocation}`;
    const cached = googleCache.get(workspace);
    if (cached && cached.key === key && cached.at > Date.now() - 15 * 60_000) return cached.data;
    let secret = unseal(g.token);
    if (!secret) return { ga: { error: 'A conexão com o Google precisa ser refeita.' }, gbp: null };
    const report = await googleReports(secret, g).catch(e => ({ ga: g.gaProperty ? { error: e.message } : null, gbp: g.gbpLocation ? { error: e.message } : null }));
    if (report.secret) await store.change(`google-${workspace}`, r => { if (r.google) r.google.token = seal(report.secret); });
    const data = { ga: report.ga, gbp: report.gbp, at: stamp() };
    if (!data.ga?.error && !data.gbp?.error) googleCache.set(workspace, { key, at: Date.now(), data });
    return data;
  }
  // The Business Profile location chosen for a workspace, with a fresh token and its account (for reviews).
  async function gbpAccess(workspace) {
    const rowId = `google-${workspace}`;
    const g = (await socialRow(rowId)).google;
    if (!g?.token) throw error('Conecte o Google em Configurações → Google para gerenciar o Perfil da Empresa.', 409);
    if (!g.gbpLocation) throw error('Escolha o local do Perfil da Empresa em Configurações → Google.', 409);
    const fresh = await freshSecret(unseal(g.token)).catch(() => { throw error('O acesso ao Google expirou. Conecte a conta de novo em Configurações → Google.', 401); });
    if (fresh.changed) await store.change(rowId, row => { if (row.google) row.google.token = seal(fresh.secret); });
    let location = g.locations?.find(item => item.id === g.gbpLocation);
    if (!location?.accountId) {
      const list = await listLocations(fresh.secret.token).catch(problem => { throw googleError(problem); });
      await store.change(rowId, row => { if (row.google) row.google.locations = list; });
      location = list.find(item => item.id === g.gbpLocation);
    }
    return { token: fresh.secret.token, location: g.gbpLocation, account: location?.accountId || '', name: location?.name || '' };
  }
  const gbpCache = new Map();
  async function gbpStatus(workspace, force = false) {
    const access = await gbpAccess(workspace);
    const cached = gbpCache.get(workspace);
    const details = !force && cached?.location === access.location && cached.at > Date.now() - 10 * 60_000 ? cached.details
      : await locationDetails(access.token, access.location).catch(problem => { throw googleError(problem); });
    gbpCache.set(workspace, { location: access.location, details, at: Date.now() });
    const state = await store.load(workspace);
    const gbpAccounts = new Set((state.socialAccounts || []).filter(row => row.provider === 'gbp').map(row => row.id));
    const week = Date.now() - 7 * 864e5;
    const posts = (state.socialPosts || []).filter(post => Date.parse(post.publishedAt || 0) > week && (post.results || []).some(result => result.ok && gbpAccounts.has(result.accountId))).length;
    return { location: access.location, name: details.title || access.name, account: Boolean(access.account), details, syncedAt: state.reputation?.googleSyncedAt || '',
      checklist: gbpChecklist(details, { reviews: state.reviews, posts }) };
  }
  const payload = async request => {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type']||'')) throw error('Send a JSON request.',415);
    let size=0; const chunks=[];
    for await (const part of request) { size+=part.length; if(size>1050000) throw error('Request is too large.',413); chunks.push(part); }
    try { const v=JSON.parse(Buffer.concat(chunks).toString('utf8')); if(!v||typeof v!=='object'||Array.isArray(v)) throw Error(); return v; }
    catch { throw error('Invalid JSON request.',400); }
  };
  const server=createServer(async (req,res) => {
    const requestPath = String(req.url || '/').split('?')[0];
    const touches = touchesOf(req), landing = requestPath.match(landingPath);
    requestScope.enterWith({ public: publicRequest(requestPath), refs: referralsOf(req), touches,
      attribute: Boolean(landing) || /^\/api\/(store|chat|webinar|offer)\//.test(requestPath) });
    if (landing && req.method === 'GET') {
      // UTM tags, click ids or an outside referrer: remember them (the first touch is kept for 90 days).
      const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0];
      const touch = touchFromVisit(req.url, String(req.headers.referer || ''), host);
      if (touch) {
        const workspace = landing[2], prior = touches[workspace];
        touches[workspace] = { first: prior?.first || touch, last: touch };
        const value = Buffer.from(JSON.stringify({ f: touches[workspace].first, l: touch })).toString('base64url');
        const secure = String(req.headers['x-forwarded-proto'] || '').includes('https') || String(process.env.SOCIAL_PUBLIC_URL || '').startsWith('https') ? '; Secure' : '';
        res.setHeader('Set-Cookie', `${touchCookie(workspace)}=${value}; Max-Age=${90 * 86400}; Path=/; HttpOnly; SameSite=Lax${secure}`);
      }
    }
    const isVercel = Boolean(process.env.VERCEL);
    const currentPort=server.address()?.port ?? port;
    const allowedHosts=[`127.0.0.1:${currentPort}`,`localhost:${currentPort}`];
    res.setHeader('Content-Security-Policy',csp);
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cache-Control','no-store');
    const send=(status,type,data)=>{res.writeHead(status,{'Content-Type':type});res.end(data);};
    const json=(data,status=200)=>send(status,'application/json; charset=utf-8',JSON.stringify(data));
    const goTo = path => { res.writeHead(303, { Location: path }); res.end(); };
    let p = '';
    try {
      const host = req.headers.host || '';
      if (!isVercel && !allowedHosts.includes(host)) throw error('Use the local address shown in the terminal.',403);
      const proto = isVercel || req.socket?.encrypted ? 'https' : 'http';
      const url=new URL(req.url,`${proto}://${host}`);
      p = url.searchParams.get('__path') || url.pathname;
      if (!p.startsWith('/')) p = '/' + p;
      p = p.replace(/\/+/g, '/');
      const method=req.method;
      if (!['GET','HEAD','POST'].includes(method)) throw error('Method not allowed.',405);
      // Tracking events come from the business's own site, so they are the one cross-site POST accepted.
      if (method==='POST' && !trackingPath.test(p) && (req.headers['sec-fetch-site']==='cross-site' || (req.headers.origin && req.headers.origin!==url.origin))) throw error('This workspace only accepts local requests.',403);
      if (p.startsWith('/api/') && !p.startsWith('/api/auth/')) await ready;
      const id=url.searchParams.get('workspace') || 'demo';
      const portalMatch = p.match(portalApi);
      if (portalMatch) {
        const [, workspace, operation, courseId] = portalMatch;
        if (operation === 'offer-grant') {
          if (method !== 'POST' || !courseId) throw error('Método indisponível.',405);
          const who = await workspaceAccess(req, res, workspace, { modules: ['memberships'] });
          await requireActiveAccount(who.agencyId, workspace, true);
          const invoice = (await store.load(workspace)).invoices.find(row => row.id === courseId && row.offerId);
          if (!invoice) throw error('Venda não encontrada.',404);
          return json(await grantOffer(workspace, invoice.offerId, invoice.contactId, invoice.id));
        }
        if (operation !== 'community-admin' && Boolean(courseId) !== ['course','progress','community'].includes(operation)) throw error('Página do portal não encontrada.',404);
        if (operation === 'community-admin') {
          const who = await workspaceAccess(req, res, workspace, { modules: ['memberships'] });
          const input = method === 'POST' ? await payload(req) : null;
          await requireActiveAccount(who.agencyId, workspace, true);
          const state = await store.load(workspace);
          const days = [7, 30, 90, 365].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 30;
          return json(await community.admin(workspace, state, await clientPortal.directory(workspace), courseId, input, { days }));
        }
        // Fidelidade: the member redeems a reward with their points (their contact is found by the portal access).
        // The client sends a file to the team (Arquivos, a note in Conversas and the workflow trigger).
        if (operation === 'push') {
          if (method !== 'POST') throw error('Método indisponível.',405);
          await publicAccountPolicy(workspace, true, 'memberships');
          const { member } = await clientPortal.session(workspace, portalCookie(req,res,workspace,undefined,proto === 'https'));
          const input = await payload(req), sub = pushSubscription(input.subscription);
          if (!sub) throw error('Inscrição de notificação inválida.',400);
          const state = await store.load(workspace);
          const contact = state.contacts.find(row => row.id === member.contactId) || state.contacts.find(row => (row.email || '').toLowerCase() === member.email);
          if (!contact) throw error('Contato não encontrado.',404);
          await change(workspace, { type: 'push-subscribe', data: { ...sub, kind: 'contact', contactId: contact.id } });
          return json({ ok: true }, 201);
        }
        if (operation === 'files') {
          await publicAccountPolicy(workspace, method === 'POST', 'memberships');
          const { member } = await clientPortal.session(workspace, portalCookie(req,res,workspace,undefined,proto === 'https'));
          const mine = st => { const contact = st.contacts.find(row => row.id === member.contactId) || st.contacts.find(row => (row.email || '').toLowerCase() === member.email);
            return (st.files || []).filter(row => row.source === 'portal' && contact && row.contactId === contact.id).slice(-20).reverse().map(row => ({ id: row.id, name: row.name, created: row.created })); };
          if (method === 'GET') return json({ files: mine(await store.load(workspace)) });
          if (method !== 'POST') throw error('Método indisponível.',405);
          const input = await payload(req);
          const result = await change(workspace, { type: 'portal-file', data: { contactId: member.contactId || '', email: member.email, name: member.name || '', fileName: String(input.name || ''), data: String(input.data || '') } });
          flushLater(workspace);
          return json({ files: mine(result.state) }, 201);
        }
        if (operation === 'loyalty') {
          if (method !== 'POST') throw error('Método indisponível.',405);
          const input = await payload(req);
          await publicAccountPolicy(workspace, true, 'memberships');
          const { member } = await clientPortal.session(workspace, portalCookie(req,res,workspace,undefined,proto === 'https'));
          const state = await store.load(workspace);
          const contact = state.contacts.find(row => row.id === member.contactId) || state.contacts.find(row => (row.email || '').toLowerCase() === member.email);
          if (!contact) throw error('Ainda não há pontos na sua conta.',409);
          const result = await change(workspace, { type: 'loyalty-redeem', data: { contactId: contact.id, rewardId: String(input.rewardId || '') } });
          flushLater(workspace);
          return json({ redeemed: result.id, loyalty: loyaltyView(result.state, contact.id) });
        }
        if (operation === 'community') {
          const input = method === 'POST' ? await payload(req) : null;
          await publicAccountPolicy(workspace, method === 'POST', 'memberships');
          const { doc, member } = await clientPortal.session(workspace, portalCookie(req,res,workspace,undefined,proto === 'https'));
          const state = await store.load(workspace);
          // Paid access to the community: an invoice for the chosen plan; access opens (or is extended) with the payment.
          if (input?.action === 'subscribe') {
            const { group, plan } = await community.reservePlan(workspace, state, member, courseId, String(input.planId || ''), input.answers);
            const agencyId = state.agencyId || AGENCY_ID;
            if (!(await abacate.connected(agencyId, workspace))) throw error('A assinatura desta comunidade ainda não está disponível. Fale com a equipe.',409);
            const invoiceId = (await change(workspace,{ type:'community-plan-invoice', id:group.id, data:{ planId:plan.id, email:member.email, name:member.name, contactId:member.contactId || '', memberId:member.id } })).id;
            const origin = publicBase(req), page = `${origin}/portal/${workspace}`;
            const payment = await abacate.chargeInvoice(agencyId, workspace, invoiceId, origin, { returnUrl:`${page}?plano=voltou`, completionUrl:`${page}?plano=pago` });
            await community.markPlanPending(workspace, courseId, member.id, invoiceId, input.answers);
            return json({ community: await community.read(workspace, await store.load(workspace), doc, member, courseId, {}), payUrl: payment.url });
          }
          // A paid event ticket: an invoice for the member, charged by AbacatePay; the seat comes with the payment.
          if (input?.action === 'ticket') {
            const event = await community.reserve(workspace, state, member, courseId, String(input.eventId || ''));
            const agencyId = state.agencyId || AGENCY_ID;
            if (!(await abacate.connected(agencyId, workspace))) throw error('A venda de ingressos ainda não está disponível. Fale com a equipe.',409);
            const invoiceId = (await change(workspace,{ type:'community-event-ticket', id:event.id, data:{ email:member.email, name:member.name, contactId:member.contactId || '', memberId:member.id } })).id;
            const origin = publicBase(req), page = `${origin}/portal/${workspace}`;
            const payment = await abacate.chargeInvoice(agencyId, workspace, invoiceId, origin, { returnUrl:`${page}?evento=voltou`, completionUrl:`${page}?evento=pago` });
            await community.markPending(workspace, courseId, event.id, member.id, invoiceId);
            return json({ community: await community.read(workspace, state, doc, member, courseId, {}), payUrl: payment.url });
          }
          const result = input ? await community.act(workspace, state, doc, member, courseId, input)
            : await community.read(workspace, state, doc, member, courseId, { channelId: String(url.searchParams.get('channel') || '').slice(0, 60), period: url.searchParams.get('period') || '30' });
          return json({ community: result });
        }
        if (operation === 'admin') {
          const who = await workspaceAccess(req, res, workspace, { modules: ['memberships'] });
          const input = method === 'POST' ? await payload(req) : null;
          await requireActiveAccount(who.agencyId, workspace, true);
          const state = await store.load(workspace);
          if (input?.action === 'staff-enter') {
            const staffUser = {
              email: who.session?.email || state.profile?.email || 'admin@soci.app.br',
              name: who.session?.user_metadata?.name || who.session?.name || state.profile?.name || 'Administrador',
              photo: who.session?.picture || who.session?.user_metadata?.avatar_url || ''
            };
            const result = await clientPortal.admin(workspace, state, { ...input, ...staffUser });
            if (result.memberId && state.communities?.length) {
              await community.enroll(workspace, result.memberId, state.communities.map(g => g.id));
            }
            return json(result);
          }
          return json(await clientPortal.admin(workspace, state, input));
        }
        const secure = proto === 'https';
        if (method === 'POST' && operation === 'admin-enter') {
          const who = await workspaceAccess(req, res, workspace, { modules: ['memberships'] });
          await requireActiveAccount(who.agencyId, workspace, true);
          const state = await store.load(workspace);
          const staffUser = {
            email: who.session?.email || state.profile?.email || 'admin@soci.app.br',
            name: who.session?.user_metadata?.name || who.session?.name || state.profile?.name || 'Administrador',
              photo: who.session?.picture || who.session?.user_metadata?.avatar_url || ''
          };
          const result = await clientPortal.admin(workspace, state, { action: 'staff-enter', ...staffUser });
          if (result.memberId && state.communities?.length) {
            await community.enroll(workspace, result.memberId, state.communities.map(g => g.id));
          }
          const session = await clientPortal.exchange(workspace, result.token, { staff: true });
          portalCookie(req, res, workspace, session, secure);
          return json({ ok: true });
        }
        if (method === 'POST' && operation === 'exchange') {
          const { token } = await payload(req);
          await publicAccountPolicy(workspace, true, 'memberships');
          const session = await clientPortal.exchange(workspace, token);
          portalCookie(req, res, workspace, session, secure);
          return json({ ok:true });
        }
        if (method === 'POST' && operation === 'logout') {
          await clientPortal.signOut(workspace, portalCookie(req,res,workspace,undefined,secure));
          portalCookie(req,res,workspace,'',secure);
          return json({ ok:true });
        }
        if (method === 'POST' && operation === 'progress') {
          const input = await payload(req);
          await publicAccountPolicy(workspace, true, 'memberships');
          const state = await store.load(workspace);
          return json(await clientPortal.progress(workspace, state, portalCookie(req,res,workspace,undefined,secure), courseId, input));
        }
        if (method === 'POST' || !['home','course'].includes(operation)) throw error('Método indisponível.',405);
        const active = await publicAccountPolicy(workspace, false, 'memberships');
        const state = await store.load(workspace);
        const lessonId = String(url.searchParams.get('lesson') || '').slice(0, 60);
        let page = await clientPortal.content(workspace, state, portalCookie(req,res,workspace,undefined,secure), courseId, lessonId, { track: active });
        if (operation === 'home' && !page.signedIn && auth?.hasSession(req)) {
          try {
            const who = await workspaceAccess(req, res, workspace, { modules: ['memberships'], hide: true });
            const staffUser = {
              email: who.session?.email || state.profile?.email || 'admin@soci.app.br',
              name: who.session?.user_metadata?.name || who.session?.name || state.profile?.name || 'Administrador',
              photo: who.session?.picture || who.session?.user_metadata?.avatar_url || ''
            };
            const result = await clientPortal.admin(workspace, state, { action: 'staff-enter', ...staffUser });
            if (result.memberId && state.communities?.length) {
              await community.enroll(workspace, result.memberId, state.communities.map(g => g.id));
            }
            const session = await clientPortal.exchange(workspace, result.token, { staff: true });
            portalCookie(req, res, workspace, session, secure);
            page = await clientPortal.content(workspace, state, session, courseId, lessonId, { track: active });
          } catch {}
        }
        if (operation === 'home' && page.signedIn) {
          const { member } = await clientPortal.session(workspace, portalCookie(req,res,workspace,undefined,secure));
          page.communities = await community.home(workspace, state, member);
          const contact = state.contacts.find(row => row.id === member.contactId) || state.contacts.find(row => (row.email || '').toLowerCase() === member.email);
          page.loyalty = loyaltyView(state, contact?.id || '');
          page.files = (state.files || []).filter(row => row.source === 'portal' && contact && row.contactId === contact.id).slice(-20).reverse().map(row => ({ id: row.id, name: row.name, created: row.created }));
        }
        return json(page);
      }
      const portal = p.match(portalPage);
      if (portal && method !== 'POST') {
        await ready;
        await publicAccountPolicy(portal[1], false, 'memberships');
        res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; media-src 'self' data: https:; frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://www.loom.com; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; form-action 'self'");
        return send(200,'text/html; charset=utf-8',method==='HEAD' ? undefined : readFileSync(resolve(root,'ui','client-portal.html')));
      }
      if (p === '/favicon.ico') { res.writeHead(302, { Location: '/favicon.svg' }); return res.end(); }
      if (['/prospecting','/prospecting/','/prospecting/add-prospect'].includes(p) && method !== 'POST') {
        res.writeHead(302,{Location:p.endsWith('add-prospect') ? '/#agency/prospecting/search' : '/#agency/prospecting'});
        return res.end();
      }
      const prospectPublic = p.match(prospectPublicPath);
      if (prospectPublic) {
        await ready;
        const [,kind,token] = prospectPublic;
        if (kind === 'report') {
          if (method === 'POST') throw error('Method not allowed.',405);
          const findReport = agency => agency.prospects.find(row => row.shareId === token && !row.archived && row.report);
          const match = await store.findAgency({ prospects: [{ shareId: token }] });
          const prospect = match && findReport(hydrateAgency(match.state));
          if (!prospect) throw error('Relatório indisponível.',404);
          if (method === 'GET' && !String(req.headers.purpose || req.headers['sec-purpose'] || '').includes('prefetch')) {
            try {
              await changeAgency(match.id, agency => {
                const row = findReport(agency);
                if (!row) return;
                const date = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
                row.views[date] = (row.views[date] || 0)+1;
                const dates = Object.keys(row.views).sort();
                for (const old of dates.slice(0,Math.max(0,dates.length-370))) delete row.views[old];
              });
            } catch { /* The report remains available if the view count cannot be updated. */ }
          }
          return send(200,'text/html; charset=utf-8',method === 'HEAD' ? undefined : shareReportHtml(prospect.report));
        }
        const match = await store.findAgency({ prospecting: { widgets: [{ id: token, active: true }] } });
        const widget = match?.state.prospecting.widgets.find(item => item.id === token && item.active);
        if (!widget) throw error('Formulário indisponível.',404);
        res.setHeader('Content-Security-Policy',csp.replace("frame-ancestors 'none'",'frame-ancestors *'));
        if (method === 'POST') {
          if (!/^application\/x-www-form-urlencoded/i.test(req.headers['content-type'] || '')) throw error('Envie os campos do formulário.',415);
          let size=0; const chunks=[];
          for await (const part of req) { size+=part.length; if (size>12000) throw error('Formulário muito longo.',413); chunks.push(part); }
          const data = Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
          try { if (!data.fax) await changeAgency(match.id, agency => captureProspectWidget(agency,token,data)); }
          catch (error) { if (error.status) return send(error.status,'text/html; charset=utf-8',widgetHtml(widget,false,error.message)); throw error; }
          res.writeHead(303,{Location:`${p}?sent=1`}); return res.end();
        }
        return send(200,'text/html; charset=utf-8',method === 'HEAD' ? undefined : widgetHtml(widget,url.searchParams.has('sent')));
      }
      // A marketplace app fires one of its workflow triggers in the sub-account it is installed in.
      if (p === '/api/apps/v1/trigger' && method === 'POST') {
        const { install } = await appBearer(req);
        const body = await payload(req);
        const result = await change(install.account, { type: 'app-trigger', data: { appId: install.appId, key: String(body.trigger || ''),
          contact: body.contact && typeof body.contact === 'object' ? body.contact : {}, payload: body.data } });
        flushLater(install.account);
        return json({ ok: true, ...result.id }, 202);
      }
      const apiMatch = p.match(apiPath);
      if (apiMatch) {
        const [, account] = apiMatch;
        if (!account) {
          if (method !== 'GET') throw error('Method not allowed.',405);
          if (String(req.headers.authorization || '').includes('soci_app_')) {
            const { agencyId, install } = await appBearer(req);
            return json({ subaccounts: (await listWorkspaces(agencyId)).filter(w => w.id === install.account) });
          }
          const agencyId = await bearer(req,'subaccounts.read');
          return json({ subaccounts: await listWorkspaces(agencyId) });
        }
        const agencyId = await bearer(req,method === 'POST' ? 'contacts.write' : 'contacts.read');
        if (req.appAccount && req.appAccount !== account) throw error('O token deste app só vale para a subconta onde ele foi instalado.', 403);
        const input = method === 'POST' ? await payload(req) : null;
        await requireWorkspaceAccess(await loadAgency(agencyId), { agencyId, modules: null }, account, {
          modules: ['contacts'], hide: true, reason: false
        });
        if (method !== 'POST') {
          return json({ contacts: (await store.load(account)).contacts });
        }
        const created = await change(account,{ type:'save', key:'contacts', data: input });
        return json({ id: created.id },201);
      }
      if (p.startsWith('/api/auth/')) {
        if (!auth) throw error('O login do Supabase ainda não foi configurado.',503);
        const operation = p.slice('/api/auth/'.length);
        if (operation === 'callback/google' && method === 'GET') {
          return goTo(await auth.callback(req,res,url.searchParams,async (session,next) => {
            await ready;
            const { who } = await accessContext(req,session);
            return who.owner && who.agencyId !== AGENCY_ID && !/[?#]/.test(next) ? '/app#agency/dashboard' : next;
          }));
        }
        if (operation === 'logout' && method === 'POST') {
          await auth.logout(req,res);
          return json({ ok:true });
        }
        if (operation === 'google' && method === 'POST') {
          const input = await payload(req);
          return json({ url:await auth.google(req,res,url.origin,input.next) });
        }
        throw error('Page not found.',404);
      }
      if (p === '/api/openai') {
        const session = await verifiedUser(req,res);
        if (!session) throw error('Entre na sua conta para conectar sua chave da OpenAI.',401);
        res.setHeader('Cache-Control','no-store');
        if (method !== 'POST') return json(await openAI.status(session));
        const input = await payload(req);
        if (input.action === 'connect') return json(await openAI.connect(session,input.apiKey));
        if (input.action === 'disconnect') return json(await openAI.disconnect(session));
        throw error('Escolha uma ação válida para a conexão com a OpenAI.',400);
      }
      if (p==='/api/workspaces') {
        const who = await access(req,res);
        if (method==='POST') {
          requireCapability(who, 'agency', 'Only agency users can create sub-accounts.');
          const newId = await createAccount(who, await payload(req));
          return json({id:newId,workspaces:await listWorkspaces(who.agencyId)},201);
        }
        return json({workspaces:await visibleWorkspaces(who), agency:who.agency});
      }
      if (p === '/api/social/cron' && (method === 'GET' || method === 'POST')) {
        if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) throw error('Not allowed.',401);
        return json({ published: await runAllSocial(publicBase(req)) });
      }
      // "Gerar vídeo com IA": the finished video, public (it is made to be sent).
      const aiVideo = p.match(new RegExp(`^/m/${workspaceSegment}/video/([0-9a-f-]{36})$`));
      if (aiVideo && (method === 'GET' || method === 'HEAD')) {
        await ready;
        const [, workspace, videoId] = aiVideo;
        await publicAccountPolicy(workspace);
        const row = ((await store.load(workspace)).aiVideos || []).find(item => item.id === videoId);
        if (!row) throw error('Vídeo indisponível.', 404);
        return await sendVideo(req, res, method, workspace, row, 'public, max-age=86400');
      }
      const socialFile = p.match(socialFilePath);
      if (socialFile && method === 'GET') {
        await ready;
        const [, workspace, fileId] = socialFile;
        await publicAccountPolicy(workspace);
        const state = await store.load(workspace);
        const referenced = state.socialPosts.some(post => ['in_progress', 'published'].includes(post.status) &&
          post.media?.some(item => item.fileId === fileId)) || state.files.some(f => f.id === fileId && f.public === true);
        if (referenced) {
          await publicAccountPolicy(workspace, false, 'marketing');
        } else {
          if (!localAccess && !auth?.hasSession(req)) throw error('File not found.',404);
          try { await workspaceAccess(req, res, workspace, { modules: ['media'], support: true, hide: true }); }
          catch (e) {
            if ([401, 403, 404].includes(e.status)) throw error('File not found.',404);
            throw e;
          }
        }
        const file = state.files.find(f => f.id === fileId);
        if (!file || !file.data.startsWith('data:image/')) throw error('File not found.',404);
        const { mime, bytes } = fileBytes(file.data);
        res.writeHead(200, { 'Content-Type': mime, 'Content-Length': bytes.length });
        return res.end(bytes);
      }
      const socialStart = p.match(/^\/api\/social\/connect\/([a-z]+)$/);
      const invitePage = p.match(socialInvitePath);
      if (invitePage && method === 'GET') {
        await ready;
        await publicAccountPolicy(invitePage[1], false, 'marketing');
        res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
        return send(200, 'text/html; charset=utf-8', readFileSync(resolve(root, 'ui/social-connect.html')));
      }
      const signPage = p.match(signPagePath);
      if (signPage && method === 'GET') {
        await ready;
        await publicAccountPolicy(signPage[1], false, 'payments');
        res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; img-src data: https:; frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://www.loom.com; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('X-Robots-Tag', 'noindex');
        return send(200, 'text/html; charset=utf-8', readFileSync(resolve(root, 'ui/document-sign.html')));
      }
      const signCall = p.match(signApiPath);
      if (signCall) {
        await ready;
        if (method !== 'POST') throw error('Method not allowed.',405);
        const workspace = signCall[1];
        const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);
        if (!allowSign(ip)) throw error('Muitas tentativas a partir desta conexão. Aguarde alguns minutos.',429);
        const input = await payload(req);
        const action = ['open', 'sign', 'decline', 'pay'].includes(input.action) ? input.action : '';
        if (!action) throw error('Ação inválida para este link.',400);
        const digest = documentTokenHash(input.token);
        if (!digest) throw error('Este link não é válido.',404);
        await publicAccountPolicy(workspace, action !== 'open', 'payments');
        if (action === 'pay') {
          const due = (await change(workspace, { type: 'document-payable', data: { tokenHash: digest } })).id;
          const current = await store.load(workspace), agencyId = current.agencyId || AGENCY_ID;
          if (!(await abacate.connected(agencyId, workspace))) throw error('O pagamento online ainda não está disponível. Fale com quem enviou o documento.',409);
          const page = `${publicBase(req)}/assinar/${workspace}`;
          const back = { returnUrl: `${page}?pagamento=voltou`, completionUrl: `${page}?pagamento=ok` };
          if (due.kind === 'invoice') return json({ url: (await abacate.chargeInvoice(agencyId, workspace, due.invoiceId, publicBase(req), back)).url });
          if (due.checkout) return json({ url: due.checkout.url });
          const checkout = await abacate.subscribeWorkspace(agencyId, workspace, { reference: `doc-${due.docId}`, name: due.title, amount: due.amount, ...back, metadata: { workspace, documentId: due.docId } });
          await change(workspace, { type: 'document-subscription-checkout', data: { docId: due.docId, checkout } });
          return json({ url: checkout.url });
        }
        const result = await change(workspace, { type: `document-${action}`, data: { tokenHash: digest, ip, userAgent: String(req.headers['user-agent'] || ''), origin: publicBase(req),
          values: input.values, items: input.items, accept: input.accept, reason: input.reason } });
        if (result.state.workflowOutbox?.length) flushLater(workspace);
        if (result.id?.payment) result.id.payment.online = await abacate.connected(result.state.agencyId || AGENCY_ID, workspace).catch(() => false);
        return json(result.id);
      }
      const estimatePage = p.match(estimatePagePath);
      if (estimatePage && method === 'GET') {
        await ready;
        await publicAccountPolicy(estimatePage[1], false, 'payments');
        res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; img-src data: https:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('X-Robots-Tag', 'noindex');
        return send(200, 'text/html; charset=utf-8', readFileSync(resolve(root, 'ui/estimate-view.html')));
      }
      const estimateCall = p.match(estimateApiPath);
      if (estimateCall) {
        await ready;
        if (method !== 'POST') throw error('Method not allowed.',405);
        const workspace = estimateCall[1];
        const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);
        if (!allowSign(ip)) throw error('Muitas tentativas a partir desta conexão. Aguarde alguns minutos.',429);
        const input = await payload(req);
        const action = ['open', 'accept', 'decline', 'pay'].includes(input.action) ? input.action : '';
        if (!action) throw error('Ação inválida para este link.',400);
        const digest = estimateTokenHash(input.token);
        if (!digest) throw error('Este link não é válido.',404);
        await publicAccountPolicy(workspace, action !== 'open', 'payments');
        if (action === 'pay') {
          const due = (await change(workspace, { type: 'estimate-payable', data: { tokenHash: digest } })).id;
          const current = await store.load(workspace), agencyId = current.agencyId || AGENCY_ID;
          if (!(await abacate.connected(agencyId, workspace))) throw error('O pagamento online ainda não está disponível. Fale com quem enviou o orçamento.',409);
          const page = `${publicBase(req)}/orcamento/${workspace}`;
          return json({ url: (await abacate.chargeInvoice(agencyId, workspace, due.invoiceId, publicBase(req), { returnUrl: `${page}?pagamento=voltou`, completionUrl: `${page}?pagamento=ok` })).url });
        }
        const result = await change(workspace, { type: `estimate-${action}`, data: { tokenHash: digest, ip, userAgent: String(req.headers['user-agent'] || ''), origin: publicBase(req),
          name: input.name, items: input.items, reason: input.reason } });
        if (result.state.workflowOutbox?.length) flushLater(workspace);
        if (result.id?.invoice) result.id.online = await abacate.connected(result.state.agencyId || AGENCY_ID, workspace).catch(() => false);
        return json(result.id);
      }
      const invoicePage = p.match(invoicePagePath);
      if (invoicePage && method === 'GET') {
        await ready;
        await publicAccountPolicy(invoicePage[1], false, 'payments');
        res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; img-src data: https:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('X-Robots-Tag', 'noindex');
        return send(200, 'text/html; charset=utf-8', readFileSync(resolve(root, 'ui/invoice-view.html')));
      }
      const invoiceCall = p.match(invoiceApiPath);
      if (invoiceCall) {
        await ready;
        if (method !== 'POST') throw error('Method not allowed.',405);
        const workspace = invoiceCall[1];
        const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);
        if (!allowSign(ip)) throw error('Muitas tentativas a partir desta conexão. Aguarde alguns minutos.',429);
        const input = await payload(req);
        const action = ['open', 'pay'].includes(input.action) ? input.action : '';
        if (!action) throw error('Ação inválida para este link.',400);
        const digest = invoiceTokenHash(input.token);
        if (!digest) throw error('Este link não é válido.',404);
        await publicAccountPolicy(workspace, action !== 'open', 'payments');
        if (action === 'pay') {
          const due = (await change(workspace, { type: 'invoice-payable', data: { tokenHash: digest } })).id;
          const current = await store.load(workspace), agencyId = current.agencyId || AGENCY_ID;
          if (!(await abacate.connected(agencyId, workspace))) throw error('O pagamento online ainda não está disponível. Fale com quem enviou a fatura.',409);
          const page = `${publicBase(req)}/fatura/${workspace}`;
          return json({ url: (await abacate.chargeInvoice(agencyId, workspace, due.invoiceId, publicBase(req), { returnUrl: `${page}?pagamento=voltou`, completionUrl: `${page}?pagamento=ok` })).url });
        }
        const result = await change(workspace, { type: 'invoice-open', data: { tokenHash: digest } });
        result.id.online = result.id.payable ? await abacate.connected(result.state.agencyId || AGENCY_ID, workspace).catch(() => false) : false;
        return json(result.id);
      }
      const approvePage = p.match(socialApprovePath);
      if (approvePage && method === 'GET') {
        await ready;
        await publicAccountPolicy(approvePage[1], false, 'marketing');
        res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; img-src data: https:; media-src https:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
        res.setHeader('Referrer-Policy', 'no-referrer');
        return send(200, 'text/html; charset=utf-8', readFileSync(resolve(root, 'ui/social-approve.html')));
      }
      if (p === '/api/social/approval' && method === 'POST') {
        if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Link de aprovação inválido.',404);
        const input = await payload(req);
        if (typeof input.token !== 'string' || !/^[a-f0-9]{64}$/.test(input.token)) throw error('Link de aprovação inválido.',404);
        const key = hash(input.token);
        const link = validateApproval(await socialRow(`social-${id}`), key);
        await publicAccountPolicy(id, input.action === 'decide', 'marketing');
        if (input.action === 'list') return json({ expires: link.expires, ...approvalView(await store.load(id)) });
        if (input.action === 'decide') {
          const name = String(input.name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
          if (!name) throw error('Informe seu nome para registrar a decisão.',400);
          if (!['approved', 'rejected'].includes(input.decision)) throw error('Escolha aprovar ou pedir ajustes.',400);
          if (input.decision === 'rejected' && !String(input.note || '').trim()) throw error('Conte o que precisa mudar neste post.',400);
          await change(id, { type: 'social-review', id: String(input.postId || ''), data: { decision: input.decision, note: input.note }, actor: `${name} (cliente)` });
          return json({ expires: link.expires, ...approvalView(await store.load(id)) });
        }
        throw error('Ação inválida para este link.',400);
      }
      if (p === '/api/social/invited' && method === 'POST') {
        if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Convite inválido.',404);
        const input = await payload(req);
        if (typeof input.token !== 'string' || !/^[a-f0-9]{64}$/.test(input.token)) throw error('Convite inválido.',404);
        const key = hash(input.token);
        const row = await store.load(`social-${id}`);
        const invite = validateInvite(row, key);
        await publicAccountPolicy(id, input.action !== 'info', 'marketing');
        if (input.action === 'info') return json({ expires: invite.expires, providers: availability() });
        if (input.action === 'start') return json({ url: await startSocialOAuth(req, id, input.provider, key) });
        if (input.action === 'bluesky') {
          const candidates = await blueskyLogin(input.identifier, input.password);
          return json(await inviteAttach(id, key, candidates));
        }
        if (input.action === 'candidates' || input.action === 'attach') {
          const requestId = String(input.requestId || ''), pending = row.pending[requestId];
          if (!pending || pending.inviteKey !== key || Date.parse(pending.at) < Date.now() - 30 * 60_000) throw error('Esta autorização expirou.',404);
          const candidates = unseal(pending.candidates) || [];
          const state = await store.load(id);
          if (input.action === 'candidates') return json({ candidates: candidates.map((c, index) => ({ index, provider: c.provider, name: c.name }))
            .filter((_, n) => !state.socialAccounts.some(a => a.provider === candidates[n].provider && a.externalId === candidates[n].externalId)) });
          const picks = [...new Set(Array.isArray(input.picks) ? input.picks : [])].filter(n => Number.isInteger(n) && candidates[n]);
          if (!picks.length) throw error('Escolha ao menos uma conta.',400);
          await socialSecrets(id, current => {
            validateInvite(current, key);
            if (current.pending[requestId]?.inviteKey !== key) throw error('Esta autorização expirou.',404);
            delete current.pending[requestId];
          });
          return json(await inviteAttach(id, key, picks.map(n => candidates[n])));
        }
        throw error('Ação inválida para este convite.',400);
      }
      if (socialStart && method === 'GET') {
        if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Workspace not found.',404);
        if (localAccess) req.localSocialUser = url.searchParams.get('user');
        const who = await workspaceAccess(req, res, id, { modules: ['marketing'] });
        const target = await startSocialOAuth(req, id, socialStart[1], '', socialActor(who));
        res.writeHead(302, { Location: target }); return res.end();
      }
      const socialBack = p.match(/^\/api\/social\/callback\/([a-z]+)$/);
      if (socialBack && method === 'GET') {
        const base = publicBase(req);
        res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
        let provider = socialBack[1];
        try {
          await socialRow('social-oauth');
          const nonce = url.searchParams.get('state') || '';
          const pending = await store.change('social-oauth', row => { const v = row.states[nonce]; delete row.states[nonce]; return v; });
          if (!pending || Date.parse(pending.at) < Date.now() - 15 * 60_000 || callbackPath(pending.provider) !== p) throw error('Este login expirou. Tente conectar de novo.',400);
          if (pending.inviteKey) {
            validateInvite(await store.load(`social-${pending.workspace}`), pending.inviteKey);
          } else {
            if (localAccess && pending.actor !== 'local-owner') req.localSocialUser = pending.actor;
            const who = await workspaceAccess(req, res, pending.workspace, { modules: ['marketing'] });
            if (pending.actor !== socialActor(who)) throw error('Esta autorização pertence a outra sessão.',403);
          }
          await publicAccountPolicy(pending.workspace, true, 'marketing');
          provider = pending.provider;
          if (url.searchParams.get('error')) throw error(url.searchParams.get('error_description') || 'A autorização foi cancelada.',400);
          const candidates = await socialExchange(provider, { code: url.searchParams.get('code') || '', redirectUri: base + callbackPath(provider) });
          await publicAccountPolicy(pending.workspace, true, 'marketing');
          const requestId = uid();
          await socialSecrets(pending.workspace, row => {
            for (const [k, v] of Object.entries(row.pending)) if (Date.parse(v.at) < Date.now() - 30 * 60_000) delete row.pending[k];
            if (pending.inviteKey) validateInvite(row, pending.inviteKey);
            row.pending[requestId] = { provider, at: stamp(), candidates: seal(candidates), inviteKey: pending.inviteKey || '', actor: pending.actor };
          });
          return send(200,'text/html; charset=utf-8',socialPopup(base, { requestId, provider }));
        } catch (e) {
          return send(200,'text/html; charset=utf-8',socialPopup(base, { provider, error: e.message }));
        }
      }
      if (p.startsWith('/api/social/') && method === 'POST') {
        if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Workspace not found.',404);
        const input = await payload(req), op = p.slice('/api/social/'.length);
        const who = await workspaceAccess(req, res, id, { modules: ['marketing'] });
        if (op === 'csv-preview') return json({ rows: reviewSocialCsv(await store.load(id), input).map(({ index, fields, error }) =>
          fields ? { index, status: fields.status, date: fields.scheduleDate, accounts: fields.accountIds.length } : { index, error }) });
        if (op === 'invite') {
          if (input.action === 'status') {
            const invite = (await socialRow(`social-${id}`)).invite;
            return json({ expires: invite?.expires > Date.now() ? invite.expires : null });
          }
          if (input.action === 'revoke') {
            await socialSecrets(id, row => { delete row.invite; });
            return json({ expires: null });
          }
          if (input.action !== 'create' || ![1, 24, 72, 168].includes(input.hours)) throw error('Escolha um prazo para o convite.',400);
          const token = (uid() + uid()).replaceAll('-', ''), expires = Date.now() + input.hours * 3_600_000;
          await socialSecrets(id, row => { row.invite = { hash: hash(token), expires }; });
          return json({ url: `${publicBase(req)}/social-connect/${id}#${token}`, expires });
        }
        if (op === 'interactions' || op === 'incoming-interaction') {
          const result = await change(id, { type: 'social-interaction-trigger', data: input }, who);
          return json({ ok: true, ...(typeof result?.id === 'object' ? result.id : { result: result?.id }) });
        }
        if (op === 'approval-link') {
          const current = (await socialRow(`social-${id}`)).approval;
          if (input.action === 'status') return json({ expires: current?.expires > Date.now() ? current.expires : null });
          if (input.action === 'revoke') {
            await socialSecrets(id, row => { delete row.approval; });
            return json({ expires: null });
          }
          if (input.action === 'send-whatsapp') {
            const rawPhone = String(input.phone || '').trim();
            if (!rawPhone) throw error('Informe o número de WhatsApp para envio.', 400);
            const hours = [24, 72, 168, 720].includes(Number(input.hours)) ? Number(input.hours) : 168;
            let token = '';
            let expires = current?.expires > Date.now() ? current.expires : 0;
            if (!expires || !input.url) {
              token = (uid() + uid()).replaceAll('-', '');
              expires = Date.now() + hours * 3_600_000;
              await socialSecrets(id, row => { row.approval = { hash: hash(token), expires }; });
            }
            const approvalUrl = token ? `${publicBase(req)}/aprovar/${id}#${token}` : input.url;
            const state = await store.load(id);
            const pending = state.socialPosts.filter(p => p.status === 'in_review').length;
            const brand = state.profile?.name || '';
            const defaultMsg = `Olá! ${pending ? `Há ${pending} post(s)` : 'Os próximos posts'}${brand ? ` da marca *${brand}*` : ''} aguardando sua aprovação.\n\nRevise, aprove ou solicite ajustes com um comentário por este link:\n${approvalUrl}`;
            const message = String(input.message || '').trim() || defaultMsg;
            const agencyId = state.agencyId || who.agencyId || AGENCY_ID;
            const sent = await whatsapp.sendWorkspaceText(
              agencyId, id, rawPhone, message,
              (agId, ws) => accountIsActive(agId, ws, 'conversations')
            ).catch(err => {
              throw error(err.message || 'Erro ao enviar pelo WhatsApp.', err.status || 502);
            });
            if (!sent?.sent) {
              if (sent?.reason === 'not-connected') throw error('O WhatsApp desta subconta não está conectado. Conecte em Conversas para disparar.', 400);
              if (sent?.reason === 'invalid-phone') throw error('Número de WhatsApp inválido. Digite com DDD (ex.: 11999999999).', 400);
              throw error('Não foi possível enviar a mensagem por WhatsApp.', 502);
            }
            return json({ ok: true, sent: true, phone: rawPhone, expires, url: approvalUrl });
          }
          if (input.action !== 'create' || ![24, 72, 168, 720].includes(input.hours)) throw error('Escolha um prazo para o link de aprovação.',400);
          const token = (uid() + uid()).replaceAll('-', ''), expires = Date.now() + input.hours * 3_600_000;
          await socialSecrets(id, row => { row.approval = { hash: hash(token), expires }; });
          return json({ url: `${publicBase(req)}/aprovar/${id}#${token}`, expires });
        }
        if (op === 'ai') {
          captionRequest(input);
          input.voice = await brandVoiceOf(id);
          const status = who.session ? await openAI.status(who.session) : { configured: false };
          if (!status.configured) throw error('Conecte a OpenAI em Visão da agência → Configurações → OpenAI para gerar legendas com IA.',409);
          return json(await meteredAI(who, id, 'social', connection => content.writeCaption(connection, input)));
        }
        const withState = async extra => {
          const state = await store.load(id);
          return json({ ...workspaceView(who, state), ...extra });
        };
        if (op === 'candidates' || op === 'attach') {
          const row = await socialRow(`social-${id}`), pending = row.pending[String(input.requestId || '')];
          if (!pending || pending.inviteKey || pending.actor !== socialActor(who) ||
              Date.parse(pending.at) < Date.now() - 30 * 60_000) throw error('Esta autorização expirou. Conecte a conta de novo.',404);
          const candidates = unseal(pending.candidates) || [];
          if (op === 'candidates') {
            const state = await store.load(id);
            return json({ provider: pending.provider, candidates: candidates.map((c, index) => ({ index, provider: c.provider, name: c.name, handle: c.handle || '', avatar: c.avatar || '', kind: c.kind || '',
              connected: state.socialAccounts.some(a => a.provider === c.provider && a.externalId === c.externalId) })) });
          }
          const picks = [...new Set((Array.isArray(input.picks) ? input.picks : []).map(Number))].filter(n => candidates[n]);
          if (!picks.length) throw error('Escolha ao menos uma conta.',400);
          const chosen = picks.map(n => candidates[n]);
          const ids = await store.change(id, s => attachAccounts(s, chosen, { uid, now: stamp }));
          await socialSecrets(id, r => { ids.forEach((accountId, n) => { r.tokens[accountId] = seal(chosen[n].secret); }); delete r.pending[input.requestId]; });
          if (chosen.some(row => ['facebook', 'instagram'].includes(row.provider))) await routeMetaAccounts(id).catch(problem => console.error(`Meta routes (${id}): ${problem.message}`));
          return withState({ id: ids });
        }
        if (op === 'bluesky') {
          const [found] = await blueskyLogin(input.identifier, input.password);
          const [accountId] = await store.change(id, s => attachAccounts(s, [found], { uid, now: stamp }));
          await socialSecrets(id, r => { r.tokens[accountId] = seal(found.secret); });
          return withState({ id: accountId });
        }
        if (op === 'run') { const published = await runSocial(id, publicBase(req)); return withState({ published }); }
        if (op === 'disconnect') {
          await change(id, { type: 'social-account-remove', id: String(input.id || '') });
          await socialSecrets(id, r => { delete r.tokens[input.id]; });
          await routeMetaAccounts(id).catch(problem => console.error(`Meta routes (${id}): ${problem.message}`));
          return withState({});
        }
        throw error('Unknown social request.',404);
      }
      if (p==='/api/state' && method!=='POST') {
        if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Workspace not found.',404);
        const { agency, who: actor } = await accessContext(req,await verifiedUser(req,res));
        const isPersonal = privateSpace.test(id);
        const who = await requireWorkspaceAccess(agency, actor, id, { support: true });
        const studio = hasModule(who, 'sites'), agents = hasModule(who, 'ai-agents'), marketing = hasModule(who, 'marketing'), reputation = hasModule(who, 'reputation');
        const [state, workspaces, aiStatus] = await Promise.all([
          store.load(id), visibleWorkspaces(who), !who.support && (studio || agents || marketing || reputation) ? openAI.status(who.session) : null
        ]);
        const account = workspaces.find(w => w.id === id)?.name || id;
        const audit = !isPersonal && (who.support || hasModule(who, 'settings')) ? agency.audit.filter(a => a.target === account || a.target === id).slice(-200) : [];
        if (who.support) await changeAgency(who.agencyId, current => logTo(current, who, 'Sub-account support viewed', id, who.account.status));
        return json({ ...workspaceView(who, state), workspaces,
          features:{studioAI: Boolean(aiStatus?.configured && studio), socialAI: Boolean(aiStatus?.configured && marketing), contentAI: Boolean((aiStatus?.configured || (localAccess && contentAI)) && (marketing || studio)), reviewAI: Boolean((aiStatus?.configured || (localAccess && contentAI)) && reputation), reportEmail: reportMail.configured, social: marketing ? availability() : {}, agentModel: aiStatus?.configured && agents ? agentModel : ''},
          agency:agencyForWorkspace(isPersonal ? blankAgency() : agency,id,who.settings),
          ...(who.support && { account: { ...who.account, support: true, statusHistory: agency.accounts[id]?.statusHistory || [],
            ignoredWebhooks: agency.accounts[id]?.ignoredWebhooks || {} } }),
          access:{agency:who.agency,modules:who.modules,name:who.name,session:who.session},audit});
      }
      // Dry run of a workflow draft for one contact, on a copy of the workspace: nothing is saved or sent.
      if (p==='/api/workflow-test' && method==='POST') {
        if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Workspace not found.',404);
        const body = await payload(req);
        await workspaceAccess(req, res, id, { modules: ['automation'] });
        const copy = structuredClone(await store.load(id));
        return json({ result: execute(copy, { type: 'workflow-test', data: body }) });
      }
      if (p==='/api/media/import' && method==='POST') {
        if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Workspace not found.',404);
        const input = await payload(req);
        const who = await workspaceAccess(req, res, id);
        requireWorkspaceCommand(who, { type:'save', key:'files' });
        if (typeof input.url !== 'string' || !input.url.trim() || input.url.length > 2000) throw error('Cole o link do arquivo.',400);
        const address = input.url.trim();
        let response;
        try { response = await fetchMedia(address, { maxBytes: mediaLimitBytes + 1, timeout: 10000 }); }
        catch (e) { throw error(['EINVALID','EBLOCKED'].includes(e.code) ? 'Use um link público que comece com https://.' : 'Não foi possível baixar o arquivo desse link.', 422); }
        const file = importedFile(response, address);
        const result = await change(id, { type:'save', key:'files', data:{ ...file, folderId: typeof input.folderId === 'string' ? input.folderId : '' } }, who);
        return json({ id: result.id, ...workspaceView(who, result.state) });
      }
      // Marketing → Rastreamento: the GA4 Measurement Protocol API secret. Write-only: sealed in the ads-<workspace> row,
      // never sent back; the sub-account state only says whether it is set. An empty value removes it.
      if (p==='/api/tracking/ga4-secret' && method==='POST') {
        if (!spaceId.test(id)) throw error('Workspace not found.',404);
        const who = await workspaceAccess(req, res, id, { modules: ['settings'] });
        const input = await payload(req);
        const secret = typeof input?.secret === 'string' ? input.secret.trim() : '';
        if (secret && !/^[\w-]{8,64}$/.test(secret)) throw error('Segredo da API do GA4 inválido.', 400);
        await socialRow(`ads-${id}`);
        await store.change(`ads-${id}`, row => { if (secret) row.ga4Secret = seal(secret); else delete row.ga4Secret; });
        const result = await change(id, { type: 'tracking-ga4-secret', data: { set: Boolean(secret) } });
        return json(workspaceView(who, result.state));
      }
      if (p==='/api/action' && method==='POST') {
        if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Workspace not found.',404);
        const command = await payload(req);
        const who = await workspaceAccess(req, res, id);
        requireWorkspaceCommand(who, command);
        command.actor = who.name;
        // Whose OpenAI key the workflow's AI steps use: always the saving user, never a value from the client.
        if (command.type === 'save' && command.key === 'workflows' && command.data && typeof command.data === 'object') {
          // "Copiar contato": whoever saves the workflow must be able to open the target sub-account's contacts.
          const targets = new Set();
          eachStep(Array.isArray(command.data.steps) ? command.data.steps : [], step => { if (step?.type === 'copy_contact' && step.config?.workspace) targets.add(String(step.config.workspace)); });
          for (const target of targets) {
            if (target === id) throw error('Copiar contato: escolha outra subconta como destino.', 400);
            await workspaceAccess(req, res, target, { modules: ['contacts'] }).catch(() => { throw error('Copiar contato: seu usuário não tem acesso aos contatos da subconta de destino.', 403); });
          }
          command.data = { ...command.data, aiKey: who.session ? { session: who.session.id, user: who.userId || '', agency: who.agencyId || '' } : null };
        }
        if (command.type === 'phone-number-save' && command.data && typeof command.data === 'object') {
          command.data = { ...command.data, voiceKey: command.data.mode === 'voice_ai' && who.session ? { session: who.session.id, user: who.userId || '', agency: who.agencyId || '' } : null };
        }
        if (['document-send', 'document-link', 'estimate-send', 'estimate-link', 'invoice-send', 'invoice-from-template', 'checkout-remind', 'email-campaign-schedule', 'message', 'review-request', 'reputation-settings'].includes(command.type)) command.data = { ...(command.data && typeof command.data === 'object' ? command.data : {}), origin: publicBase(req) };
        const removedVideo = command.type === 'delete' && command.key === 'videoTestimonials' ? (await store.load(id)).videoTestimonials?.find(row => row.id === command.id) : null;
        const result = await change(id,command,who);
        if (removedVideo) for (let index = 0; index < removedVideo.chunks; index++) await Promise.resolve().then(() => store.change(mediaRowId(id, removedVideo.id, index), row => { row.data = ''; row.deleted = true; })).catch(() => {});
        let delivery = null;
        let state = result.state;
        if (!privateSpace.test(id) && command.type === 'message' && command.data?.channel === 'WhatsApp' && command.data?.direction === 'Outbound') {
          const contact = state.contacts.find(c => c.id === command.data.contactId);
          // An undelivered message is marked and fires "Falha no envio de mensagem"; the provider error still reaches the user.
          const failed = async reason => {
            const marked = await change(id, { type: 'message-failed', data: { messageId: result.id, reason } });
            state = marked.state;
            if (state.workflowOutbox?.length) flushLater(id);
          };
          if (!contact?.phone) await failed('no_phone');
          else {
            // The stored body: trigger links already replaced by this contact's tracked URLs.
            const sentBody = state.messages.find(m => m.id === result.id)?.body || command.data.body;
            try {
              delivery = await whatsapp.sendWorkspaceText(who.agencyId, id, contact.phone, sentBody,
                (agencyId, workspace) => accountIsActive(agencyId, workspace, 'conversations'));
            } catch (err) { await failed('provider_error').catch(() => {}); throw err; }
            if (!delivery.sent) await failed(deliveryFailure(delivery.reason));
          }
        }
        // A team e-mail in Conversas goes out from the sub-account's sending domain (or the platform address).
        if (!privateSpace.test(id) && command.type === 'message' && command.data?.channel === 'Email' && command.data?.direction === 'Outbound') {
          const contact = state.contacts.find(c => c.id === command.data.contactId);
          const row = state.messages.find(m => m.id === result.id);
          let reason = '';
          if (!contact?.email) reason = 'no_email';
          else {
            const outcome = await documentMail.email(contact.email, { subject: row?.subject || `Mensagem de ${state.profile?.name || 'Soci'}`, text: row?.body || String(command.data.body || '') },
              `team-email-${id}-${result.id}`, { fromName: state.profile?.name || '', fromAddress: await sendingAddress(id), replyTo: inboundAddress(id) }).catch(problem => problem.message);
            if (!mailSent(outcome)) reason = /não configurado/.test(String(outcome)) ? 'not_connected' : 'provider_error';
          }
          delivery = { sent: !reason, ...(reason ? { reason } : {}) };
          if (reason) {
            const marked = await change(id, { type: 'message-failed', data: { messageId: result.id, reason } });
            state = marked.state;
            if (state.workflowOutbox?.length) flushLater(id);
          }
        }
        // A team reply on Messenger or Direct goes out through the page the contact wrote to.
        if (!privateSpace.test(id) && command.type === 'message' && ['Facebook', 'Instagram'].includes(command.data?.channel) && command.data?.direction === 'Outbound') {
          const contact = state.contacts.find(c => c.id === command.data.contactId);
          const network = command.data.channel === 'Facebook' ? 'facebook' : 'instagram';
          const sentBody = state.messages.find(m => m.id === result.id)?.body || command.data.body;
          const sent = await deliverMetaMessage(id, state, { network, recipients: contact?.metaIds || {}, body: sentBody }).catch(() => ({ sent: false, reason: 'provider_error' }));
          delivery = { sent: Boolean(sent.sent), ...(sent.sent ? {} : { reason: sent.reason }) };
          if (!sent.sent) {
            const marked = await change(id, { type: 'message-failed', data: { messageId: result.id, reason: sent.reason } });
            state = marked.state;
            if (state.workflowOutbox?.length) flushLater(id);
          }
        }
        if (!privateSpace.test(id) && ['save','delete','import','opportunity-import','opportunity-move','pipeline','pipeline-settings','pipeline-duplicate','pipeline-delete','stage-delete','smart-tag','smart-tag-delete','profile','bulk','workflow-enroll','workflow-restore','workflow-move'].includes(command.type)) {
          const account = (await listWorkspaces(who.agencyId)).find(w => w.id === id)?.name || id;
          const label = command.type === 'bulk' ? `Bulk ${command.data?.operation || ''} on ${command.data?.object || ''}`.trim() : '';
          await recordAudit(who, command.type === 'delete' ? `Deleted ${command.key}` : command.type === 'save' ? `Saved ${command.key}` : label || `Ran ${command.type}`, account);
        }
        if (state.workflowOutbox?.length) flushLater(id);
        if (command.type === 'email-campaign-schedule') emailLater(id);
        return json({ id: result.id, ...workspaceView(who, state), ...(delivery ? { delivery } : {}) });
      }
      if (p==='/api/agency' && method!=='POST') {
        return json(await agencyPayload(req,res));
      }
      if (p.startsWith('/api/agency/') && method==='POST') {
        const who = await access(req,res);
        requireCapability(who, 'agency', 'Seu usuário não pode abrir a visualização da agência.');
        const op = p.slice('/api/agency/'.length), body = await payload(req);
        const result = await agencyRequest(op, who, body);
        // Opening a sub-account only stamps lastLogin; skip rebuilding the full agency payload (it loads every sub-account).
        if (op === 'action' && body?.type === 'account-open') return json({ result });
        return json(await agencyPayload(req,res, { result }));
      }
      if (p.startsWith('/api/abacatepay/webhook/') && method === 'POST') {
        await ready;
        return await abacate.handleWebhook({ req, url, json, listWorkspaces, changeAgency,
          onWalletTopup: async (agencyId, { workspace, checkoutId, method }) => {
            const owned = (await listWorkspaces(agencyId)).map(w => w.id);
            for (const candidate of workspace ? [workspace].filter(item => owned.includes(item)) : owned) {
              const credited = await store.change(candidate, s => paidTopup(s, { checkoutId, method }));
              if (credited) { flushLater(candidate); return credited; }
            }
            return false;
          },
          onInvoicePaid: async (workspace, invoice) => {
            if (invoice.offerId && !invoice.offerGrantedAt) await grantOffer(workspace, invoice.offerId, invoice.contactId, invoice.id);
            if (invoice.eventTicket && !invoice.ticketGrantedAt) await grantEventTicket(workspace, invoice);
            if (invoice.communityPlan) await community.grantPlan(workspace, await store.load(workspace), invoice.communityPlan, invoice.id);
            flushLater(workspace);
          } });
      }
      if (p.startsWith('/api/abacatepay/agency/')) {
        const who = await access(req, res);
        requireCapability(who, 'settings', 'Seu usuário não pode gerenciar a cobrança da agência.');
        const op = p.slice('/api/abacatepay/agency/'.length).replace(/\/+$/, ''), origin = publicBase(req), scope = abacate.AGENCY_SCOPE;
        if (op === 'status' && method === 'GET') return json(await abacate.status(who.agencyId, scope, origin));
        if (method !== 'POST') throw error('Method not allowed.', 405);
        const body = await payload(req);
        if (op === 'connect') {
          const view = await abacate.connect(who.agencyId, scope, body.apiKey, origin);
          await recordAudit(who, 'AbacatePay conectado', view.storeName || 'Agência');
          return json(view);
        }
        if (op === 'disconnect') {
          const view = await abacate.disconnect(who.agencyId, scope, origin);
          await recordAudit(who, 'AbacatePay desconectado', 'Agência');
          return json(view);
        }
        if (op === 'subscribe' || op === 'cancel') {
          const workspace = String(body.workspace || '');
          if (!(await listWorkspaces(who.agencyId)).some(w => w.id === workspace)) throw error('Subconta não encontrada.', 404);
          const agency = await loadAgency(who.agencyId);
          const meta = agency.accounts[workspace] || {};
          if (op === 'subscribe') {
            if (meta.billing?.provider === 'abacatepay' && ['Active', 'Trial'].includes(meta.billing.status)) throw error('Esta subconta já tem uma assinatura ativa. Cancele antes de gerar outra.', 409);
            const billing = await abacate.subscribe(who.agencyId, workspace, agency.plans.find(plan => plan.id === meta.plan), origin);
            await changeAgency(who.agencyId, current => { current.accounts[workspace] = { ...(current.accounts[workspace] || {}), billing }; });
            await recordAudit(who, 'Assinatura AbacatePay gerada', meta.name || workspace, billing.planName);
            return json(await agencyPayload(req, res, { result: billing }));
          }
          await abacate.cancelSubscription(who.agencyId, meta.billing);
          await changeAgency(who.agencyId, current => {
            const billing = current.accounts[workspace]?.billing;
            if (billing) Object.assign(billing, { status: 'Cancelled', cancelledAt: stamp(), updatedAt: stamp() });
          });
          await recordAudit(who, 'Assinatura AbacatePay cancelada', meta.name || workspace);
          return json(await agencyPayload(req, res));
        }
        throw error('Not found.', 404);
      }
      // Anúncios: OAuth of Meta Ads / Google Ads, account choice, sync, campaign changes and Meta ad creation.
      if (p === adsCallbackPath && method === 'GET') {
        const base = publicBase(req);
        res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
        try {
          await socialRow('ads-oauth');
          const nonce = url.searchParams.get('state') || '';
          const pending = await store.change('ads-oauth', row => { const v = row.states[nonce]; delete row.states[nonce]; return v; });
          if (!pending || Date.parse(pending.at) < Date.now() - 15 * 60_000) throw error('Este login expirou. Tente conectar de novo.',400);
          if (localAccess && pending.actor !== 'local-owner') req.localSocialUser = pending.actor;
          const who = await workspaceAccess(req, res, pending.workspace, { modules: ['marketing'] });
          if (pending.actor !== socialActor(who)) throw error('Esta autorização pertence a outra sessão.',403);
          if (url.searchParams.get('error')) throw error('A autorização foi cancelada.',400);
          const network = pending.network, label = network === 'meta' ? 'Meta Ads' : 'Google Ads';
          const found = await adsExchange(network, { code: url.searchParams.get('code') || '', redirectUri: base + adsCallbackPath });
          const rowId = `ads-${pending.workspace}`;
          await socialRow(rowId);
          const accountId = await store.change(rowId, row => {
            const prior = row[network] || {};
            const keep = (list, value) => list.some(item => item.id === value) ? value : '';
            row[network] = { token: seal(found.secret), user: found.user, accounts: found.accounts, pages: found.pages || [], connectedAt: stamp(),
              accountId: keep(found.accounts, prior.accountId) || (found.accounts.length === 1 ? found.accounts[0].id : ''),
              pageId: keep(found.pages || [], prior.pageId) || (found.pages?.length === 1 ? found.pages[0].id : '') };
            return row[network].accountId;
          });
          await store.change(pending.workspace, s => markAdConnection(s, network, true));
          await recordAudit(who, `${label} conectado`, found.user || pending.workspace).catch(() => {});
          if (accountId) runAds(pending.workspace, network, { full: true }).catch(() => {});
          return send(200,'text/html; charset=utf-8',adsPopup(base, { network }));
        } catch (e) {
          return send(200,'text/html; charset=utf-8',adsPopup(base, { error: e.message }));
        }
      }
      if (p.startsWith('/api/ads/workspace/')) {
        if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Subconta não encontrada.', 404);
        const op = p.slice('/api/ads/workspace/'.length).replace(/\/+$/, '');
        const who = await workspaceAccess(req, res, id, { modules: ['marketing'] });
        const rowId = `ads-${id}`;
        if (op === 'connect' && method === 'GET') {
          const network = url.searchParams.get('network');
          if (!['meta', 'google'].includes(network)) throw error('Escolha a rede de anúncios.', 400);
          const nonce = uid();
          const target = adsAuthUrl(network, { redirectUri: publicBase(req) + adsCallbackPath, state: nonce });
          await socialRow('ads-oauth');
          await store.change('ads-oauth', row => {
            for (const [k, v] of Object.entries(row.states)) if (Date.parse(v.at) < Date.now() - 15 * 60_000) delete row.states[k];
            row.states[nonce] = { workspace: id, network, at: stamp(), actor: socialActor(who) };
          });
          res.writeHead(302, { Location: target }); return res.end();
        }
        if (op === 'status' && method === 'GET') return json(adsView(await socialRow(rowId)));
        if (method !== 'POST') throw error('Method not allowed.', 405);
        const body = await payload(req);
        const net = ['meta', 'google'].includes(body.network) ? body.network : null;
        if (!net) throw error('Escolha a rede de anúncios.', 400);
        const label = net === 'meta' ? 'Meta Ads' : 'Google Ads';
        const reply = async extra => json({ ...workspaceView(who, await store.load(id)), ads: adsView(await socialRow(rowId)), ...extra });
        if (op === 'select') {
          await socialRow(rowId);
          const changed = await store.change(rowId, row => {
            const a = row[net];
            if (!a?.token) throw error(`Conecte o ${label} primeiro.`, 409);
            let moved = false;
            if (body.accountId !== undefined) {
              if (!a.accounts.some(item => item.id === body.accountId)) throw error('Escolha uma conta de anúncios desta conexão.', 400);
              moved = a.accountId !== body.accountId; a.accountId = body.accountId;
            }
            if (body.pageId !== undefined) {
              if (body.pageId && !(a.pages || []).some(item => item.id === body.pageId)) throw error('Escolha uma Página desta conexão.', 400);
              a.pageId = body.pageId;
            }
            return moved;
          });
          if (changed) {
            // Another ad account: its numbers replace the old account's.
            await store.change(id, s => { s.adCampaigns = (s.adCampaigns || []).filter(c => c.network !== net); s.adStats = (s.adStats || []).filter(r => r.network !== net); delete adSettingsOf(s).lastSync[net]; });
            const synced = await runAds(id, net, { full: true }).then(() => '', e => e.message);
            return reply({ syncError: synced });
          }
          return reply({});
        }
        if (op === 'sync') return reply({ synced: await runAds(id, net, { full: body.full === true }) });
        if (op === 'campaign') {
          const camp = (await store.load(id)).adCampaigns?.find(c => c.network === net && c.id === String(body.id || ''));
          if (!camp) throw error('Campanha não encontrada. Sincronize de novo.', 404);
          const { secret, account } = await adsAccess(id, net);
          if (body.action === 'pause' || body.action === 'activate') {
            const on = body.action === 'activate';
            await setCampaignStatus(net, secret, account, camp.id, on);
            await store.change(id, s => patchAdCampaign(s, net, camp.id, { status: on ? 'active' : 'paused', rawStatus: on ? (net === 'meta' ? 'ACTIVE' : 'ENABLED') : 'PAUSED' }));
            await recordAudit(who, `Campanha ${on ? 'ativada' : 'pausada'} (${label})`, camp.name).catch(() => {});
          } else if (body.action === 'budget') {
            await setCampaignBudget(net, secret, account, camp, body.budget);
            await store.change(id, s => patchAdCampaign(s, net, camp.id, { budget: Math.round(Number(body.budget) * 100) / 100 }));
            await recordAudit(who, `Orçamento da campanha alterado (${label})`, `${camp.name}: ${body.budget}`).catch(() => {});
          } else throw error('Ação inválida.', 400);
          return reply({});
        }
        if (op === 'create') {
          if (net !== 'meta') throw error('A criação de anúncios pelo Soci está disponível para o Meta Ads.', 400);
          const { ad, image } = metaAdInput(await store.load(id), body);
          const { secret, account, page } = await adsAccess(id, 'meta');
          if (!page) throw error('Escolha a Página do Facebook que vai assinar o anúncio.', 409);
          const created = await createMetaAd(secret, account, page, ad, image);
          await recordAudit(who, 'Anúncio criado no Meta Ads (pausado)', ad.name).catch(() => {});
          await runAds(id, 'meta').catch(() => null);
          return reply({ created });
        }
        if (op === 'disconnect') {
          await socialRow(rowId);
          await store.change(rowId, row => { delete row[net]; });
          await store.change(id, s => markAdConnection(s, net, false));
          await recordAudit(who, `${label} desconectado`, id).catch(() => {});
          return reply({});
        }
        throw error('Not found.', 404);
      }
      if (p === googleCallbackPath && method === 'GET') {
        const base = publicBase(req);
        res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
        try {
          await socialRow('google-oauth');
          const nonce = url.searchParams.get('state') || '';
          const pending = await store.change('google-oauth', row => { const v = row.states[nonce]; delete row.states[nonce]; return v; });
          if (!pending || Date.parse(pending.at) < Date.now() - 15 * 60_000) throw error('Este login expirou. Tente conectar de novo.',400);
          if (localAccess && pending.actor !== 'local-owner') req.localSocialUser = pending.actor;
          const who = await workspaceAccess(req, res, pending.workspace, { modules: ['settings'] });
          if (pending.actor !== socialActor(who)) throw error('Esta autorização pertence a outra sessão.',403);
          if (url.searchParams.get('error')) throw error(url.searchParams.get('error') === 'access_denied' ? 'A autorização foi cancelada.' : 'O Google recusou a autorização.',400);
          const found = await exchangeGoogle({ code: url.searchParams.get('code') || '', redirectUri: base + googleCallbackPath });
          await socialRow(`google-${pending.workspace}`);
          await store.change(`google-${pending.workspace}`, row => {
            const prior = row.google || {};
            const keep = (list, value) => list.some(item => item.id === value) ? value : '';
            row.google = { token: seal(found.secret), email: found.email, properties: found.properties, locations: found.locations, sites: found.sites || [], errors: found.errors,
              gscSite: keep(found.sites || [], prior.gscSite) || (found.sites?.length === 1 ? found.sites[0].id : ''),
              connectedAt: stamp(), gaProperty: keep(found.properties, prior.gaProperty) || (found.properties.length === 1 ? found.properties[0].id : ''),
              gbpLocation: keep(found.locations, prior.gbpLocation) || (found.locations.length === 1 ? found.locations[0].id : '') };
          });
          googleCache.delete(pending.workspace); searchCache.delete(pending.workspace);
          await recordAudit(who, 'Google conectado', found.email || pending.workspace).catch(() => {});
          return send(200,'text/html; charset=utf-8',googlePopup(base, {}));
        } catch (e) {
          return send(200,'text/html; charset=utf-8',googlePopup(base, { error: e.message }));
        }
      }
      if (p.startsWith('/api/google/workspace/')) {
        if (!spaceId.test(id)) throw error('Subconta não encontrada.', 404);
        const op = p.slice('/api/google/workspace/'.length).replace(/\/+$/, '');
        const manage = ['connect', 'select', 'disconnect'].includes(op);
        const who = await workspaceAccess(req, res, id, manage ? { modules: ['settings'] } : {});
        const rowId = `google-${id}`;
        if (op === 'connect' && method === 'GET') {
          const nonce = uid();
          const target = googleAuthUrl({ redirectUri: publicBase(req) + googleCallbackPath, state: nonce });
          await socialRow('google-oauth');
          await store.change('google-oauth', row => {
            for (const [k, v] of Object.entries(row.states)) if (Date.parse(v.at) < Date.now() - 15 * 60_000) delete row.states[k];
            row.states[nonce] = { workspace: id, at: stamp(), actor: socialActor(who) };
          });
          res.writeHead(302, { Location: target }); return res.end();
        }
        if (op === 'status' && method === 'GET') {
          const row = await socialRow(rowId);
          const view = googleView(row, hasModule(who, 'settings'));
          if (url.searchParams.get('data') === '1' && view.connected) view.data = await googleData(id, row);
          return json(view);
        }
        if (method !== 'POST') throw error('Method not allowed.', 405);
        const body = await payload(req);
        if (op === 'select') {
          await socialRow(rowId);
          await store.change(rowId, row => {
            if (!row.google?.token) throw error('Conecte uma conta Google primeiro.', 409);
            const pick = (list, value) => value === '' || list.some(item => item.id === value) ? value : null;
            const ga = pick(row.google.properties, String(body.gaProperty ?? row.google.gaProperty ?? ''));
            const gbp = pick(row.google.locations, String(body.gbpLocation ?? row.google.gbpLocation ?? ''));
            const gsc = pick(row.google.sites || [], String(body.gscSite ?? row.google.gscSite ?? ''));
            if (ga === null || gbp === null || gsc === null) throw error('Escolha uma propriedade, um local e um site desta conta Google.', 400);
            Object.assign(row.google, { gaProperty: ga, gbpLocation: gbp, gscSite: gsc });
          });
          googleCache.delete(id); searchCache.delete(id);
          const row = await store.load(rowId);
          return json({ ...googleView(row, true), data: await googleData(id, row) });
        }
        if (op === 'disconnect') {
          const row = await socialRow(rowId);
          if (row.google?.token) await revokeGoogle(unseal(row.google.token));
          await store.change(rowId, r => { delete r.google; });
          googleCache.delete(id); searchCache.delete(id);
          await recordAudit(who, 'Google desconectado', id).catch(() => {});
          return json(googleView(await store.load(rowId), true));
        }
        throw error('Not found.', 404);
      }
      if (p === '/api/email/campaign/test' && method === 'POST') {
        if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Workspace not found.', 404);
        const who = await workspaceAccess(req, res, id, { modules: ['marketing'] });
        const body = await payload(req);
        const to = String(body.to || '').trim().toLowerCase();
        if (!/^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z0-9-]{2,}$/i.test(to)) throw error('Informe um e-mail válido para o teste.', 400);
        const at = Date.now(), hits = (testHits.get(id) || []).filter(time => time > at - 3600_000);
        if (hits.length >= 20) throw error('Limite de 20 e-mails de teste por hora atingido. Tente mais tarde.', 429);
        testHits.set(id, [...hits, at]);
        const state = await store.load(id), design = normalizeDesign(body);
        if (!design.blocks.length) throw error('O e-mail está vazio.', 400);
        const contact = state.contacts.find(row => row.email) || { name: 'Ana Souza', email: to, company: 'Exemplo' };
        const values = mergeValues(contact, state.profile), business = state.profile?.name || '';
        const testOrigin = publicBase(req), sentAt = Math.floor(Date.now() / 1000);
        const { html, text } = renderEmail({ ...design, preheader: fillText(String(body.preheader || ''), values), business, values,
          countdownSrc: timerId => `${testOrigin}/cd/${id}/${timerId}.gif?s=${sentAt}` });
        await campaignMail.sendTest({ to, subject: fillText(String(body.subject || '').slice(0, 200), values) || '(sem assunto)', html, text,
          fromName: String(body.fromName || '').slice(0, 80) || business, replyTo: /^[^\s@<>"]+@[^\s@<>"]+$/.test(body.replyTo || '') ? body.replyTo : '', fromAddress: await sendingAddress(id) });
        await recordAudit(who, 'E-mail de teste enviado', to).catch(() => {});
        return json({ ok: true, to });
      }
      if (p.startsWith('/api/email/workspace/')) {
        if (!spaceId.test(id)) throw error('Subconta não encontrada.', 404);
        const op = p.slice('/api/email/workspace/'.length).replace(/\/+$/, '');
        const who = await workspaceAccess(req, res, id, { modules: ['settings'] });
        const rowId = `email-${id}`;
        const view = row => emailDomainView(row, { configured: emailDomainApi.configured, platformFrom: process.env.PORTAL_EMAIL_FROM || '' });
        // Copies Resend's view of the domain (status and per-record status) into the row.
        const refresh = async () => {
          const row = await socialRow(rowId), d = row.emailDomain;
          if (!d) return row;
          const live = await emailDomainApi.get(d.id);
          await store.change(rowId, r => { if (r.emailDomain?.id === d.id) r.emailDomain = applyDomainStatus(r.emailDomain, live, stamp()); });
          return store.load(rowId);
        };
        if (op === 'status' && method === 'GET') {
          const row = await socialRow(rowId);
          if (!row.emailDomain || row.emailDomain.status === 'verified' || !emailDomainApi.configured) return json(view(row));
          try { return json(view(await refresh())); } catch (e) { return json({ ...view(row), problem: e.message }); }
        }
        if (method !== 'POST') throw error('Method not allowed.', 405);
        const body = await payload(req);
        if (op === 'add') {
          if ((await socialRow(rowId)).emailDomain) throw error('Esta subconta já tem um domínio de envio. Remova o atual para trocar.', 409);
          const localPart = normalizeLocalPart(body.localPart ?? 'contato');
          const live = await emailDomainApi.add(body.domain);
          let clash = false;
          await store.change(rowId, r => {
            if (r.emailDomain) { clash = true; return; }
            r.emailDomain = { ...live, localPart, addedAt: stamp(), checkedAt: stamp(), verifiedAt: live.status === 'verified' ? stamp() : '' };
          });
          if (clash) { await emailDomainApi.remove(live.id).catch(() => {}); throw error('Esta subconta já tem um domínio de envio. Remova o atual para trocar.', 409); }
          await recordAudit(who, 'Domínio de envio adicionado', live.name).catch(() => {});
          return json(view(await store.load(rowId)));
        }
        if (op === 'verify') {
          const row = await socialRow(rowId);
          if (!row.emailDomain) throw error('Adicione um domínio de envio primeiro.', 409);
          await emailDomainApi.verify(row.emailDomain.id);
          return json(view(await refresh()));
        }
        if (op === 'save') {
          const localPart = normalizeLocalPart(body.localPart);
          await socialRow(rowId);
          await store.change(rowId, r => {
            if (!r.emailDomain) throw error('Adicione um domínio de envio primeiro.', 409);
            r.emailDomain.localPart = localPart;
          });
          return json(view(await store.load(rowId)));
        }
        if (op === 'remove') {
          const row = await socialRow(rowId);
          if (row.emailDomain) {
            await emailDomainApi.remove(row.emailDomain.id);
            await store.change(rowId, r => { delete r.emailDomain; });
            await recordAudit(who, 'Domínio de envio removido', row.emailDomain.name).catch(() => {});
          }
          return json(view(await store.load(rowId)));
        }
        throw error('Not found.', 404);
      }
      if (p.startsWith('/api/abacatepay/workspace/')) {
        if (!spaceId.test(id)) throw error('Subconta não encontrada.', 404);
        const op = p.slice('/api/abacatepay/workspace/'.length).replace(/\/+$/, ''), origin = publicBase(req);
        const who = await workspaceAccess(req, res, id, { modules: op === 'connect' || op === 'disconnect' ? ['settings', 'payments'] : ['payments'] });
        if (op === 'status' && method === 'GET') {
          const view = await abacate.status(who.agencyId, id, origin);
          return json(hasModule(who, 'settings') ? view : { ...view, webhookSecret: undefined });
        }
        if (method !== 'POST') throw error('Method not allowed.', 405);
        const body = await payload(req);
        if (op === 'connect') return json(await abacate.connect(who.agencyId, id, body.apiKey, origin));
        if (op === 'disconnect') return json(await abacate.disconnect(who.agencyId, id, origin));
        if (op === 'charge') {
          const payment = await abacate.chargeInvoice(who.agencyId, id, String(body.invoiceId || ''), origin);
          return json({ payment, ...workspaceView(who, await store.load(id)) });
        }
        throw error('Not found.', 404);
      }
      if (p.startsWith('/api/whatsapp/webhook/') && method === 'POST') {
        return await whatsapp.handleWebhook({ req, url, payload, listWorkspaces, webhookBlockReason, json, onStored: flushLater });
      }
      const appHook = p.match(/^\/api\/connectors\/hook\/(demo|[0-9a-f-]{36})\/([a-z_]{2,40})\/([\w-]{20,80})$/);
      if (appHook && method === 'POST') {
        await ready;
        const [, workspace, appId, token] = appHook;
        let size = 0; const chunks = [];
        for await (const chunk of req) { size += chunk.length; if (size > 1_000_000) throw error('Payload too large.', 413); chunks.push(chunk); }
        const state = await Promise.resolve().then(() => store.load(workspace)).catch(() => null), row = state?.connectors?.[appId];
        const given = Buffer.from(token), expected = Buffer.from(String(row?.hook || ''));
        if (!row || given.length !== expected.length || !timingSafeEqual(given, expected)) throw error('Not found.', 404);
        if (!await publicAccountPolicy(workspace, true, 'automation').catch(() => false)) return json({ ok: true, ignored: true });
        const read = readWebhook(appId, { raw: Buffer.concat(chunks).toString('utf8'), headers: req.headers, auth: connectorAuth(row) });
        for (const event of read.events.slice(0, 50)) await change(workspace, { type: 'connector-event', data: { connector: appId, key: event.key, ctx: event.ctx, contact: event.contact } });
        if (read.events.length) flushLater(workspace);
        return json(read.reply || { ok: true });
      }
      if (p.startsWith('/api/phone/twilio/') && method === 'POST') {
        await ready;
        return await phone.twilioWebhook(req, res, url, p);
      }
      // E-mail recebido: Resend's "email.received" for conversas+<subconta>@INBOUND_EMAIL_DOMAIN (Svix-signed).
      if (p === '/api/email/inbound' && method === 'POST') {
        await ready;
        let size = 0; const chunks = [];
        for await (const chunk of req) { size += chunk.length; if (size > 2_000_000) throw error('Payload too large.', 413); chunks.push(chunk); }
        const raw = Buffer.concat(chunks).toString('utf8');
        if (!svixValid(raw, req.headers, process.env.RESEND_INBOUND_SECRET || '')) throw error('Invalid signature.', 401);
        let event;
        try { event = JSON.parse(raw); } catch { throw error('Invalid JSON.', 400); }
        const workspace = inboundWorkspace(event?.data?.to);
        if (!workspace || privateSpace.test(workspace)) return json({ ok: true, ignored: true });
        if (!await publicAccountPolicy(workspace, false, 'conversations').catch(() => false)) return json({ ok: true, ignored: true });
        const email = await inboundEmail(event, { request: inboundFetch });
        if (!email) return json({ ok: true, ignored: true });
        await store.change(workspace, s => execute(s, { type: 'email-inbound', data: { id: email.id, email: email.from.email, name: email.from.name, subject: email.subject, body: email.body } }, { workspace }));
        flushLater(workspace);
        return json({ ok: true });
      }
      // Messenger and Direct: Meta's verification (GET) and the messages of the connected pages (POST, signed).
      if (p === '/api/meta/webhook') {
        await ready;
        if (method === 'GET') {
          const verify = process.env.META_WEBHOOK_VERIFY_TOKEN || '';
          if (!verify || url.searchParams.get('hub.mode') !== 'subscribe' || url.searchParams.get('hub.verify_token') !== verify) throw error('Forbidden.', 403);
          return send(200, 'text/plain; charset=utf-8', String(url.searchParams.get('hub.challenge') || '').slice(0, 200));
        }
        if (method !== 'POST') throw error('Method not allowed.', 405);
        let size = 0; const chunks = [];
        for await (const chunk of req) { size += chunk.length; if (size > 1_000_000) throw error('Payload too large.', 413); chunks.push(chunk); }
        const raw = Buffer.concat(chunks);
        if (!metaSignatureValid(raw, req.headers['x-hub-signature-256'], process.env.META_APP_SECRET || '')) throw error('Invalid signature.', 401);
        let body;
        try { body = JSON.parse(raw.toString('utf8')); } catch { throw error('Invalid JSON.', 400); }
        const routes = (await metaRoutesRow()).routes || {};
        const touched = new Set();
        for (const message of metaInbound(body)) {
          const route = routes[message.accountId];
          if (!route || route.network !== message.network) continue;
          try {
            if (!await publicAccountPolicy(route.workspace, false, 'conversations')) continue;
            const state = await store.load(route.workspace);
            const key = `${message.network}:${message.accountId}`;
            const known = (state.contacts || []).some(row => row.metaIds?.[key] === message.senderId);
            const sender = known ? null : await metaSender(route.workspace, state, key);
            const authorName = sender ? await metaSenderName({ token: sender.token, senderId: message.senderId, network: message.network }, metaFetch) : '';
            await change(route.workspace, { type: 'social-interaction-trigger', data: { kind: 'dm', network: message.network, body: message.body, senderId: message.senderId, accountId: message.accountId, mid: message.mid, authorName } });
            touched.add(route.workspace);
          } catch (problem) { console.error(`Meta webhook (${route.workspace}): ${problem.message}`); }
        }
        // Lead Ads: the lead's answers are read with the page token, then become a contact and the trigger.
        for (const lead of metaLeads(body)) {
          const route = routes[lead.pageId];
          if (!route || route.network !== 'facebook') continue;
          try {
            if (!await publicAccountPolicy(route.workspace, false, 'marketing')) continue;
            const state = await store.load(route.workspace);
            const sender = await metaSender(route.workspace, state, `facebook:${lead.pageId}`);
            if (!sender) continue;
            const found = await fetchMetaLead({ token: sender.token, leadgenId: lead.leadgenId, formId: lead.formId }, metaFetch);
            const touch = found.lead.is_organic ? null : { source: 'facebook', medium: 'paid_social', campaign: String(found.lead.campaign_name || ''), at: new Date().toISOString(), channel: 'meta_ads' };
            await store.change(route.workspace, s => execute(s, { type: 'ad-form-lead', data: { network: 'meta', leadId: lead.leadgenId, formId: String(found.lead.form_id || lead.formId),
              formName: found.formName, campaign: String(found.lead.campaign_name || ''), campaignId: String(found.lead.campaign_id || ''), fields: metaLeadFields(found.lead) } },
              { workspace: route.workspace, ...(touch ? { attribution: { first: touch, last: touch } } : {}) }));
            touched.add(route.workspace);
          } catch (problem) { console.error(`Meta lead (${route.workspace}): ${problem.message}`); }
        }
        for (const workspace of touched) flushLater(workspace);
        return json({ ok: true });
      }
      // Google Ads lead form webhook: the URL and key from Marketing → Rastreamento; Google retries on non-200.
      const googleLead = p.match(new RegExp(`^/api/google-leads/${workspaceSegment}$`));
      if (googleLead && method === 'POST') {
        await ready;
        const workspace = googleLead[1];
        if (privateSpace.test(workspace)) throw error('Not found.', 404);
        let size = 0; const chunks = [];
        for await (const chunk of req) { size += chunk.length; if (size > 100_000) throw error('Payload too large.', 413); chunks.push(chunk); }
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw error('Invalid JSON.', 400); }
        await publicAccountPolicy(workspace, true, 'marketing');
        if (!googleLeadKeyValid(await store.load(workspace), body?.google_key)) throw error('Invalid key.', 403);
        const gclid = String(body.gcl_id || '').slice(0, 200);
        const touch = { source: 'google', medium: 'cpc', campaign: String(body.campaign_id || ''), gclid, at: new Date().toISOString(), channel: 'google_ads' };
        await store.change(workspace, s => execute(s, { type: 'ad-form-lead', data: { network: 'google', leadId: String(body.lead_id || ''), formId: String(body.form_id || ''),
          campaignId: String(body.campaign_id || ''), campaign: String(body.campaign_id || ''), test: body.is_test === true, fields: googleLeadFields(body) } },
          { workspace, attribution: { first: touch, last: touch } }));
        flushLater(workspace);
        return json({});
      }
      if (p.startsWith('/api/connectors/') && !p.startsWith('/api/connectors/hook/')) {
        if (!spaceId.test(id) || privateSpace.test(id)) throw error('Subconta não encontrada.', 404);
        const who = await workspaceAccess(req, res, id, { modules: ['settings'] });
        const origin = publicBase(req);
        const view = state => Object.fromEntries(connectorCatalog.map(def => {
          const row = state.connectors?.[def.id];
          return [def.id, { ...connectorPublic(row), ...(row?.hook && def.triggers.some(t => !t.poll) ? { hookUrl: `${origin}/api/connectors/hook/${id}/${def.id}/${row.hook}` } : {}) }];
        }));
        if (p === '/api/connectors/status' && method === 'GET') return json({ connectors: view(await store.load(id)) });
        if (method !== 'POST') throw error('Método indisponível.', 405);
        await requireActiveAccount(who.agencyId, id, true);
        const body = await payload(req), def = connectorById(String(body.id || ''));
        if (!def) throw error('Conector não encontrado.', 404);
        if (p === '/api/connectors/connect') {
          const auth = Object.fromEntries(def.auth.map(field => [field.key, String(body.fields?.[field.key] ?? '').trim().slice(0, 20000)]));
          const account = await testConnection(def.id, auth, { request: connectorRequest });
          const result = await change(id, { type: 'connector-save', data: { id: def.id, sealed: sealSecret(JSON.stringify(auth)), account, hook: randomBytes(24).toString('base64url') } });
          return json({ connectors: view(result.state) });
        }
        if (p === '/api/connectors/disconnect') return json({ connectors: view((await change(id, { type: 'connector-remove', data: { id: def.id } })).state) });
        throw error('Not found.', 404);
      }
      if (p === '/api/push/key' && method === 'GET') return json({ key: pushConfigured(pushEnv) ? pushEnv.WEB_PUSH_PUBLIC_KEY : '' });
      if ((p === '/api/push/subscribe' || p === '/api/push/unsubscribe') && method === 'POST') {
        if (!spaceId.test(id) || privateSpace.test(id)) throw error('Subconta não encontrada.', 404);
        const who = await workspaceAccess(req, res, id, { modules: ['conversations'] });
        const body = await payload(req);
        if (p === '/api/push/unsubscribe') return json({ removed: (await change(id, { type: 'push-unsubscribe', data: { endpoint: String(body.endpoint || '') } })).id });
        const sub = pushSubscription(body.subscription);
        if (!sub) throw error('Inscrição de notificação inválida.', 400);
        return json({ id: (await change(id, { type: 'push-subscribe', data: { ...sub, kind: 'team', userId: who.userId || 'local', app: String(body.app || '').slice(0, 80), messages: body.messages !== false } })).id });
      }
      if (p === '/api/mobile-app/package' && method === 'GET') {
        const who = await access(req, res);
        requireCapability(who, 'agency', 'Seu usuário não pode abrir a visualização da agência.');
        const agencyId = who.agencyId || AGENCY_ID;
        return json(storePackage(mobileOf(structuredClone(await loadAgency(agencyId))), agencyId, `${isVercel || req.socket?.encrypted ? 'https' : 'http'}://${req.headers.host}`));
      }
      if (p.startsWith('/api/phone/')) {
        if (!spaceId.test(id) || privateSpace.test(id)) throw error('Subconta não encontrada.', 404);
        const who = await workspaceAccess(req, res, id, { modules: [] });
        const body = method === 'POST' ? await payload(req) : {};
        return await phone.api(req, res, { url, path: p.replace(/\/+$/, ''), method, workspace: id, who, body, json, needs: module => requireModule(who, module) });
      }
      if (p.startsWith('/api/whatsapp/agency/')) {
        const who = await access(req, res);
        requireCapability(who, 'settings', 'Seu usuário não pode gerenciar a integração global com WhatsApp.');
        return await whatsapp.handleAgencyApi({
          req, url, method, who, payload, publicOrigin: publicBase(req), listWorkspaces, requireActiveAccount, json
        });
      }
      if (p.startsWith('/api/whatsapp/workspace/')) {
        if (!spaceId.test(id)) throw error('Subconta não encontrada.', 404);
        const who = await workspaceAccess(req, res, id, { modules: ['settings'] });
        if (method === 'POST' && p.replace(/\/+$/, '') === '/api/whatsapp/workspace/test') requireModule(who, 'conversations');
        return await whatsapp.handleWorkspaceApi({
          req, url, method, agencyId: who.agencyId, workspaceId: id, payload, publicOrigin: publicBase(req), requireActiveAccount, json
        });
      }
      if (p.startsWith('/api/waha/webhook/') && method === 'POST') {
        return await waha.handleWebhook({ req, url, payload, listWorkspaces, webhookBlockReason, json });
      }
      if (p.startsWith('/api/waha/')) {
        const who = await access(req, res);
        requireCapability(who, 'settings', 'Seu usuário não pode gerenciar a integração com WhatsApp.');
        if (method === 'POST' && p.replace(/\/+$/, '') === '/api/waha/test') requireModule(who, 'conversations');
        return await waha.handleApi({
          req, res, url, method, who, payload, publicOrigin: publicBase(req), listWorkspaces, requireActiveAccount, json
        });
      }
      if (p === '/api/mcp' || p.startsWith('/api/mcp/')) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Workspace');
        if (method === 'OPTIONS') return send(204, 'text/plain', '');
        if (method === 'GET') {
          return json({
            name: 'soci-mcp-server',
            version: '1.0.0',
            description: 'Model Context Protocol (MCP) Server for Soci platform',
            tools: mcp.listTools().map(t => t.name),
            status: 'online'
          });
        }
        if (method === 'POST') {
          const wsParam = url.searchParams.get('workspace') || req.headers['x-workspace'] || id;
          if (!spaceId.test(wsParam) && !privateSpace.test(wsParam)) {
            throw error('Subconta não informada ou inválida. Informe ?workspace=<id> ou header X-Workspace.', 400);
          }
          let actor = 'MCP Agent';
          const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || url.searchParams.get('token') || '';
          if (auth) {
            try {
              const who = await access(req, res);
              actor = who.user?.name || who.session?.id || 'MCP User';
            } catch {
              if (!token) throw error('Autenticação necessária para o servidor MCP da Soci (Bearer token).', 401);
              actor = `MCP Key (${token.slice(0, 8)}…)`;
            }
          }
          await publicAccountPolicy(wsParam, false, 'marketing');
          const state = await store.load(wsParam);
          const body = await payload(req);
          const response = await mcp.handleMcpRequest(body, { state, workspace: wsParam, actor });
          if (!response) return send(204, 'text/plain', '');
          return json(response);
        }
        throw error('Método não permitido.', 405);
      }
      if (p.startsWith('/api/ask/')) {
        const { agency, who } = await accessContext(req, await verifiedUser(req, res));
        requireCapability(who, 'agency', 'Seu usuário não pode acessar o Pergunte à Soci.');
        return await handleAsk({
          req, res, url, method, who, json,
          loadContext: async () => {
            const workspaces = await listWorkspaces(who.agencyId);
            ensureAccounts(agency, workspaces);
            const states = await agencyWorkspaceViews(agency, who, workspaces);
            return { agency: { ...publicAgency(agency, who), abacatepay: { connected: await abacate.connected(who.agencyId, abacate.AGENCY_SCOPE) } }, overview: agencyOverview(agency, states) };
          }
        });
      }
      const gbpAction = p.match(/^\/api\/gbp\/(status|profile|sync|reply)$/);
      if (gbpAction) {
        if (!spaceId.test(id)) throw error('Subconta não encontrada.', 404);
        const who = await workspaceAccess(req, res, id, { modules: ['reputation'] });
        const op = gbpAction[1];
        if (op === 'status' && method === 'GET') return json(await gbpStatus(id, url.searchParams.get('refresh') === '1'));
        if (method !== 'POST') throw error('Method not allowed.', 405);
        const input = await payload(req);
        const access = await gbpAccess(id);
        if (op === 'profile') {
          const patch = {};
          if (input.description !== undefined) {
            const text = String(input.description || '').trim();
            if (text.length > 750) throw error('A descrição do Google aceita até 750 caracteres.', 400);
            if (/https?:\/\/|www\./i.test(text)) throw error('O Google não aceita links na descrição.', 400);
            patch.description = text;
          }
          if (input.phone !== undefined) patch.phone = String(input.phone || '').trim().slice(0, 30);
          if (input.website !== undefined) {
            const site = String(input.website || '').trim();
            if (site && !/^https?:\/\/[^\s]+$/i.test(site)) throw error('Use um site que comece com https://', 400);
            patch.website = site;
          }
          if (Array.isArray(input.hours)) patch.hours = hoursPeriods(input.hours);
          await updateLocation(access.token, access.location, patch).catch(problem => { throw problem.status === 400 ? problem : googleError(problem); });
          await recordAudit(who, 'Perfil do Google atualizado', id, Object.keys(patch).join(', ')).catch(() => {});
          return json(await gbpStatus(id, true));
        }
        if (op === 'sync') {
          if (!access.account) throw error('Não encontramos a conta deste local. Escolha o local de novo em Configurações → Google.', 409);
          const reviews = await listGoogleReviews(access.token, access.account, access.location).catch(problem => { throw googleError(problem); });
          const result = await change(id, { type: 'gbp-reviews-import', data: { reviews } });
          if (result.state.workflowOutbox?.length) flushLater(id);
          return json({ ...result.id, total: reviews.length, ...workspaceView(who, result.state) });
        }
        if (op === 'reply') {
          const state = await store.load(id);
          const review = state.reviews.find(row => row.id === input.reviewId && row.googleName);
          if (!review) throw error('Avaliação do Google não encontrada.', 404);
          if (!review.googleName.startsWith(`${access.account}/${access.location}/`)) throw error('Esta avaliação é de outro local do Google.', 409);
          const reply = String(input.reply || '').trim().slice(0, 2500);
          await replyGoogleReview(access.token, review.googleName, reply).catch(problem => { throw googleError(problem); });
          const result = await change(id, { type: 'save', key: 'reviews', id: review.id, data: { author: review.author, score: review.score, text: review.text, reply } }, who);
          return json({ ok: true, ...workspaceView(who, result.state) });
        }
        throw error('Not found.', 404);
      }
      if (p === '/api/video' && (method === 'GET' || method === 'HEAD')) {
        if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Subconta não encontrada.',404);
        await workspaceAccess(req, res, id, { modules: ['reputation'] });
        const row = (await store.load(id)).videoTestimonials?.find(item => item.id === url.searchParams.get('id'));
        if (!row) throw error('Vídeo não encontrado.', 404);
        return await sendVideo(req, res, method, id, row, 'private, no-store');
      }
      const brandAction = p.match(/^\/api\/brand\/(import|voice-ai)$/);
      if (brandAction && method === 'POST') {
        if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Subconta não encontrada.',404);
        const who = await workspaceAccess(req, res, id, { modules: ['marketing'] });
        const input = await payload(req);
        if (brandAction[1] === 'import') {
          const page = await fetchPublicPage(String(input.url || ''), { fetchImpl: brandFetch, ...(brandResolve && { resolve: brandResolve }) });
          return json({ board: brandFromPage(page) });
        }
        brandVoiceRequest(input);
        if (!(localAccess && contentAI) && !(who.session && (await openAI.status(who.session)).configured)) {
          throw error('Conecte a OpenAI em Visão da agência → Configurações → OpenAI para gerar a voz da marca.', 409);
        }
        return json({ voice: await meteredAI(who, id, 'brand', connection => content.writeBrandVoice(connection, input, voiceTraits)) });
      }
      if (p === '/api/content-ai/review-reply' && method === 'POST') {
        if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Subconta não encontrada.',404);
        const input = await payload(req);
        const who = await workspaceAccess(req, res, id, { modules: ['reputation'] });
        const state = await store.load(id);
        const request = reviewReplyRequest(state, { ...input, voice: brandVoicePrompt(defaultBoard(state.brandBoards)) });
        if (!(localAccess && contentAI) && !(who.session && (await openAI.status(who.session)).configured)) {
          throw error('Conecte a OpenAI em Visão da agência → Configurações → OpenAI para responder com IA.', 409);
        }
        return json(await meteredAI(who, id, 'reputation', connection => content.writeReviewReply(connection, request)));
      }
      // App marketplace (7.3): a sub-account installs or removes an app its agency published.
      const appAction = p.match(/^\/api\/apps\/(install|uninstall)$/);
      if (appAction && method === 'POST') {
        if (!spaceId.test(id)) throw error('Subconta não encontrada.', 404);
        const who = await workspaceAccess(req, res, id, { modules: ['settings'] });
        const body = await payload(req);
        const agencyId = (await store.load(id)).agencyId || AGENCY_ID;
        if (appAction[1] === 'install') {
          const { app, install, token } = await changeAgency(agencyId, agency => {
            const made = addInstall(agency, String(body.appId || ''), id, who.name);
            logTo(agency, who, 'App installed', made.app.name, id);
            return made;
          });
          await change(id, { type: 'app-installed', data: { copy: installedCopy(app, install) } });
          // The app gets its token once, in the signed "app.installed" notice; Soci keeps only its hash.
          const sent = app.webhookUrl
            ? await deliverToApp(agencyId, id, app.id, { type: 'app.installed', token: app.scopes.length ? token : '', scopes: app.scopes, events: app.events,
              api: { base: `${publicBase(req)}/api/v1`, trigger: `${publicBase(req)}/api/apps/v1/trigger` } })
            : { name: app.name, text: 'sem webhook' };
          await change(id, { type: 'app-log', data: { entries: [{ app: app.name, appId: app.id, kind: 'install', text: `Instalado por ${who.name}: ${sent.text}` }] } });
          return json({ ...workspaceView(who, (await store.load(id))), installed: app.id, delivery: sent.text }, 201);
        }
        const removed = await changeAgency(agencyId, agency => {
          const made = removeInstall(agency, String(body.installId || ''), id);
          logTo(agency, who, 'App uninstalled', made.app?.name || made.install.appId, id);
          return made;
        });
        await change(id, { type: 'app-removed', data: { appId: removed.install.appId } });
        if (removed.app?.webhookUrl) {
          const sent = await deliverToApp(agencyId, id, removed.app.id, { type: 'app.uninstalled', installId: removed.install.id });
          await change(id, { type: 'app-log', data: { entries: [{ app: removed.app.name, appId: removed.app.id, kind: 'uninstall', text: `Desinstalado por ${who.name}: ${sent.text}` }] } });
        }
        return json({ ...workspaceView(who, (await store.load(id))), removed: removed.install.appId });
      }
      // Labs in Conversas: a reply draft or a summary of the history with one contact (metered as "conversations").
      const conversationAI = p.match(/^\/api\/conversations\/ai\/(reply|summary)$/);
      if (conversationAI && method === 'POST') {
        if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Subconta não encontrada.',404);
        const who = await workspaceAccess(req, res, id, { modules: ['conversations'] });
        const mode = conversationAI[1];
        const state = await store.load(id);
        requireLab(state, mode === 'reply' ? 'conversation-reply' : 'conversation-summary');
        if (!(localAccess && contentAI) && !(who.session && (await openAI.status(who.session)).configured)) {
          throw error('Conecte a OpenAI em Visão da agência → Configurações → OpenAI para usar a IA nas conversas.', 409);
        }
        const body = await payload(req);
        const request = conversationRequest(state, String(body.contactId || ''), { mode, language: body.language });
        const write = mode === 'reply' ? content.writeConversationReply : content.writeConversationSummary;
        return json(await meteredAI(who, id, 'conversations', connection => write(connection, request)));
      }
      // Meetings + Notes AI: transcribe a meeting's audio, or summarize its transcript (both metered as "meetings").
      const meetingAction = p.match(/^\/api\/meetings\/(transcribe|summarize)$/);
      if (meetingAction && method === 'POST') {
        if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Subconta não encontrada.',404);
        const who = await workspaceAccess(req, res, id, { modules: ['calendars'] });
        if (!(localAccess && contentAI) && !(who.session && (await openAI.status(who.session)).configured)) {
          throw error('Conecte a OpenAI em Visão da agência → Configurações → OpenAI para usar as notas com IA.', 409);
        }
        const meetingId = String(url.searchParams.get('meeting') || '');
        const meeting = ((await store.load(id)).meetings || []).find(row => row.id === meetingId);
        if (!meeting) throw error('Reunião não encontrada.', 404);
        const language = url.searchParams.get('lang') === 'es' ? 'es' : 'pt';
        if (meetingAction[1] === 'transcribe') {
          const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
          if (!audioTypes.includes(mime)) throw error('Envie um áudio em WebM, OGG, MP3, M4A ou WAV.', 415);
          let size = 0; const chunks = [];
          for await (const part of req) { size += part.length; if (size > audioLimit) throw error('O áudio pode ter até 4 MB. Grave em partes ou envie a transcrição.', 413); chunks.push(part); }
          const { text } = await meteredAI(who, id, 'meetings', connection => content.transcribeAudio(connection, { buffer: Buffer.concat(chunks), mime, language }));
          await change(id, { type: 'meeting-transcript', data: { id: meetingId, transcript: text, source: url.searchParams.get('source') === 'recording' ? 'recording' : 'audio' } }, who);
          flushLater(id);
          return json({ ok: true, length: text.length });
        }
        if (!meeting.transcript) throw error('Adicione a transcrição antes de resumir.', 409);
        const today = new Date().toISOString().slice(0, 10);
        const result = await meteredAI(who, id, 'meetings', connection => content.summarizeMeeting(connection, { title: meeting.title, participants: meeting.participants, transcript: meeting.transcript, language, today }));
        await change(id, { type: 'meeting-summary', data: { id: meetingId, result, language } }, who);
        flushLater(id);
        return json({ ok: true });
      }
      // Reselling: the client recharges its wallet by Pix or card, paid to the agency's AbacatePay account.
      if (p === '/api/wallet/topup' && method === 'POST') {
        if (!spaceId.test(id)) throw error('Subconta não encontrada.',404);
        const who = await workspaceAccess(req, res, id, { modules: ['settings'] });
        const body = await payload(req);
        const state = await store.load(id);
        if (!Object.keys(state.wallet?.pricing || {}).length) throw error('Esta subconta não tem carteira de créditos ativa.', 409);
        const amount = Math.round(Number(body.amount) * 100) / 100;
        if (!(amount >= walletLimits.minTopup && amount <= walletLimits.maxTopup)) throw error(`A recarga vai de R$ ${walletLimits.minTopup} a R$ ${walletLimits.maxTopup.toLocaleString('pt-BR')}.`, 400);
        if (!(await abacate.connected(who.agencyId, abacate.AGENCY_SCOPE))) throw error('A recarga por Pix ainda não foi ativada pela agência. Fale com ela para lançar os créditos.', 409);
        const back = `${publicBase(req)}/app?workspace=${encodeURIComponent(id)}#settings/wallet`;
        const payment = await abacate.createCheckout(who.agencyId, abacate.AGENCY_SCOPE, { reference: `wallet-${id}`, name: 'Recarga de créditos', amount, returnUrl: back, completionUrl: back, metadata: { walletTopup: id } });
        await store.change(id, s => { addTopup(s, payment); });
        flushLater(id);
        return json({ url: payment.url, checkoutId: payment.checkoutId, amount: payment.amount });
      }
      // SEO (site audit and Search Console) and Visibility AI, in Reputação. The AI run is metered as "visibility".
      if (p === '/api/seo/audit' && method === 'POST') {
        if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Subconta não encontrada.',404);
        const who = await workspaceAccess(req, res, id, { modules: ['reputation'] });
        const body = await payload(req);
        const state = await store.load(id);
        const typed = String(body.url || state.seo?.siteUrl || '').trim();
        if (!typed) throw error('Informe o endereço do site para auditar.', 400);
        const target = auditableUrl(typed);
        if (!target) throw error('Este endereço não pode ser auditado. Use o endereço público do site, por exemplo https://suaempresa.com.br.', 400);
        const audit = await prospectAudit({ website: target.href }, { places: false }).catch(() => null);
        if (!audit?.website) throw error('Não foi possível abrir o site. Confira o endereço e tente de novo.', 502);
        if (!state.seo?.siteUrl) await change(id, { type: 'seo-settings', data: { siteUrl: target.href } }, who);
        const auditId = await change(id, { type: 'seo-audit', data: audit.website }, who);
        flushLater(id);
        return json({ ok: true, id: auditId });
      }
      if (p === '/api/seo/search' && method === 'GET') {
        if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Subconta não encontrada.',404);
        await workspaceAccess(req, res, id, { modules: ['reputation'] });
        const rowId = `google-${id}`;
        const g = (await socialRow(rowId)).google;
        if (!g?.token) return json({ connected: false, configured: googleConfigured() });
        if (!g.gscSite) return json({ connected: true, site: '', sites: (g.sites || []).length, error: g.errors?.search || '' });
        const keywords = (await store.load(id)).seo?.keywords || [];
        const key = `${g.gscSite}|${keywords.join(',')}`;
        const cached = searchCache.get(id);
        if (cached?.key === key && cached.at > Date.now() - 15 * 60_000 && url.searchParams.get('fresh') !== '1') return json(cached.data);
        const secret = unseal(g.token);
        if (!secret) return json({ connected: true, site: g.gscSite, error: 'A conexão com o Google precisa ser refeita.' });
        const fresh = await freshSecret(secret).catch(() => null);
        if (!fresh) return json({ connected: true, site: g.gscSite, error: 'O acesso ao Google expirou. Conecte a conta de novo em Configurações → Google.' });
        if (fresh.changed) await store.change(rowId, row => { if (row.google) row.google.token = seal(fresh.secret); });
        try {
          const data = { connected: true, site: g.gscSite, siteName: g.sites?.find(row => row.id === g.gscSite)?.name || g.gscSite, report: await searchReport(fresh.secret.token, g.gscSite, keywords), at: stamp() };
          searchCache.set(id, { key, at: Date.now(), data });
          return json(data);
        } catch (problem) {
          return json({ connected: true, site: g.gscSite, error: searchError(problem).message });
        }
      }
      if (p === '/api/visibility/run' && method === 'POST') {
        if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Subconta não encontrada.',404);
        const who = await workspaceAccess(req, res, id, { modules: ['reputation'] });
        const v = (await store.load(id)).visibility;
        if (!v?.brand || !v.prompts?.length) throw error('Configure a marca e as perguntas antes de medir.', 409);
        if (!(localAccess && contentAI) && !(who.session && (await openAI.status(who.session)).configured)) {
          throw error('Conecte a OpenAI em Visão da agência → Configurações → OpenAI para medir a visibilidade na IA.', 409);
        }
        const language = url.searchParams.get('lang') === 'es' ? 'es' : 'pt';
        let model = '';
        const answers = await meteredAI(who, id, 'visibility', async connection => {
          const out = new Array(v.prompts.length);
          let next = 0;
          const worker = async () => {
            while (next < v.prompts.length) {
              const index = next++, prompt = v.prompts[index];
              try { const reply = await content.askAssistant(connection, { prompt, language }); model ||= reply.model || ''; out[index] = { prompt, text: reply.text, sources: reply.sources }; }
              catch (problem) { out[index] = { prompt, error: problem.message || 'A IA não respondeu.' }; }
            }
          };
          await Promise.all([worker(), worker(), worker()]);
          if (!out.some(row => row && !row.error)) throw error(out[0]?.error || 'A IA não respondeu. Tente de novo.', 502);
          return out;
        });
        const runId = await change(id, { type: 'visibility-run', data: { answers, model } }, who);
        flushLater(id);
        return json({ ok: true, id: runId, failed: answers.filter(row => row.error).length });
      }
      const contentAction = p.match(/^\/api\/content-ai\/(transform|email)$/);
      if (contentAction && method === 'POST') {
        if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Subconta não encontrada.',404);
        const input = await payload(req);
        const email = contentAction[1] === 'email';
        input.voice = await brandVoiceOf(id);
        const request = email ? emailRequest(input) : transformRequest(input);
        const kind = email ? 'email' : request.kind;
        const who = await workspaceAccess(req, res, id, { modules: [contentModule[kind]] });
        if (!(localAccess && contentAI) && !(who.session && (await openAI.status(who.session)).configured)) {
          throw error('Conecte a OpenAI em Visão da agência → Configurações → OpenAI para usar a IA de conteúdo.', 409);
        }
        const result = await meteredAI(who, id, kind === 'gbp' ? 'reputation' : kind, connection => email ? content.writeEmail(connection, input) : content.transformText(connection, input));
        return json(result);
      }
      const aiAction = p.match(/^\/api\/ai\/(kb-create|kb-save|kb-delete|template-save|template-delete|limit|usage)$/);
      if (aiAction && (method === 'POST' || aiAction[1] === 'usage')) {
        if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Subconta não encontrada.',404);
        const who = await workspaceAccess(req, res, id, { modules: ['ai-agents'] });
        const operation = aiAction[1];
        if (operation === 'usage') {
          const month = url.searchParams.get('month') || undefined;
          if (month && !/^\d{4}-\d{2}$/.test(month)) throw error('Informe o mês como AAAA-MM.', 400);
          return json({ usage: usageSummary((await store.load(id)).ai, month) });
        }
        const input = await payload(req);
        if (operation === 'limit') {
          requireCapability(who, 'agency', 'Só a agência pode alterar o limite de gastos com IA desta subconta.');
          const usage = await store.change(id, state => setAiLimit(state, input));
          return json({ usage });
        }
        if (operation.startsWith('template-')) {
          const template = await store.change(id, state => editAgentTemplate(state, operation, input));
          return json({ template }, template ? 201 : 200);
        }
        const kbOperation = operation.slice(3);
        const base = await store.change(id, state => editKnowledgeBase(state, kbOperation, input));
        if (!privateSpace.test(id) && kbOperation !== 'save') {
          const account = (await listWorkspaces(who.agencyId)).find(w => w.id === id)?.name || id;
          await recordAudit(who, kbOperation === 'create' ? 'Base de conhecimento criada' : 'Base de conhecimento excluída', account, base?.name || '');
        }
        return json({ base }, kbOperation === 'create' ? 201 : 200);
      }
      const agentAction = p.match(/^\/api\/agents\/(create|save|publish|unpublish|move|delete|memory|test|build)$/);
      if (agentAction && method==='POST') {
        if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Subconta não encontrada.',404);
        const who = await workspaceAccess(req, res, id, { modules: ['ai-agents'] });
        const operation = agentAction[1];
        const input = await payload(req);
        if (operation === 'test') {
          const current = await store.load(id);
          const preview = agentPreview(current, input);
          checkAiBudget(current);
          const meter = meteredUsage();
          const connection = localAccess && generateAgentReply !== replyAsAgent ? { onUsage: meter.onUsage } : { ...await openAI.requireConnection(who.session), onUsage: meter.onUsage };
          const message = preview.messages.at(-1).content;
          const runInput = { agent: input.id, version: input.version, input: message, kind: 'test', sources: [...new Set(preview.retrieved.map(item => item.title))] };
          let reply;
          try {
            reply = await generateAgentReply({ ...preview, model: preview.model || agentModel }, connection);
          } catch (problem) {
            await store.change(id, state => meter.record(state, 'agent-test', input.id, runInput, problem.message));
            throw problem;
          }
          const run = await store.change(id, state => meter.record(state, 'agent-test', input.id, { ...runInput, output: reply }));
          return json({ reply, run });
        }
        if (operation === 'build') {
          const current = await store.load(id);
          const build = agentBuildRequest(current, input);
          checkAiBudget(current);
          const meter = meteredUsage();
          const connection = localAccess && designAgentConfig !== designAgent ? { onUsage: meter.onUsage } : { ...await openAI.requireConnection(who.session), onUsage: meter.onUsage };
          const runInput = { agent: input.id, version: 'draft', input: build.request, kind: 'build' };
          let design;
          try {
            design = await designAgentConfig(build, connection);
          } catch (problem) {
            await store.change(id, state => meter.record(state, 'agent-build', input.id, runInput, problem.message));
            throw problem;
          }
          const agent = await store.change(id, state => {
            meter.record(state, 'agent-build', input.id, { ...runInput, output: design.summary });
            return applyAgentDesign(state, input, design.draft);
          });
          return json({ agent, summary: design.summary });
        }
        const agent = await store.change(id, state => editAgent(state, operation, { ...input, model: agentModel }));
        if (!privateSpace.test(id) && operation !== 'save') {
          const labels = { create: 'Agente criado', publish: 'Agente publicado', unpublish: 'Agente despublicado', delete: 'Agente excluído' };
          const account = (await listWorkspaces(who.agencyId)).find(w => w.id === id)?.name || id;
          await recordAudit(who, labels[operation], account, agent?.name || '');
        }
        return json({ agent }, operation === 'create' ? 201 : 200);
      }
      if (p.startsWith('/api/prancheta/')) {
        const isAgencyTarget = id === 'agency' || !id;
        const who = isAgencyTarget
          ? await access(req, res)
          : await workspaceAccess(req, res, id, { modules: ['marketing'] });
        if (isAgencyTarget) {
          requireCapability(who, 'agency', 'Seu usuário não pode abrir a visualização da agência.');
        } else {
          await requireActiveAccount(who.agencyId, id, true);
        }
        const action = p.slice('/api/prancheta/'.length);
        const formatPranchetaMeta = (f) => ({
          id: f.id,
          name: f.name,
          size_bytes: f.size_bytes || (f.document ? JSON.stringify(f.document).length : JSON.stringify(f).length),
          thumbnail: f.thumbnail || null,
          created_at: f.created_at || f.created,
          updated_at: f.updated_at || f.updated || f.created,
          format: f.format || 'custom',
          width: f.width || 1080,
          height: f.height || 1080,
          pages: f.pages || []
        });

        const loadTarget = async () => isAgencyTarget ? loadAgency(who.agencyId) : store.load(id);
        const changeTarget = async (cmd) => {
          if (isAgencyTarget) {
            return changeAgency(who.agencyId, a => executeAgency(a, cmd, { actor: who.name }));
          }
          const res = await change(id, cmd);
          return res.id;
        };

        if (action === 'files') {
          if (method === 'GET') {
            const state = await loadTarget();
            const raw = state.pranchetaFiles || [];
            return json({ files: raw.map(formatPranchetaMeta) });
          }
          if (method === 'POST') {
            const input = await payload(req);
            const savedId = await changeTarget({ type: 'prancheta-save', data: input, id: input.id });
            const state = await loadTarget();
            const raw = state.pranchetaFiles || [];
            return json({ id: savedId, files: raw.map(formatPranchetaMeta) });
          }
        }
        if (action === 'file') {
          const fileId = url.searchParams.get('id') || url.searchParams.get('fileId');
          const state = await loadTarget();
          const raw = state.pranchetaFiles || [];
          const found = raw.find(f => f.id === fileId);
          if (method === 'GET') {
            if (!found) throw error('Arquivo da prancheta não encontrado.', 404);
            const { sociToDocument } = await import('./prancheta-model.mjs');
            const document = found.document || sociToDocument(found);
            return json({
              ...formatPranchetaMeta(found),
              document
            });
          }
          if (method === 'POST') {
            const input = await payload(req);
            const targetId = input.id || fileId;
            const savedId = await changeTarget({ type: 'prancheta-save', data: input, id: targetId });
            const nextState = await loadTarget();
            const nextFound = (nextState.pranchetaFiles || []).find(f => f.id === savedId);
            return json({ id: savedId, file: nextFound ? formatPranchetaMeta(nextFound) : null });
          }
        }
        if (action === 'save' && method === 'POST') {
          const input = await payload(req);
          const savedId = await changeTarget({ type: 'prancheta-save', data: input, id: input.id });
          const state = await loadTarget();
          const raw = state.pranchetaFiles || [];
          const found = raw.find(f => f.id === savedId);
          return json({ id: savedId, file: found ? formatPranchetaMeta(found) : null, files: raw.map(formatPranchetaMeta) });
        }
        if (action === 'templates' && method === 'GET') {
          const { createCanonicalTemplates, pranchetaPresets } = await import('./prancheta-model.mjs');
          return json({ templates: createCanonicalTemplates(), presets: pranchetaPresets });
        }
        if (action === 'template-use' && method === 'POST') {
          const input = await payload(req);
          const savedId = await changeTarget({ type: 'prancheta-template', data: input });
          const state = await loadTarget();
          return json({ id: savedId, files: state.pranchetaFiles || [] }, 201);
        }
        if (action === 'delete' && method === 'POST') {
          const input = await payload(req);
          await changeTarget({ type: 'prancheta-delete', id: input.id });
          const state = await loadTarget();
          return json({ ok: true, files: state.pranchetaFiles || [] });
        }
        if (action === 'duplicate' && method === 'POST') {
          const input = await payload(req);
          const copyId = await changeTarget({ type: 'prancheta-duplicate', id: input.id });
          const state = await loadTarget();
          return json({ id: copyId, files: state.pranchetaFiles || [] }, 201);
        }
        if (action === 'export-media' && method === 'POST') {
          const input = await payload(req);
          const fileId = await changeTarget({ type: 'prancheta-export-media', id: input.id, data: input });
          const state = await loadTarget();
          return json({ ok: true, fileId, files: state.files || [] });
        }
        if (action === 'to-social' && method === 'POST') {
          const input = await payload(req);
          const result = await changeTarget({ type: 'prancheta-to-social', id: input.id, data: input });
          const state = await store.load(id);
          return json({ ok: true, ...(result || {}), posts: state.socialPosts || [] });
        }
        throw error('Rota da prancheta não encontrada.', 404);
      }
      if (p==='/api/studio' && method==='POST') {
        const who = await studioGuard(req,res,id);
        const input = await payload(req);
        const kind = input.kind === 'funnel' ? 'funnel' : 'website';
        const blankName = typeof input.name === 'string' ? input.name.trim().slice(0,80) : '';
        const brief = input.mode === 'blank' ? blankName : typeof input.brief === 'string' ? input.brief.trim() : '';
        const template = input.template || 'landing';
        if (input.mode === 'blank' && !blankName) throw error('Dê um nome ao funil ou site.',400);
        if (!brief || brief.length > 4000) throw error('Enter a project description of up to 4,000 characters.',400);
        if (!studioTemplates.some(item => item[0] === template)) throw error('Choose a valid template.',400);
        if (!['model','starter','blank'].includes(input.mode)) throw error('Choose how to create the project.',400);
        const existing = await store.load(id);
        if (existing.studioProjects.length >= 60) throw error('A workspace can have up to 60 Studio projects.',400);
        const connection = input.mode === 'model' ? await openAI.requireConnection(who.session) : null;
        const reference = connection && input.reference ? await readReference(input.reference) : null;
        const design = input.design ? validDesign(input.design) : null;
        const plan = input.plan ? validPlan(input.plan, kind) : null;
        let draft, html;
        if (input.mode === 'model') {
          const site = await generateSite(connection,brief,template,reference?.summary,design,plan?.pages[0] || null);
          draft = { name:site.name, headline:site.name, summary:site.summary, theme:site.theme, blocks:[] };
          html = site.html;
        } else if (design && plan) {
          draft = { name:plan.name, headline:plan.name, summary:plan.summary, theme:'indigo', blocks:[] };
          html = designedPage({ siteName:plan.name, page:plan.pages[0], design, summary:plan.summary });
        } else if (input.mode === 'blank') {
          draft = { name:blankName, headline:blankName, summary:'', theme:'indigo', blocks:[] };
          html = pageFromStructure(draft, blankName);
        } else {
          draft = starterProject(brief,template);
          html = pageFromStructure(draft);
        }
        if (plan) Object.assign(draft, { name:plan.name, headline:plan.name, summary:plan.summary || draft.summary });
        const pages = [{ name:plan ? plan.pages[0].name : kind === 'funnel' ? 'Página de captura' : 'Home', slug:'index', html }];
        if (kind === 'funnel' && !plan) pages.push({ name:'Obrigado', slug:'obrigado', html:thankYouPage(draft) });
        const doc = newSiteDoc({ workspace:id, project:{ id:'pending' }, pages });
        const created = await change(id,{type:'save',key:'studioProjects',data:{...draft,brief,template,kind,design,reference:reference?.url || ''}});
        doc.project = created.id; doc.profile.name = `AI Studio ${created.id}`;
        await store.insert(siteRowId(created.id), doc);
        const synced = await syncMeta(id, created.id, doc);
        return json({ id: synced.id, ...workspaceView(who, synced.state) },201);
      }
      if ((p==='/api/studio/discover' || p==='/api/studio/plan') && method==='POST') {
        const who = await studioGuard(req,res,id);
        const input = await payload(req);
        const brief = typeof input.brief === 'string' ? input.brief.trim() : '';
        if (!brief || brief.length > 4000) throw error('Descreva o que você quer construir em até 4.000 caracteres.',400);
        const kind = input.kind === 'funnel' ? 'funnel' : 'website';
        const connection = await openAI.status(who.session).then(s => s.configured ? openAI.requireConnection(who.session) : null);
        if (p === '/api/studio/discover') {
          if (!connection) return json({ ai:false, intro:`Vou montar ${kind === 'funnel' ? 'o funil' : 'o site'} com base na sua descrição. Antes, escolha a direção visual.`, questions:questionsFor({ kind }) });
          const found = await discoverDesign(connection,{ brief, kind });
          const palettes = found.palettes.map(item => validDesign({ palette:item }).palette).slice(0,4);
          const fonts = found.fonts.map(item => validDesign({ fonts:item }).fonts).slice(0,4);
          return json({ ai:true, intro:String(found.intro || '').slice(0,600), questions:questionsFor({ kind, palettes:palettes.length === 4 ? palettes : undefined, fonts:fonts.length === 4 ? fonts : undefined }) });
        }
        const design = validDesign(input.design);
        const plan = connection ? validPlan(await planSite(connection,{ brief, kind, design }), kind) : localPlan(brief, kind);
        if (kind === 'funnel' && !/obrigad|thank/i.test(plan.pages.at(-1).name + plan.pages.at(-1).slug) && plan.pages.length < 6) plan.pages.push({ name:'Obrigado', slug:'obrigado', purpose:'Confirma o envio e explica os próximos passos.' });
        return json({ ai:Boolean(connection), plan, design });
      }
      if (p==='/api/studio/doc' && method!=='POST') {
        await studioGuard(req,res,id);
        const projectId = url.searchParams.get('id') || '';
        return json({ doc: publicDoc(await siteDoc(id, projectId)) });
      }
      if (p.startsWith('/api/studio/') && method==='POST') {
        const who = await studioGuard(req,res,id);
        const input = await payload(req);
        const result = await studioRequest(id, p.slice('/api/studio/'.length), input, who.session);
        const doc = await siteDoc(id, input.id);
        const synced = await syncMeta(id, input.id, doc);
        return json({ id: synced.id, ...workspaceView(who, synced.state), doc: publicDoc(doc), result });
      }
      const preview = p.match(previewPath);
      if (preview && method === 'GET') {
        await ready;
        const [, workspace, projectId, pageId] = preview;
        await studioGuard(req,res,workspace);
        const doc = await siteDoc(workspace, projectId);
        const page = findPage(doc, pageId);
        const etag = `W/"${projectId}-${pageId}-${doc.rev || 0}"`;
        if (req.headers['if-none-match'] === etag) {
          res.writeHead(304, { 'ETag': etag, 'Cache-Control': 'private, no-cache' });
          return res.end();
        }
        res.writeHead(200, { ...previewHeaders, 'ETag': etag, 'Cache-Control': 'private, no-cache' });
        return res.end(page.html);
      }
      // Rastreamento externo: the script for the business's site, the pixels loader and the events endpoint.
      const tracker = p.match(trackingPath);
      if (tracker) {
        await ready;
        const [, workspace, part] = tracker;
        if (part === '/e') {
          if (method !== 'POST') throw error('Method not allowed.', 405);
          const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);
          const cors = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
          if (!allowTracking(ip)) { res.writeHead(429, cors); return res.end(); }
          await publicAccountPolicy(workspace, true, 'sites');
          let size = 0; const chunks = [];
          for await (const chunk of req) { size += chunk.length; if (size > 64_000) throw error('Evento grande demais.', 413); chunks.push(chunk); }
          let data;
          try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw error('Evento inválido.', 400); }
          if (!data || typeof data !== 'object' || Array.isArray(data)) throw error('Evento inválido.', 400);
          const result = await store.change(workspace, s => {
            if (!originAllowed(trackingOf(s), req.headers.origin || data.url || '')) throw error('Este domínio não pode enviar eventos para esta subconta.', 403);
            return { id: execute(s, { type: 'tracking-event', data }, { workspace, attribution: touchesFrom(data) }), outbox: s.workflowOutbox?.length || 0 };
          });
          if (result.outbox) flushLater(workspace);
          res.writeHead(204, cors); return res.end();
        }
        if (method !== 'GET' && method !== 'HEAD') throw error('Method not allowed.', 405);
        await publicAccountPolicy(workspace, false, 'sites');
        const t = trackingOf(await store.load(workspace));
        const body = part === '/pixels.js' ? pixelsScript(t) : trackerScript(workspace, publicBase(req), t);
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin' });
        return res.end(method === 'HEAD' ? undefined : body);
      }
      const site = p.match(sitePath);
      if (site) {
        await ready;
        const [, workspace, projectId, slug = 'index'] = site;
        const active = await publicAccountPolicy(workspace, method === 'POST', 'sites');
        const base = `/s/${workspace}/${projectId}`;
        const doc = await siteDoc(workspace, projectId, false).catch(() => null);
        if (!doc?.published) throw error('This site is not published.',404);
        if (method === 'POST') {
          const fields = await formFields(req);
          await publicAccountPolicy(workspace, true, 'sites');
          const back = fields._page && fields._page !== 'index' ? `${base}/${encodeURIComponent(fields._page)}` : base;
          const project = (await store.load(workspace)).studioProjects.find(item => item.id === projectId);
          try {
            if (!project?.formId) throw error('This site is not accepting submissions.',404);
            const vid = siteVisitorOf(req, workspace) || randomBytes(12).toString('hex');
            await change(workspace,{ type:'submit', id:project.formId, data:{ name:fields.name, email:fields.email, phone:fields.phone, _source:'Site', _vid:vid } });
            const order = doc.published.pages;
            const from = order.findIndex(item => item.slug === (fields._page || 'index'));
            if (from >= 0) await Promise.resolve().then(() => changeSite(projectId, d => countVisit(d, order[from].id, 'optins'))).catch(() => {});
            const next = project.kind === 'funnel' && from >= 0 ? order[from + 1] : null;
            const secure = String(req.headers['x-forwarded-proto'] || '').includes('https') || publicBase(req).startsWith('https') ? '; Secure' : '';
            res.setHeader('Set-Cookie', [...[res.getHeader('Set-Cookie') || []].flat(), `${siteVisitorCookie(workspace)}=${vid}; Max-Age=${365 * 86400}; Path=/; HttpOnly; SameSite=Lax${secure}`]);
            res.writeHead(303,{ Location:next ? `${base}/${encodeURIComponent(next.slug)}` : `${back}?sent=1` });
          } catch {
            res.writeHead(303,{ Location:`${back}?error=1` });
          }
          return res.end();
        }
        if (method !== 'GET') throw error('Method not allowed.',405);
        const page = doc.published.pages.find(item => item.slug === slug);
        if (!page) throw error('Page not found.',404);
        if (active && !url.searchParams.has('sent') && !url.searchParams.has('error')) await Promise.resolve().then(() => changeSite(projectId, d => countVisit(d, page.id, 'views'))).catch(() => {});
        const visitor = active && method === 'GET' ? siteVisitorOf(req, workspace) : '';
        if (visitor) {
          // A browser that already sent this sub-account a site form: the view counts for its contact.
          try { if (await change(workspace, { type:'site-pageview', data:{ projectId, pageId:page.id, page:page.slug, vid:visitor } })) flushLater(workspace); }
          catch (failure) { console.error(`Site page view (${workspace}): ${failure.message}`); }
        }
        const pt = /<html\b[^>]*\blang\s*=\s*["']?pt/i.test(page.html), es = /<html\b[^>]*\blang\s*=\s*["']?es/i.test(page.html);
        const notice = url.searchParams.has('sent') ? { ok:true, text:pt ? 'Obrigado! Seus dados foram enviados.' : es ? '¡Gracias! Tus datos fueron enviados.' : 'Thank you! Your details were sent.' }
          : url.searchParams.has('error') ? { ok:false, text:pt ? 'Não foi possível enviar. Confira o nome e o e-mail e tente de novo.' : es ? 'No se pudo enviar. Revisa el nombre y el correo e inténtalo de nuevo.' : 'Your details could not be sent. Check the name and email and try again.' } : '';
        const [siteHeaders, siteBody] = withPixels(await store.load(workspace), workspace, publicHeaders, renderPublic(page,{ base, notice }));
        res.writeHead(200, siteHeaders);
        return res.end(siteBody);
      }
      // Webinars: registration, watch room (attendance when the room is open) and calendar file.
      const webinarRoute = p.match(webinarPath);
      if (webinarRoute && (method === 'GET' || method === 'HEAD')) {
        await ready;
        const [, workspace, webinarId, part] = webinarRoute;
        const active = await publicAccountPolicy(workspace, false, 'sites');
        const state = await store.load(workspace);
        const webinar = state.webinars?.find(item => item.id === webinarId);
        const preview = await publicPreview(req, res, url, workspace);
        if (!webinar || (!webinar.active && !preview)) throw error('Este webinar não está disponível.',404);
        const zone = state.profile?.timezone || 'America/Sao_Paulo';
        const page = body => { res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer',
          'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'" }); return res.end(method === 'HEAD' ? undefined : body); };
        if (!part) return page(registrationPage(webinar, { workspace, zone }));
        const registration = state.webinarRegistrations.find(item => item.webinarId === webinarId && item.token === String(url.searchParams.get('t') || ''));
        if (!registration) throw error('Inscrição não encontrada. Use o link que você recebeu.',404);
        const session = webinar.sessions.find(item => item.id === registration.sessionId);
        if (part === 'agenda.ics') {
          if (!session) throw error('Sessão não encontrada.',404);
          res.writeHead(200, { 'Content-Type':'text/calendar; charset=utf-8', 'Content-Disposition':'attachment; filename="webinar.ics"' });
          return res.end(calendarFile(webinar, session, `${publicBase(req)}/w/${workspace}/${webinarId}/sala?t=${registration.token}`));
        }
        const now = Date.now();
        if (active && session && webinar.active && method === 'GET' && now >= Date.parse(session.start) - webinar.openBefore * 60000 && now < Date.parse(session.start) + session.duration * 60000)
          await Promise.resolve().then(() => change(workspace,{ type:'webinar-attend', id:webinarId, data:{ token:registration.token } })).catch(() => {});
        return page(roomPage(webinar, registration, { workspace, zone, at:now }));
      }
      const webinarCall = p.match(webinarApi);
      if (webinarCall) {
        await ready;
        if (method !== 'POST') throw error('Method not allowed.',405);
        const [, workspace, webinarId] = webinarCall;
        const input = await payload(req);
        await publicAccountPolicy(workspace, true, 'sites');
        const result = await change(workspace,{ type:'webinar-register', id:webinarId, data:{ name:input.name, email:input.email, phone:input.phone, sessionId:input.sessionId } });
        const registration = result.state.webinarRegistrations.find(item => item.id === result.id);
        return json({ room:`/w/${workspace}/${webinarId}/sala?t=${registration.token}` },201);
      }
      // QR Codes: count the scan and send the visitor on. The destination can change after printing.
      const qrRoute = p.match(qrPath);
      if (qrRoute && (method === 'GET' || method === 'HEAD')) {
        await ready;
        const [, workspace, qrId] = qrRoute;
        const active = await publicAccountPolicy(workspace, false, 'sites');
        const state = await store.load(workspace);
        const qr = state.qrCodes?.find(item => item.id === qrId);
        const target = qr?.active ? qrTarget(state, qr, { base:publicBase(req), workspace }) : '';
        if (!target) {
          res.writeHead(404, { 'Content-Type':'text/html; charset=utf-8', 'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'" });
          return res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QR Code indisponível</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;color:#101828;background:#f2f4f7}main{max-width:420px;padding:32px;border-radius:18px;background:#fff;text-align:center}</style></head><body><main><h1 style="font-size:22px;margin:0 0 8px">Este QR Code não está ativo</h1><p style="margin:0;color:#475467">O destino foi pausado ou removido por quem criou o código.</p></main></body></html>`);
        }
        if (active && method === 'GET') {
          const visitor = `${req.headers['x-forwarded-for'] || req.socket?.remoteAddress || ''}|${req.headers['user-agent'] || ''}`;
          await Promise.resolve().then(() => change(workspace,{ type:'qr-scan', id:qrId, data:{ visitor, device:deviceOf(String(req.headers['user-agent'] || '')) } })).catch(() => {});
        }
        res.writeHead(302, { Location:target, 'Cache-Control':'no-store' });
        return res.end();
      }
      // Stores: catalog, product page and cart. Totals always come from quoteOrder on the server.
      const storeRoute = p.match(storePath);
      if (storeRoute && (method === 'GET' || method === 'HEAD')) {
        await ready;
        const [, workspace, storeId, cart, slug] = storeRoute;
        await publicAccountPolicy(workspace, false, 'sites');
        const state = await store.load(workspace);
        const shop = state.stores?.find(item => item.id === storeId);
        const preview = await publicPreview(req, res, url, workspace);
        if (!shop || (!shop.active && !preview)) throw error('Esta loja não está aberta.',404);
        const base = `/loja/${workspace}/${storeId}`;
        let body;
        if (cart) body = storeCart(state, shop, { base, workspace });
        else if (slug) { const item = catalog(state, shop).find(row => row.slug === slug); if (!item) throw error('Produto não encontrado.',404); body = storeProduct(state, shop, item, { base }); }
        else body = storeHome(state, shop, { base, category:String(url.searchParams.get('categoria') || '').slice(0,40), collection:String(url.searchParams.get('colecao') || '').slice(0,80) });
        const [storeHeaders, storeBody] = withPixels(state, workspace, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'Referrer-Policy':'strict-origin-when-cross-origin',
          'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'" }, body);
        res.writeHead(200, storeHeaders);
        return res.end(method === 'HEAD' ? undefined : storeBody);
      }
      // Affiliates: the referral link, the program sign-up and the affiliate's private dashboard.
      const referral = p.match(affiliateLink);
      if (referral && (method === 'GET' || method === 'HEAD')) {
        await ready;
        const [, workspace, code, campaignId = ''] = referral;
        await publicAccountPolicy(workspace, false, 'marketing');
        const clicked = method === 'GET' ? (await change(workspace, { type: 'affiliate-click', data: { code, campaignId } })).id : null;
        if (!clicked) throw error('Este link de afiliado não está ativo.', 404);
        const cookie = affiliateCookie(workspace);
        const current = referralsOf(req)[workspace];
        const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
          Location: clicked.destination.startsWith('/') ? publicBase(req) + clicked.destination : clicked.destination };
        // First touch: an earlier referral keeps its credit while it is still valid.
        if (!current || Date.now() - current.at > clicked.cookieDays * 864e5) {
          const secure = String(req.headers['x-forwarded-proto'] || '').includes('https') || publicBase(req).startsWith('https') ? '; Secure' : '';
          headers['Set-Cookie'] = [...[res.getHeader('Set-Cookie') || []].flat(), `${cookie}=${encodeURIComponent(`${clicked.affiliateId}.${clicked.campaignId}.${Date.now()}`)}; Max-Age=${clicked.cookieDays * 86400}; Path=/; HttpOnly; SameSite=Lax${secure}`];
        }
        res.writeHead(302, headers);
        return res.end();
      }
      const affiliatePage = p.match(affiliatePagePath);
      if (affiliatePage && (method === 'GET' || method === 'HEAD')) {
        await ready;
        const [, workspace, token = ''] = affiliatePage;
        await publicAccountPolicy(workspace, false, 'marketing');
        const state = await store.load(workspace);
        let page;
        if (token) {
          const portal = affiliatePortal(state, portalTokenHash(token));
          if (!portal) throw error('Este link de painel não é válido. Peça um novo à empresa.', 404);
          page = renderPortal(state, portal, { workspace, origin: publicBase(req) });
        } else page = renderSignup(state, { workspace });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': affiliatePageCsp, 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' });
        return res.end(method === 'HEAD' ? undefined : page);
      }
      const affiliateJoin = p.match(affiliateSignupApi);
      if (affiliateJoin && method === 'POST') {
        await ready;
        const [, workspace] = affiliateJoin;
        await publicAccountPolicy(workspace, true, 'marketing');
        const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);
        if (!allowSign(ip)) throw error('Muitas tentativas a partir desta conexão. Aguarde alguns minutos.', 429);
        const input = await payload(req);
        const result = (await change(workspace, { type: 'affiliate-signup', data: { name: input.name, email: input.email, phone: input.phone, pix: input.pix, terms: input.terms === true, website: input.website } })).id;
        flushLater(workspace);
        return json(result.token ? { ok: true, approval: result.status, portal: `/afiliados/${workspace}/${result.token}` } : { ok: true }, 201);
      }
      // Review widget (iframe page and loader script), approved videos, and the video testimonial collector.
      const widgetRoute = p.match(widgetPath);
      if (widgetRoute && (method === 'GET' || method === 'HEAD')) {
        await ready;
        const [, workspace, widgetId, part] = widgetRoute;
        await publicAccountPolicy(workspace, false, 'reputation');
        const state = await store.load(workspace);
        const widget = state.reviewWidgets?.find(row => row.id === widgetId && row.active);
        if (part) {
          res.writeHead(widget ? 200 : 404, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' });
          return res.end(method === 'HEAD' || !widget ? undefined : widgetLoader({ origin: publicBase(req), workspace, widgetId }));
        }
        if (!widget) throw error('Este widget não está ativo.', 404);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=120', 'Content-Security-Policy': widgetCsp, 'Referrer-Policy': 'no-referrer' });
        return res.end(method === 'HEAD' ? undefined : renderWidget(state, widget, { workspace }));
      }
      const videoRoute = p.match(videoPath);
      if (videoRoute && (method === 'GET' || method === 'HEAD')) {
        await ready;
        const [, workspace, videoId] = videoRoute;
        await publicAccountPolicy(workspace, false, 'reputation');
        const row = (await store.load(workspace)).videoTestimonials?.find(item => item.id === videoId && item.status === 'approved');
        if (!row) throw error('Vídeo não encontrado.', 404);
        return await sendVideo(req, res, method, workspace, row, 'public, max-age=600');
      }
      const collectorRoute = p.match(collectorPath);
      if (collectorRoute && (method === 'GET' || method === 'HEAD')) {
        await ready;
        const [, workspace, collectorId] = collectorRoute;
        await publicAccountPolicy(workspace, false, 'reputation');
        const state = await store.load(workspace);
        const collector = state.videoCollectors?.find(row => row.id === collectorId && row.active);
        if (!collector) throw error('Este link de depoimento não está ativo.', 404);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': collectorCsp, 'Permissions-Policy': 'camera=(self), microphone=(self)', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' });
        return res.end(method === 'HEAD' ? undefined : renderCollector(state, collector, { workspace }));
      }
      const collectorCall = p.match(collectorApi);
      if (collectorCall && method === 'POST') {
        await ready;
        const [, workspace, collectorId, step] = collectorCall;
        await publicAccountPolicy(workspace, true, 'reputation');
        const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);
        if (step !== 'chunk' && !allowSign(ip)) throw error('Muitas tentativas a partir desta conexão. Aguarde alguns minutos.', 429);
        const input = await payload(req);
        const result = (await change(workspace, { type: `video-${step}`, id: collectorId, data: input })).id;
        if (step === 'chunk') {
          const rowId = mediaRowId(workspace, result.upload.id, result.index);
          if (!await store.insert(rowId, { data: result.data })) await store.change(rowId, row => { row.data = result.data; });
          return json({ ok: true, index: result.index });
        }
        if (step === 'finish') { flushLater(workspace); return json({ ok: true }, 201); }
        return json(result);
      }
      // Review link: the public page (generic or personal) and the review it sends.
      const reviewRoute = p.match(reviewPagePath);
      if (reviewRoute && (method === 'GET' || method === 'HEAD')) {
        await ready;
        const [, workspace, token = ''] = reviewRoute;
        const active = await publicAccountPolicy(workspace, false, 'reputation');
        const state = await store.load(workspace);
        const tokenHash = token ? reviewTokenHash(token) : '';
        const request = tokenHash ? state.reviewRequests?.find(row => row.tokenHash === tokenHash) : null;
        if (token && !request) throw error('Este link de avaliação não é válido.', 404);
        if (request && active && method === 'GET' && request.status === 'sent') await Promise.resolve().then(() => change(workspace, { type: 'review-open', data: { tokenHash } })).catch(() => {});
        const contact = request ? state.contacts.find(row => row.id === request.contactId) : null;
        const tint = (await clientPortal.directory(workspace).catch(() => null))?.settings?.color || '';
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': reviewPageCsp, 'X-Robots-Tag': 'noindex' });
        return res.end(method === 'HEAD' ? undefined : renderReviewPage(state, { workspace, token, contactName: contact?.name || '', done: request?.status === 'reviewed', tint }));
      }
      const reviewSubmit = p.match(reviewApi);
      if (reviewSubmit && method === 'POST') {
        await ready;
        const [, workspace] = reviewSubmit;
        await publicAccountPolicy(workspace, true, 'reputation');
        const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);
        if (!allowSign(ip)) throw error('Muitas tentativas a partir desta conexão. Aguarde alguns minutos.', 429);
        const input = await payload(req);
        const tokenHash = input.token ? reviewTokenHash(String(input.token)) : '';
        if (input.token && !tokenHash) throw error('Este link de avaliação não é válido.', 404);
        const result = await change(workspace, { type: 'review-submit', data: { tokenHash, score: input.score, text: input.text, name: input.name, website: input.website } });
        if (result.state.workflowOutbox?.length) flushLater(workspace);
        return json({ ok: true }, 201);
      }
      const offerRoute = p.match(offerPath);
      if (offerRoute && (method === 'GET' || method === 'HEAD')) {
        await ready;
        const [, workspace, offerId] = offerRoute;
        await publicAccountPolicy(workspace, false, 'memberships');
        const state = await store.load(workspace);
        const offer = state.offers?.find(row => row.id === offerId && row.status === 'published');
        if (!offer) throw error('Esta oferta não está disponível.',404);
        const color = (await clientPortal.directory(workspace)).settings?.color || '';
        const status = ['pago','voltou'].includes(url.searchParams.get('status')) ? url.searchParams.get('status') : '';
        const [offerHeaders, offerBody] = withPixels(state, workspace, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'Referrer-Policy':'strict-origin-when-cross-origin', 'Content-Security-Policy':offerPageCsp }, renderOfferPage(state, offer, { workspace, status, color }));
        res.writeHead(200, offerHeaders);
        return res.end(method === 'HEAD' ? undefined : offerBody);
      }
      // Agenda de serviços: the public booking page (choose a service, a day and a free time; no script).
      const booking = p.match(bookingPath);
      if (booking && ['GET', 'HEAD', 'POST'].includes(method)) {
        await ready;
        const [, workspace] = booking;
        await publicAccountPolicy(workspace, method === 'POST', 'calendars');
        const q = url.searchParams, base = `/agendar/${workspace}`;
        let done = null, failure = '', status = 200, form = {};
        if (method === 'POST') {
          const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);
          if (!allowSign(ip)) throw error('Muitas tentativas a partir desta conexão. Aguarde alguns minutos.', 429);
          form = await formBody(req);
          const one = value => Array.isArray(value) ? value[0] : value;
          try {
            const result = await change(workspace, { type: 'scheduling-book', data: { serviceId: one(form.servico), start: one(form.inicio), name: one(form.nome), email: one(form.email), phone: one(form.telefone), address: one(form.endereco), notes: one(form.notas), units: one(form.unidades), quantity: one(form.qtd), link: one(form.link) } });
            flushLater(workspace);
            const zone = zoneOf(await store.load(workspace)), booked = result.id;
            done = { service: booked.service, staff: booked.staff, when: `${new Intl.DateTimeFormat('pt-BR', { timeZone: zone, weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(booked.start))} às ${clockIn(Date.parse(booked.start), zone)}` };
          } catch (failed) {
            if (!failed.status || failed.status >= 500) throw failed;
            failure = failed.message; status = failed.status;
          }
        }
        const one2 = value => Array.isArray(value) ? value[0] : value;
        const view = bookingView(await store.load(workspace), { serviceId: String(form.servico || q.get('servico') || ''), day: String(q.get('dia') || ''), units: Number(form.unidades || q.get('unidades')) || 1, quantity: Number(form.qtd || q.get('qtd')) || 1, link: String(one2(form.link) || q.get('link') || '') });
        if (!view) throw error('O agendamento online desta empresa está desligado.', 404);
        res.writeHead(status, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'Referrer-Policy':'same-origin', 'Content-Security-Policy':bookingCsp });
        return res.end(method === 'HEAD' ? undefined : bookingPage(view, { base, done, error: failure, form }));
      }
      // Central de preferências: the contact's own page (link with a private token) to choose channels and topics.
      const preference = p.match(preferencePath);
      if (preference && ['GET', 'HEAD', 'POST'].includes(method)) {
        await ready;
        const [, workspace, token] = preference;
        await publicAccountPolicy(workspace, method === 'POST', 'contacts');
        let saved = false;
        if (method === 'POST') {
          const form = await formBody(req), list = value => [].concat(value || []);
          await change(workspace, { type: 'preferences-save', data: { token, channels: list(form.channels), topics: list(form.topics), all: form.all === '1' } });
          flushLater(workspace); saved = true;
        }
        const view = preferenceView(await store.load(workspace), token);
        if (!view) throw error('Link de preferências inválido.',404);
        res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'Referrer-Policy':'same-origin', 'X-Robots-Tag':'noindex', 'Content-Security-Policy':preferenceCsp });
        return res.end(method === 'HEAD' ? undefined : preferencePage(view, { saved }));
      }
      // The agency's mobile app (6.6): install page, manifest, icons, service worker (push) and the app-mode config.
      const mobile = p.match(mobilePath);
      if (mobile && (method === 'GET' || method === 'HEAD')) {
        await ready;
        const [, agencyId, part = ''] = mobile;
        let agency;
        try { agency = await loadAgency(agencyId); } catch { throw error('App não encontrado.',404); }
        const app = mobileOf(structuredClone(agency));
        if (app.status !== 'published') throw error('Este app ainda não foi publicado pela agência.',404);
        const done = (type, body, extra = {}) => { res.writeHead(200, { 'Content-Type':type, 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff', ...extra }); return res.end(method === 'HEAD' ? undefined : body); };
        if (part === 'manifest.webmanifest') return done('application/manifest+json; charset=utf-8', JSON.stringify(mobileManifest(app, agencyId)));
        if (part === 'sw.js') return done('text/javascript; charset=utf-8', mobileWorker(agencyId), { 'Service-Worker-Allowed':`/mobile/${agencyId}/` });
        if (part === 'config.json') return done('application/json; charset=utf-8', JSON.stringify(mobileConfig(app, agencyId)));
        if (part.startsWith('icon-')) {
          const size = part.slice(5, -4), source = (size === '192' && app.icon192) || (size === '512' && app.icon512) || app.icon;
          if (!source) throw error('Ícone não encontrado.',404);
          return done('image/png', Buffer.from(source.split(',')[1], 'base64'));
        }
        return done('text/html; charset=utf-8', mobileLaunchPage(app, agencyId), { 'Content-Security-Policy':mobileCsp, 'Referrer-Policy':'no-referrer' });
      }
      if (p === '/push/sw.js' && (method === 'GET' || method === 'HEAD')) {
        res.writeHead(200, { 'Content-Type':'text/javascript; charset=utf-8', 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff' });
        return res.end(method === 'HEAD' ? undefined : mobileWorker('push').replaceAll('/mobile/push/icon-192.png', '/favicon.svg'));
      }
      if (p === '/.well-known/assetlinks.json' && (method === 'GET' || method === 'HEAD')) {
        await ready;
        const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase().split(':')[0];
        const found = await Promise.resolve().then(() => store.findAgency({ mobileApp: { store: { domain: host } } })).catch(() => null);
        const links = found && assetLinksFor([found.state], host);
        if (!links) throw error('Not found.',404);
        res.writeHead(200, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'public, max-age=3600' });
        return res.end(method === 'HEAD' ? undefined : JSON.stringify(links));
      }
      // The agency's installable desktop app: the branded sign-in screen, its manifest, icons and service worker.
      const desktop = p.match(desktopPath);
      if (desktop && (method === 'GET' || method === 'HEAD')) {
        await ready;
        const [, agencyId, part = ''] = desktop;
        let agency;
        try { agency = await loadAgency(agencyId); } catch { throw error('App não encontrado.',404); }
        const app = desktopOf(structuredClone(agency));
        if (app.status !== 'published') throw error('Este app ainda não foi publicado pela agência.',404);
        const done = (type, body, extra = {}) => { res.writeHead(200, { 'Content-Type':type, 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff', ...extra }); return res.end(method === 'HEAD' ? undefined : body); };
        if (part === 'manifest.webmanifest') return done('application/manifest+json; charset=utf-8', JSON.stringify(desktopManifest(app, agencyId)));
        if (part === 'sw.js') return done('text/javascript; charset=utf-8', desktopWorker, { 'Service-Worker-Allowed':`/desktop/${agencyId}/` });
        if (part.startsWith('icon-')) {
          const size = part.slice(5, -4), source = (size === '192' && app.icon192) || (size === '512' && app.icon512) || app.icon;
          if (!source) throw error('Ícone não encontrado.',404);
          return done('image/png', Buffer.from(source.split(',')[1], 'base64'));
        }
        return done('text/html; charset=utf-8', desktopLaunchPage(app, agencyId, { signedIn: Boolean(auth?.hasSession?.(req)) }), { 'Content-Security-Policy':desktopCsp, 'Referrer-Policy':'no-referrer' });
      }
      // Certificates and badges: a public page anyone with the code can open to see and verify it.
      const certificate = p.match(certificatePath);
      if (certificate && (method === 'GET' || method === 'HEAD')) {
        await ready;
        const [, workspace, code] = certificate;
        await publicAccountPolicy(workspace, false, 'memberships');
        const state = await store.load(workspace);
        const row = (state.credentialsIssued || []).find(item => item.code === code);
        if (!row) throw error('Certificado não encontrado.',404);
        res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer', 'X-Robots-Tag':'noindex', 'Content-Security-Policy':certificateCsp });
        return res.end(method === 'HEAD' ? undefined : certificatePage(state, row));
      }
      const offerCall = p.match(offerApi);
      if (offerCall) {
        await ready;
        if (method !== 'POST') throw error('Method not allowed.',405);
        const [, workspace, offerId] = offerCall;
        const input = await payload(req);
        await publicAccountPolicy(workspace, true, 'memberships');
        const current = await store.load(workspace);
        const offer = current.offers?.find(row => row.id === offerId && row.status === 'published');
        if (!offer) throw error('Esta oferta não está disponível.',404);
        const agencyId = current.agencyId || AGENCY_ID;
        if (offer.type !== 'free' && !(await abacate.connected(agencyId, workspace))) throw error('O pagamento online desta oferta ainda não está disponível. Fale com a equipe.',409);
        const result = await change(workspace,{ type:'offer-checkout', id:offerId, data:{ name:input.name, email:input.email } });
        if (offer.type === 'free') {
          const { emailed } = await grantOffer(workspace, offerId, result.id);
          return json({ enrolled:true, emailed });
        }
        const origin = publicBase(req), page = `${origin}/oferta/${workspace}/${offerId}`;
        const payment = await abacate.chargeInvoice(agencyId, workspace, result.id, origin, { returnUrl:`${page}?status=voltou`, completionUrl:`${page}?status=pago` });
        return json({ payUrl:payment.url });
      }
      const storeCall = p.match(storeApi);
      if (storeCall) {
        await ready;
        if (method !== 'POST') throw error('Method not allowed.',405);
        const [, workspace, storeId, op] = storeCall;
        const input = await payload(req);
        await publicAccountPolicy(workspace, true, 'sites');
        await publicAccountPolicy(workspace, true, 'payments');
        if (op === 'cart') {
          const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);
          if (!allowSign(ip)) throw error('Muitas tentativas a partir desta conexão. Aguarde alguns minutos.',429);
          return json((await change(workspace,{ type:'store-cart', id:storeId, data:{ session:input.session, name:input.name, email:input.email, phone:input.phone, items:input.items, coupon:input.coupon, delivery:input.delivery } })).id);
        }
        if (op === 'view') {
          // "Produto visualizado": the contact comes from the cart session on the server, never from the page.
          const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);
          if (!allowTracking(ip)) throw error('Muitas visualizações a partir desta conexão. Aguarde alguns minutos.',429);
          const viewed = await change(workspace,{ type:'store-view', id:storeId, data:{ session:input.session, productId:input.productId } });
          if (viewed.state.workflowOutbox?.length) flushLater(workspace);
          return json({ tracked: Boolean(viewed.id?.tracked) });
        }
        if (op === 'review') {
          const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);
          if (!allowSign(ip)) throw error('Muitas tentativas a partir desta conexão. Aguarde alguns minutos.',429);
          return json((await change(workspace,{ type:'store-review', id:storeId, data:{ productId:input.productId, name:input.name, email:input.email, rating:input.rating, title:input.title, body:input.body, website:input.website } })).id,201);
        }
        if (op === 'restore') {
          const digest = cartTokenHash(input.token);
          if (!digest) throw error('Este link de recuperação não é válido.',404);
          return json((await change(workspace,{ type:'store-cart-restore', id:storeId, data:{ tokenHash:digest } })).id);
        }
        if (op === 'quote') {
          const state = await store.load(workspace);
          const shop = state.stores?.find(item => item.id === storeId && item.active);
          if (!shop) throw error('Esta loja não está aberta.',404);
          const { coupon_, giftCard_, ...quote } = quoteOrder(state, shop, input);
          return json(quote);
        }
        const result = await change(workspace,{ type:'store-checkout', id:storeId, data:input });
        const order = result.state.orders.find(item => item.id === result.id), shop = result.state.stores.find(item => item.id === storeId);
        let payUrl = '';
        if (shop.payment.method === 'AbacatePay') {
          const origin = publicBase(req), back = `${origin}/loja/${workspace}/${storeId}`;
          payUrl = await abacate.chargeInvoice(result.state.agencyId || AGENCY_ID, workspace, order.invoiceId, origin, { returnUrl: back, completionUrl: back })
            .then(payment => payment.url).catch(() => '');
        }
        return json({ number:order.number, total:order.total, method:methodLabel[shop.payment.method] || shop.payment.method, instructions:shop.payment.instructions, thanks:shop.thanks, payUrl },201);
      }
      // Blogs: home with categories and pages, posts with SEO tags, and RSS. Drafts open with ?preview=1 when signed in.
      // Brand group reports shared by link: the token finds the agency, so no agency id is exposed.
      const brandGroupShare = p.match(brandGroupRoute);
      if (brandGroupShare && (method === 'GET' || method === 'HEAD')) {
        await ready;
        const token = brandGroupShare[1];
        const match = await store.findAgency({ brandGroups: [{ share: { id: token } }] });
        const agency = match && hydrateAgency(match.state);
        const group = agency?.brandGroups.find(row => row.share?.id === token);
        if (!group || (group.share.expires && Date.parse(group.share.expires) <= Date.now())) throw error('Este relatório não está mais compartilhado.',404);
        const asked = url.searchParams.get('lang');
        const lang = ['pt', 'es'].includes(asked) ? asked : group.share.lang;
        const data = brandGroupData(group, await brandWorkspaces(agency, match.id, group));
        res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer', 'X-Robots-Tag':'noindex',
          'Content-Security-Policy':"default-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" });
        return res.end(method === 'HEAD' ? undefined : brandGroupPage(data, { lang, path: p, agency: agency.company }));
      }
      // Presentations shared by public link:
      const presentationShare = p.match(presentationRoute);
      if (presentationShare && (method === 'GET' || method === 'HEAD')) {
        await ready;
        const token = presentationShare[1];
        const match = await store.findAgency({ presentations: [{ share: { id: token } }] });
        const agency = match && hydrateAgency(match.state);
        const presentation = agency?.presentations?.find(row => row.share?.id === token);
        if (!presentation || (presentation.share.expires && Date.parse(presentation.share.expires) <= Date.now())) throw error('Esta apresentação não está mais compartilhada.', 404);
        const asked = url.searchParams.get('lang');
        const lang = ['pt', 'es'].includes(asked) ? asked : (presentation.share.lang || 'pt');
        const autoPrint = url.searchParams.has('print');
        const html = presentationPageHtml(presentation, { lang, autoPrint, company: agency.company });
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer',
          'X-Robots-Tag': 'noindex',
          'Content-Security-Policy': "default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'unsafe-inline'; font-src 'self'; img-src 'self' data: https:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
        });
        return res.end(method === 'HEAD' ? undefined : html);
      }
      // Shared reports: read-only, rendered here so the page never receives the workspace state.
      const sharedReport = p.match(sharedReportRoute);
      if (sharedReport && (method === 'GET' || method === 'HEAD')) {
        await ready;
        const [, workspace, shareId] = sharedReport;
        await publicAccountPolicy(workspace, false, 'reporting');
        const state = await store.load(workspace);
        const report = findSharedReport(state, shareId);
        if (!report) throw error('Este relatório não está mais compartilhado.',404);
        const asked = url.searchParams.get('lang');
        const html = sharedReportPage(state, report, { lang: ['pt', 'es'].includes(asked) ? asked : report.share.lang, path: p });
        res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer', 'X-Robots-Tag':'noindex',
          'Content-Security-Policy':"default-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" });
        return res.end(method === 'HEAD' ? undefined : html);
      }
      const blogRoute = p.match(blogPath);
      if (blogRoute && (method === 'GET' || method === 'HEAD')) {
        await ready;
        const [, workspace, blogId, slug] = blogRoute;
        const active = await publicAccountPolicy(workspace, false, 'sites');
        const state = await store.load(workspace);
        const blog = state.blogs?.find(item => item.id === blogId);
        const preview = await publicPreview(req, res, url, workspace);
        if (!blog || (!blog.active && !preview)) throw error('Este blog não está publicado.',404);
        const base = `/b/${workspace}/${blogId}`, origin = publicBase(req);
        const html = (status, page) => { const [headers, body] = withPixels(state, workspace, { 'Content-Type':'text/html; charset=utf-8', 'Referrer-Policy':'strict-origin-when-cross-origin', 'Cache-Control':'no-store',
          'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'" }, page); res.writeHead(status, headers); return res.end(method === 'HEAD' ? undefined : body); };
        if (slug === 'rss.xml') {
          if (blog.rss === false) throw error('Este blog não tem RSS.',404);
          res.writeHead(200, { 'Content-Type':'application/rss+xml; charset=utf-8', 'Cache-Control':'no-store' });
          return res.end(method === 'HEAD' ? undefined : blogRss(state, blog, { base, origin }));
        }
        if (!slug) return html(200, blogHome(state, blog, { base, origin, category:String(url.searchParams.get('categoria') || '').slice(0,80), page:Number(url.searchParams.get('pagina')) || 1 }));
        const post = state.blogPosts.find(item => item.blogId === blogId && item.slug === slug);
        if (!post || (!isLive(post) && !preview)) throw error('Artigo não encontrado.',404);
        if (active && !preview && method === 'GET') await Promise.resolve().then(() => change(workspace,{ type:'blog-view', id:post.id })).catch(() => {});
        return html(200, blogPost(state, blog, post, { base, origin, preview }));
      }
      if (p === '/api/blog/ai' && method === 'POST') {
        const who = await workspaceAccess(req,res,id,{ modules:['sites'] });
        const input = await payload(req);
        const connection = await openAI.status(who.session).then(status => status.configured ? openAI.requireConnection(who.session) : null);
        if (input.mode === 'seo') {
          if (!connection) throw error('Conecte a OpenAI em Configurações para gerar o SEO com IA.',409);
          return json({ ai:true, seo:await meteredAI(who, id, 'blog', metered => content.postSeo(metered,{ title:input.title, body:input.body })) });
        }
        if (!String(input.topic || input.title || '').trim()) throw error('Descreva o tema do artigo.',400);
        input.voice = await brandVoiceOf(id);
        return json(connection ? { ai:true, post:await meteredAI(who, id, 'blog', metered => content.writePost(metered, input)) } : { ai:false, post:localDraft(input) });
      }
      // Chat widget: the loader a site embeds, the panel it opens in an iframe, a demo page and the visitor API.
      const chatRoute = p.match(chatPath);
      if (chatRoute && (method === 'GET' || method === 'HEAD')) {
        await ready;
        const [, workspace, widgetId, part] = chatRoute;
        await publicAccountPolicy(workspace, false, 'sites');
        const state = await store.load(workspace);
        const widget = state.chatWidgets?.find(item => item.id === widgetId);
        if (widget && !widget.active) await workspaceAccess(req, res, workspace, { modules: ['sites'], hide: true });
        if (!widget) throw error('Este chat não está publicado.',404);
        if (part === 'widget.js') {
          res.writeHead(200, { 'Content-Type':'text/javascript; charset=utf-8', 'Cache-Control':'no-cache', 'Cross-Origin-Resource-Policy':'cross-origin' });
          return res.end(method === 'HEAD' ? undefined : widget.active ? loaderScript(widget, { workspace }) : '/* chat em rascunho */');
        }
        if (part === 'demo') {
          res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; frame-src 'self'; base-uri 'none'; frame-ancestors 'self'" });
          return res.end(method === 'HEAD' ? undefined : demoPage(widget, { workspace, brand:state.profile?.name || '' }));
        }
        res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Referrer-Policy':'same-origin',
          'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors *" });
        return res.end(method === 'HEAD' ? undefined : chatPage(widget, { workspace }));
      }
      const chatCall = p.match(chatApi);
      if (chatCall) {
        await ready;
        const [, workspace, widgetId, op] = chatCall;
        await publicAccountPolicy(workspace, method === 'POST', 'sites');
        const token = String(req.headers['x-chat-token'] || '');
        const tokenHash = /^[0-9a-f]{48}$/.test(token) ? hash(token) : '';
        if (op === 'messages') {
          if (method !== 'GET') throw error('Method not allowed.',405);
          const state = await store.load(workspace);
          if (!state.chatWidgets?.some(item => item.id === widgetId && item.active)) throw error('Este chat não está disponível.',404);
          return json({ messages:chatHistory(state, widgetId, tokenHash) });
        }
        if (method !== 'POST') throw error('Method not allowed.',405);
        const input = await payload(req);
        if (op === 'start') {
          const fresh = randomBytes(24).toString('hex');
          const result = await change(workspace,{ type:'chat-start', id:widgetId, data:{ name:input.name, email:input.email, phone:input.phone, body:input.body, page:req.headers.referer || '', tokenHash:hash(fresh) } });
          return json({ token:fresh, messages:chatHistory(result.state, widgetId, hash(fresh)) },201);
        }
        const result = await change(workspace,{ type:'chat-send', id:widgetId, data:{ body:input.body, tokenHash } });
        return json({ messages:chatHistory(result.state, widgetId, tokenHash) },201);
      }
      const formRoute = p.match(formPath);
      if (formRoute) {
        await ready;
        const [, workspace, formId] = formRoute;
        const embed = url.searchParams.get('embed') === '1', preview = url.searchParams.get('preview') === '1';
        if (preview) {
          await workspaceAccess(req, res, workspace, { modules: ['sites'], hide: true });
        }
        const active = await publicAccountPolicy(workspace, method === 'POST', 'sites');
        const state = await store.load(workspace);
        const form = state.forms.find(item => item.id === formId);
        if (!form || (!form.active && !preview)) throw error('Este formulário não está publicado.',404);
        const redirects = form.onSubmit?.action === 'redirect' && form.onSubmit.url;
        const page = (status, options) => {
          const [headers, body] = withPixels(preview ? null : state, workspace, { 'Content-Type':'text/html; charset=utf-8', 'Referrer-Policy':'same-origin',
            'Content-Security-Policy':`default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; object-src 'none'; form-action 'self'${redirects ? ' https: http:' : ''}; frame-ancestors *` },
            formPage(form, { action:`/form/${workspace}/${formId}${embed ? '?embed=1' : preview ? '?preview=1' : ''}`, target:embed && redirects ? '_top' : '',
            customFields:state.customFields || [], embed, brand:state.profile?.name || '', ...options }));
          res.writeHead(status, headers);
          return res.end(method === 'HEAD' ? undefined : body);
        };
        if (!formOpen(form)) return page(200, { notice:{ title:'Formulário encerrado', text:form.schedule?.closedMessage || 'Este formulário não está recebendo respostas agora.' } });
        if (method === 'GET' || method === 'HEAD') {
          if (active && method === 'GET' && !preview && form.active) await Promise.resolve().then(() => change(workspace,{ type:'form-view', id:formId })).catch(() => {});
          const values = Object.fromEntries([...url.searchParams].filter(([key]) => !['embed','preview','__path'].includes(key)).map(([key, value]) => [key, value.slice(0,500)]));
          return page(200, { values });
        }
        if (!form.active) throw error('Publique o formulário para receber respostas.',403);
        const input = await formBody(req);
        const read = readAnswers(form, input, state.customFields || []);
        if (!read.ok) return page(422, { values:read.values, errors:read.errors });
        await publicAccountPolicy(workspace, true, 'sites');
        try { await change(workspace,{ type:'submit', id:formId, data:{ ...input, _vid:'', _source:embed ? 'Incorporado' : 'Link' } }); }
        catch (failure) { return page(failure.status && failure.status < 500 ? 422 : 500, { values:read.values, errors:{ _form:failure.status && failure.status < 500 ? failure.message : 'Não foi possível enviar agora. Tente de novo.' } }); }
        if (redirects) { res.writeHead(303, { Location:form.onSubmit.url }); return res.end(); }
        const tier = read.result?.tierDetail;
        if (read.result) return page(200, { notice:{ result:read.result, text:tier?.message || form.onSubmit?.message || '', cta:tier?.ctaUrl ? { url:tier.ctaUrl, label:tier.ctaLabel } : null } });
        return page(200, { notice:{ title:'Obrigado!', text:form.onSubmit?.message || 'Recebemos suas respostas.' } });
      }
      const hook = p.match(hookPath);
      if (hook && method === 'POST') {
        await ready;
        const [, workspace, workflowId, triggerId] = hook;
        const state = await Promise.resolve().then(() => store.load(workspace)).catch(() => null);
        const flow = state?.workflows?.find(row => row.id === workflowId && row.active);
        const secret = flow?.triggers?.find(t => t.id === triggerId && t.type === 'inbound_webhook')?.config?.secret || '';
        const key = String(url.searchParams.get('key') || req.headers['x-soci-key'] || '');
        if (!secret || key.length !== secret.length || !timingSafeEqual(Buffer.from(key), Buffer.from(secret))) throw error('Webhook não encontrado.', 404);
        await publicAccountPolicy(workspace, true, 'automation');
        const body = await payload(req).catch(() => ({}));
        const result = await change(workspace, { type: 'workflow-hook', data: { workflowId, triggerId, payload: body && typeof body === 'object' && !Array.isArray(body) ? body : {} } });
        if (result.state.workflowOutbox?.length) flushLater(workspace);
        return json({ ok: true, run: result.id === 'already-enrolled' ? null : result.id }, 202);
      }
      // Contadores: the animated GIF for e-mails (?s= is when the e-mail was sent, for evergreen timers)
      // and the page that sites embed in an iframe.
      const countdownRoute = p.match(countdownPath);
      if (countdownRoute && (method === 'GET' || method === 'HEAD')) {
        await ready;
        const [, workspace, timerId, gif] = countdownRoute;
        let timer = null;
        try { await publicAccountPolicy(workspace, false, 'marketing'); timer = (await store.load(workspace)).countdownTimers?.find(row => row.id === timerId) || null; } catch { timer = null; }
        if (gif) {
          let bytes = blankGif;
          if (timer) {
            const now = Date.now(), sent = Number(url.searchParams.get('s')) * 1000, created = Date.parse(timer.created) || 0;
            const start = Number.isFinite(sent) && sent > 0 ? Math.min(now, Math.max(created, sent)) : now;
            const key = `${workspace}:${timerId}:${timer.updated || timer.created}:${start}:${Math.floor(now / 1000)}`;
            bytes = countdownCache.get(key);
            if (!bytes) {
              bytes = countdownGif(timer, deadlineOf(timer, start) - now);
              if (countdownCache.size >= 200) countdownCache.delete(countdownCache.keys().next().value);
              countdownCache.set(key, bytes);
            }
          }
          res.writeHead(200, { 'Content-Type': 'image/gif', 'Content-Length': bytes.length, 'Cache-Control': 'no-store, no-cache, max-age=0', Expires: '0' });
          return res.end(method === 'HEAD' ? undefined : bytes);
        }
        if (!timer) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Contador indisponível.'); }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
          'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors *" });
        return res.end(method === 'HEAD' ? undefined : embedPage(timer, { key: `${workspace}-${timerId}` }));
      }
      // E-mail campaigns: open pixel, click redirect and unsubscribe page of one recipient.
      const tracked = p.match(emailTrackPath);
      if (tracked && ['GET', 'HEAD', 'POST'].includes(method)) {
        await ready;
        const [, kind, workspace, token, index] = tracked;
        const page = (status, title, body) => {
          res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'" });
          return res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;color:#18181b;background:#f4f4f5}main{max-width:440px;margin:16px;padding:32px;border-radius:16px;background:#fff;text-align:center}h1{font-size:22px;margin:0 0 8px}p{margin:0 0 16px;color:#52525b}button{font:inherit;font-weight:600;border:0;border-radius:8px;padding:12px 20px;background:#18181b;color:#fff;cursor:pointer}</style></head><body><main><h1>${esc(title)}</h1>${body}</main></body></html>`);
        };
        let active = false;
        try { active = await publicAccountPolicy(workspace, false, 'marketing'); }
        catch { if (kind !== 'o') return page(404, 'Link indisponível', '<p>Este e-mail não está mais disponível.</p>'); }
        const track = async (event, write) => {
          if (!write) return execute(await store.load(workspace), { type: 'email-track', data: { token, event: 'info' } });
          const result = await change(workspace, { type: 'email-track', data: { token, event, index } });
          if (result.state.workflowOutbox?.length) flushLater(workspace);
          return result.id;
        };
        if (kind === 'o') {
          res.writeHead(200, { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, max-age=0' });
          res.end(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
          if (active && method === 'GET') { const seen = await track('info', false).catch(() => null); if (seen && !seen.opened) await track('open', true).catch(() => null); }
          return;
        }
        if (kind === 'c') {
          const found = active ? await track('click', true) : execute(await store.load(workspace), { type: 'email-track', data: { token, event: 'click', index } });
          if (!found?.url) return page(404, 'Link indisponível', '<p>Este link não existe mais.</p>');
          res.writeHead(302, { Location: found.url, 'Cache-Control': 'no-store' }); return res.end();
        }
        const info = await track('info', false);
        if (!info) return page(404, 'Link indisponível', '<p>Não encontramos esta inscrição.</p>');
        // The contact's preference center: choose topics and channels instead of leaving everything.
        let prefToken = '';
        if (info.contactId) { try { prefToken = (await change(workspace, { type: 'preferences-link', data: { contactId: info.contactId } })).id; } catch { /* The page still works without the link. */ } }
        const prefLink = prefToken ? `<p><a href="/preferencias/${workspace}/${prefToken}">Escolher o que quero receber</a></p>` : '';
        // POST is the confirmation button and the one-click unsubscribe of mail clients (RFC 8058). It works even while the account is paused.
        if (method === 'POST') { await track('unsubscribe', true); return page(200, 'Inscrição cancelada', `<p>Você não vai mais receber e-mails de marketing de ${esc(info.business || 'esta empresa')}.</p>${prefLink}`); }
        if (info.unsubscribed) return page(200, 'Inscrição cancelada', `<p>Você já saiu da lista de e-mails de ${esc(info.business || 'esta empresa')}.</p>${prefLink}`);
        return page(200, 'Cancelar inscrição', `<p>Deixar de receber os e-mails de marketing de <b>${esc(info.business || 'esta empresa')}</b>?</p><form method="post"><button>Cancelar inscrição</button></form>${prefLink}`);
      }
      const redirect = p.match(redirectPath);
      if (redirect && method === 'GET') {
        await ready;
        const [, workspace, linkId] = redirect;
        const active = await publicAccountPolicy(workspace, false, 'conversations');
        const target = active
          ? await store.change(workspace, state => execute(state, { type: 'link-click', id: linkId }))
          : execute(await store.load(workspace), { type: 'link-click', id: linkId }, { trackClick: false });
        res.writeHead(302, { Location: target });
        return res.end();
      }
      const match=p.replace(/^\/api\/view/,'').match(paths);
      if (p.startsWith('/api/view/') && match) {
        const [,kind,w,item]=match;
        if (method==='POST') {
          if (kind!=='f') throw error('Method not allowed.',405);
          const input = await payload(req);
          await publicAccountPolicy(w, true, 'sites');
          // _vid links a site visitor to the contact; only the site route (which sets the cookie) may send it.
          const submission = await change(w,{type:'submit',id:item,data:{ ...(input && typeof input === 'object' ? input : {}), _vid:'' }});
          return json({id:submission.id},201);
        }
        await publicAccountPolicy(w, false, kind === 'course' ? 'memberships' : 'sites');
        const state=await store.load(w), map={p:'pages',f:'forms',course:'courses'}, row=find(state,map[kind],item);
        if(!row?.active || (kind==='course' && row.portalOnly)) throw error('This item is not published.',404);
        const form=kind==='p' && row.formId ? find(state,'forms',row.formId) : null;
        return json({kind,row,form:form?.active?form:null,brand:state.profile.name});
      }
      const legacyPage = method !== 'POST' && p.match(paths);
      if (legacyPage) {
        await ready;
        await publicAccountPolicy(legacyPage[2], false, legacyPage[1] === 'course' ? 'memberships' : 'sites');
      }
      if (method === 'GET' && legacyPage?.[1] === 'f') { res.writeHead(302, { Location:`/form/${legacyPage[2]}/${legacyPage[3]}` }); return res.end(); }
      if (p === '/privacidade' || p === '/privacidade/') p = '/privacidade.html';
      if ((method==='GET'||method==='HEAD') && (p==='/' || p==='/login' || ['/app','/app/','/painel','/painel/'].includes(p) || paths.test(p) || staticFiles.has(p))) {
        const hostHeader = (req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
        const isAppDomain = hostHeader.startsWith('app.');
        const isLanding = p === '/login' || (p === '/' && !isAppDomain);
        if (!isLanding && !paths.test(p) && (!staticFiles.has(p) || p === '/index.html') && !localAccess && !auth?.hasSession(req)) {
          const search = new URLSearchParams(url.search); search.delete('__path');
          const next = afterLogin((p === '/' || p === '/index.html' ? '/app' : p) + (search.size ? '?' + search : ''));
          return goTo('/login?' + new URLSearchParams({ next }));
        }
        const f = staticFiles.has(p) ? p : (isLanding ? '/landing.html' : '/index.html');
        return send(200,staticFiles.get(f)||'text/html; charset=utf-8',method==='HEAD'?undefined:readFileSync(resolve(root,'ui',f.slice(1))));
      }
      throw error('Page not found.',404);
    } catch(e) {
      if (!e.status) console.error(e.message);
      if (!res.headersSent && e.publicAccount && !p.startsWith('/api/')) {
        return send(e.status, 'text/html; charset=utf-8', req.method === 'HEAD' ? undefined :
          `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Conteúdo indisponível</title><main><h1>${e.message}</h1><p>Entre em contato com o responsável pela publicação para saber mais.</p></main></html>`);
      }
      if (!res.headersSent) json({
        error: e.status ? e.message : 'The workspace could not complete this request.',
        ...(e.code === 'ACCOUNT_SUSPENDED' && { code: e.code, account: e.account })
      }, e.status || 500);
    }
  });
  server.on('close',()=>{ if (socialTimer) clearInterval(socialTimer); store.close(); });
  return {server,port,host,ready,backend:store.kind};
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const store = supabaseFromEnv();
    const { server,port,host,ready,backend } = makeServer(store ? { store } : {});
    await ready;
    server.listen(port,host,()=>console.log(`Local workspace (${backend}): http://${host}:${server.address().port}/`));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

let vercelApp = null;
export default async function handler(req, res) {
  if (!vercelApp) {
    const store = supabaseFromEnv();
    const instance = makeServer(store ? { store } : {});
    await instance.ready;
    vercelApp = instance.server;
  }
  vercelApp.emit('request', req, res);
}

