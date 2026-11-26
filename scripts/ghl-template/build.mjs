// Gera os templates de setup convertidos das subcontas do GHL: setup-templates/<id>.json (ativos) e <id>.sites.json (páginas).
// Uso: node scripts/ghl-template/build.mjs <pasta-da-extração>
// A pasta vem da extração feita no navegador (<locationId>.json, triggers.json, surveys.json e pages/). Nada aqui fala com o GHL.
import { mkdirSync, writeFileSync } from 'node:fs';
import { coldEmailSpec, crewSystemsSpec, imobIaSpec, siteInteligenteSpec } from '../../setup-ghl-snapshots.mjs';
import { SITE_LIMITS } from '../../studio-site.mjs';
import { convert, loadSource } from './convert.mjs';
import { loadDictionary, mapAssets, mapPage, translator } from './traduzir.mjs';

const dir = process.argv[2];
if (!dir) { console.error('Informe a pasta da extração.'); process.exit(1); }
const out = new URL('../../setup-templates/', import.meta.url);
mkdirSync(out, { recursive: true });

/* ───────── Limpeza: nada de dados de agências ou empresas reais ───────── */

// Nos textos dos ativos (dentro de JSON: as trocas não levam aspas).
const assetScrub = [
  [/\[(?:HTC|CLIENT|CLIENTE|LEADS)\]\s*/g, ''],
  [/motivo_da_parceria_com_a_moon/g, 'motivo_da_parceria'],
  [/https:\/\/webhook\.digitalmoonbr\.com\/[^"\s\\]*/g, ''],
  [/Demo Go High Level/g, 'Demonstração'],
  [/Coastline Tree Service/g, 'Sua Empresa'],
  [/coastlinetree@gmail\.com/g, 'contato@suaempresa.com.br']
];
// No HTML das páginas.
const pageScrub = [
  ...assetScrub,
  [/<a\b[^>]*href="\/cdn-cgi\/l\/email-protection[^"]*"[^>]*>[\s\S]*?<\/a>/g, '<a href="mailto:contato@suaempresa.com.br">contato@suaempresa.com.br</a>'],
  [/<span\b[^>]*class="__cf_email__"[^>]*>[\s\S]*?<\/span>/g, 'contato@suaempresa.com.br'],
  // Widgets do GHL embutidos (avaliações etc.) levam o id da subconta de origem e não funcionam fora dele.
  [/<iframe\b[^>]*(?:leadconnectorhq|msgsndr|gohighlevel)[^>]*>[\s\S]*?<\/iframe>/gi, ''],
  // Marcador digitado errado no GHL, com uma chave só no fim: {{custom_values.biz_area_1}
  [/\{\{\s*custom_values\.(\w+)\s*\}(?!\})/g, '{{custom_values.$1}}'],
  [/href="https?:\/\/(?:www\.)?reviewharvest\.com[^"]*"/g, 'href="#"']
];
const scrubText = (text, rules) => rules.reduce((t, [rx, to]) => t.replace(rx, to), text);

// Nomes em português para os valores personalizados do site de serviços locais (as chaves ficam as do GHL).
const valueNames = {
  'Company Name': 'Nome da Empresa', 'Company Owner First Name': 'Nome do Proprietário', 'Company Email': 'E-mail da Empresa',
  'Company Phone (Aesthetic)': 'Telefone da Empresa (exibição)', 'Company Phone (Functional)': 'Telefone da Empresa (ligação)', 'Company Website Link': 'Site da Empresa',
  'Company Facebook Link': 'Facebook da Empresa', 'Company Instagram Link': 'Instagram da Empresa', 'Company GMB Link': 'Perfil no Google (GMB)', 'GMB Review Link': 'Link de Avaliação no Google',
  'Website Terms Page Link': 'Página de Termos do Site', 'Google Map Embed': 'Mapa do Google (embed)', 'Colors - Main': 'Cor Principal', 'Colors - Secondary': 'Cor Secundária',
  'Main Image URL': 'Imagem Principal (URL)', 'Broad Service Name': 'Nome Amplo do Serviço', 'Sub Headline Text': 'Subtítulo do Site', 'Discount % On Referral': 'Desconto por Indicação (%)',
  logo: 'Logo', 'Image Before': 'Imagem Antes', 'Imagem After': 'Imagem Depois', 'Company twilio phone': 'Telefone da Empresa (botão)', 'Main service area': 'Área Principal',
  'Logo image navigation': 'Logo do Menu', 'Home page url': 'Endereço da Página Inicial'
};
const valueName = name => valueNames[name] || name.replace(/^Service (\d+) Description$/, 'Descrição do Serviço $1').replace(/^Service (\d+)$/, 'Serviço $1').replace(/^Biz Area (\d+)$/, 'Área $1');
// The old hand-made setups used Portuguese keys; their texts follow the GHL keys of the same values.
const oldKeys = { nome_da_empresa: 'company_name', nome_do_proprietario: 'company_owner_first_name', e_mail_da_empresa: 'company_email', telefone_da_empresa_exibicao: 'company_phone_aesthetic',
  telefone_da_empresa_ligacao: 'company_phone_functional', site_da_empresa: 'company_website_link', link_de_avaliacao_no_google: 'gmb_review_link', nome_amplo_do_servico: 'broad_service_name' };
const followKeys = text => text.replace(/custom_values\.(\w+)/g, (all, key) => oldKeys[key] ? `custom_values.${oldKeys[key]}` : all);

/* ───────── Os 5 templates ───────── */

const byName = (list, row) => (list || []).some(item => item.name === row.name);
const add = (assets, key, rows) => { assets[key] = [...(assets[key] || []), ...rows.filter(row => !byName(assets[key], row))]; };

const templates = [
  {
    id: 'template-agencia-marketing-completa', location: 'gySKVnPk6FGwjrHYbzLe', prefix: 'ag', segment: 'agency', category: 'Agências e Marketing',
    title: 'Agência de Marketing: Captação, Vendas e Onboarding',
    tags: ['agência', 'captação', 'consultoria', 'onboarding', 'agente de ia'],
    summary: c => `A operação de uma agência de ponta a ponta: ${c.workflows} automações, ${c.agents} agentes de IA e ${c.studioProjects} sites e funis, do primeiro contato ao onboarding, NPS e renovação.`,
    description: c => `Captação em 6 canais (WhatsApp, Instagram, Messenger, formulário, Meta Ads e ligação perdida), funil de consultoria gratuita com qualificação, agendamento com confirmação e lembretes, recuperação de no-show, envio e follow-up de propostas, onboarding com formulário, contrato, call de onboarding e kickoff, e o pós-venda: NPS, avaliação no Google, aniversário, indicação e renovação. Vem com ${c.pipelines} pipelines (prospecção, onboarding e clientes ativos), ${c.customFields} campos do contrato e da qualificação, ${c.services} agendas, ${c.forms} formulários e pesquisas, ${c.agents} agentes de IA (conversão no WhatsApp, qualificação no Instagram e reserva) e ${c.studioProjects} sites e funis: onboarding de clientes, consultoria gratuita, agendamento via cold email e dois sites de agência. As automações chegam desligadas; revise mensagens, responsáveis e a URL do webhook antes de ligar.`,
    skipKnowledgeBases: [/Ianara/i, /F1 Imobi/i, /^Existing knowledge base/i]
  },
  {
    id: 'template-paisagismo-servicos-externos', location: 'TRimBcmTOcwNBhFnWghh', prefix: 'al', segment: 'home', category: 'Serviços Residenciais',
    title: 'Paisagismo e Serviços Externos: Sites, Avaliações e Indicações',
    tags: ['paisagismo', 'serviços locais', 'avaliações', 'indicações', 'site'],
    summary: c => `${c.studioProjects} sites prontos (${c.pages} páginas em português), ${c.workflows} automações de avaliação, indicação e reativação, chat do site e assistente de orçamentos com IA.`,
    description: c => `Para empresas de paisagismo, jardinagem e serviços externos. Traz o site completo do cliente (páginas de serviço, de região atendida, galeria, contato, termos e o funil de desconto por indicação), um segundo site de manutenção de gramados e a página de avaliação, traduzidos para o português e com os textos ligados aos valores personalizados: preencha nome da empresa, serviços, áreas e telefones e as ${c.pages} páginas se atualizam. As automações cuidam de confirmação de formulário e de mensagens (chat, Facebook, Instagram), ligação perdida, pedido e follow-up de avaliação, indicação de amigos com acompanhamento de 1 ano e reativação de base. Vem com ${c.customValues} valores personalizados, ${c.forms} formulários e pesquisas, ${c.chatWidgets} chats do site e um assistente de orçamentos com IA.`,
    supplement: assets => {
      const kb = crewSystemsSpec.assets.knowledgeBases.map(base => ({ ...base, id: 'al-kb-negocio' }));
      add(assets, 'knowledgeBases', JSON.parse(followKeys(JSON.stringify(kb))));
      const agents = crewSystemsSpec.assets.agents.map(agent => ({ ...agent, id: 'al-ag-orcamentos', name: 'Assistente de Orçamentos (IA)', baseRefs: ['al-kb-negocio'] }));
      add(assets, 'agents', JSON.parse(followKeys(JSON.stringify(agents)).replace(/Luxury Landscaping/g, '{{custom_values.company_name}}')));
    }
  },
  {
    id: 'template-site-servicos-locais', location: 'CMWMTj2jO4UwO0j3dEsW', prefix: 'si', segment: 'home', category: 'Negócios Locais',
    title: 'Site Inteligente para Serviços Locais: Páginas por Serviço e Região',
    tags: ['site', 'serviços locais', 'seo local', 'avaliações', 'indicações'],
    summary: c => `Site de ${c.pages} páginas em português montado pelos valores personalizados: uma página por serviço e por região atendida, mais ${c.workflows} automações de leads, avaliações e indicações.`,
    description: c => `O site tem página inicial, ${c.pages} páginas no total (12 de serviço, 14 de região atendida, galeria, contato, avaliação, termos, privacidade e o funil de desconto por indicação) e os textos vêm dos valores personalizados: preencha nome da empresa, serviço principal, serviços 1 a 12 e áreas 1 a 14 e o site inteiro se ajusta, bom para SEO local. As automações respondem formulários, chat, Facebook e Instagram, recuperam ligações perdidas, pedem e acompanham avaliações, tratam feedback negativo, pedem indicações e reativam a base. Vem com ${c.customValues} valores personalizados, ${c.forms} formulários e pesquisas, chat do site e base de conhecimento.`,
    supplement: assets => {
      add(assets, 'chatWidgets', siteInteligenteSpec.assets.chatWidgets.map(chat => ({ ...chat, id: 'si-chat-site' })));
      add(assets, 'knowledgeBases', JSON.parse(followKeys(JSON.stringify(siteInteligenteSpec.assets.knowledgeBases.map(base => ({ ...base, id: 'si-kb-negocio' }))))));
    }
  },
  {
    id: 'template-imobiliaria-agente-ia', location: 'dj65rS1ognaXvbJputQQ', prefix: 'im', segment: 'realestate', category: 'Imobiliário',
    title: 'Imobiliária com Agente de IA: Qualificação e Visitas',
    tags: ['imobiliária', 'agente de ia', 'qualificação', 'visitas', 'whatsapp'],
    summary: () => 'A Sofia, agente de IA que qualifica compradores, locatários e investidores e agenda visitas com o corretor, com pipeline, automações, agendas e base de conhecimento.',
    description: () => 'A Sofia atende no WhatsApp e no chat, entende a necessidade (compra, venda, aluguel ou investimento), o perfil do imóvel e a faixa de valor, capta os dados e agenda visita ou call com o corretor. As automações confirmam a visita e avisam o corretor, passam o lead quente para a região certa e retomam quem parou de responder. Os dados da imobiliária de origem (endereços, CRECI, telefones e empreendimentos) foram trocados por campos a preencher na base de conhecimento e nos valores personalizados.',
    // O agente do GHL tem os dados de uma imobiliária real; o setup antigo já tinha a mesma Sofia com esses dados trocados por campos.
    base: () => structuredClone(imobIaSpec.assets),
    keep: ['tags']
  },
  {
    id: 'template-cold-email-ab', location: 'yeQdZkg7Y8wHQyvfmU9V', prefix: 'ce', segment: 'agency', category: 'B2B e SaaS',
    title: 'Cold Email com Teste A/B: 5 E-mails até a Reunião',
    tags: ['cold email', 'prospecção', 'teste a/b', 'b2b', 'reuniões'],
    summary: () => 'Sequência de 5 e-mails frios, cada um com duas versões sorteadas meio a meio, e o pipeline que leva quem responde até a reunião agendada.',
    description: () => 'A sequência manda 5 e-mails com 1 dia entre eles; em cada envio, metade dos contatos recebe a versão A e metade a B, para você comparar assunto e texto. Quem responde sai da sequência, ganha uma oportunidade em "Lead Respondeu" e a equipe é avisada; quem agenda vai para "Reunião agendada". Para começar, adicione a tag cold-email aos contatos da lista. Preencha remetente, oferta, case e link de agendamento nos valores personalizados.',
    supplement: assets => {
      add(assets, 'customValues', coldEmailSpec.assets.customValues.map(row => ({ ...row, id: `ce-${row.id}` })));
      add(assets, 'services', coldEmailSpec.assets.services.map(row => ({ ...row, id: 'ce-sv-reuniao' })));
      const sequence = assets.workflows.find(w => /^Cold Email Workflow/.test(w.name));
      if (sequence && !sequence.triggers.length) sequence.triggers.push({ id: 'cetcoldemail1', type: 'contact_tag', config: { change: 'added', tag: 'cold-email' } });
    }
  }
];

/* ───────── Tradução ───────── */

// Tudo o que o cliente vê sai em português: textos das páginas, nomes de páginas e sites, formulários, tags e mensagens.
// O dicionário (traducao-pt.json) é revisado à mão; `node scripts/ghl-template/textos.mjs` lista o que ainda faltar.
const tr = translator(loadDictionary());
const slugify = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'pagina';

function translate(assets, sites) {
  assets = mapAssets(assets, text => tr(text));
  sites = Object.fromEntries(Object.entries(sites).map(([projectId, pages]) => [projectId, pages.map(page => ({ ...page, name: tr(page.name) ?? page.name, html: mapPage(page.html, tr) }))]));
  // Endereços das páginas pelo nome em português; os links page:<endereço> e os destinos dos formulários acompanham.
  const moved = {};
  for (const [projectId, pages] of Object.entries(sites)) {
    const used = new Set(['index']);
    const map = moved[projectId] = {};
    for (const page of pages) {
      if (page.slug === 'index') continue;
      const base = slugify(page.name);
      let slug = base;
      for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
      used.add(slug);
      map[page.slug] = slug;
    }
    for (const page of pages) {
      page.html = page.html.replace(/page:([A-Za-z0-9_-]+)/g, (all, slug) => map[slug] ? `page:${map[slug]}` : all);
      page.slug = map[page.slug] || page.slug;
    }
  }
  const walk = value => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!value || typeof value !== 'object') return;
    if (value.action === 'page' && moved[value.siteId]?.[value.page]) value.page = moved[value.siteId][value.page];
    Object.values(value).forEach(walk);
  };
  walk(assets);
  for (const project of assets.studioProjects || []) for (const page of project.pages || []) {
    const pages = sites[project.id] || [];
    const twin = pages.find(p => p.slug === (moved[project.id]?.[page.slug] || page.slug));
    if (twin) { page.slug = twin.slug; page.name = twin.name; }
  }
  return { assets, sites };
}

/* ───────── Geração ───────── */

const count = (assets, sites) => ({ ...Object.fromEntries(Object.entries(assets).map(([key, list]) => [key, list.length])), pages: Object.values(sites).reduce((n, pages) => n + pages.length, 0) });
const index = [];
for (const t of templates) {
  const converted = convert(loadSource(dir, t.location), { prefix: t.prefix, skipKnowledgeBases: t.skipKnowledgeBases || [/^Existing knowledge base/i] });
  let assets = converted.assets;
  if (t.base) {
    const base = t.base();
    for (const key of t.keep || []) add(base, key, assets[key] || []);
    assets = base;
  }
  t.supplement?.(assets);
  for (const row of assets.customValues || []) row.name = valueName(row.name);
  // Um chat do site iniciado sem chat escolhido aponta para o chat do template.
  for (const workflow of assets.workflows || []) for (const trigger of workflow.triggers) if (trigger.type === 'chat_started' && !trigger.config.widgetId) trigger.config.widgetId = assets.chatWidgets?.[0]?.id || '';
  assets = JSON.parse(scrubText(JSON.stringify(assets), assetScrub));
  let sites = t.base ? {} : Object.fromEntries(Object.entries(converted.sites).map(([projectId, pages]) => [projectId, pages.map(page => ({ ...page, name: scrubText(page.name, assetScrub), html: scrubText(page.html, pageScrub) }))]));
  if (t.base) delete assets.studioProjects;
  ({ assets, sites } = translate(assets, sites));
  for (const [projectId, pages] of Object.entries(sites)) {
    if (pages.length > SITE_LIMITS.pages) throw new Error(`${t.id}: o site ${projectId} tem ${pages.length} páginas (limite ${SITE_LIMITS.pages}).`);
    for (const page of pages) if (page.html.length > SITE_LIMITS.html) throw new Error(`${t.id}: a página ${page.name} tem ${page.html.length} caracteres (limite ${SITE_LIMITS.html}).`);
  }
  const c = count(assets, sites);
  const spec = { id: t.id, template: true, segment: t.segment, title: t.title, summary: t.summary(c), description: t.description(c), category: t.category, tags: t.tags, publishedAt: '2026-11-26T12:00:00.000Z', assets };
  writeFileSync(new URL(`${t.id}.json`, out), JSON.stringify(spec));
  if (Object.keys(sites).length) writeFileSync(new URL(`${t.id}.sites.json`, out), JSON.stringify(sites));
  index.push(t.id);
  const size = name => Math.round(JSON.stringify(name).length / 1024);
  console.log(`${t.id}: ${Object.entries(c).map(([k, v]) => `${k} ${v}`).join(', ')} · ativos ${size(assets)} KB · páginas ${size(sites)} KB`);
  for (const text of converted.notes) console.log(`   nota: ${text}`);
}
writeFileSync(new URL('index.json', out), `${JSON.stringify(index, null, 2)}\n`);
