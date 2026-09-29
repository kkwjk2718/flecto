import { FlectoError, PublicPageSnapshotSchema, type ErrorCode, type Goal, type PrivateBindingRegistry, type PublicControl, type PublicNotice, type PublicPageSnapshot } from '@flecto/contracts';

const controlSelector = 'input,textarea,select,button,a[href]';
const excluded = '#flecto-host,[data-private],[data-flecto-private],script,style,template';
const nonce = () => globalThis.crypto.randomUUID();
type DocumentState = { id: string; refs: WeakMap<Element, Map<string, string>>; next: number; semantic: string; options: string; values: string; semanticRevision: number; optionRevision: number; valueRevision: number; submitted: boolean };
type Scan = { controls: PublicControl[]; notices: PublicNotice[]; bindings: PrivateBindingRegistry['bindings']; options: PrivateBindingRegistry['options']; noticeBindings: PrivateBindingRegistry['notices']; semantic: string; optionSignature: string; values: string; blocked: ErrorCode | null };
const documents = new WeakMap<Document, DocumentState>();
export const registryStates = new WeakMap<PrivateBindingRegistry, { doc: Document; state: DocumentState; snapshot: PublicPageSnapshot; semantic: string; options: string; blocked: ErrorCode | null }>();

export function isSource(element: Element): boolean { return !element.closest(excluded); }
export function isVisible(element: Element): boolean {
  if (!isSource(element)) return false;
  for (let e: Element | null = element; e; e = e.parentElement) {
    if (e.hasAttribute('hidden') || e.getAttribute('aria-hidden') === 'true' || e.hasAttribute('inert')) return false;
    const style = e.ownerDocument.defaultView?.getComputedStyle(e);
    if (style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse') return false;
  }
  return true;
}
export function isDisabled(element: Element): boolean {
  return element.matches(':disabled') || !!element.closest('[aria-disabled="true"]');
}
function sourceText(element: Element): string {
  if (!isSource(element)) return '';
  return Array.from(element.childNodes).map(n => n.nodeType === 3 ? n.textContent ?? '' : n.nodeType === 1 && !(n as Element).matches('input,textarea,select') ? sourceText(n as Element) : '').join(' ');
}
function label(element: Element): string {
  const doc = element.ownerDocument;
  const ids = element.getAttribute('aria-labelledby')?.split(/\s+/).filter(Boolean);
  if (ids?.length) return ids.map(id => { const e = doc.getElementById(id); return e ? sourceText(e) : ''; }).join(' ');
  if (element.hasAttribute('aria-label')) return element.getAttribute('aria-label') ?? '';
  const labels = (element as HTMLInputElement).labels;
  if (labels?.length) return Array.from(labels).map(sourceText).join(' ');
  if (element.matches('input[type="submit"],input[type="button"]')) return (element as HTMLInputElement).value;
  return sourceText(element);
}
function formOf(e: Element): HTMLFormElement | null { return 'form' in e ? (e as HTMLInputElement).form : e.closest('form'); }
function getState(doc: Document, id?: string): DocumentState {
  let state = documents.get(doc);
  if (!state || (id && state.id !== id)) {
    state = { id: id ?? `d_${nonce()}`, refs: new WeakMap(), next: 0, semantic: '', options: '', values: '', semanticRevision: 0, optionRevision: 0, valueRevision: 0, submitted: false };
    documents.set(doc, state);
    const current = state;
    const changed = (event: Event) => { if (event.target && (event.target as Element).nodeType === 1 && isSource(event.target as Element)) current.valueRevision++; };
    doc.addEventListener('input', changed, true);
    doc.addEventListener('change', changed, true);
  }
  return state;
}
function scan(doc: Document, state: DocumentState): Scan {
  const ref = (e: Element, prefix = 'e') => { let refs = state.refs.get(e); if (!refs) { refs = new Map(); state.refs.set(e, refs); } let r = refs.get(prefix); if (!r) { r = `${prefix}_${state.id}_${++state.next}`; refs.set(prefix, r); } return r; };
  const allElements = Array.from(doc.querySelectorAll<HTMLElement>(controlSelector)).filter(e => !e.closest('#flecto-host'));
  const elements = allElements.filter(isSource);
  // Never read password/OTP values. Stop before even building the private value set.
  const auth = allElements.some(e => e.matches('input[type="password"],input[autocomplete="one-time-code"]') || (e.tagName === 'INPUT' && /(?:otp|one.?time|verification.?code|인증.?번호)/i.test(`${e.getAttribute('name') ?? ''} ${e.id} ${label(e)}`)));
  const empty = (blocked: ErrorCode): Scan => ({ controls: [], notices: [], bindings: new Map(), options: new Map(), noticeBindings: new Map(), semantic: blocked, optionSignature: '', values: '', blocked });
  if (auth) return empty('AUTH_REQUIRED');
  if (Array.from(doc.querySelectorAll('iframe,[role="dialog"] [name*="captcha"],.g-recaptcha,.h-captcha,[id*="captcha"],[class*="captcha"],input[type="file"],[contenteditable="true"],[role="combobox"]')).some(e => isSource(e) && (e.tagName === 'IFRAME' || isVisible(e)))) return empty('UNSUPPORTED_CONTROL');
  if (Array.from(doc.querySelectorAll('[role="checkbox"],[role="radio"],[role="switch"],[role="slider"],[role="textbox"],[role="listbox"],[role="button"],[role="link"]')).some(e => isVisible(e) && !e.matches('input,textarea,select,button,a[href]'))) return empty('UNSUPPORTED_CONTROL');
  const privateValues = new Set<string>();
  for (const e of Array.from(doc.querySelectorAll<HTMLElement>(controlSelector)).filter(e => !e.closest('#flecto-host'))) {
    if (e.matches('input:not([type="submit"]):not([type="button"]),textarea,select')) {
      const v = (e as HTMLInputElement).value;
      if (v) privateValues.add(v);
      if (e.matches('input,textarea') && e.getAttribute('value')) privateValues.add(e.getAttribute('value')!);
    }
  }
  const sentinels = [...privateValues].sort((a, b) => b.length - a.length);
  const clean = (s: string) => { for (const value of sentinels) s = s.split(value).join('[비공개]'); return s.replace(/\s+/g, ' ').trim(); };
  const forms = Array.from(doc.forms).filter(isSource);
  const formKey = (form: HTMLFormElement | null) => form ? `form_${forms.indexOf(form)}` : 'page';
  const actionKey = (element: HTMLElement, form: HTMLFormElement | null, kind: PublicControl['kind']): string => {
    if (kind !== 'submit' && kind !== 'link') return '';
    const url = new URL(kind === 'link' ? (element as HTMLAnchorElement).href : element.getAttribute('formaction') ?? form?.getAttribute('action') ?? doc.URL, doc.URL);
    if (!['http:', 'https:'].includes(url.protocol)) throw new FlectoError('UNSUPPORTED_CONTROL');
    // Query/fragment/credential-dependent actions are deliberately not reusable across documents.
    // Do not turn a private URL into a persistent hash and call it anonymous.
    if (url.search || url.hash || url.username || url.password || clean(url.pathname) !== url.pathname) return '|action-local';
    return `|${kind === 'submit' ? element.getAttribute('formmethod') ?? form?.method ?? 'get' : 'get'}:${url.origin}${url.pathname}`;
  };
  const controls: PublicControl[] = [], notices: PublicNotice[] = [];
  const bindings: Scan['bindings'] = new Map(), options: Scan['options'] = new Map(), noticeBindings: Scan['noticeBindings'] = new Map();
  const noticeElements = new Set<Element>();
  // Explicit ARIA descriptions remain semantic content even when visually hidden.
  for (const e of elements) for (const id of (e.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)) { const n = doc.getElementById(id); if (n && isSource(n)) noticeElements.add(n); }
  for (const e of doc.querySelectorAll('form p,form li,[role="note"],[role="alert"],details')) if (isVisible(e) && !e.querySelector(controlSelector) && !e.closest('label')) noticeElements.add(e);
  for (const e of noticeElements) {
    const text = clean(sourceText(e));
    if (!text) continue;
    const form = formOf(e), r = ref(e, 'n');
    notices.push({ ref: r, text, kind: e.getAttribute('role') === 'alert' ? 'warning' : e.tagName === 'DETAILS' ? 'terms' : 'info', formRef: form ? ref(form, 'f') : null, semanticKey: `${formKey(form)}|notice|${text}` });
    noticeBindings.set(r, e as HTMLElement);
  }
  const radios = new Set<Element>();
  const rawStructure: unknown[] = [];
  const rawActions: unknown[] = [doc.URL];
  for (const e of elements) {
    if (!isVisible(e) || e.matches('input[type="hidden"]') || radios.has(e)) continue;
    const tag = e.tagName, type = tag === 'INPUT' || tag === 'BUTTON' ? (e as HTMLInputElement).type : '';
    let kind: PublicControl['kind'];
    if (tag === 'A') kind = 'link';
    else if (tag === 'TEXTAREA') kind = 'textarea';
    else if (tag === 'SELECT') { if ((e as HTMLSelectElement).multiple) return empty('UNSUPPORTED_CONTROL'); kind = 'select'; }
    else if (tag === 'BUTTON') kind = type === 'submit' && formOf(e) ? 'submit' : 'button';
    else if (['text','email','tel','date','number','radio','checkbox','submit','button'].includes(type)) kind = type as PublicControl['kind'];
    else return empty('UNSUPPORTED_CONTROL');
    if (kind === 'link') { try { if (!['http:', 'https:'].includes(new URL((e as HTMLAnchorElement).href).protocol)) return empty('UNSUPPORTED_CONTROL'); } catch { return empty('UNSUPPORTED_CONTROL'); } }
    const form = formOf(e), r = ref(e), members = kind === 'radio' ? elements.filter(other => other.matches('input[type="radio"]') && formOf(other) === form && ((e as HTMLInputElement).name ? (other as HTMLInputElement).name === (e as HTMLInputElement).name : other === e)) : [e];
    members.forEach(m => { if (kind === 'radio') radios.add(m); });
    let text = label(e);
    if (kind === 'radio') text = e.closest('fieldset')?.querySelector('legend')?.textContent ?? text;
    if (!text.trim() && kind === 'submit') text = '제출';
    const publicLabel = clean(text);
    if (!publicLabel) return empty('UNSUPPORTED_CONTROL');
    let semanticKey: string;
    try { semanticKey = `${formKey(form)}|${kind}|${publicLabel}${actionKey(e, form, kind)}`; } catch { return empty('UNSUPPORTED_CONTROL'); }
    const choiceElements: (HTMLOptionElement | HTMLInputElement)[] = kind === 'select' ? Array.from((e as HTMLSelectElement).options) : kind === 'radio' ? members as HTMLInputElement[] : [];
    const publicOptions = choiceElements.filter(o => kind !== 'radio' || isVisible(o)).map(o => {
      const optionRef = ref(o, 'o'); options.set(optionRef, o);
      return { ref: optionRef, label: clean(o.tagName === 'OPTION' ? o.textContent ?? '' : label(o)), disabled: isDisabled(o) || !!o.closest('optgroup[disabled]') };
    });
    const constraints: PublicControl['constraints'] = {};
    for (const key of ['min','max','pattern'] as const) if (e.hasAttribute(key)) constraints[key] = clean(e.getAttribute(key)!);
    for (const [attr, key] of [['minlength','minLength'],['maxlength','maxLength']] as const) if (e.hasAttribute(attr)) constraints[key] = Number(e.getAttribute(attr));
    const actionKind = kind === 'submit' ? 'submit' : kind === 'link' || kind === 'button' ? 'navigate' : 'none';
    const noticeRefs = (e.getAttribute('aria-describedby') ?? '').split(/\s+/).map(id => doc.getElementById(id)).filter((n): n is HTMLElement => !!n && noticeBindings.has(ref(n, 'n'))).map(n => ref(n, 'n'));
    controls.push({ ref: r, kind, label: publicLabel, formRef: form ? ref(form, 'f') : null, required: members.some(m => m.hasAttribute('required') || m.getAttribute('aria-required') === 'true'), disabled: kind === 'radio' ? members.every(isDisabled) : isDisabled(e) || e.hasAttribute('readonly'), semanticKey, constraints, options: publicOptions, noticeRefs, actionKind });
    rawStructure.push([r, kind, text.replace(/\s+/g, ' ').trim(), form ? ref(form, 'f') : null, controls.at(-1)!.required, controls.at(-1)!.disabled, ['min','max','pattern','minlength','maxlength'].map(a => e.getAttribute(a)), noticeRefs, actionKind]);
    bindings.set(r, { ref: r, element: e, form, kind, semanticKey });
    if (actionKind !== 'none') rawActions.push([r, e.getAttribute('href'), e.getAttribute('formaction'), e.getAttribute('formmethod'), e.hasAttribute('formnovalidate'), form?.getAttribute('action'), form?.method, form?.noValidate]);
  }
  // Private state signatures stay in memory; they are never fingerprint/cache input.
  const values = JSON.stringify(elements.filter(e => e.matches('input,textarea,select')).map(e => [ref(e), (e as HTMLInputElement).value, (e as HTMLInputElement).checked]));
  return { controls, notices, bindings, options, noticeBindings, semantic: JSON.stringify([rawStructure, [...noticeElements].map(n => [ref(n, 'n'), sourceText(n), formOf(n) ? ref(formOf(n)!, 'f') : null]), rawActions]), optionSignature: JSON.stringify(controls.map(c => [c.ref, c.options.map(o => { const e = options.get(o.ref)!; return [o.ref, e.tagName === 'OPTION' ? e.textContent : label(e), o.disabled, e.value]; })])), values, blocked: null };
}
function update(state: DocumentState, result: Scan): void {
  if (state.semantic && state.semantic !== result.semantic) state.semanticRevision++;
  if (state.options && state.options !== result.optionSignature) state.optionRevision++;
  if (state.values && state.values !== result.values) state.valueRevision++;
  state.semantic = result.semantic; state.options = result.optionSignature; state.values = result.values;
}
export function extractPage(doc: Document, options: { documentInstanceId?: string; requestId?: string; goal?: Goal; goalRef?: string | null } = {}): { snapshot: PublicPageSnapshot; registry: PrivateBindingRegistry; blocked: ErrorCode | null } {
  const state = getState(doc, options.documentInstanceId), result = scan(doc, state);
  update(state, result);
  const registry: PrivateBindingRegistry = { documentInstanceId: state.id, semanticRevision: state.semanticRevision, optionRevision: state.optionRevision, privateValueRevision: state.valueRevision, bindings: result.bindings, options: result.options, notices: result.noticeBindings };
  let blocked = result.blocked;
  const candidate = { schemaVersion: 1 as const, requestId: options.requestId ?? `r_${nonce()}`, snapshotId: `s_${nonce()}`, documentInstanceId: state.id, origin: doc.location.origin, goal: options.goal ?? 'complete_form', goalRef: options.goalRef ?? null, semanticRevision: state.semanticRevision, optionRevision: state.optionRevision, controls: result.controls, notices: result.notices };
  const parsed = PublicPageSnapshotSchema.safeParse(candidate);
  // Oversize/incomplete structure fails closed, without truncating required text.
  if (!parsed.success) { blocked ??= 'UNSUPPORTED_CONTROL'; candidate.controls = []; candidate.notices = []; registry.bindings.clear(); registry.options.clear(); registry.notices.clear(); }
  const snapshot = parsed.success ? parsed.data : candidate;
  registryStates.set(registry, { doc, state, snapshot, semantic: result.semantic, options: result.optionSignature, blocked });
  return { snapshot, registry, blocked };
}
export function refreshRegistry(registry: PrivateBindingRegistry): void {
  const meta = registryStates.get(registry);
  if (!meta || documents.get(meta.doc) !== meta.state || meta.doc.defaultView?.document !== meta.doc) throw new FlectoError('STALE_DOCUMENT');
  if (meta.blocked) throw new FlectoError(meta.blocked);
  const result = scan(meta.doc, meta.state); update(meta.state, result);
  registry.semanticRevision = meta.state.semanticRevision; registry.optionRevision = meta.state.optionRevision; registry.privateValueRevision = meta.state.valueRevision;
  if (result.blocked) throw new FlectoError(result.blocked);
  if (meta.semantic !== result.semantic || meta.options !== result.optionSignature) throw new FlectoError('STALE_DOCUMENT');
  if (meta.snapshot.semanticRevision !== registry.semanticRevision || meta.snapshot.optionRevision !== registry.optionRevision) throw new FlectoError('STALE_DOCUMENT');
  for (const [r, binding] of registry.bindings) if (!binding.element.isConnected || result.bindings.get(r)?.element !== binding.element || result.bindings.get(r)?.form !== binding.form) throw new FlectoError('STALE_DOCUMENT');
}
export function currentSnapshot(registry: PrivateBindingRegistry): PublicPageSnapshot { refreshRegistry(registry); return registryStates.get(registry)!.snapshot; }
