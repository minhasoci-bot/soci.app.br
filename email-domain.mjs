// Serviços de e-mail: each sub-account can send from its own domain. The domain lives in the platform's
// Resend account (Domains API): Resend hands back the SPF (MX + TXT) and DKIM records, the client publishes
// them in their DNS, and once Resend verifies them the workspace's e-mails go out as name <local@domain>.

const STATUS = {
  not_started: 'Aguardando DNS',
  pending: 'Verificando',
  verified: 'Verificado',
  failed: 'Falhou',
  temporary_failure: 'Falha temporária'
};

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

/** "https://Mail.Clinica.com.br/" → "mail.clinica.com.br"; throws when it is not a public host name. */
export function normalizeDomain(value) {
  let name = String(value || '').trim().toLowerCase();
  name = name.replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/\.$/, '');
  if (name.includes('@')) name = name.split('@').pop();
  const labels = name.split('.');
  const valid = name.length <= 253 && labels.length >= 2
    && labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
    && /^[a-z]{2,63}$|^xn--[a-z0-9-]{1,59}$/.test(labels.at(-1));
  if (!valid) throw fail('Informe um domínio válido, como mail.suaempresa.com.br.');
  return name;
}

/** The part before the @. Letters, digits, dots, hyphens and underscores; no dot at the ends. */
export function normalizeLocalPart(value) {
  const local = String(value ?? '').trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/.test(local) || local.includes('..')) {
    throw fail('Use só letras, números, ponto, hífen ou sublinhado antes do @ (ex.: contato).');
  }
  return local;
}

const cleanRecord = r => ({
  record: String(r?.record || ''), type: String(r?.type || ''), name: String(r?.name || ''),
  value: String(r?.value || ''), priority: Number.isFinite(r?.priority) ? r.priority : null,
  ttl: String(r?.ttl || 'Auto'), status: String(r?.status || 'not_started')
});

/** Wraps the Resend Domains API with the platform key (the same one that sends the e-mails). */
export function emailDomains({ key = process.env.RESEND_API_KEY, base = process.env.RESEND_API_URL || 'https://api.resend.com', region = 'sa-east-1', request = fetch } = {}) {
  const call = async (method, path, body) => {
    if (!key) throw fail('O envio de e-mail não está configurado nesta instalação (RESEND_API_KEY).', 503);
    const response = await request(`${base}${path}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    }).catch(() => null);
    if (!response) throw fail('O serviço de e-mail não respondeu. Tente de novo em instantes.', 502);
    const data = await response.json().catch(() => ({}));
    if (response.ok) return data;
    if (response.status === 404) throw fail('O domínio não existe mais no serviço de e-mail.', 404);
    if (data?.name === 'restricted_api_key') throw fail('A chave do Resend desta instalação só pode enviar e-mails. Use uma chave com acesso total para gerenciar domínios.', 502);
    const detail = String(data?.message || '').slice(0, 200);
    throw fail(`O serviço de e-mail recusou o pedido${detail ? `: ${detail}` : ` (HTTP ${response.status})`}.`, response.status === 422 || response.status === 403 ? 400 : 502);
  };
  const domainOf = data => ({ id: String(data.id || ''), name: String(data.name || ''), region: String(data.region || region), status: STATUS[data.status] ? data.status : 'not_started', records: (Array.isArray(data.records) ? data.records : []).map(cleanRecord) });
  return {
    configured: Boolean(key),
    async add(name) { return domainOf(await call('POST', '/domains', { name: normalizeDomain(name), region })); },
    async get(id) { return domainOf(await call('GET', `/domains/${encodeURIComponent(id)}`)); },
    async verify(id) { await call('POST', `/domains/${encodeURIComponent(id)}/verify`); },
    async remove(id) {
      try { await call('DELETE', `/domains/${encodeURIComponent(id)}`); }
      catch (e) { if (e.status !== 404) throw e; }
    }
  };
}

/** The address a sub-account sends from, or '' while its domain is missing or not verified. */
export function workspaceSender(row) {
  const d = row?.emailDomain;
  return d?.status === 'verified' && d.name && d.localPart ? `${d.localPart}@${d.name}` : '';
}

/** What Settings → Serviços de e-mail shows. */
export function emailDomainView(row, { configured, platformFrom = '' }) {
  const d = row?.emailDomain;
  const platform = /<([^>]+)>/.exec(platformFrom)?.[1] || platformFrom;
  const view = { configured, platformAddress: platform, domain: null, sender: workspaceSender(row) };
  if (!d) return view;
  view.domain = {
    name: d.name, region: d.region, status: d.status, statusLabel: STATUS[d.status] || STATUS.not_started,
    localPart: d.localPart, address: `${d.localPart}@${d.name}`, records: d.records || [],
    dmarc: { type: 'TXT', name: `_dmarc.${d.name}`, value: 'v=DMARC1; p=none;' },
    addedAt: d.addedAt, checkedAt: d.checkedAt || '', verifiedAt: d.verifiedAt || ''
  };
  return view;
}

/** Copies what Resend reports into the stored domain, keeping the local part and dates. */
export function applyDomainStatus(stored, live, at) {
  const verified = live.status === 'verified';
  return { ...stored, status: live.status, records: live.records.length ? live.records : stored.records, region: live.region || stored.region, checkedAt: at, verifiedAt: verified ? stored.verifiedAt || at : '' };
}
