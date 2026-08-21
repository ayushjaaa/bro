# Admin Panel — Product Add & Taxonomy Navigation (Decisions)

Context: End-user is a non-technical family/business owner who previously managed products
directly from Shopify's own admin panel. Goal: custom Next.js admin panel that is *familiar*
(feels like Shopify's own add-product screen) but *faster and easier*, especially at scale
(100+ flavors per brand, many brands, nested categories/sub-categories possible).

Related: see [DECISIONS.md](DECISIONS.md) item 1 (flavor = separate Shopify product) and item 6
(admin panel — original scope).

---

## 1. Single Flavor Add

- Form styled like Shopify's own "Add product" page — familiar layout, nothing new to learn.
- Taxonomy chain (Category → Sub-category → Brand → Product Line) selected via dropdowns, not
  typed — removes typo risk that exists in Shopify's own free-text approach.
- Fixed 4 image slots (not a generic unlimited uploader) — prevents missed images.
- Fields: Flavor name, taxonomy chain, 4 images, price, description/text, nicotine strength
  (filter attribute), puff count (filter attribute).

## 2. Bulk Add — "Mini Bulk List" Pattern

**Decision:** No CSV/spreadsheet for day-to-day use — end user is non-technical and already
used to Shopify's own point-and-click panel. Instead: an in-app guided list, click + light
typing only.

**Flow:**
1. Select Product Line once (taxonomy chain, via dropdowns/tree — see section 3).
2. A list opens on the same screen — one row per flavor (name, 4 image slots, price, strength).
   "+ Add row" to add as many flavors as needed, without reopening a full form each time.
3. "Create All (N flavors)" — submits every row as a separate Shopify product in one action.

**Why this instead of a full spreadsheet grid:** avoids Excel-style keyboard nav / paste
mechanics that a non-technical user won't know. Still fundamentally "one row = one flavor,"
which is intuitive without training.

**Advanced/optional path (not for daily use):** CSV import can exist as a separate, secondary
"advanced" feature for rare large batches (e.g. a brand launch with 50+ flavors at once), used
occasionally by a developer/technical person — not surfaced in the primary flow the family
member sees day to day.

## 3. Hierarchy Navigation at Scale

Problem: with 100+ flavors per brand, many brands, and nested categories, a plain dropdown
chain becomes unusable (e.g. scrolling through 50 brand names). Needed a navigation design that
stays usable for a non-technical person as the catalog grows.

**Decisions:**
1. **Search-first selection** — every taxonomy dropdown/picker supports type-to-filter instead
   of scrolling a long list. Most important fix at scale.
2. **Left-side collapsible tree sidebar** — Category → Sub-category → Brand → Product Line,
   expand/collapse per node, Finder/Explorer-style — visually always shows "where am I."
3. **Context memory** — once inside a Brand/Product Line, "Add flavor" pre-fills that taxonomy
   automatically (ties into the bulk list in section 2) — no need to re-navigate from the top
   each time.
4. **Overview/counts dashboard** — top-level summary (e.g. "Brand X → 5 product lines → 120
   flavors") so the user has orientation before drilling in.
5. **Global search bar** — jump directly to any flavor/brand/line by name for edits, bypassing
   tree navigation entirely.

## 4. Add New Taxonomy Entry (Category/Sub-category/Brand/Product Line) — In-Panel (DECIDED, 2026-08-21)

**Decision:** the owner should never need to use Shopify's own raw Admin → Content → Metaobjects
UI to add a new Category, Sub-category, Brand, or Product Line — this custom Admin Panel gets a
**"+ Add"** option directly in the tree sidebar (section 3.2) for each level, so taxonomy
management stays in one consistent place alongside product management.

**Why (reconsidered from original plan):** the original plan left taxonomy-entry creation to
Shopify's native Metaobjects UI on the reasoning that it's rare and already free/no-code — but
hands-on testing during V1.1 (manually seeding a Category → Sub-category → Brand → Product Line
chain to validate the metaobject model) showed that UI is genuinely confusing to navigate for a
non-technical user (dropdown-heavy, easy to pick the wrong reference, no context of where you are
in the hierarchy). Given this admin panel already has to solve exactly this navigation problem for
*products* (section 3), extending the same tree-sidebar + search-first pattern to also create new
taxonomy nodes is a small addition, not a new subsystem.

**Flow:**
1. In the tree sidebar, each level shows a **"+ Add [Category/Sub-category/Brand/Product Line]"**
   control at the appropriate nesting point (e.g. "+ Add Brand" appears under an expanded
   Sub-category node).
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
