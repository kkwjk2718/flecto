import { FlectoError, PagePlanSchema, PublicPageSnapshotSchema, type PagePlan, type PrivateBindingRegistry, type PublicPageSnapshot } from '@flecto/contracts';
import { currentSnapshot } from './dom';

export function verifyPlan(input: unknown, snapshot: PublicPageSnapshot, registry?: PrivateBindingRegistry): PagePlan {
  const parsed = PagePlanSchema.safeParse(input), source = PublicPageSnapshotSchema.safeParse(snapshot);
  if (!parsed.success || !source.success) throw new FlectoError('SCHEMA_INVALID');
  const plan = parsed.data;
  if (plan.snapshotId !== snapshot.snapshotId) throw new FlectoError('STALE_DOCUMENT');
  if (registry) {
    const current = currentSnapshot(registry);
    if (JSON.stringify(current) !== JSON.stringify(snapshot) || registry.documentInstanceId !== snapshot.documentInstanceId || registry.semanticRevision !== snapshot.semanticRevision || registry.optionRevision !== snapshot.optionRevision) throw new FlectoError('STALE_DOCUMENT');
  }
  const controls = new Map(snapshot.controls.map(c => [c.ref, c])), notices = new Map(snapshot.notices.map(n => [n.ref, n]));
  const seen = new Set<string>(), covered = new Set<string>();
  const action = plan.sourceActionRef ? controls.get(plan.sourceActionRef) : undefined;
  if (plan.sourceActionRef && (!action || action.actionKind === 'none')) throw new FlectoError('SCHEMA_INVALID');
  if (action?.disabled) throw new FlectoError('SOURCE_REJECTED');
  if (action && snapshot.controls.filter(c => c.semanticKey === action.semanticKey).length !== 1) throw new FlectoError('AMBIGUOUS_TARGET');
  if (snapshot.goalRef && plan.sourceActionRef !== snapshot.goalRef) throw new FlectoError('SCHEMA_INVALID');
  if (snapshot.goal === 'complete_form' && (!action || action.actionKind !== 'submit' || !action.formRef)) throw new FlectoError('REQUIRED_MISSING');
  const scope = action?.formRef ?? null;
  for (const step of plan.steps) {
    for (const r of step.controlRefs) {
      const c = controls.get(r);
      if (!c || seen.has(r)) throw new FlectoError('SCHEMA_INVALID');
      if (snapshot.controls.filter(other => other.semanticKey === c.semanticKey).length !== 1) throw new FlectoError('AMBIGUOUS_TARGET');
      if (action && c.formRef !== scope) throw new FlectoError('SCHEMA_INVALID');
      if (c.actionKind === 'submit' && r !== plan.sourceActionRef) throw new FlectoError('AMBIGUOUS_TARGET');
      if (c.kind === 'checkbox' && step.template !== 'consent') throw new FlectoError('SCHEMA_INVALID');
      seen.add(r);
    }
    for (const r of step.noticeRefs) {
      const n = notices.get(r);
      if (!n || (action && n.formRef !== null && n.formRef !== scope)) throw new FlectoError('SCHEMA_INVALID');
      covered.add(r);
    }
  }
  for (const c of snapshot.controls) {
    if (action && c.formRef !== scope) continue;
    if (c.required && c.actionKind === 'none' && !seen.has(c.ref)) throw new FlectoError('REQUIRED_MISSING');
    if (seen.has(c.ref) && c.noticeRefs.some(r => !covered.has(r))) throw new FlectoError('REQUIRED_MISSING');
  }
  for (const n of snapshot.notices) if ((!action || n.formRef === null || n.formRef === scope) && !covered.has(n.ref)) throw new FlectoError('REQUIRED_MISSING');
  return plan;
}
