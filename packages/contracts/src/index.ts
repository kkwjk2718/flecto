export { EXTENSION_ID, EXTENSION_ORIGIN } from './extension-id';
import { z } from 'zod';

export const SCHEMA_VERSION = 1 as const;
export const CONTRACT_VERSION = '1.0.1';
export const PROMPT_VERSION = 'flecto-plan-v2';
export const CACHE_VERSION = 'flecto-blueprint-v2';
export const PREPARE_DEADLINE_MS = 10_000;
export const SPONSOR_AFTER_MS = 3_000;
export const DEFAULT_PORTS = { planner: 4317, benefits: 4173, culture: 4174 } as const;

const ref = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
const text = z.string().max(500);
const shortText = z.string().min(1).max(160);
const uniqueRefs = z.array(ref).max(100).refine((items) => new Set(items).size === items.length, 'Duplicate reference');
export const GoalSchema = z.enum(['complete_form', 'navigate', 'choose']);
export type Goal = z.infer<typeof GoalSchema>;
export const TemplateSchema = z.enum(['task_selection', 'grouped_form', 'item_selection', 'consent', 'final_review', 'result']);
export type Template = z.infer<typeof TemplateSchema>;
export const ControlKindSchema = z.enum(['text', 'email', 'tel', 'date', 'number', 'textarea', 'select', 'radio', 'checkbox', 'submit', 'button', 'link']);
export type ControlKind = z.infer<typeof ControlKindSchema>;
export const ErrorCodeSchema = z.enum([
  'AUTH_REQUIRED', 'UNSUPPORTED_CONTROL', 'REQUIRED_MISSING', 'AMBIGUOUS_TARGET',
  'STALE_DOCUMENT', 'SCHEMA_INVALID', 'BUSY', 'DEADLINE_EXCEEDED', 'PROVIDER_ERROR',
  'SOURCE_REJECTED', 'OUTCOME_UNKNOWN', 'CANCELLED', 'VISUAL_RELATION_AMBIGUOUS',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export const PlanModeSchema = z.enum(['FIXTURE', 'LIVE_CODEX', 'CACHE']);
export type PlanMode = z.infer<typeof PlanModeSchema>;

export const PublicOptionSchema = z.strictObject({ ref, label: shortText, disabled: z.boolean() });
export type PublicOption = z.infer<typeof PublicOptionSchema>;
export const ConstraintSchema = z.strictObject({
  min: z.string().max(80).optional(), max: z.string().max(80).optional(),
  minLength: z.number().int().min(0).max(10000).optional(),
  maxLength: z.number().int().min(1).max(10000).optional(),
  pattern: z.string().max(250).optional(),
});
export const PublicControlSchema = z.strictObject({
  ref, kind: ControlKindSchema, label: shortText, formRef: ref.nullable(),
  required: z.boolean(), disabled: z.boolean(),
  semanticKey: z.string().min(1).max(600),
  constraints: ConstraintSchema,
  options: z.array(PublicOptionSchema).max(100),
  noticeRefs: uniqueRefs,
  actionKind: z.enum(['submit', 'navigate', 'none']),
});
export type PublicControl = z.infer<typeof PublicControlSchema>;
export const PublicNoticeSchema = z.strictObject({
  ref, text: z.string().min(1).max(3000),
  kind: z.enum(['info', 'terms', 'warning']), formRef: ref.nullable(),
  semanticKey: z.string().min(1).max(600),
});
export type PublicNotice = z.infer<typeof PublicNoticeSchema>;
export const PublicPageSnapshotSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION), requestId: ref, snapshotId: ref,
  documentInstanceId: ref,
  origin: z.string().max(300).refine((value) => {
    try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && u.origin === value; }
    catch { return false; }
  }, 'Only an HTTP origin is allowed'),
  goal: GoalSchema, goalRef: ref.nullable(),
  semanticRevision: z.number().int().nonnegative(),
  optionRevision: z.number().int().nonnegative(),
  controls: z.array(PublicControlSchema).max(100),
  notices: z.array(PublicNoticeSchema).max(60),
}).superRefine((snapshot, ctx) => {
  const allRefs = [
    ...snapshot.controls.map((c) => c.ref),
    ...snapshot.controls.flatMap((c) => c.options.map((o) => o.ref)),
    ...snapshot.notices.map((n) => n.ref),
  ];
  if (new Set(allRefs).size !== allRefs.length) ctx.addIssue({ code: 'custom', message: 'Duplicate snapshot reference' });
});
export type PublicPageSnapshot = z.infer<typeof PublicPageSnapshotSchema>;

export const PlanStepSchema = z.strictObject({
  id: ref, template: TemplateSchema, title: shortText,
  controlRefs: uniqueRefs, noticeRefs: uniqueRefs,
});
export type PlanStep = z.infer<typeof PlanStepSchema>;
export const PagePlanSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION), snapshotId: ref,
  steps: z.array(PlanStepSchema).min(1).max(12),
  sourceActionRef: ref.nullable(),
}).superRefine((plan, ctx) => {
  if (new Set(plan.steps.map((step) => step.id)).size !== plan.steps.length) {
    ctx.addIssue({ code: 'custom', message: 'Duplicate step id' });
  }
});
export type PagePlan = z.infer<typeof PagePlanSchema>;

export const PlannerRequestSchema = z.strictObject({
  snapshot: PublicPageSnapshotSchema,
  remainingBudgetMs: z.number().int().positive().max(PREPARE_DEADLINE_MS),
  sessionEpoch: z.number().int().nonnegative(),
});
export type PlannerRequest = z.infer<typeof PlannerRequestSchema>;
export const PlannerResponseSchema = z.strictObject({
  requestId: ref, snapshotId: ref, plan: PagePlanSchema,
  mode: PlanModeSchema, model: z.string().max(100).nullable(),
  promptVersion: z.string().max(80), cacheVersion: z.string().max(80),
  blueprintId: ref.nullable(), durationMs: z.number().nonnegative(),
});
export type PlannerResponse = z.infer<typeof PlannerResponseSchema>;
export const PlannerErrorSchema = z.strictObject({ error: ErrorCodeSchema, requestId: ref.optional() });

export const BlueprintLocatorSchema = z.strictObject({
  key: z.string().min(1).max(600), kind: z.string().max(30),
  formKey: z.string().max(600).nullable(), required: z.boolean(),
});
export const CachedBlueprintSchema = z.strictObject({
  id: ref, schemaVersion: z.literal(SCHEMA_VERSION), cacheVersion: z.string().max(80),
  promptVersion: z.string().max(80), model: z.string().max(100),
  origin: z.string().max(300), fingerprint: z.string().max(100),
  status: z.enum(['CANDIDATE', 'VERIFIED', 'QUARANTINED']),
  steps: z.array(z.strictObject({
    id: ref, template: TemplateSchema, title: shortText,
    controlKeys: z.array(z.string().max(600)).max(100),
    noticeKeys: z.array(z.string().max(600)).max(60),
  })).max(12),
  actionKey: z.string().max(600).nullable(),
  locators: z.array(BlueprintLocatorSchema).max(100),
  createdAt: z.number().int().nonnegative(),
});
export type CachedBlueprint = z.infer<typeof CachedBlueprintSchema>;

export const RunMetricSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION), requestId: ref,
  mode: z.enum(['FIXTURE', 'LIVE_CODEX', 'CACHE', 'FAULT_INJECTION']),
  phase: z.enum(['prepare', 'controls_ready', 'cancel', 'timeout', 'source_result']),
  durationMs: z.number().nonnegative().max(600000),
  result: z.enum(['PASS', 'FAIL', 'CANCELLED', 'TIMEOUT', 'UNKNOWN']),
  error: ErrorCodeSchema.nullable(), sponsorShown: z.boolean(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  model: z.string().max(100).nullable(), promptVersion: z.string().max(80),
});
export type RunMetric = z.infer<typeof RunMetricSchema>;
export type ActionReceipt = {
  actionId: string; documentInstanceId: string; targetRef: string;
  status: 'APPLIED' | 'REJECTED' | 'PENDING';
  evidence: 'DOM_READBACK' | 'SOURCE_EVENT' | 'NAVIGATION' | 'NONE';
  error?: ErrorCode;
};

// This registry and the UI view model must never be serialized to planner/cache/logs.
export type PrivateBinding = {
  ref: string; element: HTMLElement; form: HTMLFormElement | null;
  kind: ControlKind; semanticKey: string;
};
export type PrivateBindingRegistry = {
  documentInstanceId: string; semanticRevision: number; optionRevision: number;
  privateValueRevision: number;
  bindings: Map<string, PrivateBinding>;
  options: Map<string, HTMLOptionElement | HTMLInputElement>;
  notices: Map<string, HTMLElement>;
};
export type ReviewToken = {
  documentInstanceId: string; semanticRevision: number;
  optionRevision: number; privateValueRevision: number; sourceActionRef: string;
};

export type UserSettings = {
  fontSize: 22 | 26 | 30;
  contrast: 'normal' | 'high';
  explanation: 'brief' | 'detailed';
  reducedMotion: boolean;
};
export const DEFAULT_SETTINGS: UserSettings = {
  fontSize: 26, contrast: 'normal', explanation: 'brief', reducedMotion: false,
};
export const UserSettingsSchema = z.strictObject({
  fontSize: z.union([z.literal(22), z.literal(26), z.literal(30)]),
  contrast: z.enum(['normal', 'high']), explanation: z.enum(['brief', 'detailed']),
  reducedMotion: z.boolean(),
});
export type UiPhase = 'IDLE' | 'PREPARING' | 'READY' | 'REVIEW' | 'SUBMITTING' |
  'SUCCESS' | 'SOURCE_REJECTED' | 'OUTCOME_UNKNOWN' | 'AUTH_REQUIRED' |
  'UNSUPPORTED' | 'TIMED_OUT' | 'CANCELLED' | 'STALE_DOCUMENT' | 'CONFLICT';
export type ViewControl = PublicControl & {
  value: string | boolean;
  error: string | null;
  description: string | null;
  composing: boolean;
};
export type SourceTask = { ref: string; label: string; description?: string; kind: 'navigate' | 'submit'; disabled: boolean };
export type ReviewRow = { ref: string; label: string; value: string };
export type FlectoViewModel = {
  phase: UiPhase; title: string; statusMessage: string;
  steps: PlanStep[]; stepIndex: number;
  controls: ViewControl[]; notices: PublicNotice[]; tasks: SourceTask[];
  settings: UserSettings; reviewRows: ReviewRow[];
  mode: PlanMode | null; elapsedMs: number; sponsorVisible: boolean;
  canGoNext: boolean; canSubmit: boolean; canGoBack: boolean;
  error: ErrorCode | null; resultText: string | null;
  sourceName: string;
  reviewEditMode?: 'local' | 'source';
};
export type UserAction =
  | { kind: 'LOCAL_NEXT'; fromStep: string }
  | { kind: 'LOCAL_BACK'; fromStep: string; targetRef?: string }
  | { kind: 'SET_TEXT'; ref: string; value: string }
  | { kind: 'SET_CHOICE'; ref: string; optionRef: string }
  | { kind: 'SET_CONSENT_FROM_USER'; ref: string; checked: boolean }
  | { kind: 'SET_COMPOSING'; ref: string; composing: boolean }
  | { kind: 'INVOKE_SOURCE'; ref: string; intent: 'navigate' | 'submit' }
  | { kind: 'START_GOAL'; ref: string | null }
  | { kind: 'UPDATE_SETTINGS'; settings: UserSettings }
  | { kind: 'CANCEL' | 'RETRY' | 'SHOW_ORIGINAL' | 'CLOSE' | 'DISMISS_SPONSOR' };

export interface PlanProvider {
  readonly mode: 'FIXTURE' | 'LIVE_CODEX';
  readonly model: string;
  plan(snapshot: PublicPageSnapshot, remainingBudgetMs: number, signal: AbortSignal): Promise<PagePlan>;
}
export class FlectoError extends Error {
  constructor(public readonly code: ErrorCode) { super(code); this.name = 'FlectoError'; }
}
export function publicSnapshot(input: unknown): PublicPageSnapshot {
  // strict parsing prevents inadvertent transport of extra UI/private fields.
  return PublicPageSnapshotSchema.parse(input);
}
export function emptyViewModel(): FlectoViewModel {
  return {
    phase: 'IDLE', title: '어떤 일을 도와드릴까요?', statusMessage: '',
    steps: [], stepIndex: 0, controls: [], notices: [], tasks: [],
    settings: { ...DEFAULT_SETTINGS }, reviewRows: [], mode: null, elapsedMs: 0,
    sponsorVisible: false, canGoNext: false, canSubmit: false, canGoBack: false,
    error: null, resultText: null, sourceName: '원래 사이트',
  };
}

// Trusted extension contexts only: content messages never carry the pairing token.
export type ContentRequest =
  | { type: 'FLECTO_PREPARE'; payload: PlannerRequest }
  | { type: 'FLECTO_CANCEL'; requestId: string; documentInstanceId: string }
  | { type: 'FLECTO_SETTINGS_GET' }
  | { type: 'FLECTO_SETTINGS_SET'; settings: UserSettings }
  | { type: 'FLECTO_STATE'; documentInstanceId: string; pendingSubmit: boolean; active: boolean }
  | { type: 'FLECTO_VERIFY'; requestId: string; snapshotId: string; blueprintId: string };
export type BackgroundReply =
  | { ok: true; result: PlannerResponse }
  | { ok: true; settings: UserSettings }
  | { ok: true }
  | { ok: false; error: ErrorCode };
