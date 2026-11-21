// SEO e Visibility AI (6b.8). SEO: the sub-account's site and tracked keywords (positions come live from Google
// Search Console, see google-integrations.mjs) and the history of site audits with a tip for each problem.
// Visibility AI: the brand, its competitors and the questions customers ask; each run stores what an AI assistant
// with web search answered and whether the brand was named, its position among the tracked names and the sources.
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const fold = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const round = (value, digits = 1) => Number.isFinite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : null;
const unique = (list, limit, size, normalize = value => value) => {
  const seen = new Set(), out = [];
  for (const item of Array.isArray(list) ? list : []) {
    const value = normalize(str(String(item ?? ''), size));
    const key = fold(value);
    if (!value || seen.has(key)) continue;
    seen.add(key); out.push(value);
    if (out.length >= limit) break;
  }
  return out;
};

export const seoDefaults = () => ({ siteUrl: '', keywords: [] });
export const visibilityDefaults = () => ({ brand: '', aliases: [], domain: '', competitors: [], prompts: [] });
export const seoOf = s => { s.seo = { ...seoDefaults(), ...(s.seo || {}) }; return s.seo; };
export const visibilityOf = s => { s.visibility = { ...visibilityDefaults(), ...(s.visibility || {}) }; return s.visibility; };
export const seoLimits = { keywords: 50, prompts: 10, competitors: 5, audits: 12, runs: 24 };

/** "https://site.com.br/" from what the user typed, or '' when it is not a web address. */
export function siteAddress(value) {
  const raw = str(value, 300);
  if (!raw) return '';
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}
/** "clinica.com.br" from a domain or an address (no www, no path). */
export function bareDomain(value) {
  const raw = str(value, 300).toLowerCase();
  if (!raw) return '';
  try { return new URL(/^[a-z]+:\/\//.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// A plain-language fix for each check of the site audit (prospect-audit.mjs keys).
export const seoTips = {
  performance: 'Comprima as imagens (WebP), adie scripts que não são essenciais e use cache e CDN para a página abrir em menos de 3 segundos no celular.',
  title: 'Escreva um título de 10 a 70 caracteres com o serviço e a cidade, por exemplo “Dentista em Curitiba | Clínica Sorriso”.',
  description: 'Escreva uma meta description de 50 a 170 caracteres que convide ao clique e cite o serviço principal.',
  h1: 'Use um único título principal (H1) na página, com o assunto dela.',
  viewport: 'Inclua a meta tag viewport para a página se adaptar ao celular.',
  lang: 'Declare o idioma na tag html, por exemplo lang="pt-BR".',
  canonical: 'Adicione a URL canônica (link rel="canonical") para o Google saber qual endereço indexar.',
  alt: 'Descreva as imagens no texto alternativo (alt); ajuda o Google e quem usa leitor de tela.',
  indexable: 'A página pede para não ser indexada (noindex). Remova essa marcação se ela deve aparecer no Google.',
  opengraph: 'Preencha as tags Open Graph (og:title, og:image) para a prévia ficar bonita nas redes e no WhatsApp.',
  sitemap: 'Publique um sitemap.xml e envie no Google Search Console.',
  robots: 'Publique um robots.txt simples com o endereço do sitemap.',
  https: 'Sirva o site por HTTPS com um certificado válido.',
  certificate: 'Renove ou instale o certificado SSL do domínio.',
  redirect: 'Redirecione o endereço http:// para o https:// (redirecionamento 301).',
  hsts: 'Ative o cabeçalho Strict-Transport-Security (HSTS) no servidor.',
  privacy: 'Publique uma política de privacidade e coloque o link no rodapé.',
  terms: 'Publique os termos de uso e coloque o link no rodapé.',
  consent: 'Mostre um aviso de cookies com opção de aceitar, como pede a LGPD.',
  contact: 'Deixe telefone, e-mail ou WhatsApp clicáveis na página.'
};

function auditRecord(website, now) {
  const health = website?.health || {};
  const groups = [['seo', 'SEO'], ['security', 'Segurança'], ['compliance', 'Conformidade']];
  const issues = [];
  if (Number.isFinite(health.performance?.score) && health.performance.score < 50) issues.push({ group: 'Velocidade', key: 'performance', label: 'Velocidade de carregamento', detail: `${health.performance.score} de 100`, tip: seoTips.performance });
  for (const [group, label] of groups) {
    for (const item of Array.isArray(health[group]) ? health[group] : []) {
      if (item?.ok !== false) continue;
      issues.push({ group: label, key: str(item.key, 40), label: str(item.label, 160), detail: str(item.detail, 160), tip: seoTips[item.key] || '' });
    }
  }
  const count = group => (Array.isArray(health[group]) ? health[group] : []).filter(item => item?.ok !== null && item?.ok !== undefined);
  return {
    id: `audit-${Date.parse(now) || Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: now,
    url: str(website?.url, 500), reachable: Boolean(website?.reachable), status: Number(website?.status) || null, title: str(website?.title, 160),
    score: Number.isFinite(health.score) ? health.score : 0,
    parts: Object.fromEntries(['performance', 'seo', 'security', 'compliance'].map(key => [key, Number.isFinite(health.parts?.[key]) ? health.parts[key] : null])),
    speed: health.performance ? { score: health.performance.score ?? null, mobile: health.performance.mobile ?? null, desktop: health.performance.desktop ?? null, source: health.performance.source === 'pagespeed' ? 'pagespeed' : 'estimate' } : null,
    passed: groups.reduce((total, [group]) => total + count(group).filter(item => item.ok).length, 0),
    checked: groups.reduce((total, [group]) => total + count(group).length, 0),
    issues
  };
}

/** Where (and whether) a name appears in an answer: whole words, ignoring case and accents. */
function firstIndex(text, names) {
  let best = -1;
  for (const name of names) {
    const needle = fold(name).trim();
    if (needle.length < 2) continue;
    const pattern = new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^a-z0-9])`);
    const match = pattern.exec(text);
    if (match && (best < 0 || match.index < best)) best = match.index;
  }
  return best;
}
const citedBy = (sources, domain) => Boolean(domain) && sources.some(source => { const host = bareDomain(source.url); return host === domain || host.endsWith(`.${domain}`); });

export function scoreAnswer(answer, v) {
  const text = fold(answer?.text);
  const sources = (Array.isArray(answer?.sources) ? answer.sources : []).map(source => ({ url: str(source?.url, 500), title: str(source?.title, 200) })).filter(source => /^https?:\/\//.test(source.url)).slice(0, 12);
  // The site written in the answer ("clinicasorriso.com.br") counts as naming the business.
  const brandAt = firstIndex(text, [v.brand, ...v.aliases, v.domain]);
  const rivals = v.competitors.map(rival => ({ name: rival.name, at: firstIndex(text, [rival.name, rival.domain]), cited: citedBy(sources, rival.domain) }));
  const named = [brandAt, ...rivals.map(rival => rival.at)].filter(at => at >= 0).sort((a, b) => a - b);
  return {
    prompt: str(answer?.prompt, 300), mentioned: brandAt >= 0, cited: citedBy(sources, v.domain),
    position: brandAt >= 0 ? named.indexOf(brandAt) + 1 : null,
    competitors: rivals.filter(rival => rival.at >= 0).map(rival => rival.name),
    competitorsCited: rivals.filter(rival => rival.cited).map(rival => rival.name),
    sources, answer: str(answer?.text, 1500), error: str(answer?.error, 200)
  };
}

export function scoreRun(v, answers, { model = '', now }) {
  const results = answers.map(answer => answer?.error ? { prompt: str(answer.prompt, 300), error: str(answer.error, 200), mentioned: false, cited: false, position: null, competitors: [], competitorsCited: [], sources: [], answer: '' } : scoreAnswer(answer, v));
  const ok = results.filter(row => !row.error);
  const positions = ok.map(row => row.position).filter(Number.isFinite);
  const share = [{ name: v.brand, brand: true, mentions: ok.filter(row => row.mentioned || row.cited).length },
    ...v.competitors.map(rival => ({ name: rival.name, brand: false, mentions: ok.filter(row => row.competitors.includes(rival.name) || row.competitorsCited.includes(rival.name)).length }))];
  return {
    id: `run-${Date.parse(now) || Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: now, model: str(model, 80), engine: 'chatgpt',
    prompts: ok.length, failed: results.length - ok.length, mentioned: ok.filter(row => row.mentioned).length, cited: ok.filter(row => row.cited).length,
    mentionRate: ok.length ? Math.round(ok.filter(row => row.mentioned).length / ok.length * 100) : 0,
    avgPosition: positions.length ? round(positions.reduce((a, b) => a + b, 0) / positions.length) : null,
    share, results
  };
}

export function seoCommand(s, command, { now }) {
  const { type, data: d = {} } = command;
  if (type === 'seo-settings') {
    const seo = seoOf(s);
    if (d.siteUrl !== undefined) {
      const site = siteAddress(d.siteUrl);
      if (site === null) fail('Informe o endereço do site, por exemplo https://suaempresa.com.br.');
      seo.siteUrl = site;
    }
    if (d.keywords !== undefined) seo.keywords = unique(d.keywords, seoLimits.keywords, 120, value => value.toLowerCase().replace(/\s+/g, ' '));
    return seo;
  }
  if (type === 'seo-audit') {
    const audit = auditRecord(d, now());
    s.seoAudits = [audit, ...(s.seoAudits || [])].slice(0, seoLimits.audits);
    return audit.id;
  }
  if (type === 'visibility-settings') {
    const v = visibilityOf(s);
    const brand = str(d.brand ?? v.brand, 120) || fail('Informe o nome da marca como os clientes conhecem.');
    const prompts = unique(d.prompts ?? v.prompts, seoLimits.prompts, 300);
    if (!prompts.length) fail('Escreva pelo menos uma pergunta que um cliente faria a uma IA.');
    const competitors = [];
    for (const rival of (Array.isArray(d.competitors ?? v.competitors) ? d.competitors ?? v.competitors : [])) {
      const name = str(rival?.name, 120);
      if (!name || fold(name) === fold(brand) || competitors.some(row => fold(row.name) === fold(name))) continue;
      competitors.push({ name, domain: bareDomain(rival?.domain) });
      if (competitors.length >= seoLimits.competitors) break;
    }
    Object.assign(v, { brand, aliases: unique(d.aliases ?? v.aliases, 5, 120).filter(alias => fold(alias) !== fold(brand)), domain: bareDomain(d.domain ?? v.domain), competitors, prompts });
    return v;
  }
  if (type === 'visibility-run') {
    const v = visibilityOf(s);
    if (!v.brand) fail('Configure a marca e as perguntas antes de medir.', 409);
    const answers = (Array.isArray(d.answers) ? d.answers : []).slice(0, seoLimits.prompts);
    if (!answers.some(answer => answer && !answer.error && str(answer.text))) fail('Nenhuma resposta da IA para medir. Tente de novo.', 502);
    const result = scoreRun(v, answers, { model: d.model, now: now() });
    s.visibilityRuns = [result, ...(s.visibilityRuns || [])].slice(0, seoLimits.runs);
    return result.id;
  }
  fail('Comando de SEO desconhecido.');
}
