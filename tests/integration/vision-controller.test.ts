// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { deflateSync } from 'node:zlib';
import { EXTENSION_ID, FlectoError, type PublicPageSnapshot } from '@flecto/contracts';
import { FlectoController } from '../../apps/extension/src/content/controller';
import { BackgroundBroker } from '../../apps/extension/src/background/broker';
import { browserVisionCanvas } from '../../apps/extension/src/background/vision';
import { createPlannerServer } from '../../apps/planner/src/server';
import { buildFixturePlan } from '../../apps/planner/src/provider/fixture';

const origin = location.origin, token = 'controller-synthetic-pairing-token-001';
const cleanups: Array<() => Promise<unknown>> = [];
const bounds = new Map<Element, [number, number, number, number]>();
let originalRangeRects: PropertyDescriptor | undefined;
beforeEach(() => {
  originalRangeRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value(this: Range) {
    const parent = this.startContainer.parentElement;
    return parent ? [parent.getBoundingClientRect()] : [];
  } });
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const getStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => pseudo ? { content: 'none' } as CSSStyleDeclaration : getStyle(element));
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function(this: Element) {
    const [x,y,width,height] = bounds.get(this) ?? [0,0,0,0];
    return { x,y,width,height,left:x,top:y,right:x+width,bottom:y+height,toJSON: () => ({}) } as DOMRect;
  });
});
afterEach(async () => {
  if (originalRangeRects) Object.defineProperty(Range.prototype, 'getClientRects', originalRangeRects);
  else delete (Range.prototype as { getClientRects?: unknown }).getClientRects;
  for (const cleanup of cleanups.splice(0)) await cleanup(); document.body.innerHTML = ''; bounds.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function png(width: number, height: number) {
  const chunk = (name: string, value: Buffer) => {
    const data = Buffer.concat([Buffer.from(name), value]), size = Buffer.alloc(4), checksum = Buffer.alloc(4); size.writeUInt32BE(value.length);
    let crc = 0xffffffff; for (const b of data) { crc ^= b; for (let i=0;i<8;i++) crc = crc & 1 ? 0xedb88320 ^ crc >>> 1 : crc >>> 1; }
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0); return Buffer.concat([size,data,checksum]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height,4); ihdr[8]=8; ihdr[9]=6;
  return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(Buffer.alloc(height*(1+width*4)))),chunk('IEND',Buffer.alloc(0))]).toString('base64');
}
async function harness() {
  // The notice has multiple real input candidates in the same form, with no
  // explicit description relation. No marker or expected-answer data is used.
  document.body.innerHTML = `<form action="/continue" method="post"><label for="a">첫 항목</label><input id="a" required value="PRIVATE_A_9381">
    <label for="b">둘째 항목</label><input id="b" required value="PRIVATE_B_7451"><p id="notice">공개 안내입니다</p><button>내용 확인</button></form>`;
  for (const [selector, rect] of [
    ['form',[0,0,600,400]], ['label[for="a"]',[10,10,120,24]], ['#a',[10,40,120,30]],
    ['label[for="b"]',[180,10,120,24]], ['#b',[180,40,120,30]], ['#notice',[10,90,290,24]], ['form button',[10,140,120,40]],
  ] as Array<[string,[number,number,number,number]]>) bounds.set(document.querySelector(selector)!, rect);
  const plan = vi.fn(async (s: PublicPageSnapshot) => buildFixturePlan(s));
  const planWithImage = vi.fn(async (s: PublicPageSnapshot, _budget: number, _signal: AbortSignal, _image: unknown) => buildFixturePlan(s));
  const server = createPlannerServer({ dbPath: ':memory:', token, provider: { mode:'FIXTURE', model:'synthetic-controller-image', plan, planWithImage }, allowedSourceOrigins:[origin] });
  const tab = { id:1, windowId:2, active:true, url:origin+'/form' };
  const sender = { id:EXTENSION_ID, tab, documentId:'chrome-document', frameId:0, origin, url:tab.url, documentLifecycle:'active' } as chrome.runtime.MessageSender;
  const frame = { url:tab.url, documentId:'chrome-document', documentLifecycle:'active', errorOccurred:false };
  const area = (local = false) => ({ setAccessLevel: async () => {}, set: async () => {}, get: async () => local ? { flectoConnection:{ plannerUrl:'http://127.0.0.1:4317', token } } : {} });
  let controller!: FlectoController, broker!: BackgroundBroker;
  const messages: unknown[] = [], uploads: string[] = [], captureFocus: Element[] = [];
  const api = { runtime:{ id:EXTENSION_ID, sendMessage: vi.fn(async (message: unknown) => { messages.push(message); return broker.handle(message,sender); }) },
    storage:{ local:area(true), session:area() }, webNavigation:{ getFrame:async () => frame }, scripting:{ executeScript:async () => [] },
    tabs:{ get:async () => tab, sendMessage:vi.fn(async (_tab:number, message:{type:string}) => message.type.startsWith('FLECTO_VISION_') ? controller.visionCallback(message) : {ok:true}),
      captureVisibleTab:vi.fn(async () => {
        expect(document.getElementById('flecto-host')!.style.opacity).toBe('0');
        captureFocus.push(document.activeElement!);
        return png(window.innerWidth,window.innerHeight);
      }),
    },
  };
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    if (init?.body) {
      uploads.push(String(init.body));
      expect(document.getElementById('flecto-host')!.style.opacity).not.toBe('0');
      if (String(url).endsWith('/v1/vision/plans')) expect(document.activeElement).toBe(captureFocus[0]);
    }
    const result = await server.inject({method:(init?.method ?? 'GET') as 'GET'|'POST'|'DELETE',url:new URL(String(url)).pathname,
      headers:{...Object.fromEntries(new Headers(init?.headers)),host:'127.0.0.1:4317'},...(init?.body ? {payload:JSON.parse(String(init.body))}:{})});
    return new Response(result.body,{status:result.statusCode,headers:{'Content-Type':'application/json'}});
  });
  vi.spyOn(browserVisionCanvas,'decodePng').mockResolvedValue({width:window.innerWidth,height:window.innerHeight,close:() => {}});
  vi.spyOn(browserVisionCanvas,'createSurface').mockImplementation((width,height) => ({fill:() => {},copy:() => {},toPngDataUrl:async () => png(width,height)}));
  broker = new BackgroundBroker(api as unknown as typeof chrome,fetcher); await broker.activate(tab as chrome.tabs.Tab);
  vi.stubGlobal('chrome',api);
  controller = new FlectoController(document); await controller.activate();
  cleanups.push(async () => { await controller.close(); await server.close(); });
  const shadow = () => document.getElementById('flecto-host')!.shadowRoot!;
  const click = async (layout:boolean) => {
    await vi.waitFor(() => expect(shadow().querySelectorAll('button[data-flecto-ref]').length).toBeGreaterThan(0));
    const button = [...shadow().querySelectorAll<HTMLButtonElement>('button[data-flecto-ref]')].find(b => b.textContent!.includes('화면 배치 도움') === layout)!;
    expect(button).toBeDefined(); button.click();
  };
  return { controller, api, broker, server, plan, planWithImage, messages, uploads, shadow, click };
}

it('real controller action → isolated capture/guard/restoration → authenticated image provider → current DOM verified READY', async () => {
  const h = await harness(); await h.click(true);
  await vi.waitFor(() => expect(h.planWithImage).toHaveBeenCalledOnce(),{timeout:3000});
  await vi.waitFor(() => expect(h.shadow().textContent).toContain('필요한 정보를 입력해 주세요'));
  expect(h.plan).not.toHaveBeenCalled(); expect(h.api.tabs.captureVisibleTab).toHaveBeenCalledOnce();
  expect((document.querySelector('#a') as HTMLInputElement).value).toBe('PRIVATE_A_9381');
  expect((document.querySelector('#b') as HTMLInputElement).value).toBe('PRIVATE_B_7451');
  for (const text of h.uploads) { expect(text).not.toContain('PRIVATE_A_9381'); expect(text).not.toContain('PRIVATE_B_7451'); }
  expect(JSON.stringify(h.messages)).not.toContain('data:image'); // pixels never leave background for content
  expect(h.messages.some((m: any) => m.type === 'FLECTO_VERIFY')).toBe(false);
});
it('the normal task on the same DOM stays metadata-only and never attempts capture or vision fallback', async () => {
  const h = await harness(); await h.click(false);
  await vi.waitFor(() => expect(h.plan).toHaveBeenCalledOnce());
  expect(h.planWithImage).not.toHaveBeenCalled(); expect(h.api.tabs.captureVisibleTab).not.toHaveBeenCalled();
  expect(h.uploads.every(body => !body.includes('data:image'))).toBe(true);
});
it('original-DOM changes during image inference prevent READY even when the model result is valid for the old snapshot', async () => {
  const h = await harness();
  h.planWithImage.mockImplementation(async s => { document.querySelector('label[for="a"]')!.textContent = '바뀐 항목'; return buildFixturePlan(s); });
  await h.click(true);
  await vi.waitFor(() => expect(h.planWithImage).toHaveBeenCalledOnce(),{timeout:3000});
  await vi.waitFor(() => expect(h.shadow().textContent).toContain('바뀌었어요'));
  expect(h.shadow().textContent).not.toContain('필요한 정보를 입력해 주세요');
});

it.each(['AUTH_REQUIRED', 'PROVIDER_ERROR', 'STALE_DOCUMENT'] as const)('normal %s failure never opens the image path', async code => {
  const h = await harness(); h.plan.mockImplementation(async () => { throw new FlectoError(code); });
  await h.click(false); await vi.waitFor(() => expect(h.plan).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(h.shadow().textContent).not.toContain('쉬운 화면을 준비하고 있어요'));
  expect(h.planWithImage).not.toHaveBeenCalled(); expect(h.api.tabs.captureVisibleTab).not.toHaveBeenCalled();
});

it('a real focus change during capture fails restoration and blocks image upload', async () => {
  const h = await harness();
  h.api.tabs.captureVisibleTab.mockImplementation(async () => {
    (document.querySelector('#a') as HTMLInputElement).focus();
    return png(window.innerWidth, window.innerHeight);
  });
  await h.click(true);
  await vi.waitFor(() => expect(h.api.tabs.captureVisibleTab).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(h.shadow().textContent).toContain('바뀌었어요'));
  expect(h.planWithImage).not.toHaveBeenCalled(); expect(h.uploads).toEqual([]);
});

it('refuses capture when FLECTO is still visibly painted despite isolation starting', async () => {
  const h = await harness();
  h.api.tabs.sendMessage.mockImplementation(async (_tab, message) => {
    if (message.type === 'FLECTO_VISION_GUARD') document.getElementById('flecto-host')!.style.opacity = '1';
    return h.controller.visionCallback(message);
  });
  await h.click(true);
  await vi.waitFor(() => expect(h.api.tabs.sendMessage.mock.calls.some(call => call[1].type === 'FLECTO_VISION_GUARD')).toBe(true));
  await vi.waitFor(() => expect(h.shadow().textContent).toContain('관계를 정확히 확인하지 못했어요'));
  expect(h.api.tabs.captureVisibleTab).not.toHaveBeenCalled(); expect(h.planWithImage).not.toHaveBeenCalled();
});
