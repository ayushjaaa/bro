nn  # Full Build Plan — Architecture, SEO, Speed, Security, Auth, Edge Cases

Consolidates [DECISIONS.md](DECISIONS.md) (items 1–12) and [ADMIN_PANEL.md](ADMIN_PANEL.md) into one
buildable plan, researched against 2026 Shopify + Next.js headless best practices. This is the
"Next Step" referenced at the bottom of DECISIONS.md.

---

## 1. Architecture Overview

```
┌─────────────────────────┐        ┌──────────────────────────┐
│   Guest browsing         │        │   Logged-in + approved    │
│   (public catalog data)  │        │   customer (price)        │
└───────────┬──────────────┘        └────────────┬───────────────┘
            │                                     │
            ▼                                     ▼
  Next.js SERVER ─── Shopify Storefront API   Next.js SERVER ROUTE (ours)
  (build-time / ISR, direct,                  ── Shopify Admin API
   public-safe token)                         (secret token, never
            │                                  reaches the browser)
            ▼                                     │
    Static/cached HTML                            ▼
    (name, images,                       tag check → price fetch
     description, flavor-                → returned to client
     switcher list)
```

Two clearly separate data paths, matching [DECISIONS.md item 12](DECISIONS.md):
- **Public catalog data** (name/images/description/flavor-switcher list) — Storefront API,
  called server-side at build/ISR-refresh time, never per-request from the browser. Token is
  public-safe by design but still never shipped to client code needlessly.
- **Price + approval status** — Admin API, called only from our own server route (Route
  Handler / Server Action), token lives in server env vars only, `import 'server-only'` guard at
  the top of that data-layer file so it can never accidentally end up in a Client Component
  bundle.

---

## 2. SEO Strategy

- Each flavor = its own statically-generated page under `/products/[flavor-slug]` (per
  [DECISIONS.md item 1](DECISIONS.md)) — own indexable URL, own metadata.
- **Canonical tags:** Shopify generates both `/products/...` and `/collections/.../products/...`
  paths for the same product — always set canonical to the `/products/` URL to avoid duplicate
  content penalties in Google.
- **Per-page metadata** via Next.js Metadata API — title, description, Open Graph image
  generated server-side per flavor from its own name/description/image (not shared boilerplate).
- **JSON-LD structured data** — `Product` schema per flavor page (price, availability, rating if
  reviews exist), `BreadcrumbList` reflecting the Category → Sub-category → Brand → Product Line
  chain (ties directly to [DECISIONS.md item 2](DECISIONS.md) taxonomy). Only mark up what's
  actually visible on the page — mismatched JSON-LD forfeits rich-result eligibility.
- **Sitemap** — auto-generated, published flavors only, respects `lastmod`, regenerates when
  products are added/edited via the admin panel.
- **Age-verification gate (item 8) must not block crawlers** — the gate should be a client-side
  interstitial, not something that prevents Googlebot from seeing page content server-side.

## 3. Speed / Performance

Full detail already locked in [DECISIONS.md item 11](DECISIONS.md):
- Static pre-rendering (`generateStaticParams`) + ISR for catalog/listing pages.
- **ISR interval — corrected (verified 2026-08-20):** official Next.js docs do not endorse a
  short fixed window like 10–30s; the documented guidance is the opposite instinct — "set a high
  revalidation time (e.g. 1 hour instead of 1 second); if you need more precision, use on-demand
  revalidation; if you need real-time data, use dynamic rendering." So: catalog/listing pages get
  a long `revalidate` (e.g. 1 hour+), and **price/stock freshness is handled by on-demand
  revalidation** (`revalidateTag`/`revalidatePath`, triggered right when the owner edits a
  product or price in the admin panel) rather than a short timed poke. Note the current API
  requires `revalidateTag(tag, 'max')` — the old single-argument form is deprecated.
  **Caveat:** on-demand revalidation only invalidates the instance that receives the call — a
  multi-region/multi-instance deploy needs a shared custom cache handler for this to propagate
  everywhere, otherwise some regions keep serving stale data after a revalidation call.
- Debounced hover-intent prefetch (~150–200ms) on the flavor-switcher, implemented as
  `prefetch={false}` on `<Link>` plus a manual `router.prefetch(href)` call (from
  `next/navigation`) on the debounced hover handler — not blanket viewport-prefetch, to avoid
  load spikes on 100+-flavor lines.
- One Storefront API query per Product Line for the switcher list, never one per flavor.
- Pagination/virtualization once a line exceeds ~30 flavors.
- React Server Components + `next/image` to minimize client JS and optimize the 4 images/flavor.
  **Correction (verified 2026-08-20):** the `priority` prop is deprecated as of Next.js 16 in
  favor of a new `preload` prop (with `loading="eager"`/`fetchPriority="high"`) — use `preload`
  for above-the-fold flavor images, not `priority`.
- Price fetch (item 4 below) is a small isolated fragment, fetched only for the flavor currently
  being viewed by an approved customer — never bulk-fetched.

## 4. Security

- **Admin API token** — env var, server-only, never in a Client Component or exposed API
  response. Rotate quarterly. Request only the scopes actually needed (Draft Order create/edit,
  product read) — least privilege.
- **Supabase Service Role key** — same rule as the Admin API token: server-only, never shipped to
  the browser. It bypasses Row Level Security, so a leak is equivalent to a full data breach.
- **Row Level Security (RLS)** — every Supabase table (customers, account_type, approval status)
  needs policies so a customer can only read/write their own row, enforced at the database level
  (not just in application code).
- **Every server route re-verifies identity** — even though a logged-in check happens earlier in
  the request (e.g. layout-level), the price-fetch route itself must independently query Supabase
  for the customer's account_type + approval status server-side before returning a price. Never
  trust a client-supplied "I'm approved" flag, and never trust a cached JWT claim alone for this
  specific check (see JWT staleness below).
- **JWT staleness** — account_type/approval can be cached in the Supabase JWT (`app_metadata`) for
  speed elsewhere, but it won't reflect an owner's just-made approval change until the token
  refreshes. Price-gating must re-verify against the Supabase database directly, not the JWT.
- **Supabase session-token handling (researched against official docs, 2026-08-21):**
  - **`middleware.ts` is mandatory, not optional** — it must run on every request, refreshing the
    session via `getClaims()` and writing refreshed cookies to both the request (so Server
    Components see fresh state) and the response (so the browser gets the new token). Skipping
    this is the #1 cause of random/unexplained logouts in Next.js + Supabase apps. Never call
    `getSession()` server-side for anything trust-sensitive — it doesn't revalidate; use
    `getClaims()`/`getUser()` instead.
  - **Cookies are NOT httpOnly by default with `@supabase/ssr`** — this is a real gotcha, not an
    edge case: the browser client needs to read the token too, so `@supabase/ssr` cookies are
    readable by client-side JS by design, meaning an XSS bug can still exfiltrate a session token
    even though we're using cookie-based (not localStorage-based) storage. `Secure` and
    `SameSite=Lax` must be explicitly configured for production — they are not automatic.
    Mitigation is standard XSS hardening (CSP, input sanitization), not cookie flags alone.
  - **Refresh-token rotation + reuse detection is built in and doesn't need our own code** — every
    refresh issues a new token pair and invalidates the old one (10-second grace window for
    SSR race conditions); replaying an already-used refresh token outside that window causes
    Supabase to terminate the entire session as a compromise signal.
  - **No IP/device binding is built in** — if the business ever wants "flag login from a new
    device/location," that's app-level logic we'd have to build ourselves (e.g. logging
    device/IP at session creation and diffing later); Supabase's docs don't offer this natively.
  - **Force-revocation caveat — directly relevant to our price-gating design:**
    `supabase.auth.admin.signOut(userId, 'global')` invalidates the refresh token/session record,
    but an already-issued, unexpired **access token keeps working for up to its remaining
    lifetime (≤1 hour)** unless something explicitly checks session freshness — JWT verification
    is a local signature check, not a live lookup. Our price-fetch route already re-verifies
    approval status directly against Supabase on every call (this section, above) rather than
    trusting the JWT, which happens to already cover most of this risk — but if the owner needs to
    revoke a customer immediately (e.g. suspected fraud), that route should also confirm the
    session is still valid in `auth.sessions`, not just that `approved = true` in our own table,
    or a revoked-but-not-yet-expired token could still resolve a price for up to an hour.
  - **ISR/caching interaction — real risk given our architecture leans heavily on ISR (§3):**
    official docs warn that `Set-Cookie` responses from a refreshed session must never be cached by
    a CDN/ISR layer — doing so can leak one customer's session to another. The `@supabase/ssr`
    library forwards `Cache-Control`/`Expires`/`Pragma` headers on auth-related responses; these
    must be respected (not overridden) wherever our own caching/ISR config touches auth routes.
- **Webhook verification** — any Shopify webhooks the admin panel or storefront consume (e.g.
  inventory updates) must be verified via HMAC-SHA256 (header `X-Shopify-Hmac-Sha256`) before
  being acted on.
- **Webhook delivery is at-least-once, unordered** (verified against official docs, 2026-08-20) —
  Shopify retries a failed webhook up to 8 times over ~4 hours, and duplicates can arrive; there is
  no ordering guarantee between events. Dedupe using the `X-Shopify-Webhook-Id` header, and
  sequence by `updated_at`/`X-Shopify-Triggered-At`, not arrival order — relevant to
  `inventory_levels/update` (item 17 waitlist) and any `orders/create` handler.
- **Expiring tokens — corrected (verified 2026-08-20):** this requirement applies only to **public
  apps**, not custom apps. Since our Admin API access is a **custom app built via Shopify's Dev
  Dashboard with Custom distribution** (see §7 step 0 below), it is exempt from the
  expiring-token policy — official docs state "these requirements don't apply to custom apps or
  apps created by merchants." Still worth reconfirming this exemption at setup time, since the
  Dev Dashboard flow is new (replaced the old Partner Dashboard custom-app creation as of Jan 1,
  2026) and hasn't been independently reconfirmed post-migration.
- **Custom app creation has moved (verified 2026-08-20):** Shopify no longer allows creating new
  custom apps via the old Shopify Admin → "Develop apps" flow as of Jan 1, 2026 (existing apps
  unaffected). New setup must go through the **Dev Dashboard**, using **Custom distribution** to
  install our single-store integration. This changes step 1 of the build order below.
- **Draft Order `tags` field is a full overwrite, not additive** (verified 2026-08-20) — calling
  `draftOrderCreate`/`draftOrderUpdate` with `tags` replaces the entire tag set rather than
  appending. If the owner's approval workflow ever adds a tag after creation (e.g. an "approved"
  tag), the code must read the existing tags first and merge, not blindly set a new array — same
  caution applies to Customer tags (item 13/14's account_type tagging).
- **Draft Orders auto-purge after 1 year of inactivity** (verified 2026-08-20) — any Draft Order
  left un-invoiced/un-paid for a year is deleted by Shopify. Doesn't block the build, but means
  Draft Orders can't be treated as a permanent audit trail — if long-term order-history reporting
  matters, completed orders (post-payment) are fine since they convert to real Orders, but stale
  pending drafts are not durable storage.
- **`read_orders` scope only covers 60 days of order history** (verified 2026-08-20) — anything
  older requires the protected `read_all_orders` scope, which needs separate Shopify approval
  (not just an app-scope checkbox). Only matters if a future reporting feature needs lookback
  beyond 60 days.

## 5. Registration / Login Flow — Supabase (per DECISIONS.md items 21 & 22; supersedes the
   Shopify Customer Account API approach originally in item 12/20)

Registration is a **request**, not an instant account — no working login exists until the owner
approves it (item 22).

1. Visitor fills the "Register" form, choosing **Wholesaler** or **Retailer**. This does **not**
   call Supabase Auth or Shopify yet — it writes a pending-request row to a Supabase table
   (name, email, business info, requested account type, status: `pending`).
2. Visitor sees a guest-equivalent experience (item 20/22): full browsing, no price, no cart —
   plus an "application under review" indicator in the account area.
3. Owner reviews the request in the admin panel. **Approve:** server calls the Shopify Admin API
   to find-or-create the customer, tags it (`wholesale`/`retail`, `approved: true`), links the
   Shopify customer ID back onto the Supabase row, and flips the row to `approved`. **Reject:**
   row marked `rejected`, no Shopify account created — no reason-capture/re-apply flow yet
   (**V2 Phase**).
4. On approval, the user is emailed that they can now log in. **Login (Supabase Auth, e.g. Google
   OAuth) only succeeds meaningfully from this point** — before approval there's no approved
   Supabase/Shopify-linked record for the session to resolve against, so the app treats any
   pre-approval auth attempt as the same guest-equivalent state from step 2 (see §4's stale-JWT
   handling — never trust a client-side "I'm approved" claim).
5. Once logged in and approved, the price fragment (flavor page) calls our server route → route
   queries Supabase for account_type + approval status → returns the resolved price (item 13).
6. Order → Draft Order (item 19) → owner reviews/edits → sends invoice or marks paid →
   confirmation email on completion.
7. **Region:** provision the Supabase project in a region appropriate for a Saskatchewan-based
   business, per PIPEDA considerations (item 15).

## 6. Edge Cases to Plan For

| Case | Handling |
|---|---|
| Customer logs in but is still "pending approval" | Show price placeholder + pending message, not an error; re-check on next visit (tag may have changed). |
| Flavor deleted/discontinued but still indexed by Google | Serve a proper 404/410, add a "similar flavors in this line" block instead of a dead end. |
| Price/stock changes between ISR refresh windows | Handled via on-demand revalidation on admin edit (§3, corrected 2026-08-20), not a short timed window; cart/checkout step re-validates live via Shopify checkout itself, which is always authoritative. |
| Guest adds to cart, then logs in mid-session | Cart must persist across the auth redirect (Shopify cart ID in a cookie, not lost on OAuth round-trip). |
| A Product Line has 0 flavors temporarily (all out of stock) | Switcher list should show "out of stock" flavors greyed out, not hide the whole line/page. |
| Session token expires while user is deep in a flavor page | Price fragment fails gracefully (shows "log in again" inline), rest of page (static) unaffected. |
| New taxonomy entry (Category/Brand) added mid-day via Shopify admin (item 3) | ISR revalidation window must cover navigation/taxonomy data too, not just product price/stock, or new entries won't appear promptly. |
| Bulk-add (ADMIN_PANEL.md section 2) creates 50 products at once | Trigger on-demand ISR revalidation for the affected Product Line page after bulk creation, don't wait for the timed window. |
| Age-gate + SEO conflict (item 8) | Age gate must be client-side only; server-rendered content stays crawlable. |

## 7. Step-by-Step Build Order

1. **✅ DONE (2026-08-21) — Shopify custom app setup** — created via **Dev Dashboard** ("Start
   from Dev Dashboard," not CLI scaffolding) on a free Partner **development store**
   (`jubilee-test-dev.myshopify.com`), not yet on the client's real "Gemini Distribution" store
   (per sequencing note: build/test on dev store first, repeat setup on client's store once
   verified working). **Correction discovered during execution:** this app flow does **not** issue
   a static `shpat_...` Admin API access token. Instead it gives a **Client ID + Client Secret**,
   exchanged for a short-lived (24h) access token via the **client credentials grant**
   (`POST https://{shop}.myshopify.com/admin/oauth/access_token`, works because the app and store
   share the same org) — implemented with caching + auto-refresh in
   `admin-panel/src/lib/shopify/admin-client.core.ts`. 14 scopes configured (metaobject
   definitions/entries, files, products, customers, draft orders, orders-read) covering V1.1
   through V1.5's known needs in one setup pass.
2. **✅ DONE (2026-08-21) — Shopify foundation** — 4 metaobject definitions created
   (Category/Sub-category/Brand/Product Line, exact field spec per item 3) via an idempotent
   script (`admin-panel/scripts/shopify/create-metaobject-definitions.ts`, run via
   `npm run shopify:create-metaobject-definitions`) — verified idempotent (safe re-run, no
   duplicates) and type/lint-clean. Store plan confirmed Basic (matches item 12's assumption).
   **Also added (gap found during manual seed-testing):** a Product metafield definition
   (`taxonomy.product_line`, `metaobject_reference` -> Product Line) via
   `admin-panel/scripts/shopify/create-product-line-metafield.ts` /
   `npm run shopify:create-product-line-metafield` — without this, a Shopify Product (flavor,
   item 1) has no field to link to the taxonomy chain at all, even manually in Shopify Admin.
   Verified idempotent.
3. **✅ DONE (2026-08-21) — Taxonomy seed data** — first real Category → Sub-category → Brand →
   Product Line chain added manually via Shopify Admin → Content → Metaobjects (per item 3's
   "ongoing, no-developer-needed" workflow) — confirmed each reference dropdown correctly resolved
   the entry created one level down, validating the model end-to-end.
4. **Storefront read path** — Next.js + Storefront API, static generation for a handful of real
   flavor products, confirm SEO metadata/canonical/JSON-LD render correctly.
5. **Flavor-switcher UI** — wire the existing prototype (`script.js`/`index.html` patterns) into
   the Next.js product page, backed by the single Product-Line query (item 3 above).
6. **Performance pass** — long-interval ISR + on-demand revalidation (corrected, §3 above),
   hover-intent prefetch, pagination for large lines; verify with Lighthouse/Core Web Vitals
   against a seeded Product Line with 100+ flavors.
7. **Supabase foundation** (per item 21) — project provisioned (`ca-central-1` region), customer
   table + RLS policies designed, Supabase Auth (Google OAuth, via `@supabase/ssr`) wired into
   Next.js, cart persistence across login.
8. **Shopify ↔ Supabase customer bridge** — find-or-create linked Shopify customer on
   signup/first login, store the Shopify customer ID on the Supabase row (BUILD_PLAN §5 step 3).
9. **Price-gate server route** — Supabase account_type/approval check + Shopify price fetch,
   wired to the price fragment on flavor pages.
10. **Admin panel v1** — single flavor add form (ADMIN_PANEL.md §1), taxonomy dropdowns.
11. **Admin panel v2** — bulk mini-list add (ADMIN_PANEL.md §2, corrected 2026-08-20: use
    `bulkOperationRunMutation` for the 50-product bulk-add rather than looping single
    `productCreate` calls — it bypasses standard rate limits and runs async with a pollable
    status), hierarchy tree + search + counts dashboard (ADMIN_PANEL.md §3), customer approval
    screen (toggles Supabase approval status + account type, item 14).
12. **Draft Order flow** (item 19) — cart submit → server reads Supabase account_type → creates
    Shopify Draft Order via Admin API (`draftOrderCreate`) with resolved price + Retail/Wholesale
    tag; read-modify-write on `tags` if updating an existing draft (§4 caution above).
13. **Sentry** (item 7) wired into both storefront and admin panel.
14. **Age verification** (item 8) as a client-side gate, non-blocking for SEO crawlers.
15. **Sanity CMS** (item 9) — content-only sections (blog/banners/landing pages) layered in,
    independent of the commerce build above.

**— V1 ends here. Everything below is V2 Phase —**

16. **PostHog** (item 15) — customer activity tracking, added after V1 is working.
17. **Abandoned-cart automatic email** (item 16) — 1-week idle-cart reminder via Resend.
18. **Supabase Realtime** (item 21) — live order-status updates on the customer's Orders page
    (mind the DELETE-event RLS gap noted in item 21).
19. **Registration-reject detail** (item 22) — reason-capture, re-apply flow.
20. **Cart login-prompt UI/UX polish** (item 20) — exact behavior of the "log in to add to cart"
    prompt, refined once the V1 cart page is in use.

## Status

Drafted 2026-08-19, revised 2026-08-20 for the Supabase auth switch (item 21). Revised again
2026-08-20 after a documentation-verification pass against official Shopify (shopify.dev), Next.js
(nextjs.org/docs), and Supabase (supabase.com/docs) docs — corrections applied throughout (Dev
Dashboard app creation, ISR strategy, `customAttributes` naming, tag-overwrite behavior, token
exemption, PIPEDA caveat, Realtime RLS gap). Not yet built — this is the reference plan to execute
against.

Sources:
- [Shopify API authentication](https://shopify.dev/docs/api/usage/authentication)
- [Headless Shopify with Next.js: Complete Build Guide 2026](https://samcheek.com/blog/headless-shopify-nextjs-complete-build-guide-2026)
- [How to Fetch and Update Customer Data in Shopify Headless with Next.js 15](https://www.buildwithmatija.com/blog/fetch-update-shopify-customer-data-nextjs)
- [Next.js 15 SEO: Complete Guide to Metadata & Optimization](https://www.digitalapplied.com/blog/nextjs-seo-guide)
- [Headless CMS SEO in 2026: Technical Checklist](https://elmapicms.com/blog/headless-cms-seo-technical-checklist-2026)
- [Shopify Customer Accounts API: Passwordless in Production (2026)](https://no7software.co.uk/blog/shopify-customer-accounts-api-passwordless)
- [How to Add Shopify Authentication to a Headless Storefront Using the Customer Account API](https://www.buildwithmatija.com/blog/shopify-customer-account-api-headless-authentication)
