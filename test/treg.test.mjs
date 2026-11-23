import test from 'node:test';
import assert from 'node:assert/strict';
import { callTregEndpoint, getInstagramProfile, placesSearchTreg, searchGoogleBusinesses, searchInstagramBusinesses, verifyTregToken } from '../treg.mjs';

// O cliente do Treg usa o fetch global: cada teste troca o fetch por uma resposta fixa e guarda as chamadas.
function fakeFetch(t, reply) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push({ url: String(url), init, body: init.body ? JSON.parse(init.body) : undefined });
    const { status = 200, json = {}, text = '' } = typeof reply === 'function' ? await reply(String(url), init, calls.length) : reply;
    return new Response(status === 200 ? JSON.stringify(json) : text, { status, headers: { 'Content-Type': 'application/json' } });
  });
  return calls;
}

test('verifyTregToken: conta válida, token recusado, erro HTTP e falha de rede', async t => {
  const calls = fakeFetch(t, { json: { account: 'conta', team: 'time', role: 'owner', balance_micro: 12_345_678, catalog_tools: 4300 } });
  assert.deepEqual(await verifyTregToken('tok-1'), { valid: true, account: 'conta', team: 'time', role: 'owner', balanceUsd: '12.35', balanceMicro: 12_345_678, toolsCount: 4300 });
  assert.equal(calls[0].url, 'https://treg.to/home');
  assert.equal(calls[0].init.headers['X-Treg-Token'], 'tok-1');

  t.mock.restoreAll();
  fakeFetch(t, { status: 401, text: 'no' });
  assert.deepEqual(await verifyTregToken('tok-ruim'), { valid: false, error: 'Token do Treg inválido ou expirado.' });

  t.mock.restoreAll();
  fakeFetch(t, { status: 503, text: 'fora do ar' });
  assert.deepEqual(await verifyTregToken('tok'), { valid: false, error: 'Treg respondeu HTTP 503' });

  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('sem rede'); });
  assert.deepEqual(await verifyTregToken('tok'), { valid: false, error: 'sem rede' });
});

test('callTregEndpoint manda token, custo máximo e origem; erro da API vira mensagem curta', async t => {
  const calls = fakeFetch(t, { json: { ok: true } });
  assert.deepEqual(await callTregEndpoint('treg.x.y', { q: 'a' }, { token: 'tok', maxCost: 0.2 }), { ok: true });
  assert.equal(calls[0].url, 'https://treg.to/call/treg.x.y');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(calls[0].body, { q: 'a' });
  assert.equal(calls[0].init.headers['X-Treg-Route-Max-Cost'], '0.2');
  assert.equal(calls[0].init.headers['X-Treg-Meta'], 'source=soci-agent');

  t.mock.restoreAll();
  fakeFetch(t, { status: 402, text: 'saldo insuficiente '.repeat(40) });
  await assert.rejects(callTregEndpoint('treg.x.y', null, { token: 'tok' }), error => {
    assert.match(error.message, /^Erro na API do Treg \(402\): saldo insuficiente/);
    assert.ok(error.message.length < 340, 'o corpo do erro é cortado');
    return true;
  });
});

test('searchGoogleBusinesses normaliza os lugares, ignora sem nome e limita a 15', async t => {
  const places = [
    { title: 'Padaria A', place_id: 'p1', address: 'Rua 1', phone: '11 1', category: 'Padaria', rating: { value: 4.6, votes_count: 120 },
      url: 'https://instagram.com/padariaa', latitude: -23.5, longitude: -46.6, work_hours: { current_status: 'Aberto' } },
    { name: 'Café B', id: 'p2', snippet: 'Av. 2', additional_categories: ['Café'], rating: 4.1, reviews: 9, website: 'https://cafeb.example',
      contact_url: 'https://www.instagram.com/cafeb', is_claimed: true },
    { place_id: 'sem-nome' },
    ...Array.from({ length: 20 }, (_, i) => ({ title: `Extra ${i}`, place_id: `x${i}` }))
  ];
  const calls = fakeFetch(t, { json: { output: { places } } });
  const found = await searchGoogleBusinesses('padaria em Santos', { token: 'tok' });
  assert.equal(calls[0].url, 'https://treg.to/call/treg.google.serp.maps');
  assert.deepEqual(calls[0].body, { q: 'padaria em Santos', country: 'br', language: 'pt' });
  assert.equal(found.length, 15);
  assert.deepEqual(found[0], { placeId: 'p1', name: 'Padaria A', address: 'Rua 1', phone: '11 1', category: 'Padaria', rating: 4.6, reviewsCount: 120,
    website: 'https://instagram.com/padariaa', instagram: 'https://instagram.com/padariaa', latitude: -23.5, longitude: -46.6, status: 'Aberto' });
  assert.deepEqual(found[1], { placeId: 'p2', name: 'Café B', address: 'Av. 2', phone: '', category: 'Café', rating: 4.1, reviewsCount: 9,
    website: 'https://cafeb.example', instagram: 'https://www.instagram.com/cafeb', latitude: null, longitude: null, status: 'Verificado no Google' });
  assert.ok(!found.some(row => row.placeId === 'sem-nome'));
});

test('Instagram: busca de contas e perfil público', async t => {
  fakeFetch(t, { json: { users: [
    { username: '@lojac', full_name: 'Loja C', biography: 'x'.repeat(400), follower_count: 1500, category_name: 'Loja', external_url: 'https://lojac.example' },
    { user: { username: 'lojad', full_name: 'Loja D', follower_count: 10 } },
    { full_name: 'sem usuário' }
  ] } });
  const users = await searchInstagramBusinesses('loja santos', { token: 'tok' });
  assert.equal(users.length, 2);
  assert.equal(users[0].username, 'lojac');
  assert.equal(users[0].bio.length, 300);
  assert.equal(users[0].url, 'https://www.instagram.com/lojac/', 'o @ sai também do link');
  assert.deepEqual(users[1], { username: 'lojad', name: 'Loja D', bio: '', followers: 10, url: 'https://www.instagram.com/lojad/', category: '', externalUrl: '' });

  t.mock.restoreAll();
  const calls = fakeFetch(t, { json: { output: { username: 'lojac', full_name: 'Loja C', biography: 'bio', followers: 1500, following: 3, posts_count: 42, is_professional_account: true } } });
  const profile = await getInstagramProfile('https://www.instagram.com/lojac/', { token: 'tok' });
  assert.deepEqual(calls[0].body, { username: 'lojac' });
  assert.deepEqual(profile, { username: 'lojac', name: 'Loja C', bio: 'bio', followers: 1500, following: 3, postsCount: 42, url: 'https://www.instagram.com/lojac/', isBusiness: true });
});

test('placesSearchTreg: até 3 palavras, sem lugares repetidos, e uma busca com erro não derruba as outras', async t => {
  t.mock.method(console, 'warn', () => {});
  const calls = fakeFetch(t, (url, init, n) => n === 2
    ? { status: 500, text: 'falhou' }
    : { json: { places: [{ title: `Lugar ${n}`, place_id: `p${n}` }, { title: 'Comum', place_id: 'comum' }] } });
  const results = await placesSearchTreg(['padaria', 'café', 'mercado', 'farmácia'], 'Santos', { token: 'tok' });
  assert.equal(calls.length, 3, 'só as 3 primeiras palavras');
  assert.deepEqual(calls.map(call => call.body.q), ['padaria em Santos', 'café em Santos', 'mercado em Santos']);
  assert.deepEqual(results.map(row => row.placeId), ['p1', 'comum', 'p3']);
});
