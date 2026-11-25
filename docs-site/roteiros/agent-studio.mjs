// Roteiro de prints do artigo ia/agent-studio. Cada captura parte da Agência Demo recém-semeada.
export default {
  grupo: 'ia',
  artigo: 'agent-studio',
  subconta: 'Clínica Sorriso Leve',
  rota: '#ai-agents',
  passos: [
    { nome: 'criar-agente', destacar: 'main >> text=Crie seu próprio agente' },
    { nome: 'modelos', acao: page => page.locator('main').getByText('Comece por um caso de uso').scrollIntoViewIfNeeded(),
      destacar: 'main button:has-text("Atendimento ao cliente")' },
    { nome: 'editor-do-agente', acao: page => page.locator('main button:has-text("Atendimento ao cliente")').first().click(), espera: 1800 },
  ],
};
