// Roteiro de prints do artigo pagamentos/links-de-pagamento. Cada captura parte da Agência Demo recém-semeada.
const dialogo = page => page.getByRole('dialog');
const criar = page => dialogo(page).getByRole('button', { name: /^Criar/ });

export default {
  grupo: 'pagamentos',
  artigo: 'links-de-pagamento',
  subconta: 'Clínica Sorriso Leve',
  rota: '#payments/products',
  passos: [
    { nome: 'novo-produto', acao: async page => {
      await page.locator('main').getByRole('button', { name: 'Novo produto' }).click();
      await dialogo(page).getByLabel('Nome do produto').fill('Clareamento dental');
      await dialogo(page).getByLabel('Descrição').fill('Sessão de clareamento a laser no consultório, com avaliação inclusa.');
      await dialogo(page).getByLabel(/^Preço/).fill('350');
    }, destacar: 'role=dialog >> role=button[name=/^Criar/]' },
    { nome: 'novo-link', acao: async page => {
      await criar(page).click();
      await dialogo(page).waitFor({ state: 'hidden' });
      await page.goto(page.url().replace(/#.*$/, '#payments/links'), { waitUntil: 'networkidle' });
      await page.locator('main').getByRole('button', { name: 'Novo link' }).click();
      await dialogo(page).getByLabel('Nome do link').fill('Clareamento no Instagram');
      await dialogo(page).getByLabel('Produto').selectOption({ label: 'Clareamento dental' });
    }, destacar: 'role=dialog >> role=button[name=/^Criar/]' },
    { nome: 'copiar-link', acao: async page => {
      await criar(page).click();
      await dialogo(page).waitFor({ state: 'hidden' });
    }, destacar: 'main [data-copy-path]' },
    { nome: 'pagina-de-pagamento', acao: async page => {
      const caminho = await page.locator('main a[href^="/pagar/"]').first().getAttribute('href');
      await page.goto(new URL(caminho, page.url()).href, { waitUntil: 'networkidle' });
    }, destacar: 'button[type=submit]' },
  ],
};
