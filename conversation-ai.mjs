// Labs (7.2) in Conversas: a reply draft from the latest messages with a contact, and a summary of the whole history.
// Both go through the caller's metered connection, charged to the sub-account as "conversations".
import { openAIResponse } from './openai.mjs';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const string = { type: 'string' };
const strings = { type: 'array', items: string };
const languageName = code => (code === 'es' ? 'Latin American Spanish' : 'Brazilian Portuguese');

// The contact's messages, oldest first, as a transcript the model can read. Internal notes stay out of replies.
export function conversationTranscript(s, contactId, { limit = 40, notes = false } = {}) {
  const rows = (s.messages || [])
    .filter(row => row.contactId === contactId && (notes || row.channel !== 'Note') && String(row.body || '').trim())
    .sort((a, b) => String(a.created).localeCompare(String(b.created)))
    .slice(-limit);
  return rows.map(row => {
    const who = row.channel === 'Note' ? 'Nota interna' : row.direction === 'Inbound' ? 'Cliente' : 'Empresa';
    return `[${String(row.created || '').slice(0, 16).replace('T', ' ')} · ${row.channel || 'Mensagem'} · ${who}] ${String(row.body).slice(0, 1500)}`;
  });
}

export function conversationRequest(s, contactId, { mode = 'reply', language = 'pt' } = {}) {
  const contact = (s.contacts || []).find(row => row.id === contactId);
  if (!contact) throw fail('Contato não encontrado.', 404);
  const lines = conversationTranscript(s, contactId, mode === 'summary' ? { limit: 80, notes: true } : {});
  if (!lines.length) throw fail('Ainda não há mensagens com esse contato.', 409);
  if (mode === 'reply' && !(s.messages || []).some(row => row.contactId === contactId && row.direction === 'Inbound')) throw fail('O contato ainda não escreveu nada para responder.', 409);
  const last = [...(s.messages || [])].filter(row => row.contactId === contactId && row.channel !== 'Note').sort((a, b) => String(a.created).localeCompare(String(b.created))).at(-1);
  return {
    mode: mode === 'summary' ? 'summary' : 'reply', language: language === 'es' ? 'es' : 'pt',
    business: s.profile?.name || '', contact: contact.name || '', channel: last?.channel || '', transcript: lines.join('\n')
  };
}

export async function writeConversationReply(connection, req) {
  const problem = 'A IA não conseguiu sugerir uma resposta. Tente de novo.';
  const result = await openAIResponse({
    model: connection.model, max_output_tokens: 800,
    instructions: `You help the team of a small business called "${req.business || 'the business'}" answer its customers.
Read the conversation and write the next reply from the business to the customer, in ${languageName(req.language)}.
- Answer what the customer asked last, in a friendly and direct tone, ${req.channel === 'Email' ? 'as a short e-mail body with a greeting' : 'as a short chat message (at most 3 sentences, no greeting line if the chat is already going)'}.
- Use only facts present in the conversation. Never invent prices, dates, availability, policies or promises; when a fact is missing, write a placeholder such as [[horário disponível]] for the team to fill in.
- No Markdown. Return only the message text.`,
    input: `Cliente: ${req.contact}\nCanal: ${req.channel || 'não informado'}\n\nConversa:\n${req.transcript}`
  }, { ...connection, timeout: 60000, problem });
  const text = result.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text?.trim();
  if (result.status !== 'completed' || !text) throw fail(problem, 502);
  return { text: text.slice(0, 2000) };
}

export async function writeConversationSummary(connection, req) {
  const problem = 'A IA não concluiu o resumo da conversa. Tente de novo.';
  const result = await openAIResponse({
    model: connection.model, max_output_tokens: 1500,
    instructions: `You read the full message history between a small business and one customer and brief a team member who has not seen it, in ${languageName(req.language)}.
- summary: 2 to 4 sentences on who the customer is and what the conversation is about.
- requests: what the customer asked for or needs (empty if nothing).
- agreed: what the business promised or what was agreed (empty if nothing).
- pending: what is still open or waiting for an answer (empty if nothing).
- sentiment: the customer's mood now: positive, neutral or negative.
Use only what the messages say. Never invent facts, prices or dates.`,
    input: `Cliente: ${req.contact}\n\nMensagens:\n${req.transcript}`,
    text: { format: { type: 'json_schema', name: 'conversation_summary', strict: true, schema: object({
      summary: string, requests: strings, agreed: strings, pending: strings, sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] }
    }) } }
  }, { ...connection, timeout: 60000, problem });
  const content = result.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text');
  if (result.status !== 'completed' || !content?.text) throw fail(problem, 502);
  try { return JSON.parse(content.text); } catch { throw fail(problem, 502); }
}
