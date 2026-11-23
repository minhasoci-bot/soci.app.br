// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import noindexSitemap from './src/lib/noindex-sitemap.mjs';

const SITE_URL = 'https://www.soci.app.br'; // espelha src/config.ts

export default defineConfig({
  site: SITE_URL,
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [sitemap(), noindexSitemap(SITE_URL)],
});
