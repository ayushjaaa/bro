# Persistent (account-tied) cart — implementation plan

Status: in progress. Updated as each step lands.

## Why

Shopify's Storefront API does **not** natively support "restore this customer's cart on any device after login" — confirmed directly against official docs (`shopify.dev/docs/api/storefront/latest/objects/customer` has no `cart`/`carts`/`lastCart` field; `cart(id:...)` requires an already-known cart ID; `cartBuyerIdentityUpdate` only attaches identity to an existing cart, it doesn't retrieve one). So this is built at the application level: we store a `customer_id -> cart_id` pointer ourselves, and re-resolve it against Shopify's live cart on every login. We never store cart contents ourselves — only the pointer; the real line items/quantities/prices always come from Shopify's `cart(id:...)` query at read time.

Scope note: this storefront has **no guest cart** — every cart mutation is already gated behind `isCustomerApproved()` (`lib/auth/access-state.ts`). So there's no "merge guest cart into account on login" case to handle.

## Steps

- [x] **1. Supabase table `customer_carts`** — SQL file written: `admin-panel/scripts/supabase/013-create-customer-carts.sql`. **Needs to be run manually in the Supabase SQL editor** (no DB-level/Management API credentials available in this environment to run it directly — only Data API keys). Matches the exact RLS pattern of `saved_locations`/`wishlist_folders` (009/010).
  - `customer_id uuid PRIMARY KEY REFERENCES customers(id)`, `cart_id text NOT NULL`, `updated_at timestamptz DEFAULT now()`.
  - RLS: customer can only read/write their own row.
  - `customer_id` as PRIMARY KEY (not just indexed) so an upsert always overwrites, never accumulates stale rows.

- [x] **2. Save the mapping on every cart mutation** — done in `storefront/src/lib/cart-tracking.ts`.
  - Extended `reportCartActivity()`, which already runs after every add/update/remove (verified all 3 call sites: `addToCart` in `product/actions.ts`, `updateCartLineQuantity` + `removeCartLinesAction` in `cart/actions.ts`, all already gated on `access.status === 'approved'`) with `customer.id` and the resulting `cart.id` on hand.
  - Given its own independent try/catch (not nested inside the cart_events/cart_snapshot one) so an analytics-insert failure never skips it — this pointer is functional, not just admin-panel analytics.
  - Guarded on `cart?.id` — never upserts a null cart_id.

- [x] **3. Restore the mapping on login** — done.
  - New `restoreCartOnLogin(customerId)` in `storefront/src/lib/cart-tracking.ts`: looks up `customer_carts`, calls Shopify's `getCart()` to verify it's still valid (Shopify returns `null` for expired/completed), and if valid overwrites this device's `cart_id` HttpOnly cookie with it (same cookie options as `addToCart` sets — httpOnly/secure-in-prod/sameSite lax/path `/`/30-day maxAge). Never throws — any failure just leaves the cookie as-is.
  - Wired into `signInWithPassword` (`storefront/src/features/auth/actions.ts`) right after `status === 'approved'` is confirmed, before returning `{ ok: true }`. Also added `id` to the `customers` select (was only selecting `status` before).
  - Wired into the Google OAuth callback (`storefront/src/app/auth/callback/route.ts`) at the equivalent point — same `id` addition to its `customers` select.
  - Both call sites are strictly after the existing approval gate (pending/rejected sessions get signed back out before reaching this code, unchanged from before).

- [x] **4. Logout — verified unchanged**
  - Re-read `LogoutButton.tsx` / `clearCartSessionAction` after steps 1-3 landed — still only deletes the local `cart_id` cookie, never touches `customer_carts`. No edit needed; this is exactly the behavior the restore step depends on.

- [x] **5. Clear the mapping on successful checkout** — done.
  - New `clearCustomerCartPointer(customerId)` in `cart-tracking.ts` — deletes the customer's `customer_carts` row. Best-effort, never throws.
  - Wired into `storefront/src/features/checkout/actions.ts` right before the existing `cookieStore.delete(CART_COOKIE)` call, using the `access.customer.id` already in scope there.

- [x] **5b. Also empty the real Shopify cart on checkout success** — found during manual test discussion, not in the original plan.
  - The gap: steps 5 only cleared *our own* pointer/cookie. The persistent-cart feature deliberately points every simultaneously logged-in session of the same customer at the same `cart_id` (that's the whole point — Device A adds something, Device B should see it too). But that means if Customer is logged in on Device A **and** Device B at the same time, and checks out from Device A, Device B's session was never logged out — its own `cart_id` cookie is untouched, and it would keep reading the same Shopify cart object via `getCurrentCart()`. Since this checkout creates a Draft Order rather than going through Shopify's own checkout, the Shopify cart's line items were never actually removed — so Device B would keep showing the just-ordered items as if still pending, indefinitely (until it happens to log out/in itself).
  - Fix: right after Draft Order creation succeeds, also call `removeCartLines(cart.id, orderableLines.map(l => l.id))` — the same helper already used for the out-of-stock cleanup branch — so the real Shopify cart reflects reality for *any* session reading it, not just the device that checked out. Out-of-stock lines that didn't make it into the order are deliberately left in the cart.

- [x] **5c. Fix stale client-side cart cache never re-checking the server** — found while debugging the user's live report that Device B's `/cart` page still showed the just-ordered items even after refreshing, while `/checkout` correctly showed empty.
  - Root cause: `CartTable.tsx` and `CartDrawer.tsx` both mirror the real cart into a Zustand store (`useCartStore`, persisted to `localStorage`) for instant reads. Both had a guard — `if (cart) return` / `if (!isOpen || !isApproved || cart) return` — that **skipped re-fetching from the server entirely whenever the store already had any cached value**, no matter how stale. So even a hard refresh kept showing the same stale localStorage snapshot forever, since the fetch that would've corrected it never ran.
  - This bug predates the persistent-cart feature, but was low-impact before it (a stale snapshot mostly meant "the cart cookie also wasn't around", so it rarely came up). It becomes a real, frequent problem now that the same account's cart is shared and mutated across multiple simultaneously logged-in sessions/devices by design — exactly the scenario the user was testing.
  - Fix: both components now always fetch fresh on mount (`CartTable`) / on every drawer-open (`CartDrawer`), still painting the cached value instantly while the fetch is in flight, but never skipping the fetch because a cached value exists. Dependency arrays adjusted to run once per mount/open rather than depending on `cart` itself (which would otherwise loop, since `setCart` changes `cart`).

- [x] **5d. Fix the Navbar cart badge never fetching at all** — found while chasing the same class of bug as 5c: user reported User 2's cart still showed nothing even after refresh, despite User 2 having their own items in it.
  - Root cause: `CartButton.tsx` (the badge/dot icon in the site-wide Navbar) is purely passive — it only reads `useCartStore`, and unlike `CartTable`/`CartDrawer` it never called `getCurrentCart()` itself at all. Since Navbar renders on every page, it's often the *only* cart UI a page load touches (visitor never opened the drawer or visited `/cart`) — so the badge could sit on a stale/empty snapshot indefinitely, with nothing to ever correct it.
  - Fix: added an `isApproved` prop (passed from `Navbar.tsx`, same `accessState.status === 'approved'` value already used for `LoginTrigger`/`MobileNavDrawer`) and a mount effect that fetches fresh via `getCurrentCart()` and calls `setCart()`, same pattern as the other two components. Verified live: badge correctly shows the red dot on a totally fresh page load that never touched the drawer or `/cart`.
  - Noted but left alone (pre-existing, unrelated to this change): `npx eslint` flags a `react-hooks/set-state-in-effect` warning on this file's separate SSR-hydration `useEffect(() => setMounted(true), [])` line, which predates this edit.

- [x] **5e. Fix already-active sessions never picking up another session's cart changes** — the actual bug behind the user's repeated "User 2 still doesn't see it, even after refresh" reports; reproduced live before fixing.
  - Repro that confirmed it: Session A and Session B both log in (via Playwright, real browser) while the account has NO cart yet — neither gets anything to restore, correctly, since nothing exists. Session A then adds an item, creating a fresh `cart_id` and saving it to `customer_carts`. Session B, still sitting on its own stale/nonexistent local cookie from its earlier login, refreshes `/cart` — screenshot confirmed it genuinely showed "Your cart is empty", not a test artifact.
  - Root cause: `restoreCartOnLogin` only ever runs once, at the moment of login. It has no way to help a session that was already active *before* the pointer even existed. 5c/5d already made every cart UI re-fetch on mount/open, but they were all still asking `getCurrentCart()`, which only ever trusted its own local cookie — so re-fetching more often didn't matter if the thing being re-fetched from was the wrong source.
  - Fix: `getCurrentCart()` (`storefront/src/features/cart/actions.ts`) now re-resolves against `customer_carts` on **every call**, not just at login — if the DB pointer differs from (or exists when) the local cookie doesn't match, it adopts the DB's `cart_id` and overwrites the cookie before fetching. Combined with 5c/5d's "always fetch on mount", this means any already-active session picks up another session's changes on its very next natural page load/drawer-open — no re-login required.
  - Re-verified the exact same repro after the fix: Session B's cookie updated from `null` to the real cart_id on refresh, and the cart page visually showed the item (screenshot-confirmed, not text-matched — the earlier "mentions Flavour Beast" check had produced a false positive once, matched against unrelated page text, so this round was checked by eye against the actual rendered table).

- [ ] **6. Manual verification pass** (see checklist below) — table now exists in Supabase (confirmed via REST). Core restore flow (login → add → logout → login → same cart_id + real item visible) verified live via browser automation, zero console errors. Remaining cases (cross-device, different-user-same-device, checkout-then-relogin, the new 5b concurrent-session fix) left for manual click-through per user's request.

## Verification checklist (run through after implementation)

- [ ] New customer: login → add item → logout → login again → cart restored
- [ ] Same customer, different browser/device → same cart appears
- [ ] Customer A logs out, Customer B logs in on the same device/browser → B sees only their own cart (empty or their own), never A's
- [ ] Customer completes checkout (Draft Order created) → logs out → logs back in → cart is empty, not the just-ordered items
- [ ] Pending/rejected account login → no cart restore attempted (blocked by existing approval gate)
- [ ] Simulate a Supabase failure on the mapping read/write → login and cart mutations still succeed; only the mapping save/restore silently no-ops
