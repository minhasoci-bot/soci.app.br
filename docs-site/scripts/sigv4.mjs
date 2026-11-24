// Assinatura AWS SigV4 para a API S3 do Cloudflare R2, sem dependências.
// Cópia de r2-storage.mjs (branch feat/r2-storage, PR #94). Quando o PR estiver na main, importar de lá.
import { createHash, createHmac } from 'node:crypto';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
const rfc3986 = value => encodeURIComponent(value).replace(/[!'()*]/g, ch => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
export const encodeKey = key => String(key).split('/').map(rfc3986).join('/');
const stamp = date => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const canonicalQuery = query => Object.entries(query).map(([k, v]) => [rfc3986(k), rfc3986(String(v))])
  .sort(([a, x], [b, y]) => a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0).map(([k, v]) => `${k}=${v}`).join('&');

function signature({ secretAccessKey, region, service, date, method, path, query, headers, payloadHash }) {
  const amzDate = stamp(date), day = amzDate.slice(0, 8), scope = `${day}/${region}/${service}/aws4_request`;
  const names = Object.keys(headers).map(name => name.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')]));
  const signedHeaders = names.join(';');
  const request = [method, path, canonicalQuery(query), names.map(name => `${name}:${lower[name]}\n`).join(''), signedHeaders, payloadHash].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(request)].join('\n');
  const key = [day, region, service, 'aws4_request'].reduce((k, part) => hmac(k, part), `AWS4${secretAccessKey}`);
  return { amzDate, scope, signedHeaders, signature: createHmac('sha256', key).update(toSign).digest('hex') };
}

// Headers for a request signed in the Authorization header (server-side calls).
export function signHeaders({ accessKeyId, secretAccessKey, region = 'auto', service = 's3', date = new Date(), method, host, path, query = {}, headers = {}, payloadHash }) {
  const all = { ...headers, host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': stamp(date) };
  const signed = signature({ secretAccessKey, region, service, date, method, path, query, headers: all, payloadHash });
  const { host: _host, ...sent } = all;
  return { ...sent, Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${signed.scope}, SignedHeaders=${signed.signedHeaders}, Signature=${signed.signature}` };
}

