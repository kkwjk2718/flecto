import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { addedFocusOrSkip, changedFiles, checkHandoff, issueLease, patchId, recordIntegration, scopeViolations } from '../../scripts/ops/guards';

let repo: string;
const put = (rel: string, body: string) => { mkdirSync(dirname(join(repo, rel)), { recursive: true }); writeFileSync(join(repo, rel), body); };
const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { stdio: 'pipe' }).toString().trim();
const commit = (msg: string) => { git('add', '-A'); git('commit', '-qm', msg); return git('rev-parse', 'HEAD'); };

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'flecto-guard-'));
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@example.invalid'); git('config', 'user.name', 't');
  put('package.json', '{}\n'); put('scripts/ops/a.ts', 'a\n'); put('tests/unit/core.test.ts', "it('T01', () => {});\n"); put('spec/00.md', 'spec\n');
  commit('base');
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('patch guards (OPER09/OPER10/OPER05 inputs)', () => {
  it('rejects protected paths, out-of-scope paths and removed tests from a real diff', async () => {
    const base = git('rev-parse', 'HEAD');
    put('scripts/ops/a.ts', 'a2\n'); put('package.json', '{"x":1}\n'); put('spec/00.md', 'weakened\n'); put('apps/x.ts', 'x\n');
    rmSync(join(repo, 'tests/unit/core.test.ts'));
    const head = commit('worker');
    const violations = scopeViolations(await changedFiles(repo, base, head), ['scripts/ops/**', 'tests/unit/ops*.test.ts']);
    expect(violations).toEqual(expect.arrayContaining([
      { path: 'package.json', reason: 'protected path' }, { path: 'spec/00.md', reason: 'protected path' },
      { path: 'apps/x.ts', reason: 'outside lease scope' }, { path: 'tests/unit/core.test.ts', reason: 'test file removed' },
    ]));
    expect(violations.some((v) => v.path === 'scripts/ops/a.ts')).toBe(false);
  });

  it('detects newly added focused or skipped tests in the diff text', () => {
    const base = git('rev-parse', 'HEAD');
    put('tests/unit/ops-x.test.ts', "it.only('focus', () => {});\n"); const head = commit('only');
    expect(addedFocusOrSkip(git('diff', base, head))).toBe(true);
    put('tests/unit/ops-x.test.ts', "it('ok', () => {});\n"); const clean = commit('clean');
    expect(addedFocusOrSkip(git('diff', head, clean))).toBe(false);
    expect(addedFocusOrSkip("+  describe.skip('x', () => {})")).toBe(true);
  });

  it('identifies the same patch re-delivered on another base and records it only once, even concurrently', async () => {
    const base = git('rev-parse', 'HEAD');
    put('scripts/ops/a.ts', 'patched\n'); const first = commit('patch');
    git('checkout', '-q', '-b', 'other', base); put('README.md', 'unrelated\n'); const otherBase = commit('other');
    git('cherry-pick', first); const again = git('rev-parse', 'HEAD');
    const id1 = await patchId(repo, base, first); const id2 = await patchId(repo, otherBase, again);
    expect(id1).toMatch(/^[0-9a-f]{40}$/); expect(id2).toBe(id1);
    const ledger = join(repo, '.ops/integrated.json');
    const entry = { patchId: id1!, task: 'OPS-01', generation: 1, head: first, at: 'now' };
    const results = await Promise.all([recordIntegration(ledger, entry), recordIntegration(ledger, { ...entry, head: again })]);
    expect(results.sort()).toEqual(['duplicate', 'recorded']);
    expect(await patchId(repo, base, base)).toBeNull();
  });
});

describe('lease generations (OPER04 input)', () => {
  it('quarantines late handoffs from an older generation, another owner or an expired lease', async () => {
    const dir = join(repo, '.ops/leases');
    const now = new Date('2026-09-29T03:00:00Z');
    const g1 = await issueLease(dir, 'OPS-01', 'worker-a', ['scripts/ops/**'], 60000, now);
    const g2 = await issueLease(dir, 'OPS-01', 'worker-b', ['scripts/ops/**'], 60000, now);
    expect([g1.generation, g2.generation]).toEqual([1, 2]);
    expect(await checkHandoff(dir, { task: 'OPS-01', generation: 1, owner: 'worker-a' }, now)).toEqual({ ok: false, reason: 'stale generation 1 (current 2)' });
    expect((await checkHandoff(dir, { task: 'OPS-01', generation: 2, owner: 'worker-a' }, now)).ok).toBe(false);
    expect((await checkHandoff(dir, { task: 'OPS-01', generation: 2, owner: 'worker-b' }, now)).ok).toBe(true);
    expect(await checkHandoff(dir, { task: 'OPS-01', generation: 2, owner: 'worker-b' }, new Date('2026-09-29T03:01:01Z'))).toEqual({ ok: false, reason: 'lease expired' });
    await expect(issueLease(dir, '../escape', 'x', [], 1)).rejects.toThrow('invalid task id');
  });
});
