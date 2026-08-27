# Gemini Distribution — Color, Gradient & Effect Extraction (COMPLETE)

**Precision note:** Sections 1-2 (Header+Hero, Brand/Logo Strip) were pulled directly from Figma layer data via the API — those hex values, gradient angles, and shadow specs are **exact**. Sections 3-14 were extracted by sampling pixels from a full-resolution PNG export after the Figma API hit its Starter-plan monthly quota (20 calls/month) — those values are **close approximations** (±a few RGB points from anti-aliasing/export compression), not exact hex from the file. Everywhere a color clearly matches the exact brand tokens from sections 1-2, it's called out as a confirmed reuse rather than a new color.

`get_variable_defs` on the root node returned no color variables — every color in the file is hardcoded per-layer, in both the exact and approximated sections.

---

## Part 0 — Full Color Palette

| Name | Value | Precision | Role |
|---|---|---|---|
| `brand/purple-deep` | `#6b3aac` | Exact | Primary brand purple — gradient start stop, glow shadows, active states. Confirmed reused (via pixel-match) on: all category/product "Explore/Browse/Shop/Send/Subscribe" buttons, footer logo icon, blog arrow buttons, FAQ expanded-item gradient, testimonial/eyebrow icon circles — this is the single most-used brand color on the page. |
| `brand/purple-bright` | `#c6f` (`#cc66ff`) | Exact | Brand purple, brighter gradient end stop, paired everywhere with `purple-deep` |
| `brand/purple-accent` | `#a855f7` | Exact | Logo wordmark gradient end stop |
| `surface/purple-panel` | `~#572F8B` | Approx | Flat (non-gradient) deep-purple background fill — used once, on the "Margin-building programs / Promotions" panel |
| `text/ink` | `#050505` | Exact | Primary text / near-black everywhere (never pure `#000`) |
| `text/ink-50` | `rgba(5,5,5,0.5)` | Exact | Secondary/muted text (paragraphs, subheadlines) |
| `text/ink-20` | `rgba(5,5,5,0.2)` | Exact | Faint dividers, inactive progress track, inactive carousel-arrow border |
| `text/ink-8` | `rgba(5,5,5,0.08)` | Exact | Very faint fill — inactive progress bar segments |
| `border/purple-10` | `rgba(107,58,172,0.1)` | Exact | Hairline section-divider borders |
| `border/purple-15` | `rgba(107,58,172,0.15)` | Exact | Logo-tile grid borders |
| `border/purple-30` | `rgba(107,58,172,0.3)` | Exact | Secondary-button border; pill-badge glow shadow base color |
| `surface/white` | `#ffffff` | Exact | Header bar, cards, input fields, most section backgrounds |
| `surface/lilac-wash` | `#f7f3ff` | Exact | Hero background wash, also visually matches Testimonials + Warehouse section backgrounds (approx-confirmed) |
| `surface/near-black` | `#050505` | Exact | Top utility strip background; also the fill for every dark "eyebrow pill" badge across all lower sections (Product Categories, Featured Brands, Benefits, Promotions, Warehouse & Shipping, Testimonials, FAQs, Blog, Contact) — approx-confirmed identical across every section |
| `surface/card-gray` | `~#F9F9F9` | Approx | Neutral light-gray card background — product cards, benefit cards, contact form panel, info cards |
| `shadow/neutral` | `rgba(51,51,51,0.25)` | Exact | Neutral drop shadow on primary CTA button |
| `status/rating-gold` | `~#F4C430` (yellow star) | Approx | Testimonial star ratings — the only non-purple, non-neutral accent color found anywhere on the page |

**Headline finding:** this page has effectively **one accent color** — `#6b3aac → #c6f` purple — reused with total consistency across 14 sections: every CTA button, every eyebrow-pill icon, every active-state indicator, every icon badge, the logo, and the FAQ accordion all pull from the exact same two-stop gradient or its solid `#6b3aac` half. The only color that ever breaks this is the yellow star-rating icons in Testimonials, and product photography itself (which is out of scope — that's real photos, not UI color).

---

## Part 1 — Gradient Tokens

| Name | Type / Angle | Stops | Used on | Precision |
|---|---|---|---|---|
| `gradient/logo-wordmark` | Linear, 90° (L→R) | `#050505` @73.9% → `#6b3aac` @86.9% → `#a855f7` @100% | Header logo text (bg-clip-text) | Exact |
| `gradient/brand-cta` | Linear, 90° (L→R) | `#6b3aac` @64.3% → `#c6f` @100% | **The workhorse gradient.** Primary hero CTA, active hero-carousel bar, every "Explore/Shop/Browse/Send/Subscribe" button across all 14 sections, blog arrow buttons, FAQ expanded-item background (confirmed via pixel match in sections 3-14) | Exact (sec 1), approx-confirmed reuse elsewhere |
| `gradient/hero-wash` | Linear, 180° (T→B) | `#f7f3ff` @0% → transparent @100% | Hero section background panel | Exact |
| `gradient/section-glow-band` | Linear, 180° | `rgba(107,58,172,0)` → `rgba(107,58,172,0.1)` @53.4% → `rgba(107,58,172,0)` | Brand/Logo-Strip section background | Exact |
| `gradient/stock-up-banner` | Diagonal, ~135° (TL→BR), estimated | `#6b3aac`-ish (top-left) → lighter lavender/pink (bottom-right), with a soft blurred building photo composited underneath | Stock Up Banner section background | Approx — angle and exact stop % not verifiable from pixels alone, direction is clearly diagonal top-left-to-bottom-right |
| `gradient/footer-mesh` | Radial/mesh blend, multi-point (not a simple 2-stop linear) | White (top) blending into soft lilac `~#DAD5E8`, pink `~#F5E1ED`, and blue-lilac `~#DED3ED` patches toward the bottom | Footer section background — reads as a soft "aurora" blur behind the newsletter block | Approx — this is a mesh/multi-stop gradient, not reducible to a clean 2-point linear; treat as a blurred radial composite in implementation (CSS `radial-gradient` layers or a background image) |
| `gradient/certification-highlight` | Linear/radial blend, roughly top-to-bottom | Vivid purple `~#C87CF1` (top) fading to white/transparent (bottom), with a subtle diagonal streak texture | Background photo panel behind "Authentic Products" — the one highlighted certification card | Approx |

---

## Part 2 — Effect Tokens

| Name | Value | Used on | Precision |
|---|---|---|---|
| `shadow/badge-glow` | `0px 4px 20px 0px rgba(107,58,172,0.3)` | Hero pill badge — soft purple glow, no spread, large blur | Exact |
| `shadow/button-hairline` | `0px 0px 4px 0px rgba(51,51,51,0.25)` | Primary hero CTA button — tight neutral edge-definition shadow | Exact |
| `shadow/card-soft` | Soft, low-opacity dark shadow, large blur, near-zero offset | Testimonial center card, product cards, benefit cards, contact info cards — a consistent "resting elevation" look across nearly every card component | Approx |
| `effect/glassmorphism` | Semi-transparent white/lavender fill over the purple banner background, sampled color ≈ `rgba(255,255,255,0.35)` blended with the purple behind it; visually reads as a frosted-glass card with a soft light border | "Wholesale Benefits" card floating over the Stock Up Banner — this is the one true glassmorphic (backdrop-blur) element on the page | Approx (can't confirm exact blur radius from a flattened screenshot, but the translucent/frosted look is unambiguous) |
| `effect/watermark-ghost` | Very low-opacity (~5-8%) light lavender fill on giant text | The oversized "Gemini Distribution" watermark text sitting behind the footer newsletter headline | Approx |

---

## Part 3 — Section-by-Section Color Detail

### 1. Header + Hero — `1113:449` (Exact, via Figma API)
| Element | Background / Fill | Text color | Border | Shadow/Effect |
|---|---|---|---|---|
| Top utility strip | `#050505` | white | — | — |
| Header bar | `#ffffff` | — | — | — |
| Logo wordmark | `gradient/logo-wordmark` (bg-clip-text) | — | — | — |
| Nav links | none | `#050505` | — | — |
| Divider "\|" | — | `rgba(5,5,5,0.2)` | — | — |
| Hero panel | `gradient/hero-wash` | — | — | rounded-[60px] |
| Hero pill badge | `#ffffff` | `#050505` | — | `shadow/badge-glow` |
| H1 / paragraph | none | `#050505` / `rgba(5,5,5,0.5)` | — | — |
| Primary button | `gradient/brand-cta` | white | `2px solid #ffffff` | `shadow/button-hairline` |
| Secondary "Log in" | transparent | `#050505` | `1px solid rgba(107,58,172,0.3)` | — |
| Carousel arrows (in/active) | transparent | ink icon | `0.6px solid rgba(5,5,5,0.2)` / `0.6px solid #050505` | — |
| Progress track (inactive/active) | `rgba(5,5,5,0.08)` / `gradient/brand-cta` | — | — | — |

### 2. Brand/Logo Strip — `1113:169` (Exact, via Figma API)
| Element | Background / Fill | Text color | Border |
|---|---|---|---|
| Section container | `gradient/section-glow-band` | — | `1px solid rgba(107,58,172,0.1)` top+bottom only |
| Heading / subheading | none | `#050505` / `rgba(5,5,5,0.5)` | — |
| Logo tiles | `#ffffff` | — | `1px solid rgba(107,58,172,0.15)` |

### 3. Featured Products Rail / Categories — `1137:2639` (Approx, screenshot)
| Element | Background / Fill | Text color | Border | Notes |
|---|---|---|---|---|
| Eyebrow pill "Product Categories" | `surface/near-black` | white | — | icon in a small white/purple square |
| "All" category tab (active) | white | `#050505` | `~2px solid #6b3aac` | only active tab gets a purple border, others are plain gray icon+label |
| "Vape / Smoking / Cannabis / Convenience" tabs (inactive) | transparent | gray icon+text | none | |
| Vape feature card | `~#F0EBF6` lilac wash | dark text | — | diagonal light-streak decoration, star watermark icon bottom-right |
| Cannabis Accessories card | near-black `~#0D0D0D` | white | — | radial light burst behind product photo |
| "Explore Category" buttons (×2) | `gradient/brand-cta` | white | — | pill shape |
| "Ready Anytime" / "Portable Design" chips | `~#E9E2F2` pale lilac | dark purple text | — | floating pill badges over the Convenience card |
| Smoking search bar | white pill | dark text | — | circular search icon button in `brand/purple-deep` |

### 4. Best Sellers Grid — `1113:19` (Approx, screenshot)
| Element | Background / Fill | Text color | Border |
|---|---|---|---|
| Eyebrow pill "Featured Brands" | `surface/near-black` | white |
| Tab pills — active "Best Sellers" | `gradient/brand-cta` | white |
| Tab pills — inactive (New Arrivals, Trending, Promotions) | `~#F5F5F6` light gray | gray text |
| Product cards | white | — | subtle `~#EEEEEE` outline |
| Product image tile | `~#F9F9F9` | — |
| "Login to View Price" button | white | dark text | `~1px solid #E5E5E5` |
| "Browse full catalog" | `gradient/brand-cta` | white |

### 5. Promotions / Margin-Building Programs — `1113:578` (Approx, screenshot)
*(Note: named "Feature Highlights" in the earlier typography pass — visually this is the "Promotions" panel with Bulk Discounts / VIP Pricing / Seasonal Promotions / Free Shipping cards.)*
| Element | Background / Fill | Text color | Border |
|---|---|---|---|
| Section panel | `surface/purple-panel` (~`#572F8B`) flat purple, rounded ~40px corners | white |
| Decorative background grid squares | slightly darker/lighter purple tiles (~`#532B85` / `#4E2980`) at low contrast against the panel — a subtle checkerboard texture | — |
| Eyebrow pill "Promotions" | `~#B8B8B8`-toned semi-transparent white pill (looks like white @ ~15% opacity over the purple panel) | white | — |
| Sub-cards (Bulk Discounts, VIP Pricing, Seasonal Promotions, Free Shipping) | white / near-white `~#FDFBFF` | dark text |
| "+10% OFF" badge (inside VIP Pricing card) | mid-purple `~#C79BE8` | white |
| Free Shipping map illustration | pale lilac map on white card, `brand/purple-deep` location pin | — |

### 6. Benefits (Wholesale Account) — `1113:1200` (Approx, screenshot)
| Element | Background / Fill | Text color | Border |
|---|---|---|---|
| Eyebrow pill "Benefits" | `surface/near-black` | white |
| Index numbers ("01" – "05") | none | `brand/purple-deep` |
| Card titles/descriptions | none | `#050505` / gray |
| Benefit cards | `surface/card-gray` | — | none visible |

### 7. Stock Up Banner — `1113:1145` (Approx, screenshot)
| Element | Background / Fill | Text color | Border | Effect |
|---|---|---|---|---|
| Banner background | `gradient/stock-up-banner` (diagonal purple → lavender/pink, product photo + faint blurred building composited on top) | white heading | — | rounded ~40px corners |
| "Shop Wholesale" button | `gradient/brand-cta` | white | `~1-2px solid white/purple` | — |
| "Wholesale Benefits" card | `effect/glassmorphism` (translucent white/lavender over the banner) | white | thin translucent white border | frosted-glass / backdrop-blur |
| Icon circles inside glass card | `brand/purple-deep` solid | white icon | — | — |

### 8. Warehouse & Shipping — `1113:1244` (Approx, screenshot)
| Element | Background / Fill | Text color | Border |
|---|---|---|---|
| Eyebrow pill "Warehouse & Shipping" | `surface/near-black` | white |
| Map panel | `surface/lilac-wash`-toned card, rounded ~30px | — |
| Map country shapes | two-tone purple — Canada highlighted in a stronger `~#9B7BC4` purple, rest of world in a paler `~#E3D9F0` | white "Canada" label |
| Location pins | `brand/purple-deep` filled circle, white pin icon, soft ring halo | white |
| Feature row icons/titles | none | dark text with small icon glyphs |

### 9. Testimonials — `1113:1330` (Approx, screenshot)
| Element | Background / Fill | Text color | Border |
|---|---|---|---|
| Section background | `surface/lilac-wash`-toned (pale lilac, not white) | — |
| Eyebrow pill "Testimonials" | `surface/near-black` | white |
| Side quote cards (dimmed) | white, lower contrast/opacity text | gray-toned quote text |
| Featured center card | white with a subtle top-left radial highlight glow | dark text | `~1px solid #E4DCF2` light purple outline | `shadow/card-soft` |
| Star ratings | `status/rating-gold` filled stars, `text/ink-20`-toned empty stars | dark "4.2" text |
| Avatar ring (bottom) | white ring around each avatar photo | — |

### 10. FAQs — `1113:194` (Approx, screenshot)
| Element | Background / Fill | Text color | Border |
|---|---|---|---|
| Eyebrow pill "FAQs" | `surface/near-black` | white |
| Closed FAQ row | white | `#050505` | `~1px solid #E5E5E5` |
| **Expanded FAQ row** | `gradient/brand-cta` (same 90° L→R purple gradient) | white | none | rounded pill-ish corners |
| Number badge (closed / expanded) | white circle, dark number / white circle, purple number | — |
| Close "×" icon (expanded row) | white circle | dark icon |

### 11. Certifications & Trust — `1113:258` (Approx, screenshot)
| Element | Background / Fill | Text color | Border |
|---|---|---|---|
| Section label | none, plain uppercase text | `#050505` (not a pill here — this one row is text-only, no dark badge) |
| Standard cards (4 of 5) | white | dark text | icon badge: white circle, `brand/purple-deep` icon |
| **Highlighted card ("Authentic Products")** | `gradient/certification-highlight` (vivid purple photographic panel fading to white) | white icon/sparkles, dark title text below on white | — | this card is visually "lifted" — different treatment from its siblings |

### 12. Blog — `1113:311` (Approx, screenshot)
| Element | Background / Fill | Text color | Border |
|---|---|---|---|
| Eyebrow pill "Blog" | `surface/near-black` | white |
| Category pill (Distribution/Merchandising/Compliance) | white | `brand/purple-deep` text |
| Card image | photo, dark rounded frame | — | thin dark border ~`#050505` |
| Card title/excerpt | none | `#050505` / gray |
| Arrow button | `gradient/brand-cta` (confirmed pixel match) | white icon | — |

### 13. Contact — `1113:372` (Approx, screenshot)
| Element | Background / Fill | Text color | Border |
|---|---|---|---|
| Eyebrow pill "Contact" | `surface/near-black` | white |
| Form panel | `surface/card-gray` | — |
| Input fields | white | placeholder gray | `~1px solid #E5E5E5` |
| "Send Message" button | `gradient/brand-cta` | white |
| Info cards (Address/Call Us/Email Us) | `surface/card-gray` | dark text | icon: white circle, `brand/purple-deep` icon |

### 14. Footer — `1113:1475` (Approx, screenshot)
| Element | Background / Fill | Text color | Border |
|---|---|---|---|
| Section background | `gradient/footer-mesh` (white → lilac/pink/blue-lilac soft blur) | — |
| Watermark "Gemini Distribution" | `effect/watermark-ghost` | very faint lilac | — |
| Newsletter input pill | white, sits inside a larger soft white outer pill (double-pill look, subtle depth shadow between the two layers) | gray placeholder |
| "Subscribe" button | `gradient/brand-cta` (confirmed pixel match) | white |
| Footer logo icon | `brand/purple-deep`-based icon mark (two interlocking rings), distinct from the header's gradient wordmark | — |
| Footer logo text "Gemini Distribution" | none, plain solid text | `#050505` — **note: solid black text here vs. gradient text in the header, on top of already using a different font (per the typography report)** |
| Column headers/links | none | `#050505` (bold headers) / gray (links) |
| Social icons | white circle | dark icon |
| Legal bar | none | `#050505` |

---

## Flags for Design Review (color-specific, in addition to the typography flags already raised)
1. **One dominant accent color used with total discipline** — this is a strength, not a flag: `#6b3aac → #c6f` is the only brand gradient across all 14 sections. Worth codifying as a single design token pair (`brand-start`/`brand-end`) so it's never redefined slightly differently by accident in future work.
2. **Footer logo mark vs. header logo mark** — different icon treatment (gradient text vs. solid icon + solid black text) for the same brand, on top of the font mismatch already flagged in typography.
3. **The "Authentic Products" certification card** is the only card in its row of 5 with a photographic/gradient treatment instead of a flat white card — confirm this is an intentional "featured" callout and not a leftover state.
4. **Section background colors are inconsistent between "should be neutral" sections** — some content sections sit on pure white (Benefits, Blog, Contact, FAQs) while others sit on the lilac wash (Testimonials, Warehouse & Shipping) with no obvious pattern for which gets which — worth checking whether that's a deliberate rhythm (alternating tone every ~2 sections) or inconsistent.

---

## Files
- This report (color-report.md) — full palette, gradients, effects, and section-by-section detail.
- Cropped section screenshots used for sampling: `03_featured_products_rail.png` through `14_footer.png` in this same folder, if you want to re-verify any reading visually.
