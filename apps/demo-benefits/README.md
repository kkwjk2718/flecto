# Independent purchasing benefits source A

Lease **SOURCE-A-01**, based on `8e2a755`. Korean, server-rendered Fastify 5 service with real `node:sqlite` persistence. No FLECTO runtime, extension, JavaScript, planner, hidden answer plans, selectors or action ordering is needed to use it. Native labels, names, required controls, notice text and form actions are public source semantics.

## Launcher contract

```ts
import { createBenefitsServer } from './apps/demo-benefits/src/server.js';

const server = createBenefitsServer({
  dbPath,         // existing parent directory; dedicated synthetic SQLite file or :memory:
  sessionSecret,  // caller-provided stable random secret, at least 32 characters
  namespace: 'DEMO', // or QA; must match the database's immutable ownership marker
  qaToken,       // optional; absent/empty disables all QA routes with 404
  variant: 'default',
});
await server.listen({ host: '127.0.0.1', port });
// await server.close() closes its SQLite handle.
```

Importing/creating the server never listens. No default session secret or QA token exists. Do not provide either secret to the extension, planner or browser page. Do not reuse a database containing other application tables: the constructor refuses it. Caller must use separate QA/DEMO database paths, ports, secrets, QA tokens and browser profiles. Cookies are not port-scoped, so two source-A instances also need separate profiles.

The cookie is `flecto_benefits`, signed, `HttpOnly`, `SameSite=Lax`, path `/`, eight-hour lifetime; server sessions persist in SQLite for the same lifetime. This is loopback HTTP, so `Secure` is intentionally absent. Login rotates the session ID; logout revokes it. Records belong to the login **session**, not the shared synthetic account; a new login does not recover a previous session's records. Restarting with the same DB, secret and still-valid cookie does preserve the session.

## Fixtures and original routes

- Synthetic account: **demo / flecto2026!**. The password is not rendered or echoed in HTML.
- Valid orders: **FLECTO-2026-001 through FLECTO-2026-099**, all purchased **2026-09-01**.
- Category: **가전**, **생활**, or **디지털**. This synthetic catalog permits any of these three on each order.
- Required consent: `consent=yes`, unchecked initially. Invalid or missing data is rejected by the server; invalid entered text is escaped only in the requesting user's response and is not stored as a draft or record.

| Route | Behavior |
| --- | --- |
| GET `/login` | Native username/password autocomplete fields and session CSRF |
| POST `/login` | URL-encoded `username`, `password`, `csrf`; success 303 to `/` |
| POST `/logout` | `csrf`; revokes session and clears cookie |
| GET `/` | Menu, benefit entry, history and unrelated navigation tasks |
| GET `/guide`, `/stores` | Independent accessible help and store-hours tasks |
| GET `/apply` | Authenticated native form; optional `?draft=...` edit link |
| POST `/apply` | URL-encoded `orderNumber`, `purchaseDate`, `category`, `consent`, `csrf`, `formToken`; optional/required `contactMethod` in required variant. Validates and creates a server-side review draft, then 303 to review. This does **not** insert a record. |
| GET `/apply/review?draft=...` | Displays stored values and exact notice; original final-submit form contains `csrf`, `draftId` |
| POST `/apply/submit` | The only record insertion handler. Takes `csrf`, `draftId`, checks session/current requirements/current notice again, commits, then 303 to receipt. Additional posted values cannot override the reviewed draft. |
| GET `/receipt/:id` | Session-owned real record, `<output aria-label="접수 번호">`, `<section role="status">`; absent/other session record is 404 |
| GET `/history` | Only current session's actual records |
| GET `/assets/site.css` | Local stylesheet; no external resources |

Read hidden CSRF and form tokens from the current native form for source tests. They are standard security state, not planner hints. `formToken` authenticates the currently displayed important terms/required-field set; a stale form or review returns 409 and requires renewed consent. Missing/invalid fields return 422, bad login 401, CSRF/foreign Origin 403. Redirects use 303. Full document navigation is intentional; no client auto-submission/retry exists. `Referrer-Policy: same-origin` preserves a real browser's same-origin POST Origin while excluding external referrers.

Idempotency: the same submitted `draftId` returns its existing receipt. Different drafts for the same order/session are blocked. A database `UNIQUE(session_id, orderNumber)` constraint is the final barrier, and record insertion, draft consumption and insertion counter increment are one transaction. Other sessions may submit the same synthetic fixture.

## QA-only oracle and fault injection

All three routes require **exact** `x-flecto-qa-token` matching configured `qaToken`; the comparison uses SHA-256 fixed-size digests and `timingSafeEqual`. Missing/wrong/disabled tokens get 404 before parsing a body. No CORS allowance, token in HTML, UI QA link or shared secret configuration is provided. QA responses never expose raw session cookies or session secrets.

`GET /__qa/records` returns:

```ts
{
  records: Array<{
    id: string; sessionId: string; // one-way session digest, NOT cookie/session credential
    orderNumber: string; purchaseDate: string; category: string;
    contactMethod: string; consent: boolean; noticeText: string; createdAt: string;
  }>;
  count: number;          // current number of real record rows
  insertionCount: number; // actual committed insertions since last reset; persisted on restart
  namespace: 'QA' | 'DEMO';
}
```

`POST /__qa/reset` with JSON `{}` clears this owned synthetic database's records and review drafts and sets insertionCount to zero. Sessions and fixture orders remain. Variant/fault configuration remains, so clear faults explicitly. It cannot clear a different namespace/database. It does not touch Chrome storage, passwords, personal files or other services.

`POST /__qa/config` accepts one or more of:

```ts
{
  variant?: 'default' | 'decorations' | 'required' | 'notice' | 'duplicate-form';
  fault?: 'none' | 'rejection' | 'delayed' | 'connection-loss';
  delayMs?: number; // integer 0..2000; default 500
}
```

The response is `{variant, fault, delayMs}`. Unknown keys/values return 400. Configuration is process-local and resets on restart (the constructor's variant still applies).

- `decorations`: reversed menu order, changing decorative class and generated input IDs on each render; native labels remain linked.
- `required`: adds the required native `contactMethod` select. Choices: **접수 내역에서 확인**, **알림 받지 않음**.
- `notice`: changes the exact deadline from **10월 7일 오후 6시** to **10월 5일 오후 6시**, and **5,000** to **3,000** synthetic points. Old consent/form/review cannot submit.
- `duplicate-form`: separate GET help form has the same button label as the application form, and likewise on the review page. Clicking it only navigates to help.
- `rejection`: final submit returns 503 before insertion, with no success output.
- `delayed`: final submit waits the configured bounded delay, then rechecks session, draft, latest notice and required fields before saving.
- `connection-loss`: final submit **commits once, then destroys the response connection**. This models ambiguous completion. Inspect history/oracle; only an explicit user retry occurs, and the same draft remains idempotent. `Fastify.inject` rejects with a connection error in this mode.

## Verification and boundaries

From the isolated checkout, with the provided Node 24 bin directory prepended to PATH:

```sh
node node_modules/vitest/vitest.mjs run --config apps/demo-benefits/vitest.config.ts
node node_modules/typescript/bin/tsc --noEmit --pretty false
git diff --check
```

Own source tests are in `tests/unit/benefits-source.test.ts`; temporary DBs and Vitest cache stay under this application. No root dependencies, package manifests, lockfiles or original requirement tests are modified. Tests cover the source-side responsibilities of T01/03/06/07/08/09/12/13/14/26/29/37/40, including actual SQL rows, restart, isolation, reset and lost responses. These are **not** complete FLECTO integration assertions for those IDs.

Browser smoke on 2026-09-29: Codex IAB, real localhost listener, direct login → native form → explicit consent → review → original final submit → actual receipt → history. The first attempt exposed a `no-referrer`/Origin-null incompatibility; after the same-origin policy fix, the complete flow succeeded. Desktop screenshots were inspected for heading hierarchy, labels, controls, notice wrapping and receipt readability. No image-generation dependency was introduced.

Limits: synthetic local service, not production authentication or real benefit delivery. Required UI variants are mutually exclusive but can combine with any fault. Cold/warm planner, extension rebinding/privacy, holdout independence, real Chrome password-manager/OS IME, mobile/200% zoom and product LIVE are not verified by this patch. QA authorization does not itself prove the extension process lacks OS-level DB access. Launch policy and OS isolation belong to integration. No external submission occurred.
