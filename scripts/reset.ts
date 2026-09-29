import { REPO_ROOT } from './ops/common';
import { ResetError, resetSources, resolveResetTarget, type ResetRequest } from './ops/reset';

// Usage: npm run demo:reset
//        tsx scripts/reset.ts --namespace QA --data-dir <tmp or .flecto/qa/..> --benefits-port N --culture-port N
const args = process.argv.slice(2);
const value = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const port = (name: string) => { const v = value(name); return v === undefined ? undefined : Number(v); };
const request: ResetRequest = { namespace: value('--namespace'), dataDir: value('--data-dir'), benefitsPort: port('--benefits-port'), culturePort: port('--culture-port') };
try {
  const target = await resolveResetTarget(REPO_ROOT, request);
  const summary = await resetSources(target);
  console.log('FLECTO ' + summary.namespace + ' synthetic source data reset');
  for (const s of summary.services) console.log('- ' + s.service + ' (127.0.0.1:' + s.port + '): ' + s.before + ' -> ' + s.after + ' record(s)');
  console.log('Sessions, planner cache, Chrome profiles and files were not touched.');
} catch (error) {
  console.error('demo:reset refused: ' + (error instanceof ResetError ? error.message : 'unexpected error ' + (error as Error).name));
  process.exitCode = 1;
}
