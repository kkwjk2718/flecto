import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDoctor, portInUse } from '../../scripts/ops/doctor';
import { REPO_ROOT } from '../../scripts/ops/common';

const TOKEN = 'doctor' + '0123456789abcdef'.repeat(3);
let root: string;
let servers: Server[] = [];
const listen = () => new Promise<number>((done) => { const s = createServer((c) => c.destroy()); servers.push(s); s.listen(0, '127.0.0.1', () => done((s.address() as { port: number }).port)); });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'flecto-doc-'));
  mkdirSync(join(root, '.flecto/demo'), { recursive: true });
  writeFileSync(join(root, '.flecto/demo/private-config.json'), JSON.stringify({ plannerToken: TOKEN }));
  chmodSync(join(root, '.flecto/demo/private-config.json'), 0o644);
});
afterEach(async () => {
  await Promise.all(servers.map((s) => new Promise((d) => s.close(d)))); servers = [];
  rmSync(root, { recursive: true, force: true });
});

describe('doctor (read-only environment check)', () => {
  it('reports missing deps/build, broad secret-file permissions and foreign port owners as FAIL', async () => {
    const foreign = await listen();
    const checks = await runDoctor({ root, ports: { planner: foreign, benefits: foreign + 0, culture: foreign }, env: {} });
    const level = (id: string) => checks.find((c) => c.id === id)?.level;
    expect(level('node.runtime')).toBe('OK');
    expect(level('deps')).toBe('FAIL');
    expect(level('git')).toBe('FAIL');
    expect(level('build.extension')).toBe('FAIL');
    expect(level('build.culture')).toBe('FAIL');
    expect(level('private.private-config.json')).toBe('FAIL');
    expect(level('port.planner')).toBe('FAIL');
    expect(await portInUse(foreign)).toBe(true);
    expect(JSON.stringify(checks)).not.toContain(TOKEN);
  });

  it('attributes an occupied port to a live DEMO lock instead of failing', async () => {
    const port = await listen();
    writeFileSync(join(root, '.flecto/demo/run.lock'), JSON.stringify({ pid: process.pid, nonce: 'n'.repeat(64), namespace: 'DEMO' }));
    const checks = await runDoctor({ root, ports: { planner: port, benefits: port, culture: port }, env: {} });
    expect(checks.find((c) => c.id === 'port.benefits')?.level).toBe('INFO');
    expect(checks.find((c) => c.id === 'demo.lock')?.message).toContain(String(process.pid));
    expect(JSON.stringify(checks)).not.toContain('n'.repeat(64));
  });

  it('CLI exits non-zero on FAIL and never prints private values', async () => {
    const out = await new Promise<{ code: number | null; stdout: string; stderr: string }>((done) => {
      execFile(process.execPath, ['--import', 'tsx', 'scripts/doctor.ts', '--root', root], { cwd: REPO_ROOT, timeout: 60000 }, (error, stdout, stderr) => {
        done({ code: error ? (typeof error.code === 'number' ? error.code : null) : 0, stdout, stderr });
      });
    });
    expect(out.code).toBe(1);
    expect(out.stdout).toContain('[FAIL] deps');
    expect(out.stdout + out.stderr).not.toContain(TOKEN);
  }, 60000);
});
