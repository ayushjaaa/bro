# Removed store sections

A record of every section (sub-category) taken off the store, so it can be put back exactly if the
client asks, or if it was removed by mistake. Each entry says what was removed, why, what was
kept, and how to restore it.

For any new removal, use the general scripts in `admin-panel/scripts/shopify/` and add an entry
here:

```bash
cd admin-panel
npx tsx --env-file=.env.local scripts/shopify/_tmp-snapshot-sections.ts scripts/shopify/snapshots/<date>-<name>.json "Section A" "Section B"
npx tsx --env-file=.env.local scripts/shopify/_tmp-remove-sections.ts  scripts/shopify/snapshots/<date>-<name>.json [--apply]
npx tsx --env-file=.env.local scripts/shopify/_tmp-restore-sections.ts scripts/shopify/snapshots/<date>-<name>.json [--apply]
```

Both remove and restore are dry runs unless `--apply` is passed. Remove stops if a section has gained
products or brands; restore skips anything that already exists.

---

## 2026-11-14 — Water Pipes (Cannabis Accessories > Bongs)

**Asked by:** the user, on the client's behalf. The section was empty and not wanted.

### What was removed

| Menu group | Menu order | Section | Collection handle | Sub-category ID (old) | Collection ID (old) |
|---|---|---|---|---|---|
| Bongs | 4 | Water Pipes | `water-pipes` | 252082192582 | 353063960774 |

At removal time it had **0 products**, **0 brands** and **no filters**. Nothing in Sanity or the
storefront code linked to it.

### What was kept

- `storefront/src/features/products/catalog.ts` still has its Water Pipes fallback entry (filter
  labels), for a restore.
- The rest of the Bongs list keeps its menu order numbers (#4 is simply unused).
- Note: the SKU format proposal sent to the client (Gemini-SKU-Format-Proposal.pdf) lists a type
  code `WT` for Water Pipes; drop it when that proposal is next updated.

### Exact data and restore

Snapshot: `admin-panel/scripts/shopify/snapshots/2026-11-14-water-pipes.json`

```bash
cd admin-panel
npx tsx --env-file=.env.local scripts/shopify/_tmp-restore-sections.ts scripts/shopify/snapshots/2026-11-14-water-pipes.json            # dry run
npx tsx --env-file=.env.local scripts/shopify/_tmp-restore-sections.ts scripts/shopify/snapshots/2026-11-14-water-pipes.json --apply    # restore
```

Restores the sub-category and the `water-pipes` collection, published, back in the Bongs menu group
at #4. Old `?subcategory=water-pipes` links work again once it is back.

---

## 2026-11-14 — Hookahs and Storage (Cannabis Accessories)

**Asked by:** the user, on the client's behalf. Both menu groups were empty and not wanted on the
site.

### What was removed

Two mega-menu groups under **Cannabis accessories**, with all 8 of their sections. Each section is
a Shopify `sub_category` metaobject plus a matching automated Collection (rule:
`product_type = <name>`), published to Online Store.

| Menu group | Menu order | Section | Collection handle | Sub-category ID (old) | Collection ID (old) |
|---|---|---|---|---|---|
| Hookahs | 1 | Hookahs | `hookahs` | 252082618566 | 353064419526 |
| Hookahs | 2 | Hookah Bowls | `hookah-bowls` | 252082651334 | 353064452294 |
| Hookahs | 3 | Hookah Hoses | `hookah-hoses` | 252082684102 | 353064485062 |
| Hookahs | 4 | Hookah Accessories & Parts | `hookah-accessories-parts` | 252082716870 | 353064517830 |
| Storage | 1 | Stash Jars | `stash-jars` | 252082782406 | 353064583366 |
| Storage | 2 | Storage Containers | `storage-containers` | 252082815174 | 353064616134 |
| Storage | 3 | Smell-Proof Bags | `smell-proof-bags` | 252082847942 | 353064648902 |
| Storage | 4 | Charcoal | `charcoal` | 252082749638 | 353064550598 |

Every collection had the menu metafields `custom.menu_nav_key = cannabis-accessories`,
`custom.menu_group_mode = subcategory`, `custom.menu_group_label` and `custom.menu_sort_order` as
in the table.

At removal time all 8 sections had **0 products** and **0 brands**. Nothing else in Shopify or Sanity
referred to them.

### What was kept

- **The 5 Hookahs filters** (`filter_definition` metaobjects), only unlinked. Hookahs pointed at
  them through its `relevant_filters` field; no other section uses them.
  - `255350243526` Size (`hookah_size`)
  - `255350276294` Material (`hookah_material`)
  - `255350309062` Hose Count (`hookah_hose_count`)
  - `255350341830` Color (`hookah_color`)
  - `255350374598` Product Type (`hookah_product_type`)
- **Storefront code.** `storefront/src/features/products/catalog.ts` still lists these sections in
  its static catalog. It is only used as a fallback when Shopify can't be reached, and its entries
  are needed again on a restore (they supply the filter labels), so it was left as is.

### Exact data

The full Shopify data as it was right before removal (sub-category fields, collection rules,
publications, menu metafields, filters) is in
`admin-panel/scripts/shopify/snapshots/2026-11-14-hookahs-storage.json`.

### How it was removed

```bash
cd admin-panel
npx tsx --env-file=.env.local scripts/shopify/_tmp-snapshot-hookahs-storage.ts <out.json>   # snapshot (read-only)
npx tsx --env-file=.env.local scripts/shopify/_tmp-remove-hookahs-storage.ts                # dry run
npx tsx --env-file=.env.local scripts/shopify/_tmp-remove-hookahs-storage.ts --apply        # delete
```

The remove script stops if any section has gained products or brands since the snapshot.

### How to restore

```bash
cd admin-panel
npx tsx --env-file=.env.local scripts/shopify/_tmp-restore-hookahs-storage.ts            # dry run: shows what it will create
npx tsx --env-file=.env.local scripts/shopify/_tmp-restore-hookahs-storage.ts --apply    # restore
```

This recreates the 8 sub-categories (Hookahs re-linked to its 5 filters) and the 8 collections with
the same handles, rules, Online Store publication and menu placement. Shopify gives them new IDs;
nothing else refers to the old ones. The menu, the listing sidebar and the homepage tiles pick them
up on their own within an hour (cache), with no code change. Old links such as
`/products?category=cannabis-accessories&subcategory=hookahs` work again because the slugs come from
the same names.
