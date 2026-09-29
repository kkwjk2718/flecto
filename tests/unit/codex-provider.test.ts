import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { FlectoError, type PublicControl, type PublicPageSnapshot } from '@flecto/contracts';
import { verifyPlan } from '@flecto/core';
import {
  CodexProvider, DISABLED_FEATURES, KNOWN_HOST_SKILLS, MAX_PLAN_IMAGE_BYTES, buildExecArgs, decodePngDataUrl, discoverSkillNames, type SpawnFn,
} from '../../apps/planner/src/provider/codex';
import {
  PAGE_PLAN_OUTPUT_SCHEMA, PLANNER_INSTRUCTIONS, buildOutputSchema, buildPlanPrompt, decodePlan, encodePlanPrompt,
} from '../../apps/planner/src/provider/prompt';

// UNIT ONLY: these tests stub child_process.spawn. They are not a LIVE_CODEX check.

const BINARY = '/opt/fake/codex';

/** > 160 chars with the critical condition at the very end: the model must see it, so no truncation is allowed. */
const CRITICAL_TAIL = '단, 만 65세 이상 신청자는 보호자 연락처를 반드시 함께 제출해야 하며 미제출 시 신청이 취소됩니다.';
const LONG_TERMS_TEXT = '개인정보 수집·이용 안내: 수집 항목은 성명, 생년월일, 연락처, 주소이며 보유 기간은 신청 처리 완료 후 1년입니다. 동의를 거부할 수 있으나 거부 시 혜택 신청이 제한됩니다. 자세한 내용은 개인정보 처리방침을 확인해 주세요. ' + CRITICAL_TAIL;

/** Minimal valid 2x2 grayscale PNG (signature + IHDR + IDAT + IEND) built in-test; no capture involved. */
function tinyPng(): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = (buf: Buffer) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.from([0, 0x80, 0x80, 0, 0x80, 0x80]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const pngDataUrl = () => 'data:image/png;base64,' + tinyPng().toString('base64');

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
/** What the model answers: aliases only, no ids, no snapshotId. */
const modelAnswer = {
  action: 'c3',
  steps: [
    { template: 'grouped_form', title: '이름 입력', controls: ['c1'], notices: [] },
    { template: 'consent', title: '동의', controls: ['c2'], notices: ['n1'] },
    { template: 'final_review', title: '확인', controls: ['c3'], notices: [] },
  ],
};
/** What the provider returns after restoring actual refs. */
const validPlan = {
  schemaVersion: 1, snapshotId: 's1', sourceActionRef: 'e3',
  steps: [
    { id: 'step_1', template: 'grouped_form', title: '이름 입력', controlRefs: ['e1'], noticeRefs: [] },
    { id: 'step_2', template: 'consent', title: '동의', controlRefs: ['e2'], noticeRefs: ['n1'] },
    { id: 'step_3', template: 'final_review', title: '확인', controlRefs: ['e3'], noticeRefs: [] },
  ],
};

/** Realistic shape: ~50-char refs, one goal form with 15 controls, two out-of-form links, form + global notices. */
function largeSnapshot(): PublicPageSnapshot {
  const doc = 'a7f3c9e1b2d4f6a8c0e2b4d6f8a1c3e5b7d9f1a3';
  const r = (prefix: string, n: number) => `${prefix}_${doc}_${n}`;
  const form = r('f', 1);
  const base = { formRef: form, disabled: false, constraints: {}, options: [], noticeRefs: [], actionKind: 'none' as const, required: true };
  const c = (n: number, kind: PublicControl['kind'], label: string, extra: Partial<PublicControl> = {}): PublicControl =>
    ({ ...base, ref: r('e', n), kind, label, semanticKey: `${form}|${kind}|${label}`, ...extra });
  const opts = (count: number, n: number) => Array.from({ length: count }, (_, i) => ({ ref: r('o', n * 100 + i), label: '선택지 ' + (i + 1), disabled: false }));
  return {
    schemaVersion: 1, requestId: 'req_' + doc, snapshotId: 'snap_' + doc, documentInstanceId: doc,
    origin: 'http://127.0.0.1:4173', goal: 'complete_form', goalRef: r('e', 15), semanticRevision: 3, optionRevision: 2,
    controls: [
      c(1, 'text', '신청인 성명'), c(2, 'date', '생년월일'), c(3, 'tel', '휴대전화 번호'), c(4, 'email', '이메일 주소', { required: false }),
      c(5, 'text', '주소'), c(6, 'text', '상세 주소', { required: false }), c(7, 'select', '거주 지역', { options: opts(17, 7) }),
      c(8, 'radio', '가구 형태', { options: opts(3, 8) }), c(9, 'number', '가구원 수'), c(10, 'select', '신청 혜택 종류', { options: opts(6, 10) }),
      c(11, 'textarea', '신청 사유', { required: false }),
      c(12, 'checkbox', '개인정보 수집·이용에 동의합니다', { noticeRefs: [r('n', 1)] }),
      c(13, 'checkbox', '제3자 제공에 동의합니다', { noticeRefs: [r('n', 2)] }),
      c(14, 'checkbox', '혜택 안내 수신에 동의합니다 (선택)', { required: false }),
      c(15, 'submit', '혜택 신청하기', { required: false, actionKind: 'submit' }),
      { ...base, formRef: null, required: false, ref: r('e', 16), kind: 'link', label: '홈으로', semanticKey: '|link|홈으로', actionKind: 'navigate' },
      { ...base, formRef: null, required: false, ref: r('e', 17), kind: 'link', label: '고객센터', semanticKey: '|link|고객센터', actionKind: 'navigate' },
    ],
    notices: [
      { ref: r('n', 1), kind: 'terms', formRef: form, semanticKey: form + '|notice|privacy', text: LONG_TERMS_TEXT },
      { ref: r('n', 2), kind: 'terms', formRef: form, semanticKey: form + '|notice|third', text: '제3자 제공 안내' },
      { ref: r('n', 3), kind: 'info', formRef: form, semanticKey: form + '|notice|period', text: '신청 기간 안내' },
      { ref: r('n', 4), kind: 'warning', formRef: null, semanticKey: '|notice|global', text: '전역 안내' },
      { ref: r('n', 5), kind: 'info', formRef: r('f', 2), semanticKey: r('f', 2) + '|notice|other', text: '다른 폼 안내' },
    ],
  };
}

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

function makeSpawn(script: Script, onSpawn?: (record: Recorded) => void): { spawn: SpawnFn; record: Recorded } {
  const record: Recorded = { command: '', args: [], options: {}, stdin: '', signals: [], groupSignals: [] };
  const spawn: SpawnFn = (command, args, options) => {
    record.command = command; record.args = args; record.options = options;
    onSpawn?.(record);
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

function provider(script: Script, extra: Partial<ConstructorParameters<typeof CodexProvider>[0]> = {}, onSpawn?: (record: Recorded) => void) {
  const { spawn, record } = makeSpawn(script, onSpawn);
  const instance = new CodexProvider({ binary: BINARY, model: 'gpt-6-astra', runtimeDir, spawnImpl: spawn, killGraceMs: 30, ...extra });
  return { instance, record };
}

describe('CodexProvider (unit, spawn stubbed)', () => {
  it('reports LIVE_CODEX mode and model, and refuses relative paths or odd model ids', () => {
    const { instance } = provider({});
    expect(instance.mode).toBe('LIVE_CODEX');
    expect(instance.model).toBe('gpt-6-astra');
    expect(instance.effort).toBe('low');
    expect(instance.serviceTier).toBeNull();
    expect(() => new CodexProvider({ binary: 'codex', model: 'gpt-6-astra', runtimeDir })).toThrow();
    expect(() => new CodexProvider({ binary: BINARY, model: 'x; rm', runtimeDir })).toThrow();
  });

  it('spawns the pinned binary with tool-free exec flags, planner instructions, per-request schema and prompt on stdin only', async () => {
    let filesDuringRun: string[] = [];
    let schemaDuringRun: unknown = null;
    const { instance, record } = provider({ events: completedEvents(JSON.stringify(modelAnswer)) }, {}, (rec) => {
      // Captured synchronously at spawn time: the per-request schema must exist while the child runs.
      const schemaPath = rec.args[rec.args.indexOf('--output-schema') + 1];
      filesDuringRun = require('node:fs').readdirSync(runtimeDir) as string[];
      schemaDuringRun = JSON.parse(require('node:fs').readFileSync(schemaPath, 'utf8'));
    });
    const result = await instance.planDetailed(snapshot, 10_000, new AbortController().signal);
    expect(result.plan).toEqual(validPlan);
    expect(result.inputTokens).toBe(700);
    expect(result.imageAttached).toBe(false);
    expect(record.args).not.toContain('-i');
    expect(result.outputTokens).toBe(40);
    expect(result.exitCode).toBe(0);
    expect(result.budgetMs).toBe(10_000);
    expect(result.forwardedControls).toBe(3);
    expect(result.forwardedNotices).toBe(1);
    expect(result.requestedServiceTier).toBeNull();
    expect(record.command).toBe(BINARY);
    expect(record.args.slice(0, 2)).toEqual(['exec', '--ignore-user-config']);
    for (const flag of ['--ignore-rules', '--ephemeral', '--skip-git-repo-check', '--json', '--output-schema']) expect(record.args).toContain(flag);
    expect(record.args).toContain('agents.enabled=false');
    expect(record.args).toContain('project_doc_max_bytes=0');
    expect(record.args).toContain('sandbox_mode="read-only"');
    expect(record.args).toContain('web_search="disabled"');
    expect(record.args).toContain('include_environment_context=false');
    expect(record.args).toContain('include_permissions_instructions=false');
    expect(record.args).toContain('include_apps_instructions=false');
    expect(record.args).toContain('include_collaboration_mode_instructions=false');
    expect(record.args.some((a) => a.startsWith('skills.config=[') && a.includes('{name="imagegen",enabled=false}'))).toBe(true);
    expect(record.args.some((a) => a.startsWith('service_tier='))).toBe(false);
    for (const feature of DISABLED_FEATURES) expect(record.args.indexOf(feature)).toBeGreaterThan(0);
    expect(record.args.at(-1)).toBe('-');
    expect(record.args.join(' ')).not.toMatch(/dangerously|approval_policy|bypass|--enable|-i /);
    expect(record.args.some((a) => a.includes('이름'))).toBe(false);
    expect(record.stdin).toBe(buildPlanPrompt(snapshot));
    expect(record.options.cwd).toBe(runtimeDir);
    expect(record.options.detached).toBe(true);
    const env = record.options.env as Record<string, string>;
    expect(Object.keys(env).every((k) => ['PATH', 'HOME', 'CODEX_HOME', 'TMPDIR', 'LANG', 'LC_ALL'].includes(k))).toBe(true);
    // Instructions file is passed through model_instructions_file and holds exactly the planner text.
    const instructionsArg = record.args.find((a) => a.startsWith('model_instructions_file='))!;
    const instructionsPath = JSON.parse(instructionsArg.slice('model_instructions_file='.length)) as string;
    expect(path.dirname(instructionsPath)).toBe(runtimeDir);
    expect(await readFile(instructionsPath, 'utf8')).toBe(PLANNER_INSTRUCTIONS);
    expect(filesDuringRun).toHaveLength(2);
    expect(schemaDuringRun).toEqual(buildOutputSchema(encodePlanPrompt(snapshot)));
    // The per-request schema is removed once the run settles; only the instructions file remains.
    expect(await readdir(runtimeDir)).toEqual([path.basename(instructionsPath)]);
  });

  it('planWithImage writes only the validated PNG into a unique runtime dir, passes it with -i first, and removes it on settlement', async () => {
    let imageArg: string | null = null;
    let bytesAtSpawn: Buffer | null = null;
    let dirsAtSpawn: string[] = [];
    const { instance, record } = provider({ events: completedEvents(JSON.stringify(modelAnswer)) }, {}, (rec) => {
      const index = rec.args.indexOf('-i');
      imageArg = index >= 0 ? rec.args[index + 1] : null;
      if (imageArg) bytesAtSpawn = readFileSync(imageArg);
      dirsAtSpawn = readdirSync(runtimeDir).filter((name) => name.startsWith('img-'));
    });
    const plan = await instance.planWithImage(snapshot, 10_000, new AbortController().signal, { dataUrl: pngDataUrl(), mimeType: 'image/png' });
    expect(plan).toEqual(validPlan);
    expect(instance.last?.imageAttached).toBe(true);
    expect(record.args.slice(0, 3)).toEqual(['exec', '-i', imageArg]);
    expect(record.args[3]).toBe('--ignore-user-config');
    expect(record.args.at(-1)).toBe('-');
    expect(path.dirname(path.dirname(imageArg!))).toBe(runtimeDir);
    expect(path.basename(imageArg!)).toBe('masked.png');
    expect(bytesAtSpawn!.equals(tinyPng())).toBe(true);
    expect(dirsAtSpawn).toHaveLength(1);
    expect(existsSync(imageArg!)).toBe(false);
    expect((await readdir(runtimeDir)).filter((name) => name.startsWith('img-'))).toHaveLength(0);
    expect(record.args).toContain('view_image');
    expect(record.args.join(' ')).not.toMatch(/--enable/);
    expect(record.stdin).toBe(buildPlanPrompt(snapshot));
  });

  it('planWithImage rejects anything that is not a bounded PNG data URL before spawning, and cleans up on failure', async () => {
    const bad: Array<Parameters<CodexProvider['planWithImage']>[3]> = [
      { dataUrl: 'data:image/jpeg;base64,' + tinyPng().toString('base64'), mimeType: 'image/png' },
      { dataUrl: pngDataUrl(), mimeType: 'image/jpeg' as 'image/png' },
      { dataUrl: 'data:image/png;base64,' + Buffer.from('GIF89a not a png at all, really not').toString('base64'), mimeType: 'image/png' },
      { dataUrl: 'data:image/png;base64,###', mimeType: 'image/png' },
      { dataUrl: '/tmp/masked.png', mimeType: 'image/png' },
      { dataUrl: 'data:image/png;base64,' + Buffer.concat([tinyPng(), Buffer.alloc(MAX_PLAN_IMAGE_BYTES)]).toString('base64'), mimeType: 'image/png' },
    ];
    for (const image of bad) {
      const { instance, record } = provider({ events: completedEvents(JSON.stringify(modelAnswer)) });
      await expect(instance.planWithImage(snapshot, 10_000, new AbortController().signal, image)).rejects.toMatchObject({ code: 'SCHEMA_INVALID' });
      expect(record.command).toBe('');
    }
    expect(decodePngDataUrl({ dataUrl: pngDataUrl(), mimeType: 'image/png' })?.equals(tinyPng())).toBe(true);
    const { instance: failing } = provider({ events: [], exitCode: 1 });
    await expect(failing.planWithImage(snapshot, 10_000, new AbortController().signal, { dataUrl: pngDataUrl(), mimeType: 'image/png' })).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
    expect((await readdir(runtimeDir)).filter((name) => name.startsWith('img-') || name.endsWith('.schema.json'))).toHaveLength(0);
    const { instance: cancelled } = provider({ hangs: true });
    const controller = new AbortController();
    const pending = cancelled.planWithImage(snapshot, 10_000, controller.signal, { dataUrl: pngDataUrl(), mimeType: 'image/png' });
    setTimeout(() => controller.abort(), 20);
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
    expect((await readdir(runtimeDir)).filter((name) => name.startsWith('img-'))).toHaveLength(0);
  });

  it('adds service_tier="fast" only when requested', async () => {
    const { instance, record } = provider({ events: completedEvents(JSON.stringify(modelAnswer)) }, { serviceTier: 'fast' });
    const result = await instance.planDetailed(snapshot, 10_000, new AbortController().signal);
    expect(result.requestedServiceTier).toBe('fast');
    expect(record.args).toContain('service_tier="fast"');
  });

  it('clamps the budget to 10 s and rejects exhausted budgets before spawning', async () => {
    const { instance, record } = provider({ events: completedEvents(JSON.stringify(modelAnswer)) });
    const result = await instance.planDetailed(snapshot, 99_000, new AbortController().signal);
    expect(result.budgetMs).toBe(10_000);
    const { instance: empty, record: emptyRecord } = provider({});
    await expect(empty.plan(snapshot, 0, new AbortController().signal)).rejects.toMatchObject({ code: 'DEADLINE_EXCEEDED' });
    expect(emptyRecord.command).toBe('');
    expect(record.command).toBe(BINARY);
  });

  it('rejects snapshots carrying private fields before any process starts', async () => {
    const { instance, record } = provider({ events: completedEvents(JSON.stringify(modelAnswer)) });
    const leaked = { ...snapshot, value: 'PRIVATE_SENTINEL' } as unknown as PublicPageSnapshot;
    await expect(instance.plan(leaked, 10_000, new AbortController().signal)).rejects.toBeInstanceOf(Error);
    expect(record.command).toBe('');
  });

  it('maps invalid JSON, schema violations, unknown aliases and wrong actions to SCHEMA_INVALID, distinct from PROVIDER_ERROR', async () => {
    const cases: Array<[string, string]> = [
      ['not json', 'SCHEMA_INVALID'],
      [JSON.stringify({ ...modelAnswer, javascript: 'alert(1)' }), 'SCHEMA_INVALID'],
      [JSON.stringify({ ...modelAnswer, steps: [{ ...modelAnswer.steps[0], controls: ['ghost'] }] }), 'SCHEMA_INVALID'],
      [JSON.stringify({ ...modelAnswer, steps: [{ ...modelAnswer.steps[0], controls: ['e1'] }] }), 'SCHEMA_INVALID'],
      [JSON.stringify({ ...modelAnswer, steps: [{ ...modelAnswer.steps[0], notices: ['c1'] }] }), 'SCHEMA_INVALID'],
      [JSON.stringify({ ...modelAnswer, action: 'c1' }), 'SCHEMA_INVALID'],
      [JSON.stringify({ ...modelAnswer, action: null }), 'SCHEMA_INVALID'],
      [JSON.stringify({ ...modelAnswer, steps: [{ ...modelAnswer.steps[0], template: 'wizard' }] }), 'SCHEMA_INVALID'],
      [JSON.stringify({ ...modelAnswer, steps: [] }), 'SCHEMA_INVALID'],
      [JSON.stringify({ ...modelAnswer, steps: [{ ...modelAnswer.steps[0], controls: ['c1', 'c1'] }] }), 'SCHEMA_INVALID'],
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
    expect(await readdir(runtimeDir)).toHaveLength(1);
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
    const { instance } = provider({ events: completedEvents(JSON.stringify(modelAnswer)), delayMs: 80 });
    const controller = new AbortController();
    const pending = instance.plan(snapshot, 10_000, controller.signal);
    setTimeout(() => controller.abort(), 10);
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
  });

  it('restores long actual refs from aliases on a realistic snapshot and the result passes verifyPlan', async () => {
    const large = largeSnapshot();
    const encoding = encodePlanPrompt(large);
    const answer = {
      action: 'c15',
      steps: [
        { template: 'grouped_form', title: '이름과 생년월일', controls: ['c1', 'c2'], notices: [] },
        { template: 'grouped_form', title: '연락처', controls: ['c3', 'c4'], notices: ['n3'] },
        { template: 'grouped_form', title: '주소', controls: ['c5', 'c6'], notices: [] },
        { template: 'item_selection', title: '지역과 가구', controls: ['c7', 'c8', 'c9'], notices: [] },
        { template: 'item_selection', title: '혜택 선택', controls: ['c10'], notices: ['n4'] },
        { template: 'grouped_form', title: '신청 사유', controls: ['c11'], notices: [] },
        { template: 'consent', title: '동의', controls: ['c12', 'c13', 'c14'], notices: ['n1', 'n2'] },
        { template: 'final_review', title: '확인 후 신청', controls: ['c15'], notices: [] },
      ],
    };
    const { instance } = provider({ events: completedEvents(JSON.stringify(answer)) });
    const result = await instance.planDetailed(large, 10_000, new AbortController().signal);
    expect(result.plan.sourceActionRef).toBe(large.goalRef);
    expect(result.plan.snapshotId).toBe(large.snapshotId);
    const refs = result.plan.steps.flatMap((s) => s.controlRefs);
    expect(refs).toHaveLength(15);
    expect(refs.every((r) => r.length > 40 && large.controls.some((c) => c.ref === r))).toBe(true);
    expect(result.plan.steps.map((s) => s.id)).toEqual(answer.steps.map((_, i) => 'step_' + (i + 1)));
    expect(() => verifyPlan(result.plan, large)).not.toThrow();
    expect(encoding.controlRefs.size).toBe(15);
    expect(encoding.noticeRefs.size).toBe(4);
  });
});

describe('encodePlanPrompt / buildOutputSchema / decodePlan', () => {
  it('excludes auxiliary navigation from an already selected form and restricts its templates', () => {
    const selected = { ...snapshot, goalRef: 'e3', controls: [...snapshot.controls,
      { ...snapshot.controls[2], ref: 'help', kind: 'button' as const, label: '강좌 안내 보기', semanticKey: 'help', actionKind: 'navigate' as const },
      { ...snapshot.controls[2], ref: 'later', kind: 'link' as const, label: '나중에 신청', semanticKey: 'later', actionKind: 'navigate' as const },
    ] };
    const encoded = encodePlanPrompt(selected);
    expect([...encoded.controlRefs.values()]).toEqual(['e1', 'e2', 'e3']);
    expect(encoded.prompt).not.toMatch(/강좌 안내 보기|나중에 신청/);
    const schema = buildOutputSchema(encoded) as any;
    expect(schema.properties.steps.items.properties.template.enum).toEqual(['grouped_form', 'item_selection', 'consent', 'final_review']);
  });
  it('forwards only the goal form plus global notices, with short aliases and no semantic keys, refs or option refs', () => {
    const large = largeSnapshot();
    const encoding = encodePlanPrompt(large);
    expect(encoding.scopeFormRef).toBe(large.controls[0].formRef);
    expect(encoding.fixedAction).toBe('c15');
    expect(encoding.actionAliases).toEqual(['c15']);
    expect([...encoding.controlRefs.keys()]).toEqual(Array.from({ length: 15 }, (_, i) => 'c' + (i + 1)));
    expect([...encoding.noticeRefs.values()]).toEqual(large.notices.slice(0, 4).map((n) => n.ref));
    const { prompt } = encoding;
    expect(prompt.length).toBeLessThan(1300);
    expect(prompt).not.toContain('a7f3c9e1');
    expect(prompt).not.toContain('|');
    expect(prompt).not.toContain('선택지 1');
    expect(prompt).not.toContain('홈으로');
    expect(prompt).not.toContain('다른 폼 안내');
    expect(prompt).toContain('action: c15');
    expect(prompt).toContain('c7 select* 거주 지역 (17 options)');
    expect(prompt).toContain('c12 checkbox* 개인정보 수집·이용에 동의합니다 -> n1');
    expect(prompt).toContain('c4 email 이메일 주소');
    expect(prompt).toContain('n4 warning 전역 안내');
    // Regression (spec 04): a >160-char terms notice is forwarded whole, including its critical tail condition.
    expect(LONG_TERMS_TEXT.length).toBeGreaterThan(160);
    const noticeLine = prompt.split('\n').find((l) => l.startsWith('n1 '))!;
    expect(noticeLine).toBe('n1 terms ' + LONG_TERMS_TEXT);
    expect(noticeLine.endsWith(CRITICAL_TAIL)).toBe(true);
    expect(prompt).not.toContain('…');
    expect(JSON.stringify(large)).not.toContain('"c1"');
  });

  it('never truncates notice text: the model prompt carries every required/terms notice in full', () => {
    const tail = '마감 이후 접수분은 무효 처리됩니다.';
    const long = '안내 문구 '.repeat(120).trim() + ' ' + tail; // ~600 chars, well past any budget-style cut
    const notices = [
      { ref: 'n1', kind: 'terms' as const, formRef: 'f1', semanticKey: 'terms', text: long },
      { ref: 'n2', kind: 'info' as const, formRef: null, semanticKey: 'global', text: 'x'.repeat(2999) + '!' },
    ];
    const { prompt } = encodePlanPrompt({ ...snapshot, notices });
    const lines = prompt.split('\n');
    expect(lines.find((l) => l.startsWith('n1 '))).toBe('n1 terms ' + long);
    expect(lines.find((l) => l.startsWith('n2 '))).toBe('n2 info ' + 'x'.repeat(2999) + '!');
    expect(prompt.endsWith('!')).toBe(true);
    expect(prompt).toContain(tail);
  });

  it('forwards the whole page when no single submit target exists, and lists action candidates', () => {
    const two = {
      ...snapshot, goalRef: null,
      controls: [...snapshot.controls, { ...snapshot.controls[2], ref: 'e4', label: '임시 저장', semanticKey: 'draft' }],
    };
    const encoding = encodePlanPrompt(two);
    expect(encoding.scopeFormRef).toBeNull();
    expect(encoding.fixedAction).toBeNull();
    expect(encoding.actionAliases).toEqual(['c3', 'c4']);
    expect(encoding.prompt).toContain('action candidates: c3,c4');
    expect(encoding.controlRefs.size).toBe(4);
    expect(decodePlan({ action: null, steps: [{ template: 'grouped_form', title: 't', controls: ['c1'], notices: [] }] }, encoding)?.sourceActionRef).toBeNull();
  });

  it('builds a strict per-request schema whose alias enums match the encoding', () => {
    const encoding = encodePlanPrompt(snapshot);
    const schema = buildOutputSchema(encoding) as any;
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(['steps', 'action']);
    expect(schema.properties.steps.items.properties.controls.items).toEqual({ type: 'string', enum: ['c1', 'c2', 'c3'] });
    expect(schema.properties.steps.items.properties.notices.items).toEqual({ type: 'string', enum: ['n1'] });
    expect(schema.properties.action).toEqual({ anyOf: [{ type: 'string', enum: ['c3'] }, { type: 'null' }] });
    expect(schema.properties.steps.items.properties.template.enum).toContain('final_review');
    const none = buildOutputSchema(encodePlanPrompt({ ...snapshot, goalRef: null, notices: [], controls: [{ ...snapshot.controls[0], noticeRefs: [] }] })) as any;
    expect(none.properties.action).toEqual({ type: 'null' });
    expect(none.properties.steps.items.properties.notices.items).toEqual({ type: 'string' });
    expect((PAGE_PLAN_OUTPUT_SCHEMA as any).properties.steps.items.properties.controls.items).toEqual({ type: 'string' });
  });

  it('decodePlan is strict: unknown aliases, cross-table aliases, wrong action and shape errors return null', () => {
    const encoding = encodePlanPrompt(snapshot);
    const ok = decodePlan(modelAnswer, encoding);
    expect(ok).toEqual(validPlan);
    expect(decodePlan({ ...modelAnswer, steps: [{ ...modelAnswer.steps[0], controls: ['c9'] }] }, encoding)).toBeNull();
    expect(decodePlan({ ...modelAnswer, steps: [{ ...modelAnswer.steps[0], controls: ['n1'] }] }, encoding)).toBeNull();
    expect(decodePlan({ ...modelAnswer, steps: [{ ...modelAnswer.steps[0], controls: 'c1' }] }, encoding)).toBeNull();
    expect(decodePlan({ ...modelAnswer, action: 'c2' }, encoding)).toBeNull();
    expect(decodePlan({ ...modelAnswer, action: 'e3' }, encoding)).toBeNull();
    expect(decodePlan({ steps: modelAnswer.steps }, encoding)).toBeNull();
    expect(decodePlan(null, encoding)).toBeNull();
    expect(decodePlan([], encoding)).toBeNull();
    expect(decodePlan({ ...modelAnswer, steps: [{ ...modelAnswer.steps[0], title: '' }] }, encoding)).toBeNull();
  });
});

describe('buildExecArgs / instructions', () => {
  it('keeps the effort override quoted as TOML, includes every disabled feature and the verified instruction-trimming keys', () => {
    const args = buildExecArgs({ model: 'gpt-6-luna', effort: 'low', schemaPath: '/tmp/s.json', instructionsPath: '/tmp/i.md', skillNames: ['a', 'b'] });
    expect(args).toContain('model_reasoning_effort="low"');
    expect(args).toContain('model_instructions_file="/tmp/i.md"');
    expect(args).toContain('skills.config=[{name="a",enabled=false},{name="b",enabled=false}]');
    expect(args.filter((a) => a === '--disable')).toHaveLength(DISABLED_FEATURES.length);
    expect(args.filter((a) => a === '--enable')).toHaveLength(0);
    expect(buildExecArgs({ model: 'gpt-6-luna', effort: 'low', schemaPath: '/tmp/s.json', instructionsPath: '/tmp/i.md', skillNames: [], serviceTier: 'fast' })).toContain('service_tier="fast"');
  });
  it('discovers host skill names as directory names only and always keeps the known list', () => {
    const names = discoverSkillNames({ HOME: '/nonexistent-home-for-test' });
    expect(names).toEqual([...KNOWN_HOST_SKILLS].sort());
    const withHome = discoverSkillNames();
    for (const known of KNOWN_HOST_SKILLS) expect(withHome).toContain(known);
    expect(withHome.every((n) => /^[A-Za-z0-9._-]+$/.test(n))).toBe(true);
  });
  it('planner instructions are page-independent, tool-free and small', () => {
    expect(PLANNER_INSTRUCTIONS.length).toBeLessThan(2000);
    expect(PLANNER_INSTRUCTIONS).toMatch(/Never call a tool/);
    expect(PLANNER_INSTRUCTIONS).not.toContain('PRIVATE_SENTINEL');
    const prompt = buildPlanPrompt(snapshot);
    expect(prompt).not.toContain('PRIVATE_SENTINEL');
    expect(prompt.split('\n')[0]).toBe('goal: complete_form');
  });
});
