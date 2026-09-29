import type { Locator, Page, Worker } from '@playwright/test';
import {
  test, expect, dialog, beginBenefits, openBenefits, loginBenefits, sourceReview,
  configureBenefits, benefitsRecords, countSourcePosts,
} from './qa-gates';

/**
 * QA checkpoint: authored against integrated 0066a1f; browser execution NOT_RUN
 * until the lead releases the heavy slot. Uses only owned fixture services and
 * installed extension profiles. T04 is synthetic composition, T24 is a 200%-
 * equivalent CSS viewport; neither is MANUAL02/03 or a real OS IME/zoom claim.
 * Existing helpers/config/product files and original gate meanings are unchanged.
 */

const submitAction = (page: Page) => dialog(page).locator('button[data-flecto-ref]');
const localNext = (page: Page) => dialog(page).locator('footer button').last();

async function twoFrames(page: Page) {
  await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
}

async function activeSession(worker: Worker, page: Page) {
  return worker.evaluate(async url => {
    const tab = (await chrome.tabs.query({})).find(item => item.active && item.url === url);
    const stored = await chrome.storage.session.get('flectoSessions');
    const sessions = stored.flectoSessions as Record<string, { active?: boolean; origin?: string }> | undefined;
    const session = tab?.id === undefined ? undefined : sessions?.[String(tab.id)];
    return { tabFound: tab?.id !== undefined, active: session?.active === true, origin: session?.origin ?? null };
  }, page.url());
}

async function syntheticCompositionValue(input: Locator, value: string, caret: number) {
  await input.evaluate((element: HTMLInputElement, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, next.value);
    element.setSelectionRange(next.caret, next.caret);
    element.dispatchEvent(new CompositionEvent('compositionupdate', { data: next.value, bubbles: true, composed: true }));
    element.dispatchEvent(new InputEvent('input', {
      data: next.value, inputType: 'insertCompositionText', isComposing: true, bubbles: true, composed: true,
    }));
  }, { value, caret });
}

for (const firstInput of ['pointer', 'keyboard'] as const) {
test(`T07: ${firstInput}-first rapid clicks and Enter presses save exactly one original record`, async ({ page, activate, system, consoleErrors }, info) => {
  await sourceReview(page, activate, system);
  await configureBenefits(system, { fault: 'delayed', delayMs: 1800 });
  const posts = countSourcePosts(page);
  const submit = submitAction(page);
  await expect(submit).toHaveCount(1);
  await expect(submit).toBeEnabled();
  await submit.scrollIntoViewIfNeeded();
  await submit.focus();
  const bounds = await submit.boundingBox();
  expect(bounds).not.toBeNull();
  const x = bounds!.x + bounds!.width / 2, y = bounds!.y + bounds!.height / 2;
  // Coordinates keep sending real input after the original button disappears.
  // Locator.click would wait for the replacement/disabled control instead.
  if (firstInput === 'keyboard') await page.keyboard.press('Enter');
  await page.mouse.dblclick(x, y, { delay: 15 });
  await page.mouse.click(x, y);
  for (let index = 0; index < 5; index++) await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/receipt\//);
  await expect(dialog(page)).toHaveAttribute('data-phase', 'SUCCESS');
  await page.waitForTimeout(500); // Bounded observation for a queued replay.
  const original = await benefitsRecords(system);
  expect(posts).toEqual(['/apply/submit']);
  expect(original.count).toBe(1); expect(original.insertionCount).toBe(1);
  expect(original.records[0]).toMatchObject({ orderNumber: 'FLECTO-2026-001', purchaseDate: '2026-09-01', category: '가전', consent: true });
  await expect(page.locator('body > main output[aria-label="접수 번호"]')).toHaveText(String(original.records[0].id));
  await info.attach('duplicate-input-evidence', { body: JSON.stringify({ firstInput, pointerClicks: 3, enterPresses: firstInput === 'keyboard' ? 6 : 5, observedPosts: posts,
    originalCount: original.count, originalInsertionCount: original.insertionCount }), contentType: 'application/json' });
  expect(consoleErrors).toEqual([]);
});
}

for (const obstruction of ['iframe', 'captcha'] as const) {
  test(`T23: visible unsupported ${obstruction} blocks planning and leaves the original usable`, async ({ page, activate, system, qa, consoleErrors }) => {
    await loginBenefits(page, system);
    await page.goto(`http://127.0.0.1:${system.ports.benefits}/apply`);
    await page.locator('body > main input[name="orderNumber"]').fill('FLECTO-2026-012');
    await page.evaluate(kind => {
      const form = document.querySelector('main form')!;
      if (kind === 'iframe') {
        const frame = document.createElement('iframe');
        frame.title = 'QA embedded application'; frame.dataset.qaObstruction = kind;
        form.append(frame); // No remote URL, content fetch, or third-party CAPTCHA.
      } else {
        const captcha = document.createElement('div'); captcha.className = 'g-recaptcha'; captcha.dataset.qaObstruction = kind;
        const label = document.createElement('label'); label.textContent = '합성 사람 확인';
        const answer = document.createElement('input'); answer.name = 'captcha-answer';
        label.append(answer); captcha.append(label); form.append(captcha);
      }
    }, obstruction);
    const posts = countSourcePosts(page);
    await activate(page);
    await expect(dialog(page)).toHaveAttribute('data-phase', 'UNSUPPORTED');
    await page.waitForTimeout(400);
    expect(qa.exchanges.length).toBe(0); expect(posts).toEqual([]);
    await expect(page.locator(`[data-qa-obstruction="${obstruction}"]`)).toHaveCount(1);
    if (obstruction === 'captcha') await expect(page.locator('input[name="captcha-answer"]')).toHaveValue('');
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator('body > main input[name="orderNumber"]')).toHaveValue('FLECTO-2026-012');
    await page.locator('body > main input[name="orderNumber"]').fill('FLECTO-2026-013');
    await expect(page.locator('body > main input[name="orderNumber"]')).toHaveValue('FLECTO-2026-013');
    expect((await benefitsRecords(system)).count).toBe(0);
    expect(consoleErrors).toEqual([]);
  });
}

test('T32: preparation timer, sponsor, and local settings mutations do not request another plan', async ({ page, activate, system, qa, consoleErrors }) => {
  await openBenefits(page, activate, system);
  qa.delayMs = 4200;
  await dialog(page).getByRole('button', { name: '신청 내용 확인', exact: true }).click();
  await expect.poll(() => qa.exchanges.length).toBe(1);
  const firstRequest = JSON.parse(qa.exchanges[0].request).snapshot.requestId;
  await expect(dialog(page).getByRole('complementary', { name: 'FLECTO 후원 광고' })).toBeVisible();
  await expect(dialog(page)).toHaveAttribute('data-phase', 'PREPARING');
  await expect(dialog(page).getByLabel('주문번호', { exact: false })).toBeEditable();
  // Use the settings disclosure relationship, not the heading or footer wording.
  const settingsToggle = dialog(page).locator('button[aria-controls][aria-expanded]');
  await expect(settingsToggle).toHaveCount(1);
  await settingsToggle.click();
  await dialog(page).getByRole('radio', { name: '크게', exact: true }).check();
  await expect(dialog(page)).toHaveAttribute('data-font', '30');
  await settingsToggle.click();
  // A deliberately source-looking child belongs to the extension host, so it
  // must be ignored by both extraction and source mutation observation.
  await page.evaluate(() => {
    const host = document.querySelector('#flecto-host')!;
    const owned = document.createElement('input'); owned.required = true; owned.setAttribute('aria-label', 'QA_ONLY_EXTENSION_MUTATION');
    host.append(owned);
    owned.setAttribute('disabled', ''); owned.removeAttribute('disabled'); owned.remove();
  });
  await page.waitForTimeout(800); // Several real controller ticks and mutation debounce windows.
  expect(qa.exchanges.length).toBe(1);
  expect(JSON.parse(qa.exchanges[0].request).snapshot.requestId).toBe(firstRequest);
  expect(qa.exchanges[0].request).not.toContain('QA_ONLY_EXTENSION_MUTATION');
  await expect(dialog(page)).toHaveAttribute('data-phase', 'READY');
  await expect(dialog(page).getByRole('complementary', { name: 'FLECTO 후원 광고' })).toHaveCount(0);
  expect((await benefitsRecords(system)).count).toBe(0);
  expect(consoleErrors).toEqual([]);
});

test('T18 T38 partial: changing tabs cancels the old preparation and confines new bindings to the new tab', async ({ page, context, activate, worker, system, qa, consoleErrors }, info) => {
  await openBenefits(page, activate, system); qa.delayMs = 2200;
  await dialog(page).getByRole('button', { name: '신청 내용 확인', exact: true }).click();
  await expect.poll(() => qa.exchanges.length).toBe(1);
  const firstTabId = await worker.evaluate(async url => (await chrome.tabs.query({})).find(tab => tab.url === url && tab.active)?.id, page.url());
  expect(firstTabId).toBeDefined();
  const other = await context.newPage();
  const otherErrors: string[] = []; other.on('pageerror', error => otherErrors.push(error.message));
  try {
    await other.goto(`http://127.0.0.1:${system.ports.benefits}/apply`);
    await other.bringToFront();
    // Chrome's real tab ownership works in headless mode without assuming the
    // platform also emulates window occlusion/document visibility identically.
    await expect.poll(() => worker.evaluate(async tabId => (await chrome.tabs.get(tabId)).active, firstTabId!)).toBe(false);
    await expect(dialog(other)).toHaveCount(0);
    qa.delayMs = 0;
    await activate(other);
    await dialog(other).getByRole('button', { name: '신청 내용 확인', exact: true }).click();
    await expect(dialog(other).getByLabel('주문번호', { exact: false })).toBeEditable();
    await dialog(other).getByLabel('주문번호', { exact: false }).fill('FLECTO-2026-014');
    await expect(other.locator('body > main input[name="orderNumber"]')).toHaveValue('FLECTO-2026-014');
    await expect.poll(() => qa.exchanges[0].releasedAt).toBeTruthy();
    await page.bringToFront();
    await expect(dialog(page)).toHaveAttribute('data-phase', 'CANCELLED');
    await expect(page.locator('body > main input[name="orderNumber"]')).toHaveValue('');
    await other.bringToFront();
    await expect(dialog(other).getByLabel('주문번호', { exact: false })).toHaveValue('FLECTO-2026-014');
    expect(qa.exchanges.length).toBe(2);
    const documents = qa.exchanges.map(exchange => JSON.parse(exchange.request).snapshot);
    expect(documents[0].documentInstanceId).not.toBe(documents[1].documentInstanceId);
    expect(documents[0].requestId).not.toBe(documents[1].requestId);
    expect(documents[0].origin).toBe(documents[1].origin);
    await info.attach('tab-ownership', { body: JSON.stringify(documents.map(snapshot => ({ origin: snapshot.origin,
      documentInstanceId: snapshot.documentInstanceId, requestId: snapshot.requestId }))), contentType: 'application/json' });
    expect((await benefitsRecords(system)).count).toBe(0);
    expect(otherErrors).toEqual([]); expect(consoleErrors).toEqual([]);
  } finally { await other.close(); }
});

test('T38 partial: another local origin revokes activation and returning requires explicit reactivation', async ({ page, activate, worker, system, qa, consoleErrors }) => {
  await beginBenefits(page, activate, system);
  await dialog(page).getByLabel('주문번호', { exact: false }).fill('FLECTO-2026-015');
  const firstDocument = JSON.parse(qa.exchanges[0].request).snapshot.documentInstanceId;
  const benefitsOrigin = `http://127.0.0.1:${system.ports.benefits}`;
  const cultureOrigin = `http://127.0.0.1:${system.ports.culture}`;
  await page.goto(`${cultureOrigin}/courses`);
  await expect(page.locator('main')).toContainText('강좌');
  await expect.poll(() => activeSession(worker, page)).toEqual({ tabFound: true, active: false, origin: null });
  await expect(dialog(page)).toHaveCount(0);
  expect(qa.exchanges.length).toBe(1);
  await activate(page);
  await expect.poll(() => activeSession(worker, page)).toEqual({ tabFound: true, active: true, origin: cultureOrigin });
  await expect(dialog(page)).toBeVisible();
  // Crossing back does not resurrect the previously approved benefits session.
  await page.goto(`${benefitsOrigin}/apply`);
  await expect(page.locator('body > main input[name="orderNumber"]')).toBeVisible();
  await expect.poll(() => activeSession(worker, page)).toEqual({ tabFound: true, active: false, origin: null });
  await expect(dialog(page)).toHaveCount(0);
  await page.waitForTimeout(400);
  expect(qa.exchanges.length).toBe(1);
  await activate(page);
  await dialog(page).getByRole('button', { name: '신청 내용 확인', exact: true }).click();
  await expect(dialog(page).getByLabel('주문번호', { exact: false })).toHaveValue('');
  expect(qa.exchanges.length).toBe(2);
  const lastSnapshot = JSON.parse(qa.exchanges.at(-1)!.request).snapshot;
  expect(lastSnapshot.documentInstanceId).not.toBe(firstDocument);
  expect(lastSnapshot.origin).toBe(benefitsOrigin);
  expect((await benefitsRecords(system)).count).toBe(0);
  expect(consoleErrors).toEqual([]);
});

test('T24 partial: keyboard loop and source return work in a synthetic 200%-equivalent viewport', async ({ page, activate, system, consoleErrors }, info) => {
  // 1440x1100 / 2 gives the CSS layout space of a 200% desktop viewport.
  // This is a reflow proxy, not browser zoom, device scaling, or MANUAL03.
  await page.setViewportSize({ width: 720, height: 550 });
  await beginBenefits(page, activate, system);
  await expect(localNext(page)).toBeEnabled();
  const order = dialog(page).getByLabel('주문번호', { exact: false });
  const inputId = await order.getAttribute('id');
  const focus = () => page.evaluate(() => {
    const shadow = document.querySelector('#flecto-host')!.shadowRoot!;
    const root = shadow.querySelector('[role="dialog"]')!;
    const active = shadow.activeElement;
    return { inside: active !== null && root.contains(active),
      key: active ? Array.from(root.querySelectorAll('*')).indexOf(active) : -1, id: active?.id ?? '' };
  });
  await page.keyboard.press('Tab');
  const first = await focus();
  expect(first.inside).toBe(true);
  const trace = [first]; let wrapped = false;
  for (let index = 0; index < 40; index++) {
    await page.keyboard.press('Tab');
    const current = await focus(); expect(current.inside).toBe(true);
    if (current.key === first.key) { wrapped = true; break; }
    trace.push(current);
  }
  expect(wrapped, 'Tab must return to the first control instead of escaping to source/browser').toBe(true);
  expect(trace.length).toBeGreaterThan(3);
  expect(trace.some(item => item.id === inputId)).toBe(true);
  await page.keyboard.press('Shift+Tab');
  expect((await focus()).key).toBe(trace.at(-1)!.key);
  await page.keyboard.press('Tab');
  expect((await focus()).key).toBe(first.key);
  const widths = await dialog(page).evaluate(root => ({ scroll: root.scrollWidth, client: root.clientWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
  await order.fill('FLECTO-2026-016');
  await order.scrollIntoViewIfNeeded();
  const bounds = await order.boundingBox(); expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(721);
  expect(bounds!.y).toBeGreaterThanOrEqual(0); expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(551);
  await info.attach('synthetic-reflow-focus', { body: JSON.stringify({ viewport: { width: 720, height: 550 },
    scope: '200%-equivalent CSS viewport, NOT actual browser zoom or MANUAL03', trace, widths }), contentType: 'application/json' });
  await info.attach('synthetic-reflow', { body: await page.screenshot(), contentType: 'image/png' });
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  const original = page.locator('body > main input[name="orderNumber"]');
  await expect(original).toHaveValue('FLECTO-2026-016');
  await original.focus(); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.insertText('FLECTO-2026-017');
  await expect(original).toHaveValue('FLECTO-2026-017');
  expect((await benefitsRecords(system)).count).toBe(0);
  expect(consoleErrors).toEqual([]);
});

test('T04 partial: synthetic Korean composition preserves draft and caret without an Enter submission', async ({ page, activate, system, qa, consoleErrors }, info) => {
  await beginBenefits(page, activate, system);
  await dialog(page).getByLabel('구매일', { exact: false }).fill('2026-09-01');
  const input = dialog(page).getByLabel('주문번호', { exact: false });
  const original = page.locator('body > main input[name="orderNumber"]');
  const posts = countSourcePosts(page);
  await input.focus();
  await input.evaluate(element => element.dispatchEvent(new CompositionEvent('compositionstart', { data: '', bubbles: true, composed: true })));
  await twoFrames(page);
  await syntheticCompositionValue(input, '한', 1);
  await twoFrames(page);
  await expect(input).toHaveValue('한'); await expect(original).toHaveValue('');
  const allowed = await input.evaluate(element => element.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter', code: 'Enter', keyCode: 229, isComposing: true, bubbles: true, cancelable: true, composed: true,
  })));
  expect(allowed, 'composition Enter must be prevented before any source submit').toBe(false);
  await syntheticCompositionValue(input, '한글 신청', 2);
  await twoFrames(page);
  await expect(input).toHaveValue('한글 신청');
  expect(await input.evaluate((element: HTMLInputElement) => [element.selectionStart, element.selectionEnd])).toEqual([2, 2]);
  await input.evaluate(element => element.dispatchEvent(new CompositionEvent('compositionend', { data: '한글 신청', bubbles: true, composed: true })));
  await expect(original).toHaveValue('한글 신청'); await expect(input).toHaveValue('한글 신청');
  expect(await input.evaluate((element: HTMLInputElement) => [element.selectionStart, element.selectionEnd])).toEqual([2, 2]);
  await input.press('ControlOrMeta+A'); await page.keyboard.insertText('한글 붙여넣기 확인');
  await expect(input).toHaveValue('한글 붙여넣기 확인'); await expect(original).toHaveValue('한글 붙여넣기 확인');
  expect(await input.evaluate((element: HTMLInputElement) => element.selectionStart)).toBe('한글 붙여넣기 확인'.length);
  expect(posts).toEqual([]); expect((await benefitsRecords(system)).count).toBe(0);
  expect(qa.exchanges.length).toBe(1);
  await expect(dialog(page)).toHaveAttribute('data-phase', 'READY');
  await info.attach('composition-scope', { body: JSON.stringify({ composition: 'synthetic DOM CompositionEvent/InputEvent',
    replacement: 'Playwright insertText, not OS clipboard', osIME: 'NOT_RUN', manual02: 'NOT_RUN' }), contentType: 'application/json' });
  expect(consoleErrors).toEqual([]);
});
