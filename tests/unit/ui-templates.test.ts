// @vitest-environment jsdom
import { describe, expect, it, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { emptyViewModel } from '@flecto/contracts';
import type { FlectoViewModel, UserAction, ViewControl, PlanStep } from '@flecto/contracts';
import { FlectoApp, SPONSOR_NOTE } from '@flecto/templates';
import { FLECTO_CSS } from '@flecto/design-tokens';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Mounted = { shadow: ShadowRoot; actions: UserAction[]; rerender: (m: FlectoViewModel) => void; root: Root };
const mounted: Array<{ root: Root; host: HTMLElement }> = [];
afterEach(() => {
  for (const m of mounted.splice(0)) { act(() => m.root.unmount()); m.host.remove(); }
});

function mount(model: FlectoViewModel): Mounted {
  const host = document.createElement('div');
  document.body.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = FLECTO_CSS;
  const container = document.createElement('div');
  shadow.append(style, container);
  const actions: UserAction[] = [];
  const root = createRoot(container);
  const onAction = (a: UserAction) => { actions.push(a); };
  act(() => root.render(createElement(FlectoApp, { model, onAction })));
  mounted.push({ root, host });
  return { shadow, actions, root, rerender: (m) => act(() => root.render(createElement(FlectoApp, { model: m, onAction }))) };
}

function control(p: Partial<ViewControl> & { ref: string; kind: ViewControl['kind']; label: string }): ViewControl {
  return {
    formRef: 'form1', required: false, disabled: false, semanticKey: p.ref, constraints: {}, options: [],
    noticeRefs: [], actionKind: 'none', value: '', error: null, description: null, composing: false, ...p,
  };
}
const step = (id: string, template: PlanStep['template'], controlRefs: string[], noticeRefs: string[] = []): PlanStep =>
  ({ id, template, title: id === 's1' ? '주문 정보를 입력해 주세요' : id + ' 단계', controlRefs, noticeRefs });

function formModel(over: Partial<FlectoViewModel> = {}): FlectoViewModel {
  return {
    ...emptyViewModel(), phase: 'READY', sourceName: '구매 혜택 신청 (시연)', mode: 'FIXTURE',
    steps: [step('s1', 'grouped_form', ['name', 'phone']), step('s2', 'item_selection', ['course']), step('s3', 'consent', ['agree1', 'agree2'], ['n1']), step('s4', 'final_review', ['submit'])],
    stepIndex: 0,
    controls: [
      control({ ref: 'name', kind: 'text', label: '이름', required: true, description: '주문하신 분 성함' }),
      control({ ref: 'phone', kind: 'tel', label: '연락처' }),
      control({ ref: 'course', kind: 'radio', label: '강좌', required: true, options: [{ ref: 'c1', label: '오전 서예', disabled: false }, { ref: 'c2', label: '오후 요가', disabled: false }, { ref: 'c3', label: '저녁 합창 (마감)', disabled: true }] }),
      control({ ref: 'agree1', kind: 'checkbox', label: '개인정보 수집·이용 동의', required: true }),
      control({ ref: 'agree2', kind: 'checkbox', label: '혜택 소식 받기', required: false }),
      control({ ref: 'submit', kind: 'submit', label: '혜택 신청하기', actionKind: 'submit' }),
    ],
    notices: [{ ref: 'n1', text: '수집 항목: 이름, 연락처. 보유 기간: 1년.', kind: 'terms', formRef: 'form1', semanticKey: 'n1' }],
    canGoNext: true, canGoBack: false, ...over,
  };
}

const q = <T extends Element>(s: ShadowRoot, sel: string) => s.querySelector<T>(sel);
const qa = <T extends Element>(s: ShadowRoot, sel: string) => Array.from(s.querySelectorAll<T>(sel));
const byText = (s: ShadowRoot, sel: string, text: string) => qa<HTMLElement>(s, sel).find((el) => el.textContent?.includes(text)) ?? null;
function setNativeValue(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
}
function type(el: HTMLInputElement, value: string) {
  act(() => { setNativeValue(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
function key(el: Element, init: KeyboardEventInit) {
  const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, composed: true, ...init });
  act(() => { el.dispatchEvent(ev); });
  return ev;
}

describe('FLECTO shell', () => {
  it('is a named dialog showing brand, source identity and always-available exits', () => {
    const { shadow, actions } = mount(formModel());
    const dialog = q<HTMLElement>(shadow, '[role="dialog"]')!;
    expect(dialog.getAttribute('aria-label')).toBe('FLECTO 쉬운 화면');
    expect(dialog.textContent).toContain('구매 혜택 신청 (시연)');
    act(() => byText(shadow, 'button', '원래 화면 보기')!.click());
    act(() => byText(shadow, 'button', '닫기')!.click());
    expect(actions).toEqual([{ kind: 'SHOW_ORIGINAL' }, { kind: 'CLOSE' }]);
  });

  it('renders model text as plain text, never as HTML', () => {
    const evil = '<img src=x onerror="alert(1)"><b>굵게</b>';
    const m = formModel({ sourceName: evil });
    m.controls[0] = { ...m.controls[0], label: evil, description: evil, error: evil };
    m.notices = [{ ...m.notices[0], text: evil }];
    const { shadow } = mount(m);
    expect(q(shadow, 'img')).toBeNull();
    expect(q(shadow, 'b')).toBeNull();
    expect(shadow.textContent).toContain(evil);
  });

  it('Escape emits SHOW_ORIGINAL but not during IME composition', () => {
    const { shadow, actions } = mount(formModel());
    const input = q<HTMLInputElement>(shadow, 'input[data-flecto-ref="name"]')!;
    act(() => { input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); });
    key(input, { key: 'Escape', isComposing: true });
    expect(actions.filter((a) => a.kind === 'SHOW_ORIGINAL')).toHaveLength(0);
    act(() => { input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' })); });
    key(input, { key: 'Escape' });
    expect(actions.filter((a) => a.kind === 'SHOW_ORIGINAL')).toHaveLength(1);
  });

  it('traps Tab focus inside the dialog in both directions', () => {
    const { shadow } = mount(formModel());
    const dialog = q<HTMLElement>(shadow, '[role="dialog"]')!;
    const buttons = qa<HTMLElement>(shadow, 'button:not([disabled]), input:not([disabled]), summary');
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    act(() => last.focus());
    const forward = key(last, { key: 'Tab' });
    expect(forward.defaultPrevented).toBe(true);
    expect(shadow.activeElement).toBe(first);
    const backward = key(first, { key: 'Tab', shiftKey: true });
    expect(backward.defaultPrevented).toBe(true);
    expect(shadow.activeElement).toBe(last);
    expect(dialog.contains(shadow.activeElement)).toBe(true);
  });

  it('does not hide or inert the host page', () => {
    mount(formModel());
    expect(document.body.hasAttribute('inert')).toBe(false);
    expect(document.body.getAttribute('aria-hidden')).toBeNull();
  });

  it('shows the plan step count only for a known multi-step plan', () => {
    const a = mount(formModel());
    expect(a.shadow.textContent).toContain('전체 4단계 중 1단계');
    const b = mount({ ...emptyViewModel(), phase: 'PREPARING' });
    expect(b.shadow.textContent).not.toMatch(/단계 중|\d+\s*\/\s*\d+/);
  });

  it('settings emit the full settings object and keep the typed draft and element', () => {
    const m = formModel();
    const { shadow, actions, rerender } = mount(m);
    const input = q<HTMLInputElement>(shadow, 'input[data-flecto-ref="name"]')!;
    type(input, '김영희');
    act(() => byText(shadow, 'button', '글자·화면 설정')!.click());
    const big = byText(shadow, '.fl-seg label', '크게')!.querySelector('input')!;
    act(() => big.click());
    expect(actions.at(-1)).toEqual({ kind: 'UPDATE_SETTINGS', settings: { ...m.settings, fontSize: 30 } });
    rerender({ ...m, settings: { ...m.settings, fontSize: 30 } });
    expect(q<HTMLElement>(shadow, '.fl-root')!.dataset.font).toBe('30');
    const after = q<HTMLInputElement>(shadow, 'input[data-flecto-ref="name"]')!;
    expect(after).toBe(input);
    expect(after.value).toBe('김영희');
  });
});

describe('grouped form', () => {
  it('labels every input, marks required, and wires help and error text', () => {
    const m = formModel();
    m.controls[0] = { ...m.controls[0], error: '이름을 입력해 주세요' };
    const { shadow } = mount(m);
    const input = q<HTMLInputElement>(shadow, 'input[data-flecto-ref="name"]')!;
    const label = q<HTMLLabelElement>(shadow, 'label[for="' + input.id + '"]')!;
    expect(label.textContent).toContain('이름');
    expect(label.textContent).toContain('필수');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const described = input.getAttribute('aria-describedby')!.split(' ').map((id) => shadow.getElementById(id)?.textContent);
    expect(described).toEqual(['주문하신 분 성함', expect.stringContaining('이름을 입력해 주세요')]);
    expect(input.placeholder).toBe('');
  });

  it('sends composing transitions and local text, and never submits on Enter', () => {
    const { shadow, actions } = mount(formModel());
    const input = q<HTMLInputElement>(shadow, 'input[data-flecto-ref="name"]')!;
    act(() => { input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); });
    type(input, 'ㄱ');
    type(input, '김');
    const composingEnter = key(input, { key: 'Enter', isComposing: true, keyCode: 229 });
    expect(composingEnter.defaultPrevented).toBe(false); // leave the IME commit alone
    act(() => { input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '김' })); });
    const plainEnter = key(input, { key: 'Enter' });
    expect(plainEnter.defaultPrevented).toBe(true);
    expect(actions).toEqual([
      { kind: 'SET_COMPOSING', ref: 'name', composing: true },
      { kind: 'SET_TEXT', ref: 'name', value: 'ㄱ' },
      { kind: 'SET_TEXT', ref: 'name', value: '김' },
      { kind: 'SET_COMPOSING', ref: 'name', composing: false },
    ]);
    expect(actions.some((a) => a.kind === 'INVOKE_SOURCE' || a.kind === 'LOCAL_NEXT')).toBe(false);
  });

  it('keeps the same input element and the newest draft when the controller echoes stale values', () => {
    const m = formModel();
    const { shadow, rerender } = mount(m);
    const input = q<HTMLInputElement>(shadow, 'input[data-flecto-ref="name"]')!;
    type(input, '김');
    type(input, '김영');
    const withValue = (v: string) => ({ ...m, controls: m.controls.map((c) => (c.ref === 'name' ? { ...c, value: v } : c)) });
    rerender(withValue('김'));
    expect(q(shadow, 'input[data-flecto-ref="name"]')).toBe(input);
    expect(input.value).toBe('김영');
    rerender(withValue('김영'));
    expect(input.value).toBe('김영');
    rerender(withValue('박철수')); // a real source-side change is shown
    expect(input.value).toBe('박철수');
  });

  it('does not replace a focused Korean draft with a late echo after the newest acknowledgement', () => {
    const m = formModel();
    const { shadow, rerender } = mount(m);
    const input = q<HTMLInputElement>(shadow, 'input[data-flecto-ref="name"]')!;
    act(() => input.focus());
    act(() => input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
    type(input, 'ㅎ'); type(input, '하'); type(input, '한');
    act(() => input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '한' })));
    const withValue = (value: string) => ({ ...m, controls: m.controls.map(c => c.ref === 'name' ? { ...c, value } : c) });
    rerender(withValue('한'));
    input.setSelectionRange(1, 1);
    rerender(withValue('하'));
    expect(input.value).toBe('한');
    expect(input.selectionStart).toBe(1);
    act(() => input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
    type(input, '한ㄱ'); type(input, '한그'); type(input, '한글');
    act(() => input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '한글' })));
    rerender(withValue('한'));
    expect(input.value).toBe('한글');
  });

  it('moves focus to the first errored control when the step changes', () => {
    const m = formModel({ stepIndex: 1 });
    const { shadow, rerender } = mount(m);
    expect(shadow.activeElement?.tagName).toBe('H1');
    const back = { ...m, stepIndex: 0, controls: m.controls.map((c) => (c.ref === 'phone' ? { ...c, error: '연락처 형식을 확인해 주세요' } : c)) };
    rerender(back);
    expect(shadow.activeElement).toBe(q(shadow, 'input[data-flecto-ref="phone"]'));
  });

  it('next and back send local step actions; next respects canGoNext', () => {
    const { shadow, actions, rerender } = mount(formModel({ canGoBack: true, canGoNext: false }));
    const next = byText(shadow, '.fl-footer button', '다음') as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    act(() => byText(shadow, '.fl-footer button', '이전')!.click());
    rerender(formModel({ canGoBack: true, canGoNext: true }));
    act(() => (byText(shadow, '.fl-footer button', '다음') as HTMLButtonElement).click());
    expect(actions).toEqual([{ kind: 'LOCAL_BACK', fromStep: 's1' }, { kind: 'LOCAL_NEXT', fromStep: 's1' }]);
  });
});

describe('item selection', () => {
  it('shows big cards with nothing preselected and emits the user choice', () => {
    const m = formModel({ stepIndex: 1 });
    const { shadow, actions, rerender } = mount(m);
    const radios = qa<HTMLInputElement>(shadow, 'input[type="radio"][data-flecto-ref="course"]');
    expect(radios).toHaveLength(3);
    expect(radios.some((r) => r.checked)).toBe(false);
    expect(radios[2].disabled).toBe(true);
    expect(shadow.textContent).toContain('아직 선택하지 않았어요');
    act(() => radios[1].click());
    expect(actions).toEqual([{ kind: 'SET_CHOICE', ref: 'course', optionRef: 'c2' }]);
    rerender({ ...m, controls: m.controls.map((c) => (c.ref === 'course' ? { ...c, value: 'c2' } : c)) });
    const card = qa<HTMLElement>(shadow, '.fl-card')[1];
    expect(card.dataset.checked).toBe('true');
    expect(card.textContent).toContain('선택됨');
  });
});

describe('consent', () => {
  it('shows each checkbox with its original required/optional state and only emits user clicks', () => {
    const m = formModel({ stepIndex: 2 });
    const { shadow, actions } = mount(m);
    const boxes = qa<HTMLInputElement>(shadow, 'input[type="checkbox"][data-flecto-ref]');
    expect(boxes.map((b) => b.checked)).toEqual([false, false]);
    expect(shadow.textContent).not.toContain('모두 동의');
    expect(shadow.textContent).toContain('수집 항목: 이름, 연락처. 보유 기간: 1년.');
    const labels = qa<HTMLElement>(shadow, '.fl-check').map((l) => l.textContent);
    expect(labels[0]).toContain('필수');
    expect(labels[1]).toContain('선택');
    expect(actions).toHaveLength(0);
    act(() => boxes[1].click());
    expect(actions).toEqual([{ kind: 'SET_CONSENT_FROM_USER', ref: 'agree2', checked: true }]);
    // controlled by the source value: without a model update the box stays unchecked
    expect(boxes[1].checked).toBe(false);
  });
});

describe('final review', () => {
  const review = (over: Partial<FlectoViewModel> = {}) => formModel({
    phase: 'REVIEW', stepIndex: 3, canGoBack: true, canSubmit: true,
    reviewRows: [{ ref: 'name', label: '이름', value: '김영희' }, { ref: 'phone', label: '연락처', value: '' }],
    ...over,
  });

  it('shows the actual source values and an explicit source-labelled submit button', () => {
    const { shadow, actions } = mount(review());
    expect(shadow.textContent).toContain('김영희');
    expect(shadow.textContent).toContain('입력하지 않음');
    const submit = q<HTMLButtonElement>(shadow, '.fl-footer button[data-flecto-ref="submit"]')!;
    expect(submit.textContent).toBe('혜택 신청하기');
    act(() => submit.click());
    expect(actions).toEqual([{ kind: 'INVOKE_SOURCE', ref: 'submit', intent: 'submit' }]);
  });

  it('disables submit when the controller says it cannot submit', () => {
    const { shadow, actions } = mount(review({ canSubmit: false }));
    const submit = q<HTMLButtonElement>(shadow, '.fl-footer button[data-flecto-ref="submit"]')!;
    expect(submit.disabled).toBe(true);
    act(() => submit.click());
    expect(actions).toHaveLength(0);
  });

  it('falls back to a submit-kind task when no submit control is present', () => {
    const m = review({ tasks: [{ ref: 'act1', label: '강좌 신청하기', kind: 'submit', disabled: false }] });
    m.controls = m.controls.filter((c) => c.ref !== 'submit');
    const { shadow, actions } = mount(m);
    const button = q<HTMLButtonElement>(shadow, '.fl-footer button[data-flecto-ref="act1"]')!;
    expect(button.textContent).toBe('강좌 신청하기');
    act(() => button.click());
    expect(actions).toEqual([{ kind: 'INVOKE_SOURCE', ref: 'act1', intent: 'submit' }]);
  });

  it('each review row offers 수정 that goes back locally to the step owning that field', () => {
    const { shadow, actions } = mount(review());
    const edit = q<HTMLButtonElement>(shadow, 'button[aria-label="연락처 수정"]')!;
    expect(edit.textContent).toBe('수정');
    act(() => edit.click());
    expect(actions).toEqual([{ kind: 'LOCAL_BACK', fromStep: 's4', targetRef: 'phone' }]);
  });

  it('local review help does not promise that the source action is the final submission', () => {
    const { shadow } = mount(review());
    const root = q<HTMLElement>(shadow, '.fl-root')!;
    expect(root.dataset.phase).toBe('REVIEW');
    expect(root.dataset.template).toBe('final_review');
    expect(root.dataset.reviewMode).toBe('local');
    expect(shadow.textContent).not.toContain('신청이 전송');
    expect(shadow.textContent).toContain('다음 화면이나 결과');
  });

  it('a source-rendered review sends edits to the original flow instead of per-row local edits', () => {
    const { shadow, actions } = mount(review({
      reviewEditMode: 'source',
      reviewRows: [{ ref: 'source_review_0', label: '주문번호', value: 'FLECTO-2026-001' }],
    }));
    expect(q<HTMLElement>(shadow, '.fl-root')!.dataset.reviewMode).toBe('source');
    expect(q(shadow, 'button[aria-label="주문번호 수정"]')).toBeNull();
    expect(q(shadow, '[data-testid="flecto-review-edit"]')).toBeNull();
    expect(shadow.textContent).toContain('FLECTO-2026-001');
    expect(shadow.textContent).toContain('아직 접수 전이에요');
    act(() => byText(shadow, '.fl-footer button', '원래 화면에서 고치기')!.click());
    expect(actions).toEqual([{ kind: 'LOCAL_BACK', fromStep: 's4' }]);
  });

  it('marks the one primary action with stable QA hooks that name the action only', () => {
    const ready = mount(formModel());
    const next = qa<HTMLElement>(ready.shadow, '[data-testid="flecto-primary-action"]');
    expect(next).toHaveLength(1);
    expect(next[0].textContent).toBe('다음');
    expect(next[0].dataset.action).toBe('LOCAL_NEXT');
    expect(q<HTMLElement>(ready.shadow, '.fl-root')!.dataset.template).toBe('grouped_form');
    const toReview = mount(formModel({ stepIndex: 2 }));
    expect(q<HTMLElement>(toReview.shadow, '[data-testid="flecto-primary-action"]')!.textContent).toBe('입력 내용 확인하기');
    const submit = mount(review());
    const primary = qa<HTMLElement>(submit.shadow, '[data-testid="flecto-primary-action"]');
    expect(primary).toHaveLength(1);
    expect(primary[0].dataset.action).toBe('INVOKE_SOURCE');
    expect(primary[0].dataset.intent).toBe('submit');
    expect(primary[0].textContent).toBe('혜택 신청하기');
  });

  it('keeps the review values visible without edit buttons when back is not allowed', () => {
    const { shadow } = mount(review({ canGoBack: false }));
    expect(q(shadow, 'button[aria-label="이름 수정"]')).toBeNull();
    expect(shadow.textContent).toContain('김영희');
  });

  it('never exposes a submit button outside review', () => {
    for (const stepIndex of [0, 1, 2]) {
      const { shadow } = mount(formModel({ stepIndex }));
      expect(q(shadow, 'button[data-flecto-ref="submit"]')).toBeNull();
      expect(shadow.textContent).not.toContain('혜택 신청하기');
    }
  });

  it('ignores a primary click that lands right after preparation ends', () => {
    const { shadow, actions, rerender } = mount({ ...review(), phase: 'PREPARING', sponsorVisible: true });
    rerender(review());
    act(() => q<HTMLButtonElement>(shadow, '.fl-footer button[data-flecto-ref="submit"]')!.click());
    expect(actions).toHaveLength(0);
  });
});

describe('preparing and sponsor', () => {
  it('uses the specified loading copy by elapsed time without a progress bar', () => {
    const m = { ...emptyViewModel(), phase: 'PREPARING' as const };
    const a = mount(m);
    expect(a.shadow.textContent).toContain('사용하기 쉬운 화면을 준비하고 있어요.');
    a.rerender({ ...m, elapsedMs: 3100 });
    expect(a.shadow.textContent).toContain('필요한 입력과 버튼을 정리하고 있어요. 준비되면 바로 열어드릴게요.');
    expect(q(a.shadow, 'progress, [role="progressbar"]')).toBeNull();
    expect(q(a.shadow, '.fl-sponsor')).toBeNull();
  });

  it('shows the sponsor only when visible, with the exact disclosure, no link and no focus steal', () => {
    const { shadow, actions } = mount({ ...emptyViewModel(), phase: 'PREPARING', elapsedMs: 3200, sponsorVisible: true });
    const card = q<HTMLElement>(shadow, '.fl-sponsor')!;
    expect(card.textContent).toContain('FLECTO 후원 광고');
    expect(card.textContent).toContain(SPONSOR_NOTE);
    expect(SPONSOR_NOTE).toBe('시연용 광고 · 실제 후원 계약 없음');
    expect(card.querySelector('a')).toBeNull();
    expect(card.querySelectorAll('button')).toHaveLength(1);
    expect(card.contains(shadow.activeElement)).toBe(false);
    act(() => card.click());
    expect(actions).toHaveLength(0);
    act(() => card.querySelector('button')!.click());
    expect(actions).toEqual([{ kind: 'DISMISS_SPONSOR' }]);
  });

  it('does not render the sponsor once the screen is ready', () => {
    const { shadow } = mount(formModel({ sponsorVisible: true }));
    expect(q(shadow, '.fl-sponsor')).toBeNull();
  });
});

describe('outcomes and status', () => {
  it('SUCCESS shows the original result text without celebration', () => {
    const { shadow } = mount({ ...formModel(), phase: 'SUCCESS', resultText: '접수번호 A-102 신청이 접수되었습니다.' });
    expect(shadow.textContent).toContain('완료');
    expect(shadow.textContent).toContain('접수번호 A-102 신청이 접수되었습니다.');
    expect(shadow.textContent).not.toMatch(/축하|🎉/);
  });

  it('SUCCESS lays out the source receipt rows and offers to check the original screen', () => {
    const { shadow, actions } = mount({
      ...formModel(), phase: 'SUCCESS',
      resultText: '구매 혜택 신청이 접수되었습니다\n접수 번호: BEN-1AEA3D35',
      reviewRows: [{ ref: 'result_0', label: '접수번호', value: 'BEN-1AEA3D35' }, { ref: 'result_1', label: '상품분류', value: '가전' }],
    });
    const rows = qa<HTMLElement>(shadow, '.fl-receipt-row');
    expect(rows.map((r) => r.querySelector('dt')!.textContent)).toEqual(['접수 번호', '상품분류']);
    expect(rows[0].querySelector('dd')!.textContent).toBe('BEN-1AEA3D35');
    expect(q(shadow, '.fl-receipt-head')!.textContent).toBe('구매 혜택 신청이 접수되었습니다');
    expect(q<HTMLElement>(shadow, '.fl-root')!.dataset.phase).toBe('SUCCESS');
    act(() => byText(shadow, '.fl-footer button', '원래 화면에서 확인하기')!.click());
    expect(actions).toEqual([{ kind: 'SHOW_ORIGINAL' }]);
    const close = q<HTMLElement>(shadow, '[data-testid="flecto-primary-action"]')!;
    expect(close.dataset.action).toBe('CLOSE');
    expect(close.textContent).toBe('쉬운 화면 닫기');
  });

  it('OUTCOME_UNKNOWN asks to check the source and offers no resubmit', () => {
    const { shadow } = mount({ ...formModel(), phase: 'OUTCOME_UNKNOWN', canSubmit: true });
    expect(shadow.textContent).toContain('결과 확인 필요');
    expect(shadow.textContent).toContain('자동으로 다시 신청하지 않아요');
    expect(qa(shadow, 'button').some((b) => /신청하기|다시 시도|재시도/.test(b.textContent ?? ''))).toBe(false);
    expect(q(shadow, 'button[data-flecto-ref="submit"]')).toBeNull();
    expect(byText(shadow, 'button', '다시 시도')).toBeNull();
    expect(byText(shadow, 'button', '원래 화면에서 결과 확인하기')).not.toBeNull();
  });

  it('SOURCE_REJECTED lists the fields to fix and goes back locally', () => {
    const m = formModel({ phase: 'SOURCE_REJECTED', stepIndex: 3, canGoBack: true, resultText: '연락처 형식이 올바르지 않습니다.' });
    m.controls = m.controls.map((c) => (c.ref === 'phone' ? { ...c, error: '연락처 형식이 올바르지 않습니다.' } : c));
    const { shadow, actions } = mount(m);
    expect(shadow.textContent).toContain('수정 필요');
    act(() => byText(shadow, 'button', '고치러 가기')!.click());
    expect(actions).toEqual([{ kind: 'LOCAL_BACK', fromStep: 's4' }]);
  });

  it('TIMED_OUT uses the specified copy and allows retry or original', () => {
    const { shadow, actions } = mount({ ...emptyViewModel(), phase: 'TIMED_OUT' });
    expect(shadow.textContent).toContain('지금은 화면을 준비하지 못했어요. 원래 화면에서 계속하거나 다시 시도할 수 있어요.');
    act(() => byText(shadow, '.fl-footer button', '다시 시도하기')!.click());
    expect(actions).toEqual([{ kind: 'RETRY' }]);
  });

  it('SUBMITTING offers no actions except the header exits', () => {
    const { shadow } = mount({ ...formModel(), phase: 'SUBMITTING' });
    expect(q(shadow, '.fl-footer')).toBeNull();
  });

  it('technical info stays collapsed', () => {
    const { shadow } = mount(formModel());
    const details = q<HTMLDetailsElement>(shadow, 'details.fl-tech')!;
    expect(details.open).toBe(false);
    expect(details.textContent).toContain('FIXTURE');
  });
});

describe('task selection', () => {
  const tasks = Array.from({ length: 6 }, (_, i) => ({ ref: 't' + i, label: '작업 ' + i, kind: 'navigate' as const, disabled: false }));

  it('shows up to three tasks first and the rest behind 다른 작업 보기', () => {
    const { shadow, actions } = mount({ ...emptyViewModel(), tasks });
    expect(qa(shadow, '.fl-task')).toHaveLength(3);
    act(() => byText(shadow, 'button', '다른 작업 보기')!.click());
    expect(qa(shadow, '.fl-task')).toHaveLength(6);
    act(() => qa<HTMLButtonElement>(shadow, '.fl-task')[4].click());
    expect(actions).toEqual([{ kind: 'START_GOAL', ref: 't4' }]);
  });

  it('says it found nothing when there are no tasks', () => {
    const { shadow, actions } = mount({ ...emptyViewModel(), tasks: [] });
    expect(shadow.textContent).toContain('찾지 못했어요');
    act(() => byText(shadow, 'button', '원래 화면에서 계속하기')!.click());
    expect(actions).toEqual([{ kind: 'SHOW_ORIGINAL' }]);
  });

  it('다른 일 입력하기 filters public labels locally and never emits the typed text', () => {
    const named = [
      { ref: 'g1', label: '구매 혜택 신청', kind: 'navigate' as const, disabled: false },
      { ref: 'g2', label: '신청 내역 보기', kind: 'navigate' as const, disabled: false },
      { ref: 'g3', label: '문화센터 강좌 찾기', kind: 'navigate' as const, disabled: false },
    ];
    const { shadow, actions } = mount({ ...emptyViewModel(), tasks: named });
    act(() => byText(shadow, 'button', '다른 일 입력하기')!.click());
    const input = q<HTMLInputElement>(shadow, 'input[type="search"]')!;
    act(() => { input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); });
    type(input, '강좌 김영희 010');
    act(() => { input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' })); });
    expect(key(input, { key: 'Enter' }).defaultPrevented).toBe(true);
    expect(actions).toEqual([]);
    const found = qa<HTMLButtonElement>(shadow, '[aria-label="찾은 일"] .fl-task');
    expect(found.map((b) => b.dataset.flectoRef)).toEqual(['g3']);
    act(() => found[0].click());
    expect(actions).toEqual([{ kind: 'START_GOAL', ref: 'g3' }]);
    type(input, '택배 조회');
    expect(qa(shadow, '[aria-label="찾은 일"] .fl-task')).toHaveLength(0);
    act(() => byText(shadow, 'button', '원래 화면에서 계속하기')!.click());
    expect(actions.at(-1)).toEqual({ kind: 'SHOW_ORIGINAL' });
    expect(JSON.stringify(actions)).not.toMatch(/김영희|010|택배/);
    expect(actions.some((a) => a.kind === 'START_GOAL' && a.ref === null)).toBe(false);
  });
});

// Regression (UI-REPAIR-01): after PREPARING -> READY the primary "다음" button used to render
// enabled while primary() silently dropped clicks for 500ms, so an automated (or quick) first
// Next click on the first input step was lost with no state change and no error. Visible
// disabled state and the runtime guard must agree, and the button must arm on its own.
describe('primary arming after preparation', () => {
  const findNext = (shadow: ShadowRoot) => qa<HTMLButtonElement>(shadow, '.fl-footer button').find((b) => b.textContent === '다음')!;

  it('renders the first-step Next disabled while unarmed, then arms itself and emits LOCAL_NEXT', () => {
    vi.useFakeTimers();
    try {
      const preparing = { ...formModel(), phase: 'PREPARING' as const, steps: [], canGoNext: false };
      const { shadow, actions, rerender } = mount(preparing);
      rerender(formModel());
      const next = findNext(shadow);
      expect(next).toBeDefined();
      expect(next.disabled).toBe(true);
      act(() => next.click());
      expect(actions).toHaveLength(0);
      act(() => { vi.advanceTimersByTime(499); });
      expect(findNext(shadow).disabled).toBe(true);
      act(() => { vi.advanceTimersByTime(1); });
      const armed = findNext(shadow);
      expect(armed.disabled).toBe(false);
      act(() => armed.click());
      expect(actions).toEqual([{ kind: 'LOCAL_NEXT', fromStep: 's1' }]);
    } finally { vi.useRealTimers(); }
  });

  it('never disables a primary button once armed, even across value re-renders', () => {
    vi.useFakeTimers();
    try {
      const { shadow, actions, rerender } = mount({ ...formModel(), phase: 'PREPARING' as const, steps: [], canGoNext: false });
      rerender(formModel());
      act(() => { vi.advanceTimersByTime(500); });
      // A controller patch (typed value echoed back) re-renders without a phase change.
      rerender(formModel({ controls: formModel().controls.map((c) => c.ref === 'name' ? { ...c, value: '김영희' } : c) }));
      const next = findNext(shadow);
      expect(next.disabled).toBe(false);
      act(() => next.click());
      expect(actions).toEqual([{ kind: 'LOCAL_NEXT', fromStep: 's1' }]);
    } finally { vi.useRealTimers(); }
  });

  it('keeps the status-phase primary and result close in step with the arm guard', () => {
    vi.useFakeTimers();
    try {
      const timedOut = { ...emptyViewModel(), phase: 'TIMED_OUT' as const };
      const { shadow, rerender } = mount({ ...timedOut, phase: 'PREPARING' as const });
      rerender(timedOut);
      const primaries = qa<HTMLButtonElement>(shadow, '.fl-footer .fl-btn-primary');
      expect(primaries.length).toBeGreaterThan(0);
      for (const b of primaries) expect(b.disabled).toBe(true);
      act(() => { vi.advanceTimersByTime(500); });
      for (const b of qa<HTMLButtonElement>(shadow, '.fl-footer .fl-btn-primary')) expect(b.disabled).toBe(false);
    } finally { vi.useRealTimers(); }
  });
});
