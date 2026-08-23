# Admin Panel — Implementation Plan

Consolidates DECISIONS.md (items 41–44) and BUILD_PLAN.md (§8) into one concrete, buildable
reference: every route, every folder, and exactly which layer (UI / Server Action / DAL) does
what for each page, before writing further code.

---

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

### `(dashboard)/products/new` — Add Product Line — `/products/new`
- **UI:** `features/products/components/ProductForm.tsx` (name, description, taxonomy dropdowns,
  base image)
- **Action:** `features/products/actions.ts` → `createProductLineAction(formData)`
- **DAL:** `data/product-lines.ts` → `createProductLine()`:
  1. `requireAdmin()`
  2. `stagedUploadsCreate` (image)
  3. `productCreate` (title, `productOptions: [{name:"Flavor"}]`, `metafields` for Brand —
     no `linkedMetafield`, avoids the Category-auto-link bug, DECISIONS.md item 43's gotcha)
  4. `publishablePublish` (products are created unpublished by default — easy to miss)
- **On success:** redirect straight to `/products/[id]/variants` (a Product Line isn't sellable
  with zero flavours yet)

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

### `(dashboard)/taxonomy` — `/taxonomy`
- **UI:** `features/taxonomy/components/TaxonomyTree.tsx` (search-first, collapsible,
  "+ Add [level]" contextual buttons)
- **Action:** `features/taxonomy/actions.ts` → `addTaxonomyEntryAction()`
- **DAL:** `data/taxonomy.ts` → `listTaxonomyTree()`, `addTaxonomyEntry()` (calls
  `metaobjectCreate` — Category/Sub-category/Brand only; Product Line is NOT a metaobject,
  DECISIONS.md item 2 correction)

### `(dashboard)/customers` — Approval Queue — `/customers`
- **UI:** `features/customers/components/ApprovalQueueTable.tsx`
- **Action:** `features/customers/actions.ts` → `approveCustomerAction()`, `rejectCustomerAction()`
- **DAL:** `data/customers.ts` — Supabase table read/update (account_type, approved flag) +
  Shopify customer find-or-create on approve (item 14/22)

### `(dashboard)/customers/activity` — Cart Activity — `/customers/activity`
- **UI:** `features/customers/components/CartActivityList.tsx`
- **DAL:** `data/customers.ts` → `listCartActivity()` (Supabase Realtime subscription, item 44b)

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

## 5. Status

Planned 2026-08-23, before writing further admin-panel code. Existing scaffolding
(old `page.tsx`/`bulk-add`/`flavors/new`, mock `useStore()`) already moved into the route-group
structure above; their internals still need rewiring from mock data to the real `data/*.ts` DAL
functions listed here — tracked as the next implementation pass, not done yet.
