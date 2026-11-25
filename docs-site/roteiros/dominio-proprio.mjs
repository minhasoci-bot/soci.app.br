// Roteiro de prints do artigo agencia/dominio-proprio. Cada captura parte da Agência Demo recém-semeada.
const form = page => page.locator('main form').filter({ has: page.locator('input[name="primary"]') });

export default {
  grupo: 'agencia',
  artigo: 'dominio-proprio',
  subconta: 'Clínica Sorriso Leve',
  rota: '#agency/settings/company',
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
      const situacao = page.locator('[data-ag-domain-status]').filter({ hasText: /\S/ });
      await situacao.waitFor();
      await situacao.evaluate(no => window.scrollBy(0, no.getBoundingClientRect().bottom - window.innerHeight / 2));
    }, destacar: '[data-ag-domain-check]' },
  ],
};
