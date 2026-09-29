import {
  FlectoError, PagePlanSchema, type PagePlan, type PlanProvider, type PlanStep,
  type PublicControl, type PublicPageSnapshot,
} from '@flecto/contracts';

/** Explicit deterministic development provider. It has no per-site answers. */
export function buildFixturePlan(snapshot: PublicPageSnapshot): PagePlan {
  const availableActions = snapshot.controls.filter((control) => control.actionKind === 'submit' && !control.disabled);
  const chosen = snapshot.goalRef ? availableActions.find((control) => control.ref === snapshot.goalRef) :
    availableActions.length === 1 ? availableActions[0] : undefined;
  if (!chosen) throw new FlectoError(availableActions.length > 1 ? 'AMBIGUOUS_TARGET' : 'UNSUPPORTED_CONTROL');
  if (!chosen.formRef) throw new FlectoError('UNSUPPORTED_CONTROL');
  const controls = snapshot.controls.filter((control) => control.formRef === chosen.formRef && control.actionKind === 'none' && !control.disabled);
  const notices = snapshot.notices.filter((notice) => notice.formRef === chosen.formRef || notice.formRef === null);
  const steps: PlanStep[] = [];
  const append = (items: PublicControl[], template: PlanStep['template'], title: string, chunk = 3) => {
    for (let index = 0; index < items.length; index += chunk) {
      const group = items.slice(index, index + chunk);
      steps.push({ id: `step_${steps.length + 1}`, template, title,
        controlRefs: group.map((item) => item.ref), noticeRefs: [...new Set(group.flatMap((item) => item.noticeRefs))] });
    }
  };
  append(controls.filter((c) => !['select', 'radio', 'checkbox'].includes(c.kind)), 'grouped_form', '필요한 정보를 입력해 주세요');
  append(controls.filter((c) => ['select', 'radio'].includes(c.kind)), 'item_selection', '원하시는 항목을 선택해 주세요', 2);
  append(controls.filter((c) => c.kind === 'checkbox'), 'consent', '안내를 읽고 동의해 주세요');
  const attached = new Set(steps.flatMap((step) => step.noticeRefs));
  const unplaced = notices.filter((notice) => !attached.has(notice.ref)).map((notice) => notice.ref);
  const consentStep = steps.find((step) => step.template === 'consent');
  if (consentStep) consentStep.noticeRefs = [...new Set([...consentStep.noticeRefs, ...unplaced])];
  steps.push({ id: `step_${steps.length + 1}`, template: 'final_review', title: '입력한 내용을 확인해 주세요',
    controlRefs: [], noticeRefs: consentStep ? [] : unplaced });
  return PagePlanSchema.parse({ schemaVersion: 1, snapshotId: snapshot.snapshotId, steps, sourceActionRef: chosen.ref });
}

export class FixtureProvider implements PlanProvider {
  readonly mode = 'FIXTURE' as const;
  readonly model = 'fixture-structure-v1';
  constructor(private readonly options: { delayMs?: number; fail?: boolean } = {}) {}
  async plan(snapshot: PublicPageSnapshot, _remainingBudgetMs: number, signal: AbortSignal): Promise<PagePlan> {
    if (signal.aborted) throw new FlectoError('CANCELLED');
    if (this.options.delayMs) await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, this.options.delayMs);
      const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new FlectoError('CANCELLED')); };
      signal.addEventListener('abort', abort, { once: true });
    });
    if (signal.aborted) throw new FlectoError('CANCELLED');
    if (this.options.fail) throw new FlectoError('PROVIDER_ERROR');
    return buildFixturePlan(snapshot);
  }
}
