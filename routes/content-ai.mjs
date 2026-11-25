// IA de conteúdo da subconta: voz da marca e importação do site (/api/brand/...), resposta a avaliações,
// rascunho e resumo nas Conversas, notas de reunião (transcrição e resumo) e transformar texto ou escrever e-mail.
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { brandFromPage, fetchPublicPage } from '../brand-model.mjs';
import { brandVoiceRequest, emailRequest, reviewReplyRequest, transformRequest } from '../content-ai.mjs';
import { conversationRequest } from '../conversation-ai.mjs';
import { requireLab } from '../labs-model.mjs';
import { audioLimit, audioTypes } from '../meeting-ai.mjs';
import { brandVoicePrompt, defaultBoard, voiceTraits } from '../ui/brand-data.js';
import { contentModule } from '../ui/content-ai-data.js';
import { NEXT_ROUTE } from './next-route.mjs';

export function createBrandAIRoutes(deps) {
  const { store, error, spaceId, privateSpace, workspaceAccess, payload, brandFetch, brandResolve, localAccess, contentAI, openAI, meteredAI, content } = deps;
  return async function brandAIRoutes({ req, res, p, method, id, json }) {
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
    return NEXT_ROUTE;
  };
}

export function createConversationAIRoutes(deps) {
  const { store, error, spaceId, privateSpace, workspaceAccess, payload, change, flushLater, localAccess, contentAI, openAI, meteredAI, content } = deps;
  return async function conversationAIRoutes({ req, res, p, method, url, id, json }) {
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
    return NEXT_ROUTE;
  };
}

export function createContentAIRoutes(deps) {
  const { error, spaceId, privateSpace, workspaceAccess, payload, brandVoiceOf, localAccess, contentAI, openAI, meteredAI, content } = deps;
  return async function contentAIRoutes({ req, res, p, method, id, json }) {
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
    return NEXT_ROUTE;
  };
}
