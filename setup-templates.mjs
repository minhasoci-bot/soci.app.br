// Templates de setup por segmento (paridade com "Snapshot templates" do GHL): os mesmos 123 segmentos,
// cada um com um setup real da Soci montado a partir do perfil da categoria (pipeline, calendário, formulário,
// página, workflows, snippets, tags, valores personalizados e recepcionista de IA). Usados para criar subcontas.
import { slug } from './ui/crm-data.js';

// [chave da categoria, nome, segmentos [nome em pt-BR, original do GHL]]
const catalog = [
  ['auto', 'Automotivo', [['Assistência 24h na Estrada', 'Roadside Assistance'], ['Locadora de Veículos', 'Car Rental Agency'], ['Freios e Escapamentos', 'Brake & Muffler Shop'],
    ['Guincho e Reboque', 'Towing Service'], ['Funilaria e Pintura', 'Auto Body and Painting'], ['Loja de Pneus', 'Tire Shop'], ['Oficina Mecânica', 'Automotive Repair/Mechanic'],
    ['Concessionária e Venda de Veículos', 'Auto Dealer/Sales'], ['Estética Automotiva', 'Automotive Detailing']]],
  ['beauty', 'Beleza e Moda', [['Clínica de Estética Facial', 'Skin Care Clinic'], ['Joalheria', 'Jewelry Shop'], ['Agência de Modelos', 'Modeling Agency'], ['Studio de Cílios', 'Eyelash Salon'],
    ['Barbearia', 'Barber Shop'], ['Boutique e Alfaiataria', 'Clothing Boutique/Tailor'], ['Esmalteria', 'Nail Salon'], ['Day Spa', 'Day Spa'], ['Salão de Beleza', 'Hair Salon']]],
  ['coaching', 'Negócios, Coaching e Consultoria', [['Consultoria de Investimentos em Ações', 'Stocks Trading Advisor'], ['Consultoria Imobiliária', 'Real Estate Consultant'],
    ['Coaching de Negócios', 'Business Coaching'], ['Coach de Carreira', 'Career Coach'], ['Consultoria de TI', 'IT Consultant'], ['Consultoria Financeira', 'Financial Consultant'],
    ['Aulas Particulares e Reforço', 'Education Tutor'], ['Coach de Vida', 'Life Coach']]],
  ['creative', 'Criativo', [['Escola e Companhia de Dança', 'Dance Company'], ['Estúdio de Tatuagem', 'Tattoo Shop'], ['Fotógrafo', 'Photographer'], ['Produtora de Vídeo', 'Video Producer'],
    ['Floricultura', 'Floral Shop'], ['Copywriter', 'Copywriter'], ['Cerimonial e Eventos', 'Event Planner'], ['Design de Interiores', 'Interior Design'], ['Design Gráfico', 'Graphic Design'], ['Web Designer', 'Web Designer']]],
  ['finance', 'Finanças', [['Banco e Meios de Pagamento', 'Banking and Payment'], ['Planejador Financeiro', 'Financial Planner'], ['Crédito e Empréstimos', 'Lender'],
    ['Investidor e Gestão de Patrimônio', 'Financial Investor'], ['Escritório de Contabilidade', 'Accounting Firm'], ['Recuperação de Crédito', 'Credit Repair'],
    ['Contabilidade Tributária e Imposto de Renda', 'Tax Accounting'], ['BPO Financeiro', 'Bookkeeper']]],
  ['health', 'Saúde e Bem-estar', [['Retiro de Bem-estar', 'Wellness Retreat'], ['Clínica de Saúde Mental', 'Mental Health Clinic'], ['Nutrição e Bem-estar', 'Nutrition & Wellness'],
    ['Academia de Artes Marciais', 'Martial Arts'], ['Personal Trainer', 'Personal Trainer'], ['Emagrecimento', 'Weight Loss'], ['Terapias Holísticas', 'Holistic Wellness'],
    ['Coaching de Bem-estar', 'Wellness Coaching'], ['Studio de Yoga', 'Yoga'], ['Academia', 'Gym']]],
  ['home', 'Serviços Residenciais', [['Lavanderia', 'Dry Cleaners'], ['Dedetização e Controle de Pragas', 'Pest Control'], ['Assistência Técnica de Eletrodomésticos', 'Appliance Repair Shop'],
    ['Construtora', 'Construction Company'], ['Lavagem de Alta Pressão', 'Pressure Washing'], ['Diarista e Limpeza Residencial', 'Housekeeper'], ['Ar-condicionado e Climatização', 'HVAC'],
    ['Energia Solar', 'Solar'], ['Eletricista', 'Electrician'], ['Telhados e Coberturas', 'Roofing'], ['Paisagismo e Jardinagem', 'Landscaping'], ['Encanador', 'Plumber']]],
  ['insurance', 'Seguros', [['Seguro Viagem', 'Travel Insurance'], ['Seguro Empresarial', 'Commercial Insurance'], ['Seguro de Vida', 'Life Insurance'], ['Seguro Auto e Residencial', 'P&C Insurance']]],
  ['legal', 'Jurídico', [['Mediação e Conciliação', 'Mediation Services'], ['Advocacia Imobiliária', 'Real Estate Attorney'], ['Advocacia Trabalhista', 'Compensation Lawyer'],
    ['Advocacia de Indenizações e Acidentes', 'Personal Injury Attorney'], ['Recuperação Judicial e Falências', 'Bankruptcy Lawyer'], ['Advocacia de Imigração', 'Immigration Lawyer'],
    ['Advocacia Criminal', 'Defense Lawyer'], ['Advocacia de Família', 'Family Lawyer']]],
  ['agency', 'Agências e Marketing', [['Agência de Publicidade Visual', 'Visual Advertising Agency'], ['Assessoria de Imprensa', 'Public Relations Firm'], ['Software de CRM', 'CRM Software'],
    ['Empresa SaaS', 'SaaS'], ['Marketing de Eventos', 'Event Marketing'], ['Agência de Marketing de Afiliados', 'Affiliate Marketing Agency'], ['Criador de Conteúdo', 'Content Creator'],
    ['Agência de Marketing', 'Marketing Agency']]],
  ['medical', 'Clínicas e Saúde', [['Clínica Médica da Família', 'Family Practice Physician'], ['Clínica de Fisioterapia', 'Physical Therapy Clinic'], ['Home Care', 'Home Health Care'],
    ['Ótica e Optometria', 'Optometrist'], ['Dermatologia', 'Dermatologist'], ['Clínica de Tratamento Capilar', 'Hair Loss Clinic'], ['Odontologia', 'Dental'], ['Clínica de Estética Médica', 'Medical Spa'],
    ['Quiropraxia', 'Chiropractor']]],
  ['other', 'Outros Serviços', [['Assistência Técnica de Celulares', 'Phone Repair Shop'], ['Residencial para Idosos', 'Assisted Living Facility'], ['Pet Shop e Banho e Tosa', 'Pet Groomer'],
    ['Escola Infantil e Creche', 'Child Care'], ['Chaveiro', 'Locksmith']]],
  ['realestate', 'Imobiliário', [['Home Staging', 'Home Staging'], ['Escritório de Arquitetura', 'Architecture Firm'], ['Cartório e Documentação Imobiliária', 'Title Company'],
    ['Imobiliária', 'Real Estate Broker'], ['Vistoria de Imóveis', 'Home Inspector'], ['Investidor Imobiliário', 'Property Investor'], ['Crédito Imobiliário', 'Mortgage Lender'],
    ['Administração de Imóveis', 'Property Management'], ['Corretor de Imóveis', 'Real Estate Agent']]],
  ['food', 'Restaurantes e Bares', [['Doceria e Donuts', 'Donut Shop'], ['Buffet e Catering', 'Caterer'], ['Cafeteria', 'Coffee Shop'], ['Bistrô', 'Bistro'], ['Padaria e Confeitaria', 'Bakery'],
    ['Churrascaria e Steakhouse', 'Steakhouse'], ['Sorveteria', 'Ice Cream Shop']]],
  ['travel', 'Viagem e Hospitalidade', [['Hotel', 'Hotel'], ['Passeios de Barco', 'Boat Tour Agency'], ['Camping', 'Campground'], ['Locação de Motorhomes', 'RV Rental Agency'],
    ['Gestão de Aluguel por Temporada', 'Short-Term Rental Management'], ['Pousada', 'Bed and Breakfast'], ['Agência de Viagens', 'Travel Agency']]]
];

// What a business of each category sells, how it books and what the first conversation should collect.
const profiles = {
  auto: { stages: ['Novo contato', 'Orçamento enviado', 'Serviço agendado', 'Em execução', 'Entregue'], service: ['Avaliação do veículo', 45], form: 'Solicite seu orçamento', ask: 'marca, modelo e ano do veículo e o que está acontecendo', offer: 'orçamento sem compromisso', tags: ['revisao', 'urgente'] },
  beauty: { stages: ['Novo contato', 'Interessado', 'Horário agendado', 'Atendido', 'Cliente fiel'], service: ['Atendimento', 60], form: 'Agende seu horário', ask: 'qual serviço deseja e o melhor dia e horário', offer: 'horário com a profissional ideal para você', tags: ['primeira-visita', 'cliente-vip'] },
  coaching: { stages: ['Novo lead', 'Sessão de diagnóstico agendada', 'Proposta enviada', 'Cliente ativo', 'Renovação'], service: ['Sessão de diagnóstico', 45], form: 'Agende sua sessão de diagnóstico', ask: 'o principal objetivo e o maior desafio atual', offer: 'sessão de diagnóstico gratuita', tags: ['diagnostico', 'programa-ativo'] },
  creative: { stages: ['Novo contato', 'Briefing', 'Proposta enviada', 'Projeto em andamento', 'Entregue'], service: ['Reunião de briefing', 45], form: 'Conte sobre seu projeto', ask: 'o tipo de projeto, a data desejada e o orçamento previsto', offer: 'proposta personalizada', tags: ['briefing', 'projeto-fechado'] },
  finance: { stages: ['Novo lead', 'Análise do perfil', 'Proposta', 'Contrato assinado', 'Cliente ativo'], service: ['Reunião de análise', 45], form: 'Fale com um especialista', ask: 'o objetivo financeiro e a faixa de renda ou faturamento', offer: 'análise gratuita do seu caso', tags: ['analise', 'contrato'] },
  health: { stages: ['Novo contato', 'Aula experimental agendada', 'Plano apresentado', 'Aluno ativo', 'Renovação'], service: ['Aula ou avaliação experimental', 60], form: 'Agende sua avaliação gratuita', ask: 'o objetivo (saúde, emagrecimento, performance) e a disponibilidade de horário', offer: 'avaliação experimental gratuita', tags: ['experimental', 'aluno-ativo'] },
  home: { stages: ['Novo contato', 'Visita técnica agendada', 'Orçamento enviado', 'Serviço agendado', 'Concluído'], service: ['Visita técnica', 60], form: 'Peça seu orçamento grátis', ask: 'o serviço necessário, o endereço e a urgência', offer: 'visita técnica e orçamento sem custo', tags: ['visita-tecnica', 'emergencia'] },
  insurance: { stages: ['Novo lead', 'Cotação em andamento', 'Proposta enviada', 'Apólice emitida', 'Renovação'], service: ['Reunião de cotação', 30], form: 'Faça sua cotação', ask: 'o tipo de seguro, o que deseja proteger e dados básicos para a cotação', offer: 'cotação com as melhores seguradoras', tags: ['cotacao', 'renovacao'] },
  legal: { stages: ['Novo contato', 'Triagem', 'Consulta agendada', 'Contrato de honorários', 'Caso em andamento'], service: ['Consulta inicial', 45], form: 'Fale com um advogado', ask: 'um resumo do caso e se há prazo ou audiência marcada', offer: 'análise inicial do seu caso', tags: ['triagem', 'caso-ativo'] },
  agency: { stages: ['Novo lead', 'Diagnóstico agendado', 'Proposta enviada', 'Em negociação', 'Cliente fechado'], service: ['Reunião de diagnóstico', 30], form: 'Solicite um diagnóstico', ask: 'o segmento da empresa, o canal de vendas atual e a meta de crescimento', offer: 'diagnóstico gratuito de marketing', tags: ['diagnostico', 'cliente-ativo'] },
  medical: { stages: ['Novo paciente', 'Consulta agendada', 'Consulta realizada', 'Tratamento em andamento', 'Retorno'], service: ['Consulta', 30], form: 'Agende sua consulta', ask: 'o motivo da consulta, convênio ou particular e o melhor período', offer: 'consulta com o especialista', tags: ['primeira-consulta', 'paciente-ativo'] },
  other: { stages: ['Novo contato', 'Orçamento', 'Agendado', 'Atendido', 'Cliente recorrente'], service: ['Atendimento', 45], form: 'Fale com a gente', ask: 'o serviço que precisa e o melhor horário', offer: 'atendimento rápido', tags: ['orcamento', 'recorrente'] },
  realestate: { stages: ['Novo lead', 'Qualificado', 'Visita ou reunião agendada', 'Proposta', 'Negócio fechado'], service: ['Visita ou reunião', 60], form: 'Fale com um especialista', ask: 'se deseja comprar, vender ou alugar, a região e a faixa de valor', offer: 'atendimento consultivo', tags: ['comprador', 'vendedor'] },
  food: { stages: ['Novo contato', 'Pedido ou reserva', 'Confirmado', 'Atendido', 'Cliente fiel'], service: ['Reserva ou degustação', 90], form: 'Faça sua reserva ou encomenda', ask: 'a data, o número de pessoas ou o pedido desejado', offer: 'reserva garantida', tags: ['reserva', 'encomenda'] },
  travel: { stages: ['Novo contato', 'Orçamento enviado', 'Reserva confirmada', 'Hospedado ou viajando', 'Avaliação'], service: ['Atendimento de reserva', 30], form: 'Consulte datas e valores', ask: 'as datas, o número de pessoas e o tipo de experiência', offer: 'orçamento personalizado', tags: ['reserva', 'hospede'] }
};

const cv = name => `{{custom_values.${slug(name)}}}`;
const value = (prefix, name, folder, val = '') => ({ id: `${prefix}-cv-${slug(name)}`, name, folder, value: val, key: `custom_values.${slug(name)}` });

function templateSetup(category, categoryName, [name, original]) {
  const p = profiles[category];
  const key = slug(original).replace(/_/g, '-');
  const prefix = `tp-${key}`;
  let n = 0;
  const step = (type, config = {}) => ({ id: `t${key.replace(/[^a-z0-9]/g, '').slice(0, 24)}${String(++n).padStart(3, '0')}`, type, config });
  const trig = (type, config = {}) => ({ id: `t${key.replace(/[^a-z0-9]/g, '').slice(0, 24)}g${String(++n).padStart(3, '0')}`, type, config });
  const stage = i => `${prefix}-st${i}`;
  const owner = `${cv('Nome da Empresa')}`;
  const assets = {
    customValues: [
      value(prefix, 'Nome da Empresa', 'Empresa', name), value(prefix, 'Telefone da Empresa', 'Empresa'), value(prefix, 'WhatsApp da Empresa', 'Empresa'),
      value(prefix, 'Endereço', 'Empresa'), value(prefix, 'Site', 'Links', 'https://'), value(prefix, 'Link de Agendamento', 'Links', 'https://'), value(prefix, 'Link de Avaliação no Google', 'Links', 'https://')
    ],
    tags: ['novo-lead', 'lead-site', 'lead-whatsapp', 'ligacao-perdida', 'cliente', 'sem-resposta', ...p.tags].map(tag => ({ id: `${prefix}-tg-${tag}`, name: tag, description: '', category: name })),
    pipelines: [{ id: `${prefix}-pipe`, name: `Vendas — ${name}` }],
    stages: p.stages.map((stageName, i) => ({ id: stage(i), pipelineId: `${prefix}-pipe`, name: stageName })),
    services: [{ id: `${prefix}-sv`, name: p.service[0], description: `${p.service[0]} — ${name}.`, kind: 'appointment', duration: p.service[1], buffer: 0, price: 0, staffIds: [], resourceIds: [], rentalUnit: '', maxUnits: 1, active: true, color: '#b71889' }],
    forms: [{ id: `${prefix}-form`, name: `${p.form} — ${name}`, description: `Formulário do site: nome, WhatsApp e ${p.ask}.`, askPhone: true, active: false, kind: 'form' }],
    pages: [{ id: `${prefix}-page`, name: `${name} — Página de captura`, headline: `${name}: ${p.offer}`, body: `Conte ${p.ask} e retornamos em poucos minutos.`, button: p.form, formId: `${prefix}-form`, kind: 'Funnel', active: false }],
    snippetFolders: [{ id: `${prefix}-sf`, name }],
    snippets: [
      { id: `${prefix}-sn1`, folderId: `${prefix}-sf`, name: 'Primeiro contato', body: `Olá, {{contact.first_name}}! Aqui é da ${owner}. Para te ajudar melhor, me conta ${p.ask}?` },
      { id: `${prefix}-sn2`, folderId: `${prefix}-sf`, name: 'Link de agendamento', body: `Você pode escolher o melhor horário por aqui: ${cv('Link de Agendamento')}` },
      { id: `${prefix}-sn3`, folderId: `${prefix}-sf`, name: 'Pedido de avaliação', body: `Obrigado pela confiança, {{contact.first_name}}! Sua avaliação nos ajuda muito: ${cv('Link de Avaliação no Google')}` }
    ],
    agents: [{ id: `${prefix}-ag`, name: `Recepcionista IA — ${name}`, icon: 'spark', description: `Atende ${name.toLowerCase()} no WhatsApp e no chat, entende a necessidade e agenda ${p.service[0].toLowerCase()}.`,
      instructions: `Você é a recepcionista virtual de ${owner}, ${name.toLowerCase()}. Seja cordial, objetiva e use frases curtas, como no WhatsApp. Descubra ${p.ask}, ofereça ${p.offer} e conduza para agendar ${p.service[0].toLowerCase()} pelo link ${cv('Link de Agendamento')}. Nunca invente preços, prazos ou condições: quando não souber, diga que a equipe confirma. Se a pessoa pedir atendimento humano, avise que alguém da equipe já vai assumir.` }],
    workflowFolders: [{ id: `${prefix}-wff`, name }],
    workflows: []
  };
  const flow = (id, wfName, triggers, steps) => assets.workflows.push({ id: `${prefix}-${id}`, folderId: `${prefix}-wff`, name: wfName, active: false, triggers, steps });
  flow('wf-lead', 'Novo lead do site → resposta em 1 minuto', [trig('form_submitted', { formId: `${prefix}-form` })], [
    step('add_tag', { tag: 'lead-site' }), step('create_opportunity', { title: '{{contact.name}}', stageId: stage(0), value: 0 }),
    step('send_whatsapp', { body: `Oi, {{contact.first_name}}! Recebemos seu contato na ${owner}. 😊 Para agilizar, me conta ${p.ask}?` }),
    step('internal_notification', { body: `Novo lead de ${name}: {{contact.name}} — {{contact.phone}}.` }),
    step('wait', { mode: 'event', event: 'customer_replied', eventValue: '', timeoutDays: 1 }),
    step('send_whatsapp', { body: `{{contact.first_name}}, conseguiu ver minha mensagem? Se preferir, já pode agendar por aqui: ${cv('Link de Agendamento')}` })
  ]);
  flow('wf-booked', 'Agendamento confirmado → lembretes', [trig('appointment_booked')], [
    step('create_opportunity', { title: '{{contact.name}}', stageId: stage(2), value: 0 }),
    step('send_whatsapp', { body: `Tudo certo, {{contact.first_name}}! Seu horário de ${p.service[0].toLowerCase()} está confirmado. Endereço: ${cv('Endereço')}. Qualquer imprevisto, é só responder aqui.` }),
    step('wait', { mode: 'delay', amount: 1, unit: 'days' }),
    step('send_whatsapp', { body: `Lembrete: estamos te esperando, {{contact.first_name}}! Até já. — ${owner}` })
  ]);
  flow('wf-noshow', 'Agendamento cancelado → reagendar', [trig('appointment_status', { status: 'Canceled' })], [
    step('send_whatsapp', { body: `{{contact.first_name}}, vimos que seu horário foi cancelado. Quer escolher outro? ${cv('Link de Agendamento')}` }),
    step('create_task', { title: 'Reagendar {{contact.name}}', dueDays: 1, owner: '' })
  ]);
  flow('wf-missed', 'Ligação perdida → WhatsApp', [trig('call_details', { direction: 'inbound', status: 'missed' })], [
    step('add_tag', { tag: 'ligacao-perdida' }), step('wait', { mode: 'delay', amount: 1, unit: 'minutes' }),
    step('send_whatsapp', { body: `Oi! Vimos sua ligação para a ${owner} e não conseguimos atender. Como podemos ajudar?` })
  ]);
  flow('wf-review', 'Cliente atendido → pedido de avaliação', [trig('opportunity_status_changed', { status: 'Won' })], [
    step('add_tag', { tag: 'cliente' }), step('wait', { mode: 'delay', amount: 1, unit: 'days' }), step('review_request', { channel: 'WhatsApp' })
  ]);
  flow('wf-reactivation', 'Reativação de clientes (90 dias)', [trig('contact_tag', { change: 'added', tag: 'cliente' })], [
    step('wait', { mode: 'delay', amount: 90, unit: 'days' }),
    step('send_whatsapp', { body: `Oi, {{contact.first_name}}! Faz um tempo desde seu último atendimento na ${owner}. Que tal agendar de novo? ${cv('Link de Agendamento')}` })
  ]);
  return {
    id: `template-${key}`, template: true, segment: category, original,
    title: name,
    summary: `Setup pronto para ${name.toLowerCase()}: pipeline de ${p.stages.length} etapas, agenda de ${p.service[0].toLowerCase()}, formulário, página, 6 workflows, snippets e recepcionista de IA.`,
    description: `Template do segmento ${categoryName}. Captura o lead pelo site, responde em 1 minuto no WhatsApp, confirma e lembra o agendamento, recupera cancelamentos e ligações perdidas, pede avaliação ao cliente atendido e reativa a base após 90 dias. Preencha os valores personalizados (empresa, endereço e links) antes de ativar.`,
    category: categoryName,
    tags: [name.toLowerCase(), categoryName.toLowerCase(), 'template'],
    assets
  };
}

export const templateCategories = catalog.map(([key, name]) => [key, name]);
export const setupTemplateSpecs = catalog.flatMap(([category, categoryName, items]) => items.map(item => templateSetup(category, categoryName, item)));
