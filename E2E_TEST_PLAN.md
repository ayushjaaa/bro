# E2E Test Plan — Wholesale/Retail Pricing, Cart, Stock & Checkout

Deep test matrix for the dual-pricing (wholesale vs retail) system end-to-end: product page →
cart → checkout → Shopify draft order → (eventual) fulfillment. Written after finding and fixing a
real bug this session (see "Verified platform facts" below) — this matrix exists so that bug class
doesn't silently reappear, and so every other edge case along the same path gets exercised at least
once, manually or via the automated subset in `storefront/e2e/pricing-inventory-checkout.spec.ts`.

## Test accounts

| Role | Email | Password | Supabase `customers.id` | Shopify Customer GID |
|---|---|---|---|---|
| Retail | `retailer.pricetest@example.com` | `PriceTestRetail123!` | `44c248bb-25ca-469d-9d16-4734f5f2ecd5` | `gid://shopify/Customer/10024320630982` |
| Wholesale | `wholesaler.pricetest@example.com` | `PriceTestWholesale123!` | `bd2b7f65-d06d-48aa-84dd-14a85ca390bd` | `gid://shopify/Customer/10024320696518` |

Created by `admin-panel/scripts/supabase/seed-testing-price-test-customers.ts`.

## Test products

| Product | Wholesale | Retail | Compare-at | Regions | Stock | Handle pattern |
|---|---|---|---|---|---|---|
| Price Test — RAW Rolling Papers | $10.00 | $9.00 | $5.00 | all 6 | 50/variant | `price-test-raw-rolling-papers-<region>` |
| Price Test — Elf Bar Disposable Vape | $8.00 | $7.00 | $5.00 | all 6 | 50/variant | `price-test-elf-bar-disposable-vape-<region>` |
| Price Test — Out Of Stock — Federal | $10.00 | $9.00 | — | Federal only | 0 | `price-test-out-of-stock-federal` |
| Price Test — Low Stock — Federal | $10.00 | $9.00 | — | Federal only | 2 | `price-test-low-stock-federal` |

Created by `admin-panel/scripts/shopify/seed-testing-price-products.ts` and
`seed-testing-e2e-edge-case-products.ts`.

## Verified platform facts (confirmed via direct Shopify Admin API tests this session — treat as
ground truth, not to be re-derived from scratch each time)

1. **`draftOrderCreate`'s `originalUnitPrice` line-item field is silently ignored** on this store's
   API version (2026-07) — no error, it just keeps the variant's native price. The correct field is
   **`priceOverride: { amount, currencyCode }`**. This was the actual bug: a retail customer was
   always charged wholesale price. Fixed in `admin-panel/src/lib/shopify/draft-orders.ts`.
2. **Creating a draft order does NOT deduct inventory.** Confirmed: stock stayed at 50 after
   `draftOrderCreate` for qty 3.
3. **Completing a draft order (`draftOrderComplete` — "Mark as Paid" in Shopify Admin) DOES deduct
   inventory immediately**, the moment it becomes a real Order — confirmed stock went 50 → 47 for a
   qty-3 completion, before any fulfillment step.
4. Fulfillment (marking shipped) does not further touch `available` stock — it's already deducted
   at order-completion time (fact 3).
5. A wholesale customer gets no price override at all — Shopify's native `price` field already IS
   the wholesale price (this business's pricing model, not Shopify's).

## Known gaps that currently block full automation

- **`unauthenticated_read_product_pickup_locations` Storefront API scope is missing** —
  `getPickupLocations()` throws on every checkout page load. Pickup fulfillment cannot be tested
  end-to-end until this scope is added (Develop apps → Storefront API integration → Configure).
- **Webhooks not registered on the new store** (see `PRODUCTION_MIGRATION_PENDING.md`) — an admin
  editing a product/variant in admin-panel does not auto-invalidate the storefront's cache. A
  manual `.next` cache clear + restart is currently required to see admin edits reflected live,
  which any test relying on "edit in admin, see it on storefront within N seconds" would need to
  account for.

---

## Test Matrix

### A. Login / account state gating
- **A1** Guest (not logged in): product page shows "Login to View Price", not a price.
- **A2** Wholesale login: sees wholesale price.
- **A3** Retail login: sees retail price (or wholesale, if `custom.retail_price` metafield is unset
  on that specific variant — verified fallback behavior, not a bug).
- **A4** Pending/rejected `customers.status`: treated as logged out for purchase purposes (existing
  coverage: `e2e/login-rejection.spec.ts`, `e2e/session-invalidation.spec.ts`).

### B. Product page (PDP)
- **B1** Correct price shown per account type, per product (both Price Test products).
- **B2** Compare-at price rendered (strikethrough) when `compareAtPrice` is set.
- **B3** "In Stock" shown when `quantityAvailable > 0`.
- **B4** "Out of Stock" shown when `quantityAvailable = 0`; quantity stepper and Add To Cart both
  disabled — the product can't be selected at all, not just blocked at submit.
- **B5** Region-specific product resolves correctly — Federal vs BC vs Ontario etc. are genuinely
  separate Shopify Products (not variants of one product, not a client-side filter), each with its
  own price/stock/region tag. Visiting the wrong region's URL must not silently show another
  region's stock/price.
- **B6** Switching Flavour updates price/stock/image shown, when a product has more than one.

### C. Cart
- **C1** Add an in-stock item as wholesale — cart line price = wholesale.
- **C2** Add an in-stock item as retail — cart line price = retail.
- **C3** Add the same variant twice (two separate "Add to Cart" clicks) — merges into ONE line with
  combined quantity, never a duplicate line for the same variant.
- **C4** Attempt to add a quantity greater than `quantityAvailable` — Shopify's own inventory
  policy (DENY, the store default) rejects the over-commit; the app must surface this as an error,
  not silently accept it or crash.
- **C5** Increase/decrease quantity via the cart drawer's stepper — line total and cart total
  recalculate correctly, survives round-trips (+1 then -1 returns to the same state).
- **C6** Remove a line — it disappears; cart shows "Your cart is empty." when it was the last line.
- **C7** Cart persists across a page reload (the `cart_id` cookie, not client state).
- **C8** Cart pricing is computed live per current account type (`resolveCartPricing`), not frozen
  at add-to-cart time — if account_type changed between add and checkout, the newer price applies.
- **C9** Adding from one region's PDP keeps the cart line tied to THAT region's specific product —
  switching the header's region selector afterward must not silently swap the cart line's price/
  stock to a different region's product.

### D. Out-of-stock / stock-change edge cases
- **D1** Out-of-stock PDP: Add to Cart stays disabled (see B4) — can never even reach the cart.
- **D2** A line already in the cart goes out of stock before checkout (e.g. an admin zeroes stock
  concurrently) — the Checkout page's own in-stock filter (`isLineInStock`) flags it and offers a
  "Remove Out of Stock" action; removing it recalculates the total from only the remaining lines.
- **D3** Checkout attempted with EVERY cart line out of stock — `placeOrderAction` blocks entirely,
  actively strips those dead lines from the cart via `removeCartLines` (not just a display filter),
  and tells the customer to add other items. Verify the cart is actually empty afterward, not just
  visually hidden.
- **D4** Checkout attempted with a MIX of in-stock and out-of-stock lines — only the in-stock lines
  become the draft order; `removedItemNames` in the result communicates exactly what got dropped,
  so the customer isn't silently charged for less than the UI showed them before submitting.

### E. Checkout → draft order creation
- **E1** Guest / non-approved customer hitting checkout (e.g. direct URL, bypassing UI gating) is
  blocked with a clear message — `placeOrderAction`'s own `access.status !== 'approved'` check,
  independent of any client-side hiding.
- **E2** Ship fulfillment: full shipping address required; the Server Action itself validates this
  (`shippingAddress` required in `CreateDraftOrderInput`), not just client-side form validation.
- **E3** Pickup fulfillment: requires a pickup location — **currently blocked by the missing
  Storefront scope** (see "Known gaps" above); revisit once fixed.
- **E4** "Billing same as shipping" toggle correctly reuses the shipping address as billing.
- **E5** A real discount code is passed through as `discountCodes` and validated/calculated by
  Shopify itself — never computed client-side, so a fabricated/expired code must be rejected by
  Shopify, not silently applied.
- **E6** The created draft order carries the right `customAttributes`: `Fulfillment Method` (Ship
  or Pickup) and `_customer_id` (this app's own Supabase `customers.id`, for later order-history
  lookups) — verifiable via Shopify Admin's own draft order view or the Admin API.
- **E7** When `customers.shopify_customer_id` is populated (see `PRODUCTION_MIGRATION_PENDING.md`'s
  note on this being reset this session), the draft order's `purchasingEntity.customerId` links to
  the real Shopify Customer. A stale/invalid GID here breaks the WHOLE order (Shopify rejects
  `draftOrderCreate` outright) — this exact failure mode is what happened this session before the
  stale IDs were cleared. Never assume this field is safe without confirming the linked ID
  currently exists on THIS store.
- **E8 (regression)** Wholesale checkout: draft order line `originalUnitPrice` = the variant's
  native price, unmodified. **Automated**: `pricing-inventory-checkout.spec.ts`.
- **E9 (regression)** Retail checkout: draft order line `originalUnitPrice` = the
  `custom.retail_price` metafield's amount, via `priceOverride` — this is the exact bug fixed this
  session; `originalUnitPrice` alone silently does nothing. **Automated**:
  `pricing-inventory-checkout.spec.ts`.
- **E10** A cart with BOTH Price Test products (RAW + Elf Bar) as a retail customer — each line
  priced independently and correctly in the SAME draft order (proves the price-resolution loop
  doesn't leak one variant's price onto another's line).
- **E11** After a successful order, the cart cookie is cleared — a page reload shows an empty cart,
  not the just-ordered items still sitting there.

### F. Inventory truth on the Shopify side (server truth, not the storefront UI)
- **F1** Draft order creation alone never reduces `available` stock (fact 2 above). **Automated**:
  `pricing-inventory-checkout.spec.ts`.
- **F2** Completing a draft order (Mark as Paid) DOES reduce `available` stock immediately (fact 3
  above) — manual verification via Shopify Admin: create → note stock → mark paid → confirm stock
  dropped by the ordered quantity.
- **F3** ⚠ Business-risk note, not a code bug: because draft orders never reserve stock (fact 2),
  two customers can both get a draft order for the last unit of a low-stock item — completing BOTH
  would oversell. This is Shopify's own designed behavior for draft orders (they're explicitly not
  a hold), matching this business's manual "call the customer, then mark paid" flow, but worth the
  client knowing about for genuinely scarce inventory.

### G. Admin-panel side
- **G1** Admin manually completes + fulfills a draft order in Shopify Admin (per this business's
  real workflow — draft orders are deliberately NOT managed through admin-panel's own UI, see
  `draft-orders.ts`'s doc comment) — stock decrements as in F2, order status updates correctly.
- **G2** Editing a variant's price/stock in admin-panel and expecting it to show on the storefront
  immediately — **currently requires a manual cache clear** (see "Known gaps" — webhooks not
  registered yet). Don't file this as a new bug; it's the known, already-tracked gap.

---

## Automated coverage (Playwright)

`storefront/e2e/pricing-inventory-checkout.spec.ts` — run with `npm run e2e` (or scoped: `npx
playwright test e2e/pricing-inventory-checkout.spec.ts`) from `storefront/`. Covers: A2, A3, B4,
C3, C5, C6, C4 (partial), E8, E9, F1. Uses a test-only Shopify Admin API reader
(`e2e/shopify-admin-verify.ts`, loads `admin-panel/.env.local` directly — never imported by any
shipped app code, see that file's own doc comment on why this doesn't violate the admin/storefront
credential separation the rest of the codebase follows) to confirm draft-order price and inventory
facts against Shopify itself, not just what the storefront UI displays.

Everything else in this matrix (B1/B2/B3/B5/B6, C1/C2/C7/C8/C9, D2/D3/D4, E1–E7/E10/E11, F2/F3,
G1/G2) is manual-only for now — either because it needs multi-step Shopify Admin interaction
(completing/fulfilling an order), a second concurrent session, or the checkout page's saved-
location address flow (more involved to drive via Playwright than the scope of this session
allowed) — but is written out here precisely enough that anyone can execute it as a manual pass, or
pick individual cases to automate next.
