import { CACHE_VERSION, PROMPT_VERSION, SCHEMA_VERSION, CachedBlueprintSchema, FlectoError, PublicPageSnapshotSchema, type CachedBlueprint, type PagePlan, type PrivateBindingRegistry, type PublicPageSnapshot } from '@flecto/contracts';
import { verifyPlan } from './verifier';

export async function structuralFingerprint(snapshot: PublicPageSnapshot): Promise<string> {
  const parsed = PublicPageSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) throw new FlectoError('SCHEMA_INVALID');
  snapshot = parsed.data;
  const selectedGoal = snapshot.goalRef === null ? null : snapshot.controls.find(c => c.ref === snapshot.goalRef);
  if (selectedGoal === undefined) throw new FlectoError('STALE_DOCUMENT');
  const scoped = snapshot.goal === 'complete_form' && selectedGoal !== null;
  if (scoped && (selectedGoal.actionKind !== 'submit' || selectedGoal.formRef === null)) throw new FlectoError('REQUIRED_MISSING');
  const controls = scoped ? snapshot.controls.filter(c => c.ref === selectedGoal.ref || (c.formRef === selectedGoal.formRef && c.actionKind === 'none')) : snapshot.controls;
  const includedNotices = scoped ? snapshot.notices.filter(n => n.formRef === null || n.formRef === selectedGoal.formRef) : snapshot.notices;
  if (controls.some(c => c.semanticKey.endsWith('|action-local'))) throw new FlectoError('UNSUPPORTED_CONTROL');
  // Form ordinal is an extraction disambiguator, not the selected form's meaning.
  // Unrelated logout/menu forms may move or disappear without changing this task.
  const key = (semanticKey: string, formRef: string | null) => scoped && formRef === selectedGoal.formRef ? semanticKey.replace(/^form_\d+\|/, 'selected_form|') : semanticKey;
  const formKeys = new Map<string, string>();
  const form = (r: string | null) => { if (r === null) return null; if (!formKeys.has(r)) formKeys.set(r, `form_${formKeys.size}`); return formKeys.get(r)!; };
  const notices = new Map(includedNotices.map(n => [n.ref, key(n.semanticKey, n.formRef)]));
  // Only stable public semantics enter the digest. Request/snapshot/document IDs,
  // revisions and every control/form/option/notice ref are deliberately omitted.
  const body = { schemaVersion: snapshot.schemaVersion, origin: snapshot.origin, goal: snapshot.goal, selectedGoal: selectedGoal ? key(selectedGoal.semanticKey, selectedGoal.formRef) : null, controls: controls.map(({ ref: _ref, formRef, options, noticeRefs, ...c }) => ({ ...c, semanticKey: key(c.semanticKey, formRef), form: form(formRef), options: options.map(({ ref: _optionRef, ...o }) => o), notices: noticeRefs.map(r => { const key = notices.get(r); if (!key) throw new FlectoError('STALE_DOCUMENT'); return key; }) })), notices: includedNotices.map(({ ref: _ref, formRef, ...n }) => ({ ...n, semanticKey: key(n.semanticKey, formRef), form: form(formRef) })) };
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(body)));
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}
export async function rebindBlueprint(input: CachedBlueprint, snapshot: PublicPageSnapshot, registry?: PrivateBindingRegistry): Promise<PagePlan> {
  const parsed = CachedBlueprintSchema.safeParse(input);
  if (!parsed.success) throw new FlectoError('SCHEMA_INVALID');
  const blueprint = parsed.data;
  if (blueprint.status !== 'VERIFIED' || blueprint.schemaVersion !== SCHEMA_VERSION || blueprint.cacheVersion !== CACHE_VERSION || blueprint.promptVersion !== PROMPT_VERSION || blueprint.origin !== snapshot.origin || blueprint.fingerprint !== await structuralFingerprint(snapshot)) throw new FlectoError('STALE_DOCUMENT');
  const selected = snapshot.goal === 'complete_form' && snapshot.goalRef ? snapshot.controls.find(c => c.ref === snapshot.goalRef) : undefined;
  const stableKey = (key: string) => selected ? key.replace(/^form_\d+(?=\||$)/, 'selected_form') : key;
  const controls = selected ? snapshot.controls.filter(c => c.ref === selected.ref || (c.formRef === selected.formRef && c.actionKind === 'none')) : snapshot.controls;
  const notices = selected ? snapshot.notices.filter(n => n.formRef === null || n.formRef === selected.formRef) : snapshot.notices;
  function unique(key: string, kind: 'control' | 'notice'): string {
    const matches = (kind === 'control' ? controls : notices).filter(c => stableKey(c.semanticKey) === stableKey(key));
    if (matches.length !== 1) throw new FlectoError(matches.length ? 'AMBIGUOUS_TARGET' : 'STALE_DOCUMENT');
    return matches[0].ref;
  }
  for (const locator of blueprint.locators) {
    const c = snapshot.controls.find(c => c.ref === unique(locator.key, 'control'))!;
    const formKey = c.formRef === null ? null : c.semanticKey.split('|')[0];
    if (c.kind !== locator.kind || c.required !== locator.required || (locator.formKey === null ? null : stableKey(locator.formKey)) !== (formKey === null ? null : stableKey(formKey))) throw new FlectoError('STALE_DOCUMENT');
  }
  return verifyPlan({ schemaVersion: SCHEMA_VERSION, snapshotId: snapshot.snapshotId, steps: blueprint.steps.map(({ controlKeys, noticeKeys, ...s }) => ({ ...s, controlRefs: controlKeys.map(k => unique(k, 'control')), noticeRefs: noticeKeys.map(k => unique(k, 'notice')) })), sourceActionRef: blueprint.actionKey ? unique(blueprint.actionKey, 'control') : null }, snapshot, registry);
}
