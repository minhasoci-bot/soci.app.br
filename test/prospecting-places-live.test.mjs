import test from 'node:test';
import assert from 'node:assert/strict';
import { placeSummaries } from '../prospecting-places.mjs';
import { isGooglePlace, mapsPlaceholderName, withPlace } from '../ui/prospect-report.js';

const place = id => ({ id, displayName: { text: `Pet Shop ${id}` }, formattedAddress: 'Rua A, 10 - Santos, SP', nationalPhoneNumber: '(13) 3333-0000',
  websiteUri: 'https://petshop.com.br/', primaryTypeDisplayName: { text: 'Pet shop' }, rating: 4.7, userRatingCount: 120 });

test('Places ao vivo: resume os dados do Google e ignora IDs do OSM e inválidos', async () => {
  const asked = [];
  const found = await placeSummaries(['g-1', 'osm-node-5', 'bad id!', 'g-1'], {
    configured: true, now: 1, fetchSummary: async id => { asked.push(id); return place(id); }
  });
  assert.deepEqual(asked, ['g-1']);
  assert.deepEqual(found['g-1'], { name: 'Pet Shop g-1', address: 'Rua A, 10 - Santos, SP', phone: '(13) 3333-0000',
    website: 'https://petshop.com.br/', category: 'Pet shop', rating: 4.7, reviews: 120 });
});

test('Places ao vivo: guarda na memória por alguns minutos e lê de novo depois', async () => {
  let calls = 0;
  const fetchSummary = async id => { calls++; return place(id); };
  await placeSummaries(['g-cache'], { configured: true, now: 1_000, fetchSummary });
  await placeSummaries(['g-cache'], { configured: true, now: 1_000 + 60_000, fetchSummary });
  assert.equal(calls, 1, 'dentro de 10 minutos usa a memória');
  await placeSummaries(['g-cache'], { configured: true, now: 1_000 + 11 * 60_000, fetchSummary });
  assert.equal(calls, 2, 'depois de 10 minutos consulta o Google de novo');
});

test('Places ao vivo: falha de um lugar não derruba os outros; sem chave não consulta nada', async () => {
  const found = await placeSummaries(['g-ok', 'g-erro'], {
    configured: true, now: 5, fetchSummary: async id => { if (id === 'g-erro') throw new Error('quota'); return place(id); }
  });
  assert.deepEqual(Object.keys(found), ['g-ok']);
  assert.deepEqual(await placeSummaries(['g-ok'], { configured: false, fetchSummary: () => assert.fail('não deve consultar') }), {});
});

test('withPlace troca só o nome provisório e preenche o que está vazio, sem apagar dados próprios', () => {
  assert.equal(isGooglePlace('ChIJ123'), true);
  assert.equal(isGooglePlace('osm-node-1'), false);
  assert.equal(isGooglePlace(''), false);
  const live = { name: 'Pet Shop Floresta', address: 'Rua B, 2', phone: '(13) 9999-0000', website: 'https://floresta.com.br/', category: 'Pet shop', rating: 4.9, reviews: 80 };
  const maps = withPlace({ id: 'p1', name: mapsPlaceholderName, placeId: 'ChIJ1', phone: '', website: '', rating: null, country: 'Brasil' }, live);
  assert.equal(maps.name, 'Pet Shop Floresta');
  assert.equal(maps.address, 'Rua B, 2');
  assert.equal(maps.country, '', 'o endereço do Google já traz o país');
  assert.equal(maps.phone, '(13) 9999-0000');
  assert.equal(maps.rating, 4.9);
  assert.equal(maps.id, 'p1');
  const own = withPlace({ name: 'Nome da agência', phone: '11 1111-1111', city: 'Santos', address: '', rating: 3 }, live);
  assert.equal(own.name, 'Nome da agência');
  assert.equal(own.phone, '11 1111-1111');
  assert.equal(own.address, '', 'endereço próprio (cidade) não é misturado com o do Google');
  assert.equal(own.rating, 3);
  assert.equal(withPlace(null, live), null);
});
