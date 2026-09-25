# Taxonomy Mapping vs Current Shopify Products

Source: `taxonomy_mapping_review (1) (2).pdf` (47 products, proposed Category / Sub-category / Brand / filter values) compared against the **live Shopify store** (read-only fetch, 83 products in store, 2026-09-24).
**Nothing has been changed in Shopify.** This file is the plan to review before any update.

## 1. Summary

| | Count |
|---|---|
| Products in the sheet | 47 |
| Found in the live store (matched by handle) | 33 |
| **Not in the live store** (need to be created/imported) | 14 |
| Live products where **Type (sub-category)** differs from sheet | 3 |
| Live products where **Brand/Vendor** differs from sheet | 5 |
| Live products where **Title** differs from sheet | 1 |
| Live products where **variant count** differs from sheet | 4 |
| Live products where the brand link (`taxonomy.brand`) was readable | 0 of 33 |

Sheet-wide constants: every product is Category = **Vapes**. Sub-categories: Disposable Vapes (40), Pre-Filled Pods (6), E-Liquids / Vape Juice (1).

## 2. Decisions needed before updating (from the sheet's review notes)

| # | Product | Question |
|---|---|---|
| 2 | GEEK BAR PULSE X DISPOSABLE (4PC/CTN = Federal | Description also mentions 15,000 in Pulse Mode – verify |
| 16 | Oxbar Maglink 90K Starter Kit (4pcs/Carton) - Federal | CONFIRM: Starter Kit (device + pod) – could belong in Vape Devices |
| 23 | Stlth X Geek Bar Disposable (4pcs/ctn) - Federal | Title is "Stlth X Geek Bar" – placed under Stlth (could be Geek Bar) |
| 27 | MR FOG SWITCH POD KIT (5pcs/pack) - Federal | CONFIRM: Pod Kit / device (45K pod system) – could belong in Vape Devices |
| 34 | Rocky Vapor Oxbar G100K 20mg (4pc/Carton) - Federal | Title says "Rocky Vapor Oxbar" – placed under Oxbar |
| 39 | Geek Bar Pulse 2 - 4pc/Ctn - Federal | Description says 80,000 puffs – verify |
| 43 | ENVI X TasteFlex Cresmo 125K Disposable 4ct 20mg/ML - Federal | NEW brand (could merge into Drip'n) |

## 3. Brands: sheet vs Shopify brand list

Brand names that exist in Shopify's `brand` metaobject list: checked against the 49 names currently there.

| Brand in sheet | # products | In Shopify brand list? |
|---|---|---|
| Mr Fog | 13 | Yes |
| Geek Bar | 4 | Yes |
| Drip'n | 4 | Yes |
| Ripper | 4 | Yes |
| Flavour Beast | 3 | Yes |
| Oxbar Maglink 90K Pods | 2 | Yes |
| Oxbar | 2 | Yes |
| Mr Fog Switch Pods | 2 | Yes |
| Flavour Beast Pods | 1 | Yes |
| Ripper X 75K Pods | 1 | Yes |
| Stlth | 1 | Yes |
| CAPSL | 1 | **NO – add it** |
| Kraze | 1 | Yes |
| Elf Bar | 1 | Yes |
| Linvo | 1 | **NO – add it** |
| Orbito | 1 | **NO – add it** |
| Gcore | 1 | Yes |
| Vice | 1 | Yes |
| ENVI x TasteFlex | 1 | **NO – add it** |
| VFEEL | 1 | **NO – add it** |
| Dojo | 1 | **NO – add it** |

Brands that must be added before those products can be mapped: CAPSL, Linvo, Orbito, ENVI x TasteFlex, VFEEL, Dojo.
Note: "Flavour Beast" and "Oxbar" etc. exist more than once in Shopify's list (one per sub-category), so the right one must be picked (Disposable Vapes vs Pre-Filled Pods vs E-Liquids).

## 4. Products already in the store – what would change

Only products with at least one difference are listed. Products not listed here already match the sheet on Type, Brand/Vendor, Title and variant count.

| # | Handle | Changes |
|---|---|---|
| 12 | `ripper-x-75k-20mg-ml-5pcs-alberta-copy-1` | Type: E-Liquids / Vape Juice → Pre-Filled Pods<br>Brand/Vendor: Jubilee Distributors Ltd. → Ripper X 75K Pods<br>Title: "Ripper X 75K (20mg/ML / 5PCs)  - Federal" → "Ripper X 75K (20mg/ML / 5PCs) - Federal"<br>Variants: 78 in store vs 80 in sheet |
| 16 | `oxbar-maglink-90k-starter-kit-4pcs-carton-federal` | Type: Disposable Vapes → Pre-Filled Pods<br>Brand/Vendor: Oxbar → Oxbar Maglink 90K Pods |
| 27 | `mr-fog-switch-pod-kit-5pcs-pack` | Type: Vape Devices → Pre-Filled Pods<br>Brand/Vendor: Mr Fog Drt Device → Mr Fog Switch Pods<br>Variants: 46 in store vs 47 in sheet |
| 28 | `dripn-by-envi-evo-63k-disposable-4pc-carton-federal` | Variants: 33 in store vs 32 in sheet |
| 31 | `flavour-beast-alpha-80k-disposable-4-ct-federal` | Variants: 67 in store vs 76 in sheet |
| 36 | `orbito-lumo-ai-120k-20mg-4pc-carton-federal` | Brand/Vendor: Jubilee Distributors Ltd. → Orbito |
| 44 | `vfeel-keyplay-40000-puffs-disposable-20mg-ml-federal` | Brand/Vendor: Jubilee Distributors Ltd. → VFEEL |

### Already matching (no change on those 4 fields)
- 2. `geek-bar-pulse-x-disposable-4pc-ctn-excise-version`
- 5. `mr-fog-nova-36k-mint-steezy-series-disposable-5ct-federal`
- 7. `ripper-xxx-20mg-ml-5pcs-federal`
- 8. `mr-fog-nova-36k-pop-up-series-disposable-5ct-federal`
- 9. `mr-fog-nova-36k-lemon-steezy-disposable-5ct-federal`
- 10. `mr-fog-nova-36k-bubble-gang-series-disposable-5ct-federal`
- 11. `mr-fog-aura-60k-disposable-5pc-carton-alberta-copy`
- 13. `mr-fog-nova-36k-peach-steezy-series-disposable-5ct-federal`
- 14. `mr-fog-nova-36k-berry-steezy-series-disposable-5ct-federal`
- 15. `mr-fog-nova-36k-magic-cotton-series-disposable-5ct-federal`
- 17. `oxbar-maglink-90k-pre-filled-pods-4pcs-carton-federal`
- 18. `oxbar-m85k-4pc-carton-federal`
- 19. `mr-fog-nova-36k-apple-steezy-series-disposable-5ct-federal`
- 20. `mr-fog-nova-36k-mellow-man-series-disposable-5ct-federal`
- 21. `mr-fog-nova-36k-banana-steezy-series-disposable-5ct-federal`
- 22. `ripper-sleek-8ml-disposable-vape-5ct-federal`
- 23. `stlth-x-geek-bar-disposable-4pcs-ctn-federal`
- 29. `mr-fog-aura-rainbow-60k-5pc-carton-federal`
- 30. `mr-fog-aura-splash-60k-5pc-carton-federal`
- 33. `mr-fog-switch-pods-5pcs-pack-federal`
- 35. `ripper-sleek-8ml-disposable-vape-5ct-0mg-ml-federal`
- 37. `dripn-daily-100k-20mg-ml-4ct-federal`
- 38. `flavour-beast-beast-mode-max-3-60k-disposable-5ct-20mg-ml-federal`
- 39. `geek-bar-pulse-2-4pc-ctn-federal`
- 40. `flavour-beast-x-oxva-20mg-30ml-federal`
- 45. `ripper-matrix-130k-disposable-vape-30ml-20mg-ml-5pc-federal`

## 5. Filter values to set on the 33 existing products

These are the sheet's proposed filter values (blank = not stated anywhere, not guessed).
Current filter values were **not compared**: the API returned no metafields at all for these products (either none are set, or this token cannot read them), so treat every non-blank value below as an addition and re-check in the admin before overwriting anything.

| # | Handle | Brand | Sub-category | Puff count | Nicotine | Nic type | Pack qty | Device compat | Bottle | Note |
|---|---|---|---|---|---|---|---|---|---|---|
| 2 | `geek-bar-pulse-x-disposable-4pc-ctn-excise-version` | Geek Bar | Disposable Vapes | 25,000 | — | — | 4 | — | — | Description also mentions 15,000 in Pulse Mode – verify |
| 5 | `mr-fog-nova-36k-mint-steezy-series-disposable-5ct-federal` | Mr Fog | Disposable Vapes | 36,000 | — | — | 5 | — | — |  |
| 7 | `ripper-xxx-20mg-ml-5pcs-federal` | Ripper | Disposable Vapes | — | 20mg | — | 5 | — | — |  |
| 8 | `mr-fog-nova-36k-pop-up-series-disposable-5ct-federal` | Mr Fog | Disposable Vapes | 36,000 | — | — | 5 | — | — |  |
| 9 | `mr-fog-nova-36k-lemon-steezy-disposable-5ct-federal` | Mr Fog | Disposable Vapes | 36,000 | — | — | 5 | — | — |  |
| 10 | `mr-fog-nova-36k-bubble-gang-series-disposable-5ct-federal` | Mr Fog | Disposable Vapes | 36,000 | — | — | 5 | — | — |  |
| 11 | `mr-fog-aura-60k-disposable-5pc-carton-alberta-copy` | Mr Fog | Disposable Vapes | 60,000 | — | — | 5 | — | — |  |
| 12 | `ripper-x-75k-20mg-ml-5pcs-alberta-copy-1` | Ripper X 75K Pods | Pre-Filled Pods | — | 20mg | — | 5 | — | — | Shopify category was "E-Liquid" but this is a pod |
| 13 | `mr-fog-nova-36k-peach-steezy-series-disposable-5ct-federal` | Mr Fog | Disposable Vapes | 36,000 | — | — | 5 | — | — |  |
| 14 | `mr-fog-nova-36k-berry-steezy-series-disposable-5ct-federal` | Mr Fog | Disposable Vapes | 36,000 | — | — | 5 | — | — |  |
| 15 | `mr-fog-nova-36k-magic-cotton-series-disposable-5ct-federal` | Mr Fog | Disposable Vapes | 36,000 | — | — | 5 | — | — |  |
| 16 | `oxbar-maglink-90k-starter-kit-4pcs-carton-federal` | Oxbar Maglink 90K Pods | Pre-Filled Pods | — | — | — | 4 | — | — | CONFIRM: Starter Kit (device + pod) – could belong in Vape Devices |
| 17 | `oxbar-maglink-90k-pre-filled-pods-4pcs-carton-federal` | Oxbar Maglink 90K Pods | Pre-Filled Pods | — | 20mg | Salt Nic | 4 | Oxbar Maglink | — |  |
| 18 | `oxbar-m85k-4pc-carton-federal` | Oxbar | Disposable Vapes | 85,000 | — | — | 4 | — | — |  |
| 19 | `mr-fog-nova-36k-apple-steezy-series-disposable-5ct-federal` | Mr Fog | Disposable Vapes | 36,000 | — | — | 5 | — | — |  |
| 20 | `mr-fog-nova-36k-mellow-man-series-disposable-5ct-federal` | Mr Fog | Disposable Vapes | 36,000 | — | — | 5 | — | — |  |
| 21 | `mr-fog-nova-36k-banana-steezy-series-disposable-5ct-federal` | Mr Fog | Disposable Vapes | 36,000 | — | — | 5 | — | — |  |
| 22 | `ripper-sleek-8ml-disposable-vape-5ct-federal` | Ripper | Disposable Vapes | 20,000 | 20mg | — | 5 | — | — |  |
| 23 | `stlth-x-geek-bar-disposable-4pcs-ctn-federal` | Stlth | Disposable Vapes | 80,000 | 20mg | — | 4 | — | — | Title is "Stlth X Geek Bar" – placed under Stlth (could be Geek Bar) |
| 27 | `mr-fog-switch-pod-kit-5pcs-pack` | Mr Fog Switch Pods | Pre-Filled Pods | — | — | — | 5 | — | — | CONFIRM: Pod Kit / device (45K pod system) – could belong in Vape Devices |
| 28 | `dripn-by-envi-evo-63k-disposable-4pc-carton-federal` | Drip'n | Disposable Vapes | 63,000 | 20mg | — | 4 | — | — |  |
| 29 | `mr-fog-aura-rainbow-60k-5pc-carton-federal` | Mr Fog | Disposable Vapes | 60,000 | — | — | 5 | — | — |  |
| 30 | `mr-fog-aura-splash-60k-5pc-carton-federal` | Mr Fog | Disposable Vapes | 60,000 | — | — | 5 | — | — |  |
| 31 | `flavour-beast-alpha-80k-disposable-4-ct-federal` | Flavour Beast | Disposable Vapes | 80,000 | — | — | 4 | — | — |  |
| 33 | `mr-fog-switch-pods-5pcs-pack-federal` | Mr Fog Switch Pods | Pre-Filled Pods | — | 20mg | Salt Nic | 5 | Mr Fog Switch | — |  |
| 35 | `ripper-sleek-8ml-disposable-vape-5ct-0mg-ml-federal` | Ripper | Disposable Vapes | 20,000 | 0mg | — | 5 | — | — |  |
| 36 | `orbito-lumo-ai-120k-20mg-4pc-carton-federal` | Orbito | Disposable Vapes | 120,000 | 20mg | Salt Nic | 4 | — | — | NEW brand (old tags also say Oxbar) |
| 37 | `dripn-daily-100k-20mg-ml-4ct-federal` | Drip'n | Disposable Vapes | 100,000 | 20mg | — | 4 | — | — |  |
| 38 | `flavour-beast-beast-mode-max-3-60k-disposable-5ct-20mg-ml-federal` | Flavour Beast | Disposable Vapes | 60,000 | 20mg | — | 4 | — | — |  |
| 39 | `geek-bar-pulse-2-4pc-ctn-federal` | Geek Bar | Disposable Vapes | 80,000 | 20mg | — | 4 | — | — | Description says 80,000 puffs – verify |
| 40 | `flavour-beast-x-oxva-20mg-30ml-federal` | Flavour Beast | E-Liquids / Vape Juice | — | 20mg | Salt Nic | — | — | 30 mL |  |
| 44 | `vfeel-keyplay-40000-puffs-disposable-20mg-ml-federal` | VFEEL | Disposable Vapes | 40,000 | 20mg | — | 5 | — | — | NEW brand |
| 45 | `ripper-matrix-130k-disposable-vape-30ml-20mg-ml-5pc-federal` | Ripper | Disposable Vapes | 130,000 | 20mg | — | 5 | — | — |  |

## 6. In the sheet but NOT in the live store (14)

No product with these handles exists in Shopify, and none is in the old catalog export (`JUBILEE_PRODUCT_CATALOG.md`) either. They look like new products to create/import (or the store uses different handles – check before creating duplicates).

| # | Handle | Title (sheet) | Brand | Sub-category | Variants | Brand is new? |
|---|---|---|---|---|---|---|
| 1 | `geek-bar-pulse-9000-puffs-disposable-vape-4ct-excise-version` | Geek Bar Pulse 9000 Puffs Disposable Vape 4CT - Federal | Geek Bar | Disposable Vapes | 28 | No |
| 3 | `dripn-by-envi-26ml-disposable-5pc-carton-federal` | Drip'n by Envi 26ML Disposable - 5pc/Carton = Federal | Drip'n | Disposable Vapes | 17 | No |
| 4 | `dripn-by-envi-8ml-disposable-5pc-carton-federal` | Drip'n by Envi 8ML Disposable - 5pc/Carton - Federal | Drip'n | Disposable Vapes | 13 | No |
| 6 | `level-x-flavour-beast-g2-ultra-50k-puffs-alberta-copy` | Level X Flavour Beast G2 Ultra 50K Puffs - Federal | Flavour Beast Pods | Pre-Filled Pods | 92 | No |
| 24 | `capsl-afx17-60k-20mg-disposable-4pc-carton-federal` | CAPSL AFX17 60K 20MG Disposable 4pc/Carton - Federal | CAPSL | Disposable Vapes | 19 | **Yes** |
| 25 | `kraze-mega-x-20mg-4pc-carton-federal` | Kraze Mega X - 20mg 4pc/Carton - Federal | Kraze | Disposable Vapes | 41 | No |
| 26 | `elf-bar-bc-pro-80k-disposable-vape-5ct-federal` | Elf Bar BC Pro 80K Disposable Vape - 5ct - Federal | Elf Bar | Disposable Vapes | 15 | No |
| 32 | `linvo-beyond-100k-disposable-4-ctn-federal` | Linvo Beyond 100K Disposable - 4 Ctn - Federal | Linvo | Disposable Vapes | 10 | **Yes** |
| 34 | `rocky-vapor-oxbar-g100k-20mg-4pc-carton-federal` | Rocky Vapor Oxbar G100K 20mg (4pc/Carton) - Federal | Oxbar | Disposable Vapes | 15 | No |
| 41 | `gcore-yuniq-20mg-ml-80k-5pcs-federal` | Gcore YUNIQ (20mg/ML) 80K (5pcs) - Federal | Gcore | Disposable Vapes | 10 | No |
| 42 | `vice-x-nexa-disposable` | VICE X NEXA 80K Disposable 4ct 20 mg/ML - Federal | Vice | Disposable Vapes | 11 | No |
| 43 | `envi-x-tasteflex-cresmo-125k-disposable-4ct-20mg-ml-federal` | ENVI X TasteFlex Cresmo 125K Disposable 4ct 20mg/ML - Federal | ENVI x TasteFlex | Disposable Vapes | 10 | **Yes** |
| 46 | `dojo-purex-disposable-20mg-ml-bc` | DOJO PUREX Disposable 20mg/ML 5CT - Federal | Dojo | Disposable Vapes | 10 | **Yes** |
| 47 | `geek-bar-pulse-x-2-disposable-vape-100k-puffs-4ct-20mg-ml-federal` | Geek Bar Pulse X 2 Disposable Vape 100K Puffs 4CT 20mg/ML - Federal | Geek Bar | Disposable Vapes | 16 | No |

## 7. Live store products not in the sheet
The store has 50 other products (batteries/devices, e-liquids, other disposables). This sheet does not cover them, so they are untouched.

## 8. Suggested order of work
1. Answer the decisions in section 2.
2. Add the 6 new brands to the taxonomy (section 3).
3. Update the 33 existing products (sections 4 and 5): Type, Vendor, Title, brand link, filter values.
4. Create the 14 missing products (section 6) with their variants.
5. Re-run the comparison to confirm zero differences.

## 9. Applied on 2026-09-25
- Added 6 brands (Disposable Vapes): CAPSL, Linvo, Orbito, ENVI x TasteFlex, VFEEL, Dojo.
- Updated 31 of the 33 existing products: `taxonomy.brand` link, Type (sub-category) and Vendor (brand). Row 12 also got its double-space title fixed. Re-read from Shopify afterwards: all 31 match the sheet.
- Skipped on purpose: rows 16 and 27 (the two kits, placement undecided).
- NOT done: filter values (puff count, nicotine, pack qty, etc. – the existing filter choice lists do not contain the sheet's values, e.g. puff counts stop at 30,000), variant-count differences (rows 12, 27, 28, 31), and the 14 products missing from the store (the sheet has no variant/flavour names to create them from).
