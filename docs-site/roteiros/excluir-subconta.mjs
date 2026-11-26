// Roteiro de prints do artigo agencia/excluir-subconta. Cada captura parte da Agência Demo recém-semeada.
const alvo = 'Academia Pulso Forte';
const cartao = `main article.ag-account:has(h2:text-is("${alvo}"))`;
export default {
  grupo: 'agencia',
  artigo: 'excluir-subconta',
  subconta: 'Clínica Sorriso Leve',
  rota: '#agency/accounts',
  passos: [
    { nome: 'botao-excluir', destacar: `${cartao} >> role=button[name="Excluir"]` },
    { nome: 'confirmar-pelo-nome', acao: async page => {
      await page.locator(cartao).getByRole('button', { name: 'Excluir' }).click();
      await page.locator('dialog[open] input[name="confirm"]').fill(alvo);
    }, destacar: 'dialog[open]' },
    { nome: 'lixeira', acao: async page => {
      await page.locator('dialog[open]').getByRole('button', { name: 'Excluir subconta' }).click();
      await page.locator('.ag-trash').waitFor();
      await page.locator('.ag-trash').scrollIntoViewIfNeeded();
    }, destacar: '.ag-trash' },
    { nome: 'restaurar', acao: page => page.locator('.ag-trash').getByRole('button', { name: 'Restaurar' }).click(),
      destacar: 'dialog[open]' },
  ],
};
