# Admin Panel — Implementation Plan

Consolidates DECISIONS.md (items 41–44) and BUILD_PLAN.md (§8) into one concrete, buildable
reference: every route, every folder, and exactly which layer (UI / Server Action / DAL) does
what for each page, before writing further code.

---

## 0. The Shopify Structure We Actually Built (ground truth — confirmed against DECISIONS.md
   items 1a/2/3/41/42/43/44 and the real setup scripts in `scripts/shopify/`, 2026-08-23)

```
Category (metaobject, type: "category")
   fields: name (single_line_text_field, required)
           description (multi_line_text_field)
           image (file_reference)
   ↑ referenced by
Sub-category (metaobject, type: "sub_category")
   fields: name, description, image  — same 3 as Category
           category (metaobject_reference, required) → Category
   ↑ referenced by
Brand (metaobject, type: "brand")
   fields: name (single_line_text_field, required)
           description (multi_line_text_field)
           logo (file_reference)                        — note: "logo", not "image", for Brand
           sub_category (metaobject_reference, required) → Sub-category
   ↑ referenced by
Product Line (a REAL Shopify Product — NOT a metaobject, unlike the 3 levels above)
   fields: title, descriptionHtml, media (base image)    — native Product fields
           metafield "taxonomy.brand" (metaobject_reference, ownerType PRODUCT) → Brand
   │       (Sub-category/Category are NOT stored redundantly on the Product — derive by
   │        walking Brand → sub_category → category when needed)
   │
   ├─ Option: "Flavor" — the ONLY formal Shopify Option on this product (Shopify allows max 3
   │  options/product; using only 1 leaves 2 free for a future dimension, e.g. Nicotine Strength)
   │  ⚠️ gotcha (DECISIONS.md item 43): if the Product's Category (Standard Shopify Taxonomy, not
   │  our metaobject one) has a matching standard attribute like "Flavor", Shopify auto-links the
   │  Option to that attribute's metafield and silently breaks bulk variant creation
   │  ("Cannot set name for an option value linked to a metafield"). Fix: disconnect it (Shopify
   │  Admin → Variants → linked-metafield badge → Disconnect), or avoid Standard Taxonomy
   │  categories with a conflicting attribute name when creating the Product.
   │
   └─ Variants — one per Flavor value (e.g. "Mango Peach"), up to 2,048 per product (raised from
      100 for all merchants/plans, Oct 15 2025):
        ├─ title            — native, auto-derived from the Flavor option value
        ├─ price / compareAtPrice / sku / barcode / inventoryQuantity  — all native, independent
        │  per variant
        ├─ media            — native, 1 image per variant (not a gallery)
        ├─ metafield "custom.region" (single_line_text_field, ownerType PRODUCTVARIANT)
        │     — deliberately a metafield, NOT a formal Option (would consume one of the 3 slots
        │       and force a full cartesian-product variant explosion for no benefit, since this
        │       custom admin UI never uses Shopify's native variant-dropdown anyway)
        │     — real values in use: "federal", "bc", "alberta", "manitoba", "ontario", "quebec"
        │       (maps to Canada's excise-stamp regions — DECISIONS.md item 42; "bc" uses the
        │       federal peach stamp since BC isn't a specified vaping province, but the
        │       distributor still tracks it as its own selectable region)
        └─ metafield "custom.flavour_description" (multi_line_text_field, ownerType
              PRODUCTVARIANT) — NOT a native field (ProductVariant has no built-in description),
              confirmed against official Admin GraphQL schema
```

**Scale numbers that constrain the UI (not theoretical — live-tested):**
- 200 flavours × 6 regions = up to 1,200 variants on one Product Line — proven with a real
  1,200/1,200 successful `productVariantsBulkCreate` run, 0 errors, ~52 seconds, batched 100/call
  (the documented general array-input max is 250/call, but 100 is what's actually been verified
  safe for this specific mutation's query-cost profile — not just array-length)
- Publishing: **products are created unpublished by default** — `publishablePublish` is a
  required, easy-to-miss extra call, or the Product Line silently never becomes customer-visible

**Five facts that must shape the admin UI, not just be background trivia:**

1. **A Product Line is created BEFORE it has any variants** — `productCreate` alone makes a
   product with an empty "Flavor" option and zero variants. It is not sellable yet at that point.
   This is a real two-step sequence, not an implementation detail to hide: **Step 1 creates the
   Product Line, Step 2 (a separate page) adds its flavours.** The UI must make this obvious
   (e.g. redirect + a visible "flavours: 0, add some" state), not let the admin believe they're
   done after Step 1.
2. **Region is invisible to Shopify's own native product-editing screens** as a selector — it's a
   metafield per variant, not an Option, so there is no Shopify-native UI for setting it at all.
   Our custom admin panel is the *only* place Region can be set — this isn't optional polish, the
   bulk-upload table is the sole interface for a required field. **The Region dropdown/checkbox
   list in that table must use the fixed 6-value list above** (federal/bc/alberta/manitoba/
   ontario/quebec), not free text — a typo'd region value silently breaks storefront filtering.
3. **Category/Sub-category/Brand are a strict, pre-existing chain** the admin picks from (fetched
   live from Shopify, item below) — they are not typed free-text and not created inline as part of
   the product form by default (new entries are a separate, deliberate "+ Add" action elsewhere,
   per ADMIN_PANEL.md §4), so the product form's taxonomy pickers are read-only selectors, not
   text inputs.
4. **Every Product Line needs its "Flavor" Option checked for the auto-link gotcha** right after
   creation, before any bulk variant upload runs — either by never selecting a conflicting
   Standard Taxonomy category for the product, or by verifying/disconnecting the link
   programmatically. Silent failure otherwise (variants fail to create with a cryptic error).
5. **A newly-created Product Line is unpublished** — if the admin panel ever shows a "live on
   store" style status, it must reflect this real state (not assume "created" = "visible"), and
   `publishablePublish` must run before that status can honestly say published.

## 0a. UX Decisions Derived Directly From This Structure

- **Two-step flow is explicit in the UI, not hidden behind one form.** `/products/new` only
  collects what `productCreate` needs (name, taxonomy, base image) and its success state is a
  visible hand-off ("Product Line created — now add its flavours") rather than a generic "Saved!"
  toast, because a Product Line with 0 variants is a real, visible, incomplete state the admin
  needs to understand, not an edge case to paper over.
- **Cascading, search-first dropdowns for Category → Sub-category → Brand** (not free-text, per
  fact 3 above) — each disabled until its parent is chosen, matching ADMIN_PANEL.md §3's
  search-first principle since these lists grow over time.
- **The bulk-variant-upload table is not an optional "advanced" feature — it's the only way
  Region ever gets set** (fact 2). Its empty state after Step 1 should read as "required next
  step," not "optional bulk tool."
- **Product list / dashboard should visibly flag Product Lines with 0 variants** (unsellable,
  incomplete) — a direct consequence of fact 1 — so an admin who left Step 2 unfinished sees it
  called out rather than discovering it's broken only when a customer can't find flavours.
- **Region field in the bulk-upload table is a fixed dropdown/checkbox list, never a text
  input** (fact 2) — the 6 real values only, so a typo can't silently produce an unfilterable
  variant on the storefront.
- **`createProductLine()` never sets a Standard-Taxonomy Category that has a conflicting
  attribute name** (fact 4) — either omit Category entirely at creation, or the DAL checks/
  disconnects the auto-link before returning success, so the admin is never silently handed a
  broken Product Line.
- **Product list shows an honest Published/Unpublished status** (fact 5), and Step 1's DAL calls
  `publishablePublish` as its last step — "created" and "visible to customers" are never
  conflated in either the code or what the admin sees.

## 1. Core Architecture Rule (non-negotiable, applies to every feature below)

```
Client Component (UI)
        │  user clicks / submits
        ▼
Server Action  ("use server")   — THIN: extract input, call the DAL, handle redirect/response.
        │                          Never calls Supabase/Shopify directly. Never contains
        │                          auth-checks or business logic itself.
        ▼
data/*.ts  (DAL, "server-only")  — THICK: requireAdmin() first, then the actual Shopify/Supabase
        │                          call, then returns only the minimal safe data the UI needs.
        ▼
Shopify Admin API  /  Supabase
```

- **"Next.js backend" = the server-side half of this same project** (Server Actions, Route
  Handlers, Server Components, and anything `data/*.ts` imports) — there is no separate backend
  server. `import 'server-only'` on `admin-client.ts` and every `data/*.ts` file makes the build
  fail if a Client Component ever tries to import them directly.
- **Route Handlers** (`route.ts`) are used only where a Server Action structurally can't work:
  Shopify webhooks (external caller), `/auth/confirm` (session doesn't exist yet), search-as-you-
  type (repeated client-initiated fetches).
- **Every Server Action/DAL function independently calls `requireAdmin()`** — never assumes a
  page-level check or `proxy.ts` already handled it (DECISIONS.md item 44a-i, CVE-2025-29927
  precedent).

---

## 1a. JWT Verification Mechanics — Exactly What `requireAdmin()` Does And Why (researched 2026-08-23)

Every route's protection reduces to two questions, answered fresh on every request, never cached
or trusted from a prior check:

1. **Is this token real and unexpired?** (Authentication)
2. **Is this verified identity in `admin_users`?** (Authorization)

```ts
// src/data/admin-auth.ts
export async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  //   ↑ Reads the access-token JWT from the request's cookie, then verifies its signature
  //     against Supabase's public keys (JWKS endpoint: /auth/v1/.well-known/jwks.json — fetched
  //     and cached, not a static shared secret like a hand-rolled `jwt.verify(token, SECRET)`),
  //     and checks the `exp` claim hasn't passed. Auto-refreshes via the refresh token if the
  //     access token is close to expiring.
  if (error || !data?.claims?.email) throw new Error('Unauthorized — not logged in');
  //   ↑ Token missing/invalid/expired → stop here. Nothing below ever runs.

  const email = data.claims.email as string;
  //   ↑ Trustworthy because it came from a cryptographically-verified JWT, never from a
  //     client-supplied form field or header that could be spoofed.

  const service = getServiceRoleClient(); // bypasses RLS — server-only, never exposed
  const { data: adminRow } = await service
    .from('admin_users').select('id').eq('email', email).maybeSingle();
  if (!adminRow) throw new Error('Forbidden — not an admin');
  //   ↑ Authenticated (real, logged-in person) but not authorized (not on the admin list) →
  //     stop here too. This is the line that actually decides "customer" vs "admin" — nothing
  //     about that distinction lives inside the JWT itself.

  return { email, id: data.claims.sub as string };
}
```

**Why the JWT's own `role` claim is NOT used for this:** Supabase's built-in `role` claim
(`authenticated` vs `anon`) is a Postgres/RLS-level concept — every logged-in person, admin or
regular customer, gets `role: "authenticated"`. It has nothing to do with "is this person an
admin of our app" — that's an app-level concept this project defines itself via `admin_users`.

**Why this whole check runs twice** (once in `proxy.ts`, once again inside every `requireAdmin()`
call from a DAL function) — not redundant, it's defense-in-depth: `proxy.ts` is a fast UX layer
that can theoretically be bypassed by a framework-level bug (item 44a-i's CVE-2025-29927
precedent); each DAL function re-answering both questions independently means a single point of
failure in the fast layer never becomes a full security hole.

**Security of this design, concretely:** an attacker cannot forge the `email` used for the
authorization check (it only ever comes from a signature-verified JWT, never from request
input), cannot write to `admin_users` directly (RLS enabled, zero client-facing policies, only
the server-only Service Role key can touch it), and cannot exploit a stale/cached admin status
(no caching exists — every check is a fresh query).

## 2. Folder Structure (feature-based, API/UI separated)

```
src/
  app/                              ROUTING ONLY — no business logic, no direct API calls
    layout.tsx                      Minimal: html/body/fonts. No Sidebar/TopBar here.
    (auth)/                         Route group — no dashboard chrome
      login/page.tsx
      set-password/page.tsx
    (dashboard)/                    Route group — Sidebar + TopBar wrapper, protected
      layout.tsx                    Mounts <TopBar/> + <Sidebar/>, wraps {children}
      page.tsx                      Dashboard (Overview)
      products/
        page.tsx                    All Products list
        new/page.tsx                Add Product Line
        [id]/variants/page.tsx      Bulk Flavour+Region Variant Upload
      taxonomy/page.tsx             Category/Sub-category/Brand tree
      customers/
        page.tsx                    Approval queue
        activity/page.tsx           Cart Activity
    auth/confirm/route.ts           PKCE-style verifyOtp callback (public, no session yet)

  features/                         UI components + thin Server Actions, grouped BY FEATURE
    dashboard/components/           Stat cards, low-stock widget, activity feed
    products/
      components/                  ProductForm, ProductList, VariantBulkTable, RegionDuplicateHelper
      actions.ts                   createProductLineAction(), bulkCreateVariantsAction() — thin
    taxonomy/
      components/                  TaxonomyTree, AddEntryModal
      actions.ts                   addTaxonomyEntryAction() — thin
    customers/
      components/                  ApprovalQueueTable, CartActivityList
      actions.ts                   approveCustomerAction(), rejectCustomerAction() — thin
    auth/
      components/                  LoginForm, SetPasswordForm (already built, to be relocated)
      actions.ts                   signOutAction() — thin

  data/                             DAL — "server-only", the ONLY place Shopify/Supabase are called
    admin-auth.ts                  requireAdmin(), signOutAdmin()               [EXISTS]
    product-lines.ts               createProductLine(), listProductLines()     [TODO]
    variants.ts                    bulkCreateVariants()                        [TODO]
    taxonomy.ts                    listTaxonomyTree(), addTaxonomyEntry()      [TODO]
    customers.ts                   listPendingCustomers(), approveCustomer()   [TODO]

  components/                      SHARED/generic UI only (not feature-specific)
    Sidebar.tsx                    4 sections: Dashboard, Products, Taxonomy, Customers
    TopBar.tsx                     Logo, breadcrumb slot, admin email, Sign out
    Breadcrumb.tsx                 Generic path-segment breadcrumb

  lib/
    supabase/{server,client}.ts    [EXISTS]
    shopify/admin-client.ts        [EXISTS]
```

**Rule of thumb:** if a file makes an actual `fetch`/GraphQL/Supabase call, it lives in `data/`.
If a file is JSX the user sees, it lives in `features/*/components/` or `components/`. If a file
is a `'use server'` function, it lives in `features/*/actions.ts` and is ≤10 lines of glue.

---

## 3. Route Map + Per-Page Breakdown

### `(auth)/login` — `/login`
- **UI:** email + password form (`features/auth/components/LoginForm.tsx`)
- **Action:** none needed server-side — calls `createSupabaseBrowserClient().auth.signInWithPassword()`
  directly from the client (this is the one legitimate client-side Supabase call: it's how a
  session gets created in the first place, before any server-side check is possible)
- **Protection:** public (proxy.ts `PUBLIC_PATHS`)

### `(auth)/set-password` — `/set-password`
- **UI:** new/confirm password form
- **Action:** client-side `updateUser({password})` (session already set by `/auth/confirm`)
- **Protection:** public (session may not exist yet when this loads)

### `auth/confirm` — Route Handler, not a page
- **Does:** `verifyOtp({type, token_hash})` server-side, redirects to `next` param
- **Protection:** public (this establishes the session — nothing to check yet)

### `(dashboard)/` — Dashboard / Overview — `/`
- **UI:** stat cards, low-stock widget, recent-activity feed (`features/dashboard/components/`)
- **DAL:** `data/product-lines.ts` → `getDashboardStats()` (counts), `data/variants.ts` →
  `getLowStockVariants()`
- **Shopify APIs:** `products(first:0){totalCount}`-style aggregate queries, grouped by taxonomy

### `(dashboard)/products` — All Products — `/products`
- **UI:** search bar + table (`features/products/components/ProductList.tsx`)
- **DAL:** `data/product-lines.ts` → `listProductLines()`
- **Shopify API:** `products(first: N, query: "...")` query

### `(dashboard)/products/new` — Add Product Line — `/products/new` — **BUILT 2026-08-24**

Built and live-tested once Taxonomy + the Filter system (§7) were both working. `ProductLineForm`
(Client Component) receives the same `categories`/`subcategories`/`brands`/`filterDefinitions`/
`subcategoryFilterLinks` props as the Taxonomy page — selecting a Brand locally derives its
Sub-category (no extra round-trip) and renders only that Sub-category's `product`-level filters
(§7.2); `native` filters render nothing (their own dedicated inputs live elsewhere), `variant`
filters are deferred to the Bulk Variant Upload table (Flow C, not yet built).

`data/products.ts` → `createProductLine()`: `requireAdmin()` → (if an image was given)
`stagedUploadsCreate` → upload → `productCreate` (title, `productOptions: [{name:"Flavor",
values:[{name:"Default"}]}]`, `metafields`: `taxonomy.brand` (Brand reference) + one `custom.<key>`
per filled-in Product-Level filter, `media` for the image). No `publishablePublish` call —
deliberately left unpublished; a Product Line with 0 flavours is a real incomplete state (§0a),
not ready to go live. Live-verified: created a real Product with correct `taxonomy.brand` metafield
and a correct `custom.<domain>_<attribute>` metafield value, then cleaned up.

Redirects to `/products` on success (not `/products/[id]/variants` — Flow C doesn't exist yet, so
that route would 404).

### `(dashboard)/products/[id]/variants` — Bulk Variant Upload — `/products/[id]/variants`
- **UI:** `features/products/components/VariantBulkTable.tsx` — spreadsheet table (Flavour,
  Description, Region, Price, Compare-at, SKU, Image), "Duplicate to other regions", "Apply to
  all" (description), row-level validation before submit, autosave draft
- **Breadcrumb:** `Products / [Product Line Name] / Add Flavours`
- **Action:** `features/products/actions.ts` → `bulkCreateVariantsAction(productId, rows)`
- **DAL:** `data/variants.ts` → `bulkCreateVariants()`:
  1. `requireAdmin()`
  2. Batch rows into groups of 100 (proven safe size, DECISIONS.md item 43)
  3. Per batch: `stagedUploadsCreate` (images) → `productVariantsBulkCreate` (variants, each
     setting `custom.region` + `custom.flavour_description` metafields in the same call)
  4. Return `{created, failed, errors}` progress summary

### `(dashboard)/taxonomy` — `/taxonomy` — **BUILD ORDER: this is the FIRST real feature**
(corrected 2026-08-23 — an earlier plan built Product creation first; wrong, since an admin
can't select a Category/Sub-category/Brand that doesn't exist yet, and creating the first ones
is not a rare one-off — it's the actual starting point for using this panel at all)

- **UI:** `features/taxonomy/components/TaxonomyTree.tsx` (search-first, collapsible,
  "+ Add [level]" contextual buttons — the create action is central to this page, not a buried
  edge case)
- **Action:** `features/taxonomy/actions.ts` → `createCategoryAction()`, `createSubcategoryAction()`,
  `createBrandAction()` — thin, one per level (not a single generic "createEntry" — each level has
  a different field set and parent requirement, so a shared function would need type-branching
  anyway)
- **DAL:** `data/taxonomy.ts`:
  - `listCategories()` / `listSubcategories(categoryId?)` / `listBrands(subcategoryId?)` —
    already built, live-verified against real Shopify data
  - `createCategory({name, description, image?})`, `createSubcategory({..., categoryId})`,
    `createBrand({..., subcategoryId})` — **TODO**, exact sequence (researched 2026-08-23,
    official Shopify docs):
    1. `requireAdmin()`
    2. If an image/logo file was provided: `stagedUploadsCreate` → upload the file to the
       returned URL → `fileCreate` (`originalSource`: the staged URL) → get back a File GID
       (e.g. `gid://shopify/MediaImage/...`)
    3. `metaobjectCreate({ type, fields: [...] })` — using the **`fields` array format**
       (`[{key, value}]`), not the alternate `values` JSON-object format (schema confirms both
       exist but "cannot be used in conjunction with `fields`" — picked `fields` for consistency
       with this codebase's existing mutation calls). The image/logo field's value is the File
       GID from step 2; a parent-reference field's (`category`/`sub_category`) value is that
       parent's metaobject GID (already returned by the `list*()` functions above).
  - Product Line and its variants are explicitly **out of scope for this page** — they're a real
    Shopify Product (`productCreate`), not a metaobject, and belong to `/products/new` and
    `/products/[id]/variants` respectively (built after this page, once Category/Sub-category/
    Brand actually exist to select from).

### `(dashboard)/customers` — Approval Queue — `/customers`
- **UI:** `features/customers/components/ApprovalQueueTable.tsx`
- **Action:** `features/customers/actions.ts` → `approveCustomerAction()`, `rejectCustomerAction()`
- **DAL:** `data/customers.ts` — Supabase table read/update (account_type, approved flag) +
  Shopify customer find-or-create on approve (item 14/22)

### `(dashboard)/customers/activity` — Cart Activity — `/customers/activity`
- **UI:** `features/customers/components/CartActivityList.tsx`
- **DAL:** `data/customers.ts` → `listCartActivity()` (Supabase Realtime subscription, item 44b)

---

## 3a. UI/UX Design Per Page (wireframe-level, ready to implement)

Every page below follows the same states unless noted: **loading** (skeleton, not a blank
screen), **empty** (a specific message + the one relevant CTA, never a bare "no data"),
**error** (what failed + a retry action, never a silent failure), **populated**.

### Dashboard (`/`)

```
┌─────────────────────────────────────────────────────────────┐
│ [Categories: 4] [Sub-cats: 9] [Brands: 22] [Products: 58]    │  ← stat cards, one row
│                                             [Variants: 6,204] │
├─────────────────────────────────────────────────────────────┤
│ ⚠ Low stock / out of stock (3)                    [View all] │  ← widget, only if >0
├─────────────────────────────────────────────────────────────┤
│ ⚠ Incomplete Product Lines — 0 flavours (2)       [View all] │  ← fact 1 consequence
├─────────────────────────────────────────────────────────────┤
│ Recent activity                                               │
│  • "Beast Mode Max 2" — 1,200 variants added — 2h ago         │
│  • "Cherry Fusion" — Product Line created — 5h ago            │
└─────────────────────────────────────────────────────────────┘
```
- Stat cards: plain numbers, no charts (Ockham's Razor — this admin doesn't need graphs, just
  counts, per the non-technical persona)
- Both warning widgets **only render when count > 0** (Signal-to-Noise — an empty warning card
  is noise, not information)
- No primary "+" button here — Dashboard is a status view, not a creation point (creation lives
  in Products, matching Mental Model: Shopify's own dashboard doesn't have a product-add button
  either)

### Products — List (`/products`)

```
┌─────────────────────────────────────────────────────────────┐
│ Products                                    [+ Add Product]  │  ← Von Restorff: only solid button
│ [Search...........................]                          │
├─────────────────────────────────────────────────────────────┤
│ Name              Brand         Variants   Status            │
│ Beast Mode Max 2  Flavour Beast 1,200      ● Published        │
│ Cherry Fusion     Nasty Juice   0          ⚠ 0 flavours       │  ← fact 1/5, inline not buried
│ ...                                                            │
└─────────────────────────────────────────────────────────────┘
```
- Row click → not an edit page (out of scope for V1) → goes straight to
  `/products/[id]/variants` (the thing an admin actually needs to revisit most: adding more
  flavours), per Recognition Over Recall — one obvious next action per row, not a menu of options
- Status column shows **Published/Unpublished** (fact 5) and a **flavour-count warning** inline
  (fact 1) — both real states, not decorative
- Empty state (0 products): dashed-border panel, "No products yet" + the same "+ Add Product"
  button, centered — first-run experience matches Entry Point principle (inviting, one clear path)

### Add Product — `/products/new` — **DEFERRED, UI/UX not yet designed**

Removed 2026-08-23: the previous wireframe here assumed Taxonomy already exists and only needs a
read-only picker on this form. That build order was wrong (§3's Taxonomy entry above explains
why) and this page's actual UI/UX hasn't been redesigned yet — to be planned only after the
Taxonomy page (Category/Sub-category/Brand creation) is built and working. The page currently
renders a placeholder ("Being redesigned").

### Bulk Variant Upload — `/products/[id]/variants`

```
Breadcrumb: Dashboard / Products / Beast Mode Max 2 / Add Flavours

┌─────────────────────────────────────────────────────────────┐
│ ℹ 0 flavours yet — this product isn't visible to customers    │  ← only shown when count = 0
├─────────────────────────────────────────────────────────────┤
│ Flavour      Description   Region▾      Price  Compare  SKU  Image │
│ [_______]    [_______]     [Federal ▾]  [___]  [___]    [_]  [📷]  │
│ [_______]    [_______]     [Federal ▾]  [___]  [___]    [_]  [📷]  │
│ ...                                                             │
│                                                                 │
│ [+ Add row]  [Duplicate to other regions ▾]  [Apply description │
│                                                to all ▾]         │
│                                                                 │
│                          Draft autosaved · 47 rows [Create All →]│
└─────────────────────────────────────────────────────────────┘
```
- **Region column is a dropdown with exactly the 6 fixed values** (fact 2) — never free text
- "Duplicate to other regions" and "Apply description to all" are **secondary/outline buttons**,
  visually subordinate to "Create All" (Von Restorff again — one dominant action per screen)
- Row-level validation runs **before** submit (price missing, region blank) — invalid rows get a
  red left-border + inline message, submit button stays enabled but re-validates on click
  (Forgiveness — catch errors before the expensive network call, not after)
- Draft-autosave indicator is always visible near the submit button (small text, not a toast) —
  constant, quiet reassurance for a table that can hold up to ~1,200 rows
- Submit → progress state replaces the table temporarily: `Creating variants… batch 4/12` with a
  simple progress bar (Feedback Loop — a 52-second operation with zero feedback reads as frozen)
- On completion: summary banner (`✓ 1,200 created, 0 failed`) + button back to the product's row
  in `/products`

### Taxonomy (`/taxonomy`) — **the panel's actual starting point** (build-order correction above)

```
┌─────────────────────────────────────────────────────────────┐
│ Taxonomy                                        [+ Add Category] │  ← top-level create, always visible
│ [Search...........................]                            │
├─────────────────────────────────────────────────────────────┤
│ ▾ Vapes                                          [+ Add Brand] │
│    ▾ Disposables                                                │
│       • Flavour Beast              [+ Add Sub-category]        │
│       • Nasty Juice                                             │
│    ▸ Pod Systems                                                │
│ ▸ Cannabis                                        [+ Add Sub..] │
└─────────────────────────────────────────────────────────────┘

First-run / empty state (no categories yet at all):
┌─────────────────────────────────────────────────────────────┐
│ Taxonomy                                                        │
│  No categories yet — this panel starts here.                    │
│                                    [+ Add your first Category]  │
└─────────────────────────────────────────────────────────────┘
```
- Collapsible tree, search-first (type-to-filter collapses to only matching branches) —
  ADMIN_PANEL.md §3's already-decided pattern, unchanged
- **"+ Add Category" is always visible at the top** (not just contextual) — it's the one entry
  point with no parent dependency, so unlike Sub-category/Brand it doesn't need to "appear" next
  to anything
- "+ Add [level]" buttons appear **contextually at the level they'd create into** (e.g. "+ Add
  Brand" shown next to an expanded Sub-category) — Mapping principle: the control is spatially
  where its effect will land, not in a separate global "add" menu
- **Clicking any "+ Add" opens an inline form in place** (name, description, image/logo upload,
  parent pre-filled from context per ADMIN_PANEL.md §4's "context memory" principle) — not a
  navigation to a separate page, so the admin never loses their place in the tree
- **Empty-state framing matters here specifically** (unlike other pages' generic empty states):
  since this is now the panel's first real screen for a brand-new store, its empty state should
  read as "start here," not "nothing to show" — Entry Point principle, first impression counts
- No "+ Add Product Line" or "+ Add Flavour" anywhere on this page (fact 3/structure — neither is
  a metaobject; they're created from `/products/new` and `/products/[id]/variants` respectively,
  once this tree already has at least one Brand to select)

### Customers — Approval Queue (`/customers`)

```
┌─────────────────────────────────────────────────────────────┐
│ Customers                                                       │
├─────────────────────────────────────────────────────────────┤
│ Name        Email              Requested    Date    [Approve][Reject] │
│ J. Smith    j@x.com            Wholesale     2d ago  [Approve][Reject] │
└─────────────────────────────────────────────────────────────┘
```
- Approve/Reject are two clearly separate buttons (not a dropdown) — this is the highest-stakes
  action in the whole panel (grants real account access), so it gets maximum Visibility, not
  tucked into a menu
- Confirmation dialog on both actions (Confirmation principle — irreversible-feeling actions
  always confirm, even though technically re-appliable)
- Empty state: "No pending requests" — a calm, positive empty state (not a warning), since an
  empty queue is a *good* state here, unlike the Products list's empty state

### Customers — Cart Activity (`/customers/activity`)
- Simple reverse-chronological list, live-updating (Supabase Realtime, item 44b) — no pagination
  needed for V1 given expected volume; add if it becomes a real problem (Satisficing — don't
  build for a scale that doesn't exist yet)

---

## 4. Sidebar Navigation (4 sections, per UX pass — Chunking/Hick's Law)

| Label | Route | Matches Shopify's own wording (Mental Model/Mimicry) |
|---|---|---|
| Dashboard | `/` | — |
| Products | `/products` | Yes, identical |
| Taxonomy | `/taxonomy` | Custom (no Shopify equivalent) |
| Customers | `/customers` | Yes, identical |

TopBar: logo/name, breadcrumb slot (generic, derived from path segments unless a page overrides
it), admin's email, **Sign out** button (`features/auth/actions.ts` → `signOutAction()` →
`data/admin-auth.ts` → `signOutAdmin()`).

---

## 5. User Flows — Exact Request Sequence Per Flow

Every flow below shows precisely which request goes where, in order, including every protection
checkpoint. "Client" = browser. "Next.js Server" = this same project's server-side code.

### Flow A — Login

```
1. Client:        LoginForm submits email+password
2. Client:        createSupabaseBrowserClient().auth.signInWithPassword() — direct call to
                   Supabase's own Auth server (NOT our Next.js server, NOT Shopify)
                   → wrong password: Supabase returns an error here, nothing else runs
                   → correct password: Supabase issues a session, stored as a cookie
3. Client:        router.push('/') — client-side navigation
4. Next.js Server: proxy.ts runs (every request) — getClaims() confirms session is valid,
                   then queries admin_users (Service Role) — email not found → redirect to
                   /login; email found → request proceeds
5. Next.js Server: (dashboard)/page.tsx (Server Component) renders — reads dashboard data
                   via data/product-lines.ts + data/variants.ts (each calls requireAdmin()
                   again, independently of proxy.ts — item 44a-i)
6. Client:        receives rendered Dashboard HTML
```

### Flow B — Create Taxonomy Entry (Category / Sub-category / Brand) — current work

```
1. Client:        TaxonomyTree's inline "+ Add [level]" form submits name, description,
                   image/logo (File), parent id (pre-filled from tree context)
2. Client → Server: form's `action` prop invokes create{Category,Subcategory,Brand}Action —
                   one Server Action per level (features/taxonomy/actions.ts)
3. Next.js Server: the Server Action — THIN: extracts FormData, calls the matching
                   data/taxonomy.ts function, nothing else
4. Next.js Server: data/taxonomy.ts → create{Category,Subcategory,Brand}():
                   a. requireAdmin() — throws here if not an admin; nothing below runs
                   b. if an image/logo file was given: stagedUploadsCreate → upload to the
                      staged URL → fileCreate(originalSource: staged resourceUrl) → File GID
                   c. metaobjectCreate({ type, fields: [name, description?, image/logo?,
                      parent-reference] }) — fields array format, not values JSON-object
                      (both exist in the schema but can't be combined)
5. Next.js Server: revalidateTag for the taxonomy tree, action returns the new entry
6. Client:         tree updates in place (new node appears, inline form closes) — no
                   navigation, admin stays where they were in the tree
```

### Flow B2 — Create Product Line — **BUILT 2026-08-24**

```
1. Client:        ProductLineForm — admin picks a Brand (grouped by Category / Sub-category in
                   the <select>); the form locally derives that Brand's Sub-category from props
                   already on the page and renders only its relevant `product`-level filters (§7.2)
2. Client:         fills Product Line name, the rendered filter dropdowns, optional image, submits
3. Next.js Server: createProductLineAction (Server Action) — THIN: extracts FormData
                   (title, brandId, `filter:<key>` entries, image), calls the DAL
4. Next.js Server: data/products.ts → createProductLine():
                   a. requireAdmin()
                   b. if an image was given: stagedUploadsCreate -> upload
                   c. productCreate (title, productOptions: [{name:"Flavor", values:[{name:
                      "Default"}]}], metafields: taxonomy.brand + one custom.<key> per filled
                      Product-Level filter, media for the image) -- left UNPUBLISHED on purpose
5. Next.js Server: revalidatePath('/products'), redirect('/products')
```
See §7.2 for the field-rendering rule and §0a for why an unpublished, 0-flavour Product Line is a
correct intermediate state, not a bug.

### Flow C — Bulk Variant Upload (item 43) — **BUILT 2026-08-24**

```
1. Client:        VariantBulkTable (features/products/components/) — admin fills rows (Flavour,
                   Description, Region, Price, Compare-at, SKU, Image), draft autosaves to
                   localStorage per Product Line (text fields only, not File objects)
2. Client:        "Dup regions" clones a row across the 5 remaining Regions in one click,
                   carrying Price/Description/Image forward (packaging is normally identical
                   across regions -- admin can still override per-row)
3. Client:        clicks "Create All" — bulkCreateVariantsAction (Server Action) invoked with
                   FormData encoding rows as indexed `row:<i>:<field>` entries
4. Next.js Server: bulkCreateVariantsAction — THIN: decodes rows, passes to the DAL
5. Next.js Server: data/variants.ts → bulkCreateVariants():
                   a. requireAdmin()
                   b. split rows into batches of 100 (proven safe size — live-tested
                      1,200/1,200 with 0 errors, scripts/shopify/_tmp-scale-test.ts)
                   c. per batch, per row: optionValues = [{name: "<flavour> (<region>)",
                      optionName: "Flavor"}] (Region is a metafield, not a formal Option, so this
                      keeps Shopify's per-option-value uniqueness satisfied) + custom.region +
                      custom.flavour_description metafields, then productVariantsBulkCreate
                   d. building each batch's inputs (including image upload) happens INSIDE the
                      per-batch try/catch, so one bad image doesn't crash the whole run
                   e. accumulate {created, failed, errors} across all batches; on a thrown
                      ShopifyAdminApiError, surface its real `.errors` messages, not the generic
                      wrapper text
6. Client:         shows a created/failed summary with real error messages inline; clears the
                   autosaved draft only on full success (0 failed)
```

**Live-tested finding (2026-08-24) — variant images need TWO steps, not one:** `ProductVariantsBulkInput.mediaSrc` (a plain URL) does **not** reliably attach an image — confirmed even a URL matching an already-`READY` product media came back `image: null`. Only `mediaId` (the GID of a MediaImage already registered on the product) works. So `uploadVariantImage()` in `data/variants.ts` does: stage+upload the file → `productCreateMedia` (registers it as PRODUCT-level media, returns a MediaImage GID) → use that GID as `mediaId` on the variant. Live-verified: 6 variants each got their own distinct, correct image this way.

Also live-verified: duplicate-option-value collisions (re-submitting a `flavour+region` pair that already exists) return a Shopify `userErrors` entry ("The variant '...' already exists") that now surfaces verbatim in the UI, not a generic message.

### Flow D — Sign Out

```
1. Client:        TopBar's "Sign out" button — form action={signOutAction}
2. Next.js Server: signOutAction (features/auth/actions.ts) — THIN: calls the DAL, redirects
3. Next.js Server: data/admin-auth.ts → signOutAdmin() — supabase.auth.signOut() (invalidates
                   the session server-side)
4. Next.js Server: signOutAction calls redirect('/login')
5. Client:         browser lands on /login; any subsequent /dashboard/* request now fails
                   proxy.ts's session check (Flow A step 4) until logging in again
```

### Protection checkpoints present in every flow above
1. **proxy.ts** — fast layer: session exists? is this email in admin_users? (redirects if not)
2. **`requireAdmin()` inside every DAL function** — independent re-check, same two questions,
   never trusts that proxy.ts already answered them (defense-in-depth, item 44a-i)
3. **Neither Shopify nor Supabase's Service Role key ever reaches the Client** — both live only
   inside `server-only`-guarded files (`admin-client.ts`, every `data/*.ts` file)

## 7. Filter System — Full Design (Native / Product-Level / Variant-Level)

Designed 2026-08-23, after taxonomy seeding was live-verified. Not yet built — this section is
the spec to build against once Flow B2 (Create Product Line) is picked back up.

### 7.0 The three tiers, and the rule for sorting a filter into one

Every filter named in a Sub-category's `filters` list (source: `script.js`'s `CATALOG`) must be
classified into exactly one tier. Decide top-down — stop at the first tier that fits:

```
Step 1 — NATIVE?
  Is this already a built-in Shopify concept, not something we invent?
    Price          -> native `price` field
    Availability   -> native inventory/stock status
    Brand          -> our own Brand metaobject reference (already exists via Taxonomy)
    Flavor         -> the formal Product Option (already exists)
  If yes -> NATIVE. No metafield, no filter_definition entry. The Sub-category just gets a
  toggle "show this native filter" (on by default) — nothing to create, nothing to seed choices for.

Step 2 — VARIANT-LEVEL?
  Does the value genuinely change between flavours of the SAME Product Line — and is it
  intrinsic to what a flavour *is*, not a separate purchasing decision?
  Examples that qualify: Region, Flavour Description (already built this way).
  Examples that do NOT qualify: Nicotine Strength, Bottle Size — these are separate purchasing
  decisions, so per tonight's decision they become separate Product Lines instead of variants.
  Once that split happens, the attribute is no longer "varies by flavour" — it's constant across
  every flavour of that (now narrower) Product Line, which pushes it to Step 3, not this step.
  If yes (rare) -> VARIANT-LEVEL metafield, set per-flavour in the Bulk Variant Upload table.

Step 3 — PRODUCT-LEVEL (the default)
  Everything else. Same for every flavour under one Product Line, differs between Product Lines.
  This is where almost everything lands: Material, Paper Size, Paper Type, Length/Width, Pack
  Quantity, Device Type, Puff Count, Nicotine Strength, Nicotine Type, Bottle Size, Grinder Type,
  Hookah Hose Count, etc. -> PRODUCT-LEVEL metafield.
```

**Net result — confirms the hunch from earlier tonight ("most of them will be on the product
level"):** Variant-level is the exception, not the rule. It stays reserved for the two fields
already built (Region, Flavour Description) plus any future field that is truly about flavour
identity itself. Nicotine Strength does NOT need to be variant-level *even though it can differ
between 20mg/40mg of "the same" vape* — because the fix for that is a separate Product Line per
strength, not a variant, and once it's a separate Product Line the attribute is constant within
each one -> Product-Level. Product-Level metafields are what actually drive the listing-page
filter UI (Search & Discovery reads product-level metafields directly against the Product Line
shown in the grid — no "does any variant match" indirection needed, which is simpler and is why
Product-Level should be the default assumption for every new filter, not something to prove).

### 7.1 Data model

New metaobject type: `filter_definition`.

| field | type | notes |
|---|---|---|
| `label` | single_line_text_field | UI-facing name, e.g. "Material" — can repeat across domains |
| `key` | single_line_text_field | the actual `custom.<key>` metafield key, e.g. `rolling_paper_material` — must be globally unique, domain-prefixed (see 7.3) |
| `level` | single_line_text_field, `choices` validation `["native","product","variant"]` | which tier (7.0) |
| `choices` | list.single_line_text_field | the admin-editable value list (e.g. `["Hemp","Rice","Unbleached"]`) — empty/unused for `native` level |
| `native_field` | single_line_text_field, `choices` validation `["price","availability","brand","flavor"]` | only set when `level = native`, says which built-in field this toggle maps to |

Sub-category metaobject gets a new field: `relevant_filters` — `list.metaobject_reference` pointing
at `filter_definition`. This is the field the Product-form reads to know which fields to render
for a given Sub-category (already flagged as needed in the earlier filter-architecture pass).

For `level = product`, an actual `metafieldDefinition` (namespace `custom`, key = the
`filter_definition.key` value) must exist on the `product` owner type, with `validations: [{name:
"choices", value: <the same choices list, JSON-encoded>}]` and storefront access enabled. For
`level = variant`, same but on the `productvariant` owner type. Creating a `filter_definition`
metaobject and creating the matching Shopify `metafieldDefinition` are two separate API calls —
the admin-panel mutation must do both, in one Server Action, so they can never go out of sync.

### 7.2 Product-form behavior (reads `relevant_filters`)

```
1. Admin selects Sub-category for a new Product Line.
2. Form fetches that Sub-category's relevant_filters (list of filter_definition).
3. For each filter_definition:
     level = native   -> nothing rendered (native fields — Price, Availability, Brand, Flavor —
                          already have their own dedicated inputs elsewhere on the form; the
                          native toggle only controls whether that filter appears on the
                          storefront, it's a Search & Discovery config concern, not a Product
                          creation concern)
     level = product  -> render one <select> (options = filter_definition.choices), label =
                          filter_definition.label; value saved as `custom.<key>` metafield on
                          the Product on submit
     level = variant  -> NOT rendered here; rendered later per-row in the Bulk Variant Upload
                          table (Flow C), one column per variant-level filter_definition
                          relevant to this Product Line's Sub-category
4. If relevant_filters is empty (e.g. "General Convenience", not yet populated) -> render nothing
   extra, show a plain note: "No extra fields needed for this category yet." — not an error,
   not a blank confusing gap.
```

### 7.3 Naming convention (addresses "same label, different meaning" + scale)

- `filter_definition.key` is always `<subcategory-domain>_<attribute>`, e.g. `rolling_paper_material`,
  `glass_material`, `grinder_material` — never a bare `material`. The domain prefix is derived from
  the Sub-category's handle when the admin creates the filter (auto-suggested, editable).
- The UI-facing `label` can still just say "Material" in all three — customers/admins never see the
  raw key, so the shared label is fine; only the underlying key (and therefore the underlying
  `choices` list) must stay domain-separated so a Rolling-Papers product can never be assigned a
  Glass-only choice.
- All Product/Variant-level metafields live under the single `custom` namespace (matches the
  existing `custom.region` / `custom.flavour_description` pattern) — the domain-prefixed key is
  what keeps ~40-60 of them from colliding, not a namespace split.

### 7.4 Edge cases — how each is actually handled

1. **Same label, different meaning** -> solved by 7.3's domain-prefixed keys.
2. **Product-level vs variant-level per attribute** -> solved by 7.0's decision rule; `level` is a
   required field on `filter_definition`, chosen explicitly by whoever creates the filter (defaults
   to `product` in the UI, since that's the common case).
3. **Retroactive missing data when a filter is added after Product Lines already exist** ->
   Dashboard gets a warning widget (same pattern as the existing "0 flavours" incomplete-Product-Line
   flag): for each Sub-category, count Product Lines missing a value for any of that Sub-category's
   current `product`-level `filter_definition`s; list them so the admin can backfill.
4. **Scale (~40-60 metafields)** -> solved by 7.3's naming convention; no other mitigation needed at
   this scale (Shopify's metafield-definition limits are far above 60 per owner type).
5. **Empty `relevant_filters`** -> solved by 7.2 step 4 (graceful "no extra fields" note).
6. **Removing an in-use Choice value** -> V1 does not expose a delete button on the Choices editor at
   all, only "add value" (matches the earlier recommendation) — removes the risk entirely rather
   than trying to detect in-use values before allowing deletion.
7. **Changing a Product Line's Sub-category after creation** -> disallowed in V1: once a Product Line
   is created, its Sub-category field is rendered read-only with a short note; changing category
   requires deleting and recreating the Product Line.

### 7.5 Filter-management hardening — built 2026-08-24, live-tested

Three gaps found after the initial filter seed (122 filter_definitions, §7 seed scripts) were
closed before building further on top of the filter system:

- **`battery_capacity` placeholder filled in** (was the one filter left on `["To be confirmed"]"`
  after the industry-standard choices update — `1000mAh`–`3500mAh` range added).
- **`AddFilterForm` now auto-suggests the Key** as `<subcategory-slug>_<label-slug>`, derived from
  the Sub-category's actual name at creation time (not a hardcoded per-subcategory lookup like the
  seed script used) — works for any future Sub-category the admin adds, not just the 24 seeded so
  far. Key stays editable; a live client-side check still flags (a) a key that already exists
  anywhere in the catalog, and (b) a duplicate label already attached to the same Sub-category —
  both block the Add-Filter button before submit, rather than surfacing as a raw Shopify API error
  after. Backend-level, Shopify's own `namespace+key+ownerType` uniqueness constraint is the actual
  final backstop regardless of the UI check (`data/filters.ts` calls `metafieldDefinitionCreate`
  *before* `metaobjectCreate`, so a collision fails clean with nothing partially created) —
  live-verified: all 122 seeded filters have globally-unique keys even where labels repeat up to
  15x ("Size"), confirmed via a direct Shopify query.
- **New "Edit Filter — Add Choice" capability** (`data/filters.ts` → `addChoiceToFilter`,
  `features/filters/actions.ts` → `addChoiceToFilterAction`, `FilterChip.tsx` — click a filter chip
  on `/taxonomy` to see its current choices + an add-value input): appends one value at a time to
  an existing filter, live-tested end-to-end (added "Bamboo" to Rolling Papers' Material, verified
  in Shopify, reset after). Three rules enforced: (a) update order is
  `metafieldDefinitionUpdate` (Shopify's actually-enforced list) BEFORE the `filter_definition`
  metaobject's own `choices` field (the display copy) — so a partial failure never leaves the
  Product-form offering a value Shopify would then reject, worst case the display is just briefly
  stale; (b) case-insensitive/trimmed dedup rejects "hemp" if "Hemp" already exists; (c) no delete
  control anywhere in this UI — matches rule 6 above, values only ever grow.

## 6. Status

Planned 2026-08-23, before writing further admin-panel code. Existing scaffolding
(old `page.tsx`/`bulk-add`/`flavors/new`, mock `useStore()`) already moved into the route-group
structure above; their internals still need rewiring from mock data to the real `data/*.ts` DAL
functions listed here — tracked as the next implementation pass, not done yet.
