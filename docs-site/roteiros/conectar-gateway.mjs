// Roteiro de prints do artigo pagamentos/conectar-gateway. Nenhuma chave é usada: o print mostra o campo vazio.
export default {
  grupo: 'pagamentos',
  artigo: 'conectar-gateway',
  subconta: 'Clínica Sorriso Leve',
  rota: '#payments',
  passos: [
    { nome: 'aviso-nos-pagamentos', destacar: 'main >> text=Conectar AbacatePay' },
    { nome: 'chave-de-api', acao: page => page.locator('main').getByText('Conectar AbacatePay').first().click(),
      destacar: 'main form:has(input[type="password"]), main form:has-text("Chave de API v2")' },
  ],
};
