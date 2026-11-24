// Roteiro de prints do artigo pagamentos/fatura. Cada captura parte da Agência Demo recém-semeada.
const vencimento = () => { const d = new Date(Date.now() + 7 * 864e5); return d.toISOString().slice(0, 10); };

export default {
  grupo: 'pagamentos',
  artigo: 'fatura',
  subconta: 'Clínica Sorriso Leve',
  rota: '#payments',
  passos: [
    { nome: 'faturas', destacar: 'main >> role=button[name="Nova fatura"]' },
    { nome: 'nova-fatura', acao: async page => {
      await page.locator('main').getByRole('button', { name: 'Nova fatura' }).click();
      const d = page.locator('dialog[open]');
      await d.locator('input[name="title"]').fill('Avaliação completa');
      await d.locator('select[name="contactId"]').selectOption({ label: 'Ana Beatriz Souza' });
      await d.locator('input[name="value"]').fill('150');
      await d.locator('input[name="due"]').fill(vencimento());
    }, destacar: 'dialog[open]' },
    { nome: 'fatura-criada', acao: async page => {
      await page.locator('dialog[open]').getByRole('button', { name: 'Criar fatura' }).click();
      await page.locator('dialog[open]').waitFor({ state: 'hidden' }).catch(() => {});
    }, espera: 1200, destacar: 'main tr:has-text("Avaliação completa")' },
  ],
};
