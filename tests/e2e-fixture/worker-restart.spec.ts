import type { BrowserContext, Page, Worker } from '@playwright/test';
import { EXTENSION_ID } from '@flecto/contracts';
import { test, expect, dialog, beginBenefits, sourceReview, configureBenefits, countSourcePosts, benefitsRecords } from './qa-gates';

/**
 * Authored-only checkpoint; no browser run while lead owns the heavy slot.
 * Primary local API definitions inspected:
 *   node_modules/playwright-core/types/protocol.d.ts, ServiceWorker namespace:
 *   enable, workerVersionUpdated, stopWorker({ versionId }), runningStatus.
 *   node_modules/playwright-core/types/types.d.ts: BrowserContext.newCDPSession.
 * This uses a CDP session on the owned options page, not a debugger attached to
 * the target worker. No runtime.reload(), unregister, stopAllWorkers, browser
 * restart, or storage.session.clear(). Runtime CDP support is still NOT_RUN.
 * T25 coverage is only the service-worker lifecycle, not a browser/profile restart.
 */

type Version = { versionId: string; registrationId: string; scriptURL: string; runningStatus: string };
const scriptURL = `chrome-extension://${EXTENSION_ID}/background.js`;

async function sourceTabId(worker: Worker, page: Page) {
  const id = await worker.evaluate(async url => (await chrome.tabs.query({})).find(tab => tab.active && tab.url === url)?.id, page.url());
  expect(id).toBeDefined();
  return id!;
}

async function storedState(options: Page, tabId: number, privateMarkers: string[]) {
  return options.evaluate(async ({ tabId, privateMarkers }) => {
    const local = await chrome.storage.local.get(null);
    const session = await chrome.storage.session.get(null);
    const serialized = JSON.stringify({ local, session });
    const sessions = session.flectoSessions as Record<string, { active?: boolean; origin?: string; pendingSubmit?: boolean; epoch?: number }> | undefined;
    const own = sessions?.[String(tabId)];
    const settings = local.flectoSettings as { fontSize?: number } | undefined;
    // Never return connection tokens or entire storage values into test artifacts.
    return { privateMarkerFound: privateMarkers.some(value => serialized.includes(value)),
      fontSize: settings?.fontSize ?? null, connectionPresent: !!local.flectoConnection,
      session: own ? { active: own.active, origin: own.origin, pendingSubmit: own.pendingSubmit, epoch: own.epoch } : null };
  }, { tabId, privateMarkers });
}

async function workerControl(context: BrowserContext, options: Page, previousWorker: Worker) {
  expect(previousWorker.url()).toBe(scriptURL);
  const cdp = await context.newCDPSession(options);
  const versions = new Map<string, Version>();
  const events: Array<{ versionId: string; registrationId: string; status: string }> = [];
  let previousClosed = false;
  let replacement: Worker | undefined;
  const onClose = () => { previousClosed = true; };
  const onWorker = (worker: Worker) => { if (worker !== previousWorker && worker.url() === scriptURL) replacement = worker; };
  const onVersions = (event: { versions: Version[] }) => {
    for (const version of event.versions) {
      if (version.scriptURL !== scriptURL) continue;
      versions.set(version.versionId, version);
      events.push({ versionId: version.versionId, registrationId: version.registrationId, status: version.runningStatus });
    }
  };
  previousWorker.on('close', onClose);
  context.on('serviceworker', onWorker);
  cdp.on('ServiceWorker.workerVersionUpdated', onVersions);
  const dispose = async () => {
    previousWorker.off('close', onClose); context.off('serviceworker', onWorker);
    cdp.off('ServiceWorker.workerVersionUpdated', onVersions);
    try { await cdp.send('ServiceWorker.disable'); } finally { await cdp.detach(); }
  };
  try {
    await cdp.send('ServiceWorker.enable');
    await expect.poll(() => [...versions.values()].filter(version => version.runningStatus === 'running').length,
      { message: 'CDP must expose exactly the installed extension worker; do not substitute extension reload', timeout: 7000 }).toBe(1);
  } catch (error) { await dispose(); throw error; }
  return {
    dispose,
    async stopAndWake() {
      const own = [...versions.values()].find(version => version.runningStatus === 'running')!;
      expect(own.scriptURL).toBe(scriptURL);
      await cdp.send('ServiceWorker.stopWorker', { versionId: own.versionId });
      await expect.poll(() => previousClosed, { message: 'The old Playwright Worker must actually close' }).toBe(true);
      await expect.poll(() => events.some(event => event.versionId === own.versionId && event.status === 'stopped')).toBe(true);
      // This is the real extension runtime. Options are not authorized source
      // senders, so the expected AUTH_REQUIRED reply wakes the worker and waits
      // for broker restoration without granting a fake tab/document identity.
      const wake = await options.evaluate(async () => chrome.runtime.sendMessage({ type: 'FLECTO_SETTINGS_GET' }));
      expect(wake).toMatchObject({ ok: false, error: 'AUTH_REQUIRED' });
      await expect.poll(() => replacement !== undefined, { message: 'A new Worker object must be observed' }).toBe(true);
      await expect.poll(() => versions.get(own.versionId)?.runningStatus).toBe('running');
      expect(versions.get(own.versionId)?.registrationId).toBe(own.registrationId);
      expect(replacement).not.toBe(previousWorker);
      return { mechanism: 'ServiceWorker.stopWorker + options runtime.sendMessage',
        versionId: own.versionId, registrationId: own.registrationId,
        previousWorkerClosed: previousClosed, replacementObserved: !!replacement, wakeError: wake.error, events };
    },
  };
}

test('T11 T25 partial: actual worker stop preserves settings/cache, restores same-origin activation, and never restores private input', async ({ page, context, worker, activate, system, qa, consoleErrors }, info) => {
  await beginBenefits(page, activate, system);
  const privateMarker = 'QA_WORKER_PRIVATE_489173';
  await dialog(page).getByLabel('주문번호', { exact: false }).fill(privateMarker);
  await expect(page.locator('body > main input[name="orderNumber"]')).toHaveValue(privateMarker);
  const settingsToggle = dialog(page).locator('button[aria-controls][aria-expanded]');
  await settingsToggle.click();
  const large = dialog(page).getByRole('radio', { name: '크게', exact: true });
  if (!await large.isChecked()) await large.click();
  await expect(large).toBeChecked(); await expect(dialog(page)).toHaveAttribute('data-font', '30');
  await settingsToggle.click();
  const tabId = await sourceTabId(worker, page);
  const posts = countSourcePosts(page);
  const sourceOrigin = new URL(page.url()).origin;
  const initialDocument = JSON.parse(qa.exchanges[0].request).snapshot.documentInstanceId;
  const options = await context.newPage();
  const optionsErrors: string[] = []; options.on('pageerror', error => optionsErrors.push(error.message));
  try {
    await options.goto(`chrome-extension://${EXTENSION_ID}/options.html`);
    await expect.poll(async () => (await storedState(options, tabId, [privateMarker])).fontSize).toBe(30);
    const before = await storedState(options, tabId, [privateMarker]);
    expect(before.privateMarkerFound).toBe(false);
    expect(before.session).toMatchObject({ active: true, origin: sourceOrigin, pendingSubmit: false });
    const control = await workerControl(context, options, worker);
    try {
      const lifecycle = await control.stopAndWake();
      const after = await storedState(options, tabId, [privateMarker]);
      expect(after).toEqual(before);
      // Full source navigation must auto-reinject using restored nonprivate
      // authorization; do not call the activation helper tied to the dead worker.
      await page.bringToFront();
      await page.goto(`${sourceOrigin}/apply`);
      await expect(dialog(page)).toHaveAttribute('data-phase', 'IDLE');
      await expect(dialog(page)).toHaveAttribute('data-font', '30');
      await expect(page.locator('body > main input[name="orderNumber"]')).toHaveValue('');
      await expect(page.locator('body > main input[name="consent"]')).not.toBeChecked();
      expect(posts).toEqual([]);
      expect(qa.exchanges.length).toBe(1); // Restart/navigation must not auto-plan.
      await dialog(page).getByRole('button', { name: '신청 내용 확인', exact: true }).click();
      await expect(dialog(page).getByLabel('주문번호', { exact: false })).toHaveValue('');
      expect(qa.exchanges.length).toBe(2);
      const latest = qa.exchanges.at(-1)!;
      expect(JSON.parse(latest.response!).mode).toBe('CACHE');
      expect(JSON.parse(latest.request).snapshot.documentInstanceId).not.toBe(initialDocument);
      expect((await storedState(options, tabId, [privateMarker])).privateMarkerFound).toBe(false);
      expect((await benefitsRecords(system)).count).toBe(0); expect(posts).toEqual([]);
      await info.attach('worker-restart-lifecycle', { body: JSON.stringify({ lifecycle, before, after,
        browserRestart: 'NOT_RUN', extensionReload: false, storageCleared: false }), contentType: 'application/json' });
      expect(optionsErrors).toEqual([]); expect(consoleErrors).toEqual([]);
    } finally { await control.dispose(); }
  } finally { await options.close(); }
});

test('T11: stopping the worker after an actual submit preserves pending state without replaying the source action', async ({ page, context, worker, activate, system, consoleErrors }, info) => {
  await sourceReview(page, activate, system);
  await configureBenefits(system, { fault: 'delayed', delayMs: 2000 });
  const tabId = await sourceTabId(worker, page);
  const sourceOrigin = new URL(page.url()).origin;
  const options = await context.newPage();
  const optionsErrors: string[] = []; options.on('pageerror', error => optionsErrors.push(error.message));
  try {
    await options.goto(`chrome-extension://${EXTENSION_ID}/options.html`);
    const control = await workerControl(context, options, worker);
    try {
      await page.bringToFront();
      const posts = countSourcePosts(page);
      const submit = dialog(page).locator('button[data-flecto-ref]');
      await expect(submit).toHaveCount(1); await expect(submit).toBeEnabled();
      await submit.scrollIntoViewIfNeeded();
      const box = await submit.boundingBox(); expect(box).not.toBeNull();
      // Real pointer input without Locator.click's navigation wait: stop during
      // the owned source's 2s delay, after FLECTO persisted pendingSubmit=true.
      await Promise.all([
        page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/apply/submit'),
        page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2),
      ]);
      const pending = await storedState(options, tabId, ['FLECTO-2026-001']);
      expect(pending.session).toMatchObject({ active: true, origin: sourceOrigin, pendingSubmit: true });
      expect(pending.privateMarkerFound).toBe(false);
      const lifecycle = await control.stopAndWake();
      await expect(page).toHaveURL(/\/receipt\//);
      await expect(dialog(page)).toHaveAttribute('data-phase', 'SUCCESS');
      await expect.poll(async () => (await storedState(options, tabId, ['FLECTO-2026-001'])).session?.pendingSubmit).toBe(false);
      await page.waitForTimeout(500); // Check no queued replay after restoration.
      const saved = await benefitsRecords(system);
      expect(saved.count).toBe(1); expect(saved.insertionCount).toBe(1);
      expect(saved.records[0]).toMatchObject({ orderNumber: 'FLECTO-2026-001', category: '가전', consent: true });
      expect(posts).toEqual(['/apply/submit']);
      await expect(page.locator('body > main output[aria-label="접수 번호"]')).toHaveText(String(saved.records[0].id));
      expect((await storedState(options, tabId, ['FLECTO-2026-001'])).privateMarkerFound).toBe(false);
      await info.attach('pending-submit-restart', { body: JSON.stringify({ lifecycle, pending,
        posts, savedCount: saved.count, insertionCount: saved.insertionCount, extensionReload: false, storageCleared: false }), contentType: 'application/json' });
      expect(optionsErrors).toEqual([]); expect(consoleErrors).toEqual([]);
    } finally { await control.dispose(); }
  } finally { await options.close(); }
});
