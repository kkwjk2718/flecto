import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { canonicalJson, sha256 } from './common';
import { denyReason } from './policy';

export const RUNTIME_MANIFEST = 'dist/runtime-hashes.json';
export const RUNTIME_SCHEMA = 'flecto.runtime.v1';
export type HashFiles = Record<string, string>;
export type RuntimeManifest = { schema: typeof RUNTIME_SCHEMA; inputs: HashFiles; artifacts: HashFiles; runtimeInputSha256: string; runtimeBuildSha256: string };
const ROOT_INPUTS = ['package.json', 'package-lock.json', 'tsconfig.json', 'vitest.config.ts', 'playwright.config.ts', 'playwright.live.config.ts', '.nvmrc'];
const INPUT_DIRS = ['apps', 'packages', 'scripts', 'tests', 'spec', 'ops'];

async function tree(root: string, rel: string, output: HashFiles, artifacts = false): Promise<void> {
  if (!artifacts && denyReason(rel + '/entry')) return;
  let info;
  try { info = await lstat(resolve(root, rel)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  if (info.isSymbolicLink()) throw new Error(rel + ': symlink is not a runtime input');
  if (info.isDirectory()) {
    for (const name of (await readdir(resolve(root, rel))).sort()) await tree(root, rel + '/' + name, output, artifacts);
  } else if (info.isFile()) {
    if (!artifacts && (denyReason(rel) || (/\.md$/i.test(rel) && !/^(spec|ops)\//.test(rel)))) return;
    output[rel] = sha256(await readFile(resolve(root, rel)));
  } else throw new Error(rel + ': non-regular runtime input');
}

/** Filesystem content, including uncommitted/new inputs; never HEAD, mtimes, secrets or generated state. */
export async function captureRuntimeInputs(root: string): Promise<HashFiles> {
  const files: HashFiles = {};
  for (const path of [...ROOT_INPUTS, ...INPUT_DIRS]) await tree(root, path, files);
  if (!files['package.json'] || !files['package-lock.json']) throw new Error('runtime inputs require package.json and package-lock.json');
  return files;
}

async function currentManifest(root: string): Promise<RuntimeManifest> {
  const inputs = await captureRuntimeInputs(root);
  const artifacts: HashFiles = {};
  for (const path of ['dist/extension', 'dist/extension-hashes.json', 'apps/demo-culture/dist']) await tree(root, path, artifacts, true);
  if (!artifacts['dist/extension/manifest.json'] || !artifacts['apps/demo-culture/dist/index.html'] || !artifacts['dist/extension-hashes.json']) throw new Error('runtime manifest requires completed extension and culture builds');
  const runtimeInputSha256 = sha256(canonicalJson(inputs));
  return { schema: RUNTIME_SCHEMA, inputs, artifacts, runtimeInputSha256, runtimeBuildSha256: sha256(canonicalJson({ schema: RUNTIME_SCHEMA, inputs, artifacts })) };
}

/** Build integration: capture inputs BEFORE building; write only AFTER all builds succeed. */
export async function writeRuntimeManifest(root: string, before: HashFiles): Promise<RuntimeManifest> {
  const manifest = await currentManifest(root);
  if (canonicalJson(before) !== canonicalJson(manifest.inputs)) throw new Error('runtime inputs changed during build; rebuild required');
  await mkdir(dirname(resolve(root, RUNTIME_MANIFEST)), { recursive: true });
  await writeFile(resolve(root, RUNTIME_MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

export async function inspectRuntimeManifest(root: string): Promise<{ ok: boolean; problems: string[]; manifest: RuntimeManifest | null }> {
  try {
    const path = resolve(root, RUNTIME_MANIFEST);
    if (!(await lstat(path)).isFile()) throw new Error('runtime manifest is not a regular file');
    const recorded: unknown = JSON.parse(await readFile(path, 'utf8'));
    const current = await currentManifest(root);
    if (canonicalJson(recorded) !== canonicalJson(current)) throw new Error('runtime/server/prompt/source or built artifacts changed since build; rebuild and rerun evidence');
    return { ok: true, problems: [], manifest: current };
  } catch (error) {
    return { ok: false, problems: [error instanceof Error ? error.message : 'runtime manifest invalid'], manifest: null };
  }
}
