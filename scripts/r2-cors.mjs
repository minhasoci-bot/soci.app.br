// Libera o bucket R2 para os endereços do app: o navegador envia (PUT) os arquivos grandes do Mídia Drive
// direto ao bucket e lê de volta pelos links assinados. Rode uma vez por bucket (e de novo se mudar o domínio).
//
//   node --env-file=.env.local scripts/r2-cors.mjs https://app.exemplo.com.br http://localhost:4317
//
// Sem endereços, usa http://localhost:<GO_PORT ou 4317>. Precisa das variáveis R2_* (veja .env.example).
import { r2FromEnv } from '../r2-storage.mjs';

const origins = process.argv.slice(2).length ? process.argv.slice(2) : [`http://localhost:${process.env.GO_PORT || 4317}`];
for (const origin of origins) {
  const parsed = URL.canParse(origin) ? new URL(origin) : null;
  if (!parsed || !/^https?:$/.test(parsed.protocol) || parsed.origin !== origin) {
    console.error(`Endereço inválido: ${origin} (use só a origem, como https://app.exemplo.com.br)`);
    process.exit(1);
  }
}
const r2 = r2FromEnv();
if (!r2) {
  console.error('Defina R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY e R2_BUCKET.');
  process.exit(1);
}
await r2.setCors(origins);
console.log(`CORS do bucket ${r2.bucket} liberado para: ${origins.join(', ')}`);
