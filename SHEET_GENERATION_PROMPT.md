# Prompt: generate the Taxonomy + Filter sheet (paste into Claude, attach your product list)

---

You are helping me prepare a **product mapping sheet** for a B2B wholesale vape/smoke-shop store (Shopify backend + custom admin panel + Next.js storefront). I will give you a list of products (titles, and any details I have). For **every** product you must decide its Category, Sub-category, Brand, menu placement and filter values, and output one sheet in EXACTLY the format below. Do not invent columns, do not rename sub-categories or filter labels.

## 1. How the system works (read first)

Taxonomy is a strict chain of Shopify metaobjects:

**Category → Sub-category → Brand → Product (Product Line) → Variants (Flavour)**

- **Category** (top level, = mega-menu tab): VAPE, SMOKING, CANNABIS ACCESSORIES, CONVENIENCE.
- **Sub-category** belongs to exactly ONE Category. Each Sub-category is also a Shopify Collection and is what Shopify calls the product "Type".
- **Brand** belongs to exactly ONE Sub-category. The same brand name can exist once per sub-category (e.g. "Flavour Beast" under Disposable Vapes AND under E-Liquids are two different brand entries). So a brand is always written together with its sub-category. Pod-line brands have their own names, e.g. "Oxbar Maglink 90K Pods", "Mr Fog Switch Pods", "Ripper X 75K Pods", "Flavour Beast Pods".
- **Product** = one Product Line (e.g. "Mr Fog Nova 36K Disposable 5ct - Federal"). **Flavour is NOT a separate product**; it is a variant (option "Flavour") of the product. So one row in the sheet = one product, and you only give the **number of flavours/variants**, not one row per flavour.
- **Region**: every product title ends with a region, and the product carries a tag `region-federal` (or `region-bc`, `region-ab`, `region-mb`, `region-on`, `region-qc`). Federal = all other provinces/territories. If the title says "Federal" the tag is `region-federal`; "BC" → `region-bc`; "Alberta" → `region-ab`, etc.
- **Filters** are NOT extra hierarchy. Puff count, nicotine, pack size, etc. are filters stored as product metafields, and **each Sub-category has its own set of filters** (see section 3). A filter that does not belong to the product's sub-category must be left blank.
- Brand, Price, Availability and Flavour are "native" filters: they come automatically from Shopify data, so they are **not** columns in the sheet (only Brand is, because it is the taxonomy link).

## 2. Category → Sub-category tree (the ONLY allowed values) + mega-menu placement

The storefront mega-menu is built from 4 metafields on every Sub-category: `menu_nav_key`, `menu_group_label`, `menu_group_mode` (`brand` = the group lists brands, `subcategory` = the group lists sub-categories), `menu_sort_order`. Use exactly this table:

| Category (menu tab) | menu_nav_key | Sub-category | menu_group_label | group_mode | sort |
|---|---|---|---|---|---|
| VAPE | vape-e-juices | Disposable Vapes | Disposable | brand | 1 |
| VAPE | vape-e-juices | E-Liquids / Vape Juice | E-Juices | brand | 2 |
| VAPE | vape-e-juices | Pre-Filled Pods | Pre-Filled Pods | brand | 3 |
| VAPE | vape-e-juices | Vape Devices | Devices | brand | 4 |
| VAPE | vape-e-juices | Vape Hardware & Accessories | Hardware | brand | 5 |
| SMOKING | smoking | Rolling Papers | Rolling Papers | subcategory | 1 |
| SMOKING | smoking | Blunts & Wraps | Blunts & Wraps | subcategory | 2 |
| SMOKING | smoking | Pre-Rolled Cones | Pre-Rolled Cones | subcategory | 3 |
| SMOKING | smoking | Filters & Tips | Filters & Tips | subcategory | 4 |
| SMOKING | smoking | Rolling Accessories | Rolling Accessories | subcategory | 5 |
| SMOKING | smoking | Tobacco | Tobacco | subcategory | 6 |
| SMOKING | smoking | Torch Lighters | Torch Lighters | brand | 7 |
| SMOKING | smoking | Butane | Butane | brand | 8 |
| CANNABIS ACCESSORIES | cannabis-accessories | Glass | (Bongs / Pipes group) | subcategory | – |
| CANNABIS ACCESSORIES | cannabis-accessories | Dab & Concentrate | (Dab Rigs group) | subcategory | – |
| CANNABIS ACCESSORIES | cannabis-accessories | Grinders | Grinders | subcategory | – |
| CANNABIS ACCESSORIES | cannabis-accessories | Scales | Scales | subcategory | – |
| CANNABIS ACCESSORIES | cannabis-accessories | Hookahs | Hookahs | subcategory | – |
| CANNABIS ACCESSORIES | cannabis-accessories | Storage | Storage | subcategory | – |
| CANNABIS ACCESSORIES | cannabis-accessories | Cleaning | Others | subcategory | 1 |
| CANNABIS ACCESSORIES | cannabis-accessories | Replacement Parts | Others | subcategory | 2 |
| CONVENIENCE | convenience | Car Air Fresheners | Air Fresheners | subcategory | 1 |
| CONVENIENCE | convenience | Lighters | Lighters | subcategory | 1 |
| CONVENIENCE | convenience | Batteries | Batteries | subcategory | 1 |
| CONVENIENCE | convenience | General Convenience | Others | subcategory | 1 |

Each Sub-category also has a list of **Product Types** (the "types" shown in the storefront sidebar). Pick the closest one for the column `Product Type`:

- Disposable Vapes: Standard Disposable Vapes, Rechargeable Disposable Vapes
- E-Liquids / Vape Juice: Freebase E-Liquid, Nicotine Salt E-Liquid, Shortfill / Nicotine-Free
- Pre-Filled Pods: Closed-System Pods, Pre-Filled Cartridges, Replacement Pre-Filled Pods
- Vape Devices: Pod Systems, Pod Mods, Vape Pens, Box Mods, Battery Devices
- Vape Hardware & Accessories: Coils, Tanks, Cartridges, Replacement Pods, Batteries, Chargers, Drip Tips, Replacement Parts, Other Hardware
- Rolling Papers: Standard Rolling Papers, King Size Rolling Papers, King Size Slim Rolling Papers, 1¼ Rolling Papers, Single Wide Rolling Papers
- Blunts & Wraps: Hemp Wraps, Blunt Wraps, Tobacco Wraps
- Pre-Rolled Cones: Standard Cones, King Size Cones, Flavored Cones, Multi-Pack Cones
- Filters & Tips: Filter Tips, Glass Tips, Paper Tips, Pre-Rolled Filters
- Rolling Accessories: Rolling Trays, Rolling Machines, Rolling Mats
- Tobacco: Rolling Tobacco, Cigars, Cigarillos, Pipe Tobacco
- Torch Lighters / Butane: no types (leave blank)
- Glass: Glass Bongs, Water Pipes, Glass Pipes, Hand Pipes, Bubblers
- Dab & Concentrate: Dab Rigs, Dab Tools, Concentrate Containers, Wax Accessories
- Grinders: 2-Piece Grinders, 3-Piece Grinders, 4-Piece Grinders, Electric Grinders
- Scales: Pocket Scales, Digital Scales, Precision Scales
- Hookahs: Hookah Sets, Hookah Pipes, Hookah Accessories, Hookah Parts
- Storage: Storage Jars, Storage Containers, Smell-Proof Storage, Cases
- Cleaning: Glass Cleaners, Cleaning Brushes, Cleaning Kits, Cleaning Accessories
- Replacement Parts: Downstems, Bowls, Screens, Ash Catchers, Replacement Glass, Other Replacement Parts
- Car Air Fresheners: Hanging Air Fresheners, Fiber Can Air Fresheners, Vent Clips, Air Freshener Sprays
- Lighters: Pocket Lighters, Utility Lighters, Electric Lighters
- Batteries: AA, AAA, Specialty Batteries, Rechargeable Batteries
- General Convenience: none

## 3. Filters per Sub-category (fill ONLY the ones of the product's sub-category)

- **Disposable Vapes**: Puff Count, Nicotine Strength, Nicotine Type, Device Type, Pack Quantity
- **E-Liquids / Vape Juice**: Nicotine Strength, Nicotine Type, Bottle Size, VG/PG Ratio, Pack Quantity
- **Pre-Filled Pods**: Device Compatibility, Nicotine Strength, Pod Capacity, Pack Quantity
- **Vape Devices**: Device Type, Battery Capacity, Battery Type, Pod/Tank Capacity, Coil Compatibility, Color, Pack Quantity
- **Vape Hardware & Accessories**: Compatibility, Resistance, Capacity, Size, Color, Pack Quantity
- **Rolling Papers**: Paper Size (allowed: King Size | King Size Slim | 1¼ | Single Wide), Material (allowed: Hemp | Rice | Unbleached | Other), Paper Type, Length / Width, Pack Quantity
- **Blunts & Wraps**: Material, Size, Wrap Type, Count / Pack Quantity
- **Pre-Rolled Cones**: Cone Size, Material, Count, Pack Quantity
- **Filters & Tips**: Material, Tip Type, Size, Color, Pack Quantity
- **Rolling Accessories**: Product Type, Size, Material, Color, Design
- **Tobacco**: Tobacco Type, Size, Quantity, Pack Size
- **Torch Lighters**: Flame Type (allowed: Single Flame | Dual Flame | Multi-Flame | Adjustable Flame), Refillable, Ignition Type, Torch Type, Size, Color / Design, Pack / Display Quantity
- **Butane**: Butane Type, Can Size, Weight, Refinement / Purity, Pack Quantity, Container Type
- **Glass**: Product Type, Size / Height, Material, Color, Percolator Type, Joint Size, Joint Type, Design
- **Dab & Concentrate**: Product Type, Material, Size, Joint Size, Color
- **Grinders**: Grinder Type, Material, Size, Number of Pieces, Color
- **Scales**: Capacity, Accuracy, Scale Type, Unit Options, Size
- **Hookahs**: Size, Material, Hose Count, Color, Product Type
- **Storage**: Material, Size, Capacity, Closure Type, Color
- **Cleaning**: Product Type, Size, Pack Quantity
- **Replacement Parts**: Part Type, Compatibility, Size, Joint Size, Material
- **Car Air Fresheners**: Scent, Format, Pack Quantity, Size
- **Lighters**: Lighter Type, Refillable, Ignition Type, Color, Pack Quantity
- **Batteries**: Battery Type, Size, Capacity, Rechargeable, Pack Quantity
- **General Convenience**: no filters

Value formatting rules (filters are exact-match on the storefront, so consistency matters):
- Puff Count: digits only, no commas or "K" → `36000`, `100000`.
- Nicotine Strength: number + `mg` → `20mg`, `0mg`, `35mg`.
- Nicotine Type: `Salt Nic` or `Freebase`.
- Device Type (disposables): `Standard Disposable` or `Rechargeable Disposable`.
- Pack Quantity: digits only (`4`, `5`, `10`).
- Bottle Size: number + `mL` → `30 mL`, `60 mL`.
- Use the same spelling for the same value across all rows (never `20 mg` in one row and `20mg` in another).
- **Never guess.** If a value is not stated in the title/description/my notes and you cannot derive it with certainty, leave the cell blank and explain in `Note`. A blank is better than a wrong filter.

## 4. Output format

Produce ONE table (give it as a downloadable **.xlsx** if you can, otherwise CSV), one row per product, these columns in this order:

| # | Column | Rule |
|---|---|---|
| A | # | running number |
| B | Handle | Shopify URL handle: lowercase title, non-alphanumerics → `-`, no double dashes, keep the region word at the end (e.g. `mr-fog-nova-36k-mint-steezy-series-disposable-5ct-federal`). If I give a handle, use mine unchanged |
| C | Title | clean title, single spaces, region at the end as `- Federal` |
| D | Region Tag | `region-federal` / `region-bc` / `region-ab` / `region-mb` / `region-on` / `region-qc` |
| E | Category | one of the 4 tabs, exact spelling from section 2 |
| F | Sub-category | exact spelling from section 2 (this is also Shopify "Type") |
| G | Product Type | one of the types of that sub-category (section 2) or blank |
| H | Brand | brand entry name (must be under that Sub-category; see rule below) |
| I | Menu Nav Key | from the section-2 table |
| J | Menu Group Label | from the section-2 table |
| K | Menu Group Mode | `brand` or `subcategory` |
| L | Variants (Flavours) | number of flavour variants (blank if unknown) |
| M | Filter 1 label | name of the filter (exact label from section 3) |
| N | Filter 1 value | |
| O | Filter 2 label | |
| P | Filter 2 value | |
| … | up to Filter 7 label/value | pairs; use only as many as that sub-category has; leave the rest blank |
| last | Note | anything uncertain, a decision I must confirm, or "NEW BRAND" |

Reason for label/value pairs instead of one column per filter: every sub-category has different filters, so a fixed pair layout stops the sheet from having 100 empty columns. Order the pairs exactly as listed in section 3.

Additional sheets in the same file:
1. **Brands to create** – every (Brand, Sub-category, Category) combination used in the main sheet that is NOT in my existing brand list (I will paste it below, or write "unknown" and list all brands you used).
2. **Decisions needed** – every product where the sub-category or brand is ambiguous (e.g. a "Starter Kit" could be Vape Devices or Pre-Filled Pods; "X Geek Bar" could be brand Stlth or Geek Bar). Put the question and your recommended default.
3. **Summary** – count of products per Category > Sub-category > Brand, and count of blank filter cells per filter (so I can see what data is missing).

## 5. Behaviour rules

- Do not change, merge or drop any product I give you; the output must have exactly as many rows as I gave.
- Do not create new Categories or Sub-categories. If something truly fits none, use the closest one and flag it in `Decisions needed`.
- Never invent puff counts, nicotine, pack sizes, or flavour counts. Derive from the title only when it is explicit (`5ct`, `4pc/Carton`, `36k`, `20mg/ML`).
- Read the puffs from the title's "K" (`36k` → `36000`), but if the description contradicts it, keep the title value and flag it.
- Keep my original titles' wording; only fix spacing/duplicate spaces and trailing region formatting.
- Before the final file, show me: total rows, rows with any blank required filter, list of new brands. Then the file.

## 6. Existing data I will give you

Existing brand list (Brand — Sub-category), paste here: `<PASTE OR "unknown">`

Products (title / handle / any details): `<PASTE PRODUCT LIST OR ATTACH FILE>`

---
