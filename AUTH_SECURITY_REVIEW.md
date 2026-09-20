# Login + Registration — Security Review (Google + email/password)

Scope: storefront sign-up, login, Google OAuth, sessions, logout, and the Supabase policies behind them.
Method: read the code, compared it with the official docs, and **attacked it with real requests** against the
Supabase project (results are the failing/passing tests in `storefront/tests/security`).

Docs used: Next.js (`node_modules/next/dist/docs/01-app/02-guides/data-security.md`, `authentication.md`,
`content-security-policy.md`), Google OAuth 2.0 / OpenID Connect, Supabase Auth (identity linking, `signOut`, SSR).

## Status legend
✅ fixed in code · 🟥 needs a SQL migration you must run · 🟧 needs a dashboard/config decision · ⬜ accepted / later

## Findings

| # | Sev | Finding | Evidence | Status |
|---|---|---|---|---|
| 1 | **Critical** | **Anyone can approve themselves.** The `customers` insert policy only checked `auth.uid() = supabase_user_id`, so a user could `INSERT` their own row with `status = 'approved'` straight through the public Supabase API (sign-up is open). The stored row came back `approved`; prices, cart and checkout follow from that. | Live probe; test `[needs 018] a user CANNOT insert their own row already APPROVED` fails until fixed | ✅ `018-harden-customer-registration-insert.sql` applied and verified (self-approval now rejected by the database) |
| 2 | High | Same insert could also set `approved_at`, `shopify_customer_id`, `account_number`, `sales_rep_id`. | test `[needs 018] … smuggle admin-assigned fields` | ✅ 018 applied and verified |
| 3 | High | **Duplicate applications possible** — no unique constraint; a second insert for the same user was accepted (double-click / direct API). Same email could also be registered twice with different capitals. | tests `[needs 019] one user cannot hold two applications`, `… same email cannot be registered twice` | ✅ 019 applied and verified by the tests (unique on `supabase_user_id` and `lower(email)`) |
| 4 | High | **Licence bucket has no size or type limit.** Any signed-in user could upload any file, any size, to storage. | `getBucket` → `file_size_limit: null`, `allowed_mime_types: null`; tests `[needs 019] … rejects file types`, `… enforces a maximum file size` | ✅ 019 applied and verified (10 MB; jpg/png/pdf/doc/docx) |
| 5 | High | `submitRegistration` trusted the client (the wizard's `required`/`accept` mean nothing to a direct POST). No length caps, no required-field check, no file checks. | Next.js data-security guide: *"always validate input from the client"* | ✅ `lib/auth/application-validation.ts` + 14 unit tests |
| 6 | Med | Our `gd-auth-intent` cookie was set by `document.cookie` (readable/forgeable by page JS, no `Secure`). | Next.js authentication guide: *"cookies should be set on the server to prevent client-side tampering"* | ✅ now a server action: HttpOnly, `Secure` in production, SameSite=Lax, 10 min, allow-listed value |
| 7 | Med | No security headers at all. | `curl -I` | ✅ `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS in `next.config.ts`. Full CSP ⬜ (needs nonces + dynamic rendering; Google Maps + Shopify CDN — separate project) |
| 8 | Med | **Sign-up is completely open**: no CAPTCHA, email confirmation OFF, so anyone can mint Auth users (and, before #1 was fixed, approved customers). Only Supabase's per-IP limits apply. | `e2e/rate-limiting.spec.ts` was already paused on this question | 🟧 turn on CAPTCHA (Supabase → Auth → Attack Protection) and decide on Confirm email |
| 9 | Med | **Pre-registration takeover** (Confirm email OFF). Supabase marks the email as confirmed at sign-up, so an attacker who registers `victim@x.com` with a password first shares an account with the victim when the victim later uses Google (verified live: password + Google link to one user). Admin approval is the only guard. | identity-linking test | 🟧 Confirm email ON (only real fix) |
| 10 | Med | **Admin check trusts the email claim** (`is_current_user_admin()` compares `admin_users.email` to the JWT email) and emails aren't verified. Safe today (all 4 admin emails already have Auth users, so nobody can sign up as them), but a *new* admin email added before that person signs up can be squatted. | policy text + `admin_users` vs `auth.users` check | 🟧 key `admin_users` on user id, or Confirm email ON |
| 11 | Med | `checkRegistrationEmail` is a public action that reads `customers` with the **service-role key** and tells anyone whether an email is registered (asked for explicitly; standard sign-up trade-off). Least-privilege would be a `SECURITY DEFINER` function returning only a boolean. No rate limit. | code | 🟥 `020-least-privilege-reads.sql`: `email_registered()` SECURITY DEFINER returns one bit; the action now uses the anon key, so the service-role key is used only to delete an orphaned Auth user. Still pair with CAPTCHA / Vercel Firewall rate limit (⬜) |
| 12 | Low | `sales_reps` (name/phone/email) readable by every signed-in user. Intentional so a customer sees their rep, but with open sign-up "signed in" ≠ customer. | test marked `todo` | 🟥 020: policy now requires an approved customer (admins unaffected) |
| 13 | Low | JWT stays valid until expiry after logout (Supabase docs). No inactivity timeout. | Supabase `signOut` docs | 🟧 shorten JWT expiry; time-box / inactivity timeout are Pro-plan features |
| 14 | Low | "Forgot password?" is a dead link (`href="#"`). | `LoginModal.tsx` | ⬜ build the reset flow |
| 15 | Info | Google client secret was pasted in a chat; app still in Testing mode. | — | 🟧 rotate secret before launch; publish to Production |
| 16 | Info | The `ayush5555jaiswal@gmail.com` **admin** account had its password replaced by a known test value during this work. | — | 🟧 set a new password (Supabase → Users) |

## API-call review against the official docs

| Call | Public? | Checked | Verdict |
|---|---|---|---|
| `signInWithPassword` (Server Action) | yes | input type/length guard; approval gate after sign-in; generic error (no enumeration) | ✅ |
| `setAuthIntent` (Server Action) | yes | value normalised through the allow-list; server-set HttpOnly cookie | ✅ |
| `submitRegistration` (Server Action) | yes | now validates fields/files; branch chosen from the **server** session, email taken from the session, `accountType` allow-listed; failure path never deletes a Google user | ✅ (RLS hole #1 closed by 018) |
| `checkRegistrationEmail` (Server Action) | yes | input-checked; asks the one-bit `email_registered()` DB function with the anon key (020) | 🟥 run 020; ⬜ rate limit (#11) |
| cart / checkout / order actions | need approval | every one re-checks `getCustomerAccessState()` server-side (Next.js: *"a Server Action is a separate entry point and must verify the caller"*) | ✅ (e2e re-verifies for guest / applicant / pending / rejected) |
| `GET /auth/callback` | yes | code exchange; intent from cookie only; every redirect is `origin` + fixed path (no open redirect); errors are codes, never text; signs out non-approved sessions | ✅ (17 e2e tests) |
| `signInWithOAuth` | — | PKCE code flow via Supabase, exact allow-listed `redirectTo` (no query string), minimal scopes, `prompt=select_account` | ✅ |
| `proxy.ts` | — | refreshes the session only; gating is per page/action (Next.js: proxy must not be the only auth layer) | ✅ |
| Supabase clients | — | browser: anon key only; service role only behind `server-only` | ✅ |
| Supabase auth cookies | — | set by `@supabase/ssr` and readable by the browser client **by design**; not HttpOnly | ⬜ accepted (standard for Supabase SSR) |

## Google OAuth — what the official docs require, and where we stand
- Use `sub` as the identity, not email → Supabase keys users by id; we key `customers.supabase_user_id` on it. ✅
- Trust an email only when verified → Google emails are; **our** password emails are not (#9). 🟧
- Authorization-code + PKCE + `state` → handled by Supabase + `@supabase/ssr`. ✅
- Redirect URIs must match exactly → Supabase Redirect URLs list must contain `…/auth/callback` with **no** query. ✅ (root cause of an earlier "lands on home" bug)
- Consent screen: publish to Production before launch; email/profile scopes need no Google verification. 🟧

## To close everything
1. Run `018` then `019` in the Supabase SQL editor, then `npm run test:security` — every test should be green.
2. Dashboard: CAPTCHA, decide Confirm email, rotate the Google secret, reset the admin password.
3. Re-run: `npm run test:unit`, `npm run test:security`, `npx playwright test e2e/auth-*.spec.ts`.

## Server-action gate guard rail
`tests/unit/server-action-gates.test.ts` walks every `'use server'` file: each exported action must check
`getCustomerAccessState()` / `isCustomerApproved()` (directly, via a same-file function, or via the gated
`lib/wishlist.ts` / `lib/saved-locations.ts`), or be on an explicit public allow-list with a reason. A new action
without a gate, or a new unreviewed `'use server'` file, fails the test. Mutation-checked: removing a gate makes it fail.
It catches "forgot the gate", not "one code path skips it" — the E2E suites cover behaviour.

## Still open (needs you, not code)
CAPTCHA (needs Turnstile keys) · Confirm email decision · Vercel Firewall rate-limit rule on `/apply`, `/register/retailer`
and the login action · rotate the Google client secret · reset the admin password · full CSP.

---

# Wider codebase audit (2026-09-20) — storefront + admin panel

Method: enumerated everything reachable from outside (17 tables, 13 RPC functions, 11 route handlers, 16 Server-Action
files, dependencies), then attacked each with real requests as **anon** and as a **freshly signed-up non-admin** user.
Docs: Next.js `data-security.md` (DAL, "Server Actions are public endpoints"), Supabase RLS/`SECURITY DEFINER` guidance.
(Method note: an insert probe must not chain `.select()` — `RETURNING` also evaluates the SELECT policy and hides tables
whose insert is open but select is closed. That mistake initially hid #18 and was caught and redone.)

## New findings

| # | Sev | Finding | Evidence | Status |
|---|---|---|---|---|
| 17 | **High** | `upsert_cart_snapshot_batch(p_customer_id, p_items)` is `SECURITY DEFINER` and was granted to **`anon`**. It deletes every `cart_snapshot` row for the given customer id, then inserts whatever the caller sends — no ownership check, no size limit. Anyone (no login) could wipe/overwrite a customer's cart record or bloat the table. The admin panel's cart/funnel analytics (what sales reps act on) is built from it. | probe: anon `EXECUTED`; test `[needs 021] … CANNOT write or wipe ANOTHER customer's cart record` fails | 🟥 `021-lock-down-cart-tracking.sql` (ownership check, ≤500 lines, qty bounds, no anon) |
| 18 | **High** | `cart_events` insert policy is `check (true)` ("Anyone can log cart activity"): unlimited junk rows for any customer/product/action from the open internet. | probe: anon insert passes RLS (fails later only on a NOT NULL) | 🟥 021 (approved customer, own id, known actions, sane quantity) |
| 19 | **Critical (dependency)** | Admin panel ran **Next.js 16.3.1**, inside the range of two critical advisories (`>=16.0.0 <16.3.3`): GHSA-p293-qw3h-jr36 (unauthenticated RCE on Windows hosts) and GHSA-2xp9-vwfh-vxw4 (unauthenticated RCE in the image-optimization API with AVIF). Storefront is on 16.3.3 (patched, `npm audit` 0). | `npm audit --omit=dev` | ✅ upgraded to `next@16.3.5` (`npm audit`: 0 vulnerabilities, `tsc` clean). **Only takes effect once admin-panel is redeployed.** |
| 20 | Med | Admin product page renders Shopify `descriptionHtml` with `dangerouslySetInnerHTML` **unsanitised** (`products/[id]/page.tsx:136`) — stored XSS inside the highest-privilege app if anyone who can edit product descriptions (staff, Shopify apps, importers) inserts script. | grep | ⬜ open — sanitise with an allow-list sanitiser (needs a new dependency; waiting for your OK) |
| 21 | Med | Admin `auth/confirm` redirected to whatever `next=` said (`new URL(next, request.url)`), so a link with a valid token and `next=https://evil.example` sent a freshly signed-in admin off-site; `type` was unchecked. | code | ✅ `next` must be a same-site relative path; OTP `type` allow-listed |
| 22 | Low | `placeOrderAction` forwarded `note` / `discountCode` to Shopify with no length cap (Server Action = direct POST). | code | ✅ capped (1000 / 100) |
| 23 | Low-Med | Internal dashboard tables readable by **anyone** (`using (true)`): `product_health_snapshot` (2k rows), `variant_sku_index`, `store_stock_totals`, `out_of_stock_items`, `low_stock_items`. (`inventory_snapshot` is public **by design** — the storefront reads live stock from it with the anon key.) | probe: anon `select` returns rows | 🟧 optional block in 021, commented out: the admin dashboard reads two of them live **from the browser** (Realtime), so test the dashboard after applying |
| 24 | Info | `[auth] … ALLOWED/BLOCKED` `console.log` on every cart action (no personal data, just noise). | grep | ⬜ remove eventually |
| 25 | Info | Webhook de-duplication is in-memory (per server instance). Replaying a validly-signed webhook is only possible with a captured one and the handlers are idempotent ("upsert if newer"). | code | ⬜ accepted |
| 26 | Info | Google Maps key is `NEXT_PUBLIC_` (unavoidable for the JS API). | env | 🟧 restrict it in Google Cloud: HTTP-referrer allow-list + only the Maps/Places APIs |

## Checked and fine (with evidence)
- **All 13 RPCs** other than #17/`email_registered`/`is_current_user_admin`: `approve_customer`, `reject_customer`, `update_customer_account_type`, inventory/health/order-log functions → **denied** to anon and to a non-admin signed-in user (revoked from `public/anon/authenticated`, granted to `service_role` only).
- **All 17 tables**: no anon/non-admin insert except `cart_events` (#18); customers, carts, wishlists, saved locations, notes, admin_users → 0 rows for a non-admin.
- **Webhooks** (`storefront` ×2, `admin` ×3): raw-body HMAC-SHA256, length check + `timingSafeEqual`, topic allow-list, dedup.
- **Internal endpoints** (`/api/internal/*`, ×4): shared secret, `timingSafeEqual`, refuse everything when the secret is unset.
- **Admin panel access control**: follows the Next.js *Data Access Layer* pattern — 41 of 46 exported data functions call `requireAdmin()`; the other 5 are pure/sign-out or reachable only through the shared-secret internal routes. Licence download URLs: admin-gated, 60 s.
- Every storefront Server Action is gated or on the reviewed public list (unit test `server-action-gates`).
- No secrets in `NEXT_PUBLIC_*`; `.env*` git-ignored; no GraphQL/SQL built by string interpolation found; `npm audit` storefront: 0.

## What to run / do now
1. **`021-lock-down-cart-tracking.sql`** (then `npm run test:security` — the six `[needs 021]` tests should go green).
2. **Redeploy admin-panel** so `next@16.3.5` is actually live.
3. Say yes to sanitising `descriptionHtml` (#20).
