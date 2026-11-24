// Tira os prints de um artigo a partir do app soci LOCAL (Agência Demo), seguindo o roteiro do artigo.
//
//   npm --prefix docs-site run demo -- --limpo     (app local com banco zerado)
//   npm --prefix docs-site run semear              (dados fictícios)
//   npm --prefix docs-site run capturar -- roteiros/criar-pipeline.mjs
//
// Saída: docs-site/.midia/<grupo>/<artigo>/<nn>-<passo>.webp (1440 px de largura). Depois envie com
// `npm run docs:midia -- enviar docs-site/.midia/<grupo>/<artigo> <grupo> <artigo>`.
// Usa o Chrome instalado na máquina (ou o Edge, com DOCS_NAVEGADOR=msedge); não baixa navegador.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

export const BASE_DEMO = 'http://127.0.0.1:4319';
const COR_DESTAQUE = '#d62976';

export const nomeArquivo = (indice, passo) => `${String(indice + 1).padStart(2, '0')}-${passo.nome}.webp`;

async function subcontaId(base, nome) {
  const { workspaces } = await (await fetch(`${base}/api/workspaces`)).json();
  const achada = workspaces.find(w => w.name === nome);
  if (!achada) throw new Error(`A subconta "${nome}" não existe na demo. Rode npm --prefix docs-site run semear.`);
  return achada.id;
}

// Contorno no elemento em destaque só durante o print; o estilo original volta logo depois.
async function comDestaque(page, seletor, tirar) {
  if (!seletor) return tirar();
  const alvo = page.locator(seletor).first();
  await alvo.evaluate((no, cor) => {
    no.dataset.sociAntes = JSON.stringify([no.style.outline, no.style.outlineOffset]);
    no.style.outline = `3px solid ${cor}`;
    no.style.outlineOffset = '3px';
  }, COR_DESTAQUE);
  try { return await tirar(); }
  finally {
    await alvo.evaluate(no => { const [o, off] = JSON.parse(no.dataset.sociAntes || '["",""]'); no.style.outline = o; no.style.outlineOffset = off; delete no.dataset.sociAntes; }).catch(() => {});
  }
}

export async function capturar(roteiro, { base = BASE_DEMO, saida, navegador = process.env.DOCS_NAVEGADOR || 'chrome' } = {}) {
  const pasta = saida || fileURLToPath(new URL(`../.midia/${roteiro.grupo}/${roteiro.artigo}/`, import.meta.url));
  await mkdir(pasta, { recursive: true });
  const id = await subcontaId(base, roteiro.subconta);
  const browser = await chromium.launch({ channel: navegador });
  const arquivos = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light', locale: 'pt-BR' });
    const page = await context.newPage();
    await page.goto(`${base}/app?workspace=${id}${roteiro.rota}`, { waitUntil: 'networkidle' });
    for (const [i, passo] of roteiro.passos.entries()) {
      if (passo.acao) await passo.acao(page);
      await page.waitForTimeout(passo.espera ?? 500);
      const png = await comDestaque(page, passo.destacar, () => page.screenshot({ type: 'png' }));
      const arquivo = resolve(pasta, nomeArquivo(i, passo));
      await writeFile(arquivo, await sharp(png).resize({ width: 1440 }).webp({ quality: 82 }).toBuffer());
      arquivos.push(arquivo);
    }
  } finally {
    await browser.close();
  }
  return arquivos;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const caminho = process.argv[2];
  if (!caminho) { console.log('Uso: capturar.mjs roteiros/<artigo>.mjs'); process.exit(2); }
  const { default: roteiro } = await import(pathToFileURL(resolve(caminho)).href);
  for (const arquivo of await capturar(roteiro)) console.log(arquivo);
}
