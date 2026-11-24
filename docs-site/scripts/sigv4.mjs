// Assinatura AWS SigV4 para a API S3 do Cloudflare R2: a mesma do app (r2-storage.mjs), sem dependências.
import { createHash } from 'node:crypto';
export { encodeKey, signHeaders } from '../../r2-storage.mjs';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
