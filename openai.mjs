import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

const endpoint = 'https://api.openai.com/v1';
export const openAIModel = process.env.STUDIO_OPENAI_MODEL || 'gpt-4.1-mini';
const fail = (message, status) => Object.assign(new Error(message), { status });
const connectMessage = 'Conecte sua chave da OpenAI em Visão da agência → Configurações → OpenAI.';
const rowId = session => `openai-${session.id}`;

export function createOpenAI({ store, model, secret, request = fetch }) {
  const key = secret && createHmac('sha256', secret).update('soci:openai:v1').digest();

  async function connection(session) {
    if (!session || !key) return null;
    const id = rowId(session);
    let state;
    try { state = await store.load(id); }
    catch (error) { if (error.status === 404) return null; throw error; }
    if (!state.token) return null;
    try {
      const [iv, tag, ciphertext] = state.token.split('.').map(part => Buffer.from(part, 'base64url'));
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAAD(Buffer.from(id));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch { return null; }
  }

  const status = apiKey => ({ configured: Boolean(apiKey), last4: apiKey?.slice(-4) || '', model });
  return {
    async status(session) { return status(await connection(session)); },
    async optionalConnection(session) {
      const apiKey = await connection(session);
      return apiKey ? { apiKey, model, request } : null;
    },
    async requireConnection(session) {
      const apiKey = await connection(session);
      if (!apiKey) throw fail(connectMessage, 503);
      return { apiKey, model, request };
    },
    async connect(session, input) {
      if (!key) throw fail('O armazenamento seguro de chaves está indisponível.', 503);
      const apiKey = typeof input === 'string' ? input.trim() : '';
      if (!/^sk-[!-~]{12,509}$/.test(apiKey)) throw fail('Informe uma chave de API válida da OpenAI.', 400);
      await openAIRequest(`/models/${encodeURIComponent(model)}`, { apiKey, request, timeout: 10000,
        problem: 'Não foi possível verificar a chave na OpenAI. Tente novamente.' });
      const id = rowId(session);
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(id));
      const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
      const token = [iv, cipher.getAuthTag(), ciphertext].map(part => part.toString('base64url')).join('.');
      if (!await store.insert(id, { profile: { name: 'Conexão OpenAI' }, token })) {
        await store.change(id, state => { state.token = token; });
      }
      return status(apiKey);
    },
    async disconnect(session) {
      try { await store.change(rowId(session), state => { delete state.token; }); }
      catch (error) { if (error.status !== 404) throw error; }
      return status(null);
    }
  };
}

async function openAIRequest(path, { apiKey, request, body, timeout, problem }) {
  const response = await request(endpoint + path, {
    method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(timeout), redirect: 'error',
    headers: { Authorization: `Bearer ${apiKey}`, ...(body && { 'Content-Type': 'application/json' }) },
    body: body && JSON.stringify(body)
  }).catch(() => null);
  if (response?.status === 401) throw fail('A OpenAI recusou a chave. Verifique a chave ou conecte uma nova.', 422);
  if ([403, 404].includes(response?.status)) throw fail('O projeto da chave não tem acesso ao modelo ou à operação solicitada na OpenAI.', 422);
  if (response?.status === 429) throw fail('Verifique o saldo e os limites de uso do seu projeto na OpenAI.', 429);
  if (!response?.ok) throw fail(problem, 502);
  const result = await response.json().catch(() => null);
  if (!result) throw fail(problem, 502);
  return result;
}

// `onUsage`, when the caller meters AI spend, receives the model and token counts of every call,
// including failed ones (with zero tokens and the error message).
export async function openAIResponse(body, { apiKey, request, timeout, problem, onUsage }) {
  const started = Date.now();
  try {
    const result = await openAIRequest('/responses', { apiKey, request, timeout, problem, body: { ...body, store: false } });
    await onUsage?.({ model: result.model || body.model, usage: result.usage || {}, ms: Date.now() - started });
    return result;
  } catch (error) {
    await onUsage?.({ model: body.model, usage: {}, ms: Date.now() - started, error: error.message });
    throw error;
  }
}
