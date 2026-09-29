import { createHash } from 'node:crypto';
import {
  CACHE_VERSION, PROMPT_VERSION, CachedBlueprintSchema, FlectoError, PublicPageSnapshotSchema,
  type CachedBlueprint, type PagePlan, type PublicPageSnapshot, type Template,
} from '@flecto/contracts';
import { verifyPlan } from '@flecto/core';

// Storage namespace is independent of the shared wire contract (owned by lead).
export const COMPATIBILITY_VERSION = 'strict-options-v1';
const titles: Record<Template, string> = {
  task_selection: '원하시는 일을 선택해 주세요', grouped_form: '필요한 정보를 입력해 주세요',
  item_selection: '원하시는 항목을 선택해 주세요', consent: '안내를 읽고 동의해 주세요',
  final_review: '입력한 내용을 확인해 주세요', result: '처리 결과를 확인해 주세요',
};
function genuineChoice(label: string): boolean {
  const text = label.trim().replace(/^[-—–\s]+|[-—–\s]+$/g, '');
  // The public contract intentionally carries no option value. Fail closed for
  // recognizable placeholders instead of consulting private source values.
  return !!text && !/^(?:(?:please\s+)?(?:select|choose)(?:\s|$)|선택\s*(?:안\s*함|없음)?$)|(?:선택|골라|고르).*(?:주세요|하세요|하십시오)|선택$/i.test(text);
}
export function genericTitles<T extends { steps: { template: Template; title: string }[] }>(plan: T): T {
  return { ...plan, steps: plan.steps.map(step => ({ ...step, title: titles[step.template] })) };
}

function scope(snapshot: PublicPageSnapshot) {
  PublicPageSnapshotSchema.parse(snapshot); // Includes global ref uniqueness, even outside selected form.
  const action = snapshot.controls.find(c => c.ref === snapshot.goalRef);
  if (snapshot.goal !== 'complete_form' || !action || action.actionKind !== 'submit' || !action.formRef) {
    throw new FlectoError('STALE_DOCUMENT');
  }
  const key = (value: string) => value.replace(/^form_\d+(?=\||$)/, 'selected_form');
  const controls = snapshot.controls.filter(c => c.ref === action.ref || (c.formRef === action.formRef && c.actionKind === 'none'));
  const notices = snapshot.notices.filter(n => n.formRef === null || n.formRef === action.formRef);
  const unique = <T extends { semanticKey: string }>(items: T[]) => {
    const map = new Map<string, T>();
    for (const item of items) {
      const k = key(item.semanticKey);
      if (map.has(k)) throw new FlectoError('AMBIGUOUS_TARGET');
      map.set(k, item);
    }
    return map;
  };
  const controlMap = unique(controls), noticeMap = unique(notices);
  if (controls.some(c => c.semanticKey.endsWith('|action-local'))) throw new FlectoError('UNSUPPORTED_CONTROL');
  return { action, key, controls, notices, controlMap, noticeMap };
}

// Only hashes persist. No current options, selected state, refs, or input values.
// All non-option semantics, including exact notice text/associations, are locked.
export function compatibleKey(snapshot: PublicPageSnapshot): string | null {
  try {
    const { action, key, controls, notices } = scope(snapshot);
    const noticeKeys = new Map(notices.map(n => [n.ref, key(n.semanticKey)]));
    for (const c of controls) {
      if (c.kind === 'select' || c.kind === 'radio') {
        // Blank/prompt options cannot prove there is an eligible genuine choice.
        if (!c.options.some(o => !o.disabled && genuineChoice(o.label))) return null;
      }
    }
    const canonical = {
      version: COMPATIBILITY_VERSION, schemaVersion: snapshot.schemaVersion, origin: snapshot.origin,
      goal: snapshot.goal, action: key(action.semanticKey),
      controls: controls.map(c => ({
        key: key(c.semanticKey), kind: c.kind, label: c.label, required: c.required, disabled: c.disabled,
        form: c.formRef === null ? null : 'selected_form', actionKind: c.actionKind,
        constraints: Object.entries(c.constraints).sort(([a], [b]) => a.localeCompare(b)),
        options: c.kind === 'select' || c.kind === 'radio' ? null : c.options.map(({ label, disabled }) => ({ label, disabled })),
        notices: c.noticeRefs.map(ref => { const k = noticeKeys.get(ref); if (!k) throw new FlectoError('STALE_DOCUMENT'); return k; }).sort(),
      })).sort((a, b) => a.key.localeCompare(b.key)),
      notices: notices.map(n => ({ key: key(n.semanticKey), text: n.text, kind: n.kind, form: n.formRef === null ? null : 'selected_form' })).sort((a, b) => a.key.localeCompare(b.key)),
    };
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  } catch { return null; }
}

/** Separate verifier: never weaken or impersonate core's exact fingerprint gate. */
export function rebindCompatible(input: CachedBlueprint, snapshot: PublicPageSnapshot, expectedKey: string): PagePlan {
  const blueprint = CachedBlueprintSchema.parse(input);
  if (blueprint.status !== 'VERIFIED' || blueprint.cacheVersion !== CACHE_VERSION || blueprint.promptVersion !== PROMPT_VERSION ||
      blueprint.origin !== snapshot.origin || compatibleKey(snapshot) !== expectedKey) throw new FlectoError('STALE_DOCUMENT');
  const { action, key, controls, controlMap, noticeMap } = scope(snapshot);
  const controlRef = (k: string) => { const c = controlMap.get(k); if (!c) throw new FlectoError('STALE_DOCUMENT'); return c.ref; };
  const noticeRef = (k: string) => { const n = noticeMap.get(k); if (!n) throw new FlectoError('STALE_DOCUMENT'); return n.ref; };
  if (blueprint.actionKey !== key(action.semanticKey) || blueprint.locators.length !== controls.length ||
      new Set(blueprint.locators.map(l => l.key)).size !== controls.length) throw new FlectoError('STALE_DOCUMENT');
  for (const locator of blueprint.locators) {
    const c = controlMap.get(locator.key);
    if (!c || c.kind !== locator.kind || c.required !== locator.required || locator.formKey !== (c.formRef === null ? null : 'selected_form')) throw new FlectoError('STALE_DOCUMENT');
  }
  // Plans contain only fresh control/notice refs. The UI obtains every option and
  // private current value from the current snapshot/registry, never from SQLite.
  return verifyPlan({ schemaVersion: 1, snapshotId: snapshot.snapshotId, sourceActionRef: controlRef(blueprint.actionKey),
    steps: genericTitles(blueprint).steps.map(({ controlKeys, noticeKeys, ...step }) => ({ ...step,
      controlRefs: controlKeys.map(controlRef), noticeRefs: noticeKeys.map(noticeRef),
    })),
  }, snapshot);
}
