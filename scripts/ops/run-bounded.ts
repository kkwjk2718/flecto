import { runBounded } from './guards';

// Bounded check runner: tsx scripts/ops/run-bounded.ts --deadline-sec 600 -- npx vitest run
// Exit codes: child's code; 124 on deadline; 125 when the command could not start.
const args = process.argv.slice(2);
const sep = args.indexOf('--');
const deadline = Number(args[args.indexOf('--deadline-sec') + 1]);
if (sep < 0 || !args[sep + 1] || !Number.isFinite(deadline) || deadline <= 0) {
  console.error('usage: run-bounded --deadline-sec <n> -- <command> [args...]'); process.exit(2);
}
const [cmd, ...rest] = args.slice(sep + 1);
const result = await runBounded(cmd!, rest, { deadlineMs: deadline * 1000 });
process.stdout.write(result.stdoutTail); process.stderr.write(result.stderrTail);
console.error('run-bounded: ' + (result.timedOut ? 'DEADLINE after ' : 'exit ' + result.code + ' after ') + Math.round(result.durationMs / 1000) + 's (own process group only)');
process.exitCode = result.timedOut ? 124 : result.code ?? 125;
