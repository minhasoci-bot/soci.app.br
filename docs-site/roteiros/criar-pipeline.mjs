// Roteiro de prints do artigo crm/criar-pipeline. Rodar com a demo zerada e semeada (ver capturar.mjs).
const PIPELINE = 'Locação';

export default {
  grupo: 'crm',
  artigo: 'criar-pipeline',
  subconta: 'Imobiliária Horizonte',
  rota: '#opportunities',
  passos: [
    { nome: 'quadro-de-oportunidades', destacar: 'role=tab[name="Pipelines"]' },
    { nome: 'lista-de-pipelines', acao: page => page.getByRole('tab', { name: 'Pipelines' }).click(),
      destacar: 'main >> role=button[name="Criar pipeline"]' },
    { nome: 'nome-do-pipeline', acao: async page => {
      await page.locator('main').getByRole('button', { name: 'Criar pipeline' }).first().click();
      await page.getByRole('dialog').getByRole('textbox').fill(PIPELINE);
    }, destacar: 'role=dialog >> role=textbox' },
    { nome: 'etapas-do-pipeline', acao: async page => {
      await page.getByRole('dialog').getByRole('button', { name: 'Criar pipeline' }).click();
      await page.getByRole('button', { name: `Editar ${PIPELINE}` }).click();
    }, destacar: 'role=button[name="Adicionar etapa"]' },
  ],
};
