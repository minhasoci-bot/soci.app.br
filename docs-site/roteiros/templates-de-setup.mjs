// Roteiro de prints do artigo agencia/templates-de-setup. Cada captura parte da Agência Demo recém-semeada.
const ID = 'template-paisagismo-servicos-externos';
const NOME = 'Jardim Verde Paisagismo';

export default {
  grupo: 'agencia',
  artigo: 'templates-de-setup',
  subconta: 'Clínica Sorriso Leve',
  rota: '#agency/snapshots/templates',
  passos: [
    { nome: 'galeria', acao: async page => { await page.locator(`button.ag-tpl-card[data-id="${ID}"]`).waitFor(); }, destacar: `button.ag-tpl-card[data-id="${ID}"]` },
    { nome: 'detalhes', acao: async page => {
      await page.locator(`button.ag-tpl-card[data-id="${ID}"]`).click();
      await page.locator('dialog[open]').waitFor();
    }, destacar: 'dialog[open] [data-ag="template-account"]' },
    { nome: 'criar-subconta', acao: async page => {
      await page.locator('dialog[open] [data-ag="template-account"]').click();
      await page.locator('dialog[open] input[name="name"]').fill(NOME);
    }, destacar: 'dialog[open]' },
    { nome: 'subconta-criada', acao: async page => {
      await page.locator('dialog[open] button:has-text("Criar subconta")').last().click();
      await page.locator('dialog[open] >> text=Subconta criada com sucesso').waitFor({ timeout: 60000 });
    }, espera: 800, destacar: 'dialog[open] [data-ag="open-account"]' },
    { nome: 'sites-instalados', acao: async page => {
      // A busca roda na página; o nome é filtrado aqui, no Node.
      const { workspaces } = await page.evaluate(() => fetch('/api/workspaces').then(r => r.json()));
      const id = workspaces.find(w => w.name === NOME)?.id;
      await page.goto(new URL(`/app?workspace=${id}#sites/websites`, page.url()).href, { waitUntil: 'networkidle' });
    }, espera: 1500 },
  ],
};
