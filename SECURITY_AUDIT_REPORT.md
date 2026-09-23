# Security Audit Report — Gemini wholesale storefront + admin panel

Date: 2026-09-21 · Scope: `storefront/` and `admin-panel/` (code, Supabase migrations 001–023, Next.js config)
Method: read the code paths end to end, followed every browser-reachable entry point to the database / Shopify, ran `npm audit`, scanned git for secrets. This report is **independent** of `AUTH_SECURITY_REVIEW.md` / `SECURITY_FIX_PLAN.md`; where it repeats one of their open items it says so.

## 0. What I did NOT verify (read this first)

- **Live database state.** I did not run `npm run test:security` (it signs up real test users on the live Supabase project). I cannot tell you whether `020`–`023` are actually applied. Run them and the test suite before launch.
- **Hosting/dashboard settings**: Vercel deployment protection, Supabase Auth settings (CAPTCHA, email confirmation, JWT expiry), Google Cloud key restrictions, Shopify store password / public `products.json`. These are outside the repo.
- No dynamic attack against a running deployment. Everything below is from code and SQL.

## 1. The rule you asked for: never trust the frontend

Every request a browser can make (a Server Action, an API route, a cookie, a direct Supabase call with the public anon key) is attacker-controlled. The right shape is four layers, each assuming the one before it is hostile:

```
Browser  →  Server Action / Route (authenticate + authorize + validate)  →  Data layer  →  Database RLS  →  Shopify
 (untrusted)      (never trusts input, derives identity from session)       (least privilege)   (last line of defence)
```

What the app currently trusts from the client, field by field:

| Data | Where it really comes from | Verdict |
|---|---|---|
| Who the caller is | Supabase session on the server (`getCustomerAccessState`), never a body field | ✅ |
| `customerId` on orders / order history / cart tracking | Taken from the server session, not the request | ✅ |
| **Price** | Never sent by the client. Order created from `variantId` + `quantity`; price comes from Shopify (retail override applied server-side in admin) | ✅ |
| Account tier (retail/wholesale) | `customers.account_type` in the DB | ✅ |
| Cart identity | `cart_id` cookie: HttpOnly, Secure (prod), SameSite=Lax | ✅ |
| Order ownership | `getDraftOrderDetail` compares the order's Shopify customer to the caller's | ✅ (no IDOR) |
| Approval status | RLS insert policy blocks self-approval (018) | ✅ |
| **Quantity** | Integer check, ≤ 10,000 per call — **not** compared with stock, **not** capped in total | ❌ F-2 |
| **Variant IDs** | Only the `gid://shopify/ProductVariant/` prefix is checked | ❌ F-6 |
| **Region / province** | Unsigned cookie written by `document.cookie` | ❌ F-6 (display filter only) |
| Address fields | Length ≤ 200 only; no required / format / province / postal checks | ⚠ F-8 |
| Discount code / note | Length caps; Shopify validates the code | ✅ |
| Page-view path | Sanitised; identity from session; RPC rate-limited | ✅ |

## 2. Findings (new in this audit)

Severity is about business impact here, not CVSS. IDs are `F-n` to avoid clashing with the earlier `#1–#26`.

### Medium

**F-1 · Shopify app secret lives in the storefront runtime.** `lib/webhooks/verify.ts` reads `SHOPIFY_CLIENT_SECRET` in the buyer-facing app to check webhook signatures. That value is the Admin app's client secret, so the storefront (the app with the largest attack surface) holds an Admin-app credential. This breaks your own separation rule (buyer-facing runtime must not hold Admin credentials).
*Fix:* let only the admin panel receive Shopify webhooks (it already does for orders/inventory/products) and have it call the storefront's existing `/api/internal/revalidate-product` with the shared secret. Then remove `SHOPIFY_CLIENT_SECRET` from the storefront's production env. (`SHOPIFY_ADMIN_ACCESS_TOKEN` / `CLIENT_ID` are only used by `scripts/` — keep them out of the deployed env.)

**F-2 · Stock and quantity are not enforced on the server.** `addToCart` caps each *call* at 10,000 but adds it to the existing line, so repeated calls exceed the cap. `placeOrderAction` only drops lines with `quantityAvailable <= 0`; it never checks `quantity <= available`. The admin `createDraftOrder` does no stock check either. A buyer can order 9,000 units of something with 5 in stock, or lock inventory.
*Fix:* cap the *resulting* line quantity; at order time compare each line with live stock and reject/clamp; repeat the check in admin's `createDraftOrder` (it is the real order boundary).

**F-3 · The internal draft-order endpoint trusts its payload.** `admin-panel/.../create-draft-order/route.ts` is protected only by the shared secret (checked correctly with `timingSafeEqual`). Past that, it does not validate types/ranges (`quantity`, `variantId`, address shape), and it accepts `email` + `customerId` from the body without checking they belong together or that the customer is approved. If `INTERNAL_DRAFT_ORDER_SECRET` (or `ADMIN_PANEL_PROTECTION_BYPASS`) ever leaks from either app, an attacker can create draft orders as any customer.
*Fix:* validate the body with a schema; look up the customer by `customerId` and use *that row's* email; require `status='approved'`; rotate the secret on a schedule; consider Vercel OIDC / IP allow-list instead of a static shared secret.

**F-4 · No rate limiting anywhere.** Nothing throttles login, `/apply`, `/register/retailer`, `checkRegistrationEmail`, `addToCart`, `placeOrderAction`, or `/api/activity`. (Already listed as open in the earlier review for auth; it applies to every Server Action, since each is a public POST endpoint.)
*Fix:* Vercel WAF rate-limit rules per path plus a per-user limiter (e.g. Upstash) on `placeOrderAction`, login, apply.

**F-5 · Admin authorization keys on the email claim** (earlier #10, still open). `is_current_user_admin()` and `requireAdmin()` match `admin_users.email` to the JWT email; emails are not verified while "Confirm email" is off.
*Fix:* store the admin's Auth `user_id` in `admin_users` and compare `sub`; turn on email confirmation.

**F-6 · Region and variant rules are UI-only.** The province cookie is unsigned and set from JS; `addToCart` accepts *any* variant GID, including ones never shown in the buyer's region, and checkout never compares the shipping province with the product's region. If provincial restrictions on these products are a legal requirement, they are currently bypassable with one hand-crafted Server Action call.
*Fix:* at add-to-cart and at order time, re-fetch the variant server-side and check published + in-region + orderable; validate shipping province against the region rules.

### Low / hardening

- **F-7 · Order placement is not idempotent.** Two simultaneous `placeOrderAction` calls both read the same cart before either clears it, so two draft orders can be created. *Fix:* per-customer lock or an idempotency key (e.g. cart id + hash) recorded before creating the draft.
- **F-8 · Address validation is shallow, and error text is passed through.** `billingAddress`/`shippingAddress` only get a length check, so `{}` passes; admin returns Shopify's raw `err.message`, which `placeOrderAction` shows to the buyer (`body?.error`). *Fix:* schema-validate the address (required fields, `provinceCode` allow-list, Canadian postal regex) and return a generic message; log the detail server-side only.
- **F-9 · Logs.** `features/product/actions.ts:104` logs the full cart contents on every add; `[auth] … ALLOWED/BLOCKED` logs on every cart call. Remove or gate behind a debug flag; logs are a data store too.
- **F-10 · Admin proxy is an allow-list, not default-deny.** `proxy.ts` only gates paths named in `PROTECTED_*`. `/activity` and `/sales-reps` are not listed, and on a claims/lookup error the proxy passes the request through. This is only a UX layer; the real boundary (`(dashboard)/layout.tsx` → `requireAdmin()` plus `requireAdmin()` called in every admin data module — I counted calls per module, not function by function) is intact and I found no data path without it. *Fix:* invert to "everything protected except a small public list" so a new page is safe by default.
- **F-11 · Unbounded arrays on a public action.** `fetchSubcategoryProductsAction` passes `brands`, `filterKeys`, `selectedFilterValues` straight into Shopify queries with no size caps (search text *is* trimmed and escaped). Cap counts/lengths so it can't be used to burn Shopify API budget.
- **F-12 · No schema-validation library.** Validation is hand-written per action, which is why F-2/F-8 slipped through. Adopt one schema layer (e.g. Zod) at every Server Action / route boundary.
- **F-13 · Guest price gating is app-level only.** Prices are zeroed before serialisation (checked for the list and product page — good), but if the underlying Shopify store's `/products.json` or storefront is publicly reachable, retail prices are visible there regardless. Verify the Shopify store is not publicly browsable, or accept that only wholesale tiers are hidden.
- **F-14 · Content-Security-Policy.** Storefront has no CSP (needs nonces; known). Admin sets only `frame-ancestors 'none'`. Since the admin renders Shopify HTML (now sanitised) a script-src CSP there is the next layer.

## 3. Still open from earlier reviews (unchanged, needs you)

CAPTCHA on sign-up · decide "Confirm email" (#8/#9) · rotate the Google client secret (#15) · reset the admin account password (#16) · JWT expiry (#13) · Google Maps key referrer restriction (#26) · in-memory webhook dedup (#25) · forgot-password flow (#14).
Also: run `020` → `023` and `npm run test:security`; redeploy admin on Next 16.3.5.

## 4. Verified good (with where I looked)

- **Database (RLS):** every table has RLS enabled; customers/carts/wishlists/locations are per-user (`auth.uid()`), admin tables are admin-only after `022`; `SECURITY DEFINER` functions set `search_path` and check the caller (`021`, `023`); `customers` insert cannot self-approve (`018`); licence bucket has size/type limits (`019`). *(As written in SQL — live state not re-tested, see §0.)*
- **Authentication/authorisation:** every storefront Server Action either checks `getCustomerAccessState()` or is on a reviewed public list, enforced by `tests/unit/server-action-gates.test.ts`. Admin: all 12 data modules call `requireAdmin()` (counted per module).
- **Secrets:** service-role key only behind `server-only` (`lib/supabase/admin-client.ts`); no `NEXT_PUBLIC_` secrets (only Supabase URL/anon key and the Maps key, which are public by design); no `.env` committed, none in git history; no key patterns in tracked files.
- **Cookies / storage:** cart id, last-order and auth-intent cookies are HttpOnly + Secure (prod) + SameSite=Lax; `/checkout/success` trusts only the HttpOnly order cookie, not `?order=`. localStorage holds only a cart mirror (cleared on logout), a tour flag and the page-view queue (paths only).
- **Webhooks / internal routes:** raw-body HMAC-SHA256 with `timingSafeEqual`, length check, topic allow-list, dedup; internal routes refuse everything if the secret is unset.
- **Injection:** search text is escaped for Shopify's query syntax; order date filters are validated; order ids are matched against a GID regex; GraphQL uses variables; admin HTML is sanitised. `dev-test-logout` 404s in production.
- **Dependencies:** `npm audit --omit=dev` = 0 vulnerabilities in both apps.
- **Headers:** storefront sets nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy, HSTS; admin adds `frame-ancestors 'none'`.

## 5. Suggested order of work

1. **Before launch (needs you):** run `020`–`023` + `npm run test:security`; redeploy admin; rotate the secrets listed in §3; enable CAPTCHA / email confirmation; add WAF rate limits (F-4).
2. **Code, highest value:** F-2 (stock/quantity), F-6 (variant/region), F-3 (validate + bind identity in the draft-order endpoint), F-1 (remove the Admin-app secret from the storefront).
3. **Then:** F-7, F-8, F-5, F-10, F-9, F-11, F-12, F-14.

Each item is small and independent; tell me which to start with and I will do it with tests and a rollback note, the same way `SECURITY_FIX_PLAN.md` does.

## 6. Fix status (2026-09-21)

**F-6 — province rule enforced on the server: code done, 12 new unit tests pass (storefront + admin).**
Rule (ASSUMED, confirm with compliance; one table in `lib/region-rules.ts`): BC/AB/MB/ON/QC ships only its own `region-<x>` products; every other province/territory ships only `region-federal`; products with no region tag ship anywhere. Enforced in `placeOrderAction` (friendly message naming the blocked items) and, authoritatively, in admin `createDraftOrder` (re-reads tags from Shopify; fails closed). `addToCart` now rejects variant ids Shopify does not know, and caps a line's total at 10,000 (part of F-2). Not covered: pickup orders (no pickup-location province model), and `region-rules.ts` exists as two identical copies (storefront + admin) — keep in sync.

**F-5 — admin identity by Auth user id: code + SQL written, NOT applied.** `024` (adds/backfills `admin_users.user_id`, harmless) → deploy admin → `025` (switches `is_current_user_admin()` and the 015 policies to `auth.uid()`; refuses to run if any admin lacks a user_id; rollback included). Side effect: the two 015 policies (`sales_reps`, `internal_notes`) never worked for admins through RLS (they read `admin_users`, which authenticated users can't read); after `025` they do — intended, but it is a behaviour change.

**F-2 (stock) + F-3 (payload validation) — code done, 16 new unit tests pass (admin 49 total).**
Admin `create-draft-order` now: caps body size; validates the whole payload with a schema (uuid customer id, real variant gids, integer quantity 1–10,000, ≤200 lines, enum fulfilment, length caps, no control characters); reads the customer's email / price tier / Shopify id from the approved `customers` row and ignores the email in the body (an unknown or non-approved customer gets 403); checks live Shopify stock so a tracked, stop-selling-when-out variant can't be ordered beyond what exists (same variant on several lines is summed; untracked or "continue selling" variants are never limited); and returns generic errors (details go to the server log). Limits: Shopify draft orders do not reserve stock, so two buyers can still race for the last units (a hold would need `reserveInventoryUntil` — a business decision, not done).
