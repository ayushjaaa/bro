# Future work: pending fixes and live updates without a page refresh

## Pending: move filtered listing to native Shopify Collection filtering

Fixed today (2026-09-05): `product-listing.ts`'s filtered-listing path (custom `filter_definitions`
checkboxes, Availability) now loops past Shopify's 250-per-request cap via `fetchAllMatchingProducts`
instead of silently only ever considering the first 250 candidates. This closes the real bug (a
product past position 250 was invisible under any active filter, no matter how many pages you
clicked through), and works correctly up to roughly the low thousands of products in one
(sub-category, brand, region) combination -- each such combination costs `ceil(N/250)` sequential
Shopify round-trips, so a few hundred products adds well under a second, but this was never meant to
scale to tens of thousands.

The genuinely scalable fix, confirmed via Shopify's own docs
(https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/products-collections/filter-products),
is native Collection-based filtering: `collection.products(filters: [...])` supports metafield
filters (`productMetafield`/`variantMetafield`) with Shopify doing BOTH the filtering and the
pagination server-side -- no scan, no cap, no loop. Requirements, all bigger than today's fix:
1. Products would need to belong to a real Shopify Collection per sub-category (this store
   deliberately uses `product_type`/`vendor`/`tag` + custom metaobjects instead of Collections --
   see product-listing.ts's own top doc comment and the taxonomy architecture decision to build off
   category/sub_category/brand metaobjects rather than Shopify's native Collection/Menu features).
2. The Shopify Search & Discovery app installed, with the relevant `custom.*` metafields marked
   "filterable" in that app's own settings.
3. The query layer rewritten from today's top-level `products(query: "...")` search to
   `collection(handle: "...").products(filters: [...])`.

Not worth doing until the catalog is genuinely approaching the scale where today's loop-based fix
would start costing noticeable latency (tens of thousands of products in one combination) --
revisit if/when that becomes real.

## Pending fix: `nav-menu` cache tag has the same bug the product page had

Found during a codebase-wide audit (2026-09-05) for other instances of the "tag is set on a fetch
but nothing ever calls `revalidateTag` for it" bug that the single-product page had before today's
fix. `storefront/src/lib/shopify/queries/menu.ts` tags its Shopify menu fetch with `nav-menu`
(3600s TTL) but no webhook or code anywhere calls `revalidateTag('nav-menu', ...)` -- a menu change
in Shopify would sit stale for the full hour, same class of bug as `product:<handle>` had.

Not urgent today: that fetch is currently unreachable. `REAL_MENU_ENABLED = false` in the same file
short-circuits `getMainMenu()` to always return a hardcoded `PLACEHOLDER_MENU` before the tagged
fetch is ever made (real menu data is a later phase, per that file's own comment -- the Storefront
API token doesn't even have the required scope yet). See the warning comment left directly above
`REAL_MENU_ENABLED` in that file.

**Before flipping `REAL_MENU_ENABLED` to `true`**: add a webhook handler for whatever Shopify event
fires when the "main-menu" navigation changes, and have it call
`revalidateTag('nav-menu', { expire: 0 })` -- follow the same pattern as
`storefront/src/app/api/webhooks/taxonomy/route.ts` (single store-wide tag, no per-event lookup
needed, same as taxonomy's `metaobjects/*` handling).

Context: as of the current cache-invalidation fixes (product page tagged cache + webhook-driven
`revalidateTag`, see the products/inventory webhook routes), a page always needs a refresh to pick
up a Shopify change. Refreshing now gets fresh data within seconds instead of up to an hour, but no
open browser tab updates itself automatically. This doc is about that next step, not yet built.

## The constraint that shapes both options

Shopify's Storefront API is request-response only -- confirmed directly from Shopify's own docs
(https://shopify.dev/docs/api/storefront): no GraphQL subscriptions, no websockets, no push
mechanism of any kind. A webhook only ever reaches OUR server, never a browser directly. So "no
refresh needed" requires a separate live channel between our own server and the browser --
something we'd build ourselves, unrelated to Shopify.

## Option A -- Supabase Realtime Broadcast (considered, not chosen)

Supabase's Broadcast feature (https://supabase.com/docs/guides/realtime/broadcast) is a plain
pub/sub messaging system, separate from its "Postgres Changes" table-replication feature. A message
like `{ "type": "product-changed", "handle": "kraze-ontario" }` could be published when a webhook
fires, and the storefront page would subscribe and refetch on receipt.

Rejected reason: a naive version of this (mirroring live data like price into a public,
anon-readable Supabase table for Postgres Changes) would let ANY visitor -- including one not
logged in / not approved -- read the real price directly from Supabase, bypassing the existing
"Login to View Price" gate that `getProductByHandle`'s caller enforces today (see
storefront/src/app/products/[handle]/page.tsx, which zeroes out price/flavor prices for a
non-approved `isApproved` before ever handing them to the client). Broadcast itself doesn't have
to carry sensitive data (it could carry just a signal, same as Option B), but it adds a whole new
dependency (Supabase Realtime channels, RLS/authorization on those channels) for something Option B
achieves without one.

## Option B -- Our own Server-Sent Events (SSE) -- CHOSEN

Decision (user, 2026-09-05): go with Option B.

Idea: the Next.js server keeps a lightweight, long-lived HTTP connection open with each browser
tab (a plain Route Handler streaming a `text/event-stream` response -- supported natively by
Next.js App Router Route Handlers, no custom server or extra infra required). When a product/
inventory webhook fires and calls `revalidateTag`, it also pushes a tiny event down that stream --
just a signal, e.g. `{ "handle": "kraze-ontario" }` or a generic "something changed" -- carrying
NO price or stock data itself.

On receipt, the browser tab triggers a normal refetch through the app's EXISTING, already-gated
data path (e.g. `router.refresh()` re-running the Server Component, which re-runs
`getProductByHandle` and the same `isApproved` price-gating logic that already exists). Because the
actual data still flows through the same code path as a manual refresh always has, there is no new
place for a price leak to open up -- the live layer only ever says "go re-check," never "here's the
new value."

Why this avoids the price-leak problem Option A had: the sensitive data (price) never travels
through the live/broadcast channel at all, only through the existing gated fetch.

### Rough shape of the work (not yet built)

1. A new Route Handler (e.g. `storefront/src/app/api/live/product/[handle]/route.ts`) that returns
   a `text/event-stream` response and keeps the connection open, keyed by product handle.
2. A small in-process registry mapping `handle -> Set<connection>` so the webhook handlers (both
   `products/route.ts` and the inventory forward path already built) can look up and notify only
   the connections actually watching that handle.
3. Client-side: the product page opens an `EventSource` to that route on mount, and calls
   `router.refresh()` (or a narrower client-side refetch) whenever an event arrives; closes the
   connection on unmount.
4. Same idea extends to the listing page later if wanted, keyed by the listing's cache tag
   instead of a single handle -- not required for the initial build.

### Known constraints to check before building

- SSE connections held open in a Next.js Route Handler tie up a server "worker" for the connection's
  lifetime -- fine for a small number of concurrent viewers on a single long-running Node process
  (this app's current deploy shape), but would need re-thinking (e.g. a managed pub/sub instead of
  in-process state) if this app ever moves to a serverless/multi-instance deployment, since
  in-process state (the handle -> connection registry) wouldn't be shared across instances.
- Needs a reconnect/heartbeat strategy (SSE clients auto-reconnect on drop, but the server should
  send periodic keep-alive comments so intermediary proxies/load balancers don't silently kill an
  idle connection).
- Decide the granularity of "something changed" vs "exactly what changed" -- the simplest version
  (just a handle, always triggering a full refetch) is enough to start; no need to diff old vs new
  values over the wire.
