import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { FlectoError, type PublicPageSnapshot } from '@flecto/contracts';
import { CodexProvider, DISABLED_FEATURES, buildExecArgs, type SpawnFn } from '../../apps/planner/src/provider/codex';
import { PAGE_PLAN_OUTPUT_SCHEMA, buildPlanPrompt } from '../../apps/planner/src/provider/prompt';

// UNIT ONLY: these tests stub child_process.spawn. They are not a LIVE_CODEX check.

const BINARY = '/opt/fake/codex';

const snapshot: PublicPageSnapshot = {
  schemaVersion: 1, requestId: 'r1', snapshotId: 's1', documentInstanceId: 'd1',
  origin: 'http://127.0.0.1:4173', goal: 'complete_form', goalRef: 'e3', semanticRevision: 0, optionRevision: 0,
  controls: [
    { ref: 'e1', kind: 'text', label: '이름', formRef: 'f1', required: true, disabled: false, semanticKey: 'name', constraints: {}, options: [], noticeRefs: [], actionKind: 'none' },
    { ref: 'e2', kind: 'checkbox', label: '동의', formRef: 'f1', required: true, disabled: false, semanticKey: 'consent', constraints: {}, options: [], noticeRefs: ['n1'], actionKind: 'none' },
    { ref: 'e3', kind: 'submit', label: '신청', formRef: 'f1', required: false, disabled: false, semanticKey: 'submit', constraints: {}, options: [], noticeRefs: [], actionKind: 'submit' },
  ],
  notices: [{ ref: 'n1', text: '약관', kind: 'terms', formRef: 'f1', semanticKey: 'terms' }],
};
const validPlan = {
  schemaVersion: 1, snapshotId: 's1', sourceActionRef: 'e3',
  steps: [
    { id: 'form', template: 'grouped_form', title: '이름 입력', controlRefs: ['e1'], noticeRefs: [] },
    { id: 'consent', template: 'consent', title: '동의', controlRefs: ['e2'], noticeRefs: ['n1'] },
    { id: 'review', template: 'final_review', title: '확인', controlRefs: ['e3'], noticeRefs: [] },
  ],
};

type Script = { events?: string[]; exitCode?: number; delayMs?: number; hangs?: boolean; ignoreSigterm?: boolean };
type Recorded = { command: string; args: string[]; options: SpawnOptions; stdin: string; signals: string[]; groupSignals: string[] };

class FakeChild extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  pid = 4242;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  killed = false;
  constructor(private readonly script: Script, private readonly record: Recorded) {
    super();
    this.stdin.on('data', (chunk: Buffer) => { record.stdin += chunk.toString('utf8'); });
    this.stdin.on('finish', () => setTimeout(() => this.play(), script.delayMs ?? 0));
  }
  private play() {
    for (const line of this.script.events ?? []) this.stdout.write(line + '\n');
    if (this.script.hangs) return;
    this.finish(this.script.exitCode ?? 0, null);
  }
  private finish(code: number | null, sig: NodeJS.Signals | null) {
    if (this.exitCode !== null || this.signalCode !== null) return;
    this.exitCode = code; this.signalCode = sig; this.stdout.end();
    this.emit('exit', code, sig);
  }
  kill(sig: NodeJS.Signals = 'SIGTERM') {
    this.record.signals.push(sig);
    if (sig === 'SIGTERM' && this.script.ignoreSigterm) return true;
    this.killed = true;
    setTimeout(() => this.finish(null, sig), 5);
    return true;
  }
}

function makeSpawn(script: Script): { spawn: SpawnFn; record: Recorded } {
  const record: Recorded = { command: '', args: [], options: {}, stdin: '', signals: [], groupSignals: [] };
  const spawn: SpawnFn = (command, args, options) => {
    record.command = command; record.args = args; record.options = options;
    return new FakeChild(script, record) as unknown as ChildProcess;
  };
  return { spawn, record };
}

const line = (event: unknown) => JSON.stringify(event);
const completedEvents = (text: string) => [
  line({ type: 'thread.started', thread_id: 't' }),
  line({ type: 'turn.started' }),
  line({ type: 'item.completed', item: { id: 'item_1', type: 'agent_message', text } }),
  line({ type: 'turn.completed', usage: { input_tokens: 700, output_tokens: 40 } }),
];

let runtimeDir: string;
let originalKill: typeof process.kill;
let groupSignals: Array<[number, string]>;
beforeEach(async () => {
  runtimeDir = await mkdtemp(path.join(os.tmpdir(), 'flecto-codex-unit-'));
  groupSignals = [];
  originalKill = process.kill;
  process.kill = ((pid: number, sig?: string | number) => {
    if (pid === -4242) { groupSignals.push([pid, String(sig)]); throw new Error('ESRCH (fake group)'); }
    return originalKill(pid, sig as NodeJS.Signals);
  }) as typeof process.kill;
});
afterEach(() => { process.kill = originalKill; });

function provider(script: Script, extra: Partial<ConstructorParameters<typeof CodexProvider>[0]> = {}) {
  const { spawn, record } = makeSpawn(script);
  const instance = new CodexProvider({ binary: BINARY, model: 'gpt-6-astra', runtimeDir, spawnImpl: spawn, killGraceMs: 30, ...extra });
  return { instance, record };
}

describe('CodexProvider (unit, spawn stubbed)', () => {
  it('reports LIVE_CODEX mode and model, and refuses relative paths or odd model ids', () => {
    const { instance } = provider({});
    expect(instance.mode).toBe('LIVE_CODEX');
    expect(instance.model).toBe('gpt-6-astra');
    expect(instance.effort).toBe('low');
    expect(() => new CodexProvider({ binary: 'codex', model: 'gpt-6-astra', runtimeDir })).toThrow();
    expect(() => new CodexProvider({ binary: BINARY, model: 'x; rm', runtimeDir })).toThrow();
  });

  it('spawns the pinned binary with tool-free exec flags, schema file and prompt on stdin only', async () => {
    const { instance, record } = provider({ events: completedEvents(JSON.stringify(validPlan)) });
    const result = await instance.planDetailed(snapshot, 10_000, new AbortController().signal);
    expect(result.plan).toEqual(validPlan);
    expect(result.inputTokens).toBe(700);
    expect(result.outputTokens).toBe(40);
    expect(result.exitCode).toBe(0);
    expect(result.budgetMs).toBe(10_000);
    expect(record.command).toBe(BINARY);
    expect(record.args.slice(0, 2)).toEqual(['exec', '--ignore-user-config']);
    for (const flag of ['--ignore-rules', '--ephemeral', '--skip-git-repo-check', '--json', '--output-schema']) expect(record.args).toContain(flag);
    expect(record.args).toContain('agents.enabled=false');
    expect(record.args).toContain('project_doc_max_bytes=0');
    expect(record.args).toContain('sandbox_mode="read-only"');
    expect(record.args).toContain('web_search="disabled"');
    for (const feature of DISABLED_FEATURES) expect(record.args.indexOf(feature)).toBeGreaterThan(0);
    expect(record.args.at(-1)).toBe('-');
    expect(record.args.join(' ')).not.toMatch(/dangerously|approval_policy|bypass/);
    expect(record.args.some((a) => a.includes('이름'))).toBe(false);
    expect(record.stdin).toBe(buildPlanPrompt(snapshot));
    expect(record.options.cwd).toBe(runtimeDir);
    expect(record.options.detached).toBe(true);
    const env = record.options.env as Record<string, string>;
    expect(Object.keys(env).every((k) => ['PATH', 'HOME', 'CODEX_HOME', 'TMPDIR', 'LANG', 'LC_ALL'].includes(k))).toBe(true);
    const files = await readdir(runtimeDir);
    expect(files).toHaveLength(1);
    const schemaPath = record.args[record.args.indexOf('--output-schema') + 1];
    expect(JSON.parse(await readFile(schemaPath, 'utf8'))).toEqual(PAGE_PLAN_OUTPUT_SCHEMA);
  });

  it('clamps the budget to 10 s and rejects exhausted budgets before spawning', async () => {
    const { instance, record } = provider({ events: completedEvents(JSON.stringify(validPlan)) });
    const result = await instance.planDetailed(snapshot, 99_000, new AbortController().signal);
    expect(result.budgetMs).toBe(10_000);
    const { instance: empty, record: emptyRecord } = provider({});
    await expect(empty.plan(snapshot, 0, new AbortController().signal)).rejects.toMatchObject({ code: 'DEADLINE_EXCEEDED' });
    expect(emptyRecord.command).toBe('');
    expect(record.command).toBe(BINARY);
  });

  it('rejects snapshots carrying private fields before any process starts', async () => {
    const { instance, record } = provider({ events: completedEvents(JSON.stringify(validPlan)) });
    const leaked = { ...snapshot, value: 'PRIVATE_SENTINEL' } as unknown as PublicPageSnapshot;
    await expect(instance.plan(leaked, 10_000, new AbortController().signal)).rejects.toBeInstanceOf(Error);
    expect(record.command).toBe('');
  });

  it('maps invalid JSON, schema violations and foreign refs to SCHEMA_INVALID, distinct from PROVIDER_ERROR', async () => {
    const cases: Array<[string, string]> = [
      ['not json', 'SCHEMA_INVALID'],
      [JSON.stringify({ ...validPlan, javascript: 'alert(1)' }), 'SCHEMA_INVALID'],
      [JSON.stringify({ ...validPlan, steps: [{ ...validPlan.steps[0], controlRefs: ['ghost'] }] }), 'SCHEMA_INVALID'],
      [JSON.stringify({ ...validPlan, snapshotId: 'other' }), 'SCHEMA_INVALID'],
      [JSON.stringify({ ...validPlan, sourceActionRef: 'e1' }), 'SCHEMA_INVALID'],
    ];
    for (const [text, code] of cases) {
      const { instance } = provider({ events: completedEvents(text) });
      await expect(instance.plan(snapshot, 10_000, new AbortController().signal)).rejects.toMatchObject({ code });
    }
    const { instance: failed } = provider({ events: [line({ type: 'turn.failed', error: { message: 'x' } })], exitCode: 1 });
    await expect(failed.plan(snapshot, 10_000, new AbortController().signal)).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
    const { instance: noTurn } = provider({ events: [], exitCode: 0 });
    await expect(noTurn.plan(snapshot, 10_000, new AbortController().signal)).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
  });

  it('never falls back to a fixture: a failed runtime surfaces as an error, not a plan', async () => {
    const { instance } = provider({ events: [], exitCode: 127 });
    await expect(instance.plan(snapshot, 10_000, new AbortController().signal)).rejects.toBeInstanceOf(FlectoError);
    expect(instance.last).toBeNull();
  });

  it('cancels only its own process group, escalates to SIGKILL, and resolves CANCELLED after exit', async () => {
    const { instance, record } = provider({ hangs: true, ignoreSigterm: true });
    const controller = new AbortController();
    const pending = instance.plan(snapshot, 10_000, controller.signal);
    setTimeout(() => controller.abort(), 20);
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(groupSignals.map(([, s]) => s)).toEqual(['SIGTERM', 'SIGKILL']);
    expect(groupSignals.every(([pid]) => pid === -4242)).toBe(true);
    expect(record.signals).toEqual(['SIGTERM', 'SIGKILL']);
  });

  it('enforces the remaining budget as a process deadline and reports DEADLINE_EXCEEDED', async () => {
    const { instance, record } = provider({ hangs: true });
    const started = performance.now();
    await expect(instance.plan(snapshot, 60, new AbortController().signal)).rejects.toMatchObject({ code: 'DEADLINE_EXCEEDED' });
    expect(performance.now() - started).toBeLessThan(1500);
    expect(record.signals[0]).toBe('SIGTERM');
  });

  it('discards a late result that arrives after cancellation', async () => {
    const { instance } = provider({ events: completedEvents(JSON.stringify(validPlan)), delayMs: 80 });
    const controller = new AbortController();
    const pending = instance.plan(snapshot, 10_000, controller.signal);
    setTimeout(() => controller.abort(), 10);
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
  });
});

describe('buildExecArgs / prompt', () => {
  it('keeps the effort override quoted as TOML and includes every disabled feature', () => {
    const args = buildExecArgs({ model: 'gpt-6-luna', effort: 'low', schemaPath: '/tmp/s.json' });
    expect(args).toContain('model_reasoning_effort="low"');
    expect(args.filter((a) => a === '--disable')).toHaveLength(DISABLED_FEATURES.length);
  });
  it('embeds only the strictly parsed public snapshot in the prompt', () => {
    const prompt = buildPlanPrompt(snapshot);
    expect(prompt).toContain('"snapshotId":"s1"');
    expect(prompt).not.toContain('PRIVATE_SENTINEL');
    expect(prompt.split('\n')[0]).toMatch(/Do not call any tool/);
  });
});

