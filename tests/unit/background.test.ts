import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, EXTENSION_ID, EXTENSION_ORIGIN, type PlannerRequest, type PlannerResponse } from '@flecto/contracts';
import { BackgroundBroker } from '../../apps/extension/src/background/broker';
import { plannerOrigin } from '../../apps/extension/src/background/validation';
import { startBackground } from '../../apps/extension/src/background';

const origin = 'http://127.0.0.1:4173';
const payload = (requestId = 'r1'): PlannerRequest => ({
  snapshot: {
    schemaVersion: 1, requestId, snapshotId: `s_${requestId}`, documentInstanceId: 'instance1',
    origin, goal: 'complete_form', goalRef: null, semanticRevision: 0, optionRevision: 0, controls: [], notices: [],
  }, remainingBudgetMs: 10000, sessionEpoch: 1,
});
const result = (request = payload()): PlannerResponse => ({
  requestId: request.snapshot.requestId, snapshotId: request.snapshot.snapshotId,
  plan: { schemaVersion: 1, snapshotId: request.snapshot.snapshotId, steps: [{ id: 'step1', template: 'grouped_form', title: '입력', controlRefs: [], noticeRefs: [] }], sourceActionRef: null },
  mode: 'FIXTURE', model: null, promptVersion: 'test', cacheVersion: 'test', blueprintId: 'bp1', durationMs: 1,
});
const prepare = (request = payload()) => ({ type: 'FLECTO_PREPARE', payload: request });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
async function flush() { for (let i = 0; i < 60; i++) await Promise.resolve(); }

function harness(saved: Record<string, unknown> = {}) {
  const local: Record<string, unknown> = { flectoConnection: { plannerUrl: 'http://127.0.0.1:4317/', token: 'TEST_ONLY_SECRET' } };
  const session: Record<string, unknown> = structuredClone(saved);
  const tabs = new Map<number, chrome.tabs.Tab>([[1, { id: 1, url: `${origin}/start`, active: true, windowId: 1 } as chrome.tabs.Tab]]);
  const frames = new Map<number, chrome.webNavigation.GetFrameResultDetails>([[1, {
    url: `${origin}/start`, documentId: 'chrome-doc1', documentLifecycle: 'active', errorOccurred: false, frameType: 'outermost_frame', parentFrameId: -1,
  }]]);
  const event = () => ({ addListener: vi.fn() });
  const area = (data: Record<string, unknown>) => ({
    setAccessLevel: vi.fn(async () => undefined),
    get: vi.fn(async (key: string) => structuredClone({ [key]: data[key] })),
    set: vi.fn(async (value: object) => { Object.assign(data, structuredClone(value)); }),
  });
  const mock = {
    runtime: { id: EXTENSION_ID, onMessage: event() }, action: { onClicked: event() },
    storage: { local: area(local), session: area(session) },
    webNavigation: {
      getFrame: vi.fn(async ({ tabId }: { tabId: number }) => frames.get(tabId)),
      onCommitted: event(), onHistoryStateUpdated: event(), onReferenceFragmentUpdated: event(),
    },
    scripting: { executeScript: vi.fn(async () => []) },
    tabs: {
      get: vi.fn(async (id: number) => { const tab = tabs.get(id); if (!tab) throw new Error('missing'); return tab; }),
      sendMessage: vi.fn(async (_tabId: number, _message: unknown, _options: unknown) => ({ ok: true })),
      onRemoved: event(), onActivated: event(), onReplaced: event(),
    },
  };
  const api = mock as unknown as typeof chrome;
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => init?.method === 'POST' ? json(result(JSON.parse(String(init.body)))) : json({ ok: true }));
  const broker = new BackgroundBroker(api, fetcher);
  const sender = (): chrome.runtime.MessageSender => ({ id: EXTENSION_ID, tab: tabs.get(1), frameId: 0, url: frames.get(1)!.url, origin, documentId: frames.get(1)!.documentId, documentLifecycle: 'active' });
  return { broker, mock, api, fetcher, local, session, tabs, frames, sender, activate: () => broker.activate(tabs.get(1)!) };
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('background authorization and storage boundary', () => {
  it('native toolbar opts into preparation but navigation does not replay it', async () => {
    const h = harness();
    const native = startBackground(h.api);
    const activate = vi.spyOn(native, 'activate');
    h.mock.action.onClicked.addListener.mock.calls[0][0](h.tabs.get(1)!);
    await vi.waitFor(() => expect(h.mock.tabs.sendMessage).toHaveBeenCalledWith(1,
      { type: 'FLECTO_ACTIVATE', pendingSubmit: false, autoPrepare: true }, { documentId: 'chrome-doc1', frameId: 0 }));
    expect(activate).toHaveBeenCalledWith(h.tabs.get(1)!, true);
    h.frames.get(1)!.documentId = 'chrome-doc2';
    await native.navigation({ tabId: 1, frameId: 0, url: `${origin}/next`, documentId: 'chrome-doc2' });
    expect(h.mock.tabs.sendMessage.mock.calls.at(-1)![1]).toEqual({ type: 'FLECTO_ACTIVATE', pendingSubmit: false });
  });

  it('allows one static sponsor per active session across retries and worker restart', async () => {
    const h = harness(); await h.activate();
    expect(await h.broker.handle({ type: 'FLECTO_SPONSOR_CLAIM' }, h.sender())).toEqual({ ok: true, sponsorAllowed: true });
    expect(await h.broker.handle({ type: 'FLECTO_SPONSOR_CLAIM' }, h.sender())).toEqual({ ok: true, sponsorAllowed: false });
    const restarted = new BackgroundBroker(h.api, h.fetcher);
    expect(await restarted.handle({ type: 'FLECTO_SPONSOR_CLAIM' }, h.sender())).toEqual({ ok: true, sponsorAllowed: false });
    expect(h.fetcher).not.toHaveBeenCalled();
    await restarted.handle({ type: 'FLECTO_STATE', documentInstanceId: 'instance1', active: false, pendingSubmit: false }, h.sender());
    await restarted.activate(h.tabs.get(1)!);
    expect(await restarted.handle({ type: 'FLECTO_SPONSOR_CLAIM' }, h.sender())).toEqual({ ok: true, sponsorAllowed: true });
  });
  it('registers MV3 listeners synchronously while storage is loading', () => {
    const h = harness();
    startBackground(h.api);
    expect(h.mock.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
    expect(h.mock.webNavigation.onCommitted.addListener).toHaveBeenCalledTimes(1);
    expect(h.mock.webNavigation.onHistoryStateUpdated.addListener).toHaveBeenCalledTimes(1);
    expect(h.mock.runtime.onMessage.addListener.mock.calls[0][0]({}, {}, () => {})).toBe(true);
  });

  it('content cannot create an authorization or reactivate a closed session', async () => {
    const h = harness();
    const state = { type: 'FLECTO_STATE', documentInstanceId: 'instance1', active: true, pendingSubmit: false };
    expect(await h.broker.handle(state, h.sender())).toEqual({ ok: false, error: 'AUTH_REQUIRED' });
    expect(await h.broker.handle(prepare(), h.sender())).toEqual({ ok: false, error: 'AUTH_REQUIRED' });
    await h.activate();
    expect(await h.broker.handle({ ...state, active: false }, h.sender())).toEqual({ ok: true });
    expect(await h.broker.handle(state, h.sender())).toEqual({ ok: false, error: 'AUTH_REQUIRED' });
    expect(h.fetcher).not.toHaveBeenCalled();
  });

  it('locks storage before read/injection and persists only the authorized session', async () => {
    const h = harness();
    await h.activate();
    expect(h.mock.storage.local.setAccessLevel).toHaveBeenCalledWith({ accessLevel: 'TRUSTED_CONTEXTS' });
    expect(h.mock.storage.session.setAccessLevel).toHaveBeenCalledWith({ accessLevel: 'TRUSTED_CONTEXTS' });
    expect(h.mock.storage.local.setAccessLevel.mock.invocationCallOrder[0]).toBeLessThan(h.mock.scripting.executeScript.mock.invocationCallOrder[0]);
    expect(h.session).toEqual({ flectoSessions: { '1': { origin, active: true, pendingSubmit: false, epoch: 1, sponsorShown: false } } });
    expect(h.mock.scripting.executeScript).toHaveBeenCalledWith({ target: { tabId: 1, documentIds: ['chrome-doc1'] }, files: ['content.js'] });
    expect(h.mock.tabs.sendMessage).toHaveBeenCalledWith(1, { type: 'FLECTO_ACTIVATE', pendingSubmit: false }, { documentId: 'chrome-doc1', frameId: 0 });
  });

  it('fails closed if trusted-context protection cannot be installed', async () => {
    const h = harness();
    h.mock.storage.local.setAccessLevel.mockRejectedValue(new Error('denied'));
    const broker = new BackgroundBroker(h.api, h.fetcher);
    await expect(broker.activate(h.tabs.get(1)!)).rejects.toThrow();
    expect(h.mock.scripting.executeScript).not.toHaveBeenCalled();
    expect(h.mock.storage.local.get).not.toHaveBeenCalled();
  });

  it.each([
    ['foreign extension', { id: 'foreign' }], ['missing tab', { tab: undefined }],
    ['subframe', { frameId: 2 }], ['missing document', { documentId: undefined }],
    ['opaque origin', { origin: 'null' }], ['cached document', { documentLifecycle: 'cached' }],
    ['non-HTTP page', { url: 'file:///tmp/test' }], ['cross origin', { url: 'https://other.example/', origin: 'https://other.example' }],
  ])('rejects %s without planner access', async (_label, patch) => {
    const h = harness(); await h.activate();
    const reply = await h.broker.handle(prepare(), { ...h.sender(), ...patch } as chrome.runtime.MessageSender);
    expect(reply).toEqual({ ok: false, error: 'AUTH_REQUIRED' });
    expect(h.fetcher).not.toHaveBeenCalled();
  });

  it('checks actual current frame document rather than trusting sender.tab', async () => {
    const h = harness(); await h.activate();
    const old = h.sender();
    h.frames.get(1)!.documentId = 'new-chrome-doc';
    expect(await h.broker.handle(prepare(), old)).toEqual({ ok: false, error: 'STALE_DOCUMENT' });
    expect(h.fetcher).not.toHaveBeenCalled();
  });

  it('does not let a different content document update pending submission state', async () => {
    const h = harness(); await h.activate();
    await h.broker.handle({ type: 'FLECTO_STATE', documentInstanceId: 'instance1', active: true, pendingSubmit: true }, h.sender());
    expect(await h.broker.handle({ type: 'FLECTO_STATE', documentInstanceId: 'other-instance', active: true, pendingSubmit: false }, h.sender())).toEqual({ ok: false, error: 'STALE_DOCUMENT' });
    expect(await h.broker.handle({ type: 'FLECTO_SESSION_GET' }, h.sender())).toEqual({ ok: true, session: { active: true, pendingSubmit: true } });
  });

  it('reads/writes only settings for settings messages and rejects token smuggling', async () => {
    const h = harness(); await h.activate();
    expect(await h.broker.handle({ type: 'FLECTO_SETTINGS_GET' }, h.sender())).toEqual({ ok: true, settings: DEFAULT_SETTINGS });
    expect(h.mock.storage.local.get).toHaveBeenCalledWith('flectoSettings');
    expect(h.mock.storage.local.get).not.toHaveBeenCalledWith('flectoConnection');
    const settings = { ...DEFAULT_SETTINGS, contrast: 'high' };
    expect(await h.broker.handle({ type: 'FLECTO_SETTINGS_SET', settings }, h.sender())).toEqual({ ok: true, settings });
    expect(await h.broker.handle({ type: 'FLECTO_SETTINGS_SET', settings: { ...settings, token: 'bad' } }, h.sender())).toEqual({ ok: false, error: 'SCHEMA_INVALID' });
    expect(h.mock.storage.local.set).toHaveBeenCalledExactlyOnceWith({ flectoSettings: settings });
  });

  it.each(['http://localhost:4317', 'https://127.0.0.1:4317', 'http://127.1:4317', 'http://2130706433:4317', 'http://127.0.0.1:4317/path', 'http://127.0.0.1:4317/?x=1', 'http://user@127.0.0.1:4317', 'http://127.0.0.1:99999', 'http://127.0.0.1:0', 'https://evil.example'])('rejects unsafe planner address %s', (url) => {
    expect(plannerOrigin(url)).toBeNull();
  });

  it('does not fetch invalid connection config or a mismatched snapshot origin', async () => {
    const h = harness(); await h.activate();
    const request = payload(); request.snapshot.origin = 'https://other.example';
    expect(await h.broker.handle(prepare(request), h.sender())).toEqual({ ok: false, error: 'AUTH_REQUIRED' });
    h.local.flectoConnection = { plannerUrl: 'https://evil.example', token: 'secret' };
    expect(await h.broker.handle(prepare(), h.sender())).toEqual({ ok: false, error: 'AUTH_REQUIRED' });
    expect(h.fetcher).not.toHaveBeenCalled();
  });
});

describe('background planner ownership and deadline', () => {
  it('posts strict JSON to loopback with bearer/Origin and validates the full response', async () => {
    const h = harness(); await h.activate();
    expect(await h.broker.handle(prepare(), h.sender())).toEqual({ ok: true, result: result() });
    const [url, init] = h.fetcher.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:4317/v1/plans');
    expect(init).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer TEST_ONLY_SECRET', Origin: EXTENSION_ORIGIN }, redirect: 'error', credentials: 'omit' });
    const sent = JSON.parse(String(init!.body));
    expect(sent.snapshot).toEqual(payload().snapshot);
    expect(sent.remainingBudgetMs).toBeGreaterThan(0);
    expect(sent.remainingBudgetMs).toBeLessThanOrEqual(10000);
    expect(JSON.stringify(h.session)).not.toMatch(/TEST_ONLY_SECRET|snapshot|plan|instance1/);
  });

  it.each(['private input', 'over budget', 'extra request field'])('rejects %s before fetching', async (kind) => {
    const h = harness(); await h.activate();
    const request = payload() as unknown as Record<string, unknown>;
    if (kind === 'private input') (request.snapshot as Record<string, unknown>).value = 'PRIVATE';
    if (kind === 'over budget') request.remainingBudgetMs = 10001;
    if (kind === 'extra request field') request.url = 'https://evil.example';
    expect(await h.broker.handle({ type: 'FLECTO_PREPARE', payload: request }, h.sender())).toEqual({ ok: false, error: 'SCHEMA_INVALID' });
    expect(h.fetcher).not.toHaveBeenCalled();
  });

  it.each(['request', 'snapshot', 'plan snapshot', 'extra', 'missing'])('rejects response %s mismatch', async (kind) => {
    const h = harness(); await h.activate();
    const response: Record<string, unknown> = result();
    if (kind === 'request') response.requestId = 'wrong';
    if (kind === 'snapshot') response.snapshotId = 'wrong';
    if (kind === 'plan snapshot') (response.plan as Record<string, unknown>).snapshotId = 'wrong';
    if (kind === 'extra') response.script = 'execute';
    if (kind === 'missing') delete response.mode;
    h.fetcher.mockResolvedValue(json(response));
    expect(await h.broker.handle(prepare(), h.sender())).toEqual({ ok: false, error: 'SCHEMA_INVALID' });
  });

  it('singleflights exact duplicates and rejects request ID rebinding', async () => {
    const h = harness(); await h.activate(); const response = deferred<Response>();
    h.fetcher.mockImplementation(() => response.promise);
    const first = h.broker.handle(prepare(), h.sender());
    const duplicate = h.broker.handle(prepare(), h.sender());
    await flush();
    expect(h.fetcher).toHaveBeenCalledTimes(1);
    const modified = payload(); modified.snapshot.semanticRevision = 1;
    expect(await h.broker.handle(prepare(modified), h.sender())).toEqual({ ok: false, error: 'STALE_DOCUMENT' });
    response.resolve(json(result()));
    expect(await first).toEqual({ ok: true, result: result() });
    expect(await duplicate).toEqual({ ok: true, result: result() });
  });

  it('rejects an older client epoch without cancelling the newer goal', async () => {
    const h = harness(); await h.activate();
    const newest = payload(); newest.sessionEpoch = 5;
    expect(await h.broker.handle(prepare(newest), h.sender())).toEqual({ ok: true, result: result(newest) });
    const old = payload('r2'); old.sessionEpoch = 4;
    expect(await h.broker.handle(prepare(old), h.sender())).toEqual({ ok: false, error: 'STALE_DOCUMENT' });
    expect(h.fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects cross-tab cancel/verify/ID reuse and returns BUSY for another tab while planning', async () => {
    const h = harness(); await h.activate();
    const tab2 = { ...h.tabs.get(1)!, id: 2, windowId: 2 };
    h.tabs.set(2, tab2); h.frames.set(2, { ...h.frames.get(1)!, documentId: 'chrome-doc2' });
    await h.broker.activate(tab2);
    const sender2 = { ...h.sender(), tab: tab2, documentId: 'chrome-doc2' };
    const response = deferred<Response>(); h.fetcher.mockImplementationOnce(() => response.promise);
    const first = h.broker.handle(prepare(), h.sender()); await flush();
    expect(await h.broker.handle(prepare(), sender2)).toEqual({ ok: false, error: 'STALE_DOCUMENT' });
    expect(await h.broker.handle(prepare(payload('r2')), sender2)).toEqual({ ok: false, error: 'BUSY' });
    expect(await h.broker.handle({ type: 'FLECTO_CANCEL', requestId: 'r1', documentInstanceId: 'instance1' }, sender2)).toEqual({ ok: false, error: 'STALE_DOCUMENT' });
    expect(h.fetcher).toHaveBeenCalledTimes(1);
    response.resolve(json(result())); expect(await first).toEqual({ ok: true, result: result() });
    expect(await h.broker.handle({ type: 'FLECTO_VERIFY', requestId: 'r1', snapshotId: 's_r1', blueprintId: 'bp1' }, sender2)).toEqual({ ok: false, error: 'STALE_DOCUMENT' });
    expect(h.fetcher).toHaveBeenCalledTimes(1);
  });

  it('cancels the old goal, deletes only its request and discards abort-ignoring late output', async () => {
    const h = harness(); await h.activate(); const old = deferred<Response>();
    h.fetcher.mockImplementationOnce(() => old.promise);
    const first = h.broker.handle(prepare(), h.sender()); await flush();
    const second = payload('r2'); second.snapshot.goal = 'choose';
    expect(await h.broker.handle(prepare(second), h.sender())).toEqual({ ok: true, result: result(second) });
    expect(await first).toEqual({ ok: false, error: 'CANCELLED' });
    expect(h.fetcher.mock.calls[0][1]!.signal!.aborted).toBe(true);
    expect(h.fetcher.mock.calls.some(([url, init]) => String(url).endsWith('/v1/plans/r1') && init!.method === 'DELETE')).toBe(true);
    old.resolve(json(result())); await flush();
    expect(await h.broker.handle({ type: 'FLECTO_VERIFY', requestId: 'r1', snapshotId: 's_r1', blueprintId: 'bp1' }, h.sender())).toEqual({ ok: false, error: 'STALE_DOCUMENT' });
  });

  it('checks current browser document again immediately before delivering a late response', async () => {
    const h = harness(); await h.activate(); const wait = deferred<Response>();
    h.fetcher.mockImplementationOnce(() => wait.promise);
    const reply = h.broker.handle(prepare(), h.sender()); await flush();
    h.frames.get(1)!.documentId = 'replaced-without-event';
    wait.resolve(json(result()));
    expect(await reply).toEqual({ ok: false, error: 'STALE_DOCUMENT' });
  });

  it('cancels in-flight work on tab deactivation even if fetch ignores AbortSignal', async () => {
    const h = harness(); await h.activate();
    h.fetcher.mockImplementationOnce(() => new Promise(() => {}));
    const reply = h.broker.handle(prepare(), h.sender()); await flush();
    h.tabs.get(1)!.active = false;
    h.broker.tabActivated({ tabId: 2, windowId: 1 });
    expect(await reply).toEqual({ ok: false, error: 'CANCELLED' });
    expect(h.fetcher.mock.calls[0][1]!.signal!.aborted).toBe(true);
  });

  it('includes slow config reads in the one deadline and never fetches after it expires', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const h = harness(); await h.activate(); const config = deferred<Record<string, unknown>>();
    h.mock.storage.local.get.mockImplementationOnce(() => config.promise);
    const request = payload(); request.remainingBudgetMs = 100;
    const reply = h.broker.handle(prepare(request), h.sender()); await flush();
    await vi.advanceTimersByTimeAsync(100);
    expect(await reply).toEqual({ ok: false, error: 'DEADLINE_EXCEEDED' });
    config.resolve({ flectoConnection: h.local.flectoConnection }); await flush();
    expect(h.fetcher).not.toHaveBeenCalled();
  });

  it('times out an unresponsive fetch and prevents late delivery', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const h = harness(); await h.activate(); const response = deferred<Response>();
    h.fetcher.mockImplementationOnce(() => response.promise);
    const request = payload(); request.remainingBudgetMs = 100;
    const reply = h.broker.handle(prepare(request), h.sender()); await flush();
    await vi.advanceTimersByTimeAsync(100);
    expect(await reply).toEqual({ ok: false, error: 'DEADLINE_EXCEEDED' });
    response.resolve(json(result())); await flush();
    expect(await h.broker.handle({ type: 'FLECTO_VERIFY', requestId: 'r1', snapshotId: 's_r1', blueprintId: 'bp1' }, h.sender())).toEqual({ ok: false, error: 'STALE_DOCUMENT' });
  });

  it('subtracts config time from the server budget instead of granting a second deadline', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const h = harness(); await h.activate(); const config = deferred<Record<string, unknown>>();
    h.mock.storage.local.get.mockImplementationOnce(() => config.promise);
    const request = payload(); request.remainingBudgetMs = 100;
    const reply = h.broker.handle(prepare(request), h.sender()); await flush();
    await vi.advanceTimersByTimeAsync(70);
    config.resolve({ flectoConnection: h.local.flectoConnection });
    expect(await reply).toEqual({ ok: true, result: result() });
    expect(JSON.parse(String(h.fetcher.mock.calls[0][1]!.body)).remainingBudgetMs).toBe(30);
  });

  it('bounds startup/storage restoration by the same prepare deadline', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const h = harness(); const storage = deferred<Record<string, unknown>>();
    h.mock.storage.session.get.mockImplementationOnce(() => storage.promise);
    const request = payload(); request.remainingBudgetMs = 100;
    const reply = h.broker.handle(prepare(request), h.sender()); await flush();
    await vi.advanceTimersByTimeAsync(100);
    expect(await reply).toEqual({ ok: false, error: 'DEADLINE_EXCEEDED' });
    storage.resolve({}); await flush();
    expect(h.fetcher).not.toHaveBeenCalled();
  });

  it('returns only typed errors, never raw network or server error text', async () => {
    const h = harness(); await h.activate();
    h.fetcher.mockRejectedValueOnce(new Error('TEST_ONLY_SECRET https://private'));
    expect(await h.broker.handle(prepare(), h.sender())).toEqual({ ok: false, error: 'PROVIDER_ERROR' });
    h.fetcher.mockImplementation(async (_url, init) => init?.method === 'DELETE' ? json({ ok: true }) : json({ error: 'secret stack' }, 500));
    expect(await h.broker.handle(prepare(payload('r2')), h.sender())).toEqual({ ok: false, error: 'PROVIDER_ERROR' });
    h.fetcher.mockImplementation(async (_url, init) => init?.method === 'DELETE' ? json({ ok: true }) : json({ error: 'BUSY' }, 409));
    expect(await h.broker.handle(prepare(payload('r3')), h.sender())).toEqual({ ok: false, error: 'BUSY' });
  });

  it('requires an owned delivered receipt for verification and an owned document for cancellation', async () => {
    const h = harness(); await h.activate();
    const verify = { type: 'FLECTO_VERIFY', requestId: 'r1', snapshotId: 's_r1', blueprintId: 'bp1' };
    expect(await h.broker.handle(verify, h.sender())).toEqual({ ok: false, error: 'STALE_DOCUMENT' });
    await h.broker.handle(prepare(), h.sender());
    expect(await h.broker.handle({ ...verify, blueprintId: 'other' }, h.sender())).toEqual({ ok: false, error: 'STALE_DOCUMENT' });
    h.fetcher.mockResolvedValueOnce(json({ ok: true }));
    expect(await h.broker.handle(verify, h.sender())).toEqual({ ok: true });
    expect(h.fetcher.mock.calls.at(-1)![0]).toBe('http://127.0.0.1:4317/v1/blueprints/bp1/verify');
    expect(JSON.parse(String(h.fetcher.mock.calls.at(-1)![1]!.body))).toEqual({ requestId: 'r1', snapshotId: 's_r1' });
    const count = h.fetcher.mock.calls.length;
    expect(await h.broker.handle({ type: 'FLECTO_CANCEL', requestId: 'r1', documentInstanceId: 'wrong' }, h.sender())).toEqual({ ok: false, error: 'STALE_DOCUMENT' });
    expect(h.fetcher).toHaveBeenCalledTimes(count);
    expect(await h.broker.handle({ type: 'FLECTO_CANCEL', requestId: 'r1', documentInstanceId: 'instance1' }, h.sender())).toEqual({ ok: true });
    expect(h.fetcher.mock.calls.at(-1)![1]!.method).toBe('DELETE');
    expect(await h.broker.handle(verify, h.sender())).toEqual({ ok: false, error: 'STALE_DOCUMENT' });
  });
});

describe('background N02 navigation and restart', () => {
  it('retains pending submission across navigation/restart with no request or source-action replay', async () => {
    const h = harness(); await h.activate();
    expect(await h.broker.handle({ type: 'FLECTO_STATE', documentInstanceId: 'instance1', pendingSubmit: true, active: true }, h.sender())).toEqual({ ok: true });
    h.frames.get(1)!.documentId = 'chrome-doc2'; h.frames.get(1)!.url = `${origin}/result`;
    await h.broker.navigation({ tabId: 1, frameId: 0, documentId: 'chrome-doc2', url: `${origin}/result` });
    expect(h.mock.tabs.sendMessage.mock.calls.at(-1)![1]).toEqual({ type: 'FLECTO_ACTIVATE', pendingSubmit: true });
    const restarted = new BackgroundBroker(h.api, h.fetcher);
    expect(await restarted.handle({ type: 'FLECTO_SESSION_GET' }, h.sender())).toEqual({ ok: true, session: { active: true, pendingSubmit: true } });
    expect(h.fetcher).not.toHaveBeenCalled();
    expect(h.session).toEqual({ flectoSessions: { '1': { origin, active: true, pendingSubmit: true, epoch: 2, sponsorShown: false } } });
  });

  it('invalidates old references on full navigation and requires a new instance', async () => {
    const h = harness(); await h.activate(); const oldSender = h.sender();
    await h.broker.handle(prepare(), oldSender);
    h.frames.get(1)!.documentId = 'chrome-doc2';
    await h.broker.navigation({ tabId: 1, frameId: 0, documentId: 'chrome-doc2', url: `${origin}/next` });
    expect(await h.broker.handle({ type: 'FLECTO_STATE', documentInstanceId: 'instance1', active: true, pendingSubmit: true }, oldSender)).toEqual({ ok: false, error: 'STALE_DOCUMENT' });
    const request = payload('r2'); request.snapshot.documentInstanceId = 'instance2';
    expect(await h.broker.handle(prepare(request), h.sender())).toEqual({ ok: true, result: result(request) });
  });

  it('sends SPA invalidation to existing content without reinjection and cancels old work', async () => {
    const h = harness(); await h.activate();
    h.fetcher.mockImplementationOnce(() => new Promise(() => {}));
    const reply = h.broker.handle(prepare(), h.sender()); await flush();
    await h.broker.navigation({ tabId: 1, frameId: 0, documentId: 'chrome-doc1', url: `${origin}/spa` }, true);
    expect(await reply).toEqual({ ok: false, error: 'CANCELLED' });
    expect(h.mock.scripting.executeScript).toHaveBeenCalledTimes(1);
    expect(h.mock.tabs.sendMessage.mock.calls.at(-1)![1]).toEqual({ type: 'FLECTO_SOURCE_NAVIGATION' });
  });

  it('aborts an in-flight verification when navigation revokes its delivered receipt', async () => {
    const h = harness(); await h.activate(); await h.broker.handle(prepare(), h.sender());
    h.fetcher.mockImplementationOnce(() => new Promise(() => {}));
    const reply = h.broker.handle({ type: 'FLECTO_VERIFY', requestId: 'r1', snapshotId: 's_r1', blueprintId: 'bp1' }, h.sender()); await flush();
    const signal = h.fetcher.mock.calls.at(-1)![1]!.signal!;
    await h.broker.navigation({ tabId: 1, frameId: 0, documentId: 'chrome-doc1', url: `${origin}/next` }, true);
    expect(await reply).toEqual({ ok: false, error: 'CANCELLED' });
    expect(signal.aborted).toBe(true);
  });

  it('restores no transient receipts or requests after worker restart', async () => {
    const h = harness(); await h.activate(); await h.broker.handle(prepare(), h.sender());
    const restarted = new BackgroundBroker(h.api, h.fetcher);
    expect(await restarted.handle({ type: 'FLECTO_VERIFY', requestId: 'r1', snapshotId: 's_r1', blueprintId: 'bp1' }, h.sender())).toEqual({ ok: false, error: 'STALE_DOCUMENT' });
    expect(await restarted.handle({ type: 'FLECTO_CANCEL', requestId: 'r1', documentInstanceId: 'instance1' }, h.sender())).toEqual({ ok: false, error: 'STALE_DOCUMENT' });
    expect(h.fetcher).toHaveBeenCalledTimes(1);
    expect(h.mock.scripting.executeScript).toHaveBeenCalledTimes(1);
  });

  it('prunes saved sessions for closed tabs or a different current origin on restart', async () => {
    const h = harness({ flectoSessions: {
      1: { origin: 'https://other.example', active: true, pendingSubmit: false, epoch: 1 },
      2: { origin, active: true, pendingSubmit: true, epoch: 1 },
      3: { origin, active: true, pendingSubmit: false, epoch: 1, value: 'PRIVATE' },
    } });
    await h.broker.ready;
    expect(h.session).toEqual({ flectoSessions: {} });
    expect(await h.broker.handle({ type: 'FLECTO_SESSION_GET' }, h.sender())).toEqual({ ok: false, error: 'AUTH_REQUIRED' });
  });

  it('revokes a cross-origin navigation even if the browser has already navigated back', async () => {
    const h = harness(); await h.activate();
    await h.broker.navigation({ tabId: 1, frameId: 0, documentId: 'overtaken-cross-origin', url: 'https://other.example/' });
    expect(h.session).toEqual({ flectoSessions: {} });
    expect(await h.broker.handle(prepare(), h.sender())).toEqual({ ok: false, error: 'AUTH_REQUIRED' });
  });

  it('clears authorization on cross-origin navigation and tab closure', async () => {
    const h = harness(); await h.activate();
    h.frames.get(1)!.url = 'https://other.example/'; h.frames.get(1)!.documentId = 'other-doc';
    await h.broker.navigation({ tabId: 1, frameId: 0, documentId: 'other-doc', url: 'https://other.example/' });
    expect(h.session).toEqual({ flectoSessions: {} });
    expect(h.mock.scripting.executeScript).toHaveBeenCalledTimes(1);
    h.frames.get(1)!.url = `${origin}/back`;
    expect(await h.broker.handle(prepare(), h.sender())).toEqual({ ok: false, error: 'AUTH_REQUIRED' });
    await h.activate(); await h.broker.remove(1);
    expect(h.session).toEqual({ flectoSessions: {} });
  });

  it('ignores subframe and overtaken navigation events', async () => {
    const h = harness(); await h.activate();
    await h.broker.navigation({ tabId: 1, frameId: 1, url: 'https://other.example/' });
    await h.broker.navigation({ tabId: 1, frameId: 0, documentId: 'old-doc', url: `${origin}/old` });
    expect(h.mock.scripting.executeScript).toHaveBeenCalledTimes(1);
    expect(await h.broker.handle({ type: 'FLECTO_SESSION_GET' }, h.sender())).toEqual({ ok: true, session: { active: true, pendingSubmit: false } });
  });
});
