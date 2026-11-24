import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../../server.mjs';
import { semear, SUBCONTAS } from '../roteiros/semear-demo.mjs';
import criarPipeline from '../roteiros/criar-pipeline.mjs';

async function iniciar(t) {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://${host}:${server.address().port}`;
}

test('roteiro criar-pipeline tem forma válida', () => {
  assert.equal(criarPipeline.grupo, 'crm');
  assert.equal(criarPipeline.artigo, 'criar-pipeline');
  assert.ok(SUBCONTAS.some(s => s.nome === criarPipeline.subconta));
  assert.match(criarPipeline.rota, /^#/);
  assert.ok(criarPipeline.passos.length >= 3);
  for (const passo of criarPipeline.passos) assert.match(passo.nome, /^[a-z0-9]+(-[a-z0-9]+)*$/);
});

test('semear cria as 3 subcontas fictícias e é idempotente', async t => {
  const base = await iniciar(t);
  assert.deepEqual(await semear({ base }), { subcontas: 3 });
  assert.deepEqual(await semear({ base }), { subcontas: 3 });
  const { workspaces } = await (await fetch(`${base}/api/workspaces`)).json();
  for (const { nome } of SUBCONTAS) assert.equal(workspaces.filter(w => w.name === nome).length, 1, nome);
});

test('cada subconta da demo tem contatos, oportunidades e conversas inventados', async t => {
  const base = await iniciar(t);
  await semear({ base });
  const { workspaces } = await (await fetch(`${base}/api/workspaces`)).json();
  const imobiliaria = workspaces.find(w => w.name === 'Imobiliária Horizonte');
  const { state: estado } = await (await fetch(`${base}/api/state?workspace=${imobiliaria.id}`)).json();
  assert.equal(estado.contacts.length, 15);
  assert.ok(estado.opportunities.length >= 5);
  assert.ok(estado.messages.length >= 3);
  assert.ok(estado.contacts.every(c => /@exemplo\.test$/.test(c.email)), 'só e-mails fictícios');
});
