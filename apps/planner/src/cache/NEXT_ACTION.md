# CACHE-PERF-01 handoff

Status: PATCH_READY for lead review, not a release or LIVE validation. Base: `7488c139497a4db3b91c119f54c1470b2d78e74d`. Worktree: `flecto-benefits/kakao-ralphthon-main`. CONTEST, 2026-09-29 Asia/Seoul, user deadline 16:00 unchanged.

## Next action for lead

1. Review/cherry-pick this patch and reclaim the cache/server ownership lease.
2. **Requested shared contract change:** bump `CACHE_VERSION` from `flecto-blueprint-v1` to `flecto-blueprint-v2` because cache title and reuse semantics have changed. Only the lead edits contracts. Re-run the tests below after the bump; the saved benchmark explicitly records the pre-bump version. Both SQLite lookup namespaces and payload checks consume the shared constant, so an actual bump invalidates earlier entries.
3. Update the root `state/NEXT_ACTION.md` from this handoff. This worker's explicit write scope excludes root/state, so this checkpoint is within its owned cache directory.
4. Independently validate current option display and controller handling of disabled choices in the reserved browser/LIVE work. No controller/provider/core/shared contract files were edited here. No submission was performed.

## Behavior and safety

- Exact tier retains `structuralFingerprint` + core `rebindBlueprint` unchanged. Fresh document refs, decoration and unrelated menu/form ordinal changes keep exact hits.
- Compatible tier is a separate verifier for an explicitly selected `complete_form` action. A SHA-256 digest locks origin, goal, action identity/method/URL, semantic target keys, kinds, labels, form scope, required/disabled state, constraints, every notice's exact public text/kind/scope and control-to-notice associations. Only select/radio option content is excluded. Reference-free target ordering is canonicalized; every control and notice key must be unique.
- The compatible verifier checks current versions/origin/signature, a complete unique locator set, source action identity, and core plan/notice/required coverage. It returns fresh refs. All options and values still come from the current snapshot/private registry; neither selected values nor option data enter the persisted blueprint.
- No compatible hit when any choice field has no enabled, non-placeholder public choice. The original single-disabled-option negative test is unchanged. Recognizable Korean/English prompts are conservatively excluded. Public contracts do not expose raw option values, so arbitrary misleading labels or server-side inventory cannot be inferred here; current controller/source validation remains necessary.
- Every persisted and reused cache step title is a fixed generic title for its template. Cached price/course text cannot carry over. Existing planner QA fixtures change only two generic title literals; no assertions or negative cases are removed or weakened.
- Existing CANDIDATE rows remain persisted as in baseline QA, but neither lookup tier sees them. Only the existing request/snapshot/blueprint-bound authenticated ACK can promote a row to VERIFIED. Cancel/timeout/singleflight/provider occupancy safeguards remain in place.
- SQLite adds nullable `compatible_key` and `compatible_version` columns plus an index. The internal compatibility namespace is `strict-options-v1`. Legacy rows without compatibility evidence remain eligible only for the exact tier. No schema/locator contract changes.
- No parsed LRU added: every lookup reads current SQLite status/payload, so external quarantine/version/tamper changes are visible immediately. Compatible candidate examination is bounded to eight rows. This patch has no evidence of a parsing bottleneck that justifies another cache/invalidation layer.

## API

`GET /v1/diagnostics/cache` requires the same extension Origin and Bearer authentication as `/v1/plans`. It returns process-lifetime aggregates: `exactHits`, `compatibleHits`, `misses`, `providerCalls`, `quarantines`; `durations.{exact,compatible,provider,prepare}.{count,totalMs,maxMs}`; `modelTokensActual: null`, `scope: process_aggregate`, `durationUnit: ms`, `controlsReadyMeasured: false`.

Durations use `performance.now()`. Exact/compatible durations measure successful reconstruction from prepare entry. Provider duration measures actual provider invocation, including failures and late settlement after cancellation. Prepare duration measures each unique prepare attempt; duplicate singleflight callers are not counted twice. Misses include cache lookup misses that subsequently encounter BUSY. Aggregates reset on restart and contain no URLs, request IDs, input text, token strings or per-user keys. Existing `/health`, `/v1/connect`, planner response and ACK formats are unchanged.

## Validation

Node v24.21.0 from the already installed main-repository toolchain; no dependency installation.

```
node node_modules/vitest/vitest.mjs run tests/integration/planner-security.test.ts tests/integration/planner-selected-form.test.ts tests/integration/planner-cache-performance.test.ts tests/unit/cache-store.test.ts tests/unit/core.test.ts tests/unit/core-integration.test.ts
node node_modules/typescript/bin/tsc --noEmit
git diff --check
```

All six files / 141 tests passed. This includes all 53 prior planner QA cases plus unchanged core structural-mismatch negatives. New tests use real JSDOM extraction and real file SQLite, including restart, seven-column migration, ACK gating, current options, generic titles, model/prompt/cache partitioning, required/notice/action/constraint changes, disabled-only choices, foreign target keys, duplicate refs/semantic keys, missing coverage and authenticated aggregate privacy. Typecheck and diff check passed. No browser, LIVE provider, source submission, dependency install or release build was run.

## FIXTURE benchmark

Reproduce with the same Node binary:

```
node node_modules/vitest/vitest.mjs run tests/integration/planner-cache-performance.test.ts --silent=false --reporter=verbose -t 'FIXTURE benchmark'
```

Machine-readable measurement is `benchmark.fixture.json` in this directory (2026-09-29T04:16:45.772Z). Each tier has 24 requests. Cold candidates are deliberately not ACKed until the cold loop ends; exact and compatible loops then share that verified blueprint. Every request uses fresh extracted document references, and the compatible loop changes capacity/availability while another genuine choice remains enabled. The fixture provider has no artificial delay.

| Tier | Median ms | p95 ms | Hits / requests | Provider calls |
|---|---:|---:|---:|---:|
| Cold | 0.930 | 20.085 | 0/24 | 24 |
| Exact warm | 0.600 | 2.596 | 24/24 | 0 |
| Compatible warm | 0.547 | 1.078 | 24/24 | 0 |

This run's warm/cold median ratios are 0.645 exact and 0.589 compatible. Warm hit rate is 48/48 (100%); full workload including deliberately cold requests is 48/72 (66.7%). These are synthetic-workload rates, not a field hit-rate estimate. The ordered, small-sample test can include JIT, scheduler and filesystem variance (the p95 reflects this); it does not justify a universal speedup claim.

Timing covers Fastify injection, planner verification/reconstruction and real SQLite. DOM extraction, browser messaging, rendering and controlsReady are excluded. LIVE latency, actual model token counts, source success and the 3-second product target remain unmeasured.

Evidence collection note: one attempt to capture benchmark console output with Vitest's default reporter exited 1 because that reporter omitted the log, after all 141 tests passed. Retrying once with the verbose reporter captured the JSON successfully. This was an evidence-output failure, not a failing product test.
