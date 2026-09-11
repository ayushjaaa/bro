# Change Log — This Session's Build

Reference doc for everything built in this working session, across both `storefront` and
`admin-panel`. Grouped by feature; each entry lists what changed, why, the exact files touched,
and any manual/operational step still needed. See `DECISIONS.md` for the older, running
transcript-style decision log — this file is scoped to just this session's work, as a quick
build guide rather than a full chat transcript.

---

## 1. Homepage brand marquee (replaces static logo grid)

**What**: `storefront/src/features/home/components/BrandStrip.tsx` was a static 3x3-ish grid of
9 hardcoded brand logos. Replaced with a horizontally scrolling marquee of every brand that has a
real logo uploaded in Shopify admin (via the `brand` metaobject's `logo` field), each tile
linking to `/products?brand=<name>`. Pauses on hover, images lazy-load, seamless infinite loop
(doubled track + `@keyframes marquee` already in `globals.css`).

**Fallback**: `admin-panel`/Shopify currently has zero brands with an uploaded logo (verified
live), so a hardcoded `FALLBACK_BRANDS` list (the original 9 logos) renders until real logos are
uploaded — `getMarqueeBrands()` needs no changes when that happens, it'll pick them up
automatically.

**Files**:
- `storefront/src/features/brands/data/brands.ts` — added `getMarqueeBrands()` (dedupes by name,
  logo-only, not scoped to Vape sub-categories like `getAllBrands()`).
- `storefront/src/features/home/components/BrandStrip.tsx` — rewritten as an async Server
  Component.

**Visual details decided along the way**: grid-hairline look preserved (`gap-px` +
`--color-border-purple-15` background trick, not a wrapper `border`) so the marquee's top/bottom
border renders against a white backing (matches the internal tile-divider color exactly, rather
than blending with the page's gradient background behind it).

---

## 2. Province gate (compliance: ask the visitor's province before showing stock/pricing)

**What it does**: on first visit (no `region` cookie yet), a modal overlay appears asking the
visitor to pick their real province before browsing `/`, `/products`, or a product page. Picking
one closes the overlay and refreshes the page under that region.

**Architecture (final version — this went through two real iterations, see below)**:
`storefront/src/features/province-gate/ProvinceGateModal.tsx`, mounted globally in
`storefront/src/app/layout.tsx`. It's a **client-side overlay**, not a server redirect: the real
page underneath (header, nav, product data — under the default/fallback region) renders normally,
and the modal blurs it (`backdrop-blur-xl`) on top. No close button, no Escape, no backdrop-click
dismiss — only picking a real province (`GATE_REGIONS`, which excludes "All") closes it, reusing
the same cookie-set + `router.refresh()` mechanism the header's `RegionSelector` already used.

**Why this ended up as a client overlay, not a server redirect** (explicit trade-off, discussed
and accepted): the first version used Next.js `proxy.ts` middleware to hard-redirect any
first-time visitor to a dedicated `/select-province` page *before* any region data rendered —
stronger compliance guarantee (nothing region-specific ever reached the browser pre-gate), but
felt like leaving the page rather than a popup. The business explicitly chose the weaker-but-nicer
UX instead: the real destination page (and its real, though not-yet-region-correct, data) renders
first, visible blurred behind the gate, so the customer can see "there's a real store back here"
and buy immediately once they pick — accepting that the wrong-region page technically renders
once before the pick.

**Files**:
- `storefront/src/lib/regions.ts` — added `GATE_REGIONS` (the 5 real provinces + Federal,
  excludes "All" — the gate itself must never accept "browse everything" as an answer, but the
  header dropdown keeps its full list).
- `storefront/src/lib/province-gate.ts` — `isGatedPath()` / `hasPassedGate()`.
- `storefront/src/features/province-gate/ProvinceGateModal.tsx` — the modal itself.
- `storefront/src/proxy.ts` — reverted back to its original (pre-gate) plain Supabase
  session-refresh pass-through; no redirect logic.
- Removed (dead code from the first iteration): `storefront/src/app/select-province/`,
  `storefront/src/features/province-gate/{ProvincePicker,actions}.tsx`,
  `storefront/src/components/layout/SiteChrome.tsx`, `storefront/src/lib/bot-detection.ts`.

---

## 3. Product Categories section background — gradient corner accents

**What**: the bottom-left/bottom-right decorative square-grid clusters in
`storefront/src/features/home/components/ProductCategoriesBackground.tsx` now have a smooth
bottom(blue)→top(pink) gradient border (`#82B0F5` → `#FCBB8B` → `#FE69C3`) that properly follows
the squares' rounded corners, via the standard `::before` + `mask-composite: exclude` technique
(plain CSS borders can't take a gradient color, and `border-image` ignores `border-radius`
entirely — confirmed both, hence this approach). Top corner clusters are unchanged (still the
original grey radial blob).

**Files**: `storefront/src/features/home/components/ProductCategoriesBackground.tsx` only.

---

## 4. ⚠️ Recurring bug found this session: `max-w-{name}` silently collapses

**Root cause**: `storefront/src/styles/color-tokens.css` (~line 84-92) defines its own
`--spacing-3xs/2xs/xs/sm/md/lg/xl/2xl/3xl` scale for padding/gap values (e.g. `--spacing-md:
1.5rem` = 24px). Tailwind v4 derives `max-w-{name}` (and `w-{name}`/`min-w-{name}`) from that same
`--spacing-*` namespace in this project, so `max-w-md` (or `sm`/`lg`/`xl`/etc.) silently resolves
to the tiny padding-scale value instead of a real content width. This caused two real,
hard-to-diagnose layout collapses this session (a button grid rendering as overlapping circles,
a paragraph collapsing to a single vertical column of letters) before being root-caused by
inspecting `getComputedStyle(el).width` in a headless browser.

**Rule going forward**: never use `max-w-xs/sm/md/lg/xl/2xl/3xl` (or the `w-`/`min-w-`
equivalents) anywhere in `storefront`. Use a numeric Tailwind size (`max-w-112` = 28rem) or an
explicit arbitrary value (`max-w-[28rem]`) instead. Saved as a persistent memory note
(`feedback_max_w_spacing_collision.md`) so this isn't rediscovered next session.

**Known pre-existing occurrence not yet fixed** (out of scope when found): `storefront/src/features/cart/CartTable.tsx:236`'s empty-cart state also uses `max-w-md`.

---

## 5. Removed star ratings / reviews from product pages

**What**: `storefront/src/features/product/ProductPage.tsx` had a 5-star `RatingRow` above the
title and a "Review(N)" tab (with more stars + a static "reviews coming soon" placeholder) —
neither was ever backed by real data (`rating`/`reviewCount` were hardcoded `0` in the Shopify
fetch, since Shopify has no review data source wired up). Removed both entirely; `DescriptionTabs`
is now just a single "Description" block, no tab switcher.

**Also checked and confirmed not needed**: `storefront/src/components/ui/ProductCard.tsx` never
had a star-rating UI to begin with. There is no JSON-LD/schema-markup anywhere in this storefront,
so there was nothing to strip for search-result star snippets either.

**Files**: `storefront/src/features/product/ProductPage.tsx`, `.../data.ts` (dropped
`rating`/`reviewCount` from `ProductDetail`), `storefront/src/lib/shopify/queries/products.ts`
(dropped the hardcoded fields from the fetch).

**Untouched on purpose**: the homepage `Testimonials`/`TestimonialCard` section still has its own,
unrelated star ratings — out of scope (only product pages/cards were asked about).

---

## 6. Region-aware product pages (redirect to the right region's listing, or say it's unavailable)

**Problem**: each region is actually a **separate Shopify product** (e.g.
`armor-all-car-air-fresheners-federal` vs. `...-ontario` are two different product records, each
tagged with exactly one `region-<value>` tag) — confirmed live via a direct Shopify query. Before
this change, switching the header's region while viewing a product page did nothing: the same
product kept showing regardless of region.

**What changed**: `getProductByHandle()` now also returns the product's own `vendor`,
`productType`, and `region` (derived from its tag). `/products/[handle]/page.tsx` compares that
against the visitor's selected region; on a mismatch it calls the new
`findSiblingProductInRegion()` — searches Shopify for the same vendor + product type tagged for
the target region, matching by title-with-region-name-stripped (there's no direct Shopify field
linking region-siblings together, so this is a real inference, not a guaranteed 1:1 mapping) — and
either redirects to that sibling's handle, or renders the new `ProductNotAvailableInRegion`
component naming the product and region.

**Files**:
- `storefront/src/features/product/data.ts` — added `vendor`, `productType`, `region` to
  `ProductDetail`.
- `storefront/src/lib/shopify/queries/products.ts` — fetches the new fields, adds
  `findSiblingProductInRegion()`.
- `storefront/src/lib/shopify/queries/product-listing.ts` — exported `quoteQueryValue` (reused,
  not duplicated).
- `storefront/src/app/products/[handle]/page.tsx` — the redirect/not-available logic.
- `storefront/src/features/product/ProductNotAvailableInRegion.tsx` (new).

**Verified live**: switching Federal → Ontario on a real product redirects to the Ontario
listing; switching to a region with no sibling (Manitoba, for the same test product) shows the
not-available message correctly.

---

## 7. Account numbers, assigned at approval (not at signup)

**Decision** (discussed at length before building): an account number represents a real,
onboarded customer — assigning one at signup would burn sequence numbers on rejected/abandoned
applications. Format: `<W|R>-<PROVINCE>-<YY>-<SEQ>`, e.g. `W-ON-26-0142` — Wholesale, Ontario,
approved 2026, the 142nd account ever approved (one global Postgres sequence, safe under
concurrent approvals via `nextval()`). Province is a permanent snapshot of `ship_province` at
approval time; unmapped/missing provinces get `XX`.

**Files**:
- `admin-panel/scripts/supabase/014-add-account-number.sql` (new) — adds
  `account_number_seq` + `customers.account_number`, rewrites `approve_customer()` from
  `language sql` to `plpgsql` to compute and assign the number idempotently (re-approving never
  reissues a new one).
- `admin-panel/src/data/customers.ts` — `accountNumber` on the `Customer` type.
- `admin-panel/src/features/customers/components/CustomersTable.tsx` — new "Account #" column +
  shown in the expanded row detail.
- `storefront/src/lib/auth/access-state.ts` — `account_number` added to `CustomerRow`/the
  `customers` select.
- `storefront/src/app/account/page.tsx` — 4th summary card showing the customer's own number.

**⚠️ A real incident happened here, worth remembering**: the storefront's `access-state.ts` was
updated to `select` the new `account_number` column *before* the SQL migration had actually been
run against the live database. Since that column didn't exist yet, the whole customer-lookup
query failed (Postgres `42703: column does not exist`) — and because the code only read the
`data` half of the Supabase response and ignored `error`, every approved customer was silently
treated as `status: 'guest'`, i.e. **logged out**, sitewide. Fixed by temporarily removing the
column from the select until the migration was confirmed applied, then re-adding it. Lesson: never
reference a not-yet-migrated column in application code without confirming the migration ran
first, and don't silently swallow a Supabase `error` — it can look identical to "no such row."

---

## 8. Order history: reorder, invoice, and status tabs

**Reorder**: `storefront/src/features/account/actions.ts` — `reorderAction()` re-fetches the
order server-side (never trusts client input), filters to line items that still have a real
`availableForSale` Shopify variant (`admin-panel/src/lib/shopify/customer-orders.ts` now fetches
`variant { id, availableForSale }` per line), adds them via the existing product-page `addToCart`,
and reports back which items were skipped (no variant at all — a custom line an admin typed
directly into the draft order — or a since-discontinued variant) so
`OrderDetailDrawer.tsx` can tell the customer why their cart came back smaller than the order,
rather than silently dropping items.

**Invoice**: this required real correction mid-build. Shopify's Draft Order `invoiceUrl` looked
like a universally-working "view invoice" link when first tested (against an `OPEN` order), but
turned out to be a **payment** link, not a persistent receipt link — verified live that it returns
a flat 404 ("invoice has already been paid") once an order is `COMPLETED`. Fixed by having
`admin-panel` compute the correct link per status: `invoiceUrl` for `INVOICE_SENT` (still unpaid,
works), the underlying real Shopify `Order`'s `statusPageUrl` for `COMPLETED` (verified working),
and `null` for `OPEN`/`CANCELLED`/`EXPIRED`. The storefront never needs its own status logic for
this — it just checks whether `order.invoiceUrl` is non-null.

The button is also **never shown for a still-`OPEN` (pending) order on purpose** — an admin could
still edit quantities/prices/discounts on a mutable draft, so showing a would-be invoice for it
risks the customer seeing numbers that change out from under them. When there's no valid link, the
button now shows disabled with a visible (not just hover-tooltip) reason, e.g. *"Invoice will be
available once your order is finalized."*

**Order status tabs (All / Pending / Approved)**: pure client-side filter in
`OrderHistoryTable.tsx` over the order list already fetched in one call — no extra Shopify
request per tab. "Pending" = Shopify's `OPEN` status; "Approved" = `COMPLETED` only (Shopify has
no literal "approved" draft-order status; `INVOICE_SENT`/`CANCELLED`/`EXPIRED` only ever show
under "All", by explicit choice).

**Discoverability additions**: a permanent caption under the "Order History" title ("Click any
order to view details, reorder items, or view your invoice"), and the row-click chevron now shows
on mobile too (previously desktop-only).

**Files**:
- `admin-panel/src/lib/shopify/customer-orders.ts` — `invoiceUrl` computation, `order {
  statusPageUrl }`, `variant { id, availableForSale }` per line item.
- `storefront/src/features/account/actions.ts` — mirrored types, `reorderAction()`.
- `storefront/src/features/account/OrderDetailDrawer.tsx` — Reorder/View Invoice UI,
  disabled+reason state.
- `storefront/src/features/account/OrderHistoryTable.tsx` — tabs, mobile chevron.
- `storefront/src/features/account/OrderHistory.tsx` — caption line.

---

## 9. Order history: date-range filter (presets + custom range)

**Decision point discussed first**: whether to filter dates client-side (like the status tabs) or
via a real Shopify query. Concluded these are NOT analogous — the order list is capped at
`first: 50` (a deliberate "recent view" limit). Status filtering is safe client-side because it
only narrows *within* that already-fetched 50. A date range is different: "This Year" (or any
custom range) can span *more* than 50 orders for an active account, so filtering client-side
against the capped list could silently hide real orders older than the 50 most recent, with the
customer having no idea anything was missing. Decision: always ask Shopify directly, for every
preset (including "Last 30 days"), not just the wider ones — same code path either way, and it
removes any doubt about correctness.

**Verified live before building**: Shopify's `created_at:>=/<=` search-query filter only reliably
parses a plain `YYYY-MM-DD` date — a full ISO timestamp with a time component
(`2020-01-01T00:00:00Z`) was confirmed to trip a parser warning (splits on the colon) and
silently ignores the filter instead of erroring. `validateDate()` in admin-panel enforces this
exact format, doubling as the only defense against query-string injection via a malformed date
(the value is never quoted in Shopify's query syntax, so it's validated-and-rejected rather than
escaped).

**What changed**: `OrderHistoryTable.tsx` now has a date-preset row (All time / Last 30 days /
Last 90 days / This year / Custom) above the existing status tabs. Picking a preset (or applying
a custom two-date range) calls `listCustomerOrdersAction(dateRange)` via `useTransition`, which
re-fetches from admin-panel with the range baked into the Shopify query, replacing the order list
in state. The status tabs then filter client-side on top of *that* server-filtered list, same as
before.

**Files**:
- `admin-panel/src/lib/shopify/customer-orders.ts` — `listDraftOrdersForShopifyCustomer()` takes
  an optional `{ from?, to? }`, builds `created_at:>=X AND created_at:<=Y` into the query;
  `validateDate()` guards the format.
- `admin-panel/src/app/api/internal/customer-orders/route.ts` — accepts `from`/`to` in the
  request body, passes through.
- `storefront/src/features/account/actions.ts` — `listCustomerOrdersAction()` now takes an
  optional `OrderDateRange` and forwards it.
- `storefront/src/features/account/OrderHistoryTable.tsx` — preset buttons, custom-range date
  inputs, loading/error state around the re-fetch.

---

## 10. Assigned sales rep (customer-facing) + internal team notes (staff-only)

**Design approach** (via the `design` skill): two features with deliberately opposite trust
boundaries, kept structurally separate rather than bolted onto one table/UI section. Reps are a
**reusable list** (`sales_reps` table + `customers.sales_rep_id`), not free text retyped per
customer, so editing a rep's phone number once updates it everywhere they're assigned. Notes are
a **timestamped, author-attributed log** (newest first), not a shared textarea, since multiple
staff contribute over time and must not silently overwrite each other's context.

- **Sales rep** — admin assigns a rep (name, direct phone, email) to a customer; low sensitivity
  (a business contact), one-directional admin → customer. `sales_reps` RLS lets any authenticated
  user read it (needed for the storefront join off the customer's own session); only admins can
  write.
- **Internal notes** — free-text notes on a customer AND on individual orders, admin/staff only.
  `internal_notes` has its own table and its own admin-only RLS policy (`admin_users` membership
  check) — structurally unreachable from any customer-facing query, not just hidden in the UI.
  Verified live: an anon Supabase client gets 0 rows from both `internal_notes` and `sales_reps`
  (the latter requires `auth.role() = 'authenticated'`, matching the customer-facing join).

**Sequencing note** (per the account_number login-break incident earlier this session):
admin-panel's side (migration, data layer, UI) was built and confirmed against the live database
*before* `storefront/src/lib/auth/access-state.ts`'s `customers` select was extended with the
`sales_rep` join — same precaution as account_number, applied deliberately this time instead of
learned the hard way.

**Files**:
- `admin-panel/scripts/supabase/015-sales-reps-and-notes.sql` — `sales_reps` table +
  `customers.sales_rep_id` + `internal_notes` table, with the RLS policies above.
- `admin-panel/src/data/sales-reps.ts`, `admin-panel/src/data/internal-notes.ts` — new data
  modules (`listSalesReps`, `createSalesRep`, `listNotes`, `createNote`, `listNoteCountsFor`).
- `admin-panel/src/data/customers.ts` — `Customer.salesRepId`/`salesRep`, joined select,
  `updateCustomerSalesRep()`.
- `admin-panel/src/features/customers/actions.ts` — corresponding Server Actions.
- `admin-panel/src/app/(dashboard)/customers/page.tsx` — fetches `salesReps` + note counts
  (defensive try/catch so the page degrades to "off" rather than breaking if the migration
  hasn't run yet in some other environment).
- `admin-panel/src/features/customers/components/CustomersTable.tsx` — note-count badge on the
  collapsed row; expanded-row "Sales Rep" assign/reassign section with inline "+ New rep" form;
  expanded-row customer-level Notes panel; per-order "Notes" toggle in the existing Orders list.
- `storefront/src/lib/auth/access-state.ts` — `CustomerRow.sales_rep`, joined into the existing
  `customers` select.
- `storefront/src/app/account/page.tsx` — `SalesRepCard`: shows the rep's name with `tel:`/
  `mailto:` links for phone/email; renders nothing if no rep is assigned yet.

---

## Manual/operational steps still needed

- **Run `admin-panel/scripts/supabase/015-sales-reps-and-notes.sql`** in the Supabase SQL editor
  for any environment where it hasn't been applied yet (confirmed run and live for this session's
  database).
- **Run `admin-panel/scripts/supabase/014-add-account-number.sql`** in the Supabase SQL editor if
  it hasn't been (it was run once already this session — this note is for anyone re-deploying to
  a different environment, e.g. staging/production).
- **Upload a real logo per brand** in Shopify admin (`brand` metaobjects) to replace the
  `FALLBACK_BRANDS` marquee list with live ones — no code change needed once uploaded.
- **Upload the store's own logo** under Shopify Admin → Settings → Checkout → Branding, so the
  Draft Order invoice/checkout pages (and the order-history "View Invoice" link) show the real
  brand instead of Shopify's generic placeholder.
