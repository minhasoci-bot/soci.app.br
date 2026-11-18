import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { formTemplates, newField, quizTemplates, readAnswers, surveyTemplates, validFields } from '../ui/form-fields.js';

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

test('Survey steps follow jumps: skipped steps are not required and their answers are not kept', async t => {
  const { base, action, post } = await start(t);
  const fields = surveyTemplates.find(item => item.id === 'nps').build();
  const saved = await action({ type: 'save', key: 'forms', data: { name: 'NPS', active: true, kind: 'survey', fields } });
  assert.equal(saved.status, 200);
  const survey = saved.body.state.forms.find(item => item.name === 'NPS');
  assert.equal(survey.kind, 'survey');
  assert.equal(survey.fields.filter(field => field.type === 'break').length, 2);
  assert.equal(survey.fields[0].logic.length, 1, 'the jump survives validation');

  const page = await (await fetch(`${base}/form/demo/${survey.id}`)).text();
  assert.equal((page.match(/class="sf-slide"/g) || []).length, 3);
  assert.match(page, /data-steps/);
  assert.match(page, /sf-logic/);

  const promoter = await post(`/form/demo/${survey.id}`, 'recomendaria=Sim%2C+com+certeza&melhorias=ignorado&name=Davi&email=davi%40example.com');
  assert.equal(promoter.status, 200, 'a promoter skips the improvement step');
  const detractor = await post(`/form/demo/${survey.id}`, 'recomendaria=N%C3%A3o&name=Eva&email=eva%40example.com');
  assert.equal(detractor.status, 422, 'a detractor must answer the improvement step');
  assert.match(await detractor.text(), /Preencha este campo/);

  const { body } = await action({ type: 'form-view', id: survey.id });
  const kept = body.state.submissions.find(item => item.formId === survey.id);
  assert.ok(!kept.answers.some(answer => answer.key === 'melhorias'), 'answers from a skipped step are dropped');
  assert.equal(validFields(fields, [], 'form').some(field => field.type === 'break'), false, 'plain forms have no steps');
});

test('A quiz scores the answers, shows the tier result and tags the contact', async t => {
  const { base, action, post } = await start(t);
  const fields = quizTemplates.find(item => item.id === 'marketing').build();
  const tiers = [{ name: 'Iniciante', min: 0, max: 49, message: 'Comece pelo básico.', tag: 'quiz-iniciante' },
    { name: 'Avançado', min: 50, max: 100, message: 'Vamos acelerar.', ctaLabel: 'Agendar conversa', ctaUrl: 'https://example.com/agenda', tag: 'quiz-avancado' }];
  assert.equal((await action({ type: 'save', key: 'forms', data: { name: 'Q', active: true, kind: 'quiz', fields, tiers: [{ name: 'A', min: 0, max: 60 }, { name: 'B', min: 50, max: 100 }] } })).status, 400, 'overlapping tiers are refused');
  const saved = await action({ type: 'save', key: 'forms', data: { name: 'Diagnóstico', active: true, kind: 'quiz', fields, tiers, button: 'Ver meu resultado' } });
  const quiz = saved.body.state.forms.find(item => item.name === 'Diagnóstico');
  assert.equal(quiz.tiers.length, 2);

  const sent = await post(`/form/demo/${quiz.id}`, 'frequencia=Uma+vez+por+semana&anuncios=Todo+m%C3%AAs%2C+com+metas&ferramentas=CRM&ferramentas=WhatsApp+Business&first_name=Gil&email=gil%40example.com');
  const html = await sent.text();
  assert.equal(sent.status, 200);
  assert.match(html, /67%/);
  assert.match(html, /Avançado/);
  assert.match(html, /href="https:\/\/example.com\/agenda"/);
  assert.match(html, /Conteúdo/);

  const { body } = await action({ type: 'form-view', id: quiz.id });
  const submission = body.state.submissions.find(item => item.formId === quiz.id);
  assert.deepEqual([submission.result.percent, submission.result.tier, submission.result.score, submission.result.max], [67, 'Avançado', 20, 30]);
  assert.match(submission.answers.at(-1).value, /Avançado · 67%/);
  assert.deepEqual(body.state.contacts.find(item => item.email === 'gil@example.com').tags, ['quiz-avancado']);
});
