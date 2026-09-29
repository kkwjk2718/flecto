// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type PlannerRequest } from '@flecto/contracts';
import { FlectoController } from '../../apps/extension/src/content/controller';
import { buildFixturePlan } from '../../apps/planner/src/provider/fixture';

let controller: FlectoController | null = null;
afterEach(async () => { await controller?.close(); controller = null; document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function ready() {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  document.body.innerHTML = '<main><form action="/continue" method="post"><label for="field">이름</label><input id="field" required value="PRIVATE_VALUE"><button>계속</button></form></main>';
  vi.stubGlobal('chrome', { runtime: { sendMessage: async (message: { type: string; payload?: PlannerRequest }) => {
    if (message.type === 'FLECTO_SETTINGS_GET') return { ok: true, settings: DEFAULT_SETTINGS };
    if (message.type === 'FLECTO_SESSION_GET') return { ok: true, session: { active: true, pendingSubmit: false } };
    if (message.type === 'FLECTO_PREPARE') {
      const snapshot = message.payload!.snapshot;
      return { ok: true, result: { requestId:snapshot.requestId,snapshotId:snapshot.snapshotId,plan:buildFixturePlan(snapshot),
        mode:'FIXTURE',model:'synthetic',promptVersion:'test',cacheVersion:'test',blueprintId:null,durationMs:1 } };
    }
    return { ok: true };
  } } });
  controller = new FlectoController(document); await controller.activate();
  const shadow = () => document.getElementById('flecto-host')!.shadowRoot!;
  await vi.waitFor(() => expect(shadow().querySelector('button[data-flecto-ref]')).not.toBeNull());
  (shadow().querySelector('button[data-flecto-ref]') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(shadow().textContent).toContain('필요한 정보를 입력해 주세요'));
  return { shadow, field:document.querySelector('#field') as HTMLInputElement };
}

it('timer turns an externally changed semantic binding into STALE_DOCUMENT rather than an uncaught error', async () => {
  const h = await ready();
  document.querySelector('label')!.textContent = '새 이름';
  await vi.waitFor(() => expect(h.shadow().textContent).toContain('바뀌었어요'));
  await new Promise(resolve => setTimeout(resolve,230));
  expect(h.field.value).toBe('PRIVATE_VALUE');
});
it('source input event catches AUTH_REQUIRED and halts polling without touching the password', async () => {
  const h = await ready();
  const password = document.createElement('input'); password.type = 'password'; password.value = 'NEVER_READ';
  const read = vi.spyOn(password,'value','get'); document.querySelector('form')!.append(password);
  h.field.dispatchEvent(new Event('input',{bubbles:true}));
  await vi.waitFor(() => expect(h.shadow().textContent).toContain('로그인'));
  await new Promise(resolve => setTimeout(resolve,230)); expect(read).not.toHaveBeenCalled();
});
it('observer catches an unsupported authentication screen before further source reads', async () => {
  const h = await ready();
  h.field.type = 'password';
  await vi.waitFor(() => expect(h.shadow().textContent).toContain('로그인'));
  expect(h.field.value).toBe('PRIVATE_VALUE');
});
it('batch comparison still detects changed values without overwriting the original input', async () => {
  const h = await ready(); h.field.value = 'EXTERNALLY_CHANGED';
  h.field.dispatchEvent(new Event('change',{bubbles:true}));
  await vi.waitFor(() => expect(h.shadow().textContent).toContain('바뀌었어요'));
  expect(h.field.value).toBe('EXTERNALLY_CHANGED');
});
