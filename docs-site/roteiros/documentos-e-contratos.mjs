// Roteiro de prints do artigo pagamentos/documentos-e-contratos. Nada é enviado ao cliente.
export default {
  grupo: 'pagamentos',
  artigo: 'documentos-e-contratos',
  subconta: 'Clínica Sorriso Leve',
  rota: '#payments/documents',
  passos: [
    { nome: 'documentos', destacar: 'main button:has-text("Novo documento")' },
    { nome: 'novo-documento', acao: async page => {
      await page.locator('main button:has-text("Novo documento")').last().click();
      const d = page.locator('dialog[open]');
      await d.locator('input[name="title"]').fill('Contrato de tratamento - Ana Beatriz Souza');
      await d.locator('select[name="kind"]').selectOption({ label: 'Contrato' });
      await d.locator('select[name="contactId"]').selectOption({ label: 'Ana Beatriz Souza' });
      await d.locator('input[name="template"]').nth(2).check({ force: true });
    }, destacar: 'dialog[open]' },
    { nome: 'editor-do-documento', acao: async page => {
      await page.locator('dialog[open] button:has-text("Criar documento")').click();
      await page.locator('dialog[open]').waitFor({ state: 'hidden' }).catch(() => {});
    }, espera: 2000 },
  ],
};
