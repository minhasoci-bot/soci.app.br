import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';

// T.1, afiliados e cursos: ações do Gerenciador de Afiliados e gatilhos de progresso do curso.
const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const flow = (s, name, trigger, steps = [{ type: 'internal_notification', config: { body: name } }]) =>
  save(s, 'workflows', { name, active: true, triggers: [trigger], steps });
const runsOf = (s, id) => s.runs.filter(row => row.workflowId === id);
const tag = (s, contactId, value) => { const row = s.contacts.find(item => item.id === contactId); save(s, 'contacts', { ...row, tags: [...row.tags, value] }, contactId); };
const lastResult = (s, id) => runsOf(s, id).at(-1).results.join(' | ');

function program(s) {
  const campaign = save(s, 'affiliateCampaigns', { name: 'Parceiros', destination: '/loja/demo/x', commissionType: 'percent', commissionValue: 10, holdDays: 7 });
  const vip = save(s, 'affiliateCampaigns', { name: 'VIP', destination: '/loja/demo/vip', commissionType: 'fixed', commissionValue: 30, holdDays: 0 });
  const paula = save(s, 'contacts', { name: 'Paula Souza', email: 'paula@x.test', tags: [], custom: {} });
  const affiliate = save(s, 'affiliates', { name: 'Paula Souza', email: 'paula@x.test', campaignIds: [campaign] });
  return { campaign, vip, paula, affiliate };
}

test('T.1 affiliates: campaign in and out, status, and the "joined a campaign" trigger', () => {
  const s = blank();
  const { campaign, vip, paula, affiliate } = program(s);
  const joined = flow(s, 'Entrou na VIP', { type: 'affiliate_campaign_enrolled', config: { campaignId: vip } }, [{ type: 'add_tag', config: { tag: 'vip' } }]);
  const add = flow(s, 'Promover', { type: 'contact_tag', config: { change: 'added', tag: 'promover' } }, [
    { type: 'add_affiliate_campaign', config: { campaignId: vip } }, { type: 'update_affiliate', config: { status: 'paused' } }]);
  const out = flow(s, 'Rebaixar', { type: 'contact_tag', config: { change: 'added', tag: 'rebaixar' } }, [
    { type: 'remove_affiliate_campaign', config: { campaignId: campaign } }, { type: 'update_affiliate', config: { status: 'active' } }]);

  tag(s, paula, 'promover');
  const row = () => s.affiliates.find(item => item.id === affiliate);
  assert.deepEqual(row().campaignIds, [campaign, vip]);
  assert.equal(row().status, 'paused');
  assert.equal(runsOf(s, joined).length, 1, 'joining the VIP campaign fires the trigger on the affiliate contact');
  assert.ok(s.contacts.find(item => item.id === paula).tags.includes('vip'));
  assert.equal(runsOf(s, add)[0].status, 'Completed');

  tag(s, paula, 'rebaixar');
  assert.deepEqual(row().campaignIds, [vip]);
  assert.equal(row().status, 'active');
  assert.equal(runsOf(s, joined).length, 1, 'leaving a campaign does not fire it');
  assert.equal(runsOf(s, out)[0].status, 'Completed');

  // The team adding the campaign on the affiliate screen fires it too.
  save(s, 'affiliates', { ...row(), campaignIds: [vip, campaign] }, affiliate);
  const any = flow(s, 'Qualquer campanha', { type: 'affiliate_campaign_enrolled', config: {} });
  save(s, 'affiliates', { ...row(), campaignIds: [vip] }, affiliate);
  save(s, 'affiliates', { ...row(), campaignIds: [vip, campaign] }, affiliate);
  assert.equal(runsOf(s, any).length, 1);

  // A contact who is not an affiliate gets an error line, not a crash.
  const lead = save(s, 'contacts', { name: 'Sem programa', email: 'nada@x.test', tags: [], custom: {} });
  tag(s, lead, 'promover');
  assert.match(lastResult(s, add), /não é afiliado/);
});

test('T.1 affiliates: assign a lead to an affiliate, then a manual sale becomes a commission', () => {
  const s = blank();
  const { campaign, affiliate } = program(s);
  const leads = flow(s, 'Lead do afiliado', { type: 'affiliate_lead', config: { affiliateId: affiliate } });
  const sales = flow(s, 'Venda do afiliado', { type: 'affiliate_sale', config: {} }, [{ type: 'add_note', config: { body: 'Comissão {{trigger.total}}' } }]);
  flow(s, 'Atribuir', { type: 'contact_tag', config: { change: 'added', tag: 'indicado' } }, [
    { type: 'assign_affiliate_lead', config: { affiliateId: affiliate, campaignId: '', replace: 'no' } },
    { type: 'affiliate_manual_sale', config: { amount: 500, note: 'Venda no balcão' } }
  ]);
  const ana = save(s, 'contacts', { name: 'Ana', email: 'ana@x.test', tags: [], custom: {} });
  tag(s, ana, 'indicado');
  const contact = s.contacts.find(item => item.id === ana);
  assert.equal(contact.affiliate.affiliateId, affiliate);
  assert.equal(contact.affiliate.campaignId, campaign, 'without a campaign, the affiliate\'s first active one');
  assert.equal(runsOf(s, leads).length, 1);
  const commission = s.affiliateCommissions.find(row => row.contactId === ana);
  assert.equal(commission.value, 50);
  assert.equal(commission.base, 500);
  assert.equal(commission.status, 'pending');
  assert.equal(commission.invoiceId, '');
  assert.equal(runsOf(s, sales).length, 1);
  assert.ok(s.messages.some(row => row.contactId === ana && row.body === 'Comissão 50'));

  // A manual sale has no invoice: the settlement pass must not reverse it.
  execute(s, { type: 'save', key: 'contacts', id: ana, data: { ...s.contacts.find(item => item.id === ana) } });
  assert.equal(s.affiliateCommissions.find(row => row.id === commission.id).status, 'pending');

  // A lead already attributed keeps its affiliate unless the step says to replace it.
  const other = save(s, 'affiliates', { name: 'Rui', email: 'rui@x.test', campaignIds: [campaign] });
  const keep = flow(s, 'Manter', { type: 'contact_tag', config: { change: 'added', tag: 'outro' } }, [{ type: 'assign_affiliate_lead', config: { affiliateId: other, replace: 'no' } }]);
  tag(s, ana, 'outro');
  assert.equal(s.contacts.find(item => item.id === ana).affiliate.affiliateId, affiliate);
  assert.match(lastResult(s, keep), /já indicado/);
  flow(s, 'Trocar', { type: 'contact_tag', config: { change: 'added', tag: 'trocar' } }, [{ type: 'assign_affiliate_lead', config: { affiliateId: other, replace: 'yes' } }]);
  tag(s, ana, 'trocar');
  assert.equal(s.contacts.find(item => item.id === ana).affiliate.affiliateId, other);

  // No attribution, no sale.
  const bob = save(s, 'contacts', { name: 'Bob', email: 'bob@x.test', tags: [], custom: {} });
  const lone = flow(s, 'Venda solta', { type: 'contact_tag', config: { change: 'added', tag: 'venda' } }, [{ type: 'affiliate_manual_sale', config: { amount: 100 } }]);
  tag(s, bob, 'venda');
  assert.match(lastResult(s, lone), /sem afiliado/);
});

test('T.1 courses: course started, module started and module completed from lesson progress', () => {
  const s = blank();
  const course = save(s, 'courses', { name: 'Método', active: true, modules: [
    { id: 'm1', title: 'Fundamentos', lessons: [{ id: 'l1', title: 'Introdução', kind: 'text', body: 'a' }, { id: 'l2', title: 'Base', kind: 'text', body: 'b' }] },
    { id: 'm2', title: 'Prática', lessons: [{ id: 'l3', title: 'Exercício', kind: 'text', body: 'c' }] }] });
  const started = flow(s, 'Começou', { type: 'course_started', config: { courseId: course } }, [{ type: 'add_note', config: { body: 'Começou {{trigger.course}}' } }]);
  const moduleIn = flow(s, 'Módulo começou', { type: 'course_module_started', config: { courseId: course } }, [{ type: 'add_note', config: { body: 'Entrou em {{trigger.module}}' } }]);
  const moduleDone = flow(s, 'Módulo concluído', { type: 'course_module_completed', config: {} }, [{ type: 'add_note', config: { body: 'Terminou {{trigger.module}}' } }]);
  const lesson = (lessonId, done) => execute(s, { type: 'course-activity', data: { courseId: course, email: 'aluna@x.test', name: 'Aluna', event: 'lesson', lessonId, lessonTitle: lessonId, done } });

  lesson('l1', ['l1']);
  const contact = s.contacts.find(row => row.email === 'aluna@x.test');
  const notes = () => s.messages.filter(row => row.contactId === contact.id && row.channel === 'Note').map(row => row.body);
  assert.deepEqual(notes(), ['Começou Método', 'Entrou em Fundamentos']);
  lesson('l2', ['l1', 'l2']);
  assert.deepEqual(notes().slice(2), ['Terminou Fundamentos']);
  lesson('l3', ['l1', 'l2', 'l3']);
  assert.deepEqual(notes().slice(3), ['Entrou em Prática', 'Terminou Prática']);
  assert.equal(runsOf(s, started).length, 1);
  assert.equal(runsOf(s, moduleIn).length, 2);
  assert.equal(runsOf(s, moduleDone).length, 2);

  // Lesson ids that are not in the course do not count.
  const s2 = blank();
  const other = save(s2, 'courses', { name: 'Outro', active: true, modules: [{ id: 'm1', title: 'Único', lessons: [{ id: 'a', title: 'A', kind: 'text', body: 'a' }, { id: 'b', title: 'B', kind: 'text', body: 'b' }] }] });
  const done2 = flow(s2, 'Feito', { type: 'course_module_completed', config: {} });
  execute(s2, { type: 'course-activity', data: { courseId: other, email: 'x@x.test', event: 'lesson', lessonId: 'a', done: ['a', 'b-falso', 'zzz'] } });
  assert.equal(runsOf(s2, done2).length, 0);
});
