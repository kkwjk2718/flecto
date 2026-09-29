# BG-01 integration handoff

Base: `8e2a755d107472c152fe2ce889bbe34391277ce7`; lease: `BG-01`.
Mode: CONTEST, 2026-09-29 Asia/Seoul. User deadline remains 16:00 KST.
Grade: PATCH_READY, unit/type checks only. No browser/product completion claim.

## Exact wire and storage protocol

- Only `chrome.action.onClicked` creates authorization. Before injection or local reads, local and session storage access is restricted to `TRUSTED_CONTEXTS`.
- `chrome.storage.session.flectoSessions` is an object keyed by decimal tab ID. Each value is exactly `{origin, active, pendingSubmit, epoch}`. No snapshot, plan, input, document reference or token is persisted here.
- Toolbar activation persists the session, executes `files: ['content.js']` targeted to the actual top-frame `documentId`, then sends `{type:'FLECTO_ACTIVATE', pendingSubmit:boolean}` to that document. Content entry may auto-activate; it must treat this activation message idempotently.
- Same-origin top-frame commit cancels old work, clears document/instance bindings, increments the broker epoch, retains active/pending state and reinjects. Cross-origin commit revokes the session, including an overtaken cross-origin event after a quick return. Tab removal/replacement clears it.
- SPA history and fragment events cancel old work and send exactly `{type:'FLECTO_SOURCE_NAVIGATION'}` to the existing document, without injection. `pageshow`/BFCache handling belongs to content.
- `{type:'FLECTO_SESSION_GET'}` returns `{ok:true,session:{active,pendingSubmit}}` only to an authorized current top-frame document. Unapproved content receives `{ok:false,error:'AUTH_REQUIRED'}`.
- Contract `FLECTO_STATE` binds `documentInstanceId` to Chrome's current document and updates `active`/`pendingSubmit`. Setting inactive cancels work; content cannot set it active again without another toolbar authorization. Content must await a successful pending-state acknowledgement before the user's source submit. Restored `pendingSubmit:true` must render OUTCOME_UNKNOWN, never retry the click.
- `FLECTO_SETTINGS_GET/SET` access only `storage.local.flectoSettings: UserSettings`. Connection data stays in trusted options/background: `storage.local.flectoConnection:{plannerUrl,token}`. No content connection-update message exists.
- `FLECTO_PREPARE` uses the existing strict `PlannerRequestSchema`. Responses are `{ok:true,result:PlannerResponse}` only after full schema and request/snapshot/plan-snapshot ID checks plus renewed browser document checks. Errors contain only contract `ErrorCode` values.
- Literal `http://127.0.0.1:<1..65535>` options values (optional final slash) normalize to the planner origin. No aliases, credentials, other hosts/protocols, paths, query strings or redirects. POST `/v1/plans` has bearer auth, JSON, omitted cookies and `Origin: EXTENSION_ORIGIN`; the browser's actual emitted Origin must be verified by integration QA.
- Duplicate identical request payloads in the same document share a promise. A new request supersedes the previous one in that tab; another tab receives BUSY while planning. Request IDs are unique for a worker lifetime. Reuse with a different payload/owner is rejected. Client `sessionEpoch` cannot decrease within one document; it is distinct from the broker's stored epoch and is not required to equal it.
- Strict contracts reject budgets greater than 10000 with SCHEMA_INVALID. Accepted budgets are additionally clamped to 10000 and reduced by monotonic elapsed time, including storage/config/current-document validation, fetch and response parsing. Timeout settles even if fetch ignores abort. No second budget is granted.
- `FLECTO_CANCEL` requires the owning tab, Chrome document and `documentInstanceId`; it aborts and attempts DELETE `/v1/plans/:requestId` only for its tracked, dispatched request. Remote deletion is best effort with a 1-second abort, not proof the server stopped work.
- `FLECTO_VERIFY` requires a delivered result's matching request/snapshot/blueprint IDs in the same current document. POST `/v1/blueprints/:blueprintId/verify` body is exactly `{requestId,snapshotId}`. Cancellation/navigation revokes the receipt and aborts verification.
- Worker restart restores only valid sessions still attached to existing same-origin tabs. It does not inject, refetch, replay source actions or restore verification receipts. Tab deactivation cancels in-flight planning with CANCELLED.

## Validation

Using the supplied Node 24.21.0 binary, in this isolated checkout:

- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: PASS.
- `node node_modules/vitest/vitest.mjs run tests/unit/background.test.ts tests/unit/contracts.test.ts --maxWorkers=1 --no-cache`: PASS, 59 tests (56 background, 3 unchanged contracts).
- `git diff --check`: PASS.

Coverage includes sender identity/frame/origin/document, protected storage, fixed loopback addresses, strict requests/responses, singleflight, cross-tab ownership/BUSY, stale epochs/results, cancellation, hung fetch/config/startup deadlines, bounded server budget, settings isolation, pending-state persistence, navigation and restart.

Initial tests exposed a method-insensitive HTTP mock: best-effort DELETE consumed its next planned POST error. The mock now selects errors by method. Typecheck also caught untyped trusted-storage reads and zero-argument message mocks; these were corrected. No contract tests were changed or weakened.

## Next action / limits

Lead should cherry-pick the owned patch, integrate the content controller and trusted options/planner, then run the reserved browser/build checks. Specifically observe the actual planner request Origin against the stable extension ID, actual Chrome injection/message ordering, full-navigation/SPA/BFCache flows, worker termination with pending submission, and source outcome handling. Keep the server's Host/Origin/token restrictions intact. Unit mocks do not establish T01–T40, original-server persistence, LIVE inference, IME behavior or a releasable build hash.

No protocol message-name/shape changes. Document-targeted injection, fragment invalidation, stale-session pruning and monotonic client epochs are defensive additions. `state/NEXT_ACTION.md` and other lead-owned paths were intentionally untouched under the explicit write lease; this file is the worker's next-action checkpoint. No external submission or source action was performed.
