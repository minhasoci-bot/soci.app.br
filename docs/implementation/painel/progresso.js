/*
 * PAINEL DE PROGRESSO — Paridade Soci × GoHighLevel
 * ---------------------------------------------------------------
 * Fonte única do status do plano. A página index.html (mesma pasta) lê este arquivo.
 * Plano completo: ../04-paridade-gohighlevel.md · Catálogo técnico: ../04c-ghl-catalogo-tecnico.md
 *
 * COMO O CONSTRUTOR ATUALIZA (a cada item iniciado ou concluído):
 *   1. Mude `status` do item: "pendente" → "andamento" → "feito".
 *      Outros valores: "bloqueado" (cite a decisão em `nota`) e "fora" (fora do escopo).
 *   2. Ao concluir, preencha `entrega` (arquivos, commit ou PR) e `data` ("AAAA-MM-DD").
 *   3. Aponte `etapaAtual` para o id do próximo item a fazer.
 *   4. Atualize `atualizadoEm` e acrescente uma linha NO TOPO de `historico`.
 *   5. Decisão tomada pelo usuário: mude a decisão para status "decidida", registre a escolha em `resposta`
 *      e desbloqueie os itens que dependiam dela.
 * Siga a ordem das fases, salvo instrução do usuário. Não marque "feito" sem a entrega verificada.
 * Regras para todo item: ver `regras` abaixo.
 */
window.PLANO_SOCI = {
  titulo: "Paridade Soci × GoHighLevel",
  atualizadoEm: "2026-11-20",
  etapaAtual: "1.6",

  regras: [
    "Front-end sempre em ui/ (nunca copiar public/ por cima de ui/).",
    "Toda funcionalidade nova nasce com gatilho e ação no motor de workflows quando fizer sentido.",
    "Textos em pt-BR e es (i18n), respeitando o modelo de permissões (authorization.mjs).",
    "Recriar comportamento e organização, não a marca: nomes, textos e visual são da Soci.",
    "Consultar o catálogo técnico (04c) antes de desenhar cada módulo: telas, campos, APIs e construtores do GHL estão lá."
  ],

  decisoes: [
    { id: "D1", titulo: "Provedor de telefonia e Voice AI", status: "pendente",
      opcoes: "Twilio, Zenvia ou outro", bloqueia: ["2.4", "3.2", "6b.9"], resposta: "" },
    { id: "D2", titulo: "Modelo de cobrança do app mobile white-label", status: "pendente",
      opcoes: "Assinatura por agência (como no GHL, US$ 497/mês), incluso em plano ou outro", bloqueia: ["6.6"], resposta: "" },
    { id: "D3", titulo: "Commitar os documentos do levantamento separados das outras mudanças da branch feat/offers", status: "pendente",
      opcoes: "Commit só dos docs ou nova branch de docs", bloqueia: [], resposta: "" },
    { id: "D4", titulo: "Upload de PDF com campos sobrepostos já no editor (1.2)?", status: "decidida",
      opcoes: "Recomendado: não. O PDF entra como bloco anexo e a sobreposição vira item próprio depois do 1.4 (ver 05 §11)", bloqueia: [],
      resposta: "Seguir a recomendação: PDF como bloco anexo; sobreposição depois do 1.4 (usuário, 2026-11-20)." },
    { id: "D5", titulo: "Código de verificação por e-mail antes de assinar", status: "decidida",
      opcoes: "Recomendado: opcional por documento, desligado por padrão (ver 05 §7.5)", bloqueia: [],
      resposta: "Seguir a recomendação: opcional por documento, desligado por padrão (usuário, 2026-11-20)." }
  ],

  fases: [
    {
      id: "0", nome: "Levantamento do GHL", objetivo: "Mapear telas, APIs, workflows e construtores para servir de referência.",
      itens: [
        { id: "0.1", titulo: "Mapear menus da agência e da subconta", status: "feito", ref: "04 §1–2", data: "2026-11-20", entrega: "docs/implementation/04-paridade-gohighlevel.md" },
        { id: "0.2", titulo: "Registro de 122 micro-apps (código via Chrome CDP + REA)", status: "feito", ref: "04 §2.5 · 04b", data: "2026-11-20", entrega: "docs/implementation/04b-ghl-microapps.txt" },
        { id: "0.3", titulo: "Crawl de 142 telas: micro-apps e cerca de 875 endpoints", status: "feito", ref: "04c §2", data: "2026-11-20", entrega: "04c-ghl-catalogo-tecnico.md" },
        { id: "0.4", titulo: "Catálogo de workflows: 116 gatilhos e 180 ações, mais 24 apps", status: "feito", ref: "04c §1", data: "2026-11-20", entrega: "04c-ghl-catalogo-tecnico.md" },
        { id: "0.5", titulo: "Interface de 141 telas (abas, colunas, ações, campos)", status: "feito", ref: "04c §3", data: "2026-11-20", entrega: "04c-ghl-catalogo-tecnico.md" },
        { id: "0.6", titulo: "23 construtores catalogados", status: "feito", ref: "04c §4", data: "2026-11-20", entrega: "04c-ghl-catalogo-tecnico.md" },
        { id: "0.7", titulo: "Construtor de comunidades por dentro", status: "feito", ref: "04c §4.1", data: "2026-11-20", entrega: "04c-ghl-catalogo-tecnico.md" },
        { id: "0.8", titulo: "Construtor de cursos por dentro", status: "feito", ref: "04c §4.2", data: "2026-11-20", entrega: "04c-ghl-catalogo-tecnico.md" },
        { id: "0.9", titulo: "Construtor do app mobile e desktop da agência", status: "feito", ref: "04c §4 · §4.3", data: "2026-11-20", entrega: "04c-ghl-catalogo-tecnico.md",
          nota: "Lojas (Apple/Google), build e pagamento não foram acionados." }
      ]
    },
    {
      id: "1", nome: "Dinheiro e documentos", objetivo: "Fechar a maior lacuna de receita: documentos com assinatura, orçamentos e pagamentos completos.",
      base: "A Soci já tem faturas, produtos, assinaturas, links de pagamento, transações, cupons e AbacatePay.",
      itens: [
        { id: "1.1", titulo: "Especificação de Documentos e Contratos", status: "feito", ref: "04c §4 (Documentos e contratos)", data: "2026-11-20",
          entrega: "docs/implementation/05-documentos-contratos.md",
          nota: "Cobre 1.2, 1.3, 1.4 e a parte de documentos do 1.10. Decisões D4 e D5 com recomendação, sem bloquear." },
        { id: "1.2", titulo: "Editor de documentos: blocos, campos preenchíveis, variáveis, biblioteca de conteúdo", status: "feito", ref: "05 §4–6 · 04c §4", data: "2026-11-20",
          entrega: "document-model.mjs, ui/document-data.js, ui/documents.js, ui/documents.css, test/documents.test.mjs (sem commit)",
          nota: "Pagamentos → Documentos e contratos: lista com abas e contadores, modelos (2 da Soci), biblioteca (6 itens da Soci), editor com 9 blocos, 5 campos, destinatários, variáveis, tema e prévia. A matemática da lista de produtos ficou em ui/document-data.js para o 1.5 reaproveitar. 189 testes passando." },
        { id: "1.3", titulo: "Assinatura eletrônica com destinatários e ordem de assinatura", status: "feito", ref: "05 §7–8 · 04c §4", data: "2026-11-20",
          entrega: "document-model.mjs, document-mail.mjs, ui/document-render.js, ui/document-sign.*, ui/documents.js, test/document-signing.test.mjs (sem commit)",
          nota: "Envio com link pessoal (/assinar/<ws>#token), ordem de assinatura, página pública com assinatura desenhada ou digitada, recusa, anulação, novo link, vencimento, trilha com IP, certificado com SHA-256, gatilho document_status e ação send_document. E-mail sai pelo Resend quando RESEND_API_KEY e PORTAL_EMAIL_FROM estão configurados; sem isso, a trilha registra que não saiu e o link pode ser copiado. 195 testes passando." },
        { id: "1.4", titulo: "Cobrança após assinar (única ou recorrente) via AbacatePay", status: "feito", ref: "05 §9 · 04c §4", data: "2026-11-20",
          entrega: "document-model.mjs, abacatepay.mjs, server.mjs, ui/documents.js, ui/document-sign.js, test/document-payment.test.mjs (sem commit)",
          nota: "Aba Pagamento no editor: pagamento único (logo após assinar ou fatura com prazo), parcelas que somam 100% ou assinatura mensal. Na conclusão nascem as faturas (ou a assinatura); a página pública mostra as parcelas e o botão Pagar agora; o webhook ou a baixa manual marcam o documento como pago e disparam “Documento pago”. Recorrente só mensal: é o único ciclo confirmado da API v2 do AbacatePay. 200 testes passando." },
        { id: "1.5", titulo: "Orçamentos com status (rascunho, enviado, aceito, recusado, faturado)", status: "feito", ref: "04c §3 /payments/v2/estimates · 05 §10", data: "2026-11-20",
          entrega: "estimate-model.mjs, ui/estimates.js, ui/estimate-render.js, ui/estimate-view.*, ui/line-items.js, ui/estimates.css, test/estimates.test.mjs (sem commit)",
          nota: "Aba Orçamentos em Pagamentos com as subabas do GHL e contadores, numeração ORC-0001, editor com prévia, link pessoal /orcamento/<ws>#token, aprovação com itens opcionais ou recusa, Revisar, Faturar e fatura automática paga pelo AbacatePay. Gatilho Orçamento e ação Enviar orçamento. Falta o modelo de orçamento como item separado. 205 testes passando." },
        { id: "1.6", titulo: "Faturas recorrentes e modelos de fatura", status: "pendente", ref: "04 §1 Pagamentos" },
        { id: "1.7", titulo: "Configurações de recibo e impostos", status: "pendente", ref: "04c §3 /payments/settings/receipts" },
        { id: "1.8", titulo: "Pedidos e checkouts abandonados como telas próprias", status: "pendente", ref: "04c §3" },
        { id: "1.9", titulo: "Gift cards, coleções, estoque e avaliações de produto", status: "pendente", ref: "04c §3" },
        { id: "1.10", titulo: "Gatilhos e ações de workflow da fase (contrato assinado, orçamento aceito, fatura paga…)", status: "andamento", ref: "04c §1.3 Payments",
          nota: "Feito: gatilhos Documento ou contrato, Documento pago e Orçamento; ações Enviar documento ou contrato e Enviar orçamento. Faltam faturas recorrentes (1.6)." }
      ]
    },
    {
      id: "2", nome: "Comunicação", objetivo: "E-mail com domínio próprio, conversas completas e telefonia.",
      itens: [
        { id: "2.1", titulo: "Email Services: domínio de envio (SPF/DKIM)", status: "pendente", ref: "04 §1 Configurações" },
        { id: "2.2", titulo: "Construtor de e-mail, campanhas com estatísticas e teste A/B", status: "pendente", ref: "04c §4 (E-mail)" },
        { id: "2.3", titulo: "Analytics de conversas; completar snippets, trigger links e ações manuais", status: "pendente", ref: "04 §1 Conversas" },
        { id: "2.4", titulo: "Telefonia: ligações, chamadas perdidas, relatório de chamadas", status: "bloqueado", ref: "04 §3 Fase 2", nota: "Depende da decisão D1." },
        { id: "2.5", titulo: "Countdown timers para e-mails e páginas", status: "pendente", ref: "04c §4 (Countdown)" }
      ]
    },
    {
      id: "3", nome: "IA", objetivo: "Agentes completos e controle de uso e custo.",
      itens: [
        { id: "3.1", titulo: "Agent Studio: base de conhecimento por subconta, templates, logs e painel de uso/custo de IA", status: "pendente", ref: "04c §4 (Agent Studio, Conversation AI)" },
        { id: "3.2", titulo: "Voice AI", status: "bloqueado", ref: "04c §4 (Voice AI)", nota: "Depende da decisão D1." },
        { id: "3.3", titulo: "Content AI em Social, E-mail e Blogs", status: "pendente", ref: "04 §3 Fase 3" },
        { id: "3.4", titulo: "Ações de IA no workflow (decidir, resumir, intenção, traduzir, extrair, analisar imagem)", status: "pendente", ref: "04c §1.3 AI Actions" }
      ]
    },
    {
      id: "4", nome: "Reputação e presença local", objetivo: "Avaliações e Google Business Profile.",
      itens: [
        { id: "4.1", titulo: "Pedidos de avaliação (link, QR, SMS/WhatsApp) e resposta com IA", status: "pendente", ref: "04 §1 Reputação" },
        { id: "4.2", titulo: "Widgets de avaliações e depoimentos em vídeo", status: "pendente", ref: "04 §1 Reputação" },
        { id: "4.3", titulo: "Otimização de GBP e listagens (aproveitar google-integrations.mjs)", status: "pendente", ref: "04 §3 Fase 4" }
      ]
    },
    {
      id: "5", nome: "Marketing avançado", objetivo: "Afiliados, marca, anúncios e rastreamento.",
      itens: [
        { id: "5.1", titulo: "Affiliate Manager para o cliente final (campanhas, comissões, payouts)", status: "pendente", ref: "04 §1 Marketing" },
        { id: "5.2", titulo: "Brand Boards (Design Kit + Brand Voice)", status: "pendente", ref: "04c §4 (Brand board)" },
        { id: "5.3", titulo: "Social Planner: fila evergreen, posts recorrentes, RSS, Threads, Bluesky", status: "pendente", ref: "04 §1 Marketing" },
        { id: "5.4", titulo: "Ad Manager e relatórios de Google Ads, Meta Ads e atribuição", status: "pendente", ref: "04 §1 Relatórios" },
        { id: "5.5", titulo: "External Tracking (pixels, GA4, GTM) e lead scoring", status: "pendente", ref: "04 §1 Configurações" }
      ]
    },
    {
      id: "6", nome: "Memberships e apps", objetivo: "Comunidades, cursos e apps com a marca do cliente.",
      base: "A Soci já tem cursos (módulos, aulas, liberação gradual) e comunidades (canais, posts, enquetes, níveis).",
      itens: [
        { id: "6.1", titulo: "Comunidades: eventos pagos com gravações e transmissão ao vivo", status: "pendente", ref: "04c §4.1" },
        { id: "6.2", titulo: "Comunidades: planos por comunidade, tema com tokens, perguntas de adesão, onboarding, emblemas, moderação, newsletter, abas configuráveis, analytics", status: "pendente", ref: "04c §4.1" },
        { id: "6.3", titulo: "Cursos: submódulos, quiz com nota mínima, tarefas, sessões ao vivo", status: "pendente", ref: "04c §4.2" },
        { id: "6.4", titulo: "Cursos: tema por curso (produto e aula), checkout por curso, certificado e badge automáticos", status: "pendente", ref: "04c §4.2" },
        { id: "6.5", titulo: "Certificados de curso e analytics de cursos", status: "pendente", ref: "04 §1 Memberships" },
        { id: "6.6", titulo: "App mobile white-label (tema, navegação, módulos custom, publicação nas lojas)", status: "bloqueado", ref: "04c §4.3", nota: "Depende da decisão D2." },
        { id: "6.7", titulo: "App desktop white-label", status: "pendente", ref: "04c §4 (Desktop)" }
      ]
    },
    {
      id: "6b", nome: "Módulos ocultos", objetivo: "Módulos que existem no GHL mas não aparecem no menu desta conta.",
      itens: [
        { id: "6b.1", titulo: "Ticketing/helpdesk ligado a Conversas", status: "pendente", ref: "04 §2.5" },
        { id: "6b.2", titulo: "Sequências de e-mail (drip)", status: "pendente", ref: "04 §2.5" },
        { id: "6b.3", titulo: "Programa de fidelidade (loyalty)", status: "pendente", ref: "04 §2.5" },
        { id: "6b.4", titulo: "Central de preferências de comunicação (opt-in/opt-out)", status: "pendente", ref: "04 §2.5" },
        { id: "6b.5", titulo: "Lixeira de contatos", status: "pendente", ref: "04 §2.5" },
        { id: "6b.6", titulo: "Agenda de serviços, locação de recursos e serviço em campo", status: "pendente", ref: "04 §2.5" },
        { id: "6b.7", titulo: "Meetings + Notes AI", status: "pendente", ref: "04 §2.5" },
        { id: "6b.8", titulo: "SEO e Visibility AI", status: "pendente", ref: "04 §2.5" },
        { id: "6b.9", titulo: "Power dialer", status: "bloqueado", ref: "04 §2.5", nota: "Depende da decisão D1." }
      ]
    },
    {
      id: "7", nome: "Plataforma de agência", objetivo: "Revenda e recursos de agência.",
      itens: [
        { id: "7.1", titulo: "Reselling com margem (IA, mensagens, telefonia)", status: "pendente", ref: "04 §2" },
        { id: "7.2", titulo: "AI Suite da agência e Labs (flags por conta)", status: "pendente", ref: "04 §2" },
        { id: "7.3", titulo: "App Marketplace / App Studio aberto", status: "pendente", ref: "04 §2" }
      ]
    },
    {
      id: "T", nome: "Transversal", objetivo: "Trabalho contínuo que acompanha todas as fases.",
      itens: [
        { id: "T.1", titulo: "Paridade do motor de workflows: de 35/36 para 116 gatilhos e 180 ações (por módulo, junto com cada fase)", status: "andamento", ref: "04c §1.3", nota: "Hoje a Soci tem 35 gatilhos e 36 ações em ui/workflow-data.js." },
        { id: "T.2", titulo: "Catálogo de conectores (apps com gatilhos e ações próprios, como a aba Apps do GHL)", status: "pendente", ref: "04c §1.3 Apps" }
      ]
    },
    {
      id: "X", nome: "Fora do escopo", objetivo: "Itens do GHL que não serão recriados.",
      itens: [
        { id: "X.1", titulo: "WordPress hospedado", status: "fora" },
        { id: "X.2", titulo: "GHL Swag, Gokollab e conteúdo de educação SaaS do GHL", status: "fora" }
      ]
    }
  ],

  historico: [
    { data: "2026-11-20", texto: "1.5 concluído: orçamentos numerados com aprovação online, itens opcionais, fatura automática e cobrança pelo AbacatePay; gatilho e ação de workflow. Próximo: 1.6 Faturas recorrentes e modelos de fatura." },
    { data: "2026-11-20", texto: "1.4 concluído: cobrança após assinar (única, em parcelas ou assinatura mensal) com AbacatePay, baixa pelo webhook ou manual e gatilho Documento pago. Próximo: 1.5 Orçamentos." },
    { data: "2026-11-20", texto: "1.3 concluído: envio para assinatura, página pública /assinar, ordem, recusa, anulação, certificado com SHA-256, gatilho e ação de workflow. Cópia final gerada do estado com conferência do hash (sem linha extra no banco; ver 05 §7.4). Próximo: 1.4 Cobrança após assinar." },
    { data: "2026-11-20", texto: "1.2 concluído: editor de documentos em Pagamentos → Documentos e contratos, com modelos, biblioteca, variáveis e prévia. D4 e D5 decididas pela recomendação. Próximo: 1.3 Assinatura eletrônica." },
    { data: "2026-11-20", texto: "1.1 concluído: especificação em 05-documentos-contratos.md. Novas decisões D4 (PDF sobreposto) e D5 (código de verificação), com recomendação. Próximo: 1.2 Editor de documentos." },
    { data: "2026-11-20", texto: "Painel criado. Fase 0 (levantamento do GHL) concluída; próximo: 1.1 Especificação de Documentos e Contratos." }
  ]
};
