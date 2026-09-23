# Feature-wise Edge Case Checklist + Test Coverage

Written 2026-09-21. Legend: ✅ tested and passing · 🟡 partly tested · ❌ not tested · 🔴 tested and **currently failing (real bug)** · 📝 manual only

Test layers: **U** = unit (`npm run test:unit`, both apps) · **S** = security/DB (`npm run test:security`) · **E** = Playwright (`npx playwright test`) · **new** = added on 2026-09-21.

> How the edge cases were chosen: the code was read feature by feature (server actions, data layer, pages) and each
> entry is either something the code already guards against (so a test should pin it) or a case the code does not
> visibly handle. Admin-panel items were derived from routes + data-layer files; the admin has **no browser (E2E)
> tests at all** today, so most admin rows are 🟡/❌ — see section C.

---

## 0. Findings from this pass (read first)

| # | Severity | Finding | Evidence |
|---|---|---|---|
| F1 | ✅ **FIXED 2026-09-21** (was 🔴 High – data leak) | On the product page (PDP) the raw HTML/RSC payload contains BOTH `wholesalePrice` and `retailPrice` for **every viewer, including a guest**. Guest sees real `$101.32` / `$126.65` in page source. Cause: `toDisplayProduct` (`storefront/src/features/product/data.ts`) only removes the fields in the TypeScript *type*; the `...product` / `...f` spreads keep them at runtime, and the guest branch in `app/products/[handle]/page.tsx:56` spreads raw flavours again. The code comment there claims the opposite. | `curl` of the PDP as guest: 66× `wholesalePrice`, 66× `retailPrice`. Failing tests: `tests/unit/pricing-tiers.test.ts` (4), `tests/security/client-leak.test.ts` (2), `e2e/browser-leaks.spec.ts` (3). |
| F2 | Test blind spot | The old `e2e/price-leak.spec.ts` looks for keys named `price/amount/...` and `$1.23`; it cannot see `wholesalePrice`/`retailPrice`, which is why F1 was never caught. Fixed by the new by-key-name tests. | — |
| F3 | Low | `resolveInitialSelection` crashes (`catalog[0]` undefined) if the live taxonomy returns zero categories or a category with zero groups. Marked `it.todo` (P-12). | `tests/unit/catalog-selection.test.ts` |
| F4 | Info (fixed in test) | `region-rules.ts` exists in both apps and must stay identical; only a comment differed. Now guarded by a parity test. | `admin-panel/tests/unit/two-app-parity.test.ts` |
| F6 | ✅ **FIXED 2026-09-21** (Low) | The Shopify cart secret (`?key=`) was saved in the browser's localStorage (`gemini-cart`), against Shopify's own rule ("treat it like a password ... not in client-side code") and OWASP's "no tokens in localStorage". Fix: `resolveCartPricing` returns a key-less id (`lib/cart-id.ts`); checkout reads the full id from the HttpOnly cookie; the client store migrates old saved data (persist v1). | Tests: `tests/unit/cart-id.test.ts`, `e2e/browser-leaks.spec.ts` (2 new). **Not verified end-to-end:** the checkout success step that clears the ordered lines from the Shopify cart (needs a full order run). |
| F5 | Known | `C6` sort A–Z doesn't reorder (already documented in `listing-batch-c.spec.ts`); rate-limit test is `skip`ped. | existing |

F1 fix: `toDisplayProduct` now destructures both tiers out (allow-list / DTO pattern from the Next.js data-security guide; React taint API rejected: experimental and does not catch spreads) and a new `toGuestDisplayProduct` builds the guest shape; `app/products/[handle]/page.tsx` uses it. After the fix: PDP source has 0 tier keys for guest/retail/wholesale; unit 140 pass, client-leak 11 pass, browser-leaks 9/9 pass.

**Failing E2E that are NOT caused by F1** (same 3 fail on the pre-fix code; 2 more need the admin panel): `pricing-inventory-checkout` "wholesale ... not retail" (`$7` text still visible), "removing a line empties the cart", "more than available stock"; the two draft-order tests fail with admin-panel `Could not verify session` (AdminCheckUnavailableError). Need separate investigation.

---

## A. STOREFRONT features

### A1. Province gate / region selector
Files: `lib/regions.ts`, `lib/province-gate.ts`, `features/province-gate`, header RegionSelector.
| ID | Edge case | Status |
|---|---|---|
| R-1 | First visit → gate shows, cannot be dismissed, cannot pick "All" | ✅ U (new: GATE_REGIONS excludes "all") · 🟡 E (only bypass helper; no test that the modal appears/can't be closed) |
| R-2 | Returning visitor with cookie `all` is not trapped | ✅ U (new) |
| R-3 | Tampered `region` cookie (junk, `__proto__`, case, spaces) → treated as no region | ✅ U (new `isValidRegion`) |
| R-4 | Gate only on `/` and `/products*`, never `/cart`, `/checkout`, `/account`, look-alikes `/productsx` | ✅ U (new) |
| R-5 | Region cookie is a display filter only; order rule uses shipping province | ✅ U (region-rules) · ✅ E (`pricing-inventory-checkout`) |
| R-6 | Product page opened in the wrong region → redirect to sibling product or "not available" page | ❌ (B5 in E2E plan, not automated) |
| R-7 | Switching region while items are in the cart doesn't change cart lines | ❌ (C9 in plan) |

### A2. Registration (wholesale `/apply`, retail `/register/retailer`) + Google
Well covered by `AUTH_TEST_PLAN.md` (≈130 tests). Remaining gaps:
| ID | Edge case | Status |
|---|---|---|
| G-1 | Email/password, Google, duplicate email (any case), mismatch passwords, double submit, cross-wizard type | ✅ E/S |
| G-2 | Licence file: type, size (exact 10 MB), double extension, empty input | ✅ U/S |
| G-3 | Forged/oversized text fields, bad number of stores | ✅ U |
| G-4 | Mobile width: no horizontal scroll in wizard/chooser | 📝 manual only |
| G-5 | In-app browsers (Instagram/Facebook) Google block | 📝 |
| G-6 | Real Google consent flow | 📝 (bots blocked) |
| G-7 | Password reset ("Forgot password") | ❌ not built (`PASSWORD_RESET_PLAN.md`) |

### A3. Login / session / logout
| ID | Edge case | Status |
|---|---|---|
| L-1 | approved / pending / rejected / no application / wrong password / unknown email (same message) | ✅ E |
| L-2 | Callback errors, open redirect, reflected XSS, forged intent cookie | ✅ E/U |
| L-3 | Logout clears session; other tab logged out; Back button | ✅ E |
| L-4 | Admin credentials can't log into storefront and vice-versa | ✅ E |
| L-5 | Status changed to rejected mid-session → access lost immediately | ✅ E |
| L-6 | Brute-force / rate limit | ❌ (`test.skip`; needs CAPTCHA / firewall) |
| L-7 | Session expiry (token actually expires, not just cleared) | 🟡 (clearing only) |

### A4. Product listing (`/products`) — category tree, filters, search, sort, pagination
| ID | Edge case | Status |
|---|---|---|
| P-1 | Filter counts/pagination walk (no duplicates, all match) | ✅ E |
| P-2 | Refresh / back / forward / shared link keep the filter; bad URL params don't break | ✅ E |
| P-3 | Search + filter and brand + filter are subsets | ✅ E |
| P-4 | Search injection | ✅ E |
| P-5 | Filter debounce (1 call for many ticks) | ✅ E |
| P-6 | Region with no products → empty state, no crash | ✅ E |
| P-7 | Price range + filter | ✅ E |
| P-8 | Availability in/out adds up to total | ✅ E |
| P-9 | Mobile filter drawer | ✅ E |
| P-10 | Guest / retail / wholesale get the same product set, price shown only when approved | ✅ E |
| P-11 | URL → category resolution: junk, `__proto__`, wrong-category group, nested leaf, round trip for the whole real catalog, unique ids | ✅ U (new `catalog-selection`) |
| P-12 | Empty taxonomy / category with no groups doesn't crash | 🔴→ `it.todo` (F3) |
| P-13 | Sort A–Z | 🔴 known bug (F5) |
| P-14 | Price range: min > max, negative, non-number, decimals | ❌ |
| P-15 | Very long search string / unicode / emoji / only spaces | ❌ (injection covered, length not) |
| P-16 | Page beyond last (`?page=9999`), page 0, negative, `abc` | 🟡 (bad URL suite; confirm these exact values) |
| P-17 | Two rapid category clicks — last click wins, no stale result overwrite | 🟡 (B4 mixed actions) |

### A5. Product page (PDP)
| ID | Edge case | Status |
|---|---|---|
| D-1 | Price by account type (wholesale / retail / guest prompt) | ✅ E |
| D-2 | Retail without override falls back to wholesale; override of 0 is respected | ✅ U (new) |
| D-3 | Out-of-stock: disabled add-to-cart; stock over-add rejected | ✅ E (`stock-flow.spec.ts`); old `pricing-inventory-checkout` "more than available" test is obsolete (assumes Flavour 1 has 2 units and a disabled "+"; the app clamps quantity instead) |
| D-4 | 65-flavour product loads fast; far-apart flavours added together | ✅ E |
| D-5 | **Page source contains only the resolved price** | ✅ (F1 fixed; unit + browser tests) |
| D-6 | Compare-at (strikethrough) shows/hides | ❌ |
| D-7 | Unknown handle → clean 404 (no stack) | ✅ S (unknown URL) · ❌ for `/products/<junk>` specifically |
| D-8 | Description HTML from admin is sanitised on display | ✅ U (admin `sanitize-html`) · ❌ end-to-end on storefront render |
| D-9 | Flavour switch updates price/stock/image | ❌ |
| D-10 | Quantity stepper bounds: 0, negative, > stock, > 99 fallback, typed non-number | 🟡 (over-stock only) |
| D-11 | Wishlist button from PDP as guest → login prompt | ❌ |

### A6. Cart (drawer + `/cart`)
| ID | Edge case | Status |
|---|---|---|
| C-1 | Add same variant twice merges; +/- quantity; remove last line → empty | ✅ E |
| C-2 | Add/update/remove refuse anonymous callers and junk arguments | ✅ E/U |
| C-3 | Guest opens cart → login modal | ✅ E |
| C-4 | Stale line removed twice (double click / two tabs) → treated as success | ❌ (code handles it; no test) |
| C-5 | Cart persists across reload / device (persistent cart pointer) | 🟡 (PERSISTENT_CART_PLAN manual) |
| C-6 | Cart is cleared on logout (next person doesn't inherit it) | ❌ (`clearCartSessionAction`) |
| C-7 | Two tabs: cart badge syncs (storage event) | ❌ |
| C-8 | Cart pricing resolved per current account type, never both tiers | ✅ code (destructured) · ❌ test (cart.ts can't be imported in unit env because of `server-only`; covered by E `pricing-inventory-checkout`) |
| C-9 | Cart contents don't leak to guest via `localStorage` (`gemini-cart`) | ✅ E (new `browser-leaks`) |
| C-10 | 200+ lines / quantity 10 000 boundary | ✅ U-style in E forge test · ❌ exact boundaries |

### A7. Checkout / place order
| ID | Edge case | Status |
|---|---|---|
| K-1 | Non-approved caller blocked at the action | ✅ E/U |
| K-2 | Price charged = tier price (draft order) | ✅ E |
| K-3 | Draft order doesn't deduct stock; Mark as paid moves available→committed; buying past available is refused | ✅ E (`stock-flow.spec.ts`) |
| K-4 | All lines out of stock → cart cleaned, `removedItemNames` returned | 🟡 (documented D3, not automated) |
| K-5 | Mixed stock → only in-stock ordered | 🟡 |
| K-6 | Shipping province must match product region (BC/AB/MB/ON/QC own, others federal, untagged anywhere) | ✅ U |
| K-7 | Dropdown provinces all understood by the rule (13, no duplicates) | ✅ U (new) |
| K-8 | Free-text caps: note 1000, code 100, fields 200 | ✅ E forge (confirm) · ❌ exact boundaries |
| K-9 | Pickup flow | ❌ blocked by missing Storefront scope |
| K-10 | Admin-panel down / wrong secret → friendly error, cart untouched | ❌ |
| K-11 | Double-click "Place order" → only one draft order | ❌ **important** |
| K-12 | `/checkout/success?order=FAKE` shows nothing unless the HttpOnly cookie set it | ❌ **important** |
| K-13 | After success: cart empty in this tab, other tab, other device | ❌ |
| K-14 | Order lands in `/account/orders` with right status label | ✅ U (new status labels) · ❌ E |

### A8. Account area (`/account`, `/orders`, `/locations`, `/wishlist`, `/invoice`)
| ID | Edge case | Status |
|---|---|---|
| M-1 | Guest / applicant can't open `/account`, `/checkout` | ✅ E/S |
| M-2 | Order list: empty state, many orders, order from a different customer never shown (identity from DB, not query) | ❌ (server side checked in admin `customer-order-identity`, no test) |
| M-3 | Order status badge for every status; money/date format; bad date/currency | ✅ U (new) |
| M-4 | Saved locations: first one seeded from registration address; only own rows (RLS) | ❌ S (no RLS test for `saved_locations`) |
| M-5 | Wishlist folders: own rows only, duplicate variant in same folder, delete folder with items | ❌ S/E |
| M-6 | Server actions for wishlist/locations are gated | ✅ U (server-action-gates) |
| M-7 | Invoice page: another customer's order id → refused | ❌ **important** |
| M-8 | Postal code / province format validation on new location | ❌ |

### A9. Navigation, home, brands
| ID | Edge case | Status |
|---|---|---|
| N-1 | Mega menu built from live taxonomy; empty menu doesn't break header | ❌ |
| N-2 | Brands page: brand with zero products, special characters | ❌ |
| N-3 | Home page loads for guest without any price | ✅ (F-1 check in new leak test: `/` has no tier keys) |

### A10. Background/API surface
| ID | Edge case | Status |
|---|---|---|
| W-1 | Webhooks: no/wrong/garbage/tampered signature, wrong shop, wrong topic, GET | ✅ S |
| W-2 | Duplicate delivery id skipped | ✅ S (taxonomy only) · ❌ products |
| W-3 | Revalidate endpoint secret handling | ✅ S |
| W-4 | `/api/activity` guest 204, bad body, oversize, junk JSON | ✅ S/U |
| W-5 | Security headers, no `X-Powered-By`, clean 404 | ✅ S |

---

## B. ADMIN PANEL features (derived from routes and `src/data/*`)

| Area | Edge cases to guard | Status |
|---|---|---|
| **Login / set-password / invite** | wrong pw, non-admin user refused, open-redirect on `?next=` | ✅ U (`safe-redirect`) · ✅ E (cross-app) · ❌ E for admin login UI itself |
| **Route protection** | every `(dashboard)` page and Server Action calls `requireAdmin` | ❌ **no test** (storefront has one for its actions; admin has none) |
| **Internal API** (`create-draft-order`, `customer-orders`, `customer-order-detail`) | secret check timing-safe, fail closed if unset, payload validation, price from DB not body, stock shortfall, province rule | ✅ U (`draft-order-input`, `inventory-rules`, `region-rules`, new `internal-auth`) · ❌ HTTP-level test of the 3 routes |
| **Webhooks** (products / inventory / orders) | signature, other shop, dedupe | ❌ (storefront ones tested; admin's not) |
| **Products list / attention / new / bulk-add / edit / variants / edit-flavours** | required fields, duplicate title/SKU, negative price/stock, retail price higher/lower than wholesale, region per variant, image upload type/size, 250+ variants, unsaved-changes | ❌ (no tests) |
| **Description HTML** | scripts, event handlers, `javascript:` URLs stripped | ✅ U (`sanitize-html`) |
| **Taxonomy** (category → subcategory → brand → line → flavour) | rename/delete with children, duplicate names, counts roll up | ✅ U new (counts, breadcrumb) · ❌ delete/rename |
| **Filters definitions** | JSON `choices` malformed, empty, duplicate keys, required-filter warning | ❌ (`JSON.parse` unguarded at `data/filters.ts:63` and `:101`) |
| **Customers** | approve/reject, account type change, sales-rep assignment, Shopify customer id creation failure, duplicate email | 🟡 (status change used by E; approval flow itself ❌) |
| **Sales reps** | delete rep with customers assigned | ❌ |
| **Cart / Activity / Dashboard** | customer_activity admin-only read, cart snapshots, webhook health when Shopify unreachable | ✅ S/U for DB rules · ❌ UI |
| **Admin/storefront isolation** | no admin secrets in any client chunk; no `NEXT_PUBLIC_` secret | ✅ (new `client-leak.test.ts`, both apps) |

---

## C. Coverage summary and next tests to write (priority)

1. **Fix F1**, then all 9 red tests should pass.
2. **Admin E2E harness**: a small Playwright project on port 4000 (login, route protection, customer approve, product create/edit). Today admin = unit tests only.
3. **Checkout hardening**: K-11 (double submit), K-12 (fake success URL), K-4/K-5 (stock mixes), K-10.
4. **Ownership tests (RLS)** for `saved_locations`, `wishlist_folders/items`, `customer_carts`, and invoice/order-detail by another customer (M-2, M-4, M-5, M-7).
5. Listing input fuzz: P-14, P-15, P-16.
6. Admin `requireAdmin` coverage scan (mirror `server-action-gates.test.ts` for admin).

---

## D. Combined "what the user sees vs what the system knows" journeys

Run on real dev servers with the fixed test accounts (`storefront/scripts/e2e/test-accounts.ts`, price-test users). Each journey lists the **user-visible expectation** and the **must-not-leak** side.

| Journey | User sees | Must NOT leak / must hold | Status |
|---|---|---|---|
| J1 Guest browse → try cart → login prompt | listing with no prices, "Log in for wholesale pricing", login modal on cart | no price or tier key in HTML/RSC/localStorage | 🔴 PDP (F1), ✅ rest |
| J2 Apply → pending → try login → admin approves → login → price | message per state; after approval price visible | pending session can't see price/checkout; no customer row fields in responses | ✅ E (pieces) · ❌ single end-to-end run |
| J3 Retail buys: PDP → cart → checkout ship to ON → order | retail price everywhere, same total in cart/checkout/draft order | no wholesale number in payload; region mismatch blocked with names of items | 🟡 |
| J4 Wholesale buys, same product | wholesale price | no retail tier | 🟡 |
| J5 Two tabs: add in tab A, badge/cart in tab B; logout in A | B updates / logs out | no cart of previous user after logout | ✅ logout · ❌ cart sync |
| J6 Stock changes while in cart (admin zeros stock) | checkout removes item and says which | no order for dead line; no silent price change | 🟡 |
| J7 Admin edits product price/region → storefront | change visible after revalidate | storefront never gets admin credentials; description sanitised | ❌ (needs webhooks registered) |
| J8 Customer rejected mid-session | immediately behaves as guest | cart/orders not readable | ✅ |
| J9 Browser inspection (view-source, devtools storage, cookies, network tab) | — | no secrets, no other tier, cookies HttpOnly, no stack traces, no raw GIDs on screen | ✅ new `browser-leaks` (except F1) |

---

## E. What was added on 2026-09-21

| File | Tests | Result |
|---|---|---|
| `storefront/tests/unit/pricing-tiers.test.ts` | resolvePrice + data minimisation | 4 🔴 (F1), rest ✅ |
| `storefront/tests/unit/regions.test.ts` | regions, gate, province list consistency | ✅ |
| `storefront/tests/unit/catalog-selection.test.ts` | URL→category, real catalog round trip | ✅ (+2 todo) |
| `storefront/tests/unit/order-display.test.ts` | status/format helpers | ✅ |
| `storefront/tests/security/client-leak.test.ts` | server code/secrets can't reach client (both apps) + pricing source tripwires | 2 🔴 (F1), rest ✅ (chunk scan skips until a build exists) |
| `storefront/e2e/browser-leaks.spec.ts` | 3 viewers × page source; cookies; storage; secret shapes; error bodies | 3 🔴 (F1), 6 ✅ |
| `storefront/e2e/stock-flow.spec.ts` (+ `shopify-stock-helpers.ts`, `admin-panel/scripts/shopify/seed-testing-stock-flow-product.ts`) | Real stock flow on its own product: available 4 → 2 in cart → draft order (stock unchanged) → Mark as paid (available 2, committed 2, on_hand 4) → storefront lets nobody take more than 2, cart never above 2. Cleans up by cancelling + restocking (token has no fulfilment scope). | ✅ passes (2 runs) |
| `admin-panel/tests/unit/taxonomy-helpers.test.ts` | counts, breadcrumb, region list | ✅ |
| `admin-panel/tests/unit/internal-auth.test.ts` | shared-secret check | ✅ |
| `admin-panel/tests/unit/two-app-parity.test.ts` | copied files/lists don't drift | ✅ |

Run: `cd storefront && npm run test:unit` · `npx tsx --test tests/security/client-leak.test.ts` · `npx playwright test e2e/browser-leaks.spec.ts` · `cd admin-panel && npm run test:unit`.
