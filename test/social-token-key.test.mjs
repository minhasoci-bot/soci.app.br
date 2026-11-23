// Tokens das redes sociais: a chave fixa do código só vale fora da hospedagem (desenvolvimento local).
import test from 'node:test';
import assert from 'node:assert/strict';
import { seal, unseal } from '../social-providers.mjs';

const KEYS = ['SOCIAL_TOKEN_KEY', 'GO_STORAGE_KEY', 'VERCEL', 'AWS_LAMBDA_FUNCTION_NAME'];
function withEnv(t, values) {
  const saved = Object.fromEntries(KEYS.map(k => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, values);
  t.after(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });
}

test('local sem chave configurada usa a chave de desenvolvimento', t => {
  withEnv(t, {});
  assert.deepEqual(unseal(seal({ token: 'abc' })), { token: 'abc' });
});

test('na Vercel sem chave configurada, seal recusa com erro 500', t => {
  withEnv(t, { VERCEL: '1' });
  assert.throws(() => seal({ token: 'abc' }), err => err.status === 500 && /SOCIAL_TOKEN_KEY|GO_STORAGE_KEY/.test(err.message));
});

test('na Vercel sem chave configurada, unseal recusa em vez de abrir com a chave fixa', t => {
  withEnv(t, {});
  const sealedWithFixedKey = seal({ token: 'abc' });
  process.env.AWS_LAMBDA_FUNCTION_NAME = 'server';
  assert.throws(() => unseal(sealedWithFixedKey), err => err.status === 500);
});

test('na Vercel com GO_STORAGE_KEY o token é cifrado e aberto normalmente', t => {
  withEnv(t, { VERCEL: '1', GO_STORAGE_KEY: 'chave-de-teste' });
  const sealed = seal({ token: 'abc' });
  assert.deepEqual(unseal(sealed), { token: 'abc' });
  delete process.env.VERCEL;
  delete process.env.GO_STORAGE_KEY;
  assert.equal(unseal(sealed), null, 'a chave fixa não abre o que foi cifrado com a chave real');
});

test('SOCIAL_TOKEN_KEY tem prioridade sobre GO_STORAGE_KEY', t => {
  withEnv(t, { VERCEL: '1', SOCIAL_TOKEN_KEY: 'social', GO_STORAGE_KEY: 'storage' });
  const sealed = seal({ token: 'abc' });
  delete process.env.SOCIAL_TOKEN_KEY;
  assert.equal(unseal(sealed), null);
  process.env.SOCIAL_TOKEN_KEY = 'social';
  assert.deepEqual(unseal(sealed), { token: 'abc' });
});
