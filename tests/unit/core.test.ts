// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CACHE_VERSION, PROMPT_VERSION, FlectoError, PublicPageSnapshotSchema, type CachedBlueprint, type PagePlan, type PublicPageSnapshot } from '@flecto/contracts';
import { applyUserInput, createReviewToken, extractPage, invokeSource, readControlValue, rebindBlueprint, structuralFingerprint, verifyPlan } from '@flecto/core';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(async () => { if (root) { const r = root; root = undefined; await act(async () => r.unmount()); } document.body.innerHTML = ''; });
function page(html = '<form><label>성명<input required></label><p>신청 기한은 오늘입니다.</p><label>필수 약관 동의<input type="checkbox" required></label><button>신청</button></form>') {
  document.body.innerHTML = html;
  return extractPage(document, { documentInstanceId: `d_${crypto.randomUUID()}` });
}
function plan(s: PublicPageSnapshot, action = s.controls.find(c => c.kind === 'submit')): PagePlan {
  const controls = s.controls.filter(c => c.formRef === action?.formRef && c.actionKind === 'none');
  return { schemaVersion: 1, snapshotId: s.snapshotId, sourceActionRef: action?.ref ?? null, steps: [
    { id: 'input', template: 'grouped_form', title: '입력', controlRefs: controls.filter(c => c.kind !== 'checkbox').map(c => c.ref), noticeRefs: s.notices.filter(n => n.formRef === null || n.formRef === action?.formRef).map(n => n.ref) },
    { id: 'consent', template: 'consent', title: '동의', controlRefs: controls.filter(c => c.kind === 'checkbox').map(c => c.ref), noticeRefs: [] },
  ] };
}
function code(fn: () => unknown, expected: string) { try { fn(); throw new Error('Expected rejection'); } catch (e) { expect(e).toBeInstanceOf(FlectoError); expect((e as FlectoError).code).toBe(expected); } }

describe('public extraction and source verification', () => {
  it('extracts semantic labels, notices, constraints and required consent; ignores answer attributes and overlay', () => {
    const { snapshot, registry, blocked } = page('<form><label for="name">성명</label><input id="name" required minlength="2" aria-describedby="notice" data-flecto-answer="SECRET"><p id="notice">신청 기한 안내</p><button>신청</button></form><div id="flecto-host"><input type="password"><p>overlay</p></div>');
    expect(blocked).toBeNull(); expect(PublicPageSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(snapshot.controls[0]).toMatchObject({ label: '성명', required: true, constraints: { minLength: 2 }, noticeRefs: [snapshot.notices[0].ref] });
    expect(JSON.stringify(snapshot)).not.toMatch(/SECRET|overlay/);
    expect(verifyPlan(plan(snapshot), snapshot, registry)).toEqual(plan(snapshot));
    document.querySelector('#flecto-host')!.innerHTML = '<div>render changed</div>';
    expect(verifyPlan(plan(snapshot), snapshot, registry)).toEqual(plan(snapshot));
  });
  it('redacts private values embedded in labels, notices and semantic keys', () => {
    const { snapshot } = page('<form><label>고객 PRIVATE_SENTINEL 님<input value="PRIVATE_SENTINEL"></label><input type="hidden" value="HIDDEN_SENTINEL"><p>PRIVATE_SENTINEL / HIDDEN_SENTINEL 안내</p><button>신청</button></form>');
    expect(JSON.stringify(snapshot)).not.toContain('PRIVATE_SENTINEL'); expect(JSON.stringify(snapshot)).not.toContain('HIDDEN_SENTINEL');
    expect(JSON.stringify(snapshot)).toContain('[비공개]');
  });
  it('redacts a private-area value echoed into a public label and refuses private-area authentication', () => {
    const { snapshot } = page('<div data-private><input value="PRIVATE_SENTINEL"></div><form><label>성명 PRIVATE_SENTINEL<input></label><button>신청</button></form>');
    expect(JSON.stringify(snapshot)).not.toContain('PRIVATE_SENTINEL');
    expect(page('<div data-private><input type="password"></div>').blocked).toBe('AUTH_REQUIRED');
  });
  it('uses native submit accessible names and the actual HTML form owner', () => {
    const { snapshot, registry } = page('<form id="target"><label>성명<input form="missing"></label><input type="submit" value="혜택 신청"></form>');
    expect(snapshot.controls[0].formRef).toBeNull(); expect(registry.bindings.get(snapshot.controls[0].ref)!.form).toBeNull();
    expect(snapshot.controls[1].label).toBe('혜택 신청');
  });
  it('covers explicitly referenced hidden ARIA descriptions', () => {
    const { snapshot, registry } = page('<form><label>성명<input aria-describedby="terms"></label><p id="terms" hidden>필수 안내 원문</p><button>신청</button></form>');
    expect(snapshot.notices[0].text).toBe('필수 안내 원문');
    const p = plan(snapshot); p.steps[0].noticeRefs = [];
    code(() => verifyPlan(p, snapshot, registry), 'REQUIRED_MISSING');
  });
  it('does not truncate long mandatory notices into a seemingly valid plan', () => {
    const { snapshot, registry, blocked } = page(`<form><p>${'기'.repeat(3001)}</p><button>신청</button></form>`);
    expect(blocked).toBe('UNSUPPORTED_CONTROL'); expect(snapshot.controls).toEqual([]);
    code(() => verifyPlan(plan(snapshot), snapshot, registry), 'UNSUPPORTED_CONTROL');
  });
  it.each(['<input type="password" value="SECRET">', '<input autocomplete="one-time-code" value="123456">', '<input name="otp" value="123456">'])('pauses entirely for authentication %s', html => {
    const { snapshot, registry, blocked } = page(`<form><label>성명<input></label>${html}<button>제출</button></form>`);
    expect(blocked).toBe('AUTH_REQUIRED'); expect(snapshot.controls).toEqual([]); expect(registry.bindings.size).toBe(0); expect(JSON.stringify(snapshot)).not.toMatch(/SECRET|123456/);
  });
  it.each(['<iframe></iframe>', '<div class="g-recaptcha"></div>', '<input type="file">'])('refuses unsupported source %s', html => { expect(page(html).blocked).toBe('UNSUPPORTED_CONTROL'); });
  it('groups radios without duplicate references and keeps source option identity', () => {
    const { snapshot, registry, blocked } = page('<form><fieldset><legend>시간 선택</legend><label><input type="radio" name="time" value="morning" required>오전</label><label><input type="radio" name="time" value="evening">오후</label></fieldset><button>신청</button></form>');
    expect(blocked).toBeNull(); expect(snapshot.controls[0].options).toHaveLength(2); expect(snapshot.controls[0].label).toBe('시간 선택');
    expect(verifyPlan(plan(snapshot), snapshot, registry)).toBeTruthy();
  });
  it('rejects unknown fields, phantom references, missing required/notice coverage and duplicates across steps', () => {
    const { snapshot, registry } = page(), valid = plan(snapshot);
    code(() => verifyPlan({ ...valid, selector: '#submit' }, snapshot), 'SCHEMA_INVALID');
    code(() => verifyPlan({ ...valid, sourceActionRef: 'invented' }, snapshot), 'SCHEMA_INVALID');
    code(() => verifyPlan({ ...valid, steps: valid.steps.map(s => ({ ...s, noticeRefs: [] })) }, snapshot), 'REQUIRED_MISSING');
    code(() => verifyPlan({ ...valid, steps: [valid.steps[0]] }, snapshot), 'REQUIRED_MISSING');
    code(() => verifyPlan({ ...valid, steps: [...valid.steps, { ...valid.steps[0], id: 'duplicate' }] }, snapshot), 'SCHEMA_INVALID');
    expect(verifyPlan(valid, snapshot, registry)).toEqual(valid);
  });
  it('does not mix identically named actions and inputs from different forms', () => {
    const { snapshot, registry } = page('<form><label>성명<input required></label><button>신청</button></form><form><label>성명<input required></label><button>신청</button></form>');
    const valid = plan(snapshot), foreign = snapshot.controls[2];
    expect(snapshot.controls[1].semanticKey).not.toBe(snapshot.controls[3].semanticKey);
    expect(verifyPlan(valid, snapshot, registry)).toEqual(valid);
    code(() => verifyPlan({ ...valid, steps: [{ ...valid.steps[0], controlRefs: [foreign.ref] }] }, snapshot), 'SCHEMA_INVALID');
  });
  it('rejects same-form ambiguous actions and disabled actions', async () => {
    let extracted = page('<form><button>신청</button><button>신청</button></form>');
    code(() => verifyPlan(plan(extracted.snapshot), extracted.snapshot, extracted.registry), 'AMBIGUOUS_TARGET');
    expect((await invokeSource(extracted.snapshot.controls[0].ref, extracted.registry, 'submit')).error).toBe('AMBIGUOUS_TARGET');
    extracted = page('<form><button disabled>신청</button></form>');
    code(() => verifyPlan(plan(extracted.snapshot), extracted.snapshot, extracted.registry), 'SOURCE_REJECTED');
  });
  it.each(['required','action','notice','replacement','option'])('refuses current DOM change: %s', change => {
    const { snapshot, registry } = page('<form><label>성명<input></label><label>수업<select><option value="x">수학</option></select></label><p>기한 안내</p><button>신청</button></form>');
    if (change === 'required') document.querySelector('input')!.required = true;
    if (change === 'action') document.querySelector('form')!.action = '/changed';
    if (change === 'notice') document.querySelector('p')!.textContent = '기한이 바뀜';
    if (change === 'replacement') document.querySelector('input')!.outerHTML = '<input>';
    if (change === 'option') document.querySelector('option')!.disabled = true;
    code(() => verifyPlan(plan(snapshot), snapshot, registry), 'STALE_DOCUMENT');
  });
});

describe('input adapters and review locks', () => {
  it('uses native events, consent click, local readback and normal submit; locks repeat submit', async () => {
    const { snapshot, registry } = page(), input = snapshot.controls[0], consent = snapshot.controls[1], submit = snapshot.controls[2];
    const events: string[] = []; let submits = 0;
    document.querySelector('input')!.addEventListener('input', () => events.push('input'));
    document.querySelector('form')!.addEventListener('submit', e => { e.preventDefault(); submits++; });
    expect((await applyUserInput({ kind: 'SET_TEXT', ref: input.ref, value: '홍길동' }, registry)).status).toBe('APPLIED');
    expect(readControlValue(registry.bindings.get(input.ref)!, registry)).toBe('홍길동'); expect(events).toEqual(['input']);
    expect((await applyUserInput({ kind: 'SET_CONSENT_FROM_USER', ref: consent.ref, checked: true }, registry)).status).toBe('APPLIED');
    const review = createReviewToken(submit.ref, registry);
    expect((await invokeSource(submit.ref, registry, 'submit', review)).status).toBe('PENDING');
    expect((await invokeSource(submit.ref, registry, 'submit', review)).error).toBe('BUSY'); expect(submits).toBe(1);
  });
  it('reaches React controlled handler, rerender and submit state through prototype setter', async () => {
    let observed = '', submitted = '';
    function App() { const [value, setValue] = useState(''); return createElement('form', { onSubmit: e => { e.preventDefault(); submitted = value; } }, createElement('label', null, '성명', createElement('input', { required: true, value, onChange: e => { observed = e.currentTarget.value; setValue(observed); } })), createElement('button', null, '신청')); }
    document.body.innerHTML = '<div id="root"></div>'; root = createRoot(document.querySelector('#root')!);
    await act(async () => root!.render(createElement(App)));
    const { snapshot, registry } = extractPage(document, { documentInstanceId: `d_${crypto.randomUUID()}` });
    await act(async () => { expect((await applyUserInput({ kind: 'SET_TEXT', ref: snapshot.controls[0].ref, value: '홍길동' }, registry)).status).toBe('APPLIED'); });
    expect(observed).toBe('홍길동'); expect(document.querySelector('input')!.value).toBe('홍길동');
    const submit = snapshot.controls[1].ref;
    await act(async () => { await invokeSource(submit, registry, 'submit', createReviewToken(submit, registry)); });
    expect(submitted).toBe('홍길동');
  });
  it('rejects a source that rolls back input', async () => {
    const { snapshot, registry } = page(); document.querySelector('input')!.addEventListener('input', e => { (e.target as HTMLInputElement).value = ''; });
    expect((await applyUserInput({ kind: 'SET_TEXT', ref: snapshot.controls[0].ref, value: '홍길동' }, registry)).error).toBe('SOURCE_REJECTED');
  });
  it('selects only a current option belonging to this control', async () => {
    const { snapshot, registry } = page('<form><label>수업<select><option value="math">수학</option><option value="music">음악</option></select></label><label>요일<select><option value="monday">월요일</option></select></label><button>신청</button></form>');
    const c = snapshot.controls[0];
    expect((await applyUserInput({ kind: 'SET_CHOICE', ref: c.ref, optionRef: c.options[1].ref }, registry)).status).toBe('APPLIED');
    expect(document.querySelector('select')!.value).toBe('music');
    expect((await applyUserInput({ kind: 'SET_CHOICE', ref: c.ref, optionRef: snapshot.controls[1].options[0].ref }, registry)).error).toBe('STALE_DOCUMENT');
  });
  it('uses actual radio click and checkbox onChange handlers', async () => {
    const { snapshot, registry } = page('<form><fieldset><legend>시간</legend><label><input type="radio" name="time" value="first">오전</label><label><input type="radio" name="time" value="second">오후</label></fieldset><button>신청</button></form>');
    const c = snapshot.controls[0]; let count = 0; document.querySelectorAll('input')[1].addEventListener('change', () => count++);
    expect((await applyUserInput({ kind: 'SET_CHOICE', ref: c.ref, optionRef: c.options[1].ref }, registry)).status).toBe('APPLIED'); expect(count).toBe(1);
  });
  it('reaches React checkbox, radio and select handlers without private framework APIs', async () => {
    let observed = '';
    function App() {
      const [agree, setAgree] = useState(false), [time, setTime] = useState('first'), [course, setCourse] = useState('math');
      observed = `${agree}/${time}/${course}`;
      return createElement('form', null,
        createElement('label', null, '동의', createElement('input', { type: 'checkbox', checked: agree, onChange: e => setAgree(e.currentTarget.checked) })),
        createElement('fieldset', null, createElement('legend', null, '시간'), ...['first','second'].map((value, i) => createElement('label', { key: value }, i ? '오후' : '오전', createElement('input', { type: 'radio', name: 'time', value, checked: time === value, onChange: e => setTime(e.currentTarget.value) })))),
        createElement('label', null, '수업', createElement('select', { value: course, onChange: e => setCourse((e.currentTarget as HTMLSelectElement).value) }, createElement('option', { value: 'math' }, '수학'), createElement('option', { value: 'music' }, '음악'))));
    }
    document.body.innerHTML = '<div id="root"></div>'; root = createRoot(document.querySelector('#root')!);
    await act(async () => root!.render(createElement(App)));
    const { snapshot, registry, blocked } = extractPage(document, { documentInstanceId: `d_${crypto.randomUUID()}` }); expect(blocked).toBeNull();
    const [checkbox, radio, select] = snapshot.controls;
    await act(async () => { expect((await applyUserInput({ kind: 'SET_CONSENT_FROM_USER', ref: checkbox.ref, checked: true }, registry)).status).toBe('APPLIED'); });
    await act(async () => { expect((await applyUserInput({ kind: 'SET_CHOICE', ref: radio.ref, optionRef: radio.options[1].ref }, registry)).status).toBe('APPLIED'); });
    await act(async () => { expect((await applyUserInput({ kind: 'SET_CHOICE', ref: select.ref, optionRef: select.options[1].ref }, registry)).status).toBe('APPLIED'); });
    expect(observed).toBe('true/second/music');
  });
  it('blocks review after a source value changes and is restored through native events', async () => {
    const { snapshot, registry } = page('<form><label>성명<input></label><button>신청</button></form>');
    const ref = snapshot.controls[1].ref, review = createReviewToken(ref, registry), input = document.querySelector('input')!;
    input.value = '홍길동'; input.dispatchEvent(new Event('input', { bubbles: true })); input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true }));
    expect((await invokeSource(ref, registry, 'submit', review)).error).toBe('STALE_DOCUMENT');
  });
  it('does not confuse duplicate option values', async () => {
    const { snapshot, registry } = page('<form><label>수업<select><option value="same">수학</option><option value="same">음악</option></select></label><button>신청</button></form>');
    const c = snapshot.controls[0];
    expect((await applyUserInput({ kind: 'SET_CHOICE', ref: c.ref, optionRef: c.options[1].ref }, registry)).error).toBe('AMBIGUOUS_TARGET');
  });
  it.each(['value','semantic','option','document','target'])('invalidates review token after %s revision change', async change => {
    const { snapshot, registry } = page('<form><label>성명<input></label><label>수업<select><option value="math">수학</option></select></label><button>신청</button></form>');
    const submit = snapshot.controls[2].ref, review = createReviewToken(submit, registry); let count = 0;
    document.querySelector('form')!.addEventListener('submit', e => { e.preventDefault(); count++; });
    if (change === 'value') document.querySelector('input')!.value = '홍길동';
    if (change === 'semantic') document.querySelector('input')!.required = true;
    if (change === 'option') document.querySelector('option')!.textContent = '변경';
    if (change === 'document') review.documentInstanceId = 'other';
    if (change === 'target') review.sourceActionRef = snapshot.controls[0].ref;
    expect((await invokeSource(submit, registry, 'submit', review)).error).toBe('STALE_DOCUMENT'); expect(count).toBe(0);
  });
  it('refuses missing review and native invalid form without clicking', async () => {
    const { snapshot, registry } = page(), r = snapshot.controls[2].ref;
    expect((await invokeSource(r, registry, 'submit')).error).toBe('STALE_DOCUMENT');
    expect((await invokeSource(r, registry, 'submit', createReviewToken(r, registry))).error).toBe('SOURCE_REJECTED');
  });
});

describe('structure fingerprints and cache rebind', () => {
  it('changes the key for a different form action and never caches private query URLs across documents', async () => {
    const a = page('<form action="/one"><button>신청</button></form>').snapshot;
    const b = page('<form action="/two"><button>신청</button></form>').snapshot;
    expect(await structuralFingerprint(a)).not.toBe(await structuralFingerprint(b));
    const c = page('<form action="/one?token=SECRET_QUERY"><button>신청</button></form>').snapshot;
    expect(JSON.stringify(c)).not.toContain('SECRET_QUERY');
    await expect(structuralFingerprint(c)).rejects.toMatchObject({ code: 'UNSUPPORTED_CONTROL' });
  });
  it('ignores document IDs, refs, decoration and private values, but changes for required/options/notices', async () => {
    const first = page('<form class="a"><label>성명<input value="FIRST_PRIVATE"></label><p>기한 안내</p><button>신청</button></form>').snapshot;
    const second = page('<form class="b"><label>성명<input value="SECOND_PRIVATE"></label><p>기한 안내</p><button>신청</button></form>').snapshot;
    expect(first.documentInstanceId).not.toBe(second.documentInstanceId); expect(await structuralFingerprint(first)).toBe(await structuralFingerprint(second));
    const third = page('<form><label>성명<input required></label><p>기한 안내</p><button>신청</button></form>').snapshot;
    expect(await structuralFingerprint(first)).not.toBe(await structuralFingerprint(third));
  });
  it('rebinds verified exact structures using current refs and rejects quarantined candidates', async () => {
    const { snapshot: old } = page(), p = plan(old);
    const blueprint: CachedBlueprint = { id: 'bp', schemaVersion: 1, cacheVersion: CACHE_VERSION, promptVersion: PROMPT_VERSION, model: 'test', origin: old.origin, fingerprint: await structuralFingerprint(old), status: 'VERIFIED', steps: p.steps.map(({ controlRefs, noticeRefs, ...s }) => ({ ...s, controlKeys: controlRefs.map(r => old.controls.find(c => c.ref === r)!.semanticKey), noticeKeys: noticeRefs.map(r => old.notices.find(n => n.ref === r)!.semanticKey) })), actionKey: old.controls.find(c => c.ref === p.sourceActionRef)!.semanticKey, locators: [], createdAt: 0 };
    const { snapshot, registry } = page(); const rebound = await rebindBlueprint(blueprint, snapshot, registry);
    expect(rebound.snapshotId).toBe(snapshot.snapshotId); expect(rebound.sourceActionRef).not.toBe(p.sourceActionRef);
    await expect(rebindBlueprint({ ...blueprint, status: 'QUARANTINED' }, snapshot, registry)).rejects.toMatchObject({ code: 'STALE_DOCUMENT' });
  });
});
