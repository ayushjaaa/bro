# TESTING — how our tests are organised

One rule: **a test lives where the feature lives, and says which checklist item it proves.**
Feature list and progress: `SECURITY_REVIEW_TRACKER.md`. What to check per feature: `PRODUCTION_SECURITY_CHECKLIST.md`.

## 1. The four kinds of test (and when to use which)

| Kind | Where | Speed | Needs | Use it for |
|---|---|---|---|---|
| **Unit** | `storefront/tests/unit/`, `admin-panel/tests/unit/` | seconds | nothing | Pure rules: validators, parsers, "who may be deleted", and **static guard rails** (e.g. "every action is gated") |
| **Database (live)** | `storefront/tests/security/` | ~1–2 min | Supabase + service key | RLS, policies, RPC/function behaviour, storage rules — "even if the app is bypassed, does the DB refuse?" |
| **Browser (e2e)** | `storefront/e2e/<feature>/` | minutes | both dev servers + Supabase + e2e accounts | Real user flows, plus **hostile requests** (edit the request in flight, replay an action, call a route directly) |
| **Manual** | checklist inside the feature's plan doc | — | a human | What cannot be automated (real Google consent screen) |

The Playwright config lives in `storefront/` and starts **both** apps (storefront :3000, admin-panel :4000), so admin-panel
browser tests are written in `storefront/e2e/` too (a "cross-app" suite). Admin has no Playwright of its own.

## 2. Folder layout

```
storefront/e2e/
  fixtures.ts, auth-helpers.ts     shared helpers (one place; import with '../fixtures' from a feature folder)
  auth/                            F1  login, callback, registration, session, admin-access, hardening
  cart/  checkout/  account/  …    one folder per feature as we review it (F2…F8)
  (older specs still at the root until their feature is reviewed — then they move into their folder)
storefront/tests/unit/             pure logic, storefront
storefront/tests/security/         live DB / HTTP-route tests
admin-panel/tests/unit/            pure logic + static guard rails, admin
```

**Naming:** `e2e/<feature>/<what-it-proves>.spec.ts` — no feature prefix inside the folder
(`auth/login.spec.ts`, not `auth/auth-login.spec.ts`). Group inside a file with `test.describe('<n>. <plain sentence>')`.
Put the checklist/finding id in the title when a test proves a fix: `(F1-5)`.

## 3. Feature test maps

### F1 — Auth & registration: where everything is

| What | File |
|---|---|
| Login (approved / pending / rejected / none, Google button wiring) | `e2e/auth/login.spec.ts`, `login-rejection.spec.ts` |
| Google callback edge cases | `e2e/auth/callback.spec.ts` |
| Registration wizards (wholesale + retail, Google applicant, double click) | `e2e/auth/registration.spec.ts` |
| Hostile registration (forged province / file / signature time, failed submit → cleanup) | `e2e/auth/registration-hardening.spec.ts` |
| Sessions, logout, mid-session status change | `e2e/auth/session.spec.ts`, `session-invalidation.spec.ts`, `concurrent-status-change.spec.ts` |
| **Admin panel access** (logged out, customer session, sign in/out, rights removed mid-session, replayed actions, internal + webhook routes, `/auth/confirm`, login input) | `e2e/auth/admin-access.spec.ts` |
| Storefront ↔ admin credential isolation | `e2e/auth/cross-app-credentials.spec.ts` |
| Registration validation, file sniffing, error mapping | `tests/unit/application-validation.test.ts` |
| Every storefront action gated / public-listed | `tests/unit/server-action-gates.test.ts` |
| No service-role key in the storefront | `tests/unit/no-service-role-in-storefront.test.ts` |
| **Every admin data function + action gated; pages only under `(dashboard)`** | `admin-panel/tests/unit/admin-gates.test.ts` |
| Admin login input, cleanup-route rules, redirects, shared secret | `admin-panel/tests/unit/login-input.test.ts`, `applicant-cleanup.test.ts`, `safe-redirect.test.ts`, `internal-auth.test.ts` |
| RLS on customers, no self-approve, licence bucket | `tests/security/db-security.test.ts` |
| SQL 026: applicant file delete, `email_registered` | `tests/security/registration-hardening.test.ts` |

### F2 — Cart: where everything is

| What | File |
|---|---|
| **C-1 shared-device cart carry-over** (the fixed bug + a control case that must still work) | `e2e/cart/shared-device.spec.ts` |
| Live-catalogue helpers (find something purchasable / a real low-stock variant) | `e2e/cart/helpers.ts` |
| Cart ownership decision logic (pure) + guard rail (only `lib/cart-cookies.ts` may touch the cart cookies) | `tests/unit/cart-ownership.test.ts` |
| Add/update/remove input validation, duplicate-variant merge, Shopify-error mapping | `tests/unit/cart-input.test.ts` |
| SQL 027: `customer_carts` pointer format + ownership, `cart_events` length cap | `tests/security/cart-hardening.test.ts` |
| Add/merge/update/remove through the real UI, dual pricing, stock edge cases | `e2e/checkout/pricing-inventory-checkout.spec.ts` (shared with F3, see below) |

### F3 — Checkout & Orders: where everything is

| What | File |
|---|---|
| Dual pricing by account type, cart merge/update, stock edge cases, draft-order price regression | `e2e/checkout/pricing-inventory-checkout.spec.ts` |
| Real stock cap through draft → paid, using a dedicated non-shared product | `e2e/checkout/stock-flow.spec.ts` |
| **O-1 double-order idempotency** (pure decision table + concurrency) | `admin-panel/tests/unit/order-idempotency.test.ts` |
| **O-2 own-data functions self-check approval** (order-history routes refuse a manufactured non-approved-but-linked customer) | `tests/security/order-history-approval.test.ts` |
| **O-3 blank-name / required-address-field validation** | `admin-panel/tests/unit/draft-order-input.test.ts` |
| **O-4 checkout errors never leak Shopify/DB internals** (stock shortfall, unknown customer) + **O-7** (an unrecognised discount code is silently dropped, not rejected — documented, not yet decided) | `tests/security/checkout-response-safety.test.ts` |
| "Expected data first" for stock: Shopify vs Supabase side by side, live low-stock discovery | `scripts/e2e/stock-snapshot.ts`, `e2e/fixtures.ts`'s `findLowStockVariant()` |

### Webhooks — where everything is

Every route Shopify (or Sanity) can call into: signature verification, topic/shop filtering, dedup,
and — the part that had zero coverage before 2026-09-23 — the **happy path** (a genuinely valid,
correctly signed delivery actually gets accepted and produces the right side effect, not just a
"not rejected" response). Two parallel copies of the same coverage exist on purpose (see each
file's own doc comment): the `tests/security/*.test.ts` ones are what `npm run test:security` runs
locally against `localhost`; the `e2e/webhooks/*.spec.ts` ones are Playwright specs that can be
pointed at a real deployed environment via `E2E_BASE_URL`/`E2E_ADMIN_URL`, same as `e2e/auth/`.

| What | File |
|---|---|
| storefront `/api/webhooks/products`, `/api/webhooks/taxonomy`: signature/topic/shop/dedup + happy path (cache tag actually revalidated) | `tests/security/http-routes.test.ts` |
| storefront `/api/webhooks/sanity`: secret check + happy path | `tests/security/sanity-webhook.test.ts` |
| admin-panel `/api/webhooks/products`, `/api/webhooks/orders`, `/api/webhooks/inventory`: signature/topic/shop/dedup + happy path (real `product_health_snapshot`/`order_status_log` row verified in Supabase; inventory's happy path is a deterministic 503-for-unknown-item case instead, since that route awaits a real Shopify re-query — see the file's own note) | `admin-panel/tests/security/webhooks.test.ts` |
| Same 3 apps' worth of coverage, Playwright/E2E_BASE_URL-driven (for testing a real deployment) | `e2e/webhooks/storefront-webhooks.spec.ts`, `e2e/webhooks/admin-panel-webhooks.spec.ts` |

**Still missing (not automatable the same way):** actually triggering a webhook from Shopify/Sanity
itself (editing a real product, publishing a real Sanity page) and confirming end-to-end that the
live subscription's callback URL is current — the registered-subscription URL itself isn't
something a route-level test can see. Check it manually via Shopify Admin → Settings → Notifications
→ Webhooks (or the `shopify:unregister-*-webhook` scripts run with no id, which list current
subscriptions) whenever the production domain changes.

## 4. How to run

```bash
# unit (fast, no setup)
cd storefront   && npm run test:unit
cd admin-panel  && npm run test:unit

# live database + browser: the service-role key is NOT in storefront/.env.local any more,
# so hand it to the command (it is read from the admin panel's env, never written anywhere):
cd storefront
export SUPABASE_SERVICE_ROLE_KEY="$(grep '^SUPABASE_SERVICE_ROLE_KEY=' ../admin-panel/.env.local | cut -d= -f2- | tr -d '"')"
npm run test:security                 # live DB / routes
npm run e2e:setup                     # creates the e2e accounts (incl. an e2e admin)
npx playwright test e2e/auth          # one feature folder   (or:  npm run test:e2e:auth)
npm run e2e:teardown                  # ALWAYS finish with this: removes the e2e accounts
```
These hit the **live** Supabase project. Every test user is `…@e2e.test.internal` and removed afterwards.

## 5. Rules for a new feature's tests (F2 Cart, F3 Checkout, …)

1. **Expected data first.** Before running, write the expectation sheet from a fresh snapshot (see the template in
   `SECURITY_REVIEW_TRACKER.md` F1 log) — never hard-code "product X has 5 units".
   **For anything stock/inventory-related specifically:** check BOTH sources before writing or re-running the test —
   Shopify (the real source of truth, read via the Storefront API the same way the page does) AND Supabase's
   `inventory_snapshot` (what the storefront's own stock-cap logic actually reads at runtime, `lib/shopify/queries/products.ts`'s
   `getLiveStockForVariants`). Run `npx tsx --env-file=.env.local scripts/e2e/stock-snapshot.ts [handle...]` (storefront) to see
   both side by side and flag any drift between them. Never assume a hardcoded product still has "N units left" — real inventory
   moves (this happened twice to `price-test-low-stock-federal`: every one of its variants drifted to either 0 or 50, none
   "a few left"). Prefer discovering a currently-real low-stock product live (`e2e/fixtures.ts`'s `findLowStockVariant()`) over a
   hardcoded handle, the same way `e2e/cart/helpers.ts`'s `findAddableProduct()` already does for "is anything in stock at all".
2. **Create your own fixtures** (throw-away users/rows named `e2e-<feature>-…@e2e.test.internal`) and delete them in `afterAll`.
3. **Every negative test needs a positive control**: prove the *allowed* actor succeeds, otherwise "refused" might just mean "broken".
4. **Test the boundary, not the button**: call the action / route directly (capture the action, edit the request, replay it) —
   the UI hiding something proves nothing.
5. **A refusal must also be generic**: assert no Supabase/SQL/Shopify text and no raw row in the response.
6. **Add a static guard rail** when a rule must hold for *all future code* (like `admin-gates.test.ts`); check that it really fails
   by breaking the rule once on purpose.
7. **A fix gets a regression test** that fails before the fix and passes after; put the finding id in its title.
8. Anything that needs a real third party (Google consent, real payment) goes on the **manual checklist** of the feature's plan doc.
9. When a feature is done: move its old root-level specs into `e2e/<feature>/`, fix the imports (`'../fixtures'`), update the table in section 3
   (add a section for the feature), and tick the row in `SECURITY_REVIEW_TRACKER.md`.
