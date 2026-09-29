import { CACHE_VERSION, PROMPT_VERSION, SCHEMA_VERSION, CachedBlueprintSchema, FlectoError, PublicPageSnapshotSchema, type CachedBlueprint, type PagePlan, type PrivateBindingRegistry, type PublicPageSnapshot } from '@flecto/contracts';
import { verifyPlan } from './verifier';

export async function structuralFingerprint(snapshot: PublicPageSnapshot): Promise<string> {
  const parsed = PublicPageSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) throw new FlectoError('SCHEMA_INVALID');
  snapshot = parsed.data;
  if (snapshot.controls.some(c => c.semanticKey.endsWith('|action-local'))) throw new FlectoError('UNSUPPORTED_CONTROL');
  const selectedGoal = snapshot.goalRef === null ? null : snapshot.controls.find(c => c.ref === snapshot.goalRef);
  if (selectedGoal === undefined) throw new FlectoError('STALE_DOCUMENT');
  const formKeys = new Map<string, string>();
  const form = (r: string | null) => { if (r === null) return null; if (!formKeys.has(r)) formKeys.set(r, `form_${formKeys.size}`); return formKeys.get(r)!; };
  const notices = new Map(snapshot.notices.map(n => [n.ref, n.semanticKey]));
  // Only stable public semantics enter the digest. Request/snapshot/document IDs,
  // revisions and every control/form/option/notice ref are deliberately omitted.
  const body = { schemaVersion: snapshot.schemaVersion, origin: snapshot.origin, goal: snapshot.goal, selectedGoal: selectedGoal?.semanticKey ?? null, controls: snapshot.controls.map(({ ref: _ref, formRef, options, noticeRefs, ...c }) => ({ ...c, form: form(formRef), options: options.map(({ ref: _optionRef, ...o }) => o), notices: noticeRefs.map(r => { const key = notices.get(r); if (!key) throw new FlectoError('STALE_DOCUMENT'); return key; }) })), notices: snapshot.notices.map(({ ref: _ref, formRef, ...n }) => ({ ...n, form: form(formRef) })) };
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(body)));
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}
export async function rebindBlueprint(input: CachedBlueprint, snapshot: PublicPageSnapshot, registry?: PrivateBindingRegistry): Promise<PagePlan> {
  const parsed = CachedBlueprintSchema.safeParse(input);
  if (!parsed.success) throw new FlectoError('SCHEMA_INVALID');
  const blueprint = parsed.data;
  if (blueprint.status !== 'VERIFIED' || blueprint.schemaVersion !== SCHEMA_VERSION || blueprint.cacheVersion !== CACHE_VERSION || blueprint.promptVersion !== PROMPT_VERSION || blueprint.origin !== snapshot.origin || blueprint.fingerprint !== await structuralFingerprint(snapshot)) throw new FlectoError('STALE_DOCUMENT');
  function unique(key: string, kind: 'control' | 'notice'): string {
    const matches = (kind === 'control' ? snapshot.controls : snapshot.notices).filter(c => c.semanticKey === key);
    if (matches.length !== 1) throw new FlectoError(matches.length ? 'AMBIGUOUS_TARGET' : 'STALE_DOCUMENT');
    return matches[0].ref;
  }
  for (const locator of blueprint.locators) {
    const c = snapshot.controls.find(c => c.ref === unique(locator.key, 'control'))!;
    const formKey = c.formRef === null ? null : c.semanticKey.split('|')[0];
    if (c.kind !== locator.kind || c.required !== locator.required || locator.formKey !== formKey) throw new FlectoError('STALE_DOCUMENT');
  }
  return verifyPlan({ schemaVersion: SCHEMA_VERSION, snapshotId: snapshot.snapshotId, steps: blueprint.steps.map(({ controlKeys, noticeKeys, ...s }) => ({ ...s, controlRefs: controlKeys.map(k => unique(k, 'control')), noticeRefs: noticeKeys.map(k => unique(k, 'notice')) })), sourceActionRef: blueprint.actionKey ? unique(blueprint.actionKey, 'control') : null }, snapshot, registry);
}
