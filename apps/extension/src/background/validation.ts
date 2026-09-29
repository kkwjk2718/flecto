import { z } from 'zod';
import { PlannerRequestSchema, UserSettingsSchema } from '@flecto/contracts';

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
export const MessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('FLECTO_PREPARE'), payload: PlannerRequestSchema }),
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
