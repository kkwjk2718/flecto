import { resolve } from 'node:path';
import { REPO_ROOT } from './ops/common';
import { formatChecks, runDoctor } from './ops/doctor';

// Usage: npm run doctor [-- --json] [-- --root <checkout>]
const args = process.argv.slice(2);
const rootIndex = args.indexOf('--root');
const root = rootIndex >= 0 && args[rootIndex + 1] ? resolve(args[rootIndex + 1]!) : REPO_ROOT;
const checks = await runDoctor({ root });
if (args.includes('--json')) console.log(JSON.stringify({ root, checks }, null, 2));
else console.log('FLECTO doctor · ' + root + '\n' + formatChecks(checks));
process.exitCode = checks.some((c) => c.level === 'FAIL') ? 1 : 0;
