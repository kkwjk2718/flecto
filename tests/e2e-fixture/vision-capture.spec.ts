// T34 (partial, fixture-only): real-Chrome pixel check of the VIS01 capture seam.
// Synthetic loopback page only. No extension, planner, provider, or upload is involved:
// chrome.tabs.captureVisibleTab is a CONTROLLED MOCK backed by a real CDP screenshot of
// the same tab, while decode/crop/mask run the production browserVisionCanvas path
// (createImageBitmap + OffscreenCanvas). Passing this does not verify the extension's
// captureVisibleTab permission path or any remote model.
import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const VARIANT_CSS: Record<string, string> = {
  plain: '',
  'ancestor-text': '#anc{color:#ff0000}#lab{position:absolute;left:0;top:0}',
  'ancestor-bg': '#anc{background-image:linear-gradient(#ff0000,#ff0000)}',
  'ancestor-pseudo': '#anc::before{content:"조상비밀";position:absolute;left:200px;top:4px;color:#ff0000}',
  'hidden-overlay': '',
};
// Sentinels: red = private (must be masked black), green = unknown non-region (must stay white),
// magenta = FLECTO host (must be transparent during capture), blue = approved public text.
function html(variant: string): string {
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>VIS E2E</title><style>'
    + 'body{margin:0;font:20px/1.4 sans-serif;color:#111;background:#fff}'
    + '#f{position:relative;width:700px;height:260px}'
    + '#anc{position:absolute;left:20px;top:60px;width:400px;height:90px}'
    + '#lab{position:absolute;left:0;top:0;width:360px;height:80px;color:#0000ff}'
    + '#name{position:absolute;left:0;top:36px;width:300px;height:36px;border:0;padding:0;background:#ff0000;color:#ff0000}'
    + '#notice{position:absolute;left:20px;top:170px;width:400px;height:30px;margin:0;color:#0000ff}'
    + '#pv{position:absolute;left:20px;top:144px;width:120px;height:20px;background:#ff0000;color:#ff0000;font-size:12px}'
    + '#decoy{position:absolute;left:300px;top:144px;width:100px;height:20px;background:#00ff00}'
    + '#float{position:absolute;left:100px;top:172px;width:120px;height:24px;background:#ff0000}'
    + '#go{position:absolute;left:20px;top:220px}'
    + '#flecto-host{position:fixed;left:0;top:0;width:500px;height:100px;background:#ff00ff}'
    + '.spacer{height:2400px}' + (VARIANT_CSS[variant] ?? '')
    + '</style></head><body>안내 문구<form id="f"><div id="anc">' + (variant === 'ancestor-text' ? '조상비밀텍스트' : '')
    + '<label id="lab">성명<input id="name" name="name" autocomplete="off"></label></div>'
    + '<p id="notice">신청 기한은 오늘입니다.</p><div id="pv" data-private>비밀</div><div id="decoy"></div>'
    + (variant === 'hidden-overlay' ? '<div id="float" aria-hidden="true" inert>팝업</div>' : '')
    + '<button id="go" type="button">신청</button></form><div class="spacer"></div><div id="flecto-host"></div></body></html>';
}

let server: Server;
let origin = '';
let bundle = '';
test.use({ channel: 'chromium', viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });

test.beforeAll(async () => {
  const out = await build({
    stdin: {
      contents: "export { extractPage } from '@flecto/core'; export { buildVisionCapturePlan, withVisionIsolation } from './apps/extension/src/content/vision'; export { captureVisionImage } from './apps/extension/src/background/vision';",
      resolveDir: resolve('.'), loader: 'ts', sourcefile: 'vision-e2e-entry.ts',
    },
    bundle: true, write: false, format: 'iife', globalName: '__flectoVision', platform: 'browser', target: 'chrome120', logLevel: 'silent',
    alias: { '@flecto/contracts': resolve('packages/contracts/src/index.ts'), '@flecto/core': resolve('packages/core/src/index.ts') },
  });
  bundle = out.outputFiles[0].text;
  server = createServer((req, res) => {
    const variant = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get('v') ?? 'plain';
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(html(variant));
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  origin = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});
test.afterAll(async () => { await new Promise((done) => server?.close(done)); });

type Mode = 'ok' | 'inactive' | 'navigated' | 'document' | 'scroll' | 'plan-only';
type Outcome = {
  blocked?: string; planCode?: string; isolation?: string; captureError?: string;
  restored?: { opacity: string; overlay: number; focus: string | null; value: string };
  count?: Record<'red' | 'green' | 'magenta' | 'blue' | 'black', number>; maskCenter?: number[];
};

async function run(page: import('@playwright/test').Page, variant: string, mode: Mode, overlay = false): Promise<Outcome> {
  await page.goto(origin + '/?v=' + variant);
  await page.exposeFunction('__flectoShot', async () => 'data:image/png;base64,' + (await page.screenshot({ caret: 'initial', animations: 'allow', scale: 'device' })).toString('base64'));
  await page.addScriptTag({ content: bundle });
  return page.evaluate(async ({ mode, overlay }) => {
    const V = (window as unknown as { __flectoVision: any }).__flectoVision;
    const field = document.getElementById('name') as HTMLInputElement;
    field.value = '홍길동비밀'; field.focus();
    const { snapshot, registry, blocked } = V.extractPage(document, { documentInstanceId: 'd_vision_e2e' });
    if (blocked) return { blocked };
    const nameRef = snapshot.controls.find((c: { kind: string }) => c.kind === 'text')?.ref;
    const noticeRef = snapshot.notices.find((n: { text: string }) => n.text.startsWith('신청 기한'))?.ref;
    const plan = () => V.buildVisionCapturePlan({ doc: document, registry, snapshot, reason: 'VISUAL_RELATION_AMBIGUOUS', refs: [nameRef, noticeRef], allowedOrigins: [location.origin] });
    const first = plan();
    if (!first.ok) return { planCode: first.code };
    if (mode === 'plan-only') return {};
    const host = document.getElementById('flecto-host') as HTMLElement;
    const tab = { id: 7, windowId: 3, active: true, url: location.href, status: 'complete' };
    let documentId = 'doc-1';
    const chrome = {
      tabs: {
        get: async () => ({ ...tab }),
        captureVisibleTab: async () => {
          const shot = await (window as unknown as { __flectoShot: () => Promise<string> }).__flectoShot();
          if (mode === 'inactive') tab.active = false;
          if (mode === 'navigated') tab.url = 'http://127.0.0.1:1/elsewhere';
          if (mode === 'document') documentId = 'doc-2';
          if (mode === 'scroll') window.scrollTo(0, 40);
          return shot;
        },
      },
      webNavigation: { getFrame: async () => ({ documentId, url: location.href }) },
    };
    const t0 = performance.now();
    const iso = await V.withVisionIsolation(document, first.plan, () => V.captureVisionImage({
      expected: { tabId: 7, windowId: 3, frameId: 0, documentId: 'doc-1', origin: location.origin },
      plan: first.plan, allowedOrigins: [location.origin],
      guard: async () => { const r = plan(); return r.ok ? r.plan : null; },
      budget: { startedAt: t0, deadlineAt: t0 + 8000 }, signal: new AbortController().signal, chrome,
    }), { domMaskOverlay: overlay, timeoutMs: 8500 });
    const restored = { opacity: host.style.getPropertyValue('opacity'), overlay: document.querySelectorAll('[data-flecto-private="vision-mask"]').length, focus: document.activeElement?.id ?? null, value: field.value };
    window.scrollTo(0, 0);
    if (!iso.ok) return { isolation: iso.code, restored };
    if (!iso.value.ok) return { captureError: iso.value.error, restored };
    // Census of the RETURNED (masked) image only; the raw capture never leaves captureVisionImage.
    const bmp = await createImageBitmap(await (await fetch(iso.value.image.dataUrl)).blob());
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    const px = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    const count = { red: 0, green: 0, magenta: 0, blue: 0, black: 0 };
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i + 1], b = px[i + 2];
      if (r > 180 && g < 90 && b < 90) count.red++;
      else if (g > 180 && r < 90 && b < 90) count.green++;
      else if (r > 180 && b > 180 && g < 90) count.magenta++;
      else if (b > 150 && r < 110 && g < 110) count.blue++;
      else if (r < 20 && g < 20 && b < 20) count.black++;
    }
    const box = field.getBoundingClientRect();
    const cx = Math.round(box.left + box.width / 2 - first.plan.crop.x), cy = Math.round(box.top + box.height / 2 - first.plan.crop.y);
    const i = (cy * bmp.width + cx) * 4;
    return { count, restored, maskCenter: [px[i], px[i + 1], px[i + 2]] };
  }, { mode, overlay });
}

const RESTORED = { opacity: '', overlay: 0, focus: 'name', value: '홍길동비밀' };

test('T34 fixture: masked crop hides private red, unknown green and the host; keeps public text', async ({ page }) => {
  for (const overlay of [false, true]) {
    const out = await run(page, 'plain', 'ok', overlay);
    expect(out.blocked ?? out.planCode ?? out.isolation ?? out.captureError).toBeUndefined();
    expect(out.count!.red, 'private sentinel pixels').toBe(0);
    expect(out.count!.green, 'unknown non-region pixels').toBe(0);
    expect(out.count!.magenta, 'FLECTO host pixels').toBe(0);
    expect(out.count!.blue, 'approved public text').toBeGreaterThan(20);
    expect(out.count!.black, 'private masks').toBeGreaterThan(1000);
    expect(out.maskCenter).toEqual([0, 0, 0]);
    expect(out.restored).toEqual(RESTORED);
  }
});

test('T34 fixture: active-tab, navigation, document and scroll guards return no image and restore the page', async ({ page }) => {
  for (const [mode, error] of [['inactive', 'TARGET_MISMATCH'], ['navigated', 'TARGET_MISMATCH'], ['document', 'TARGET_MISMATCH'], ['scroll', 'GUARD_CHANGED']] as const) {
    const out = await run(page, 'plain', mode);
    expect(out.count, mode).toBeUndefined();
    expect(out.captureError, mode).toBe(error);
    expect(out.restored, mode).toEqual(RESTORED);
  }
});

test('T34 fixture: unknown ancestor text/background/pseudo and aria-hidden overlays fail closed in real layout', async ({ page }) => {
  expect(await run(page, 'plain', 'plan-only')).toEqual({});
  expect(await run(page, 'ancestor-text', 'plan-only')).toEqual({ planCode: 'UNSAFE_OVERLAP' });
  expect(await run(page, 'ancestor-bg', 'plan-only')).toEqual({ planCode: 'UNKNOWN_IMAGE' });
  expect(await run(page, 'ancestor-pseudo', 'plan-only')).toEqual({ planCode: 'UNSAFE_OVERLAP' });
  expect(await run(page, 'hidden-overlay', 'plan-only')).toEqual({ planCode: 'UNSAFE_OVERLAP' });
});

