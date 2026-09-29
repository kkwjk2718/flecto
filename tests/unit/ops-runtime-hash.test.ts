import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { captureRuntimeInputs, inspectRuntimeManifest, writeRuntimeManifest } from '../../scripts/ops/runtime-hash';

let root: string;
async function put(path: string, body = '{}') { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), body); }
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'flecto-runtime-'));
  for (const path of ['package.json', 'package-lock.json', 'apps/planner/src/server.ts', 'apps/planner/src/provider/prompt.ts', 'dist/extension/manifest.json', 'dist/extension-hashes.json', 'apps/demo-culture/dist/index.html']) await put(path);
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe('runtime content identity', () => {
  it('is deterministic and excludes progress docs, private runtime state and dependencies', async () => {
    const before = await captureRuntimeInputs(root);
    const first = await writeRuntimeManifest(root, before);
    for (const path of ['state/STATUS.md', 'apps/planner/src/cache/NEXT_ACTION.md', '.flecto/demo/private-config.json', 'node_modules/pkg/a.js', 'apps/planner/.env']) await put(path, 'changed');
    expect(await captureRuntimeInputs(root)).toEqual(before);
    expect(await writeRuntimeManifest(root, before)).toEqual(first);
    expect((await inspectRuntimeManifest(root)).ok).toBe(true);
  });
  it.each(['apps/planner/src/server.ts', 'apps/planner/src/provider/prompt.ts', 'package-lock.json', 'apps/demo-culture/dist/index.html'])('invalidates changed %s', async (path) => {
    await writeRuntimeManifest(root, await captureRuntimeInputs(root));
    await put(path, 'mutation');
    expect((await inspectRuntimeManifest(root)).ok).toBe(false);
  });
  it('detects new and deleted runtime source files', async () => {
    await writeRuntimeManifest(root, await captureRuntimeInputs(root));
    await put('apps/planner/src/new.ts');
    expect((await inspectRuntimeManifest(root)).ok).toBe(false);
    await rm(join(root, 'apps/planner/src/new.ts'));
    await rm(join(root, 'apps/planner/src/server.ts'));
    expect((await inspectRuntimeManifest(root)).ok).toBe(false);
  });
  it('will not stamp changed build inputs or silently refresh an existing manifest', async () => {
    const before = await captureRuntimeInputs(root);
    await writeRuntimeManifest(root, before);
    const saved = await readFile(join(root, 'dist/runtime-hashes.json'), 'utf8');
    await put('apps/planner/src/provider/prompt.ts', 'changed during build');
    await expect(writeRuntimeManifest(root, before)).rejects.toThrow('changed during build');
    expect(await readFile(join(root, 'dist/runtime-hashes.json'), 'utf8')).toBe(saved);
  });
  it('refuses symlinked source directories', async () => {
    await symlink(join(root, 'apps/planner/src'), join(root, 'apps/linked'));
    await expect(captureRuntimeInputs(root)).rejects.toThrow('symlink');
  });
  it('binds actual Node/platform identity and file-based prompts, including Markdown prompts', async () => {
    const initial = await writeRuntimeManifest(root, await captureRuntimeInputs(root));
    expect(initial.toolchain).toEqual({ node: process.version, platform: process.platform, arch: process.arch });
    await put('apps/planner/src/provider/prompt.md', 'new model instruction');
    expect((await inspectRuntimeManifest(root)).ok).toBe(false);
  });
});
