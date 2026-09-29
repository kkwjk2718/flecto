import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { DEFAULT_PORTS } from '@flecto/contracts';
import { isInside, realpathOrNull } from './common';
import { readRunLock } from './doctor';

export type ResetTarget = { namespace: 'DEMO' | 'QA'; dataDir: string; ports: { benefits: number; culture: number } };
export type ResetRequest = { namespace?: string; dataDir?: string; benefitsPort?: number; culturePort?: number };
export type ResetSummary = { namespace: string; services: Array<{ service: 'benefits' | 'culture'; port: number; before: number; after: number }> };

export class ResetError extends Error {}
const QA_HEADER = 'x-flecto-qa-token';
const validPort = (p: unknown): p is number => typeof p === 'number' && Number.isInteger(p) && p >= 1024 && p <= 65535;

/**
 * DEMO always means <root>/.flecto/demo on 127.0.0.1:4173/4174 with no overrides.
 * QA requires an explicit data dir inside <root>/.flecto/qa or the OS temp dir, and explicit ports
 * different from the DEMO ports.
 */
export async function resolveResetTarget(root: string, request: ResetRequest): Promise<ResetTarget> {
  const namespace = request.namespace ?? 'DEMO';
  if (namespace === 'DEMO') {
    if (request.dataDir !== undefined || request.benefitsPort !== undefined || request.culturePort !== undefined) throw new ResetError('DEMO reset uses the fixed .flecto/demo data dir and ports ' + DEFAULT_PORTS.benefits + '/' + DEFAULT_PORTS.culture + '; overrides are only allowed with --namespace QA');
    return { namespace, dataDir: resolve(root, '.flecto/demo'), ports: { benefits: DEFAULT_PORTS.benefits, culture: DEFAULT_PORTS.culture } };
  }
  if (namespace !== 'QA') throw new ResetError('namespace must be DEMO or QA');
  if (!request.dataDir) throw new ResetError('QA reset requires --data-dir');
  if (!validPort(request.benefitsPort) || !validPort(request.culturePort)) throw new ResetError('QA reset requires --benefits-port and --culture-port (1024-65535)');
  if ([request.benefitsPort, request.culturePort].some((p) => p === DEFAULT_PORTS.benefits || p === DEFAULT_PORTS.culture || p === DEFAULT_PORTS.planner)) throw new ResetError('QA reset may not target the DEMO ports');
  const dir = await realpathOrNull(resolve(request.dataDir));
  if (!dir) throw new ResetError('QA data dir does not exist');
  const allowedParents = (await Promise.all([resolve(root, '.flecto/qa'), tmpdir()].map(realpathOrNull))).filter((p): p is string => !!p);
  const demoDir = await realpathOrNull(resolve(root, '.flecto/demo'));
  if (demoDir && isInside(demoDir, dir)) throw new ResetError('QA reset may not target the DEMO data dir');
  if (!allowedParents.some((parent) => parent !== dir && isInside(parent, dir))) throw new ResetError('QA data dir must be inside .flecto/qa or the OS temp dir');
  return { namespace, dataDir: dir, ports: { benefits: request.benefitsPort, culture: request.culturePort } };
}

async function qaCall(port: number, path: string, token: string, method: 'GET' | 'POST'): Promise<{ status: number; body: Record<string, unknown> | null }> {
  let response: Response;
  try {
    response = await fetch('http://127.0.0.1:' + port + path, {
      method, headers: { [QA_HEADER]: token, ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) },
      body: method === 'POST' ? '{}' : undefined, signal: AbortSignal.timeout(4000), redirect: 'error',
    });
  } catch { throw new ResetError('service on 127.0.0.1:' + port + ' is not reachable'); }
  let body: Record<string, unknown> | null = null;
  try { body = await response.json() as Record<string, unknown>; } catch { body = null; }
  return { status: response.status, body };
}

/**
 * Clears only synthetic source-site records of a running FLECTO system that owns target.dataDir.
 * Refuses when the run lock is absent/stale/foreign or a service reports another namespace.
 * Never touches Chrome profiles, planner cache, sessions or files. Returns counts only.
 */
export async function resetSources(target: ResetTarget): Promise<ResetSummary> {
  const lock = await readRunLock(target.dataDir);
  if (lock.state !== 'alive') throw new ResetError('no running FLECTO ' + target.namespace + ' system owns this data dir (run lock ' + lock.state + ')');
  if (lock.namespace !== target.namespace) throw new ResetError('run lock namespace ' + String(lock.namespace) + ' does not match ' + target.namespace);
  let config: Record<string, unknown>;
  try { config = JSON.parse(await readFile(resolve(target.dataDir, 'private-config.json'), 'utf8')); }
  catch { throw new ResetError('private-config.json missing or unreadable in the data dir'); }
  const services = [
    { service: 'benefits' as const, port: target.ports.benefits, token: config.benefitsToken },
    { service: 'culture' as const, port: target.ports.culture, token: config.cultureToken },
  ];
  // Verify every service first so a mismatch aborts before any reset.
  const before = new Map<string, number>();
  for (const s of services) {
    if (typeof s.token !== 'string' || s.token.length < 16) throw new ResetError(s.service + ' QA token missing from private config');
    const records = await qaCall(s.port, '/__qa/records', s.token, 'GET');
    if (records.status !== 200 || !records.body) throw new ResetError(s.service + ' on port ' + s.port + ' rejected this data dir\'s QA token (HTTP ' + records.status + '); not the owned service');
    if (records.body.namespace !== target.namespace) throw new ResetError(s.service + ' on port ' + s.port + ' reports namespace ' + String(records.body.namespace) + ', expected ' + target.namespace);
    before.set(s.service, typeof records.body.count === 'number' ? records.body.count : -1);
  }
  const summary: ResetSummary = { namespace: target.namespace, services: [] };
  for (const s of services) {
    const reset = await qaCall(s.port, '/__qa/reset', s.token as string, 'POST');
    if (reset.status !== 200) throw new ResetError(s.service + ' reset failed (HTTP ' + reset.status + ')');
    const after = await qaCall(s.port, '/__qa/records', s.token as string, 'GET');
    const count = after.body && typeof after.body.count === 'number' ? after.body.count : -1;
    if (after.status !== 200 || count !== 0) throw new ResetError(s.service + ' still reports ' + count + ' record(s) after reset');
    summary.services.push({ service: s.service, port: s.port, before: before.get(s.service)!, after: count });
  }
  return summary;
}
