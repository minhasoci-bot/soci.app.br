// Voice AI (3.2): an AI agent of the sub-account talks on the phone, turn by turn. Twilio turns the caller's speech
// into text (<Gather input="speech">), the published agent answers with its knowledge base, and Twilio speaks the
// answer (<Say>). The agent decides with the same marks as the bot of Conversas: [[TRANSFERIR]], [[ENCERRAR]] and
// [[AGENDAR AAAA-MM-DD HH:MM]]. It runs on any host (no WebSocket needed).
export const VOICES = [['Polly.Camila', 'Camila (pt-BR)'], ['Polly.Vitoria', 'Vitória (pt-BR)'], ['Polly.Thiago', 'Thiago (pt-BR)'], ['Polly.Lupe', 'Lupe (es)'], ['Polly.Joanna', 'Joanna (en)']];
export const LANGUAGES = { 'Polly.Camila': 'pt-BR', 'Polly.Vitoria': 'pt-BR', 'Polly.Thiago': 'pt-BR', 'Polly.Lupe': 'es-US', 'Polly.Joanna': 'en-US' };
export const VOICE_LIMITS = { turns: 40, minutes: 15, text: 600 };

const clip = (value, limit) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);

/** The voice settings of a number (or of the workflow step), with defaults. */
export function voiceSettings(d = {}) {
  const voice = LANGUAGES[d.voice] ? d.voice : 'Polly.Camila';
  return {
    agentId: clip(d.agentId ?? d.voiceAgentId, 80), voice, language: LANGUAGES[voice], welcome: clip(d.welcome ?? d.voiceWelcome, 400),
    transfer: clip(d.transfer ?? d.voiceTransfer, 20), goal: clip(d.goal, 1500), serviceId: clip(d.serviceId ?? d.voiceServiceId, 80),
    maxMinutes: Math.min(VOICE_LIMITS.minutes, Math.max(1, Math.trunc(Number(d.maxMinutes ?? d.voiceMaxMinutes)) || 10))
  };
}

/** What the agent receives for the next turn: who it is talking to, the rules for the phone and the transcript. */
export function voicePrompt({ business = '', contact = null, direction = 'inbound', goal = '', transcript = [], slots = [], zone = 'America/Sao_Paulo', canTransfer = false, serviceName = '' }) {
  const lines = (transcript || []).slice(-30).map(turn => `${turn.role === 'caller' ? 'Cliente' : 'Você'}: ${clip(turn.text, VOICE_LIMITS.text)}`);
  return [
    `Você está numa ligação telefônica ${direction === 'inbound' ? 'recebida' : 'feita'} por ${business || 'nossa empresa'}${contact?.name ? `, falando com ${contact.name}` : ''}. Responda só a sua próxima fala.`,
    'Fale como numa ligação: frases curtas (no máximo duas ou três), sem listas, emojis, links ou formatação, no idioma do cliente. Não invente preços, prazos ou políticas que não estejam na sua base de conhecimento.',
    ...(goal ? [`Objetivo desta ligação: ${goal}`] : []),
    canTransfer ? '- Se o cliente pedir para falar com uma pessoa ou você não souber responder, escreva [[TRANSFERIR]] e avise que vai transferir.' : '- Se o cliente pedir uma pessoa ou você não souber responder, diga que a equipe vai retornar e escreva [[ENCERRAR]].',
    '- Quando o assunto terminar e o cliente se despedir, escreva [[ENCERRAR]] junto da despedida.',
    ...(slots.length ? [`- Horários livres para ${serviceName} (fuso ${zone}): ${slots.map(slot => `${slot.day} ${slot.time}`).join(', ')}. Ofereça dois ou três quando o cliente quiser marcar. Quando ele escolher um desses, escreva [[AGENDAR AAAA-MM-DD HH:MM]] e confirme falando o dia e a hora. Nunca ofereça outros horários.`] : []),
    '',
    'Ligação até agora:',
    lines.join('\n') || '(o cliente acabou de atender)'
  ].join('\n').slice(0, 12000);
}

/** A transcript for Conversas and for the "Ligação do Voice AI terminou" trigger. */
export const transcriptText = transcript => (transcript || []).map(turn => `${turn.role === 'caller' ? 'Cliente' : 'Agente'}: ${turn.text}`).join('\n').slice(0, 5000);
