// Blogs: blog sites, posts, authors and categories (shared by all blogs of the workspace, like HighLevel).
import { slugify } from './ui/blog-data.js';

export const blogCollections = ['blogs', 'blogPosts', 'blogAuthors', 'blogCategories'];

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const url = (value, label) => { const v = str(value, 600); if (v && !/^https:\/\/[^\s"'<>]+$/i.test(v)) fail(`${label} precisa ser um endereço https://`); return v; };
const when = value => { if (!value) return ''; const t = Date.parse(value); if (Number.isNaN(t)) fail('Use uma data válida para o agendamento.'); return new Date(t).toISOString(); };
const unique = (rows, id, slug, label) => { if (rows.some(row => row.id !== id && row.slug === slug)) fail(`Já existe ${label} com o endereço “${slug}”. Escolha outro.`); return slug; };

export const blogFields = {
  blogs: (s, d) => ({
    name: str(d.name, 80) || fail('Dê um nome ao blog.'), description: str(d.description, 400), active: Boolean(d.active),
    color: /^#[0-9a-f]{6}$/i.test(d.color || '') ? d.color.toLowerCase() : '#155eef', perPage: Math.max(3, Math.min(30, Math.round(Number(d.perPage) || 9))),
    rss: d.rss !== false, seoTitle: str(d.seoTitle, 70), seoDescription: str(d.seoDescription, 170)
  }),
  blogPosts: (s, d) => {
    const prior = d.id ? s.blogPosts.find(row => row.id === d.id) : null;
    const blogId = str(d.blogId || prior?.blogId, 40);
    if (!s.blogs.some(blog => blog.id === blogId)) fail('Escolha o blog do artigo.');
    const title = str(d.title, 160) || fail('Dê um título ao artigo.');
    const slug = unique(s.blogPosts.filter(row => row.blogId === blogId), d.id, slugify(d.slug || title) || 'artigo', 'um artigo');
    if (slug === 'rss-xml') fail('Esse endereço é reservado. Escolha outro.');
    const status = ['draft', 'published'].includes(d.status) ? d.status : 'draft';
    const authorId = str(d.authorId, 40);
    if (authorId && !s.blogAuthors.some(row => row.id === authorId)) fail('Autor não encontrado.');
    const categoryIds = [...new Set((Array.isArray(d.categoryIds) ? d.categoryIds : []).filter(id => s.blogCategories.some(cat => cat.id === id)))].slice(0, 10);
    const publishAt = when(d.publishAt);
    return { blogId, title, slug, summary: str(d.summary, 400), body: typeof d.body === 'string' ? d.body.slice(0, 60000) : '', coverUrl: url(d.coverUrl, 'A imagem de capa'),
      authorId, categoryIds, status, publishAt, publishedAt: status === 'published' ? prior?.publishedAt || new Date().toISOString() : prior?.publishedAt || '',
      seoTitle: str(d.seoTitle, 70), seoDescription: str(d.seoDescription, 170) };
  },
  blogAuthors: (s, d) => ({ name: str(d.name, 80) || fail('Informe o nome do autor.'), bio: str(d.bio, 300) }),
  blogCategories: (s, d) => {
    const name = str(d.name, 60) || fail('Informe o nome da categoria.');
    return { name, slug: unique(s.blogCategories, d.id, slugify(d.slug || name) || 'categoria', 'uma categoria'), description: str(d.description, 300) };
  }
};

export function blogBeforeDelete(s, key, id) {
  if (key === 'blogs') s.blogPosts = s.blogPosts.filter(post => post.blogId !== id);
  if (key === 'blogAuthors') s.blogPosts.forEach(post => { if (post.authorId === id) post.authorId = ''; });
  if (key === 'blogCategories') s.blogPosts.forEach(post => { post.categoryIds = (post.categoryIds || []).filter(cat => cat !== id); });
}

// A public visit to a post: total and per day, for the blog insights.
export function blogView(s, id) {
  const post = s.blogPosts.find(row => row.id === id);
  if (!post) fail('Artigo não encontrado.', 404);
  const day = new Date().toISOString().slice(0, 10), byDay = { ...(post.viewsByDay || {}) };
  byDay[day] = (byDay[day] || 0) + 1;
  post.viewsByDay = Object.fromEntries(Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).slice(-120));
  post.views = (post.views || 0) + 1;
  return post.views;
}
