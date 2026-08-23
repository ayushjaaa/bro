# Admin Panel — Implementation Plan

Consolidates DECISIONS.md (items 41–44) and BUILD_PLAN.md (§8) into one concrete, buildable
reference: every route, every folder, and exactly which layer (UI / Server Action / DAL) does
what for each page, before writing further code.

---

## 0. The Shopify Structure We Actually Built (ground truth — confirmed against DECISIONS.md
   items 1a/2/42/43 and the real setup scripts in `scripts/shopify/`, 2026-08-23)

```
Category (metaobject)
   ↑ referenced by
Sub-category (metaobject) — field "category" → Category
   ↑ referenced by
Brand (metaobject) — field "sub_category" → Sub-category
   ↑ referenced by
Product Line (a REAL Shopify Product — NOT a metaobject) — metafield "taxonomy.brand" → Brand
   │
   ├─ Option: "Flavor" (the only formal Shopify Option — max 3 allowed, we use 1)
   │
   └─ Variants (one per Flavor value, e.g. "Mango Peach") — up to 2,048 per product:
        ├─ price, compareAtPrice, sku, 1 image           — all native
        ├─ metafield "custom.region"                     — e.g. "federal", "ontario" — NOT a
        │                                                   formal Option, deliberately
        └─ metafield "custom.flavour_description"        — NOT native (ProductVariant has no
                                                              built-in description field)
```

**Three facts that must shape the admin UI, not just be background trivia:**

1. **A Product Line is created BEFORE it has any variants** — `productCreate` alone makes a
   product with an empty "Flavor" option and zero variants. It is not sellable yet at that point.
   This is a real two-step sequence, not an implementation detail to hide: **Step 1 creates the
   Product Line, Step 2 (a separate page) adds its flavours.** The UI must make this obvious
   (e.g. redirect + a visible "flavours: 0, add some" state), not let the admin believe they're
   done after Step 1.
2. **Region is invisible to Shopify's own native product-editing screens** as a selector — it's a
   metafield per variant, not an Option, so there is no Shopify-native UI for setting it at all.
   Our custom admin panel is the *only* place Region can be set — this isn't optional polish, the
   bulk-upload table is the sole interface for a required field.
3. **Category/Sub-category/Brand are a strict, pre-existing chain** the admin picks from (fetched
   live from Shopify, item below) — they are not typed free-text and not created inline as part of
   the product form by default (new entries are a separate, deliberate "+ Add" action elsewhere,
   per ADMIN_PANEL.md §4), so the product form's taxonomy pickers are read-only selectors, not
   text inputs.

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

### Flow B — Create Product Line

```
1. Client:        ProductForm (Client Component) submits name, taxonomy, base image (File)
2. Client → Server: form's `action` prop invokes createProductLineAction (Server Action) —
                   Next.js sends this as a POST under the hood
3. Next.js Server: createProductLineAction (features/products/actions.ts) — THIN:
                   extracts FormData fields, calls data/product-lines.ts, nothing else
4. Next.js Server: data/product-lines.ts → createProductLine():
                   a. requireAdmin() — getClaims() + admin_users lookup (Service Role) —
                      throws here if not an admin; nothing below runs
                   b. stagedUploadsCreate (Shopify Admin API) — get upload URL
                   c. upload the file to that staged URL directly
                   d. productCreate (Shopify Admin API) — title, productOptions (Flavor,
                      no linkedMetafield), metafields (Brand), media
                   e. publishablePublish (Shopify Admin API) — product starts unpublished
5. Next.js Server: createProductLineAction calls revalidateTag/revalidatePath for the
                   products list, then redirect() to /products/[new id]/variants
6. Client:         browser navigates to the bulk-upload page for the new Product Line
```

### Flow C — Bulk Variant Upload (item 43)

```
1. Client:        VariantBulkTable — admin fills up to ~1,200 rows (200 flavours × 6 regions),
                   draft autosaved to localStorage as they go (item 44c)
2. Client:        clicks "Create All" — bulkCreateVariantsAction (Server Action) invoked
                   with productId + all rows
3. Next.js Server: bulkCreateVariantsAction — THIN: passes productId + rows to the DAL
4. Next.js Server: data/variants.ts → bulkCreateVariants():
                   a. requireAdmin()
                   b. split rows into batches of 100 (proven safe size — live-tested
                      1,200/1,200 with 0 errors)
                   c. per batch: stagedUploadsCreate (images for that batch) → upload each →
                      productVariantsBulkCreate (variants, each with `custom.region` +
                      `custom.flavour_description` metafields set in the same call)
                   d. accumulate {created, failed, errors} across all batches
5. Next.js Server: revalidateTag for this Product Line's variant data
6. Client:         receives the summary — success toast + created/failed counts; clears the
                   autosaved draft on full success
```

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

## 6. Status

Planned 2026-08-23, before writing further admin-panel code. Existing scaffolding
(old `page.tsx`/`bulk-add`/`flavors/new`, mock `useStore()`) already moved into the route-group
structure above; their internals still need rewiring from mock data to the real `data/*.ts` DAL
functions listed here — tracked as the next implementation pass, not done yet.
