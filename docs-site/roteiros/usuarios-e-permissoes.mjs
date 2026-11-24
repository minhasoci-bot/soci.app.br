// Roteiro de prints do artigo configuracoes/usuarios-e-permissoes. Cada captura parte da Agência Demo recém-semeada.
export default {
  grupo: 'configuracoes',
  artigo: 'usuarios-e-permissoes',
  subconta: 'Clínica Sorriso Leve',
  rota: '#agency/settings/users',
  passos: [
    { nome: 'equipe', destacar: 'main >> role=button[name="Adicionar usuário"]' },
    { nome: 'dados-e-funcao', acao: async page => {
      await page.locator('main').getByRole('button', { name: 'Adicionar usuário' }).click();
      const d = page.locator('dialog[open]');
      await d.locator('input[name="first"]').fill('Marina');
      await d.locator('input[name="last"]').fill('Lopes');
      await d.locator('input[name="email"]').fill('marina.lopes@agenciademo.exemplo.test');
      await d.locator('select[name="role"]').selectOption('Account User');
    }, destacar: 'dialog[open] select[name="role"] + button, dialog[open] select[name="role"]' },
    { nome: 'acesso-e-modulos', acao: async page => {
      const d = page.locator('dialog[open]');
      await d.getByLabel('Clínica Sorriso Leve').check();
      for (const modulo of ['Conversas', 'Contatos', 'Calendários']) await d.getByLabel(modulo, { exact: true }).check();
      await d.locator('select[name="permissionMode"]').selectOption('restricted');
      await d.getByLabel('Conversas', { exact: true }).scrollIntoViewIfNeeded();
    }, destacar: 'dialog[open]' },
    { nome: 'usuario-criado', acao: async page => {
      await page.locator('dialog[open]').getByRole('button', { name: 'Criar' }).click();
      await page.locator('dialog[open]').waitFor({ state: 'hidden' }).catch(() => {});
    }, espera: 1200, destacar: 'main >> text=Marina Lopes' },
  ],
};
