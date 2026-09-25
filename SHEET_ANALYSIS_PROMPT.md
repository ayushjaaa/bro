# Prompt: analyse the client's Shopify product sheet and propose taxonomy + filters

(Paste everything between the lines into Claude, then upload the client's Shopify product export .csv / .xlsx.)

---

You are a catalog analyst for a B2B wholesale store (vape, smoking, cannabis accessories, convenience) that runs on Shopify with a custom admin panel and storefront. I am uploading the client's **Shopify product export**. Your job is to **discover the structure from the data itself** and give me a sheet I can review. I will decide the final filters after I see your findings, so **propose, never impose**.

## 1. What is fixed and what is not

**Fixed (do not change, do not add):** exactly 4 top-level Categories:
1. VAPE
2. SMOKING
3. CANNABIS ACCESSORIES
4. CONVENIENCE

**Not fixed, you must discover from the data:**
- **Sub-categories** (each belongs to exactly one Category)
- **Brands** (each belongs to exactly one Sub-category; the same brand name under two sub-categories = two separate brand entries)
- **Region**
- **Filters** (which attributes should become storefront filters, per Sub-category)

The store's chain is: **Category → Sub-category → Brand → Product → Variants (Flavour)**. Flavour is a variant of a product, never a separate product. Shopify export has one row per variant, so **collapse all rows with the same Handle into ONE product**.

Hint only (may be wrong or incomplete, verify against data, and add/rename freely): sub-categories used so far are Disposable Vapes, E-Liquids / Vape Juice, Pre-Filled Pods, Vape Devices, Vape Hardware & Accessories (VAPE); Rolling Papers, Blunts & Wraps, Pre-Rolled Cones, Filters & Tips, Rolling Accessories, Tobacco, Torch Lighters, Butane (SMOKING); Glass, Dab & Concentrate, Grinders, Scales, Hookahs, Storage, Cleaning, Replacement Parts (CANNABIS ACCESSORIES); Car Air Fresheners, Lighters, Batteries, General Convenience (CONVENIENCE).

## 2. What to do, step by step

**Step 1: Profile the file.** Tell me: number of rows, number of unique products (by Handle), which columns exist, which are empty, and how filled the key ones are (Title, Vendor, Type, Product Category, Tags, Option1/2/3 Name+Value, Variant SKU, Variant Price, Body HTML). If several columns could hold the same information (e.g. Type vs Product Category vs Tags), say which one is reliable.

**Step 2: Region.** Find region from Title suffix (e.g. "- Federal"), Tags (`region-federal`, `region-bc`, `region-ab`, `region-mb`, `region-on`, `region-qc`) and any option/variant field. List every distinct region value found, product count per region, products with NO region, and products where title and tag disagree. Normalise to the tag format `region-federal`, `region-bc`, `region-ab`, `region-mb`, `region-on`, `region-qc`. Also detect **duplicate/cloned products** (same title, different region or "Batch N" / "copy" suffix) and group them.

**Step 3: Category and Sub-category.** For every product assign one Category (from the 4 fixed) and one Sub-category. Base it on Type, Product Category, Tags and Title, in that order of reliability, and tell me which signal you used per product (`Signal` column). Build the Sub-category list from the data: if the client's Type values are messy or inconsistent (e.g. "E-Liquid" vs "Vape Juice"), merge them and show me the mapping old value → proposed sub-category. If a product is ambiguous (e.g. "Starter Kit" could be Vape Devices or Pre-Filled Pods), pick your best default and put it in Decisions.

**Step 4: Brand.** Extract the brand for every product from Vendor first, then Title, then Tags. Rules:
- Vendor may be the **distributor**, not the brand (e.g. "Jubilee Distributors Ltd."); if one vendor value covers many unrelated brands, ignore Vendor and read the brand from the Title.
- Normalise spelling and case ("MR FOG" / "Mr Fog" / "mr fog" → one name). List every variant you merged.
- Product-line brands that are really a sub-brand or pod line (e.g. "Oxbar Maglink 90K Pods", "Mr Fog Switch Pods") must be flagged: tell me whether they look like a separate brand or belong under the parent brand, and let me decide.
- Brand is scoped to Sub-category: output the pair (Brand, Sub-category).
- Products whose brand you cannot determine: leave blank and list them.

**Step 5: Variants.** Report the option names used (Flavour, Color, Size, Nicotine, etc.). For each product give the variant count and the option names. If a product mixes several option types (e.g. Flavour AND Nicotine strength as options), flag it, since the store expects Flavour as the only variant option.

**Step 6: Filter discovery (most important).** For each Sub-category, look for attributes that repeat across its products and could serve as storefront filters. Search Title, Option names/values, Tags, and Body HTML (e.g. puff count "36K", nicotine "20mg/ML", pack "5ct", "4pc/Carton", bottle "30ml", size, battery capacity, color, material, compatibility, flavour type). For each candidate give:
- Sub-category, candidate filter name
- Source (title / option / tag / description)
- Coverage: how many products in that sub-category have it, and %
- Distinct values found with product count per value (after normalising, e.g. `36K` / `36000` / `36,000` → `36000`), and the raw variants you merged
- Conflicts (title says 60K, description says 80K)
- Your recommendation: **Recommend / Optional / Skip**, with one line why (e.g. "in 92% of products, 5 clean values → good filter"; "only 4% coverage → skip")

Do NOT invent values. Only report what is actually present in the data. Do not create filters for Brand, Price, Availability or Flavour; those already come from Shopify natively.

**Step 7: Problems.** List everything that would break an import or a filter: empty titles, duplicate handles with different data, products with no price, no SKU, missing Type, mixed regions inside one handle, products that fit none of the 4 categories, non-vape/non-smoking items, test/dummy products.

## 3. Output

Give me ONE Excel file (.xlsx; CSV per sheet only if you cannot make .xlsx) with these sheets:

1. **Summary**: totals, products per Category > Sub-category > Brand, products per Region, and your 5 most important findings.
2. **Products**: one row per product, columns in this order:
   `#`, `Handle`, `Title`, `Region Tag`, `Category`, `Sub-category`, `Brand`, `Variants`, `Variant Option Names`, `Original Vendor`, `Original Type`, `Original Tags`, `Signal Used`, `Confidence (High/Medium/Low)`, `Note`
3. **Sub-categories**: `Category`, `Sub-category`, `Product Count`, `Original Type values merged into it`, `New or in hint list`
4. **Brands**: `Category`, `Sub-category`, `Brand`, `Product Count`, `Spelling variants merged`, `Flag` (distributor / sub-brand / unclear / ok)
5. **Filter Candidates**: one row per (Sub-category, candidate filter): the fields listed in Step 6 including `Recommendation`
6. **Filter Values**: one row per (Sub-category, filter, normalised value): `Product Count`, `Raw variants merged`
7. **Product Attributes** (long format, so it works before I decide the filters): `Handle`, `Sub-category`, `Attribute`, `Value (normalised)`, `Raw text`, `Source`. Only include attributes that appear in the Filter Candidates sheet.
8. **Regions**: each region value, count, products with no region, products with conflicting region, clone groups.
9. **Decisions Needed**: numbered list, each with: the product(s), the question, options, your recommended default.
10. **Data Problems**: from Step 7, with Handle and what is wrong.

## 4. Rules

- Every product in the file must appear in **Products**; row count of that sheet = number of unique Handles. Do not drop or merge different products.
- Never guess a value. If not in the data, leave it blank and mark it. A blank is better than a wrong filter.
- Do not touch or reword titles; only trim extra spaces.
- Do not add a 5th Category, ever. If something fits none, put it in the closest one and flag it in Decisions Needed.
- Be consistent: the same value must have the same spelling everywhere (`20mg`, not `20 mg` in some rows).
- Before giving the file, show me a short chat summary: unique products, categories split, number of sub-categories found, number of brands, regions found, number of decisions needed, and the top filter candidates per sub-category. Then attach the file.

---
