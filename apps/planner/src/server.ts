import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import {
  CACHE_VERSION, EXTENSION_ORIGIN, FlectoError, PlannerRequestSchema,
  PREPARE_DEADLINE_MS, PROMPT_VERSION, RunMetricSchema,
  type ErrorCode, type PlanProvider, type PlannerResponse, type PublicPageSnapshot,
} from '@flecto/contracts';
import { structuralFingerprint, verifyPlan } from '@flecto/core';
import { BlueprintStore } from './cache/store';

export type PlannerOptions = {
  dbPath: string; token: string; provider: PlanProvider;
  extensionOrigin?: string; allowedSourceOrigins?: string[];
};
type Active = { key: string; controller: AbortController; promise: Promise<PlannerResponse> };
const receiptSchema = z.strictObject({ requestId: z.string().max(100), snapshotId: z.string().max(100) });
const safeEqual = (a: string, b: string) => { const aa = Buffer.from(a), bb = Buffer.from(b); return aa.length === bb.length && timingSafeEqual(aa, bb); };
function errorCode(error: unknown): ErrorCode {
  return error instanceof FlectoError ? error.code : error instanceof z.ZodError ? 'SCHEMA_INVALID' : 'PROVIDER_ERROR';
}

export function createPlannerServer(options: PlannerOptions): FastifyInstance {
  if (options.token.length < 24) throw new Error('Planner pairing token must have at least 24 characters');
  if (options.dbPath !== ':memory:') mkdirSync(dirname(options.dbPath), { recursive: true });
  const store = new BlueprintStore(options.dbPath);
  const server = Fastify({ logger: false, bodyLimit: 256 * 1024, requestTimeout: 12_000 });
  const extensionOrigin = options.extensionOrigin ?? EXTENSION_ORIGIN;
  const requests = new Map<string, Active>();
  const receipts = new Map<string, { snapshotId: string; blueprintId: string }>();
  let running: string | null = null;
  const authenticated = (request: FastifyRequest) => {
    const authorization = request.headers.authorization;
    return typeof authorization === 'string' && authorization.startsWith('Bearer ') && safeEqual(authorization.slice(7), options.token);
  };
  server.addHook('onRequest', async (request, reply) => {
    if (!/^127\.0\.0\.1(?::\d{1,5})?$/.test(request.headers.host ?? '')) {
      return reply.code(403).send({ error: 'AUTH_REQUIRED' });
    }
    const origin = request.headers.origin;
    if (origin !== undefined && origin !== extensionOrigin) return reply.code(403).send({ error: 'AUTH_REQUIRED' });
    if (origin === extensionOrigin) {
      reply.header('Access-Control-Allow-Origin', extensionOrigin).header('Vary', 'Origin');
    }
    if (request.method === 'OPTIONS') {
      if (origin !== extensionOrigin) return reply.code(403).send({ error: 'AUTH_REQUIRED' });
      return reply.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
        .header('Access-Control-Allow-Headers', 'Authorization,Content-Type').code(204).send();
    }
    if (request.url !== '/health' && (origin !== extensionOrigin || !authenticated(request))) {
      return reply.code(401).send({ error: 'AUTH_REQUIRED' });
    }
  });
  server.options('/*', async (_request, reply) => reply.code(204).send());
  server.get('/health', async () => ({ ok: true, version: '0.1.0', schemaVersion: 1, mode: options.provider.mode, model: options.provider.model, busy: running !== null }));
  server.post('/v1/connect', async () => ({ ok: true, version: '0.1.0', mode: options.provider.mode, model: options.provider.model }));

  async function prepare(snapshot: PublicPageSnapshot, budget: number, controller: AbortController): Promise<PlannerResponse> {
    const start = performance.now();
    const fingerprint = await structuralFingerprint(snapshot);
    const modelLock = `${options.provider.mode}:${options.provider.model}`;
    let blueprint = store.find(fingerprint, modelLock);
    if (blueprint) {
      const rebound = store.rebind(blueprint, snapshot);
      if (rebound) {
        try {
          const plan = verifyPlan(rebound, snapshot);
          receipts.set(snapshot.requestId, { snapshotId: snapshot.snapshotId, blueprintId: blueprint.id });
          return { requestId: snapshot.requestId, snapshotId: snapshot.snapshotId, plan, mode: 'CACHE', model: options.provider.model,
            promptVersion: PROMPT_VERSION, cacheVersion: CACHE_VERSION, blueprintId: blueprint.id, durationMs: performance.now() - start };
        } catch { store.quarantine(blueprint.id); }
      }
    }
    if (running !== null && running !== snapshot.requestId) throw new FlectoError('BUSY');
    running = snapshot.requestId;
    const remaining = Math.max(1, budget - (performance.now() - start));
    let timeout = false;
    const timer = setTimeout(() => { timeout = true; controller.abort(); }, remaining);
    let abortListener: () => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      abortListener = () => reject(new FlectoError(timeout ? 'DEADLINE_EXCEEDED' : 'CANCELLED'));
      controller.signal.addEventListener('abort', abortListener, { once: true });
    });
    const providerTask = options.provider.plan(snapshot, remaining, controller.signal)
      .finally(() => { if (running === snapshot.requestId) running = null; });
    try {
      const raw = await Promise.race([providerTask, aborted]);
      if (controller.signal.aborted || performance.now() - start >= budget) throw new FlectoError(timeout ? 'DEADLINE_EXCEEDED' : 'CANCELLED');
      const plan = verifyPlan(raw, snapshot);
      blueprint = store.candidate(snapshot, plan, fingerprint, modelLock);
      receipts.set(snapshot.requestId, { snapshotId: snapshot.snapshotId, blueprintId: blueprint.id });
      if (receipts.size > 200) receipts.delete(receipts.keys().next().value!);
      return { requestId: snapshot.requestId, snapshotId: snapshot.snapshotId, plan, mode: options.provider.mode,
        model: options.provider.model, promptVersion: PROMPT_VERSION, cacheVersion: CACHE_VERSION,
        blueprintId: blueprint.id, durationMs: performance.now() - start };
    } finally {
      clearTimeout(timer); controller.signal.removeEventListener('abort', abortListener);
    }
  }

  server.post('/v1/plans', async (request, reply) => {
    const parsed = PlannerRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'SCHEMA_INVALID' });
    const { snapshot, remainingBudgetMs, sessionEpoch } = parsed.data;
    if (options.allowedSourceOrigins && !options.allowedSourceOrigins.includes(snapshot.origin)) {
      return reply.code(403).send({ error: 'UNSUPPORTED_CONTROL', requestId: snapshot.requestId });
    }
    const key = JSON.stringify({ snapshot, sessionEpoch });
    const existing = requests.get(snapshot.requestId);
    if (existing && existing.key !== key) return reply.code(409).send({ error: 'STALE_DOCUMENT', requestId: snapshot.requestId });
    let task = existing;
    if (!task) {
      const controller = new AbortController();
      const promise = prepare(snapshot, Math.min(remainingBudgetMs, PREPARE_DEADLINE_MS), controller);
      task = { key, controller, promise }; requests.set(snapshot.requestId, task);
    }
    try { return await task.promise; }
    catch (error) {
      const code = errorCode(error);
      return reply.code(code === 'BUSY' ? 409 : code === 'DEADLINE_EXCEEDED' ? 504 : code === 'CANCELLED' ? 499 : 422)
        .send({ error: code, requestId: snapshot.requestId });
    } finally { if (requests.get(snapshot.requestId) === task) requests.delete(snapshot.requestId); }
  });
  server.delete<{ Params: { id: string } }>('/v1/plans/:id', async (request) => {
    requests.get(request.params.id)?.controller.abort();
    return { ok: true };
  });
  server.post<{ Params: { id: string } }>('/v1/blueprints/:id/verify', async (request, reply) => {
    const parsed = receiptSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'SCHEMA_INVALID' });
    const receipt = receipts.get(parsed.data.requestId);
    if (!receipt || receipt.snapshotId !== parsed.data.snapshotId || receipt.blueprintId !== request.params.id) {
      return reply.code(409).send({ error: 'STALE_DOCUMENT' });
    }
    store.verify(receipt.blueprintId); receipts.delete(parsed.data.requestId);
    return { ok: true };
  });
  server.post('/v1/metrics', async (request, reply) => {
    const parsed = RunMetricSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'SCHEMA_INVALID' });
    store.metric(parsed.data); return { ok: true };
  });
  server.setErrorHandler((_error, _request, reply) => { reply.code(400).send({ error: 'SCHEMA_INVALID' }); });
  server.addHook('onClose', async () => {
    for (const task of requests.values()) task.controller.abort();
    await Promise.allSettled([...requests.values()].map((task) => task.promise));
    store.close();
  });
  return server;
}
