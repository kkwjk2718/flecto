import { z } from 'zod';
import { PlannerRequestSchema, PlannerResponseSchema, UserSettingsSchema, type PublicPageSnapshot } from '@flecto/contracts';

const id = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
export function httpOrigin(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : null;
  } catch { return null; }
}

// Only the literal loopback authority is accepted, including an explicit port.
// Do not accept URL-normalized aliases, credentials, paths, queries or redirects.
export function plannerOrigin(value: unknown): string | null {
  if (typeof value !== 'string' || !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/?$/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.origin;
  } catch { return null; }
}

export const SessionSchema = z.strictObject({
  origin: z.string().refine((value) => httpOrigin(value) === value),
  active: z.boolean(), pendingSubmit: z.boolean(), epoch: z.number().int().nonnegative(),
  sponsorShown: z.boolean().default(false),
});
export type Session = z.infer<typeof SessionSchema>;
// Separate optional transport: the metadata-only planner contract stays unchanged.
const rect = z.strictObject({ x: z.number().finite().nonnegative(), y: z.number().finite().nonnegative(),
  width: z.number().finite().nonnegative(), height: z.number().finite().nonnegative() });
export const VisionCapturePlanSchema = z.strictObject({
  version: z.literal(1), reason: z.literal('VISUAL_RELATION_AMBIGUOUS'), origin: z.string().max(300),
  documentInstanceId: id, snapshotId: id, semanticRevision: z.number().int().nonnegative(),
  optionRevision: z.number().int().nonnegative(), privateValueRevision: z.number().int().nonnegative(),
  viewport: z.strictObject({ width: z.number().positive().max(16384), height: z.number().positive().max(16384),
    devicePixelRatio: z.number().positive().max(8), scrollX: z.number().finite(), scrollY: z.number().finite() }),
  refs: z.array(id).min(2).max(12).refine(refs => new Set(refs).size === refs.length), crop: rect,
  publicRegions: z.array(z.strictObject({ ref: id, kind: z.enum(['label', 'notice', 'option', 'action']), rect })).min(1).max(40),
  privateMasks: z.array(rect).max(200),
});
export const VISION_MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const VisionImageSchema = z.strictObject({
  mimeType: z.literal('image/png'),
  dataUrl: z.string().max(22 + 4 * Math.ceil(VISION_MAX_IMAGE_BYTES / 3)).regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/).refine(value => {
    const base64 = value.slice(22), padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    return base64.length % 4 === 0 && base64.length / 4 * 3 - padding <= VISION_MAX_IMAGE_BYTES;
  }),
  width: z.number().int().positive().max(1600), height: z.number().int().positive().max(1600),
});
export const VisionRequestSchema = z.strictObject({ payload: PlannerRequestSchema, capturePlan: VisionCapturePlanSchema })
  .superRefine(({ payload: { snapshot }, capturePlan: plan }, ctx) => {
    const candidates = [...snapshot.controls, ...snapshot.notices];
    if (plan.origin !== snapshot.origin || plan.documentInstanceId !== snapshot.documentInstanceId ||
        plan.snapshotId !== snapshot.snapshotId || plan.semanticRevision !== snapshot.semanticRevision ||
        plan.optionRevision !== snapshot.optionRevision || plan.refs.some(ref => {
          const matches = candidates.filter(c => c.ref === ref);
          return matches.length !== 1 || candidates.filter(c => c.semanticKey === matches[0].semanticKey).length !== 1;
        }) || plan.publicRegions.some(region => !plan.refs.includes(region.ref) && !snapshot.controls.some(c => plan.refs.includes(c.ref) && c.options.some(o => o.ref === region.ref)))) {
      ctx.addIssue({ code: 'custom', message: 'Capture does not match current public references' });
    }
  });
export const VisionCapabilitiesSchema = z.strictObject({ enabled: z.boolean(), allowedOrigins: z.array(z.string().max(300)).max(20) });
export const VisionPlannerRequestSchema = z.strictObject({ request: VisionRequestSchema, image: VisionImageSchema });
export const VisionPlannerResponseSchema = PlannerResponseSchema.extend({ transport: z.literal('VISION'), blueprintId: z.null() });
export type VisionRequest = z.infer<typeof VisionRequestSchema>;
export type VisionPlannerResponse = z.infer<typeof VisionPlannerResponseSchema>;
export const VisionCallbackSchema = z.strictObject({ type: z.enum(['FLECTO_VISION_GUARD', 'FLECTO_VISION_RELEASE']), requestId: id });

/** No error-code fallback. A notice has no explicit relation and its form has multiple unique input targets. */
export function visualRelationCandidates(snapshot: PublicPageSnapshot, goalRef: string | null): string[] {
  const action = snapshot.controls.find(c => c.ref === goalRef && c.actionKind === 'submit' && !c.disabled);
  if (!action?.formRef || snapshot.controls.filter(c => c.semanticKey === action.semanticKey).length !== 1) return [];
  const fields = snapshot.controls.filter(c => c.formRef === action.formRef && c.actionKind === 'none' && !c.disabled);
  if (fields.length < 2 || fields.some(c => snapshot.controls.filter(other => other.semanticKey === c.semanticKey).length !== 1)) return [];
  const notice = snapshot.notices.find(n => n.formRef === action.formRef &&
    !snapshot.controls.some(c => c.noticeRefs.includes(n.ref)) && snapshot.notices.filter(other => other.semanticKey === n.semanticKey).length === 1);
  // Never truncate a larger scope into a purportedly complete visual relation.
  return notice && fields.length <= 11 ? [...fields.map(c => c.ref), notice.ref] : [];
}

export const MessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('FLECTO_PREPARE'), payload: PlannerRequestSchema }),
  z.strictObject({ type: z.literal('FLECTO_PREPARE_VISION'), request: VisionRequestSchema }),
  z.strictObject({ type: z.literal('FLECTO_VISION_CAPABILITIES') }),
  z.strictObject({ type: z.literal('FLECTO_CANCEL'), requestId: id, documentInstanceId: id }),
  z.strictObject({ type: z.literal('FLECTO_VERIFY'), requestId: id, snapshotId: id, blueprintId: id }),
  z.strictObject({ type: z.literal('FLECTO_STATE'), documentInstanceId: id, active: z.boolean(), pendingSubmit: z.boolean() }),
  z.strictObject({ type: z.literal('FLECTO_SETTINGS_GET') }),
  z.strictObject({ type: z.literal('FLECTO_SETTINGS_SET'), settings: UserSettingsSchema }),
  z.strictObject({ type: z.literal('FLECTO_SESSION_GET') }),
  z.strictObject({ type: z.literal('FLECTO_SPONSOR_CLAIM') }),
]);

export function sourceIdentity(sender: chrome.runtime.MessageSender, runtimeId: string) {
  const origin = httpOrigin(sender.url);
  if (sender.id !== runtimeId || !Number.isInteger(sender.tab?.id) || sender.tab!.id! < 0 ||
      sender.frameId !== 0 || !sender.documentId || !origin ||
      (sender.origin !== undefined && sender.origin !== origin) ||
      (sender.documentLifecycle !== undefined && sender.documentLifecycle !== 'active')) return null;
  return { tabId: sender.tab!.id!, documentId: sender.documentId, origin };
}
