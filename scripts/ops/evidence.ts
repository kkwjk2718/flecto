/**
 * Evidence report validation and honest grade derivation (ops/02_GATES_AND_TESTS.md, ops/06_RELEASE_AND_DEMO.md).
 * The claimed grade can only be lowered by the recorded results, never raised. No report => UNVERIFIED.
 */
export const PRODUCT_IDS = Array.from({ length: 40 }, (_, i) => 'T' + String(i + 1).padStart(2, '0'));
export const ORIGINAL_IDS = PRODUCT_IDS.slice(0, 26);
export const OPER_IDS = Array.from({ length: 15 }, (_, i) => 'OPER' + String(i + 1).padStart(2, '0'));
export const REQUIRED_IDS = [...PRODUCT_IDS, ...OPER_IDS];
export const STATUSES = ['PASS', 'FAIL', 'NOT_RUN', 'SKIP', 'FLAKY', 'BLOCKED'] as const;
export const KINDS = ['FIXTURE', 'LIVE_CODEX', 'FAULT_INJECTION', 'CACHE', 'REPLAY', 'MANUAL'] as const;
export const PRODUCT_GRADES = ['REVOKED', 'UNVERIFIED', 'FIXTURE_ONLY', 'SINGLE_SITE_LIVE', 'LIMITED_LIVE', 'FULL_LIVE'] as const;
export const OPERATIONAL_GRADES = ['DOCS_ONLY', 'SESSION_CHECKPOINTED', 'MANAGED_TESTED'] as const;
export const EVIDENCE_SCHEMA = 'flecto.evidence.v1';
export const LIVE_COLD_MIN = 3;

export type ProductGrade = typeof PRODUCT_GRADES[number];
export type OperationalGrade = typeof OPERATIONAL_GRADES[number];
export type Status = typeof STATUSES[number];

export type GradeResult = {
  valid: boolean;
  problems: string[];
  reasons: string[];
  claimed: ProductGrade | null;
  derived: ProductGrade;
  grade: ProductGrade;
  operationalGrade: OperationalGrade;
  counts: Record<Status, number>;
  capabilityStatus: Record<string, string>;
};

const rank = (g: ProductGrade) => PRODUCT_GRADES.indexOf(g);
export const lowerGrade = (a: ProductGrade, b: ProductGrade): ProductGrade => (rank(a) <= rank(b) ? a : b);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const coldRuns = (live: unknown, site: string): number => {
  if (!isObj(live) || !isObj(live[site])) return 0;
  const n = (live[site] as Record<string, unknown>).cold;
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : 0;
};

export function noEvidence(reason = 'no evidence report supplied'): GradeResult {
  return {
    valid: false, problems: [], reasons: [reason], claimed: null, derived: 'UNVERIFIED', grade: 'UNVERIFIED',
    operationalGrade: 'DOCS_ONLY', counts: Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>,
    capabilityStatus: { vision: 'UNVERIFIED' },
  };
}

/**
 * @param report parsed JSON of an evidence report (schema flecto.evidence.v1)
 * @param currentBuildSha256 identity of the build being packaged (inspectBuild().extension.buildSha256)
 */
export function gradeEvidence(report: unknown, currentBuildSha256: string | null): GradeResult {
  const out = noEvidence();
  out.reasons = [];
  const problems = out.problems;
  if (!isObj(report)) { problems.push('report is not a JSON object'); return finish(out); }
  if (report.schema !== EVIDENCE_SCHEMA) problems.push('schema must be ' + EVIDENCE_SCHEMA);
  const artifact = isObj(report.artifact) ? report.artifact : {};
  if (!currentBuildSha256) problems.push('current build is not verified; evidence cannot be bound to it');
  else if (artifact.extensionBuildSha256 !== currentBuildSha256) problems.push('artifact.extensionBuildSha256 does not match the packaged build (evidence from another artifact is not accepted)');
  const run = isObj(report.run) ? report.run : null;
  if (!run) problems.push('run section missing');
  else {
    if (typeof run.exitCode !== 'number' || !Number.isInteger(run.exitCode)) problems.push('run.exitCode must be an integer');
    if (run.only === true) problems.push('focused (.only) run is not a full report');
    if (typeof run.startedAt !== 'string' || typeof run.finishedAt !== 'string') problems.push('run.startedAt/finishedAt missing');
  }
  const results = isObj(report.results) ? report.results : null;
  if (!results) problems.push('results section missing');
  const statuses = new Map<string, Status>();
  if (results) {
    for (const id of REQUIRED_IDS) {
      const entry = results[id];
      if (!isObj(entry)) { problems.push('missing required ID ' + id); continue; }
      const status = entry.status;
      if (typeof status !== 'string' || !(STATUSES as readonly string[]).includes(status)) { problems.push('invalid status for ' + id); continue; }
      if (status === 'PASS' && (typeof entry.kind !== 'string' || !(KINDS as readonly string[]).includes(entry.kind))) { problems.push('PASS without evidence kind for ' + id); continue; }
      statuses.set(id, status === 'PASS' && (entry.flaky === true || (typeof entry.retries === 'number' && entry.retries > 0)) ? 'FLAKY' : status as Status);
    }
  }
  for (const s of statuses.values()) out.counts[s]++;
  const vision = isObj(report.capabilities) && typeof report.capabilities.vision === 'string' ? report.capabilities.vision : 'UNVERIFIED';
  out.capabilityStatus = { vision: ['PASS', 'FAIL', 'NOT_RUN'].includes(vision) ? vision : 'UNVERIFIED' };
  const claimed = typeof report.claimedGrade === 'string' && (PRODUCT_GRADES as readonly string[]).includes(report.claimedGrade) ? report.claimedGrade as ProductGrade : null;
  out.claimed = claimed;
  if (!claimed) problems.push('claimedGrade missing or unknown');

  if (report.revoked === true || claimed === 'REVOKED') { out.derived = 'REVOKED'; out.grade = 'REVOKED'; out.reasons.push('report marks this artifact REVOKED'); return finish(out); }
  if (problems.length) return finish(out);

  const pass = (id: string) => statuses.get(id) === 'PASS';
  const kindOf = (id: string) => (results![id] as Record<string, unknown>).kind;
  const product = PRODUCT_IDS.map((id) => statuses.get(id));
  const anyFail = product.some((s) => s === 'FAIL' || s === 'BLOCKED');
  const anySkipOrFlaky = product.some((s) => s === 'SKIP' || s === 'FLAKY');
  const exitOk = run!.exitCode === 0;
  const benefitsCold = coldRuns(report.live, 'benefits');
  const cultureCold = coldRuns(report.live, 'culture');
  const hasLiveTrace = PRODUCT_IDS.some((id) => pass(id) && kindOf(id) === 'LIVE_CODEX');

  let derived: ProductGrade = 'UNVERIFIED';
  if (!exitOk) out.reasons.push('run exit code ' + String(run!.exitCode));
  if (anyFail) out.reasons.push('product checks contain FAIL/BLOCKED');
  if (anySkipOrFlaky) out.reasons.push('SKIP/FLAKY results are not counted as PASS');
  if (exitOk && !anyFail && !anySkipOrFlaky) {
    if (pass('T01')) derived = 'FIXTURE_ONLY'; else out.reasons.push('T01 not PASS: no verified original flow');
    if (derived === 'FIXTURE_ONLY' && hasLiveTrace && benefitsCold >= LIVE_COLD_MIN) derived = 'SINGLE_SITE_LIVE';
    if (derived === 'SINGLE_SITE_LIVE' && cultureCold >= LIVE_COLD_MIN && ORIGINAL_IDS.every(pass)) derived = 'LIMITED_LIVE';
    if (derived === 'LIMITED_LIVE' && PRODUCT_IDS.every(pass) && out.capabilityStatus.vision === 'PASS') derived = 'FULL_LIVE';
    if (derived !== 'FULL_LIVE') {
      const notPass = PRODUCT_IDS.filter((id) => !pass(id));
      if (notPass.length) out.reasons.push('not PASS: ' + notPass.join(','));
      if (benefitsCold < LIVE_COLD_MIN || cultureCold < LIVE_COLD_MIN) out.reasons.push('cold LIVE runs benefits=' + benefitsCold + ' culture=' + cultureCold + ' (need ' + LIVE_COLD_MIN + ' each)');
      if (out.capabilityStatus.vision !== 'PASS') out.reasons.push('vision capability ' + out.capabilityStatus.vision);
    }
  }
  out.derived = derived;
  out.grade = lowerGrade(derived, claimed!);
  if (rank(claimed!) > rank(derived)) out.reasons.push('claimed ' + claimed + ' lowered to ' + out.grade + ' by recorded results');
  out.valid = true;
  out.operationalGrade = OPER_IDS.every((id) => pass(id) && kindOf(id) === 'FAULT_INJECTION') ? 'MANAGED_TESTED' : 'SESSION_CHECKPOINTED';
  return finish(out);
}

function finish(out: GradeResult): GradeResult {
  if (out.problems.length) {
    out.valid = false;
    if (out.grade !== 'REVOKED') { out.derived = 'UNVERIFIED'; out.grade = 'UNVERIFIED'; }
    out.operationalGrade = 'DOCS_ONLY';
    out.reasons.unshift('evidence rejected: ' + out.problems.length + ' problem(s)');
  }
  return out;
}
