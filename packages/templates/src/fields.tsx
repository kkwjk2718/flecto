import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react';
import type { PublicNotice, UserAction, ViewControl } from '@flecto/contracts';

export type Emit = (action: UserAction) => void;
export type FieldContext = {
  emit: Emit;
  idFor: (ref: string, part?: string) => string;
  noticeByRef: Map<string, PublicNotice>;
  setComposing: (ref: string, composing: boolean) => void;
};

export function textOf(value: string | boolean): string {
  return typeof value === 'string' ? value : '';
}

export function RequiredBadge({ required, showOptional }: { required: boolean; showOptional?: boolean }) {
  if (required) return <span className="fl-badge fl-badge-required">필수</span>;
  return showOptional ? <span className="fl-badge fl-badge-optional">선택</span> : null;
}

export function NoticeBlock({ notice, id }: { notice: PublicNotice; id?: string }) {
  const label = notice.kind === 'terms' ? '원문' : notice.kind === 'warning' ? '주의' : '원래 사이트 안내';
  return (
    <div className="fl-notice" data-kind={notice.kind} id={id}>
      <span className="fl-notice-label">{label}</span>
      {notice.text}
    </div>
  );
}

function helpParts(control: ViewControl, ctx: FieldContext) {
  const ids: string[] = [];
  const nodes: ReactElement[] = [];
  if (control.description) {
    const id = ctx.idFor(control.ref, 'help');
    ids.push(id);
    nodes.push(<p key="help" className="fl-help" id={id}>{control.description}</p>);
  }
  for (const noticeRef of control.noticeRefs) {
    const notice = ctx.noticeByRef.get(noticeRef);
    if (!notice) continue;
    const id = ctx.idFor(control.ref, 'n-' + noticeRef);
    ids.push(id);
    nodes.push(<NoticeBlock key={noticeRef} notice={notice} id={id} />);
  }
  let error: ReactElement | null = null;
  if (control.error) {
    const id = ctx.idFor(control.ref, 'error');
    ids.push(id);
    error = (
      <p className="fl-error" id={id}>
        <span aria-hidden="true">⚠</span>
        <span>{control.error}</span>
      </p>
    );
  }
  return { describedBy: ids.length ? ids.join(' ') : undefined, nodes, error };
}

const INPUT_TYPE: Partial<Record<ViewControl['kind'], string>> = { email: 'email', tel: 'tel', date: 'date', text: 'text', number: 'text' };
const AUTOCOMPLETE: Partial<Record<ViewControl['kind'], string>> = { email: 'email', tel: 'tel' };

// Holds the visible draft locally so the input element and caret stay stable while the
// controller round-trips SET_TEXT. Echoes of values we already sent never overwrite typing;
// a genuinely different source value is adopted only outside IME composition.
export function TextField({ control, ctx }: { control: ViewControl; ctx: FieldContext }) {
  const external = textOf(control.value);
  const [draft, setDraft] = useState(external);
  const composing = useRef(false);
  const sent = useRef<string[]>([]);

  useEffect(() => {
    if (composing.current) return;
    if (sent.current.includes(external)) {
      if (external === sent.current[sent.current.length - 1]) sent.current = [];
      return;
    }
    setDraft(external);
  }, [external]);

  const send = (value: string) => {
    if (sent.current[sent.current.length - 1] === value) return;
    sent.current = [...sent.current.slice(-30), value];
    ctx.emit({ kind: 'SET_TEXT', ref: control.ref, value });
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key !== 'Enter') return;
    if (composing.current || e.nativeEvent.isComposing || e.keyCode === 229) return; // IME commit Enter
    if (control.kind !== 'textarea') e.preventDefault(); // never implicit submission
  };

  const { describedBy, nodes, error } = helpParts(control, ctx);
  const id = ctx.idFor(control.ref);
  const common = {
    id,
    className: 'fl-input',
    value: draft,
    disabled: control.disabled,
    'aria-required': control.required || undefined,
    'aria-invalid': control.error ? true : undefined,
    'aria-describedby': describedBy,
    'data-flecto-ref': control.ref,
    maxLength: control.constraints.maxLength,
    onChange: (e: { currentTarget: { value: string } }) => {
      const value = e.currentTarget.value;
      setDraft(value);
      send(value);
    },
    onCompositionStart: () => {
      composing.current = true;
      ctx.setComposing(control.ref, true);
      ctx.emit({ kind: 'SET_COMPOSING', ref: control.ref, composing: true });
    },
    onCompositionEnd: (e: { currentTarget: { value: string } }) => {
      const value = e.currentTarget.value;
      composing.current = false;
      setDraft(value);
      send(value);
      ctx.setComposing(control.ref, false);
      ctx.emit({ kind: 'SET_COMPOSING', ref: control.ref, composing: false });
    },
    onKeyDown,
  };

  return (
    <div className="fl-field">
      <label className="fl-label" htmlFor={id}>
        <span>{control.label}</span>
        <RequiredBadge required={control.required} />
      </label>
      {nodes}
      {control.kind === 'textarea'
        ? <textarea {...common} rows={4} />
        : (
          <input
            {...common}
            type={INPUT_TYPE[control.kind] ?? 'text'}
            inputMode={control.kind === 'number' ? 'numeric' : undefined}
            autoComplete={AUTOCOMPLETE[control.kind] ?? 'on'}
            min={control.kind === 'date' ? control.constraints.min : undefined}
            max={control.kind === 'date' ? control.constraints.max : undefined}
          />
        )}
      {error}
    </div>
  );
}

// select and radio: big cards, nothing preselected by FLECTO; the checked state mirrors the
// controller's current source value (option ref).
export function ChoiceField({ control, ctx }: { control: ViewControl; ctx: FieldContext }) {
  const selected = textOf(control.value);
  const selectedOption = control.options.find((o) => o.ref === selected) ?? null;
  const { describedBy, nodes, error } = helpParts(control, ctx);
  const name = ctx.idFor(control.ref);
  const legendId = ctx.idFor(control.ref, 'legend');
  return (
    <fieldset className="fl-field" aria-describedby={describedBy} data-flecto-ref={control.ref}>
      <legend className="fl-label" id={legendId}>
        <span>{control.label}</span>
        <RequiredBadge required={control.required} />
      </legend>
      {nodes}
      <p className="fl-help">
        {selectedOption ? '지금 원래 화면에 선택된 값: ' + selectedOption.label : '아직 선택하지 않았어요.'}
      </p>
      <div className="fl-choices" role="radiogroup" aria-labelledby={legendId} aria-required={control.required || undefined} aria-invalid={control.error ? true : undefined}>
        {control.options.map((option) => {
          const checked = option.ref === selected;
          const disabled = option.disabled || control.disabled;
          return (
            <label key={option.ref} className="fl-card" data-checked={checked} data-disabled={disabled}>
              <input
                type="radio"
                name={name}
                aria-label={option.label}
                value={option.ref}
                checked={checked}
                disabled={disabled}
                data-flecto-ref={control.ref}
                onChange={() => ctx.emit({ kind: 'SET_CHOICE', ref: control.ref, optionRef: option.ref })}
              />
              <span className="fl-card-text">
                <span>{option.label}</span>
                {option.disabled ? <span className="fl-card-sub">지금은 선택할 수 없어요</span> : null}
              </span>
              {checked ? <span className="fl-card-state"><span aria-hidden="true">✓ </span>선택됨</span> : null}
            </label>
          );
        })}
      </div>
      {error}
    </fieldset>
  );
}

// Each checkbox stands alone; checked mirrors the source and only changes through the user's click.
export function CheckField({ control, ctx }: { control: ViewControl; ctx: FieldContext }) {
  const checked = control.value === true;
  const { describedBy, nodes, error } = helpParts(control, ctx);
  const id = ctx.idFor(control.ref);
  return (
    <div className="fl-field">
      {nodes}
      <label className="fl-check" htmlFor={id} data-checked={checked}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={control.disabled}
          aria-describedby={describedBy}
          aria-invalid={control.error ? true : undefined}
          aria-required={control.required || undefined}
          data-flecto-ref={control.ref}
          onChange={(e) => ctx.emit({ kind: 'SET_CONSENT_FROM_USER', ref: control.ref, checked: e.currentTarget.checked })}
        />
        <span className="fl-check-text">
          <span>{control.label}</span>
          <RequiredBadge required={control.required} showOptional />
          <span className="fl-check-state">{checked ? '동의함' : '아직 동의하지 않음'}</span>
        </span>
      </label>
      {error}
    </div>
  );
}

export function SourceButton({ control, ctx }: { control: ViewControl; ctx: FieldContext }) {
  return (
    <button
      type="button"
      className="fl-btn"
      disabled={control.disabled}
      data-flecto-ref={control.ref}
      onClick={() => ctx.emit({ kind: 'INVOKE_SOURCE', ref: control.ref, intent: 'navigate' })}
    >
      {control.label}
    </button>
  );
}

export function ControlField({ control, ctx }: { control: ViewControl; ctx: FieldContext }) {
  switch (control.kind) {
    case 'select':
    case 'radio':
      return <ChoiceField control={control} ctx={ctx} />;
    case 'checkbox':
      return <CheckField control={control} ctx={ctx} />;
    case 'submit':
      return null; // only offered as the explicit final button on review
    case 'button':
    case 'link':
      return control.actionKind === 'navigate' ? <SourceButton control={control} ctx={ctx} /> : null;
    default:
      return <TextField control={control} ctx={ctx} />;
  }
}
