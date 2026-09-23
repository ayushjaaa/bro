# Full Codebase Error-Handling Review

Scope: entire `admin-panel/src` — Products/Variants/Taxonomy, Auth/Login/Proxy (middleware), Customers/Sales-Reps/Funnel/Internal-Notes/Dashboard, and all `api/internal/*` and `api/webhooks/*` routes.

**Status: all 17 findings below were fixed and tested on 2026-09-22** (see SECURITY_REVIEW_TRACKER.md for the full changelog and test results -- tsc clean, unit 231/231, security 17/17, e2e 13/13, `next build` clean). Within each section, findings are ordered most severe (can crash a whole request/site) → data corruption / auth risk → stuck-UI / UX degradation.

---
---

# Section A — Products / Variants / Category

Files: `data/products.ts`, `variants.ts`, `taxonomy.ts`; `lib/product-filter-input.ts`, `lib/variant-input.ts`; `lib/shopify/product-webhook-queries.ts`, `draft-orders.ts`, `admin-client.core.ts`; `app/api/webhooks/products/route.ts`; all `(dashboard)/products/**` pages; `features/products/**`; dashboard product-health widgets.

## 1. No `error.tsx` boundary under `(dashboard)` — any Shopify hiccup crashes the whole page — ✅ FIXED

**Files:**
- `admin-panel/src/app/(dashboard)/products/page.tsx:7` — `await listProductLinesPage(...)`
- `admin-panel/src/app/(dashboard)/products/[id]/page.tsx:15-18` — `await getProductLine(...)`, `await listFilterDefinitions()`
- `admin-panel/src/app/(dashboard)/products/[id]/variants/page.tsx:9`
- `admin-panel/src/app/(dashboard)/products/[id]/edit-flavours/page.tsx:9`
- `admin-panel/src/app/(dashboard)/products/attention/page.tsx:10`
- `admin-panel/src/app/(dashboard)/products/new/page.tsx:6-13`

**Problem:** `shopifyAdminRequest` (`lib/shopify/admin-client.core.ts:151-165`) unconditionally `throw`s on any non-2xx response, GraphQL `errors`, or missing `data`. None of the Server Components above wrap their DAL calls in try/catch, and there is no `error.tsx` anywhere under `src/app/(dashboard)`. A transient Shopify 429/timeout/5xx while rendering `/products`, `/products/[id]`, or `/products/[id]/variants` crashes the entire page render — the admin sees Next.js's generic unstyled error page instead of the catalog, with no retry.

**Fix:** Add `admin-panel/src/app/(dashboard)/error.tsx` (a client Error Boundary) so a Shopify failure degrades to a friendly "couldn't load, retry" UI. Optionally also try/catch the highest-traffic calls (`listProductLinesPage`, `getProductLine`) and return a typed `{error}` the page can render inline.

---

## 2. `ProductsTable.tsx` pagination — unhandled rejection leaves "Next" button silently stuck — ✅ FIXED

**File:** `admin-panel/src/features/products/components/ProductsTable.tsx:37-44`

```js
setIsLoading(true);
try {
  const result = await getProductLinesPageAction({ cursor: current.endCursor, limit: PRODUCTS_PAGE_SIZE });
  setPages((prev) => new Map(prev).set(nextIndex, result));
  setPageIndex(nextIndex);
} finally {
  setIsLoading(false);
}
```

**Problem:** There's a `finally` but no `catch`. If `getProductLinesPageAction` throws (Shopify hiccup), it becomes an unhandled rejection inside a client `onClick` handler — this does **not** trip the nearest Error Boundary (boundaries only catch render-phase errors). The admin just sees the button return to normal state with nothing loaded and zero explanation.

**Fix:** Add a `catch` that sets an error state and renders it near the pagination controls.

---

## 3. `EditVariantsTable.tsx` — no validation on Quantity/Price, unlike sibling Bulk Create table — ✅ FIXED

**File:** `admin-panel/src/features/products/components/EditVariantsTable.tsx` (Quantity input ~L222-227, Price input ~L196-202)

**Problem:** Unlike `VariantBulkTable.tsx`'s `validateRow` (`features/products/components/VariantBulkTable.tsx:56-98`, which blocks `price <= 0` and non-integer/`quantity <= 0`), this table has zero client-side validation. Server-side, `updateVariants` (`data/variants.ts:410,442`) does `parseInt(row.quantity || '0', 10) || 0`:
- Typing `"abc"` → `NaN` → `|| 0` → **silently writes stock = 0** to a live product, no warning.
- Typing `"-5"` → `-5` (truthy) → sent straight to `inventorySetQuantities`/`inventoryActivate` as a negative available quantity.
- Price is only checked by `isValidMoney` (`data/variants.ts:36-38`), regex `^\d+(\.\d{1,2})?$`, which **accepts `"0.00"`** — an admin can silently zero out a live variant's wholesale price with no guard.

**Fix:** Reuse `validateRow`-style checks in `EditVariantsTable` before enabling Save/Save All: require quantity to be a non-negative integer and price `> 0`; show the same inline error styling as `VariantBulkTable`.

---

## 4. Products webhook route — unawaited handlers have no try/catch, errors vanish as unhandled rejections — ✅ FIXED

**File:** `admin-panel/src/app/api/webhooks/products/route.ts:122-126`

```js
if (topic === 'products/delete') {
  void handleDelete(`gid://shopify/Product/${payload.id}`);
} else {
  void handleCreateOrUpdate(payload as RestProductPayload);
}
```

**Problem:** These are intentionally not awaited (to dodge Shopify's 5s webhook timeout — that part is fine). But the route's own try/catch (L91-134) only covers the synchronous part before the `void` call. Any exception thrown inside `handleCreateOrUpdate`/`handleDelete` happens after the route already returned 200, becoming an unhandled rejection with no logging. Concretely: `getServiceRoleClient()` (L30-35) does `process.env.NEXT_PUBLIC_SUPABASE_URL!` / `SUPABASE_SERVICE_ROLE_KEY!` — if either env var is ever unset, this throws synchronously and is silently dropped. Also, L47-54 assume `payload.images`/`payload.variants` are always arrays with no runtime check — a webhook payload shape Shopify changes, or a non-standard delivery, would throw `TypeError: Cannot read properties of undefined` inside this same unawaited, uncaught function.

**Fix:** Wrap the bodies of `handleDelete`/`handleCreateOrUpdate` in their own try/catch logging with the `[products-webhook]` prefix, or change call sites to:
```js
void handleCreateOrUpdate(payload as RestProductPayload).catch((err) => console.error('[products-webhook] handler failed:', err));
```

---

## 5. `createProductLine` — mid-loop Shopify failure leaves orphan, invisible Product Lines — ✅ FIXED

**File:** `admin-panel/src/data/products.ts:589-618`

**Problem:** Creates one real Shopify Product per selected region, sequentially. If region 1 of 3 succeeds and region 2's `productCreate` throws (network blip, rate limit, validation error), the function throws and the `created` array (containing region 1's real, already-created product id) is discarded. The caller (`createProductLineAction` → `ProductLineForm.tsx` catch block) only shows a generic error. The admin has no way to know region 1's product now exists in Shopify with 0 flavours and no siblings — it'll later surface unexplained in the "incomplete" product-lines list.

**Fix:** Either roll back (delete) any regions already created when a later one fails, or return the partial `created` list alongside the error so the UI can tell the admin exactly what succeeded.

---

## 6. `bulk-add/page.tsx` — dead/mock route that never writes to Shopify — ✅ FIXED

**File:** `admin-panel/src/app/(dashboard)/products/bulk-add/page.tsx`

**Problem:** Not a crash, but a silent-corruption-adjacent trap: this page uses a local Zustand-style store (`addFlavorsBulk`) instead of the real `bulkCreateVariants` DAL / `bulkCreateVariantsAction` used everywhere else. If this route is still reachable, an admin sees "✓ Created N flavors" while nothing was actually written to Shopify.

**Fix:** Confirm whether this route is still linked anywhere; if not needed, remove it or redirect to `/products/[id]/variants`.

---

## Checked and found solid (no action needed)

- `draft-orders.ts` / `draft-order-input.ts`: quantities validated with zod (`z.number().int().min(1).max(10_000)`) before reaching `createDraftOrder`; Shopify calls try/caught with typed `{ok:false, error, status}`; `retail_price` metafield `JSON.parse` defensively wrapped.
- `/api/internal/*` routes: body-size checks, `JSON.parse` in try/catch, field validation, typed `400`/`502`/`503` responses.
- `data/customer-shopify-id.ts`: deliberately never throws — returns `null`/empty on error so callers can rely on it.
- `variant-input.ts` / `product-filter-input.ts` / `taxonomy-input.ts`: pure validators, no I/O.
- `bulkCreateVariants` / `updateVariants` in `data/variants.ts`: batch-level try/catch already correctly structured.

---
---

# Section B — Auth / Login / Session / Middleware

Files: `login/actions.ts`, `login/page.tsx`, `auth/confirm/route.ts`, `data/admin-auth.ts`, `lib/internal-auth.ts`, `proxy.ts` (middleware — runs on almost every request), `lib/safe-redirect.ts`, `lib/login-input.ts`, `lib/supabase/server.ts`, and the auth-check portions of the `api/internal/*` routes.

## B1. `proxy.ts` (middleware) has no try/catch anywhere — one bad cookie or missing env var can take down the whole site — ✅ FIXED

**File:** `admin-panel/src/proxy.ts`, entire `proxy()` function (lines 73-180)
- L76-93: `createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, ...)` — non-null-asserted env vars, never validated.
- L103: `await supabase.auth.getClaims()` inside the retry loop — only the `{data, error}` return contract is handled; a synchronous throw (e.g. a corrupted/manually-edited session cookie breaking internal JWT/cookie-chunk parsing) is not caught.
- L140-143, L153: `createServiceRoleClient(...)` / `service.from('admin_users')...` — same non-null env assertions, same "only handles returned error, never a throw" gap.

**Failure scenario:** this middleware's matcher (`['/((?!_next/static|_next/image|favicon.ico|.*\.svg$).*)']`) covers nearly every route on the site. If `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_URL` is ever missing in a deploy, or one visitor carries a corrupted Supabase cookie that makes `getClaims()`/`createServerClient` throw instead of returning `{error}`, the middleware throws uncaught → **every single request site-wide** (not just admin pages) fails with Next's generic middleware error page. This is the single highest-severity finding across the whole review because of blast radius — one bad cookie or one env var typo = total outage.

**Fix:** wrap the whole middleware body (at minimum: client construction + `getClaims()` + the admin_users lookup) in try/catch; on any unexpected throw, fail open the same way `claimsCheckFailed`/`lookupFailed` already do (`return response`), since the file's own comments establish that `requireAdmin()` in the dashboard layout is the real security boundary, not this middleware.

## B2. `login/actions.ts` discards the admin-lookup DB error — legitimate admins get locked out and shown "wrong password" during a transient outage — ✅ FIXED

**File:** `admin-panel/src/app/(auth)/login/actions.ts:50-61`
```js
const { data: adminRow } = await service
  .from('admin_users')
  .select('id')
  .eq('user_id', data.claims.sub as string)
  .maybeSingle();

if (!adminRow) {
  await supabase.auth.signOut();
  return { ok: false, message: LOGIN_FAILED_MESSAGE };
}
```
`error` is never captured. A transient DB/network failure on this query makes `adminRow` `null` — indistinguishable from "genuinely not an admin." The session gets signed out and the admin sees a misleading "Incorrect email or password."

This is a real regression against this codebase's **own established pattern**: `admin-auth.ts`'s `requireAdmin()` and `proxy.ts` both retry this exact query and explicitly signal "could not verify" rather than treating a DB error as "not an admin." `login/actions.ts` skips that pattern entirely.

**Fix:** capture `error`; on error, don't sign out — return a distinct "couldn't verify, please try again" message instead of `LOGIN_FAILED_MESSAGE`.

## B3. `signIn()` Server Action has no try/catch at all — ✅ FIXED

**File:** `admin-panel/src/app/(auth)/login/actions.ts`, whole `signIn` function (lines 30-65)
If `SUPABASE_SERVICE_ROLE_KEY` is unset, `getServiceRoleClient()` (called inside `signIn`) throws synchronously the moment anyone attempts to log in, taking down every login attempt with a raw exception instead of a clean message.

**Fix:** wrap the whole action body in try/catch, return `{ok:false, message:'Something went wrong — please try again.'}` on any unexpected throw.

## B4. Login page never catches a thrown Server Action → submit button can freeze forever — ✅ FIXED

**File:** `admin-panel/src/app/(auth)/login/page.tsx:28`
`const result = await signIn(email, password);` has no try/catch. Combined with B3 (the action itself can throw), an uncaught rejection here means `setLoading(false)` (only called in the `!result.ok` branch) never runs — the submit button/inputs stay disabled/spinning indefinitely.

**Fix:** wrap the `signIn` call in try/catch, reset `loading` and show a generic error on any thrown exception.

## B5. Login success overlay can strand the user on an infinite "logging in..." screen — ✅ FIXED

**File:** `admin-panel/src/app/(auth)/login/page.tsx:54-62`
```js
setRedirecting(true);
window.sessionStorage.setItem('gd-admin-just-logged-in', '1');   // no try/catch
setTimeout(() => {
  router.push('/');
  router.refresh();
}, SUCCESS_OVERLAY_MS);
```
Unlike the `localStorage` access a few lines above (which *is* wrapped in try/catch), this `sessionStorage.setItem` isn't guarded. In private/incognito mode, storage-disabled browser policies, or a full storage quota, this throws — `setRedirecting(true)` already fired so the success overlay is showing, but the exception stops the `setTimeout` (the only thing that navigates) from ever being scheduled. The user is stuck on the success screen with no way forward except manually reloading.

**Fix:** wrap the sessionStorage write in try/catch (same pattern as the localStorage call above it), or schedule the `setTimeout` first.

## B6. `auth/confirm/route.ts` (invite / password-reset links) has no try/catch around session establishment — ✅ FIXED

**File:** `admin-panel/src/app/auth/confirm/route.ts:29-37`
`createSupabaseServerClient()` and `supabase.auth.verifyOtp(...)` are called with no guard. This route is the entry point for invite links and password-reset emails — if either call throws instead of returning `{error}`, a first-time admin clicking a legitimate invite link gets Next's raw error page instead of a clean `/login?error=invalid-link` redirect — a dead end instead of a recoverable path.

**Fix:** wrap in try/catch; fall through to the existing `/login?error=invalid-link` redirect on any exception.

## B7. One unguarded call breaks the JSON error contract in two customer-order routes — ✅ FIXED

**Files:** `admin-panel/src/app/api/internal/customer-order-detail/route.ts:45`, `admin-panel/src/app/api/internal/customer-orders/route.ts:49`
```js
const shopifyCustomerId = await getShopifyCustomerIdForCustomer(body.customerId);
```
is called **outside** the try block that wraps the rest of each handler. Every other failure path in these files returns a clean `{error: '...'}` JSON response, but this one call, if it throws, produces Next's raw unhandled-exception response — breaking the storefront's expected JSON contract for this one specific failure mode.

**Fix:** move this call inside the existing try/catch, returning the same `{error: '...'}` shape on failure.

## Checked and found solid (no action needed)
- No auth-bypass path found: `/api/internal/*` routes correctly check `isInternalRequestAuthorized` first with early 401 in all three routes; `proxy.ts`/`requireAdmin()` correctly separate authentication from `admin_users` authorization on every branch.
- No redirect loops: `/login` always reachable; `proxy.ts` deliberately fails open (not to `/login`) on verification errors, relying on `requireAdmin()` in the dashboard layout as the authoritative check.
- CSRF: Server Actions rely on Next's built-in Origin-header protection; `/api/internal/*` uses a custom shared-secret header not auto-attached cross-site by browsers.
- SQL (`021-lock-down-cart-tracking.sql`): cart_events policy and `upsert_cart_snapshot_batch` correctly scope to `auth.uid()`, `anon`/`public` revoked — no RLS gap found.
- `next.config.ts`: static config only, nothing to flag.

---
---

# Section C — Customers / Sales-Reps / Funnel / Internal-Notes / Dashboard

Files: `data/customers.ts`, `funnel.ts`, `internal-notes.ts`, `sales-reps.ts`, `customer-shopify-id.ts`; `features/customers/**`; `(dashboard)/page.tsx`, `(dashboard)/customers/page.tsx`; `components/Sidebar.tsx`, `icons.tsx`; business-logic portions of `api/internal/customer-order-detail`, `customer-orders`, `create-draft-order`; `lib/shopify/draft-orders.ts`.

## C1. No `error.tsx` boundary anywhere in the app — confirmed app-wide (only `not-found.tsx` exists) — ✅ FIXED

**Files:**
- `admin-panel/src/app/(dashboard)/page.tsx:21-31` — `await Promise.all([requireAdmin(), listCategories(), listSubcategories(), listBrands(), listProductLines(), checkWebhookHealth(), getFunnelStats(), getDashboardHealthSnapshots()])`. Any one of these 8 calls throwing (Supabase blip, Shopify failure inside `getFunnelStats`) crashes the **entire dashboard home page** render, with no error boundary to catch it — unlike `(dashboard)/layout.tsx`, which *does* gracefully catch `AdminCheckUnavailableError` one layer up, a pattern that doesn't extend to anything below it.
- `admin-panel/src/app/(dashboard)/customers/page.tsx:7` — `await Promise.all([listCustomers(), listOrderStatusLog()])`; both throw plain `Error` on any Supabase failure (`data/customers.ts` multiple `throw new Error(...)` sites), with nothing to catch it.

**Fix:** add `error.tsx` under `src/app/(dashboard)/` (and ideally a root-level one) so one failing data source degrades gracefully instead of taking down the whole authenticated panel.

## C2. Unguarded Shopify pricing call in retail checkout — breaks the route's own error contract — ✅ FIXED

**Files:** `admin-panel/src/lib/shopify/draft-orders.ts:237-269`, `admin-panel/src/app/api/internal/create-draft-order/route.ts:39`
The retail-price-resolution block (`shopifyAdminRequest(VARIANT_PRICES_QUERY, ...)`, only reached when `accountType === 'retail'`) is **not** wrapped in try/catch, unlike the stock/region check block immediately above it which fails closed with `{ ok: false, error, status: 503 }`. The route handler's own `await idempotency.run(key, () => createDraftOrder(...))` call also has no try/catch.

**Failure scenario:** any Shopify timeout/5xx on the price query for a retail customer → exception propagates all the way out of the POST handler uncaught → checkout returns a raw 500 instead of the route's normal JSON error contract the storefront expects to render a friendly message.

**Fix:** wrap lines 238-269 in the same try/catch pattern as the block above it, returning `{ ok: false, error: 'Could not verify pricing. Please try again.', status: 503 }`.

## C3. Funnel stats silently swallow query errors — dashboard can show "0 signups" when the real cause is a DB error — ✅ FIXED

**File:** `admin-panel/src/data/funnel.ts:59-65`
```js
const { data: customers } = await supabase.from('customers').select(...).eq('status', 'approved');
...
const { count: registeredCount } = await supabase.from('customers').select('*', { count: 'exact', head: true });
```
`error` is never checked on either query. Any transient Supabase error or RLS misconfiguration makes `customers ?? []` become `[]` and `registeredCount ?? 0` become `0` — the dashboard's Conversion Funnel then shows "0 registered, 0 approved" indistinguishable from a genuine empty state, with nothing logged. This directly contradicts the pattern used two lines away in the same file (`fetchAllRows`, which does propagate errors) and the defensive try/catch used in `customers/page.tsx` for `listSalesReps`/`listNoteCountsFor`.

**Fix:** check `error` on both queries; on error, either throw (consistent with the rest of the file) or flag the stat as unavailable instead of silently defaulting to 0.

## C4. Orphaned sales-rep row possible on partial failure — ✅ FIXED

**File:** `admin-panel/src/features/customers/components/CustomerDrawer.tsx`, `SalesRepCard.handleCreateRep` (lines 396-413)
`createSalesRepAction` succeeds (creates a `sales_reps` row), then the next line, `await updateCustomerSalesRepAction(customer.id, result.rep.id)`, is unguarded. If that follow-up update throws, a sales-rep row now exists **unlinked to any customer**, the form doesn't close, and the admin sees no error — they'll likely click "+ New rep" again and create a duplicate.

**Fix:** wrap the create+assign sequence in try/catch; on failure of the second call, show "Rep created but could not be assigned — please assign manually."

## C5. Approve / Reject / Reassign customer actions silently no-op on failure — ✅ FIXED

**File:** `admin-panel/src/features/customers/components/CustomersTable.tsx`, `CustomerTableRow`
`handleApprove` (L134-142), `handleReject` (L144-152), `handleAssignRep` (L154-159) all call their server action + `router.refresh()` with **no try/catch**, inside `startTransition`. `approveCustomer()` (`data/customers.ts`) can throw from the Shopify customer-creation call or the `approve_customer` RPC.

**Failure scenario:** when the awaited action throws inside an async `startTransition` callback, React does **not** route it to an error boundary (not a render-phase error) — it's just an unhandled rejection in the console. The `pending` flag still resolves to `false` (button re-enables) but `router.refresh()` never runs, so the row silently keeps its old state. The admin believes they approved/rejected/reassigned a customer but nothing happened, with zero error shown. Same unguarded pattern in `CustomerDrawer.tsx`'s `handleAccountTypeChange` and `SalesRepCard.handleAssign`.

**Fix:** wrap each action call in try/catch inside the transition, set a local error state and display it — this codebase already has the contract for it (`createSalesRepAction`/`createNoteAction` return `{ok, error}`); approve/reject/reassign/account-type actions should follow the same pattern instead of a bare `await`.

## C6. "View Document" link has no error handling or loading state — ✅ FIXED

**File:** `admin-panel/src/features/customers/components/CustomerDrawer.tsx:51-54`
```js
async function handleViewDocument(path: string) {
  const url = await getRegistrationDocumentUrlAction(path);
  window.open(url, '_blank', 'noopener,noreferrer');
}
```
`getRegistrationDocumentUrl` throws if Supabase Storage's `createSignedUrl` fails. Clicking "View Business/Tax Licence" then does nothing — no loading indicator, no error, the admin can't tell if it's working or broken.

**Fix:** wrap in try/catch, show a loading state and an error toast/message on failure.

## C7. Internal notes fetch can get permanently stuck on "Loading notes…" — ✅ FIXED

**File:** `admin-panel/src/features/customers/components/CustomerDrawer.tsx:312-320`
```js
useEffect(() => {
  let cancelled = false;
  listNotesAction(entityType, entityId).then((result) => {
    if (!cancelled) setNotes(result);
  });
  ...
}, [entityType, entityId]);
```
No `.catch`. `listNotes()` throws on any Supabase error (including the "has the 015 migration been run yet?" case the parent page already defensively guards against at the page level — this per-drawer fetch has no equivalent). If it throws, `notes` state stays `null` forever — both the customer-level "Internal Notes" card and every per-order "Notes" toggle show "Loading notes…" permanently, with no retry.

**Fix:** add `.catch(() => { if (!cancelled) setNotes([]); setNotesError(true); })` and render a retry affordance.

## Checked and found solid (no action needed)
- `components/Sidebar.tsx`: pure client component, no data fetching or auth calls — cannot break navigation.
- `components/icons.tsx`: presentational only, nothing to flag.
- `api/internal/customer-order-detail` and `customer-orders`: business logic (Shopify lookups, null-coalescing on `customerName`/`shippingAddress`) is properly guarded — only the auth-check call flagged in B7 is the gap.
- `data/sales-reps.ts`, `data/customer-shopify-id.ts`: every Supabase call checks `error`; approval self-check correctly follows this project's "own-data functions must self-check approval" rule.

---
---
---

# STOREFRONT (`storefront/` — buyer-facing app)

Admin-panel review above covered everything under `admin-panel/`. The `storefront/` folder — the actual customer-facing site (browsing, cart, checkout, login/signup, account, wishlist) — had not been reviewed yet. Sections D–G below cover it, found in a second full pass. **None of these are fixed yet.**

---

# Section D — Cart / Checkout

Files: `features/cart/**`, `features/checkout/**`, `lib/cart-*.ts`, `app/cart/page.tsx`, `app/checkout/**`, `lib/shopify/queries/cart.ts`.

## D1. `/checkout` page can hard-crash on a transient Supabase error — ✅ FIXED

**Files:** `storefront/src/features/checkout/actions.ts:21-23`, `storefront/src/lib/saved-locations.ts:120`, `storefront/src/app/checkout/page.tsx:25-29`
```ts
export async function listSavedLocationsAction(): Promise<SavedLocation[]> {
  return listSavedLocations();   // no try/catch
}
```
`listSavedLocations()` does `if (error) throw new Error(error.message);` on the `saved_locations` select — any Supabase hiccup throws. It's called inside `checkout/page.tsx`'s `Promise.all([getCurrentCart(), listSavedLocationsAction(), getPickupLocations()])`, which is also unguarded. The other two calls in that `Promise.all` are internally hardened (catch and return `null`/`[]`); this one isn't.

**Consequence:** a transient Supabase error while loading saved addresses crashes the **entire checkout page** — the customer gets a raw error page instead of checkout, with no fallback, right when they're about to pay.

**Fix:** wrap the Supabase call in `listSavedLocations`/`listSavedLocationsAction` in try/catch, return `[]` on failure (same pattern as `getPickupLocations`).

## D2. Order can be placed in Shopify but the confirmation throws — customer sees an error for an order that actually went through

**File:** `storefront/src/features/checkout/actions.ts:242`
```ts
const { name } = (await response.json()) as { draftOrderId: string; name: string };
```
Runs only after `response.ok` is true (the real Shopify Draft Order already exists), but isn't wrapped in try/catch. A truncated/malformed 200 response body makes `response.json()` throw **after** the order was already placed, propagating uncaught out of the Server Action.

**Fix:** try/catch this parse; on failure, still treat the order as placed where possible, or clearly say "we're not sure if this went through, contact support" instead of letting the exception propagate as a generic failure.

## D3. "Place Order" button can get stuck forever on a thrown error, encouraging a duplicate order

**File:** `storefront/src/features/checkout/CheckoutPage.tsx`, `handleCheckOut` (both the `ship` branch L267-284 and `pickup` branch L310-323)
```ts
setPlacingOrder(true);
const result = await placeOrderAction({...});   // no try/catch
setPlacingOrder(false);                          // never runs if the await throws
```
If `placeOrderAction` throws (D2, or anything else), `setPlacingOrder(false)` never runs — the button stays disabled on "Placing Order..." forever, no error shown, no way to tell if the order went through. The customer's likely next move is reloading and resubmitting.

**Fix:** wrap both calls in try/catch with `finally { setPlacingOrder(false); }`, show a clear error on catch.

## D4. No idempotency protection on "Place Order" — a resubmit can create a second real order

**File:** `storefront/src/features/checkout/actions.ts:199-210` (POST payload has no idempotency/request id); `CheckoutPage.tsx:514` (`disabled={placingOrder || ...}` is a React state flag, not synchronous with clicks)

**Consequence:** a fast double-click, a held Enter key, or (more realistically) a manual resubmit after the D3 stuck-button scenario each independently call `placeOrderAction`. Nothing server-side dedupes — a second real Shopify Draft Order gets created for the same cart.

**Fix:** generate a per-attempt idempotency token client-side, send it to admin-panel's `create-draft-order` endpoint, and dedupe there.

## D5. Removing cart lines on the checkout page fails silently — ✅ FIXED

**File:** `storefront/src/features/checkout/CheckoutPage.tsx`, `handleRemoveSelected` (L196-204) and `handleRemoveOutOfStock` (L206-211)
Both only update state `if (result.ok)` — on failure, nothing happens: no error shown, and for out-of-stock removal, "Check Out" stays disabled with no explanation why. Inconsistent with `CartDrawer.tsx`/`CartTable.tsx`, which both call `setError(result.error)` on the same kind of failure.

**Fix:** add error-state handling to both handlers, mirroring CartDrawer/CartTable.

## Checked and found solid
- `features/cart/actions.ts`: all Shopify calls try/caught, input validated, stale-line double-click/two-tab race explicitly handled via `isStaleLineError`.
- `lib/cart-ownership.ts` / `cart-cookies.ts`: fails closed on lookup failure, no cross-session cart leakage found.
- `lib/shopify/queries/cart.ts`: `getCart` self-hardened; write calls (`createCart`/`addCartLines`/etc.) aren't self-hardened but every call site wraps them.
- `lib/cart-store.ts`: no unguarded `JSON.parse` of cookie data.
- Price/quantity math: all totals are `price * quantity` over server-sourced numbers — no NaN/division path found.

---

# Section E — Auth / Registration / Apply / Session / Middleware

Files: `proxy.ts` (storefront middleware), `features/auth/**`, `features/apply/**`, `features/retail/**`, `lib/auth/**`, `app/auth/callback/route.ts`, `app/apply/page.tsx`, `app/register/retailer/page.tsx`, `components/ui/LoginModal.tsx`.

## E1. Storefront middleware (`proxy.ts`) can crash every single page on the site — ✅ FIXED

**File:** `storefront/src/proxy.ts:21-40` (matcher covers nearly every route)
- L22-23: `createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, ...)` — unset/empty env var throws synchronously building a `URL`.
- L40: `await supabase.auth.getClaims()` — not guarded; a malformed/corrupted session cookie can throw rather than return `{error}`.

**Consequence:** either failure mode returns an unhandled 500 for **every page load site-wide** instead of the site. Same class of bug as the admin-panel's `proxy.ts` (Section B1), independently present here.

**Fix:** wrap client creation + `getClaims()` in try/catch; on failure just `return response` unchanged — the codebase already re-verifies approval at every page/action downstream, so failing open here grants nothing extra.

## E2. `fetchCustomerAccessState` — the documented single source of truth for all gating — can crash any page/action that calls it — ✅ FIXED

**File:** `storefront/src/lib/auth/access-state.ts:42`
`const { data, error } = await supabase.auth.getClaims();` only checks the returned `error` — doesn't guard against `getClaims()` throwing outright. The file's own docstring says this should be called at every price/cart/checkout/account spot in the storefront, so an uncaught throw here crashes whichever page/action called it. (This is also what `account/layout.tsx` calls — see Section G1, same root cause, different call site.)

**Fix:** wrap in try/catch, treat a thrown error the same as a returned `error` → `{status: 'guest'}`.

## E3. Google OAuth callback can crash mid-flow and leave a dangling session — ✅ FIXED

**File:** `storefront/src/app/auth/callback/route.ts:36,44,50-54`
`exchangeCodeForSession`, `getUser()`, and the `customers` lookup are all unwrapped. `exchangeCodeForSession` already commits session cookies **before** this point — if a later call throws, the route crashes with a raw error page mid-OAuth (a dead end right after the visitor finished Google's consent screen), and the "sign back out unless approved" logic never runs, leaving a standing session for a pending/rejected account (partially mitigated since every downstream page re-checks status independently, but still an inconsistent state).

**Fix:** wrap in try/catch; on exception, `signOut()` and redirect to `/?login_error=exchange_failed`.

## E4. Signup wizard (wholesale + retail) can freeze permanently on a network hiccup — ✅ FIXED

**Files:** `storefront/src/features/apply/WholesaleSignupForm.tsx:838-846,869-876` and identical code in `storefront/src/features/retail/RetailSignupForm.tsx:838-846,869-876`
```
setSubmitting(true);
const emailCheck = await checkRegistrationEmail(values.email);  // no try/catch
setSubmitting(false);                                            // skipped if the await throws
```
Same pattern on the final `submitRegistration` call. If either Server Action rejects (network drop mid-submit — realistic during a licence-file upload) instead of resolving to `{ok:false}`, the button stays stuck on "Submitting..." forever. After completing all 7 steps, the applicant has no error and no retry short of reloading — which triggers the `beforeunload` warning and, if confirmed, **discards all entered fields**.

**Fix:** wrap both awaits in try/catch, set an error state and reset `submitting` on catch.

## E5/E6. Login modal — password login can get stuck, Google login fails silently — ✅ FIXED

**File:** `storefront/src/components/ui/LoginModal.tsx`
- `handleSubmit` (L44-62): `await signInWithPassword(...)` unguarded — network exception leaves the button stuck on "Logging in..." forever.
- `handleGoogleLogin` (L64-84): return value of `supabase.auth.signInWithOAuth(...)` is discarded entirely, and there's no loading/error state on the button at all — unlike the near-identical call in `RegistrationMethodChooser.tsx`, which captures the error and shows a message. If OAuth fails to initiate (blocked third-party cookies, misconfigured provider), clicking "Continue with Google" does visibly nothing.

**Fix:** wrap `handleSubmit`'s await in try/catch; capture and surface the error in `handleGoogleLogin`, mirroring `RegistrationMethodChooser`.

## E7. `getApplicantSession` can crash `/apply` and `/register/retailer` — ✅ FIXED

**File:** `storefront/src/lib/auth/applicant-session.ts:24`
`const { data: { user} } = await supabase.auth.getUser();` unguarded. Called directly by both Server Component pages — a thrown exception crashes the page instead of degrading to the normal "choose registration method" guest view.

**Fix:** wrap in try/catch, treat a thrown error the same as no user → `{kind: 'none'}`.

## Checked and found solid
- `signInWithPassword`/`submitRegistration` core error paths (wrong password, pending/rejected status, duplicate-email, storage upload failures) all properly check `{error}` and map to friendly messages.
- `registration-cleanup.ts`'s fetch is try/caught and explicitly best-effort.
- `rate-limit.ts`'s in-memory design and `region-rules.ts`'s disabled flag are documented, deliberate choices, not bugs.
- No redirect loops found anywhere in the auth flow.

---

# Section F — Product Listing / Product Detail / Search / Webhooks

Files: `features/products/**`, `features/product/**`, `lib/shopify/**`, `app/products/**`, `app/page.tsx`, `app/brands/page.tsx`, `features/brands/**`, `features/navigation/**`, `app/api/webhooks/**`, `app/api/internal/revalidate-product/route.ts`.

## F1. Home page can crash on any Shopify hiccup via the brand strip — ✅ FIXED

**File:** `storefront/src/features/home/components/BrandStrip.tsx:43` → `storefront/src/lib/shopify/queries/brands.ts:62-76` → `storefront/src/lib/shopify/storefront-client.ts`
`await getMarqueeBrands()` has no try/catch anywhere in this chain; `shopifyStorefrontRequest` throws on any non-2xx/GraphQL-error/missing-data response. `BrandStrip` renders directly on the home page (`app/page.tsx`) — the single highest-traffic route on the whole site. Any transient Shopify throttle takes down the entire home page. (Contrast: `app/page.tsx`'s own `getProductByHandle` call on the same page is safely try/caught.)

**Fix:** wrap `getMarqueeBrands()` in try/catch, return `[]` on failure so the strip just renders empty.

## F2. `/brands` page crashes the same way — ✅ FIXED

**File:** `storefront/src/features/brands/AllBrandsPage.tsx:38` — `Promise.all([getBrandsForSubcategory(...), getAllBrands()])`, both hitting the same unguarded `getLiveBrands()`.

**Fix:** try/catch around the fetch, fall back to an empty brand list.

## F3. Product detail page (PDP) crashes for the routine case of a visitor's region not matching the product's region — ✅ FIXED

**File:** `storefront/src/app/products/[handle]/page.tsx:40` → `storefront/src/lib/shopify/queries/products.ts:110-132`
`findSiblingProductInRegion` is unguarded. This runs whenever `product.region !== currentRegion` — a routine case, not an edge case, since every visitor carries a region cookie. Any Shopify hiccup at that moment crashes the PDP — one of the three highest-traffic pages — even though the `getProductByHandle` call right above it on the same page is safely caught.

**Fix:** wrap in try/catch, fall back to `ProductNotAvailableInRegion` on failure instead of crashing.

## F4. `?brand=` URL param is under-escaped for Shopify's search-query syntax — can alter query results, not just crash — ✅ FIXED

**File:** `storefront/src/lib/shopify/queries/product-listing.ts:132-134,356`
The `vendor:${quoteQueryValue(b)}` clause uses a weak escaper (only literal single-quotes) for `brands`, which comes straight from the attacker-controlled `?brand=` URL param — unlike the search box, which uses a much more thorough `quoteSearchValue`. A crafted `?brand=` value containing an unescaped `)`/`:`/leading `-` can break out of the intended clause and alter the query's boolean structure (broaden results across regions/availability, or invert an exclusion). Contained from crashing pages (the one call site try/catches everything), but a real query-injection-style correctness gap.

**Fix:** use `quoteSearchValue`-style escaping for `brands` too, since it's user input.

## F5. Webhook signature check throws instead of failing closed cleanly when the secret env var is unset — silent stale-cache risk — ✅ FIXED

**File:** `storefront/src/lib/webhooks/verify.ts:8`
`process.env.SHOPIFY_CLIENT_SECRET!` — if unset, `createHmac('sha256', undefined)` throws, which the outer route try/catch swallows and returns `200 {ok:true, error:'unhandled...'}`. Net effect with a misconfigured env var: every webhook silently "succeeds" from Shopify's perspective (no retries triggered) while doing **zero cache invalidation** — pages serve stale data indefinitely with no visible failure signal beyond a log line.

**Fix:** explicit env-var presence check that returns `false` (not throws), so the route's normal 401 path is used instead.

## Lower-severity
- **F6** — `storefront/src/app/products/[handle]/page.tsx:31` and `lib/shopify/queries/products.ts:211` `console.log` the full product object (including wholesale/retail prices for every variant) on every PDP render — server-side only, not a crash, but heavy log volume with pricing data on the highest-traffic pages; worth gating behind a debug flag. — ✅ FIXED
- **F7** — `ProductPage.tsx:87` indexes `images[activeIndex]` with no bounds guard; not reachable today (upstream always guarantees ≥1 image) but fragile if that guarantee ever changes — worth a defensive `images[0] ?? PLACEHOLDER`. — ✅ FIXED

## Checked and found solid
- `products/page.tsx`'s `getTaxonomyTree()` and `fetchSubcategoryProductsAction` are both properly try/caught with safe fallbacks.
- Webhook routes verify HMAC before processing, dedupe by webhook ID, wrap `JSON.parse` and processing in an outer try/catch that always 200s (correct, prevents Shopify retry storms), and correctly fire-and-forget expensive re-queries.
- `buildLiveMegaMenu()` itself is unguarded but its only call site (`Navbar.tsx` → `getMegaMenuData()`) wraps it and degrades to `{}` — safe despite rendering on every page via the root layout.
- `getProductByHandle`, `getCart`, `getPickupLocations`, `getMainMenu`, `addToCart` all correctly try/catch and degrade gracefully / validate input live against Shopify.

---

# Section G — Account / Orders / Wishlist / Locations / Activity

Files: `app/account/**`, `features/account/**`, `features/wishlist/**`, `lib/wishlist.ts`, `lib/saved-locations.ts`, `lib/activity.ts`, `app/api/activity/route.ts`, `components/ui/AddressAutocomplete*.tsx`, `lib/google-maps/loadGoogleMaps.ts`.

Note: confirmed there is **no `error.tsx`/`global-error.tsx` anywhere in `storefront/src/app`** — every finding below marked "page-crash" falls through to Next's bare generic error page.

## G1. `account/layout.tsx` has no try/catch around the shared approved-customer gate — crashes all of `/account/*` for a valid customer — ✅ FIXED

**File:** `storefront/src/app/account/layout.tsx:14`
`const accessState = await getCustomerAccessState();` gates **every** `/account/*` route (Profile, Orders, Locations, Wishlist) via the shared layout, and has the same root-cause gap as E2 (`fetchCustomerAccessState` doesn't guard `getClaims()`/client construction from throwing). A transient Supabase Auth outage crashes the entire account section for an otherwise valid, approved, logged-in customer.

**Fix:** wrap the call in try/catch (or add `src/app/account/error.tsx`) and render "couldn't verify your account, please retry" instead of a raw crash.

## G2. Locations tab crashes on a transient Supabase error — ✅ FIXED

**File:** `storefront/src/app/account/locations/page.tsx:13` → `storefront/src/features/checkout/actions.ts:21-23` → `storefront/src/lib/saved-locations.ts:110-122` (`throw new Error(error.message)`)
Same root cause as D1, different call site (the account Locations tab rather than checkout). Unlike `OrderHistory.tsx`, which deliberately returns `{ok:false,error}` and renders a friendly message, Locations has no such guard.

**Fix:** make `listSavedLocations` return `{ok, error}` like the order actions do, or wrap the page's `await` in try/catch.

## G3. Wishlist tab crashes the same way — ✅ FIXED

**File:** `storefront/src/app/account/wishlist/page.tsx:13` → `storefront/src/features/wishlist/actions.ts:17-19` → `storefront/src/lib/wishlist.ts:44-55` (`throw new Error(error.message)`)
Identical pattern to G2 — a Supabase hiccup crashes the whole Wishlist tab with no fallback UI.

**Fix:** same as G2.

## G4. Wishlist folder-detail page crashes on a Shopify hiccup instead of showing "not found"/error — ✅ FIXED

**File:** `storefront/src/app/account/wishlist/[folderId]/page.tsx:10` → `storefront/src/lib/wishlist.ts:164` → `storefront/src/lib/shopify/queries/wishlist.ts:62-68`
```js
const result = await getWishlistFolderAction(folderId);
if (!result.ok) notFound();
```
`getVariantsByIds` inside this chain calls `shopifyStorefrontRequest` unguarded. If Shopify is rate-limited/errors (e.g. a variant was recently deleted, causing a GraphQL error rather than a null node), the exception propagates past the `if (!result.ok) notFound()` check (which never runs — the throw happens before the function returns) and crashes the page for a customer just viewing their own saved list.

**Fix:** wrap `getVariantsByIds`/`getWishlistFolderWithItems` in try/catch, degrade to the folder with a partial/empty item list plus an error flag rather than throwing.

## G5. "Add to Wishlist" picker can get stuck on "Loading..." forever — ✅ FIXED

**File:** `storefront/src/features/wishlist/AddToWishlistButton.tsx:56-61`
`await getWishlistPickerDataAction(variantId)` is unguarded; if the underlying `listWishlistFolders()` throws (see G3), the panel never reaches `status:'ready'`. The component already has an `'error'` panel state defined and rendered in JSX — it's just never set here.

**Fix:** wrap the call in try/catch, call `setPanel({status:'error', error:'...'})` on failure — the UI already exists.

## G6. Logout button can get stuck, leaving cart/session in a half-torn-down state — ✅ FIXED

**File:** `storefront/src/app/account/../features/account/LogoutButton.tsx:37-58` (`handleLogout`)
The local cart is cleared synchronously first (`clearCart()`), then `await clearCartSessionAction()` and `await supabase.auth.signOut()` run unguarded. If either throws (network drop), the button stays stuck on "Logging out..." with no retry, and — worse — the cart is already gone locally even though sign-out may not have completed.

**Fix:** wrap the async body in try/catch, reset the loading state and show a retry/error message on failure.

## G7. A failed Google Maps script load is cached forever for the rest of the browser tab session — ✅ FIXED

**File:** `storefront/src/lib/google-maps/loadGoogleMaps.ts:6-64`
`loaderPromise` is set once and never reset to `null` on rejection. If the script fails to load once (transient network blip), every subsequent call in that tab — e.g. reopening "Add New Location" later, after connectivity is restored — returns the same already-rejected promise, permanently disabling address autocomplete for the session (not a crash: both callers correctly `.catch()` and degrade to manual entry, but it's a real, silent, permanent feature loss within a session).

**Fix:** set `loaderPromise = null` before rejecting so a later call can retry.

## Checked and found solid
- `OrderHistory.tsx`/`account/actions.ts`: properly try/catches, checks `response.ok`, returns typed results consumed correctly by the UI.
- `invoice/page.tsx`: handles missing `orderId` and `!result.ok` correctly.
- `lib/wishlist.ts`/`lib/saved-locations.ts`: every function independently re-checks `getCustomerAccessState()` and scopes queries by the session's own `customer_id` — no path found where a tampered folder/location ID leaks another customer's data (a tampered wishlist folder ID correctly resolves to `notFound()`).
- `lib/activity.ts`/`ActivityTracker.tsx`/`api/activity/route.ts`: every call wrapped in try/catch, silent-drop-on-failure by design (correct for non-critical analytics), route always 204s.
- `AddressAutocomplete*.tsx`: correctly catches Google Maps load failures and degrades to a plain manual-entry input.

**One cross-repo item worth a follow-up:** `account/actions.ts`'s `getOrderDetailAction` sends `customerId` to admin-panel's `/api/internal/customer-order-detail` and trusts that service to re-verify ownership. That route lives in Section A/B/C above (admin-panel) and was confirmed there to check auth (`isInternalRequestAuthorized`) but its handling of the customerId ownership check specifically wasn't independently re-verified in this storefront-side pass — flagged per this project's "every function returning a customer's own orders must self-check" rule.
