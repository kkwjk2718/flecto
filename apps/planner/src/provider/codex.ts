import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  FlectoError, PREPARE_DEADLINE_MS, PagePlanSchema, publicSnapshot,
  type PagePlan, type PlanProvider, type PublicPageSnapshot,
} from '@flecto/contracts';
import {
  PLANNER_INSTRUCTIONS, PLAN_PROMPT_VERSION, buildOutputSchema, decodePlan, encodePlanPrompt, type PromptEncoding,
} from './prompt';

export type SpawnFn = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

export type CodexProviderOptions = {
  /** Absolute path to the pinned Codex CLI binary (selected by the operator, never resolved from PATH). */
  binary: string;
  /** Product model requested with `-m` (separate from any developer model). */
  model: string;
  /** Dedicated empty runtime directory: no AGENTS.md, no repo, no skills. Only the planner instructions and per-request schema files are written here. */
  runtimeDir: string;
  /** model_reasoning_effort forwarded to Codex. Default "low". */
  effort?: string;
  /**
   * Optional `service_tier` config of the pinned CLI. "fast" is the only value the runtime maps to priority processing
   * (captured request carries service_tier "priority"). Off by default: it draws on the account's fast-mode allowance.
   */
  serviceTier?: 'fast';
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
  requestedServiceTier: 'fast' | null;
  budgetMs: number;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  exitCode: number | null;
  /** Controls/notices forwarded to the model after form selection (not the whole snapshot). */
  forwardedControls: number;
  forwardedNotices: number;
  promptChars: number;
  /** True when a masked PNG was attached through the CLI's -i argument. */
  imageAttached: boolean;
};

/** VIS01 seam: masked PNG supplied by a trusted caller (the provider never captures images itself). */
export type PlanImageInput = { dataUrl: string; mimeType: 'image/png' };
/** Upper bound for the decoded PNG written to the runtime directory. */
export const MAX_PLAN_IMAGE_BYTES = 4 * 1024 * 1024;
const PNG_DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Decodes a PNG data URL strictly (mime, base64 alphabet, PNG signature, size bound); null when anything is off. */
export function decodePngDataUrl(image: PlanImageInput): Buffer | null {
  if (image.mimeType !== 'image/png' || typeof image.dataUrl !== 'string') return null;
  const match = PNG_DATA_URL.exec(image.dataUrl);
  if (!match || match[1].length % 4 !== 0) return null;
  const bytes = Buffer.from(match[1], 'base64');
  if (bytes.length < PNG_SIGNATURE.length + 16 || bytes.length > MAX_PLAN_IMAGE_BYTES) return null;
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return null;
  return bytes;
}

/** Feature flags switched off on every run. Verified against `codex features list` for codex-cli 0.158.0-alpha.2.1. */
export const DISABLED_FEATURES = [
  'shell_tool', 'view_image', 'image_generation', 'browser_use', 'browser_use_external',
  'browser_use_full_cdp_access', 'computer_use', 'apps', 'memories', 'plugins', 'multi_agent',
  'hooks', 'sleep_tool', 'skill_search', 'skill_mcp_dependency_install', 'code_mode_host',
  'goals', 'tool_suggest', 'workspace_dependencies', 'worktrees', 'in_app_browser',
] as const;

/** Environment keys forwarded to the child. Auth still resolves through CODEX_HOME (defaults to HOME/.codex). */
const FORWARDED_ENV = ['PATH', 'HOME', 'CODEX_HOME', 'TMPDIR', 'LANG', 'LC_ALL'] as const;

/**
 * Host skills the pinned CLI discovers even with --ignore-user-config; each is switched off through `skills.config`
 * so no <skills_instructions> block is sent. The static list is the state captured for codex-cli 0.158.0-alpha.2.1;
 * discoverSkillNames() unions it with the directories currently present under CODEX_HOME/skills.
 */
export const KNOWN_HOST_SKILLS = ['imagegen', 'openai-docs', 'plugin-creator', 'review-agent', 'skill-creator', 'skill-installer'] as const;
const SKILL_NAME = /^[A-Za-z0-9._-]+$/;

/** Directory names only (no file contents) from CODEX_HOME/skills and CODEX_HOME/skills/.system. */
export function discoverSkillNames(env: NodeJS.ProcessEnv = process.env): string[] {
  const codexHome = env.CODEX_HOME ?? (env.HOME ? path.join(env.HOME, '.codex') : null);
  const names = new Set<string>(KNOWN_HOST_SKILLS);
  if (codexHome) {
    for (const dir of [path.join(codexHome, 'skills'), path.join(codexHome, 'skills', '.system')]) {
      let entries: import('node:fs').Dirent[] = [];
      try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const entry of entries) if (entry.isDirectory() && !entry.name.startsWith('.') && SKILL_NAME.test(entry.name)) names.add(entry.name);
    }
  }
  return [...names].sort();
}

function skillsConfigToml(names: readonly string[]): string {
  return 'skills.config=[' + names.filter((n) => SKILL_NAME.test(n)).map((n) => `{name=${JSON.stringify(n)},enabled=false}`).join(',') + ']';
}

const INSTRUCTIONS_FILE = `flecto-planner.${PLAN_PROMPT_VERSION}.instructions.md`;
const schemaFileFor = (requestId: string) => `flecto-page-plan.${PLAN_PROMPT_VERSION}.${requestId}.schema.json`;

export type ExecArgOptions = {
  model: string; effort: string; schemaPath: string; instructionsPath: string;
  /** Host skill names to disable through skills.config (default: discoverSkillNames()). */
  skillNames?: readonly string[];
  serviceTier?: 'fast' | null;
  /** Absolute path of a masked PNG to attach with the CLI's verified `-i` argument. */
  imagePath?: string | null;
};

/**
 * Verified against the captured request body of codex-cli 0.158.0-alpha.2.1 (scripts/probe-codex.ts --capture):
 * the input becomes [empty additional_tools, planner instructions, user prompt]; `tools` is absent.
 */
export function buildExecArgs(options: ExecArgOptions): string[] {
  const args = [
    'exec',
  ];
  // `-i <FILE>...` is variadic: it goes first so the next flag ends the list and the trailing '-' stays the prompt marker.
  if (options.imagePath) args.push('-i', options.imagePath);
  args.push(
    '--ignore-user-config', '--ignore-rules', '--ephemeral', '--skip-git-repo-check',
    '--json', '--color', 'never',
    '--output-schema', options.schemaPath,
    '-m', options.model,
    '-c', `model_reasoning_effort=${JSON.stringify(options.effort)}`,
    // Replaces the built-in coding-agent base instructions with the planner-only text (verified config key of the pinned CLI).
    '-c', `model_instructions_file=${JSON.stringify(options.instructionsPath)}`,
    // Drops the <environment_context>, <permissions instructions>, apps and <collaboration_mode> developer/user blocks.
    '-c', 'include_environment_context=false',
    '-c', 'include_permissions_instructions=false',
    '-c', 'include_apps_instructions=false',
    '-c', 'include_collaboration_mode_instructions=false',
    '-c', skillsConfigToml(options.skillNames ?? discoverSkillNames()),
    '-c', 'agents.enabled=false',
    '-c', 'project_doc_max_bytes=0',
    '-c', 'sandbox_mode="read-only"',
    '-c', 'web_search="disabled"',
  );
  if (options.serviceTier === 'fast') args.push('-c', 'service_tier="fast"');
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
  readonly serviceTier: 'fast' | null;
  readonly promptVersion = PLAN_PROMPT_VERSION;
  private readonly binary: string;
  private readonly runtimeDir: string;
  private readonly killGraceMs: number;
  private readonly spawnImpl: SpawnFn;
  private readonly skillNames: readonly string[];
  private instructionsReady: Promise<string> | null = null;
  private lastResult: CodexPlanResult | null = null;

  constructor(options: CodexProviderOptions) {
    if (!path.isAbsolute(options.binary)) throw new Error('CodexProvider: binary must be an absolute path');
    if (!path.isAbsolute(options.runtimeDir)) throw new Error('CodexProvider: runtimeDir must be an absolute path');
    if (!/^[A-Za-z0-9._-]+$/.test(options.model)) throw new Error('CodexProvider: invalid model id');
    this.binary = options.binary;
    this.model = options.model;
    this.runtimeDir = options.runtimeDir;
    this.effort = options.effort ?? 'low';
    this.serviceTier = options.serviceTier ?? null;
    this.killGraceMs = options.killGraceMs ?? 1000;
    this.spawnImpl = options.spawnImpl ?? nodeSpawn;
    this.skillNames = discoverSkillNames();
  }

  /** Metadata of the most recent completed or failed run (no prompt or model text). */
  get last(): CodexPlanResult | null { return this.lastResult; }

  async plan(snapshot: PublicPageSnapshot, remainingBudgetMs: number, signal: AbortSignal): Promise<PagePlan> {
    return (await this.planDetailed(snapshot, remainingBudgetMs, signal)).plan;
  }

  /**
   * VIS01 seam: same run as plan(), plus one validated masked PNG attached through `-i`. The PNG is written into a
   * unique directory under runtimeDir and removed on every settlement; the write and spawn share the 10 s budget.
   * The image is structured model input only: view_image and every other tool stay disabled.
   */
  async planWithImage(snapshot: PublicPageSnapshot, remainingBudgetMs: number, signal: AbortSignal, image: PlanImageInput): Promise<PagePlan> {
    return (await this.planDetailed(snapshot, remainingBudgetMs, signal, image)).plan;
  }

  async planDetailed(snapshot: PublicPageSnapshot, remainingBudgetMs: number, signal: AbortSignal, image?: PlanImageInput): Promise<CodexPlanResult> {
    const started = performance.now();
    if (signal.aborted) throw new FlectoError('CANCELLED');
    const budgetMs = Math.min(Math.floor(remainingBudgetMs), PREPARE_DEADLINE_MS);
    if (!Number.isFinite(budgetMs) || budgetMs <= 0) throw new FlectoError('DEADLINE_EXCEEDED');
    // Strict parse: any private/extra field on the snapshot is rejected before it can reach the prompt.
    const publicOnly = publicSnapshot(snapshot);
    const imageBytes = image === undefined ? null : decodePngDataUrl(image);
    if (image !== undefined && imageBytes === null) throw new FlectoError('SCHEMA_INVALID');
    const encoding = encodePlanPrompt(publicOnly);
    const instructionsPath = await this.ensureInstructions();
    const schemaPath = await this.writeSchema(publicOnly.requestId, encoding);
    let imageDir: string | null = null;
    let imagePath: string | null = null;

    let outcome: ChildOutcome;
    try {
      if (imageBytes !== null) {
        imageDir = await mkdtemp(path.join(this.runtimeDir, 'img-'));
        imagePath = path.join(imageDir, 'masked.png');
        await writeFile(imagePath, imageBytes, { mode: 0o600 });
      }
      const elapsed = Math.round(performance.now() - started);
      if (elapsed >= budgetMs) throw new FlectoError('DEADLINE_EXCEEDED');
      outcome = await this.runChild(encoding.prompt, schemaPath, instructionsPath, budgetMs - elapsed, signal, imagePath);
    } finally {
      await unlink(schemaPath).catch(() => {});
      if (imageDir) await rm(imageDir, { recursive: true, force: true }).catch(() => {});
    }
    const durationMs = Math.round(performance.now() - started);
    const base = {
      requestedModel: this.model, reportedModel: null, requestedEffort: this.effort, requestedServiceTier: this.serviceTier, budgetMs, durationMs,
      inputTokens: outcome.inputTokens, outputTokens: outcome.outputTokens, exitCode: outcome.exitCode,
      forwardedControls: encoding.controlRefs.size, forwardedNotices: encoding.noticeRefs.size, promptChars: encoding.prompt.length,
      imageAttached: imagePath !== null,
    };
    if (outcome.kind === 'cancelled') throw new FlectoError('CANCELLED');
    if (outcome.kind === 'timeout') throw new FlectoError('DEADLINE_EXCEEDED');
    if (outcome.kind === 'failed' || outcome.finalMessage === null) throw new FlectoError('PROVIDER_ERROR');

    let parsed: unknown;
    try { parsed = JSON.parse(outcome.finalMessage); } catch { throw new FlectoError('SCHEMA_INVALID'); }
    // Aliases are restored to actual refs strictly: any unknown alias/action is SCHEMA_INVALID. Zod re-validates the result.
    const decoded = decodePlan(parsed, encoding);
    if (decoded === null) throw new FlectoError('SCHEMA_INVALID');
    const result = PagePlanSchema.safeParse(decoded);
    if (!result.success) throw new FlectoError('SCHEMA_INVALID');
    if (!refsBelongToSnapshot(result.data, publicOnly)) throw new FlectoError('SCHEMA_INVALID');
    this.lastResult = { plan: result.data, ...base };
    return this.lastResult;
  }

  private ensureInstructions(): Promise<string> {
    if (!this.instructionsReady) {
      const target = path.join(this.runtimeDir, INSTRUCTIONS_FILE);
      this.instructionsReady = (async () => {
        await mkdir(this.runtimeDir, { recursive: true });
        await writeFile(target, PLANNER_INSTRUCTIONS, 'utf8');
        return target;
      })().catch((error) => { this.instructionsReady = null; throw error; });
    }
    return this.instructionsReady;
  }

  /** Per-request strict schema: only this snapshot's aliases are valid output. Removed after the run. */
  private async writeSchema(requestId: string, encoding: PromptEncoding): Promise<string> {
    const target = path.join(this.runtimeDir, schemaFileFor(requestId));
    await writeFile(target, JSON.stringify(buildOutputSchema(encoding)), 'utf8');
    return target;
  }

  private runChild(prompt: string, schemaPath: string, instructionsPath: string, budgetMs: number, signal: AbortSignal, imagePath: string | null = null): Promise<ChildOutcome> {
    const env: Record<string, string> = {};
    for (const key of FORWARDED_ENV) { const value = process.env[key]; if (value !== undefined) env[key] = value; }
    const args = buildExecArgs({ model: this.model, effort: this.effort, schemaPath, instructionsPath, skillNames: this.skillNames, serviceTier: this.serviceTier, imagePath });

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
