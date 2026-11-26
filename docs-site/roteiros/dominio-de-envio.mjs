// Roteiro de prints do artigo agencia/dominio-de-envio. O serviço de e-mail (Resend) é simulado:
// nada sai da máquina, e os registros DNS mostrados são fictícios.
import { emailDomains } from '../../email-domain.mjs';

let verificado = false;
const registros = status => [
  { record: 'SPF', type: 'MX', name: 'send.envio', value: 'feedback-smtp.sa-east-1.exemplo.test', priority: 10, status, ttl: 'Auto' },
  { record: 'SPF', type: 'TXT', name: 'send.envio', value: 'v=spf1 include:exemplo.test ~all', status, ttl: 'Auto' },
  { record: 'DKIM', type: 'TXT', name: 'resend._domainkey.envio', value: 'p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDEMOEXEMPLO', status, ttl: 'Auto' },
];
const resendSimulado = async (url, { method }) => {
  const caminho = new URL(url).pathname;
  if (method === 'POST' && caminho.endsWith('/verify')) { verificado = true; return new Response('{}', { status: 200 }); }
  const status = verificado ? 'verified' : 'not_started';
  const dominio = { id: 'dom_agencia_demo', name: 'envio.agenciademo.com.br', region: 'sa-east-1', status, records: registros(status) };
  if (method === 'POST' && caminho === '/domains') { verificado = false; return new Response(JSON.stringify(dominio), { status: 201 }); }
  return new Response(JSON.stringify(method === 'GET' ? dominio : {}), { status: 200 });
};

export default {
  grupo: 'agencia',
  artigo: 'dominio-de-envio',
  subconta: 'Clínica Sorriso Leve',
  rota: '#agency/settings/email-services',
  servidor: { emailDomainApi: emailDomains({ key: 're_demo_simulado', base: 'https://resend.exemplo.test', request: resendSimulado }) },
  passos: [
    { nome: 'dominio-e-endereco', acao: async page => {
      await page.locator('main form[data-ag-form="email-domain"] input[name="domain"]').fill('envio.agenciademo.com.br');
      await page.locator('main form[data-ag-form="email-domain"] input[name="localPart"]').fill('avisos');
    }, destacar: 'main form[data-ag-form="email-domain"]' },
    { nome: 'registros-dns', acao: async page => {
      await page.locator('main button:has-text("Adicionar domínio")').click();
      await page.locator('main .email-dns').waitFor();
    }, destacar: 'main .email-dns' },
    { nome: 'subcontas-escolhidas', acao: async page => {
      const form = page.locator('main form[data-ag-form="email-domain-accounts"]');
      await form.locator('input[type="checkbox"]').first().check();
      await form.evaluate(no => no.scrollIntoView({ block: 'center' }));
    }, destacar: 'main form[data-ag-form="email-domain-accounts"]' },
    { nome: 'verificado', acao: async page => {
      await page.locator('main form[data-ag-form="email-domain-accounts"] button.primary').click();
      await page.waitForTimeout(1000);
      await page.locator('main button:has-text("Verificar agora")').click();
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.scrollTo(0, 0));
    }, destacar: 'main .ag-notice' },
  ],
};
