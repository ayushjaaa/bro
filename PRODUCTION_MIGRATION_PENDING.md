# Store Migration — Pending Checklist

Migrating from the old dev/test store (`gemini-bgnr4lyi.myshopify.com`) to the client's real
store, **Gemini Distribution** (`gemini-distribution-1begj051.myshopify.com`). Track progress here
so nothing gets missed before this goes live.

## Done

- [x] Custom app created on new store, collaborator access confirmed
- [x] Admin API scopes granted: `write_products`, `read_products`, `write_inventory`,
      `read_inventory`, `read_locations`, `write_orders`, `read_orders`, `read_all_orders`,
      `write_customers`, `read_customers`, `write_metaobjects`, `read_metaobjects`,
      `write_metaobject_definitions`, `read_metaobject_definitions`, `write_files`, `read_files`,
      `write_publications`, `read_publications`
      *(still missing: `write_draft_orders` — not found as a checkbox under current plan; needs
      re-checking once draft order creation is actually tested end-to-end)*
- [x] `admin-panel/.env.local` and `storefront/.env.local` updated: `SHOPIFY_STORE_DOMAIN`,
      `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_ADMIN_ACCESS_TOKEN`,
      `SHOPIFY_STOREFRONT_ACCESS_TOKEN` (storefront only)
- [x] `admin-client.core.ts` (both apps) updated to support a static Admin API access token
      (`SHOPIFY_ADMIN_ACCESS_TOKEN`) as well as the old `client_credentials` OAuth grant — this new
      store's custom app type doesn't support `client_credentials` at all (`shop_not_permitted`)
- [x] Metaobject/metafield definitions created on the new store: Category → Sub-category → Brand,
      filter_definition, Product `taxonomy.brand` + subcategory metafield, Variant `custom.region`,
      `custom.flavour_description`, `custom.retail_price`, Collection mega-menu metafields
      (`menu_nav_key`, `menu_group_label`, `menu_group_mode`, `menu_sort_order`)
- [x] Storefront API granted `PUBLIC_READ` access to `category`/`sub_category`/`brand`/
      `filter_definition` metaobject definitions
- [x] Currency handling fixed to not be hardcoded: `admin-panel/src/data/variants.ts` now fetches
      `shop.currencyCode` live (cached) instead of a hardcoded value; confirmed new store's
      currency is **CAD** (old store was USD — this bit the team once already, see git history)
- [x] All currency fallbacks across both apps set to `'CAD'` (was `'USD'` in 3 spots in
      `admin-panel/src/data/products.ts`)
- [x] Storefront's 3 bare `$${n.toFixed(2)}` price formatters (`CheckoutPage.tsx`,
      `CartDrawer.tsx`, `CartTable.tsx`) normalized to `Intl.NumberFormat('en-CA', {currency:
      'CAD'})` for consistency with the rest of the app
- [x] `admin-panel/src/lib/inventory.ts` `INVENTORY_LOCATION_ID` updated to the new store's
      location (`gid://shopify/Location/84994621638` — Shopify's auto-created "Shop location")

## Still Pending

- [x] **Inventory location address completed** — full street/city/province/zip filled in via
      Shopify Admin → Settings → Locations. Fulfillment, Shipping, Local delivery, and Pickup in
      store toggles also turned on for the default "Shop location" (sub-settings for
      Shipping/Local delivery/Pickup left unconfigured — see note below, not needed for the current
      draft-order flow). Should unblock tax auto-calculation on draft orders — needs re-confirming
      on the next test draft order.
- [x] **`write_draft_orders` scope** — checked/added under Admin API integration → Configure (both
      `read_draft_orders` and `write_draft_orders`), saved and reinstalled. Access token unchanged
      (same `shpat_...` token in both `.env.local` files still valid after the scope update).
- [x] **Draft order creation confirmed working manually from Shopify Admin** — tried without a
      customer address filled in, so tax showed as not calculated (expected — Shopify can't
      calculate tax without a shipping/billing address, regardless of the location address fix).
      Order creation itself works fine, which is what actually matters for the current flow (see
      "Draft order flow vs. native checkout" note below).
- [ ] **Tax auto-calculation check — deferred, not blocking.** Since orders are created manually
      from the admin panel as drafts (not through native checkout), a missing tax amount doesn't
      stop us from working — we can fill it in manually per order if needed. Revisit later: create
      a draft order **with a customer address filled in** and confirm tax now calculates
      automatically (should be unblocked now that the location address is complete). Low priority
      for now — parking it alongside the other Shipping/Local delivery/Pickup config items below.
- [x] **Both apps deployed to Vercel production + all 16 webhooks registered against the
      permanent URLs.**
      - `admin-panel` production build was previously failing (`_tmp-publish-all.ts` type error
        under `scripts/`, and a newly-added session script hit the same class of error) — Next.js's
        production build type-checks the WHOLE project, not just `src/`. Fixed properly by
        excluding `scripts/` (and `e2e/` for storefront) from both apps' `tsconfig.json` `exclude`
        array, so future one-off scripts never block a deploy again.
      - **Both Vercel projects had ZERO environment variables set** before this — the earlier
        production deployments (5-8 days old) were essentially non-functional at runtime. All
        `.env.local` values pushed via `vercel env add ... production` for both projects, with
        `NEXT_PUBLIC_APP_URL`/`STOREFRONT_INTERNAL_URL`/`ADMIN_PANEL_INTERNAL_URL` set to the real
        deployed URLs (not localhost). **Deliberately did NOT push `SHOPIFY_ADMIN_ACCESS_TOKEN` to
        storefront's production env** — confirmed via full-codebase audit that no storefront
        runtime code reads it, only the dev-only webhook registration scripts, so a customer-facing
        app doesn't need to carry that credential live.
      - Live URLs: `admin-panel` → `https://admin-panel-theta-blond.vercel.app`, `storefront` →
        `https://gemini-distribution-storefront.vercel.app`. Both redeployed after adding env vars
        (Vercel requires a fresh deploy to pick up newly-added env vars) and verified live (200 OK,
        real product data rendering, correct account-gated pricing text).
      - All 4 registration scripts run against these permanent URLs (16 total subscriptions: 8 on
        admin-panel's callback URLs, 8 on storefront's) — see `WEBHOOK_REGISTRATION_GUIDE.md` for
        the full topic/URL breakdown. An earlier attempt via a local ngrok tunnel left 13 stale
        subscriptions pointing at a dead `ngrok-free.dev` URL (ngrok's free tier only allows one
        tunnel at a time, which caused a domain collision between the two apps' registrations) —
        all deleted via `webhookSubscriptionDelete` once the real URLs were live.
      - **Still needs a first login** on the new admin-panel domain — a "Couldn't verify your
        session" error on first visit is expected (new domain = new cookie space, not a bug) and
        resolves after logging in once at `/login` on the real URL.
      - **Test to run now that webhooks are live**: complete a checkout → mark the resulting order
        Fulfilled in Shopify Admin → click "Continue Shopping" on the storefront → confirm the
        just-ordered product's stock/out-of-stock status and current price update correctly on the
        very next page view, without a manual cache clear (this is exactly what the inventory
        webhook is supposed to fix — see the "Product page caching" note below for why this
        previously required a manual `.next` clear instead).
      - **When the client's own Vercel account/domain is ready**: update the env vars on both
        projects to the new URLs, redeploy, then re-run the registration scripts against the new
        domain (and delete the `*.vercel.app` ones the same way the ngrok ones were cleaned up
        here) — this `.vercel.app` setup is meant to be temporary, not the final production home.
- [x] **`customers.shopify_customer_id` cleared for all 4 rows carrying stale OLD-store GIDs**
      (`ayush123@gmail.com`, `test.wholesaler@example.com`, `priya.sharma@example.com`,
      `ayushjaiswal452@gmail.com`) — this was actively breaking checkout: `createDraftOrder`
      (`admin-panel/src/lib/shopify/draft-orders.ts`) sends this as `purchasingEntity.customerId`,
      and Shopify rejects the mutation with a `userErrors` entry when the GID doesn't exist on the
      current store (confirmed via a direct `customer(id: ...)` query returning `null`) — surfaced
      to the storefront only as the unhelpful `"draftOrderCreate returned userErrors"` (the actual
      `userErrors` array was never logged; fixed alongside this so future failures are debuggable —
      see `draft-orders.ts`'s catch block). Draft orders now create fine without a linked Shopify
      customer (code already handled `null` gracefully) — these 4 customers just won't show up
      under a Shopify Customer's own order history until properly re-linked (no backfill script
      exists for this yet, unlike the other backfill scripts below).
- [ ] **Other Supabase tables with stale OLD-store references still pending**: `cart_snapshot`,
      `wishlist_folders`/`wishlist_items` (corrected table names — a full-codebase audit found the
      actual tables, `wishlist` alone doesn't exist), `inventory_snapshot`, `stock_aggregates`,
      `product_health_snapshot`, `customer_carts.cart_id`. These need truncating and then
      repopulating via the backfill scripts (`backfill-stock-aggregates.ts`,
      `backfill-product-health-snapshot.ts`, `backfill-native-taxonomy-fields.ts`) now that real
      products exist on the new store. **Until this runs, admin-panel's dashboard panels
      (`RecentlyUpdatedCard`, `ProductHealthPanel`, `useLiveInventoryTable`, `CartOverview`) will
      show wrong/empty/old-store data even though the UI itself is fully wired and functional** —
      not a UI bug, purely a data-freshness gap. `WebhookHealthBadge.tsx` already self-reports
      "Live sync disconnected" while webhooks are unregistered — a built-in signal, not something
      to separately fix.
- [ ] **`ADMIN_PANEL_INTERNAL_URL` / `STOREFRONT_INTERNAL_URL` still pointing at localhost breaks
      MORE than just the inventory webhook relay** (full-codebase audit finding) — storefront's
      checkout (`features/checkout/actions.ts`) and order history (`features/account/actions.ts`,
      calling `/api/internal/customer-orders` and `/api/internal/customer-order-detail`) both call
      admin-panel through this same env var. **Checkout and order history will both break in
      production**, not just inventory sync, until this is updated post-deploy.
- [ ] **Env var hygiene before deploying storefront**: `storefront/.env.local` currently holds a
      live `SHOPIFY_ADMIN_ACCESS_TOKEN`. A full-codebase audit confirmed **no runtime app code
      under `storefront/src` ever reads it** — only the dev-only `scripts/shopify/register-
      webhooks.ts`/`unregister-webhooks.ts` do, which is fine. But if this `.env.local` is copied
      wholesale into the storefront's hosting environment (Vercel etc.) at deploy time, a
      customer-facing app would carry a live Admin API credential it never needs at runtime —
      review before deploy and exclude it from the deployed env if possible. Separately: the
      header comment in `storefront/src/lib/shopify/admin-client.core.ts` references importing
      from `./admin-client` (a guarded wrapper) instead of this file directly — **that wrapper
      file doesn't exist**, a stale/aspirational comment worth removing so it doesn't mislead a
      future contributor into adding a real runtime import of the Admin API here.
- [ ] **No transactional email service found** in either app (no Resend/SendGrid/Postmark/
      nodemailer) — email delivery is entirely Supabase Auth's own flows (magic links, admin
      invites). No registration-approved / order-confirmation / draft-order-ready customer emails
      exist in code. May be intentional (client calls customers directly, per the draft-order flow
      documented below), but confirm with the client before launch — not a migration bug, a
      capability gap worth a deliberate yes/no.
- [ ] `storefront/src/app/layout.tsx:20` — `// TODO: replace with the real production domain once
      confirmed.` (metadataBase/canonical URL) — resolve once the real deployed domain is known,
      same "not yet deployed" theme as the internal-URL env vars above.
- [x] **Full taxonomy + 2 sample products seeded on the new store**, via the renamed testing seed
      scripts (`npm run shopify:seed-testing-taxonomy` then `npm run shopify:seed-testing-products`
      — renamed from `seed-real-taxonomy.ts`/`seed-sample-products.ts` so the filenames read as
      test/dev tooling, not something safe to point at a live client store unreviewed). Taxonomy
      script created the full Category → Sub-category → Brand tree (Vapes, Smoking, Cannabis
      Accessories, Convenience). Product script needed its hardcoded `RAW_BRAND_ID`/
      `ELF_BAR_BRAND_ID` updated first — old store's metaobject GIDs don't carry over to the new
      store — new IDs looked up live and swapped in before running. Created 2 test Product Lines
      (RAW Classic Rolling Papers, Elf Bar BC10000) with flavour variants across multiple regions.
      **This is real taxonomy data but still only sample/placeholder products** — client still
      needs their actual full product catalog entered via `/products/new` (or a further seed
      pass) before going live.
- [ ] **`STOREFRONT_INTERNAL_URL` (admin-panel) / `ADMIN_PANEL_INTERNAL_URL` (storefront)** still
      point at `localhost` — need updating to real deployed URLs once both apps are actually
      deployed, otherwise the inventory-webhook relay between the two apps won't work in
      production.
- [x] **Wholesale/retail dual-pricing end-to-end tested — found and fixed a real bug.**
      `draftOrderCreate`'s `originalUnitPrice` line-item field is silently ignored on this store's
      API version (2026-07) — no error, just kept the variant's native (wholesale) price. Every
      retail-customer draft order was being charged wholesale. Fixed by switching to the correct
      field, `priceOverride: { amount, currencyCode }`
      (`admin-panel/src/lib/shopify/draft-orders.ts`). Confirmed via direct Shopify Admin API test
      that `priceOverride` works and `originalUnitPrice` doesn't, on this exact store/API version.
      Also confirmed (separately, worth knowing): creating a draft order does NOT deduct inventory
      — only completing it (Mark as Paid) does, immediately, before any fulfillment step.
      Full test matrix + automated Playwright regression coverage: see `E2E_TEST_PLAN.md` at repo
      root and `storefront/e2e/pricing-inventory-checkout.spec.ts`. Dedicated price-test
      accounts/products for this: `admin-panel/scripts/supabase/seed-testing-price-test-customers.ts`,
      `admin-panel/scripts/shopify/seed-testing-price-products.ts`,
      `seed-testing-e2e-edge-case-products.ts` (out-of-stock / low-stock products).
- [x] **Second real bug found while testing the above: the products LISTING page (not just the
      product detail page) never resolved retail pricing at all.**
      `storefront/src/lib/shopify/queries/product-listing.ts`'s `getSubcategoryProducts` only ever
      queried `priceRange.minVariantPrice` (Shopify's native/wholesale aggregate) and never fetched
      `custom.retail_price` or took `accountType` as input — every visitor, retail or wholesale,
      saw the wholesale "Starting From" price on every category/listing page, correct only once
      they opened a product's own detail page. Fixed: the listing query now fetches each variant's
      `retail_price` metafield, `toListedProduct`/`resolveVariantPrice` resolve the cheapest
      variant's price per `accountType` (same rule as the product detail page), and
      `fetchSubcategoryProductsAction` (`storefront/src/features/products/actions.ts`) resolves
      `accountType` itself server-side via `getCustomerAccessState()` — never trusts anything
      client-supplied for this, same trust boundary as every other price path in this app. Also had
      to fix two knock-on issues: (1) the Storefront API's `ProductVariant.price` is a `MoneyV2`
      object (`{ amount, currencyCode }`), not a bare string like the Admin API's — a first attempt
      at the query broke with a GraphQL `selectionMismatch` error; (2) the listing cache tag now
      includes `accountType` as a 5th segment
      (`products:<sub>:<region>:<brand>:<retail|wholesale|guest>`) so a retail and wholesale
      visitor never share a cache entry — this also required updating the products webhook route's
      tag-reconstruction logic and `combo-tag-registry.ts`'s tag parser (both previously assumed a
      4-part tag) to keep future webhook-driven cache invalidation correct once webhooks are
      registered. Automated regression coverage added:
      `pricing-inventory-checkout.spec.ts`'s "Listing page pricing by account type" block.
- [x] **RESOLVED (2026-09-18): Protected customer data access WAS a blocker after all — for the
      customer-facing "Order History" detail drawer specifically.** An earlier pass through this
      checklist found `customer-lookup.ts`'s `findOrCreateShopifyCustomer` (used at
      registration/approval) is write-only for PII and concluded this restriction wasn't currently
      hit anywhere — correct for that one function, but incomplete: it didn't audit
      `customer-orders.ts`'s `getDraftOrderDetail`, which DOES read PII back from a DraftOrder
      (`email`, `phone`, `shippingAddress.address1/.address2/.zip`, `customer.firstName/.lastName`),
      exactly the "future feature" case this entry itself said to revisit for. Symptom: clicking any
      order in the storefront's Order History list opened the detail drawer to "Could not load
      order" — `admin-panel/src/app/api/internal/customer-order-detail/route.ts` returning a 502.
      **Root cause, precisely identified via live testing (2026-09-18) against this store's actual
      app**: this store's Shopify plan (not Shopify/Advanced/Plus) blocks the Admin API from
      returning those 7 specific fields — confirmed as a plan-tier gate, not an app-approval
      request flow (the store's own Settings → Apps → this app → Configuration page shows
      "Protected customer data access" with only an "Upgrade plan" button, no request-access form).
      Every other field on the same query (line items, price, quantity, image, order status, total,
      and even `shippingAddress.city/.province/.country` + `customer.id`) comes back fine in the
      SAME response — Shopify returns `data` and `errors` together (partial success), it's not a
      total request failure.
      **The actual crash was our own code's fault, not Shopify's restriction**: `shopifyAdminRequest`
      (the app's single shared Admin API entry point, used everywhere) throws on ANY GraphQL error
      present, discarding perfectly good partial data along with the blocked fields. **Fix**: added
      `shopifyAdminRequestAllowingPiiGaps` (`admin-client.core.ts`) — identical to
      `shopifyAdminRequest` except it only tolerates errors matching this exact, verified pattern
      (`extensions.code: "ACCESS_DENIED"` + message matching `/Customer object/i`); any OTHER error
      still throws exactly as before, so this doesn't weaken error handling anywhere, it only stops
      discarding this one known, structural, un-fixable-by-us gap. `getDraftOrderDetail` now uses
      it, so the blocked fields come back `null` in `CustomerOrderDetail` instead of the whole
      request failing. The route then backfills those specific null fields (name, email, phone,
      street address, zip — never city/province/country, which Shopify already returns) from this
      app's own Supabase `customers` table via new `getCustomerOrderContactInfo()`
      (`data/customer-shopify-id.ts`) — the SAME data, since this app already collected it directly
      from the customer at registration (008 migration), not a lesser substitute. Live-verified
      end-to-end (2026-09-18) via direct API call: order previously 502'd now returns full detail,
      customer name/email correctly backfilled from Supabase, line items/price/status correct from
      Shopify, `null` phone/address for a test customer that genuinely never filled those fields at
      registration (not a bug — accurately reflects what we actually know). Scanned the rest of the
      codebase for the same pattern: no other function reads Customer PII back from Shopify (the
      order LIST query, `draft-orders.ts`'s order-creation writes, and the Customers dashboard list
      all either avoid PII fields entirely or source name/address from Supabase already) — this was
      the only blocked code path, and it's now fixed.
      **Permanent alternative, not yet done**: request the actual Shopify plan upgrade
      (Shopify/Advanced/Plus) for this store, which would make the Admin API itself return these
      fields directly with no workaround needed — a billing decision, not made during this session.
- [x] **RESOLVED (2026-09-18): Product detail page's `quantityAvailable`/`availableForSale` were
      stale after an order was fulfilled — root-caused to Shopify's own Storefront API edge-cache
      for read queries (officially confirmed by Shopify staff:
      github.com/Shopify/storefront-api-feedback/discussions/191 — "read queries are cached...
      could take between 5-30 seconds for our entire global edge network to have the given
      update", "no request headers can prevent" it) — and then genuinely fixed, not just
      mitigated, once discovered that Shopify's edge cache appears to apply specifically to
      **POST** requests (the GraphQL-over-HTTP convention this app, like virtually every GraphQL
      client, used everywhere) but not to **GET** requests.**
      Live-verified on this store, 100% reproducible across many repeated back-to-back calls:
      identical query, same token, same product — POST consistently returned a stale
      `quantityAvailable` (e.g. 50 when the real value was 25), GET consistently returned the
      correct, current value, every single time. `server-timing` response headers corroborated
      this: GET measurably took a different backend path (`db;dur=120ms`, `x-dc` crossing
      `asia-southeast1` → `us-central1` region hops) versus POST's fast path (`db;dur=6ms`,
      `x-dc` staying in `asia-southeast1` for all three hops) — consistent with GET reaching a
      more authoritative source while POST hits a fast edge-cached replica. Also ruled out before
      landing on this: our own Next.js Data Cache (already bypassed via `cache: 'no-store'`), any
      hidden in-memory/module-level cache in our own code (grepped, none found), missing Shopify
      scopes (confirmed `unauthenticated_read_product_inventory` granted), CDN/edge-region routing
      (checked via `X-DC` header — same datacenter every time despite differing results), a
      cart-interaction "nudge" theory (controlled experiment disproved it), and simple time-based
      TTL (sometimes converged in 15s, sometimes still stale after 140s+ — no fixed window).
      **Fix applied**: `shopifyStorefrontRequest` (`storefront/src/lib/shopify/storefront-client.ts`)
      now accepts a `method: 'GET' | 'POST'` option (defaults to `'POST'`, unchanged everywhere
      else); `getProductByHandle` (`storefront/src/lib/shopify/queries/products.ts`) passes
      `method: 'GET'` specifically, since this is the one query where inventory-freshness matters
      most. GET has a URL-length ceiling POST doesn't, so this is intentionally scoped to the
      single-product query only, not applied to listing/search queries with larger payloads.
      **Not officially documented or guaranteed Shopify behavior** — an empirically observed,
      reproducible pattern on this store at time of writing, not a stated API contract; worth
      re-verifying if Shopify ever changes their edge-cache implementation. Verified working
      end-to-end in production (not just raw curl) via live server logs showing
      `method=GET ... quantityAvailable: 25` for a variant Admin API also confirmed was at 25.
      Original mitigation-phase investigation, kept for context:
      Deep investigation (numbered request logging added to `storefront-client.ts` to
      distinguish CACHE vs LIVE calls by elapsed time, `#N` sequence numbers to match log lines
      across interleaved requests): confirmed via TWO consecutive, genuinely-fresh (not cached —
      244ms/257ms network round-trips) Storefront API calls, seconds apart, both returning a
      variant's `quantityAvailable` as 50 while the Admin API's `inventoryLevels` (`available` AND
      `on_hand`, `committed`/`reserved` both 0, single location, `tracked: true`) simultaneously
      confirmed the real, authoritative value was 25 — reproduced independently by the client
      running the same curl themselves. Checked and ruled out: our own Data Cache (bypassed both
      times), our revalidateTag/webhook chain (fired correctly), Shopify scopes (all correct,
      `unauthenticated_read_product_inventory` granted), multi-location mismatches (none),
      inventory reservation state (clean), and whether a different Storefront API query shape
      exists (`quantityAvailable` takes zero arguments, confirmed via schema introspection — this
      is the only way to query it). Conclusion: Shopify's Storefront API is served from a
      separate, globally-distributed read layer that syncs asynchronously from the core inventory
      system Admin API reads from directly — this lag is a documented Shopify platform
      characteristic for exactly this field, not something app-level code can eliminate.
      **Mitigation applied**: `getProductByHandle` (`storefront/src/lib/shopify/queries/
      products.ts`) now fetches with `cache: 'no-store'` instead of `next: { revalidate: 60,
      tags: [...] }` — the product detail page never adds its OWN caching delay on top of
      Shopify's; the instant Shopify's read layer catches up, the very next page load reflects it,
      with no 60s wait and no dependency on the webhook chain. Trade-off: every product page view
      is now a live ~150-250ms Shopify round-trip instead of a near-instant cache hit. **No actual
      overselling risk either way** — Shopify's own cart/checkout (`cartLinesAdd`) reads from the
      authoritative source independently and already correctly caps orders at the real quantity,
      confirmed by live testing (a customer could select 50 on a stale-displaying PDP, but the
      cart itself always correctly capped it at the true 25 available).
- [ ] Leftover debug scripts under `admin-panel/scripts/shopify/_tmp-*.ts` created during this
      migration (`_tmp-check-currency.ts`, `_tmp-check-quebec-price.ts`, `_tmp-check-scopes.ts`,
      `_tmp-list-locations.ts`, `_tmp-check-wholesaler-cart.ts` under `scripts/supabase/`, etc.) —
      fine to keep as debug tooling, but worth a pass to delete ones that were truly one-off.
- [ ] **Location's Shipping / Local delivery / Pickup in store toggles turned on but left
      unconfigured (no zones/rates/radius/instructions filled in yet).** Not urgent for the current
      order flow — see "Draft order flow vs. native checkout" note below for why — but should be
      filled in before the client ever relies on native Shopify checkout.

## Draft order flow vs. native checkout — why Shipping/Local delivery/Pickup config isn't urgent

Confirmed with the client: orders are **not** placed through Shopify's native storefront checkout.
The actual flow is:

1. Customer orders through our custom storefront (or by us calling them directly).
2. We manually create a **Draft Order** in Shopify Admin on their behalf.
3. We call the customer to confirm/finalize checkout details.
4. We then mark the draft order **Paid** and **Fulfilled** ourselves from the admin.

Because of this, Settings → Locations → Shipping / Local delivery / Pickup in store behave
differently than they would for a normal storefront:

- **Shipping zones/rates**: only enforced at Shopify's own checkout, to calculate a live rate for
  the customer. Draft orders let you type a **custom shipping line amount manually** — no zone
  needs to exist for draft order creation to work. Not blocking right now.
- **Local delivery** (radius/fee) and **Pickup in store** (instructions/timing): same story — these
  only surface as selectable options at native checkout. On a draft order we just add a shipping
  line manually and note delivery/pickup in the order — the configured radius/fee/instructions are
  never read.
- **Net effect**: turning these three toggles on didn't require configuring their sub-settings, and
  nothing breaks by leaving them unconfigured while this manual draft-order flow is how the
  business actually operates.
- **When this changes**: if the client ever turns on native Shopify checkout (customers buying
  directly through Shopify without a human creating the draft order), all three need real
  zones/rates/radius/instructions configured first, or checkout will error out or show incomplete
  options to the customer.

## Notes for future reference

- Two distinct Shopify auth modes exist in this codebase now: a **static Admin API access token**
  (`SHOPIFY_ADMIN_ACCESS_TOKEN`, used by this new store — apps installed directly from a store's
  own admin don't support OAuth client_credentials) and the older **client_credentials OAuth
  grant** (`SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET`, used by the old store — Partner-managed
  apps). `admin-client.core.ts` in both apps now prefers the static token when present.
- Never hardcode a currency code anywhere in this codebase again — always fetch `shop.currencyCode`
  live or pass it through from a query that already fetches it. The old store was USD, the new one
  is CAD; a future store could be anything.
- **Product page caching**: `getProductByHandle` caches each product for 60s under tag
  `product:<handle>` (`storefront/src/lib/shopify/queries/products.ts`). Products listing pages
  cache for 600s under `products:<subcategory>:<region>:<brand>`; taxonomy tree/mega-menu/brands
  cache for 3600s under `taxonomy-tree`. All are Next.js fetch-level Data Cache (`next: {
  revalidate, tags }`), meant to be invalidated instantly via `revalidateTag()` from the inventory/
  product webhooks — but those webhooks aren't registered yet (see above), so right now an admin
  edit only shows up on the storefront after the revalidate window passes, or after a manual
  `.next` cache clear + restart (which this session had to do repeatedly while testing).
