import { afterEach, describe, expect, it, vi } from 'vitest';
import { deflateSync } from 'node:zlib';
import { EXTENSION_ID, EXTENSION_ORIGIN, type PlannerRequest, type PublicPageSnapshot } from '@flecto/contracts';
import { BackgroundBroker } from '../../apps/extension/src/background/broker';
import { browserVisionCanvas, type VisionCapturePlan } from '../../apps/extension/src/background/vision';
import { MessageSchema, VisionPlannerResponseSchema, VisionRequestSchema, visualRelationCandidates } from '../../apps/extension/src/background/validation';
import { createPlannerServer } from '../../apps/planner/src/server';
import { buildFixturePlan } from '../../apps/planner/src/provider/fixture';

const origin = 'http://127.0.0.1:4173', token = 'vision-transport-synthetic-token-0001';
const headers = { host: '127.0.0.1:4317', origin: EXTENSION_ORIGIN, authorization: `Bearer ${token}` };
function snapshot(): PublicPageSnapshot {
  return { schemaVersion: 1, requestId: 'r1', snapshotId: 's1', documentInstanceId: 'instance1', origin,
    goal: 'complete_form', goalRef: 'submit', semanticRevision: 2, optionRevision: 3,
    controls: [
      ...['first', 'second'].map(ref => ({ ref, kind: 'text' as const, label: ref, formRef: 'form1', required: true,
        disabled: false, semanticKey: `form1|text|${ref}`, constraints: {}, options: [], noticeRefs: [], actionKind: 'none' as const })),
      { ref: 'submit', kind: 'submit', label: '계속', formRef: 'form1', required: false, disabled: false, semanticKey: 'form1|submit|계속',
        constraints: {}, options: [], noticeRefs: [], actionKind: 'submit' },
    ], notices: [{ ref: 'notice', text: '공개 안내', kind: 'info', formRef: 'form1', semanticKey: 'form1|notice|공개 안내' }],
  };
}
function request(budget = 5000) {
  const payload: PlannerRequest = { snapshot: snapshot(), remainingBudgetMs: budget, sessionEpoch: 1 };
  const capturePlan: VisionCapturePlan = { version: 1, reason: 'VISUAL_RELATION_AMBIGUOUS', origin,
    documentInstanceId: 'instance1', snapshotId: 's1', semanticRevision: 2, optionRevision: 3, privateValueRevision: 7,
    viewport: { width: 100, height: 100, devicePixelRatio: 1, scrollX: 0, scrollY: 0 },
    refs: ['first', 'second', 'notice'], crop: { x: 0, y: 0, width: 80, height: 80 },
    publicRegions: [
      { ref: 'first', kind: 'label', rect: { x: 10, y: 10, width: 20, height: 10 } },
      { ref: 'second', kind: 'label', rect: { x: 40, y: 10, width: 20, height: 10 } },
      { ref: 'notice', kind: 'notice', rect: { x: 10, y: 40, width: 50, height: 10 } },
    ], privateMasks: [{ x: 10, y: 25, width: 50, height: 10 }],
  };
  return { payload, capturePlan };
}
// Valid independently generated PNG; no screenshot or private values are fixture input.
function png(width = 80, height = 80): string {
  const crc = (bytes: Buffer) => {
    let value = 0xffffffff;
    for (const byte of bytes) { value ^= byte; for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1; }
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (name: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(name), data]), length = Buffer.alloc(4), checksum = Buffer.alloc(4);
    length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc(body)); return Buffer.concat([length, body, checksum]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.alloc(height * (1 + width * 4)), { level: 0 })), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}
const body = (budget = 5000) => ({ request: request(budget), image: { dataUrl: png(), mimeType: 'image/png' as const, width: 80, height: 80 } });
const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
function serverHarness() {
  const plan = vi.fn(async (s: PublicPageSnapshot) => buildFixturePlan(s));
  const planWithImage = vi.fn(async (s: PublicPageSnapshot, _budget: number, _signal: AbortSignal, _image: { dataUrl: string; mimeType: 'image/png' }) => buildFixturePlan(s));
  const server = createPlannerServer({ dbPath: ':memory:', token, provider: { mode: 'FIXTURE', model: 'synthetic-image-provider', plan, planWithImage }, allowedSourceOrigins: [origin] });
  cleanups.push(() => server.close());
  const post = (payload: unknown = body(), overrideHeaders = headers) => server.inject({ method: 'POST', url: '/v1/vision/plans', headers: { ...overrideHeaders, 'content-type': 'application/json' }, payload: JSON.stringify(payload) });
  return { server, plan, planWithImage, post };
}
async function brokerHarness() {
  const h = serverHarness();
  const tab = { id: 1, url: `${origin}/form`, active: true, windowId: 9 };
  const frame = { url: tab.url, documentId: 'chrome-doc', documentLifecycle: 'active', errorOccurred: false };
  const area = (local = false) => ({ setAccessLevel: vi.fn(async () => undefined), set: vi.fn(async () => undefined),
    get: vi.fn(async () => local ? { flectoConnection: { plannerUrl: 'http://127.0.0.1:4317', token } } : {}) });
  const local = area(true), session = area();
  const api = { runtime: { id: EXTENSION_ID }, storage: { local, session },
    webNavigation: { getFrame: vi.fn(async () => frame) }, scripting: { executeScript: vi.fn(async () => []) },
    tabs: { get: vi.fn(async () => tab), captureVisibleTab: vi.fn(async () => png(100, 100)),
      sendMessage: vi.fn(async (_id: number, message: { type: string }) => message.type === 'FLECTO_VISION_GUARD' ? request().capturePlan : { ok: true }) },
  };
  const copied: unknown[][] = [], fills: unknown[][] = [];
  vi.spyOn(browserVisionCanvas, 'decodePng').mockResolvedValue({ width: 100, height: 100, close: vi.fn() });
  vi.spyOn(browserVisionCanvas, 'createSurface').mockImplementation((width, height) => ({
    fill: (...args) => { fills.push(args); }, copy: (...args) => { copied.push(args); }, toPngDataUrl: async () => png(width, height),
  }));
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    const response = await h.server.inject({ method: (init?.method ?? 'GET') as 'GET' | 'POST' | 'DELETE',
      url: new URL(String(url)).pathname, headers: { ...Object.fromEntries(new Headers(init?.headers)), host: '127.0.0.1:4317' },
      ...(init?.body ? { payload: JSON.parse(String(init.body)) } : {}),
    });
    return new Response(response.body, { status: response.statusCode, headers: { 'Content-Type': 'application/json' } });
  });
  const broker = new BackgroundBroker(api as unknown as typeof chrome, fetcher);
  await broker.activate(tab as chrome.tabs.Tab);
  const sender = { id: EXTENSION_ID, tab, frameId: 0, documentId: frame.documentId, origin, url: tab.url, documentLifecycle: 'active' } as chrome.runtime.MessageSender;
  const run = (r = request()) => broker.handle({ type: 'FLECTO_PREPARE_VISION', request: r }, sender);
  return { ...h, broker, api, fetcher, sender, tab, frame, run, copied, fills };
}

// This is a runnable synthetic transport positive, NOT a real Chrome/model T34 claim.
describe('VISION authenticated separate transport', () => {
  it('sends only the guarded masked crop after restoration, uses planWithImage and never caches or issues a blueprint receipt', async () => {
    const h = await brokerHarness();
    const result = await h.run();
    expect(result.ok).toBe(true);
    if (!result.ok || !('result' in result)) throw new Error('missing plan');
    expect(VisionPlannerResponseSchema.parse(result.result).transport).toBe('VISION');
    expect(result.result.blueprintId).toBeNull(); expect(h.plan).not.toHaveBeenCalled();
    expect(h.planWithImage).toHaveBeenCalledOnce();
    expect(h.planWithImage.mock.calls[0][1]).toBeLessThan(5000);
    expect(h.planWithImage.mock.calls[0][3]).toEqual({ dataUrl: png(), mimeType: 'image/png' });
    expect(h.copied).toHaveLength(3); expect(h.fills.at(-1)?.at(-1)).toBe('#000000');
    const callbacks = h.api.tabs.sendMessage.mock.calls.map(c => c[1].type);
    expect(callbacks.slice(-4)).toEqual(['FLECTO_VISION_GUARD', 'FLECTO_VISION_GUARD', 'FLECTO_VISION_RELEASE', 'FLECTO_VISION_GUARD']);
    expect(h.api.tabs.sendMessage.mock.invocationCallOrder.at(-1)).toBeLessThan(h.fetcher.mock.invocationCallOrder.at(-1)!);
    const ack = await h.server.inject({ method: 'POST', url: '/v1/blueprints/imaginary/verify', headers, payload: { requestId: 'r1', snapshotId: 's1' } });
    expect(ack.statusCode).toBe(409);
    const normal = await h.server.inject({ method: 'POST', url: '/v1/plans', headers, payload: { ...request().payload, snapshot: { ...snapshot(), requestId: 'r2' } } });
    expect(normal.statusCode).toBe(200); expect(normal.json().mode).toBe('FIXTURE'); expect(h.plan).toHaveBeenCalledOnce();
    expect(JSON.stringify(h.api.storage.session.set.mock.calls)).not.toContain('data:image');
    expect(h.api.storage.local.set).not.toHaveBeenCalled();
  });

  it.each(['AUTH_REQUIRED', 'PROVIDER_ERROR', 'STALE_DOCUMENT', 'AMBIGUOUS_TARGET', 'UNSUPPORTED_CONTROL'])('rejects %s as a capture reason before capture', async reason => {
    const h = await brokerHarness(), r = request();
    (r.capturePlan as { reason: string }).reason = reason;
    expect(await h.run(r)).toEqual({ ok: false, error: 'SCHEMA_INVALID' });
    expect(h.api.tabs.captureVisibleTab).not.toHaveBeenCalled(); expect(h.planWithImage).not.toHaveBeenCalled();
  });
  it('rejects missing refs, duplicate semantic targets, stale revisions and private fields', () => {
    const mutations = [
      (r: ReturnType<typeof request>) => { r.capturePlan.refs[0] = 'absent'; },
      (r: ReturnType<typeof request>) => { r.payload.snapshot.controls[1].semanticKey = r.payload.snapshot.controls[0].semanticKey; },
      (r: ReturnType<typeof request>) => { r.capturePlan.semanticRevision++; },
      (r: ReturnType<typeof request>) => { Object.assign(r.payload.snapshot.controls[0], { value: 'PRIVATE' }); },
    ];
    for (const mutate of mutations) { const r = request(); mutate(r); expect(VisionRequestSchema.safeParse(r).success).toBe(false); }
    expect(MessageSchema.safeParse({ type: 'FLECTO_PREPARE', payload: request().payload, image: body().image }).success).toBe(false);
    const explicit = snapshot(); explicit.controls[0].noticeRefs = ['notice']; expect(visualRelationCandidates(explicit, 'submit')).toEqual([]);
  });
  it.each(['before', 'after', 'restored'])('blocks private value revision drift %s capture and never uploads', async stage => {
    const h = await brokerHarness(); let guards = 0;
    h.api.tabs.sendMessage.mockImplementation(async (_tab, message) => {
      if (message.type !== 'FLECTO_VISION_GUARD') return { ok: true };
      const fresh = request().capturePlan; guards++;
      if (guards === (stage === 'before' ? 1 : stage === 'after' ? 2 : 3)) fresh.privateValueRevision++;
      return fresh;
    });
    expect((await h.run()).ok).toBe(false);
    expect(h.api.tabs.captureVisibleTab).toHaveBeenCalledTimes(stage === 'before' ? 0 : 1);
    expect(h.planWithImage).not.toHaveBeenCalled(); expect(h.fetcher.mock.calls.every(c => c[1]?.method !== 'POST')).toBe(true);
  });
  it('rejects failed focus/value restoration before upload', async () => {
    const h = await brokerHarness();
    h.api.tabs.sendMessage.mockImplementation(async (_id, m) => m.type === 'FLECTO_VISION_GUARD' ? request().capturePlan : { ok: false });
    expect(await h.run()).toEqual({ ok: false, error: 'STALE_DOCUMENT' }); expect(h.planWithImage).not.toHaveBeenCalled();
  });
  it('rejects an inactive or changed document after capture', async () => {
    const h = await brokerHarness();
    h.api.tabs.captureVisibleTab.mockImplementation(async () => { h.frame.documentId = 'new-document'; return png(100,100); });
    expect((await h.run()).ok).toBe(false); expect(h.planWithImage).not.toHaveBeenCalled();
  });
  it('cancels a pending capture under the original request id and discards its late result', async () => {
    const h = await brokerHarness(); let resolve!: (value: string) => void;
    h.api.tabs.captureVisibleTab.mockImplementation(() => new Promise(done => { resolve = done; }));
    const pending = h.run(); await vi.waitFor(() => expect(h.api.tabs.captureVisibleTab).toHaveBeenCalledOnce());
    expect(await h.broker.handle({ type: 'FLECTO_CANCEL', requestId: 'r1', documentInstanceId: 'instance1' }, h.sender)).toEqual({ ok: true });
    expect(await pending).toEqual({ ok: false, error: 'CANCELLED' }); resolve(png());
    await Promise.resolve(); expect(h.planWithImage).not.toHaveBeenCalled();
  });
  it('bounds the masked PNG before upload, not only at the HTTP parser', async () => {
    const h = await brokerHarness();
    vi.mocked(browserVisionCanvas.createSurface).mockReturnValue({ fill: () => {}, copy: () => {},
      toPngDataUrl: async () => 'data:image/png;base64,' + Buffer.alloc(4 * 1024 * 1024 + 1).toString('base64') });
    expect(await h.run()).toEqual({ ok: false, error: 'SCHEMA_INVALID' });
    expect(h.fetcher.mock.calls.every(call => call[1]?.method !== 'POST')).toBe(true);
    expect(h.planWithImage).not.toHaveBeenCalled();
  });
  it('propagates cancellation through the original authenticated request id during image inference', async () => {
    const h = await brokerHarness(); let finish!: () => void;
    h.planWithImage.mockImplementation(async s => { await new Promise<void>(resolve => { finish = resolve; }); return buildFixturePlan(s); });
    const pending = h.run(); await vi.waitFor(() => expect(h.planWithImage).toHaveBeenCalledOnce());
    await h.broker.handle({ type: 'FLECTO_CANCEL', requestId: 'r1', documentInstanceId: 'instance1' }, h.sender);
    expect(await pending).toEqual({ ok: false, error: 'CANCELLED' });
    await vi.waitFor(() => expect(h.planWithImage.mock.calls[0][2].aborted).toBe(true));
    finish();
    expect(h.fetcher.mock.calls.some(call => String(call[0]).endsWith('/v1/plans/r1') && call[1]?.method === 'DELETE')).toBe(true);
  });
  it('does not restart the budget after capture', async () => {
    vi.useFakeTimers();
    const h = await brokerHarness();
    h.api.tabs.captureVisibleTab.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(png(100,100)), 1200)));
    const pending = h.run(request(1000));
    await vi.advanceTimersByTimeAsync(1400);
    expect(await pending).toEqual({ ok: false, error: 'DEADLINE_EXCEEDED' }); expect(h.planWithImage).not.toHaveBeenCalled();
  });
});

describe('VISION planner boundary', () => {
  it.each(['authorization', 'origin', 'host'])('requires the same %s authorization as normal plans', async name => {
    const h = serverHarness(); const bad = { ...headers, [name]: 'bad' };
    expect((await h.post(body(), bad)).statusCode).toBeGreaterThanOrEqual(400); expect(h.planWithImage).not.toHaveBeenCalled();
  });
  it('fails closed outside the explicit synthetic allowlist', async () => {
    const h = serverHarness(), input = body(); input.request.payload.snapshot.origin = input.request.capturePlan.origin = 'https://real.example';
    expect((await h.post(input)).statusCode).toBe(403); expect(h.planWithImage).not.toHaveBeenCalled();
  });
  it('accepts a >256KiB bounded image body but rejects decoded image overflow and invalid header dimensions', async () => {
    const h = serverHarness(), input = body();
    input.image = { ...input.image, dataUrl: png(300, 300), width: 300, height: 300 };
    input.request.capturePlan.crop = { x: 0, y: 0, width: 300, height: 300 };
    input.request.capturePlan.viewport.width = input.request.capturePlan.viewport.height = 400;
    expect((await h.post(input)).statusCode).toBe(200);
    input.image.width = 79; expect((await h.post(input)).statusCode).toBe(400);
    input.image.width = 300; input.image.dataUrl = 'data:image/png;base64,' + Buffer.alloc(4 * 1024 * 1024 + 1).toString('base64');
    expect((await h.post(input)).statusCode).toBe(400); expect(h.planWithImage).toHaveBeenCalledOnce();
  });
  it('preserves provider occupancy after timeout until the actual image invocation settles', async () => {
    const h = serverHarness(); let finish!: () => void;
    h.planWithImage.mockImplementation(async s => { await new Promise<void>(resolve => { finish = resolve; }); return buildFixturePlan(s); });
    const result = await h.post(body(30)); expect(result.statusCode).toBe(504);
    expect(h.planWithImage.mock.calls[0][2].aborted).toBe(true);
    const next = body(); next.request.payload.snapshot.requestId = 'r2';
    expect((await h.post(next)).statusCode).toBe(409); expect(h.planWithImage).toHaveBeenCalledOnce(); finish();
  });
  it('rejects invalid current-DOM plan output and never falls back to metadata/cache', async () => {
    const h = serverHarness();
    h.planWithImage.mockImplementation(async s => ({ ...buildFixturePlan(s), sourceActionRef: 'nonexistent' }));
    expect((await h.post()).json().error).toBe('SCHEMA_INVALID'); expect(h.plan).not.toHaveBeenCalled();
  });
});
