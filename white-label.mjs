// White Label das subcontas: o domínio da agência (app.suaagencia.com.br) abre a soci com a marca dela.
// Três partes: o endereço salvo é validado e só pode ser de uma agência; o login, aberto nesse endereço,
// mostra o nome, o logotipo e a cor da agência; e, com um token da hospedagem (Vercel), o domínio é
// registrado no projeto sozinho, faltando à agência só o CNAME no DNS dela.
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

/** Para onde o CNAME do domínio da agência aponta. */
export const whiteLabelCname = 'cname.vercel-dns.com';
const platformHosts = ['soci.app.br', 'vercel.app', 'localhost'];

/** soci.app.br, its subdomains, the Vercel preview addresses and localhost: never an agency's address. */
export const isPlatformHost = host => !host || platformHosts.some(platform => host === platform || host.endsWith(`.${platform}`)) || /^(\d{1,3}\.){3}\d{1,3}$|^\[?::1\]?$/.test(host);

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
    /** Takes a domain the agency no longer uses off the project. Already gone counts as removed. */
    async remove(host) {
      if (!configured || !host) return false;
      const result = await call(`/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(host)}`, { method: 'DELETE' });
      if (result.ok || result.status === 404) return true;
      fail(result.body?.error?.message || 'A hospedagem não removeu o domínio antigo.', 502);
    },
    async status(host) {
      if (!host) return { domain: '', cname: whiteLabelCname, hosting: configured, verification: [] };
      if (!configured) return { domain: host, cname: whiteLabelCname, hosting: false, verification: [] };
      const domainPath = `/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(host)}`;
      const [found, config] = await Promise.all([call(domainPath), call(`/v6/domains/${encodeURIComponent(host)}/config`)]);
      let domain = found;
      // A domain that is already in another Vercel account waits for a TXT ownership record. Each check asks
      // the hosting to look again, so the agency does not wait for Vercel's own retry after publishing it.
      if (domain.ok && !domain.body?.verified) {
        const check = await call(`${domainPath}/verify`, { method: 'POST' });
        if (check.ok) domain = check;
      }
      const verified = Boolean(domain.body?.verified);
      const verification = verified ? [] : (Array.isArray(domain.body?.verification) ? domain.body.verification : [])
        .map(row => ({ type: String(row.type || 'TXT'), name: String(row.domain || ''), value: String(row.value || '') }));
      const dns = config.ok ? config.body || {} : {};
      const best = list => [...(Array.isArray(list) ? list : [])].sort((a, b) => (a.rank || 0) - (b.rank || 0));
      const cname = String(best(dns.recommendedCNAME)[0]?.value || whiteLabelCname).replace(/\.$/, '');
      const vercelIps = best(dns.recommendedIPv4).flatMap(row => row.value || []);
      // Cloudflare with the orange cloud answers with its own IPs instead of the CNAME: the hosting cannot
      // issue the certificate behind it and the visitor sees error 525.
      const proxied = (dns.nameservers || []).some(ns => /cloudflare/i.test(ns)) && !(dns.cnames || []).length
        && (dns.aValues || []).length > 0 && !(dns.aValues || []).some(ip => vercelIps.includes(ip));
      return { domain: host, cname, hosting: true, added: domain.ok, verified, pointing: config.ok && dns.misconfigured === false, verification, proxied };
    }
  };
}
