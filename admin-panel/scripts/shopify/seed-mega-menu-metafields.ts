/**
 * One-time bulk-seed -- sets the 4 mega-menu metafields (custom.menu_nav_key/menu_group_label/
 * menu_group_mode/menu_sort_order) on every existing Sub-category Collection, per the mapping
 * table worked out with the user (2026-09-07). Reuses setMegaMenuMetafields()
 * (collection-helpers.core.ts), the same function the admin-panel Sub-category creation form now
 * calls -- this script just does it in bulk for Collections that already existed before that form
 * change landed.
 *
 * Looks each Collection up by exact title match (same pattern as
 * backfill-subcategory-collections.ts's collectionExistsForTitle) -- skips with a warning if a
 * title in the table below doesn't match any real Collection (e.g. a typo, or one that hasn't
 * been created/backfilled yet), rather than failing the whole run.
 *
 * Idempotent: setMegaMenuMetafields always overwrites with the given values, so re-running this
 * is safe and just re-applies the same table.
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/seed-mega-menu-metafields.ts
 */
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { setMegaMenuMetafields } from '../../src/lib/shopify/collection-helpers.core';

interface Row {
  title: string;
  navKey: string;
  groupLabel: string;
  groupMode: 'brand' | 'subcategory';
  sortOrder: number;
}

const ROWS: Row[] = [
  // 1. Vape & e juices
  { title: 'Disposable Vapes', navKey: 'vape-e-juices', groupLabel: 'Disposable', groupMode: 'brand', sortOrder: 1 },
  { title: 'E-Liquids / Vape Juice', navKey: 'vape-e-juices', groupLabel: 'E-Juices', groupMode: 'brand', sortOrder: 2 },
  { title: 'Pre-Filled Pods', navKey: 'vape-e-juices', groupLabel: 'Pre-Filled Pods', groupMode: 'brand', sortOrder: 3 },
  { title: 'Vape Devices', navKey: 'vape-e-juices', groupLabel: 'Devices', groupMode: 'brand', sortOrder: 4 },
  { title: 'Vape Hardware & Accessories', navKey: 'vape-e-juices', groupLabel: 'Hardware', groupMode: 'brand', sortOrder: 5 },

  // 2. Smoking -- each of these 6 is its own flat "Shop By Category" column-1 entry (not nested
  // under a shared "Rolling Accessories" bucket) per the 2026-09-07 correction: the mega-menu's
  // buildGroupsForBucket() collapses every row sharing one groupLabel into a single column-1
  // entry, which was hiding these 6 real sub-categories one level deeper than the /products
  // sidebar (live-catalog.ts) shows them. A unique groupLabel per row keeps each its own
  // column-1 row while staying in 'subcategory' mode.
  { title: 'Rolling Papers', navKey: 'smoking', groupLabel: 'Rolling Papers', groupMode: 'subcategory', sortOrder: 1 },
  { title: 'Blunts & Wraps', navKey: 'smoking', groupLabel: 'Blunts & Wraps', groupMode: 'subcategory', sortOrder: 2 },
  { title: 'Pre-Rolled Cones', navKey: 'smoking', groupLabel: 'Pre-Rolled Cones', groupMode: 'subcategory', sortOrder: 3 },
  { title: 'Filters & Tips', navKey: 'smoking', groupLabel: 'Filters & Tips', groupMode: 'subcategory', sortOrder: 4 },
  { title: 'Rolling Accessories', navKey: 'smoking', groupLabel: 'Rolling Accessories', groupMode: 'subcategory', sortOrder: 5 },
  { title: 'Tobacco', navKey: 'smoking', groupLabel: 'Tobacco', groupMode: 'subcategory', sortOrder: 6 },
  { title: 'Torch Lighters', navKey: 'smoking', groupLabel: 'Torch Lighters', groupMode: 'brand', sortOrder: 7 },
  { title: 'Butane', navKey: 'smoking', groupLabel: 'Butane', groupMode: 'brand', sortOrder: 8 },

  // 3. Cannabis accessories
  { title: 'Straight Tube Bongs', navKey: 'cannabis-accessories', groupLabel: 'Bongs', groupMode: 'subcategory', sortOrder: 1 },
  { title: 'Beaker Bongs', navKey: 'cannabis-accessories', groupLabel: 'Bongs', groupMode: 'subcategory', sortOrder: 2 },
  { title: 'Water Pipes', navKey: 'cannabis-accessories', groupLabel: 'Bongs', groupMode: 'subcategory', sortOrder: 3 },
  { title: 'Glass Pipes', navKey: 'cannabis-accessories', groupLabel: 'Pipes', groupMode: 'subcategory', sortOrder: 1 },
  { title: 'Hand Pipes', navKey: 'cannabis-accessories', groupLabel: 'Pipes', groupMode: 'subcategory', sortOrder: 2 },
  { title: 'Bubblers', navKey: 'cannabis-accessories', groupLabel: 'Pipes', groupMode: 'subcategory', sortOrder: 3 },
  { title: 'Dab Rigs', navKey: 'cannabis-accessories', groupLabel: 'Dab Rigs', groupMode: 'subcategory', sortOrder: 1 },
  { title: 'Nectar Collectors', navKey: 'cannabis-accessories', groupLabel: 'Dab Rigs', groupMode: 'subcategory', sortOrder: 2 },
  { title: 'E-Rigs', navKey: 'cannabis-accessories', groupLabel: 'Dab Rigs', groupMode: 'subcategory', sortOrder: 3 },
  { title: 'Dab Rig Accessories', navKey: 'cannabis-accessories', groupLabel: 'Dab Rigs', groupMode: 'subcategory', sortOrder: 4 },
  { title: '2-Piece Grinders', navKey: 'cannabis-accessories', groupLabel: 'Grinders', groupMode: 'subcategory', sortOrder: 1 },
  { title: '3-Piece Grinders', navKey: 'cannabis-accessories', groupLabel: 'Grinders', groupMode: 'subcategory', sortOrder: 2 },
  { title: '4-Piece Grinders', navKey: 'cannabis-accessories', groupLabel: 'Grinders', groupMode: 'subcategory', sortOrder: 3 },
  { title: 'Electric Grinders', navKey: 'cannabis-accessories', groupLabel: 'Grinders', groupMode: 'subcategory', sortOrder: 4 },
  { title: 'Scales', navKey: 'cannabis-accessories', groupLabel: 'Scales', groupMode: 'subcategory', sortOrder: 1 },
  { title: 'Hookahs', navKey: 'cannabis-accessories', groupLabel: 'Hookahs', groupMode: 'subcategory', sortOrder: 1 },
  { title: 'Hookah Bowls', navKey: 'cannabis-accessories', groupLabel: 'Hookahs', groupMode: 'subcategory', sortOrder: 2 },
  { title: 'Hookah Hoses', navKey: 'cannabis-accessories', groupLabel: 'Hookahs', groupMode: 'subcategory', sortOrder: 3 },
  { title: 'Hookah Accessories & Parts', navKey: 'cannabis-accessories', groupLabel: 'Hookahs', groupMode: 'subcategory', sortOrder: 4 },
  { title: 'Stash Jars', navKey: 'cannabis-accessories', groupLabel: 'Storage', groupMode: 'subcategory', sortOrder: 1 },
  { title: 'Storage Containers', navKey: 'cannabis-accessories', groupLabel: 'Storage', groupMode: 'subcategory', sortOrder: 2 },
  { title: 'Smell-Proof Bags', navKey: 'cannabis-accessories', groupLabel: 'Storage', groupMode: 'subcategory', sortOrder: 3 },
  { title: 'Charcoal', navKey: 'cannabis-accessories', groupLabel: 'Storage', groupMode: 'subcategory', sortOrder: 4 },
  { title: 'Cleaning', navKey: 'cannabis-accessories', groupLabel: 'Others', groupMode: 'subcategory', sortOrder: 1 },
  { title: 'Replacement Parts', navKey: 'cannabis-accessories', groupLabel: 'Others', groupMode: 'subcategory', sortOrder: 2 },

  // 4. Convenience
  { title: 'Car Air Fresheners', navKey: 'convenience', groupLabel: 'Air Fresheners', groupMode: 'subcategory', sortOrder: 1 },
  { title: 'Lighters', navKey: 'convenience', groupLabel: 'Lighters', groupMode: 'subcategory', sortOrder: 1 },
  { title: 'Batteries', navKey: 'convenience', groupLabel: 'Batteries', groupMode: 'subcategory', sortOrder: 1 },
  { title: 'General Convenience', navKey: 'convenience', groupLabel: 'Others', groupMode: 'subcategory', sortOrder: 1 },
];

const FIND_COLLECTION_BY_TITLE_QUERY = /* GraphQL */ `
  query FindCollectionByTitleForSeed($query: String!) {
    collections(first: 5, query: $query) {
      nodes {
        id
        title
      }
    }
  }
`;

function quoteQueryValue(value: string): string {
  return `'${value.replace(/'/g, "\\'")}'`;
}

async function findCollectionIdByTitle(title: string): Promise<string | null> {
  const data = await shopifyAdminRequest<any>(FIND_COLLECTION_BY_TITLE_QUERY, {
    query: `title:${quoteQueryValue(title)}`,
  });
  const match = data.collections.nodes.find((c: any) => c.title === title);
  return match?.id ?? null;
}

async function main() {
  let updated = 0;
  let notFound = 0;
  let failed = 0;

  for (const row of ROWS) {
    try {
      const collectionId = await findCollectionIdByTitle(row.title);
      if (!collectionId) {
        console.warn(`SKIP (no Collection found with title "${row.title}") -- create/backfill it first.`);
        notFound++;
        continue;
      }
      await setMegaMenuMetafields(collectionId, {
        navKey: row.navKey,
        groupLabel: row.groupLabel,
        groupMode: row.groupMode,
        sortOrder: row.sortOrder,
      });
      console.log(`OK: "${row.title}" -> nav_key=${row.navKey} group_label=${row.groupLabel} mode=${row.groupMode} order=${row.sortOrder}`);
      updated++;
    } catch (err) {
      console.error(`FAILED for "${row.title}":`, err instanceof Error ? err.message : err);
      failed++;
    }
  }

  console.log(`\nDone. updated=${updated} notFound=${notFound} failed=${failed} total=${ROWS.length}`);
  if (failed > 0 || notFound > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
