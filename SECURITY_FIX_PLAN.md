# Security Fix Plan — wider audit findings #17–#23

Source: `AUTH_SECURITY_REVIEW.md` → "Wider codebase audit". This plan says, for every fix: what is wrong, what the
official docs recommend, exactly what changes, **what could break and how we know it didn't**, how it is verified,
and how to undo it. Nothing here changes what a legitimate customer or admin can do.

Status legend: ☐ to do · ☑ done · 👤 needs you (dashboard / SQL editor / deploy)

## 0. Order of work and dependencies

| Step | Fix | Type | Needs from you |
|---|---|---|---|
| 0 | ☑ Baseline: existing regression specs run first (10 of 13 failed — all from old drift, see log) and repaired | test | — |
| 1 | F1 + F2 — lock down cart tracking (`021`) — ☑ SQL + 8 tests written | SQL + tests | 👤 run `020` then `021` |
| 2 | ☑ F5 — same-site-only redirect in admin `auth/confirm` (helper + 5 unit tests) | code + unit tests | — |
| 3 | ☑ F4 — sanitise admin product description HTML (`sanitize-html@2.17.7`, 13 unit tests) | code + dependency + unit tests | — |
| 4 | ☑ F6 — length caps on order note / discount code | code | — |
| 5 | F7 — admin-only dashboard tables (`022`) — ☑ SQL + DB tests + Realtime test written | SQL + live admin check | 👤 run `022` |
| 6 | F3 — Next.js 16.3.5 in admin panel — ☑ bumped (`npm audit` 0, `tsc` 0) | dependency + verify | 👤 restart admin dev server, then **redeploy admin** |
| 7 | Full regression — ☑ unit 63 + 18, old regression set 16/16, auth e2e; security suite goes fully green once 020/021/022 are run | test | — |

`020` must be run before `021` (independent, but the security suite expects both). `022` is deliberately its own file so it
can be applied, checked, and rolled back on its own.

---

## F1 + F2 — Cart tracking writable by anyone (High)  → `021-lock-down-cart-tracking.sql`

**Problem.** `cart_events` has an insert policy `check (true)`; `upsert_cart_snapshot_batch(p_customer_id, p_items)` is
`SECURITY DEFINER`, granted to `anon`, deletes all rows for *any* `p_customer_id`, and inserts unlimited caller-chosen rows.
Confirmed by probe (anon `EXECUTED`; insert passes RLS) and by tests (`[needs 021]`, six failing).

**Official guidance used** (Supabase RLS docs):
- name the role in every policy (`to authenticated`) so `anon` stops at the role check;
- insert policies use `with check` only;
- wrap `auth.uid()` in `(select auth.uid())` so it is evaluated once per statement, not per row;
- a `SECURITY DEFINER` function is callable over the API with its creator's privileges → set `search_path`, revoke from
  `public/anon`, grant only to the roles that need it;
- `service_role` bypasses RLS, but only when the request carries no user token.

**Change.**
1. `cart_events`: drop *"Anyone can log cart activity"*; new policy `to authenticated` requiring: known action
   (`add_to_cart | update_quantity | remove_from_cart`), quantity `null` or `0..100000`, and `customer_id` = the caller's own
   **approved** `customers.id`.
2. `upsert_cart_snapshot_batch`: `search_path = ''` with `public.`-qualified names; reject unless caller is `service_role`
   **or** owns an approved customer row equal to `p_customer_id`; reject non-array / > 500 lines; clamp quantity `1..100000`;
   cap text at 200 chars; **aggregate duplicate variants** (`group by variant_id`, `sum(quantity)`) so a repeated variant can't
   raise "ON CONFLICT … cannot affect row a second time"; `revoke` from `public, anon, authenticated`, `grant` to
   `authenticated, service_role`.

**What could break — and evidence it won't.**
| Risk | Evidence |
|---|---|
| A legitimate write is rejected | Only writer is `lib/cart-tracking.ts → reportCartActivity`, called from 3 server actions with `access.customer.id` (approved customers only) and the customer's own session client. Ownership check therefore always holds. |
| Login-time flow | `restoreCartOnLogin` writes only `customer_carts` (its own RLS), not these two objects. |
| `auth.role()` inside a definer function | Same technique the existing `is_current_user_admin()` (migration 006) already uses with `auth.jwt()`. |
| Admin panel reads | Admin only **reads** `cart_events`/`cart_snapshot` (admin SELECT policies untouched); server code uses the service role, which the function still allows. |
| Other writers | Repo-wide search: none (only the probe/test files I wrote). |
| Existing data | Policy/function change only; no row is modified. |

**Verify.** `npm run test:security` → the six `[needs 021]` tests go green (anon blocked; non-approved blocked; approved can
write **own** but not another's; bad action/quantity rejected; >500 lines rejected). Plus e2e: an approved customer adds an item
and a `cart_snapshot` row appears (`approved-flow` + a targeted check).

**Rollback.** Re-create the old policy `for insert with check (true)` and the old function body/grants (kept as comments at the
bottom of the migration).

---

## F5 — Open redirect in admin `auth/confirm` (Medium-Low)  ☑ code, ☐ extract + test

**Problem.** `NextResponse.redirect(new URL(next, request.url))` follows any `next`, incl. `https://evil.example` and `//evil.example`.

**Change (done).** `next` must start with a single `/`, no `//`, no backslash, else `/`; OTP `type` restricted to
`invite | magiclink | recovery | signup | email | email_change`.
**Remaining.** Move the check into `admin-panel/src/lib/safe-redirect.ts` (`safeRelativePath`) so it is unit-testable, and add
`tsx --test` to admin-panel (`tsx` already a devDependency).

**What could break.** Real links only ever use relative `next` values (`/`, `/set-password`…); those pass unchanged. A link with an
off-site `next` is exactly what we want to neutralise.
**Verify.** Unit tests (`/x` ok, query strings ok, `https://…`, `//…`, `/\…`, `javascript:` → `/`; `new URL(out, base).host` always the base host).

---

## F4 — Stored XSS via product description in admin (Medium)

**Problem.** `dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}` in the admin product page (a **server component**).

**Official guidance used** (OWASP XSS Prevention): sanitise untrusted HTML with an **allow-list** at output time using a
maintained library; *never modify the string after sanitising*; keep the library patched; React's `dangerouslySetInnerHTML`
is an escape hatch that needs sanitised input.

**Library choice.** OWASP names DOMPurify. On the server DOMPurify needs `jsdom` (heavy, and known to bundle badly in
serverless), so we use **`sanitize-html`** — pure JS, allow-list based, maintained, no DOM required, runs in a server
component. Same principle (allow-list, sanitise last). If it ever proves a problem, `isomorphic-dompurify` is the fallback.

**Change.** New `admin-panel/src/lib/sanitize-html.ts` → `sanitizeProductHtml(html)`:
- allowed tags: `p br hr strong b em i u s ul ol li h1–h6 blockquote a img table thead tbody tr th td span div`;
- attributes: `a[href,title,target,rel]`, `img[src,alt,width,height]`, table cells `colspan/rowspan`; **no** `style`, no `on*`, no `class`;
- schemes: `http`, `https`, `mailto` (links); `https` only (images); `javascript:`/`data:` dropped;
- links forced to `rel="noopener noreferrer"`; result is used **as returned** (no post-processing).
- page.tsx: `__html: sanitizeProductHtml(product.descriptionHtml)`.

**What could break.** Normal descriptions (paragraphs, bold, lists, links, images, tables) render identically. Inline colours/fonts
(`style=`) are dropped — the panel already styles descriptions with Tailwind `prose`, so the visible change is limited to
descriptions that relied on inline styles. Storefront is unaffected (it renders plain text, not HTML — searched).
**Verify.** Unit tests: `<script>`, `<img onerror>`, `javascript:` href, `data:` src, `<iframe>`, `<svg onload>`, nested
tricks, `style="…expression(…)"` are neutralised; ordinary rich text is preserved; output of already-clean HTML is stable.

---

## F6 — Free-text order fields uncapped (Low)  ☑ code

`placeOrderAction`: `note ≤ 1000`, `discountCode ≤ 100` (Server Actions are directly POST-able; Next.js data-security guide).
**What could break.** Nothing realistic (a 1000-character delivery note is already generous).
**Verify.** `tsc` clean; regression: existing checkout specs unchanged (baseline compare). The limits live next to the check so they are reviewable.

---

## F7 — Internal dashboard tables readable by anyone (Low-Medium)  → `022-admin-only-dashboard-tables.sql`

**Problem.** `product_health_snapshot`, `variant_sku_index`, `store_stock_totals`, `out_of_stock_items`, `low_stock_items` have
`for select using (true)`. (`inventory_snapshot` stays public **on purpose**: the storefront reads live stock from it.)

**Change.** For each: create `Admins can read …` (`using ((select is_current_user_admin()))`) **first**, then drop the public policy,
in one transaction (no gap, no window with no policy).

**What could break — and evidence it won't.**
| Reader | How it reads | Effect |
|---|---|---|
| Admin dashboard, server render | `getReadOnlyClient()` = **service role** (bypasses RLS) | unaffected |
| Admin dashboard, live updates | browser Realtime with the **admin's own JWT** — identical to the already-working admin-only `order_status_log` / `cart_events` panels | unaffected |
| Storefront | does not read any of the five (searched) | unaffected |
| Webhooks writing them | service-role RPCs | unaffected |

**Verify.** Security test (anon and non-admin read 0 rows) + a Playwright check as the e2e admin that the dashboard's Product Health
panel still fills. **Rollback:** re-create the four `Public read …` policies (kept as comments).

---

## F3 — Admin panel on a vulnerable Next.js (Critical)  ☑ bumped, 👤 restart + redeploy

Two critical advisories (`>=16.0.0 <16.3.3`): GHSA-p293-qw3h-jr36 (unauthenticated RCE on Windows hosts) and GHSA-2xp9-vwfh-vxw4
(unauthenticated RCE in image optimisation with AVIF). Admin was 16.3.1 → now **16.3.5** (exact pin; only `next` changed in
`package.json`; `npm audit --omit=dev`: 0; `tsc`: 0 errors). Storefront already 16.3.3.

**What could break.** Patch release inside the same minor. **Verify:** restart the admin dev server → login page + dashboard load;
`cross-app-credentials` + admin e2e still pass; then **redeploy admin on Vercel — the fix is not live until then.**

---

## Test strategy (what "done" means)

1. **Baseline first** (existing specs: approved-flow, login-rejection, session-invalidation, concurrent-status-change, backend-direct,
   cross-app-credentials, response-safety) → `/tmp/baseline-e2e.txt`. A spec that already fails there is *not* counted against these fixes.
2. After each fix, run its targeted tests; at the end run everything and diff against the baseline.
3. Security suite must be fully green after `020`, `021`, `022`: `npm run test:security`.
4. Unit: storefront `npm run test:unit`, admin `npm run test:unit` (new).

## Things I will NOT do without you
Run SQL in your Supabase project (I can't), redeploy, restart your dev servers, commit or push.

## Rollback summary
SQL: each migration keeps its inverse as trailing comments. Code: each fix is a small, separate change (git shows it per file).
Dependency: `npm install next@16.3.1 --save-exact` / `npm uninstall sanitize-html @types/sanitize-html`.

---

## Progress log (2026-09-20)

**Baseline (step 0).** Ran 7 existing specs before any fix: **10 failed / 3 passed**. Every failure traced to *test drift*, none to the
security work: (a) the hard-coded product `flavour-beast-disposable-vapes-federal` now 404s in Shopify; (b) specs still looked for the
old copy "Login to View Price" (page now says "Log in for wholesale pricing"); (c) four specs never dismissed the province-selection
popup that was added later; (d) `backend-direct` took the first `next-action` POST as `addToCart` (now a different, argument-less action
fires first — body `[]`, returns `null`); (e) `session-invalidation` cleared the region cookie along with the session.
Repairs (tests only): live product handle + shared `GUEST_PRICE_COPY` in `e2e/fixtures.ts`, `bypassProvinceGate` in the four specs,
`variantId` filter in `backend-direct`, cookie re-set in `session-invalidation`.
**Result: the old regression set is 16 / 16 green** — including `approved-flow` add-to-cart and cart-drawer, which run through the cart
tracking code that F1/F2 will restrict.

**Sanitiser on a Shopify-shaped sample.** In: `<meta>`, `data-mce-fragment`, inline colour/size, `target=_blank` link, https image,
`<script>`, `onclick`. Out: structure, bold, list, link (with `rel="noopener noreferrer"`), image and width kept; `<meta>`, script,
`onclick`, inline styles and `data-*` removed.

**Suites now.** Storefront unit 63/63 · admin unit 18/18 · security 28/40 — the 12 failing are *exactly* the tests tagged for the SQL
not yet run: `[needs 020]` ×2, `[needs 021]` ×7, `[needs 022]` ×3. The Realtime test confirms the leak today (a non-admin receives
live product-health events) and that an admin does receive them (so the dashboard's live panel keeps working after 022).

## Still needs you (in this order)
1. Supabase SQL Editor: `020-least-privilege-reads.sql` → `021-lock-down-cart-tracking.sql` → `022-admin-only-dashboard-tables.sql`.
   Then `npm run test:security` (expect 40/40) and the old regression set once more.
2. Restart the admin dev server (it was started before the Next upgrade), open the login page and the dashboard.
3. Redeploy admin-panel on Vercel — until then the Next.js fix is not live.
