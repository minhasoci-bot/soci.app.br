// Roteiro de prints do artigo sites/criar-site. Cada captura parte da Agência Demo recém-semeada.
export default {
  grupo: 'sites',
  artigo: 'criar-site',
  subconta: 'Imobiliária Horizonte',
  rota: '#sites/websites',
  passos: [
    { nome: 'sites', destacar: 'main button:has-text("Começar em branco")' },
    { nome: 'escolher-modelo', acao: async page => {
      await page.locator('main button:has-text("Começar em branco")').first().click();
      const d = page.locator('dialog[open]');
      await d.locator('input[name="mode"]').nth(2).check({ force: true });
      await d.locator('input[name="siteTemplate"][value="corretora"]').check({ force: true });
      const nome = d.locator('input[name="starterName"]');
      await (await nome.isVisible() ? nome : d.locator('input[name="name"]')).fill('Site da Imobiliária Horizonte');
    }, destacar: 'dialog[open] label:has(input[value="corretora"])' },
    { nome: 'paginas-do-site', acao: async page => {
      await page.locator('dialog[open] button:has-text("Criar site")').click();
      await page.waitForURL(/#sites\/funnel\//);
    }, espera: 1500, destacar: 'main >> text=Abrir editor' },
    { nome: 'publicar', destacar: 'main >> text="Publicar"' },
  ],
};
