// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLlmsTxt from 'starlight-llms-txt';
import starlightLinksValidator from 'starlight-links-validator';

export default defineConfig({
  site: 'https://doc.soci.app.br',
  integrations: [
    starlight({
      title: 'Central de ajuda da Soci',
      description: 'Documentação da soci para agências: como usar cada ferramenta da plataforma, passo a passo.',
      logo: { src: './src/assets/logo-soci.svg', alt: 'Soci' },
      favicon: '/favicon.svg',
      defaultLocale: 'root',
      locales: { root: { label: 'Português', lang: 'pt-BR' } },
      customCss: ['./src/styles/soci.css'],
      lastUpdated: true,
      social: [],
      plugins: [starlightLlmsTxt(), starlightLinksValidator()],
    }),
  ],
});
