// Pontuação de leads: rules that add or remove points when a contact does something. A rule uses the
// same trigger types and filters as the workflows (form sent, e-mail clicked, tag added, appointment
// booked, page visited...). The score lives on the contact; crossing a threshold fires "Pontuação
// mudou" in workflows, and the "Ajustar pontuação" action changes it from a workflow.

import { scoreEvents } from './ui/scoring-data.js';

export { scoreEvents };
export const scoringCollections = ['scoringRules'];

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : typeof value === 'number' ? String(value) : '';

export const scoringFields = {
  scoringRules: (s, d) => {
    const type = str(d.trigger?.type, 60);
    if (!scoreEvents.includes(type)) fail('Escolha a ação do contato que dá pontos.');
    const points = Math.round(Number(d.points));
    if (!Number.isFinite(points) || !points || Math.abs(points) > 1000) fail('Informe os pontos (de -1000 a 1000, diferente de zero).');
    const config = Object.fromEntries(Object.entries(d.trigger?.config && typeof d.trigger.config === 'object' ? d.trigger.config : {}).slice(0, 10).map(([k, v]) => [str(k, 40), str(String(v ?? ''), 200)]).filter(([k]) => k));
    return { name: str(d.name, 80) || 'Regra de pontuação', trigger: { type, config }, points, once: Boolean(d.once), active: d.active === undefined ? true : Boolean(d.active) };
  }
};

const history = (contact, entry) => { contact.scoreHistory = [entry, ...(contact.scoreHistory || [])].slice(0, 30); };

/** Changes a contact's score and fires "Pontuação mudou" for the workflows. */
export function changeScore(s, contact, delta, reason, { emit, depth = 0, at = new Date().toISOString() }) {
  if (!delta) return contact.score || 0;
  const previous = Number(contact.score) || 0, score = Math.max(-100000, Math.min(100000, previous + delta));
  contact.score = score; contact.scoreUpdated = at;
  history(contact, { at, points: delta, reason: str(reason, 120), score });
  emit?.(s, 'score_changed', { contactId: contact.id, score, previous, delta, depth: depth + 1 });
  return score;
}

/**
 * Every workflow event passes here first: the active rules whose trigger matches add their points.
 * `matches(trigger)` is the workflow engine's own trigger filter, so rules and workflows agree.
 */
export function applyScoring(s, type, ctx, { matches, emit }) {
  if (type === 'score_changed' || !ctx.contactId || !scoreEvents.includes(type)) return;
  const rules = (s.scoringRules || []).filter(r => r.active !== false && r.trigger?.type === type);
  if (!rules.length) return;
  const contact = (s.contacts || []).find(c => c.id === ctx.contactId); if (!contact) return;
  let delta = 0; const names = [];
  for (const rule of rules) {
    if (!matches(rule.trigger)) continue;
    if (rule.once && (contact.scoredRules || []).includes(rule.id)) continue;
    if (rule.once) contact.scoredRules = [...(contact.scoredRules || []), rule.id].slice(-200);
    delta += rule.points; names.push(rule.name);
  }
  if (delta) changeScore(s, contact, delta, names.join(', '), { emit, depth: ctx.depth || 0 });
}

/** "Pontuação mudou": fires when the score reaches `min` (it was below) or, without `min`, on any change. */
export const scoreTriggerMatches = (c, ctx) => {
  const min = c.min === '' || c.min === undefined ? null : Number(c.min);
  if (min === null || !Number.isFinite(min)) return true;
  return ctx.previous < min && ctx.score >= min;
};
