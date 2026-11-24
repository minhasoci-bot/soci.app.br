import assert from 'node:assert/strict';
import test from 'node:test';
import { localScheduler, startupLines } from '../local-scheduler.mjs';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';

// The real server with the clock under control: says how many rounds of the scheduler one minute starts.
// `kind` only renames the in-memory SQLite store, so "Supabase" here never touches the network.
async function roundsInOneMinute(t, { kind, env = {}, options = {} }) {
  const before = {};
  for (const name of ['VERCEL', 'GO_LOCAL_SCHEDULER']) {
    before[name] = process.env[name];
    if (env[name] === undefined) delete process.env[name]; else process.env[name] = env[name];
  }
  t.after(() => {
    for (const [name, value] of Object.entries(before)) if (value === undefined) delete process.env[name]; else process.env[name] = value;
  });
  t.mock.timers.enable({ apis: ['setInterval'] });
  let rounds = 0;
  const base = createSqliteStore(':memory:');
  const store = { ...base, kind, list: () => { rounds++; return []; } };
  const { server, ready, scheduler } = makeServer({ store, port: 0, auth: null, allowLocalAccess: true, ...options });
  t.after(() => server.emit('close'));
  await ready;
  rounds = 0;
  t.mock.timers.tick(60_000);
  for (let i = 0; i < 20; i++) await new Promise(done => setImmediate(done));
  return { rounds, scheduler };
}

test('com SQLite, o agendador local roda a cada minuto', async t => {
  assert.deepEqual(await roundsInOneMinute(t, { kind: 'SQLite' }), { rounds: 1, scheduler: true });
});

test('com Supabase fora da Vercel, o agendador local fica desligado', async t => {
  assert.deepEqual(await roundsInOneMinute(t, { kind: 'Supabase' }), { rounds: 0, scheduler: false });
});

test('GO_LOCAL_SCHEDULER=1 liga o agendador local com Supabase', async t => {
  assert.deepEqual(await roundsInOneMinute(t, { kind: 'Supabase', env: { GO_LOCAL_SCHEDULER: '1' } }), { rounds: 1, scheduler: true });
});

test('socialScheduler: true liga o agendador mesmo com Supabase', async t => {
  assert.deepEqual(await roundsInOneMinute(t, { kind: 'Supabase', options: { socialScheduler: true } }), { rounds: 1, scheduler: true });
});

test('socialScheduler: false desliga o agendador mesmo com GO_LOCAL_SCHEDULER=1', async t => {
  assert.deepEqual(await roundsInOneMinute(t, { kind: 'SQLite', env: { GO_LOCAL_SCHEDULER: '1' }, options: { socialScheduler: false } }),
    { rounds: 0, scheduler: false });
});

test('na Vercel o agendador do processo nunca liga', () => {
  for (const kind of ['SQLite', 'Supabase']) assert.equal(localScheduler(kind, { VERCEL: '1', GO_LOCAL_SCHEDULER: '1' }), false);
});

test('só o valor 1 liga o agendador com Supabase', () => {
  for (const value of ['', '0', 'false', 'true']) assert.equal(localScheduler('Supabase', { GO_LOCAL_SCHEDULER: value }), false);
});

test('o console diz o projeto Supabase e que o agendador está desligado, sem chaves', () => {
  const text = startupLines({ backend: 'Supabase', scheduler: false, env: {
    SUPABASE_URL: 'https://usuario:senha-na-url@projeto.supabase.co/rest?apikey=na-url', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x', GO_STORAGE_KEY: 'segredo'
  } }).join('\n');
  assert.equal(text, 'Banco: Supabase (projeto.supabase.co)\n'
    + 'Agendador: desligado. Este servidor não executa automações, publicações nem campanhas; quem executa é o cron de /api/social/cron. Para ligar aqui, use GO_LOCAL_SCHEDULER=1.');
});

test('o console avisa quando o agendador local roda sobre o Supabase', () => {
  assert.deepEqual(startupLines({ backend: 'Supabase', scheduler: true, env: { SUPABASE_URL: 'https://projeto.supabase.co' } }), [
    'Banco: Supabase (projeto.supabase.co)',
    'Agendador: ligado, a cada minuto. Atenção: ele executa automações, publicações e campanhas neste banco, em paralelo ao cron de /api/social/cron.'
  ]);
});

test('o console diz o arquivo SQLite e que o agendador está ligado', () => {
  assert.deepEqual(startupLines({ backend: 'SQLite', scheduler: true, env: {}, dbPath: '.data/go.sqlite' }), [
    'Banco: SQLite (.data/go.sqlite)',
    'Agendador: ligado, a cada minuto.'
  ]);
});
