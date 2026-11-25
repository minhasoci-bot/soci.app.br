// Roteiro de prints do artigo agencia/plano-nao-pago.
const form = 'main form[data-ag-form="saas-suspension"]';

export default {
  grupo: 'agencia',
  artigo: 'plano-nao-pago',
  subconta: 'Clínica Sorriso Leve',
  rota: '#agency/saas',
  passos: [
    { nome: 'plano-nao-pago', acao: async page => {
      await page.locator('main').getByRole('button', { name: 'Ativar o modo SaaS' }).click();
      await page.locator(form).waitFor();
      await page.locator(form).scrollIntoViewIfNeeded();
    }, destacar: form },
    { nome: 'ligar-e-salvar', acao: async page => {
      await page.locator(`${form} input[name="enabled"]`).check();
      await page.locator(`${form} input[name="maxRetry"]`).fill('4');
      await page.locator(`${form} input[name="retryEvery"]`).fill('2');
      await page.locator(`${form} button.primary`).scrollIntoViewIfNeeded();
    }, destacar: `${form} button.primary` },
  ],
};
