# Production Security & Data-Flow Checklist (per API call)

Scope: `storefront/` and `admin-panel/` (Next.js 16 App Router, Supabase, Shopify).
Sources: Next.js "Data security" guide (v16.3.5), OWASP Authorization / IDOR cheat sheets, existing `SECURITY_AUDIT_REPORT.md`.
Status of this file: **checklist only.** Nothing is fixed or run yet. Each item gets a result column later: ✅ pass · ❌ fail (fix) · ➖ n/a.

## 0. How to use

1. Build the **entry-point inventory** (section 1) — every place a browser can reach the server.
2. For each entry point, walk the **3-layer checklist** (sections 2–4). One row per entry point.
3. Walk the **server vs client component checklist** (section 5) and the **attacker checklist** (section 6).
4. For every ❌: fix, then write a test (section 7). For every ✅: still run the test to prove it.
5. Before each test run, write the **expected data first** (section 7.1), because live data changes.

## 1. Entry-point inventory (what the attacker can call)

Every one of these is a public POST/GET, whatever the UI shows. Next.js docs: a Server Action is reachable by direct POST even if no UI uses it.

| Kind | Storefront | Admin panel |
|---|---|---|
| Server Actions (`features/*/actions.ts`) | apply, auth, products, product, cart, checkout, account, wishlist | customers, filters, products, auth, dashboard, taxonomy, sales-reps, login |
| Route handlers (`route.ts`) | `api/activity`, `api/internal/revalidate-product`, `api/webhooks/products`, `api/webhooks/taxonomy`, `auth/callback` | `api/internal/customer-orders`, `customer-order-detail`, `create-draft-order`, `api/webhooks/products|inventory|orders`, `auth/confirm` |
| `proxy.ts` | yes | yes |
| Dynamic params / searchParams | `[handle]`, `?filters` etc. | `products/[id]`, `?page` etc. |
| Direct Supabase from browser (anon key) | every table/RPC reachable with the public anon key | same project, same keys |
| Cookies / localStorage / headers | `cart_id`, region, order cookie, auth-intent | session cookies |

- [ ] Inventory is complete (grep `'use server'`, `route.ts`, `.rpc(`, `.from(`) and each row below is filled.
- [ ] Any Server Action exported but unused by UI is deleted (or has its own auth check).

## 2. Layer 1 — Request boundary (Server Action / route handler)

Rule: **the frontend is hostile.** Nothing in the request is trusted, including hidden fields, cookies, headers and IDs.

### 2.1 Authentication (who are you?)
- [ ] Identity comes from the server session (`getUser()` / verified JWT), **never** from a body field, header or cookie value we set from JS.
- [ ] Uses `getUser()` (verifies with Auth server) not `getSession()` (trusts cookie) for any decision that matters.
- [ ] Check happens **inside** the action / route, not only in the page or `proxy.ts` (Next.js: a page-level check does not cover the action).
- [ ] Public actions are on an explicit reviewed allow-list (storefront has `tests/unit/server-action-gates.test.ts`; admin needs the same test).
- [ ] Webhooks: raw body HMAC, constant-time compare, topic allow-list, replay/dedup, secret unset ⇒ refuse.
- [ ] Internal routes (`api/internal/*`): shared secret compared with `timingSafeEqual`; secret unset ⇒ refuse; plan to rotate.

### 2.2 Authorization (are you allowed to do THIS to THAT?)
- [ ] Deny by default: new page / route / action is protected unless explicitly public (admin `proxy.ts` is currently allow-list ⇒ invert it).
- [ ] Role check (customer vs admin) inside the action.
- [ ] **Object-level check (IDOR):** every ID taken from the client (`orderId`, `customerId`, `addressId`, `wishlistId`, `productId`, `cartId`) is proven to belong to the caller *on the server*, not "the ID looked valid".
- [ ] Ownership is enforced by the query itself (`where id = $1 and customer_id = <session user>`), not by a check-then-fetch that can be raced.
- [ ] Account state is checked (approved / not rejected / not disabled), not just "logged in".
- [ ] Admin identity by Auth `user_id` (SQL 024/025), not by email claim.
- [ ] Horizontal test: user A cannot read/write user B's data. Vertical test: customer cannot call an admin action.

### 2.3 Validation (is the input sane?)
- [ ] Schema validation at every boundary (one library, e.g. Zod; storefront has none, admin has one).
- [ ] Types, ranges, enums, max lengths, max array sizes, no control characters, unknown keys rejected or stripped.
- [ ] IDs validated by format (UUID / Shopify GID regex) before use.
- [ ] `params` and `searchParams` treated as user input (Next.js audit item).
- [ ] Numbers: integer, min ≥ 1, max cap, and **resulting** total capped (not only per call).
- [ ] Business rules re-checked server-side: price (never from client), stock, region/province, min order, discount code, account tier.
- [ ] Redirect targets same-site only (`safe-redirect`); no open redirect in `auth/callback` / `auth/confirm`.
- [ ] Body size cap on route handlers.
- [ ] Idempotency on money/stock actions (placing order twice, double click, replay).

### 2.4 Abuse controls
- [ ] Rate limit per IP **and** per user on: login, sign-up/apply, email-exists check, add to cart, place order, `api/activity`, search, password reset.
- [ ] CAPTCHA / bot protection on sign-up and login.
- [ ] Enumeration: login / register / reset / `email_registered` answer the same way for existing and non-existing accounts, and are rate-limited.
- [ ] Expensive queries (Shopify search, filters) have input caps so they cannot burn API budget.
- [ ] CSRF: mutations only via POST Server Actions; `serverActions.allowedOrigins` set if behind a proxy; cookies `SameSite=Lax`+.

### 2.5 Response hygiene
- [ ] Return value is a **minimal DTO**, never a raw DB row / Shopify object (Next.js "Controlling return values").
- [ ] Errors are generic to the client; detail goes to server logs only (no stack, SQL, Shopify raw `err.message`).
- [ ] Same status/message for "not found" and "not yours" (no ID probing).
- [ ] No secrets, tokens, emails of other users, internal IDs, or notes in the response.
- [ ] Logs contain no PII, tokens, full carts, addresses, or license documents.

## 3. Layer 2 — Data access layer (server-only code)

Next.js recommended shape: `Action/Route → DAL (server-only, authz, DTO) → DB/Shopify`.

- [ ] Every DAL module has `import 'server-only'` (admin 23 files, storefront 12 files currently — verify **all** data modules).
- [ ] `process.env` secrets read **only** in DAL / lib, never in components.
- [ ] Service-role client used only where RLS bypass is truly required, in `server-only` modules, and **after** an explicit auth check. Everywhere else use the caller's session client so RLS applies.
- [ ] Each service-role call site listed and justified (admin has ~14 modules creating one — confirm each calls `requireAdmin()` first).
- [ ] **Minimal select:** no `select('*')`; list only needed columns. Queries filter by owner/tenant in the query.
- [ ] Pagination with a hard max page size on every list (customers, carts, activity, products, orders).
- [ ] Search done properly:
  - [ ] Parameterised / builder APIs only — no string-concatenated SQL, no raw `.or('a.ilike.%${input}%')` with unescaped input (PostgREST filter injection).
  - [ ] `LIKE` wildcards (`%`, `_`) and filter-syntax characters (`,` `(` `)` `.`) escaped or rejected.
  - [ ] Shopify query syntax escaped; GraphQL uses variables, never string interpolation.
  - [ ] Lookups by **primary key / unique indexed column**, not by fuzzy match, wherever identity matters.
  - [ ] Sort column / direction from an allow-list, not from the client string.
  - [ ] Search on the right index (perf + no full scans that DoS the DB).
- [ ] Data shaped to a DTO *in the DAL*, so server components receive already-safe objects.
- [ ] `cache()`d current-user helper used so identity is fetched once, not passed around.
- [ ] Caching safety: no per-user data in shared caches (`unstable_cache`, ISR, `use cache`, CDN); guest vs wholesale price never cached under the same key.
- [ ] Shopify: server holds the Admin token; buyer-facing app holds only what it needs (open audit item F-1: remove `SHOPIFY_CLIENT_SECRET` from storefront).

## 4. Layer 3 — Database (Supabase / Postgres)

The last line of defence: assume the attacker skipped layers 1–2 and calls the DB directly with the public anon key.

- [ ] RLS **enabled and forced** on every table in `public` (query `pg_tables.rowsecurity`).
- [ ] Every policy names its role (`to authenticated` / `to anon`), uses `(select auth.uid())`, and has `with check` on insert/update.
- [ ] Owner tables (customers, carts, wishlist, locations): `user_id = auth.uid()` for select/update/delete.
- [ ] No `using (true)` on non-public data. Public tables listed and justified.
- [ ] Insert/update policies block privilege escalation (self-approve, change `account_type`, change owner id, write `status`).
- [ ] Column-level: sensitive columns (approval status, notes, tier, license path) not writable by the user; use column grants or RPC.
- [ ] `SECURITY DEFINER` functions: `set search_path = ''`, check caller inside, `revoke` from `public`/`anon`, grant only needed roles.
- [ ] Every RPC callable from anon is listed; each validates its own arguments (size, ownership).
- [ ] Views run with `security_invoker` (or are not exposed).
- [ ] Storage buckets: private by default, path bound to owner, size/type limits, signed URLs with short TTL for license documents.
- [ ] Realtime: tables published to Realtime have RLS that matches who may listen.
- [ ] Migrations 020–025 confirmed **applied on the live DB** (the audit could not verify this).
- [ ] Constraints (`check`, `not null`, `unique`, FK) enforce integrity even if code is wrong.
- [ ] Retention: PII / activity / cart data has a delete policy.
- [ ] Backups + point-in-time recovery on; service-role key not in git or client bundle.

## 5. Server vs Client components

### 5.1 Decision rule
| Put on the **server** if it… | Put on the **client** only if it… |
|---|---|
| reads DB / Shopify / secrets / cookies | needs `useState`, `useEffect`, event handlers, browser APIs |
| decides price, role, region, stock, eligibility | is purely presentational interaction (dropdown, modal, tour, drawer animation) |
| renders user-specific or private data | receives only a small already-filtered prop object |
| does formatting of sensitive values | never needs to know *why* something is hidden |

### 5.2 Checks
- [ ] `'use client'` files are as small and as low in the tree as possible (97 `'use client'` vs 88 server `.tsx` — review the big ones for logic that belongs on the server).
- [ ] Client component **props are narrow types** (no `Customer`, `Product` full objects, no raw DB row / Shopify node).
- [ ] No secret, service key, or internal URL reachable from any `'use client'` import chain (build fails with `server-only` — verify no client file imports a DAL module).
- [ ] `NEXT_PUBLIC_*` contains only public-by-design values (Supabase URL/anon key, Maps key **with referrer restriction**).
- [ ] Price / stock / eligibility **computed on server** and passed as final values; guest prices zeroed *before* serialisation (verify in the RSC payload, not just the UI).
- [ ] Hidden UI ≠ protected: every button a client hides (admin-only, region-restricted) is also rejected server-side.
- [ ] Data fetched on the client (SWR/fetch/Supabase browser client) is limited to RLS-safe tables; no client-side call that needs an admin key.
- [ ] `dangerouslySetInnerHTML`: only with sanitised HTML (1 use, admin product page — sanitised); no `innerHTML`, `eval`, `document.write`.
- [ ] `localStorage`/`sessionStorage`/`document.cookie` hold no tokens or PII; security-relevant cookies are HttpOnly + Secure + SameSite (region cookie is display-only — server must not trust it).
- [ ] `experimental.taint` decision made (currently off in both apps) — optional extra layer, not a replacement for DTOs.
- [ ] Server Action closures don't capture sensitive values.
- [ ] No mutation during render or in GET handlers.
- [ ] Third-party scripts limited; CSP in place (storefront none, admin only `frame-ancestors`) — plan nonce-based CSP.

## 6. Attacker checklist ("what would a hacker try?")

For each: state the attack, do it (test), record result.

| # | Attack | Try on |
|---|---|---|
| A1 | **IDOR**: change `orderId`/`customerId`/`addressId` to another user's | every action/route taking an ID |
| A2 | **Forged Server Action POST** without UI (skip page checks, wrong role, no session) | all actions |
| A3 | **Anon-key direct DB**: call REST/RPC with only the public key | all tables/RPCs |
| A4 | **Mass assignment**: send extra fields (`status`, `account_type`, `is_admin`, `price`) | register, profile, address, checkout |
| A5 | **Price/qty tampering**: negative, 0, decimal, huge, string, array, NaN; price in body | cart, checkout, draft order |
| A6 | **Stock/limit bypass**: repeated calls, parallel calls (race), replay same order | cart, place order |
| A7 | **Region/tier bypass**: forge province cookie, hand-crafted variant GID | add-to-cart, checkout |
| A8 | **Injection**: `'`, `%`, `_`, `,`, `)` `.or(` payloads, GraphQL fragments, path traversal | every search/filter input |
| A9 | **XSS**: stored (descriptions, notes, names, addresses) and reflected (searchParams) | every rendered user string |
| A10 | **Open redirect / callback abuse** | `next`, `redirect`, auth callbacks |
| A11 | **Auth attacks**: brute force, credential stuffing, enumeration, session fixation, reuse after logout / after role change | login, register, reset |
| A12 | **Webhook forgery / replay**: bad HMAC, old timestamp, unknown topic | all webhooks |
| A13 | **Internal endpoint with leaked secret**: what is the blast radius? | `api/internal/*` |
| A14 | **Info leak**: response bodies, error text, RSC payload, source maps, `.env` in bundle, verbose logs | all |
| A15 | **DoS / cost**: giant arrays, deep pagination, expensive Shopify queries, huge uploads | filters, activity, upload |
| A16 | **File upload**: wrong MIME, oversized, path trick, another user's path, public URL guess | licence bucket |
| A17 | **CSRF / clickjacking / CORS**: cross-origin POST, iframe embed | mutations, admin |
| A18 | **Supply chain**: vulnerable deps, unpinned versions | `npm audit`, lockfiles |
| A19 | **Privilege after change**: user demoted/rejected but old session still works | admin & customer |
| A20 | **Cache poisoning / leakage**: personalised page served to another user | cached pages, CDN |

## 7. Functional & security test plan

### 7.1 "Expected data first" rule (data always changes)
Before **every** test run, produce an expectation sheet — do not hardcode "product X has 5 units":

1. **Snapshot the source of truth right now** (read-only): the test user's row, their cart, their orders, a product's live stock/region/price from Shopify, the admin list count.
2. **Derive expected values from that snapshot** (`expected_stock = snapshot.stock`, `expected_orders = snapshot.orders where customer = A`).
3. **Create own fixtures** where possible: two throw-away customers (A, B), one admin, one product/variant with known tags. Never depend on real customers' rows.
4. Run the test → compare actual vs the expectation sheet → record diff.
5. **Clean up** the fixtures; never leave test data in prod-like tables.

Expectation sheet template (one per feature):

| Case | Setup (snapshot values) | Action | Expected response | Expected DB change | Expected NOT to see |
|---|---|---|---|---|---|

### 7.2 Test layers
- **Unit** (`npm run test:unit`, both apps): validators, region rules, sanitiser, redirect helper, server-action-gate list (add the admin equivalent).
- **DB/RLS** (`npm run test:security`): anon, non-approved, approved A, approved B, admin — each tries read/write on every table/RPC. Expect: A sees only A; anon sees nothing private.
- **API/action** tests: call actions/routes directly with crafted payloads (attacks A1–A8, A12–A13), no browser.
- **E2E (Playwright)**: golden path per role (guest, retail, wholesale, admin) + region gate + cart persistence + order.
- **Response-shape tests**: assert an allow-list of keys in each response; fail if any extra key (email, id of another user, internal note) appears.
- **Concurrency tests**: double place-order, parallel add-to-cart, two admins approving the same customer.
- **Regression per fix**: every ❌ found gets a test that fails before and passes after.

### 7.3 Functionality checks that protect security
- [ ] Guest sees no wholesale price; retail sees retail; wholesale sees wholesale (in RSC payload too).
- [ ] Non-approved user cannot add to cart / order.
- [ ] Region: BC user cannot order an AB-only item via hand-crafted call.
- [ ] Order created uses server price, server stock, server address validation.
- [ ] Rejected/disabled user loses access on next request.
- [ ] Admin approve / reject / change tier is admin-only and audited.
- [ ] Wishlist, addresses, orders: A cannot see/modify B's.

## 8. Known open items carried from earlier audits (verify, do not assume)
F-1 storefront holds Shopify client secret · F-3/F-2 draft-order payload + stock (code done, verify) · F-4 no rate limiting · F-5/SQL 024–025 not applied · F-7 idempotency · F-8 address schema · F-9 noisy logs · F-10 admin proxy allow-list · F-11 unbounded filter arrays · F-12 no schema lib in storefront · F-14 no CSP · CAPTCHA, email-confirm, JWT expiry, Maps key restriction, Google secret rotation, admin password reset, in-memory webhook dedup, migrations 020–023 live state.

## 9. Sign-off gate (production ready only when)
- [ ] Every entry point has a completed row in 2–4 with no ❌.
- [ ] Section 6 attacks all tried, all blocked, each with a test.
- [ ] Section 7 suites green against live-derived expectations.
- [ ] `npm audit --omit=dev` = 0 in both apps; both apps redeployed on patched Next.js.
- [ ] Dashboard settings done (Vercel protection/WAF rate limits, Supabase Auth settings, key restrictions, Shopify store not publicly browsable).

---

## 10. Supabase queries, search & table rules (added after reading the Supabase docs)

Sources: Supabase "Row Level Security" best practices, "Securing your data / Data API", "Full Text Search". Every query is a code path an attacker can influence, so each one is checked against the rules below.

### 10.1 Why these rules exist (plain reasons)
| Rule | Why (what attack it stops) |
|---|---|
| RLS on every table in an exposed schema | The anon key is public. Without RLS anyone can read/write the table straight from their browser, skipping your app. |
| `to authenticated` / `to anon` on every policy | A policy with no role applies to everyone, including anon. |
| Separate policy per operation; `using` **and** `with check` on UPDATE | `using` = which rows you may touch; `with check` = what the row may become. Missing `with check` lets a user change `status` / `owner` to escalate. |
| `(select auth.uid())` not bare `auth.uid()` | Evaluated once per statement, not per row (speed). And check `is not null`, because anon gives `null` and comparisons silently fail. |
| Index every column a policy or `.eq()` filters on | Otherwise each request seq-scans; attacker hits it in a loop = cheap DoS. |
| Authorization data in `app_metadata`, never `user_metadata` | `user_metadata` is user-editable (they can make themselves admin). |
| Views: `security_invoker = true` | Default views run as owner and bypass RLS. |
| `SECURITY DEFINER`: `search_path = ''`, schema-qualified names, not in an exposed schema, revoke from public/anon | Runs with owner rights; a hijacked search_path or open grant = privilege escalation. |
| Service-role key only on the server | It bypasses RLS completely. Leak = full DB access. |
| Select only needed columns | Smaller leak surface + less data over the wire (Next.js "API minimization"). |
| Pagination + max page size | Stops "dump the whole table" and memory/cost abuse. |
| Search: parameterised values, escape wildcards, prefer FTS + GIN index | Wildcard input (`%`, `_`) changes what matches; `ilike '%x%'` cannot use a normal index (slow at scale); FTS is faster and safer. |
| Test RLS for select/insert/update/delete, as anon and authenticated, and prove the row is unchanged after a denied write | A policy that "looks right" often is not. |

### 10.2 Checks for every Supabase query
- [ ] Which client? **Session client** (RLS applies) vs **service-role** (RLS bypassed). Service-role only with an explicit `requireAdmin()`/owner check just above it.
- [ ] Owner filter present **in the query** (`.eq('customer_id', session.customer.id)`) *and* backed by RLS (belt and braces).
- [ ] `.select('col1, col2')` — no `'*'`.
- [ ] `.limit()` / `.range()` on every list; `count: 'exact'` only when needed (`estimated` is cheaper).
- [ ] Write returns only what the UI needs (`.select('id')` not `'*'`).
- [ ] `.single()` vs `.maybeSingle()` used deliberately (`single` errors on 0 rows: don't leak that error text).
- [ ] Error text from Supabase (`error.message`) is **not** returned to the browser.
- [ ] Filter columns are indexed.
- [ ] Any value from the client placed in `.or()` / `.filter()` string / `.ilike()` is escaped or allow-listed (PostgREST filter syntax injection: `,` `(` `)` `.`).
- [ ] RPC: caller-provided args validated in the function (size, ownership); function is `security invoker` unless it needs definer; grants minimal.
- [ ] Browser-side Supabase calls (`lib/supabase/client.ts`) only touch tables whose RLS is safe for `anon`/any signed-in user.

### 10.3 What the code does today (read-only scan; ✅ good · ⚠ verify/fix)

**Storefront (session client, RLS applies)**
| File | What | Result |
|---|---|---|
| `lib/wishlist.ts` (folders/items) | `.eq('customer_id', session id)`, items joined with `wishlist_folders!inner(customer_id)` | ✅ owner in query. ⚠ uses `select('*')`; confirm `addWishlistItem` verifies the folder belongs to caller |
| `lib/saved-locations.ts` | update/delete `.eq('id').eq('customer_id')`; comment says RLS also scopes | ✅ double layer. ⚠ `select('*')`; multi-step "unset default then insert" is not atomic |
| `features/cart/actions.ts`, `lib/cart-tracking.ts` | `customer_carts` by session customer id; `cart_events` insert; RPC snapshot | ✅ owner-bound; policies from 021. ⚠ confirm 021 is applied live |
| `lib/auth/access-state.ts`, `features/auth/actions.ts`, `auth/callback` | read own `customers` row | ✅ verify RLS lets a user read **only their own** row and **not** update `status`/`account_type` |
| `features/apply/actions.ts` | `email_registered` RPC (anon) + insert + storage upload | ⚠ anon-callable email-exists = enumeration; needs rate limit/CAPTCHA. Verify insert policy (018) blocks self-approval; storage path bound to owner |
| `lib/shopify/queries/products.ts` | `inventory_snapshot` via public (anon) client, `.in('variant_id', ids)` | ⚠ `ids` array size unbounded; table intentionally public (stock) — confirm no other columns (cost, location) are exposed; add cap on ids |
| `api/activity` | RPC `log_customer_activity(p_events)` | ✅ rate-limited in RPC per audit. ⚠ verify max array size inside the function |

**Admin panel (mostly service-role, RLS bypassed → the code check is the only guard)**
| File | What | Result |
|---|---|---|
| `data/customers.ts` `listCustomers` | `select('*, sales_reps(...)')`, **no limit** | ⚠ unbounded + `*` (includes licence paths, notes fields) → column list + pagination |
| `data/customers.ts` `listCartActivity` | `select('*')` `.limit(100)` | ✅ limited. ⚠ `*` |
| `data/customers.ts` `listOrderStatusLog` | `select('*')`, **no limit**, ordered | ⚠ grows forever → limit/range |
| `data/customers.ts` `cart_snapshot ... .in('customer_id', ids)` | ids come from server list | ✅ server-derived. ⚠ `*` and large `in` |
| `data/customers.ts` `approve/reject/update account type` | RPC with `requireAdmin()` first | ✅ verify each RPC is granted to `service_role` only |
| `data/customers.ts` `listCustomerCarts` → SQL `012` | `ilike '%'||p_search||'%'` on name/business/email | ⚠ value is parameterised (no SQL injection) but `%`/`_` not escaped, no trigram index (seq scan), function has `search_path = public` (should be `''`) |
| `data/sales-reps.ts` | `select('*')`, insert/update with `input` | ⚠ validate `input` with schema (mass-assignment: only allowed columns), `.select()` narrow |
| `data/internal-notes.ts` | `select('*')` by entity | ✅ admin-only. ⚠ validate `entity_type` allow-list |
| `data/activity.ts` | paginated (`range`), `count: 'estimated'`, columns listed | ✅ good example — copy this pattern. ⚠ `page` from URL must be validated (integer ≥ 1, max) |
| `data/funnel.ts`, `customer-*.ts` | column lists, owner by id | ✅ column lists. ⚠ confirm `requireAdmin()` on each exported function |
| `(dashboard)/page.tsx` | builds its **own** service-role client in a page, `select('*')` on `product_health_snapshot`, `variant_sku_index` | ⚠ service client in a page file breaks the "DAL only" rule → move into `data/`, narrow columns |
| `features/*/hooks/*` (browser) | `inventory_snapshot` `.in(ids)` from the browser client | ⚠ `inventory_snapshot` is public-readable; fine only if it holds nothing private. Realtime channel: confirm RLS matches who may subscribe |
| `proxy.ts`, `login/actions.ts`, `admin-auth.ts` | `admin_users` lookup | ✅ single purpose; after SQL 025 keyed by `user_id` |
| `data/customers.ts` `createSignedUrl(path, 60)` | licence doc, 60 s | ✅ short TTL. ⚠ `path` must come from the DB row, never from the client |

### 10.4 Search-specific checks
- [ ] List every search entry: storefront product search/filters (Shopify), admin customers (`p_search`), admin products/variants (Shopify/SKU), activity filter by `customerId`.
- [ ] Each: input length cap, trimmed, wildcard/syntax characters escaped, sort field allow-listed, page size capped.
- [ ] Shopify search: escaped query string, GraphQL variables only, arrays capped (audit F-11).
- [ ] Supabase text search: decide **ILIKE (small tables ok) vs FTS/`pg_trgm`** by table size; add the matching index (GIN) before the table grows; use `websearch_to_tsquery` for user-typed text.
- [ ] Lookup by identity (email, account number, order id) uses **exact match on a unique index** (`lower(email)` unique index exists in 019), never `ilike`.
- [ ] Search results pass through the same authorization as a normal read (search must not reveal rows the user could not open by ID).

### 10.5 Table & rule inventory (fill by querying the live DB)
Run in the Supabase SQL editor and paste results here:
```sql
-- 1. RLS on/off per table
select schemaname, tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1,2;
-- 2. All policies (role, command, using, with check)
select tablename, policyname, roles, cmd, qual, with_check from pg_policies where schemaname = 'public' order by 1,2;
-- 3. Grants to anon/authenticated (default grants remain even with policies)
select table_name, grantee, privilege_type from information_schema.role_table_grants
 where table_schema='public' and grantee in ('anon','authenticated') order by 1,2,3;
-- 4. Functions callable by anon/authenticated + definer/invoker + search_path
select p.proname, p.prosecdef as definer, p.proconfig as config,
       has_function_privilege('anon', p.oid, 'execute') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';
-- 5. Indexes vs policy/filter columns
select tablename, indexname, indexdef from pg_indexes where schemaname='public' order by 1,2;
-- 6. Views without security_invoker
select c.relname, c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='v';
-- 7. Storage bucket policies
select id, public, file_size_limit, allowed_mime_types from storage.buckets;
```
Expectation per table before the run (write it first, then compare):

| Table | RLS | anon | authenticated | admin | Owner column | Indexed on |
|---|---|---|---|---|---|---|
| customers | on | insert only (own), no select | select own; no update of status/tier | via service role | supabase_user_id | unique ✅ |
| customer_carts | on | none | own only | service | customer_id (pk) | pk ✅ |
| cart_events / cart_snapshot | on | none | insert own (approved) | select | customer_id | ⚠ check |
| saved_locations / wishlist_* | on | none | own only | — | customer_id / folder→customer | ⚠ check |
| customer_activity | on | none | insert via RPC only | select | customer_id | ✅ (023) |
| admin_users, sales_reps, internal_notes | on | none | none | admin only | — | ✅ |
| inventory_snapshot | on | select (public, stock only) | select | — | — | ✅ variant_id |
| dashboard tables (022) | on | none | none | admin select | — | — |

### 10.6 Tests for this section
- [ ] **RLS test matrix** (extend `tests/security`): for each table × {anon, customer A, customer B, admin} × {select, insert, update, delete}. Expected values come from the table in 10.5; for a denied write also assert the row is unchanged.
- [ ] **Escalation**: as approved customer, try `update customers set status='approved', account_type='wholesale'` and insert with another `customer_id` → must fail.
- [ ] **Search tests**: inputs `%`, `_`, `'`, `a,b`, `x) or (id.gt.0`, 10k-char string, emoji → no error leak, no extra rows, bounded time.
- [ ] **Pagination tests**: `page=0`, `-1`, `1e9`, `abc`, huge `pageSize` → clamped or rejected.
- [ ] **Response-shape tests**: allow-list of keys per response (no `*`-leaked columns).
- [ ] **EXPLAIN check**: filters used by policies/searches use an index (no seq scan on the big tables).
- [ ] Optional: `supabase test db` (pgTAP) files `supabase/tests/<table>_rls.test.sql`, as the docs recommend.
