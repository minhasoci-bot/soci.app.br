import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { formTemplates, newField, readAnswers, validFields } from '../ui/form-fields.js';

async function start(t) {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const action = async command => {
    const r = await fetch(`${base}/api/action?workspace=demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
    return { status: r.status, body: await r.json() };
  };
  const post = (path, body) => fetch(base + path, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: base }, body });
  return { base, action, post };
}

test('Fields are validated: choices need options, keys stay unique and a form needs email or phone', () => {
  assert.throws(() => validFields([newField('text')]), /e-mail ou de telefone/);
  assert.throws(() => validFields([newField('email'), { ...newField('select'), options: [] }]), /opções/);
  const fields = validFields([newField('email'), { ...newField('text'), label: 'Cargo' }, { ...newField('text'), label: 'Cargo' }, newField('heading'), newField('source')]);
  assert.deepEqual(fields.map(field => field.key), ['email', 'cargo', 'cargo_2', '', 'source']);
  assert.equal(fields.find(field => field.type === 'source').hidden, true);
  for (const template of formTemplates) assert.ok(validFields(template.build()).length, template.id);
});

test('Answers are checked per field type and mapped to the contact', () => {
  const form = { fields: validFields([newField('name', { required: true }), newField('email'), newField('phone'), newField('rating', { key: 'nota', required: true }),
    newField('checkbox', { label: 'Interesses', options: ['Site', 'Loja'] }), newField('terms'), newField('organization')]) };
  const bad = readAnswers(form, { name: '', email: 'nope', phone: '12', nota: '9', interesses: ['Site', 'Outro'] });
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['consentimento', 'email', 'interesses', 'name', 'nota', 'phone'].sort());
  const good = readAnswers(form, { name: 'Ana Lima', email: 'ANA@Example.com', phone: '+55 31 99999-0000', nota: '5', interesses: ['Site', 'Loja'], consentimento: 'on', organization: 'Atelier' });
  assert.equal(good.ok, true);
  assert.deepEqual(good.contact, { name: 'Ana Lima', email: 'ana@example.com', phone: '+55 31 99999-0000', company: 'Atelier' });
  assert.deepEqual(good.answers.find(answer => answer.key === 'interesses').value, 'Site, Loja');
  assert.equal(good.answers.find(answer => answer.key === 'nota').value, '5 / 5');
});

test('A built form is published, counts views, rejects bad answers and turns good ones into a contact', async t => {
  const { base, action, post } = await start(t);
  const fields = [newField('first_name', { required: true }), newField('email'), newField('select', { label: 'Serviço', key: 'servico', required: true, options: ['Site', 'Loja'] }),
    newField('checkbox', { label: 'Canais', key: 'canais', options: ['WhatsApp', 'E-mail'] }), newField('source', { value: 'Anúncio' })];
  const saved = await action({ type: 'save', key: 'forms', data: { name: 'Orçamento', description: 'Peça seu orçamento', active: true, fields, button: 'Quero meu orçamento', addTags: 'lead-site', onSubmit: { action: 'message', message: 'Retornamos em 1 dia útil.' } } });
  assert.equal(saved.status, 200);
  const form = saved.body.state.forms.find(item => item.name === 'Orçamento');
  assert.equal(form.fields.length, 5);

  const page = await fetch(`${base}/form/demo/${form.id}?servico=Loja`);
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors \*/);
  assert.match(html, /Quero meu orçamento/);
  assert.match(html, /<option selected>Loja<\/option>/, 'query keys prefill fields');
  assert.match(html, /name="source" value="Anúncio"/);

  const legacy = await fetch(`${base}/f/demo/${form.id}`, { redirect: 'manual' });
  assert.equal(legacy.headers.get('location'), `/form/demo/${form.id}`);

  const invalid = await post(`/form/demo/${form.id}`, 'first_name=&email=ruim&servico=Outro');
  assert.equal(invalid.status, 422);
  assert.match(await invalid.text(), /Use um e-mail válido/);

  const sent = await post(`/form/demo/${form.id}?embed=1`, 'first_name=Bia&email=bia%40example.com&servico=Site&canais=WhatsApp&canais=E-mail');
  assert.equal(sent.status, 200);
  assert.match(await sent.text(), /Retornamos em 1 dia útil/);

  const { body } = await action({ type: 'form-view', id: form.id });
  const state = body.state;
  const current = state.forms.find(item => item.id === form.id);
  assert.equal(current.views, 2, 'one public visit plus this count; posts and the legacy redirect are not visits');
  const submission = state.submissions.find(item => item.formId === form.id);
  assert.equal(submission.source, 'Incorporado');
  assert.deepEqual(submission.answers.map(answer => answer.value), ['Bia', 'bia@example.com', 'Site', 'WhatsApp, E-mail', 'Anúncio']);
  const contact = state.contacts.find(item => item.email === 'bia@example.com');
  assert.equal(contact.name, 'Bia');
  assert.deepEqual(contact.tags, ['lead-site']);
});

test('Redirects, schedules and drafts are respected', async t => {
  const { base, action, post } = await start(t);
  assert.equal((await action({ type: 'save', key: 'forms', data: { name: 'X', active: true, fields: [newField('email')], onSubmit: { action: 'redirect', url: 'javascript:alert(1)' } } })).status, 400);
  const saved = await action({ type: 'save', key: 'forms', data: { name: 'Lista', active: true, fields: [newField('email')], onSubmit: { action: 'redirect', url: 'https://example.com/obrigado' } } });
  const form = saved.body.state.forms.find(item => item.name === 'Lista');
  const sent = await post(`/form/demo/${form.id}`, 'email=c%40example.com');
  assert.equal(sent.status, 303);
  assert.equal(sent.headers.get('location'), 'https://example.com/obrigado');

  await action({ type: 'save', key: 'forms', id: form.id, data: { ...form, schedule: { start: '2000-01-01T00:00:00Z', end: '2000-02-01T00:00:00Z', closedMessage: 'Inscrições encerradas.' } } });
  assert.match(await (await fetch(`${base}/form/demo/${form.id}`)).text(), /Inscrições encerradas/);
  assert.equal((await post(`/form/demo/${form.id}`, 'email=d%40example.com')).status, 200, 'closed forms show the closed message');
  const after = await action({ type: 'form-view', id: form.id }).catch(() => null);
  assert.equal(after.body.state.submissions.filter(item => item.formId === form.id).length, 1);

  await action({ type: 'save', key: 'forms', id: form.id, data: { ...form, active: false, schedule: { start: '', end: '', closedMessage: '' } } });
  assert.equal((await fetch(`${base}/form/demo/${form.id}`)).status, 404);
});
