# Storefront (Customer-Facing App) — Overall Plan

Status: planning — no code written yet.
Companion admin app: `admin-panel/` (Next.js 16, React 19, Tailwind v4, Supabase, Shopify Admin API).
Design source: Figma file `Gemini Distribution` (fileKey `xtrWSXTTvYY0PPol4tbynj`), frame **"Landing Page final"** (node `1113:18` / `1320:49`), branding guide (node `265:47`).
Design tokens already extracted: `design-tokens/color-tokens.css`, `design-tokens/typography-tokens.css`, `design-tokens/color-report.md`, `design-tokens/design-tokens-explained.md`, `design-tokens/spacing-report.md`, `design-tokens/design-tokens.json`.

---

## 1. What this is

A full customer-facing **e-commerce app** (not just a homepage) for Canadian wholesale retailers, backed by the same Shopify store the admin panel manages. Pages seen in the Figma file so far:

- Homepage / Landing Page
- Product Listing Page (category pages)
- Product Detail Page (two variants: V1, v2)
- Cart Page
- Brand Page

## 2. Project setup

- New Next.js app **`storefront/`** at repo root, sibling to `admin-panel/`.
- Same stack as admin-panel for convention consistency: Next.js 16, React 19, Tailwind v4, TypeScript, ESLint.
- Zustand for client state (cart), same as admin-panel.
- Shopify **Storefront API** (public token, client-safe) — separate from admin-panel's **Admin API** token (server-only, private). Never mix the two.

## 3. Design tokens — source of truth decided

Two sources existed (Figma branding guide vs. actual Landing Page frame) and they **do not match**:

| | Brand guide | Landing Page (actual) |
|---|---|---|
| Primary color | `#6A5ACD` (Slate Blue) | `#6b3aac` → `#cc66ff` gradient, `#572f8b` flat panel |
| Dark neutral | `#333333` | `#050505` |
| Font | Denim + Geist Mono | Inter Tight |
| Heading scale | 68/56/48/40px | 49/32/31/28/25/24/20px system |

**Decision: Landing Page (actual) wins as the base for everything — colors, typography, spacing, radius.** The brand guide is not used as source of truth; it was likely made separately from/after the landing page and the two were never reconciled. This was confirmed with a full typography + color audit (font-family/weight/size histogram across all text nodes, resolved fill-color histogram) — the actual page is internally consistent even though it diverges from the guide.

Finalized tokens live in `design-tokens/color-tokens.css` and `design-tokens/typography-tokens.css` (Tailwind v4 `@theme` CSS-first syntax) — import these into `storefront/src/app/globals.css` before base styles. Key facts baked into those files:

- **One accent color system**: gradient `#6b3aac → #cc66ff` at 90°, reused across every CTA button, active state, icon badge, and the logo. No second accent color anywhere.
- **Text is never pure black**: base ink `#050505`, muted via alpha (`ink-50`, `ink-20`, `ink-8`), not separate grays.
- **Borders are never plain gray**: always brand-purple at 10–30% opacity.
- Font: **Inter Tight** everywhere, 4 weights (Regular/Medium/SemiBold/Bold). Two off-system fonts are intentional and scoped: `NCS Radhiumz` (header logo wordmark only), `Denim-TRIAL` (Stock-Up banner glass card only). A third (`Instrument Sans` in footer newsletter placeholder) is a stray paste error — do not propagate.
- Spacing: two independent scales — micro (4/6/8px, icon/pill padding) and macro (50/60/100px, section padding) — not one shared grid.
- Some section colors/radii (sections 3–14) are `approx` (pixel-sampled from a PNG export after the Figma API hit its Starter-plan monthly quota), not exact hex — flagged inline in the token files. Re-verify with the API once quota resets if pixel-perfect precision matters for a specific section.

## 4. Folder structure (feature-based, API separate from UI)

```
storefront/src/
  app/                       → routes only (thin), e.g.:
    page.tsx                 → Home
    (shop)/[category]/page.tsx           → PLP
    (shop)/[category]/[product]/page.tsx → PDP
    (shop)/brand/[slug]/page.tsx         → Brand page
    cart/page.tsx
    layout.tsx                → root layout (Navbar, Footer, fonts, metadataBase)
    loading.tsx / error.tsx   → per-route states
    not-found.tsx
    sitemap.ts / robots.ts    → auto-generated
  features/
    home/
      components/            → HeroSection, CategoryGrid, TrendingProducts, etc.
      api.ts / actions.ts     → data fetching, separate from UI
    products/ | product-detail/ | cart/ | brand/
      (same pattern per page)
  components/
    ui/                       → TRULY shared, page-agnostic primitives:
                                Button, Badge/Pill, Card, Input, Navbar, Footer,
                                SectionHeading, Accordion, ProductCard, StatTile,
                                TestimonialCard, AvatarStack
  lib/
    shopify/                  → Storefront API client
    supabase/                 → if needed for customer accounts
  styles/
    tokens.css                → re-exports design-tokens/*.css
```

**Why `components/ui/` is generic, not homepage-specific**: this is a full e-commerce app. `ProductCard` in particular is used on the homepage's "Trending Products" grid **and** later on the Product Listing Page — it must be props-driven and feature-agnostic from day one, not built as a homepage-only component.

## 5. Reusable base components (build before any section)

- **Button** — primary (gradient CTA), outline/ghost, small nav variant (Login/Register)
- **Badge/Pill** — dark "eyebrow" label, seen 9× across sections (Product Categories, Featured Brands, Benefits, Promotions, Warehouse & Shipping, Testimonials, FAQs, Blog, Contact) — build as ONE reusable component
- **Card** — product card, testimonial card, stat/step card, FAQ item, blog/intel card
- **SectionHeading** — pill label + heading + optional subtext; `level` prop (h1/h2/h3) controls heading tag so hierarchy can't accidentally break
- **Input** — contact form fields, newsletter email field
- **Accordion** — FAQ
- **StatStep** — numbered 01–06 steps
- **AvatarStack + StarRating** — testimonials
- **ProductCard** — shared between Home and PLP (see above)

## 6. SEO strategy

**Heading hierarchy** (never skip a level, exactly one H1 per page):

| Page | H1 | H2 | H3 |
|---|---|---|---|
| Home | Hero headline | Section headings (8 total) | Category names, FAQ questions, step titles |
| PLP | Category name (keyword-rich, not generic "Products") | Filter/sort label | — (product titles are not headings) |
| PDP | Product name | Description / Specifications / Reviews / Related Products | Spec sub-groups |
| Cart | "Your Cart" | "Order Summary" | — |
| Brand | Brand name | "About [Brand]" / "Products from [Brand]" | — |

**Semantic HTML**: `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<footer>` — no div-soup. Landmark `aria-label`s on major sections.

**Next.js SEO plumbing**:
- `generateMetadata()` async per route (dynamic title/description from Shopify data)
- `metadataBase` in root layout (absolute URLs for OG images)
- JSON-LD structured data: Product schema (price/availability/rating) on PDP, BreadcrumbList everywhere, Organization schema site-wide
- Clean slug-based URLs (`/vape/rocky-vapor-odder`), no query-string-only product URLs
- Internal linking: breadcrumbs, related products, category cross-links — all crawlable `<Link>`s
- Descriptive `alt` text (empty for decorative images)

## 7. Next.js technical checklist

1. **Rendering per page**: Home = SSG+ISR · PLP = ISR with tag-based revalidation · PDP = ISR + `generateStaticParams` for top products · Cart = client/dynamic · Brand = ISR
2. **Data fetching**: Server Components by default; `fetch()` with `next: { revalidate, tags }`; Shopify webhook → `revalidateTag()` (reuse admin-panel's existing webhook pattern). Client Components only for interactivity (cart drawer, filters, accordions, add-to-cart).
3. **Images**: `next/image` everywhere; whitelist `cdn.shopify.com` in `next.config.js` `images.remotePatterns`; `priority` on the LCP/hero image only; explicit `sizes` for responsive images; everything else lazy.
4. **Fonts**: `next/font` for Inter Tight — self-hosted, zero layout shift.
5. **State**: Zustand for cart (persist to localStorage) + Shopify Cart API sync; filters/sort/pagination driven by URL `searchParams` (shareable, crawlable — not client-only state).
6. **Performance targets**: LCP < 2.5s, CLS ~0, INP < 200ms. Lazy-load heavy client components (carousels, maps) via `dynamic(..., { ssr: false })`. Third-party scripts via `next/script` (`afterInteractive`/`lazyOnload`).
7. **Error/edge states**: `loading.tsx` skeletons per route, `error.tsx` fallbacks, empty-cart/no-results states.
8. **Accessibility**: keyboard-navigable nav, visible focus states, `aria-label` on icon-only buttons, contrast check on purple-on-white text.
9. **Env**: Shopify Storefront API token (public) kept separate from admin-panel's Admin API token (private/server-only).
10. **Deployment**: Vercel preferred for ISR/ on-demand revalidation support (or same platform as admin-panel, TBD).
11. **Responsive layout technique**: default to **Flexbox/Grid** for every layout (Tailwind's `flex`/`grid` utilities) — try to express each section's responsive behavior with these first. Only fall back to another technique (absolute positioning, custom media-query CSS, container queries, etc.) if Flexbox/Grid genuinely can't express the layout. Breakpoints follow Tailwind's defaults (`sm/md/lg/xl`) unless a section needs a custom one.
12. **Typography units**: `typography-tokens.css` already uses `rem` (not fixed `px`) for every font-size token — keep it that way so a user's browser font-size setting is respected and responsive scaling works correctly. Where a heading needs to visibly shrink/grow between breakpoints (not just via Tailwind's `sm:text-*` variants), consider `clamp()` for fluid scaling instead of hardcoding a separate px value per breakpoint.

## 8. Homepage — 14 sections (top to bottom, Landing Page final / node 1113:18)

1. Header/Navbar — top bar (`#050505`) + nav + hero gradient banner
2. Divider (gradient glow band)
3. Hero section — pattern + glassmorphism, main hero content
4. Section (content TBD on deep-dive)
5. Purple card section — solid `#572F8B` ("Margin-building programs")
6. Row section — "Open wholesale account" 6-step stats
7. Image/banner block — "Stock Up on What Sells"
8. Center-aligned section — Canada warehouse map
9. Purple-tinted section (`#F1ECF7`) — Testimonials
10. Row section — FAQ accordion
11. Gradient section — Trust badges strip
12. Section — Wholesale intelligence / blog cards
13. Section — Contact form
14. Big CTA/footer — "Gemini Distribution" watermark heading + footer links

*(Exact section-by-section content/copy to be confirmed per-section during build — see workflow below.)*

## 9. Working workflow (agreed)

Three levels, in order, every time:

1. **Overall plan** (this document) — done once.
2. **Page-level plan** — per page (Home, PLP, PDP, Cart, Brand): section list + which shared components apply + page-level SEO (H1, metadata).
3. **User walkthrough** — before each section is planned, the user explains that section first (what it contains, how it should behave) so the plan is grounded in their intent, not just a guess from the screenshot/Figma data.
4. **Section-level plan** — per section, before writing any code, covering:
   - Structure (HTML tags, heading level)
   - Reused components vs. new component needed
   - Design tokens applied (no hardcoded values)
   - Data source (static vs. Shopify-fetched, and from where)
   - Images (priority/LCP vs. lazy, alt text)
   - Responsive behavior (mobile/tablet/desktop) — Flexbox/Grid first (see §7.11), other techniques only as fallback
   - Accessibility notes
   - Interactivity (client component needed? why?)
   - Edge cases (empty/loading/error states)

Each section plan is reviewed/approved before code is written.

## 10. Open questions (not yet decided)

- Customer auth/login flow (guest checkout vs. account-required for wholesale accounts)
- Multi-currency support
- Hosting/deployment platform (confirm same as admin-panel or different)
- Full copy/content audit for sections 4, 8, 9 (not yet deep-dived section by section)
