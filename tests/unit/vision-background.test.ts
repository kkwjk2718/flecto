import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureVisionImage, validateVisionPlan, type VisionBitmap, type VisionCanvasAdapter, type VisionCaptureInput,
  type VisionCapturePlan, type VisionChromeApi,
} from '../../apps/extension/src/background/vision';

// Synthetic pixel world: each device pixel carries a source label instead of a colour.
// CSS layout: label text (10,10,40,10); private input (10,25,40,10); other page content elsewhere.
const ORIGIN = 'http://127.0.0.1:4174';
const RAW_MARKER = 'UkFXX0NBUFRVUkVfU0VDUkVU'; // base64 of RAW_CAPTURE_SECRET
const RAW = 'data:image/png;base64,' + RAW_MARKER;
type Px = string;
function sourcePixel(cssX: number, cssY: number): Px {
  if (cssX >= 10 && cssX < 50 && cssY >= 25 && cssY < 35) return 'SECRET';
  if (cssX >= 10 && cssX < 50 && cssY >= 10 && cssY < 20) return 'LABEL';
  return 'OTHER';
}
function plan(over: Partial<VisionCapturePlan> = {}): VisionCapturePlan {
  return {
    version: 1, reason: 'VISUAL_RELATION_AMBIGUOUS', origin: ORIGIN, documentInstanceId: 'd1', snapshotId: 's1',
    semanticRevision: 0, optionRevision: 0, privateValueRevision: 3,
    viewport: { width: 100, height: 60, devicePixelRatio: 2, scrollX: 0, scrollY: 0 },
    refs: ['e_1'], crop: { x: 2, y: 2, width: 56, height: 41 },
    publicRegions: [{ ref: 'e_1', kind: 'label', rect: { x: 10, y: 10, width: 40, height: 10 } }],
    privateMasks: [{ x: 8, y: 23, width: 44, height: 14 }],
    ...over,
  };
}
class Grid {
  px: Px[][];
  constructor(readonly width: number, readonly height: number, fill: Px) { this.px = Array.from({ length: height }, () => Array(width).fill(fill)); }
}
function adapter(bitmapSize: [number, number] = [200, 120]) {
  const decoded: string[] = [];
  let surface: Grid | null = null;
  let closed = 0;
  const canvas: VisionCanvasAdapter = {
    async decodePng(bytes) {
      decoded.push(new TextDecoder().decode(bytes));
      const [width, height] = bitmapSize;
      const scale = width / 100;
      return { width, height, close() { closed++; }, at: (x: number, y: number) => sourcePixel(x / scale, y / scale) } as VisionBitmap & { at(x: number, y: number): Px };
    },
    createSurface(width, height) {
      const g = new Grid(width, height, 'TRANSPARENT'); surface = g;
      return {
        fill(x, y, w, h, color) { for (let j = Math.max(0, y); j < Math.min(height, y + h); j++) for (let i = Math.max(0, x); i < Math.min(width, x + w); i++) g.px[j][i] = color; },
        copy(bitmap, sx, sy, sw, sh, dx, dy, dw, dh) {
          const src = bitmap as VisionBitmap & { at(x: number, y: number): Px };
          for (let j = 0; j < dh; j++) for (let i = 0; i < dw; i++) g.px[Math.floor(dy + j)][Math.floor(dx + i)] = src.at(sx + (i * sw) / dw, sy + (j * sh) / dh);
        },
        async toPngDataUrl() { return 'data:image/png;base64,TUFTS0VE'; },
      };
    },
  };
  return { canvas, decoded, get surface() { return surface; }, get closed() { return closed; } };
}
function chromeApi(over: { tab?: Partial<{ active: boolean; windowId: number; url: string; id: number }>; afterTab?: Partial<{ active: boolean; url: string }>; frame?: { documentId?: string; url: string } | null; capture?: () => Promise<string> } = {}) {
  let gets = 0;
  const api = {
    tabs: {
      get: vi.fn(async (tabId: number) => {
        gets++;
        const base = { id: tabId, windowId: 7, active: true, url: ORIGIN + '/apply?x=1', status: 'complete', ...over.tab };
        return gets > 1 && over.afterTab ? { ...base, ...over.afterTab } : base;
      }),
      captureVisibleTab: vi.fn(over.capture ?? (async () => RAW)),
    },
    webNavigation: { getFrame: vi.fn(async () => over.frame === undefined ? { documentId: 'doc-A', url: ORIGIN + '/apply' } : over.frame) },
  };
  return api as typeof api & VisionChromeApi;
}
function run(over: Partial<VisionCaptureInput> & { chromeApi?: VisionChromeApi; canvasAdapter?: VisionCanvasAdapter } = {}) {
  const t = { now: 1000 };
  const a = adapter();
  const c = over.chromeApi ?? chromeApi();
  const p = over.plan ?? plan();
  const input: VisionCaptureInput = {
    expected: { tabId: 5, windowId: 7, frameId: 0, documentId: 'doc-A', origin: ORIGIN },
    plan: p, allowedOrigins: [ORIGIN], guard: async () => structuredClone(p),
    budget: { startedAt: 0, deadlineAt: 10_000 }, signal: new AbortController().signal,
    chrome: c, canvas: over.canvasAdapter ?? a.canvas, now: () => t.now, ...over,
  };
  return { input, adapter: a, chrome: c, promise: captureVisionImage(input) };
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('VIS01 background capture and masking', () => {
  it('returns only the masked crop: public label pixels, opaque masks, white elsewhere', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { promise, adapter: a, chrome } = run();
    const result = await promise;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.image).toEqual({ mimeType: 'image/png', dataUrl: 'data:image/png;base64,TUFTS0VE', width: 112, height: 82 });
    expect(chrome.tabs.captureVisibleTab).toHaveBeenCalledTimes(1);
    expect(chrome.tabs.get).toHaveBeenCalledTimes(2); // before and after capture
    expect(a.decoded).toEqual(['RAW_CAPTURE_SECRET']);
    expect(a.closed).toBe(1);
    const g = a.surface!;
    const all = g.px.flat();
    expect(all).not.toContain('SECRET');
    expect(all).not.toContain('OTHER');
    expect(all).not.toContain('TRANSPARENT');
    // Crop origin CSS (2,2) => device (4,4). Label CSS (10..50,10..20) => device (20..100,20..40) => output (16..96,16..36).
    expect(g.px[16][16]).toBe('LABEL');
    expect(g.px[35][95]).toBe('LABEL');
    expect(g.px[15][16]).toBe('#ffffff');
    expect(g.px[36][16]).toBe('#ffffff');
    expect(g.px[16][96]).toBe('#ffffff');
    // Mask CSS (8,23,44,14) => device (16..104,46..74) => output rows 42..69, cols 12..99 opaque.
    for (let y = 42; y < 70; y++) for (let x = 12; x < 100; x++) expect(g.px[y][x]).toBe('#000000');
    expect(g.px.flat().filter((p) => p === 'LABEL')).toHaveLength(80 * 20);
    expect(g.px[0][0]).toBe('#ffffff');
    expect(JSON.stringify(result)).not.toContain(RAW_MARKER);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('scales CSS to bitmap by devicePixelRatio including zoom (1.25)', async () => {
    const a = adapter([125, 75]);
    const p = plan({ viewport: { width: 100, height: 60, devicePixelRatio: 1.25, scrollX: 0, scrollY: 40 } });
    const result = await run({ plan: p, canvasAdapter: a.canvas }).promise;
    expect(result).toMatchObject({ ok: true, image: { width: 71, height: 52 } /* outward crop rounding: floor(2.5)..ceil(72.5) */ });
    expect(a.surface!.px.flat()).not.toContain('SECRET');
  });

  it('refuses a wrong/inactive tab, other window, subframe, other document or non-allowlisted origin before capturing', async () => {
    const cases: [Partial<VisionCaptureInput>, VisionChromeApi, string][] = [
      [{}, chromeApi({ tab: { active: false } }), 'TARGET_MISMATCH'],
      [{}, chromeApi({ tab: { windowId: 8 } }), 'TARGET_MISMATCH'],
      [{}, chromeApi({ tab: { url: 'http://127.0.0.1:4173/' } }), 'TARGET_MISMATCH'],
      [{}, chromeApi({ frame: { documentId: 'doc-B', url: ORIGIN + '/' } }), 'TARGET_MISMATCH'],
      [{ expected: { tabId: 5, windowId: 7, frameId: 3, origin: ORIGIN } }, chromeApi(), 'TARGET_MISMATCH'],
      [{ allowedOrigins: [] }, chromeApi(), 'ORIGIN_NOT_ALLOWED'],
      [{ allowedOrigins: ['https://example.com'], expected: { tabId: 5, windowId: 7, frameId: 0, origin: 'https://example.com' }, plan: plan({ origin: 'https://example.com' }) }, chromeApi(), 'ORIGIN_NOT_ALLOWED'],
    ];
    for (const [over, api, error] of cases) {
      const result = await run({ ...over, chromeApi: api }).promise;
      expect(result).toMatchObject({ ok: false, error });
      expect(api.tabs.captureVisibleTab).not.toHaveBeenCalled();
    }
  });

  it('discards the raw capture when the tab or document changed during capture', async () => {
    const api = chromeApi({ afterTab: { url: 'http://localhost:9999/other' } });
    const { promise, adapter: a } = run({ chromeApi: api });
    const result = await promise;
    expect(result).toMatchObject({ ok: false, error: 'TARGET_MISMATCH' });
    expect(api.tabs.captureVisibleTab).toHaveBeenCalledTimes(1);
    expect(a.decoded).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(RAW_MARKER);
  });

  it('fails closed when the guard reports a revision, scroll or layout change (before or after capture)', async () => {
    const p = plan();
    const changes: (VisionCapturePlan | null)[] = [
      { ...p, privateValueRevision: 4 }, { ...p, semanticRevision: 1 },
      { ...p, viewport: { ...p.viewport, scrollY: 10 } }, { ...p, privateMasks: [{ x: 8, y: 24, width: 44, height: 14 }] }, null,
    ];
    for (const changed of changes) {
      let calls = 0;
      const api = chromeApi();
      const { promise, adapter: a } = run({ chromeApi: api, guard: async () => (++calls === 1 ? structuredClone(p) : changed) });
      const result = await promise;
      expect(result).toMatchObject({ ok: false, error: 'GUARD_CHANGED' });
      expect(a.decoded).toEqual([]);
      expect(JSON.stringify(result)).not.toContain(RAW_MARKER);
    }
    const api = chromeApi();
    expect(await run({ chromeApi: api, guard: async () => { throw new Error('gone'); } }).promise).toMatchObject({ ok: false, error: 'GUARD_CHANGED' });
    expect(api.tabs.captureVisibleTab).not.toHaveBeenCalled();
  });

  it('inherits the budget: never more than 10000 ms, never a fresh deadline, times out a hung capture', async () => {
    expect(await run({ budget: { startedAt: 0, deadlineAt: 10_001 } }).promise).toMatchObject({ ok: false, error: 'BUDGET_INVALID' });
    expect(await run({ budget: { startedAt: 5000, deadlineAt: 6000 } }).promise).toMatchObject({ ok: false, error: 'BUDGET_INVALID' }); // starts in the future
    const spent = chromeApi();
    expect(await run({ chromeApi: spent, budget: { startedAt: 0, deadlineAt: 1000 } }).promise).toMatchObject({ ok: false, error: 'DEADLINE_EXCEEDED' });
    expect(spent.tabs.captureVisibleTab).not.toHaveBeenCalled();
    expect(await run({ budget: { startedAt: 0, deadlineAt: 1500, reserveMs: 600 } }).promise).toMatchObject({ ok: false, error: 'DEADLINE_EXCEEDED' });

    vi.useFakeTimers();
    const t = { now: 9900 };
    const hung = chromeApi({ capture: () => new Promise<string>(() => undefined) });
    const pending = run({ chromeApi: hung, now: () => t.now, budget: { startedAt: 0, deadlineAt: 10_000 } }).promise;
    await vi.advanceTimersByTimeAsync(0);
    t.now = 10_000;
    await vi.advanceTimersByTimeAsync(100);
    expect(await pending).toMatchObject({ ok: false, error: 'DEADLINE_EXCEEDED' });
  });

  it('cancels promptly and returns no image', async () => {
    const controller = new AbortController();
    const api = chromeApi({ capture: () => new Promise<string>(() => undefined) });
    const pending = run({ chromeApi: api, signal: controller.signal }).promise;
    await new Promise((r) => setTimeout(r, 5));
    controller.abort();
    const result = await pending;
    expect(result).toMatchObject({ ok: false, error: 'CANCELLED' });
    expect(result).not.toHaveProperty('image');
    const already = new AbortController(); already.abort();
    expect(await run({ signal: already.signal }).promise).toMatchObject({ ok: false, error: 'CANCELLED' });
  });

  it('rejects bitmap scale/zoom mismatch, oversized or invalid images without leaking data', async () => {
    const wrongScale = adapter([300, 120]);
    expect(await run({ canvasAdapter: wrongScale.canvas }).promise).toMatchObject({ ok: false, error: 'SCALE_MISMATCH' });
    expect(wrongScale.closed).toBe(1);
    const huge = adapter([20000, 12000]);
    expect(await run({ canvasAdapter: huge.canvas, plan: plan({ viewport: { width: 100, height: 60, devicePixelRatio: 8, scrollX: 0, scrollY: 0 } }) }).promise).toMatchObject({ ok: false, error: 'IMAGE_INVALID' });
    const jpeg = await run({ chromeApi: chromeApi({ capture: async () => 'data:image/jpeg;base64,' + RAW_MARKER }) }).promise;
    expect(jpeg).toMatchObject({ ok: false, error: 'IMAGE_INVALID' });
    const thrown = await run({ chromeApi: chromeApi({ capture: async () => { throw new Error('capture failed ' + RAW); } }) }).promise;
    expect(thrown).toMatchObject({ ok: false, error: 'CAPTURE_FAILED' });
    expect(JSON.stringify([jpeg, thrown])).not.toContain(RAW_MARKER);
  });

  it('rejects malformed plans received over messaging', async () => {
    const bad: unknown[] = [
      plan({ reason: 'AUTH_REQUIRED' as never }),
      plan({ publicRegions: [] }),
      plan({ publicRegions: [{ ref: 'e_1', kind: 'label', rect: { x: 0, y: 0, width: 80, height: 50 } }] }), // outside crop
      plan({ crop: { x: 2, y: 2, width: 200, height: 41 } }), // outside viewport
      plan({ privateMasks: [{ x: NaN, y: 0, width: 1, height: 1 }] }),
      plan({ viewport: { width: 100, height: 60, devicePixelRatio: Infinity, scrollX: 0, scrollY: 0 } }),
      plan({ refs: ['bad ref'] }),
    ];
    for (const p of bad) {
      expect(validateVisionPlan(p)).toBe(false);
      const api = chromeApi();
      expect(await run({ plan: p as VisionCapturePlan, chromeApi: api }).promise).toMatchObject({ ok: false, error: 'PLAN_INVALID' });
      expect(api.tabs.captureVisibleTab).not.toHaveBeenCalled();
    }
  });
});
