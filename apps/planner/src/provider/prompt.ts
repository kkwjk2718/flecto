import {
  PROMPT_VERSION, PagePlanSchema, TemplateSchema,
  type PagePlan, type PublicControl, type PublicNotice, type PublicPageSnapshot,
} from '@flecto/contracts';

export const PLAN_PROMPT_VERSION = PROMPT_VERSION;

/**
 * Minimal base instructions written to the file passed as `model_instructions_file`.
 * It replaces the ~21 KB coding-agent base prompt with the planner's purpose, legend and rules.
 * Nothing here depends on the page; per-request data arrives only through the user prompt.
 */
export const PLANNER_INSTRUCTIONS = [
  '# FLECTO page planner',
  'You group the controls of one public web-form snapshot into ordered steps for an older adult who uses a large-button assistant UI.',
  'You have no tools. Never call a tool, read files, browse or ask questions. Reply with exactly one JSON object matching the given schema, nothing else.',
  '',
  '## Input legend',
  'Each control line: `<alias> <kind>[*] <label> [(N options)] [(disabled)] [-> n1,n2]`. `*` = required. `-> nX` = notices attached to that control.',
  'Each notice line: `<alias> <kind> <text>`. Aliases are the only identifiers you may output.',
  'A masked screenshot of the same page may be attached. Use it only to understand layout and grouping; aliases still come from the text lines only.',
  '',
  '## Rules',
  '- Use every listed control exactly once across all steps, in the order a person fills a form. Never invent, rename or omit an alias.',
  '- Templates: task_selection (choose a task link/button), grouped_form (text/tel/email/date/number/textarea inputs), item_selection (select/radio choices), consent (agreement checkboxes plus their terms notices), final_review (summary before the submit control), result (post-submit message).',
  '- Put all checkboxes of the form into one consent step together with their terms notices. Attach every other listed notice to the step where it is read; every listed notice must appear in at least one step.',
  '- Put 2-4 related inputs per grouped_form or item_selection step. Use the fewest steps that keep each step small (1-12 steps total).',
  '- If an action alias is given, the last step is final_review containing that action and "action" is that alias. If no action is given, set "action" to null.',
  '- title: plain Korean, 4-14 characters, naming what this step is about (e.g. "연락처 입력", "동의 확인").',
].join('\n') + '\n';

/** Result of compacting a strictly parsed public snapshot into the model-facing prompt. */
export type PromptEncoding = {
  prompt: string;
  snapshotId: string;
  /** Alias -> actual control ref, for every control forwarded to the model. */
  controlRefs: ReadonlyMap<string, string>;
  /** Alias -> actual notice ref. */
  noticeRefs: ReadonlyMap<string, string>;
  /** Aliases the model may return as the action (all carry actionKind !== 'none'). */
  actionAliases: readonly string[];
  /** The action alias fixed by goalRef or by a single enabled submit; null when the model must choose or none exists. */
  fixedAction: string | null;
  /** formRef used to select controls/notices; null means the whole page was forwarded. */
  scopeFormRef: string | null;
};

function selectScope(snapshot: PublicPageSnapshot): { chosen: PublicControl | null; scope: string | null } {
  const submits = snapshot.controls.filter((c) => c.actionKind === 'submit' && !c.disabled);
  let chosen: PublicControl | null = null;
  if (snapshot.goalRef !== null) chosen = submits.find((c) => c.ref === snapshot.goalRef) ?? null;
  else if (submits.length === 1) chosen = submits[0];
  return { chosen, scope: chosen?.formRef ?? null };
}

function controlLine(alias: string, control: PublicControl, noticeAlias: ReadonlyMap<string, string>): string {
  let line = alias + ' ' + control.kind + (control.required ? '*' : '') + ' ' + control.label.replace(/\s+/g, ' ').trim();
  if (control.options.length > 0) line += ' (' + control.options.length + ' options)';
  if (control.disabled) line += ' (disabled)';
  const attached = control.noticeRefs.map((ref) => noticeAlias.get(ref)).filter((a): a is string => a !== undefined);
  if (attached.length > 0) line += ' -> ' + attached.join(',');
  return line;
}

function noticeLine(alias: string, notice: PublicNotice): string {
  // Full public notice text (spec 04: required information is never cut to fit a token budget); only whitespace is normalised.
  return alias + ' ' + notice.kind + ' ' + notice.text.replace(/\s+/g, ' ').trim();
}

/**
 * Compacts the snapshot for the model: only the goal form's controls plus its own and global notices,
 * with actual refs rebased to short aliases (c1.., n1..). semanticKey/constraints/option refs are never sent;
 * notice text is forwarded in full.
 * The snapshot is not mutated; the mapping stays in the returned encoding for decodePlan.
 */
export function encodePlanPrompt(snapshot: PublicPageSnapshot): PromptEncoding {
  const { chosen, scope } = selectScope(snapshot);
  const controls = scope === null ? snapshot.controls
    : snapshot.controls.filter((c) => c.formRef === scope && (c.actionKind !== 'submit' || c.ref === chosen!.ref));
  const notices = scope === null ? snapshot.notices
    : snapshot.notices.filter((n) => n.formRef === null || n.formRef === scope);

  const controlRefs = new Map<string, string>();
  const controlAlias = new Map<string, string>();
  controls.forEach((c, i) => { const alias = 'c' + (i + 1); controlRefs.set(alias, c.ref); controlAlias.set(c.ref, alias); });
  const noticeRefs = new Map<string, string>();
  const noticeAlias = new Map<string, string>();
  notices.forEach((n, i) => { const alias = 'n' + (i + 1); noticeRefs.set(alias, n.ref); noticeAlias.set(n.ref, alias); });

  const fixedAction = chosen ? controlAlias.get(chosen.ref) ?? null : null;
  const actionAliases = fixedAction !== null ? [fixedAction]
    : controls.filter((c) => c.actionKind !== 'none' && !c.disabled).map((c) => controlAlias.get(c.ref)!);

  const lines = ['goal: ' + snapshot.goal];
  if (fixedAction !== null) lines.push('action: ' + fixedAction);
  else if (actionAliases.length > 0) lines.push('action candidates: ' + actionAliases.join(','));
  else lines.push('action: none');
  lines.push('controls:');
  for (const c of controls) lines.push(controlLine(controlAlias.get(c.ref)!, c, noticeAlias));
  lines.push(notices.length > 0 ? 'notices:' : 'notices: none');
  for (const n of notices) lines.push(noticeLine(noticeAlias.get(n.ref)!, n));

  return { prompt: lines.join('\n'), snapshotId: snapshot.snapshotId, controlRefs, noticeRefs, actionAliases, fixedAction, scopeFormRef: scope };
}

/** Kept for callers that only need the text; identical to encodePlanPrompt(snapshot).prompt. */
export function buildPlanPrompt(snapshot: PublicPageSnapshot): string {
  return encodePlanPrompt(snapshot).prompt;
}

function aliasItems(aliases: readonly string[]): Record<string, unknown> {
  // Strict schema: enum-constrained aliases when the list is non-empty, otherwise a plain string (decodePlan still rejects it).
  return aliases.length > 0 ? { type: 'string', enum: [...aliases] } : { type: 'string' };
}

/**
 * Strict JSON Schema handed to `codex exec --output-schema`, built per request so only this snapshot's
 * aliases are valid output. schemaVersion/snapshotId/step ids are added by decodePlan, not generated.
 */
export function buildOutputSchema(encoding: PromptEncoding): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['steps', 'action'],
    properties: {
      steps: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['template', 'title', 'controls', 'notices'],
          properties: {
            template: { type: 'string', enum: [...TemplateSchema.options] },
            title: { type: 'string' },
            controls: { type: 'array', items: aliasItems([...encoding.controlRefs.keys()]) },
            notices: { type: 'array', items: aliasItems([...encoding.noticeRefs.keys()]) },
          },
        },
      },
      action: encoding.actionAliases.length > 0
        ? { anyOf: [{ type: 'string', enum: [...encoding.actionAliases] }, { type: 'null' }] }
        : { type: 'null' },
    },
  };
}

/** Static shape reference (aliases unconstrained); the provider uses buildOutputSchema per request. */
export const PAGE_PLAN_OUTPUT_SCHEMA = buildOutputSchema({
  prompt: '', snapshotId: '', controlRefs: new Map(), noticeRefs: new Map(), actionAliases: [], fixedAction: null, scopeFormRef: null,
});

type RawStep = { template?: unknown; title?: unknown; controls?: unknown; notices?: unknown };
const BODY_KEYS = new Set(['steps', 'action']);
const STEP_KEYS = new Set(['template', 'title', 'controls', 'notices']);
const onlyKeys = (value: object, allowed: Set<string>) => Object.keys(value).every((key) => allowed.has(key));

function mapAliases(value: unknown, table: ReadonlyMap<string, string>): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const alias of value) {
    if (typeof alias !== 'string') return null;
    const ref = table.get(alias);
    if (ref === undefined) return null;
    out.push(ref);
  }
  return out;
}

/**
 * Restores the model's alias-based answer to actual snapshot refs. Any unknown alias, unknown action or
 * shape mismatch yields null (the caller reports SCHEMA_INVALID). The returned plan is re-validated with zod.
 */
export function decodePlan(raw: unknown, encoding: PromptEncoding): PagePlan | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const body = raw as { steps?: unknown; action?: unknown };
  if (!onlyKeys(body, BODY_KEYS) || !Array.isArray(body.steps)) return null;
  const steps: PagePlan['steps'] = [];
  for (const [index, item] of body.steps.entries()) {
    if (typeof item !== 'object' || item === null || Array.isArray(item) || !onlyKeys(item, STEP_KEYS)) return null;
    const step = item as RawStep;
    if (typeof step.template !== 'string' || typeof step.title !== 'string') return null;
    const controlRefs = mapAliases(step.controls, encoding.controlRefs);
    const noticeRefs = mapAliases(step.notices, encoding.noticeRefs);
    if (controlRefs === null || noticeRefs === null) return null;
    steps.push({ id: 'step_' + (index + 1), template: step.template as PagePlan['steps'][number]['template'], title: step.title.trim(), controlRefs, noticeRefs });
  }
  let sourceActionRef: string | null;
  if (body.action === null) sourceActionRef = null;
  else if (typeof body.action === 'string' && encoding.actionAliases.includes(body.action)) sourceActionRef = encoding.controlRefs.get(body.action) ?? null;
  else return null;
  if (body.action === null && encoding.fixedAction !== null) return null;
  const parsed = PagePlanSchema.safeParse({ schemaVersion: 1, snapshotId: encoding.snapshotId, steps, sourceActionRef });
  return parsed.success ? parsed.data : null;
}
