import { PROMPT_VERSION, type PublicPageSnapshot } from '@flecto/contracts';

/**
 * Strict JSON Schema handed to `codex exec --output-schema`.
 * Mirrors PagePlanSchema in @flecto/contracts; zod remains the authority and
 * re-validates every model response, so keep this shape structural only.
 */
export const PAGE_PLAN_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'snapshotId', 'steps', 'sourceActionRef'],
  properties: {
    schemaVersion: { type: 'integer', enum: [1] },
    snapshotId: { type: 'string' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'template', 'title', 'controlRefs', 'noticeRefs'],
        properties: {
          id: { type: 'string' },
          template: {
            type: 'string',
            enum: ['task_selection', 'grouped_form', 'item_selection', 'consent', 'final_review', 'result'],
          },
          title: { type: 'string' },
          controlRefs: { type: 'array', items: { type: 'string' } },
          noticeRefs: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    sourceActionRef: { type: ['string', 'null'] },
  },
} as const;

export const PLAN_PROMPT_VERSION = PROMPT_VERSION;

/**
 * Builds the model-facing prompt from a strictly parsed public snapshot.
 * The snapshot carries only public labels/constraints/notices (no user values),
 * and the text below is the only instruction the planner adds on top of it.
 * Callers must never log the returned string by default.
 */
export function buildPlanPrompt(snapshot: PublicPageSnapshot): string {
  return [
    'You are FLECTO의 페이지 계획기. Respond with one JSON object only. Do not call any tool, do not read files, do not ask questions.',
    'Input: a public snapshot of one web page (labels, control kinds, constraints, notices). No user values are included.',
    'Task: group the controls into 1-12 ordered steps for an older adult using large buttons, so they can finish goal "' + snapshot.goal + '".',
    'Rules:',
    '- Use only ref values that appear in the snapshot. Never invent, rename or drop a required control.',
    '- Every enabled control belongs to exactly one step. Put consent checkboxes and terms notices in a "consent" step.',
    '- Templates: task_selection (choose a task link/button), grouped_form (text/tel/email/date/number/textarea inputs), item_selection (select/radio/checkbox choices), consent (agreement checkboxes + terms), final_review (summary before submit), result (post-submit message).',
    '- The final step is final_review when a submit control exists; set sourceActionRef to that submit control ref, otherwise null.',
    '- title: short Korean, plain text, max 40 characters. step id: [A-Za-z0-9_-], unique.',
    '- schemaVersion must be 1 and snapshotId must be "' + snapshot.snapshotId + '".',
    'Snapshot JSON:',
    JSON.stringify(snapshot),
  ].join('\n');
}

