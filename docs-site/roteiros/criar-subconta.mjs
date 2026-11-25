// Roteiro de prints do artigo agencia/criar-subconta. Cada captura parte da Agência Demo recém-semeada.
export default {
  grupo: 'agencia',
  artigo: 'criar-subconta',
  subconta: 'Clínica Sorriso Leve',
  rota: '#agency/accounts',
  passos: [
    { nome: 'lista-de-subcontas', destacar: 'main >> role=button[name="Criar subconta"]' },
    { nome: 'dados-da-subconta', acao: async page => {
      await page.locator('main').getByRole('button', { name: 'Criar subconta' }).click();
      const d = page.locator('dialog[open]');
      await d.locator('input[name="name"]').fill('Pet Shop Amigo Fiel');
      await d.locator('input[name="email"]').fill('contato@amigofiel.exemplo.test');
      await d.locator('input[type="tel"]').fill('11 4000-1234');
      await d.locator('input[name="address"]').fill('Rua das Flores, 120, São Paulo, SP');
    }, destacar: 'dialog[open]' },
    { nome: 'setup-inicial', acao: page => page.locator('dialog[open] select[name="snapshotId"] + button').click(),
      destacar: 'dialog[open] select[name="snapshotId"] + button' },
    { nome: 'subconta-criada', acao: async page => {
      await page.locator('dialog[open] select[name="snapshotId"] + button').click();
      await page.locator('dialog[open]').getByRole('button', { name: 'Criar subconta' }).click();
      await page.getByText('Subconta criada com sucesso').waitFor();
    }, destacar: 'dialog[open] >> text=Acessar subconta agora' },
    { nome: 'launchpad-da-subconta', acao: page => page.locator('dialog[open]').getByText('Acessar subconta agora').click(), espera: 2000 },
  ],
};
