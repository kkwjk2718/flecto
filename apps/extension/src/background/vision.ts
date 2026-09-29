// VIS01 — background-side capture + in-memory masking for the optional visual fallback.
//
// captureVisionImage() captures the visible tab ONLY when the caller-authenticated
// target (tab/window/top frame/document/origin) is still the active tab before AND
// after captureVisibleTab, and the caller's guard rebuilds a structurally identical
// plan both times. The raw PNG exists only as a local variable: it is decoded with
// createImageBitmap, allowed public regions are copied onto a white OffscreenCanvas,
// private masks are painted opaque on top, and only the masked crop is returned.
// No network, model, storage or logging happens here. Budget is inherited, never new.
import { PREPARE_DEADLINE_MS } from '@flecto/contracts';
import type { VisionCapturePlan, VisionRect } from '../content/vision';

export type { VisionCapturePlan, VisionRect, VisionRegion } from '../content/vision';

export const VISION_MAX_BITMAP_SIDE = 16384;
export const VISION_MAX_BITMAP_PIXELS = 50_000_000;
export const VISION_MAX_OUTPUT_SIDE = 1600;
export const VISION_MASK_COLOR = '#000000';

export type VisionFailure =
  | 'CANCELLED' | 'DEADLINE_EXCEEDED' | 'BUDGET_INVALID' | 'PLAN_INVALID' | 'ORIGIN_NOT_ALLOWED'
  | 'TARGET_MISMATCH' | 'GUARD_CHANGED' | 'CAPTURE_FAILED' | 'IMAGE_INVALID' | 'SCALE_MISMATCH';
export type VisionImage = { mimeType: 'image/png'; dataUrl: string; width: number; height: number };
export type VisionCaptureResult = { ok: true; image: VisionImage; elapsedMs: number } | { ok: false; error: VisionFailure; elapsedMs: number };

/** Identity the caller already authenticated from the content script's MessageSender. */
export type VisionExpectedTarget = { tabId: number; windowId: number; frameId: number; documentId?: string; origin: string };
/** Inherited monotonic budget (same clock as now()). deadlineAt - startedAt must be <= PREPARE_DEADLINE_MS. */
export type VisionBudget = { startedAt: number; deadlineAt: number; reserveMs?: number };

export type VisionBitmap = { width: number; height: number; close(): void };
export interface VisionSurface {
  fill(x: number, y: number, w: number, h: number, color: string): void;
  copy(bitmap: VisionBitmap, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
  toPngDataUrl(): Promise<string>;
}
export interface VisionCanvasAdapter {
  decodePng(bytes: Uint8Array): Promise<VisionBitmap>;
  createSurface(width: number, height: number): VisionSurface;
}
export type VisionChromeApi = {
  tabs: {
    get(tabId: number): Promise<{ id?: number; windowId: number; active: boolean; url?: string; status?: string }>;
    captureVisibleTab(windowId: number, options: { format: 'png' }): Promise<string>;
  };
  webNavigation?: { getFrame(details: { tabId: number; frameId: number }): Promise<{ documentId?: string; url: string } | null> };
};
export type VisionCaptureInput = {
  expected: VisionExpectedTarget;
  plan: VisionCapturePlan;
  /** Explicit QA/DEMO allowlist (http://localhost:<port> / http://127.0.0.1:<port> only). */
  allowedOrigins: readonly string[];
  /** Asks the content script to rebuild the plan now (under isolation); null = failed. */
  guard: () => Promise<VisionCapturePlan | null>;
  budget: VisionBudget;
  signal: AbortSignal;
  chrome: VisionChromeApi;
  canvas?: VisionCanvasAdapter;
  now?: () => number;
};

class Stop extends Error { constructor(readonly failure: VisionFailure) { super(failure); } }
const stop = (f: VisionFailure): never => { throw new Stop(f); };

export function visionAllowlist(entries: readonly string[]): string[] {
  return entries.filter((entry) => {
    try { const u = new URL(entry); return u.protocol === 'http:' && u.origin === entry && !!u.port && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'); }
    catch { return false; }
  });
}

const isRect = (r: unknown): r is VisionRect => !!r && typeof r === 'object' && ['x', 'y', 'width', 'height'].every((k) => typeof (r as Record<string, unknown>)[k] === 'number' && Number.isFinite((r as Record<string, number>)[k])) && (r as VisionRect).width >= 0 && (r as VisionRect).height >= 0;
const within = (r: VisionRect, o: VisionRect) => r.x >= o.x - 0.5 && r.y >= o.y - 0.5 && r.x + r.width <= o.x + o.width + 0.5 && r.y + r.height <= o.y + o.height + 0.5;

/** Structural validation of a plan received over messaging (never trusted as typed). */
export function validateVisionPlan(plan: unknown): plan is VisionCapturePlan {
  const p = plan as VisionCapturePlan;
  if (!p || typeof p !== 'object' || p.version !== 1 || p.reason !== 'VISUAL_RELATION_AMBIGUOUS') return false;
  if (typeof p.origin !== 'string' || typeof p.documentInstanceId !== 'string' || typeof p.snapshotId !== 'string') return false;
  if (![p.semanticRevision, p.optionRevision, p.privateValueRevision].every((n) => Number.isInteger(n) && n >= 0)) return false;
  const v = p.viewport;
  if (!v || ![v.width, v.height, v.devicePixelRatio, v.scrollX, v.scrollY].every(Number.isFinite) || v.width < 1 || v.height < 1 || v.devicePixelRatio <= 0 || v.devicePixelRatio > 8) return false;
  const view = { x: 0, y: 0, width: v.width, height: v.height };
  if (!Array.isArray(p.refs) || !p.refs.length || p.refs.length > 12 || !p.refs.every((r) => typeof r === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(r))) return false;
  if (!isRect(p.crop) || p.crop.width < 1 || p.crop.height < 1 || !within(p.crop, view)) return false;
  if (!Array.isArray(p.publicRegions) || !p.publicRegions.length || p.publicRegions.length > 40) return false;
  if (!p.publicRegions.every((r) => r && ['label', 'notice', 'option', 'action'].includes(r.kind) && typeof r.ref === 'string' && isRect(r.rect) && within(r.rect, p.crop))) return false;
  if (!Array.isArray(p.privateMasks) || p.privateMasks.length > 200 || !p.privateMasks.every((m) => isRect(m) && within(m, p.crop))) return false;
  return true;
}

function canonical(plan: VisionCapturePlan): string {
  const r = (x: VisionRect) => [x.x, x.y, x.width, x.height];
  return JSON.stringify([plan.version, plan.reason, plan.origin, plan.documentInstanceId, plan.snapshotId, plan.semanticRevision, plan.optionRevision, plan.privateValueRevision,
    [plan.viewport.width, plan.viewport.height, plan.viewport.devicePixelRatio, plan.viewport.scrollX, plan.viewport.scrollY], plan.refs, r(plan.crop),
    plan.publicRegions.map((g) => [g.ref, g.kind, r(g.rect)]), plan.privateMasks.map(r)]);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Default adapter: service-worker createImageBitmap + OffscreenCanvas, memory only. */
export const browserVisionCanvas: VisionCanvasAdapter = {
  async decodePng(bytes) {
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/png' }));
    return bitmap;
  },
  createSurface(width, height) {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('no 2d context');
    ctx.imageSmoothingEnabled = true;
    return {
      fill(x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); },
      copy(bitmap, sx, sy, sw, sh, dx, dy, dw, dh) { ctx.drawImage(bitmap as unknown as ImageBitmap, sx, sy, sw, sh, dx, dy, dw, dh); },
      async toPngDataUrl() {
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        return 'data:image/png;base64,' + bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
      },
    };
  },
};

/**
 * Captures the visible tab and returns ONLY the masked crop. Never returns or logs
 * the raw capture; errors carry a failure code only.
 */
export async function captureVisionImage(input: VisionCaptureInput): Promise<VisionCaptureResult> {
  const now = input.now ?? (() => performance.now());
  const started = now();
  const { budget, signal, expected, chrome } = input;
  const canvas = input.canvas ?? browserVisionCanvas;
  let bitmap: VisionBitmap | null = null;
  const check = () => {
    if (signal.aborted) stop('CANCELLED');
    if (now() >= budget.deadlineAt - (budget.reserveMs ?? 0)) stop('DEADLINE_EXCEEDED');
  };
  // Every await races the SAME inherited deadline and the caller's abort signal.
  const bounded = <T>(promise: Promise<T>): Promise<T> => {
    promise.catch(() => undefined); // never leave an orphaned rejection (it could carry data)
    check();
    const remaining = budget.deadlineAt - (budget.reserveMs ?? 0) - now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Stop('DEADLINE_EXCEEDED')), Math.max(0, remaining)); }),
      new Promise<never>((_, reject) => { onAbort = () => reject(new Stop('CANCELLED')); signal.addEventListener('abort', onAbort, { once: true }); }),
    ]).finally(() => { clearTimeout(timer); if (onAbort) signal.removeEventListener('abort', onAbort); }).then((value) => { check(); return value; });
  };
  try {
    if (![budget.startedAt, budget.deadlineAt].every(Number.isFinite) || budget.deadlineAt <= budget.startedAt
      || budget.deadlineAt - budget.startedAt > PREPARE_DEADLINE_MS || budget.startedAt > started + 1
      || (budget.reserveMs !== undefined && !(budget.reserveMs >= 0 && budget.reserveMs < PREPARE_DEADLINE_MS))) stop('BUDGET_INVALID');
    check();
    const plan = input.plan;
    if (!validateVisionPlan(plan)) stop('PLAN_INVALID');
    const allowed = visionAllowlist(input.allowedOrigins);
    if (!allowed.includes(expected.origin) || plan.origin !== expected.origin) stop('ORIGIN_NOT_ALLOWED');
    if (expected.frameId !== 0 || !Number.isInteger(expected.tabId) || !Number.isInteger(expected.windowId)) stop('TARGET_MISMATCH');
    const key = canonical(plan);

    const verifyTarget = async () => {
      const tab = await bounded(chrome.tabs.get(expected.tabId));
      let tabOrigin = '';
      try { tabOrigin = new URL(tab.url ?? '').origin; } catch { tabOrigin = ''; }
      if (!tab.active || tab.windowId !== expected.windowId || (tab.id !== undefined && tab.id !== expected.tabId) || tabOrigin !== expected.origin || !allowed.includes(tabOrigin)) stop('TARGET_MISMATCH');
      if (expected.documentId !== undefined) {
        if (!chrome.webNavigation) stop('TARGET_MISMATCH');
        const frame = await bounded(chrome.webNavigation!.getFrame({ tabId: expected.tabId, frameId: 0 }));
        let frameOrigin = '';
        try { frameOrigin = new URL(frame?.url ?? '').origin; } catch { frameOrigin = ''; }
        if (!frame || frame.documentId !== expected.documentId || frameOrigin !== expected.origin) stop('TARGET_MISMATCH');
      }
    };
    const verifyGuard = async () => {
      let fresh: VisionCapturePlan | null = null;
      try { fresh = await bounded(input.guard()); } catch (error) { if (error instanceof Stop) throw error; fresh = null; }
      if (!fresh || !validateVisionPlan(fresh) || canonical(fresh) !== key) stop('GUARD_CHANGED');
    };

    await verifyTarget();
    await verifyGuard();
    let raw: string | null = await bounded(chrome.tabs.captureVisibleTab(expected.windowId, { format: 'png' })).catch((error) => { if (error instanceof Stop) throw error; return stop('CAPTURE_FAILED'); });
    try {
      await verifyTarget();
      await verifyGuard();
      const prefix = 'data:image/png;base64,';
      if (typeof raw !== 'string' || !raw.startsWith(prefix)) stop('IMAGE_INVALID');
      let bytes: Uint8Array;
      try { bytes = base64ToBytes(raw!.slice(prefix.length)); } catch { return stop('IMAGE_INVALID'); }
      raw = null;
      bitmap = await bounded(canvas.decodePng(bytes)).catch((error) => { if (error instanceof Stop) throw error; return stop('IMAGE_INVALID'); });
    } finally { raw = null; }

    const bw = bitmap!.width, bh = bitmap!.height;
    if (!Number.isInteger(bw) || !Number.isInteger(bh) || bw < 1 || bh < 1 || bw > VISION_MAX_BITMAP_SIDE || bh > VISION_MAX_BITMAP_SIDE || bw * bh > VISION_MAX_BITMAP_PIXELS) stop('IMAGE_INVALID');
    // CSS -> bitmap: devicePixelRatio already includes page zoom in Chrome.
    const sx = bw / plan.viewport.width, sy = bh / plan.viewport.height, dpr = plan.viewport.devicePixelRatio;
    if (Math.abs(sx - sy) > 0.02 * dpr || Math.abs(sx - dpr) > 0.05 * dpr) stop('SCALE_MISMATCH');
    const scale = sx;
    const cropPx = { x: Math.floor(plan.crop.x * scale), y: Math.floor(plan.crop.y * scale), r: Math.ceil((plan.crop.x + plan.crop.width) * scale), b: Math.ceil((plan.crop.y + plan.crop.height) * scale) };
    cropPx.r = Math.min(cropPx.r, bw); cropPx.b = Math.min(cropPx.b, bh);
    const cw = cropPx.r - cropPx.x, ch = cropPx.b - cropPx.y;
    if (cw < 1 || ch < 1) stop('PLAN_INVALID');
    const out = Math.min(1, VISION_MAX_OUTPUT_SIDE / Math.max(cw, ch));
    const ow = Math.max(1, Math.round(cw * out)), oh = Math.max(1, Math.round(ch * out));
    const surface = canvas.createSurface(ow, oh);
    surface.fill(0, 0, ow, oh, '#ffffff');
    for (const region of plan.publicRegions) {
      // Inward rounding: never copy a partial pixel from outside the allowed box.
      const x0 = Math.max(Math.ceil(region.rect.x * scale), cropPx.x), y0 = Math.max(Math.ceil(region.rect.y * scale), cropPx.y);
      const x1 = Math.min(Math.floor((region.rect.x + region.rect.width) * scale), cropPx.r), y1 = Math.min(Math.floor((region.rect.y + region.rect.height) * scale), cropPx.b);
      if (x1 - x0 < 1 || y1 - y0 < 1) continue;
      surface.copy(bitmap!, x0, y0, x1 - x0, y1 - y0, (x0 - cropPx.x) * out, (y0 - cropPx.y) * out, (x1 - x0) * out, (y1 - y0) * out);
    }
    for (const mask of plan.privateMasks) {
      // Outward rounding: masks always cover whole device pixels.
      const x0 = Math.floor(mask.x * scale), y0 = Math.floor(mask.y * scale);
      const x1 = Math.ceil((mask.x + mask.width) * scale), y1 = Math.ceil((mask.y + mask.height) * scale);
      const dx0 = Math.floor((x0 - cropPx.x) * out), dy0 = Math.floor((y0 - cropPx.y) * out);
      surface.fill(dx0, dy0, Math.ceil((x1 - cropPx.x) * out) - dx0, Math.ceil((y1 - cropPx.y) * out) - dy0, VISION_MASK_COLOR);
    }
    bitmap!.close(); bitmap = null;
    const dataUrl = await bounded(surface.toPngDataUrl());
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) stop('IMAGE_INVALID');
    return { ok: true, image: { mimeType: 'image/png', dataUrl, width: ow, height: oh }, elapsedMs: now() - started };
  } catch (error) {
    const failure: VisionFailure = error instanceof Stop ? error.failure : signal.aborted ? 'CANCELLED' : 'CAPTURE_FAILED';
    return { ok: false, error: failure, elapsedMs: Math.max(0, now() - started) };
  } finally {
    try { bitmap?.close(); } catch { /* ignore */ }
  }
}
