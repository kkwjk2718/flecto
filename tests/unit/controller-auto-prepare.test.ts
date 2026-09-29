// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type PlannerRequest } from '@flecto/contracts';
import { FlectoController } from '../../apps/extension/src/content/controller';
import { buildFixturePlan } from '../../apps/planner/src/provider/fixture';

let controller: FlectoController | null = null;
afterEach(async () => { await controller?.close(); controller = null; document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const form = '<form><label for="name">이름</label><input id="name" value="PRIVATE_VALUE" required><label><input type="checkbox" required>동의</label><button>계속</button></form>';
function setup(html: string, pendingSubmit = false) {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  document.body.innerHTML = html;
  const submit = vi.fn((event: Event) => event.preventDefault());
  document.querySelectorAll('form').forEach(item => item.addEventListener('submit', submit));
  const send = vi.fn(async (message: { type: string; payload?: PlannerRequest }) => {
    if (message.type === 'FLECTO_SETTINGS_GET') return { ok: true, settings: DEFAULT_SETTINGS };
    if (message.type === 'FLECTO_SESSION_GET') return { ok: true, session: { active: true, pendingSubmit } };
    if (message.type === 'FLECTO_PREPARE') {
      const snapshot = message.payload!.snapshot;
      return { ok: true, result: { requestId: snapshot.requestId, snapshotId: snapshot.snapshotId, plan: buildFixturePlan(snapshot),
        mode: 'FIXTURE', model: 'synthetic', promptVersion: 'test', cacheVersion: 'test', blueprintId: null, durationMs: 1 } };
    }
    return { ok: true };
  });
  vi.stubGlobal('chrome', { runtime: { sendMessage: send } });
  controller = new FlectoController(document);
  return { send, submit, requests: () => send.mock.calls.filter(([message]) => message.type === 'FLECTO_PREPARE'),
    shadow: () => document.getElementById('flecto-host')!.shadowRoot! };
}

it('one activation prepares the unique main form without touching input, consent or submission', async () => {
  const h = setup(`<nav><a href="/help">도움</a></nav><main>${form}</main>`);
  await controller!.activate(false, true);
  await vi.waitFor(() => expect(h.shadow().textContent).toContain('필요한 정보를 입력해 주세요'));
  expect(h.requests()).toHaveLength(1);
  const request = h.requests()[0][0].payload!;
  expect(request.snapshot.goalRef).toBeTruthy();
  expect(request.remainingBudgetMs).toBeGreaterThan(0);
  expect(request.remainingBudgetMs).toBeGreaterThan(10000);
  expect(request.remainingBudgetMs).toBeLessThanOrEqual(30000);
  expect(JSON.stringify(request)).not.toContain('PRIVATE_VALUE');
  expect((document.querySelector('#name') as HTMLInputElement).value).toBe('PRIVATE_VALUE');
  expect((document.querySelector('[type=checkbox]') as HTMLInputElement).checked).toBe(false);
  expect(h.submit).not.toHaveBeenCalled();
  await controller!.activate(false, true);
  expect(h.requests()).toHaveLength(1);
});

it('toolbar message racing initial content activation prepares exactly once', async () => {
  const h = setup(`<main>${form}</main>`);
  await Promise.all([controller!.activate(), controller!.activate(false, true), controller!.activate(false, true)]);
  expect(h.requests()).toHaveLength(1);
  expect(h.submit).not.toHaveBeenCalled();
});

it('legacy activation retains the goal chooser', async () => {
  const h = setup(`<main>${form}</main>`);
  await controller!.activate();
  await vi.waitFor(() => expect(h.shadow().textContent).toContain('무엇을 하시겠어요?'));
  expect(h.requests()).toHaveLength(0);
});

it.each([
  ['two main submits', `<main>${form.replace('</form>', '<button>다른 작업</button></form>')}</main>`],
  ['two main forms', `<main>${form}<form><label>다른 이름<input></label><button>다른 신청</button></form></main>`],
  ['outside main', form],
  ['disabled submit', `<main>${form.replace('<button>', '<button disabled>')}</main>`],
  ['hidden submit', `<main>${form.replace('<button>', '<button hidden>')}</main>`],
  ['no inputs', '<main><form><button>최종 제출</button></form></main>'],
  ['disabled inputs', '<main><form><label>이름<input disabled></label><button>계속</button></form></main>'],
  ['navigation only', '<main><a href="/apply">신청</a></main>'],
  ['password', `<main>${form.replace('id="name"', 'id="name" type="password"')}</main>`],
])('does not auto prepare %s', async (_name, html) => {
  const h = setup(html);
  await controller!.activate(false, true);
  expect(h.requests()).toHaveLength(0);
  expect(h.submit).not.toHaveBeenCalled();
});

it('restored pending submission cannot trigger automatic planning or submission', async () => {
  const h = setup(`<main>${form}</main>`, true);
  await controller!.activate(false, true);
  await controller!.activate(false, true);
  expect(h.requests()).toHaveLength(0);
  expect(h.submit).not.toHaveBeenCalled();
});
