import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestCase } from 'vitest/node';
import { inspectBuild } from './ops/build-check';
import { canonicalJson, isInside, REPO_ROOT, sha256 } from './ops/common';
import { EVIDENCE_SCHEMA, gradeEvidence, KINDS, PRODUCT_GRADES, REQUIRED_IDS, type ProductGrade, type Status } from './ops/evidence';
import { denyReason, secretFindings } from './ops/policy';

export const RUN_SCHEMA = 'flecto.qa-run.v1';
export const MAP_SCHEMA = 'flecto.qa-map.v1';
type Runner = 'vitest' | 'playwright';
export type Artifact = { extensionBuildSha256: string; runtimeBuildSha256: string; runtimeInputSha256: string };
type Invocation = { args: string[]; nodeVersion: string; runnerVersion: string; publicEnvironment: Record<string, string | null> };
const PUBLIC_ENV = ['FLECTO_HEADED', 'FLECTO_CAPTURE', 'FLECTO_MODEL', 'FLECTO_PROVIDER', 'FLECTO_FAULT_DELAY_MS', 'FLECTO_FAULT_PROVIDER_ERROR'];
export type RunReceipt = {
  schema: typeof RUN_SCHEMA; id: string; runner: Runner; artifact: Artifact;
  startedAt: string; finishedAt: string; exitCode: number; unchanged: boolean;
  reportPath: string; reportSha256: string | null;
  invocation: Invocation; runInputsSha256: string;
};
export type AssertionMapping = {
  requirement: string; run: string; file: string; sourceSha256: string;
  titlePath: string[]; assertion: string; project?: string; step?: string; instances?: number;
};
export type GateMapping = { kind: typeof KINDS[number]; coverage: 'complete' | 'partial'; requirements: string[]; assertions: AssertionMapping[]; requestedModel?: string };
export type QaMapping = { schema: typeof MAP_SCHEMA; gateFile: string; gateSha256: string; checks: Record<string, GateMapping> };
type Case = { file: string; titlePath: string[]; project?: string; status: Status; steps: Map<string, Status>; attachments?: Map<string, unknown[]> };
type ParsedReport = { cases: Case[]; failed: boolean };
const obj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const list = (v: unknown): any[] => Array.isArray(v) ? v : [];
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const hex = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);

/** Vitest JSON omits retries. This reporter adds actual runner diagnostics before JSON serialization. */
export default class QaDiagnosticsReporter {
  onTestCaseResult(test: TestCase): void {
    const diagnostic = test.diagnostic();
    Object.assign(test.meta(), { flecto: { retryCount: diagnostic?.retryCount ?? 0, repeatCount: diagnostic?.repeatCount ?? 0, expectedFailure: test.options.fails === true } });
  }
}

function reportFile(root: string, path: string, base = root): string {
  const full = realpathSync(resolve(base, path));
  const rootReal = realpathSync(root);
  if (!isInside(rootReal, full)) throw new Error('report test source is outside checkout');
  return relative(rootReal, full).split('\\').join('/');
}

export function parseVitest(root: string, report: unknown): ParsedReport {
  if (!obj(report) || !Array.isArray(report.testResults) || typeof report.success !== 'boolean') throw new Error('invalid Vitest JSON report');
  const cases: Case[] = [];
  for (const suite of report.testResults) {
    if (!obj(suite) || typeof suite.name !== 'string' || !Array.isArray(suite.assertionResults)) throw new Error('invalid Vitest suite');
    for (const test of suite.assertionResults) {
      if (!obj(test) || typeof test.title !== 'string' || !strings(test.ancestorTitles)) throw new Error('invalid Vitest test');
      const meta = obj(test.meta) && obj(test.meta.flecto) ? test.meta.flecto : null;
      let status: Status = test.status === 'failed' ? 'FAIL' : ['skipped', 'todo', 'pending'].includes(test.status) ? 'SKIP' : 'NOT_RUN';
      if (test.status === 'passed' && meta && Number.isInteger(meta.retryCount) && meta.retryCount >= 0 && Number.isInteger(meta.repeatCount) && meta.repeatCount >= 0 && typeof meta.expectedFailure === 'boolean') {
        status = meta.retryCount > 0 || meta.repeatCount > 0 ? 'FLAKY' : meta.expectedFailure ? 'NOT_RUN' : 'PASS';
      }
      if ((list(test.failureMessages).length && status !== 'FLAKY') || (suite.status === 'failed' && status === 'PASS')) status = 'FAIL';
      cases.push({ file: reportFile(root, suite.name), titlePath: [...test.ancestorTitles, test.title], status, steps: new Map() });
    }
  }
  return { cases, failed: !report.success || report.numFailedTests > 0 || report.numFailedTestSuites > 0 || cases.some((c) => c.status === 'FAIL') };
}

export function parsePlaywright(root: string, report: unknown): ParsedReport {
  if (!obj(report) || !Array.isArray(report.suites) || !obj(report.config) || typeof report.config.rootDir !== 'string' || !obj(report.stats)) throw new Error('invalid Playwright JSON report');
  const cases: Case[] = [];
  const walk = (suites: unknown[], parents: string[] = [], top = true): void => {
    for (const suite of suites) {
      if (!obj(suite) || typeof suite.title !== 'string') throw new Error('invalid Playwright suite');
      const titles = top ? parents : [...parents, suite.title];
      for (const spec of list(suite.specs)) {
        if (!obj(spec) || typeof spec.file !== 'string' || typeof spec.title !== 'string') throw new Error('invalid Playwright spec');
        for (const test of list(spec.tests)) {
          const results = list(test.results);
          const last = results.at(-1);
          let status: Status = 'NOT_RUN';
          if (results.some((r) => ['failed', 'timedOut', 'interrupted'].includes(r.status))) status = last?.status === 'passed' ? 'FLAKY' : 'FAIL';
          else if (results.length > 1 || results.some((r) => r.retry > 0) || test.status === 'flaky') status = 'FLAKY';
          else if (last?.status === 'skipped') status = 'SKIP';
          else if (last?.status === 'passed' && test.expectedStatus === 'passed' && test.status === 'expected' && report.config.forbidOnly === true) status = 'PASS';
          const steps = new Map<string, Status>();
          const visit = (items: unknown[], parent: string[] = [], failed = false): void => {
            for (const step of items) {
              if (!obj(step) || typeof step.title !== 'string') continue;
              const path = [...parent, step.title]; const bad = failed || !!step.error;
              const key = path.join(' > ');
              steps.set(key, steps.has(key) ? 'NOT_RUN' : bad ? 'FAIL' : 'PASS');
              visit(list(step.steps), path, bad);
            }
          };
          visit(list(last?.steps));
          const attachments = new Map<string, unknown[]>();
          for (const attachment of list(last?.attachments)) {
            if (!obj(attachment) || !['artifact', 'live-source-evidence'].includes(attachment.name) || attachment.contentType !== 'application/json' || typeof attachment.body !== 'string') continue;
            try {
              const decoded = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'));
              attachments.set(attachment.name, [...(attachments.get(attachment.name) ?? []), decoded]);
            } catch { /* malformed attachments never substantiate a PASS */ }
          }
          cases.push({ file: reportFile(root, spec.file, report.config.rootDir), titlePath: [...titles, spec.title], project: test.projectName ?? '', status, steps, attachments });
        }
      }
      walk(list(suite.suites), titles, false);
    }
  };
  walk(report.suites);
  return { cases, failed: list(report.errors).length > 0 || report.stats.unexpected > 0 || cases.some((c) => c.status === 'FAIL') };
}

export async function readVerifiedArtifact(root: string): Promise<Artifact> {
  const build = await inspectBuild(root);
  if (!build.extension.ok || !build.culture.ok || !build.runtime.ok) throw new Error('verified extension/culture/runtime build required before QA');
  return { extensionBuildSha256: build.extension.buildSha256!, runtimeBuildSha256: build.runtime.manifest!.runtimeBuildSha256, runtimeInputSha256: build.runtime.manifest!.runtimeInputSha256 };
}

function liveProof(test: Case, current: Artifact, requestedModel: string | undefined): { site: 'benefits' | 'culture'; cold: boolean; proofSha256: string } | null {
  const proofs = test.attachments?.get('live-source-evidence') ?? [];
  const bindings = test.attachments?.get('artifact') ?? [];
  if (proofs.length !== 1 || !obj(proofs[0]) || !requestedModel) return null;
  const proof = proofs[0];
  const binding = obj(proof.artifact) ? proof.artifact : bindings.length === 1 && obj(bindings[0]) ? bindings[0] : null;
  if (!binding || Object.entries(current).some(([key, value]) => binding[key] !== value) || proof.requestedModel !== requestedModel) return null;
  if (proof.reportedModel !== undefined && proof.reportedModel !== requestedModel) return null;
  const timings = Array.isArray(proof.timings) ? proof.timings : [proof.timings];
  if (!timings.length || timings.some((t) => !obj(t) || t.mode !== 'LIVE_CODEX' || !Number.isFinite(t.controlsReadyMs) || t.controlsReadyMs < 0)) return null;
  const site = proof.site ?? timings[0]?.source;
  if (!['benefits', 'culture'].includes(site) || timings.some((t) => t.source !== site) || !obj(proof.outcome) || proof.outcome.sourceDatabaseCount !== 1 || (site === 'benefits' && proof.outcome.insertionCount !== 1)) return null;
  const cache = proof.cache;
  const cold = obj(cache) && Number.isInteger(cache.providerCalls) && cache.providerCalls > 0 && Number.isInteger(cache.misses) && cache.misses > 0 && cache.exactHits === 0 && cache.compatibleHits === 0;
  return { site, cold, proofSha256: sha256(canonicalJson(proof)) };
}

async function safeSource(root: string, file: string): Promise<Buffer> {
  if (isAbsolute(file) || denyReason(file)) throw new Error('unsafe mapping source path');
  let at = root;
  for (const part of file.split('/')) {
    at = resolve(at, part);
    if ((await lstat(at)).isSymbolicLink()) throw new Error('mapping source symlink refused');
  }
  return readFile(at);
}

/** No ID extraction from titles: a reviewed, source-bound assertion map is required for every PASS. */
export async function emitEvidence(root: string, receiptPaths: string[], mapping?: QaMapping, claimedGrade: ProductGrade = 'UNVERIFIED') {
  const current = await readVerifiedArtifact(root);
  const runs = new Map<string, { receipt: RunReceipt; parsed: ParsedReport }>();
  const provenance: Array<{ id: string; runner: Runner; receiptSha256: string; reportSha256: string | null; runInputsSha256: string; invocation: Invocation }> = [];
  let exitCode = 0;
  const times: number[] = [];
  for (const path of receiptPaths) {
    const raw = await readFile(path);
    const receipt: RunReceipt = JSON.parse(raw.toString('utf8'));
    if (!obj(receipt) || receipt.schema !== RUN_SCHEMA || !['vitest', 'playwright'].includes(receipt.runner) || typeof receipt.id !== 'string' || !Number.isInteger(receipt.exitCode) || !Number.isFinite(Date.parse(receipt.startedAt)) || !Number.isFinite(Date.parse(receipt.finishedAt)) || Date.parse(receipt.finishedAt) < Date.parse(receipt.startedAt)) throw new Error('invalid QA run receipt');
    if (runs.has(receipt.id)) throw new Error('duplicate QA run id');
    if (!receipt.unchanged || canonicalJson(receipt.artifact) !== canonicalJson(current)) throw new Error('stale or changed runtime: QA receipt cannot be rebound to current build');
    if (!obj(receipt.invocation) || !strings(receipt.invocation.args) || !hex(receipt.runInputsSha256) || receipt.runInputsSha256 !== sha256(canonicalJson({ artifact: receipt.artifact, runner: receipt.runner, invocation: receipt.invocation }))) throw new Error('invalid QA invocation input binding');
    times.push(Date.parse(receipt.startedAt), Date.parse(receipt.finishedAt));
    let parsed: ParsedReport = { cases: [], failed: true };
    if (receipt.reportSha256 !== null) {
      if (!hex(receipt.reportSha256) || typeof receipt.reportPath !== 'string' || isAbsolute(receipt.reportPath) || !isInside(root, resolve(root, receipt.reportPath))) throw new Error('invalid QA report reference');
      const reportBody = await readFile(resolve(root, receipt.reportPath));
      if (sha256(reportBody) !== receipt.reportSha256) throw new Error('QA report bytes changed after run');
      const json = JSON.parse(reportBody.toString('utf8'));
      parsed = receipt.runner === 'vitest' ? parseVitest(root, json) : parsePlaywright(root, json);
    }
    if (receipt.exitCode !== 0 || parsed.failed) exitCode = 1;
    runs.set(receipt.id, { receipt, parsed });
    provenance.push({ id: receipt.id, runner: receipt.runner, receiptSha256: sha256(raw), reportSha256: receipt.reportSha256, runInputsSha256: receipt.runInputsSha256, invocation: receipt.invocation });
  }
  if (mapping) {
    if (mapping.schema !== MAP_SCHEMA || !obj(mapping.checks) || !hex(mapping.gateSha256) || typeof mapping.gateFile !== 'string') throw new Error('invalid QA mapping');
    if (sha256(await safeSource(root, mapping.gateFile)) !== mapping.gateSha256) throw new Error('gate source changed since assertion review');
    if (Object.keys(mapping.checks).some((id) => !REQUIRED_IDS.includes(id))) throw new Error('unknown acceptance ID in mapping');
  }
  const results: Record<string, { status: Status; kind?: typeof KINDS[number]; reason?: string; assertions?: unknown[] }> = {};
  const liveRuns = new Map<string, { site: 'benefits' | 'culture'; cold: boolean; proofSha256: string }>();
  for (const id of REQUIRED_IDS) {
    const gate = mapping?.checks[id];
    if (!gate) { results[id] = { status: 'NOT_RUN', reason: 'no reviewed assertion mapping' }; continue; }
    if (!KINDS.includes(gate.kind) || !['complete', 'partial'].includes(gate.coverage) || !strings(gate.requirements) || !gate.requirements.length || new Set(gate.requirements).size !== gate.requirements.length || !Array.isArray(gate.assertions) || !gate.assertions.length) throw new Error('invalid gate mapping for ' + id);
    const statuses: Status[] = [];
    const proofs: unknown[] = [];
    for (const assertion of gate.assertions) {
      if (!obj(assertion) || typeof assertion.file !== 'string' || !hex(assertion.sourceSha256) || !strings(assertion.titlePath) || !assertion.titlePath.length || typeof assertion.assertion !== 'string' || !assertion.assertion.trim() || !gate.requirements.includes(assertion.requirement)) throw new Error('invalid assertion mapping for ' + id);
      const source = await safeSource(root, assertion.file);
      if (sha256(source) !== assertion.sourceSha256 || !source.toString('utf8').includes(assertion.assertion)) throw new Error('assertion source changed or missing for ' + id);
      const run = runs.get(assertion.run);
      const matches = run?.parsed.cases.filter((c) => c.file === assertion.file && canonicalJson(c.titlePath) === canonicalJson(assertion.titlePath) && (assertion.project === undefined || c.project === assertion.project)) ?? [];
      const expectedInstances = assertion.instances ?? 1;
      if (!Number.isInteger(expectedInstances) || expectedInstances < 1) throw new Error('invalid expected assertion instances');
      // Repeated runs require an explicit expected count; every instance must pass.
      let status: Status = matches.length === expectedInstances && matches.every((c) => c.status === 'PASS') ? 'PASS' : 'NOT_RUN';
      if (matches.some((c) => c.status === 'FAIL')) status = 'FAIL';
      else if (matches.some((c) => c.status === 'FLAKY')) status = 'FLAKY';
      else if (matches.some((c) => c.status === 'SKIP')) status = 'SKIP';
      if (status === 'PASS' && assertion.step) {
        const steps = matches.map((c) => c.steps.get(assertion.step!) ?? 'NOT_RUN');
        status = steps.includes('FAIL') ? 'FAIL' : steps.every((s) => s === 'PASS') ? 'PASS' : 'NOT_RUN';
      }
      if (status === 'PASS' && gate.kind === 'LIVE_CODEX') {
        const live = matches.map((c) => liveProof(c, current, gate.requestedModel));
        if (live.some((p) => !p)) status = 'NOT_RUN';
        else for (let i = 0; i < matches.length; i++) liveRuns.set(assertion.run + ':' + run!.parsed.cases.indexOf(matches[i]!), live[i]!);
      }
      statuses.push(status);
      proofs.push({ ...assertion, status });
    }
    const covered = gate.requirements.every((requirement) => gate.assertions.some((a) => a.requirement === requirement));
    const status: Status = statuses.includes('FAIL') ? 'FAIL' : statuses.includes('FLAKY') ? 'FLAKY' : statuses.includes('SKIP') ? 'SKIP' : statuses.every((s) => s === 'PASS') && covered && gate.coverage === 'complete' ? 'PASS' : 'NOT_RUN';
    results[id] = { status, kind: gate.kind, assertions: proofs, ...(status === 'NOT_RUN' ? { reason: 'missing run/assertion or incomplete reviewed coverage' } : {}) };
  }
  const now = Date.now();
  const report = {
    schema: EVIDENCE_SCHEMA, artifact: current,
    run: { exitCode, startedAt: new Date(times.length ? Math.min(...times) : now).toISOString(), finishedAt: new Date(times.length ? Math.max(...times) : now).toISOString(), only: false },
    results, claimedGrade, capabilities: { vision: 'NOT_RUN' }, live: {
      benefits: { cold: [...liveRuns.values()].filter((r) => r.site === 'benefits' && r.cold).length },
      culture: { cold: [...liveRuns.values()].filter((r) => r.site === 'culture' && r.cold).length },
    },
    provenance: { runs: provenance, liveRuns: [...liveRuns.entries()].map(([instance, value]) => ({ instance, ...value })), mappingSha256: mapping ? sha256(canonicalJson(mapping)) : null, gateFile: mapping?.gateFile ?? null, gateSha256: mapping?.gateSha256 ?? null },
  };
  // Positive vision/manual status requires separate evidence; never infer it from LIVE titles.
  return { report, grade: gradeEvidence(report, current.extensionBuildSha256, current.runtimeBuildSha256, current.runtimeInputSha256) };
}

/** Capture before execution, force JSON + no .only, bind report bytes and the actual exit status. */
export async function runReport(root: string, runner: Runner, id: string, outputBase: string, args: string[]): Promise<RunReceipt> {
  if (!['vitest', 'playwright'].includes(runner) || !/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('invalid runner or run id');
  if (args.some((a) => /^--?(reporter|outputFile|allowOnly|forbid-only|watch|ui|help|version)([.=]|$)/.test(a) || ['-w', '-h', '-v'].includes(a))) throw new Error('QA reporter/focus/run controls cannot be overridden');
  const before = await readVerifiedArtifact(root);
  const runnerPackage = runner === 'vitest' ? 'vitest' : '@playwright/test';
  const runnerVersion: string = JSON.parse(await readFile(resolve(root, 'node_modules', runnerPackage, 'package.json'), 'utf8')).version;
  const invocation: Invocation = { args, nodeVersion: process.version, runnerVersion, publicEnvironment: Object.fromEntries(PUBLIC_ENV.map((key) => [key, process.env[key] ?? null])) };
  if (secretFindings(JSON.stringify(invocation)).length) throw new Error('secret-like QA arguments/environment refused');
  const runInputsSha256 = sha256(canonicalJson({ artifact: before, runner, invocation }));
  const reportPath = resolve(root, outputBase + '.json');
  const receiptPath = resolve(root, outputBase + '.receipt.json');
  if (!isInside(resolve(root, '.flecto/qa'), reportPath)) throw new Error('QA outputs must be under .flecto/qa');
  await mkdir(dirname(reportPath), { recursive: true });
  for (const path of [reportPath, receiptPath]) {
    try { await lstat(path); throw new Error('QA output already exists; use a new output base'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  const command = runner === 'vitest'
    ? [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', ...args, '--allowOnly=false', '--reporter=' + fileURLToPath(import.meta.url), '--reporter=json', '--outputFile=' + reportPath]
    : [resolve(root, 'node_modules/@playwright/test/cli.js'), 'test', ...args, '--forbid-only', '--reporter=json'];
  const startedAt = new Date().toISOString();
  const exitCode = await new Promise<number>((done) => {
    const child = spawn(process.execPath, command, { cwd: root, stdio: 'inherit', env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath } });
    child.once('error', () => done(125)); child.once('exit', (code) => done(code ?? 1));
  });
  const finishedAt = new Date().toISOString();
  let unchanged = false;
  try { unchanged = canonicalJson(before) === canonicalJson(await readVerifiedArtifact(root)); } catch { /* stamp changed or invalid */ }
  let reportSha256: string | null = null;
  try { reportSha256 = sha256(await readFile(reportPath)); } catch { /* interrupted run is not a PASS */ }
  const receipt: RunReceipt = { schema: RUN_SCHEMA, id, runner, artifact: before, startedAt, finishedAt, exitCode, unchanged, reportPath: relative(root, reportPath), reportSha256, invocation, runInputsSha256 };
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return receipt;
}

async function main(args: string[]): Promise<void> {
  const separator = args.indexOf('--');
  const options = separator < 0 ? args : args.slice(0, separator);
  const value = (name: string) => options[options.indexOf(name) + 1];
  const has = (name: string) => options.includes(name);
  if (has('--help') || !args.length) {
    console.log('qa-report run --runner vitest|playwright --id NAME --out .flecto/qa/UNIQUE -- [test arguments]\nqa-report emit [--run RECEIPT ...] [--mapping MAP.json] [--claim GRADE] --out .flecto/qa/evidence.json'); return;
  }
  if (!has('--out')) throw new Error('--out required');
  if (args[0] === 'run') {
    if (!has('--runner') || !has('--id')) throw new Error('--runner and --id required');
    const receipt = await runReport(REPO_ROOT, value('--runner') as Runner, value('--id')!, value('--out')!, separator < 0 ? [] : args.slice(separator + 1));
    process.exitCode = receipt.exitCode || (receipt.unchanged && receipt.reportSha256 ? 0 : 1);
  } else if (args[0] === 'emit') {
    const receiptPaths = options.flatMap((arg, i) => arg === '--run' ? [resolve(options[i + 1]!)] : []);
    const mapping = has('--mapping') ? JSON.parse(await readFile(value('--mapping')!, 'utf8')) : undefined;
    const claim = has('--claim') ? value('--claim') : 'UNVERIFIED';
    if (!(PRODUCT_GRADES as readonly unknown[]).includes(claim)) throw new Error('unknown grade');
    const { report, grade } = await emitEvidence(REPO_ROOT, receiptPaths, mapping, claim as ProductGrade);
    const body = JSON.stringify(report, null, 2) + '\n';
    if (secretFindings(body).length) throw new Error('secret-like content in assertion mapping; report not written');
    const out = resolve(value('--out')!);
    if (!isInside(resolve(REPO_ROOT, '.flecto/qa'), out)) throw new Error('evidence output must be under .flecto/qa');
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, body, { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ output: relative(REPO_ROOT, out), grade: grade.grade, counts: grade.counts }));
    process.exitCode = report.run.exitCode;
  } else throw new Error('expected run or emit');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => { console.error('qa-report: ' + (error instanceof Error ? error.message : 'failed')); process.exitCode = 2; });
}
