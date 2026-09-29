// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { createCultureServer } from '../../apps/demo-culture/src/server';
import { App } from '../../apps/demo-culture/client/src/App';

// Drives the real SPA against the real Fastify app. fetch is routed through Fastify.inject with a cookie jar.
const QA = 'qa-token-culture-0123456789';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let dir: string;
let server: FastifyInstance;
let root: Root;
let container: HTMLElement;
let jar = '';

async function injectFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = typeof input === 'string' ? input : input.toString();
  const res = await server.inject({
    method: (init.method ?? 'GET') as 'GET' | 'POST',
    url,
    headers: { ...(init.headers as Record<string, string>), ...(jar ? { cookie: jar } : {}) },
    payload: typeof init.body === 'string' ? init.body : undefined,
  });
  const set = res.cookies.find((c) => c.name === 'flecto_culture');
  if (set) jar = set.value ? 'flecto_culture=' + set.value : '';
  return new Response(res.statusCode === 204 ? null : res.body, { status: res.statusCode, headers: { 'content-type': String(res.headers['content-type'] ?? '') } });
}

async function settle(rounds = 6) {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function q<T extends Element>(selector: string): T {
  const el = container.querySelector<T>(selector);
  if (!el) throw new Error('missing ' + selector + ' in ' + container.querySelector('main')?.textContent);
  return el;
}

function byText<T extends HTMLElement>(selector: string, text: string): T {
  const el = [...container.querySelectorAll<T>(selector)].find((node) => node.textContent?.trim() === text);
  if (!el) throw new Error('missing ' + selector + ' "' + text + '"');
  return el;
}

async function typeInto(el: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function choose(el: HTMLSelectElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
  await settle();
}

async function goBack() {
  await act(async () => {
    const popped = new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true }));
    window.history.back();
    await popped;
  });
  await settle();
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'culture-client-'));
  server = createCultureServer({ dbPath: join(dir, 'c.sqlite'), sessionSecret: 'culture-session-secret-0123456789', namespace: 'QA', qaToken: QA, assetsDir: join(dir, 'none') });
  jar = '';
  globalThis.fetch = injectFetch as typeof fetch;
  window.scrollTo = (() => undefined) as typeof window.scrollTo;
  window.history.replaceState(null, '', '/');
  container = document.createElement('div');
  document.body.innerHTML = '';
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(App)));
  await settle();
});

afterEach(async () => {
  await act(async () => root.unmount());
  await server.close();
  rmSync(dir, { recursive: true, force: true });
});

async function loginThroughForm() {
  await click(byText<HTMLAnchorElement>('.account a', '로그인'));
  await typeInto(q<HTMLInputElement>('#login-id'), 'demo');
  await typeInto(q<HTMLInputElement>('#login-password'), 'flecto2026!');
  await click(byText<HTMLButtonElement>('button[type=submit]', '로그인'));
  expect(container.textContent).toContain('한빛 테스트회원 님');
}

describe('culture SPA (T02 T05 T10)', () => {
  it('completes an application, keeps controlled values across back navigation, and shows the stored receipt', async () => {
    expect(q('nav[aria-label="주 메뉴"]').textContent).toContain('강좌 안내');
    await loginThroughForm();
    expect(window.location.pathname).toBe('/');

    await click(byText<HTMLAnchorElement>('nav a', '수강 신청'));
    expect(window.location.pathname).toBe('/apply/course');
    await click(q<HTMLInputElement>('input[name="courseId"][value="digital"]'));
    await choose(q<HTMLSelectElement>('#timeId'), 'digital-fri-1400');
    await click(byText<HTMLButtonElement>('button', '다음'));
    expect(window.location.pathname).toBe('/apply/applicant');

    await typeInto(q<HTMLInputElement>('#applicantName'), '김한빛');
    await typeInto(q<HTMLInputElement>('#phone'), '010-2222-3333');
    await goBack();
    expect(window.location.pathname).toBe('/apply/course');
    expect(q<HTMLInputElement>('input[name="courseId"][value="digital"]').checked).toBe(true);
    expect(q<HTMLSelectElement>('#timeId').value).toBe('digital-fri-1400');

    await act(async () => {
      window.history.forward();
      await new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true }));
    });
    await settle();
    expect(window.location.pathname).toBe('/apply/applicant');
    expect(q<HTMLInputElement>('#applicantName').value).toBe('김한빛');
    expect(q<HTMLInputElement>('#phone').value).toBe('010-2222-3333');

    await click(byText<HTMLButtonElement>('button', '다음'));
    expect(window.location.pathname).toBe('/apply/notice');
    await click(byText<HTMLButtonElement>('button', '다음'));
    expect(container.querySelector('[role=alert], .field-error')?.textContent).toContain('동의');
    await click(q<HTMLInputElement>('#consent'));
    await click(byText<HTMLButtonElement>('button', '다음'));
    expect(window.location.pathname).toBe('/apply/review');
    expect(q('.summary').textContent).toContain('금 오후 2:00 ~ 3:30');

    await click(byText<HTMLButtonElement>('button', '신청하기'));
    const output = q<HTMLOutputElement>('output[aria-label="접수 번호"]');
    expect(output.closest('[role=status]')).not.toBeNull();
    const records = (await server.inject({ url: '/__qa/records', headers: { 'x-flecto-qa-token': QA } })).json();
    expect(records.count).toBe(1);
    expect(output.textContent).toBe(records.reservations[0].receiptNo);
    expect(records.reservations[0]).toMatchObject({ courseId: 'digital', timeId: 'digital-fri-1400', applicantName: '김한빛', phone: '010-2222-3333' });
    expect(q('[role=status]').textContent).toContain('스마트폰·디지털 기초');

    await goBack();
    expect(container.textContent).not.toContain('신청하는 중');
    const after = (await server.inject({ url: '/__qa/records', headers: { 'x-flecto-qa-token': QA } })).json();
    expect(after.count).toBe(1);
  });

  it('shows the source error when capacity closes after the page loaded', async () => {
    await loginThroughForm();
    await click(byText<HTMLAnchorElement>('nav a', '수강 신청'));
    await click(q<HTMLInputElement>('input[name="courseId"][value="yoga"]'));
    await choose(q<HTMLSelectElement>('#timeId'), 'yoga-tue-thu-1000');
    await click(byText<HTMLButtonElement>('button', '다음'));
    await typeInto(q<HTMLInputElement>('#applicantName'), '이바다');
    await typeInto(q<HTMLInputElement>('#phone'), '01044445555');
    await click(byText<HTMLButtonElement>('button', '다음'));
    await click(q<HTMLInputElement>('#consent'));
    await click(byText<HTMLButtonElement>('button', '다음'));
    await server.inject({ method: 'POST', url: '/__qa/capacity', headers: { 'x-flecto-qa-token': QA }, payload: { courseId: 'yoga', timeId: 'yoga-tue-thu-1000', capacity: 0 } });
    await click(byText<HTMLButtonElement>('button', '신청하기'));
    expect(q('[role=alert]').textContent).toContain('정원이 마감');
    expect(container.querySelector('output[aria-label="접수 번호"]')).toBeNull();
    expect(q('.summary').textContent).toContain('마감');
    expect(window.location.pathname).toBe('/apply/review');
  });
});
