import { FlectoError, type ActionReceipt, type PrivateBinding, type PrivateBindingRegistry, type ReviewToken, type UserAction } from '@flecto/contracts';
import { currentSnapshot, isDisabled, isVisible, refreshRegistry, registryStates, reconcileOptionsAfterInput } from './dom';

const receipt = (ref: string, registry: PrivateBindingRegistry, status: ActionReceipt['status'], evidence: ActionReceipt['evidence'], error?: ActionReceipt['error']): ActionReceipt => ({ actionId: `a_${crypto.randomUUID()}`, documentInstanceId: registry.documentInstanceId, targetRef: ref, status, evidence, ...(error ? { error } : {}) });
function checkedBinding(ref: string, registry: PrivateBindingRegistry): PrivateBinding {
  refreshRegistry(registry);
  const b = registry.bindings.get(ref);
  if (!b || !b.element.isConnected || !isVisible(b.element)) throw new FlectoError('STALE_DOCUMENT');
  const snapshot = registryStates.get(registry)!.snapshot;
  if ((b.kind === 'radio' ? snapshot.controls.find(c => c.ref === ref)!.disabled : isDisabled(b.element)) || b.element.hasAttribute('readonly')) throw new FlectoError('SOURCE_REJECTED');
  if (snapshot.controls.filter(c => c.semanticKey === b.semanticKey).length !== 1) throw new FlectoError('AMBIGUOUS_TARGET');
  return b;
}
export function readControlValue(binding: PrivateBinding, registry: PrivateBindingRegistry): string | boolean {
  refreshRegistry(registry);
  if (registry.bindings.get(binding.ref) !== binding) throw new FlectoError('STALE_DOCUMENT');
  return localValue(binding, registry);
}
function localValue(binding: PrivateBinding, registry: PrivateBindingRegistry): string | boolean {
  if (binding.kind === 'checkbox') return (binding.element as HTMLInputElement).checked;
  if (binding.kind === 'radio') {
    const control = registryStates.get(registry)!.snapshot.controls.find(c => c.ref === binding.ref)!;
    const selected = control.options.map(o => registry.options.get(o.ref) as HTMLInputElement).find(e => e.checked);
    return selected?.value ?? '';
  }
  return 'value' in binding.element ? (binding.element as HTMLInputElement).value : '';
}
/** One current-DOM check for a synchronous local read batch; never transported. */
export function readControlValues(registry: PrivateBindingRegistry): Map<string, string | boolean> {
  refreshRegistry(registry);
  return new Map([...registry.bindings].map(([ref, binding]) => [ref, localValue(binding, registry)]));
}
function nativeValue(element: HTMLElement, value: string): void {
  const win = element.ownerDocument.defaultView!;
  const prototype = element.tagName === 'TEXTAREA' ? win.HTMLTextAreaElement.prototype : element.tagName === 'SELECT' ? win.HTMLSelectElement.prototype : win.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
  element.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
  element.dispatchEvent(new win.Event('change', { bubbles: true, composed: true }));
}
const settle = (doc: Document) => new Promise<void>(resolve => doc.defaultView!.setTimeout(resolve, 0));
export async function applyUserInput(action: Extract<UserAction, { kind: 'SET_TEXT' | 'SET_CHOICE' | 'SET_CONSENT_FROM_USER' }>, registry: PrivateBindingRegistry): Promise<ActionReceipt> {
  try {
    const binding = checkedBinding(action.ref, registry), element = binding.element;
    if (registryStates.get(registry)!.state.submitted) throw new FlectoError('BUSY');
    let expected: string | boolean;
    if (action.kind === 'SET_TEXT') {
      if (!['text','email','tel','date','number','textarea'].includes(binding.kind)) throw new FlectoError('UNSUPPORTED_CONTROL');
      expected = action.value; nativeValue(element, action.value);
    } else if (action.kind === 'SET_CONSENT_FROM_USER') {
      if (binding.kind !== 'checkbox') throw new FlectoError('UNSUPPORTED_CONTROL');
      expected = action.checked;
      if ((element as HTMLInputElement).checked !== expected) element.click();
    } else {
      const option = registry.options.get(action.optionRef), control = registryStates.get(registry)!.snapshot.controls.find(c => c.ref === action.ref)!;
      if (!option || !control.options.some(o => o.ref === action.optionRef) || !option.isConnected || isDisabled(option) || option.closest('optgroup[disabled]')) throw new FlectoError('STALE_DOCUMENT');
      expected = option.value;
      if (binding.kind === 'select' && option.tagName === 'OPTION' && option.closest('select') === element) {
        // Duplicate values cannot be selected by value without confusing identity.
        const select = element as HTMLSelectElement;
        if (Array.from(select.options).filter(o => o.value === option.value).length !== 1) throw new FlectoError('AMBIGUOUS_TARGET');
        nativeValue(element, option.value);
      } else if (binding.kind === 'radio' && option.tagName === 'INPUT') option.click();
      else throw new FlectoError('UNSUPPORTED_CONTROL');
    }
    await settle(element.ownerDocument);
    reconcileOptionsAfterInput(registry);
    if (readControlValue(binding, registry) !== expected) throw new FlectoError('SOURCE_REJECTED');
    if (action.kind === 'SET_CHOICE') {
      // Native values may coincide (especially radios). Receipt verification
      // still requires the exact option the user selected to be active.
      const option = registry.options.get(action.optionRef)!;
      const selected = binding.kind === 'select' ? (element as HTMLSelectElement).selectedOptions[0] === option : (option as HTMLInputElement).checked;
      if (!selected) throw new FlectoError('SOURCE_REJECTED');
    }
    return receipt(action.ref, registry, 'APPLIED', 'DOM_READBACK');
  } catch (error) { return receipt(action.ref, registry, 'REJECTED', 'NONE', error instanceof FlectoError ? error.code : 'SOURCE_REJECTED'); }
}
export function createReviewToken(ref: string, registry: PrivateBindingRegistry): ReviewToken {
  const b = checkedBinding(ref, registry);
  if (b.kind !== 'submit' || !b.form) throw new FlectoError('UNSUPPORTED_CONTROL');
  return { documentInstanceId: registry.documentInstanceId, semanticRevision: registry.semanticRevision, optionRevision: registry.optionRevision, privateValueRevision: registry.privateValueRevision, sourceActionRef: ref };
}
export async function invokeSource(ref: string, registry: PrivateBindingRegistry, intent: 'navigate' | 'submit', review?: ReviewToken): Promise<ActionReceipt> {
  try {
    const binding = checkedBinding(ref, registry), snapshot = currentSnapshot(registry), control = snapshot.controls.find(c => c.ref === ref)!;
    const state = registryStates.get(registry)!.state;
    if (state.submitted) throw new FlectoError('BUSY');
    if (control.actionKind !== intent) throw new FlectoError('UNSUPPORTED_CONTROL');
    if (intent === 'submit') {
      if (!review || review.sourceActionRef !== ref || review.documentInstanceId !== registry.documentInstanceId || review.semanticRevision !== registry.semanticRevision || review.optionRevision !== registry.optionRevision || review.privateValueRevision !== registry.privateValueRevision) throw new FlectoError('STALE_DOCUMENT');
      // A source may use noValidate with its own React validation. We still run
      // native constraint checks and click the source button, preserving its handler.
      if (!binding.form || !binding.form.checkValidity()) throw new FlectoError('SOURCE_REJECTED');
      state.submitted = true;
    }
    binding.element.click();
    // A click is not server success. Once attempted, submit stays locked even if outcome is lost.
    return receipt(ref, registry, 'PENDING', 'SOURCE_EVENT');
  } catch (error) { return receipt(ref, registry, 'REJECTED', 'NONE', error instanceof FlectoError ? error.code : 'OUTCOME_UNKNOWN'); }
}
