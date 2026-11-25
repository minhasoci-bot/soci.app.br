// Prévia local da documentação com a mídia de public/midia-local (antes de enviar ao R2).
// Uso: npm --prefix docs-site run previa   → http://localhost:4321
import { fileURLToPath } from 'node:url';

process.env.DOCS_MIDIA_BASE = '/midia-local';
const { dev } = await import('astro');
await dev({ root: fileURLToPath(new URL('..', import.meta.url)), server: { port: 4321 } });
