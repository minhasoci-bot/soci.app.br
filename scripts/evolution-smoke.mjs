// Teste de ponta a ponta contra uma Evolution API de verdade, pelo mesmo código que o app usa:
// servidor, criar instância, webhook, QR Code, status e excluir. Não envia mensagem a ninguém.
//
//   EVOLUTION_BASE_URL=https://whatsapp.seudominio.com.br EVOLUTION_API_KEY=... node scripts/evolution-smoke.mjs
import { createWhatsAppHandler } from '../whatsapp.mjs';

const baseUrl = process.env.EVOLUTION_BASE_URL || '', apiKey = process.env.EVOLUTION_API_KEY || '';
if (!baseUrl || !apiKey) {
  console.error('Defina EVOLUTION_BASE_URL e EVOLUTION_API_KEY.');
  process.exit(2);
}

const workspace = `smoke${Date.now().toString(36)}`, agencyId = 'smoke';
const rows = new Map();
const missing = () => Object.assign(new Error('not found'), { status: 404 });
const store = {
  load: id => { if (!rows.has(id)) throw missing(); return structuredClone(rows.get(id)); },
  insert: (id, row) => { rows.set(id, structuredClone(row)); },
  change: (id, mutate) => { const row = store.load(id); mutate(row); rows.set(id, row); }
};
const calls = [];
const request = async (url, init) => {
  const res = await fetch(url, init);
  calls.push({ path: new URL(url).pathname, status: res.status });
  return res;
};
const handler = createWhatsAppHandler({ store, secret: 'evolution-smoke', request, evolutionBaseUrl: baseUrl, evolutionApiKey: apiKey });
const common = { payload: async req => req.body, publicOrigin: 'https://smoke.invalid', listWorkspaces: async () => [{ id: workspace }], requireActiveAccount: async () => {}, json: data => data };
const agency = (op, method = 'GET', body = {}) => handler.handleAgencyApi({ ...common, req: { body }, url: new URL(`http://x/api/whatsapp/agency/${op}`), method, who: { agencyId } });
const sub = (op, method = 'GET', body = {}) => handler.handleWorkspaceApi({ ...common, req: { body }, url: new URL(`http://x/api/whatsapp/workspace/${op}`), method, agencyId, workspaceId: workspace });

let failed = false;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'ERRO'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failed = true;
}

try {
  const server = await agency('server');
  check('servidor no ar e chave aceita', server.ok, server.ok ? `versão ${server.version}, ${server.latencyMs} ms` : server.error);
  if (!server.ok) process.exit(1);

  let live = await sub('connect', 'POST');
  check('instância criada', calls.some(c => c.path === '/instance/create' && c.status === 201));
  check('webhook aceito', calls.some(c => c.path.startsWith('/webhook/set/') && c.status < 300));
  // O endereço que a Evolution guardou tem de ser o que o app aceita (segredo da subconta incluído).
  const hook = await fetch(`${baseUrl.replace(/\/+$/, '')}/webhook/find/soci_${workspace}`, { headers: { apikey: apiKey } }).then(res => res.json()).catch(() => ({}));
  check('webhook registrado é o que o app aceita', Boolean(hook?.url) && hook.url === live.webhookUrl);
  // O primeiro QR depende do servidor do WhatsApp: dá até 30 s.
  for (let i = 0; i < 10 && !live.qrcode; i++) {
    await new Promise(done => setTimeout(done, 3000));
    live = await sub('status');
  }
  check('QR Code recebido', /^data:image\//.test(live.qrcode || ''), live.error || live.status);
  const now = await agency('server');
  check('instância aparece no servidor', now.instances === 1);
} catch (err) {
  check('sem exceção', false, err.message);
} finally {
  try {
    const view = await agency('remove-instance', 'POST', { workspace });
    const after = await agency('server');
    check('instância de teste excluída', !view.subaccounts[workspace].hasInstance && after.instances === 0);
  } catch (err) {
    check('instância de teste excluída', false, `${err.message} Apague soci_${workspace} no painel /manager.`);
  }
}
process.exit(failed ? 1 : 0);
