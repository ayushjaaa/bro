# Typography & Color — Full Walkthrough (Gemini Distribution Landing Page)

This is the "explain it like I'm presenting it" version. Every rule here was reverse-engineered directly from the Figma layer values (not guessed) — where I noticed a pattern, I called it out so you can repeat it confidently when explaining the system to someone else.

---

## The big picture first

The whole page runs on **one typeface — Inter Tight — in four weights**: Regular (400), Medium (500), SemiBold (600), Bold (700). No Light, no Black, no Italic anywhere. That's it. Everything else (three stray fonts) is an inconsistency, not part of the system — covered at the end.

Two hidden rules run underneath the whole scale. Once you see them, every token stops looking arbitrary:

1. **Big headings always tighten by exactly -2%.** 61px → -1.22px tracking, 49px → -0.98px, 31px → -0.62px. Divide any of those and you get -0.02 every time. So it's not "this heading has -0.98px of tracking," it's "headings get -2% tracking as a rule, and -0.98px is just what -2% looks like at 49px." That's why `--tracking-display-tight: -0.02em` in the CSS file is one variable, not five.
2. **Eyebrow labels always get the opposite treatment.** +1.12px tracking at 16px = exactly +7%, always combined with uppercase. Every pill badge sitting above a section heading (Featured Brands, Benefits, Testimonials, Warehouse & Shipping, FAQs, Blog, Contact) uses this exact recipe. It's the page's signature "small label" move.

Line-height also isn't random — it clusters into four bands used on purpose:
- **0.9** — reserved for single-line UI chrome: buttons, badges, nav links. Anything that will never wrap.
- **1.2** — the default for headings and dense UI text (card titles, form labels).
- **1.3** — the default for anything meant to be read as a paragraph (body copy, descriptions).
- **1.5** — shows up only on small standalone lines like a name or a rating number, where extra breathing room reads as "considered," not "wrapped text."

---

## Component-by-component

### 1. Header / top bar
- **Utility strip** ("🚚 Free Expedited Shipping…", "18+ ONLY…"): 16px Regular, 0.9 leading. This is `body/nav`. Tight leading is correct here — it's a single line that must not wrap awkwardly.
- **Logo wordmark** ("Gemini / Distribution"): 20px, but set in **NCS Radhiumz**, not Inter Tight, with a gradient fill. This is the only intentional off-system font on the page — logos are allowed to break the type system, that's normal. Just don't ever pull this font into body copy.
- **Primary nav links** (Categories, Vape & e juices, Smoking...): 14px Regular, 0.9 leading — one size step down from the utility strip. This is the smallest "real" text on the page outside of captions.
- **"Federal" / "Log in" (top-right)**: 16px Regular — same recipe as the utility strip, just right-aligned.

### 2. Hero
- **Pill badge** ("No. 1 Smoking Accessory Seller in Canada"): 16px Medium, 1.2 leading — notice this is NOT the eyebrow recipe (no uppercase, no wide tracking). It's `body/base-medium` wearing a pill shape. Don't confuse it with the eyebrow label token even though both are pills — the tracking gives it away.
- **H1**: 49px SemiBold, 1.2 leading, -0.98px tracking. This is the flagship `heading/h1` token — you'll see this exact recipe repeat on nearly every section below.
- **Paragraph**: 16px Regular, 1.3 leading. Textbook `body/base` — this is the "default reading" style for supporting copy.
- **Buttons** ("Apply for Wholesale Account", "Log in"): 16px Medium, 0.9 leading — tight leading because a button label is guaranteed single-line.
- **Carousel counter** ("02"): 16px SemiBold, 0.9 leading, +1.12px tracking, uppercase-styled. This is the eyebrow recipe's weight bumped to SemiBold — a deliberate variant for a counter rather than a label.

### 3. Brand / logo strip
- **Heading** ("Everything your shelves need, in one catalogue"): 31px SemiBold, 1.2 leading, -0.62px tracking. Same DNA as `heading/h1` (SemiBold, same leading, same -2% tracking rule) but scaled down to 31px. This is the one place on the whole page that uses this smaller H1 variant — worth asking design whether it's a deliberate "compact hero" moment or a size that should've matched the standard 49px H1.
- **Subheading**: 16px Regular, 1.3 leading — plain `body/base`.

### 4. Featured Products / Best Sellers grids (these two sections repeat the same pattern)
- **Eyebrow pill** ("Featured Brands"): the canonical eyebrow recipe — 16px Medium, 0.9 leading, +1.12px tracking, uppercase.
- **Section H1**: 49px SemiBold — standard `heading/h1`.
- **Subheadline**: 16px Regular or Medium, 1.3 leading.
- **Tab pills** (Best Sellers / New Arrivals / Trending / Promotions): 16px, but weight signals state — the **active tab is SemiBold, inactive tabs are Medium**. That's the whole "selected vs. not" visual language in this component: same size, same color treatment elsewhere, weight alone carries the state.
- **Product card title**: 20px SemiBold (`heading/h6`) in the Best Sellers grid, but 25px SemiBold (`heading/h4`) in the Featured Products rail — two different card sizes are used across the page, so don't assume "product card title" is always one token; check which grid you're in.
- **"STARTING FROM"**: 16px Medium, 1.3 leading — the price label.
- **"Login to View Price"**: appears at two sizes — 13px in the Featured rail, 16px in the Best Sellers grid. Minor inconsistency worth flagging if you want pixel-perfect parity between the two grids.
- **"Browse full catalog" button**: standard `button/label` — 16px Medium, 0.9 leading.

### 5. Feature Highlights (app mockup cards)
- Standard eyebrow + H1 + body/base pattern for the section intro.
- **Card titles** (×3): 20px SemiBold — `heading/h6`.
- **Card descriptions** (×3): 13px Medium — `caption/xs`.
- **Inside the phone-mockup images**: tiny 5.6–8px text in **Google Sans Flex** / **Plus Jakarta Sans**. This is baked into a screenshot/illustration asset, not real HTML text — ignore it when building the type scale, it's not something you'll ever set in code.

### 6. Benefits (Wholesale Account)
- Standard eyebrow + H1 + body/base pattern.
- **Numbered cards** (01–05): the number ("01 /") is 25px Medium (`heading/h4-alt`), the title next to it ("Exclusive Wholesale Pricing") is 25px SemiBold (`heading/h4`). Same size, different weight — the number is deliberately quieter than the title it's introducing. This pairing (h4 + h4-alt) is a nice explainable pattern: "index number and headline share a size grid but not a weight."
- **Card descriptions**: 13px Regular — `caption/xs`.

### 7. Stock Up banner (dark hero with glass card)
- Main H1/body/button follow the standard recipe, in white-on-dark.
- **The "Wholesale Benefits" glass card is entirely off-system** — title, item titles, and item descriptions are all set in **Denim-TRIAL**, a font that appears nowhere else on the page. This is the single biggest inconsistency I found: everywhere else, a card like this would be Inter Tight SemiBold/Regular. Worth a direct question to design: "is this card supposed to look different on purpose, or did it get built from a different template?"

### 8. Warehouse & Shipping
- Standard eyebrow + H1 + body/base-medium pattern.
- **"Canada" map label**: 32px SemiBold, *normal* leading (not 1.2) — this is its own token (`heading/h2`) rather than reusing `heading/h1` at a different size, specifically because the leading behaves differently (normal vs. 1.2). Small detail, but it means you can't just resize h1 to get this — the line-height rule changes too.
- **Feature titles** (Fast Shipping, Order Tracking, etc.): 16px SemiBold — same size as body text but SemiBold instead of Medium/Regular, which is how the page tells a "mini heading" apart from a "sentence" at the same font size.
- **Feature descriptions**: 13px Regular — `caption/xs`.

### 9. Testimonials
- This section has the richest internal hierarchy on the page:
  - **Featured (center) quote**: 22px Medium (`body/xl`) — the largest, most prominent quote.
  - **Side (dimmed) quotes**: 19px Regular (`body/lg`) — smaller AND lighter weight AND (per the design) visually dimmed in color, triple-reinforcing that they're secondary.
  - **Rating badge** ("4.2"): 15px Medium, 1.5 leading.
  - **Author name**: 18px SemiBold, 1.5 leading.
  - **Role/company line**: 16px Medium, 1.5 leading.
  - Notice all four of the "quote card metadata" pieces (rating, name, role) share the same 1.5 leading even though their sizes differ — that's the section's internal consistency rule, distinct from the 1.2/1.3 leading used everywhere else on the page.

### 10. Certifications & Trust
- **Section label** ("Certifications & Trust"): unusually, this uses the eyebrow *tracking/uppercase* recipe but at 16px **SemiBold** instead of Medium — a slightly heavier eyebrow than the rest of the page. Minor but real difference worth knowing if you're building a shared Eyebrow component with a weight prop.
- **Certification titles** (Licensed Business, Verified Distributor, etc.): 28px SemiBold, capitalized — `heading/h3`. This is the only place `heading/h3` appears on the whole page.

### 11. Blog
- Standard eyebrow + H1 + body/base pattern.
- **Category pill** (Distribution, Merchandising, Compliance): 14px SemiBold.
- **Card title**: 18px **Bold** — the only place regular blog-style content uses Bold instead of SemiBold, making it feel closer to "editorial" than "product UI."
- **Card excerpt**: 14px Regular.
- **Meta line** ("June 2026 - 5 min read"): 14px SemiBold — same size as the excerpt but heavier, so it reads as a label even without different color/size.

### 12. FAQs
- Standard eyebrow + H1 + body/base pattern.
- **Numbered badge + question text**: both 20px SemiBold (`heading/h6`) — the number and the question are typographically equal, unlike the Benefits section where the number was deliberately lighter. Different sections, different hierarchy choice — worth noting if you want FAQs and Benefits number badges to feel consistent with each other.
- **Expanded answer text**: 16px Medium.

### 13. Contact
- Standard eyebrow + H1 + body/base pattern.
- **Form field labels** (Full Name, Business email, etc.): 18px SemiBold — reuses `body/title-sm`'s size/weight, just applied to a form label instead of a card title. Good sign of restraint — no new size invented just for forms.
- **Placeholder text**: 14px Regular.
- **Info-card titles** (Address, Call Us, Email Us): 24px SemiBold, normal leading — this is `heading/h5`, used nowhere else on the page.
- **Info-card body**: 14px Regular.

### 14. Footer
- **"STAY CONNECTED WITH WHAT'S NEW"**: 61px SemiBold — the single largest text on the entire page (`display/statement`), used exactly once as a dramatic closing statement.
- **Newsletter placeholder** ("Enter Your Email Address"): the messiest spot in the file — the wrapper is set in Instrument Sans SemiBold at 32px while individual character spans inside it are Inter Tight Medium. This reads like a copy-paste artifact from a different design file rather than an intentional mixed-font moment. I'd flag this specifically rather than replicate it.
- **"Subscribe" button**: 24px Bold — noticeably larger/heavier than every other button on the page (which are 16px Medium). This button is a one-off; decide whether it should match the standard `button/label` token or if the oversized treatment is intentional for this hero-style CTA.
- **Footer logo**: 20px Inter Tight SemiBold — same size as the header logo, but a **different font** (header logo is NCS Radhiumz). Same brand mark, two typefaces — this is worth fixing regardless of anything else, since it's the kind of inconsistency a viewer might consciously notice even without knowing why.
- **Column headers** (Categories, Brands, Quick Links, Wholesale): 18px Bold — reuses `body/title-sm`.
- **Column links**: 14px Medium.
- **Legal bar** (copyright, Terms & Conditions, Privacy Policy): 16px SemiBold — `body/legal`.

---

## The four things worth raising with design (in priority order)

1. **Logo font mismatch** — header uses NCS Radhiumz, footer uses Inter Tight SemiBold, for the identical wordmark. Easiest, highest-impact fix.
2. **"Wholesale Benefits" card in Denim-TRIAL** — the only entire block of real content not in the system font.
3. **Newsletter placeholder font mixing** — Instrument Sans wrapper + Inter Tight spans in one line; looks accidental.
4. **31px "compact" H1 used once** — confirm it's intentional before treating it as a second standard heading size.

---

---
---

# Color, Gradient & Effect Walkthrough

**Precision note, up front:** the Header+Hero and Brand/Logo Strip sections were pulled straight from Figma's layer data via the API — those colors are **exact**. Everything else (12 remaining sections) came from pixel-sampling a full-resolution PNG export, because the Figma account is on the Starter plan (20 API calls/month) and hit its quota partway through. Those values are **close approximations** — right color family and near-exact brightness, but possibly a few RGB points off from the true hex due to export compression. Anywhere I say a color is "confirmed reused," that means the pixel-sampled value matched an exact value closely enough to be clearly the same token, not a coincidence.

## The one-sentence version

This entire 14-section page has **exactly one accent color**: a purple gradient from `#6b3aac` to `#cc66ff`, running left-to-right at 90°. Every button, every active state, every icon badge, and the logo itself pulls from this same pair. If you're explaining this system to someone in one sentence, that's the sentence — the rest is just "and here's everywhere that shows up."

## The three rules underneath the palette

1. **Text is never pure black.** It's `#050505` ("ink"), and everything that looks "gray" or "muted" is actually that same ink color at a lower opacity — 50% for body copy, 20% for dividers, 8% for the faintest fills. This is why the whole page feels cohesive even though it uses four or five different "shades of gray" — they're not different colors, they're one color at different strengths.
2. **Borders are never plain gray either.** Every border on the page is the brand purple at low opacity (10%, 15%, or 30%), not a neutral gray hairline. That's a deliberate choice — even structural elements like card outlines carry a hint of brand color.
3. **The dark "eyebrow pill" badge is one component reused nine times.** Product Categories, Featured Brands, Benefits, Promotions, Warehouse & Shipping, Testimonials, FAQs, Blog, and Contact all use the exact same near-black (`#050505`) pill background with a small icon and white uppercase text. If you're building this as a component, it's one `<Eyebrow>` component with a label + icon prop — not nine separate designs that happen to look similar.

## Component-by-component (color)

### Header / Hero
- **Top utility strip**: near-black `#050505` background, white text — this is the darkest, highest-contrast band on the page, used to make the shipping/legal notices feel like "fine print you should still notice."
- **Logo wordmark**: not a solid color — it's a gradient (`#050505 → #6b3aac → #a855f7`, left to right) clipped to the text shape, so the logo reads dark on the left and flares into purple on the right. This is the same purple family as the brand gradient but uses a *third* stop (`#a855f7`) that appears nowhere else on the page — a logo-only accent.
- **Hero panel background**: a very pale lilac (`#f7f3ff`) fading straight down to transparent — this is what gives the hero its soft, airy background without needing a hard-edged colored box.
- **Pill badge** ("No. 1 Smoking Accessory Seller"): white background, but with a soft purple glow shadow behind it (`0 4px 20px rgba(107,58,172,0.3)`) — no border, the glow does all the work of lifting it off the page.
- **Primary CTA button**: the brand gradient, plus a thin white outline (2px) and a very tight neutral shadow. The white outline is a nice detail — it's what stops the gradient button from blurring into the light background behind it.
- **Secondary "Log in" button**: transparent background, just a 1px purple-tinted border at 30% opacity — deliberately quiet next to the gradient primary button.

### Brand/Logo Strip
- **Section background**: not a flat color — it's a vertical glow band, transparent at the top, rising to 10%-opacity purple exactly at the middle of the section, fading back to transparent at the bottom. It's a subtle "spotlight" effect you'd only notice if you were looking for it.
- **Logo tiles**: white cards with hairline purple borders (15% opacity) — plain and quiet, letting the actual brand logos be the visual interest.

### Featured Products / Categories rail
- **Active category tab** ("All"): the only tab with a purple border — every other tab is borderless gray. Border-only-on-active is the whole state language here, no fill change.
- **Vape category card**: pale lilac wash background with a star-shaped watermark icon — soft and quiet.
- **Cannabis Accessories card**: flips to a near-black background with a radial light glow behind the product photo — this is the one card in the group that goes dark instead of light, presumably to make the glass product photo pop.
- **"Explore Category" buttons**: brand gradient, same recipe as every other CTA on the page.

### Best Sellers Grid
- **Active vs inactive tabs** ("Best Sellers" vs "New Arrivals/Trending/Promotions"): active tab gets the brand gradient fill + white text; inactive tabs are flat light gray with gray text. Simple, binary, consistent.
- **Product cards**: plain white with a barely-visible light gray outline — deliberately unremarkable so the product photography carries the visual weight.

### Promotions / "Margin-Building Programs" panel
- This is the one section that breaks from "white background, purple accents" and instead goes **all-in on a flat deep purple** (`~#572F8B`) as the entire section background, with a subtle darker/lighter checkerboard texture behind the content and white sub-cards floating on top. It's the single most saturated, "loud" section on the page — worth knowing if you're trying to explain the page's visual rhythm (mostly quiet/white, with occasional full-color "statement" sections breaking it up).

### Benefits (Wholesale Account)
- Plain white page background, light gray cards, and the index numbers ("01," "02"...) in solid brand purple text — no background color tricks here, it's the plainest section on the page color-wise.

### Stock Up Banner
- **Background**: a diagonal gradient (top-left brand purple fading to a lighter lavender/pink bottom-right), with a soft blurred photo of a building/warehouse composited underneath, and sharp product photography on top of that. Three visual layers stacked in one background.
- **"Wholesale Benefits" card**: this is the one true **glassmorphic** (frosted glass) element on the entire page — translucent white/lavender with a soft blur, sitting over the purple banner so the banner color shows through, muted. If you only build one "frosted card" component from this whole system, this is the one place it's actually used.

### Warehouse & Shipping
- **Map illustration**: two-tone purple — Canada rendered in a stronger, more saturated purple than the rest of the world map, which sits in a much paler tint. That contrast alone tells the viewer "this is the important part" without needing a label.
- **Location pins**: solid brand purple circles with a soft halo ring — same purple as everywhere else, just in marker form.

### Testimonials
- **Section background**: pale lilac, not white — one of only two sections (with Warehouse & Shipping) that breaks from a pure-white page background.
- **Featured (center) card**: white with a very subtle radial highlight glow in the top-left corner and a light purple outline — small details that make it read as "the important one" versus the two dimmed side cards.
- **Star ratings**: this is the **only place on the entire page** that isn't purple, black/ink, white, or a neutral — the star icons are a warm gold/yellow. Worth flagging as the single deliberate exception to the "one accent color" rule.

### FAQs
- **Closed rows**: white with a light gray border, totally neutral.
- **Expanded row**: switches to the full brand gradient background with white text — this is the same gradient recipe used on every button, just applied to an entire accordion row instead of a pill shape. Good example of one gradient token doing double duty as both a "button fill" and a "selected state fill."

### Certifications & Trust
- Four of five cards are plain white with a purple icon badge. The fifth ("Authentic Products") is different: it has a vivid purple photographic/textured panel behind it, fading to white at the bottom. This is the one card in the row that's visually "featured" — worth confirming with design whether that's intentional (highlighting one certification as more important) or an inconsistency.

### Blog
- **Category pills** (Distribution, Merchandising, Compliance): white background with brand-purple text — this is a different pill recipe than the "eyebrow" pills (which are dark background + white text), so don't conflate the two even though they're both small rounded labels.
- **Arrow buttons**: small circular buttons in the brand gradient — same gradient, just circular instead of pill-shaped.

### Contact
- **Form panel**: light gray card container holding white input fields — a two-layer "panel inside a panel" structure.
- **Send Message button + info-card icons**: brand gradient and brand-purple-on-white, respectively — nothing new here, just the established system applied to a form.

### Footer
- **Background**: the most complex background on the page — a soft, multi-color mesh blend (white at the top, easing into lilac/pink/pale-blue-purple patches toward the bottom), more like a blurred "aurora" than a simple two-color gradient. This can't be built as a single CSS `linear-gradient()` — it needs either layered radial gradients or a background image.
- **Watermark**: the giant "Gemini Distribution" text sitting behind the newsletter headline is barely-there — around 5-8% opacity — a texture, not a message meant to be read.
- **Newsletter input**: a white pill sitting inside a slightly larger, softer white pill (a "pill inside a pill" look with subtle depth between the two layers).
- **Subscribe button**: brand gradient again — same token, still going strong at section 14.
- **Footer logo**: uses a solid brand-purple icon mark plus plain solid black text — notably different from the header logo, which uses a gradient wordmark with no separate icon. Combined with the font mismatch already noted in the typography section, this is the clearest "these two logo instances came from different sources" signal on the page.

## The four color-specific things worth raising with design

1. **One accent color, used with total discipline** — genuinely worth calling out as a strength when presenting this, not just a list of problems. Fourteen sections, one gradient, zero drift.
2. **Footer logo vs. header logo** — different icon treatment (gradient wordmark vs. solid icon + solid text), compounding the font mismatch already flagged in typography.
3. **"Authentic Products" certification card** — the only card of five with a photo/gradient treatment. Confirm it's an intentional "featured" callout.
4. **No obvious rule for white vs. lilac section backgrounds** — Testimonials and Warehouse & Shipping sit on lilac, everything else that could plausibly match them (Benefits, Blog, Contact, FAQs) sits on plain white. Worth checking if this is a deliberate every-other-section rhythm or just inconsistent.

---

---
---

# Spacing & Layout Walkthrough

**Precision note:** unlike the color approximations above, this section is **exact**, even though no more Figma API calls were available when it was built. Before the Starter-plan quota ran out, I'd already pulled the full layer tree for the page — every frame and text node's exact x/y/width/height in pixels. Spacing between two elements is just arithmetic on those coordinates (the gap between one card's right edge and the next card's left edge, etc.), so it doesn't depend on any more API access. Only border-radius couldn't be recovered this way (plain layer metadata doesn't carry corner-radius), so that part is read visually from screenshots and marked approx.

## The one-sentence version

The page runs on **two independent spacing scales, not one shared grid**: a tight 4px-based scale for small UI details (icon padding, pill insets), and a completely separate set of round "big" numbers — 50px, 60px, 100px — for section-level padding and margins. They don't share a common denominator (50 isn't a multiple of 8, for instance), so don't assume a single "8pt grid" governs everything here — it's two grids living side by side.

## The layout skeleton

- **Page is 1440px wide.** 9 of the 14 sections use the exact same formula: **100px margin on each side**, leaving a **1240px content column**, with **50px of padding above and below** the content inside that column. If you're building a `<Section>` wrapper component, this is its default — max-width 1240px, centered, 100px side padding relative to a 1440px viewport, 50px vertical padding.
- **Two sections deliberately break that pattern** — worth knowing so you don't "fix" them by accident:
  - The **Promotions panel** (the solid-purple "Margin-building programs" section) uses **50px side margins instead of 100px**, because the whole section is itself a big rounded card inset from the page edge, not a flush full-width band. Its content column is wider (1340px) as a result.
  - **Certifications & Trust** uses **60px top/bottom padding instead of 50px**, and its card grid uses a **tighter 20px gap instead of the standard 32px** — and the leftmost card is deliberately positioned to bleed off the edge (you can see its label get cut off, "...sed Business" instead of "Licensed Business"). That's very likely an intentional "there's more, scroll/see full row" visual cue rather than a mistake, but it's worth a quick confirmation with design since it's the only place on the page that crops content on purpose.
- **The standard grid gap is 32px**, and it's not arbitrary — in the Best Sellers product grid, three 392px-wide cards plus two 32px gaps add up to exactly 1240px, filling the content column edge to edge with no leftover space. Same math repeats in the Blog grid. That's a strong signal 32px was chosen deliberately to make 3-column grids divide the standard content width evenly, not picked as a nice-looking number in isolation.
- **Section headers are a reusable, fixed-height block.** Wherever a section has the eyebrow-pill + H1 + subheading pattern (Best Sellers, Blog, Contact, and others), that whole block is consistently **244px tall**, followed by a **60px gap** before whatever comes next. If you're building a `<SectionHeader>` component, its height and the gap below it are both fixed constants, not "whatever the content needs."

## Component-by-component (spacing)

- **Best Sellers product grid**: 3 columns × 2 rows, 392px cards, 32px gaps between columns, 50px between the two rows, and another 50px down to the "Browse full catalog" button. Inside each card, there's a 20px gap between the product image block and the text block below it.
- **Benefits cards**: the header row (heading + the "01" featured card sitting beside it) is 289px tall — taller than the usual 244px header block, because this section puts one card up in the header row instead of starting the grid below it. The remaining 4 cards sit in a row 32px below that, each 285px wide with ~32px gaps between them, and — this is a nice consistent detail — **24px of padding on all four sides** inside every card, symmetric all the way around.
- **Certifications cards**: 5 cards, 310px wide, only 20px apart (tighter than everywhere else), but each card's *internal* padding is still a generous 32px — so the tightness is only between cards, not inside them.
- **Blog cards**: each card has an unusual asymmetric frame — 6px inset on the top/left/right, but 20px at the bottom. That extra bottom room is exactly enough space for the circular "read more" arrow button to sit close to the card's edge without touching it. That's a deliberately considered detail, not an oversight — a symmetric 6px all around would have cramped that button.
- **Contact section**: a two-column layout — an 865px-wide form panel and a 343px-wide info-card column, with a 32px gap between them (865 + 32 + 343 = 1240, filling the content width exactly, same trick as the 3-column grids). The form itself has 32px of internal padding on every side, and the three stacked info cards (Address/Call Us/Email Us) sit 24px apart vertically.
- **Footer**: this one couldn't be measured exactly — in the Figma file, the Footer's content actually lives nested inside the Contact section's layer tree rather than being its own clean top-level frame (worth flagging to whoever maintains the Figma file, since editing one can now accidentally shift the other). Its spacing here is a screenshot-based approximation: roughly 50-60px top padding, a standard-looking 1240px content column, and 60-80px gaps between the four footer link columns.

## Border-radius, by component family

Radius on this page isn't random per-element — it groups into clear "tiers" by what kind of element it's on:
- **Pills and buttons**: always fully rounded (radius = half the element's own height), ranging from 50px on the hero CTA up to 99px on the thin progress-track segments. Every eyebrow badge across all 14 sections follows this same "always fully pill-shaped" rule.
- **Circular elements** (carousel arrows): exactly 41.4px, i.e. a true circle on an ~83px-diameter button.
- **Large background panels** (hero panel, Promotions panel, Stock Up banner): the biggest radius on the page, 40-60px — these are the "statement" full-bleed cards, and the large radius is part of what makes them feel like soft, oversized shapes rather than sharp-edged boxes.
- **Regular cards and images** (product cards, blog cards, testimonial cards, benefit cards, the hero banner image): a consistent medium radius around 20px — this is the page's default "card" radius.
- **Smaller UI chrome** (form inputs, minor elements): a smaller radius, roughly 12-16px.
- **Full-bleed section backgrounds** (the world map illustration, banner background photography): radius 0 at the very outer edge — the rounding always happens on an inner content panel, never on the section shell itself.

If you're building a `radius` token scale, that's naturally 5 steps: none → sm (~14px) → md (~20px) → lg (~40px) → xl (60px) → full (pill/circle), and that maps cleanly onto "how big and how prominent is this element" — bigger, more attention-grabbing shapes get bigger radii.

## Three things worth raising about layout

1. **Promotions panel's 50px margin** and **Certifications' 60px padding + 20px gap** are the only two deviations from an otherwise very disciplined 100px/50px/32px system — worth a quick "is this intentional" check, though both have plausible reasons (a wider "statement" panel; a deliberately cropped trust-strip).
2. **Certifications' left-edge card bleed** looks like an intentional "there's more" affordance, but is worth confirming rather than assuming.
3. **Contact and Footer sharing one layer subtree** in the Figma file is a structural risk for whoever edits that file next — flag it so a future change to Contact doesn't silently break Footer's layout or vice versa.

---

## Files delivered alongside this doc
- `typography-tokens.css` — Tailwind v4 `@theme` block, ready to `@import` into a project's globals.css. Covers typography (every `text-h1`/`text-eyebrow`/etc. token bundles size+line-height+letter-spacing+weight), color/gradient/shadow tokens (`color-brand-purple-deep`, `shadow-badge-glow`, `bg-gradient-brand-cta` utility classes, a `glass-card-brand` utility for the one frosted-glass card), and spacing/radius tokens (`spacing-lg` → generates `p-lg`/`gap-lg`/etc., `radius-full`, `content-max-width`).
- `typography-tokens.json` — the same full token set (typography + color + gradients + effects + spacing + radius + layout primitives) in plain JSON, for anything that isn't Tailwind (a Style Dictionary pipeline, a Figma tokens plugin, a design QA checklist, etc.). Every value that isn't 100% certain is tagged `"precision": "exact"` or `"precision": "approx"` so you always know how much to trust it.
- `color-report.md` — the full section-by-section color reference table (background/text/border/shadow per element, all 14 sections).
- `spacing-report.md` — the full section-by-section layout reference table (outer padding, grid gaps, card internal padding per element, all 14 sections) if you need more granularity than this walkthrough covers.
