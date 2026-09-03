# Product Listing Page (PLP) — `/products` Sidebar Plan

Scoped clarification session (2026-09-03) for the storefront's `/products` page sidebar
(Categories tree + Filters panel). Captures what was decided so it doesn't get re-litigated or
lost. Ties to DECISIONS.md item 32 (Taxonomy Listing Pages) — this file is the focused, PLP-sidebar
-specific companion to that broader decision.

## 1. Two separate taxonomy consumers — do not conflate

| Consumer | File(s) | Data source | In scope for this work? |
|---|---|---|---|
| Admin panel taxonomy editor | `admin-panel/src/features/taxonomy/*`, `admin-panel/src/data/taxonomy.ts` | Shopify metaobjects (`category`/`sub_category`/`brand`), live, real — this **is** the source of truth | No — already correct, do not touch |
| Storefront top-nav mega menu | `storefront/src/components/layout/MegaMenu.tsx`, `Navbar.tsx`, `MobileNavDrawer.tsx` — all read `MEGA_MENU_DATA` from `storefront/src/features/navigation/data.ts` | Static placeholder data | **No — explicitly out of scope.** Do not edit `data.ts` or anything that reads `MEGA_MENU_DATA`. |
| Storefront `/products` sidebar (this plan) | `storefront/src/features/products/ProductListPage.tsx` (`CategoryTree` + `FilterList`), `storefront/src/features/products/catalog.ts` | Currently static (`PRODUCT_CATALOG` in `catalog.ts`); should eventually match/read the real admin taxonomy | **Yes — this is what we're fixing.** |

The nav mega menu and the PLP sidebar are two independent data sources by design (forked
deliberately, per this session) — they are allowed to diverge and changes to one must not touch
the other.

## 2. The real taxonomy (source of truth) — flat 2 levels

Confirmed from `admin-panel/scripts/shopify/seed-real-taxonomy.ts` and
`seed-real-filters.ts` — this is what's actually seeded into Shopify metaobjects via the admin
panel, and is the ground truth the PLP sidebar's *data* should match:

```
Vapes
├─ Disposable Vapes        (brands: Flavour Beast, Oxbar, Mr Fog, Stlth, Kraze, Geek Bar, Gcore, Drip'n, Ripper, Instabar, Doozy Quad, Vice, Elf Bar)
├─ E-Liquids / Vape Juice  (brands: Gcore, Flavour Beast, Lemon Drop, Flavour Drop, Berry Drop, Kapow, Mr Fog E-Juices, Oxbar, ElfLiq, Delicious Drip E-Juice, Vice, Koil Killaz, Naked)
├─ Pre-Filled Pods         (brands: Flavour Beast Pods, Ripper X 75K Pods, Oxbar Maglink 90K Pods, Mr Fog Switch Pods)
├─ Vape Devices            (brands: Vaporesso, Mr Fog Drt Device, Battery, Caliburn)
└─ Vape Hardware & Accessories (brands: Vaporesso, Mr Fog Drt Device, Battery, Caliburn)

Smoking
├─ Rolling Papers          (brands: RAW, Elements, Zig-Zag, OCB, Job, Bambu)
├─ Blunts & Wraps
├─ Pre-Rolled Cones
├─ Filters & Tips
├─ Rolling Accessories     (leaf item — trays/machines/mats — NOT a wrapper, see §3)
├─ Tobacco
├─ Torch Lighters          (brands: Spider, Maven, Soul, Supernova, Zengaz, Clickit, Scorch Torch)
└─ Butane                  (brands: Spider, Supernova, London, Whip-It, Soul, Ronson, Zippo, K-Lite, Nibo)

Cannabis Accessories
├─ Glass
├─ Dab & Concentrate
├─ Grinders
├─ Scales
├─ Hookahs
├─ Storage
├─ Cleaning
└─ Replacement Parts

Convenience
├─ Car Air Fresheners
├─ Lighters
├─ Batteries
└─ General Convenience     (no filters yet — not populated until client inventory is confirmed)
```

**Important:** every category is flat — Category → Sub-category, nothing deeper. There is no
"Rolling Accessories" *wrapper* grouping Rolling Papers/Blunts & Wraps/etc. under it, and no
"Shop by Brand" / "All X" split for Torch Lighters or Butane in the real data. Those existed only
in the old `index.html`/`script.js` reference build's static `CATALOG`, which is a UI mockup, not
the real taxonomy.

Filters per sub-category (field names, from `seed-real-filters.ts`) — carried over as-is from the
`index.html` reference (confirmed still accurate against the real filter_definitions):
- Only **Rolling Papers** (Paper Size, Material) and **Torch Lighters** (Flame Type) have real
  enum choice lists seeded. Every other filter field is a free-text/placeholder ("To be confirmed")
  in Shopify right now — render those as free-text inputs, not fabricated checkbox options.
- Full per-sub-category filter field lists: see `storefront/src/features/products/catalog.ts`
  (kept in sync with `seed-real-filters.ts`'s `SPECS` array).

## 3. Display-level grouping — Smoking only (UI concern, not a data concern)

Even though the real data is flat, the **desired PLP sidebar display** re-introduces two pieces of
extra organization for the Smoking category specifically — this is presentation logic the
storefront's frontend applies on top of the flat data, not something stored in the taxonomy itself:

1. **"Rolling Accessories" UI-group** — six real sub-categories (Rolling Papers, Blunts & Wraps,
   Pre-Rolled Cones, Filters & Tips, Rolling Accessories [the leaf], Tobacco) are shown nested
   under a synthetic "Rolling Accessories" tree node in the sidebar, purely for grouping/scan-
   ability. This synthetic parent has no filters/brands of its own — it's a pure UI container.
2. **"Shop by Brand" / "All X" split** — Torch Lighters and Butane (each one real sub-category with
   its own brand list) are each shown as **two** sidebar entries:
   - "Shop by Brand" — lists just the brand names, no filter panel (a brand-discovery hub).
   - "All Torch Lighters" / "All Butane" — the real sub-category's full filter panel + brand list.

**Vapes, Cannabis Accessories, and Convenience get none of this** — they display flat, exactly
matching §2's real structure, one sidebar level per real sub-category, no grouping/splitting.

## 4. Data-fetching approach (superseded — see §9)

~~Static (not live Shopify fetch)~~ — this is the interim state only (what's built so far in this
session: `catalog.ts`'s hand-maintained snapshot). §9 below is the decided end-state plan for
moving to live data.

## 5. Files this touches

- `storefront/src/features/products/catalog.ts` — the static taxonomy snapshot (flat data, per §2).
- `storefront/src/features/products/ProductListPage.tsx` — `CategoryTree` (adds the §3 Smoking-only
  grouping at render time) and `FilterList` (renders each leaf's filters/enum/brands).

**Explicitly not touched:** `storefront/src/features/navigation/data.ts` (`MEGA_MENU_DATA`),
`MegaMenu.tsx`, `Navbar.tsx`, `MobileNavDrawer.tsx`, and anything in `admin-panel/`.

## 6. Confirmed interaction flow (2026-09-03)

1. User clicks a top-level category in the sidebar (e.g. "Vape") → sidebar expands to show that
   category's sub-categories (e.g. Disposable Vapes, E-Liquids / Vape Juice, Pre-Filled Pods, Vape
   Devices, Vape Hardware & Accessories).
2. User clicks a sub-category (e.g. "Disposable Vapes") → **two things change together**:
   - Main content area shows only that sub-category's products.
   - Filter panel switches to show only that sub-category's filter fields (e.g. for Disposable
     Vapes: Brand, Puff Count, Flavor, Nicotine Strength, Nicotine Type, Device Type, Pack
     Quantity, Price, Availability).
3. Each filter field has its own value list (checkboxes), sourced from the taxonomy's
   filter_definitions (`choices`).
4. Selecting one or more filter values narrows the product list in place (no full page reload —
   URL updates, list re-renders).

## 7. Known gap — most filter fields don't have real value lists yet

Per `admin-panel/scripts/shopify/seed-real-filters.ts`: only **3 filters** currently have real
seeded `choices` — Rolling Papers' Paper Size + Material, and Torch Lighters' Flame Type. Every
other filter field (Puff Count, Nicotine Strength, Device Type, etc.) was seeded with a single
placeholder choice, `"To be confirmed"` — meaning the filter *field* exists in Shopify but has no
real selectable *values* yet. These need to be populated via the admin panel (or directly in
Shopify Admin → Settings → Custom data → Metaobjects → filter_definition → edit Choices) before
the filter panel can offer real, usable checkboxes for those fields. Until then, those fields
should render as a disabled/placeholder state rather than fabricate fake option values.

## 8. Research findings — official Shopify docs (2026-09-03)

### 8a. Shopify's official native filtering path — `filters:` argument
- Query shape: `collection(handle) { products(first, filters: [...]) { filters { id label type
  values { label count input } } edges { node {...} } } }`.
- Supported filter argument types: `productType`, `productVendor`, `variantOption`, `price`,
  `available`, `category`, `productMetafield`/`variantMetafield`.
- Metafield filters only work for 4 metafield types: `number_integer`, `number_decimal`,
  `single_line_text_field`, `boolean` — matches what the admin panel already seeded
  (`single_line_text_field`).
- **Hard constraint (confirmed from Shopify's own help docs):** using `productMetafield` in the
  `filters:` argument — **even from a fully custom/headless storefront** — requires the
  **Search & Discovery app** installed, with each metafield individually activated as a filter
  there, capped at a documented **maximum of 25 filters for the whole store** (not per collection/
  category). Source: [Search & Discovery filters — official limits](https://help.shopify.com/en/manual/online-store/storefront-search/search-and-discovery-filters).
  Also confirmed collections >5,000 products lose native filters entirely (not a concern at our
  ~2,000-product scale) and Search & Discovery filters are a **store-wide** setting with no native
  per-category scoping — Shopify only auto-hides values that don't apply to the current
  collection's products, it doesn't let 25 mean 25-per-category.
- **Consequence:** the admin panel's 122 domain-prefixed `filter_definition`s (e.g.
  `rolling_paper_material`, `glass_material` kept separate) could never all be "activated" via this
  official path — only 25 total could ever be live filters store-wide this way.

### 8b. Metaobject-reference fields (Brand/Category) aren't filterable via `filters:` either
Since Brand and Category are stored as **metaobject references** (not one of the 4 filterable
metafield types above), they cannot be passed directly to the official `filters:` argument at all,
regardless of the 25-filter question. Two ways to resolve this were considered:
1. **Keep metaobjects; mirror the value into a plain text metafield** on the product (e.g. a
   `custom.brand_name` single-line-text field kept in sync with the Brand metaobject reference).
2. **Use Shopify's native fields instead of metaobjects for Brand/Category** — Vendor (native) for
   Brand, Product Type/Standard Category (native) for Category.
- This distinction only matters if going through Shopify's official `filters:` path at all — §9
  decides to bypass that path for our own custom filters, which sidesteps this question for
  everything except Brand (kept native/metaobject-based regardless, per the admin panel's own
  §7.0 classification of Brand as a "native" concept, `ADMIN_PANEL_IMPLEMENTATION.md`).

### 8c. Page architecture — URL-driven filter state (official + community best practice)
- **Filter state lives in the URL** (`searchParams`), not component state alone — e.g.
  `?category=vape&sub=disposable-vapes&brand=oxbar`. This makes filtered views shareable,
  back-button-safe (user filters → opens a product → taps back → still sees the filtered grid),
  and crawlable for SEO on single-filter combinations.
- **Next.js pattern:** Server Component reads `searchParams`, fetches the matching Storefront API
  data server-side for the initial render; a thin Client Component layer handles interactive
  filter toggling and updates the URL (`router.push`/`replace` with the new query string), which
  re-triggers the server fetch. Matches this app's existing pattern (`ProductListPage` is already
  `'use client'` reading initial values from server-passed props/searchParams in `page.tsx`).
- **SEO note for later (Shopify's own faceted-navigation guidance):** avoid indexing every
  filter-combination URL — canonical tag back to the base collection/category URL, `noindex` on
  multi-filter combinations, keep single-filter URLs crawlable since those can be genuinely useful
  landing pages.
- Sources: [Faceted Navigation: SEO and UX Best Practices](https://www.shopify.com/blog/faceted-navigation),
  [Collection Page Filtering — UX Decisions](https://witscode.com/blogs/shopify-collection-filtering).

### 8d. Performance/scale research (2026-09-03)
- **Storefront API has no request-count rate limit** (unlike Admin API's leaky-bucket) — only a
  per-query complexity cap of 1,000 points; a sub-category-scoped products query costs on the order
  of tens of points. Concurrent users are not throttled by Shopify itself.
  Source: [Shopify API limits](https://shopify.dev/docs/api/usage/limits).
- **Metafield `choices` limit:** 128 values max per `single_line_text_field` metafield definition —
  far more than any of our real filter fields need (Device Type, Nicotine Strength, etc. realistically
  need 5-20 values each). Source: [List of validation options](https://shopify.dev/docs/apps/build/metafields/list-of-validation-options).
- **Real-world case study:** a Shopify-theme-to-headless-Next.js migration improved Lighthouse score
  48→96 and mobile load time 4.2s→1.1s — confirms this architecture pattern scales well when caching
  is done right (§9.5).

## 9. Full Build Roadmap — Start to End (decided 2026-09-03)

This section is the complete, decided plan for turning the `/products` sidebar from static mockup
data into a real, live, filterable page backed by the real Shopify taxonomy. Supersedes §4's
"static for now" framing.

**Core decision: filtering is fully custom, NOT via Shopify's official `filters:`/Search &
Discovery mechanism.** This was corrected after realizing §8a's 25-filter-per-store cap would
otherwise force consolidating the admin panel's 122 domain-prefixed filter_definitions down to
~20-25 — unnecessary if we don't route through Search & Discovery at all. Custom filtering means:
fetch the relevant sub-category's products (with their metafield values) via a plain Storefront
API query, then match/filter them ourselves in our own Next.js server code — never using the
`filters:` argument or Search & Discovery activation. This has no 25-filter ceiling, since that
cap is specific to Shopify's own native filtering feature, not to reading metafield data.

### 9.1 Taxonomy changes needed in the admin panel

1. **Brand → filterable, without touching the taxonomy tree.** Brand stays a metaobject reference
   (admin panel's existing tree UI unchanged) plus a mirrored plain-text `custom.brand_name`
   metafield on the product, written in the same Server Action that sets the Brand reference (so
   the two can never drift out of sync from a partial failure). This is used by our own custom
   filter-matching code (§9.4), not Shopify's native filters — so it's just a convenient
   queryable/matchable field, not something that needs Search & Discovery activation.
2. **No filter-key consolidation needed.** Because we're not using Shopify's official `filters:`
   path (§8a), the 25-filter-per-store cap does not apply. The existing 122 domain-prefixed
   `filter_definition`s (`rolling_paper_material`, `glass_material`, etc.) can stay exactly as they
   are — this was the earlier (incorrect) plan, now corrected.
3. **Filter values stay admin-editable, storefront never hardcodes them** (ties to §9.4).

### 9.2 How the storefront will call the API

- **Category/sub-category navigation** reads our own taxonomy data (§9.3) — independent of any
  Shopify filtering feature.
- **Product + filter data for a sub-category — custom query, not `filters:`:**
  ```graphql
  collection(handle: "<sub-category-handle>") {
    products(first: 100) {
      edges {
        node {
          id
          title
          featuredImage { url }
          priceRange { minVariantPrice { amount } }
          metafields(identifiers: [
            { namespace: "custom", key: "puff_count" },
            { namespace: "custom", key: "nicotine_strength" },
            { namespace: "custom", key: "brand_name" }
            # ...every filter field relevant to this sub-category
          ]) { key value }
        }
      }
    }
  }
  ```
  This fetches the sub-category's products **with their raw metafield values** — no `filters:`
  argument, no Search & Discovery dependency.
- **Filtering/matching happens in our own server code**, not Shopify's: once the sub-category's
  product set is in hand (server-side, Next.js), apply the user's selected filter values as a
  plain JS filter (`array.filter(...)`) before rendering/paginating.
- **Query scope is always one sub-category at a time** — never the whole ~2,000-product catalog in
  one request. At ~24 sub-categories, that's roughly ~80-100 products per sub-category on average —
  small enough that fetching "all of them with metafields" in one query, then filtering in code, is
  fast (well under the 1,000-point query-cost cap, §8d) and requires no per-filter Shopify config.
- **Fetching happens server-side** (Next.js Server Component, `page.tsx` reading `searchParams`),
  matching this app's existing pattern.

### 9.3 How the sidebar navigation (Categories tree) works

1. Sidebar tree data comes from the taxonomy read (live Storefront API `metaobjects` query for
   `category`/`sub_category`, once wired — see §9.5 for caching).
2. **Display-time grouping (§3, unchanged):** Smoking's 6 rolling-related sub-categories are
   grouped under a synthetic "Rolling Accessories" UI node; Torch Lighters and Butane are each
   shown as two entries ("Shop by Brand" / "All X"). This grouping is **pure frontend rendering
   logic** in `ProductListPage.tsx`'s `CategoryTree` component — it does not exist in the taxonomy
   data or any API response. Vapes/Cannabis Accessories/Convenience render flat, one sidebar row
   per real sub-category.
3. Clicking a sub-category updates the URL's `searchParams` (§8c) — e.g.
   `?category=vape&sub=disposable-vapes` — which re-triggers the server fetch (§9.2) for that
   sub-category's products + filters.
4. "Shop by Brand" entries (Torch Lighters, Butane) render only a brand list (no filter panel, no
   product grid) — matches the existing `isBrandHub` handling already built into `FilterList`.

### 9.4 Filter management + value fetching — never hardcoded, always live from the API

- The storefront **does not maintain its own copy of filter values** (no hardcoded `enum`/`choices`
  arrays for real filtering, unlike the current placeholder `catalog.ts`). Every time a
  sub-category's products are fetched (§9.2), we derive the filter panel's available values
  **from the actual fetched products' metafield values** (e.g. collect the distinct
  `nicotine_strength` values present across this sub-category's products) — always current,
  because it's computed from live data on every fetch, not stored anywhere by us.
- **When an admin adds/edits a filter choice** (via the admin panel's "Manage Filters" → "Add
  Choice" flow, `ADMIN_PANEL_IMPLEMENTATION.md` §7.5) and then assigns it to at least one product —
  the storefront needs **no manual "refresh the filter list" step**. The next time any visitor's
  request re-fetches that sub-category (or the next webhook-triggered revalidation happens, §9.5),
  the new choice appears automatically, because the storefront always reads current data from
  Shopify rather than storing its own snapshot. This is the "we don't need to update anything
  ourselves — it updates automatically when the admin changes it" behavior confirmed for this plan.
- **Filter UI rendering stays what's already built** in `FilterList` (`ProductListPage.tsx`):
  Brand/Availability/Price special-cased widgets, everything else a checkbox list — just swapping
  the *data source* from the static `catalog.ts` snapshot to the live query response + our own
  in-code value extraction (§9.2), instead of Shopify's `filters` response field.

### 9.5 Caching strategy — webhook-driven, not polling, not "fetch every time"

- **ISR (Incremental Static Regeneration) with tag-based revalidation**, matching
  `STOREFRONT_PLAN.md` §7.1's existing PLP decision — each sub-category's page/data is cached (not
  re-fetched from Shopify on every single visitor request).
- **Cache invalidation is event-driven, not time-guessed:** a **Shopify webhook** (product update /
  metafield update / inventory update topics) calls `revalidateTag()` for the affected
  sub-category's cache tag the moment the admin panel changes something (new filter choice, new
  product, price/stock change) — same webhook pattern already used elsewhere in this project
  (order-status sync, `DECISIONS.md` item 36). **This is the concrete mechanism behind "we
  automatically get the update when it updates, we don't need to re-check everything every time."**
- A short time-based expiry (e.g. 5-10 minutes) stays as a **safety-net fallback** underneath the
  webhook (in case a webhook delivery is ever missed), not as the primary update mechanism.
- **Net effect:** most requests hit Vercel's/Shopify's CDN edge cache (fast, no live Shopify call);
  only the first request after a real data change re-fetches from Shopify, and every subsequent
  request until the next change is served from cache again.

### 9.6 Category-wise fetch + pagination

- **Confirmed pattern:** fetch is always scoped to the currently-selected sub-category (§9.2), never
  the whole catalog — this is what keeps both query cost and payload size small regardless of total
  catalog size.
- **Pagination:** ~20-24 products per page (matches `DECISIONS.md` item 32's already-decided grid
  page-size). Since filtering happens in our own code (§9.2) rather than via Shopify's cursor-based
  `filters:` pagination, pagination is applied **after** our in-code filter step, over the already-
  fetched (and cached, §9.5) sub-category product set — Previous/Next controls, not infinite scroll.
- If a single sub-category's product count ever grows well beyond ~100-200, revisit fetching in
  batches (Shopify cursor pagination on the initial `products(first: ...)` query) rather than one
  large fetch — not needed at current catalog size (~80-100 products/sub-category average).

### 9.7 What's still open (deliberately deferred, not blocking)

- Wiring the Storefront API access/scopes needed for all of the above (currently
  `REAL_MENU_ENABLED = false`, no live metaobject/product read yet) — a prerequisite infrastructure
  step before §9.2-9.6 can be implemented for real, tracked separately from the static `catalog.ts`
  work already done in this session.
- Exact webhook topics + `revalidateTag()` wiring (§9.5) — mechanism decided, implementation not
  started.

## 10. Region Handling (ties to DECISIONS.md item 42)

Region (Canada's per-province excise-stamp compliance requirement) is a separate axis from §9's
sidebar attribute filters (Material, Puff Count, etc.) and needs its own handling within the
custom-filtering plan.

### 10.1 What makes Region different from the §9 sidebar filters

| | §9 sidebar filters (Material, Puff Count, ...) | Region |
|---|---|---|
| Data level | Product-level metafield | **Variant-level** metafield (`custom.region`, per `DECISIONS.md` item 42 — differs per flavour, not constant across a Product Line) |
| Where it's shown | Sidebar Filters panel (`FilterList`) | **Header only** — a single global selector, per item 42's explicit decision **not** to duplicate it in the sidebar filter list |
| How it's applied | User checks a box in the sidebar | Read from a **cookie** set by the header control — applied automatically on every page, not re-selected per page |

### 10.2 Fetch changes needed (extends §9.2)

- The sub-category product query (§9.2) must also request each product's **variants** and their
  `custom.region` metafield — not just product-level metafields — since region availability is a
  variant fact, not a product fact:
  ```graphql
  products(first: 100) {
    edges {
      node {
        id
        title
        metafields(identifiers: [...]) { key value }   # existing §9.2 product-level filters
        variants(first: 50) {
          edges { node { id metafield(namespace: "custom", key: "region") { value } } }
        }
      }
    }
  }
  ```
- **Region read server-side from the cookie** (Next.js Server Component reads the request's
  cookies directly — no client round-trip needed) before/alongside the fetch.
- **Filtering rule (V1, per item 42):** a product is included in the grid only if **at least one of
  its variants** has `custom.region` matching the selected region; otherwise it's excluded from
  that sub-category's listing entirely (matches item 42's "V1 = listing-page filtering only" scope
  — no per-flavour grey-out yet, that's item 42's V2).
- This region-filter step runs **before** the §9.2 in-code attribute-filter step (Region narrows
  the candidate product set first, then Material/Puff Count/etc. filter within that set) — order
  doesn't change correctness here since both are plain array filters, but doing Region first keeps
  the later filter-value extraction (§9.4 — "collect distinct values present in the fetched
  products") automatically region-correct too (e.g. Nicotine Strength checkboxes shown will only
  reflect products actually available in the visitor's region).

### 10.3 Caching changes needed (extends §9.5)

- **Cache key/tag must include Region, not just sub-category** — e.g. a tag like
  `products-<subcategory-id>-<region>` rather than just `products-<subcategory-id>`. Without this,
  the first visitor's region would get cached and served to every other visitor regardless of
  their own selected region.
- Region has a small, fixed set of values (per item 42: federal + ~10 specified provinces), so this
  multiplies the cache-key space by a small constant (~10-11x), not an unbounded amount — still
  cheap to cache per (sub-category × region) combination.
- Webhook-driven invalidation (§9.5) still applies the same way — a product/inventory update
  invalidates that product's affected sub-category+region cache tags.

### 10.4 Not changed by this

- The header Region selector itself, its cookie mechanism, and item 42's cascading-to-every-page
  behavior are already fully decided in `DECISIONS.md` item 42 — this section only adds how §9's
  new custom-filtering fetch/cache logic needs to account for Region, not a redesign of Region
  itself.
- Product-page-level per-flavour region handling (item 42's V2) stays out of scope for this PLP
  sidebar plan.

## 11. Region — Switched to Product-Line-Per-Region (Route A, decided 2026-09-03, SUPERSEDES §10.2/§10.3)

After reading the actual (already-built, live-tested) admin-panel code, §10's variant-level Region
model was found to already be **real, working code** — not just a doc decision — so this section
records a deliberate architecture change to that code, not a fresh plan.

### 11.1 What's true today (confirmed by reading the codebase, not assumed)

- `admin-panel/src/data/products.ts`'s `createProductLine` — one Product Line = one Shopify Product;
  Brand referenced via `taxonomy.brand` metaobject-reference metafield; Category/Sub-category
  derived by walking Brand → Sub-category → Category (not stored redundantly); per-sub-category
  filters already stored as product-level `custom.<key>` metafields (matches §9's plan already).
- `admin-panel/src/data/variants.ts`'s `bulkCreateVariants`/`updateVariants` — Region is currently a
  **variant-level** `custom.region` metafield, and each variant's Flavour option value is literally
  `"<flavour name> (<region>)"` (e.g. `"Mango (Federal)"`) — a naming hack required because Shopify
  rejects two variants sharing an identical option-value combination, and Region isn't a formal
  Option. Comment confirms this was "live-tested 1,200/1,200 with 0 errors" — a real, working
  mechanism, not a stub.
- `admin-panel/src/lib/regions.ts` — the fixed region list (6 values: Federal, BC, Alberta,
  Manitoba, Ontario, Quebec) — **stays exactly as-is**, still needed as the checkbox/value list.
- Per `storefront/src/app/products/page.tsx`'s comment, only **one real product** exists in Shopify
  today — migration cost for this change is currently as low as it will ever be.

### 11.2 New model — Region moves from variant-level to product-level

- **Region becomes a plain product-level `custom.region` metafield** (`single_line_text_field`,
  one of Federal/BC/Alberta/Manitoba/Ontario/Quebec) on each region-specific Product Line — the
  same pattern already used for every other filter field (§9's product-level filters), not a
  special case anymore.
- **The Flavour option value naming hack is removed** — `optionValues` reverts to plain
  `[{ name: row.flavourName, optionName: 'Flavor' }]` (e.g. just `"Mango"`), since a single Product
  now only ever contains variants for **one** region, so the uniqueness-constraint problem that
  required the region-suffix hack no longer exists.
- **A flavour range sold in N regions becomes N separate Shopify Products** (e.g. "Gcore E-Juice —
  Federal" and "Gcore E-Juice — Ontario" as two distinct products), each with its own price, stock,
  and flavour variants for that region — not one product mixing all regions' variants together.

### 11.3 Admin creation flow — region checkboxes + auto-clone (decided, not per-region manual re-entry)

1. Admin fills a Product Line's base info **once** — title, Brand (which derives Category/
   Sub-category), filter values, image.
2. Admin checks which regions this line will be sold in (checkbox list from
   `src/lib/regions.ts`'s `REGIONS`, unchanged).
3. On submit, the system creates **one Shopify Product per checked region**, automatically:
   - Title/handle gets a region suffix (e.g. base title "Gcore E-Juice" + region "Federal" →
     `"Gcore E-Juice — Federal"`, handle auto-derived by Shopify from that title).
   - All the same Brand/filter metafields are copied to every region-clone.
   - Each clone additionally gets its own `custom.region` metafield set to that region's value.
   - Each starts with 0 flavours/unpublished, same as today's existing "0-flavour incomplete state"
     handling (`ADMIN_PANEL_IMPLEMENTATION.md` §0a) — nothing new needed there.
4. **Flavours (variants) are then uploaded separately per region-Product-Line** via the existing
   Bulk Variant Upload flow (Flow C) — since price/stock genuinely differ by region, each region's
   product gets its own flavour rows, but the **Region column is removed from that table** (no
   longer a per-row field — it's now implicit from which Product Line the admin is uploading into).

### 11.4 File-level changes needed (scoped strictly to Region — nothing else touched)

| File | Change |
|---|---|
| `admin-panel/src/data/products.ts` | `createProductLine` gains a `regions: string[]` param; loops `productCreate` once per region, adding a `custom.region` metafield and a region-suffixed title to each; returns an array of created products instead of one. `listProductLines`/`getProductLine` queries add reading the product-level `custom.region` metafield (trivial addition to the existing `customFields`/metafields read, no restructuring). |
| `admin-panel/src/data/variants.ts` | `VariantRow`/`VariantUpdateRow` types drop the `region` field entirely. `buildVariantInput` and `updateVariants`'s metafield-building drop the `custom.region` metafield write. `optionValues` reverts to plain flavour name (no `(region)` suffix). |
| Product Line creation form (wherever `createProductLine` is called from, under `admin-panel/src/features/products/` or `app/(dashboard)/products/`) | Add the region-checkbox group (§11.3 step 2) before submit. |
| `admin-panel/src/features/products/components/VariantBulkTable.tsx`, `EditVariantsTable.tsx` | Remove the Region column/input — no longer a per-variant field. |
| `admin-panel/src/lib/regions.ts` | **Unchanged** — same `REGIONS` list, just consumed by the new checkbox UI instead of a per-variant-row dropdown. |
| The one existing real product (`gcore-e-juices-20mg-30ml-federal`) | One-time manual fix: add `custom.region=federal` product metafield; if it has any variants using the `"(Federal)"` suffix naming, rename those option values to the plain flavour name. Low-risk given it's the only real product today. |

**Explicitly NOT touched by this change:** `admin-panel/src/data/taxonomy.ts` and
`features/taxonomy/*` (Brand/Category/Sub-category system), `data/filters.ts` and
`features/filters/*` (the filter_definition system), Customers, Cart Activity, Search, Dashboard,
and the Publish/Unpublish functions (`publishProductLine`/`unpublishProductLine` are reused as-is —
each region-clone is published independently through the same existing function, no change needed
there since it already operates per-product-id).

### 11.5 Storefront impact — simplifies §9.2/§10.2 (variant-level fetch is no longer needed)

Since Region is now a **product-level** fact (like every other filter), the storefront no longer
needs §10.2's separate variant-fetch-and-loop step to determine region availability. Region is
handled exactly like any other product-level attribute in §9.2's existing fetch — either:
- a dedicated Collection scoped to (sub-category × region), or
- simply reading each product's `custom.region` metafield alongside the other filter metafields
  already being fetched in §9.2's query, and matching it against the header's selected Region
  (cookie) the same way any other filter value is matched.

§10.2's "fetch variants + loop to check region" approach and §10.3's "cache key must account for
region" both still apply conceptually (cache still needs to vary by region), but the underlying
query is simpler and faster (§ per the earlier discussion — product-level filtering is native and
fast; variant-level required extra fetch + custom looping that this change removes entirely).

### 11.6 Why this doesn't contradict `DECISIONS.md` item 42

Item 42's core decisions — the header-only global Region selector, its cookie mechanism, the
cascading-to-every-page behavior, and "V1 = listing-page filtering only" — all **still stand**.
What changes is only the underlying Shopify data representation (product-level metafield + real
product-per-region instead of variant-level metafield + option-name hack) — an implementation
detail change, not a UX/decision reversal. `DECISIONS.md` item 42 should get a short update note
pointing here when this is implemented.

## 12. Storefront Live-Fetch Build (decided 2026-09-03) — verified Storefront-API access + granular caching

Follow-up to §9/§10/§11 once real implementation started. Two things got resolved here that change
how the build proceeds: (a) a real blocker was found and fixed (Storefront API couldn't read
Brand/Region at all), and (b) the caching design was refined into two independent groups instead of
one shared cache, per the same reasoning as §9.5/§10.3 but made explicit and non-negotiable here.

### 12.1 Blocker found + fixed — Storefront API metafield access

Live-tested (2026-09-03): querying a real product's `taxonomy.brand` and `custom.region` metafields
via the Storefront API returned `null` for both, even on products confirmed (via Admin API) to have
real values set. Root cause: a metafield's Storefront-API readability is a property of its
**definition** (schema-level, set once), not of any individual product's value —
`create-product-brand-metafield.ts` never set `access.storefront: PUBLIC_READ` on `taxonomy.brand`,
and `custom.region`'s only existing definition was on `ProductVariant` (the pre-§11 architecture) —
no `Product`-level definition for it existed at all yet.

Fixed via a one-time script (run and deleted, not kept in the repo — same disposable-script pattern
as other `_tmp-*` scripts in this plan): `metafieldDefinitionUpdate` set `taxonomy.brand`
(ownerType `PRODUCT`) to `PUBLIC_READ`, and `metafieldDefinitionCreate` made a **new**
`custom.region` definition on `PRODUCT` (the old `PRODUCTVARIANT` one is now simply unused, left in
place, harmless) with `access.storefront: PUBLIC_READ` set from creation. Re-tested after: both
fields now resolve correctly via the Storefront API.

**This is schema-level, not per-product** — every existing product (the 48 test products, the one
pre-existing real product) and every product created from now on automatically inherits this;
nothing about the admin panel's create-flow needs to change, and this fix never needs to be run
again. `seed-real-filters.ts`'s filter metafields were already created with `PUBLIC_READ` from the
start, so this gap only affected Brand and Region, not the other filter fields.

### 12.2 Two independent cache groups — not one shared cache

Confirmed/locked in during planning: the Sidebar Tree (Category → Sub-category structure) and the
Filter Panel + Product Grid (for one selected sub-category × region) change at very different
rates, so they get **separate Next.js cache tags**, invalidated independently:

| Cache group | Tag shape | Invalidated by | How often |
|---|---|---|---|
| Sidebar Tree | `taxonomy-tree` (one tag, store-wide) | A taxonomy webhook (Category/Sub-category metaobject change) | Rare |
| Sub-category products + filters | `products:<subcategory>:<region>` (one tag per combination) | A products/inventory webhook, scoped to the specific product(s) changed → only that product's subcategory+region tag(s) get invalidated | Frequent |

**Why not one shared cache/tag:** a single product added to "Disposable Vapes (Federal)" must
**only** invalidate `products:disposable-vapes:federal` — not `products:disposable-vapes:ontario`,
not any other sub-category's tag, and not `taxonomy-tree`. A shared cache would force a full
re-fetch of everything (all sub-categories × all regions, plus the tree) on every single product
change store-wide — exactly the wasteful "ask Shopify every time" behavior §9.5 was designed to
avoid. Two independent groups mean each real-world change invalidates only the narrow slice of
cached data actually affected by it; everything else keeps serving instantly from cache.

**Product-level filter values (§9.4) live inside the same fetch/cache as the product grid** — they
are not a third, separate cache group. A sub-category's products and its filter checkboxes come
back from the **same single Shopify query**, sharing the same `products:<subcategory>:<region>`
tag, since filter values are derived from the fetched products' own metafields, not fetched
separately.

### 12.3 Build order (both Tree and Products+Filters live, per this session's decision)

Earlier framing (§9.7) deferred the Sidebar Tree to a later phase — that's now changed: both are
being built together in this pass, using the two-cache-group design above from the start rather
than retrofitting it later. Order of implementation:
1. Sub-category products+filters fetch function (region hardcoded to test first, e.g. `'federal'`),
   verified against the 48 test products from §11's verification run.
2. Sidebar Tree live-fetch function (reads real Category/Sub-category metaobjects), its own
   `taxonomy-tree` cache tag.
3. Wire the two together in the route (Server Component reads `searchParams` + region cookie,
   calls both fetch functions, passes results down).
4. Region header selector (dropdown + cookie) — connects real region selection to the
   already-built fetch logic.
5. Webhooks for both invalidation paths (products/inventory → per-tag; taxonomy metaobjects →
   `taxonomy-tree`).

All 5 steps are now built and live-verified (2026-09-03):

### 12.4 Step 5 result — webhooks, and two real gotchas found while building

- **New files (storefront):** `lib/shopify/admin-client.core.ts` + `lib/shopify/product-webhook-queries.ts`
  (Admin API access, mirroring admin-panel's own copy — needed because the webhook must resolve a
  just-created/unpublished product's Sub-category+Region too, which the Storefront API token can't
  see), `lib/webhooks/verify.ts` (HMAC verification, copied from admin-panel), `app/api/webhooks/
  products/route.ts` and `app/api/webhooks/taxonomy/route.ts` (the two Route Handlers),
  `scripts/shopify/register-webhooks.ts` / `unregister-webhooks.ts`.
- **Separate subscriptions from admin-panel's own webhooks** — admin-panel already had
  `products`/`inventory` webhook routes for its own Supabase-backed stock-sync feature, pointing at
  its own URL. Shopify allows multiple subscriptions on the same topic with different callback
  URLs, so storefront's cache-invalidation subscriptions coexist with those independently.
- **Gotcha 1 — Storefront-API access gap, again:** `SHOPIFY_CLIENT_SECRET`/`SHOPIFY_CLIENT_ID`
  (Admin API app credentials) didn't exist in storefront's `.env.local` at all — copied over from
  admin-panel's (same Shopify custom app, two consumers). Needed both for HMAC verification
  (signed with the app's client secret) and for the taxonomy-lookup query itself.
- **Gotcha 2 — Next.js 16 breaking change:** `revalidateTag(tag)` (one argument) no longer
  compiles — this version requires `revalidateTag(tag, profile)`. For a webhook (no Server Action
  context, so `updateTag()` isn't available), the correct second argument is `{ expire: 0 }`
  (immediate expiration) per Next's own docs, not `'max'` (which is for the Server Action case
  where stale-while-revalidate is fine).
- **Live-verified end-to-end** (not just typechecked): a hand-crafted, correctly-HMAC-signed
  request against the running dev server for both routes. Products route: given the real "RAW Nav
  Test" product's id, correctly resolved it to Rolling Papers/federal and logged
  `revalidated: products:rolling-papers:federal` — the exact, single, correctly-scoped tag, not a
  broader one. Taxonomy route: correctly logged `revalidated: taxonomy-tree`.
### 12.5 Correction — the products webhook route needs no Admin API access at all

The first working version of `product-webhook-queries.ts` used the Admin API for the taxonomy
lookup (mirroring admin-panel's own webhook helper), reasoning that it needed to work for
not-yet-published products too. The user caught this as unnecessary: this app is buyer-facing, and
buyers can only ever see/buy **published** products — the storefront's own product-listing fetch
already only returns published products via the Storefront API, so an unpublished product was
never visible here to begin with. If the webhook lookup returns nothing for an unpublished product,
that's the *correct* outcome (nothing to invalidate), not a gap that justifies broader access.

**Fixed:** `product-webhook-queries.ts` now uses `shopifyStorefrontRequest` (the same Storefront
API client every other fetch in this app uses), not the Admin API. Re-verified live afterward —
same correct result (`products:rolling-papers:federal`).

**What this narrows credential-wise:**
- The **live webhook route** (`app/api/webhooks/products/route.ts`) now touches only
  `SHOPIFY_CLIENT_SECRET` (for HMAC verification — Shopify signs webhooks with this exact secret,
  no alternative exists) and the existing Storefront API token. No Admin API client, no
  `SHOPIFY_CLIENT_ID`, in the deployed app that serves buyer traffic at all.
- The **register-webhooks.ts / unregister-webhooks.ts scripts** still use full Admin API access
  (`admin-client.core.ts`, `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET`) — creating/deleting a
  webhook subscription is inherently an admin-level operation — but these are one-off dev-tool
  scripts run manually, never part of the deployed app itself.

### 12.6 Registered and live-verified with a real Shopify webhook (not simulated)

`npm run shopify:register-webhooks` run against an ngrok tunnel — all 7 subscriptions created
(4 products/inventory topics + 3 metaobjects topics). The `METAOBJECTS_*` topics required a
`filter` field on the subscription input (`"type:'category' OR type:'sub_category'"`) or Shopify
rejects the create with "the specified filter is invalid" — not documented anywhere obvious, found
by trial.

**Real end-to-end proof:** updated the real "RAW Nav Test" product's title via the Admin API
(`productUpdate`, admin-panel's own mutation) — genuinely, not a hand-crafted HMAC-signed request
this time — and Shopify's own servers delivered a real webhook through the ngrok tunnel to the
storefront's route, which correctly resolved and logged
`[products-webhook] revalidated: products:rolling-papers:federal`. Title reverted back to "RAW Nav
Test" afterward.

**Still open:** the ngrok tunnel is only for local dev — once this app has a real deployed domain,
`register-webhooks.ts` needs re-running with `WEBHOOK_CALLBACK_BASE_URL` pointed at that domain
(the ngrok-pointed subscriptions should be deleted via `unregister-webhooks.ts` first, since a
closed tunnel URL would just sit there failing deliveries).
