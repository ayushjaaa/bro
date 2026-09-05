# Product Listing Page — Poora Architecture (Simple Explanation)

> Ye document us system ko explain karta hai jo `/products` page par products dikhata hai —
> Taxonomy (Category/Sub-category/Brand), Filters, aur ye kaunsa kaam Shopify khud karta hai
> vs kaunsa kaam humara apna code karta hai.

---

## 0. API Call Inventory — Har Ek Call, Bilkul Specific

Is poore system mein sirf **2 real Shopify API calls** hain. Baaki sab kuch static data ya humara
apna in-memory code hai. Yaha har ek ki poori detail hai — kaunsa independent hai, kaunsa kis pe
depend karta hai.

### CALL A — Taxonomy + Filter-Definitions Call (INDEPENDENT)

- **Function:** `getTaxonomyTree()` — file `storefront/src/lib/shopify/queries/taxonomy.ts`
- **Kab chalta hai:** Page load hote hi, ek baar (cached 1 ghante ke liye, tag `taxonomy-tree`)
- **Kis pe depend karta hai:** Kisi pe nahi — independent hai. User ne abhi tak kuch select nahi
  kiya hota, phir bhi ye chal jaata hai.
- **Shopify se kya maangta hai (ek hi GraphQL request mein 2 cheezein):**
  1. `metaobjects(type: "category")` → sab Categories (Vapes, Smoking, etc.)
  2. `metaobjects(type: "sub_category")` → sab Sub-categories + **unke `relevant_filters`**
     (yaani filter ka `key`/`label`/`choices` bhi **isi call mein** aata hai — alag call nahi
     lagti)
- **Ye kya-kya deta hai (dono sidebar tree AUR filter-panel options isi se aate hain):**
  - ✅ Sidebar mein Category list
  - ✅ Sidebar mein Sub-category list (kis Category ke andar kaunsi Sub-category hai)
  - ✅ Filter panel mein "Size"/"Nicotine Strength" jaise labels
  - ✅ Har filter ke checkbox options (`choices`, jaise `["0mg","20mg","35mg","50mg"]`)
- **Ye NAHI deta:** Brand list, Products, Prices — inme se kuch bhi nahi

### CALL B — Product Fetch Call (DEPENDENT — user ke selection par)

- **Function:** `getSubcategoryProducts()` — file `storefront/src/lib/shopify/queries/product-listing.ts`
- **Kab chalta hai:** Jab bhi user Sub-category badle, Brand checkbox badle, ya Filter checkbox
  badle (React `useEffect` in teeno ko "watch" karta hai)
- **Kis pe depend karta hai:**
  - `subcategoryName` ← sidebar mein user ne kya click kiya (CALL A ke data se)
  - `region` ← visitor ka cookie (Shopify se nahi, humara code padhta hai)
  - `brands` ← Brand checkbox mein kya check kiya (list khud static hai, niche dekho)
  - `filterKeys` ← CALL A ke `relevant_filters` se nikle real metafield keys, active Sub-category ke liye
  - `selectedFilterValues` ← Filter checkbox mein kya check kiya
- **Shopify se kya maangta hai:**
  ```
  products(query: "product_type:'X' AND vendor:'Y' AND tag:'region-Z'", first, after)
  ```
  saath mein har product ke liye `metafields(identifiers: [...])` (Size/Material ki raw value)
- **Ye kya deta hai:** Products ki list (title, image, price, brand, aur unki filter-values)
- **Special case:** Agar koi Filter-value checkbox bhi check hai, to ye function **ek dusra,
  bada scan (up to 250)** bhi karta hai isi query se, taaki `matchesSelectedFilters()` (niche
  dekho) uspe chal sake — ye bhi Shopify hi ka call hai, bas ek extra baar.

### Brand Checkbox List — YE LIVE NAHI HAI (important correction)

Filter-panel mein "Brand" checkbox ke niche jo names dikhte hain (Flavour Beast, Oxbar, ...) —
**ye kisi API call se NAHI aate.** Ye `storefront/src/features/products/catalog.ts` ki
**static/hardcoded list** hai (`brands: [...]` array), jo `live-catalog.ts` sidebar mein bridge
kar deta hai.

Matlab: Brand **select karna** to live Shopify query mein jaata hai (CALL B, `vendor:` se), lekin
**checkbox mein kaunse Brand naam dikhenge**, wo abhi bhi hardcoded hai — admin panel ki real
Brand list se live nahi khinchta. Ye ek honest gap hai (§9 mein bhi list hai).

### Filter-Matching Logic — Ye KOI API Call Nahi Hai

`matchesSelectedFilters()` — koi network call nahi karta, **humare apne server code mein**, CALL B
se jo products already aa chuke hain, unhi ke upar JavaScript `.filter()` chalata hai. Ye
Server Action (`fetchSubcategoryProductsAction`) ke andar, server pe (browser mein nahi) hota hai —
CALL B poora hone ke *turant baad*, usi request ke andar.

### Poori Chain — Ek Nazar Mein

```
CALL A (taxonomy-tree, independent, 1x per page load)
   │
   ├── Sidebar Category/Sub-category list
   └── Filter-panel labels + choices
            │
            ▼ (user click karta hai)
   filterKeys nikalte hain CALL A ke data se
            │
            ▼
CALL B (products, user-selection pe depend, har selection-change pe)
   │
   ├── Products list
   └── unki filter metafield values
            │
            ▼ (agar koi filter checkbox bhi checked hai)
   matchesSelectedFilters() — NO API CALL, sirf humara JS code, CALL B ke result par
            │
            ▼
   Grid mein final products dikhte hain
```

---

## 1. Sabse Simple Analogy

Socho ek **bade departmental store** mein ho. Do log tumhari madad kar rahe hain:

- **Worker #1 (Shopify)** — bahut fast hai, poore godaam (warehouse) mein jaake **sirf 3 cheezein
  puchne** pe turant sahi saaman la sakta hai: "Kaunsi Sub-category?", "Kaunsa Brand?", "Kaunsa
  Region?" — bas itna hi samajhta hai, isse zyada kuch nahi.
- **Worker #2 (Humara apna code)** — Worker #1 jo laata hai, usme se **baaki cheezein check**
  karta hai — jaise "Size Large hai kya?", "Nicotine Strength 20mg hai kya?" — kyunki Worker #1
  (Shopify) ko ye cheezein samajh hi nahi aati.

Poora system isi 2-worker principle par chalta hai.

---

## 2. Taxonomy — Category → Sub-category → Brand

Ye humara apna structure hai (Shopify isko "Taxonomy" nahi jaanta) — 3 level ka data,
**Shopify Metaobjects** mein store hota hai (ek special Shopify data-type, Product ya Collection
nahi):

```
Category (jaise "Vapes", "Cannabis Accessories")
   └── Sub-category (jaise "Disposable Vapes", "Straight Tube Bongs")
          └── Brand (jaise "Flavour Beast", "Oxbar")
```

**Kaha bana hai:**
- `admin-panel/src/data/taxonomy.ts` — admin panel se Category/Sub-category/Brand banane ka code
- `storefront/src/lib/shopify/queries/taxonomy.ts` — `getTaxonomyTree()` — storefront ye poora tree
  **live** (Shopify se seedha) padhta hai, taaki koi bhi naya Sub-category turant sidebar mein dikhe

### 2026-09-04 ka Bada Change

"Cannabis Accessories" ke andar pehle "Glass" jaisi 5 badi, generic sub-categories thi
(Glass/Dab & Concentrate/Grinders/Hookahs/Storage). Real headshop websites (headshop.com,
dankgeek.com) research karke, humne inko **22 chhoti, specific sub-categories** mein split kiya —
jaise "Glass" ab "Straight Tube Bongs", "Beaker Bongs", "Water Pipes", etc. ban gaya.

### `product_type` Ki Naming Kaise Tay Hui

**Koi transformation NAHI hai — Sub-category ka naam hi, hoobahoo, `product_type` ban jaata hai.**
Koi slug, koi lowercase, koi renaming nahi:

```
Sub-category (taxonomy mein):  "Disposable Vapes"
Shopify productType (product pe): "Disposable Vapes"     ← bilkul same string
```

Ye `admin-panel/src/data/products.ts` ke `createProductLine()` mein hota hai — jab naya product
banta hai, uska `brandId` diya jaata hai; wahi se code khud Brand → uski parent Sub-category ka
naam nikaal leta hai (`listBrands()`/`listSubcategories()` se), aur seedha `productType` field mein
daal deta hai. **Naam decide karne ka koi alag rule nahi hai — jo Sub-category ka naam hai, wahi
`product_type` hai, hamesha.**

**Isi wajah se naam decide karte waqt (jaise "Glass" ko split karna) ye zaroori tha ki naam khud
"unique aur self-explanatory" ho** — kyunki jo bhi naam Sub-category ko doge, wahi seedha Shopify
ke `product_type` field mein, bina kisi tabdeeli ke, chala jaata hai.

---

## 3. Shopify Ke Paas Sirf 3 "Boxes" Hain

Shopify ke har Product mein sirf **3 fields** hain jo humare filters use kar sakte hain:

| Humara Concept | Shopify Field | Example |
|---|---|---|
| Sub-category | `productType` | `"Disposable Vapes"` |
| Brand | `vendor` | `"Flavour Beast"` |
| Region | `tags` (list) | `["region-federal"]` |
| **Category** | ❌ koi field nahi | Shopify ko "Vapes" naam ka koi field pata hi nahi |

**Category kaise pata chalta hai phir?** Product khud kabhi nahi bataega. Humara apna taxonomy
data (upar wala) bataता hai "Disposable Vapes" kis Category ke andar aata hai.

Ye 3 fields **product create hote hi set ho jaate hain** —
`admin-panel/src/data/products.ts` ke `createProductLine()` function mein.

---

## 4. Shopify Query — Worker #1 Kaise Kaam Karta Hai

Jab user Sub-category + Brand + Region select kare, ek single query string banti hai aur
**seedha Shopify ko bhej di jaati hai**:

```
product_type:'Disposable Vapes' AND vendor:'Flavour Beast' AND tag:'region-federal'
```

Shopify apne server pe khud dhoondhta hai, sirf matching products wapas bhejta hai.

**Ye confirm kiya official Shopify docs se**
(`shopify.dev/docs/api/storefront/latest/queries/products`): iska `query` argument sirf **9 fixed
shabd** samajhta hai:

```
available_for_sale, created_at, product_type, tag, tag_not,
title, updated_at, variants.price, vendor
```

Inke alawa kuch bhi (jaise `metafields.custom.size`) likhoge, Shopify **error bhi nahi dega, bas
chup-chap ignore kar dega.** Ye humne live test karke bhi prove kiya tha.

---

## 5. Custom Filters (Size, Material, etc.) — Worker #2 Ka Kaam

Size, Material, Nicotine Strength, Puff Count — ye sab `custom.*` **metafields** hain. Shopify
ka query inhe support nahi karta (upar wali list mein nahi hain).

### Filter Definitions Kaha Se Aate Hain

Har Sub-category ke paas `relevant_filters` naam ka field hai, jo `filter_definition` metaobjects
se link hota hai. Har filter definition mein hota hai:

```json
{
  "key": "disposable_vape_nicotine_strength",
  "label": "Nicotine Strength",
  "choices": ["0mg", "20mg", "35mg", "50mg"]
}
```

Ye already 19 sub-categories ke liye admin panel mein bana hua tha — storefront bas ise
**use nahi kar raha tha**. Maine ye connection bana diya.

### Filtering Kaise Hoti Hai

1. Shopify se already Sub-category+Brand+Region se **chhota sa result** aata hai
2. Har product ke sath uski Size/Material/etc. **values bhi mangwa lete hain** (Shopify ye de sakta
   hai, bas "sirf ye value do" nahi keh sakte)
3. **Humara apna JavaScript code** in products ko check karta hai — jis product ki value user ke
   selected checkbox se match kare, wahi rakhta hai, baaki hata deta hai

```js
// product-listing.ts — matchesSelectedFilters()
function matchesSelectedFilters(product, selected) {
  for (const [key, values] of Object.entries(selected)) {
    if (values.length === 0) continue;        // kuch select nahi -> koi restriction nahi
    const value = product.metafield(key);
    if (!values.includes(value)) return false;
  }
  return true;
}
```

**Ye Shopify ke query mein KABHI nahi jaata** — poori tarah humare apne code mein hota hai,
already-chhote result pe.

---

## 6. Ek Click Ka Poora Safar (Example)

User "Disposable Vapes" open karta hai, Federal region hai, "Flavour Beast" Brand checkbox click
karta hai:

| # | Kya Hota Hai | Kaun Karta Hai |
|---|---|---|
| 1 | Checkbox click → React state (`selectedBrands`) update | Browser (humara UI code) |
| 2 | State change se `fetchSubcategoryProductsAction()` chalta hai (Server Action) | Humara code |
| 3 | Region cookie se server-side padha jaata hai | Humara code |
| 4 | Query string banti hai: `product_type:'Disposable Vapes' AND vendor:'Flavour Beast' AND tag:'region-federal'` | Humara code (query banata hai) |
| 5 | Ye query Shopify ko bheji jaati hai (real network call) | **Shopify** |
| 6 | Shopify sirf matching products wapas bhejta hai | **Shopify** |
| 7 | Agar Size/Material bhi checked hai, to un products mein se aur chhaanta hai | Humara code |
| 8 | Final list grid mein dikhti hai | Humara UI code |

---

## 7. Har API Call — Kaun Kis Ka Hai

| Call | Kaun | Kya Deta Hai |
|---|---|---|
| `products(query: "...")` | **Shopify** | Sub-category+Brand+Region se already-filtered products |
| `metafields(identifiers: [...])` | **Shopify** | Size/Material jaisi raw values (filter NAHI karta, sirf deta hai) |
| `metaobjects(type: "sub_category")` | **Shopify** | Live taxonomy tree + filter definitions |
| `matchesSelectedFilters()` | **Humara code** | Custom filter checkbox ka actual matching |
| `getCurrentRegion()` | **Humara code** | Cookie se region padhna |
| Products webhook (`route.ts`) | **Humara code** | Product change hone pe sahi cache tags clear karna |

---

## 8. File Map

| File | Kaam |
|---|---|
| `admin-panel/src/data/products.ts` | Naya product banate waqt `productType`/`vendor`/region-tag set karta hai |
| `admin-panel/scripts/shopify/backfill-native-taxonomy-fields.ts` | Purane 266 products pe ye fields backfill kiya |
| `storefront/src/lib/shopify/queries/taxonomy.ts` | Live Category→Sub-category tree + filter definitions fetch karta hai |
| `storefront/src/features/products/live-catalog.ts` | Live tree ko sidebar ke format mein badalta hai |
| `storefront/src/lib/shopify/queries/product-listing.ts` | **Asli engine** — Shopify query banata hai + custom filter matching karta hai |
| `storefront/src/features/products/actions.ts` | Browser se call hone wala Server Action |
| `storefront/src/features/products/ProductListPage.tsx` | Saara UI state (kaunsa Sub-category, Brand, Filter checked hai) |
| `storefront/src/app/api/webhooks/products/route.ts` | Product update hone pe cache saaf karta hai |

---

## 9. Abhi Kya Baaki Hai (Honest List)

1. **Filter values products pe nahi bhari gayi** — Nicotine Strength "20mg" checkbox dikhta hai
   (real choices hain), lekin kisi product pe actual value set nahi hai abhi, isliye check karoge
   to 0 results aayenge. Ye data-entry ka kaam hai, code ka nahi.
2. **Mega-menu (top navigation) abhi bhi fake/hardcoded data use karta hai** — sirf PLP ka sidebar
   live hai, top mega-menu alag, baad mein karna hai.
3. **42 mein se 23 Sub-categories ke paas koi filter_definition nahi hai** — zyaadatar naye
   Cannabis Accessories wale — unke liye "No filters confirmed yet" dikhega jab tak admin filters
   assign na kare.

---

*Last updated: 2026-09-04*
