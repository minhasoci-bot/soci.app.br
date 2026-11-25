// Roteiro de prints do artigo ia/base-de-conhecimento. Cada captura parte da Agência Demo recém-semeada.
const TEXTO = `A avaliação completa custa R$ 150 e dura 60 minutos.
O clareamento é feito em duas sessões de 50 minutos, com intervalo de 7 dias.
Atendemos de segunda a sexta, das 9h às 18h, e aos sábados, das 9h às 13h.
Aceitamos Pix e cartão de crédito em até 6 vezes.`;

export default {
  grupo: 'ia',
  artigo: 'base-de-conhecimento',
  subconta: 'Clínica Sorriso Leve',
  rota: '#ai-agents/knowledge',
  passos: [
    { nome: 'bases', destacar: 'main >> text="Nova base" >> nth=0' },
    { nome: 'nome-da-base', acao: async page => {
      await page.locator('main').getByText('Nova base', { exact: true }).first().click();
      await page.locator('main input[name="name"]').fill('Atendimento da clínica');
      await page.locator('main textarea[name="description"]').fill('Preços, horários e formas de pagamento da Clínica Sorriso Leve.');
    }, destacar: 'main input[name="name"]' },
    { nome: 'adicionar-fonte', acao: async page => {
      await page.locator('main').getByText('Adicionar fonte', { exact: true }).click();
      await page.locator('main input[name="title"]').fill('Preços, horários e pagamento');
      await page.locator('main textarea[name="text"]').fill(TEXTO);
    }, destacar: 'main textarea[name="text"]' },
    { nome: 'testar-a-busca', acao: async page => {
      await page.locator('main').getByText('Salvar base', { exact: true }).click();
      await page.waitForTimeout(800);
      await page.locator('main input[name="q"]').fill('Quanto custa a avaliação?');
      await page.locator('main').getByText('Buscar', { exact: true }).click();
      await page.waitForTimeout(800);
      // A tela rola dentro do main, não na janela: leva a busca para o topo para mostrar os trechos.
      await page.locator('main input[name="q"]').evaluate(no => no.scrollIntoView({ block: 'start' }));
    }, espera: 1200, destacar: 'main input[name="q"]' },
  ],
};
