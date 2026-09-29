/**
 * Tiny live probe for the LIVE_CODEX PlanProvider (P01 / PERF-P01-01).
 * Runs synthetic PUBLIC snapshots (no user values) through the pinned Codex binary with the
 * tool surface disabled, then checks cancellation and deadline handling.
 * Prints summaries only: never the prompt, never raw stdout/stderr of the runtime.
 *
 * Usage: tsx scripts/probe-codex.ts [--model gpt-6-astra] [--model gpt-6-luna] [--effort low]
 *        [--binary /abs/path/codex] [--runtime /abs/empty/dir] [--budget 10000] [--skip-cancel]
 *        [--shape small|large] [--repeat N] [--fast]   (--fast sets service_tier="fast"; uses the account's fast-mode allowance)
 *        --capture   Request-body capture only: points the runtime at a dummy loopback endpoint that records
 *                    instructions size, input items and tools[] and answers 400. No model call, no credential read.
 *        --extra <cli arg>   (capture only, repeatable) extra runtime argument to compare request shapes, e.g. --extra --enable --extra x
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { FlectoError, PREPARE_DEADLINE_MS, type PublicControl, type PublicPageSnapshot } from '@flecto/contracts';
import { verifyPlan } from '@flecto/core';
import { CodexProvider, DISABLED_FEATURES, buildExecArgs } from '../apps/planner/src/provider/codex';
import { PLANNER_INSTRUCTIONS, buildOutputSchema, encodePlanPrompt } from '../apps/planner/src/provider/prompt';

const DEFAULT_BINARY = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex';

function parseArgs(argv: string[]) {
  const out = { models: [] as string[], effort: 'low', binary: DEFAULT_BINARY, runtime: '', budget: PREPARE_DEADLINE_MS, skipCancel: false, shape: 'small' as 'small' | 'large', repeat: 1, capture: false, extra: [] as string[], fast: false };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const next = () => { i += 1; return argv[i] ?? ''; };
    if (key === '--model') out.models.push(next());
    else if (key === '--effort') out.effort = next();
    else if (key === '--binary') out.binary = next();
    else if (key === '--runtime') out.runtime = next();
    else if (key === '--budget') out.budget = Number(next());
    else if (key === '--skip-cancel') out.skipCancel = true;
    else if (key === '--shape') out.shape = next() === 'large' ? 'large' : 'small';
    else if (key === '--repeat') out.repeat = Math.max(1, Number(next()) || 1);
    else if (key === '--capture') out.capture = true;
    else if (key === '--extra') out.extra.push(next());
    else if (key === '--fast') out.fast = true;
  }
  if (out.models.length === 0) out.models = ['gpt-6-astra', 'gpt-6-luna'];
  if (!out.runtime) out.runtime = path.join(os.tmpdir(), 'flecto-codex-runtime');
  return out;
}

const base = { formRef: 'f1', disabled: false, constraints: {}, options: [], noticeRefs: [], actionKind: 'none' as const };

function syntheticSnapshot(requestId: string): PublicPageSnapshot {
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

/** Realistic shape: ~50-character refs (like e_<documentId>_<n>), 15 in-form controls, 2 out-of-form links, 4 notices. */
function largeSnapshot(requestId: string): PublicPageSnapshot {
  const doc = 'a7f3c9e1b2d4f6a8c0e2b4d6f8a1c3e5b7d9f1a3';
  const r = (prefix: string, n: number) => `${prefix}_${doc}_${n}`;
  const form = r('f', 1);
  const c = (n: number, kind: PublicControl['kind'], label: string, extra: Partial<PublicControl> = {}): PublicControl =>
    ({ ...base, formRef: form, ref: r('e', n), kind, label, required: true, semanticKey: `${form}|${kind}|${label}`, ...extra });
  const opts = (count: number, n: number) => Array.from({ length: count }, (_, i) => ({ ref: r('o', n * 100 + i), label: '선택지 ' + (i + 1), disabled: false }));
  return {
    schemaVersion: 1, requestId, snapshotId: 'snap_' + doc + '_' + requestId, documentInstanceId: doc,
    origin: 'http://127.0.0.1:4173', goal: 'complete_form', goalRef: r('e', 15), semanticRevision: 3, optionRevision: 2,
    controls: [
      c(1, 'text', '신청인 성명', { constraints: { maxLength: 30 } }),
      c(2, 'date', '생년월일'),
      c(3, 'tel', '휴대전화 번호', { constraints: { pattern: '^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$' } }),
      c(4, 'email', '이메일 주소', { required: false }),
      c(5, 'text', '주소', { constraints: { maxLength: 120 } }),
      c(6, 'text', '상세 주소', { required: false }),
      c(7, 'select', '거주 지역', { options: opts(17, 7) }),
      c(8, 'radio', '가구 형태', { options: opts(3, 8) }),
      c(9, 'number', '가구원 수', { constraints: { min: '1', max: '12' } }),
      c(10, 'select', '신청 혜택 종류', { options: opts(6, 10) }),
      c(11, 'textarea', '신청 사유', { required: false, constraints: { maxLength: 500 } }),
      c(12, 'checkbox', '개인정보 수집·이용에 동의합니다', { noticeRefs: [r('n', 1)] }),
      c(13, 'checkbox', '제3자 제공에 동의합니다', { noticeRefs: [r('n', 2)] }),
      c(14, 'checkbox', '혜택 안내 수신에 동의합니다 (선택)', { required: false }),
      c(15, 'submit', '혜택 신청하기', { required: false, actionKind: 'submit' }),
      { ...base, formRef: null, ref: r('e', 16), kind: 'link', label: '홈으로', required: false, semanticKey: '|link|홈으로', actionKind: 'navigate' },
      { ...base, formRef: null, ref: r('e', 17), kind: 'link', label: '고객센터', required: false, semanticKey: '|link|고객센터', actionKind: 'navigate' },
    ],
    notices: [
      { ref: r('n', 1), kind: 'terms', formRef: form, semanticKey: form + '|notice|privacy', text: '개인정보 수집·이용 안내: 수집 항목은 성명, 생년월일, 연락처, 주소이며 보유 기간은 신청 처리 완료 후 1년입니다. 동의를 거부할 수 있으나 거부 시 혜택 신청이 제한됩니다. ' + '자세한 내용은 개인정보 처리방침을 확인해 주세요. '.repeat(6) },
      { ref: r('n', 2), kind: 'terms', formRef: form, semanticKey: form + '|notice|third', text: '제3자 제공 안내: 제공받는 자는 지역 복지센터, 제공 항목은 성명과 연락처, 보유 기간은 제공 목적 달성 시까지입니다.' },
      { ref: r('n', 3), kind: 'info', formRef: form, semanticKey: form + '|notice|period', text: '신청 기간은 2026년 9월 1일부터 9월 30일까지이며 결과는 문자로 안내됩니다.' },
      { ref: r('n', 4), kind: 'warning', formRef: null, semanticKey: '|notice|global', text: '본 서비스는 공공 데이터 기반이며 실제 지급은 각 기관의 심사 결과에 따릅니다.' },
    ],
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

/**
 * Capture mode: the runtime is pointed at a loopback dummy provider (no auth env key, no OpenAI auth) so the
 * request body can be inspected. Only body shape is recorded; headers are never read or printed.
 */
async function captureRequest(args: ReturnType<typeof parseArgs>, snapshot: PublicPageSnapshot): Promise<void> {
  const captured: unknown[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString('utf8'); });
    req.on('end', () => {
      let json: unknown = null;
      try { json = JSON.parse(body); } catch { json = { unparsed: body.length }; }
      captured.push({ method: req.method, url: req.url, body: json });
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'flecto capture endpoint: no model behind this port' } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as { port: number }).port;
  const dir = path.join(args.runtime, 'capture');
  await mkdir(dir, { recursive: true });
  const instructionsPath = path.join(dir, 'instructions.md');
  const schemaPath = path.join(dir, 'schema.json');
  const encoding = encodePlanPrompt(snapshot);
  await writeFile(instructionsPath, PLANNER_INSTRUCTIONS, 'utf8');
  await writeFile(schemaPath, JSON.stringify(buildOutputSchema(encoding)), 'utf8');
  const execArgs = buildExecArgs({ model: args.models[0], effort: args.effort, schemaPath, instructionsPath, serviceTier: args.fast ? 'fast' : null });
  const captureArgs = [
    ...execArgs.slice(0, -1),
    '-c', 'model_provider="flecto_capture"',
    '-c', 'model_providers.flecto_capture.name="flecto capture"',
    '-c', `model_providers.flecto_capture.base_url="http://127.0.0.1:${port}/v1"`,
    '-c', 'model_providers.flecto_capture.wire_api="responses"',
    '-c', 'model_providers.flecto_capture.requires_openai_auth=false',
    '-c', 'model_providers.flecto_capture.request_max_retries=0',
    '-c', 'model_providers.flecto_capture.stream_max_retries=0',
    ...args.extra,
    '-',
  ];
  const env: Record<string, string> = {};
  for (const key of ['PATH', 'HOME', 'CODEX_HOME', 'TMPDIR', 'LANG', 'LC_ALL']) if (process.env[key]) env[key] = process.env[key]!;
  const exitCode = await new Promise<number | null>((resolve) => {
    const child = spawn(args.binary, captureArgs, { cwd: dir, env, stdio: ['pipe', 'ignore', 'ignore'] });
    const timer = setTimeout(() => child.kill('SIGKILL'), 15_000);
    child.on('exit', (code) => { clearTimeout(timer); resolve(code); });
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    child.stdin.end(encoding.prompt, 'utf8');
  });
  server.close();
  await rm(dir, { recursive: true, force: true });
  for (const entry of captured as Array<{ method?: string; url?: string; body: Record<string, unknown> }>) {
    const body = entry.body ?? {};
    const input = Array.isArray(body.input) ? body.input as Array<Record<string, unknown>> : [];
    const instructions = typeof body.instructions === 'string' ? body.instructions : '';
    const messageText = (item: Record<string, unknown>) => typeof item.content === 'string' ? item.content
      : Array.isArray(item.content) && typeof (item.content[0] as { text?: unknown })?.text === 'string' ? String((item.content[0] as { text: string }).text) : '';
    const plannerDeveloperMessage = input.some((item) => item.role === 'developer' && messageText(item).trim() === PLANNER_INSTRUCTIONS.trim());
    const tools = Array.isArray(body.tools) ? body.tools as Array<Record<string, unknown>> : null;
    console.log(JSON.stringify({
      capture: true, method: entry.method, url: entry.url, exitCode, model: body.model,
      keys: Object.keys(body).sort(),
      topLevelInstructionsChars: instructions.length, plannerInstructionsAsDeveloperMessage: plannerDeveloperMessage,
      tools: tools === null ? 'ABSENT' : tools.map((t) => String(t.name ?? t.type)),
      toolChoice: body.tool_choice, parallelToolCalls: body.parallel_tool_calls,
      reasoning: body.reasoning, serviceTier: body.service_tier ?? 'ABSENT', store: body.store, include: body.include,
      textFormat: (body.text as { format?: { type?: string; strict?: boolean; name?: string } } | undefined)?.format
        ? { type: (body.text as any).format.type, strict: (body.text as any).format.strict, name: (body.text as any).format.name } : 'ABSENT',
      input: input.map((item) => ({
        type: item.type, role: item.role,
        chars: JSON.stringify(item.content ?? '').length,
        head: messageText(item).slice(0, 40),
      })),
      promptChars: encoding.prompt.length, forwardedControls: encoding.controlRefs.size, forwardedNotices: encoding.noticeRefs.size,
    }));
  }
  if (captured.length === 0) console.log(JSON.stringify({ capture: true, exitCode, requests: 0, note: 'runtime made no request to the capture endpoint' }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(args.binary)) { console.error('binary not found: ' + args.binary); process.exit(2); }
  const version = execFileSync(args.binary, ['--version'], { encoding: 'utf8' }).trim();
  const makeSnapshot = args.shape === 'large' ? largeSnapshot : syntheticSnapshot;
  console.log(JSON.stringify({ probe: 'codex-provider', binary: args.binary, version, runtime: args.runtime, effort: args.effort, serviceTier: args.fast ? 'fast' : null, shape: args.shape, disabledFeatures: DISABLED_FEATURES.length, instructionsChars: PLANNER_INSTRUCTIONS.length }));

  if (args.capture) { await captureRequest(args, makeSnapshot('capture')); return; }

  let requestSeq = 0;
  for (const model of args.models) {
    const provider = new CodexProvider({ binary: args.binary, model, runtimeDir: args.runtime, effort: args.effort, serviceTier: args.fast ? 'fast' : undefined });
    for (let attempt = 0; attempt < args.repeat; attempt += 1) {
      const snapshot = makeSnapshot('r' + (++requestSeq));
      const controller = new AbortController();
      const started = performance.now();
      try {
        const result = await provider.planDetailed(snapshot, args.budget, controller.signal);
        let verify = 'PASS';
        try { verifyPlan(result.plan, snapshot); } catch (error) { verify = 'FAIL:' + errorCode(error); }
        console.log(JSON.stringify({
          model, ok: true, mode: provider.mode, requestedEffort: result.requestedEffort, requestedServiceTier: result.requestedServiceTier, reportedModel: result.reportedModel,
          durationMs: result.durationMs, budgetMs: result.budgetMs, inputTokens: result.inputTokens, outputTokens: result.outputTokens, verifyPlan: verify,
          promptChars: result.promptChars, forwardedControls: result.forwardedControls, forwardedNotices: result.forwardedNotices,
          exitCode: result.exitCode, steps: result.plan.steps.map((s) => ({ id: s.id, template: s.template, title: s.title, controls: s.controlRefs.length, notices: s.noticeRefs.length })),
          sourceActionRef: result.plan.sourceActionRef,
        }));
      } catch (error) {
        console.log(JSON.stringify({ model, ok: false, error: errorCode(error), durationMs: Math.round(performance.now() - started), last: provider.last ? { exitCode: provider.last.exitCode } : null }));
      }
    }
  }

  if (!args.skipCancel) {
    const model = args.models[0];
    const provider = new CodexProvider({ binary: args.binary, model, runtimeDir: args.runtime, effort: args.effort });
    const before = runtimeProcessCount(args.runtime);
    const controller = new AbortController();
    const started = performance.now();
    const pending = provider.plan(makeSnapshot('cancel'), args.budget, controller.signal);
    setTimeout(() => controller.abort(), 400);
    let cancelResult: string;
    try { await pending; cancelResult = 'RESOLVED_UNEXPECTEDLY'; } catch (error) { cancelResult = errorCode(error); }
    const after = runtimeProcessCount(args.runtime);
    console.log(JSON.stringify({ check: 'cancel', model, abortAfterMs: 400, result: cancelResult, settledMs: Math.round(performance.now() - started), runtimeProcessesBefore: before, runtimeProcessesAfter: after }));

    const tiny = new CodexProvider({ binary: args.binary, model, runtimeDir: args.runtime, effort: args.effort });
    const tinyStarted = performance.now();
    let tinyResult: string;
    try { await tiny.plan(makeSnapshot('tiny'), 250, new AbortController().signal); tinyResult = 'RESOLVED_UNEXPECTEDLY'; } catch (error) { tinyResult = errorCode(error); }
    console.log(JSON.stringify({ check: 'deadline', model, budgetMs: 250, result: tinyResult, settledMs: Math.round(performance.now() - tinyStarted), runtimeProcessesAfter: runtimeProcessCount(args.runtime) }));
  }
}

main().catch((error) => { console.error('probe failed: ' + (error instanceof Error ? error.message : String(error))); process.exit(1); });
