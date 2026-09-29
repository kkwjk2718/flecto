import { describe, expect, it } from 'vitest';
import { PagePlanSchema, PlannerRequestSchema, PublicPageSnapshotSchema, RunMetricSchema } from '@flecto/contracts';

const snapshot = {
  schemaVersion: 1, requestId: 'r1', snapshotId: 's1', documentInstanceId: 'd1',
  origin: 'http://127.0.0.1:4173', goal: 'complete_form', goalRef: null,
  semanticRevision: 0, optionRevision: 0, controls: [], notices: [],
};
describe('strict public contracts', () => {
  it('accepts only declared public structure and rejects private data at the boundary', () => {
    expect(PublicPageSnapshotSchema.safeParse(snapshot).success).toBe(true);
    for (const privateField of ['value', 'password', 'cookie', 'html', 'userInput']) {
      expect(PublicPageSnapshotSchema.safeParse({ ...snapshot, [privateField]: 'PRIVATE_SENTINEL' }).success).toBe(false);
    }
    expect(PublicPageSnapshotSchema.safeParse({ ...snapshot, origin: 'http://127.0.0.1:4173/?private=1' }).success).toBe(false);
  });
  it('rejects executable output, unsupported templates and repeated references', () => {
    const plan = { schemaVersion: 1, snapshotId: 's1', steps: [{ id: 'step1', template: 'grouped_form', title: '입력', controlRefs: ['e1'], noticeRefs: [] }], sourceActionRef: null };
    expect(PagePlanSchema.safeParse(plan).success).toBe(true);
    expect(PagePlanSchema.safeParse({ ...plan, javascript: 'alert(1)' }).success).toBe(false);
    expect(PagePlanSchema.safeParse({ ...plan, steps: [{ ...plan.steps[0], template: 'custom_html' }] }).success).toBe(false);
    expect(PagePlanSchema.safeParse({ ...plan, steps: [{ ...plan.steps[0], controlRefs: ['e1', 'e1'] }] }).success).toBe(false);
  });
  it('bounds waiting time and rejects arbitrary metric text', () => {
    expect(PlannerRequestSchema.safeParse({ snapshot, remainingBudgetMs: 10000, sessionEpoch: 1 }).success).toBe(true);
    expect(PlannerRequestSchema.safeParse({ snapshot, remainingBudgetMs: 10001, sessionEpoch: 1 }).success).toBe(false);
    expect(RunMetricSchema.safeParse({ schemaVersion: 1, prompt: 'PRIVATE_SENTINEL' }).success).toBe(false);
  });
});
