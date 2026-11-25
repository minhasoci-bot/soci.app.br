// Roteiro de prints do artigo agencia/setups-de-conta. Cada captura parte da Agência Demo recém-semeada.
export default {
  grupo: 'agencia',
  artigo: 'setups-de-conta',
  subconta: 'Clínica Sorriso Leve',
  rota: '#agency/snapshots',
  passos: [
    { nome: 'meus-setups', destacar: 'main >> role=button[name="Criar setup"] >> nth=0' },
    { nome: 'criar-setup', acao: async page => {
      await page.locator('main').getByRole('button', { name: 'Criar setup' }).first().click();
      const d = page.locator('dialog[open]');
      await d.locator('input[name="name"]').fill('Clínica odontológica');
      await d.locator('select[name="workspace"]').selectOption({ label: 'Clínica Sorriso Leve' });
    }, destacar: 'dialog[open]' },
    { nome: 'setup-criado', acao: async page => {
      await page.locator('dialog[open]').getByRole('button', { name: 'Criar setup' }).click();
      await page.locator('dialog[open]').waitFor({ state: 'hidden' }).catch(() => {});
    }, espera: 1200, destacar: 'main >> text=Clínica odontológica' },
    { nome: 'usar-na-subconta-nova', acao: async page => {
      await page.goto(page.url().replace(/#.*$/, '#agency/accounts'));
      await page.locator('main').getByRole('button', { name: 'Criar subconta' }).click();
      await page.locator('dialog[open] select[name="snapshotId"] + button').click();
    }, destacar: 'dialog[open] select[name="snapshotId"] + button' },
  ],
};
