// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { EXTENSION_ORIGIN, PlannerResponseSchema } from '@flecto/contracts';
import { extractPage, verifyPlan } from '@flecto/core';
import { createPlannerServer } from '../../apps/planner/src/server';
import { FixtureProvider } from '../../apps/planner/src/provider/fixture';

it('actual DOM extraction → Fastify selected-form plan succeeds without QA answers or private values', async () => {
  // Independent synthetic markup: the private order and hidden token are never
  // application success criteria, nor provider inputs.
  document.body.innerHTML = `<form action="/logout" method="post"><button>로그아웃</button></form>
    <nav><a href="/history?draft=private">내역</a></nav>
    <form action="/apply" method="post"><input type="hidden" value="PRIVATE_TOKEN_98217">
    <label for="order">주문번호</label><input id="order" required value="PRIVATE_ORDER_89216">
    <label for="date">구매일</label><input id="date" type="date" required>
    <label for="category">상품분류</label><select id="category" required><option value="device-private">가전</option></select>
    <section class="notice"><h2>신청 안내</h2><p>공개 신청 조건입니다.</p></section>
    <label><input type="checkbox" required>신청 조건에 동의합니다</label><button>신청 내용 확인</button></form>`;
  const initial = extractPage(document);
  const goalRef = initial.snapshot.controls.find(c => c.label === '신청 내용 확인')!.ref;
  const current = extractPage(document, { goal: 'complete_form', goalRef });
  expect(current.blocked).toBeNull();
  const fixture = new FixtureProvider();
  const inputs: string[] = [];
  const token = 'planner-selected-form-qa-token-123';
  const headers = { host: '127.0.0.1:4317', origin: EXTENSION_ORIGIN, authorization: `Bearer ${token}` };
  const server = createPlannerServer({ dbPath: ':memory:', token, provider: {
    mode: fixture.mode, model: fixture.model, plan: (snapshot, budget, signal) => {
      inputs.push(JSON.stringify(snapshot)); return fixture.plan(snapshot, budget, signal);
    },
  } });
  try {
    const response = await server.inject({ method: 'POST', url: '/v1/plans',
      headers,
      payload: { snapshot: current.snapshot, remainingBudgetMs: 1000, sessionEpoch: 0 },
    });
    expect(response.statusCode, response.body).toBe(200);
    const result = PlannerResponseSchema.parse(response.json());
    expect(result.mode).toBe('FIXTURE'); expect(result.plan.sourceActionRef).toBe(goalRef);
    expect(verifyPlan(result.plan, current.snapshot, current.registry)).toEqual(result.plan);
    expect(inputs).toHaveLength(1);
    for (const secret of ['PRIVATE_TOKEN_98217', 'PRIVATE_ORDER_89216', 'device-private']) expect(inputs[0]).not.toContain(secret);
    expect((await server.inject({ method: 'POST', url: `/v1/blueprints/${result.blueprintId}/verify`, headers,
      payload: { requestId: result.requestId, snapshotId: result.snapshotId },
    })).statusCode).toBe(200);
    document.body.append(document.forms[0]);
    document.querySelector('nav a')!.textContent = '이전 신청';
    document.querySelector('#order')!.id = 'random-order-id';
    document.querySelector('label[for="order"]')!.setAttribute('for', 'random-order-id');
    const fresh = extractPage(document, { documentInstanceId: 'fresh_document' });
    const freshGoal = fresh.snapshot.controls.find(c => c.label === '신청 내용 확인')!.ref;
    const moved = extractPage(document, { goal: 'complete_form', goalRef: freshGoal });
    const warm = await server.inject({ method: 'POST', url: '/v1/plans', headers,
      payload: { snapshot: moved.snapshot, remainingBudgetMs: 1000, sessionEpoch: 1 },
    });
    expect(warm.statusCode, warm.body).toBe(200); expect(warm.json().mode).toBe('CACHE');
    expect(warm.json().plan.sourceActionRef).toBe(freshGoal); expect(freshGoal).not.toBe(goalRef);
    expect(verifyPlan(warm.json().plan, moved.snapshot, moved.registry)).toEqual(warm.json().plan);
    expect(inputs).toHaveLength(1);
  } finally { await server.close(); document.body.innerHTML = ''; }
});
