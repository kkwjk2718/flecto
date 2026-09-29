// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractPage } from '@flecto/core';
import { buildVisionCapturePlan, normalizeVisionAllowlist, withVisionIsolation, type VisionCapturePlan } from '../../apps/extension/src/content/vision';
import { validateVisionPlan } from '../../apps/extension/src/background/vision';

// jsdom has no layout: rects are explicit stubs per element (CSS px, viewport-relative).
const rects = new Map<Element, [number, number, number, number]>();
const place = (sel: string, r: [number, number, number, number]) => rects.set(document.querySelector(sel)!, r);
beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const [x, y, w, h] = rects.get(this) ?? [0, 0, 0, 0];
    return { x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON() { return {}; } } as DOMRect;
  });
});
afterEach(() => { vi.restoreAllMocks(); rects.clear(); document.body.innerHTML = ''; });

const ORIGIN = location.origin; // jsdom default: http://localhost:3000
const allow = [ORIGIN];
function page(extra = '', noticeExtra = '') {
  document.body.innerHTML = '<form id="f"><label id="lab">성명<input id="name" name="name"></label><p id="notice">신청 기한은 오늘입니다.' + noticeExtra + '</p><button id="go">신청</button></form>' + extra + '<div id="flecto-host"></div>';
  place('#f', [0, 0, 600, 300]); place('#lab', [10, 10, 300, 40]); place('#name', [100, 15, 200, 30]);
  place('#notice', [10, 60, 400, 24]); place('#go', [10, 100, 80, 40]); place('#flecto-host', [0, 0, 1024, 768]);
  const { snapshot, registry, blocked } = extractPage(document, { documentInstanceId: 'd_' + crypto.randomUUID() });
  const nameRef = snapshot.controls.find((c) => c.kind === 'text')?.ref;
  const noticeRef = snapshot.notices[0]?.ref;
  return { snapshot, registry, blocked, nameRef: nameRef!, noticeRef: noticeRef! };
}
const input = (p: ReturnType<typeof page>, over: Partial<Parameters<typeof buildVisionCapturePlan>[0]> = {}) => ({
  doc: document, registry: p.registry, snapshot: p.snapshot, reason: 'VISUAL_RELATION_AMBIGUOUS', refs: [p.nameRef, p.noticeRef], allowedOrigins: allow, ...over,
});

describe('VIS01 content capture plan', () => {
  it('builds a deterministic plan: only exact public label/notice text, all controls masked, values untouched', () => {
    const p = page();
    (document.getElementById('name') as HTMLInputElement).value = '홍길동';
    const result = buildVisionCapturePlan(input(p));
    expect(result.ok).toBe(true);
    const plan = (result as { plan: VisionCapturePlan }).plan;
    expect(plan.reason).toBe('VISUAL_RELATION_AMBIGUOUS');
    expect(plan.documentInstanceId).toBe(p.registry.documentInstanceId);
    expect(plan.publicRegions).toEqual([
      { ref: p.nameRef, kind: 'label', rect: { x: 10, y: 10, width: 300, height: 40 } },
      { ref: p.noticeRef, kind: 'notice', rect: { x: 10, y: 60, width: 400, height: 24 } },
    ]);
    expect(plan.privateMasks).toContainEqual({ x: 98, y: 13, width: 204, height: 34 });
    expect(plan.crop).toEqual({ x: 2, y: 2, width: 416, height: 90 });
    expect(validateVisionPlan(plan)).toBe(true);
    // The plan never contains control values or free text.
    expect(JSON.stringify(plan)).not.toContain('홍길동');
    expect(JSON.stringify(plan)).not.toContain('신청 기한');
    expect((document.getElementById('name') as HTMLInputElement).value).toBe('홍길동');
    // Same DOM + layout => structurally identical plan (used as the capture guard).
    expect(buildVisionCapturePlan(input(p))).toEqual(result);
  });

  it('masks radios/selects and keeps option labels only when text matches', () => {
    document.body.innerHTML = '<form id="f"><fieldset id="fs"><legend id="lg">요일</legend><label id="l1"><input type="radio" name="d" id="r1" value="mon">월</label><label id="l2"><input type="radio" name="d" id="r2" value="tue">화</label></fieldset><select id="s"><option>가</option></select><button>신청</button></form>';
    place('#f', [0, 0, 600, 300]); place('#fs', [0, 0, 400, 120]); place('#lg', [10, 5, 60, 20]); place('#l1', [10, 30, 80, 30]); place('#r1', [12, 35, 20, 20]);
    place('#l2', [100, 30, 80, 30]); place('#r2', [102, 35, 20, 20]); place('#s', [10, 150, 100, 30]);
    const { snapshot, registry } = extractPage(document, { documentInstanceId: 'd_' + crypto.randomUUID() });
    const radio = snapshot.controls.find((c) => c.kind === 'radio')!;
    const select = snapshot.controls.find((c) => c.kind === 'select')!;
    const result = buildVisionCapturePlan({ doc: document, registry, snapshot, reason: 'VISUAL_RELATION_AMBIGUOUS', refs: [radio.ref, select.ref], allowedOrigins: allow });
    expect(result.ok).toBe(true);
    const plan = (result as { plan: VisionCapturePlan }).plan;
    expect(plan.publicRegions.map((r) => r.kind)).toEqual(['label', 'option', 'option']);
    for (const box of [[12, 35], [102, 35], [10, 150]]) expect(plan.privateMasks.some((m) => m.x <= box[0] && m.y <= box[1] && m.x + m.width >= box[0] + 20 && m.y + m.height >= box[1] + 20)).toBe(true);
  });

  it('accepts only VISUAL_RELATION_AMBIGUOUS', () => {
    const p = page();
    for (const reason of ['AUTH_REQUIRED', 'STALE_DOCUMENT', 'AMBIGUOUS_TARGET', 'PROVIDER_ERROR', 'DEADLINE_EXCEEDED']) {
      expect(buildVisionCapturePlan(input(p, { reason }))).toEqual({ ok: false, code: 'REASON_NOT_ALLOWED' });
    }
  });

  it('requires an explicit loopback QA/DEMO allowlist', () => {
    expect(normalizeVisionAllowlist(['http://localhost:4174', 'http://127.0.0.1:4173', 'https://localhost:4174', 'http://example.com:80', 'http://localhost', 'http://localhost:4174/path', '*'])).toEqual(['http://localhost:4174', 'http://127.0.0.1:4173']);
    const p = page();
    expect(buildVisionCapturePlan(input(p, { allowedOrigins: [] }))).toEqual({ ok: false, code: 'ORIGIN_NOT_ALLOWED' });
    expect(buildVisionCapturePlan(input(p, { allowedOrigins: ['http://127.0.0.1:3000'] }))).toEqual({ ok: false, code: 'ORIGIN_NOT_ALLOWED' });
  });

  it('never falls back on auth, unsupported, stale, missing or unknown refs', () => {
    const auth = page('<input type="password" id="pw">');
    expect(auth.blocked).toBe('AUTH_REQUIRED');
    expect(buildVisionCapturePlan(input(auth, { refs: ['e_x'] }))).toMatchObject({ ok: false, code: 'REGISTRY_BLOCKED', registryError: 'AUTH_REQUIRED' });

    const captcha = page('<div class="g-recaptcha" id="cap">x</div>');
    expect(buildVisionCapturePlan(input(captcha, { refs: ['e_x'] }))).toMatchObject({ ok: false, code: 'REGISTRY_BLOCKED', registryError: 'UNSUPPORTED_CONTROL' });

    const stale = page();
    const extra = document.createElement('label'); extra.innerHTML = '연락처<input required>'; document.getElementById('f')!.appendChild(extra);
    expect(buildVisionCapturePlan(input(stale))).toMatchObject({ ok: false, code: 'REGISTRY_BLOCKED', registryError: 'STALE_DOCUMENT' });

    const p = page();
    expect(buildVisionCapturePlan(input(p, { refs: ['e_not_in_registry'] }))).toEqual({ ok: false, code: 'REF_UNKNOWN' });
    expect(buildVisionCapturePlan(input(p, { refs: [] }))).toEqual({ ok: false, code: 'REF_UNKNOWN' });
    expect(buildVisionCapturePlan(input(p, { refs: [p.nameRef, p.nameRef] }))).toEqual({ ok: false, code: 'REF_UNKNOWN' });
  });

  it('rejects off-viewport refs and NaN geometry instead of clamping', () => {
    const p = page();
    place('#notice', [10, 900, 400, 24]);
    expect(buildVisionCapturePlan(input(p))).toEqual({ ok: false, code: 'OFF_VIEWPORT' });
    place('#notice', [10, NaN, 400, 24]);
    expect(buildVisionCapturePlan(input(p)).ok).toBe(false);
  });

  it('treats any DOM mutation after extraction (e.g. an inserted image) as stale', () => {
    const p = page();
    document.getElementById('notice')!.appendChild(document.createElement('img'));
    expect(buildVisionCapturePlan(input(p))).toMatchObject({ ok: false, code: 'REGISTRY_BLOCKED', registryError: 'STALE_DOCUMENT' });
  });

  it('rejects private echo text, unknown images and unsafe overlap', () => {
    const echo = page();
    (document.getElementById('name') as HTMLInputElement).value = '오늘입니다';
    expect(buildVisionCapturePlan(input(echo))).toEqual({ ok: false, code: 'PRIVATE_ECHO' });

    const image = page('', '<img alt="">');
    expect(buildVisionCapturePlan(input(image, { refs: [image.noticeRef] }))).toEqual({ ok: false, code: 'UNKNOWN_IMAGE' });

    const overlap = page('<div id="float">팝업</div>');
    place('#float', [300, 65, 200, 10]);
    expect(buildVisionCapturePlan(input(overlap))).toEqual({ ok: false, code: 'UNSAFE_OVERLAP' });
  });

  it('rejects a label whose raw text no longer equals the sanitized snapshot text', () => {
    const p = page();
    // A sibling text node appears in the label without a semantic rescan of the label text.
    const snapshot = { ...p.snapshot, controls: p.snapshot.controls.map((c) => c.ref === p.nameRef ? { ...c, label: '성명 [비공개]' } : c) };
    expect(buildVisionCapturePlan(input(p, { snapshot }))).toEqual({ ok: false, code: 'TEXT_MISMATCH' });
  });
});

describe('VIS01 capture isolation', () => {
  it('hides only the FLECTO host during capture and restores style, focus and values', async () => {
    const p = page();
    const host = document.getElementById('flecto-host')!;
    host.style.setProperty('opacity', '0.9');
    const field = document.getElementById('name') as HTMLInputElement;
    field.value = '비공개값'; field.focus();
    const plan = (buildVisionCapturePlan(input(p)) as { plan: VisionCapturePlan }).plan;
    const seen: string[] = [];
    const result = await withVisionIsolation(document, plan, async () => {
      seen.push(host.style.getPropertyValue('opacity'), host.style.getPropertyPriority('opacity'));
      const overlay = document.querySelector('[data-flecto-private="vision-mask"]');
      seen.push(String(overlay?.children.length));
      // The overlay must not create a semantic change for the current registry.
      const rebuilt = buildVisionCapturePlan(input(p));
      seen.push(String(rebuilt.ok));
      return 'captured';
    }, { domMaskOverlay: true, nextPaint: async () => undefined });
    expect(result).toEqual({ ok: true, value: 'captured' });
    expect(seen).toEqual(['0', 'important', String(plan.privateMasks.length), 'true']);
    expect(host.style.getPropertyValue('opacity')).toBe('0.9');
    expect(host.style.getPropertyPriority('opacity')).toBe('');
    expect(document.querySelector('[data-flecto-private]')).toBeNull();
    expect(document.activeElement).toBe(field);
    expect(field.value).toBe('비공개값');
  });

  it('restores on failure and fails closed when state changed during capture', async () => {
    const p = page();
    const host = document.getElementById('flecto-host')!;
    const plan = (buildVisionCapturePlan(input(p)) as { plan: VisionCapturePlan }).plan;
    const failed = await withVisionIsolation(document, plan, async () => { throw new Error('boom'); }, { nextPaint: async () => undefined });
    expect(failed).toEqual({ ok: false, code: 'ISOLATION_FAILED' });
    expect(host.getAttribute('style') ?? '').not.toContain('opacity');
    const changed = await withVisionIsolation(document, plan, async () => { (document.getElementById('name') as HTMLInputElement).value = 'typed'; return 1; }, { nextPaint: async () => undefined });
    expect(changed).toEqual({ ok: false, code: 'STATE_CHANGED' });
  });
});
