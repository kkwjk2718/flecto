import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  FlectoError, PREPARE_DEADLINE_MS, PagePlanSchema, publicSnapshot,
  type PagePlan, type PlanProvider, type PublicPageSnapshot,
} from '@flecto/contracts';
import { PAGE_PLAN_OUTPUT_SCHEMA, PLAN_PROMPT_VERSION, buildPlanPrompt } from './prompt';

export type SpawnFn = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

export type CodexProviderOptions = {
  /** Absolute path to the pinned Codex CLI binary (selected by the operator, never resolved from PATH). */
  binary: string;
  /** Product model requested with `-m` (separate from any developer model). */
  model: string;
  /** Dedicated empty runtime directory: no AGENTS.md, no repo, no skills. Only the output schema file is written here. */
  runtimeDir: string;
  /** model_reasoning_effort forwarded to Codex. Default "low". */
  effort?: string;
  /** Grace period between SIGTERM and SIGKILL while cancelling our own child. */
  killGraceMs?: number;
  /** Unit-test seam only. Production code must leave this undefined so node:child_process.spawn is used. */
  spawnImpl?: SpawnFn;
};

export type CodexPlanResult = {
  plan: PagePlan;
  requestedModel: string;
  /** The exec JSONL stream does not echo the served model; null means "not reported by the runtime". */
  reportedModel: string | null;
  requestedEffort: string;
  budgetMs: number;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  exitCode: number | null;
};

/** Feature flags switched off on every run. Verified against `codex features list` for codex-cli 0.158.0-alpha.2.1. */
export const DISABLED_FEATURES = [
  'shell_tool', 'view_image', 'image_generation', 'browser_use', 'browser_use_external',
  'browser_use_full_cdp_access', 'computer_use', 'apps', 'memories', 'plugins', 'multi_agent',
  'hooks', 'sleep_tool', 'skill_search', 'skill_mcp_dependency_install', 'code_mode_host',
  'goals', 'tool_suggest', 'workspace_dependencies', 'worktrees', 'in_app_browser',
] as const;

/** Environment keys forwarded to the child. Auth still resolves through CODEX_HOME (defaults to HOME/.codex). */
const FORWARDED_ENV = ['PATH', 'HOME', 'CODEX_HOME', 'TMPDIR', 'LANG', 'LC_ALL'] as const;

const SCHEMA_FILE = `flecto-page-plan.${PLAN_PROMPT_VERSION}.schema.json`;

export function buildExecArgs(options: { model: string; effort: string; schemaPath: string }): string[] {
  const args = [
    'exec',
    '--ignore-user-config', '--ignore-rules', '--ephemeral', '--skip-git-repo-check',
    '--json', '--color', 'never',
    '--output-schema', options.schemaPath,
    '-m', options.model,
    '-c', `model_reasoning_effort=${JSON.stringify(options.effort)}`,
    '-c', 'agents.enabled=false',
    '-c', 'project_doc_max_bytes=0',
    '-c', 'sandbox_mode="read-only"',
    '-c', 'web_search="disabled"',
  ];
  for (const feature of DISABLED_FEATURES) args.push('--disable', feature);
  args.push('-');
  return args;
}

/**
 * LIVE_CODEX PlanProvider: one bounded `codex exec` child per plan() call, tool surface disabled,
 * strict output schema, and zod re-validation. Never falls back to a fixture.
 */
export class CodexProvider implements PlanProvider {
  readonly mode = 'LIVE_CODEX' as const;
  readonly model: string;
  readonly effort: string;
  readonly promptVersion = PLAN_PROMPT_VERSION;
  private readonly binary: string;
  private readonly runtimeDir: string;
  private readonly killGraceMs: number;
  private readonly spawnImpl: SpawnFn;
  private schemaReady: Promise<string> | null = null;
  private lastResult: CodexPlanResult | null = null;

  constructor(options: CodexProviderOptions) {
    if (!path.isAbsolute(options.binary)) throw new Error('CodexProvider: binary must be an absolute path');
    if (!path.isAbsolute(options.runtimeDir)) throw new Error('CodexProvider: runtimeDir must be an absolute path');
    if (!/^[A-Za-z0-9._-]+$/.test(options.model)) throw new Error('CodexProvider: invalid model id');
    this.binary = options.binary;
    this.model = options.model;
    this.runtimeDir = options.runtimeDir;
    this.effort = options.effort ?? 'low';
    this.killGraceMs = options.killGraceMs ?? 1000;
    this.spawnImpl = options.spawnImpl ?? nodeSpawn;
  }

  /** Metadata of the most recent completed or failed run (no prompt or model text). */
  get last(): CodexPlanResult | null { return this.lastResult; }

  async plan(snapshot: PublicPageSnapshot, remainingBudgetMs: number, signal: AbortSignal): Promise<PagePlan> {
    return (await this.planDetailed(snapshot, remainingBudgetMs, signal)).plan;
  }

  async planDetailed(snapshot: PublicPageSnapshot, remainingBudgetMs: number, signal: AbortSignal): Promise<CodexPlanResult> {
    const started = performance.now();
    if (signal.aborted) throw new FlectoError('CANCELLED');
    const budgetMs = Math.min(Math.floor(remainingBudgetMs), PREPARE_DEADLINE_MS);
    if (!Number.isFinite(budgetMs) || budgetMs <= 0) throw new FlectoError('DEADLINE_EXCEEDED');
    // Strict parse: any private/extra field on the snapshot is rejected before it can reach the prompt.
    const publicOnly = publicSnapshot(snapshot);
    const schemaPath = await this.ensureSchema();
    const prompt = buildPlanPrompt(publicOnly);

    const outcome = await this.runChild(prompt, schemaPath, budgetMs, signal);
    const durationMs = Math.round(performance.now() - started);
    const base = {
      requestedModel: this.model, reportedModel: null, requestedEffort: this.effort, budgetMs, durationMs,
      inputTokens: outcome.inputTokens, outputTokens: outcome.outputTokens, exitCode: outcome.exitCode,
    };
    if (outcome.kind === 'cancelled') throw new FlectoError('CANCELLED');
    if (outcome.kind === 'timeout') throw new FlectoError('DEADLINE_EXCEEDED');
    if (outcome.kind === 'failed' || outcome.finalMessage === null) throw new FlectoError('PROVIDER_ERROR');

    let parsed: unknown;
    try { parsed = JSON.parse(outcome.finalMessage); } catch { throw new FlectoError('SCHEMA_INVALID'); }
    const result = PagePlanSchema.safeParse(parsed);
    if (!result.success) throw new FlectoError('SCHEMA_INVALID');
    if (!refsBelongToSnapshot(result.data, publicOnly)) throw new FlectoError('SCHEMA_INVALID');
    this.lastResult = { plan: result.data, ...base };
    return this.lastResult;
  }

  private ensureSchema(): Promise<string> {
    if (!this.schemaReady) {
      const target = path.join(this.runtimeDir, SCHEMA_FILE);
      this.schemaReady = (async () => {
        await mkdir(this.runtimeDir, { recursive: true });
        await writeFile(target, JSON.stringify(PAGE_PLAN_OUTPUT_SCHEMA), 'utf8');
        return target;
      })().catch((error) => { this.schemaReady = null; throw error; });
    }
    return this.schemaReady;
  }

  private runChild(prompt: string, schemaPath: string, budgetMs: number, signal: AbortSignal): Promise<ChildOutcome> {
    const env: Record<string, string> = {};
    for (const key of FORWARDED_ENV) { const value = process.env[key]; if (value !== undefined) env[key] = value; }
    const args = buildExecArgs({ model: this.model, effort: this.effort, schemaPath });

    return new Promise<ChildOutcome>((resolve) => {
      let child: ChildProcess;
      try {
        child = this.spawnImpl(this.binary, args, { cwd: this.runtimeDir, env, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
      } catch {
        resolve({ kind: 'failed', finalMessage: null, inputTokens: null, outputTokens: null, exitCode: null });
        return;
      }
      const state: ChildOutcome = { kind: 'failed', finalMessage: null, inputTokens: null, outputTokens: null, exitCode: null };
      let settled = false;
      let turnCompleted = false;
      let stdoutBuffer = '';
      let killTimer: ReturnType<typeof setTimeout> | null = null;

      const finish = (kind: ChildOutcome['kind']) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        if (killTimer) clearTimeout(killTimer);
        signal.removeEventListener('abort', onAbort);
        resolve({ ...state, kind });
      };
      const terminate = () => {
        killTree(child, 'SIGTERM');
        killTimer = setTimeout(() => killTree(child, 'SIGKILL'), this.killGraceMs);
      };
      let stopReason: 'cancelled' | 'timeout' | null = null;
      const onAbort = () => { if (!stopReason) { stopReason = 'cancelled'; terminate(); } };
      const deadline = setTimeout(() => { if (!stopReason) { stopReason = 'timeout'; terminate(); } }, budgetMs);
      signal.addEventListener('abort', onAbort, { once: true });

      const handleLine = (line: string) => {
        if (!line.trim()) return;
        let event: JsonlEvent;
        try { event = JSON.parse(line) as JsonlEvent; } catch { return; }
        if (event.type === 'item.completed' && event.item?.type === 'agent_message' && typeof event.item.text === 'string') {
          state.finalMessage = event.item.text;
        } else if (event.type === 'turn.completed') {
          turnCompleted = true;
          state.inputTokens = numberOrNull(event.usage?.input_tokens);
          state.outputTokens = numberOrNull(event.usage?.output_tokens);
        } else if (event.type === 'turn.failed') {
          state.finalMessage = null;
        }
      };
      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => {
        stdoutBuffer += chunk;
        let index: number;
        while ((index = stdoutBuffer.indexOf('\n')) >= 0) {
          handleLine(stdoutBuffer.slice(0, index));
          stdoutBuffer = stdoutBuffer.slice(index + 1);
        }
      });
      // stderr is drained and discarded: runtime warnings must not reach product logs.
      child.stderr?.on('data', () => {});
      child.on('error', () => finish(stopReason ?? 'failed'));
      child.on('exit', (code) => {
        state.exitCode = code;
        if (stdoutBuffer) handleLine(stdoutBuffer);
        // The child has exited; only now do we report cancellation/timeout, so no orphan inference is left running.
        if (stopReason) finish(stopReason);
        else finish(code === 0 && turnCompleted && state.finalMessage !== null ? 'completed' : 'failed');
      });
      child.stdin?.on('error', () => {});
      child.stdin?.end(prompt, 'utf8');
    });
  }
}

type ChildOutcome = {
  kind: 'completed' | 'failed' | 'cancelled' | 'timeout';
  finalMessage: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  exitCode: number | null;
};
type JsonlEvent = {
  type?: string;
  item?: { type?: string; text?: string };
  usage?: { input_tokens?: unknown; output_tokens?: unknown };
};

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

/** Signals only our own child's process group (detached spawn); falls back to the child pid. */
function killTree(child: ChildProcess, sig: NodeJS.Signals): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const pid = child.pid;
  if (typeof pid === 'number' && pid > 0) {
    try { process.kill(-pid, sig); return; } catch { /* group already gone or not detached */ }
  }
  try { child.kill(sig); } catch { /* already exited */ }
}

function refsBelongToSnapshot(plan: PagePlan, snapshot: PublicPageSnapshot): boolean {
  if (plan.snapshotId !== snapshot.snapshotId) return false;
  const controls = new Set(snapshot.controls.map((c) => c.ref));
  const notices = new Set(snapshot.notices.map((n) => n.ref));
  for (const step of plan.steps) {
    if (!step.controlRefs.every((ref) => controls.has(ref))) return false;
    if (!step.noticeRefs.every((ref) => notices.has(ref))) return false;
  }
  if (plan.sourceActionRef !== null) {
    const action = snapshot.controls.find((c) => c.ref === plan.sourceActionRef);
    if (!action || action.actionKind === 'none') return false;
  }
  return true;
}

