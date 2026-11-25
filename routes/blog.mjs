// Rotas do Blog: as páginas públicas (/b/<subconta>/<blog>: início com categorias e paginação, artigo com SEO e
// rss.xml; rascunhos abrem com ?preview=1 para quem está logado) e a IA de escrita (/api/blog/ai: artigo ou SEO,
// medida como "blog"; sem OpenAI conectada, devolve um rascunho local).
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { localDraft } from '../blog-ai.mjs';
import { blogHome, blogPost, blogRss, isLive } from '../ui/blog-data.js';
import { NEXT_ROUTE } from './next-route.mjs';

export function createBlogRoutes(deps) {
  const {
    store, ready, error, workspaceSegment, brandVoiceOf, change, content, meteredAI, openAI, payload, publicAccountPolicy, publicBase,
    publicPreview, withPixels, workspaceAccess
  } = deps;
  const blogPath = new RegExp(`^/b/${workspaceSegment}/([0-9a-f-]{36})(?:/([a-z0-9-]{1,80}|rss\\.xml))?/?$`);
  return async function blogRoutes({ req, res, p, method, url, id, json }) {
    // Blogs: home with categories and pages, posts with SEO tags, and RSS. Drafts open with ?preview=1 when signed in.
    const blogRoute = p.match(blogPath);
    if (blogRoute && (method === 'GET' || method === 'HEAD')) {
      await ready;
      const [, workspace, blogId, slug] = blogRoute;
      const active = await publicAccountPolicy(workspace, false, 'sites');
      const state = await store.load(workspace);
      const blog = state.blogs?.find(item => item.id === blogId);
      const preview = await publicPreview(req, res, url, workspace);
      if (!blog || (!blog.active && !preview)) throw error('Este blog não está publicado.',404);
      const base = `/b/${workspace}/${blogId}`, origin = publicBase(req);
      const html = (status, page) => { const [headers, body] = withPixels(state, workspace, { 'Content-Type':'text/html; charset=utf-8', 'Referrer-Policy':'strict-origin-when-cross-origin', 'Cache-Control':'no-store',
        'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https: data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'" }, page); res.writeHead(status, headers); return res.end(method === 'HEAD' ? undefined : body); };
      if (slug === 'rss.xml') {
        if (blog.rss === false) throw error('Este blog não tem RSS.',404);
        res.writeHead(200, { 'Content-Type':'application/rss+xml; charset=utf-8', 'Cache-Control':'no-store' });
        return res.end(method === 'HEAD' ? undefined : blogRss(state, blog, { base, origin }));
      }
      if (!slug) return html(200, blogHome(state, blog, { base, origin, category:String(url.searchParams.get('categoria') || '').slice(0,80), page:Number(url.searchParams.get('pagina')) || 1 }));
      const post = state.blogPosts.find(item => item.blogId === blogId && item.slug === slug);
      if (!post || (!isLive(post) && !preview)) throw error('Artigo não encontrado.',404);
      if (active && !preview && method === 'GET') await Promise.resolve().then(() => change(workspace,{ type:'blog-view', id:post.id })).catch(() => {});
      return html(200, blogPost(state, blog, post, { base, origin, preview }));
    }
    if (p === '/api/blog/ai' && method === 'POST') {
      const who = await workspaceAccess(req,res,id,{ modules:['sites'] });
      const input = await payload(req);
      const connection = await openAI.status(who.session).then(status => status.configured ? openAI.requireConnection(who.session) : null);
      if (input.mode === 'seo') {
        if (!connection) throw error('Conecte a OpenAI em Configurações para gerar o SEO com IA.',409);
        return json({ ai:true, seo:await meteredAI(who, id, 'blog', metered => content.postSeo(metered,{ title:input.title, body:input.body })) });
      }
      if (!String(input.topic || input.title || '').trim()) throw error('Descreva o tema do artigo.',400);
      input.voice = await brandVoiceOf(id);
      return json(connection ? { ai:true, post:await meteredAI(who, id, 'blog', metered => content.writePost(metered, input)) } : { ai:false, post:localDraft(input) });
    }
    return NEXT_ROUTE;
  };
}
