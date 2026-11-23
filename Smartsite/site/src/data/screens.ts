/**
 * Capturas reais da plataforma, feitas no workspace de demonstração local (dados fictícios, e-mails .test),
 * em 1440x900. src null = captura ainda não feita: a página mostra um espaço identificado como pendente.
 */
export interface ScreenShot { src: string | null; alt: string; legenda: string; width?: number; height?: number }

const shot = (file: string, alt: string): ScreenShot => ({ src: `/produto/${file}.webp`, alt, legenda: alt, width: 1440, height: 900 });
const pendente = (legenda: string): ScreenShot => ({ src: null, alt: '', legenda });

export const SCREENS: Record<string, ScreenShot> = {
  crm: shot('oportunidades', 'Funil de oportunidades da soci com as etapas Novo lead, Qualificado, Proposta e Ganha'),
  'whatsapp-e-atendimento': shot('conversas', 'Caixa de entrada de conversas da soci com a lista de conversas da equipe'),
  'redes-sociais': shot('marketing', 'Planejador social da soci com as redes para conectar: Facebook, Instagram, LinkedIn, TikTok, YouTube, Pinterest, Threads, Bluesky e Google Business'),
  'inteligencia-artificial': shot('agentes', 'Estúdio de agentes de IA da soci com casos de uso prontos, como atendimento ao cliente e qualificação de leads'),
  'gestao-de-agencias': shot('agencia', 'Painel da agência na soci com receita recorrente, subcontas e checklist de configuração'),
  relatorios: shot('painel', 'Painel de controle da soci com status, valor das oportunidades e taxa de conversão'),
  agendamentos: shot('agenda', 'Calendário da soci com a visão do mês e as abas de agendamentos, serviços e recursos'),
  sites: pendente('criador de sites com IA'),
  'funis-e-landing-pages': pendente('construtor de funis'),
  formularios: pendente('formulários'),
  automacoes: pendente('editor de automações'),
  prospeccao: pendente('prospecção pelo Google Maps'),
  'email-marketing': pendente('campanhas de e-mail'),
  reputacao: pendente('reputação e avaliações'),
  'pagamentos-e-pix': pendente('faturas e Pix'),
  'cursos-e-area-de-membros': pendente('cursos e portal do aluno'),
  'telefone-e-voz': pendente('telefone e discador'),
  // Home
  'home-crm': shot('oportunidades', 'Funil de oportunidades da soci'),
  'home-contatos': shot('contatos', 'Lista de contatos da soci com tags e empresas'),
  'home-ia': shot('pergunte', 'Assistente Pergunte à Soci com sugestões de perguntas sobre a agência'),
  'home-setups': shot('setups', 'Setups de conta da soci para instalar estruturas prontas em subcontas'),
};

export function screen(id: string): ScreenShot {
  return SCREENS[id] ?? pendente(id);
}
