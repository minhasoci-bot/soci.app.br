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

export const audiences = [['', 'Não definido'], ['base', 'Grupos antigos e ativos'], ['evento', 'Grupo do evento']];

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
// Grupos que recebem a mensagem: a captação vai para quem já é da base; o resto, para o grupo do evento.
const groupMessages = [
  ['MCWF001', 'base', 'Convite inicial', 'captura', -9, '18:00', lines(
    '## Mensagem 1 · Provocação',
    'Vou falar uma verdade que pouca gente de [seu mercado] está pronta para ouvir 👀',
    '*[A mudança que está chegando] já começou.*',
    'Percebi isso em [onde você observou: clientes, alunos, projetos], e daqui para a frente vejo só dois caminhos:',
    '- 😓 Continuar em [jeito antigo] e brigar por preço\n- 🚀 Dominar [jeito novo] e virar a primeira escolha',
    '## Mensagem 2 · Convite',
    'Vou abrir tudo isso em uma aula ao vivo:',
    '✨ *[evento]* ✨',
    '🗓️ *[data do evento], às [hora do evento]*\n🎟️ [gratuito ou valor] · [regra de gravação]',
    '## Mensagem 3 · O que o grupo recebe',
    'No grupo você encontra:',
    '- 🎯 O acesso à aula\n- 📒 [material 1]\n- 🗺️ [material 2]\n- 📎 [material complementar]\n- 🎁 [condição exclusiva do grupo]',
    'O link da sala chega por lá. Entre agora 👇\n[link do grupo]',
    'Já separe o horário. Espero você! ✨')],
  ['MCWF002', 'base', 'Quem só executa', 'captura', -8, '12:00', lines(
    '## Mensagem 1 · Pergunta incômoda',
    'Responde com calma: se amanhã [nova alternativa do mercado] fizer o que você faz hoje, por que alguém ainda escolheria você? 🤔',
    'Fazer bem feito deixou de ser diferencial. O que pesa agora é [competência que o mercado valoriza].',
    'Boa notícia: isso se aprende 💡',
    '## Mensagem 2 · Convite',
    'É o assunto de *[evento]*, ao vivo.',
    '🗓️ [data do evento], às [hora do evento]',
    'Entrando no grupo você leva [material 1], [material 2] e [condição exclusiva do grupo] 👇\n[link do grupo]')],
  ['MCWF003', 'base', 'Lado A ou lado B', 'captura', -7, '12:00', lines(
    'Teste de dez segundos ⏱️',
    '_[Situação comum do seu público]._ O que você faz?',
    '*A)* [Reação automática] 😅\n*B)* [Reação estratégica] 🎯',
    'Foi de A? Sem culpa, é o mais comum. Só que o B costuma ser melhor pago, e dá para chegar lá.',
    'Falta uma semana para eu mostrar o caminho ao vivo.',
    '🗓️ [data do evento], às [hora do evento] · [regra de gravação]',
    '👇 Vem para o grupo\n[link do grupo]')],
  ['MCWF004', 'base', 'Volume ou valor', 'captura', -6, '12:00', lines(
    'Para pensar no fim do dia 🌙',
    'Pessoa 1: [muitos clientes ou vendas, valor baixo, cansaço]\nPessoa 2: [poucos clientes ou vendas, valor alto, agenda livre]',
    'As duas trabalham bem. O que muda é *[fator que explica a diferença]*.',
    'Em *[evento]* eu explico como passar do primeiro cenário para o outro.',
    '🗓️ [data do evento], às [hora do evento]',
    '[link do grupo]')],
  ['MCWF005', 'base', 'Bastidores dos materiais', 'captura', -5, '12:00', lines(
    'Olha o que está aberto na minha tela agora: [material 2], quase pronto ☕',
    'Encontrei [descoberta curiosa] enquanto montava e fiquei com vontade de contar antes da hora 🤐',
    'Quem está no grupo recebe esse material e também [material 1]. A explicação é na aula, [data do evento], às [hora do evento].',
    '👉 [link do grupo]')],
  ['MCWF006', 'base', 'O que está faltando', 'captura', -3, '12:00', lines(
    '## Mensagem 1 · Diagnóstico',
    'Faz as contas comigo: quantas aulas, livros e vídeos sobre [tema] passaram por você nos últimos meses? 📚',
    'Agora olha para [resultado que o público quer]. Mudou na mesma proporção?',
    'Se não mudou, o problema raramente é estudar pouco. Costuma ser *não saber qual passo vem primeiro*.',
    '## Mensagem 2 · Convite',
    'Esse passo é o tema de *[evento]*.',
    '🗓️ [data do evento], às [hora do evento] · [gratuito ou valor]',
    'No grupo: [material 1], [material 2] e [condição exclusiva do grupo] 👇\n[link do grupo]',
    'Marca na agenda antes de sair desta conversa 😉')],
  ['MCWF007', 'base', 'A lista que não para de crescer', 'captura', -2, '12:00', lines(
    'Começou com [combinado inicial]. Aí veio:',
    '+ [pedido extra 1]\n+ [pedido extra 2]\n+ [pedido extra 3]\n+ _“rapidinho, só mais isso?”_',
    'E o valor? O mesmo do começo 🙃',
    'Se essa conta é conhecida, a aula é para você. *Faltam 2 dias!*',
    '[data do evento], às [hora do evento] 👇\n[link do grupo]')],
  ['MCWF008', 'base', 'É amanhã', 'captura', -1, '12:00', lines(
    '⏳ *Amanhã tem aula!*',
    'Às [hora do evento] vamos falar sobre [promessa do evento].',
    'Para não ter surpresa, anota as regras:',
    '▪️ [regra de gravação]\n▪️ O acesso sai só pelo grupo\n▪️ [prazo para entrar no grupo]',
    'Quem participa recebe [material 1], [material 2] e [condição exclusiva do grupo].',
    'Ainda dá tempo 👇\n[link do grupo]')],
  ['MCWF009', 'base', 'É hoje', 'captura', 0, '12:00', lines(
    '## Mensagem 1 · Chegou o dia',
    '*Chegou o dia!* 🎉',
    'Hoje, às [hora do evento], vou contar [o que você testou], o que já funciona e o que separa [situação atual] de [resultado].',
    'E guardei [novidade da campanha] para o final 🤫',
    '## Mensagem 2 · O que você leva',
    '✨ *[evento]* ✨\nHoje, às [hora do evento]',
    'Ao vivo, você recebe:',
    '- 📒 [material 1]\n- 🗺️ [material 2]\n- 📎 [material complementar]\n- 🎁 [condição exclusiva do grupo]',
    'Falta só entrar no grupo 👇\n[link do grupo]')],
  ['MCWF010', 'base', 'Última chamada', 'captura', 0, '18:00', lines(
    '🔔 *Última chamada: a aula começa em 2 horas*',
    'Se [problema do público] ainda pesa na sua rotina, é hoje que a gente conversa sobre isso.',
    'A sala abre às [hora do evento], com link enviado no grupo 👇\n[link do grupo]')],
  ['MDWF001', 'evento', 'Boas-vindas e enquete', 'aquecimento', -3, '12:00', lines(
    'Boas-vindas ao grupo de *[evento]*! 🎉',
    'Quero preparar a aula pensando em quem está aqui. Me ajuda respondendo:',
    '## Enquete · Qual frase combina mais com você?',
    '- 🌱 Estou dando os primeiros passos\n- 🙋 Faço tudo por minha conta\n- 🤝 Já tenho clientes ou vendas constantes\n- 👥 Lidero uma equipe\n- 🔄 Venho de outra área')],
  ['MDWF002', 'evento', 'Faltam dois dias', 'aquecimento', -2, '12:00', lines(
    'Contagem regressiva: *2 dias* ⏳',
    'Por aqui, [material 1] e [material 2] já estão na reta final.',
    'Um adiantamento: em [material 2] tem [dado ou exemplo surpreendente]. O resto eu conto na aula 😉',
    '[data do evento], às [hora do evento]. Reserva esse horário só para você.')],
  ['MDWF003', 'evento', 'Nosso encontro é amanhã', 'aquecimento', -1, '12:00', lines(
    '*Amanhã a gente se vê!* 🙌',
    'O tema é [promessa do evento], a partir das [hora do evento].',
    'Deixa pronto:',
    '- ✍️ Papel e caneta\n- ⏰ Um lembrete 10 minutos antes\n- 🔕 Um espaço sem interrupções',
    'Sobre a gravação: [regra de gravação].')],
  ['MDWF004', 'evento', 'Áudio e mensagem do dia', 'evento', 0, '12:00', lines(
    '## Roteiro do áudio · curto, em tom de conversa',
    'Oi, gente! Passei para lembrar que a nossa aula é hoje. Revisei o material agora cedo e escolhi [exemplo real] para mostrar como cheguei em [resultado]. Separa uma dúvida sobre [tema], porque vou reservar um tempo para responder. Às [hora do evento] eu abro a sala por aqui. Até já!',
    '## Mensagem depois do áudio',
    '*Hoje tem aula!* 🎉',
    '- 🕗 [hora do evento], com link aqui no grupo\n- ✍️ Algo para anotar\n- ☕ Uma bebida do lado\n- 📵 Avisos silenciados')],
  ['MDWF005', 'evento', 'Faltam algumas horas', 'evento', 0, '16:00', lines(
    'Falta pouco! ⏰ Confere se está tudo certo:',
    '- ✅ Horário livre\n- ✅ Material de anotação por perto\n- ✅ Grupo com notificação ativada\n- ✅ Uma pergunta na ponta da língua',
    'Às [hora do evento] mando o link. Até logo!')],
  ['MDWF006', 'evento', 'Bastidores: 30 minutos', 'evento', 0, '19:30', lines(
    '## Orientação para o vídeo',
    'Grave o cenário, os equipamentos e a equipe nos últimos ajustes. Até 20 segundos.',
    '## Texto para acompanhar o vídeo',
    'Espia como está por aqui 🎬',
    'Luz ligada, [material 1] na mesa e [novidade da campanha] guardada para o fim.',
    '*Abrimos a sala em meia hora!*')],
  ['MDWF007', 'evento', 'Sala aberta', 'evento', 0, '19:55', lines(
    '*A sala está aberta!* 🚪',
    'Entra por este link 👇\n[link da transmissão]',
    'Chegando agora, você acompanha a abertura e se ajeita com calma.')],
  ['MDWF008', 'evento', 'Já começamos', 'evento', 0, '20:05', lines(
    'Estamos ao vivo 🔴',
    'O assunto neste momento é [tópico em andamento], e tem gente anotando sem parar ✍️',
    'Dá para alcançar a gente 👇\n[link da transmissão]')],
  ['MDWF009', 'evento', 'Ainda dá tempo', 'evento', 0, '20:20', lines(
    'Sentimos a sua falta na sala 👋',
    'O próximo bloco é [parte mais esperada]. Lembrando: [regra de gravação].',
    'Corre que ainda pega 👇\n[link da transmissão]')],
  ['MVWF001', 'evento', 'Inscrições abertas: resumo da oferta', 'vendas', 0, '21:00', lines(
    '## Mensagem 1 · Para quem é',
    '✨ *Inscrições abertas para [oferta]* ✨',
    '👤 *Feito para:* [perfil e momento do público]',
    '🎯 *Objetivo:*\n- [resultado aprovado no curto prazo]\n- [resultado aprovado no longo prazo]',
    '## Mensagem 2 · O que está incluído',
    '📦 *Você recebe:*',
    '- [entregável 1 e para que serve]\n- [entregável 2 e para que serve]\n- [entregável 3 e para que serve]\n- [acompanhamento ou comunidade]',
    '## Mensagem 3 · Bônus, garantia e vagas',
    '🎁 *Bônus:*',
    '- [bônus 1 e condição]\n- [bônus 2 e condição]',
    '🛡️ *Garantia:* [regras e prazo da garantia]',
    '🪑 Vagas: [quantidade real]. Fala comigo no privado para entrar.')],
  ['MVWF002', 'evento', 'Inscrições abertas: bônus e garantia', 'vendas', 0, '22:30', lines(
    'Antes de dormir, dois detalhes que fazem diferença 🌙',
    '🛡️ *Segurança:* [regras da garantia, em uma frase].',
    '🔑 *Entrada facilitada:* existe [alternativa de pagamento aprovada]. Os detalhes eu passo em conversa.',
    '⚡ Escolhendo à vista, você também recebe [benefício do pagamento à vista].',
    'Me manda um oi no privado e vemos o seu caso.')],
  ['MVWF003', 'evento', 'Enquete: conseguiu se inscrever?', 'vendas', 1, '12:00', lines(
    'Quero entender como posso ajudar 👇',
    '## Enquete · Como está a sua inscrição em [oferta]?',
    '- 🎉 Inscrição feita\n- 🤔 Avaliando\n- 💳 Preciso entender o pagamento\n- 💬 Ficou uma dúvida',
    'Nas duas últimas opções, me escreve no privado.')],
  ['MVWF004', 'evento', 'Boleto e garantia', 'vendas', 1, '15:00', lines(
    '_“Quero entrar, mas o cartão não ajuda.”_ Recebi essa mensagem algumas vezes hoje 💬',
    'Por isso existe [alternativa de pagamento aprovada]: você começa com [entrada] e acerta o restante em [prazo e condição do saldo].',
    'A garantia continua valendo: [regras da garantia].',
    'Chama no privado para eu simular com você.')],
  ['MVWF005', 'evento', 'Replay liberado', 'vendas', 1, '18:00', lines(
    '## Antes de enviar',
    'Só envie se o replay for mesmo liberado e se isso não contrariar o que foi anunciado.',
    '## Mensagem',
    'Muita gente avisou que não conseguiu acompanhar, então *liberamos a gravação* 🎥',
    'Ela fica no ar até [prazo do replay]: [link do replay]',
    'Depois de assistir, me conta o que fez mais sentido. As inscrições para [oferta] seguem abertas.')],
  ['MVWF006', 'evento', 'Vagas restantes', 'vendas', 2, '12:00', lines(
    'Atualização das vagas de *[oferta]* 📊',
    'Temos [vagas disponíveis] no momento.',
    'No pagamento à vista, [benefício do pagamento à vista].',
    'Para garantir a sua ou tirar dúvida, é só me chamar no privado.')],
  ['MVWF007', 'evento', 'Falta um dia', 'vendas', 4, '12:00', lines(
    '⏰ *Amanhã encerramos as inscrições de [oferta]*',
    'Se a única barreira é a forma de pagamento, [alternativa de pagamento aprovada] pode resolver: [resumo da condição].',
    'Fala comigo ainda hoje para dar tempo de organizar.')],
  ['MVWF008', 'evento', 'Últimas horas', 'vendas', 5, '12:00', lines(
    '🔔 *Último dia para entrar em [oferta]*',
    'Pensa em como você quer estar em [prazo do resultado]: [cenário desejado] ou no mesmo ponto de hoje?',
    'As inscrições terminam às [hora do encerramento]. Se for para você, me chama no privado.')]
];
const privateMessages = [
  ['MCWF1X1-001', '', 'Reativar contato', 'captura', -7, '', lines(
    'Oi, {{contact.first_name}}! Tudo bem por aí? Lembrei da nossa conversa sobre [interesse anterior] 😊',
    'Dia [data do evento], às [hora do evento], vou dar uma aula sobre [promessa do evento] e acho que combina com o que você procura.',
    'Quem entra no grupo recebe:',
    '- 🎯 O acesso à aula\n- 📒 [material 1]\n- 🗺️ [material 2]\n- 🎁 [condição exclusiva do grupo]',
    '[link do grupo]\nTopa participar?')],
  ['MCWF1X1-002', '', 'Entregáveis', 'captura', -3, '', lines(
    '{{contact.first_name}}, preparei um kit para a aula e pensei em você:',
    '- 📒 [material 1] para [objetivo]\n- 🗺️ [material 2] para [objetivo]\n- 📎 [material complementar]\n- 🎁 [condição exclusiva do grupo]',
    'É dia [data do evento], às [hora do evento]. [Gratuito ou valor], [regra de gravação].',
    '[link do grupo]\nConsegue vir?')],
  ['MCWF1X1-003', '', 'Últimas horas', 'captura', 0, '', lines(
    'Oi, {{contact.first_name}}! Nossa aula é hoje, às [hora do evento] 🎉',
    'Para receber o acesso, é só estar no grupo:\n[link do grupo]',
    'Guardo um lugar para você?')],
  ['MVWF1X1-001', '', 'Inscrições abertas e boleto', 'vendas', 0, '22:00', lines(
    '{{contact.first_name}}, acabei de sair da aula! Você conseguiu acompanhar? 😊',
    'Abri as inscrições de [oferta] e me lembrei de [objetivo da pessoa].',
    'Também temos [alternativa de pagamento aprovada]. Posso explicar como fica no seu caso?')],
  ['MVWF1X1-002', '', 'Replay', 'vendas', 1, '15:00', lines(
    'Oi, {{contact.first_name}}! Deixei a gravação da aula disponível até [prazo do replay] 🎥',
    '[link do replay]',
    'A parte de [tema do interesse da pessoa] está em [minutagem]. Depois me diz o que achou?')],
  ['MVWF1X1-003', '', 'Boleto e prazo', 'vendas', 4, '12:00', lines(
    '{{contact.first_name}}, as inscrições de [oferta] estão terminando e quis avisar você antes.',
    'Se o pagamento for a dúvida, [alternativa de pagamento aprovada] ainda está valendo. Quer ajuda para resolver?')],
  ['MVWF1X1-004', '', 'Fechamento da turma', 'vendas', 11, '12:00', lines(
    'Oi, {{contact.first_name}}! Estou fechando a turma de [oferta] hoje.',
    'Se ainda fizer sentido, me responde até [hora do encerramento]. Se não for o momento, tudo certo também 😊')]
];

// Mensagens do modelo de lançamento, com o código que liga cada item à sua estrutura original.
export function messageTemplates(eventDate = '') {
  const day = dateLabel(eventDate) || '[data do evento]';
  const build = (entries, channel) => entries.map(([code, audience, title, phase, offset, time, notes]) => ({
    code, audience, channel, title, phase, offset, time, notes: notes.replaceAll('[data do evento]', day)
  }));
  return [...build(groupMessages, 'grupos'), ...build(privateMessages, 'privado')];
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
      ...messageTemplates(eventDate).map(({ code, audience, channel, title, phase, offset, time, notes }) => ({ ...base, id: uuid(), kind: 'message', title, phase, team: 'copy', status: 'rascunho', channel, audience, code, time, date: date(offset), notes })),
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
