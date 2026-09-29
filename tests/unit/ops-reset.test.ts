import { afterEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startSystem, type RunningSystem } from '../../scripts/system';
import { REPO_ROOT } from '../../scripts/ops/common';
import { resolveResetTarget, ResetError } from '../../scripts/ops/reset';

let system: RunningSystem | undefined;
let dirs: string[] = [];
const temp = () => { const d = mkdtempSync(join(tmpdir(), 'flecto-reset-')); dirs.push(d); return d; };
const freePort = () => new Promise<number>((done) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => done(p)); }); });
const cli = (args: string[]) => new Promise<{ code: number | null; out: string }>((done) => {
  execFile(process.execPath, ['--import', 'tsx', 'scripts/reset.ts', ...args], { cwd: REPO_ROOT, timeout: 30000 }, (error, stdout, stderr) => {
    done({ code: error ? (typeof error.code === 'number' ? error.code : null) : 0, out: stdout + stderr });
  });
});
afterEach(async () => { await system?.close(); system = undefined; for (const d of dirs) rmSync(d, { recursive: true, force: true }); dirs = []; });

describe('demo:reset (DEMO01, T37 source side)', () => {
  it('resets only the synthetic records of the running system that owns the data dir, printing counts only', async () => {
    const dataDir = temp();
    const ports = { planner: await freePort(), benefits: await freePort(), culture: await freePort() };
    system = await startSystem({ mode: 'FIXTURE', namespace: 'QA', dataDir, ports });
    const base = 'http://127.0.0.1:' + ports.culture;
    const qa = { 'x-flecto-qa-token': system.credentials.cultureToken, 'content-type': 'application/json' };
    const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 'demo', password: 'flecto2026!' }) });
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    const reserve = await fetch(base + '/api/reservations', { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin: base }, body: JSON.stringify({ submissionId: 'sub-reset-1', courseId: 'painting', timeId: 'painting-wed-1400', applicantName: '김한빛', phone: '01012345678', consent: true }) });
    expect(reserve.status).toBe(201);
    expect(((await (await fetch(base + '/__qa/records', { headers: qa })).json()) as { count: number }).count).toBe(1);
    const cap = await fetch(base + '/__qa/capacity', { method: 'POST', headers: qa, body: JSON.stringify({ courseId: 'painting', timeId: 'painting-wed-1400', capacity: 1 }) });
    expect(cap.status).toBe(200);

    const run = await cli(['--namespace', 'QA', '--data-dir', dataDir, '--benefits-port', String(ports.benefits), '--culture-port', String(ports.culture)]);
    expect(run.code).toBe(0);
    expect(run.out).toContain('culture (127.0.0.1:' + ports.culture + '): 1 -> 0 record(s)');
    const config = JSON.parse(readFileSync(join(dataDir, 'private-config.json'), 'utf8')) as Record<string, string>;
    for (const secret of Object.values(config)) expect(run.out).not.toContain(secret);
    const after = await (await fetch(base + '/__qa/records', { headers: qa })).json() as { count: number; times: Array<{ timeId: string; capacity: number }> };
    expect(after.count).toBe(0);
    expect(after.times.find((t) => t.timeId === 'painting-wed-1400')!.capacity).toBeGreaterThan(1);
    // Login session survives: reset clears synthetic records, not sessions.
    expect((await (await fetch(base + '/api/session', { headers: { cookie } })).json() as { user?: unknown }).user).toBeTruthy();

    await system.close(); system = undefined;
    const stopped = await cli(['--namespace', 'QA', '--data-dir', dataDir, '--benefits-port', String(ports.benefits), '--culture-port', String(ports.culture)]);
    expect(stopped.code).toBe(1);
    expect(stopped.out).toContain('no running FLECTO QA system');
  }, 60000);

  it('refuses a live lock whose namespace does not match, and services that reject the token', async () => {
    const dataDir = temp();
    writeFileSync(join(dataDir, 'run.lock'), JSON.stringify({ pid: process.pid, nonce: 'x', namespace: 'DEMO' }));
    writeFileSync(join(dataDir, 'private-config.json'), JSON.stringify({ benefitsToken: 'b'.repeat(64), cultureToken: 'c'.repeat(64) }));
    const port = await freePort(); const port2 = await freePort();
    const mismatch = await cli(['--namespace', 'QA', '--data-dir', dataDir, '--benefits-port', String(port), '--culture-port', String(port2)]);
    expect(mismatch.code).toBe(1); expect(mismatch.out).toContain('does not match QA');
    writeFileSync(join(dataDir, 'run.lock'), JSON.stringify({ pid: process.pid, nonce: 'x', namespace: 'QA' }));
    const unreachable = await cli(['--namespace', 'QA', '--data-dir', dataDir, '--benefits-port', String(port), '--culture-port', String(port2)]);
    expect(unreachable.code).toBe(1); expect(unreachable.out).toContain('not reachable');
    expect(unreachable.out).not.toContain('b'.repeat(64));
  }, 30000);

  it('keeps DEMO fixed and confines QA overrides to temp or .flecto/qa paths', async () => {
    const demo = await resolveResetTarget(REPO_ROOT, {});
    expect(demo).toMatchObject({ namespace: 'DEMO', ports: { benefits: 4173, culture: 4174 } });
    expect(demo.dataDir).toBe(join(REPO_ROOT, '.flecto/demo'));
    await expect(resolveResetTarget(REPO_ROOT, { dataDir: temp() })).rejects.toThrow(ResetError);
    await expect(resolveResetTarget(REPO_ROOT, { namespace: 'QA', dataDir: temp(), benefitsPort: 4173, culturePort: 5000 })).rejects.toThrow('DEMO ports');
    await expect(resolveResetTarget(REPO_ROOT, { namespace: 'QA', dataDir: REPO_ROOT, benefitsPort: 5001, culturePort: 5002 })).rejects.toThrow('inside .flecto/qa');
    await expect(resolveResetTarget(REPO_ROOT, { namespace: 'PROD', dataDir: temp(), benefitsPort: 5001, culturePort: 5002 })).rejects.toThrow('DEMO or QA');
  });
});
