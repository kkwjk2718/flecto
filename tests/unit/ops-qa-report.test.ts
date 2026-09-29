import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { inspectBuild } from '../../scripts/ops/build-check';
import { canonicalJson, REPO_ROOT, sha256 } from '../../scripts/ops/common';
import { captureRuntimeInputs, writeRuntimeManifest } from '../../scripts/ops/runtime-hash';
import { emitEvidence, MAP_SCHEMA, parsePlaywright, parseVitest, readVerifiedArtifact, RUN_SCHEMA, runReport, type QaMapping, type RunReceipt } from '../../scripts/qa-report';

let root: string;
const file = 'tests/unit/acceptance.test.ts';
const source = "import { it, expect } from 'vitest';\nit('T01 title is insufficient', () => { expect(1).toBe(1); });\nlet attempts = 0;\nit('retried assertion', { retry: 1 }, () => { expect(++attempts).toBe(2); });\nit.fails('expected failure', () => { expect(1).toBe(2); });\n";
async function put(path: string, body: string) { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), body); }
const seal = async () => writeRuntimeManifest(root, await captureRuntimeInputs(root));
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'flecto-qa-report-'));
  await put('package.json', '{"type":"module"}'); await put('package-lock.json', '{}');
  await put('ops/02_GATES_AND_TESTS.md', 'T01 requires source storage AND confirmation');
  await put(file, source);
  await put('vitest.config.ts', "export default { test: { include: ['tests/unit/acceptance.test.ts'], maxWorkers: 1, pool: 'forks' } };\n");
  const ext = { 'manifest.json': '{"manifest_version":3,"version":"0.1.0"}', 'content.js': 'c', 'background.js': 'b', 'options.html': 'o', 'options.js': 'j' };
  for (const [name, text] of Object.entries(ext)) await put('dist/extension/' + name, text);
  await put('dist/extension-hashes.json', JSON.stringify(Object.fromEntries(Object.entries(ext).map(([n, text]) => [n, sha256(text)]))));
  await put('apps/demo-culture/dist/index.html', '<html></html>');
  await seal();
});
afterEach(() => rm(root, { recursive: true, force: true }));

const vitest = (status = 'passed', meta: unknown = { retryCount: 0, repeatCount: 0, expectedFailure: false }) => ({
  success: status !== 'failed', numFailedTests: status === 'failed' ? 1 : 0, numFailedTestSuites: 0,
  testResults: [{ name: join(root, file), status: status === 'failed' ? 'failed' : 'passed', assertionResults: [{ title: 'T01 title is insufficient', ancestorTitles: [], status, meta: { flecto: meta }, failureMessages: status === 'failed' ? ['failure'] : [] }] }],
});
const playwright = (results: Array<Record<string, unknown>> = [{ status: 'passed', retry: 0, steps: [{ title: 'source storage', duration: 1 }] }]) => ({
  config: { rootDir: join(root, 'tests/unit'), forbidOnly: true }, stats: { unexpected: 0 }, errors: [],
  suites: [{ title: 'acceptance.test.ts', specs: [], suites: [{ title: 'flow', specs: [{ title: 'source result', file: 'acceptance.test.ts', tests: [{ projectName: 'chromium', expectedStatus: 'passed', status: results.length > 1 ? 'flaky' : 'expected', results }] }] }] }],
});
async function receipt(id: string, runner: 'vitest' | 'playwright', report: unknown, exitCode = 0) {
  const build = await inspectBuild(root);
  const reportPath = '.flecto/qa/' + id + '.json';
  const body = JSON.stringify(report);
  await put(reportPath, body);
  const artifact = { extensionBuildSha256: build.extension.buildSha256!, runtimeBuildSha256: build.runtime.manifest!.runtimeBuildSha256, runtimeInputSha256: build.runtime.manifest!.runtimeInputSha256 };
  const invocation = { args: [], nodeVersion: process.version, runnerVersion: 'unit-test-fixture', publicEnvironment: {} };
  const value: RunReceipt = { schema: RUN_SCHEMA, id, runner, artifact, startedAt: '2026-09-29T04:00:00Z', finishedAt: '2026-09-29T04:01:00Z', exitCode, unchanged: true, reportPath, reportSha256: sha256(body), invocation, runInputsSha256: sha256(canonicalJson({ artifact, runner, invocation })) };
  const path = join(root, '.flecto/qa/' + id + '.receipt.json');
  await writeFile(path, JSON.stringify(value));
  return path;
}
function mapping(): QaMapping {
  return { schema: MAP_SCHEMA, gateFile: 'ops/02_GATES_AND_TESTS.md', gateSha256: sha256('T01 requires source storage AND confirmation'), checks: {
    T01: { kind: 'FIXTURE', coverage: 'complete', requirements: ['source storage', 'confirmation'], assertions: ['source storage', 'confirmation'].map((requirement) => ({ requirement, run: 'unit', file, sourceSha256: sha256(source), titlePath: ['T01 title is insufficient'], assertion: 'expect(1).toBe(1)' })) },
  } };
}

describe('QA report evidence emitter', () => {
  it('emits every acceptance ID as NOT_RUN without a reviewed mapping despite passing T01 titles', async () => {
    const result = await emitEvidence(root, [await receipt('unit', 'vitest', vitest())]);
    expect(Object.keys(result.report.results)).toHaveLength(55);
    expect(result.grade.counts.NOT_RUN).toBe(55); expect(result.grade.grade).toBe('UNVERIFIED');
  });
  it('requires explicit reviewed coverage and exact source-bound assertion references', async () => {
    const path = await receipt('unit', 'vitest', vitest());
    const map = mapping();
    const result = await emitEvidence(root, [path], map, 'FULL_LIVE');
    expect(result.report.results.T01?.status).toBe('PASS'); expect(result.grade.grade).toBe('FIXTURE_ONLY');
    expect(result.report.capabilities.vision).toBe('NOT_RUN'); expect(result.report.live.benefits.cold).toBe(0);
    map.checks.T01!.coverage = 'partial';
    expect((await emitEvidence(root, [path], map)).report.results.T01?.status).toBe('NOT_RUN');
    map.checks.T01!.coverage = 'complete'; map.checks.T01!.assertions.pop();
    expect((await emitEvidence(root, [path], map)).report.results.T01?.status).toBe('NOT_RUN');
  });
  it.each(['failed', 'skipped', 'pending'])('preserves %s results and never turns them into PASS', async (status) => {
    const result = await emitEvidence(root, [await receipt('unit', 'vitest', vitest(status))], mapping(), 'FULL_LIVE');
    expect(result.report.results.T01?.status).toBe(status === 'failed' ? 'FAIL' : 'SKIP');
    expect(result.grade.grade).toBe('UNVERIFIED');
  });
  it('cannot promote absent tests, ambiguous names, uninstrumented Vitest or expected failures', async () => {
    const map = mapping();
    expect((await emitEvidence(root, [], map)).report.results.T01?.status).toBe('NOT_RUN');
    expect(parseVitest(root, vitest('passed', null)).cases[0]?.status).toBe('NOT_RUN');
    expect(parseVitest(root, vitest('passed', { retryCount: 0, repeatCount: 0, expectedFailure: true })).cases[0]?.status).toBe('NOT_RUN');
    const duplicate = vitest(); duplicate.testResults[0]!.assertionResults.push(duplicate.testResults[0]!.assertionResults[0]!);
    expect((await emitEvidence(root, [await receipt('unit', 'vitest', duplicate)], map)).report.results.T01?.status).toBe('NOT_RUN');
  });
  it('refuses stale source/gate reviews and tampered report bytes', async () => {
    const path = await receipt('unit', 'vitest', vitest()); const map = mapping();
    map.checks.T01!.assertions[0]!.sourceSha256 = 'a'.repeat(64);
    await expect(emitEvidence(root, [path], map)).rejects.toThrow('assertion source');
    map.checks.T01!.assertions[0]!.sourceSha256 = sha256(source); map.gateSha256 = 'a'.repeat(64);
    await expect(emitEvidence(root, [path], map)).rejects.toThrow('gate source');
    await put('.flecto/qa/unit.json', '{}');
    await expect(emitEvidence(root, [path])).rejects.toThrow('report bytes changed');
  });
  it('refuses old receipts after a runtime rebuild instead of relabeling old reports', async () => {
    const path = await receipt('unit', 'vitest', vitest());
    await put('apps/planner/src/provider/prompt.ts', 'new prompt'); await seal();
    await expect(emitEvidence(root, [path], mapping())).rejects.toThrow('cannot be rebound');
  });
  it('rejects an invocation modified after the run input hash was captured', async () => {
    const path = await receipt('unit', 'vitest', vitest());
    const r = JSON.parse(await readFile(path, 'utf8')); r.invocation.args = ['--grep=T01'];
    await writeFile(path, JSON.stringify(r));
    await expect(emitEvidence(root, [path], mapping())).rejects.toThrow('invocation input binding');
  });
  it('keeps nonzero process exits even when an individual assertion passes', async () => {
    const result = await emitEvidence(root, [await receipt('unit', 'vitest', vitest(), 1)], mapping(), 'FULL_LIVE');
    expect(result.report.run.exitCode).toBe(1); expect(result.grade.grade).toBe('UNVERIFIED');
  });
  it('reads nested Playwright reports and requires an explicitly selected successful step', async () => {
    const path = await receipt('browser', 'playwright', playwright());
    const map = mapping();
    for (const assertion of map.checks.T01!.assertions) Object.assign(assertion, { run: 'browser', titlePath: ['flow', 'source result'], project: 'chromium', step: 'source storage' });
    expect((await emitEvidence(root, [path], map)).report.results.T01?.status).toBe('PASS');
    map.checks.T01!.assertions[0]!.step = 'missing confirmation';
    expect((await emitEvidence(root, [path], map)).report.results.T01?.status).toBe('NOT_RUN');
    expect(parsePlaywright(root, playwright([{ status: 'failed', retry: 0 }, { status: 'passed', retry: 1 }])).cases[0]?.status).toBe('FLAKY');
    expect(parsePlaywright(root, playwright([{ status: 'timedOut', retry: 0 }])).cases[0]?.status).toBe('FAIL');
  });
  it('records missing reporter output as NOT_RUN with a failed run', async () => {
    const path = await receipt('unit', 'vitest', vitest());
    const r = JSON.parse(await readFile(path, 'utf8')); r.reportSha256 = null; r.exitCode = 1;
    await writeFile(path, JSON.stringify(r));
    const result = await emitEvidence(root, [path], mapping());
    expect(result.report.results.T01?.status).toBe('NOT_RUN'); expect(result.report.run.exitCode).toBe(1);
  });
  it('counts three explicitly mapped cold LIVE repetitions once each, not once per assertion', async () => {
    const binding = await readVerifiedArtifact(root);
    const proof = { requestedModel: 'gpt-6-luna', timings: { source: 'benefits', mode: 'LIVE_CODEX', controlsReadyMs: 2500 }, cache: { providerCalls: 1, misses: 1, exactHits: 0, compatibleHits: 0 }, outcome: { sourceDatabaseCount: 1, insertionCount: 1 } };
    const attachment = (name: string, value: unknown) => ({ name, contentType: 'application/json', body: Buffer.from(JSON.stringify(value)).toString('base64') });
    const json = playwright([{ status: 'passed', retry: 0, attachments: [attachment('artifact', binding), attachment('live-source-evidence', proof)] }]);
    const tests = json.suites[0]!.suites[0]!.specs[0]!.tests;
    tests.push(structuredClone(tests[0]!), structuredClone(tests[0]!));
    const path = await receipt('live', 'playwright', json);
    const map = mapping(); map.checks.T01!.kind = 'LIVE_CODEX'; map.checks.T01!.requestedModel = 'gpt-6-luna';
    for (const a of map.checks.T01!.assertions) Object.assign(a, { run: 'live', titlePath: ['flow', 'source result'], project: 'chromium', instances: 3 });
    const result = await emitEvidence(root, [path], map, 'FULL_LIVE');
    expect(result.report.results.T01?.status).toBe('PASS'); expect(result.report.live.benefits.cold).toBe(3);
    expect(result.grade.grade).toBe('SINGLE_SITE_LIVE'); expect(result.report.provenance.liveRuns).toHaveLength(3);
    map.checks.T01!.assertions[0]!.instances = 2;
    expect((await emitEvidence(root, [path], map)).report.results.T01?.status).toBe('NOT_RUN');
  });
  it.each(['extension-only', 'wrong-model', 'wrong-runtime', 'no-original-result', 'fixture-mode', 'warm-cache'])('does not claim cold LIVE from %s attachments', async (mutation) => {
    const binding: Record<string, unknown> = { ...await readVerifiedArtifact(root) };
    const proof = { requestedModel: 'gpt-6-luna', timings: { source: 'benefits', mode: 'LIVE_CODEX', controlsReadyMs: 2500 }, cache: { providerCalls: 1, misses: 1, exactHits: 0, compatibleHits: 0 }, outcome: { sourceDatabaseCount: 1, insertionCount: 1 } };
    if (mutation === 'extension-only') delete binding.runtimeBuildSha256;
    if (mutation === 'wrong-runtime') binding.runtimeBuildSha256 = 'b'.repeat(64);
    if (mutation === 'wrong-model') proof.requestedModel = 'other';
    if (mutation === 'no-original-result') proof.outcome.sourceDatabaseCount = 0;
    if (mutation === 'fixture-mode') proof.timings.mode = 'FIXTURE';
    if (mutation === 'warm-cache') proof.cache.exactHits = 1;
    const attachments = [['artifact', binding], ['live-source-evidence', proof]].map(([name, value]) => ({ name, contentType: 'application/json', body: Buffer.from(JSON.stringify(value)).toString('base64') }));
    const path = await receipt('live', 'playwright', playwright([{ status: 'passed', retry: 0, attachments }]));
    const map = mapping(); map.checks.T01!.kind = 'LIVE_CODEX'; map.checks.T01!.requestedModel = 'gpt-6-luna';
    for (const a of map.checks.T01!.assertions) Object.assign(a, { run: 'live', titlePath: ['flow', 'source result'], project: 'chromium' });
    const result = await emitEvidence(root, [path], map);
    expect(result.report.live.benefits.cold).toBe(0);
    expect(result.report.results.T01?.status).toBe(mutation === 'warm-cache' ? 'PASS' : 'NOT_RUN');
  });
  it('captures actual Vitest JSON, exit status, retry diagnostics and expected failures without any browser/server', async () => {
    await symlink(join(REPO_ROOT, 'node_modules'), join(root, 'node_modules'));
    const run = await runReport(root, 'vitest', 'actual', '.flecto/qa/actual', ['--maxWorkers=1']);
    expect(run.exitCode).toBe(0); expect(run.unchanged).toBe(true); expect(run.reportSha256).toMatch(/^[a-f0-9]{64}$/);
    const parsed = parseVitest(root, JSON.parse(await readFile(join(root, run.reportPath), 'utf8')));
    expect(parsed.cases.map((test) => test.status)).toEqual(['PASS', 'FLAKY', 'NOT_RUN']);
    await expect(runReport(root, 'vitest', 'actual', '.flecto/qa/actual', [])).rejects.toThrow('already exists');
  }, 20000);
});
