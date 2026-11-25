// SEO e Visibilidade na IA, em Reputação: auditoria do site (/api/seo/audit), Search Console (/api/seo/search)
// e a medição de como a marca aparece nas respostas da IA (/api/visibility/run, medida como "visibility").
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { freshSecret, googleConfigured, searchError, searchReport } from '../google-integrations.mjs';
import { auditableUrl } from '../prospect-audit.mjs';
import { seal, unseal } from '../social-providers.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

export function createSeoRoutes(deps) {
  const { store, error, spaceId, privateSpace, workspaceAccess, payload, change, flushLater, stamp, prospectAudit, socialRow, searchCache, localAccess, contentAI, openAI, meteredAI, content } = deps;
  return async function seoRoutes({ req, res, p, method, url, id, json }) {
    // SEO (site audit and Search Console) and Visibility AI, in Reputação. The AI run is metered as "visibility".
    if (p === '/api/seo/audit' && method === 'POST') {
      if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Subconta não encontrada.',404);
      const who = await workspaceAccess(req, res, id, { modules: ['reputation'] });
      const body = await payload(req);
      const state = await store.load(id);
      const typed = String(body.url || state.seo?.siteUrl || '').trim();
      if (!typed) throw error('Informe o endereço do site para auditar.', 400);
      const target = auditableUrl(typed);
      if (!target) throw error('Este endereço não pode ser auditado. Use o endereço público do site, por exemplo https://suaempresa.com.br.', 400);
      const audit = await prospectAudit({ website: target.href }, { places: false }).catch(() => null);
      if (!audit?.website) throw error('Não foi possível abrir o site. Confira o endereço e tente de novo.', 502);
      if (!state.seo?.siteUrl) await change(id, { type: 'seo-settings', data: { siteUrl: target.href } }, who);
      const auditId = await change(id, { type: 'seo-audit', data: audit.website }, who);
      flushLater(id);
      return json({ ok: true, id: auditId });
    }
    if (p === '/api/seo/search' && method === 'GET') {
      if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Subconta não encontrada.',404);
      await workspaceAccess(req, res, id, { modules: ['reputation'] });
      const rowId = `google-${id}`;
      const g = (await socialRow(rowId)).google;
      if (!g?.token) return json({ connected: false, configured: googleConfigured() });
      if (!g.gscSite) return json({ connected: true, site: '', sites: (g.sites || []).length, error: g.errors?.search || '' });
      const keywords = (await store.load(id)).seo?.keywords || [];
      const key = `${g.gscSite}|${keywords.join(',')}`;
      const cached = searchCache.get(id);
      if (cached?.key === key && cached.at > Date.now() - 15 * 60_000 && url.searchParams.get('fresh') !== '1') return json(cached.data);
      const secret = unseal(g.token);
      if (!secret) return json({ connected: true, site: g.gscSite, error: 'A conexão com o Google precisa ser refeita.' });
      const fresh = await freshSecret(secret).catch(() => null);
      if (!fresh) return json({ connected: true, site: g.gscSite, error: 'O acesso ao Google expirou. Conecte a conta de novo em Configurações → Google.' });
      if (fresh.changed) await store.change(rowId, row => { if (row.google) row.google.token = seal(fresh.secret); });
      try {
        const data = { connected: true, site: g.gscSite, siteName: g.sites?.find(row => row.id === g.gscSite)?.name || g.gscSite, report: await searchReport(fresh.secret.token, g.gscSite, keywords), at: stamp() };
        searchCache.set(id, { key, at: Date.now(), data });
        return json(data);
      } catch (problem) {
        return json({ connected: true, site: g.gscSite, error: searchError(problem).message });
      }
    }
    if (p === '/api/visibility/run' && method === 'POST') {
      if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Subconta não encontrada.',404);
      const who = await workspaceAccess(req, res, id, { modules: ['reputation'] });
      const v = (await store.load(id)).visibility;
      if (!v?.brand || !v.prompts?.length) throw error('Configure a marca e as perguntas antes de medir.', 409);
      if (!(localAccess && contentAI) && !(who.session && (await openAI.status(who.session)).configured)) {
        throw error('Conecte a OpenAI em Visão da agência → Configurações → OpenAI para medir a visibilidade na IA.', 409);
      }
      const language = url.searchParams.get('lang') === 'es' ? 'es' : 'pt';
      let model = '';
      const answers = await meteredAI(who, id, 'visibility', async connection => {
        const out = new Array(v.prompts.length);
        let next = 0;
        const worker = async () => {
          while (next < v.prompts.length) {
            const index = next++, prompt = v.prompts[index];
            try { const reply = await content.askAssistant(connection, { prompt, language }); model ||= reply.model || ''; out[index] = { prompt, text: reply.text, sources: reply.sources }; }
            catch (problem) { out[index] = { prompt, error: problem.message || 'A IA não respondeu.' }; }
          }
        };
        await Promise.all([worker(), worker(), worker()]);
        if (!out.some(row => row && !row.error)) throw error(out[0]?.error || 'A IA não respondeu. Tente de novo.', 502);
        return out;
      });
      const runId = await change(id, { type: 'visibility-run', data: { answers, model } }, who);
      flushLater(id);
      return json({ ok: true, id: runId, failed: answers.filter(row => row.error).length });
    }
    return NEXT_ROUTE;
  };
}
