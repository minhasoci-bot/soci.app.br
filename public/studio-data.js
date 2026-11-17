export const studioTemplates = [
  ['landing','Página de vendas','Apresente um produto, seus benefícios e preços.',['Recursos','Como funciona','Preços']],
  ['dashboard','Painel','Apresente métricas e atividades recentes.',['Visão geral','Atividade recente','Relatórios']],
  ['store','Loja virtual','Crie uma vitrine de produtos com carrinho.',['Coleção','Detalhes do produto','Finalizar compra']],
  ['portfolio','Portfólio','Mostre seu trabalho e apresente-se.',['Trabalhos selecionados','Sobre','Contato']],
  ['blog','Blog / CMS','Organize artigos e categorias.',['Últimos artigos','Tópicos','Arquivo']],
  ['todo','Gerenciador de tarefas','Organize o trabalho em um quadro de tarefas.',['A fazer','Em andamento','Concluído']],
  ['chat','Aplicativo de mensagens','Monte uma lista de conversas com caixa de entrada.',['Conversas','Mensagens','Nova mensagem']],
  ['restaurant','Restaurante e pedidos','Exiba um cardápio com resumo do pedido.',['Cardápio','Pratos populares','Seu pedido']],
  ['fitness','Acompanhamento de treinos','Registre treinos e acompanhe o progresso.',['Registro de treinos','Exercícios','Progresso']],
  ['social','Rede social','Monte um feed com perfil e atividades.',['Feed','Descobrir','Perfil']],
  ['calendar','Calendário e agendamentos','Mostre horários disponíveis e eventos agendados.',['Calendário','Disponibilidade','Próximos eventos']],
  ['weather','Previsão do tempo','Exiba a previsão com busca por localidade.',['Condições atuais','Previsão de 7 dias','Localidades']]
];
export const studioModelos = studioTemplates;
export const studioThemes = ['indigo','forest','amber','rose'];

export function starterProject(brief, idea) {
  const template = studioTemplates.find(item => item[0] === idea) || studioTemplates[0];
  const name = brief.split(/\r?\n|[.!?]\s/,1)[0].trim().slice(0,80) || template[1];
  return { name, headline:name, summary:brief.slice(0,1000), template:template[0], theme:'indigo',
    blocks:template[3].map(title => ({ title, body:'' })) };
}
