// Communities: data shared by the server (community-config.mjs) and the screens — theme tokens and presets,
// the portal tabs, the automatic badges, the anti-spam starter pack and the plan intervals.

/** The 9 color tokens of a community theme. */
export const themeTokens = [
  ['primary', 'Principal'], ['onPrimary', 'Texto sobre o principal'], ['background', 'Plano de fundo'], ['tertiary', 'Destaque'], ['font', 'Texto'],
  ['sidebar', 'Barra lateral'], ['surface', 'Superfície'], ['border', 'Borda'], ['error', 'Erro']
];

/** Ready-made themes. */
export const themePresets = [
  { id: 'default', name: 'Padrão', tokens: { onPrimary: '#ffffff', primary: '#b71889', background: '#f7f5f8', tertiary: '#fde7f4', font: '#1e1821', sidebar: '#ffffff', surface: '#ffffff', border: '#e8e1e9', error: '#c0262d' } },
  { id: 'ameixa', name: 'Ameixa', tokens: { onPrimary: '#ffffff', primary: '#6d28d9', background: '#f6f3fd', tertiary: '#ede5ff', font: '#1f1633', sidebar: '#ffffff', surface: '#ffffff', border: '#e3dbf5', error: '#c0262d' } },
  { id: 'floresta', name: 'Floresta', tokens: { onPrimary: '#ffffff', primary: '#1f7a4d', background: '#f2f7f3', tertiary: '#dcefe2', font: '#14261b', sidebar: '#ffffff', surface: '#ffffff', border: '#d5e6da', error: '#b42318' } },
  { id: 'citrico', name: 'Cítrico', tokens: { onPrimary: '#ffffff', primary: '#c2410c', background: '#fff8f1', tertiary: '#ffedd5', font: '#2b1a0e', sidebar: '#ffffff', surface: '#ffffff', border: '#f5dcc4', error: '#b42318' } },
  { id: 'sol', name: 'Sol', tokens: { onPrimary: '#ffffff', primary: '#a16207', background: '#fffbeb', tertiary: '#fef3c7', font: '#27200b', sidebar: '#ffffff', surface: '#ffffff', border: '#f1e3b5', error: '#b42318' } },
  { id: 'oceano', name: 'Oceano', tokens: { onPrimary: '#ffffff', primary: '#0e6ba8', background: '#f1f7fb', tertiary: '#dbeefa', font: '#0f2230', sidebar: '#ffffff', surface: '#ffffff', border: '#d3e5f1', error: '#c0262d' } },
  { id: 'chiclete', name: 'Chiclete', tokens: { onPrimary: '#ffffff', primary: '#db2777', background: '#fff4f8', tertiary: '#fce7f3', font: '#2a1220', sidebar: '#ffffff', surface: '#ffffff', border: '#f6d5e5', error: '#b42318' } },
  { id: 'marfim', name: 'Marfim', tokens: { onPrimary: '#ffffff', primary: '#57534e', background: '#faf8f3', tertiary: '#efe9dc', font: '#1c1917', sidebar: '#fffdf8', surface: '#fffdf8', border: '#e7e0d1', error: '#b42318' } },
  { id: 'meia-noite', name: 'Meia-noite', tokens: { onPrimary: '#0f1220', primary: '#8b9cff', background: '#0f1220', tertiary: '#1d2340', font: '#e7e9f5', sidebar: '#151a2e', surface: '#171c31', border: '#2a3152', error: '#ff6b6b' } },
  { id: 'grafite', name: 'Grafite', tokens: { primary: '#f4f4f5', onPrimary: '#111113', background: '#0e0f11', tertiary: '#1c1e22', font: '#ececee', sidebar: '#131417', surface: '#16181b', border: '#26292e', error: '#ff6b6b' } },
  { id: 'noite-neon', name: 'Noite neon', tokens: { primary: '#c6f432', onPrimary: '#0b0d10', background: '#0b0d10', tertiary: '#1a1f14', font: '#eef1ea', sidebar: '#111418', surface: '#14171b', border: '#252a30', error: '#ff6b6b' } }
];
export const defaultTheme = () => ({ preset: 'default', tokens: { ...themePresets[0].tokens } });

/** The CSS variables a theme sets on the community page. */
export const themeStyle = theme => themeTokens.map(([key]) => `--cm-${key}:${theme?.tokens?.[key] || themePresets[0].tokens[key]}`).join(';');

/** Tabs of the community in the portal; the admin renames, hides and reorders them. */
export const communityTabKeys = [['discussion', 'Discussão'], ['academy', 'Academia'], ['events', 'Eventos'], ['members', 'Membros'], ['ranking', 'Ranking'], ['about', 'Sobre']];
export const defaultTabs = () => communityTabKeys.map(([key, label]) => ({ key, label, visible: true }));
/** Tabs saved before the Academia existed get it right after the discussion. */
export function withAcademyTab(tabs) {
  const list = [...(tabs || defaultTabs())];
  if (list.some(row => row?.key === 'academy')) return list;
  const at = list.findIndex(row => row?.key === 'discussion');
  list.splice(at + 1, 0, { key: 'academy', label: 'Academia', visible: true });
  return list;
}

/** Blocks of the community's right column; the owner shows, hides and orders them. */
export const widgetKeys = [['about', 'Sobre'], ['events', 'Próximos eventos'], ['ranking', 'Top do ranking'], ['members', 'Membros recentes']];
export const composerPromptDefault = 'Compartilhe algo com a comunidade…';
export const defaultLayout = () => ({ widgets: widgetKeys.map(([key]) => ({ key, visible: true })), composerPrompt: '' });

/** Badges given automatically. Engagement ones count the current quarter. */
export const badgeCatalog = [
  { key: 'moderator', label: 'Moderador', kind: 'unique', description: 'Membros com a função de moderador.' },
  { key: 'founder', label: 'Membro fundador', kind: 'unique', description: 'Os 10 primeiros membros da comunidade.' },
  { key: 'newcomer', label: 'Novo membro', kind: 'unique', description: 'Entrou nos últimos 30 dias.' },
  { key: 'streak', label: 'Sequência de 7 dias', kind: 'quarter', description: 'Publicou ou comentou em 7 dias seguidos neste trimestre.' },
  { key: 'commenter', label: 'Comentarista', kind: 'quarter', description: '20 comentários ou mais neste trimestre.' },
  { key: 'creator', label: 'Criador de conteúdo', kind: 'quarter', description: '10 publicações ou mais neste trimestre.' },
  { key: 'inspiring', label: 'Inspirador', kind: 'quarter', description: '25 curtidas recebidas ou mais neste trimestre.' }
];

/** Anti-spam starter pack: expressions that hold a post or comment for review. */
export const spamPack = ['ganhe dinheiro', 'renda extra garantida', 'dinheiro fácil', 'clique aqui', 'bitcoin', 'criptomoeda', 'aposta', 'cassino', 'bet ', 'seguidores grátis',
  'chama no whats', 'chame no whatsapp', 'wa.me/', 't.me/', 'promoção imperdível', 'empréstimo', 'pix grátis', 'link na bio'];

export const planIntervals = [['month', 'por mês', 'Mensal'], ['year', 'por ano', 'Anual'], ['once', 'pagamento único', 'Vitalício']];
export const planPrice = plan => `${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(plan.price)} ${planIntervals.find(([key]) => key === plan.interval)?.[1] || ''}`.trim();
export const weekdays = [['0', 'Domingo'], ['1', 'Segunda'], ['2', 'Terça'], ['3', 'Quarta'], ['4', 'Quinta'], ['5', 'Sexta'], ['6', 'Sábado']];
