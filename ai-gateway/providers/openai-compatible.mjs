// Adapter "OpenAI-compatível" (Chat Completions): Groq, OpenRouter, Cloudflare Workers AI, Gemini (endpoint de
// compatibilidade), Mistral, DeepSeek, xAI, Together, Fireworks, Cerebras, Ollama e vLLM. As diferenças entre eles
// (cabeçalhos de limite, campos de preço, listagem de modelos) ficam em opções declaradas pelo catálogo.
import { GatewayError } from '../errors.mjs';
import { blankUsage } from '../contracts.mjs';
import { json, parseJsonEvent, readRateLimit, send, sseData } from './http.mjs';

// Preço "por token" em dólar (string da API) → micro-dólares por milhão de tokens. Negativo/inválido = desconhecido.
export function perTokenToMicrosPerMillion(value) {
  if (value === null || value === undefined || value === '') return null;
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) return null;
  return Math.round(price * 1e12);
}

function chatMessages(messages) {
  return messages.map(message => {
    if (message.role === 'tool') return { role: 'tool', tool_call_id: message.toolCallId, content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content) };
    const content = typeof message.content === 'string' ? message.content : message.content.map(part => part.type === 'image'
      ? { type: 'image_url', image_url: { url: part.url } } : { type: 'text', text: part.text });
    const entry = { role: message.role, content };
    if (message.role === 'assistant' && message.toolCalls?.length) {
      entry.tool_calls = message.toolCalls.map(call => ({ id: call.id, type: 'function', function: { name: call.name, arguments: typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments || {}) } }));
    }
    return entry;
  });
}

export function normalizeChatUsage(usage) {
  const result = blankUsage();
  if (!usage) return result;
  result.inputTokens = Math.max(0, Number(usage.prompt_tokens) || 0);
  result.outputTokens = Math.max(0, Number(usage.completion_tokens) || 0);
  result.cachedTokens = Math.max(0, Number(usage.prompt_tokens_details?.cached_tokens) || 0);
  result.reasoningTokens = Math.max(0, Number(usage.completion_tokens_details?.reasoning_tokens) || 0);
  result.source = 'reported';
  // OpenRouter devolve o custo da chamada em créditos (dólares) quando informado.
  if (Number.isFinite(Number(usage.cost)) && usage.cost !== null) result.providerCostMicros = Math.round(Number(usage.cost) * 1e6);
  return result;
}

function toolCallsOf(message) {
  return (message?.tool_calls || []).map(call => ({ id: call.id, name: call.function?.name || '', arguments: call.function?.arguments || '{}' }));
}

/**
 * @param {{ provider: object, baseUrl: string, apiKey: string, request?: typeof fetch }} options
 */
export function createOpenAICompatibleAdapter({ provider, baseUrl, apiKey, request = fetch }) {
  const id = provider.id;
  const headers = { ...(apiKey && { Authorization: `Bearer ${apiKey}` }), ...(provider.headers || {}) };
  const streamUsage = !['mistral', 'cloudflare'].includes(id);

  function body(req, model, stream) {
    const out = { model, messages: chatMessages(req.messages), max_tokens: req.maxOutputTokens };
    if (req.temperature !== undefined) out.temperature = req.temperature;
    if (req.tools.length) out.tools = req.tools.map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } }));
    if (req.schema) out.response_format = { type: 'json_schema', json_schema: { name: req.schema.name, schema: req.schema.schema, strict: req.schema.strict } };
    if (stream) { out.stream = true; if (streamUsage) out.stream_options = { include_usage: true }; }
    return out;
  }

  async function generateText(req, { model, signal, timeoutMs }) {
    const response = await send(request, `${baseUrl}/chat/completions`, { headers, body: body(req, model, false), signal, timeoutMs, provider: id, model });
    const data = await json(response, { provider: id, model });
    const choice = data.choices?.[0];
    if (!choice) throw new GatewayError('unavailable', { provider: id, model, internal: 'sem choices' });
    const text = typeof choice.message?.content === 'string' ? choice.message.content
      : Array.isArray(choice.message?.content) ? choice.message.content.map(part => part.text || '').join('') : '';
    return {
      text, toolCalls: toolCallsOf(choice.message), finishReason: choice.finish_reason === 'tool_calls' ? 'tool_calls' : choice.finish_reason || 'stop',
      usage: normalizeChatUsage(data.usage), model: data.model || model, rateLimit: readRateLimit(response.headers)
    };
  }

  async function* streamText(req, { model, signal, timeoutMs }) {
    const response = await send(request, `${baseUrl}/chat/completions`, { headers: { ...headers, Accept: 'text/event-stream' }, body: body(req, model, true), signal, timeoutMs, provider: id, model });
    const rateLimit = readRateLimit(response.headers);
    const calls = new Map();
    let finishReason = 'stop', usage = null, actualModel = model;
    for await (const data of sseData(response, { provider: id, model, signal })) {
      const event = parseJsonEvent(data, { provider: id, model });
      if (event.error) throw new GatewayError('unavailable', { provider: id, model, internal: String(event.error.message || 'erro no stream').slice(0, 200) });
      if (event.model) actualModel = event.model;
      if (event.usage) usage = event.usage;
      const choice = event.choices?.[0];
      if (!choice) continue;
      if (choice.delta?.content) yield { type: 'delta', text: choice.delta.content };
      for (const call of choice.delta?.tool_calls || []) {
        const current = calls.get(call.index ?? 0) || { id: '', name: '', arguments: '' };
        if (call.id) current.id = call.id;
        if (call.function?.name) current.name += call.function.name;
        if (call.function?.arguments) current.arguments += call.function.arguments;
        calls.set(call.index ?? 0, current);
      }
      if (choice.finish_reason) finishReason = choice.finish_reason;
    }
    yield { type: 'done', finishReason, toolCalls: [...calls.values()], usage: normalizeChatUsage(usage), model: actualModel, rateLimit };
  }

  async function generateEmbeddings(inputs, { model, signal, timeoutMs }) {
    const response = await send(request, `${baseUrl}/embeddings`, { headers, body: { model, input: inputs }, signal, timeoutMs, provider: id, model });
    const data = await json(response, { provider: id, model });
    const usage = blankUsage();
    usage.inputTokens = Math.max(0, Number(data.usage?.prompt_tokens ?? data.usage?.total_tokens) || 0);
    usage.source = data.usage ? 'reported' : 'unknown';
    return { vectors: (data.data || []).sort((a, b) => a.index - b.index).map(item => item.embedding), usage, model: data.model || model };
  }

  async function rawModels(signal) {
    const response = await send(request, `${baseUrl}/models`, { method: 'GET', headers, signal, timeoutMs: 10_000, provider: id });
    return json(response, { provider: id });
  }

  // Lista normalizada para o registro. Preço e gratuidade só quando a API do provedor informa (OpenRouter).
  async function listModels({ signal = undefined } = {}) {
    const data = await rawModels(signal);
    const rows = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
    return rows.filter(row => row && typeof row.id === 'string').map(row => {
      const entry = { providerModelId: row.id.replace(/^models\//, ''), name: row.name || row.id.replace(/^models\//, ''), contextWindow: null, maxOutput: null,
        caps: { text: true, stream: true }, pricing: null, status: 'active', description: '' };
      if (provider.sync === 'openrouter') {
        const inputModalities = row.architecture?.input_modalities || [];
        const params = row.supported_parameters || [];
        entry.contextWindow = Number(row.context_length) || null;
        entry.maxOutput = Number(row.top_provider?.max_completion_tokens) || null;
        entry.caps = { text: true, stream: true, tools: params.includes('tools'), structured: params.includes('structured_outputs') || params.includes('response_format'),
          vision: inputModalities.includes('image'), reasoning: params.includes('reasoning') };
        const input = perTokenToMicrosPerMillion(row.pricing?.prompt), output = perTokenToMicrosPerMillion(row.pricing?.completion);
        const perRequest = Number(row.pricing?.request || 0);
        if (input !== null && output !== null) entry.pricing = { inputMicrosPerM: input, outputMicrosPerM: output, requestMicros: Number.isFinite(perRequest) ? Math.round(perRequest * 1e6) : null, source: 'api' };
        entry.description = String(row.description || '').slice(0, 300);
        if (row.expiration_date) entry.expiresAt = String(row.expiration_date);
      } else if (provider.sync === 'mistral') {
        entry.contextWindow = Number(row.max_context_length) || null;
        entry.caps = { text: row.capabilities?.completion_chat !== false, stream: true, tools: Boolean(row.capabilities?.function_calling), vision: Boolean(row.capabilities?.vision) };
        if (row.deprecation) entry.status = 'deprecated';
        entry.description = String(row.description || '').slice(0, 300);
      } else {
        entry.contextWindow = Number(row.context_window || row.context_length) || null;
        if (row.active === false) entry.status = 'inactive';
      }
      return entry;
    });
  }

  async function checkHealth({ signal = undefined } = {}) {
    const started = Date.now();
    await rawModels(signal);
    return { ok: true, latencyMs: Date.now() - started };
  }

  // OpenRouter: cota diária dos modelos gratuitos da conta (GET /key). Outros provedores: não informam.
  async function accountQuota({ signal = undefined } = {}) {
    if (provider.sync !== 'openrouter') return null;
    const response = await send(request, `${baseUrl}/key`, { method: 'GET', headers, signal, timeoutMs: 10_000, provider: id });
    const data = (await json(response, { provider: id })).data || {};
    const free = data.free_model_daily_requests || data.rate_limit_free || null;
    return { freeDailyLimit: Number.isFinite(Number(free?.limit)) ? Number(free.limit) : null, freeDailyRemaining: Number.isFinite(Number(free?.remaining)) ? Number(free.remaining) : null,
      creditsRemaining: data.limit_remaining ?? null, isFreeTier: data.is_free_tier ?? null };
  }

  return {
    id, kind: 'openai-compatible', capabilities: new Set(['text', 'stream', 'structured', 'tools', 'vision', 'embeddings']),
    generateText, streamText, generateEmbeddings, listModels, checkHealth, accountQuota,
    generateStructuredOutput: generateText, executeToolCalling: generateText, processImage: generateText,
    validateCredentials: async options => { await rawModels(options?.signal); return true; },
    normalizeUsage: normalizeChatUsage
  };
}
