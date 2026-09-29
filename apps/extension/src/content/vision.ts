// VIS01 — content-side privacy preparation for the optional visual fallback.
//
// This module never captures pixels. It only derives a deterministic, CSS-pixel
// capture plan from the CURRENT PrivateBindingRegistry + PublicPageSnapshot:
//   * crop       — viewport-bounded box around the ambiguous DOM references
//   * publicRegions — label/notice/option text boxes whose raw text equals the
//                  sanitized snapshot text exactly (everything else stays white)
//   * privateMasks  — every visible form control, [data-private]/[data-flecto-private],
//                  result/live areas and editable content inside the crop
// The background module (../background/vision.ts) re-validates the plan, captures
// the active tab, and paints only the allowed regions with masks on top.
//
// Fail closed: any auth/captcha/stale/missing/unknown-image/overlap condition
// yields { ok: false } and nothing is captured. Values and focus are never written.
import { FlectoError, type PrivateBindingRegistry, type PublicPageSnapshot } from '@flecto/contracts';
import { refreshRegistry } from '@flecto/core';

export const VISION_PLAN_VERSION = 1 as const;
export const VISION_REASON = 'VISUAL_RELATION_AMBIGUOUS' as const;
export const VISION_MAX_REFS = 12;
export const VISION_MAX_REGIONS = 40;
export const VISION_MAX_MASKS = 200;
const MASK_PAD = 2;
const CROP_MARGIN = 8;

export type VisionRect = { x: number; y: number; width: number; height: number };
export type VisionRegion = { ref: string; kind: 'label' | 'notice' | 'option' | 'action'; rect: VisionRect };
export type VisionCapturePlan = {
  version: typeof VISION_PLAN_VERSION;
  reason: typeof VISION_REASON;
  origin: string;
  documentInstanceId: string; snapshotId: string;
  semanticRevision: number; optionRevision: number; privateValueRevision: number;
  /** CSS viewport (window.innerWidth/innerHeight) and devicePixelRatio (includes zoom). */
  viewport: { width: number; height: number; devicePixelRatio: number; scrollX: number; scrollY: number };
  refs: string[];
  crop: VisionRect;
  publicRegions: VisionRegion[];
  privateMasks: VisionRect[];
};
export type VisionRejectCode =
  | 'REASON_NOT_ALLOWED' | 'ORIGIN_NOT_ALLOWED' | 'SNAPSHOT_MISMATCH' | 'REGISTRY_BLOCKED'
  | 'REF_UNKNOWN' | 'REF_NOT_VISIBLE' | 'OFF_VIEWPORT' | 'BAD_GEOMETRY' | 'TEXT_MISMATCH'
  | 'PRIVATE_ECHO' | 'UNKNOWN_IMAGE' | 'UNSAFE_OVERLAP' | 'NO_PUBLIC_REGION' | 'TOO_LARGE'
  | 'STATE_CHANGED' | 'ISOLATION_FAILED';
export type VisionPlanResult = { ok: true; plan: VisionCapturePlan } | { ok: false; code: VisionRejectCode; registryError?: string };
export type VisionPlanInput = {
  doc: Document;
  registry: PrivateBindingRegistry;
  snapshot: PublicPageSnapshot;
  /** Only VISUAL_RELATION_AMBIGUOUS is accepted; any other code is rejected. */
  reason: string;
  /** Snapshot refs (controls, options or notices) whose visual relation is ambiguous. */
  refs: readonly string[];
  /** Explicit QA/DEMO allowlist. Only http://localhost:<port> or http://127.0.0.1:<port>. */
  allowedOrigins: readonly string[];
};

const PRIVATE_SELECTOR = 'input:not([type="hidden"]),textarea,select,[data-private],[data-flecto-private],[contenteditable]:not([contenteditable="false"]),output,[role="status"],[role="log"],[aria-live]:not([aria-live="off"]),[data-flecto-result]';
const IMAGE_SELECTOR = 'img,svg,canvas,video,picture,object,embed,iframe,image,input[type="image"]';
const HOST_ID = 'flecto-host';
/** Unknown text boxes are grown by this much before the region test (glyph overhang). */
const TEXT_PAD = 1;
/** Mask overlays created by withVisionIsolation. Identity only: a page attribute can never opt out of masking. */
const OWN_OVERLAYS = new WeakSet<Element>();

class Reject extends Error { constructor(readonly code: VisionRejectCode, readonly registryError?: string) { super(code); } }
const fail = (code: VisionRejectCode): never => { throw new Reject(code); };
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Validates the QA/DEMO allowlist; non-loopback, https, path or credential entries are dropped. */
export function normalizeVisionAllowlist(entries: readonly string[]): string[] {
  const out: string[] = [];
  for (const entry of entries) {
    try {
      const u = new URL(entry);
      if (u.protocol !== 'http:' || u.origin !== entry || !u.port) continue;
      if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') continue;
      out.push(u.origin);
    } catch { /* ignore */ }
  }
  return out;
}

function inPrivate(e: Element): boolean { return !!e.closest('#' + HOST_ID + ',[data-private],[data-flecto-private]'); }
/** Password, one-time-code and payment-card inputs. Their values are never read here. */
function isSensitive(e: Element): boolean {
  if (e.tagName !== 'INPUT') return false;
  return (e as HTMLInputElement).type === 'password' || /(^|\s)(one-time-code|current-password|new-password|cc-[a-z-]+)(\s|$)/i.test(e.getAttribute('autocomplete') ?? '');
}
function sensitiveControl(doc: Document): boolean {
  return Array.from(doc.querySelectorAll('input')).some((e) => !ours(e) && isSensitive(e));
}
/** FLECTO's own host (hidden during capture) or one of its capture-time mask overlays. */
function ours(e: Element): boolean {
  if (e.closest('#' + HOST_ID)) return true;
  for (let n: Element | null = e; n; n = n.parentElement) if (OWN_OVERLAYS.has(n)) return true;
  return false;
}
function visible(e: Element): boolean {
  if (inPrivate(e)) return false;
  for (let n: Element | null = e; n; n = n.parentElement) {
    if (n.hasAttribute('hidden') || n.getAttribute('aria-hidden') === 'true' || n.hasAttribute('inert')) return false;
    const st = n.ownerDocument.defaultView?.getComputedStyle(n);
    if (st && (st.display === 'none' || st.visibility === 'hidden' || st.visibility === 'collapse' || st.opacity === '0')) return false;
  }
  return true;
}
/**
 * Conservative paint test for UNKNOWN content. True unless Chrome certainly paints
 * nothing: display:none or opacity:0 on the element or an ancestor. hidden/aria-hidden/
 * inert are ignored on purpose (CSS can still paint them); visibility is checked by the
 * caller on the element that owns the pixels because descendants may override it.
 */
function suppressed(e: Element | null, win: Window, cache: Map<Element, boolean>): boolean {
  if (!e) return false;
  const known = cache.get(e);
  if (known !== undefined) return known;
  const st = win.getComputedStyle(e);
  const out = st.display === 'none' || Number.parseFloat(st.opacity) === 0 || suppressed(e.parentElement, win, cache);
  cache.set(e, out);
  return out;
}
const hiddenVisibility = (st: CSSStyleDeclaration) => st.visibility === 'hidden' || st.visibility === 'collapse';
const noneValue = (v: string | null | undefined) => !v || v === 'none' || v === 'initial';
function hasImage(st: CSSStyleDeclaration): boolean {
  return !noneValue(st.backgroundImage) || !noneValue(st.borderImageSource) || (!!st.display?.includes('list-item') && !noneValue(st.listStyleImage));
}
/** Computed style of a generated ::before/::after/::marker box, or null when none is generated. */
function pseudoBox(win: Window, e: Element, pseudo: string): CSSStyleDeclaration | null {
  let st: CSSStyleDeclaration | null = null;
  try { st = win.getComputedStyle(e, pseudo); } catch { return null; }
  const content = st?.content ?? '';
  return !content || content === 'none' || content === 'normal' ? null : st;
}
const hasGeneratedText = (st: CSSStyleDeclaration) => st.content !== '""' && st.content !== "''";
/**
 * Conservative extra paint extent (CSS px) of a computed shadow list (text-shadow,
 * box-shadow, drop-shadow() arguments): 3x the sum of all lengths. Infinity when any
 * token cannot be bounded (non-px unit, unknown syntax).
 */
function shadowExtent(value: string | null | undefined): number {
  if (!value || value === 'none') return 0;
  let sum = 0;
  for (const token of value.replace(/[a-z-]+\([^()]*\)/gi, ' ').split(/[\s,]+/).filter(Boolean)) {
    const px = /^(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)px$/i.exec(token);
    if (px) { sum += Math.abs(Number(px[1])); continue; }
    if (/^-?0*\.?0+$/.test(token) || /^[a-z-]+$/i.test(token) || /^#[0-9a-f]{3,8}$/i.test(token)) continue;
    return Infinity;
  }
  return Number.isFinite(sum) ? 3 * sum : Infinity;
}
/**
 * True when e or an ancestor is transformed, scaled, rotated or zoomed. CSS-length bounds
 * (box-shadow, list markers) no longer hold in viewport px there, so callers fail closed.
 */
function transformed(e: Element | null, win: Window, cache: Map<Element, boolean>): boolean {
  if (!e) return false;
  const known = cache.get(e);
  if (known !== undefined) return known;
  const st = win.getComputedStyle(e);
  const zoom = st.zoom;
  const out = !noneValue(st.transform) || !noneValue(st.scale) || !noneValue(st.rotate) || (!!zoom && zoom !== '1' && zoom !== 'normal') || transformed(e.parentElement, win, cache);
  cache.set(e, out);
  return out;
}
function hasMarker(win: Window, e: Element, st: CSSStyleDeclaration): boolean {
  if (!st.display?.includes('list-item')) return false;
  return (!!st.listStyleType && st.listStyleType !== 'none') || !noneValue(st.listStyleImage) || !!pseudoBox(win, e, '::marker');
}
/** Elements allowed to attach an author shadow root (plus any custom element). */
const SHADOW_CAPABLE = new Set(['ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BODY', 'DIV', 'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'MAIN', 'NAV', 'P', 'SECTION', 'SPAN']);
/** True for an element that holds (or, as a custom element, may hold) shadow content we cannot measure. */
function shadowHost(e: Element): boolean {
  if (e.namespaceURI === 'http://www.w3.org/1999/xhtml' && e.localName.includes('-')) return true;
  if (e.shadowRoot) return true;
  if (!SHADOW_CAPABLE.has(e.tagName)) return false;
  // Content scripts can see closed roots too; elsewhere only open roots are visible.
  const dom = (globalThis as unknown as { chrome?: { dom?: { openOrClosedShadowRoot?: (el: HTMLElement) => ShadowRoot | null } } }).chrome?.dom;
  try { return !!dom?.openOrClosedShadowRoot?.(e as HTMLElement); } catch { return true; }
}
const grow = (r: VisionRect, dx: number, dy = dx): VisionRect => ({ x: r.x - dx, y: r.y - dy, width: r.width + 2 * dx, height: r.height + 2 * dy });
/** Text nodes counted by rawText(): the only text allowed to paint inside a public region. */
function approvedText(e: Element, out: Set<Node>): void {
  for (const n of Array.from(e.childNodes)) {
    if (n.nodeType === 3) out.add(n);
    else if (n.nodeType === 1 && !(n as Element).matches('input,textarea,select,script,style,template')) approvedText(n as Element, out);
  }
}
/** Painted line boxes of a text node (viewport CSS px). Missing Range geometry fails closed. */
function textRects(doc: Document, node: Node): VisionRect[] {
  const range = doc.createRange();
  if (typeof range.getClientRects !== 'function') fail('BAD_GEOMETRY');
  range.selectNodeContents(node);
  return Array.from(range.getClientRects(), (r) => ({ x: r.left, y: r.top, width: r.width, height: r.height }));
}
/** Same text rule as core extraction: text nodes, skipping form controls. */
function rawText(e: Element): string {
  return Array.from(e.childNodes).map((n) => n.nodeType === 3 ? n.textContent ?? '' : n.nodeType === 1 && !(n as Element).matches('input,textarea,select,script,style,template') ? rawText(n as Element) : '').join(' ');
}
function rectOf(e: Element): VisionRect {
  const r = e.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}
const finite = (r: VisionRect) => [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.width >= 0 && r.height >= 0;
const inside = (r: VisionRect, o: VisionRect) => r.x >= o.x - 0.5 && r.y >= o.y - 0.5 && r.x + r.width <= o.x + o.width + 0.5 && r.y + r.height <= o.y + o.height + 0.5;
function intersect(a: VisionRect, b: VisionRect): VisionRect | null {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.width, b.x + b.width), btm = Math.min(a.y + a.height, b.y + b.height);
  return r - x > 0.5 && btm - y > 0.5 ? { x, y, width: r - x, height: btm - y } : null;
}
const round = (r: VisionRect): VisionRect => ({ x: +r.x.toFixed(2), y: +r.y.toFixed(2), width: +r.width.toFixed(2), height: +r.height.toFixed(2) });

function privateValues(doc: Document): string[] {
  const values = new Set<string>();
  for (const e of Array.from(doc.querySelectorAll<HTMLInputElement>('input,textarea'))) {
    if (ours(e) || isSensitive(e)) continue;
    if (e.matches('input[type="submit"],input[type="button"],input[type="radio"],input[type="checkbox"],input[type="hidden"]')) continue;
    if (e.value && norm(e.value).length >= 2) values.add(norm(e.value));
  }
  return [...values];
}

function checkNoImage(e: Element): void {
  const win = e.ownerDocument.defaultView;
  if (!win) fail('UNKNOWN_IMAGE');
  const all = [e, ...Array.from(e.querySelectorAll('*'))];
  for (const n of all) {
    if (n.matches(IMAGE_SELECTOR)) fail('UNKNOWN_IMAGE');
    if (hasImage(win!.getComputedStyle(n))) fail('UNKNOWN_IMAGE');
    for (const pseudo of ['::before', '::after']) {
      const box = pseudoBox(win!, n, pseudo);
      if (box && (hasGeneratedText(box) || hasImage(box))) fail('UNKNOWN_IMAGE');
    }
  }
}

/**
 * Ancestors paint beneath and around an approved box, so only plain colors/borders are
 * allowed there. Their own direct text is measured separately (unknown-text pass), so a
 * normal <body> that merely CONTAINS the label is not rejected.
 */
function checkAncestors(e: Element, region: VisionRect): void {
  const win = e.ownerDocument.defaultView;
  if (!win) fail('UNSAFE_OVERLAP');
  for (let n = e.parentElement; n; n = n.parentElement) {
    const st = win!.getComputedStyle(n);
    if (hasImage(st)) fail('UNKNOWN_IMAGE');
    // Filters/reflections re-paint the whole subtree (private controls included) elsewhere;
    // markers (inside or outside) and shadow content are unmeasured generated paint.
    if (!noneValue(st.filter) || !noneValue(st.backdropFilter) || !noneValue(st.getPropertyValue('-webkit-backdrop-filter'))) fail('UNSAFE_OVERLAP');
    if (!noneValue(st.getPropertyValue('-webkit-box-reflect'))) fail('UNSAFE_OVERLAP');
    if (hasMarker(win!, n, st) || shadowHost(n)) fail('UNSAFE_OVERLAP');
    // An outer box-shadow is clipped to outside the border box: safe only if the region lies inside it.
    if (!noneValue(st.boxShadow) && (/\binset\b/i.test(st.boxShadow) || transformed(n, win!, new Map()) || !inside(region, rectOf(n)))) fail('UNSAFE_OVERLAP');
    for (const pseudo of ['::before', '::after', '::marker']) {
      const box = pseudoBox(win!, n, pseudo);
      if (!box) continue;
      if (hasImage(box)) fail('UNKNOWN_IMAGE');
      if (hasGeneratedText(box)) fail('UNSAFE_OVERLAP');
    }
  }
}

type RegionSource = { ref: string; kind: VisionRegion['kind']; elements: Element[]; expected: string };

function regionSources(doc: Document, registry: PrivateBindingRegistry, snapshot: PublicPageSnapshot, ref: string): { anchor: Element; sources: RegionSource[] } {
  const control = snapshot.controls.find((c) => c.ref === ref);
  if (control) {
    const binding = registry.bindings.get(ref);
    if (!binding || binding.ref !== ref) fail('REF_UNKNOWN');
    const e = binding!.element;
    const sources: RegionSource[] = [];
    if (control.kind === 'radio') {
      const legend = e.closest('fieldset')?.querySelector('legend');
      if (legend && norm(legend.textContent ?? '') === control.label) sources.push({ ref, kind: 'label', elements: [legend], expected: control.label });
    } else if (e.matches('button,a[href]')) {
      sources.push({ ref, kind: 'action', elements: [e], expected: control.label });
    } else {
      const ids = e.getAttribute('aria-labelledby')?.split(/\s+/).filter(Boolean);
      const labelled = ids?.length ? ids.map((id) => doc.getElementById(id)).filter((n): n is HTMLElement => !!n) : e.hasAttribute('aria-label') ? [] : Array.from((e as HTMLInputElement).labels ?? []);
      if (labelled.length) sources.push({ ref, kind: 'label', elements: labelled, expected: control.label });
    }
    for (const option of control.options) {
      const o = registry.options.get(option.ref);
      if (!o) fail('REF_UNKNOWN');
      if (o!.tagName === 'INPUT') {
        const labels = Array.from((o as HTMLInputElement).labels ?? []);
        if (labels.length) sources.push({ ref: option.ref, kind: 'option', elements: labels, expected: option.label });
      }
    }
    return { anchor: e, sources };
  }
  const notice = snapshot.notices.find((n) => n.ref === ref);
  if (notice) {
    const e = registry.notices.get(ref);
    if (!e) fail('REF_UNKNOWN');
    return { anchor: e!, sources: [{ ref, kind: 'notice', elements: [e!], expected: notice.text }] };
  }
  for (const c of snapshot.controls) {
    const option = c.options.find((o) => o.ref === ref);
    if (!option) continue;
    const o = registry.options.get(ref);
    if (!o) fail('REF_UNKNOWN');
    if (o!.tagName === 'OPTION') return { anchor: o!.closest('select') ?? fail('REF_UNKNOWN'), sources: [] };
    const labels = Array.from((o as HTMLInputElement).labels ?? []);
    return { anchor: o!, sources: labels.length ? [{ ref, kind: 'option', elements: labels, expected: option.label }] : [] };
  }
  return fail('REF_UNKNOWN');
}

/**
 * Builds a deterministic capture plan. Call again (same input) as the capture
 * guard: the background compares the rebuilt plan structurally before and after
 * captureVisibleTab and fails closed on any difference (scroll, layout, revision).
 */
export function buildVisionCapturePlan(input: VisionPlanInput): VisionPlanResult {
  try { return { ok: true, plan: build(input) }; }
  catch (error) {
    if (error instanceof Reject) return { ok: false, code: error.code, ...(error.registryError ? { registryError: error.registryError } : {}) };
    return { ok: false, code: 'BAD_GEOMETRY' };
  }
}

function build({ doc, registry, snapshot, reason, refs, allowedOrigins }: VisionPlanInput): VisionCapturePlan {
  if (reason !== VISION_REASON) fail('REASON_NOT_ALLOWED');
  const win = doc.defaultView;
  if (!win) fail('SNAPSHOT_MISMATCH');
  const origin = doc.location.origin;
  if (!normalizeVisionAllowlist(allowedOrigins).includes(origin) || snapshot.origin !== origin) fail('ORIGIN_NOT_ALLOWED');
  try { refreshRegistry(registry); }
  catch (error) { throw new Reject('REGISTRY_BLOCKED', error instanceof FlectoError ? error.code : 'UNKNOWN'); }
  // Password/OTP/card fields: never read, never captured.
  if (sensitiveControl(doc)) throw new Reject('REGISTRY_BLOCKED', 'AUTH_REQUIRED');
  if (snapshot.documentInstanceId !== registry.documentInstanceId || snapshot.semanticRevision !== registry.semanticRevision || snapshot.optionRevision !== registry.optionRevision) fail('SNAPSHOT_MISMATCH');
  const uniq = [...new Set(refs)];
  if (!uniq.length || uniq.length !== refs.length || uniq.length > VISION_MAX_REFS) fail('REF_UNKNOWN');

  const viewport = { x: 0, y: 0, width: win!.innerWidth, height: win!.innerHeight };
  const dpr = win!.devicePixelRatio;
  if (!finite(viewport) || viewport.width < 1 || viewport.height < 1 || !(dpr > 0) || !Number.isFinite(dpr) || dpr > 8) fail('BAD_GEOMETRY');

  const anchors: VisionRect[] = [];
  const sources: RegionSource[] = [];
  for (const ref of uniq) {
    const { anchor, sources: s } = regionSources(doc, registry, snapshot, ref);
    if (!anchor.isConnected || !visible(anchor)) fail('REF_NOT_VISIBLE');
    const r = rectOf(anchor);
    if (!finite(r) || r.width < 1 || r.height < 1) fail('REF_NOT_VISIBLE');
    if (!inside(r, viewport)) fail('OFF_VIEWPORT');
    anchors.push(r);
    sources.push(...s);
  }

  const secrets = privateValues(doc);
  const regions: { region: VisionRegion; element: Element }[] = [];
  for (const source of sources) {
    const joined = norm(source.elements.map((e) => norm(rawText(e))).join(' '));
    if (joined !== source.expected) fail('TEXT_MISMATCH');
    if (secrets.some((v) => joined.includes(v))) fail('PRIVATE_ECHO');
    for (const e of source.elements) {
      if (!e.isConnected || !visible(e)) fail('REF_NOT_VISIBLE');
      checkNoImage(e);
      const r = rectOf(e);
      if (!finite(r)) fail('BAD_GEOMETRY');
      if (r.width < 1 || r.height < 1) continue;
      if (!inside(r, viewport)) fail('OFF_VIEWPORT');
      regions.push({ region: { ref: source.ref, kind: source.kind, rect: round(r) }, element: e });
    }
  }
  if (!regions.length) fail('NO_PUBLIC_REGION');
  if (regions.length > VISION_MAX_REGIONS) fail('TOO_LARGE');

  const all = [...anchors, ...regions.map((r) => r.region.rect)];
  const minX = Math.min(...all.map((r) => r.x)) - CROP_MARGIN, minY = Math.min(...all.map((r) => r.y)) - CROP_MARGIN;
  const maxX = Math.max(...all.map((r) => r.x + r.width)) + CROP_MARGIN, maxY = Math.max(...all.map((r) => r.y + r.height)) + CROP_MARGIN;
  const crop = intersect({ x: minX, y: minY, width: maxX - minX, height: maxY - minY }, viewport);
  if (!crop) fail('BAD_GEOMETRY');

  // Masks: every private/control element that touches the crop, padded for focus rings.
  const maskElements = Array.from(doc.querySelectorAll(PRIVATE_SELECTOR)).filter((e) => !ours(e));
  const masks: VisionRect[] = [];
  for (const e of maskElements) {
    const r = rectOf(e);
    if (!finite(r)) fail('BAD_GEOMETRY');
    const padded = intersect({ x: r.x - MASK_PAD, y: r.y - MASK_PAD, width: r.width + 2 * MASK_PAD, height: r.height + 2 * MASK_PAD }, crop!);
    if (padded && r.width > 0 && r.height > 0) masks.push(round(padded));
  }
  if (masks.length > VISION_MAX_MASKS) fail('TOO_LARGE');

  // Overlap. Inside an allowed region only the approved source subtree (text-checked,
  // image-free), plain ancestor colors, and pixels fully under a private mask may paint.
  // Everything else is unknown and fails closed.
  const covered = (hit: VisionRect) => privateMasksCover(masks, hit);
  const cache = new Map<Element, boolean>();
  const tcache = new Map<Element, boolean>();
  for (const { element, region } of regions) checkAncestors(element, region.rect);
  // Extra paint of element e may cover any region it does not contain (contained ones: checkAncestors).
  const spill = (e: Element, area: VisionRect) => {
    for (const { region, element } of regions) {
      if (e === element || e.contains(element)) continue;
      const hit = intersect(area, region.rect);
      if (hit && !covered(hit)) fail('UNSAFE_OVERLAP');
    }
  };
  // Elements that are, contain, or sit inside private content never count as approved paint.
  const privateAncestry = new Set<Element>();
  for (const m of maskElements) for (let n: Element | null = m; n; n = n.parentElement) privateAncestry.add(n);
  const others = Array.from(doc.documentElement.querySelectorAll('*')).filter((e) => !ours(e) && !['OPTION', 'OPTGROUP', 'BR'].includes(e.tagName));
  for (const e of others) {
    if (suppressed(e, win!, cache)) continue;
    const st = win!.getComputedStyle(e);
    const r = rectOf(e);
    if (!finite(r)) fail('BAD_GEOMETRY');
    if (!hiddenVisibility(st)) {
      for (const { region, element } of regions) {
        // Ancestors: own paint checked by checkAncestors + the text pass. Descendants: rawText + checkNoImage.
        if (e === element || e.contains(element) || element.contains(e)) continue;
        const hit = intersect(r, region.rect);
        if (hit && !covered(hit)) fail('UNSAFE_OVERLAP');
      }
    }
    const inApproved = regions.some(({ element }) => element === e || element.contains(e));
    // Effects that re-paint content elsewhere are never bounded heuristically: any painted
    // filter, backdrop filter or reflection, and any text-shadow on a form control, fails closed.
    if (!noneValue(st.filter) || !noneValue(st.backdropFilter) || !noneValue(st.getPropertyValue('-webkit-backdrop-filter')) || !noneValue(st.getPropertyValue('-webkit-box-reflect'))) fail('UNSAFE_OVERLAP');
    if (e.matches('input,textarea,select') && !noneValue(st.textShadow)) fail('UNSAFE_OVERLAP');
    // Shadow content escapes every pass here; only contain:paint bounds it to the host box.
    if (shadowHost(e) && (inApproved || !/\b(paint|strict|content)\b/.test(st.contain ?? ''))) fail('UNSAFE_OVERLAP');
    if (hasMarker(win!, e, st)) {
      if (inApproved || pseudoBox(win!, e, '::marker') || transformed(e, win!, tcache)) fail('UNSAFE_OVERLAP');
      const font = Number.parseFloat(st.fontSize) || 16;
      spill(e, grow(r, 3 * font, font)); // outside markers sit beside the first line box
    }
    // box-shadow paints only a color in the box's shape (no page content), so it keeps a
    // bound; a transformed chain or an unparsable value fails closed.
    if (!noneValue(st.boxShadow) && (!inApproved || privateAncestry.has(e) || e.closest(PRIVATE_SELECTOR))) {
      const ext = shadowExtent(st.boxShadow);
      if (!Number.isFinite(ext) || transformed(e, win!, tcache)) fail('UNSAFE_OVERLAP');
      spill(e, grow(r, ext));
    }
    // Generated boxes can leave their element's box; allow them only when they provably cannot.
    for (const pseudo of ['::before', '::after']) {
      const box = pseudoBox(win!, e, pseudo);
      if (!box || hiddenVisibility(box) || (!hasGeneratedText(box) && !hasImage(box))) continue;
      const clipped = !!st.overflowX && !!st.overflowY && st.overflowX !== 'visible' && st.overflowY !== 'visible';
      if ((box.position && box.position !== 'static') || !noneValue(box.transform) || !clipped) fail('UNSAFE_OVERLAP');
    }
  }
  // Every painted text node that is not approved source text (ancestor direct text,
  // overflowing sibling text, text inside private elements) is measured precisely.
  const approved = new Set<Node>();
  for (const { element } of regions) approvedText(element, approved);
  const walker = doc.createTreeWalker(doc.documentElement, 4 /* NodeFilter.SHOW_TEXT */);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const parent = t.parentElement;
    if (approved.has(t) || !parent || ours(parent) || !norm(t.textContent ?? '')) continue;
    if (suppressed(parent, win!, cache) || hiddenVisibility(win!.getComputedStyle(parent))) continue;
    // text-shadow re-paints unknown glyphs elsewhere: never bounded, always fails closed.
    if (!noneValue(win!.getComputedStyle(parent).textShadow)) fail('UNSAFE_OVERLAP');
    for (const r of textRects(doc, t)) {
      if (!finite(r)) fail('BAD_GEOMETRY');
      if (r.width <= 0 || r.height <= 0) continue;
      const box = grow(r, TEXT_PAD);
      for (const { region } of regions) {
        const hit = intersect(box, region.rect);
        if (hit && !covered(hit)) fail('UNSAFE_OVERLAP');
      }
    }
  }

  return {
    version: VISION_PLAN_VERSION, reason: VISION_REASON, origin,
    documentInstanceId: registry.documentInstanceId, snapshotId: snapshot.snapshotId,
    semanticRevision: registry.semanticRevision, optionRevision: registry.optionRevision, privateValueRevision: registry.privateValueRevision,
    viewport: { width: viewport.width, height: viewport.height, devicePixelRatio: dpr, scrollX: win!.scrollX, scrollY: win!.scrollY },
    refs: uniq, crop: round(crop!),
    publicRegions: regions.map((r) => r.region),
    privateMasks: masks,
  };
}

/** True when one private mask fully covers the given box (masks are painted last, opaque). */
function privateMasksCover(masks: readonly VisionRect[], box: VisionRect): boolean {
  return masks.some((m) => inside(box, m));
}

export type VisionIsolationOptions = {
  /** Also paint opaque DOM boxes (data-flecto-private, pointer-events:none) over masks during capture. */
  domMaskOverlay?: boolean;
  /** Waits for a paint; defaults to two requestAnimationFrame ticks (or a 32 ms timer). */
  nextPaint?: () => Promise<void>;
  /**
   * Upper bound (ms) for paint + capture. On expiry the page is restored at once and
   * ISOLATION_FAILED is returned; a late capture result is dropped. Pass the remaining
   * inherited budget so a dead worker can never leave the host transparent.
   */
  timeoutMs?: number;
};
export type VisionIsolationResult<T> = { ok: true; value: T } | { ok: false; code: 'STATE_CHANGED' | 'ISOLATION_FAILED' };

function defaultPaint(win: Window | null): Promise<void> {
  return new Promise((done) => {
    if (win?.requestAnimationFrame) win.requestAnimationFrame(() => win.requestAnimationFrame(() => done()));
    else setTimeout(done, 32);
  });
}
function focusState(doc: Document): Element[] {
  const chain: Element[] = [];
  let active: Element | null = doc.activeElement;
  while (active) { chain.push(active); active = active.shadowRoot?.activeElement ?? null; }
  return chain;
}
function valueState(doc: Document): [Element, string, boolean][] {
  return Array.from(doc.querySelectorAll<HTMLInputElement>('input,textarea,select')).filter((e) => !isSensitive(e)).map((e) => [e, e.value, !!e.checked]);
}

/**
 * Runs capture (normally: message the background to call captureVisionImage)
 * with the FLECTO host made transparent (opacity only — focus is not moved) and an
 * optional DOM mask overlay. Restores in finally. Fails closed if focus, any control
 * value, or the host's inline style could not be restored exactly.
 */
export async function withVisionIsolation<T>(doc: Document, plan: VisionCapturePlan, capture: () => Promise<T>, options: VisionIsolationOptions = {}): Promise<VisionIsolationResult<T>> {
  // Never isolate/capture next to a password/OTP/card field, and never read its value.
  if (sensitiveControl(doc)) return { ok: false, code: 'ISOLATION_FAILED' };
  const host = doc.getElementById(HOST_ID) as HTMLElement | null;
  const focusBefore = focusState(doc);
  const valuesBefore = valueState(doc);
  const prevOpacity = host?.style.getPropertyValue('opacity') ?? '';
  const prevPriority = host?.style.getPropertyPriority('opacity') ?? '';
  let overlay: HTMLElement | null = null;
  let value: T;
  let threw = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    host?.style.setProperty('opacity', '0', 'important');
    if (options.domMaskOverlay && plan.privateMasks.length) {
      overlay = doc.createElement('div');
      OWN_OVERLAYS.add(overlay);
      overlay.setAttribute('data-flecto-private', 'vision-mask');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
      for (const m of plan.privateMasks) {
        const box = doc.createElement('div');
        box.style.cssText = 'position:fixed;background:#000;pointer-events:none;left:' + m.x + 'px;top:' + m.y + 'px;width:' + m.width + 'px;height:' + m.height + 'px;';
        overlay.appendChild(box);
      }
      (doc.body ?? doc.documentElement).appendChild(overlay);
    }
    const run = (async () => { await (options.nextPaint ?? (() => defaultPaint(doc.defaultView)))(); return capture(); })();
    run.catch(() => undefined);
    value = await (options.timeoutMs === undefined ? run : Promise.race([run, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('VISION_ISOLATION_TIMEOUT')), Math.max(0, options.timeoutMs!));
    })]));
  } catch {
    threw = true;
  } finally {
    clearTimeout(timer);
    overlay?.remove();
    if (host) {
      if (prevOpacity) host.style.setProperty('opacity', prevOpacity, prevPriority);
      else host.style.removeProperty('opacity');
    }
  }
  const restored = !host || (host.style.getPropertyValue('opacity') === prevOpacity && host.style.getPropertyPriority('opacity') === prevPriority);
  if (!restored) return { ok: false, code: 'ISOLATION_FAILED' };
  // A sensitive control that appeared (or changed type) during capture: reject before any value read.
  if (sensitiveControl(doc)) return { ok: false, code: 'STATE_CHANGED' };
  const focusAfter = focusState(doc);
  const valuesAfter = valueState(doc);
  const same = focusAfter.length === focusBefore.length && focusAfter.every((e, i) => e === focusBefore[i])
    && valuesAfter.length === valuesBefore.length && valuesAfter.every((v, i) => v[0] === valuesBefore[i][0] && v[1] === valuesBefore[i][1] && v[2] === valuesBefore[i][2]);
  if (!same) return { ok: false, code: 'STATE_CHANGED' };
  if (threw) return { ok: false, code: 'ISOLATION_FAILED' };
  return { ok: true, value: value! };
}
