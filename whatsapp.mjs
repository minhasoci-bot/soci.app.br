// WhatsApp das subcontas: cada subconta recebe uma instância isolada num servidor de WhatsApp da agência
// (ou gerenciado pela plataforma via variáveis de ambiente). Dois provedores atrás das mesmas rotas:
//   - Evolution API v2 (padrão) — https://doc.evolution-api.com — autenticação pelo header `apikey` global.
//   - UAZAPI (legado) — admintoken para criar instâncias e token por instância.
// Os segredos ficam selados (AES-256-GCM) em `whatsapp-<agencyId>` no SQLite/Supabase.
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { execute } from './model.mjs';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const digits = value => String(value || '').replace(/\D+/g, '');
const rowId = agencyId => `whatsapp-${agencyId}`;
const PROVIDER_LABEL = { evolution: 'Evolution API', uazapi: 'UAZAPI' };
const cleanProvider = value => (value === 'evolution' || value === 'uazapi' ? value : '');
const isHttps = value => /^https:\/\//i.test(String(value || ''));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function deriveKey(secret) {
  const material = typeof secret === 'string' && secret.trim()
    ? secret.trim()
    : 'soci-local-dev-whatsapp-seal-key-do-not-use-without-env';
  return createHash('sha256').update(material).digest();
}

function sealSecret(secret, aad, plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  cipher.setAAD(Buffer.from(String(aad)));
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${enc.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`;
}

function unsealSecret(secret, aad, sealed) {
  if (!sealed) return '';
  const parts = String(sealed).split('.');
  if (parts.length !== 3) return '';
  try {
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), Buffer.from(parts[0], 'base64url'));
    decipher.setAAD(Buffer.from(String(aad)));
    decipher.setAuthTag(Buffer.from(parts[2], 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(parts[1], 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

function cleanBaseUrl(raw, provider) {
  const label = PROVIDER_LABEL[provider];
  const example = provider === 'uazapi' ? 'https://suaagencia.uazapi.com' : 'https://whatsapp.suaagencia.com.br';
  const value = typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : '';
  if (!value) throw fail(`Informe a URL do servidor ${label} (ex.: ${example}).`);
  let parsed;
  try { parsed = new URL(value); } catch { throw fail(`URL da ${label} inválida.`); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw fail(`A URL da ${label} deve usar http:// ou https://.`);
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
}

function instanceSlug(workspaceId) {
  const clean = String(workspaceId || 'ws').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32) || 'ws';
  return `soci_${clean}`;
}

function normalizeQr(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return '';
  if (value.startsWith('data:image/')) return value;
  if (/^[A-Za-z0-9+/=\r\n]{100,}$/.test(value)) return `data:image/png;base64,${value.replace(/\s+/g, '')}`;
  return '';
}

function normalizeStatus(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (['connected', 'open', 'working', 'authenticated'].includes(s)) return 'connected';
  if (['connecting', 'qrcode', 'scan_qr_code', 'starting', 'pairing'].includes(s)) return 'connecting';
  if (s === 'hibernated') return 'hibernated';
  return 'disconnected';
}

function extractPhone(value) {
  if (!value) return '';
  if (typeof value === 'object') {
    return extractPhone(value.id || value.jid || value.owner || value.phone || value.number || '');
  }
  const raw = String(value).replace(/@.*$/, '').replace(/:.*$/, '');
  return digits(raw);
}

async function readJsonSafe(res) {
  const text = await res.text().catch(() => '');
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 240) }; }
}

// ---------- UAZAPI ----------

function parseUazapiInstance(data) {
  const inst = (data && typeof data.instance === 'object' && data.instance) ? data.instance : {};
  const st = (data && typeof data.status === 'object' && data.status) ? data.status : {};
  const rawStatus = st.connected === true || st.loggedIn === true || data?.connected === true || data?.loggedIn === true
    ? 'connected'
    : (inst.status || inst.state || (typeof data?.status === 'string' ? data.status : '') || data?.state || '');
  const status = normalizeStatus(rawStatus);
  const qrcode = normalizeQr(inst.qrcode || data?.qrcode || data?.qr || '');
  const paircode = String(inst.paircode || inst.pairingCode || data?.paircode || data?.pairingCode || '').trim();
  const phone = extractPhone(inst.owner || st.jid || inst.jid || inst.phone || data?.owner || data?.jid || '');
  const profileName = String(inst.profileName || inst.name || data?.profileName || '').trim().slice(0, 120);
  const token = String(data?.token || inst.token || data?.hash?.apikey || '').trim();
  return { status, qrcode, paircode, phone, profileName, token };
}

function createUazapiAdapter(call) {
  const send = (creds, path, options = {}) => call('uazapi', creds.baseUrl, path, options);
  return {
    async provision({ creds, sub }) {
      const body = { name: sub.instanceName, systemName: 'soci' };
      const headers = { admintoken: creds.adminToken };
      let res = await send(creds, '/instance/init', { method: 'POST', headers, body });
      if (res.status === 404) res = await send(creds, '/instance/create', { method: 'POST', headers, body });
      const data = await readJsonSafe(res);
      if (!res.ok) {
        throw fail(`Não foi possível provisionar a instância na UAZAPI (HTTP ${res.status})${data.message ? `: ${data.message}` : ''}.`, 502);
      }
      const parsed = parseUazapiInstance(data);
      if (!parsed.token) throw fail('A UAZAPI criou a instância mas não retornou o token de acesso.', 502);
      return { token: parsed.token, status: parsed.status || 'disconnected' };
    },
    async setWebhook({ creds, token, webhookUrl }) {
      await send(creds, '/webhook', {
        method: 'POST',
        headers: { token },
        body: { enabled: true, url: webhookUrl, events: ['messages', 'connection'], excludeMessages: ['wasSentByApi'] }
      });
    },
    async status({ creds, token }) {
      const res = await send(creds, '/instance/status', { headers: { token } });
      if (res.status === 401 || res.status === 404) return { missing: true };
      const data = await readJsonSafe(res);
      if (!res.ok) return { error: `HTTP ${res.status}` };
      return parseUazapiInstance(data);
    },
    async connect({ creds, token, phone }) {
      const res = await send(creds, '/instance/connect', { method: 'POST', headers: { token }, body: phone ? { phone } : {} });
      const data = await readJsonSafe(res);
      if (!res.ok) {
        throw fail(`Não foi possível iniciar a conexão na UAZAPI (HTTP ${res.status})${data.message ? `: ${data.message}` : ''}.`, 502);
      }
      let parsed = parseUazapiInstance(data);
      if (parsed.status !== 'connected' && !parsed.qrcode && !parsed.paircode) {
        const liveRes = await send(creds, '/instance/status', { headers: { token } }).catch(() => null);
        if (liveRes?.ok) {
          const live = parseUazapiInstance(await readJsonSafe(liveRes));
          parsed = {
            ...parsed,
            status: live.status || parsed.status,
            qrcode: live.qrcode || parsed.qrcode,
            paircode: live.paircode || parsed.paircode,
            phone: live.phone || parsed.phone,
            profileName: live.profileName || parsed.profileName
          };
        }
      }
      return parsed;
    },
    async disconnect({ creds, token }) {
      await send(creds, '/instance/disconnect', { method: 'POST', headers: { token }, body: {} });
    },
    async send({ creds, token, number, text }) {
      const res = await send(creds, '/send/text', { method: 'POST', headers: { token }, body: { number, text }, retry: true });
      const data = await readJsonSafe(res);
      return { ok: res.ok, status: res.status, message: data.message || '', id: String(data.id || data.messageid || data.key?.id || '') };
    },
    parseWebhook(body) {
      const eventType = String(body.EventType || body.event || body.type || '').toLowerCase();
      if (eventType === 'connection') return { kind: 'connection', parsed: parseUazapiInstance(body) };
      if (eventType !== 'messages' && eventType !== 'message') return { kind: 'ignore' };
      const msg = body.message && typeof body.message === 'object' ? body.message : (body.data || body.payload || {});
      if (msg.fromMe || msg.wasSentByApi || msg.isGroup || body.chat?.wa_isGroup) return { kind: 'ignore' };
      const chatId = String(msg.chatid || msg.sender || body.chat?.wa_chatid || body.chat?.id || '');
      if (!chatId || chatId.endsWith('@g.us') || chatId === 'status@broadcast') return { kind: 'ignore' };
      const text = String(msg.text || msg.content || msg.body || '').trim().slice(0, 4000);
      const phone = extractPhone(chatId);
      if (!phone || !text) return { kind: 'ignore' };
      const senderName = String(msg.senderName || body.chat?.name || msg.pushName || `+${phone}`).trim().slice(0, 120);
      return { kind: 'messages', items: [{ phone, text, senderName }] };
    }
  };
}

// ---------- Evolution API v2 ----------

const EVOLUTION_EVENTS = ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'];

function evolutionError(data) {
  const raw = data?.response?.message ?? data?.message ?? data?.error ?? '';
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map(item => {
    if (typeof item === 'string') return item;
    if (item && item.exists === false) return `o número ${digits(item.number || item.jid)} não tem WhatsApp`;
    return item ? JSON.stringify(item) : '';
  }).filter(Boolean).join('; ').slice(0, 200);
}

// Texto da mensagem do Baileys, abrindo os envelopes comuns (temporária, visualização única, editada).
function evolutionText(message, depth = 0) {
  if (!message || typeof message !== 'object' || depth > 3) return '';
  const inner = message.ephemeralMessage?.message || message.viewOnceMessage?.message || message.viewOnceMessageV2?.message
    || message.documentWithCaptionMessage?.message || message.editedMessage?.message;
  if (inner) return evolutionText(inner, depth + 1);
  const text = message.conversation || message.extendedTextMessage?.text || message.imageMessage?.caption
    || message.videoMessage?.caption || message.documentMessage?.caption || message.buttonsResponseMessage?.selectedDisplayText
    || message.listResponseMessage?.title || message.templateButtonReplyMessage?.selectedDisplayText
    || message.interactiveResponseMessage?.body?.text || '';
  if (text) return String(text);
  if (message.imageMessage) return '[Imagem]';
  if (message.videoMessage) return '[Vídeo]';
  if (message.audioMessage) return '[Áudio]';
  if (message.documentMessage) return `[Documento${message.documentMessage.fileName ? `: ${message.documentMessage.fileName}` : ''}]`;
  if (message.stickerMessage) return '[Figurinha]';
  if (message.locationMessage || message.liveLocationMessage) return '[Localização]';
  if (message.contactMessage || message.contactsArrayMessage) return '[Contato]';
  return '';
}

function evolutionInbound(entry) {
  const key = entry?.key || {};
  if (key.fromMe) return null;
  let jid = String(key.remoteJid || '');
  if (!jid || /@g\.us$|@broadcast$|@newsletter$/i.test(jid)) return null;
  // WhatsApp agora pode identificar o contato por LID; a Evolution manda o número real em remoteJidAlt/senderPn.
  if (/@lid$/i.test(jid)) jid = String(key.remoteJidAlt || key.senderPn || entry.senderPn || '');
  if (!jid || /@lid$/i.test(jid)) return null;
  const phone = extractPhone(jid);
  const text = evolutionText(entry.message).trim().slice(0, 4000);
  if (!phone || phone.length < 8 || !text) return null;
  const senderName = String(entry.pushName || `+${phone}`).trim().slice(0, 120);
  return { phone, text, senderName };
}

function createEvolutionAdapter(call) {
  const send = (creds, path, options = {}) => call('evolution', creds.baseUrl, path, {
    ...options,
    headers: { apikey: creds.adminToken, ...(options.headers || {}) }
  });
  const name = sub => encodeURIComponent(sub.instanceName);
  const webhookBody = url => ({ enabled: true, url, byEvents: false, base64: false, events: EVOLUTION_EVENTS });

  async function connectOnce(creds, sub, phone) {
    const query = phone ? `?number=${encodeURIComponent(phone)}` : '';
    const res = await send(creds, `/instance/connect/${name(sub)}${query}`);
    if (res.status === 404) return { missing: true };
    const data = await readJsonSafe(res);
    if (!res.ok) {
      const detail = evolutionError(data);
      throw fail(`Não foi possível iniciar a conexão na Evolution API (HTTP ${res.status})${detail ? `: ${detail}` : ''}.`, 502);
    }
    const state = data.instance?.state || data.instance?.status || '';
    const qrcode = normalizeQr(data.base64 || data.qrcode?.base64 || '');
    const paircode = String(data.pairingCode || data.qrcode?.pairingCode || '').trim();
    return { status: state ? normalizeStatus(state) : 'connecting', qrcode, paircode, phone: '', profileName: '' };
  }

  return {
    async provision({ creds, sub, webhookUrl }) {
      const body = {
        instanceName: sub.instanceName,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: false,
        groupsIgnore: true,
        rejectCall: false,
        alwaysOnline: false,
        readMessages: false,
        readStatus: false,
        syncFullHistory: false
      };
      if (isHttps(webhookUrl)) body.webhook = webhookBody(webhookUrl);
      const res = await send(creds, '/instance/create', { method: 'POST', body });
      const data = await readJsonSafe(res);
      if (!res.ok) {
        const detail = evolutionError(data);
        // A instância já existe no servidor (ex.: banco do app restaurado): reaproveita, a chave global basta.
        if ([400, 403, 409].includes(res.status) && /already in use|already exists|já existe|em uso/i.test(detail)) {
          return { token: sub.instanceName, status: 'disconnected' };
        }
        if (res.status === 401) throw fail('A Evolution API recusou a API Key global. Confira a chave configurada.', 422);
        throw fail(`Não foi possível criar a instância na Evolution API (HTTP ${res.status})${detail ? `: ${detail}` : ''}.`, 502);
      }
      const token = String(typeof data.hash === 'string' ? data.hash : (data.hash?.apikey || data.instance?.token || sub.instanceName));
      return { token, status: normalizeStatus(data.instance?.status || data.instance?.state) };
    },
    async setWebhook({ creds, sub, webhookUrl }) {
      await send(creds, `/webhook/set/${name(sub)}`, { method: 'POST', body: { webhook: webhookBody(webhookUrl) } });
    },
    async status({ creds, sub }) {
      const res = await send(creds, `/instance/fetchInstances?instanceName=${name(sub)}`, { timeout: 10000 });
      if (res.status === 404) return { missing: true };
      if (res.status === 401) return { error: 'A Evolution API recusou a API Key global.' };
      const data = await readJsonSafe(res);
      if (!res.ok) return { error: `HTTP ${res.status}` };
      const list = Array.isArray(data) ? data : (data && typeof data === 'object' && !data.raw ? [data] : []);
      const item = list.find(row => (row.name || row.instanceName || row.instance?.instanceName) === sub.instanceName);
      if (!item) return { missing: true };
      const inst = item.instance || item;
      const status = normalizeStatus(inst.connectionStatus || inst.status || inst.state);
      const live = {
        status,
        qrcode: '',
        paircode: '',
        phone: status === 'connected' ? extractPhone(inst.ownerJid || inst.owner || inst.number || '') : '',
        profileName: String(inst.profileName || '').trim().slice(0, 120)
      };
      // Enquanto aguarda a leitura, o /connect devolve o QR atual sem reiniciar o socket.
      if (status === 'connecting') {
        const qr = await connectOnce(creds, sub, '').catch(() => null);
        if (qr && !qr.missing) {
          live.qrcode = qr.qrcode;
          live.paircode = qr.paircode;
          if (qr.status === 'connected') live.status = 'connected';
        }
      }
      return live;
    },
    async connect({ creds, sub, phone }) {
      let parsed = await connectOnce(creds, sub, phone);
      if (parsed.missing || parsed.status === 'connected') return parsed;
      if (phone && !parsed.paircode) {
        // Já havia um QR em andamento: encerra e reabre pedindo código de pareamento para o número.
        await send(creds, `/instance/logout/${name(sub)}`, { method: 'DELETE' }).catch(() => null);
        await wait(800);
        parsed = await connectOnce(creds, sub, phone);
      }
      return parsed;
    },
    async disconnect({ creds, sub }) {
      await send(creds, `/instance/logout/${name(sub)}`, { method: 'DELETE' });
    },
    async send({ creds, sub, number, text }) {
      const res = await send(creds, `/message/sendText/${name(sub)}`, { method: 'POST', body: { number, text }, retry: true, timeout: 25000 });
      const data = await readJsonSafe(res);
      return { ok: res.ok, status: res.status, message: res.ok ? '' : evolutionError(data), id: String(data.key?.id || data.id || '') };
    },
    parseWebhook(body) {
      const event = String(body.event || body.type || '').toLowerCase().replace(/_/g, '.');
      if (event === 'connection.update') {
        const d = body.data || {};
        const status = normalizeStatus(d.state || d.status);
        return {
          kind: 'connection',
          parsed: {
            status,
            phone: status === 'connected' ? extractPhone(d.wuid || d.ownerJid || body.sender || '') : '',
            profileName: String(d.profileName || '').trim().slice(0, 120)
          }
        };
      }
      if (event !== 'messages.upsert') return { kind: 'ignore' };
      const list = Array.isArray(body.data) ? body.data : Array.isArray(body.data?.messages) ? body.data.messages : [body.data || {}];
      return { kind: 'messages', items: list.map(evolutionInbound).filter(Boolean) };
    }
  };
}

function detectWebhookProvider(body) {
  if (body && typeof body.EventType === 'string') return 'uazapi';
  const event = typeof body?.event === 'string' ? body.event : '';
  if (/^[a-z]+\.[a-z.]+$/i.test(event) || /^[A-Z]+_[A-Z_]+$/.test(event)) return 'evolution';
  return '';
}

// ---------- Estado persistido ----------

function blankRow(provider = 'evolution') {
  return {
    profile: { name: `WhatsApp (${PROVIDER_LABEL[provider]})` },
    provider,
    baseUrl: '',
    adminTokenSealed: '',
    adminTokenLast4: '',
    subaccounts: {}
  };
}

function normalizeSub(workspaceId, raw) {
  const sub = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: sub.enabled !== undefined ? Boolean(sub.enabled) : true,
    rebill: Boolean(sub.rebill),
    instanceName: String(sub.instanceName || instanceSlug(workspaceId)).slice(0, 48),
    // Instâncias anteriores a este campo foram todas criadas na UAZAPI.
    provider: cleanProvider(sub.provider) || (sub.tokenSealed ? 'uazapi' : ''),
    tokenSealed: String(sub.tokenSealed || ''),
    tokenLast4: String(sub.tokenLast4 || ''),
    webhookSecret: typeof sub.webhookSecret === 'string' && sub.webhookSecret.length >= 32
      ? sub.webhookSecret
      : randomBytes(24).toString('hex'),
    status: normalizeStatus(sub.status),
    phone: digits(sub.phone),
    profileName: String(sub.profileName || '').slice(0, 120),
    updatedAt: String(sub.updatedAt || '')
  };
}

function normalizeRow(row) {
  const next = { ...blankRow(), ...(row && typeof row === 'object' ? row : {}) };
  next.provider = cleanProvider(next.provider) || 'uazapi';
  next.profile = { name: `WhatsApp (${PROVIDER_LABEL[next.provider]})` };
  next.baseUrl = String(next.baseUrl || '');
  next.adminTokenSealed = String(next.adminTokenSealed || '');
  next.adminTokenLast4 = String(next.adminTokenLast4 || '');
  const subs = next.subaccounts && typeof next.subaccounts === 'object' ? next.subaccounts : {};
  next.subaccounts = Object.fromEntries(Object.entries(subs).map(([id, cfg]) => [id, normalizeSub(id, cfg)]));
  return next;
}

function resolvePath(url) {
  let rawPath = url.searchParams.get('__path') || url.pathname;
  if (!rawPath.startsWith('/')) rawPath = '/' + rawPath;
  return rawPath.replace(/\/+/g, '/');
}

export function createWhatsAppHandler({
  store,
  secret = process.env.GO_STORAGE_KEY,
  request = fetch,
  envBaseUrl = process.env.UAZAPI_BASE_URL || '',
  envAdminToken = process.env.UAZAPI_ADMIN_TOKEN || '',
  evolutionBaseUrl = process.env.EVOLUTION_BASE_URL || '',
  evolutionApiKey = process.env.EVOLUTION_API_KEY || ''
}) {
  const managed = {
    evolution: { baseUrl: String(evolutionBaseUrl || '').trim().replace(/\/+$/, ''), adminToken: String(evolutionApiKey || '').trim() },
    uazapi: { baseUrl: String(envBaseUrl || '').trim().replace(/\/+$/, ''), adminToken: String(envAdminToken || '').trim() }
  };
  const hasManaged = provider => Boolean(managed[provider].baseUrl && managed[provider].adminToken);
  // Servidor gerenciado: a Evolution tem prioridade sobre a UAZAPI quando as duas estão no ambiente.
  const managedProvider = hasManaged('evolution') ? 'evolution' : hasManaged('uazapi') ? 'uazapi' : '';

  async function call(provider, baseUrl, path, { method = 'GET', headers = {}, body, timeout = 15000, retry = false } = {}) {
    const label = PROVIDER_LABEL[provider];
    if (!baseUrl) throw fail(`Servidor ${label} não configurado.`, 400);
    const allHeaders = { Accept: 'application/json', ...headers };
    if (body !== undefined) allHeaders['Content-Type'] = 'application/json';
    const attempt = async () => {
      const init = { method, headers: allHeaders, signal: AbortSignal.timeout(timeout) };
      if (body !== undefined) init.body = JSON.stringify(body);
      return request(`${baseUrl}${path}`, init);
    };
    let res;
    try {
      res = await attempt();
      // Um 502/503 do proxy enquanto o container reinicia: tenta mais uma vez antes de desistir.
      if (retry && [502, 503].includes(res.status)) { await wait(1500); res = await attempt(); }
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw fail(`A ${label} não respondeu a tempo (timeout).`, 504);
      }
      if (retry) {
        await wait(1500);
        try { return await attempt(); } catch { /* cai no erro abaixo */ }
      }
      throw fail(`Não foi possível alcançar a ${label}: ${err?.message || 'erro de rede'}.`, 502);
    }
    return res;
  }

  const adapters = { evolution: createEvolutionAdapter(call), uazapi: createUazapiAdapter(call) };

  async function ensureRow(agencyId) {
    const id = rowId(agencyId);
    try {
      return normalizeRow(await store.load(id));
    } catch (err) {
      if (err?.status !== 404) throw err;
    }
    await store.insert(id, blankRow(managedProvider || 'evolution'));
    return normalizeRow(await store.load(id));
  }

  async function changeRow(agencyId, mutate) {
    await ensureRow(agencyId);
    let updated = null;
    await store.change(rowId(agencyId), raw => {
      const normalized = normalizeRow(raw);
      updated = normalizeRow(mutate(normalized) || normalized);
      Object.assign(raw, updated);
    });
    return updated;
  }

  function serverCredentials(row, agencyId) {
    const customUrl = String(row.baseUrl || '').trim().replace(/\/+$/, '');
    const customAdmin = unsealSecret(secret, `${rowId(agencyId)}:admin`, row.adminTokenSealed);
    if (customUrl && customAdmin) {
      return { provider: row.provider, baseUrl: customUrl, adminToken: customAdmin, managed: false, configured: true };
    }
    if (managedProvider) {
      return { provider: managedProvider, ...managed[managedProvider], managed: true, configured: true };
    }
    return { provider: row.provider, baseUrl: customUrl, adminToken: customAdmin, managed: false, configured: false };
  }

  // A subconta como o provedor atual a enxerga: instância criada em outro provedor não vale mais.
  function subFor(row, workspaceId, provider) {
    const sub = normalizeSub(workspaceId, row.subaccounts?.[workspaceId]);
    if (sub.provider && sub.provider !== provider) {
      return { ...sub, provider, tokenSealed: '', tokenLast4: '', status: 'disconnected', phone: '', profileName: '' };
    }
    return sub;
  }

  function instanceTokenOf(row, agencyId, workspaceId, provider) {
    const sub = subFor(row, workspaceId, provider);
    if (!sub.tokenSealed) return '';
    return unsealSecret(secret, `${rowId(agencyId)}:sub:${workspaceId}`, sub.tokenSealed);
  }

  const webhookUrlOf = (publicOrigin, agencyId, workspaceId, sub) =>
    `${publicOrigin}/api/whatsapp/webhook/${encodeURIComponent(agencyId)}/${encodeURIComponent(workspaceId)}/${sub.webhookSecret}`;

  async function saveLive(agencyId, workspaceId, provider, parsed) {
    return changeRow(agencyId, current => {
      const cur = normalizeSub(workspaceId, current.subaccounts[workspaceId]);
      cur.provider = provider;
      cur.status = parsed.status;
      if (parsed.phone) cur.phone = parsed.phone;
      if (parsed.profileName) cur.profileName = parsed.profileName;
      if (parsed.status === 'disconnected') cur.phone = '';
      cur.updatedAt = new Date().toISOString();
      current.subaccounts[workspaceId] = cur;
      return current;
    });
  }

  async function forgetInstance(agencyId, workspaceId) {
    await changeRow(agencyId, current => {
      const cur = normalizeSub(workspaceId, current.subaccounts[workspaceId]);
      cur.tokenSealed = '';
      cur.tokenLast4 = '';
      cur.status = 'disconnected';
      cur.phone = '';
      current.subaccounts[workspaceId] = cur;
      return current;
    });
  }

  async function ensureInstance(agencyId, workspaceId, publicOrigin) {
    let row = await ensureRow(agencyId);
    const creds = serverCredentials(row, agencyId);
    if (!creds.configured) {
      throw fail('O WhatsApp ainda não foi configurado pela agência.', 400);
    }
    const adapter = adapters[creds.provider];
    let sub = subFor(row, workspaceId, creds.provider);
    if (!sub.enabled) {
      throw fail('O recurso de WhatsApp não está habilitado para esta subconta.', 403);
    }
    const webhookUrl = webhookUrlOf(publicOrigin, agencyId, workspaceId, sub);

    let token = instanceTokenOf(row, agencyId, workspaceId, creds.provider);
    if (!token) {
      const created = await adapter.provision({ creds, sub, webhookUrl });
      token = created.token;
      row = await changeRow(agencyId, current => {
        const nextSub = subFor(current, workspaceId, creds.provider);
        nextSub.provider = creds.provider;
        nextSub.tokenSealed = sealSecret(secret, `${rowId(agencyId)}:sub:${workspaceId}`, token);
        nextSub.tokenLast4 = token.slice(-4);
        nextSub.status = created.status || 'disconnected';
        nextSub.updatedAt = new Date().toISOString();
        current.subaccounts[workspaceId] = nextSub;
        return current;
      });
      sub = row.subaccounts[workspaceId];
    }

    // Regrava o webhook a cada conexão: corrige domínio trocado ou instância recriada no servidor.
    if (isHttps(webhookUrl)) {
      await adapter.setWebhook({ creds, token, sub, webhookUrl }).catch(() => {});
    }
    return { row, sub, token, creds, adapter, webhookUrl };
  }

  async function fetchLiveSubStatus(row, agencyId, workspaceId) {
    const creds = serverCredentials(row, agencyId);
    const sub = subFor(row, workspaceId, creds.provider);
    const token = instanceTokenOf(row, agencyId, workspaceId, creds.provider);
    const offline = { status: 'disconnected', qrcode: '', paircode: '', phone: '', profileName: '' };
    if (!creds.configured || !token) return { ...offline, reachable: creds.configured };
    try {
      const live = await adapters[creds.provider].status({ creds, token, sub });
      if (live.missing) {
        // Na Evolution a instância sumiu do servidor: esquece o vínculo para recriar no próximo "Conectar".
        if (creds.provider === 'evolution') await forgetInstance(agencyId, workspaceId);
        return { ...offline, reachable: true, tokenExpired: true };
      }
      if (live.error) {
        return { status: sub.status, qrcode: '', paircode: '', phone: sub.phone, profileName: sub.profileName, reachable: false, error: live.error };
      }
      await saveLive(agencyId, workspaceId, creds.provider, live);
      return { ...live, reachable: true };
    } catch (err) {
      return { status: sub.status, qrcode: '', paircode: '', phone: sub.phone, profileName: sub.profileName, reachable: false, error: err.message };
    }
  }

  function publicSubView(row, agencyId, workspaceId, publicOrigin, live = null) {
    const creds = serverCredentials(row, agencyId);
    const sub = subFor(row, workspaceId, creds.provider);
    return {
      provider: creds.provider,
      providerLabel: PROVIDER_LABEL[creds.provider],
      available: creds.configured,
      managed: creds.managed,
      workspace: workspaceId,
      enabled: sub.enabled,
      rebill: sub.rebill,
      status: live ? live.status : sub.status,
      phone: live ? (live.phone || sub.phone) : sub.phone,
      profileName: live ? (live.profileName || sub.profileName) : sub.profileName,
      qrcode: live?.qrcode || '',
      paircode: live?.paircode || '',
      webhookUrl: webhookUrlOf(publicOrigin, agencyId, workspaceId, sub),
      error: live?.error || ''
    };
  }

  function publicAgencyView(row, agencyId, workspaces, publicOrigin) {
    const creds = serverCredentials(row, agencyId);
    const hasCustom = Boolean(row.baseUrl && row.adminTokenSealed);
    return {
      provider: creds.provider,
      providerLabel: PROVIDER_LABEL[creds.provider],
      customProvider: row.provider,
      configured: creds.configured,
      managed: creds.managed,
      hasCustomServer: hasCustom,
      baseUrl: row.baseUrl || '',
      hasAdminToken: Boolean(row.adminTokenSealed),
      adminTokenLast4: row.adminTokenLast4 || '',
      subaccounts: Object.fromEntries(workspaces.map(ws => {
        const sub = subFor(row, ws.id, creds.provider);
        return [ws.id, {
          enabled: sub.enabled,
          rebill: sub.rebill,
          status: sub.status,
          phone: sub.phone,
          profileName: sub.profileName,
          hasInstance: Boolean(sub.tokenSealed),
          webhookUrl: webhookUrlOf(publicOrigin, agencyId, ws.id, sub)
        }];
      }))
    };
  }

  async function sendWorkspaceText(agencyId, workspaceId, phoneRaw, textRaw, accountIsActive) {
    const number = digits(phoneRaw);
    const text = typeof textRaw === 'string' ? textRaw.trim().slice(0, 4000) : '';
    if (number.length < 10 || number.length > 15) return { sent: false, reason: 'invalid-phone' };
    if (!text) return { sent: false, reason: 'empty-text' };
    let row = await ensureRow(agencyId);
    const creds = serverCredentials(row, agencyId);
    let sub = subFor(row, workspaceId, creds.provider);
    const token = instanceTokenOf(row, agencyId, workspaceId, creds.provider);
    if (!creds.configured || !sub.enabled || !token) return { sent: false, reason: 'not-connected' };
    if (sub.status !== 'connected') {
      // O status salvo pode estar velho (webhook perdido durante uma queda): confere ao vivo antes de recusar.
      const live = await fetchLiveSubStatus(row, agencyId, workspaceId);
      if (live.status !== 'connected') return { sent: false, reason: 'not-connected' };
      row = await ensureRow(agencyId);
      sub = subFor(row, workspaceId, creds.provider);
    }
    if (!await accountIsActive(agencyId, workspaceId)) return { sent: false, reason: 'account-suspended' };
    const result = await adapters[creds.provider].send({ creds, token, sub, number, text });
    if (!result.ok) {
      throw fail(`Falha ao enviar pelo WhatsApp (HTTP ${result.status})${result.message ? `: ${result.message}` : ''}.`, 502);
    }
    return { sent: true, id: result.id };
  }

  async function handleWebhook({ req, url, payload, listWorkspaces, webhookBlockReason, json }) {
    const rawPath = resolvePath(url);
    const match = rawPath.match(/^\/api\/whatsapp\/webhook\/([^/]+)\/([^/]+)\/([a-f0-9]{32,128})$/);
    if (!match) throw fail('Webhook inválido.', 404);
    const agencyId = decodeURIComponent(match[1]);
    const workspaceId = decodeURIComponent(match[2]);
    const secretToken = match[3];

    let row;
    try { row = normalizeRow(await store.load(rowId(agencyId))); }
    catch (e) { if (e.status === 404) throw fail('Assinatura do webhook inválida.', 403); throw e; }
    const stored = row.subaccounts[workspaceId];
    if (!stored || !safeEqual(stored.webhookSecret, secretToken)) {
      throw fail('Assinatura do webhook inválida.', 403);
    }

    const workspaces = await listWorkspaces(agencyId);
    if (!workspaces.some(w => w.id === workspaceId)) {
      throw fail('Subconta não encontrada.', 404);
    }

    const body = await payload(req);
    const creds = serverCredentials(row, agencyId);
    const provider = detectWebhookProvider(body) || stored.provider || creds.provider;
    const ignored = await webhookBlockReason(agencyId, workspaceId, provider);
    if (ignored) {
      return json({ ok: true, ignored: true, reason: ignored });
    }
    const event = adapters[provider].parseWebhook(body);

    if (event.kind === 'connection') {
      // Evento de um provedor que a subconta não usa mais não pode mexer no status atual.
      if (provider !== creds.provider) return json({ ok: true, ignored: true });
      await saveLive(agencyId, workspaceId, provider, event.parsed);
      return json({ ok: true, event: 'connection', status: event.parsed.status });
    }

    if (event.kind !== 'messages' || !event.items.length) {
      return json({ ok: true, ignored: true });
    }

    await store.change(workspaceId, state => {
      for (const { phone, text, senderName } of event.items) {
        let contact = state.contacts.find(c => digits(c.phone) === phone && phone.length >= 8);
        if (!contact) {
          const contactId = execute(state, {
            type: 'save',
            key: 'contacts',
            data: { name: senderName, phone: `+${phone}`, tags: ['WhatsApp'] }
          });
          contact = state.contacts.find(c => c.id === contactId);
        }
        if (contact) {
          execute(state, {
            type: 'message',
            data: { contactId: contact.id, channel: 'WhatsApp', direction: 'Inbound', body: text }
          });
        }
      }
    });

    return json({ ok: true, stored: true, workspace: workspaceId });
  }

  async function handleAgencyApi({ req, url, method, who, payload, publicOrigin, listWorkspaces, requireActiveAccount, json }) {
    const rawPath = resolvePath(url);
    const op = rawPath.slice('/api/whatsapp/agency/'.length).replace(/\/+$/, '');
    const agencyId = who.agencyId;
    const workspaces = await listWorkspaces(agencyId);

    if (op === 'status' && method === 'GET') {
      const row = await ensureRow(agencyId);
      return json(publicAgencyView(row, agencyId, workspaces, publicOrigin));
    }

    if (op === 'config' && method === 'POST') {
      const body = await payload(req);
      const guessed = /uazapi/i.test(String(body.baseUrl || '')) ? 'uazapi' : 'evolution';
      const provider = cleanProvider(body.provider) || guessed;
      const baseUrl = cleanBaseUrl(body.baseUrl, provider);
      const rawToken = typeof body.adminToken === 'string' ? body.adminToken.trim() : '';
      const existing = await ensureRow(agencyId);
      const canKeepToken = Boolean(existing.adminTokenSealed) && existing.provider === provider;
      if (!rawToken && !canKeepToken) {
        throw fail(provider === 'uazapi'
          ? 'Informe o Admin Token (admintoken) da sua conta UAZAPI.'
          : 'Informe a API Key global (AUTHENTICATION_API_KEY) da sua Evolution API.');
      }
      const saved = await changeRow(agencyId, row => {
        row.provider = provider;
        row.baseUrl = baseUrl;
        if (rawToken) {
          row.adminTokenSealed = sealSecret(secret, `${rowId(agencyId)}:admin`, rawToken);
          row.adminTokenLast4 = rawToken.slice(-4);
        }
        return row;
      });
      return json(publicAgencyView(saved, agencyId, workspaces, publicOrigin));
    }

    if (op === 'disconnect-server' && method === 'POST') {
      const saved = await changeRow(agencyId, row => {
        row.baseUrl = '';
        row.adminTokenSealed = '';
        row.adminTokenLast4 = '';
        return row;
      });
      return json(publicAgencyView(saved, agencyId, workspaces, publicOrigin));
    }

    if (op === 'subaccount' && method === 'POST') {
      const body = await payload(req);
      const workspace = String(body.workspace || '');
      if (!workspaces.some(w => w.id === workspace)) throw fail('Subconta inválida.', 400);
      await requireActiveAccount(agencyId, workspace, true, 'conversations');
      const saved = await changeRow(agencyId, row => {
        const prev = normalizeSub(workspace, row.subaccounts[workspace]);
        const enabled = body.enabled !== undefined ? Boolean(body.enabled) : prev.enabled;
        const rebill = enabled ? (body.rebill !== undefined ? Boolean(body.rebill) : prev.rebill) : false;
        row.subaccounts[workspace] = { ...prev, enabled, rebill };
        return row;
      });
      return json(publicAgencyView(saved, agencyId, workspaces, publicOrigin));
    }

    throw fail('Rota do WhatsApp não encontrada.', 404);
  }

  async function handleWorkspaceApi({ req, url, method, agencyId, workspaceId, payload, publicOrigin, requireActiveAccount, json }) {
    const rawPath = resolvePath(url);
    const op = rawPath.slice('/api/whatsapp/workspace/'.length).replace(/\/+$/, '');

    if (op === 'status' && method === 'GET') {
      const row = await ensureRow(agencyId);
      const live = await fetchLiveSubStatus(row, agencyId, workspaceId);
      const refreshed = await ensureRow(agencyId);
      return json(publicSubView(refreshed, agencyId, workspaceId, publicOrigin, live));
    }

    if (op === 'connect' && method === 'POST') {
      const body = await payload(req).catch(() => ({}));
      const phone = digits(body.phone || '');
      if (body.phone && (phone.length < 10 || phone.length > 15)) {
        throw fail('Informe o número com DDI e DDD (ex.: 5511999999999).');
      }
      await requireActiveAccount(agencyId, workspaceId, true, 'conversations');
      let ctx = await ensureInstance(agencyId, workspaceId, publicOrigin);
      await requireActiveAccount(agencyId, workspaceId, true, 'conversations');
      let parsed = await ctx.adapter.connect({ ...ctx, phone });
      if (parsed.missing) {
        // A instância foi apagada no servidor: recria uma vez e tenta de novo.
        await forgetInstance(agencyId, workspaceId);
        ctx = await ensureInstance(agencyId, workspaceId, publicOrigin);
        parsed = await ctx.adapter.connect({ ...ctx, phone });
        if (parsed.missing) throw fail('A instância do WhatsApp não foi encontrada no servidor.', 502);
      }
      const nextStatus = parsed.status === 'connected' ? 'connected' : 'connecting';
      const saved = await saveLive(agencyId, workspaceId, ctx.creds.provider, { ...parsed, status: nextStatus });
      return json(publicSubView(saved, agencyId, workspaceId, publicOrigin, { ...parsed, status: nextStatus }));
    }

    if (op === 'disconnect' && method === 'POST') {
      const row = await ensureRow(agencyId);
      const creds = serverCredentials(row, agencyId);
      const token = instanceTokenOf(row, agencyId, workspaceId, creds.provider);
      if (creds.configured && token) {
        const sub = subFor(row, workspaceId, creds.provider);
        await adapters[creds.provider].disconnect({ creds, token, sub }).catch(() => {});
      }
      const saved = await saveLive(agencyId, workspaceId, creds.provider, { status: 'disconnected' });
      return json(publicSubView(saved, agencyId, workspaceId, publicOrigin, { status: 'disconnected', qrcode: '', paircode: '', phone: '', profileName: '' }));
    }

    if (op === 'test' && method === 'POST') {
      const body = await payload(req);
      const number = digits(body.phone);
      const text = typeof body.text === 'string' ? body.text.trim().slice(0, 2000) : '';
      if (number.length < 10 || number.length > 15) throw fail('Informe o número de destino com DDI e DDD (ex.: 5511999999999).');
      if (!text) throw fail('Escreva uma mensagem para testar o envio.');
      const row = await ensureRow(agencyId);
      const creds = serverCredentials(row, agencyId);
      const token = instanceTokenOf(row, agencyId, workspaceId, creds.provider);
      if (!creds.configured || !token) throw fail('Conecte o WhatsApp desta subconta antes de enviar mensagens.', 409);
      await requireActiveAccount(agencyId, workspaceId, true, 'conversations');
      const sub = subFor(row, workspaceId, creds.provider);
      const result = await adapters[creds.provider].send({ creds, token, sub, number, text });
      if (!result.ok) {
        throw fail(`Falha ao enviar pela ${PROVIDER_LABEL[creds.provider]} (HTTP ${result.status})${result.message ? `: ${result.message}` : ''}.`, 502);
      }
      return json({ ok: true, id: result.id, number });
    }

    throw fail('Rota do WhatsApp não encontrada.', 404);
  }

  return { handleAgencyApi, handleWorkspaceApi, handleWebhook, sendWorkspaceText };
}
