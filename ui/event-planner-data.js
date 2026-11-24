export const eventPlanPhases = [
  ['captura', 'Captação'], ['aquecimento', 'Aquecimento'], ['evento', 'Evento'], ['vendas', 'Vendas'], ['pos', 'Pós-evento']
];
export const eventPlanTeams = [
  ['estrategia', 'Estratégia'], ['comercial', 'Comercial'], ['design', 'Design'], ['copy', 'Copy'], ['video', 'Vídeo'], ['dev', 'Tecnologia']
];
export const eventPlanStatuses = [
  ['planejado', 'Planejado'], ['em_andamento', 'Em andamento'], ['concluido', 'Concluído'], ['arquivado', 'Arquivado']
];
export const itemKinds = [
  ['task', 'Tarefa'], ['message', 'Comunicação'], ['agenda', 'Roteiro'], ['link', 'Link']
];
export const itemStatus = {
  task: [['pendente', 'Pendente'], ['andamento', 'Em andamento'], ['feito', 'Concluído']],
  message: [['rascunho', 'Rascunho'], ['revisao', 'Em revisão'], ['pronto', 'Pronto para enviar'], ['agendado', 'Agendado'], ['enviado', 'Enviado'], ['cancelado', 'Cancelado']],
  agenda: [['planejado', 'Planejado'], ['confirmado', 'Confirmado'], ['feito', 'Concluído']],
  link: [['pendente', 'Pendente'], ['pronto', 'Validado']]
};
export const channels = [['grupos', 'WhatsApp · grupos'], ['privado', 'WhatsApp · privado'], ['instagram', 'Instagram'], ['email', 'E-mail'], ['outro', 'Outro']];

// Estratégia em três blocos, cada um editado separadamente (como no planejador do Parceiras Conselho).
export const briefGroups = [
  ['direction', 'Objetivo e público', [
    ['goal', 'Objetivo e indicadores de sucesso', 'Qual resultado este evento deve gerar e como vamos medir?'],
    ['audience', 'Público e lista VIP', 'Quem precisa participar, por quê e por qual canal?']
  ]],
  ['communication', 'Mensagem e oferta', [
    ['narrative', 'Narrativa, tese e mensagens aprovadas', 'Qual ideia central dá unidade à campanha?'],
    ['offer', 'Oferta, entregáveis e bônus', 'O que será apresentado, por quanto e com quais condições?']
  ]],
  ['operation', 'Operação e pós-evento', [
    ['logistics', 'Formato, local ou plataforma', 'Formato, horário, fuso, local ou plataforma.'],
    ['identity', 'Identidade visual e materiais', 'Referências visuais, páginas, peças, slides e vídeos.'],
    ['followup', 'Regras de venda e pós-evento', 'Prazos, replay, condições de venda e acompanhamento.']
  ]]
];
export const briefFields = briefGroups.flatMap(([, , fields]) => fields);

const localDate = date => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
};
export function addDays(value, amount) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return localDate(date);
}
const dateLabel = value => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`)) : '';
const uuid = () => crypto.randomUUID();
export function blankEventPlan() {
  return { brief: Object.fromEntries(briefFields.map(([key]) => [key, ''])), items: [] };
}

const lines = (...parts) => parts.join('\n\n');
const groupMessages = [
  ['Convite inicial', 'captura', -9, '18:00', lines(
    '## Mensagem 1 · Provocação',
    'O que muda no seu dia a dia quando [mudança do mercado] vira rotina? Quem só entrega [o que o mercado já compara por preço] passa a ser comparado por preço e velocidade. Quem assume o diagnóstico e orienta a decisão ganha outro motivo para ser escolhido.',
    '## Mensagem 2 · Convite',
    'No dia [data do evento], às [hora do evento], vou mostrar ao vivo em [evento] como se posicionar para [resultado]. Reserve o horário para acompanhar.',
    '## Mensagem 3 · Benefícios do grupo VIP',
    'Entrando no grupo, você recebe:',
    '- Acesso à aula ao vivo\n- [material VIP 1]\n- [material VIP 2]\n- [material complementar]\n- Informações sobre [condição da campanha]',
    'O acesso à sala será enviado pelo grupo: [link do grupo VIP].')],
  ['Do básico à estratégia', 'captura', -8, '12:00', lines(
    '## Mensagem 1 · Pergunta e diagnóstico',
    'Quando o seu público só enxerga [o que você entrega hoje], o que impede que ele troque você por uma alternativa mais barata? Quem consegue diagnosticar o problema, escolher um caminho e mostrar o resultado passa a disputar outro tipo de oportunidade.',
    '## Mensagem 2 · Convite',
    'Em [evento], vou mostrar como fazer essa passagem na prática. Reserve [data do evento], às [hora do evento]. No grupo VIP você recebe [materiais VIP] e o acesso à aula: [link do grupo VIP].')],
  ['Quando o pedido é só o básico', 'captura', -7, '12:00', lines(
    '[Situação comum do seu público]. O que você faria primeiro?',
    '- A) [Resposta automática, que resolve só o pedido].\n- B) [Resposta estratégica, que pergunta o objetivo e propõe o caminho].',
    'Daqui a uma semana vou mostrar como transformar essa segunda resposta em [resultado que o público valoriza].',
    'Quer participar? Entre no grupo: [link do grupo VIP].')],
  ['Volume ou valor', 'captura', -6, '12:00', lines(
    'Compare dois jeitos de fechar o mês:',
    '- Atender muita gente e passar a semana resolvendo pedidos pequenos.\n- Conduzir poucos projetos, com escopo e impacto claros.',
    'Os dois podem chegar ao mesmo faturamento. O que muda é aquilo pelo qual as pessoas pagam.',
    'No dia [data do evento], vou mostrar como identificar o que sustenta o preço que você quer cobrar. Entre no grupo: [link do grupo VIP].')],
  ['Bastidores dos materiais', 'captura', -5, '12:00', lines(
    'Estou preparando [material VIP] e encontrei [oportunidade ou exemplo] que vale mostrar. É um jeito de enxergar [problema ou mercado] que pode mudar suas próximas escolhas.',
    'Vou explicar o exemplo em [evento]. O material e o acesso à aula serão enviados pelo grupo: [link do grupo VIP].')],
  ['Quando estudar mais já não resolve', 'captura', -3, '12:00', lines(
    '## Mensagem 1 · O que está travando',
    'Quantas aulas você já salvou sobre [tema]? Agora olha para a sua rotina. O que continua igual apesar de tudo o que já estudou? Talvez falte escolher qual decisão tomar primeiro.',
    '## Mensagem 2 · O encontro',
    'Em [evento] vou propor um ponto de partida e mostrar como usar [material VIP]. Reserve [data do evento], às [hora do evento]. Entre no grupo para receber os materiais e o acesso: [link do grupo VIP].')],
  ['Quando o escopo vira uma lista sem fim', 'captura', -2, '12:00', lines(
    'Começou com [escopo inicial]. O que entrou depois?',
    '- [Demanda extra 1]\n- [Demanda extra 2]\n- [Demanda extra 3]',
    'O escopo cresceu e o valor continuou igual. Daqui a dois dias, vou mostrar como revisar esse acordo e conversar sobre limites.',
    'Entre no grupo para receber o acesso: [link do grupo VIP].')],
  ['Amanhã é o evento', 'captura', -1, '12:00', lines(
    '## É amanhã',
    'Às [hora do evento], vamos trabalhar [tema] ao vivo. Confirme se você já está no grupo e reserve o horário.',
    '- O acesso à sala chega pelo grupo.\n- Os participantes recebem [materiais VIP].\n- Confira [regra sobre gravação ou replay].',
    'Se ainda não entrou: [link do grupo VIP].')],
  ['Inscrições no dia do evento', 'captura', 0, '12:00', lines(
    '## Mensagem 1 · É hoje',
    'Hoje, às [hora do evento], vou abrir [caso real] e mostrar como aplicar [aprendizado]. No fim, vou apresentar [novidade da campanha].',
    '## Mensagem 2 · Acesso e materiais',
    'Separei [materiais VIP] para quem acompanhar. O link da sala chega pelo grupo. Se você ainda não entrou, vem por aqui: [link do grupo VIP].')],
  ['Última chamada para inscrições', 'captura', 0, '18:00', lines(
    '## Última chamada',
    'A aula começa às [hora do evento]. Vou mostrar como [resultado]. Se você quer acompanhar ao vivo, entre agora no grupo para receber o acesso: [link do grupo VIP].')],
  ['Boas-vindas e enquete do grupo VIP', 'aquecimento', -3, '12:00', lines(
    'Que bom ter você no grupo de [evento]! Reserve [data do evento], às [hora do evento]. Quero conhecer quem vai estar na aula.',
    '## Enquete · Em que momento você está?',
    '- Começando agora\n- Já pratico por conta própria\n- Coordeno uma equipe\n- Estou vindo de outra área')],
  ['Faltam dois dias', 'aquecimento', -2, '12:00', 'Daqui a dois dias a gente se encontra! Estou terminando [material VIP] e separei [exemplo] para mostrar na aula. Bloqueie o horário de [hora do evento] e traga uma pergunta sobre [tema].'],
  ['Lembrete da véspera', 'aquecimento', -1, '12:00', lines(
    'Amanhã, às [hora do evento], a gente vai trabalhar [promessa do evento].',
    '- Separe um caderno.\n- Coloque um lembrete antes do início.\n- Ative as notificações do grupo para receber o acesso.',
    'Sobre a gravação: [regra de replay].')],
  ['Áudio e mensagem no dia do evento', 'evento', 0, '12:00', lines(
    '## Roteiro do áudio',
    'Oi, pessoal! Estou fechando os detalhes da aula de hoje. Separei um exemplo de [mudança que você testou] e vou mostrar como usar isso para [resultado]. Venham com uma pergunta e espaço para anotar. A gente se encontra às [hora do evento].',
    '## Mensagem depois do áudio',
    'Hoje tem aula! Aqui está o que deixar pronto:',
    '- Bloqueie o horário de [hora do evento].\n- Separe o material para anotar.\n- Acompanhe o grupo para receber o acesso.')],
  ['Faltam algumas horas', 'evento', 0, '16:00', lines(
    'Faltam algumas horas. Já deixou tudo pronto para a aula?',
    '- Horário reservado\n- Material para anotar à mão\n- Notificações do grupo ligadas',
    'Às [hora do evento], mando por aqui o acesso para você acompanhar [atividade da aula].')],
  ['Bastidores e aviso de 30 minutos', 'evento', 0, '19:30', lines(
    '## Orientação para o vídeo',
    'Mostre o ambiente, a preparação da equipe e [material VIP].',
    '## Texto para acompanhar o vídeo',
    'A equipe já está pronta. Em 30 minutos começamos [evento]. Separei [o que será apresentado] para mostrar na aula. Te vejo na sala!')],
  ['Sala aberta', 'evento', 0, '19:55', 'Pode entrar, a sala está aberta: [link da transmissão]. Chegue agora para acompanhar a primeira parte e mande um oi no chat.'],
  ['Transmissão ao vivo', 'evento', 0, '20:05', 'A aula já começou. Estamos falando de [tópico em andamento] e ainda dá para pegar o exemplo completo. Entre aqui: [link da transmissão].'],
  ['Convite para entrar durante a live', 'evento', 0, '20:20', 'Ainda estamos ao vivo e a próxima parte mostra [demonstração ou próximo bloco]. Se você se atrasou, entre agora para acompanhar: [link da transmissão].'],
  ['Oferta e abertura das vendas', 'vendas', 0, '21:00', lines(
    '## Mensagem 1 · Abertura, público e objetivo',
    'As inscrições para [oferta] estão abertas. É para quem [perfil] e quer chegar a [resultado aprovado].',
    '## Mensagem 2 · Entregáveis',
    '- [entregável 1 e resultado]\n- [entregável 2 e resultado]\n- [entregável 3 e resultado]',
    '## Mensagem 3 · Bônus, garantia e chamada',
    '- [bônus 1 e condição]\n- [bônus 2 e condição]',
    'A garantia funciona assim: [condições da garantia]. Temos [vagas disponíveis]. Para conversar sobre a sua entrada, me chama no privado.')],
  ['Bônus e garantia', 'vendas', 0, '22:30', lines(
    'Dois pontos da oferta que valem revisar antes de decidir:',
    '- Garantia: [garantia e critérios].\n- Condição de entrada e benefício à vista: [o que pode ser mencionado no grupo].',
    'Quer entender as condições para o seu caso? Me chama no privado.')],
  ['Enquete sobre matrícula', 'vendas', 1, '12:00', lines(
    '## Enquete · Em que ponto você está com [oferta]?',
    '- Já confirmei minha vaga\n- Ainda estou decidindo\n- Quero entender a condição de entrada\n- Tenho uma dúvida sobre o programa',
    'Se precisar de ajuda, me manda uma mensagem no privado.')],
  ['Opções de pagamento', 'vendas', 1, '15:00', 'Se o cartão está travando sua decisão, vale conversar sobre [alternativa de pagamento aprovada]. Posso explicar como funciona a entrada, quando vence o saldo e quais são os critérios. Me chama no privado.'],
  ['Replay e próximo passo', 'pos', 1, '18:00', lines(
    'Se o replay for autorizado, confirme o prazo antes de enviar.',
    'A gravação de [evento] fica disponível até [prazo do replay]. Assista aqui: [link do replay].',
    'Se quiser conversar sobre [oferta] depois de assistir, me chama no privado.')],
  ['Vagas restantes e prioridade à vista', 'vendas', 2, '12:00', 'Agora restam [vagas disponíveis] para [oferta]. Para quem escolher o pagamento à vista, [prioridade ou benefício aprovado]. Se quiser saber como entrar e quando começa, me chama no privado.'],
  ['Lembrete de condição de pagamento', 'vendas', 4, '12:00', 'O prazo para entrar em [oferta] é [data e hora do encerramento]. Se sua dúvida é como pagar, ainda dá para conversar sobre [alternativa aprovada]. Me chama no privado que eu te explico.'],
  ['Últimas horas para entrar', 'vendas', 4, '18:00', 'As inscrições de [oferta] fecham às [hora do encerramento]. Se você quer chegar a [resultado aprovado] e ainda precisa esclarecer algo para decidir, me chama no privado até esse horário.']
];
const privateMessages = [
  ['Reativar contato', 'captura', -7, '', lines(
    'Oi, {{contact.first_name}}! Você tinha me contado que queria [interesse anterior]. Lembrei disso ao preparar [evento]. Vou mostrar [aprendizado] ao vivo no dia [data do evento], às [hora do evento].',
    'No grupo você recebe:',
    '- Acesso à aula\n- [material VIP 1]\n- [material VIP 2]\n- Informações sobre [condição da campanha]',
    'Aqui está o grupo: [link do grupo VIP]. Você consegue participar?')],
  ['Apresentar os materiais VIP', 'captura', -3, '', lines(
    'Oi, {{contact.first_name}}! Separei alguns materiais para usar na aula de [evento]:',
    '- [material 1] para [objetivo]\n- [material 2] para explorar [oportunidade]\n- [material complementar]\n- [benefício reservado para o grupo]',
    'Se quiser receber os materiais e o acesso à aula, entre aqui: [link do grupo VIP].')],
  ['Última chamada no privado', 'captura', 0, '', 'Oi, {{contact.first_name}}, nosso encontro é hoje às [hora do evento]. Vou enviar o acesso à sala pelo grupo. Se você ainda estiver de fora, pode entrar aqui: [link do grupo VIP]. Te vejo na aula?'],
  ['Abertura e condições de pagamento', 'vendas', 0, '22:00', 'Oi, {{contact.first_name}}! Você chegou a ver a aula? Abri as vagas para [oferta] e lembrei do que você falou sobre [objetivo]. Temos [condição aprovada] para quem precisa de outra forma de pagamento. Quer que eu te explique como funciona?'],
  ['Enviar replay', 'pos', 1, '15:00', lines(
    'Use se o replay estiver disponível.',
    'Oi, {{contact.first_name}}! A gravação de ontem fica disponível até [prazo]: [link do replay]. Tem uma parte sobre [tema do interesse da pessoa] em [minutagem]. Se assistir, me conta o que quer testar primeiro.')],
  ['Ajudar com pagamento pendente', 'vendas', 4, '12:00', 'Oi, {{contact.first_name}}! Como ficaram suas dúvidas sobre [oferta]? As vagas estão perto de fechar e ainda posso te orientar sobre [forma de pagamento aprovada]. Me responde por aqui se quiser que eu veja o seu caso.'],
  ['Último contato sobre a turma', 'pos', 11, '12:00', 'Oi, {{contact.first_name}}! Estou encerrando as conversas desta turma hoje. Se você ainda quiser entrar, pode me responder até [hora do encerramento]. Se agora não for o momento, tudo bem também.']
];

// Mensagens do modelo de lançamento, com o código que liga cada item à sua estrutura original.
export function messageTemplates(eventDate = '') {
  const day = dateLabel(eventDate) || '[data do evento]';
  const build = (entries, channel, prefix) => entries.map(([title, phase, offset, time, notes], index) => ({
    code: `${prefix}-${String(index + 1).padStart(2, '0')}`, channel, title, phase, offset, time,
    notes: notes.replaceAll('[data do evento]', day)
  }));
  return [...build(groupMessages, 'grupos', 'GRUPO'), ...build(privateMessages, 'privado', 'PRIVADO')];
}

const tasks = [
  ['Definir objetivo, metas, narrativa e oferta', 'captura', 'estrategia', -12],
  ['Criar identidade visual, peças e materiais', 'captura', 'design', -11],
  ['Publicar páginas de captura e obrigado', 'captura', 'dev', -10],
  ['Preparar grupos, segmentação e pesquisa', 'captura', 'comercial', -10],
  ['Revisar e aprovar copies de grupos e privado', 'captura', 'copy', -10],
  ['Conferir inscrições e respostas da pesquisa', 'aquecimento', 'estrategia', -2],
  ['Ensaiar o roteiro e testar transmissão, áudio e gravação', 'evento', 'video', -1],
  ['Testar página de vendas, checkouts e opções de pagamento', 'vendas', 'dev', -1],
  ['Acompanhar chat, presença e dúvidas ao vivo', 'evento', 'comercial', 0],
  ['Publicar replay e enviar devolutiva', 'pos', 'video', 1],
  ['Fazer follow-up e recuperar pagamentos pendentes', 'vendas', 'comercial', 1],
  ['Consolidar resultados e aprendizados', 'pos', 'estrategia', 12]
];
const agenda = [
  ['Abertura e boas-vindas', 5, 'Apresente a equipe, confirme a duração e oriente o uso do chat.'],
  ['Contexto e promessa do encontro', 5, 'Mostre o problema que será resolvido e o que o público vai conseguir fazer.'],
  ['Conteúdo principal', 20, 'Apresente o passo a passo e conecte os pontos com exemplos do público.'],
  ['Demonstração ou prática', 15, 'Mostre uma aplicação e reserve tempo para o público testar.'],
  ['Apresentação da oferta', 10, 'Explique entregáveis, investimento, bônus, garantia e prazo.'],
  ['Perguntas e respostas', 10, 'Responda às dúvidas da transmissão e repita o próximo passo.'],
  ['Encerramento e próximos passos', 5, 'Informe como acessar o replay ou a oferta e onde pedir suporte.']
];
const links = [
  ['Página de captura', 'captura', -10, 'Valide inscrição, integração e redirecionamento no celular.'],
  ['Página de obrigado', 'captura', -10, 'Confirme a inscrição e mostre como entrar no grupo.'],
  ['Grupo do evento no WhatsApp', 'aquecimento', -10, 'Confira o convite, a descrição e as permissões do grupo.'],
  ['Pesquisa com inscritos', 'aquecimento', -3, 'Teste o formulário e a gravação das respostas.'],
  ['WhatsApp comercial', 'aquecimento', -3, 'Teste o contato e a mensagem inicial de atendimento.'],
  ['Transmissão', 'evento', -1, 'Confira o acesso de participantes e os recursos do anfitrião.'],
  ['Página de vendas', 'vendas', -1, 'Revise preço, prazos, bônus, garantia e botões de compra.'],
  ['Checkout à vista', 'vendas', -1, 'Confira produto, valor e meios de pagamento.'],
  ['Boleto de entrada', 'vendas', -1, 'Preencha se houver essa modalidade na oferta.'],
  ['Boleto do saldo', 'vendas', -1, 'Confira valor restante e condições de vencimento.'],
  ['Checkout de upgrade de 6 meses', 'vendas', -1, 'Preencha se a oferta incluir essa opção.'],
  ['Checkout de upgrade de 1 ano', 'vendas', -1, 'Preencha se a oferta incluir essa opção.'],
  ['Replay', 'pos', 1, 'Teste o acesso e confirme a data de retirada.']
];
const minutes = value => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };
const clock = total => `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

export function launchEventPlan(eventDate = '') {
  const date = offset => addDays(eventDate, offset);
  const base = { owner: '', ownerId: '', notes: '' };
  let start = minutes('20:00');
  return {
    brief: {
      goal: 'Objetivo do encontro: [resultado esperado]. Metas: [inscrições], [presença], [conversão] e [receita].',
      audience: 'Público prioritário: [perfil e problema]. Lista VIP: [critérios e canal]. Contatos antigos: [segmentos para reativação].',
      narrative: 'Problema: [dor do público]. Promessa: [transformação]. Provas e exemplos: [materiais aprovados].',
      offer: 'Oferta: [nome e entregáveis]. Investimento: [valor e condições]. Bônus: [itens e validade]. Garantia: [regras aprovadas].',
      logistics: 'Formato: [online, presencial ou híbrido]. Horário e fuso: [a definir]. Local ou plataforma: [a definir].',
      identity: 'Identidade visual: [referências]. Materiais: [páginas, peças de divulgação, slides e vídeos].',
      followup: 'Inscrições até [data e hora]. Replay até [data]. Nas mensagens de venda em grupo, convide para conversar no privado. Informe valores, formas de pagamento e checkout no atendimento individual.'
    },
    items: [
      ...tasks.map(([title, phase, team, offset]) => ({ ...base, id: uuid(), kind: 'task', title, phase, team, status: 'pendente', date: date(offset) })),
      ...messageTemplates(eventDate).map(({ code, channel, title, phase, offset, time, notes }) => ({ ...base, id: uuid(), kind: 'message', title, phase, team: 'copy', status: 'rascunho', channel, code, time, date: date(offset), notes })),
      ...agenda.map(([title, duration, notes], index) => {
        const time = clock(start); start += duration;
        return { ...base, id: uuid(), kind: 'agenda', title, phase: 'evento', team: 'estrategia', status: 'planejado', order: index + 1, duration, time, date: eventDate, notes };
      }),
      ...links.map(([title, phase, offset, notes]) => ({ ...base, id: uuid(), kind: 'link', title, phase, team: 'dev', status: 'pendente', url: '', date: date(offset), notes }))
    ]
  };
}
export function phaseLabel(value) { return eventPlanPhases.find(([id]) => id === value)?.[1] || value; }
export function teamLabel(value) { return eventPlanTeams.find(([id]) => id === value)?.[1] || value; }
export function itemStatusLabel(kind, value) { return (itemStatus[kind] || []).find(([id]) => id === value)?.[1] || value; }
export function eventStatusLabel(value) { return eventPlanStatuses.find(([id]) => id === value)?.[1] || value; }
