# Full Codebase Error-Handling Review — Storefront

Scope: entire `storefront/src` — Auth/Apply/Account/Province-gate, Cart/Checkout/Wishlist, Products/Product/Brands/Retail/Home/Navigation, and all API/webhook routes.

This is a documentation-only pass — nothing below has been fixed yet. Within each section, findings are ordered most severe (can crash a whole request/page) → data corruption / money risk → stuck-UI / UX degradation.

**Confirmed by all three audit passes independently: there is NO `error.tsx`/`global-error.tsx` anywhere under `storefront/src/app`.** This is the single highest-leverage fix — it doesn't remove any individual bug below, but it turns every "crashes the whole page" finding into a friendly retry screen instead of Next's raw error page, exactly like admin-panel's `(dashboard)/error.tsx` fix.

**Confirmed: `storefront/src/proxy.ts` (the Next 16 middleware) does no route protection at all (by design — storefront is intentionally open browsing), but has zero try/catch around its Supabase session-refresh call — same root-cause pattern as admin-panel's B1 finding, non-null-asserted env vars included.**

---
---

# Section A — Crash risk (can take down a whole page/request, or worse, happen mid-money-flow)

## 1. `proxy.ts` (middleware) has no try/catch — runs on almost every request site-wide

**File:** `storefront/src/proxy.ts:18-43`
```ts
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { ... } }
  );
  await supabase.auth.getClaims();
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)'] };
```
**Problem:** Matcher covers nearly every route (home, products, cart, checkout, account, apply). Non-null-asserted env vars can throw synchronously if ever unset in a deploy; `getClaims()` can throw on a corrupted/manually-edited session cookie. This middleware doesn't gate anything (access-checking happens per-page) — there is no reason for it to ever hard-fail a request.

**Fix:** wrap the body in try/catch; on any throw, `return response` (fail open) — same fix already applied to admin-panel's `proxy.ts`.

## 2. No `error.tsx` anywhere + several unguarded Server Component data-fetches — Shopify/Supabase hiccups crash whole pages

**Files (each currently unguarded, crashes the named page with no error.tsx to catch it):**
- `lib/shopify/queries/brands.ts` (`getLiveBrands`) → `features/home/components/BrandStrip.tsx:42` (rendered directly in `app/page.tsx` — **crashes the homepage**) and `features/brands/AllBrandsPage.tsx:38` (**crashes `/brands`**).
- `lib/shopify/queries/products.ts:110-132` (`findSiblingProductInRegion`) → `app/products/[handle]/page.tsx:40` — runs on every product-detail visit where the visitor's region cookie differs from the product's region tag (a common case) — **crashes the product-detail page**.
- `lib/auth/access-state.ts:40-70` (`fetchCustomerAccessState`) → called unguarded from `app/products/page.tsx:60`, `app/products/[handle]/page.tsx:26`, and is the auth gate for virtually every cart/checkout/wishlist Server Action in the app. `createSupabaseServerClient()` inside it non-null-asserts env vars with zero validation.
- `app/checkout/page.tsx:25-29` → `listSavedLocationsAction()` → `lib/saved-locations.ts:121` throws a plain `Error` on any Supabase failure — **crashes the checkout page**, the one page in the app that touches real money.
- `features/wishlist/actions.ts:88-92` (`getWishlistFolderAction`, unlike ALL its sibling actions) → `lib/shopify/queries/wishlist.ts:62-68` (`getVariantsByIds`, no try/catch at all) → `app/account/wishlist/[folderId]/page.tsx:10` — **crashes that wishlist-folder page**.

**Fix:** (a) add `storefront/src/app/error.tsx` (root-level boundary, catches all of the above as a backstop) — mirrors admin-panel's `(dashboard)/error.tsx`. (b) Additionally guard each function at its source so a Shopify/Supabase hiccup degrades gracefully instead of relying on the boundary alone (e.g. `getLiveBrands` → empty array, `findSiblingProductInRegion` → `null`/no-redirect, `fetchCustomerAccessState` → fail to `{status:'guest'}`, `getWishlistFolderAction` → wrap in try/catch like its siblings already do).

## 3. `auth/callback/route.ts` (Google OAuth callback) has no try/catch around several throwable Supabase calls

**File:** `storefront/src/app/auth/callback/route.ts:21-84`, entire `GET` handler — `exchangeCodeForSession` (L36), `getUser()` (L44), the `customers` lookup (L50-54) all unguarded.

**Problem:** Reached directly by Google's redirect — no React error boundary can help here. A transient Supabase outage mid-exchange throws raw instead of this route's own designed `?login_error=...` redirect, giving a legitimate first-time login a jarring dead end straight out of Google.

**Fix:** wrap the whole handler body in try/catch; on any exception, redirect to `${origin}/?login_error=exchange_failed`.

## 4. `placeOrderAction`'s success-path JSON parse is unguarded — fires AFTER the real Draft Order already exists (money risk)

**File:** `storefront/src/features/checkout/actions.ts:233-242`
```ts
if (!response.ok) {
  const body = await response.json().catch(() =&gt; null);   // guarded
  ...
}
const { name } = (await response.json()) as { draftOrderId: string; name: string };  // NOT guarded
```
**Problem:** every other call in this otherwise carefully-built function is guarded — this is the one exception, and it's the worst possible place for one. If admin-panel's response is a 200 with a truncated/non-JSON body (edge timeout, proxy hiccup), `.json()` throws **after the real order was already created in Shopify**, skipping cart-cleanup (`removeCartLines`, `clearCustomerCartPointer`, `clearCartCookies`) and the `LAST_ORDER_COOKIE` that `/checkout/success` needs. The customer sees no confirmation and may retry — risking a **duplicate order**.

**Fix:** wrap this line the same way the line above it is; on parse failure, still treat the order as placed (log loudly) rather than throwing, or return a distinct "your order may have gone through — check before reordering" message.

## 5. `CheckoutPage.handleCheckOut` has no try/catch — "Placing Order..." can freeze right after a real order was placed (money risk)

**File:** `storefront/src/features/checkout/CheckoutPage.tsx:267-283, 310-318` — `await placeOrderAction(...)` unguarded at both call sites; `setPlacingOrder(false)` only reached if the call resolves.

**Problem:** combined with #4, a thrown rejection here freezes the Check Out button indefinitely with zero confirmation of whether a real order (with real inventory/money implications) was just placed.

**Fix:** wrap both call sites in try/catch/finally; on catch, show "Something went wrong — please check your account or contact us before trying again" (not a generic "just retry" message, since retrying here is genuinely risky).

## 6. `reportCartActivity`'s Supabase client construction sits outside its own try block

**File:** `storefront/src/lib/cart-tracking.ts:37-44` — `const supabase = await createSupabaseServerClient();` is called BEFORE the `try {` on the next line, despite the function's own doc comment promising "best-effort only, every failure is swallowed." Called unguarded from `features/cart/actions.ts:105` and `:161`, right before each returns `{ok:true, cart}`.

**Problem:** if client construction throws, the Shopify cart mutation has ALREADY succeeded, but the Server Action throws instead of returning success — client sees an error for an action that actually worked, and may retry (double-applying a quantity change).

**Fix:** move the client construction inside the existing try block.

## 7. Products webhook route — unawaited async IIFE has no `.catch()` (same bug class fixed in admin-panel)

**File:** `storefront/src/app/api/webhooks/products/route.ts:149-191` — `void (async () =&gt; {...})()` with no `.catch()`, inconsistent with `forwardInventoryWebhook` in the same file (which IS properly self-guarded). A throw here (e.g. from `revalidateTag`/`comboTagRegistry.findMatching`) becomes a silent unhandled rejection with no `[products-webhook]`-prefixed log, after the route already returned 200 to Shopify.

**Fix:** wrap the IIFE body in try/catch or add `.catch((err) =&gt; console.error('[products-webhook] async revalidate failed:', err))`.

## 8. `shopifyStorefrontRequest`'s `response.json()` calls unguarded against malformed JSON on a 2xx

**File:** `storefront/src/lib/shopify/storefront-client.ts:99, 115` — a 200 with a non-JSON body throws a raw `SyntaxError` instead of the function's own `ShopifyStorefrontApiError`. Contained by callers that already try/catch the whole request (`getCart`, `getPickupLocations`), but NOT contained for `getVariantsByIds` (finding #2's wishlist crash) since that one isn't documented as intentionally throwing.

**Fix:** wrap both `.json()` calls so a parse failure throws the same typed error every caller's `instanceof ShopifyStorefrontApiError` handling already expects. (Same gap exists in currently-unused `lib/shopify/admin-client.core.ts:82,124` — not reachable from any live route today, low priority.)

---

# Section B — Data corruption / money risk (misleading state, not necessarily a hard crash)

## B1. `getCustomerAccessState` discards the `customers`-lookup Supabase error — the auth gate for the ENTIRE cart/checkout/wishlist surface

**File:** `storefront/src/lib/auth/access-state.ts:48-58`
```ts
const { data: customer } = await supabase.from('customers').select(...).eq(...).maybeSingle();
if (!customer) { return { status: 'guest' }; }
```
**Problem:** `error` never captured — a transient DB failure is indistinguishable from "genuinely not an approved customer." Since every cart/checkout/wishlist Server Action gates on `access.status === 'approved'`, a real approved customer hitting this during a blip gets "Please log in with an approved account..." — for checkout specifically, this blocks a real order for a reason unrelated to their account. Exact same anti-pattern as admin-panel's fixed B2 finding, reproduced on the customer-facing revenue path.

**Fix:** capture `error`; on error, return a distinct state (e.g. `{status:'unknown'}`) so callers show "couldn't verify your account, try again" instead of the misleading "not approved" message.

## B2. `addToCart` — a Shopify blip fetching the customer's EXISTING cart silently forks a brand-new one

**File:** `storefront/src/features/product/actions.ts:63-64` — `getCart()` already returns `null` on both "no cart yet" and "fetch failed" (same shape), so the caller can't distinguish them; the next lines then create a second Shopify cart, silently orphaning the customer's real one (with whatever was already in it).

**Fix:** have `getCart`/a wrapper distinguish "confirmed no cart" from "fetch failed", and on the latter return an error instead of falling into "create a new cart."

## B3. `getProductByHandle` returning `null` on error is indistinguishable from "genuinely doesn't exist" — a Shopify hiccup 404s a real product

**File:** `storefront/src/lib/shopify/queries/products.ts:198-267` → `app/products/[handle]/page.tsx:29`'s `if (!product) notFound();`. A transient Shopify 5xx makes a real, live product 404 — misleading for customers and actively harmful for SEO.

**Fix:** distinguish "confirmed doesn't exist" from "the request itself failed"; render a friendly "couldn't load, try again" state for the latter instead of `notFound()`.

---

# Section C — Stuck-UI / UX degradation (client components, event handlers, useEffect)

## C1. `WholesaleSignupForm.tsx` / `RetailSignupForm.tsx` — both signup forms' submit handlers are fully unguarded

**Files:** `storefront/src/features/apply/WholesaleSignupForm.tsx:838-846, 853-876` and `storefront/src/features/retail/RetailSignupForm.tsx:827-880` — `checkRegistrationEmail`/`submitRegistration` calls have no try/catch; `setSubmitting(false)` only runs if the call resolves.

**Problem:** highest-impact stuck-UI findings in this whole review — a thrown rejection leaves a 30-field application (with an uploaded licence file) permanently stuck on "Submitting…" with zero error and zero way to retry, for BOTH the wholesale and retail signup paths.

**Fix:** wrap both `await` calls (in both files) in try/catch/finally, resetting `submitting` and showing a generic retry message on any thrown exception.

## C2. `LocationsManager.tsx` — `handleSave`/`handleDelete`/`handleSetDefault` all unguarded

**File:** `storefront/src/features/account/LocationsManager.tsx:58-93, 95-105, 107-117` — no `finally`, let alone `catch`, on any of the three. A throw leaves "Saving..."/the delete or set-default button stuck disabled forever.

**Fix:** wrap each in try/catch/finally.

## C3. `LogoutButton.tsx` — `handleLogout` unguarded; cart already cleared before the point of failure

**File:** `storefront/src/features/account/LogoutButton.tsx:37-58` — `clearCart()` runs, then `clearCartSessionAction()`/`signOut()` with no guard. A throw leaves the confirm dialog stuck on "Logging out…" with the local cart already wiped and no clean sign-out having actually happened.

**Fix:** wrap in try/catch; reset `loggingOut` and show an inline error on failure; consider running navigation in a `finally`.

## C4. `RegistrationMethodChooser.tsx` — `handleGoogle` doesn't guard `setAuthIntent`'s possible throw

**File:** `storefront/src/features/apply/RegistrationMethodChooser.tsx:28-46` — lower severity (defense-in-depth), but a throw from `setAuthIntent` (unguarded Server Action) or `createSupabaseBrowserClient()` leaves the button stuck on "Redirecting to Google…".

**Fix:** wrap the body in try/catch, matching the existing `if (oauthError)` recovery.

## C5. `OrderHistoryTable.tsx` / `OrderDetailDrawer.tsx` — unguarded action calls, silent failure (not permanently stuck, but no error shown)

**Files:** `storefront/src/features/account/OrderHistoryTable.tsx:82-94` (`applyDateRange`, inside `useTransition` so the pending flag DOES resolve, but no error is ever shown) and `storefront/src/features/account/OrderDetailDrawer.tsx:51-60` (`.then()` with no `.catch()` — DOES get stuck on "Loading order details..." since there's no transition to auto-resolve it).

**Fix:** add try/catch (OrderHistoryTable) / `.catch()` (OrderDetailDrawer) setting a visible error state.

## C6. `ProductListPage.tsx` — live product-grid fetch `.then()` has no rejection handler

**File:** `storefront/src/features/products/ProductListPage.tsx:867-900` — the Server Action call itself is internally safe, but the network round-trip to invoke it can still reject before reaching that safety; no `.catch()` means the grid's loading skeleton can hang forever on a network-level failure.

**Fix:** add `.catch()` resetting the loading state and logging.

## C7. Cart drawer/table hydration has no `.catch` — "Loading your cart..." can hang forever

**Files:** `storefront/src/features/cart/CartDrawer.tsx:163-168`, `storefront/src/features/cart/CartTable.tsx:284-294` — both pass an async function to `useTransition`'s callback with no `.catch()`; if the callback rejects (e.g. via B1's `getCustomerAccessState` chain), the transition's pending flag never resolves.

**Fix:** add `.catch()` inside both callbacks, setting cart to a known state and showing an error.

## C8. Wishlist picker popover — two separate stuck/silent-failure gaps

**File:** `storefront/src/features/wishlist/AddToWishlistButton.tsx`:
- `openPanel` (L56-61) has no `.catch()` on `getWishlistPickerDataAction` — despite the component already having an `'error'` panel state that's correctly rendered elsewhere, `openPanel` never transitions to it, so the popover can hang on "Loading..." forever.
- `handleToggleFolder`/`handleCreateList` (L63-96) both silently drop `!result.ok` (`return;` with no error shown) — unlike sibling components (`WishlistFolderList.tsx`, `WishlistFolderDetail.tsx`) which correctly surface `result.error`.

**Fix:** add `.catch()` to `openPanel` transitioning to the existing error state; add an inline error slot to the popover and set it in both handlers on failure.

---

# Checked and found solid (no action needed)

- **`features/checkout/actions.ts`'s `placeOrderAction`** (aside from finding #4): input validation up front, fail-closed region/stock lookup, cleanup calls correctly use `.catch()` so a cleanup failure never blocks the real user-facing error.
- **`features/cart/actions.ts`**: every Shopify mutation call wrapped in try/catch with `cartUserErrorMessage` sanitizing raw Shopify wording; "stale line" races correctly treated as success, not error.
- **`lib/cart-cookies.ts`, `lib/cart-ownership.ts`, `lib/cart-id.ts`, `lib/cart-input.ts`**: all correctly guarded/pure, with `pointerLookupFailed` properly threaded so a DB hiccup never deletes cookies "on a guess."
- **`lib/cart-tracking.ts`'s `restoreCartOnLogin`/`clearCustomerCartPointer`**: fully wrapped, documented "never throws," verified true (only sibling `reportCartActivity` has the #6 gap).
- **`features/wishlist/actions.ts`** (aside from `getWishlistFolderAction`, finding #2): every other export correctly uses `safeActionError`/`SafeActionError`.
- **`features/account/actions.ts`'s `callAdminPanelInternal`**: fetch wrapped in try/catch, `.json()` chained with `.catch(() =&gt; null)`, env vars explicitly checked (not asserted) before any network call — a genuinely well-built reference pattern.
- **`lib/registration-cleanup.ts`**: explicitly "never throws" by design, env vars checked not asserted, `fetch` wrapped, uses `AbortSignal.timeout`.
- **`features/account/components/AccountTour.tsx`/`tour-utils.ts`**: exemplary defensive `sessionStorage`/`localStorage` handling with documented private-browsing fallback, and a timeout fallback so a missing DOM element can't hang the tour.
- **`lib/auth/intent.ts`, `lib/auth/login-error-messages.ts`, `lib/auth/registration-errors.ts`, `lib/province-gate.ts`**: pure/synchronous, correctly guarded where any parsing occurs (`decodeURIComponent`).
- **`app/products/page.tsx`**: its one risky call (`getTaxonomyTree()`) IS correctly wrapped with an explicit static-catalog fallback — the exact pattern missing elsewhere in this review.
- **`components/layout/Navbar.tsx`**: `buildLiveMegaMenu()` correctly wrapped by its caller, degrading to no mega-menu rather than crashing the layout.
- **`lib/webhooks/verify.ts`, `app/api/webhooks/taxonomy/route.ts`, `app/api/activity/route.ts`, `app/api/internal/revalidate-product/route.ts`**: all HMAC/secret checks correctly ordered before parsing, safe JSON parsing, clean typed responses on every failure path, always answer 200/204 where documented as required.
- **`lib/shopify/queries/locations.ts`, `product-webhook-queries.ts`, `admin-client.core.ts`'s env validation, `combo-tag-registry.ts`**: all correctly guarded or pure.

---

# Summary of fix priority

1. **Section A (crash-risk), items 4 and 5 first** — the checkout/order-placement pair is the only place in this review where "crash" and "real money already spent" intersect; highest priority regardless of the rest of the ordering.
2. **Item 2 (`error.tsx` + the 5 unguarded page-crash call sites)** — single highest-leverage structural fix, mirrors admin-panel's own first fix.
3. **Item 1 (`proxy.ts`)** — largest blast radius (whole-site), same as admin-panel's B1.
4. Remaining Section A items (3, 6, 7, 8) — mechanically similar guarded wraps.
5. **Section B** (B1 especially — it's the choke point behind several Section C stuck-UI findings too).
6. **Section C** — apply the same try/catch/finally or `.catch()` pattern throughout; C1 (both signup forms) is the highest-impact given user effort at risk.
