# Gemini Distribution — Spacing, Layout & Radius Extraction

**Source note:** all spacing/layout values below come from the exact x/y/width/height coordinates in the Figma layer tree (pulled via API before the Starter-plan quota ran out, saved as `metadata.xml`), so these are **ground-truth exact**, not screenshot approximations. Border-radius values for sections 1-2 are also exact (recovered from earlier `get_design_context` code output, which included literal `rounded-[Npx]` values). Border-radius for sections 3-14 is **approx** (visual read from screenshots — corner radius isn't exposed in plain layer metadata).

One structural note: the "Contact" and "Footer" sections appear to share a layer tree in the file (the deeply-nested content that visually renders as the footer sits inside the Contact frame's subtree, while the top-level "Background Image" node at y=12035 is just a decorative background rectangle with no children of its own). Footer spacing below is therefore approximated from the screenshot rather than the metadata tree.

---

## Part 0 — Layout Primitives (exact)

| Primitive | Value | Notes |
|---|---|---|
| Page width | 1440px | Root frame width |
| Standard content max-width | 1240px | `(1440 - 2 × 100)` — used in 9 of 14 sections |
| Standard horizontal margin | 100px each side | Confirmed in Header, Featured Products, Best Sellers, Benefits, Stock Up Banner, Warehouse, Testimonials, FAQs, Blog, Contact |
| Standard section vertical padding | 50px top + 50px bottom | Same 9 sections as above |
| Header-block-to-content gap | 60px | Gap between the eyebrow+H1+subhead block (always exactly 244px tall) and the first content row below it — consistent across Best Sellers, Blog, Contact, and others that use this header pattern |
| Standard grid column gap | 32px (33px in one instance, rounding) | Best Sellers product grid, Blog card grid, Benefits card row, Contact form-vs-info-column gap |
| Certifications grid gap | 20px | Narrower than the standard 32px — the only grid on the page using this value |
| Info-card vertical stack gap | 24px | Contact page's 3 stacked info cards (Address/Call Us/Email Us) |
| Card internal padding (large cards) | 24px | Benefits cards: content inset 24px from all 4 edges of a 285×289 card |
| Card internal padding (form/panel) | 32px | Contact form panel: content inset 32px from all edges |
| Card internal padding (small/tab-pill) | 6-8px | Tab-pill containers (Best Sellers tabs: 8px; Blog/Contact eyebrow-pill inner frame: 6px) |
| Icon padding inside a 28px icon box | 4px | 20px icon centered in a 28×24 box |

**On a base unit:** there isn't one single grid the whole page snaps to. Component-level spacing (icon padding, pill insets, card padding) clusters tightly around a **4px increment** (4, 6, 8, 20, 24, 32px), while section-level macro spacing uses **round decade values** (50px, 60px, 100px) that aren't multiples of 8 — these look like independent, deliberately chosen "big" numbers rather than an extension of the 4px micro-grid. Treat them as two separate scales.

### Recommended spacing token scale
| Token | Value | Used for |
|---|---|---|
| `space-3xs` | 4px | Icon-in-box padding |
| `space-2xs` | 6px | Blog/Contact eyebrow-pill inner inset |
| `space-xs` | 8px | Tab-pill container inset |
| `space-sm` | 20px | Certifications grid gap; card image-to-text gap (Best Sellers card) |
| `space-md` | 24px | Benefits card padding; info-card vertical stack gap |
| `space-lg` | 32px | Standard grid column gap; form-panel padding |
| `space-xl` | 50px | Section top/bottom padding (most sections) |
| `space-2xl` | 60px | Header-block-to-content gap; Certifications section padding |
| `space-3xl` | 100px | Page horizontal margin (content max-width inset) |

---

## Part 1 — Border-Radius Tokens

| Token | Value | Precision | Used on |
|---|---|---|---|
| `radius-pill` / `radius-full` | 50px–99px (fully rounded per element height) | Exact (sec 1-2) | Every button and pill badge: hero CTA (50px), secondary "Log in" button (69px), carousel progress track segments (99px), all eyebrow pills across every section (approx-confirmed same fully-rounded treatment) |
| `radius-circle` | 41.4px (= half of a 82.8px diameter circle) | Exact | Carousel arrow buttons — fully circular |
| `radius-xl` | 60px | Exact | Hero background panel |
| `radius-lg` | ~40px | Approx | Large banner panels: Promotions panel, Stock Up Banner |
| `radius-md` | ~20px | Exact (hero image), approx (rest) | Hero banner image (exact, 20px); approx-matches product card images, blog card images, testimonial cards, benefit cards |
| `radius-sm` | ~12-16px | Approx | Contact form input fields, smaller UI chrome |
| `radius-none` | 0px | — | Full-bleed section backgrounds (map illustration, banner photography) sit flush with no radius at the section's own edges — radius is applied to inner content panels, not the section shell |

---

## Part 2 — Section-by-Section Layout Detail

### 1. Header + Hero — `1113:449` (exact)
- Full-width header bar (1440px), no side margin, height 54px.
- Utility strip above it, full-width, height 106px total (54+... nested).
- Hero content block starts at y=160, full remaining height 672px — hero content itself uses its own internal padding (not captured at this depth) rather than the standard 100/50 pattern, since it's a custom asymmetric layout (text left, image right).
- Hero panel radius: 60px (exact).
- Primary button radius: 50px (exact, pill). Secondary button radius: 69px (exact, pill). Carousel arrows: 41.4px radius (exact circle). Progress track segments: 99px radius (exact pill).

### 2. Brand/Logo Strip — `1113:169` (exact)
- Single full-bleed content child, no visible inner margin captured at this depth (logo tiles arranged in a row spanning the section) — content effectively fills the section width edge-to-edge with the glow-band background showing through.

### 3. Featured Products Rail — `1137:2639` (exact)
- Standard 100px/50px margin+padding on the primary content frame ("Frame 98": x=100, y=50, w=1240, h=1192).
- Contains a full-bleed glassmorphism decorative layer positioned with negative offsets (x=-357, y=-758) that intentionally overflows the section bounds — this is a background blur effect extending past the visible frame, not a layout error.

### 4. Best Sellers Grid — `1113:19` (exact)
- Standard 100px/50px margin+padding.
- Header block (eyebrow+H1+subhead): exactly 244px tall.
- Gap from header block to product grid: 60px.
- Product grid: 3 columns × 2 rows, each card 392px wide, **32px column gap** (392×3 + 32×2 = 1240, exactly filling the content width — confirms 32px is the deliberate gap, not a rounding artifact).
- Row gap (row 1 to row 2): 50px.
- Gap from row 2 to "Browse full catalog" button: 50px.
- Card internal layout: image block 360px tall, text block starts at y=380 — a 20px gap between image and text within each card.

### 5. Promotions / Margin-Building Panel — `1113:578` (exact)
- This section uses a **different margin**: 50px on all sides (not the standard 100px sides), because the whole section is itself a large rounded card inset from the page edges rather than a flush full-width band — content width becomes 1340px (1440 − 2×50) instead of 1240px.
- The 4 sub-cards (Bulk Discounts, VIP Pricing, Seasonal Promotions, Free Shipping) sit in a 2×2 grid inside this wider panel.

### 6. Benefits — `1113:1200` (exact)
- Standard 100px/50px margin+padding.
- Header block 289px tall (taller than the 244px pattern elsewhere, because the "Exclusive Wholesale Pricing" 01-card sits alongside the heading in this section instead of below it).
- Row 2 (four cards) starts 32px below the header row.
- 4 cards, 285px wide each, **32-33px gap** between them (four cards × 285 + 3 gaps × ~32 ≈ 1240).
- Card internal padding: 24px on all sides (content inset 24,24 within a 285×289 card, right/bottom edges land exactly 24px from the card boundary — fully symmetric).

### 7. Stock Up Banner — `1113:1145` (exact for outer padding, approx for inner glass-card layout)
- Standard 100px/50px margin+padding for the overall banner panel.
- Inner "Wholesale Benefits" glass card layout (icon-to-text gaps, internal list spacing) not resolved at this depth — approximate from the screenshot as ~16-20px internal padding, ~12px between list items.

### 8. Warehouse & Shipping — `1113:1244` (exact outer, approx inner)
- Standard 100px/50px margin+padding.
- Map illustration panel and the 4-feature row below it split the remaining vertical space; exact internal gap between map and feature row not resolved at this depth — approx ~40-50px from the screenshot.

### 9. Testimonials — `1113:1330` (exact outer, approx inner)
- Standard 100px/50px margin+padding.
- 3-card row (2 side cards + 1 featured center card) — approx grid gap ~24-32px from the screenshot, consistent with the page's standard grid gap.

### 10. FAQs — `1113:194` (exact outer, approx inner)
- Standard 100px/50px margin+padding.
- 5 accordion rows stacked vertically — approx **12px gap** between rows from the screenshot (tighter than the page's standard 20-32px grid gaps, appropriate for a list rather than a card grid).

### 11. Certifications & Trust — `1113:258` (exact)
- Margin 100px sides, but **60px top/bottom** padding (not the standard 50px) — the only section besides Promotions to deviate from the standard vertical padding.
- Header label sits 72px above the card row (a unique gap value, not matching the 60px header-to-content gap used elsewhere).
- 5 cards, 310px wide each, **20px gap** between them — this is the narrowest grid gap on the page (vs. 32px everywhere else). The first card is offset to x=-195 (partially bleeding off the left edge of its container), meaning this row is designed to visually overflow/crop at the edges rather than center perfectly — matches the screenshot, which shows the leftmost card's label cut off ("...sed Business").
- Card internal padding: 32px (icon and title both inset 32px from the card edges, consistent inner padding despite the tighter 20px outer grid gap).

### 12. Blog — `1113:311` (exact)
- Standard 100px/50px margin+padding.
- Header block: 244px tall, standard 60px gap to content below.
- 3-card row, 392px wide each, **32px gap** (matches Best Sellers' product grid exactly).
- Card structure: a 6px outer inset frame wrapping an inner content block (392×538 card → inner content 380×512, positioned at 6,6) — right/left/top inset is 6px, but bottom inset works out to 20px, so the card "frame" is deliberately tighter on 3 sides and looser at the bottom (room for the "read more" arrow button to sit close to the card edge without touching it).

### 13. Contact — `1113:372` (exact)
- Standard 100px/50px margin+padding.
- Header block: 244px tall, 60px gap to content below.
- Two-column layout: form panel (865px wide) + info-card column (343px wide), **32px gap** between them (865 + 32 + 343 = 1240, exact fit).
- Form inner padding: 32px on all sides (content inset 32,32 within the 865×578 panel, matching exactly on the right and bottom edges too).
- 3 stacked info cards, each 186px tall, **24px gap** between them.

### 14. Footer — `1113:1475` (approx — see structural note above)
- Approx from the screenshot: outer section padding roughly 50-60px top, more generous bottom padding for the legal bar.
- Standard-looking 1240px content column, consistent with the rest of the page.
- Newsletter input-to-button layout: the pill container appears to have ~8-10px internal padding around the input field and button.
- Footer column grid (Categories/Brands/Quick Links/Wholesale): approx 60-80px horizontal gap between columns, ~12-16px vertical gap between links within a column.

---

## Flags for design review (layout-specific)
1. **Two macro-spacing exceptions**: Promotions Panel uses 50px side margins (vs. the page's standard 100px) and Certifications uses 60px top/bottom padding (vs. the standard 50px). Both may be intentional (different visual weight for a "statement" panel and a compact trust-strip), but worth confirming they're deliberate rather than drift.
2. **Certifications' 20px grid gap** is notably tighter than the 32px gap used everywhere else on the page, and its first card intentionally bleeds off the left edge — confirm this crop/overflow treatment is intentional design (e.g., implying "scroll for more") and not a missed centering fix.
3. **Contact/Footer share one layer subtree** in the Figma file rather than being cleanly separated top-level frames — worth flagging to whoever maintains the Figma file, since it makes future edits to either section riskier (moving one can unintentionally affect the other).
