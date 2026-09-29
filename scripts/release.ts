import { relative } from 'node:path';
import { REPO_ROOT } from './ops/common';
import { createRelease, ReleaseError, revokeBuild } from './ops/release';

// Usage: npm run release:pack [-- --evidence <report.json>] [-- --json]
//        npm run release:pack -- --revoke <extensionBuildSha256> --reason "<text>"
const args = process.argv.slice(2);
const value = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
try {
  const revoke = value('--revoke');
  if (revoke !== undefined) {
    await revokeBuild(REPO_ROOT, revoke, value('--reason') ?? '');
    console.log('build ' + revoke.slice(0, 12) + ' marked REVOKED in .flecto/releases/revocations.json');
  } else {
    const result = await createRelease({ root: REPO_ROOT, evidencePath: value('--evidence') });
    const grade = result.manifest.grade as { product: string; operational: string; reasons: string[] };
    if (args.includes('--json')) console.log(JSON.stringify({ zip: result.zipPath, sha256: result.zipSha256, manifest: result.manifestPath, grade }, null, 2));
    else {
      console.log('release: ' + relative(process.cwd(), result.zipPath));
      console.log('sha256:  ' + result.zipSha256);
      console.log('files:   ' + (result.manifest.files as unknown[]).length + ' (manifest ' + relative(process.cwd(), result.manifestPath) + ')');
      console.log('grade:   ' + grade.product + ' / operational ' + grade.operational + ' · submitted=false');
      for (const reason of grade.reasons.slice(0, 8)) console.log('  - ' + reason);
    }
  }
} catch (error) {
  if (error instanceof ReleaseError) {
    console.error('release:pack refused: ' + error.message);
    for (const p of error.problems.slice(0, 40)) console.error('  - ' + p);
  } else console.error('release:pack failed: ' + (error as Error).name);
  process.exitCode = 2;
}
