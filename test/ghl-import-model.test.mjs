// Importar do GHL: o código de importação (30 min, uso único) e o estado do job na agência.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newImportCode, codeHash, jobByCode, acceptPart, finishUpload } from '../ghl-import-model.mjs';

const agency = (setups = 0) => ({ snapshots: Array.from({ length: setups }, (_, i) => ({ id: `s${i}` })), ghlImports: [] });
const MB = 1024 * 1024;

test('issues a 9-character code that expires in 30 minutes', () => {
  const a = agency();
  const { code, job } = newImportCode(a, { now: 1_000_000 });
  assert.match(code, /^[2-9A-HJ-NP-Z]{3}-[2-9A-HJ-NP-Z]{3}-[2-9A-HJ-NP-Z]{3}$/);
  assert.equal(job.expiresAt - job.created, 30 * 60 * 1000);
  assert.equal(job.status, 'waiting');
  assert.notEqual(job.codeHash, code);
  assert.equal(job.codeHash, codeHash(code));
  assert.equal(a.ghlImports.length, 1);
});

test('keeps only the 10 most recent imports', () => {
  const a = agency();
  for (let i = 0; i < 12; i++) newImportCode(a, { now: 1_000_000 + i });
  assert.equal(a.ghlImports.length, 10);
});

test('refuses a code when the agency has 50 setups', () => {
  assert.throws(() => newImportCode(agency(50)), /Você já tem 50 setups/);
});

test('rejects expired, used and unknown codes', () => {
  const a = agency();
  const { code, job } = newImportCode(a, { now: 0 });
  assert.equal(jobByCode(a, code.toLowerCase().replace(/-/g, ''), { now: 1000 }).id, job.id);
  assert.throws(() => jobByCode(a, code, { now: 31 * 60 * 1000 }), err => err.status === 401 && /Código inválido ou expirado/.test(err.message));
  assert.throws(() => jobByCode(a, 'AAA-BBB-CCC', { now: 1000 }), err => err.status === 401);
  job.status = 'done';
  assert.throws(() => jobByCode(a, code, { now: 1000 }), err => err.status === 401);
});

test('refuses a part over 3 MB and an upload over 60 MB', () => {
  const { job } = newImportCode(agency(), { now: 0 });
  assert.throws(() => acceptPart(job, { name: 'dump', index: 0, total: 1, bytes: 3 * MB + 1 }), /3 MB/);
  for (let i = 0; i < 20; i++) acceptPart(job, { name: 'dump', index: i, total: 21, bytes: 3 * MB });
  assert.throws(() => acceptPart(job, { name: 'dump', index: 20, total: 21, bytes: 1 }), /60 MB/);
  assert.throws(() => acceptPart(job, { name: 'outro', index: 0, total: 1, bytes: 1 }), /Parte desconhecida/);
});

test('finishUpload needs every part', () => {
  const { job } = newImportCode(agency(), { now: 0 });
  acceptPart(job, { name: 'dump', index: 0, total: 2, bytes: 10 });
  acceptPart(job, { name: 'dump', index: 1, total: 2, bytes: 10 });
  acceptPart(job, { name: 'surveys', index: 0, total: 1, bytes: 10 });
  assert.equal(job.status, 'receiving');
  assert.throws(() => finishUpload(job), /Faltam partes da importação/);
  acceptPart(job, { name: 'triggers', index: 0, total: 1, bytes: 10 });
  finishUpload(job);
  assert.equal(job.status, 'received');
});
