// Pipeline administration: display settings, smart tags, ordering, duplicate and delete of pipelines and stages,
// and moving an opportunity's expected close date from the forecast timeline. model.mjs routes these commands here.
import { cleanRules, smartTagColors } from './ui/opportunity-filters.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const req = (value, label, limit) => str(value, limit) || fail(`${label} is required.`);
const find = (s, key, id) => s[key].find(row => row.id === id);
export const colorModes = ['none', 'dot', 'tint'];
export const stageColors = ['', 'blue', 'green', 'orange', 'red', 'purple', 'pink', 'teal', 'gray'];

// Reorders `rows` (in place, inside the full collection) to follow `ids`. Every id must be present exactly once.
function reorder(s, key, rows, ids) {
  if (!Array.isArray(ids) || ids.length !== rows.length || new Set(ids).size !== ids.length || ids.some(id => !rows.some(row => row.id === id)))
    fail('Send every item exactly once to reorder.');
  const ordered = ids.map(id => rows.find(row => row.id === id));
  let next = 0;
  s[key] = s[key].map(row => rows.includes(row) ? ordered[next++] : row);
}

// Workflows that start on a deleted stage can no longer fire: unpublish them and clear the stage.
function releaseStages(s, stageIds) {
  for (const workflow of [...s.workflows, ...(s.deletedWorkflows || [])]) {
    if (!stageIds.includes(workflow.stageId)) continue;
    workflow.stageId = '';
    workflow.active = false;
  }
}

function smartTag(d, previous) {
  const rules = cleanRules(d.rules);
  if (!rules.length) fail('Add at least one rule to the smart tag.');
  return {
    id: previous?.id, name: req(d.name, 'Tag name', 40), description: str(d.description, 200),
    color: smartTagColors.includes(d.color) ? d.color : 'orange', allPipelines: d.allPipelines === true, rules
  };
}

/** Runs a pipeline command. Returns undefined when `type` is not one of them. */
export function pipelineCommand(s, type, id, d, { add, uid, now }) {
  if (type === 'pipeline-settings') {
    const pipeline = find(s, 'pipelines', id) || fail('Pipeline not found.', 404);
    if ('name' in d) pipeline.name = req(d.name, 'Pipeline name', 80);
    if ('dealProbability' in d) pipeline.dealProbability = d.dealProbability === true;
    if ('colorMode' in d) pipeline.colorMode = colorModes.includes(d.colorMode) ? d.colorMode : fail('Choose a valid color mode.');
    pipeline.updated = now();
    return pipeline.id;
  }
  if (type === 'smart-tag') {
    const pipeline = find(s, 'pipelines', d.pipelineId) || fail('Pipeline not found.', 404);
    const tags = pipeline.smartTags ||= [];
    const previous = id ? tags.find(tag => tag.id === id) || fail('Smart tag not found.', 404) : null;
    if (!previous && tags.length >= 20) fail('A pipeline can have up to 20 smart tags.');
    const tag = { ...smartTag(d, previous), id: previous?.id || uid(), updated: now() };
    if (tags.some(other => other.id !== tag.id && other.name.toLowerCase() === tag.name.toLowerCase())) fail('This pipeline already has a smart tag with that name.', 409);
    if (previous) Object.assign(previous, tag); else tags.push(tag);
    pipeline.updated = now();
    return tag.id;
  }
  if (type === 'smart-tag-delete') {
    const pipeline = find(s, 'pipelines', d.pipelineId) || fail('Pipeline not found.', 404);
    if (!(pipeline.smartTags || []).some(tag => tag.id === id)) fail('Smart tag not found.', 404);
    pipeline.smartTags = pipeline.smartTags.filter(tag => tag.id !== id);
    return id;
  }
  if (type === 'pipeline-order') { reorder(s, 'pipelines', [...s.pipelines], d.ids); return d.ids.length; }
  if (type === 'stage-order') {
    find(s, 'pipelines', d.pipelineId) || fail('Pipeline not found.', 404);
    reorder(s, 'stages', s.stages.filter(stage => stage.pipelineId === d.pipelineId), d.ids);
    return d.ids.length;
  }
  if (type === 'pipeline-duplicate') {
    const source = find(s, 'pipelines', id) || fail('Pipeline not found.', 404);
    if (s.pipelines.length >= 30) fail('A workspace can have up to 30 pipelines.');
    const copy = add(s, 'pipelines', {
      name: `${source.name} (cópia)`.slice(0, 80), dealProbability: source.dealProbability, colorMode: source.colorMode,
      smartTags: (source.smartTags || []).map(tag => ({ ...structuredClone(tag), id: uid(), allPipelines: false }))
    });
    // Keep the copy right after its source.
    s.pipelines.splice(s.pipelines.indexOf(copy), 1);
    s.pipelines.splice(s.pipelines.indexOf(source) + 1, 0, copy);
    for (const stage of s.stages.filter(row => row.pipelineId === source.id))
      add(s, 'stages', { name: stage.name, pipelineId: copy.id, visible: stage.visible !== false, probability: stage.probability ?? null, color: stage.color || '' });
    return copy.id;
  }
  if (type === 'pipeline-delete') {
    const pipeline = find(s, 'pipelines', id) || fail('Pipeline not found.', 404);
    if (s.pipelines.length === 1) fail('A workspace needs at least one pipeline.', 409);
    const count = s.opportunities.filter(deal => deal.pipelineId === id).length;
    if (count) fail(`Move or delete the ${count} opportunit${count === 1 ? 'y' : 'ies'} of this pipeline first.`, 409);
    const stageIds = s.stages.filter(stage => stage.pipelineId === id).map(stage => stage.id);
    releaseStages(s, stageIds);
    s.stages = s.stages.filter(stage => stage.pipelineId !== id);
    s.pipelines = s.pipelines.filter(row => row !== pipeline);
    return id;
  }
  if (type === 'stage-delete') {
    const stage = find(s, 'stages', id) || fail('Stage not found.', 404);
    if (s.stages.filter(row => row.pipelineId === stage.pipelineId).length === 1) fail('A pipeline needs at least one stage.', 409);
    const count = s.opportunities.filter(deal => deal.stage === id).length;
    if (count) fail(`Move the ${count} opportunit${count === 1 ? 'y' : 'ies'} of this stage first.`, 409);
    releaseStages(s, [id]);
    s.stages = s.stages.filter(row => row !== stage);
    return id;
  }
  if (type === 'opportunity-close') {
    const deal = find(s, 'opportunities', id) || fail('Opportunity not found.', 404);
    const value = str(d.closeDate, 10);
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)))) fail('Enter a valid close date.');
    if (deal.closeDate === value) return id;
    // A later date for an open deal counts as a slip, the same rule as editing the record.
    if (deal.status === 'Open' && deal.closeDate && value && value > deal.closeDate) deal.slips = (deal.slips || 0) + 1;
    deal.closeDate = value;
    deal.updated = now();
    return id;
  }
  return undefined;
}
