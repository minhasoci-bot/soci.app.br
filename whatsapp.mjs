import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { execute } from './model.mjs';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const digits = value => String(value || '').replace(/\D+/g, '');
const rowId = agencyId => `whatsapp-${agencyId}`;

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

function cleanBaseUrl(raw) {
  const value = typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : '';
  if (!value) throw fail('Informe a URL da sua conta UAZAPI (ex.: https://suaagencia.uazapi.com).');
  let parsed;
  try { parsed = new URL(value); } catch { throw fail('URL da UAZAPI inválida.'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw fail('A URL da UAZAPI deve usar http:// ou https://.');
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

function blankRow() {
  return {
    profile: { name: 'WhatsApp (UAZAPI)' },
    provider: 'uazapi',
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
  next.profile = { name: 'WhatsApp (UAZAPI)' };
  next.provider = 'uazapi';
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
  envAdminToken = process.env.UAZAPI_ADMIN_TOKEN || ''
}) {
  const managedBaseUrl = String(envBaseUrl || '').trim().replace(/\/+$/, '');
  const managedAdminToken = String(envAdminToken || '').trim();
  const hasManagedEnv = Boolean(managedBaseUrl && managedAdminToken);

  async function ensureRow(agencyId) {
    const id = rowId(agencyId);
    try {
      return normalizeRow(await store.load(id));
    } catch (err) {
      if (err?.status !== 404) throw err;
    }
    const fresh = blankRow();
    await store.insert(id, fresh);
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
      return { baseUrl: customUrl, adminToken: customAdmin, managed: false, configured: true };
    }
    if (hasManagedEnv) {
      return { baseUrl: managedBaseUrl, adminToken: managedAdminToken, managed: true, configured: true };
    }
    return { baseUrl: customUrl, adminToken: customAdmin, managed: false, configured: false };
  }

  function instanceTokenOf(row, agencyId, workspaceId) {
    const sub = row.subaccounts?.[workspaceId];
    if (!sub?.tokenSealed) return '';
    return unsealSecret(secret, `${rowId(agencyId)}:sub:${workspaceId}`, sub.tokenSealed);
  }

  async function uazapiFetch(baseUrl, path, { method = 'GET', adminToken = '', token = '', body } = {}) {
    if (!baseUrl) throw fail('Servidor UAZAPI não configurado.', 400);
    const headers = { Accept: 'application/json' };
    if (adminToken) headers.admintoken = adminToken;
    if (token) headers.token = token;
    const init = { method, headers, signal: AbortSignal.timeout(15000) };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    try {
      return await request(`${baseUrl}${path}`, init);
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw fail('A UAZAPI não respondeu a tempo (timeout).', 504);
      }
      throw fail(`Não foi possível alcançar a UAZAPI: ${err?.message || 'erro de rede'}.`, 502);
    }
  }

  async function readJsonSafe(res) {
    const text = await res.text().catch(() => '');
    if (!text) return {};
    try { return JSON.parse(text); } catch { return { raw: text.slice(0, 240) }; }
  }

  async function ensureInstance(agencyId, workspaceId, publicOrigin) {
    let row = await ensureRow(agencyId);
    const creds = serverCredentials(row, agencyId);
    if (!creds.configured) {
      throw fail('O WhatsApp ainda não foi configurado pela agência.', 400);
    }
    let sub = row.subaccounts[workspaceId] ? normalizeSub(workspaceId, row.subaccounts[workspaceId]) : normalizeSub(workspaceId, {});
    if (!sub.enabled) {
      throw fail('O recurso de WhatsApp não está habilitado para esta subconta.', 403);
    }

    let token = instanceTokenOf(row, agencyId, workspaceId);
    if (!token) {
      const payloadBody = { name: sub.instanceName, systemName: 'soci' };
      let initRes = await uazapiFetch(creds.baseUrl, '/instance/init', {
        method: 'POST', adminToken: creds.adminToken, body: payloadBody
      });
      if (initRes.status === 404) {
        initRes = await uazapiFetch(creds.baseUrl, '/instance/create', {
          method: 'POST', adminToken: creds.adminToken, body: payloadBody
        });
      }
      const data = await readJsonSafe(initRes);
      if (!initRes.ok) {
        throw fail(`Não foi possível provisionar a instância na UAZAPI (HTTP ${initRes.status})${data.message ? `: ${data.message}` : ''}.`, 502);
      }
      const parsed = parseUazapiInstance(data);
      if (!parsed.token) {
        throw fail('A UAZAPI criou a instância mas não retornou o token de acesso.', 502);
      }
      token = parsed.token;
      row = await changeRow(agencyId, current => {
        const nextSub = normalizeSub(workspaceId, current.subaccounts[workspaceId]);
        nextSub.tokenSealed = sealSecret(secret, `${rowId(agencyId)}:sub:${workspaceId}`, token);
        nextSub.tokenLast4 = token.slice(-4);
        nextSub.status = parsed.status || 'disconnected';
        nextSub.updatedAt = new Date().toISOString();
        current.subaccounts[workspaceId] = nextSub;
        return current;
      });
      sub = row.subaccounts[workspaceId];
    }

    const webhookUrl = `${publicOrigin}/api/whatsapp/webhook/${encodeURIComponent(agencyId)}/${encodeURIComponent(workspaceId)}/${sub.webhookSecret}`;
    if (/^https:\/\//i.test(webhookUrl)) {
      await uazapiFetch(creds.baseUrl, '/webhook', {
        method: 'POST',
        token,
        body: {
          enabled: true,
          url: webhookUrl,
          events: ['messages', 'connection'],
          excludeMessages: ['wasSentByApi']
        }
      }).catch(() => {});
    }

    return { row, sub, token, creds, webhookUrl };
  }

  async function fetchLiveSubStatus(row, agencyId, workspaceId) {
    const creds = serverCredentials(row, agencyId);
    const sub = row.subaccounts[workspaceId] ? normalizeSub(workspaceId, row.subaccounts[workspaceId]) : normalizeSub(workspaceId, {});
    const token = instanceTokenOf(row, agencyId, workspaceId);
    if (!creds.configured || !token) {
      return {
        status: 'disconnected',
        qrcode: '',
        paircode: '',
        phone: '',
        profileName: '',
        reachable: creds.configured
      };
    }
    try {
      const res = await uazapiFetch(creds.baseUrl, '/instance/status', { method: 'GET', token });
      if (res.status === 401 || res.status === 404) {
        return { status: 'disconnected', qrcode: '', paircode: '', phone: '', profileName: '', reachable: true, tokenExpired: true };
      }
      const data = await readJsonSafe(res);
      if (!res.ok) {
        return { status: sub.status, qrcode: '', paircode: '', phone: sub.phone, profileName: sub.profileName, reachable: false, error: `HTTP ${res.status}` };
      }
      const parsed = parseUazapiInstance(data);
      await changeRow(agencyId, current => {
        const cur = normalizeSub(workspaceId, current.subaccounts[workspaceId]);
        cur.status = parsed.status;
        if (parsed.phone) cur.phone = parsed.phone;
        if (parsed.profileName) cur.profileName = parsed.profileName;
        if (parsed.status === 'disconnected') cur.phone = '';
        cur.updatedAt = new Date().toISOString();
        current.subaccounts[workspaceId] = cur;
        return current;
      });
      return { ...parsed, reachable: true };
    } catch (err) {
      return { status: sub.status, qrcode: '', paircode: '', phone: sub.phone, profileName: sub.profileName, reachable: false, error: err.message };
    }
  }

  function publicSubView(row, agencyId, workspaceId, publicOrigin, live = null) {
    const creds = serverCredentials(row, agencyId);
    const sub = row.subaccounts[workspaceId] ? normalizeSub(workspaceId, row.subaccounts[workspaceId]) : normalizeSub(workspaceId, {});
    return {
      provider: 'uazapi',
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
      webhookUrl: `${publicOrigin}/api/whatsapp/webhook/${encodeURIComponent(agencyId)}/${encodeURIComponent(workspaceId)}/${sub.webhookSecret}`,
      error: live?.error || ''
    };
  }

  function publicAgencyView(row, agencyId, workspaces, publicOrigin) {
    const creds = serverCredentials(row, agencyId);
    const hasCustom = Boolean(row.baseUrl && row.adminTokenSealed);
    return {
      provider: 'uazapi',
      configured: creds.configured,
      managed: creds.managed,
      hasCustomServer: hasCustom,
      baseUrl: row.baseUrl || '',
      hasAdminToken: Boolean(row.adminTokenSealed),
      adminTokenLast4: row.adminTokenLast4 || '',
      subaccounts: Object.fromEntries(workspaces.map(ws => {
        const sub = row.subaccounts[ws.id] ? normalizeSub(ws.id, row.subaccounts[ws.id]) : normalizeSub(ws.id, {});
        return [ws.id, {
          enabled: sub.enabled,
          rebill: sub.rebill,
          status: sub.status,
          phone: sub.phone,
          profileName: sub.profileName,
          hasInstance: Boolean(sub.tokenSealed),
          webhookUrl: `${publicOrigin}/api/whatsapp/webhook/${encodeURIComponent(agencyId)}/${encodeURIComponent(ws.id)}/${sub.webhookSecret}`
        }];
      }))
    };
  }

  async function sendWorkspaceText(agencyId, workspaceId, phoneRaw, textRaw) {
    const number = digits(phoneRaw);
    const text = typeof textRaw === 'string' ? textRaw.trim().slice(0, 4000) : '';
    if (number.length < 10 || number.length > 15) return { sent: false, reason: 'invalid-phone' };
    if (!text) return { sent: false, reason: 'empty-text' };
    const row = await ensureRow(agencyId);
    const creds = serverCredentials(row, agencyId);
    const sub = row.subaccounts[workspaceId];
    const token = instanceTokenOf(row, agencyId, workspaceId);
    if (!creds.configured || !sub?.enabled || !token || sub.status !== 'connected') {
      return { sent: false, reason: 'not-connected' };
    }
    const res = await uazapiFetch(creds.baseUrl, '/send/text', {
      method: 'POST',
      token,
      body: { number, text }
    });
    const data = await readJsonSafe(res);
    if (!res.ok) {
      throw fail(`Falha ao enviar pelo WhatsApp (HTTP ${res.status})${data.message ? `: ${data.message}` : ''}.`, 502);
    }
    return { sent: true, id: String(data.id || data.messageid || data.key?.id || '') };
  }

  async function handleWebhook({ req, url, payload, listWorkspaces, json }) {
    const rawPath = resolvePath(url);
    const match = rawPath.match(/^\/api\/whatsapp\/webhook\/([^/]+)\/([^/]+)\/([a-f0-9]{32,128})$/);
    if (!match) throw fail('Webhook inválido.', 404);
    const agencyId = decodeURIComponent(match[1]);
    const workspaceId = decodeURIComponent(match[2]);
    const secretToken = match[3];

    const row = await ensureRow(agencyId);
    const sub = row.subaccounts[workspaceId];
    if (!sub || !safeEqual(sub.webhookSecret, secretToken)) {
      throw fail('Assinatura do webhook inválida.', 403);
    }

    const workspaces = await listWorkspaces(agencyId);
    if (!workspaces.some(w => w.id === workspaceId)) {
      throw fail('Subconta não encontrada.', 404);
    }

    const body = await payload(req);
    const eventType = String(body.EventType || body.event || body.type || '').toLowerCase();

    if (eventType === 'connection') {
      const parsed = parseUazapiInstance(body);
      await changeRow(agencyId, current => {
        const cur = normalizeSub(workspaceId, current.subaccounts[workspaceId]);
        cur.status = parsed.status;
        if (parsed.phone) cur.phone = parsed.phone;
        if (parsed.profileName) cur.profileName = parsed.profileName;
        if (parsed.status === 'disconnected') cur.phone = '';
        cur.updatedAt = new Date().toISOString();
        current.subaccounts[workspaceId] = cur;
        return current;
      });
      return json({ ok: true, event: 'connection', status: parsed.status });
    }

    if (eventType !== 'messages' && eventType !== 'message') {
      return json({ ok: true, ignored: true });
    }

    const msg = body.message && typeof body.message === 'object' ? body.message : (body.data || body.payload || {});
    if (msg.fromMe || msg.wasSentByApi || msg.isGroup || body.chat?.wa_isGroup) {
      return json({ ok: true, ignored: true });
    }
    const chatId = String(msg.chatid || msg.sender || body.chat?.wa_chatid || body.chat?.id || '');
    if (!chatId || chatId.endsWith('@g.us') || chatId === 'status@broadcast') {
      return json({ ok: true, ignored: true });
    }
    const text = String(msg.text || msg.content || msg.body || '').trim().slice(0, 4000);
    const phone = extractPhone(chatId);
    if (!phone || !text) return json({ ok: true, ignored: true });

    const senderName = String(msg.senderName || body.chat?.name || msg.pushName || `+${phone}`).trim().slice(0, 120);

    await store.change(workspaceId, state => {
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
    });

    return json({ ok: true, stored: true, workspace: workspaceId });
  }

  async function handleAgencyApi({ req, url, method, who, payload, publicOrigin, listWorkspaces, json }) {
    const rawPath = resolvePath(url);
    const op = rawPath.slice('/api/whatsapp/agency/'.length).replace(/\/+$/, '');
    const agencyId = who.agencyId;
    const workspaces = await listWorkspaces(agencyId);

    if (op === 'status' && method === 'GET') {
      const row = await ensureRow(agencyId);
      return json(publicAgencyView(row, agencyId, workspaces, publicOrigin));
    }

    if (op === 'config' && method === 'POST') {
      if (!who.settings) throw fail('Somente administradores podem configurar a UAZAPI.', 403);
      const body = await payload(req);
      const baseUrl = cleanBaseUrl(body.baseUrl);
      const rawToken = typeof body.adminToken === 'string' ? body.adminToken.trim() : '';
      const existing = await ensureRow(agencyId);
      if (!rawToken && !existing.adminTokenSealed) {
        throw fail('Informe o Admin Token (admintoken) da sua conta UAZAPI.');
      }
      const saved = await changeRow(agencyId, row => {
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
      if (!who.settings) throw fail('Somente administradores podem desconectar o servidor UAZAPI.', 403);
      const saved = await changeRow(agencyId, row => {
        row.baseUrl = '';
        row.adminTokenSealed = '';
        row.adminTokenLast4 = '';
        return row;
      });
      return json(publicAgencyView(saved, agencyId, workspaces, publicOrigin));
    }

    if (op === 'subaccount' && method === 'POST') {
      if (!who.settings) throw fail('Somente administradores podem configurar subcontas.', 403);
      const body = await payload(req);
      const workspace = String(body.workspace || '');
      if (!workspaces.some(w => w.id === workspace)) throw fail('Subconta inválida.', 400);
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

  async function handleWorkspaceApi({ req, url, method, agencyId, workspaceId, payload, publicOrigin, json }) {
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
      const { creds, token } = await ensureInstance(agencyId, workspaceId, publicOrigin);
      const connectRes = await uazapiFetch(creds.baseUrl, '/instance/connect', {
        method: 'POST',
        token,
        body: phone ? { phone } : {}
      });
      const data = await readJsonSafe(connectRes);
      if (!connectRes.ok) {
        throw fail(`Não foi possível iniciar a conexão na UAZAPI (HTTP ${connectRes.status})${data.message ? `: ${data.message}` : ''}.`, 502);
      }
      let parsed = parseUazapiInstance(data);
      if (parsed.status !== 'connected' && !parsed.qrcode && !parsed.paircode) {
        const liveRes = await uazapiFetch(creds.baseUrl, '/instance/status', { method: 'GET', token }).catch(() => null);
        if (liveRes?.ok) {
          const liveParsed = parseUazapiInstance(await readJsonSafe(liveRes));
          parsed = {
            ...parsed,
            status: liveParsed.status || parsed.status,
            qrcode: liveParsed.qrcode || parsed.qrcode,
            paircode: liveParsed.paircode || parsed.paircode,
            phone: liveParsed.phone || parsed.phone,
            profileName: liveParsed.profileName || parsed.profileName
          };
        }
      }
      const nextStatus = parsed.status === 'connected' ? 'connected' : 'connecting';
      const saved = await changeRow(agencyId, current => {
        const cur = normalizeSub(workspaceId, current.subaccounts[workspaceId]);
        cur.status = nextStatus;
        if (parsed.phone) cur.phone = parsed.phone;
        if (parsed.profileName) cur.profileName = parsed.profileName;
        cur.updatedAt = new Date().toISOString();
        current.subaccounts[workspaceId] = cur;
        return current;
      });
      return json(publicSubView(saved, agencyId, workspaceId, publicOrigin, { ...parsed, status: nextStatus }));
    }

    if (op === 'disconnect' && method === 'POST') {
      const row = await ensureRow(agencyId);
      const creds = serverCredentials(row, agencyId);
      const token = instanceTokenOf(row, agencyId, workspaceId);
      if (creds.configured && token) {
        await uazapiFetch(creds.baseUrl, '/instance/disconnect', {
          method: 'POST',
          token,
          body: {}
        }).catch(() => {});
      }
      const saved = await changeRow(agencyId, current => {
        const cur = normalizeSub(workspaceId, current.subaccounts[workspaceId]);
        cur.status = 'disconnected';
        cur.phone = '';
        cur.updatedAt = new Date().toISOString();
        current.subaccounts[workspaceId] = cur;
        return current;
      });
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
      const token = instanceTokenOf(row, agencyId, workspaceId);
      if (!creds.configured || !token) throw fail('Conecte o WhatsApp desta subconta antes de enviar mensagens.', 409);
      const res = await uazapiFetch(creds.baseUrl, '/send/text', {
        method: 'POST',
        token,
        body: { number, text }
      });
      const data = await readJsonSafe(res);
      if (!res.ok) {
        throw fail(`Falha ao enviar pela UAZAPI (HTTP ${res.status})${data.message ? `: ${data.message}` : ''}.`, 502);
      }
      return json({ ok: true, id: String(data.id || data.messageid || ''), number });
    }

    throw fail('Rota do WhatsApp não encontrada.', 404);
  }

  return { handleAgencyApi, handleWorkspaceApi, handleWebhook, sendWorkspaceText };
}
