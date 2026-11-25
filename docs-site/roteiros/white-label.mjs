// Roteiro de prints do artigo agencia/white-label. Cada captura parte da Agência Demo recém-semeada.
import { fileURLToPath } from 'node:url';

const LOGO = fileURLToPath(new URL('./arquivos/logo-agencia-demo.png', import.meta.url));
const form = page => page.locator('main form').filter({ has: page.locator('input[name="primary"]') });

export default {
  grupo: 'agencia',
  artigo: 'white-label',
  subconta: 'Clínica Sorriso Leve',
  rota: '#agency/settings/company',
  passos: [
    { nome: 'dados-da-empresa', destacar: 'main input[name="name"]' },
    { nome: 'logotipo', acao: page => form(page).locator('input[name="logoFile"]').setInputFiles(LOGO),
      destacar: 'main input[name="logoFile"]' },
    { nome: 'cores-da-marca', acao: async page => {
      const f = form(page);
      await f.locator('input[name="primary"]').fill('#0f766e');
      await f.locator('input[name="primary"]').dispatchEvent('input');
      await f.locator('input[name="primary"]').scrollIntoViewIfNeeded();
    }, destacar: 'main input[name="primary"]' },
    { nome: 'marca-aplicada', acao: async page => {
      await form(page).getByRole('button', { name: 'Salvar dados da empresa' }).click();
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.scrollTo(0, 0));
    } },
    { nome: 'logo-na-subconta', acao: async page => {
      await page.goto(page.url().replace(/#.*$/, '#contacts'), { waitUntil: 'networkidle' });
    }, destacar: '.ag-logo' },
  ],
};
