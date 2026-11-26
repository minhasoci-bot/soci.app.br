// Adapter da Anthropic (Messages API, anthropic-version 2023-06-01). Saída estruturada usa uma ferramenta forçada
// com o schema pedido (tool_choice), o caminho documentado e estável da API.
import { GatewayError } from '../errors.mjs';
import { blankUsage } from '../contracts.mjs';
import { json, parseJsonEvent, readRateLimit, send, sseData } from './http.mjs';

const VERSION = '2023-06-01';

export function normalizeAnthropicUsage(usage) {
  const result = blankUsage();
  if (!usage) return result;
  result.inputTokens = Math.max(0, Number(usage.input_tokens) || 0) + Math.max(0, Number(usage.cache_creation_input_tokens) || 0) + Math.max(0, Number(usage.cache_read_input_tokens) || 0);
  result.cachedTokens = Math.max(0, Number(usage.cache_read_input_tokens) || 0);
  result.outputTokens = Math.max(0, Number(usage.output_tokens) || 0);
  result.source = 'reported';
  return result;
}

function imageBlock(url) {
  const data = url.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  return data ? { type: 'image', source: { type: 'base64', media_type: data[1], data: data[2] } } : { type: 'image', source: { type: 'url', url } };
}

function anthropicMessages(messages) {
  const out = [];
  const push = (role, blocks) => {
    const last = out.at(-1);
    if (last && last.role === role) last.content.push(...blocks); else out.push({ role, content: blocks });
  };
  for (const message of messages) {
    if (message.role === 'system') continue;
    if (message.role === 'tool') { push('user', [{ type: 'tool_result', tool_use_id: message.toolCallId, content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content) }]); continue; }
    const blocks = typeof message.content === 'string' ? (message.content ? [{ type: 'text', text: message.content }] : [])
      : message.content.map(part => part.type === 'image' ? imageBlock(part.url) : { type: 'text', text: part.text }).filter(block => block.type !== 'text' || block.text);
    for (const call of message.toolCalls || []) {
      let input = call.arguments;
      if (typeof input === 'string') { try { input = JSON.parse(input || '{}'); } catch { input = {}; } }
      blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: input || {} });
    }
    if (blocks.length) push(message.role === 'assistant' ? 'assistant' : 'user', blocks);
  }
  return out;
}

export function createAnthropicAdapter({ provider, baseUrl, apiKey, request = fetch }) {
  const id = provider.id;
  const headers = { 'x-api-key': apiKey, 'anthropic-version': VERSION };

  function body(req, model, stream) {
    const system = req.messages.filter(message => message.role === 'system').map(message => typeof message.content === 'string' ? message.content : message.content.map(part => part.text || '').join('')).join('\n\n');
    const out = { model, max_tokens: req.maxOutputTokens, messages: anthropicMessages(req.messages) };
    if (system) out.system = system;
    if (req.temperature !== undefined) out.temperature = Math.min(1, req.temperature);
    const tools = req.tools.map(tool => ({ name: tool.name, description: tool.description, input_schema: tool.parameters }));
    if (req.schema) {
      tools.push({ name: req.schema.name, description: 'Responda chamando esta ferramenta com o resultado no formato pedido.', input_schema: req.schema.schema });
      out.tool_choice = { type: 'tool', name: req.schema.name };
    }
    if (tools.length) out.tools = tools;
    if (stream) out.stream = true;
    return out;
  }

  function parse(data, req) {
    const blocks = data.content || [];
    const toolUses = blocks.filter(block => block.type === 'tool_use');
    if (req.schema) {
      const answer = toolUses.find(block => block.name === req.schema.name);
      return { text: answer ? JSON.stringify(answer.input) : '', toolCalls: [], finishReason: data.stop_reason === 'max_tokens' ? 'length' : 'stop' };
    }
    return {
      text: blocks.filter(block => block.type === 'text').map(block => block.text).join(''),
      toolCalls: toolUses.map(block => ({ id: block.id, name: block.name, arguments: JSON.stringify(block.input || {}) })),
      finishReason: data.stop_reason === 'tool_use' ? 'tool_calls' : data.stop_reason === 'max_tokens' ? 'length' : 'stop'
    };
  }

  async function generateText(req, { model, signal, timeoutMs }) {
    const response = await send(request, `${baseUrl}/messages`, { headers, body: body(req, model, false), signal, timeoutMs, provider: id, model });
    const data = await json(response, { provider: id, model });
    if (data.stop_reason === 'refusal') throw new GatewayError('policy', { provider: id, model, internal: 'refusal' });
    return { ...parse(data, req), usage: normalizeAnthropicUsage(data.usage), model: data.model || model, rateLimit: readRateLimit(response.headers) };
  }

  async function* streamText(req, { model, signal, timeoutMs }) {
    const response = await send(request, `${baseUrl}/messages`, { headers: { ...headers, Accept: 'text/event-stream' }, body: body(req, model, true), signal, timeoutMs, provider: id, model });
    const rateLimit = readRateLimit(response.headers);
    const usage = {}, blocks = new Map();
    let stopReason = 'end_turn', actualModel = model;
    for await (const data of sseData(response, { provider: id, model, signal })) {
      const event = parseJsonEvent(data, { provider: id, model });
      if (event.type === 'message_start') { Object.assign(usage, event.message?.usage || {}); actualModel = event.message?.model || model; }
      else if (event.type === 'content_block_start') blocks.set(event.index, { ...event.content_block, json: '' });
      else if (event.type === 'content_block_delta') {
        if (event.delta?.type === 'text_delta' && !req.schema) yield { type: 'delta', text: event.delta.text };
        else if (event.delta?.type === 'input_json_delta') { const block = blocks.get(event.index); if (block) block.json += event.delta.partial_json || ''; }
      } else if (event.type === 'message_delta') { if (event.delta?.stop_reason) stopReason = event.delta.stop_reason; Object.assign(usage, event.usage || {}); }
      else if (event.type === 'error') throw new GatewayError(event.error?.type === 'overloaded_error' ? 'transient' : 'unavailable', { provider: id, model, internal: String(event.error?.message || '').slice(0, 200) });
    }
    const toolUses = [...blocks.values()].filter(block => block.type === 'tool_use');
    if (req.schema) {
      const answer = toolUses.find(block => block.name === req.schema.name);
      if (answer) yield { type: 'delta', text: answer.json || '{}' };
      yield { type: 'done', finishReason: stopReason === 'max_tokens' ? 'length' : 'stop', toolCalls: [], usage: normalizeAnthropicUsage(usage), model: actualModel, rateLimit };
      return;
    }
    yield { type: 'done', finishReason: stopReason === 'tool_use' ? 'tool_calls' : stopReason === 'max_tokens' ? 'length' : 'stop',
      toolCalls: toolUses.map(block => ({ id: block.id, name: block.name, arguments: block.json || '{}' })), usage: normalizeAnthropicUsage(usage), model: actualModel, rateLimit };
  }

  async function listModels({ signal = undefined } = {}) {
    const response = await send(request, `${baseUrl}/models?limit=100`, { method: 'GET', headers, signal, timeoutMs: 10_000, provider: id });
    const data = await json(response, { provider: id });
    return (data.data || []).filter(row => typeof row?.id === 'string').map(row => ({ providerModelId: row.id, name: row.display_name || row.id, contextWindow: null, maxOutput: null,
      caps: { text: true, stream: true, tools: true, structured: true, vision: true }, pricing: null, status: 'active', description: '' }));
  }

  return {
    id, kind: 'anthropic', capabilities: new Set(['text', 'stream', 'structured', 'tools', 'vision', 'reasoning']),
    generateText, streamText, listModels,
    generateEmbeddings: async () => { throw new GatewayError('invalid_request', { provider: id, internal: 'Anthropic não oferece embeddings' }); },
    generateStructuredOutput: generateText, executeToolCalling: generateText, processImage: generateText,
    checkHealth: async options => { const started = Date.now(); await listModels(options); return { ok: true, latencyMs: Date.now() - started }; },
    validateCredentials: async options => { await listModels(options); return true; },
    accountQuota: async () => null, normalizeUsage: normalizeAnthropicUsage
  };
}
