// White Label das subcontas: o domínio da agência (app.suaagencia.com.br) abre a soci com a marca dela.
// Três partes: o endereço salvo é validado e só pode ser de uma agência; o login, aberto nesse endereço,
// mostra o nome, o logotipo e a cor da agência; e, com um token da hospedagem (Vercel), o domínio é
// registrado no projeto sozinho, faltando à agência só o CNAME no DNS dela.
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

/** Para onde o CNAME do domínio da agência aponta. */
export const whiteLabelCname = 'cname.vercel-dns.com';
const platformHosts = ['soci.app.br', 'vercel.app', 'localhost'];

/** "app.agencia.com.br" from what the agency typed (scheme, path and port go away); '' clears it. */
export function whiteLabelHost(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '';
  const host = raw.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/\.$/, '');
  if (!/^(?=.{4,200}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) fail('Use um domínio como app.suaagencia.com.br.');
  if (platformHosts.some(platform => host === platform || host.endsWith(`.${platform}`))) fail('Use um domínio da sua agência, não um endereço da plataforma.');
  return host;
}

/** The host the request came in on, without the port. */
export const requestHost = req => String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');

/** Name, logo and color of the agency that owns this host, or {} on the platform's own addresses. */
export async function whiteLabelBrand(store, host) {
  if (!host || platformHosts.some(platform => host === platform || host.endsWith(`.${platform}`))) return {};
  const owner = await store.findAgency({ company: { domain: host } });
  const company = owner?.state?.company;
  return company ? { name: company.name || '', logo: company.logo || '', primary: company.primary || '' } : {};
}

/** A domain another agency already uses cannot be saved. */
export async function requireFreeDomain(store, host, agencyId) {
  if (!host) return;
  const owner = await store.findAgency({ company: { domain: host } });
  if (owner && owner.id !== agencyId) fail('Este domínio já é usado por outra agência.', 409);
}

/**
 * The hosting side: adds the domain to the Vercel project and reads whether its DNS points here.
 * Without VERCEL_API_TOKEN and VERCEL_PROJECT_ID it is off, and the domain must be added by hand.
 */
export function hostingDomains({ token = process.env.VERCEL_API_TOKEN, project = process.env.VERCEL_PROJECT_ID, team = process.env.VERCEL_TEAM_ID, fetch: get = fetch } = {}) {
  const configured = Boolean(token && project);
  const call = async (path, init = {}) => {
    const url = new URL(`https://api.vercel.com${path}`);
    if (team) url.searchParams.set('teamId', team);
    const response = await get(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  };
  return {
    configured,
    async add(host) {
      if (!configured || !host) return false;
      const result = await call(`/v10/projects/${encodeURIComponent(project)}/domains`, { method: 'POST', body: JSON.stringify({ name: host }) });
      // Already on this project counts as added.
      if (result.ok || (result.status === 409 && result.body?.error?.code === 'domain_already_in_use')) return true;
      fail(result.body?.error?.message || 'A hospedagem não aceitou o domínio.', 502);
    },
    async status(host) {
      if (!host) return { domain: '', cname: whiteLabelCname, hosting: configured };
      if (!configured) return { domain: host, cname: whiteLabelCname, hosting: false };
      const [domain, config] = await Promise.all([call(`/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(host)}`), call(`/v6/domains/${encodeURIComponent(host)}/config`)]);
      return { domain: host, cname: whiteLabelCname, hosting: true, added: domain.ok, verified: Boolean(domain.body?.verified), pointing: config.ok && config.body?.misconfigured === false };
    }
  };
}
