// Roteiro de prints do artigo pagamentos/livro-da-cobranca. O CNPJ, o endereço e os pagamentos são fictícios.
const FISCAL = { taxId: '11.222.333/0001-81', name: 'Clínica Sorriso Leve Ltda', email: 'fiscal@exemplo.com.br', zip: '01310-100', street: 'Avenida Exemplo', number: '100', district: 'Centro', city: 'São Paulo', ibge: '3550308' };
const form = page => page.locator('main form[data-form="fiscal"]');

// Três pagamentos e uma devolução, para o livro ter o que mostrar.
const movimentar = page => page.evaluate(async () => {
  const id = new URLSearchParams(location.search).get('workspace');
  const pedir = async (caminho, corpo) => (await fetch(caminho, corpo && { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })).json();
  const { state } = await pedir(`/api/state?workspace=${id}`);
  const salvar = (key, data, registro) => pedir(`/api/action?workspace=${id}`, { type: 'save', key, data, id: registro });
  const hoje = new Date().toISOString().slice(0, 10);
  const pagar = (i, amount, method, note) => salvar('transactions', { contactId: state.contacts[i].id, amount, date: hoje, method, status: 'Succeeded', note });
  await pagar(0, 150, 'Pix', 'Avaliação completa');
  await pagar(1, 890, 'Card', 'Clareamento');
  const devolvido = await pagar(2, 120, 'Pix', 'Consulta de retorno');
  await salvar('transactions', { contactId: state.contacts[2].id, amount: 120, date: hoje, method: 'Pix', status: 'Refunded', note: 'Consulta de retorno' }, devolvido.id);
});

export default {
  grupo: 'pagamentos',
  artigo: 'livro-da-cobranca',
  subconta: 'Clínica Sorriso Leve',
  rota: '#settings/fiscal',
  passos: [
    { nome: 'cadastro-fiscal', acao: async page => {
      for (const [campo, valor] of Object.entries(FISCAL)) await form(page).locator(`input[name="${campo}"]`).fill(valor);
      await form(page).locator('select[name="state"]').selectOption('SP');
    }, destacar: 'main form[data-form="fiscal"]' },
    { nome: 'salvar-cadastro', acao: async page => {
      await form(page).getByRole('button', { name: 'Salvar cadastro fiscal' }).click();
      await page.waitForTimeout(800);
      await form(page).getByRole('button', { name: 'Salvar cadastro fiscal' }).scrollIntoViewIfNeeded();
    }, destacar: 'main form[data-form="fiscal"] button.primary' },
    { nome: 'livro', acao: async page => {
      await movimentar(page);
      await page.goto(page.url().replace(/#.*$/, '#payments'), { waitUntil: 'networkidle' });
      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('main').getByText('Livro', { exact: true }).first().click();
    }, espera: 2000, destacar: 'main form[data-ledger-form]' },
    { nome: 'exportar', destacar: 'main form[data-ledger-form] a[download]' },
  ],
};
