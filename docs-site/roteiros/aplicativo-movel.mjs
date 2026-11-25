// Roteiro de prints do artigo apps/aplicativo-movel. Cada captura parte da Agência Demo recém-semeada.
import { fileURLToPath } from 'node:url';

const ICONE = fileURLToPath(new URL('./arquivos/logo-agencia-demo.png', import.meta.url));
const secao = (page, chave) => page.locator(`[data-mc="section"][data-key="${chave}"]`).click();

// O app no tamanho de um celular: cada tela vira uma foto e as fotos ficam lado a lado na página do print.
async function celulares(page, telas) {
  const origem = new URL(page.url()).origin, fotos = [];
  await page.setViewportSize({ width: 390, height: 800 });
  for (const tela of telas) {
    await page.goto(`${origem}${tela.url}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    if (tela.acao) { await tela.acao(page); await page.waitForTimeout(1200); }
    fotos.push((await page.screenshot({ type: 'png' })).toString('base64'));
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('about:blank');
  await page.setContent(`<body style="margin:0;height:900px;display:flex;justify-content:center;align-items:center;gap:56px;background:#f3f1f7">${fotos.map(foto => `<img style="width:390px;height:800px;border-radius:40px;border:10px solid #1c1824" src="data:image/png;base64,${foto}">`).join('')}</body>`);
}

export default {
  grupo: 'apps',
  artigo: 'aplicativo-movel',
  subconta: 'Clínica Sorriso Leve',
  rota: '#agency/mobile-app',
  passos: [
    { nome: 'criador', destacar: '.mc-nav' },
    { nome: 'identidade', acao: async page => {
      await page.locator('.mc-form input[name="appName"]').fill('Agência Demo');
      await page.locator('input[name="iconFile"]').setInputFiles(ICONE);
      await page.waitForTimeout(800);
      await page.locator('input[name="themePreset"][value="floresta"]').check();
    }, destacar: '.mc-themes' },
    { nome: 'entrada', acao: async page => {
      await secao(page, 'entry');
      await page.locator('input[name="loginTitle"]').fill('Que bom ter você aqui');
    }, destacar: '.mc-phone' },
    { nome: 'modulos', acao: async page => {
      await secao(page, 'modules');
      await page.locator('[data-mc="up"][data-key="opportunities"]').click();
    }, destacar: '.mc-modules' },
    { nome: 'links', acao: async page => {
      await secao(page, 'links');
      await page.locator('[data-mc="link-add"]').click();
      await page.locator('input[name="linkLabel"]').fill('Central de ajuda');
      await page.locator('input[name="linkUrl"]').fill('https://ajuda.exemplo.test');
    }, destacar: '.mc-links' },
    { nome: 'salvar', acao: async page => {
      await secao(page, 'identity');
    }, destacar: '.mc-foot' },
    { nome: 'publicar', acao: async page => {
      await page.locator('.mc-foot .primary').click();
      await page.waitForTimeout(1500);
      await page.locator('[data-mc="publish"]').first().click();
      await page.waitForTimeout(1500);
      // O endereço local muda de porta a cada captura: o print mostra um endereço de exemplo.
      await page.locator('.mc-link code').evaluate(no => { no.textContent = 'https://app.exemplo.test/mobile/agencia/'; });
    }, destacar: '.mc-link' },
    { nome: 'app-no-celular', acao: async page => {
      const app = hash => `/app?shell=mobile&agency=agency&workspace=${encodeURIComponent(new URL(page.url()).searchParams.get('workspace') || '')}${hash}`;
      const inicio = app('#home');
      await celulares(page, [{ url: '/mobile/agency/' }, { url: inicio }, { url: inicio, acao: tela => tela.locator('[data-ma-more]').click() }]);
    } },
  ],
};
