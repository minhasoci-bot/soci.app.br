export const PRESENTATION_LAYOUTS = [
  'cover',
  'pain',
  'solution',
  'services',
  'sales',
  'bundle',
  'process',
  'blank'
];

export const PRESENTATION_ICONS = [
  { id: 'i-browser', label: 'Navegador / Site' },
  { id: 'i-search', label: 'Busca / Lupa' },
  { id: 'i-people', label: 'Pessoas / Leads' },
  { id: 'i-chart', label: 'Gráfico / Crescimento' },
  { id: 'i-alert', label: 'Alerta / Atenção' },
  { id: 'i-globe', label: 'Globo / Alcance' },
  { id: 'i-tag', label: 'Etiqueta / Oferta' },
  { id: 'i-crm', label: 'CRM / Gestão' },
  { id: 'i-mobile', label: 'Celular / App' },
  { id: 'i-plussearch', label: 'Busca Avançada' },
  { id: 'star', label: 'Estrela / Avaliação' }
];

export function canonicalSymbolsSvg() {
  return `<svg class="brand-symbols" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden">
    <symbol id="i-browser" viewBox="0 0 48 48"><rect x="6" y="7" width="36" height="32" rx="4" stroke="currentColor" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 15h36" stroke="currentColor" fill="none" stroke-width="2.4"/><path d="M12 11h1m5 0h1" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path class="accent-part" d="M14 24h15m-15 7h9" stroke="var(--orange,#f65b00)" stroke-width="2.4" stroke-linecap="round"/></symbol>
    <symbol id="i-search" viewBox="0 0 48 48"><circle cx="21" cy="20" r="12" stroke="currentColor" fill="none" stroke-width="2.4"/><path class="accent-part" d="m30 30 10 10" stroke="var(--orange,#f65b00)" stroke-width="2.4" stroke-linecap="round"/></symbol>
    <symbol id="i-people" viewBox="0 0 48 48"><circle cx="17" cy="15" r="6" stroke="currentColor" fill="none" stroke-width="2.4"/><path d="M6 35v-3c0-7 5-11 11-11s11 4 11 11v3" stroke="currentColor" fill="none" stroke-width="2.4" stroke-linecap="round"/><circle class="accent-part" cx="36" cy="12" r="4.5" stroke="var(--orange,#f65b00)" fill="none" stroke-width="2.4"/></symbol>
    <symbol id="i-chart" viewBox="0 0 48 48"><path d="M7 38V12m0 26h35m-26-3V24m10 11V18m10 17V10" stroke="currentColor" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path class="accent-part" d="m8 20 12 1 9-9 11-7" stroke="var(--orange,#f65b00)" fill="none" stroke-width="2.4" stroke-linecap="round"/></symbol>
    <symbol id="i-alert" viewBox="0 0 48 48"><path class="accent-part" d="M24 6 44 41H4L24 6Z" stroke="var(--orange,#f65b00)" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 17v12m0 6h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></symbol>
    <symbol id="i-globe" viewBox="0 0 48 48"><circle cx="24" cy="24" r="18" stroke="currentColor" fill="none" stroke-width="2.4"/><path d="M6 24h36M24 6c-12 9-12 27 0 36m0-36c12 9 12 27 0 36" stroke="currentColor" fill="none" stroke-width="2.4"/><path class="accent-part" d="M24 7v34" stroke="var(--orange,#f65b00)" stroke-width="2.4"/></symbol>
    <symbol id="i-tag" viewBox="0 0 48 48"><path d="M6 13h28l10 11-10 11H6V13Z" stroke="currentColor" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path class="accent-part" d="M14 24h14" stroke="var(--orange,#f65b00)" stroke-width="2.4" stroke-linecap="round"/></symbol>
    <symbol id="i-crm" viewBox="0 0 48 48"><rect x="8" y="5" width="32" height="38" rx="4" stroke="currentColor" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path class="accent-part" d="M15 15h16m-16 8h12m-12 8h17" stroke="var(--orange,#f65b00)" stroke-width="2.4" stroke-linecap="round"/></symbol>
    <symbol id="i-mobile" viewBox="0 0 48 48"><rect x="12" y="3" width="24" height="42" rx="3" stroke="currentColor" fill="none" stroke-width="2.4"/><path class="accent-part" d="M20 11h8" stroke="var(--orange,#f65b00)" stroke-width="2.4" stroke-linecap="round"/><path d="M22 38h4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></symbol>
    <symbol id="i-plussearch" viewBox="0 0 48 48"><circle cx="20" cy="20" r="14" stroke="currentColor" fill="none" stroke-width="2.4"/><path d="m31 31 12 12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path class="accent-part" d="M20 12v16m-8-8h16" stroke="var(--orange,#f65b00)" stroke-width="2.4" stroke-linecap="round"/></symbol>
  </svg>`;
}

export function defaultBrandSvgMark(primary = '#0b315c', accent = '#f65b00') {
  return `<svg class="brand-mark" viewBox="0 0 48 48" aria-hidden="true"><rect x="1" y="1" width="45" height="45" fill="${primary}"/><rect x="24" y="1" width="22" height="20" fill="${accent}"/><path d="M8 15h17v-7h7v15H16v10h20v7H9V25H3v-7h5Z" fill="#fff"/><rect x="28" y="26" width="11" height="7" fill="#fff"/></svg>`;
}

export function createCanonicalPresentationTemplates(company = {}) {
  const agencyName = company.name || 'CrewSystems';
  const agencyLogo = company.logo || '';
  const primaryColor = company.primary || '#0b315c';
  const accentColor = company.secondary || '#f65b00';

  return [
    {
      id: 'template-crewsystems',
      title: 'CrewSystems — Apresentação Comercial',
      description: 'Modelo canônico oficial para propostas e fechamento de serviços: Capa de impacto, 5 gargalos, solução em marketing e vendas, pacotes e etapas de onboarding.',
      category: 'commercial',
      agencyName,
      agencyLogo,
      primaryColor: '#0b315c',
      accentColor: '#f65b00',
      slides: [
        {
          id: 'slide-1',
          layout: 'cover',
          eyebrow: agencyName,
          headline: 'Como contractors brasileiros\nnos EUA estão fechando mais jobs\natravés do <span class="accent">ChatGPT</span> e do Google\npor <span class="accent">$297/mês</span>.',
          rule: false,
          pills: [
            'Sem contrato de longo prazo',
            'Sem taxa de implementação',
            'Sem gastar com tráfego pago'
          ],
          footer: 'PARA CONTRACTORS BRASILEIROS NOS EUA'
        },
        {
          id: 'slide-2',
          layout: 'pain',
          eyebrow: 'Situação atual',
          headline: 'Os cinco gargalos.',
          rule: true,
          items: [
            { icon: 'i-browser', text: 'Site arcaico e sem conversão' },
            { icon: 'i-search', text: 'Pouca presença online' },
            { icon: 'i-people', text: 'Depende de indicação — ou de ser subcontractor' },
            { icon: 'i-chart', text: 'Nenhum sistema comercial' },
            { icon: 'i-alert', text: 'Começam a rodar anúncio antes da hora' }
          ],
          footer: 'O PROBLEMA'
        },
        {
          id: 'slide-3',
          layout: 'solution',
          eyebrow: 'A solução',
          headline: 'Como a gente resolve\ntodos esses gargalos\npor <span class="accent">$297/mês</span>.',
          rule: false,
          cards: [
            { icon: 'i-globe', title: 'Marketing', desc: 'O cliente te acha', accent: false },
            { icon: 'i-tag', title: 'Vendas', desc: 'Nenhum cliente fica sem resposta', accent: true }
          ],
          footer: 'UMA SOLUÇÃO COMPLETA'
        },
        {
          id: 'slide-4',
          layout: 'services',
          eyebrow: 'Parte 1',
          headline: 'Marketing.',
          rule: true,
          cards: [
            { icon: 'i-browser', title: 'Reconstrução completa\ndo site', desc: 'Feito para celular e para converter.' },
            { icon: 'i-plussearch', title: 'Otimização contínua\npara Google e ChatGPT', desc: 'Aparecer na busca de hoje e na busca com IA.' },
            { icon: 'star', title: 'Sistema de reviews 5\nestrelas', desc: 'No automático, com filtro para nota baixa.' }
          ],
          footer: 'PARTE 1 — ATRAÇÃO'
        },
        {
          id: 'slide-5',
          layout: 'sales',
          eyebrow: 'Parte 2',
          headline: 'Vendas.',
          rule: true,
          cards: [
            { icon: 'i-crm', title: 'CRM completo', desc: 'Todo lead num lugar só, com follow up automático — no seu celular.', accent: false },
            { icon: 'i-crm', title: 'Secretária virtual\namericana', desc: 'Atende, responde na hora e acompanha pedidos — em inglês, no nome da sua empresa.', accent: true }
          ],
          footer: 'PARTE 2 — CONVERSÃO'
        },
        {
          id: 'slide-6',
          layout: 'bundle',
          eyebrow: 'O que você recebe por $297/mês',
          headline: 'Tudo isso, junto.',
          rule: true,
          cards: [
            { icon: 'i-browser', title: 'Site novo que\nconverte' },
            { icon: 'i-search', title: 'Google +\nChatGPT' },
            { icon: 'star', title: 'Reviews 5\nestrelas' },
            { icon: 'i-crm', title: 'CRM e follow\nup' },
            { icon: 'i-mobile', title: 'Secretária\nvirtual' }
          ],
          pills: [
            'Tudo no nome da sua empresa',
            'A gente monta e cuida',
            '$297/mês'
          ],
          footer: 'UMA MENSALIDADE, TUDO INCLUSO'
        },
        {
          id: 'slide-7',
          layout: 'process',
          eyebrow: 'Como funciona',
          headline: 'Quatro passos.',
          rule: true,
          steps: [
            { number: '1', title: 'Reunião rápida de onboarding', desc: '' },
            { number: '2', title: 'Desenvolvimento completo em até 10 dias úteis', desc: '' },
            { number: '3', title: '$297/mês — sem contrato, sem taxa de implementação', desc: 'Você continua só enquanto estiver feliz.' },
            { number: '4', title: 'Depois, se quiser, a gente joga mais lenha na fogueira', desc: 'Quando o sistema já estiver te trazendo trabalho no orgânico.' }
          ],
          footer: 'SIMPLIFICAMOS O PROCESSO'
        }
      ]
    },
    {
      id: 'template-proposta-estrategica',
      title: 'Diagnóstico & Proposta Estratégica',
      description: 'Estrutura para apresentar diagnóstico de maturidade digital, posicionamento, entregáveis recomendados e cronograma de implementação.',
      category: 'strategy',
      agencyName,
      agencyLogo,
      primaryColor,
      accentColor,
      slides: [
        {
          id: 'st-1',
          layout: 'cover',
          eyebrow: agencyName,
          headline: 'Plano de Aceleração Digital\ne Aquisição Previsível de Clientes.',
          rule: false,
          pills: ['Diagnóstico Operacional', 'Estrutura Comercial', 'Escala Previsível'],
          footer: 'APRESENTAÇÃO EXECUTIVA'
        },
        {
          id: 'st-2',
          layout: 'pain',
          eyebrow: 'Cenário e Diagnóstico',
          headline: 'Onde o faturamento está escapando.',
          rule: true,
          items: [
            { icon: 'i-alert', text: 'Atendimento lento e sem padrão de resposta' },
            { icon: 'i-people', text: 'Perda de contatos qualificados sem follow-up ativo' },
            { icon: 'i-chart', text: 'Falta de previsibilidade na receita mês a mês' },
            { icon: 'i-browser', text: 'Página sem foco em conversão imediata' }
          ],
          footer: 'DIAGNÓSTICO INICIAL'
        },
        {
          id: 'st-3',
          layout: 'solution',
          eyebrow: 'Os Dois Motores',
          headline: 'A estratégia de dois eixos para crescer com solidez.',
          rule: false,
          cards: [
            { icon: 'i-globe', title: 'Tração & Posicionamento', desc: 'Atrair compradores prontos com autoridade imediata.', accent: false },
            { icon: 'i-crm', title: 'Máquina de Conversão', desc: 'Automação inteligente e atendimento que fecha negócios.', accent: true }
          ],
          footer: 'ESTRATÉGIA'
        },
        {
          id: 'st-4',
          layout: 'process',
          eyebrow: 'Próximos Passos',
          headline: 'Como iniciamos nossa parceria.',
          rule: true,
          steps: [
            { number: '1', title: 'Assinatura e alinhamento de kickoff', desc: 'Coleta de acessos e definição dos primeiros marcos.' },
            { number: '2', title: 'Setup e implementação dos canais', desc: 'Configuração dos fluxos em até 7 dias úteis.' },
            { number: '3', title: 'Lançamento e acompanhamento semanal', desc: 'Otimização contínua baseada em dados reais de vendas.' }
          ],
          footer: 'CRONOGRAMA DE AÇÃO'
        }
      ]
    }
  ];
}

export function createBlankPresentation(company = {}) {
  const title = company.name || company.title || 'Nova Apresentação';
  const agencyName = company.agencyName || company.name || 'Minha Agência';
  const agencyLogo = company.agencyLogo || company.logo || '';
  const primaryColor = company.primaryColor || company.primary || '#0b315c';
  const accentColor = company.accentColor || company.secondaryColor || company.secondary || '#f65b00';

  return {
    id: `pres-${Date.now()}`,
    name: title,
    title,
    description: 'Apresentação comercial e proposta de serviços.',
    agencyName,
    agencyLogo,
    primaryColor,
    accentColor,
    secondaryColor: accentColor,
    slides: [
      {
        id: 'slide-1',
        layout: 'cover',
        eyebrow: agencyName,
        headline: 'Apresentação Comercial\ne Proposta de Serviços.',
        rule: false,
        pills: ['Solução Completa', 'Sem Contrato Amarrado', 'Implementação Rápida'],
        footer: 'PROPOSTA COMERCIAL'
      },
      {
        id: 'slide-2',
        layout: 'pain',
        eyebrow: 'O Cenário Atual',
        headline: 'Os principais desafios identificados.',
        rule: true,
        items: [
          { icon: 'i-browser', text: 'Canais digitais desatualizados' },
          { icon: 'i-people', text: 'Atendimento manual e sem registro de leads' },
          { icon: 'i-chart', text: 'Pouca previsibilidade de novos contratos' }
        ],
        footer: 'DIAGNÓSTICO'
      },
      {
        id: 'slide-3',
        layout: 'solution',
        eyebrow: 'A Solução',
        headline: 'Como transformamos esses desafios em resultado.',
        rule: false,
        cards: [
          { icon: 'i-globe', title: 'Atração Inteligente', desc: 'Presença onde seus melhores clientes procuram.', accent: false },
          { icon: 'i-crm', title: 'Conversão Ágil', desc: 'Agilidade comercial para não perder oportunidades.', accent: true }
        ],
        footer: 'A SOLUÇÃO'
      }
    ]
  };
}

export function createPresentationFromTemplate(templateId, company = {}) {
  const templates = createCanonicalPresentationTemplates(company);
  const found = templates.find(t => t.id === templateId) || templates[0];
  const blank = createBlankPresentation(company);

  return {
    ...blank,
    id: `pres-${Date.now()}`,
    name: found.title,
    title: found.title,
    description: found.description,
    agencyName: company.agencyName || company.name || found.agencyName,
    agencyLogo: company.agencyLogo || company.logo || found.agencyLogo,
    primaryColor: company.primaryColor || found.primaryColor || company.primary || '#0b315c',
    accentColor: company.accentColor || company.secondaryColor || found.accentColor || company.secondary || '#f65b00',
    secondaryColor: company.accentColor || company.secondaryColor || found.accentColor || company.secondary || '#f65b00',
    slides: JSON.parse(JSON.stringify(found.slides))
  };
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function formatHeadline(raw) {
  if (!raw) return '';
  if (/<span\b[^>]*>/i.test(raw)) {
    return raw.replace(/\n/g, '<br>');
  }
  const escaped = escapeHtml(raw);
  return escaped.replace(/\*([^*]+)\*/g, '<span class="accent">$1</span>').replace(/\n/g, '<br>');
}

export function renderSlideInnerHtml(slide, index, total, presentation) {
  const currentNum = String(index + 1).padStart(2, '0');
  const totalNum = String(total).padStart(2, '0');
  const footerTag = slide.footer ? escapeHtml(slide.footer) : '';
  const eyebrowText = slide.eyebrow ? escapeHtml(slide.eyebrow) : escapeHtml(presentation.agencyName);
  const headlineHtml = formatHeadline(slide.headline);
  const ruleHtml = slide.rule ? '<span class="rule"></span>' : '';

  let bodyContent = '';

  switch (slide.layout) {
    case 'cover': {
      const pillsHtml = (slide.pills || []).map(p => `<span class="pill">${escapeHtml(p)}</span>`).join('');
      bodyContent = `
        <div class="cover-inner">
          <p class="eyebrow">${eyebrowText}</p>
          <h1 class="headline">${headlineHtml}</h1>
          ${pillsHtml ? `<div class="pills" aria-label="Destaques">${pillsHtml}</div>` : ''}
        </div>
      `;
      break;
    }

    case 'pain': {
      const itemsHtml = (slide.items || []).map(item => `
        <li>
          <span class="pain-icon"><svg class="ico icon-pair"><use href="#${escapeHtml(item.icon)}"/></svg></span>
          <span>${escapeHtml(item.text)}</span>
        </li>
      `).join('');
      bodyContent = `
        <div class="section-top">
          <p class="eyebrow">${eyebrowText}</p>
          <h2 class="section-headline">${headlineHtml}</h2>
          ${ruleHtml}
          <ul class="pain-list">${itemsHtml}</ul>
        </div>
      `;
      break;
    }

    case 'solution': {
      const cardsHtml = (slide.cards || []).map(c => `
        <div class="duo-card ${c.accent ? 'orange-bar' : ''}">
          <svg class="ico icon-pair"><use href="#${escapeHtml(c.icon)}"/></svg>
          <h3>${formatHeadline(c.title)}</h3>
          <p>${escapeHtml(c.desc)}</p>
        </div>
      `).join('');
      bodyContent = `
        <div class="section-top">
          <p class="eyebrow">${eyebrowText}</p>
          <h2 class="headline">${headlineHtml}</h2>
          <div class="duo-grid">${cardsHtml}</div>
        </div>
      `;
      break;
    }

    case 'services': {
      const cardsHtml = (slide.cards || []).map(c => {
        const isStar = c.icon === 'star';
        const iconHtml = isStar ? `<span class="star-icon" aria-hidden="true">★</span>` : `<svg class="ico icon-pair"><use href="#${escapeHtml(c.icon)}"/></svg>`;
        return `
          <div class="service-card">
            ${iconHtml}
            <h3>${formatHeadline(c.title)}</h3>
            <p>${escapeHtml(c.desc)}</p>
          </div>
        `;
      }).join('');
      bodyContent = `
        <div class="section-top">
          <p class="eyebrow">${eyebrowText}</p>
          <h2 class="section-headline">${headlineHtml}</h2>
          ${ruleHtml}
          <div class="services-grid">${cardsHtml}</div>
        </div>
      `;
      break;
    }

    case 'sales': {
      const cardsHtml = (slide.cards || []).map(c => `
        <div class="sales-card ${c.accent ? 'orange-bar' : ''}">
          <svg class="ico icon-pair"><use href="#${escapeHtml(c.icon)}"/></svg>
          <h3>${formatHeadline(c.title)}</h3>
          <p>${escapeHtml(c.desc)}</p>
        </div>
      `).join('');
      bodyContent = `
        <div class="section-top">
          <p class="eyebrow">${eyebrowText}</p>
          <h2 class="section-headline">${headlineHtml}</h2>
          ${ruleHtml}
          <div class="sales-grid">${cardsHtml}</div>
        </div>
      `;
      break;
    }

    case 'bundle': {
      const cardsHtml = (slide.cards || []).map(c => {
        const isStar = c.icon === 'star';
        const iconHtml = isStar ? `<span class="star-icon" aria-hidden="true">★</span>` : `<svg class="ico icon-pair"><use href="#${escapeHtml(c.icon)}"/></svg>`;
        return `
          <div class="bundle-card">
            ${iconHtml}
            <h3>${formatHeadline(c.title)}</h3>
          </div>
        `;
      }).join('');
      const pillsHtml = (slide.pills || []).map(p => `<span class="pill">${escapeHtml(p)}</span>`).join('');
      bodyContent = `
        <div class="section-top">
          <p class="eyebrow">${eyebrowText}</p>
          <h2 class="section-headline">${headlineHtml}</h2>
          ${ruleHtml}
          <div class="bundle-grid">${cardsHtml}</div>
          ${pillsHtml ? `<div class="pills">${pillsHtml}</div>` : ''}
        </div>
      `;
      break;
    }

    case 'process': {
      const stepsHtml = (slide.steps || []).map(st => `
        <li class="step">
          <span class="step-number">${escapeHtml(st.number)}</span>
          <div class="step-content">
            <div class="step-title">${formatHeadline(st.title)}</div>
            ${st.desc ? `<p class="step-desc">${escapeHtml(st.desc)}</p>` : ''}
          </div>
        </li>
      `).join('');
      bodyContent = `
        <div class="section-top">
          <p class="eyebrow">${eyebrowText}</p>
          <h2 class="section-headline">${headlineHtml}</h2>
          ${ruleHtml}
          <ol class="steps">${stepsHtml}</ol>
        </div>
      `;
      break;
    }

    case 'blank':
    default: {
      bodyContent = `
        <div class="section-top">
          <p class="eyebrow">${eyebrowText}</p>
          <h2 class="section-headline">${headlineHtml}</h2>
          ${ruleHtml}
          <div class="blank-body" style="margin-top:35px;font-size:24px;line-height:1.6;color:var(--muted);max-width:980px;">
            ${(slide.items || []).map(it => `<p style="margin:12px 0;">${escapeHtml(it.text)}</p>`).join('')}
          </div>
        </div>
      `;
      break;
    }
  }

  // Brand Header
  const brandLogoHtml = presentation.agencyLogo
    ? `<img class="brand-mark-img" src="${escapeHtml(presentation.agencyLogo)}" alt="${escapeHtml(presentation.agencyName)}" style="height:40px;width:auto;max-width:140px;object-fit:contain;">`
    : defaultBrandSvgMark(presentation.primaryColor, presentation.accentColor);

  return `
    <div class="brand" aria-label="${escapeHtml(presentation.agencyName)}">
      ${brandLogoHtml}
      <span class="brand-text">${escapeHtml(presentation.agencyName)}</span>
    </div>
    ${bodyContent}
    <div class="slide-footer">
      <span>${footerTag}</span>
      <span class="slide-number">${currentNum} / ${totalNum}</span>
    </div>
  `;
}
