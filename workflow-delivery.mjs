// Outbound webhooks from workflows: https only, never to private or local networks, short timeout.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

function privateAddress(address) {
  const ip = address.toLowerCase().replace(/^::ffff:/, '');
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  return ip === '::' || ip === '::1' || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || /^ff/.test(ip);
}

export async function deliverWebhook(item, { fetchImpl = fetch, resolve = lookup, timeout = 8000 } = {}) {
  let target;
  try { target = new URL(item.url); } catch { return 'endereço inválido'; }
  if (target.protocol !== 'https:' || target.username || target.password) return 'apenas https:// é aceito';
  const host = target.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host }] : await resolve(host, { all: true }).catch(() => []);
  if (!addresses.length) return 'domínio não encontrado';
  if (addresses.some(entry => privateAddress(entry.address))) return 'endereço de rede interna bloqueado';
  const method = ['POST', 'PUT', 'GET'].includes(item.method) ? item.method : 'POST';
  try {
    const response = await fetchImpl(target, {
      method, redirect: 'manual', signal: AbortSignal.timeout(timeout),
      headers: { 'content-type': 'application/json', 'user-agent': 'soci-workflows/1.0' },
      ...(method === 'GET' ? {} : { body: JSON.stringify(item.body ?? {}) })
    });
    return response.ok ? `enviado (${response.status})` : `falhou (${response.status})`;
  } catch (error) {
    return error?.name === 'TimeoutError' ? 'sem resposta em 8 s' : 'falha de conexão';
  }
}

export { privateAddress };
