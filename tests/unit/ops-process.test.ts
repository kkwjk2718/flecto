import { afterEach, describe, expect, it } from 'vitest';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBounded } from '../../scripts/ops/guards';
import { REPO_ROOT } from '../../scripts/ops/common';
import { startSystem, type RunningSystem } from '../../scripts/system';

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const waitDead = async (pid: number, ms = 4000) => { const until = Date.now() + ms; while (alive(pid) && Date.now() < until) await new Promise((r) => setTimeout(r, 50)); return !alive(pid); };
// Parent prints the pid of a grandchild it started in the same process group, then idles.
const PARENT = "const {spawn}=require('node:child_process');const g=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log('GRANDCHILD '+g.pid);";
let bystander: ChildProcess | undefined;
let system: RunningSystem | undefined;
const dirs: string[] = [];
afterEach(async () => {
  if (bystander?.pid && alive(bystander.pid)) bystander.kill('SIGKILL');
  bystander = undefined;
  await system?.close(); system = undefined;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('bounded runner (OPER02/OPER06/OPER08 process behaviour)', () => {
  it('stops its own child and grandchild at the deadline and leaves unrelated processes alone', async () => {
    bystander = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
    const result = await runBounded(process.execPath, ['-e', PARENT + 'setInterval(()=>{},1000);'], { deadlineMs: 1200, graceMs: 500 });
    expect(result.timedOut).toBe(true);
    const grandchild = Number(/GRANDCHILD (\d+)/.exec(result.stdoutTail)?.[1]);
    expect(grandchild).toBeGreaterThan(1);
    expect(await waitDead(grandchild)).toBe(true);
    expect(alive(bystander.pid!)).toBe(true);
    expect(result.durationMs).toBeLessThan(6000);
  }, 15000);

  it('returns the real exit code and reaps descendants left behind by a finished command', async () => {
    const result = await runBounded(process.execPath, ['-e', PARENT + 'setTimeout(()=>process.exit(7),200);'], { deadlineMs: 10000, graceMs: 500 });
    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(7);
    expect(await waitDead(Number(/GRANDCHILD (\d+)/.exec(result.stdoutTail)?.[1]))).toBe(true);
    expect(result.durationMs).toBeLessThan(5000);
  }, 15000);

  it('CLI maps a deadline to exit 124', async () => {
    const code = await new Promise<number | null>((done) => {
      execFile(process.execPath, ['--import', 'tsx', 'scripts/ops/run-bounded.ts', '--deadline-sec', '1', '--', process.execPath, '-e', 'setInterval(()=>{},1000)'], { cwd: REPO_ROOT, timeout: 20000 },
        (error) => done(error ? (typeof error.code === 'number' ? error.code : null) : 0));
    });
    expect(code).toBe(124);
  }, 25000);
});

describe('demo launcher run lock (OPER01 against the real launcher)', () => {
  it('refuses a second system process on the same data dir while the first keeps serving', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'flecto-lock-')); dirs.push(dataDir);
    const free = () => new Promise<number>((done) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => done(p)); }); });
    const ports = { planner: await free(), benefits: await free(), culture: await free() };
    system = await startSystem({ mode: 'FIXTURE', namespace: 'QA', dataDir, ports });
    const other = { planner: await free(), benefits: await free(), culture: await free() };
    const script = "import('./scripts/system.ts').then(m=>m.startSystem({mode:'FIXTURE',namespace:'QA',dataDir:process.argv[1],ports:JSON.parse(process.argv[2])})).then(async s=>{await s.close();process.exit(0)},e=>{console.error(e.message);process.exit(3)})";
    const second = await new Promise<{ code: number | null; err: string }>((done) => {
      execFile(process.execPath, ['--import', 'tsx', '-e', script, dataDir, JSON.stringify(other)], { cwd: REPO_ROOT, timeout: 30000 },
        (error, _out, stderr) => done({ code: error ? (typeof error.code === 'number' ? error.code : null) : 0, err: stderr }));
    });
    expect(second.code).toBe(3);
    expect(second.err).toContain('already running');
    const records = await fetch('http://127.0.0.1:' + ports.culture + '/__qa/records', { headers: { 'x-flecto-qa-token': system.credentials.cultureToken } });
    expect(records.status).toBe(200);
  }, 45000);
});
