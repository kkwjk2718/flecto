import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FlectoApp } from '@flecto/templates';
import { FLECTO_CSS } from '@flecto/design-tokens';
import {
  DEFAULT_SETTINGS, FlectoError, PREPARE_DEADLINE_MS, SPONSOR_AFTER_MS,
  emptyViewModel, PlannerResponseSchema, UserSettingsSchema,
  type BackgroundReply, type ErrorCode, type FlectoViewModel,
  type PagePlan, type PrivateBindingRegistry, type PublicPageSnapshot,
  type ReviewToken, type UserAction, type ViewControl,
} from '@flecto/contracts';
import { applyUserInput, createReviewToken, extractPage, invokeSource, readControlValue, refreshRegistry, structuralFingerprint, verifyPlan } from '@flecto/core';

const messages: Record<ErrorCode, string> = {
  AUTH_REQUIRED: '원래 화면에서 먼저 로그인해 주세요. 로그인 정보는 FLECTO가 읽지 않아요.',
  UNSUPPORTED_CONTROL: '이 화면은 원래 화면에서 이용해 주세요. 입력한 내용은 원래 사이트에 남아 있어요.',
  REQUIRED_MISSING: '필수 항목을 확인해 주세요.',
  AMBIGUOUS_TARGET: '같은 이름의 항목을 정확히 구분하지 못했어요. 원래 화면에서 확인해 주세요.',
  STALE_DOCUMENT: '원래 화면의 정보가 바뀌었어요. 최신 내용을 다시 확인해 주세요.',
  SCHEMA_INVALID: '화면 연결을 확인하지 못했어요. 원래 화면에서 계속할 수 있어요.',
  BUSY: '다른 화면을 준비하고 있어요. 잠시 뒤 다시 시도해 주세요.',
  DEADLINE_EXCEEDED: '지금은 화면을 준비하지 못했어요. 원래 화면에서 계속하거나 다시 시도할 수 있어요.',
  PROVIDER_ERROR: '화면 도우미에 연결하지 못했어요. 연결 설정을 확인하거나 원래 화면에서 계속해 주세요.',
  SOURCE_REJECTED: '원래 사이트에서 입력 내용을 확인해 달라고 해요.',
  OUTCOME_UNKNOWN: '접수 결과를 확인하지 못했어요. 다시 신청하지 말고 원래 화면에서 결과를 확인해 주세요.',
  CANCELLED: '화면 준비를 멈췄어요. 원래 화면에서 계속할 수 있어요.',
  VISUAL_RELATION_AMBIGUOUS: '화면의 항목 관계를 정확히 확인하지 못했어요. 원래 화면에서 계속해 주세요.',
};
const nonce = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const waitFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const inputKinds = new Set(['text', 'email', 'tel', 'date', 'number', 'textarea', 'select', 'radio', 'checkbox']);

export class FlectoController {
  private documentInstanceId = nonce('doc');
  private model = emptyViewModel();
  private registry: PrivateBindingRegistry | null = null;
  private snapshot: PublicPageSnapshot | null = null;
  private plan: PagePlan | null = null;
  private root: Root | null = null;
  private host: HTMLDivElement | null = null;
  private priorFocus: HTMLElement | null = null;
  private observer: MutationObserver | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;
  private mutationTimer: ReturnType<typeof setTimeout> | null = null;
  private deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  private prepareStart = 0;
  private epoch = 0;
  private structuralKey = '';
  private review: ReviewToken | null = null;
  private composing = new Set<string>();
  private drafts = new Map<string, string>();
  private lastValues = new Map<string, string | boolean>();
  private originalEventsSuppressed = false;
  private actionQueue: Promise<void> = Promise.resolve();
  private sponsorDismissed = false;
  private pendingSubmit = false;
  private submitStart = 0;
  private checkingStructure = false;
  private lastUrl = location.href;
  private localSourceReview = false;
  private sourceReviewRows: FlectoViewModel['reviewRows'] = [];

  constructor(private readonly doc: Document = document) {}

  private async send(message: unknown): Promise<BackgroundReply & { session?: { active: boolean; pendingSubmit: boolean } }> {
    try { return await chrome.runtime.sendMessage(message); }
    catch { return { ok: false, error: 'PROVIDER_ERROR' }; }
  }
  private render(): void {
    if (!this.root) return;
    this.root.render(React.createElement(FlectoApp, { model: this.model, onAction: this.enqueue }));
  }
  private patch(patch: Partial<FlectoViewModel>): void { this.model = { ...this.model, ...patch }; this.render(); }
  private enqueue = (action: UserAction): void => {
    // Cancellation/settings must remain responsive while prepare awaits the model.
    // Serialize source writes/submission, not the entire preparation request.
    if (['START_GOAL', 'CANCEL', 'CLOSE', 'SHOW_ORIGINAL', 'RETRY', 'DISMISS_SPONSOR', 'UPDATE_SETTINGS'].includes(action.kind)) {
      void this.handle(action).catch((error: unknown) => this.fail(error instanceof FlectoError ? error.code : 'SOURCE_REJECTED'));
      return;
    }
    this.actionQueue = this.actionQueue.then(() => this.handle(action)).catch((error: unknown) => {
      this.fail(error instanceof FlectoError ? error.code : 'SOURCE_REJECTED');
    });
  };

  async activate(restoredPending = false): Promise<void> {
    if (this.host) { this.host.style.display = 'block'; return; }
    this.priorFocus = this.doc.activeElement instanceof HTMLElement ? this.doc.activeElement : null;
    const host = this.doc.createElement('div'); host.id = 'flecto-host';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:block;isolation:isolate;';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = this.doc.createElement('style'); style.textContent = FLECTO_CSS;
    const mount = this.doc.createElement('div'); mount.id = 'flecto-root';
    shadow.append(style, mount); this.doc.documentElement.append(host);
    this.host = host; this.root = createRoot(mount);
    this.model = { ...emptyViewModel(), sourceName: this.doc.title.trim().slice(0, 100) || location.hostname };
    const [settings, session] = await Promise.all([
      this.send({ type: 'FLECTO_SETTINGS_GET' }), this.send({ type: 'FLECTO_SESSION_GET' }),
    ]);
    this.model.settings = settings.ok && 'settings' in settings ? settings.settings : { ...DEFAULT_SETTINGS };
    this.pendingSubmit = restoredPending || !!session.session?.pendingSubmit;
    this.refreshExtraction();
    this.setupObservation();
    if (this.probeOutcome()) return;
    if (await this.trySourceReview()) { await this.sendState(); return; }
    if (this.pendingSubmit) {
      const sourceError = this.sourceError();
      if (sourceError) { this.pendingSubmit = false; this.fail('SOURCE_REJECTED'); this.patch({ statusMessage: sourceError }); }
      else if (this.hasSourceForm()) {
        this.pendingSubmit = false; this.showTasks();
        this.patch({ statusMessage: '원래 사이트의 다음 화면이에요. 계속할 작업을 선택해 주세요.' });
      } else this.fail('OUTCOME_UNKNOWN');
    } else if (this.model.phase === 'IDLE') this.showTasks();
    await this.sendState();
    this.render();
  }

  private refreshExtraction(goalRef: string | null = null): void {
    const oldTarget = goalRef ? this.registry?.bindings.get(goalRef)?.element : null;
    const extraction = extractPage(this.doc, { documentInstanceId: this.documentInstanceId, requestId: nonce('req'), goal: 'complete_form' });
    this.snapshot = extraction.snapshot; this.registry = extraction.registry;
    if (oldTarget) this.snapshot.goalRef = [...this.registry.bindings.values()].find((binding) => binding.element === oldTarget)?.ref ?? null;
    if (extraction.blocked) { this.fail(extraction.blocked); return; }
    this.captureValues();
  }

  private showTasks(): void {
    if (!this.snapshot) return;
    const controls = this.snapshot.controls.filter((control) => ['submit', 'navigate'].includes(control.actionKind) && !control.disabled);
    controls.sort((a, b) => Number(!!this.registry?.bindings.get(b.ref)?.element.closest('main')) - Number(!!this.registry?.bindings.get(a.ref)?.element.closest('main')));
    const tasks = controls
      .map((control) => ({ ref: control.ref, label: control.label, kind: control.actionKind as 'submit' | 'navigate', disabled: control.disabled }));
    this.patch({ phase: tasks.length ? 'IDLE' : 'UNSUPPORTED', title: '무엇을 하시겠어요?', tasks,
      statusMessage: tasks.length ? '원하시는 일을 선택해 주세요.' : messages.UNSUPPORTED_CONTROL,
      controls: this.viewControls(), notices: [], error: tasks.length ? null : 'UNSUPPORTED_CONTROL',
      canGoBack: false, canGoNext: false, canSubmit: false });
  }

  private selectedOptionRef(control: ViewControl | PublicPageSnapshot['controls'][number]): string {
    if (!this.registry) return '';
    for (const option of control.options) {
      const element = this.registry.options.get(option.ref);
      if (control.required && element instanceof HTMLOptionElement && element.value === '') continue;
      if (element instanceof HTMLOptionElement && element.selected || element instanceof HTMLInputElement && element.checked) return option.ref;
    }
    return '';
  }
  private viewControls(): ViewControl[] {
    if (!this.snapshot || !this.registry) return [];
    const action = this.plan?.sourceActionRef ? this.snapshot.controls.find((item) => item.ref === this.plan!.sourceActionRef) : null;
    const controls = action ? this.snapshot.controls.filter((control) => control.formRef === action.formRef && (control.actionKind === 'none' || control.ref === action.ref)) : this.snapshot.controls;
    return controls.map((control) => {
      const binding = this.registry!.bindings.get(control.ref);
      let value: string | boolean = '';
      if (binding) {
        if (control.kind === 'select' || control.kind === 'radio') value = this.selectedOptionRef(control);
        else if (this.drafts.has(control.ref)) value = this.drafts.get(control.ref)!;
        else value = readControlValue(binding, this.registry!);
      }
      const options = control.kind === 'select' && control.required ? control.options.filter((option) => (this.registry!.options.get(option.ref) as HTMLOptionElement | undefined)?.value !== '') : control.options;
      return { ...control, options, value, composing: this.composing.has(control.ref),
        error: this.model.controls.find((item) => item.ref === control.ref)?.error ?? null,
        description: null };
    });
  }
  private viewNotices(): FlectoViewModel['notices'] {
    if (!this.snapshot || !this.registry) return [];
    // The model/cache receive sanitized public text. The person sees the source
    // notice itself locally, including any private details it legitimately contains.
    return this.snapshot.notices.map((notice) => {
      const element = this.registry!.notices.get(notice.ref);
      return { ...notice, text: element?.innerText?.trim() || element?.textContent?.trim() || notice.text };
    });
  }
  private captureValues(): void {
    if (!this.registry) return;
    for (const binding of this.registry.bindings.values()) {
      if (inputKinds.has(binding.kind)) this.lastValues.set(binding.ref, readControlValue(binding, this.registry));
    }
  }

  private async prepare(goalRef: string | null): Promise<void> {
    if (this.pendingSubmit || this.model.phase === 'SUBMITTING') return;
    this.cancelPrepare(false);
    this.refreshExtraction(goalRef);
    if (!this.snapshot || !this.registry || ['AUTH_REQUIRED', 'UNSUPPORTED'].includes(this.model.phase)) return;
    if (goalRef && !this.snapshot.goalRef) { this.fail('STALE_DOCUMENT'); return; }
    const requestId = this.snapshot.requestId;
    const snapshot = this.snapshot;
    const requestEpoch = ++this.epoch;
    this.plan = null; this.review = null; this.localSourceReview = false; this.sourceReviewRows = []; this.sponsorDismissed = false;
    this.prepareStart = performance.now();
    this.patch({ phase: 'PREPARING', title: '쉬운 화면을 준비하고 있어요',
      statusMessage: '사용하기 쉬운 화면을 준비하고 있어요.', steps: [], stepIndex: 0,
      elapsedMs: 0, sponsorVisible: false, error: null, canGoNext: false, canSubmit: false, canGoBack: false });
    this.deadlineTimer = setTimeout(() => {
      if (this.model.phase === 'PREPARING' && this.epoch === requestEpoch) this.cancelPrepare(true);
    }, PREPARE_DEADLINE_MS);
    const key = await structuralFingerprint(snapshot);
    const elapsed = performance.now() - this.prepareStart;
    if (this.epoch !== requestEpoch || this.model.phase !== 'PREPARING' || elapsed >= PREPARE_DEADLINE_MS) return;
    const response = await this.send({ type: 'FLECTO_PREPARE', payload: {
      snapshot, remainingBudgetMs: Math.max(1, Math.floor(PREPARE_DEADLINE_MS - elapsed)), sessionEpoch: requestEpoch,
    } });
    if (this.epoch !== requestEpoch || this.model.phase !== 'PREPARING' || this.doc.visibilityState === 'hidden') return;
    if (performance.now() - this.prepareStart >= PREPARE_DEADLINE_MS) { this.cancelPrepare(true); return; }
    if (!response.ok || !('result' in response)) { this.fail(response.ok ? 'SCHEMA_INVALID' : response.error); return; }
    const parsed = PlannerResponseSchema.safeParse(response.result);
    if (!parsed.success || parsed.data.requestId !== requestId || parsed.data.snapshotId !== snapshot.snapshotId) { this.fail('STALE_DOCUMENT'); return; }
    const current = this.currentExtraction();
    // Check current visible structure before binding any model references.
    if (current.blocked || await structuralFingerprint(current.snapshot) !== key) { this.fail(current.blocked ?? 'STALE_DOCUMENT'); return; }
    try { this.plan = verifyPlan(parsed.data.plan, snapshot, this.registry); }
    catch (error) { this.fail(error instanceof FlectoError ? error.code : 'SCHEMA_INVALID'); return; }
    if (this.epoch !== requestEpoch || this.model.phase !== 'PREPARING') return;
    if (performance.now() - this.prepareStart >= PREPARE_DEADLINE_MS) { this.cancelPrepare(true); return; }
    this.clearDeadline();
    this.structuralKey = key;
    this.model = { ...this.model, mode: parsed.data.mode, steps: this.plan.steps, stepIndex: 0, controls: this.viewControls(),
      notices: this.viewNotices(), sponsorVisible: false, elapsedMs: performance.now() - this.prepareStart, tasks: this.model.tasks };
    this.selectStep(0);
    if (parsed.data.blueprintId) void this.send({ type: 'FLECTO_VERIFY', requestId, snapshotId: snapshot.snapshotId, blueprintId: parsed.data.blueprintId });
  }

  private clearDeadline(): void { if (this.deadlineTimer) clearTimeout(this.deadlineTimer); this.deadlineTimer = null; }
  private cancelPrepare(timedOut: boolean): void {
    if (this.model.phase === 'PREPARING' && this.snapshot) {
      this.epoch += 1;
      void this.send({ type: 'FLECTO_CANCEL', requestId: this.snapshot.requestId, documentInstanceId: this.documentInstanceId });
      this.clearDeadline(); this.fail(timedOut ? 'DEADLINE_EXCEEDED' : 'CANCELLED');
    }
  }
  private fail(code: ErrorCode): void {
    this.clearDeadline();
    this.review = null;
    const phase = code === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : code === 'DEADLINE_EXCEEDED' ? 'TIMED_OUT' :
      code === 'CANCELLED' ? 'CANCELLED' : code === 'SOURCE_REJECTED' ? 'SOURCE_REJECTED' :
        code === 'OUTCOME_UNKNOWN' ? 'OUTCOME_UNKNOWN' : code === 'STALE_DOCUMENT' ? 'STALE_DOCUMENT' : 'UNSUPPORTED';
    this.patch({ phase, error: code, statusMessage: messages[code], sponsorVisible: false,
      canSubmit: false, canGoNext: false, canGoBack: !!this.plan });
  }

  private validateStep(index: number): boolean {
    const step = this.plan?.steps[index]; if (!step || !this.registry) return false;
    const refs = step.template === 'final_review' ? this.plan!.steps.flatMap((item) => item.controlRefs) : step.controlRefs;
    let valid = true;
    const errors = new Map<string, string>();
    for (const ref of refs) {
      const binding = this.registry.bindings.get(ref);
      if (!binding || !binding.element.isConnected) { this.fail('STALE_DOCUMENT'); return false; }
      const element = binding.element;
      if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
        if (!element.disabled && !element.checkValidity()) { valid = false; errors.set(ref, element.validationMessage || '이 항목을 확인해 주세요.'); }
        if (element instanceof HTMLSelectElement && [...element.selectedOptions].some((option) => option.disabled || !!option.closest('optgroup[disabled]'))) {
          valid = false; errors.set(ref, '지금 선택할 수 없는 항목이에요. 다른 항목을 골라 주세요.');
        }
        if (binding.kind === 'radio') {
          const control = this.snapshot?.controls.find((item) => item.ref === ref);
          const selected = control?.options.find((option) => (this.registry!.options.get(option.ref) as HTMLInputElement | undefined)?.checked);
          if (selected?.disabled) { valid = false; errors.set(ref, '지금 선택할 수 없는 항목이에요. 다른 항목을 골라 주세요.'); }
        }
      }
    }
    this.patch({ controls: this.viewControls().map((control) => ({ ...control, error: errors.get(control.ref) ?? null })),
      statusMessage: valid ? '' : '필수 항목과 입력 형식을 확인해 주세요.' });
    return valid;
  }

  private selectStep(index: number): void {
    if (!this.plan || !this.registry) return;
    const step = this.plan.steps[Math.max(0, Math.min(index, this.plan.steps.length - 1))];
    index = this.plan.steps.indexOf(step);
    const reviewing = step.template === 'final_review';
    this.review = reviewing && this.plan.sourceActionRef ? createReviewToken(this.plan.sourceActionRef, this.registry) : null;
    const controls = this.viewControls();
    const rows = controls.filter((control) => inputKinds.has(control.kind) &&
      this.plan!.steps.some((item) => item.controlRefs.includes(control.ref))).map((control) => ({
        ref: control.ref, label: control.label,
        value: typeof control.value === 'boolean' ? control.value ? '동의함' : '동의하지 않음' :
          control.options.find((option) => option.ref === control.value)?.label ?? String(control.value || '입력하지 않음'),
      }));
    this.patch({ phase: reviewing ? 'REVIEW' : 'READY', title: step.title, statusMessage: '', stepIndex: index,
      controls, reviewRows: this.localSourceReview ? this.sourceReviewRows : rows, reviewEditMode: this.localSourceReview ? 'source' : 'local',
      canGoBack: index > 0 || this.localSourceReview, canGoNext: !reviewing, canSubmit: reviewing && !!this.review,
      sponsorVisible: false, error: null });
  }

  private async handle(action: UserAction): Promise<void> {
    if (!this.host) return;
    switch (action.kind) {
      case 'START_GOAL': {
        if (this.model.phase === 'PREPARING' && action.ref === this.snapshot?.goalRef) return;
        const binding = action.ref ? this.registry?.bindings.get(action.ref) : null;
        const control = this.snapshot?.controls.find((item) => item.ref === action.ref);
        if (binding && control?.actionKind === 'navigate') {
          if (!this.registry) return;
          const receipt = await invokeSource(binding.ref, this.registry, 'navigate');
          if (receipt.status === 'REJECTED') this.fail(receipt.error ?? 'UNSUPPORTED_CONTROL');
        } else await this.prepare(action.ref);
        return;
      }
      case 'SET_COMPOSING': {
        if (action.composing) this.composing.add(action.ref); else this.composing.delete(action.ref);
        this.model.controls = this.viewControls(); this.render();
        if (!action.composing && this.drafts.has(action.ref)) await this.writeInput({ kind: 'SET_TEXT', ref: action.ref, value: this.drafts.get(action.ref)! });
        return;
      }
      case 'SET_TEXT':
        this.drafts.set(action.ref, action.value);
        if (this.composing.has(action.ref)) { this.patch({ controls: this.viewControls() }); return; }
        await this.writeInput(action); return;
      case 'SET_CHOICE': case 'SET_CONSENT_FROM_USER': await this.writeInput(action); return;
      case 'LOCAL_NEXT': {
        if (this.model.phase !== 'READY' || this.composing.size || !this.plan) return;
        if (action.fromStep !== this.plan.steps[this.model.stepIndex]?.id) return;
        if (!this.validateStep(this.model.stepIndex)) return;
        this.selectStep(this.model.stepIndex + 1); return;
      }
      case 'LOCAL_BACK': {
        if (this.model.phase === 'SUBMITTING' || this.composing.size || !this.plan) return;
        if (this.localSourceReview && this.registry && this.snapshot) {
          const edit = this.snapshot.controls.find((control) => control.actionKind === 'navigate' && /수정|이전/.test(control.label) && this.registry!.bindings.get(control.ref)?.element.closest('main'));
          if (edit) await invokeSource(edit.ref, this.registry, 'navigate'); else await this.close();
          return;
        }
        if (action.targetRef) {
          const target = this.plan.steps.findIndex((step) => step.controlRefs.includes(action.targetRef!));
          if (target >= 0) { this.selectStep(target); return; }
        }
        this.selectStep(this.model.stepIndex - 1); return;
      }
      case 'INVOKE_SOURCE': {
        if (action.intent === 'navigate' && this.registry) { await invokeSource(action.ref, this.registry, 'navigate'); return; }
        if (this.model.phase !== 'REVIEW' || !this.registry || !this.plan || !this.review || this.composing.size || this.pendingSubmit) return;
        if (action.ref !== this.plan.sourceActionRef) { this.fail('STALE_DOCUMENT'); return; }
        if (!this.validateStep(this.model.stepIndex)) return;
        const current = this.currentExtraction();
        if (current.blocked || await structuralFingerprint(current.snapshot) !== this.structuralKey) { this.fail(current.blocked ?? 'STALE_DOCUMENT'); return; }
        verifyPlan(this.plan, this.snapshot!, this.registry);
        this.pendingSubmit = true; this.submitStart = performance.now();
        this.patch({ phase: 'SUBMITTING', canSubmit: false, canGoNext: false, canGoBack: false,
          statusMessage: '원래 사이트에서 신청을 처리하고 있어요. 다시 누르지 않아도 돼요.' });
        const acknowledged = await this.sendState();
        if (!acknowledged.ok) { this.pendingSubmit = false; this.fail(acknowledged.error); return; }
        const result = await invokeSource(action.ref, this.registry, 'submit', this.review);
        if (result.status === 'REJECTED') { this.pendingSubmit = false; await this.sendState(); this.fail(result.error ?? 'SOURCE_REJECTED'); }
        else { await waitFrame(); this.probeOutcome(); }
        return;
      }
      case 'CANCEL': this.cancelPrepare(false); return;
      case 'RETRY': {
        if (this.pendingSubmit || this.model.phase === 'OUTCOME_UNKNOWN') return;
        this.cancelPrepare(false); this.plan = null;
        this.refreshExtraction(); if (this.model.phase !== 'AUTH_REQUIRED') this.showTasks(); return;
      }
      case 'DISMISS_SPONSOR': this.sponsorDismissed = true; this.patch({ sponsorVisible: false }); return;
      case 'UPDATE_SETTINGS': {
        const parsed = UserSettingsSchema.safeParse(action.settings); if (!parsed.success) return;
        this.patch({ settings: parsed.data }); await this.send({ type: 'FLECTO_SETTINGS_SET', settings: parsed.data }); return;
      }
      case 'SHOW_ORIGINAL': case 'CLOSE': await this.close(); return;
    }
  }

  private async writeInput(action: Extract<UserAction, { kind: 'SET_TEXT' | 'SET_CHOICE' | 'SET_CONSENT_FROM_USER' }>): Promise<void> {
    if (!this.registry || !['READY', 'REVIEW', 'SOURCE_REJECTED'].includes(this.model.phase)) return;
    this.originalEventsSuppressed = true;
    try {
      const receipt = await applyUserInput(action, this.registry);
      if (receipt.status === 'REJECTED') { this.fail(receipt.error ?? 'SOURCE_REJECTED'); return; }
      this.drafts.delete(action.ref); this.review = null; this.captureValues();
      const controls = this.viewControls().map((control) => control.ref === action.ref ? { ...control, error: null } : control);
      this.patch({ controls, canSubmit: false, statusMessage: '' });
      if (this.model.phase === 'REVIEW') this.selectStep(Math.max(0, this.model.stepIndex - 1));
    } finally { this.originalEventsSuppressed = false; }
  }

  private sourceError(): string | null {
    const alerts = [...this.doc.querySelectorAll<HTMLElement>('[role="alert"], .field-error, .form-error')]
      .filter((element) => !element.closest('#flecto-host') && element.getClientRects().length > 0);
    const text = alerts.map((element) => element.textContent?.trim()).filter(Boolean).join('\n');
    return text ? text.slice(0, 1500) : null;
  }
  private hasSourceForm(): boolean {
    return !!this.snapshot?.controls.some((control) => control.actionKind === 'submit' &&
      this.registry?.bindings.get(control.ref)?.element.closest('main'));
  }
  /** A source-rendered confirmation is local private data; it needs no AI transport. */
  private async trySourceReview(): Promise<boolean> {
    if (!this.snapshot || !this.registry || this.model.phase === 'AUTH_REQUIRED') return false;
    const definitions = [...this.doc.querySelectorAll<HTMLElement>('main dl dt')].map((term, index) => ({
      ref: `source_review_${index}`, label: term.textContent?.trim() ?? '',
      value: term.nextElementSibling?.tagName === 'DD' ? term.nextElementSibling.textContent?.trim() ?? '' : '',
    })).filter((row) => row.label && row.value);
    if (!definitions.length) return false;
    const actions = this.snapshot.controls.filter((control) => control.actionKind === 'submit' && !control.disabled &&
      this.registry!.bindings.get(control.ref)?.element.closest('main') &&
      !this.snapshot!.controls.some((field) => field.formRef === control.formRef && field.actionKind === 'none' && !field.disabled));
    const nearDefinitions = actions.filter((action) => {
      const form = this.registry!.bindings.get(action.ref)?.form;
      return !!(form?.querySelector('dl') || form?.closest('section')?.querySelector('dl'));
    });
    const chosen = nearDefinitions.length === 1 ? nearDefinitions[0] : actions.length === 1 ? actions[0] : null;
    if (!chosen) return false;
    this.snapshot.goalRef = chosen.ref;
    const plan: PagePlan = { schemaVersion: 1, snapshotId: this.snapshot.snapshotId, sourceActionRef: chosen.ref,
      steps: [{ id: 'source_review', template: 'final_review', title: '원래 사이트의 신청 내용을 확인해 주세요', controlRefs: [],
        noticeRefs: this.snapshot.notices.filter((notice) => notice.formRef === null || notice.formRef === chosen.formRef).map((notice) => notice.ref) }] };
    try {
      verifyPlan(plan, this.snapshot, this.registry);
      this.structuralKey = await structuralFingerprint(this.snapshot);
    } catch { return false; }
    this.plan = plan; this.pendingSubmit = false; this.localSourceReview = true; this.sourceReviewRows = definitions;
    this.model.steps = plan.steps; this.model.notices = this.viewNotices(); this.selectStep(0);
    this.patch({ statusMessage: '아직 접수되지 않았어요. 원래 사이트가 표시한 내용을 확인한 뒤 직접 제출해 주세요.' });
    return true;
  }
  private probeOutcome(): boolean {
    const receipt = [...this.doc.querySelectorAll<HTMLOutputElement>('output[aria-label]')]
      .find((element) => /접수|예약|신청/.test(element.getAttribute('aria-label') ?? '') && !!element.textContent?.trim() && element.getClientRects().length > 0);
    const status = [...this.doc.querySelectorAll<HTMLElement>('[role="status"]')]
      .find((element) => !element.closest('#flecto-host') && element.getClientRects().length > 0 && /접수|예약|신청/.test(element.textContent ?? ''));
    if (receipt && status) {
      this.pendingSubmit = false; this.review = null;
      const rows = [...status.querySelectorAll<HTMLElement>('dl dt')].map((term, index) => ({
        ref: `result_${index}`, label: term.innerText.trim(), value: term.nextElementSibling?.textContent?.trim() ?? '',
      })).filter((row) => row.label && row.value);
      const heading = status.querySelector('h1,h2,h3')?.textContent?.trim() || '원래 사이트에서 접수 정보를 확인했어요.';
      this.patch({ phase: 'SUCCESS', title: '원래 사이트의 접수 결과예요', resultText: `${heading}\n접수 번호: ${receipt.textContent?.trim().slice(0, 120)}`, reviewRows: rows,
        statusMessage: '원래 사이트에서 접수 정보를 확인했어요.', canSubmit: false, canGoNext: false, canGoBack: false, sponsorVisible: false, error: null });
      void this.sendState(); return true;
    }
    if (this.pendingSubmit) {
      const error = this.sourceError();
      if (error) {
        this.pendingSubmit = false; this.fail('SOURCE_REJECTED'); this.patch({ statusMessage: error }); void this.sendState(); return true;
      }
    }
    return false;
  }

  private sourceEvent = (event: Event): void => {
    if (this.originalEventsSuppressed || !this.registry || event.target === this.host) return;
    if (![...this.registry.bindings.values()].some((binding) => binding.element === event.target)) return;
    this.pollValues();
  };
  private pollValues(): void {
    if (!this.registry || !this.plan || this.originalEventsSuppressed || this.pendingSubmit) return;
    let changed = false;
    for (const binding of this.registry.bindings.values()) {
      if (!inputKinds.has(binding.kind) || !binding.element.isConnected || this.composing.has(binding.ref) || this.drafts.has(binding.ref)) continue;
      const value = readControlValue(binding, this.registry);
      if (this.lastValues.has(binding.ref) && value !== this.lastValues.get(binding.ref)) changed = true;
    }
    if (changed) {
      refreshRegistry(this.registry); this.review = null; this.captureValues();
      this.patch({ phase: 'CONFLICT', controls: this.viewControls(), canSubmit: false, canGoNext: false,
        statusMessage: '원래 화면의 정보가 바뀌었어요. 원래 화면에서 확인하거나 다시 준비해 주세요.' });
    }
  }
  private async checkStructure(): Promise<void> {
    if (this.checkingStructure || !this.host || this.composing.size || this.originalEventsSuppressed) return;
    this.checkingStructure = true;
    try {
      if (this.probeOutcome()) return;
      if (this.pendingSubmit) return;
      if (!this.plan) {
        if (this.model.phase !== 'PREPARING' && !['TIMED_OUT', 'CANCELLED', 'SOURCE_REJECTED', 'OUTCOME_UNKNOWN'].includes(this.model.phase)) {
          this.refreshExtraction();
          if (this.model.phase !== 'AUTH_REQUIRED') { this.showTasks(); await this.trySourceReview(); }
        }
        return;
      }
      if (!this.registry || !this.snapshot) return;
      const current = this.currentExtraction();
      if (current.blocked) { this.cancelPrepare(false); this.fail(current.blocked); return; }
      if (await structuralFingerprint(current.snapshot) !== this.structuralKey) {
        this.review = null; this.fail('STALE_DOCUMENT');
      }
    } finally { this.checkingStructure = false; }
  }
  private keyboard = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && !event.isComposing && !this.composing.size) { event.preventDefault(); void this.close(); }
    if (event.key === 'Enter' && (event.isComposing || this.composing.size) && event.composedPath().includes(this.host!)) event.preventDefault();
  };
  private currentExtraction(): ReturnType<typeof extractPage> {
    const target = this.snapshot?.goalRef ? this.registry?.bindings.get(this.snapshot.goalRef)?.element : null;
    const current = extractPage(this.doc, { documentInstanceId: this.documentInstanceId, goal: this.snapshot?.goal ?? 'complete_form' });
    if (target) current.snapshot.goalRef = [...current.registry.bindings.values()].find((binding) => binding.element === target)?.ref ?? null;
    return current;
  }
  private visibility = (): void => {
    if (this.model.phase === 'PREPARING' && (this.doc.visibilityState === 'hidden' || performance.now() - this.prepareStart >= PREPARE_DEADLINE_MS)) {
      this.cancelPrepare(performance.now() - this.prepareStart >= PREPARE_DEADLINE_MS);
    }
  };
  private pageshow = (event: PageTransitionEvent): void => { if (event.persisted) this.sourceNavigation(true); };
  sourceNavigation(force = false): void {
    if (!this.host) return;
    if (!force && location.href === this.lastUrl) return;
    this.lastUrl = location.href;
    this.cancelPrepare(false); this.review = null;
    if (!this.probeOutcome()) {
      this.documentInstanceId = nonce('doc');
      this.plan = null; this.localSourceReview = false; this.sourceReviewRows = []; this.drafts.clear(); this.lastValues.clear();
      this.refreshExtraction();
      if (this.model.phase !== 'AUTH_REQUIRED') {
        if (this.pendingSubmit && !this.hasSourceForm()) this.fail('OUTCOME_UNKNOWN');
        else {
          this.pendingSubmit = false; this.showTasks();
          void this.trySourceReview().then(() => this.sendState());
        }
      }
    }
  }
  private setupObservation(): void {
    this.doc.addEventListener('input', this.sourceEvent, true);
    this.doc.addEventListener('change', this.sourceEvent, true);
    this.doc.addEventListener('keydown', this.keyboard, true);
    this.doc.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('pageshow', this.pageshow);
    this.observer = new MutationObserver((records) => {
      if (records.every((record) => record.target === this.host || this.host?.contains(record.target))) return;
      if (this.mutationTimer) clearTimeout(this.mutationTimer);
      this.mutationTimer = setTimeout(() => { void this.checkStructure(); }, 100);
    });
    this.observer.observe(this.doc.documentElement, { subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['required', 'disabled', 'aria-disabled', 'type', 'name', 'min', 'max', 'pattern', 'value', 'checked', 'selected', 'action'] });
    this.tick = setInterval(() => {
      if (location.href !== this.lastUrl) { this.sourceNavigation(); return; }
      if (this.model.phase === 'PREPARING') {
        const elapsedMs = performance.now() - this.prepareStart;
        if (elapsedMs >= PREPARE_DEADLINE_MS) { this.cancelPrepare(true); return; }
        this.patch({ elapsedMs, sponsorVisible: elapsedMs > SPONSOR_AFTER_MS && !this.sponsorDismissed,
          statusMessage: elapsedMs > SPONSOR_AFTER_MS ? '필요한 입력과 버튼을 정리하고 있어요. 준비되면 바로 열어드릴게요.' : '사용하기 쉬운 화면을 준비하고 있어요.' });
      } else if (this.pendingSubmit) {
        if (!this.probeOutcome() && this.submitStart && performance.now() - this.submitStart > 10_000) this.fail('OUTCOME_UNKNOWN');
      } else this.pollValues();
    }, 200);
  }
  private sendState(): Promise<BackgroundReply> {
    return this.send({ type: 'FLECTO_STATE', documentInstanceId: this.documentInstanceId, pendingSubmit: this.pendingSubmit, active: !!this.host });
  }
  async close(): Promise<void> {
    if (this.composing.size) { this.patch({ statusMessage: '입력 중인 글자를 마친 뒤 원래 화면으로 돌아가 주세요.' }); return; }
    this.cancelPrepare(false); this.epoch += 1; this.clearDeadline();
    if (this.tick) clearInterval(this.tick);
    if (this.mutationTimer) clearTimeout(this.mutationTimer);
    this.observer?.disconnect(); this.observer = null;
    this.doc.removeEventListener('input', this.sourceEvent, true);
    this.doc.removeEventListener('change', this.sourceEvent, true);
    this.doc.removeEventListener('keydown', this.keyboard, true);
    this.doc.removeEventListener('visibilitychange', this.visibility);
    window.removeEventListener('pageshow', this.pageshow);
    this.root?.unmount(); this.root = null; this.host?.remove(); this.host = null;
    this.priorFocus?.isConnected && this.priorFocus.focus({ preventScroll: true });
    await this.sendState();
  }
}
