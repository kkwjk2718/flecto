// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { CACHE_VERSION, PROMPT_VERSION, type CachedBlueprint, type PagePlan, type PublicPageSnapshot } from '@flecto/contracts';
import { applyUserInput, extractPage, rebindBlueprint, refreshRegistry, structuralFingerprint, verifyPlan } from '@flecto/core';

// Representative markup from demo-benefits/src/views.ts layout/applicationForm.
// Keep this fixture local: worker tests do not depend on another checkout's code.
function benefits(decorations = false, initialOrder = '') {
  const prefix = decorations ? 'entry-random-' : '';
  const logout = '<form method="post" action="/logout"><input type="hidden" name="csrf" value="csrf-fixture"><button type="submit">로그아웃</button></form>';
  return `<a class="skip" href="#main">본문 바로가기</a><header>${decorations ? '' : logout}<nav><a href="${decorations ? '/history?sort=recent' : '/'}">${decorations ? '접수 내역' : '홈'}</a></nav></header>
    <main id="main" class="${decorations ? 'season-random' : 'content'}"><form method="post" action="/apply">
    <input type="hidden" name="formToken" value="form-token-fixture"><fieldset><legend>구매 정보</legend>
    <label for="${prefix}orderNumber">주문번호</label><input id="${prefix}orderNumber" name="orderNumber" value="${initialOrder}" required maxlength="80"><p class="hint">시연 주문 예: FLECTO-2026-001</p>
    <label for="${prefix}purchaseDate">구매일</label><input id="${prefix}purchaseDate" name="purchaseDate" type="date" required><p class="hint">시연 구매일: 2026년 9월 1일</p>
    <label for="${prefix}category">상품분류</label><select id="${prefix}category" name="category" required><option value="">선택해 주세요</option><option value="가전">가전</option><option value="생활">생활</option><option value="디지털">디지털</option></select></fieldset>
    <section class="notice" aria-labelledby="important-notice"><h2 id="important-notice">신청 전 꼭 확인해 주세요</h2><p>2026년 9월 구매 건만 신청할 수 있습니다. 신청 기한은 2026년 10월 7일 오후 6시입니다. 실제 포인트 지급은 없습니다.</p></section>
    <input id="${prefix}consent" name="consent" type="checkbox" value="yes" required><label for="${prefix}consent">위 신청 조건과 주문 정보 저장에 동의합니다. (필수)</label>
    <button type="submit">신청 내용 확인</button><a href="${decorations ? '/edit?draft=private-fixture#order' : '/'}">${decorations ? '입력 수정' : '다음에 신청하기'}</a></form></main>${decorations ? logout : ''}`;
}
function extractSelected() {
  const first = extractPage(document);
  const goalRef = first.snapshot.controls.find(c => c.label === '신청 내용 확인')!.ref;
  return extractPage(document, { goal: 'complete_form', goalRef });
}
function openPage(html = benefits()) {
  document.body.innerHTML = html;
  extractPage(document, { documentInstanceId: `d_${crypto.randomUUID()}` });
  return extractSelected();
}
function plan(snapshot: PublicPageSnapshot): PagePlan {
  const formRef = snapshot.controls.find(c => c.ref === snapshot.goalRef)!.formRef;
  const inputs = snapshot.controls.filter(c => c.formRef === formRef && c.actionKind === 'none');
  return { schemaVersion: 1, snapshotId: snapshot.snapshotId, sourceActionRef: snapshot.goalRef, steps: [
    { id: 'input', template: 'grouped_form', title: '구매 정보', controlRefs: inputs.filter(c => c.kind !== 'checkbox').map(c => c.ref), noticeRefs: snapshot.notices.filter(n => n.formRef === null || n.formRef === formRef).map(n => n.ref) },
    { id: 'consent', template: 'consent', title: '동의', controlRefs: inputs.filter(c => c.kind === 'checkbox').map(c => c.ref), noticeRefs: [] },
  ] };
}
afterEach(() => { document.body.innerHTML = ''; });

describe('CORE-02 benefits integration regressions', () => {
  it('fingerprints a selected application despite skip links/logout and remains stable when unrelated forms/navigation move', async () => {
    const first = openPage();
    expect(first.blocked).toBeNull();
    expect(verifyPlan(plan(first.snapshot), first.snapshot, first.registry)).toBeTruthy();
    const hash = await structuralFingerprint(first.snapshot);
    const second = openPage(benefits(true));
    expect(second.snapshot.controls.find(c => c.ref === second.snapshot.goalRef)!.semanticKey).not.toBe(first.snapshot.controls.find(c => c.ref === first.snapshot.goalRef)!.semanticKey);
    expect(await structuralFingerprint(second.snapshot)).toBe(hash);
    expect(verifyPlan(plan(second.snapshot), second.snapshot, second.registry)).toBeTruthy();
  });
  it('still rejects query-dependent selected actions and unselected whole-page query/fragment actions', async () => {
    const { snapshot } = openPage();
    await expect(structuralFingerprint({ ...snapshot, goalRef: null })).rejects.toMatchObject({ code: 'UNSUPPORTED_CONTROL' });
    document.querySelector('form[action="/apply"]')!.setAttribute('action', '/apply?token=private-fixture');
    const selected = extractSelected();
    await expect(structuralFingerprint(selected.snapshot)).rejects.toMatchObject({ code: 'UNSUPPORTED_CONTROL' });
  });
  it('rebinds selected-form blueprints after the unrelated logout form changes ordinal', async () => {
    const first = openPage().snapshot, sourcePlan = plan(first);
    const blueprint: CachedBlueprint = { id: 'benefits', schemaVersion: 1, cacheVersion: CACHE_VERSION, promptVersion: PROMPT_VERSION, model: 'fixture', origin: first.origin, fingerprint: await structuralFingerprint(first), status: 'VERIFIED', createdAt: 0, actionKey: first.controls.find(c => c.ref === sourcePlan.sourceActionRef)!.semanticKey, steps: sourcePlan.steps.map(({ controlRefs, noticeRefs, ...step }) => ({ ...step, controlKeys: controlRefs.map(r => first.controls.find(c => c.ref === r)!.semanticKey), noticeKeys: noticeRefs.map(r => first.notices.find(n => n.ref === r)!.semanticKey) })), locators: sourcePlan.steps.flatMap(s => s.controlRefs).map(r => { const c = first.controls.find(c => c.ref === r)!; return { key: c.semanticKey, kind: c.kind, required: c.required, formKey: c.semanticKey.split('|')[0] }; }) };
    const current = openPage(benefits(true));
    const rebound = await rebindBlueprint(blueprint, current.snapshot, current.registry);
    expect(rebound.sourceActionRef).toBe(current.snapshot.goalRef);
    expect(rebound.sourceActionRef).not.toBe(first.goalRef);
    expect(rebound.steps.flatMap(s => s.controlRefs).every(r => current.registry.bindings.has(r))).toBe(true);
  });
  it.each(['required', 'option', 'global notice'])('still changes the selected-form fingerprint for %s changes', async change => {
    const initial = openPage(), hash = await structuralFingerprint(initial.snapshot);
    if (change === 'required') document.querySelector<HTMLInputElement>('[name="orderNumber"]')!.required = false;
    if (change === 'option') document.querySelector<HTMLOptionElement>('option[value="가전"]')!.disabled = true;
    if (change === 'global notice') { const note = document.createElement('aside'); note.setAttribute('role', 'note'); note.textContent = '추가 자격 조건'; document.body.append(note); }
    expect(await structuralFingerprint(extractSelected().snapshot)).not.toBe(hash);
  });
  it('preserves the static public example and same-as-label choice after real user input', async () => {
    const { snapshot, registry } = openPage(), hash = await structuralFingerprint(snapshot);
    const order = snapshot.controls.find(c => c.label === '주문번호')!, category = snapshot.controls.find(c => c.label === '상품분류')!;
    const option = category.options.find(o => o.label === '가전')!;
    expect((await applyUserInput({ kind: 'SET_TEXT', ref: order.ref, value: 'FLECTO-2026-001' }, registry)).status).toBe('APPLIED');
    expect((await applyUserInput({ kind: 'SET_CHOICE', ref: category.ref, optionRef: option.ref }, registry)).status).toBe('APPLIED');
    expect(() => refreshRegistry(registry)).not.toThrow();
    const current = extractSelected();
    expect(current.snapshot.notices.some(n => n.text === '시연 주문 예: FLECTO-2026-001')).toBe(true);
    expect(current.snapshot.controls.find(c => c.label === '상품분류')!.options.map(o => o.label)).toEqual(['선택해 주세요', '가전', '생활', '디지털']);
    expect(await structuralFingerprint(current.snapshot)).toBe(hash);
  });
  it('retains first-scan privacy redaction, including an initially filled value equal to the example', () => {
    const { snapshot } = openPage(benefits(false, 'FLECTO-2026-001'));
    expect(JSON.stringify(snapshot)).not.toContain('FLECTO-2026-001');
    document.querySelector<HTMLInputElement>('[name="orderNumber"]')!.value = '';
    expect(JSON.stringify(extractSelected().snapshot)).not.toContain('FLECTO-2026-001');
  });
  it('redacts changed dynamic echoes on formerly public elements and invalidates the old DOM plan', async () => {
    const { snapshot, registry } = openPage(), order = snapshot.controls.find(c => c.label === '주문번호')!;
    await applyUserInput({ kind: 'SET_TEXT', ref: order.ref, value: 'UNKNOWN_PRIVATE_SENTINEL' }, registry);
    document.querySelector('p.hint')!.textContent = '입력한 주문: UNKNOWN_PRIVATE_SENTINEL';
    await expect(Promise.resolve().then(() => verifyPlan(plan(snapshot), snapshot, registry))).rejects.toMatchObject({ code: 'STALE_DOCUMENT' });
    const current = extractSelected();
    expect(JSON.stringify(current.snapshot)).not.toContain('UNKNOWN_PRIVATE_SENTINEL');
    expect(current.snapshot.notices.some(n => n.text === '입력한 주문: [비공개]')).toBe(true);
  });
  it('does not transfer public-text approval to a replacement element with identical text', async () => {
    const { snapshot, registry } = openPage(), order = snapshot.controls.find(c => c.label === '주문번호')!;
    await applyUserInput({ kind: 'SET_TEXT', ref: order.ref, value: 'FLECTO-2026-001' }, registry);
    const hint = document.querySelector('p.hint')!;
    hint.replaceWith(hint.cloneNode(true));
    expect(JSON.stringify(extractSelected().snapshot)).not.toContain('FLECTO-2026-001');
  });
  it('keeps whole-document verification even though fingerprints exclude unrelated source actions', async () => {
    const { snapshot, registry } = openPage(), hash = await structuralFingerprint(snapshot);
    document.querySelector('form[action="/logout"]')!.setAttribute('action', '/logout?changed=1');
    expect(() => refreshRegistry(registry)).toThrow();
    expect(() => verifyPlan(plan(snapshot), snapshot, registry)).toThrow();
    expect(await structuralFingerprint(extractSelected().snapshot)).toBe(hash);
  });
  it('keeps static radio/checkbox labels public regardless of their native selected values', async () => {
    const { snapshot, registry } = openPage(benefits().replace('</fieldset>', '<fieldset><legend>배송 선택</legend><label><input type="radio" name="delivery" value="방문" checked>방문</label><label><input type="radio" name="delivery" value="택배">택배</label></fieldset></fieldset>').replace('value="yes"', 'value="주문"'));
    const hash = await structuralFingerprint(snapshot), radio = snapshot.controls.find(c => c.kind === 'radio')!, checkbox = snapshot.controls.find(c => c.kind === 'checkbox')!;
    expect(radio.options.map(o => o.label)).toEqual(['방문', '택배']);
    expect(checkbox.label).toContain('주문');
    await applyUserInput({ kind: 'SET_CHOICE', ref: radio.ref, optionRef: radio.options[1].ref }, registry);
    await applyUserInput({ kind: 'SET_CONSENT_FROM_USER', ref: checkbox.ref, checked: true }, registry);
    expect(await structuralFingerprint(extractSelected().snapshot)).toBe(hash);
  });
});
