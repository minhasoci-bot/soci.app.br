// Roteiro de prints do artigo crm/contatos. Rodar com a demo zerada e semeada (ver capturar.mjs).
export default {
  grupo: 'crm',
  artigo: 'contatos',
  subconta: 'Clínica Sorriso Leve',
  rota: '#contacts',
  passos: [
    { nome: 'lista-de-contatos', destacar: 'main >> text=Adicionar contato' },
    { nome: 'novo-contato', acao: async page => {
      await page.locator('main').getByText('Adicionar contato').click();
      const dialogo = page.getByRole('dialog');
      await dialogo.getByLabel('Nome completo').fill('Paula Martins');
      await dialogo.getByLabel('E-mail').fill('paula.martins@exemplo.test');
      await dialogo.getByLabel('Telefone').fill('+55 11 90000-0016');
      await dialogo.getByLabel('Tags (separadas por vírgula)').fill('Avaliação');
    }, destacar: 'role=dialog >> role=button[name="Criar contato"]' },
    { nome: 'ficha-do-contato', acao: async page => {
      await page.getByRole('dialog').getByRole('button', { name: 'Criar contato' }).click();
      await page.waitForTimeout(4500);
      await page.getByRole('button', { name: 'Ana Beatriz Souza' }).click();
    }, destacar: 'role=dialog >> role=button[name="Abrir conversa"]' },
    { nome: 'filtro-por-tag', acao: async page => {
      await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
      await page.getByRole('combobox', { name: 'Filtrar contatos por tag' }).click();
    }, destacar: 'role=combobox[name="Filtrar contatos por tag"]' },
  ],
};
