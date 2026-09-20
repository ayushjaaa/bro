# Manual filter check: Disposable Vapes / Federal

Generated 2026-09-20T08:39:36.887Z from Shopify Admin data (products that are ACTIVE and published to Online Store). Total products in this bucket with no filter: **1603**.

## How to check

1. Run the storefront (`npm run dev` in storefront/), open `http://localhost:3000/products?category=vape&subcategory=disposable-vapes`, and make sure the header region is **Federal**.
2. Tick the checkbox(es) in the sidebar Filters (or open the direct link in the last column).
3. The page shows **24 products per page**. Count total by clicking Next until the end (pages = ceil(total / 24)).
4. Compare with "Expected total". "Example titles" are the first few in A-Z order, the on-screen order can differ; the point is every card must be a product that really has that value.

## A. One filter value at a time

| Filter | Value | Expected total | Pages | Example titles |
|---|---|---|---|---|
| Puff Count | 600 | 24 | 1 | 10Geek Bar Pulse 2 - 4pc/Ctn - Federal; 10Ripper XXX Disposable Vape (20mg/ML / 5PCs) - Federal; 16GEEK BAR PULSE X DISPOSABLE (4PC/CTN = Federal - Federal |
| Puff Count | 2000 | 23 | 1 | 12Ripper XXX Disposable Vape (20mg/ML / 5PCs) - Federal; 15STLTH ECO XL DISPOSABLE - 5PCS/CTN - Federal; 16Ripper Sleek 8ml Disposable Vape 5ct 0mg/ML - Federal |
| Puff Count | 5000 | 28 | 2 | 11STLTH ECO XL DISPOSABLE - 5PCS/CTN - Federal; 12Ripper Sleek 8ml Disposable Vape 5ct 0mg/ML - Federal; 14GEEK BAR PULSE X DISPOSABLE (4PC/CTN = Federal - Federal |
| Puff Count | 7000 | 29 | 2 | 10GEEK BAR PULSE X DISPOSABLE (4PC/CTN = Federal - Federal; 11Stlth X Geek Bar Disposable (4pcs/ctn) - Federal; 12Rocky Vapor Oxbar Tri Fusion - 5pc/Carton - Federal |
| Puff Count | 10000 | 28 | 2 | 10Ripper Sleek 8ml Disposable Vape 5ct 0mg/ML - Federal; 12GEEK BAR PULSE X DISPOSABLE (4PC/CTN = Federal - Federal; 13Stlth X Geek Bar Disposable (4pcs/ctn) - Federal |
| Puff Count | 15000 | 27 | 2 | 10Rocky Vapor Oxbar Tri Fusion - 5pc/Carton - Federal; 11Ripper Sleek 8ml Disposable Vape 5CT 20mg/ml - Federal; 15Geek Bar Pulse 2 - 4pc/Ctn - Federal |
| Puff Count | 20000 | 25 | 2 | 11Geek Bar Pulse 2 - 4pc/Ctn - Federal; 11Ripper XXX Disposable Vape (20mg/ML / 5PCs) - Federal; 13Ripper Sleek 8ml Disposable Vape 5CT 20mg/ml - Federal |
| Puff Count | 25000 | 28 | 2 | 13Geek Bar Pulse 2 - 4pc/Ctn - Federal; 13Ripper XXX Disposable Vape (20mg/ML / 5PCs) - Federal; 16STLTH ECO XL DISPOSABLE - 5PCS/CTN - Federal |
| Puff Count | 30000 | 26 | 2 | 12STLTH ECO XL DISPOSABLE - 5PCS/CTN - Federal; 15GEEK BAR PULSE X DISPOSABLE (4PC/CTN = Federal - Federal; 16Stlth X Geek Bar Disposable (4pcs/ctn) - Federal |
| Puff Count | 40000 | 524 | 22 | 10Mr Fog Nova 36k Apple Steezy Series Disposable 5ct - Federal; 10Mr Fog Nova 36k Banana Steezy Series Disposable 5ct - Federal; 10Mr Fog Nova 36k Berry Steezy Series Disposable 5ct - Federal |
| Puff Count | 60000 | 343 | 15 | 10Drip'n by Envi EVO 63K Disposable 4pc/Carton - Federal; 10ELFBAR FS70K DISPOSABLE (4PCS/CTN) - Federal; 10Flavour Beast Beast Mode Max 3 60k Disposable 4ct 20mg/Ml - Federal |
| Puff Count | 80000 | 252 | 11 | 10Flavour Beast Alpha 80k Disposable 4/ct - Federal; 10Gcore Runner 80K Disposable Vape 20mg/ml 5CT - Federal; 10Insta Bar 80K (4pc/Carton) - Federal |
| Puff Count | 100000 | 69 | 3 | 10Drip'n Daily 100K 20mg/ML 4CT - Federal; 11Drip'n Daily 100K 20mg/ML 4CT - Federal; 12Drip'n Daily 100K 20mg/ML 4CT - Federal |
| Puff Count | 120000 | 120 | 5 | 10Orbito Lumo AI 120K (20mg) (4pc/Carton) - Federal; 10Ripper Matrix 130K Disposable Vape 30ml 20mg/ML 5pc - Federal; 10Ripper Sleek 8ml Disposable Vape 5CT 20mg/ml - Federal |
| Puff Count | _(product has no value)_ | 57 | 3 | never appears under any Puff Count checkbox |
| Nicotine Strength | 0mg | 686 | 29 | 10Drip'n by Envi EVO 63K Disposable 4pc/Carton - Federal; 10Drip'n Daily 100K 20mg/ML 4CT - Federal; 10Flavour Beast Beast Mode Max 3 60k Disposable 4ct 20mg/Ml - Federal |
| Nicotine Strength | 20mg | 285 | 12 | 10ELFBAR FS70K DISPOSABLE (4PCS/CTN) - Federal; 10Flavour Beast Alpha 80k Disposable 4/ct - Federal; 10Mr Fog Nova 36k Bubble Gang Series Disposable 5ct - Federal |
| Nicotine Strength | 35mg | 284 | 12 | 10Geek Bar Pulse 2 - 4pc/Ctn - Federal; 10Insta Bar 80K (4pc/Carton) - Federal; 10Mr Fog Aura Splash 60k - 5pc/Carton - Federal |
| Nicotine Strength | 50mg | 277 | 12 | 10Mr Fog Aura Rainbow 60k - 5pc/Carton - Federal; 10Mr Fog Nova 36k Mellow Man Series Disposable 5ct - Federal; 10Mr Fog Nova 36k Peach Steezy Series Disposable 5ct - Federal |
| Nicotine Strength | _(product has no value)_ | 71 | 3 | never appears under any Nicotine Strength checkbox |
| Nicotine Type | Freebase | 542 | 23 | 10Flavour Beast Alpha 80k Disposable 4/ct - Federal; 10Flavour Beast Beast Mode Max 3 60k Disposable 4ct 20mg/Ml - Federal; 10GEEK BAR PULSE X DISPOSABLE (4PC/CTN = Federal - Federal |
| Nicotine Type | Nicotine Salt | 534 | 23 | 10Drip'n by Envi EVO 63K Disposable 4pc/Carton - Federal; 10Drip'n Daily 100K 20mg/ML 4CT - Federal; 10ELFBAR FS70K DISPOSABLE (4PCS/CTN) - Federal |
| Nicotine Type | Nicotine-Free | 525 | 22 | 10Gcore Runner 80K Disposable Vape 20mg/ml 5CT - Federal; 10Geek Bar Pulse 2 - 4pc/Ctn - Federal; 10MR FOG AURA 60K Disposable - 5Pc/Carton = Federal - Federal |
| Nicotine Type | _(product has no value)_ | 2 | 1 | never appears under any Nicotine Type checkbox |
| Device Type | Standard Disposable | 540 | 23 | 10Insta Bar 80K (4pc/Carton) - Federal; 10MR FOG AURA 60K Disposable - 5Pc/Carton = Federal - Federal; 10Mr Fog Nova 36k Apple Steezy Series Disposable 5ct - Federal |
| Device Type | Rechargeable Disposable | 543 | 23 | 10Drip'n Daily 100K 20mg/ML 4CT - Federal; 10Flavour Beast Beast Mode Max 3 60k Disposable 4ct 20mg/Ml - Federal; 10Gcore Runner 80K Disposable Vape 20mg/ml 5CT - Federal |
| Device Type | Mesh Coil | 519 | 22 | 10Drip'n by Envi EVO 63K Disposable 4pc/Carton - Federal; 10ELFBAR FS70K DISPOSABLE (4PCS/CTN) - Federal; 10Flavour Beast Alpha 80k Disposable 4/ct - Federal |
| Device Type | _(product has no value)_ | 1 | 1 | never appears under any Device Type checkbox |
| Pack Quantity | Single | 161 | 7 | 10Drip'n by Envi EVO 63K Disposable 4pc/Carton - Federal; 10ELFBAR FS70K DISPOSABLE (4PCS/CTN) - Federal; 10Flavour Beast Alpha 80k Disposable 4/ct - Federal |
| Pack Quantity | 5-Pack | 1118 | 47 | 10Gcore Runner 80K Disposable Vape 20mg/ml 5CT - Federal; 10Insta Bar 80K (4pc/Carton) - Federal; 10MR FOG AURA 60K Disposable - 5Pc/Carton = Federal - Federal |
| Pack Quantity | 10-Pack | 151 | 7 | 10Drip'n Daily 100K 20mg/ML 4CT - Federal; 10Flavour Beast Beast Mode Max 3 60k Disposable 4ct 20mg/Ml - Federal; 10Orbito Lumo AI 120K (20mg) (4pc/Carton) - Federal |
| Pack Quantity | Display Box | 127 | 6 | 12Oxbar Maglink 90K Starter Kit (4pcs/Carton) - Federal; 12STLTH 60K Disposable - 4Pc/ Carton - Federal; 13Drip'n by Envi EVO 63K Disposable 4pc/Carton - Federal |
| Pack Quantity | _(product has no value)_ | 46 | 2 | never appears under any Pack Quantity checkbox |

## B. Combinations (all ticked together)

| # | Filters | Expected total | Pages | Direct link suffix |
|---|---|---|---|---|
| 1 | Nicotine Strength = 35mg AND Nicotine Type = Nicotine Salt | **93** | 4 | `&disposable_vape_nicotine_strength=35mg&disposable_vape_nicotine_type=Nicotine%20Salt` |
| 2 | Puff Count = 60000 AND Device Type = Rechargeable Disposable | **111** | 5 | `&disposable_vape_puff_count=60000&disposable_vape_device_type=Rechargeable%20Disposable` |
| 3 | Nicotine Strength = 20mg or 35mg | **569** | 24 | `&disposable_vape_nicotine_strength=20mg&disposable_vape_nicotine_strength=35mg` |
| 4 | Puff Count = 40000 AND Nicotine Strength = 50mg AND Pack Quantity = 5-Pack | **116** | 5 | `&disposable_vape_puff_count=40000&disposable_vape_nicotine_strength=50mg&disposable_vape_pack_quantity=5-Pack` |
| 5 | Puff Count = 100000 AND Nicotine Strength = 0mg AND Nicotine Type = Freebase AND Device Type = Mesh Coil AND Pack Quantity = Display Box | **0** (empty state) | 0 | `&disposable_vape_puff_count=100000&disposable_vape_nicotine_strength=0mg&disposable_vape_nicotine_type=Freebase&disposable_vape_device_type=Mesh%20Coil&disposable_vape_pack_quantity=Display%20Box` |
| 6 | Puff Count = 600 or 2000 AND Nicotine Type = Nicotine-Free | **13** | 1 | `&disposable_vape_puff_count=600&disposable_vape_puff_count=2000&disposable_vape_nicotine_type=Nicotine-Free` |
| 7 | Puff Count = 40000 or 60000 or 80000 AND Nicotine Strength = 20mg or 35mg AND Device Type = Standard Disposable | **151** | 7 | `&disposable_vape_puff_count=40000&disposable_vape_puff_count=60000&disposable_vape_puff_count=80000&disposable_vape_nicotine_strength=20mg&disposable_vape_nicotine_strength=35mg&disposable_vape_device_type=Standard%20Disposable` |
| 8 | Puff Count = 600 AND Nicotine Strength = 0mg AND Pack Quantity = Single AND Device Type = Standard Disposable | **0** (empty state) | 0 | `&disposable_vape_puff_count=600&disposable_vape_nicotine_strength=0mg&disposable_vape_pack_quantity=Single&disposable_vape_device_type=Standard%20Disposable` |
| 9 | Puff Count = 600 AND Nicotine Strength = 0mg AND Pack Quantity = Single AND Device Type = Rechargeable Disposable | **0** (empty state) | 0 | `&disposable_vape_puff_count=600&disposable_vape_nicotine_strength=0mg&disposable_vape_pack_quantity=Single&disposable_vape_device_type=Rechargeable%20Disposable` |
| 10 | Puff Count = 600 AND Nicotine Strength = 0mg AND Pack Quantity = Single AND Device Type = Mesh Coil | **0** (empty state) | 0 | `&disposable_vape_puff_count=600&disposable_vape_nicotine_strength=0mg&disposable_vape_pack_quantity=Single&disposable_vape_device_type=Mesh%20Coil` |

Rule: values inside ONE filter are OR (any of them), different filters are AND (all must match).

## Notes

- Titles with a leading number (1, 2, 3...) are clones of the same real product.
- 2 older products (Elf Bar) have no Nicotine Type / Device Type / Pack Quantity, so they only show under Puff/Nicotine filters they actually have.
- Some products deliberately have an empty Nicotine, Puff or Pack value, to check they never appear under a checkbox.
