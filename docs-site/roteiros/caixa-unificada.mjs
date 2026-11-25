// Roteiro de prints do artigo conversas/caixa-unificada. Nada é enviado: a mensagem só é escrita.
export default {
  grupo: 'conversas',
  artigo: 'caixa-unificada',
  subconta: 'Clínica Sorriso Leve',
  rota: '#conversations',
  passos: [
    { nome: 'caixa-da-equipe', destacar: 'main button:has-text("Ana Beatriz Souza")' },
    { nome: 'abrir-conversa', acao: page => page.locator('main button:has-text("Ana Beatriz Souza")').first().click(),
      destacar: '.thread-header' },
    { nome: 'responder', acao: async page => {
      const form = page.locator('form.message-compose');
      await form.locator('select[name="channel"]').selectOption('WhatsApp');
      await form.locator('select[name="direction"]').selectOption('Outbound');
      await form.locator('textarea[name="body"]').fill('Oi, Ana! A avaliação completa custa R$ 150 e pode ser agendada para esta semana. Qual dia fica melhor para você?');
    }, destacar: 'form.message-compose' },
    { nome: 'atribuir', destacar: '.thread-assign' },
  ],
};
