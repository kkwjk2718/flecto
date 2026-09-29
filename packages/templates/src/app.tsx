import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import type {
  FlectoViewModel, PlanStep, PublicNotice, SourceTask, Template, UserAction, UserSettings, ViewControl,
} from '@flecto/contracts';
import {
  DIALOG_NAME, ERROR_BANNER, LOADING, MODE_LABEL, SPONSOR_LABEL, SPONSOR_NOTE, STATUS, TEMPLATE_INTRO, TEMPLATE_TITLE,
} from './copy';
import type { StatusAction, StatusCopy } from './copy';
import { ControlField, NoticeBlock } from './fields';
import type { Emit, FieldContext } from './fields';

export type FlectoAppProps = { model: FlectoViewModel; onAction: (action: UserAction) => void };

type View =
  | { kind: 'loading' }
  | { kind: 'template'; template: Template }
  | { kind: 'status'; copy: StatusCopy };

const RESULT_PHASES = new Set(['SUCCESS', 'SOURCE_REJECTED', 'OUTCOME_UNKNOWN']);
// A primary action that appears right after preparation ignores clicks for a moment so a click
// aimed at the preparing screen (or its sponsor card) cannot land on a new primary button.
const ARM_DELAY_MS = 500;
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])';

export function resolveView(model: FlectoViewModel): View {
  const step = model.steps[model.stepIndex] ?? null;
  switch (model.phase) {
    case 'PREPARING':
      return { kind: 'loading' };
    case 'IDLE':
      return { kind: 'template', template: 'task_selection' };
    case 'REVIEW':
      return { kind: 'template', template: 'final_review' };
    case 'READY':
      return { kind: 'template', template: step?.template ?? 'task_selection' };
    default:
      return { kind: 'status', copy: STATUS[model.phase] ?? STATUS.UNSUPPORTED! };
  }
}

function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => { ref.current = value; });
  return ref;
}

function activeIn(root: HTMLElement): Element | null {
  const node = root.getRootNode() as Document | ShadowRoot;
  return node.activeElement ?? null;
}

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    const closed = el.closest('details:not([open])');
    if (closed && !(el.tagName === 'SUMMARY' && el.parentElement === closed)) return false;
    if (el instanceof HTMLInputElement && el.type === 'radio' && !el.checked) {
      const group = el.name ? Array.from(root.querySelectorAll<HTMLInputElement>('input[type="radio"]')).filter((r) => r.name === el.name && !r.disabled) : [];
      const hasChecked = group.some((r) => r.checked);
      return hasChecked ? false : group[0] === el;
    }
    return true;
  });
}

function stepControls(model: FlectoViewModel, step: PlanStep | null): ViewControl[] {
  if (!step) return model.controls;
  const byRef = new Map(model.controls.map((c) => [c.ref, c]));
  return step.controlRefs.map((ref) => byRef.get(ref)).filter((c): c is ViewControl => Boolean(c));
}

function stepNotices(model: FlectoViewModel, step: PlanStep | null, controls: ViewControl[]): PublicNotice[] {
  const attached = new Set(controls.flatMap((c) => c.noticeRefs));
  const refs = step ? step.noticeRefs : model.notices.map((n) => n.ref);
  const byRef = new Map(model.notices.map((n) => [n.ref, n]));
  return refs.filter((ref) => !attached.has(ref)).map((ref) => byRef.get(ref)).filter((n): n is PublicNotice => Boolean(n));
}

type SubmitTarget = { ref: string; label: string; disabled: boolean };

// Final source action: prefer the source submit control (controls hold every current form
// control), then a submit-kind task. The controller still validates the actual target.
function findSubmitTarget(model: FlectoViewModel, step: PlanStep | null): SubmitTarget | null {
  const candidates = model.controls.filter((c) => c.actionKind === 'submit' && (c.kind === 'submit' || c.kind === 'button'));
  const control = (step ? candidates.find((c) => step.controlRefs.includes(c.ref)) : undefined) ?? candidates[0];
  if (control) return { ref: control.ref, label: control.label.trim() || FALLBACK_SUBMIT_LABEL, disabled: control.disabled };
  const task = model.tasks.find((t) => t.kind === 'submit');
  if (task) return { ref: task.ref, label: task.label.trim() || FALLBACK_SUBMIT_LABEL, disabled: task.disabled };
  return null;
}
const FALLBACK_SUBMIT_LABEL = '신청하기';

function BrandMark() {
  return (
    <svg className="fl-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="30" height="30" rx="9" fill="var(--fl-brand)" />
      <rect x="9" y="8" width="15" height="4" rx="2" fill="#FFFFFF" />
      <rect x="9" y="14.5" width="10" height="4" rx="2" fill="#FFFFFF" />
      <rect x="9" y="8" width="4" height="16" rx="2" fill="#FFFFFF" />
    </svg>
  );
}

function Settings({ settings, emit, idBase }: { settings: UserSettings; emit: Emit; idBase: string }) {
  const update = (patch: Partial<UserSettings>) => emit({ kind: 'UPDATE_SETTINGS', settings: { ...settings, ...patch } });
  const group = <T extends string | number>(legend: string, name: string, current: T, options: Array<[T, string]>, set: (v: T) => void) => (
    <fieldset className="fl-seg">
      <legend>{legend}</legend>
      {options.map(([value, label]) => (
        <label key={String(value)} data-checked={current === value}>
          <input type="radio" name={idBase + name} checked={current === value} onChange={() => set(value)} />
          <span>{label}</span>
        </label>
      ))}
    </fieldset>
  );
  return (
    <section className="fl-settings" id={idBase + 'settings'} aria-label="화면 설정">
      {group<22 | 26 | 30>('글자 크기', 'font', settings.fontSize, [[22, '작게'], [26, '보통'], [30, '크게']], (v) => update({ fontSize: v }))}
      {group<'normal' | 'high'>('화면 대비', 'contrast', settings.contrast, [['normal', '기본'], ['high', '더 진하게']], (v) => update({ contrast: v }))}
      {group<'brief' | 'detailed'>('설명', 'explain', settings.explanation, [['brief', '짧게'], ['detailed', '자세히']], (v) => update({ explanation: v }))}
      <label className="fl-check" data-checked={settings.reducedMotion}>
        <input type="checkbox" checked={settings.reducedMotion} onChange={(e) => update({ reducedMotion: e.currentTarget.checked })} />
        <span className="fl-check-text"><span>움직임 줄이기</span></span>
      </label>
      <p className="fl-help">설정을 바꿔도 입력하신 내용은 그대로 있어요.</p>
    </section>
  );
}

const normalize = (value: string) => value.normalize('NFC').toLowerCase().replace(/\s+/g, '');

// Purely local: matches the user's words against public task labels already in the model.
// The typed text is never emitted; only a chosen, confirmed task ref leaves this component.
export function matchTasks(tasks: SourceTask[], query: string): SourceTask[] {
  const whole = normalize(query);
  if (!whole) return [];
  const words = query.split(/\s+/).map(normalize).filter((w) => w.length >= 2);
  return tasks.filter((task) => {
    const label = normalize(task.label);
    return label.includes(whole) || words.some((w) => label.includes(w));
  });
}

function TaskList({ tasks, onPick, onOriginal, idBase }: {
  tasks: SourceTask[]; onPick: (task: SourceTask) => void; onOriginal: () => void; idBase: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const first = tasks.length <= 4 ? tasks : tasks.slice(0, 3);
  const rest = tasks.length <= 4 ? [] : tasks.slice(3);
  const matches = matchTasks(tasks, query);
  const searchId = idBase + '-goal';
  const item = (task: SourceTask) => (
    <li key={task.ref}>
      <button type="button" className="fl-task" disabled={task.disabled} onClick={() => onPick(task)} data-flecto-ref={task.ref}>
        <span className="fl-task-text">
          <span className="fl-task-label">{task.label}</span>
          {task.description ? <span className="fl-task-desc">{task.description}</span> : null}
          {task.disabled ? <span className="fl-task-desc">지금은 선택할 수 없어요</span> : null}
        </span>
        <span className="fl-task-arrow" aria-hidden="true">→</span>
      </button>
    </li>
  );
  return (
    <>
      <ul className="fl-tasks" role="list">{first.map(item)}</ul>
      {rest.length > 0 && !expanded ? (
        <button type="button" className="fl-btn fl-more" aria-expanded={false} onClick={() => setExpanded(true)}>
          다른 작업 보기 ({rest.length}개)
        </button>
      ) : null}
      {expanded ? <ul className="fl-tasks" role="list" aria-label="다른 작업">{rest.map(item)}</ul> : null}
      {!searching ? (
        <button type="button" className="fl-btn fl-more" aria-expanded={false} onClick={() => setSearching(true)}>
          다른 일 입력하기
        </button>
      ) : (
        <section className="fl-section" aria-label="다른 일 찾기">
          <div className="fl-field">
            <label className="fl-label" htmlFor={searchId}>하고 싶은 일을 짧게 적어 주세요</label>
            <p className="fl-help" id={searchId + '-help'}>예: 신청, 강좌, 내역. 이름·연락처 같은 개인정보는 적지 마세요. 적은 내용은 이 화면에서만 찾는 데 쓰여요.</p>
            <input
              id={searchId}
              className="fl-input"
              type="search"
              autoComplete="off"
              value={query}
              aria-describedby={searchId + '-help'}
              onChange={(e) => setQuery(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) e.preventDefault();
              }}
            />
          </div>
          {query.trim() === '' ? null : matches.length > 0 ? (
            <>
              <p className="fl-help" role="status">원래 사이트에서 찾은 일 {matches.length}개</p>
              <ul className="fl-tasks" role="list" aria-label="찾은 일">{matches.map(item)}</ul>
            </>
          ) : (
            <div className="fl-status" role="status">
              <span className="fl-tone" data-tone="warning">찾지 못했어요</span>
              <p>이 화면에서 확인된 일 중에는 맞는 것이 없어요. 원래 화면에서 계속해 주세요.</p>
              <button type="button" className="fl-btn fl-more" onClick={onOriginal}>원본에서 계속</button>
            </div>
          )}
        </section>
      )}
    </>
  );
}

export function FlectoApp({ model, onAction }: FlectoAppProps) {
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const onActionRef = useLatest(onAction);
  const composingRefs = useRef(new Set<string>());
  const armedAt = useRef(0);
  const prevPhase = useRef(model.phase);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [armTick, refreshArmedState] = useState(0);

  const emit = useCallback<Emit>((action) => onActionRef.current(action), [onActionRef]);
  const setComposing = useCallback((ref: string, composing: boolean) => {
    if (composing) composingRefs.current.add(ref); else composingRefs.current.delete(ref);
  }, []);
  const noticeByRef = useMemo(() => new Map(model.notices.map((n) => [n.ref, n])), [model.notices]);
  const ctx = useMemo<FieldContext>(() => ({
    emit, noticeByRef, setComposing,
    idFor: (ref, part) => 'fl' + uid + '-' + ref + (part ? '-' + part : ''),
  }), [emit, noticeByRef, setComposing, uid]);

  if (prevPhase.current !== model.phase) {
    if (prevPhase.current === 'PREPARING') armedAt.current = Date.now() + ARM_DELAY_MS;
    prevPhase.current = model.phase;
  }
  // Every button routed through primary() must also render disabled while unarmed. A button that
  // looks enabled but silently drops its click makes automation (and people) believe the step is
  // stuck; `actionsArmed` and the runtime guard below must always agree.
  const primary = (action: UserAction) => () => {
    if (Date.now() < armedAt.current) return;
    emit(action);
  };
  const actionsArmed = Date.now() >= armedAt.current;
  useEffect(() => {
    const remaining = armedAt.current - Date.now();
    if (remaining <= 0) return;
    // Re-render once the window closes; the effect re-runs on the tick so a timer that fires a
    // millisecond early simply schedules one more check instead of leaving buttons disabled.
    const timer = setTimeout(() => refreshArmedState((value) => value + 1), remaining);
    return () => clearTimeout(timer);
  }, [model.phase, armTick]);

  const view = resolveView(model);
  const step = model.steps[model.stepIndex] ?? null;
  const controls = stepControls(model, step);
  const notices = stepNotices(model, step, controls);
  const explain = model.settings.explanation;
  const errorsKey = controls.filter((c) => c.error).map((c) => c.ref).join('|');
  const viewKey = model.phase + ':' + model.stepIndex + ':' + (view.kind === 'template' ? view.template : view.kind);

  // Focus: on each screen/step change (and when new errors arrive) move to the first errored
  // control, otherwise to the screen heading. Never while an IME composition is active.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || composingRefs.current.size > 0) return;
    if (errorsKey) {
      const firstRef = errorsKey.split('|')[0];
      const target = Array.from(root.querySelectorAll<HTMLElement>('[data-flecto-ref]'))
        .filter((el) => el.getAttribute('data-flecto-ref') === firstRef && el.matches('input, textarea, select, button'))
        .find((el) => !(el instanceof HTMLInputElement && el.type === 'radio') || el.checked || !(el as HTMLInputElement).disabled);
      if (target) { target.focus(); return; }
    }
    headingRef.current?.focus();
  }, [viewKey, errorsKey]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root) return;
    if (e.key === 'Escape') {
      if (e.nativeEvent.isComposing || composingRefs.current.size > 0) return;
      e.preventDefault();
      e.nativeEvent.stopPropagation();
      emit({ kind: 'SHOW_ORIGINAL' });
      return;
    }
    if (e.key !== 'Tab') return;
    const items = focusables(root);
    if (items.length === 0) return;
    const active = activeIn(root);
    const index = active ? items.indexOf(active as HTMLElement) : -1;
    if (e.shiftKey && index <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
    else if (!e.shiftKey && (index === -1 || index === items.length - 1)) { e.preventDefault(); items[0].focus(); }
  };

  const bannerText = model.error && (model.phase === 'READY' || model.phase === 'REVIEW') ? ERROR_BANNER[model.error] ?? null : null;
  const showProgress = (model.phase === 'READY' || model.phase === 'REVIEW') && model.steps.length >= 2 && model.stepIndex >= 0 && model.stepIndex < model.steps.length;
  const loadingLine = model.elapsedMs >= 3000 ? LOADING.slow : LOADING.initial;
  const announcement = view.kind === 'loading' ? loadingLine
    : view.kind === 'status' ? view.copy.badge + '. ' + view.copy.title
    : (step?.title ?? model.title ?? '');

  let title = model.title;
  let intro: string | null = null;
  let body: ReactNode = null;
  let footer: ReactNode = null;

  if (view.kind === 'loading') {
    title = model.title && model.phase !== 'PREPARING' ? model.title : '쉬운 화면 준비 중';
    body = (
      <>
        <div className="fl-loading">
          <span className="fl-dots" aria-hidden="true"><span /><span /><span /></span>
          <div className="fl-status">
            <p>{loadingLine}</p>
            {model.statusMessage ? <p className="fl-help">{model.statusMessage}</p> : null}
          </div>
        </div>
        {model.sponsorVisible ? (
          <aside className="fl-sponsor" aria-label={SPONSOR_LABEL}>
            <div className="fl-sponsor-head">
              <span className="fl-sponsor-label">{SPONSOR_LABEL}</span>
              <button type="button" className="fl-btn fl-btn-small" onClick={() => emit({ kind: 'DISMISS_SPONSOR' })}>광고 닫기</button>
            </div>
            <p className="fl-sponsor-note">{SPONSOR_NOTE}</p>
            <p className="fl-sponsor-body">동네 복지관 가을 건강 강좌 안내 — 예시 문구입니다.</p>
            <p className="fl-help">광고를 닫아도 화면 준비는 계속돼요.</p>
          </aside>
        ) : null}
      </>
    );
    footer = (
      <>
        <button type="button" className="fl-btn" onClick={() => emit({ kind: 'CANCEL' })}>준비 멈추기</button>
        <span className="fl-spacer" />
      </>
    );
  } else if (view.kind === 'status') {
    const copy = view.copy;
    title = copy.title;
    const isResult = RESULT_PHASES.has(model.phase);
    const errored = model.controls.filter((c) => c.error);
    body = (
      <div className="fl-status">
        <span className="fl-tone" data-tone={copy.tone}>{copy.badge}</span>
        {model.phase === 'OUTCOME_UNKNOWN' ? (
          <p className="fl-banner"><span aria-hidden="true">⚠</span><span>쉬운 화면은 자동으로 다시 신청하지 않아요. 원래 사이트의 신청 내역에서 결과를 먼저 확인해 주세요.</span></p>
        ) : null}
        <p>{copy.body}</p>
        {isResult && model.resultText ? (
          <div>
            <p className="fl-section-title">원래 사이트의 안내</p>
            <p className="fl-quote">{model.resultText}</p>
          </div>
        ) : null}
        {isResult && explain === 'detailed' ? <p className="fl-intro">{TEMPLATE_INTRO.result.detailed}</p> : null}
        {model.phase === 'SOURCE_REJECTED' && errored.length > 0 ? (
          <ul className="fl-section" aria-label="고칠 부분">
            {errored.map((c) => <li key={c.ref}><strong>{c.label}</strong>: {c.error}</li>)}
          </ul>
        ) : null}
        {model.statusMessage && !isResult ? <p className="fl-help">{model.statusMessage}</p> : null}
      </div>
    );
    const toAction = (a: StatusAction): UserAction | null => {
      if (a.action === 'BACK') return step && model.canGoBack ? { kind: 'LOCAL_BACK', fromStep: step.id } : null;
      return { kind: a.action };
    };
    const actions = copy.actions.map((a) => [a, toAction(a)] as const).filter(([, act]) => act !== null);
    footer = actions.length ? (
      <>
        {actions.map(([a, act], i) => (
          <Fragment key={a.label}>
            {a.primary && i > 0 ? <span className="fl-spacer" /> : null}
            <button
              type="button"
              className={'fl-btn' + (a.primary ? ' fl-btn-primary' : '')}
              disabled={a.primary && !actionsArmed}
              onClick={a.primary ? primary(act!) : () => emit(act!)}
            >
              {a.label}
            </button>
          </Fragment>
        ))}
      </>
    ) : null;
  } else {
    const template = view.template;
    title = model.phase === 'IDLE' ? (model.title || TEMPLATE_TITLE.task_selection) : (step?.title || model.title || TEMPLATE_TITLE[template]);
    intro = TEMPLATE_INTRO[template][explain];
    const noticeNodes = notices.map((n) => <NoticeBlock key={n.ref} notice={n} />);
    const fieldNodes = controls.map((c) => <ControlField key={c.ref} control={c} ctx={ctx} />);
    const nextStep = model.steps[model.stepIndex + 1] ?? null;
    const back = step && model.canGoBack
      ? <button type="button" className="fl-btn" onClick={() => emit({ kind: 'LOCAL_BACK', fromStep: step.id })}>이전</button>
      : null;

    if (template === 'task_selection') {
      const inIdle = model.phase === 'IDLE';
      body = (
        <>
          {noticeNodes}
          {model.tasks.length > 0 ? (
            <TaskList
              tasks={model.tasks}
              idBase={'fl' + uid}
              onOriginal={() => emit({ kind: 'SHOW_ORIGINAL' })}
              onPick={(task) => emit(inIdle || task.kind !== 'navigate'
                ? { kind: 'START_GOAL', ref: task.ref }
                : { kind: 'INVOKE_SOURCE', ref: task.ref, intent: 'navigate' })}
            />
          ) : (
            <div className="fl-status">
              <span className="fl-tone" data-tone="warning">찾지 못했어요</span>
              <p>이 화면에서 도와드릴 일을 찾지 못했어요. 원래 화면에서 계속하실 수 있어요.</p>
              <button type="button" className="fl-btn fl-more" onClick={() => emit({ kind: 'SHOW_ORIGINAL' })}>원본에서 계속</button>
            </div>
          )}
          {!inIdle && fieldNodes.length ? <section className="fl-section">{fieldNodes}</section> : null}
        </>
      );
      footer = back ? <>{back}<span className="fl-spacer" /></> : null;
    } else if (template === 'final_review') {
      const submit = findSubmitTarget(model, step);
      const reviewReady = model.phase === 'REVIEW';
      body = (
        <>
          {noticeNodes}
          <section className="fl-section" aria-labelledby={'fl' + uid + '-review'}>
            <h2 className="fl-section-title" id={'fl' + uid + '-review'}>원래 사이트에 들어간 내용</h2>
            {model.reviewRows.length > 0 ? (
              <dl className="fl-review">
                {model.reviewRows.map((row) => (
                  <div className="fl-review-row" key={row.ref}>
                    <dt className="fl-review-label">
                      <span>{row.label}</span>
                      {step && model.canGoBack && reviewReady ? (
                        <button
                          type="button"
                          className="fl-btn fl-btn-small"
                          aria-label={row.label + ' 수정'}
                          onClick={() => emit({ kind: 'LOCAL_BACK', fromStep: step.id })}
                        >
                          수정
                        </button>
                      ) : null}
                    </dt>
                    <dd>{row.value ? row.value : <span className="fl-review-empty">입력하지 않음</span>}</dd>
                  </div>
                ))}
              </dl>
            ) : <p className="fl-help">원래 사이트의 실제 값을 확인하고 있어요.</p>}
          </section>
          {!submit ? <p className="fl-banner">원래 사이트의 신청 버튼을 찾지 못했어요. 원래 화면에서 신청해 주세요.</p> : null}
          {submit && reviewReady ? <p className="fl-help">아래 “{submit.label}” 버튼을 누르면 원래 사이트로 신청이 전송돼요.</p> : null}
        </>
      );
      footer = (
        <>
          {back ?? <span />}
          <span className="fl-spacer" />
          {reviewReady && submit ? (
            <button
              type="button"
              className="fl-btn fl-btn-primary"
              disabled={!model.canSubmit || submit.disabled || !actionsArmed}
              data-flecto-ref={submit.ref}
              onClick={primary({ kind: 'INVOKE_SOURCE', ref: submit.ref, intent: 'submit' })}
            >
              {submit.label}
            </button>
          ) : step ? (
            <button type="button" className="fl-btn fl-btn-primary" disabled={!model.canGoNext || !actionsArmed} onClick={primary({ kind: 'LOCAL_NEXT', fromStep: step.id })}>
              실제 값 확인하기
            </button>
          ) : null}
        </>
      );
    } else if (template === 'result') {
      body = (
        <div className="fl-status">
          {noticeNodes}
          {model.resultText ? <p className="fl-quote">{model.resultText}</p> : <p>원래 사이트의 결과를 기다리고 있어요.</p>}
        </div>
      );
      footer = (
        <>
          <button type="button" className="fl-btn" onClick={() => emit({ kind: 'SHOW_ORIGINAL' })}>원래 화면에서 내역 보기</button>
          <span className="fl-spacer" />
          <button type="button" className="fl-btn fl-btn-primary" disabled={!actionsArmed} onClick={primary({ kind: 'CLOSE' })}>쉬운 화면 닫기</button>
        </>
      );
    } else {
      body = (
        <>
          {noticeNodes.length ? <div className="fl-status">{noticeNodes}</div> : null}
          {fieldNodes.length ? <section className="fl-section">{fieldNodes}</section> : <p className="fl-help">이 단계에서 입력할 항목이 없어요.</p>}
        </>
      );
      const nextLabel = nextStep?.template === 'final_review' ? '입력 내용 확인하기' : '다음';
      footer = (
        <>
          {back ?? <span />}
          <span className="fl-spacer" />
          {step ? (
            <button type="button" className="fl-btn fl-btn-primary" disabled={!model.canGoNext || !actionsArmed} onClick={primary({ kind: 'LOCAL_NEXT', fromStep: step.id })}>
              {nextLabel}
            </button>
          ) : null}
        </>
      );
    }
  }

  const s = model.settings;
  return (
    <div
      ref={rootRef}
      className="fl-root"
      role="dialog"
      aria-modal="true"
      aria-label={DIALOG_NAME}
      data-font={s.fontSize}
      data-contrast={s.contrast}
      data-motion={s.reducedMotion ? 'reduce' : 'normal'}
      data-phase={model.phase}
      lang="ko"
      onKeyDown={onKeyDown}
    >
      <header className="fl-header">
        <div className="fl-header-in">
          <div className="fl-brand">
            <BrandMark />
            <div className="fl-brand-text">
              <span className="fl-brand-name">FLECTO</span>
              <span className="fl-brand-title">쉬운 화면</span>
              <span className="fl-source">원래 사이트: <strong>{model.sourceName}</strong></span>
            </div>
          </div>
          <div className="fl-header-actions">
            <button type="button" className="fl-btn fl-btn-small" aria-expanded={settingsOpen} aria-controls={'fl' + uid + 'settings'} onClick={() => setSettingsOpen((v) => !v)}>
              글자·화면 설정
            </button>
            <button type="button" className="fl-btn fl-btn-small" onClick={() => emit({ kind: 'SHOW_ORIGINAL' })}>원래 화면 보기</button>
            <button type="button" className="fl-btn fl-btn-small" onClick={() => emit({ kind: 'CLOSE' })}>닫기</button>
          </div>
        </div>
      </header>
      <main className="fl-main">
        {settingsOpen ? <Settings settings={s} emit={emit} idBase={'fl' + uid} /> : null}
        <div className="fl-head">
          {showProgress ? <p className="fl-progress">전체 {model.steps.length}단계 중 {model.stepIndex + 1}단계</p> : null}
          <h1 className="fl-title" ref={headingRef} tabIndex={-1}>{title}</h1>
          {intro ? <p className="fl-intro">{intro}</p> : null}
        </div>
        {bannerText ? <p className="fl-banner" data-tone="danger"><span aria-hidden="true">⚠</span><span>{bannerText}</span></p> : null}
        {body}
        <details className="fl-tech">
          <summary>시연 정보</summary>
          <dl>
            <dt>계획 방식</dt><dd>{model.mode ? MODE_LABEL[model.mode] : '아직 없음'}</dd>
            <dt>화면 상태</dt><dd>{model.phase}</dd>
            <dt>경과 시간</dt><dd>{(model.elapsedMs / 1000).toFixed(1)}초</dd>
            {model.error ? <><dt>오류 코드</dt><dd>{model.error}</dd></> : null}
          </dl>
        </details>
      </main>
      {footer ? <footer className="fl-footer"><div className="fl-footer-in">{footer}</div></footer> : null}
      <div className="fl-sr" role="status" aria-live="polite">{announcement}</div>
    </div>
  );
}
