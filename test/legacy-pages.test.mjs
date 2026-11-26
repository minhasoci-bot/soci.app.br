// Endereços públicos /p/<subconta>/<id> (botão "Ver" da página) e /course/<subconta>/<id> (botão "Aula pública" do
// curso). Desde que a raiz virou a tela de login, o servidor tentava ler ui/p/... e respondia 500. Agora eles abrem o
// app, que mostra a página ou o curso, e respondem 404 quando o item não existe ou não está publicado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';

async function start() {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0 });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  const page = async (path, method = 'GET') => {
    const r = await fetch(base + path, { method, redirect: 'manual' });
    return { status: r.status, type: r.headers.get('content-type') || '', text: await r.text() };
  };
  return { call, page, close: () => new Promise(resolve => server.close(resolve)) };
}

test('/p e /course abrem o app para itens publicados e respondem 404 sem erro para os demais', async t => {
  const local = await start(); t.after(local.close);
  const workspace = (await local.call('/api/workspaces', { name: 'Páginas antigas' })).body.id;
  const save = (key, data, id = '') => local.call(`/api/action?workspace=${workspace}`, { type: 'save', key, id, data });
  const missing = '11111111-2222-3333-4444-555555555555';

  const draft = (await save('pages', { name: 'Rascunho', headline: 'Rascunho', kind: 'Website', active: false })).body.id;
  const published = (await save('pages', { name: 'Oferta', headline: 'Oferta da semana', kind: 'Website', active: true })).body.id;
  const course = (await save('courses', { name: 'Curso aberto', active: true, portalOnly: false })).body.id;
  const portalCourse = (await save('courses', { name: 'Só no portal', active: true, portalOnly: true })).body.id;

  for (const path of [`/p/${workspace}/${published}`, `/course/${workspace}/${course}`]) {
    const opened = await local.page(path);
    assert.equal(opened.status, 200, path);
    assert.match(opened.type, /text\/html/);
    assert.match(opened.text, /<script type="module" src="\/app\.js"><\/script>/, `${path} abre o app`);
    assert.equal((await local.page(path, 'HEAD')).status, 200, `HEAD ${path}`);
  }
  // O app busca os dados por /api/view com o mesmo caminho.
  assert.equal((await local.call(`/api/view/p/${workspace}/${published}`)).body.row.name, 'Oferta');

  for (const path of [`/p/${workspace}/${draft}`, `/p/${workspace}/${missing}`, `/course/${workspace}/${portalCourse}`, `/course/${workspace}/${missing}`, `/p/demo/${missing}`, `/course/demo/${missing}`]) {
    const closed = await local.page(path);
    assert.equal(closed.status, 404, path);
    assert.match(closed.type, /text\/html/, path);
    assert.match(closed.text, /não está publicad/, path);
    assert.equal((await local.page(path, 'HEAD')).status, 404, `HEAD ${path}`);
  }

  // /f continua redirecionando para o formulário.
  const form = await local.page(`/f/${workspace}/${missing}`);
  assert.equal(form.status, 302);
});
