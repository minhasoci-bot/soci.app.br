// Roteiro de prints do artigo conversas/dominio-de-email. O serviço de e-mail (Resend) é simulado:
// nada sai da máquina, e os registros DNS mostrados são fictícios.
import { emailDomains } from '../../email-domain.mjs';

const registros = [
  { record: 'SPF', type: 'MX', name: 'envio', value: 'feedback-smtp.sa-east-1.exemplo.test', priority: 10, status: 'not_started', ttl: 'Auto' },
  { record: 'SPF', type: 'TXT', name: 'envio', value: 'v=spf1 include:exemplo.test ~all', status: 'not_started', ttl: 'Auto' },
  { record: 'DKIM', type: 'TXT', name: 'resend._domainkey', value: 'p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDEMOEXEMPLO', status: 'not_started', ttl: 'Auto' },
];
const resendSimulado = async (url, { method }) => {
  const caminho = new URL(url).pathname;
  const dominio = { id: 'dom_demo', name: 'envio.sorrisoleve.com.br', region: 'sa-east-1', status: 'not_started', records: registros };
  if (method === 'POST' && caminho === '/domains') return new Response(JSON.stringify(dominio), { status: 201 });
  if (method === 'GET') return new Response(JSON.stringify(dominio), { status: 200 });
  return new Response('{}', { status: 200 });
};

export default {
  grupo: 'conversas',
  artigo: 'dominio-de-email',
  subconta: 'Clínica Sorriso Leve',
  rota: '#settings/email',
  servidor: { emailDomainApi: emailDomains({ key: 're_demo_simulado', base: 'https://resend.exemplo.test', request: resendSimulado }) },
  passos: [
    { nome: 'dominio-e-remetente', acao: async page => {
      await page.locator('main').getByLabel('Domínio', { exact: true }).fill('envio.sorrisoleve.com.br');
      await page.locator('main input[name="localPart"]').fill('contato');
    }, destacar: 'main button:has-text("Adicionar domínio")' },
    { nome: 'registros-dns', acao: page => page.locator('main button:has-text("Adicionar domínio")').click(), espera: 1500 },
  ],
};
