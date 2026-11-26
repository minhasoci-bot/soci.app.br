// Roteiro de prints do artigo agencia/dominio-proprio. Cada captura parte da Agência Demo recém-semeada.
// A hospedagem (Vercel) é simulada: nada sai da máquina, e o domínio fica esperando o TXT de posse, como
// acontece quando ele já foi usado em outra conta da Vercel.
import { hostingDomains } from '../../white-label.mjs';

const resposta = body => ({ ok: true, status: 200, json: async () => body });
const vercelSimulada = async url => {
  if (url.pathname.endsWith('/verify')) return { ok: false, status: 400, json: async () => ({}) };
  if (url.pathname.endsWith('/config')) return resposta({ misconfigured: false, nameservers: ['ana.ns.exemplo.test'], cnames: ['cname.vercel-dns.com'], aValues: [], recommendedCNAME: [{ rank: 1, value: 'cname.vercel-dns.com.' }] });
  return resposta({ name: 'app.agenciademo.com.br', verified: false, verification: [{ type: 'TXT', domain: '_vercel.agenciademo.com.br', value: 'vc-domain-verify=app.agenciademo.com.br,0a1b2c3d4e5f', reason: 'pending_domain_verification' }] });
};
const form = page => page.locator('main form').filter({ has: page.locator('input[name="primary"]') });

export default {
  grupo: 'agencia',
  artigo: 'dominio-proprio',
  subconta: 'Clínica Sorriso Leve',
  rota: '#agency/settings/company',
  servidor: { hosting: hostingDomains({ token: 'demo', project: 'prj_demo', fetch: vercelSimulada }) },
  passos: [
    { nome: 'campo-do-dominio', acao: async page => {
      const campo = form(page).locator('input[name="domain"]');
      await campo.fill('app.agenciademo.com.br');
      await campo.evaluate(no => no.scrollIntoView({ block: 'center' }));
    }, destacar: 'main input[name="domain"]' },
    { nome: 'verificar-dominio', acao: async page => {
      await form(page).getByRole('button', { name: 'Salvar dados da empresa' }).click();
      await page.waitForTimeout(1500);
      const botao = page.locator('[data-ag-domain-check]');
      await botao.evaluate(no => no.scrollIntoView({ block: 'center' }));
      await botao.click();
      const situacao = page.locator('[data-ag-domain-status] table');
      await situacao.waitFor();
      await situacao.evaluate(no => no.closest('[data-ag-domain-status]').scrollIntoView({ block: 'center' }));
    }, destacar: '[data-ag-domain-status]' },
  ],
};
