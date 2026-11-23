import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

function walk(dir, ext) {
  return readdirSync(dir).flatMap((n) => {
    const f = join(dir, n);
    return statSync(f).isDirectory() ? walk(f, ext) : f.endsWith(ext) ? [f] : [];
  });
}

/** Tira do sitemap toda página que saiu com meta robots noindex (ex.: páginas com marcador [[...]]). */
export default function noindexSitemap(site) {
  return {
    name: 'soci-noindex-sitemap',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const blocked = walk(root, '.html')
          .filter((f) => /<meta name="robots" content="noindex/.test(readFileSync(f, 'utf8')))
          .map((f) => site + '/' + relative(root, f).split(sep).join('/').replace(/index\.html$/, ''));
        for (const xml of walk(root, '.xml').filter((f) => /sitemap-\d+\.xml$/.test(f))) {
          let body = readFileSync(xml, 'utf8');
          for (const url of blocked) body = body.split('<url>').filter((chunk) => !chunk.startsWith('<loc>' + url + '</loc>')).join('<url>');
          writeFileSync(xml, body);
        }
        logger.info(`noindex fora do sitemap: ${blocked.length}`);
      },
    },
  };
}
