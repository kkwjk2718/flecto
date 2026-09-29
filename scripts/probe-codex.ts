/**
 * Tiny live probe for the LIVE_CODEX PlanProvider (P01).
 * Runs a synthetic PUBLIC snapshot (no user values) through the pinned Codex binary with the
 * tool surface disabled, then checks cancellation and deadline handling.
 * Prints summaries only: never the prompt, never raw stdout/stderr of the runtime.
 *
 * Usage: tsx scripts/probe-codex.ts [--model gpt-6-astra] [--model gpt-6-luna] [--effort low]
 *        [--binary /abs/path/codex] [--runtime /abs/empty/dir] [--budget 10000] [--skip-cancel]
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FlectoError, PREPARE_DEADLINE_MS, type PublicPageSnapshot } from '@flecto/contracts';
import { CodexProvider, DISABLED_FEATURES } from '../apps/planner/src/provider/codex';

const DEFAULT_BINARY = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex';

function parseArgs(argv: string[]) {
  const out = { models: [] as string[], effort: 'low', binary: DEFAULT_BINARY, runtime: '', budget: PREPARE_DEADLINE_MS, skipCancel: false };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const next = () => { i += 1; return argv[i] ?? ''; };
    if (key === '--model') out.models.push(next());
    else if (key === '--effort') out.effort = next();
    else if (key === '--binary') out.binary = next();
    else if (key === '--runtime') out.runtime = next();
    else if (key === '--budget') out.budget = Number(next());
    else if (key === '--skip-cancel') out.skipCancel = true;
  }
  if (out.models.length === 0) out.models = ['gpt-6-astra', 'gpt-6-luna'];
  if (!out.runtime) out.runtime = path.join(os.tmpdir(), 'flecto-codex-runtime');
  return out;
}

function syntheticSnapshot(requestId: string): PublicPageSnapshot {
  const base = { formRef: 'f1', disabled: false, constraints: {}, options: [], noticeRefs: [], actionKind: 'none' as const };
  return {
    schemaVersion: 1, requestId, snapshotId: 'snap-' + requestId, documentInstanceId: 'doc1',
    origin: 'http://127.0.0.1:4173', goal: 'complete_form', goalRef: 'e5', semanticRevision: 1, optionRevision: 1,
    controls: [
      { ...base, ref: 'e1', kind: 'text', label: '이름', required: true, semanticKey: 'name', constraints: { maxLength: 20 } },
      { ...base, ref: 'e2', kind: 'tel', label: '휴대전화 번호', required: true, semanticKey: 'phone', constraints: { pattern: '^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$' } },
      { ...base, ref: 'e3', kind: 'select', label: '거주 지역', required: true, semanticKey: 'region',
        options: [{ ref: 'o1', label: '서울', disabled: false }, { ref: 'o2', label: '경기', disabled: false }] },
      { ...base, ref: 'e4', kind: 'checkbox', label: '개인정보 수집에 동의합니다', required: true, semanticKey: 'consent', noticeRefs: ['n1'] },
      { ...base, ref: 'e5', kind: 'submit', label: '혜택 신청하기', required: false, semanticKey: 'submit', actionKind: 'submit' },
    ],
    notices: [{ ref: 'n1', text: '수집 항목: 이름, 연락처. 보유 기간: 신청 처리 후 1년.', kind: 'terms', formRef: 'f1', semanticKey: 'privacy-terms' }],
  };
}

function runtimeProcessCount(runtime: string): number {
  try {
    const out = execFileSync('pgrep', ['-lf', 'exec --ignore-user-config --ignore-rules --ephemeral'], { encoding: 'utf8' });
    return out.split('\n').filter((line) => line.includes(runtime) || line.includes('flecto-page-plan')).length;
  } catch { return 0; }
}

function errorCode(error: unknown): string {
  if (error instanceof FlectoError) return error.code;
  return 'UNEXPECTED:' + (error instanceof Error ? error.name : typeof error);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(args.binary)) { console.error('binary not found: ' + args.binary); process.exit(2); }
  const version = execFileSync(args.binary, ['--version'], { encoding: 'utf8' }).trim();
  console.log(JSON.stringify({ probe: 'codex-provider', binary: args.binary, version, runtime: args.runtime, effort: args.effort, disabledFeatures: DISABLED_FEATURES.length }));

  let requestSeq = 0;
  for (const model of args.models) {
    const provider = new CodexProvider({ binary: args.binary, model, runtimeDir: args.runtime, effort: args.effort });
    const snapshot = syntheticSnapshot('r' + (++requestSeq));
    const controller = new AbortController();
    const started = performance.now();
    try {
      const result = await provider.planDetailed(snapshot, args.budget, controller.signal);
      console.log(JSON.stringify({
        model, ok: true, mode: provider.mode, requestedEffort: result.requestedEffort, reportedModel: result.reportedModel,
        durationMs: result.durationMs, budgetMs: result.budgetMs, inputTokens: result.inputTokens, outputTokens: result.outputTokens,
        exitCode: result.exitCode, steps: result.plan.steps.map((s) => ({ id: s.id, template: s.template, title: s.title, controls: s.controlRefs.length, notices: s.noticeRefs.length })),
        sourceActionRef: result.plan.sourceActionRef,
      }));
    } catch (error) {
      console.log(JSON.stringify({ model, ok: false, error: errorCode(error), durationMs: Math.round(performance.now() - started), last: provider.last ? { exitCode: provider.last.exitCode } : null }));
    }
  }

  if (!args.skipCancel) {
    const model = args.models[0];
    const provider = new CodexProvider({ binary: args.binary, model, runtimeDir: args.runtime, effort: args.effort });
    const before = runtimeProcessCount(args.runtime);
    const controller = new AbortController();
    const started = performance.now();
    const pending = provider.plan(syntheticSnapshot('cancel'), args.budget, controller.signal);
    setTimeout(() => controller.abort(), 400);
    let cancelResult: string;
    try { await pending; cancelResult = 'RESOLVED_UNEXPECTEDLY'; } catch (error) { cancelResult = errorCode(error); }
    const after = runtimeProcessCount(args.runtime);
    console.log(JSON.stringify({ check: 'cancel', model, abortAfterMs: 400, result: cancelResult, settledMs: Math.round(performance.now() - started), runtimeProcessesBefore: before, runtimeProcessesAfter: after }));

    const tiny = new CodexProvider({ binary: args.binary, model, runtimeDir: args.runtime, effort: args.effort });
    const tinyStarted = performance.now();
    let tinyResult: string;
    try { await tiny.plan(syntheticSnapshot('tiny'), 250, new AbortController().signal); tinyResult = 'RESOLVED_UNEXPECTEDLY'; } catch (error) { tinyResult = errorCode(error); }
    console.log(JSON.stringify({ check: 'deadline', model, budgetMs: 250, result: tinyResult, settledMs: Math.round(performance.now() - tinyStarted), runtimeProcessesAfter: runtimeProcessCount(args.runtime) }));
  }
}

main().catch((error) => { console.error('probe failed: ' + (error instanceof Error ? error.message : String(error))); process.exit(1); });

