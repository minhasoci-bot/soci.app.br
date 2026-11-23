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
  task: [['pendente', 'Pendente'], ['andamento', 'Em andamento'], ['feito', 'Feito']],
  message: [['rascunho', 'Rascunho'], ['revisao', 'Em revisão'], ['pronto', 'Pronto'], ['agendado', 'Agendado'], ['enviado', 'Enviado'], ['cancelado', 'Cancelado']],
  agenda: [['planejado', 'Planejado'], ['confirmado', 'Confirmado'], ['feito', 'Feito']],
  link: [['pendente', 'Pendente'], ['pronto', 'Pronto']]
};
export const channels = [['grupos', 'Grupos'], ['privado', 'Privado'], ['instagram', 'Instagram'], ['email', 'E-mail'], ['outro', 'Outro']];
export const briefFields = [
  ['goal', 'Objetivo', 'Qual resultado este evento deve gerar?'],
  ['audience', 'Público', 'Quem precisa participar e por quê?'],
  ['narrative', 'Narrativa', 'Qual ideia central dá unidade à campanha?'],
  ['offer', 'Oferta', 'O que será apresentado e qual é a chamada para ação?'],
  ['logistics', 'Operação', 'Local, plataforma, responsáveis e pontos de atenção.'],
  ['identity', 'Identidade', 'Direção visual, tom e referências criativas.'],
  ['followup', 'Pós-evento', 'Próximos passos, acompanhamento e conversão.']
];

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
const row = (kind, title, phase, offset, extra = {}) => ({ id: crypto.randomUUID(), kind, title, phase, date: extra.date || '', ...extra, offset });
export function blankEventPlan() {
  return { brief: Object.fromEntries(briefFields.map(([key]) => [key, ''])), items: [] };
}

export function launchEventPlan(eventDate = '') {
  const date = offset => addDays(eventDate, offset);
  const plan = blankEventPlan();
  plan.items = [
    row('task', 'Consolidar objetivo, público e proposta de valor', 'captura', -21, { status: 'pendente', team: 'estrategia', date: date(-21), owner: '', notes: 'Registre o que deve mudar para o público depois do evento.' }),
    row('task', 'Definir oferta, CTA e condições comerciais', 'captura', -18, { status: 'pendente', team: 'comercial', date: date(-18), owner: '', notes: '' }),
    row('task', 'Criar identidade e kit visual da campanha', 'captura', -16, { status: 'pendente', team: 'design', date: date(-16), owner: '', notes: '' }),
    row('task', 'Publicar página, formulário ou lista de interesse', 'captura', -14, { status: 'pendente', team: 'dev', date: date(-14), owner: '', notes: '' }),
    row('task', 'Aprovar cronograma de conteúdos e disparos', 'aquecimento', -12, { status: 'pendente', team: 'copy', date: date(-12), owner: '', notes: '' }),
    row('task', 'Preparar roteiro comercial e objeções', 'aquecimento', -9, { status: 'pendente', team: 'comercial', date: date(-9), owner: '', notes: '' }),
    row('task', 'Checar inscrições, links e lembretes', 'aquecimento', -3, { status: 'pendente', team: 'estrategia', date: date(-3), owner: '', notes: '' }),
    row('task', 'Testar operação, som, vídeo e materiais', 'evento', -1, { status: 'pendente', team: 'video', date: date(-1), owner: '', notes: '' }),
    row('task', 'Consolidar leads, presenças e próximos passos', 'pos', 1, { status: 'pendente', team: 'comercial', date: date(1), owner: '', notes: '' }),
    row('task', 'Enviar follow-up e abrir a janela de oferta', 'vendas', 1, { status: 'pendente', team: 'copy', date: date(1), owner: '', notes: '' }),
    row('task', 'Fechar campanha e registrar aprendizados', 'pos', 7, { status: 'pendente', team: 'estrategia', date: date(7), owner: '', notes: '' }),

    row('message', 'Anúncio: reserve a data', 'captura', -14, { status: 'rascunho', team: 'copy', channel: 'grupos', time: '09:00', date: date(-14), owner: '', notes: 'Tem algo importante chegando. Reserve [data] para [evento].\n\nEm breve eu conto como participar.' }),
    row('message', 'Convite com benefício principal', 'aquecimento', -10, { status: 'rascunho', team: 'copy', channel: 'grupos', time: '10:00', date: date(-10), owner: '', notes: '[evento] foi pensado para quem quer [resultado].\n\nVocê vai sair com [benefício concreto]. Inscreva-se: [link]' }),
    row('message', 'Bastidores e prova de preparação', 'aquecimento', -7, { status: 'rascunho', team: 'copy', channel: 'instagram', time: '12:00', date: date(-7), owner: '', notes: 'Estamos preparando [detalhe] para que você aproveite [evento] ao máximo.\n\nJá garantiu sua vaga? [link]' }),
    row('message', 'Quebra de objeção: para quem é', 'aquecimento', -5, { status: 'rascunho', team: 'copy', channel: 'privado', time: '15:00', date: date(-5), owner: '', notes: 'Se você está pensando se [evento] é para você: ele é indicado para quem [perfil].\n\nMe responde aqui se quiser que eu explique como vai funcionar.' }),
    row('message', 'Lembrete de 48 horas', 'aquecimento', -2, { status: 'rascunho', team: 'copy', channel: 'grupos', time: '09:00', date: date(-2), owner: '', notes: 'Faltam 2 dias para [evento].\n\nSepare este horário: [data e hora]. Link e instruções: [link]' }),
    row('message', 'Hoje é o dia', 'evento', 0, { status: 'rascunho', team: 'copy', channel: 'grupos', time: '08:00', date: date(0), owner: '', notes: 'É hoje! [evento] começa às [hora].\n\nEntre por aqui: [link]\n\nChegue alguns minutos antes para aproveitar desde o início.' }),
    row('message', 'Follow-up: materiais e próximo passo', 'pos', 1, { status: 'rascunho', team: 'copy', channel: 'email', time: '10:00', date: date(1), owner: '', notes: 'Obrigado por participar de [evento].\n\nAqui estão os materiais: [link]\n\nSeu próximo passo para [resultado] é: [CTA].' }),
    row('message', 'Último chamado da oferta', 'vendas', 3, { status: 'rascunho', team: 'comercial', channel: 'privado', time: '16:00', date: date(3), owner: '', notes: 'A condição apresentada no evento termina hoje.\n\nSe [resultado] continua sendo prioridade, este é o momento: [link]' }),

    row('agenda', 'Abertura e contexto', 'evento', 0, { status: 'planejado', team: 'estrategia', time: '19:00', duration: 10, date: date(0), order: 1, owner: '', notes: 'Acolhimento, promessa e combinados.' }),
    row('agenda', 'Conteúdo principal', 'evento', 0, { status: 'planejado', team: 'estrategia', time: '19:10', duration: 45, date: date(0), order: 2, owner: '', notes: '' }),
    row('agenda', 'Demonstração ou estudo de caso', 'evento', 0, { status: 'planejado', team: 'comercial', time: '19:55', duration: 20, date: date(0), order: 3, owner: '', notes: '' }),
    row('agenda', 'Apresentação da oferta', 'vendas', 0, { status: 'planejado', team: 'comercial', time: '20:15', duration: 20, date: date(0), order: 4, owner: '', notes: '' }),
    row('agenda', 'Perguntas e respostas', 'evento', 0, { status: 'planejado', team: 'estrategia', time: '20:35', duration: 20, date: date(0), order: 5, owner: '', notes: '' }),
    row('agenda', 'CTA final e próximos passos', 'vendas', 0, { status: 'planejado', team: 'comercial', time: '20:55', duration: 5, date: date(0), order: 6, owner: '', notes: '' }),

    row('link', 'Página de inscrição', 'captura', -14, { status: 'pendente', team: 'dev', date: date(-14), url: '', owner: '', notes: '' }),
    row('link', 'Kit de divulgação', 'aquecimento', -12, { status: 'pendente', team: 'design', date: date(-12), url: '', owner: '', notes: '' }),
    row('link', 'Roteiro comercial', 'aquecimento', -9, { status: 'pendente', team: 'comercial', date: date(-9), url: '', owner: '', notes: '' }),
    row('link', 'Sala ou transmissão', 'evento', -1, { status: 'pendente', team: 'dev', date: date(-1), url: '', owner: '', notes: '' }),
    row('link', 'Materiais e replay', 'pos', 1, { status: 'pendente', team: 'estrategia', date: date(1), url: '', owner: '', notes: '' }),
    row('link', 'Oferta / checkout', 'vendas', 0, { status: 'pendente', team: 'comercial', date: date(0), url: '', owner: '', notes: '' })
  ];
  return plan;
}
export function phaseLabel(value) { return eventPlanPhases.find(([id]) => id === value)?.[1] || value; }
export function teamLabel(value) { return eventPlanTeams.find(([id]) => id === value)?.[1] || value; }
export function itemStatusLabel(kind, value) { return (itemStatus[kind] || []).find(([id]) => id === value)?.[1] || value; }
export function eventStatusLabel(value) { return eventPlanStatuses.find(([id]) => id === value)?.[1] || value; }
