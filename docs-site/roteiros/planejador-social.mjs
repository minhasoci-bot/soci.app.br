// Roteiro de prints do artigo marketing/planejador-social. Sem redes conectadas: o post fica como rascunho.
export default {
  grupo: 'marketing',
  artigo: 'planejador-social',
  subconta: 'Clínica Sorriso Leve',
  rota: '#marketing',
  passos: [
    { nome: 'conectar-redes', destacar: 'main >> text=Conecte suas redes sociais' },
    { nome: 'novo-post', acao: async page => {
      await page.locator('main button:has-text("Novo post")').first().click();
      await page.locator('dialog[open] textarea[name="summary"]').fill('Sexta é dia de sorrir! Agende sua avaliação completa e saia com o plano de tratamento na mão. Link na bio.');
    }, destacar: 'dialog[open] textarea[name="summary"]' },
    { nome: 'quando-publicar', acao: async page => {
      const d = page.locator('dialog[open]');
      await d.locator('input[name="mode"]').nth(1).check({ force: true });
      await d.locator('input[name="needsApproval"]').check({ force: true });
      await d.locator('input[name="needsApproval"]').scrollIntoViewIfNeeded();
    }, destacar: 'dialog[open] label:has(input[name="needsApproval"])' },
    { nome: 'lista-de-posts', acao: async page => {
      await page.locator('dialog[open] input[name="mode"]').nth(2).check({ force: true });
      await page.locator('dialog[open] button:has-text("Salvar rascunho")').click();
      await page.locator('dialog[open]').waitFor({ state: 'hidden' }).catch(() => {});
      await page.locator('main [role=tab]:has-text("Lista")').click();
    }, espera: 1500 },
  ],
};
