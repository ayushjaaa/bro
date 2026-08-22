# Admin Panel — Product Add & Taxonomy Navigation (Decisions)

Context: End-user is a non-technical family/business owner who previously managed products
directly from Shopify's own admin panel. Goal: custom Next.js admin panel that is *familiar*
(feels like Shopify's own add-product screen) but *faster and easier*, especially at scale
(100+ flavors per brand, many brands, nested categories/sub-categories possible).

Related: see [DECISIONS.md](DECISIONS.md) item 1a (flavor = variant, not a separate Shopify
product — supersedes the original item 1), item 42 (Region as a variant metafield), and item 43
(this section's bulk variant-upload design, decided directly against this file).

---

## 1. Product Line Create (SUPERSEDED, 2026-08-22 — was "Single Flavor Add")

- ~~Form styled like Shopify's own "Add product" page... Fields: Flavor name, taxonomy chain, 4
  images, price, description/text, nicotine strength, puff count.~~
- **New flow, per item 1a:** the unit being created here is now a **Product Line** (a real
  Shopify Product), not an individual flavor. This form captures what's shared across all its
  flavours: **name, taxonomy chain (Category → Sub-category → Brand, via dropdowns — see section
  3), nicotine-strength/puff-count filter attributes** if shared, and a base image. It does
  **not** collect flavour-specific price/image/description here — those are added afterward via
  section 2's bulk variant table, since a Product Line isn't sellable on its own until it has at
  least one flavour (variant).
- **Taxonomy note (per updated item 2):** the parent reference here is only 3 levels
  (Category/Sub-category/Brand) — Product Line no longer needs to reference "itself" or a 4th
  metaobject level, since it **is** the product being created, not a metaobject pointing at one
  (see section 4's note on this too).

## 2. Bulk Flavour + Region Variant Upload (SUPERSEDED, 2026-08-22 — was "Mini Bulk List")

- ~~"Mini Bulk List" — one row per flavor, submits as N separate Shopify products.~~
- **New flow, per item 1a/42/43:** after a Product Line exists (section 1), its flavours are
  added as **variants**, via a spreadsheet-style bulk table (item 43's design, decided directly
  in this planning session — see DECISIONS.md for the full spec):
  1. Table columns: **Flavour Name** (→ variant title), **Description** (→ metafield —
     Shopify has no native variant-description field, confirmed against official docs), **Region**
     (→ metafield, single-select per row — Federal/BC/Alberta/Manitoba/Ontario/Quebec), **Price**,
     **Compare-at Price**, **SKU**, **Image** (1 per row — native variant limit).
  2. **"Duplicate to other regions" helper** — after filling one flavour's base row, check off
     which other regions that same flavour should also exist in; auto-generates one row per
     checked region (copying price/image as a starting point, independently editable after —
     price can legitimately differ per region due to provincial excise duty).
  3. **"Same as previous" / "Apply to all" for Description** — since description isn't forced to
     be unique per row, this copies one description across several rows in one action instead of
     retyping.
  4. **"Create All (N variants)"** — submits every row in one action.
- **Why not a spreadsheet/CSV upload:** researched official Shopify docs — **variant-level
  metafields aren't supported by Shopify's native CSV product import/export** (only product-level
  metafields are), so Region/Description (both variant metafields) can't travel through Shopify's
  own CSV path regardless. The in-app table above is the only route that can set them, since it
  goes through the API directly.
- **Backend mechanism:** submits batch into `productVariantsBulkCreate` (GraphQL Admin API),
  ~100 variants/call, looping until all rows are sent — each row's `metafields` input sets both
  `custom.region` and `custom.flavour_description` at variant-creation time (confirmed via
  Shopify's mutation schema — no separate follow-up call needed).
- **Why not a full generic spreadsheet grid (kept from the original reasoning):** avoids
  Excel-style keyboard nav / paste mechanics a non-technical user won't know. Still fundamentally
  "one row = one flavour(+region)," intuitive without training — the region-duplication and
  apply-to-all-description helpers exist specifically to keep repetitive typing low despite the
  table now needing more rows than the old one-row-per-flavor model (a 200-flavour × 6-region
  Product Line is up to 1,200 rows, vs. 200 in the old model).

## 3. Hierarchy Navigation at Scale

Problem: with 100+ flavors per brand, many brands, and nested categories, a plain dropdown
chain becomes unusable (e.g. scrolling through 50 brand names). Needed a navigation design that
stays usable for a non-technical person as the catalog grows.

**Decisions:**
1. **Search-first selection** — every taxonomy dropdown/picker supports type-to-filter instead
   of scrolling a long list. Most important fix at scale.
2. **Left-side collapsible tree sidebar** — Category → Sub-category → Brand → Product Line,
   expand/collapse per node, Finder/Explorer-style — visually always shows "where am I."
3. **Context memory** — once inside a Brand, "Add Product Line" pre-fills that taxonomy
   automatically (section 1); once inside a Product Line, "Add flavours" opens section 2's bulk
   variant table pre-scoped to it — no need to re-navigate from the top each time.
4. **Overview/counts dashboard** — top-level summary (e.g. "Brand X → 5 product lines → 120
   flavours [variants]") so the user has orientation before drilling in.
5. **Global search bar** — jump directly to any flavour/brand/line by name for edits, bypassing
   tree navigation entirely (searching a flavour name now finds the Product Line that variant
   belongs to and opens it there, per item 1a).

## 4. Add New Taxonomy Entry (Category/Sub-category/Brand) — In-Panel (DECIDED, 2026-08-21; scope corrected 2026-08-22)

**Decision:** the owner should never need to use Shopify's own raw Admin → Content → Metaobjects
UI to add a new Category, Sub-category, or Brand — this custom Admin Panel gets a **"+ Add"**
option directly in the tree sidebar (section 3.2) for each level, so taxonomy management stays in
one consistent place alongside product management.

**Scope correction (2026-08-22, per updated item 2):** this section originally listed **Product
Line** as a 4th level created the same way (via `metaobjectCreate`). That's no longer accurate —
**Product Line is now a Shopify Product** (item 1a), not a metaobject, so it's created via
section 1's flow (`productCreate`-based), not this metaobject-entry flow. Only Category,
Sub-category, and Brand remain true metaobjects created here.

**Why (reconsidered from original plan):** the original plan left taxonomy-entry creation to
Shopify's native Metaobjects UI on the reasoning that it's rare and already free/no-code — but
hands-on testing during V1.1 (manually seeding a Category → Sub-category → Brand → Product Line
chain to validate the metaobject model) showed that UI is genuinely confusing to navigate for a
non-technical user (dropdown-heavy, easy to pick the wrong reference, no context of where you are
in the hierarchy). Given this admin panel already has to solve exactly this navigation problem for
*products* (section 3), extending the same tree-sidebar + search-first pattern to also create new
taxonomy nodes is a small addition, not a new subsystem.

**Flow:**
1. In the tree sidebar, each level shows a **"+ Add [Category/Sub-category/Brand]"** control at
   the appropriate nesting point (e.g. "+ Add Brand" appears under an expanded Sub-category node).
   Under a Brand node, the equivalent control is **"+ Add Product Line"**, which opens section 1's
   product-creation flow instead of this metaobject-entry flow (per the scope correction above).
2. A small form opens (Name, Description, Image/Logo — matching DECISIONS.md item 3's exact field
   spec, no extra Slug/Sort-order fields) — the parent reference (e.g. which Sub-category a new
   Brand belongs to) is **pre-filled from context**, not re-selected, since the user already
   navigated into that node (same "context memory" principle as section 3.3).
3. On submit, the server calls the same underlying Shopify Admin API mutation
   (`metaobjectCreate`) that the owner would otherwise have triggered manually via Shopify's native
   UI — no new capability is added, just a friendlier interface over the same operation.

**Ties to:** the reusable Admin API client (`admin-panel/src/lib/shopify/admin-client.ts`,
built in V1.1) and the metaobject definitions it already created — this feature only adds *entries*
to those definitions, it doesn't touch the definitions themselves.

## Status

Section 1–3 discussed and confirmed in chat on 2026-08-19; section 4 added 2026-08-21 after V1.1
hands-on testing. Not yet built (this is the admin panel's own V1.7 milestone, per
[BUILD_PLAN.md](BUILD_PLAN.md) §7).
