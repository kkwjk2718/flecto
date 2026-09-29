import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRelease, ReleaseError, revokeBuild } from '../../scripts/ops/release';
import { inspectBuild } from '../../scripts/ops/build-check';
import { EVIDENCE_SCHEMA, REQUIRED_IDS } from '../../scripts/ops/evidence';

const TOKEN = 'f1ec70' + 'deadbeef'.repeat(7) + '0a';
let root: string;
const put = (rel: string, body: string) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), body); };
const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' }).toString();
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const listZip = (zip: string) => execFileSync('unzip', ['-Z1', zip]).toString().split('\n').filter(Boolean).map((l) => l.split('/').slice(1).join('/'));
async function refusal(promise: Promise<unknown>): Promise<ReleaseError> {
  try { await promise; } catch (error) { expect(error).toBeInstanceOf(ReleaseError); return error as ReleaseError; }
  throw new Error('expected release refusal');
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'flecto-rel-'));
  put('package.json', '{"name":"flecto"}\n'); put('package-lock.json', '{}\n'); put('README.md', '# demo\n');
  put('apps/planner/src/server.ts', 'export const ok = true;\n');
  put('apps/leak/.env', 'X=1\n'); put('apps/leak/source.sqlite', 'db'); put('apps/leak/run.log', 'log');
  put('prompts/raw.md', 'private prompt\n'); put('state/STATUS.md', 'state\n'); put('archive/old.md', 'old\n');
  put('node_modules/pkg/index.js', 'module.exports = 1;\n');
  put('.flecto/demo/private-config.json', JSON.stringify({ plannerToken: TOKEN }));
  put('.flecto/demo/connection.txt', TOKEN + '\n');
  const ext: Record<string, string> = { 'manifest.json': '{"manifest_version":3,"version":"0.1.0"}', 'content.js': 'c', 'background.js': 'b', 'options.html': '<p>o</p>', 'options.js': 'o' };
  for (const [name, body] of Object.entries(ext)) put('dist/extension/' + name, body);
  put('dist/extension-hashes.json', JSON.stringify(Object.fromEntries(Object.entries(ext).map(([n, b]) => [n, sha(b)]))));
  put('apps/demo-culture/dist/index.html', '<!doctype html>'); put('apps/demo-culture/dist/assets/app.js', 'x');
  git('init', '-q'); git('config', 'user.email', 't@example.invalid'); git('config', 'user.name', 't');
  git('add', 'package.json', 'package-lock.json', 'README.md', 'apps/planner', 'apps/leak', 'prompts', 'state', 'archive');
  git('commit', '-qm', 'init');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function evidence(buildSha: string, extra: Record<string, unknown> = {}) {
  const results = Object.fromEntries(REQUIRED_IDS.map((id) => [id, { status: 'NOT_RUN' }]));
  results.T01 = { status: 'PASS', kind: 'FIXTURE' } as never;
  const path = join(root, '..', 'evidence-' + Math.random().toString(36).slice(2) + '.json');
  writeFileSync(path, JSON.stringify({ schema: EVIDENCE_SCHEMA, artifact: { extensionBuildSha256: buildSha }, run: { exitCode: 0, startedAt: 'a', finishedAt: 'b' }, results, claimedGrade: 'FULL_LIVE', ...extra }));
  return path;
}

describe('release:pack (REL01)', () => {
  it('packages only allowlisted tracked sources plus the verified build, graded UNVERIFIED without evidence', async () => {
    const result = await createRelease({ root, env: {}, now: new Date('2026-09-29T03:00:00Z') });
    expect(result.zipPath).toMatch(/\.flecto\/releases\/flecto-20260929T030000Z-[0-9a-f]{8}-UNVERIFIED\.zip$/);
    const names = listZip(result.zipPath).sort();
    expect(names).toEqual([
      'README.md', 'RELEASE_MANIFEST.json', 'apps/demo-culture/dist/assets/app.js', 'apps/demo-culture/dist/index.html', 'apps/planner/src/server.ts',
      'dist/extension-hashes.json', 'dist/extension/background.js', 'dist/extension/content.js', 'dist/extension/manifest.json',
      'dist/extension/options.html', 'dist/extension/options.js', 'package-lock.json', 'package.json',
    ]);
    const manifest = JSON.parse(execFileSync('unzip', ['-p', result.zipPath, execFileSync('unzip', ['-Z1', result.zipPath]).toString().split('\n').find((n) => n.endsWith('RELEASE_MANIFEST.json'))!]).toString());
    expect(manifest.submitted).toBe(false);
    expect(manifest.grade.product).toBe('UNVERIFIED');
    expect(manifest.grade.operational).toBe('DOCS_ONLY');
    expect(manifest.capability_status.vision).toBe('UNVERIFIED');
    expect(manifest.policy.trackedDenied).toEqual(expect.arrayContaining(['apps/leak/.env', 'apps/leak/source.sqlite', 'apps/leak/run.log']));
    const planner = manifest.files.find((f: { path: string }) => f.path === 'apps/planner/src/server.ts');
    expect(planner.sha256).toBe(sha('export const ok = true;\n'));
    expect(readFileSync(result.sha256Path, 'utf8')).toContain(sha(readFileSync(result.zipPath)));
    expect(readFileSync(result.zipPath).includes(Buffer.from(TOKEN))).toBe(false);
  });

  it('refuses when an allowlisted tracked file contains a local runtime token or key material', async () => {
    put('apps/planner/src/config.ts', 'export const t = "' + TOKEN + '";\n'); git('add', 'apps/planner/src/config.ts'); git('commit', '-qm', 'leak');
    const error = await refusal(createRelease({ root, env: {} }));
    expect(error.problems.join('\n')).toContain('apps/planner/src/config.ts: local-runtime-secret');
    expect(JSON.stringify([error.message, error.problems])).not.toContain(TOKEN);
    git('rm', '-q', 'apps/planner/src/config.ts'); put('tests/unit/k.ts', '-----BEGIN ' + 'PRIVATE KEY-----\n'); git('add', 'tests'); git('commit', '-qm', 'key');
    expect((await refusal(createRelease({ root, env: {} }))).problems.join()).toContain('private-key-block');
  });

  it('refuses tracked symlinks that point at private files', async () => {
    symlinkSync('../../.flecto/demo/private-config.json', join(root, 'apps/planner/link.json')); git('add', 'apps/planner/link.json'); git('commit', '-qm', 'link');
    expect((await refusal(createRelease({ root, env: {} }))).problems.join()).toContain('apps/planner/link.json: symlink');
  });

  it('refuses a build whose files no longer match the recorded hashes, and a missing build', async () => {
    put('dist/extension/content.js', 'tampered');
    expect((await refusal(createRelease({ root, env: {} }))).problems.join()).toContain('hash mismatch for dist/extension/content.js');
    rmSync(join(root, 'apps/demo-culture/dist'), { recursive: true });
    expect((await refusal(createRelease({ root, env: {} }))).problems.join()).toContain('apps/demo-culture/dist missing');
  });

  it('refuses a REVOKED build (OPER14)', async () => {
    const build = await inspectBuild(root);
    await revokeBuild(root, build.extension.buildSha256!, 'binder safety defect');
    const error = await refusal(createRelease({ root, env: {} }));
    expect(error.message).toContain('REVOKED');
  });

  it('grades from bound evidence, lowers over-claims, and rejects evidence from another artifact (OPER11)', async () => {
    const buildSha = (await inspectBuild(root)).extension.buildSha256!;
    const good = await createRelease({ root, env: {}, evidencePath: evidence(buildSha) });
    const grade = good.manifest.grade as { product: string; claimed: string; reasons: string[] };
    expect(grade.product).toBe('FIXTURE_ONLY'); expect(grade.claimed).toBe('FULL_LIVE');
    expect(listZip(good.zipPath)).toContain('release-evidence/test-report.json');
    const other = await createRelease({ root, env: {}, evidencePath: evidence('c'.repeat(64)) });
    expect((other.manifest.grade as { product: string }).product).toBe('UNVERIFIED');
    await refusal(createRelease({ root, env: {}, evidencePath: evidence(buildSha, { revoked: true }) }));
  });

  it('caps the grade at UNVERIFIED when tracked sources differ from the commit', async () => {
    const buildSha = (await inspectBuild(root)).extension.buildSha256!;
    put('apps/planner/src/server.ts', 'export const ok = false;\n');
    const result = await createRelease({ root, env: {}, evidencePath: evidence(buildSha) });
    expect((result.manifest.grade as { product: string }).product).toBe('UNVERIFIED');
    expect((result.manifest.source as { trackedModified: number }).trackedModified).toBe(1);
    chmodSync(join(root, '.flecto/releases'), 0o700);
  });
});
