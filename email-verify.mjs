// "Verificar e-mail" (workflows, paridade GHL T.1): checks the address format and whether its domain receives
// mail (MX records; without them, an address record also receives mail, RFC 5321). It never sends a message.
import { promises as dns } from 'node:dns';

const ADDRESS = /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/;
// Answers that mean "no such record" (as opposed to a lookup that failed).
const MISSING = ['ENODATA', 'ENOTFOUND', 'ENOTIMP'];

/** { status: 'valid' | 'invalid' | 'unknown', reason } for one address. `resolver` has resolveMx and resolve4. */
export async function checkEmailAddress(email, resolver = dns, { timeout = 5000 } = {}) {
  const address = String(email || '').trim().toLowerCase();
  if (!ADDRESS.test(address)) return { status: 'invalid', reason: 'formato inválido' };
  const domain = address.split('@')[1];
  const within = promise => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), timeout))]);
  try {
    const mx = await within(resolver.resolveMx(domain));
    if (mx.some(row => row?.exchange && row.exchange !== '.')) return { status: 'valid', reason: 'o domínio recebe e-mail' };
    if (mx.length) return { status: 'invalid', reason: 'o domínio não aceita e-mail' };
  } catch (error) {
    if (error.code === 'ENOTFOUND') return { status: 'invalid', reason: 'o domínio não existe' };
    if (!MISSING.includes(error.code)) return { status: 'unknown', reason: 'não foi possível consultar o domínio agora' };
  }
  try {
    const addresses = await within(resolver.resolve4(domain));
    if (addresses.length) return { status: 'valid', reason: 'o domínio recebe e-mail (sem MX, pelo endereço do domínio)' };
  } catch (error) {
    if (!MISSING.includes(error.code)) return { status: 'unknown', reason: 'não foi possível consultar o domínio agora' };
  }
  return { status: 'invalid', reason: 'o domínio não recebe e-mail' };
}
