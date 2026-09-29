import { describe, expect, it } from 'vitest';
import { gradeEvidence, OPER_IDS, PRODUCT_IDS, REQUIRED_IDS, EVIDENCE_SCHEMA } from '../../scripts/ops/evidence';

const BUILD = 'a'.repeat(64);
const RUNTIME = 'd'.repeat(64);
type Entry = { status: string; kind?: string; flaky?: boolean; retries?: number };
function report(overrides: Record<string, unknown> = {}, results: Record<string, Entry> = {}) {
  const base: Record<string, Entry> = Object.fromEntries(REQUIRED_IDS.map((id) => [id, { status: 'NOT_RUN' }]));
  return {
    schema: EVIDENCE_SCHEMA, artifact: { extensionBuildSha256: BUILD, runtimeBuildSha256: RUNTIME },
    run: { exitCode: 0, startedAt: '2026-09-29T03:00:00Z', finishedAt: '2026-09-29T03:05:00Z' },
    results: { ...base, T01: { status: 'PASS', kind: 'FIXTURE' }, ...results }, claimedGrade: 'FIXTURE_ONLY', ...overrides,
  };
}
const allPass = (kind: string) => Object.fromEntries(PRODUCT_IDS.map((id) => [id, { status: 'PASS', kind }]));

describe('evidence grading (OPER10/OPER11/OPER14 input rules)', () => {
  it('keeps all 40 product IDs and 15 operational IDs required', () => {
    expect(PRODUCT_IDS).toHaveLength(40); expect(OPER_IDS).toHaveLength(15);
    expect(PRODUCT_IDS[0]).toBe('T01'); expect(PRODUCT_IDS[39]).toBe('T40'); expect(OPER_IDS[14]).toBe('OPER15');
  });

  it('grades a bound fixture report FIXTURE_ONLY and keeps NOT_RUN visible', () => {
    const g = gradeEvidence(report(), BUILD, RUNTIME);
    expect(g.valid).toBe(true); expect(g.grade).toBe('FIXTURE_ONLY');
    expect(g.counts.PASS).toBe(1); expect(g.counts.NOT_RUN).toBe(54);
    expect(g.operationalGrade).toBe('SESSION_CHECKPOINTED');
  });

  it('rejects a report with a missing required ID instead of counting it', () => {
    const r = report(); delete (r.results as Record<string, unknown>).T37; delete (r.results as Record<string, unknown>).OPER03;
    const g = gradeEvidence(r, BUILD, RUNTIME);
    expect(g.valid).toBe(false); expect(g.grade).toBe('UNVERIFIED');
    expect(g.problems).toEqual(expect.arrayContaining(['missing required ID T37', 'missing required ID OPER03']));
  });

  it('does not aggregate SKIP, FLAKY or retried PASS as PASS', () => {
    for (const bad of [{ status: 'SKIP' }, { status: 'FLAKY' }, { status: 'PASS', kind: 'FIXTURE', flaky: true }, { status: 'PASS', kind: 'FIXTURE', retries: 1 }]) {
      const g = gradeEvidence(report({}, { T05: bad }), BUILD, RUNTIME);
      expect(g.grade).toBe('UNVERIFIED');
      expect(g.reasons.join(' ')).toContain('SKIP/FLAKY');
    }
  });

  it('rejects focused runs, fake PASS without kind, and non-zero exit', () => {
    expect(gradeEvidence(report({ run: { exitCode: 0, only: true, startedAt: 'a', finishedAt: 'b' } }), BUILD, RUNTIME).valid).toBe(false);
    expect(gradeEvidence(report({}, { T02: { status: 'PASS' } }), BUILD, RUNTIME).problems).toContain('PASS without evidence kind for T02');
    expect(gradeEvidence(report({ run: { exitCode: 1, startedAt: 'a', finishedAt: 'b' } }), BUILD, RUNTIME).grade).toBe('UNVERIFIED');
    expect(gradeEvidence('not json object', BUILD, RUNTIME).grade).toBe('UNVERIFIED');
  });

  it('refuses evidence bound to another artifact or to an unverified build (OPER11)', () => {
    const g = gradeEvidence(report({ artifact: { extensionBuildSha256: 'b'.repeat(64) }, claimedGrade: 'FULL_LIVE' }, allPass('LIVE_CODEX')), BUILD, RUNTIME);
    expect(g.valid).toBe(false); expect(g.grade).toBe('UNVERIFIED');
    expect(gradeEvidence(report(), null, RUNTIME).grade).toBe('UNVERIFIED');
    expect(gradeEvidence(report(), BUILD, RUNTIME, 'f'.repeat(64)).valid).toBe(false);
    expect(gradeEvidence(report({ artifact: { extensionBuildSha256: BUILD, runtimeBuildSha256: RUNTIME, runtimeInputSha256: 'f'.repeat(64) } }), BUILD, RUNTIME, 'f'.repeat(64)).valid).toBe(true);
  });

  it('never raises a claim and lowers FULL_LIVE when LIVE runs or vision are missing', () => {
    const live = { benefits: { cold: 3 }, culture: { cold: 3 } };
    expect(gradeEvidence(report({ claimedGrade: 'FULL_LIVE' }, allPass('FIXTURE')), BUILD, RUNTIME).grade).toBe('FIXTURE_ONLY');
    expect(gradeEvidence(report({ claimedGrade: 'FULL_LIVE', live }, allPass('LIVE_CODEX')), BUILD, RUNTIME).grade).toBe('LIMITED_LIVE');
    expect(gradeEvidence(report({ claimedGrade: 'FULL_LIVE', live: { benefits: { cold: 3 }, culture: { cold: 2 } } }, allPass('LIVE_CODEX')), BUILD, RUNTIME).grade).toBe('SINGLE_SITE_LIVE');
    expect(gradeEvidence(report({ claimedGrade: 'FULL_LIVE', live, capabilities: { vision: 'PASS' } }, allPass('LIVE_CODEX')), BUILD, RUNTIME).grade).toBe('FULL_LIVE');
    expect(gradeEvidence(report({ claimedGrade: 'FIXTURE_ONLY', live, capabilities: { vision: 'PASS' } }, allPass('LIVE_CODEX')), BUILD, RUNTIME).grade).toBe('FIXTURE_ONLY');
  });

  it('marks REVOKED reports and grants MANAGED_TESTED only for all-PASS fault injection', () => {
    expect(gradeEvidence(report({ revoked: true }), BUILD, RUNTIME).grade).toBe('REVOKED');
    const ops = Object.fromEntries(OPER_IDS.map((id) => [id, { status: 'PASS', kind: 'FAULT_INJECTION' }]));
    expect(gradeEvidence(report({}, ops), BUILD, RUNTIME).operationalGrade).toBe('MANAGED_TESTED');
    expect(gradeEvidence(report({}, { ...ops, OPER08: { status: 'NOT_RUN' } }), BUILD, RUNTIME).operationalGrade).toBe('SESSION_CHECKPOINTED');
  });
});
