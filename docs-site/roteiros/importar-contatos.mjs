// Roteiro de prints do artigo crm/importar-contatos. Rodar com a demo zerada e semeada (ver capturar.mjs).
import { fileURLToPath } from 'node:url';

const CSV = fileURLToPath(new URL('./arquivos/contatos-exemplo.csv', import.meta.url));

export default {
  grupo: 'crm',
  artigo: 'importar-contatos',
  subconta: 'Clínica Sorriso Leve',
  rota: '#contacts',
  passos: [
    { nome: 'botao-importar', destacar: 'main >> text=Importar' },
    { nome: 'escolher-arquivo', acao: page => page.locator('main').getByText('Importar', { exact: true }).click(),
      destacar: '#dialog label:has(input[name="file"])' },
    { nome: 'previa-da-importacao', acao: page => page.locator('#dialog input[name="file"]').setInputFiles(CSV),
      destacar: '#dialog [data-import-preview]' },
    { nome: 'contatos-importados', acao: page => page.locator('#dialog').getByRole('button', { name: 'Importar contatos' }).click(),
      espera: 1500 },
  ],
};
