// Roteiro de prints do artigo automacoes/primeiro-workflow. Cada captura parte da Agência Demo recém-semeada.
// O modal de receitas não entra nos prints: vamos direto para "Iniciar do zero".
const opcao = (page, texto) => page.locator('.wf-picker-option').filter({ hasText: new RegExp(`^\\s*${texto}\\s*$`) }).first();

export default {
  grupo: 'automacoes',
  artigo: 'primeiro-workflow',
  subconta: 'Clínica Sorriso Leve',
  rota: '#automation',
  passos: [
    { nome: 'lista-de-fluxos', destacar: 'main >> text=Criar fluxo de trabalho' },
    { nome: 'nome-do-fluxo', acao: async page => {
      await page.locator('main').getByText('Criar fluxo de trabalho').click();
      await page.getByText('Iniciar do zero').click();
      await page.locator('main input[name="name"]').fill('Boas-vindas: ligar para o novo contato');
    }, destacar: 'main >> text=Adicionar gatilho' },
    { nome: 'escolher-gatilho', acao: async page => {
      await page.locator('main').getByText('Adicionar gatilho').first().click();
      await page.locator('.wf-picker input').first().fill('Contato criado');
    }, destacar: '.wf-picker-option:has-text("Contato criado")' },
    { nome: 'escolher-acao', acao: async page => {
      await opcao(page, 'Contato criado').click();
      await page.locator('.wf-inspector').getByRole('button', { name: 'Fechar configuração' }).click();
      await page.locator('main button.wf-dock-add').click();
      await page.locator('.wf-picker input').first().fill('tarefa');
    }, destacar: '.wf-picker-option:has-text("Criar tarefa")' },
    { nome: 'configurar-acao', acao: async page => {
      await opcao(page, 'Criar tarefa').click();
      const painel = page.locator('.wf-inspector');
      await painel.getByLabel('Título').fill('Ligar para {{contact.first_name}}');
      await painel.getByLabel('Prazo em dias').fill('1');
    }, destacar: '.wf-inspector' },
    { nome: 'publicar', acao: page => page.locator('.wf-inspector').getByRole('button', { name: 'Fechar configuração' }).click(),
      destacar: 'role=button[name="Publicar"]' },
  ],
};
