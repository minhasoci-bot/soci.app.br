// Roteiro de prints do artigo crm/acoes-em-massa. Cada captura parte da Agência Demo recém-semeada.
const ESCOLHIDOS = ['Bruno Carvalho', 'Eduarda Nunes', 'Henrique Teixeira'];

export default {
  grupo: 'crm',
  artigo: 'acoes-em-massa',
  subconta: 'Clínica Sorriso Leve',
  rota: '#contacts',
  passos: [
    { nome: 'selecionar-contatos', acao: async page => {
      for (const nome of ESCOLHIDOS) await page.getByLabel(`Selecionar ${nome}`, { exact: true }).check();
    }, destacar: '.crm-bulk' },
    { nome: 'escolher-acao', acao: async page => {
      await page.locator('.crm-bulk button[aria-label="Ação"]').click();
    }, destacar: '.crm-bulk' },
    { nome: 'aplicar', acao: async page => {
      await page.keyboard.press('Escape');
      await page.locator('.crm-bulk select').selectOption('add-tag');
      await page.locator('.crm-bulk').getByLabel('Tag').fill('Campanha de inverno');
    }, destacar: '.crm-bulk >> role=button[name="Aplicar"]' },
    { nome: 'historico', acao: async page => {
      await page.locator('.crm-bulk').getByRole('button', { name: 'Aplicar' }).click();
      await page.waitForTimeout(800);
      await page.getByRole('tab', { name: 'Ações em massa' }).click();
    } },
  ],
};
