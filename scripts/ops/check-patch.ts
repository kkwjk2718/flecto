import { resolve } from 'node:path';
import { REPO_ROOT, runFile } from './common';
import { addedFocusOrSkip, changedFiles, checkHandoff, isIntegrated, patchId, recordIntegration, scopeViolations } from './guards';

// Integrator gate for a worker patch (OPS01: OPER04/05/09/10 inputs). Read-only unless --record.
// tsx scripts/ops/check-patch.ts --base <rev> --head <rev> --allow 'scripts/ops/**' [--allow ...]
//   [--task OPS-01 --generation 1 --owner worker-a] [--record]
const args = process.argv.slice(2);
const values = (name: string) => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]!] : []));
const one = (name: string) => values(name)[0];
const base = one('--base'); const head = one('--head') ?? 'HEAD'; const allow = values('--allow');
const opsDir = resolve(REPO_ROOT, '.flecto/ops');
const ledger = resolve(opsDir, 'integrated.json');
let failed = false;
const fail = (msg: string) => { failed = true; console.log('REJECT ' + msg); };
if (!base || !allow.length) { console.error('usage: check-patch --base <rev> --head <rev> --allow <glob> [...]'); process.exit(2); }
try {
  const changes = await changedFiles(REPO_ROOT, base, head);
  console.log('changed files: ' + changes.length);
  for (const v of scopeViolations(changes, allow)) fail(v.path + ': ' + v.reason);
  const diff = await runFile('git', ['-C', REPO_ROOT, 'diff', base, head, '--', 'tests'], { timeoutMs: 30000 });
  if (addedFocusOrSkip(diff.stdout)) fail('patch adds .only/.skip/.todo to tests');
  const id = await patchId(REPO_ROOT, base, head);
  if (!id) fail('empty patch');
  else if (await isIntegrated(ledger, id)) fail('duplicate patch ' + id.slice(0, 12) + ' already integrated');
  const task = one('--task');
  if (task) {
    const check = await checkHandoff(resolve(opsDir, 'leases'), { task, generation: Number(one('--generation')), owner: one('--owner') ?? '' });
    if (!check.ok) fail('lease: ' + check.reason);
  }
  if (!failed && id && args.includes('--record')) {
    const sha = (await runFile('git', ['-C', REPO_ROOT, 'rev-parse', head])).stdout.trim();
    const status = await recordIntegration(ledger, { patchId: id, task: task ?? '', generation: Number(one('--generation') ?? 0), head: sha, at: new Date().toISOString() });
    if (status === 'duplicate') fail('duplicate patch (recorded concurrently)'); else console.log('recorded ' + id.slice(0, 12));
  }
  console.log(failed ? 'check-patch: REJECTED' : 'check-patch: OK (PATCH_READY is still not a completion gate)');
  process.exitCode = failed ? 1 : 0;
} catch (error) {
  console.error('check-patch error: ' + (error as Error).message); process.exitCode = 2;
}
