import { lstat, mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { inspectBuild, type BuildFile } from './build-check';
import { isInside, realpathOrNull, runFile, runWithInput, sha256 } from './common';
import { gradeEvidence, noEvidence, type GradeResult } from './evidence';
import { inspectRuntimeManifest, RUNTIME_MANIFEST } from './runtime-hash';
import { collectKnownSecrets, denyReason, isAllowlistedSource, ROOT_FILES, secretFindings, SOURCE_PREFIXES } from './policy';

export const RELEASE_SCHEMA = 'flecto.release.v1';
export class ReleaseError extends Error {
  constructor(message: string, readonly problems: string[] = []) { super(message); }
}
export type ReleaseOptions = { root: string; evidencePath?: string; now?: Date; env?: NodeJS.ProcessEnv };
export type ReleaseResult = { zipPath: string; manifestPath: string; sha256Path: string; zipSha256: string; manifest: Record<string, unknown> };
type Revocation = { extensionBuildSha256: string; reason: string; revokedAt: string };

const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const releasesDir = (root: string) => resolve(root, '.flecto/releases');
const revocationsPath = (root: string) => resolve(releasesDir(root), 'revocations.json');

export async function readRevocations(root: string): Promise<Revocation[]> {
  try {
    const parsed = JSON.parse(await readFile(revocationsPath(root), 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('bad');
    return parsed.filter((r): r is Revocation => !!r && typeof r.extensionBuildSha256 === 'string');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new ReleaseError('.flecto/releases/revocations.json is unreadable; refusing to package until it is fixed');
  }
}

/** Marks a build identity REVOKED so later packs of it are refused (ops/06: 과거 정상본 안전 결함). */
export async function revokeBuild(root: string, extensionBuildSha256: string, reason: string, now = new Date()): Promise<void> {
  if (!/^[0-9a-f]{64}$/.test(extensionBuildSha256)) throw new ReleaseError('build id must be a 64-char sha256 (see RELEASE_MANIFEST.json build.extensionBuildSha256)');
  if (!reason.trim()) throw new ReleaseError('a revocation reason is required');
  const list = await readRevocations(root);
  if (!list.some((r) => r.extensionBuildSha256 === extensionBuildSha256)) list.push({ extensionBuildSha256, reason: reason.trim(), revokedAt: now.toISOString() });
  await mkdir(releasesDir(root), { recursive: true, mode: 0o700 });
  await writeFile(revocationsPath(root), JSON.stringify(list, null, 2) + '\n', { mode: 0o600 });
}

async function readPackagedFile(rootReal: string, rel: string, problems: string[]): Promise<Buffer | null> {
  const full = resolve(rootReal, rel);
  try {
    const info = await lstat(full);
    if (info.isSymbolicLink()) { problems.push(rel + ': symlink is not packaged'); return null; }
    if (!info.isFile()) { problems.push(rel + ': not a regular file'); return null; }
    if (info.size > MAX_FILE_BYTES) { problems.push(rel + ': larger than 20 MB'); return null; }
  } catch { problems.push(rel + ': tracked but missing from the working tree'); return null; }
  const real = await realpathOrNull(full);
  if (!real || !isInside(rootReal, real)) { problems.push(rel + ': resolves outside the checkout'); return null; }
  return readFile(full);
}

/**
 * Builds .flecto/releases/<name>.zip from allowlisted tracked sources plus the verified build.
 * The product grade comes only from a validated evidence report bound to this build; otherwise UNVERIFIED.
 */
export async function createRelease(options: ReleaseOptions): Promise<ReleaseResult> {
  const rootReal = await realpathOrNull(options.root);
  if (!rootReal) throw new ReleaseError('root does not exist');
  const now = options.now ?? new Date();
  const problems: string[] = [];

  const head = await runFile('git', ['-C', rootReal, 'rev-parse', 'HEAD'], { timeoutMs: 10000 });
  if (head.code !== 0) throw new ReleaseError('root is not a git checkout');
  const gitSha = head.stdout.trim();
  const branch = (await runFile('git', ['-C', rootReal, 'rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim();
  const dirty = (await runFile('git', ['-C', rootReal, 'status', '--porcelain', '--untracked-files=no'], { timeoutMs: 20000 })).stdout.split('\n').filter(Boolean).length;
  const listed = await runFile('git', ['-C', rootReal, 'ls-files', '-z'], { timeoutMs: 20000 });
  if (listed.code !== 0) throw new ReleaseError('git ls-files failed');
  const tracked = listed.stdout.split('\0').filter(Boolean);
  const sources = tracked.filter(isAllowlistedSource).sort();
  const excludedTracked = tracked.filter((p) => !isAllowlistedSource(p));
  const deniedTracked = tracked.filter((p) => denyReason(p) !== null && (ROOT_FILES.includes(p) || SOURCE_PREFIXES.some((x) => p.startsWith(x))));

  const build = await inspectBuild(rootReal);
  if (!build.extension.ok) problems.push(...build.extension.problems.map((p) => 'build: ' + p));
  if (!build.culture.ok) problems.push(...build.culture.problems.map((p) => 'culture: ' + p));
  if (!build.runtime.ok) problems.push(...build.runtime.problems.map((p) => 'runtime: ' + p));
  if (problems.length) throw new ReleaseError('verified build required (npm run build)', problems);
  const buildSha = build.extension.buildSha256!;
  const revoked = (await readRevocations(rootReal)).find((r) => r.extensionBuildSha256 === buildSha);
  if (revoked) throw new ReleaseError('build ' + buildSha.slice(0, 12) + ' is REVOKED and excluded from release candidates', ['revoked: ' + revoked.reason]);

  const known = await collectKnownSecrets(rootReal, options.env ?? process.env);
  let grade: GradeResult = noEvidence();
  let evidenceBody: Buffer | null = null;
  if (options.evidencePath) {
    const evidencePath = resolve(options.evidencePath);
    try {
      const info = await lstat(evidencePath);
      if (!info.isFile() || info.size > MAX_FILE_BYTES) throw new Error('bad');
      evidenceBody = await readFile(evidencePath);
    } catch { throw new ReleaseError('evidence report is not a readable regular file'); }
    const leaks = secretFindings(evidenceBody, known);
    if (leaks.length) throw new ReleaseError('evidence report contains secret-like content', ['evidence: ' + leaks.join(',')]);
    let parsed: unknown = null;
    try { parsed = JSON.parse(evidenceBody.toString('utf8')); } catch { parsed = null; }
    grade = gradeEvidence(parsed, buildSha, build.runtime.manifest!.runtimeBuildSha256, build.runtime.manifest!.runtimeInputSha256);
    if (grade.grade === 'REVOKED') throw new ReleaseError('evidence marks this build REVOKED; not packaged', grade.reasons);
  }
  const productGrade = grade.grade;
  const reasons = [...grade.reasons];
  if (dirty) reasons.unshift(dirty + ' tracked file(s) differ from ' + gitSha.slice(0, 12) + '; identity verified by runtime content hashes');

  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const releaseId = stamp + '-' + gitSha.slice(0, 8);
  const name = 'flecto-' + releaseId + '-' + productGrade;
  const outDir = releasesDir(rootReal);
  await mkdir(outDir, { recursive: true, mode: 0o700 });
  const staging = resolve(outDir, '.staging-' + releaseId + '-' + process.pid);
  const top = resolve(staging, name);
  const entries: BuildFile[] = [];
  const stage = async (rel: string, body: Buffer) => {
    const leaks = secretFindings(body, known);
    if (leaks.length) { problems.push(rel + ': ' + leaks.join(',')); return; }
    await mkdir(dirname(resolve(top, rel)), { recursive: true });
    await writeFile(resolve(top, rel), body);
    entries.push({ path: rel, sha256: sha256(body), bytes: body.length });
  };
  try {
    for (const rel of sources) { const body = await readPackagedFile(rootReal, rel, problems); if (body) await stage(rel, body); }
    for (const file of [...build.extension.files, ...build.culture.files]) {
      const body = await readPackagedFile(rootReal, file.path, problems);
      if (body && sha256(body) !== file.sha256) problems.push(file.path + ': changed while packaging');
      else if (body) await stage(file.path, body);
    }
    const hashesBody = await readPackagedFile(rootReal, 'dist/extension-hashes.json', problems);
    if (hashesBody) await stage('dist/extension-hashes.json', hashesBody);
    const runtimeBody = await readPackagedFile(rootReal, RUNTIME_MANIFEST, problems);
    if (runtimeBody) await stage(RUNTIME_MANIFEST, runtimeBody);
    for (const [path, hash] of Object.entries({ ...build.runtime.manifest!.inputs, ...build.runtime.manifest!.artifacts })) {
      if (!entries.some((entry) => entry.path === path && entry.sha256 === hash)) problems.push(path + ': runtime input is missing or changed in package (track new inputs before release)');
    }
    const rechecked = await inspectRuntimeManifest(rootReal);
    if (!rechecked.ok || rechecked.manifest?.runtimeBuildSha256 !== build.runtime.manifest!.runtimeBuildSha256) problems.push('runtime changed while packaging');
    if (evidenceBody) await stage('release-evidence/test-report.json', evidenceBody);
    if (problems.length) throw new ReleaseError('release refused: ' + problems.length + ' file problem(s)', problems);

    entries.sort((a, b) => a.path.localeCompare(b.path));
    const manifest = {
      schema: RELEASE_SCHEMA, releaseId, name, createdAt: now.toISOString(), submitted: false,
      source: { gitSha, branch, trackedModified: dirty },
      build: { extensionBuildSha256: buildSha, runtimeBuildSha256: build.runtime.manifest!.runtimeBuildSha256, runtimeInputSha256: build.runtime.manifest!.runtimeInputSha256, runtimeManifest: RUNTIME_MANIFEST, manifestVersion: build.extension.manifestVersion, extension: build.extension.files, cultureAssets: build.culture.files.length },
      grade: {
        product: productGrade, derivedFromEvidence: grade.derived, claimed: grade.claimed, operational: grade.operationalGrade,
        evidenceValid: grade.valid, reasons, problems: grade.problems, counts: grade.counts,
      },
      capability_status: grade.capabilityStatus,
      evidence: evidenceBody ? { file: 'release-evidence/test-report.json', sha256: sha256(evidenceBody) } : null,
      contentSha256: sha256(entries.map((e) => e.path + '\0' + e.sha256 + '\n').join('')),
      policy: { sourcePrefixes: SOURCE_PREFIXES, rootFiles: ROOT_FILES, trackedExcluded: excludedTracked.length, trackedDenied: deniedTracked },
      files: entries,
    };
    const manifestBody = JSON.stringify(manifest, null, 2) + '\n';
    await writeFile(resolve(top, 'RELEASE_MANIFEST.json'), manifestBody);
    const zipPath = resolve(outDir, name + '.zip');
    const listing = [...entries.map((e) => name + '/' + e.path), name + '/RELEASE_MANIFEST.json'];
    const zipped = await runWithInput('zip', ['-X', '-D', '-q', zipPath, '-@'], listing.join('\n') + '\n', staging);
    if (zipped.code !== 0) throw new ReleaseError('zip failed (' + (zipped.spawnError ?? 'exit ' + zipped.code) + ')');
    const tested = await runFile('zip', ['-T', '-q', zipPath], { timeoutMs: 60000 });
    const names = await runFile('unzip', ['-Z1', zipPath], { timeoutMs: 60000 });
    const actual = names.stdout.split('\n').filter(Boolean).sort();
    if (tested.code !== 0 || actual.join('\n') !== [...listing].sort().join('\n')) {
      await rm(zipPath, { force: true });
      throw new ReleaseError('zip integrity or content listing check failed');
    }
    const zipSha256 = sha256(await readFile(zipPath));
    const manifestPath = resolve(outDir, name + '.manifest.json');
    await copyFile(resolve(top, 'RELEASE_MANIFEST.json'), manifestPath);
    const sha256Path = zipPath + '.sha256';
    await writeFile(sha256Path, zipSha256 + '  ' + name + '.zip\n');
    return { zipPath, manifestPath, sha256Path, zipSha256, manifest };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
