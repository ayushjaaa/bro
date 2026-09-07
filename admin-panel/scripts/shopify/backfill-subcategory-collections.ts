/**
 * One-time backfill -- creates (and publishes) a matching Automated Collection for every
 * Sub-category that was created BEFORE createSubcategory() (src/data/taxonomy.ts) started
 * auto-creating one. New Sub-categories no longer need this; this script only covers the
 * ~30 that already existed when that hook was added (2026-09-07 mega-menu plan).
 *
 * Idempotent: for each Sub-category, checks whether a Collection with that exact title already
 * exists before creating one -- safe to re-run (e.g. if it's interrupted partway through).
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/backfill-subcategory-collections.ts
 */
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { createSubcategoryCollection } from '../../src/lib/shopify/collection-helpers.core';

const FIND_COLLECTION_BY_TITLE_QUERY = /* GraphQL */ `
  query FindCollectionByTitle($query: String!) {
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

async function collectionExistsForTitle(name: string): Promise<boolean> {
  const data = await shopifyAdminRequest<any>(FIND_COLLECTION_BY_TITLE_QUERY, {
    query: `title:${quoteQueryValue(name)}`,
  });
  return data.collections.nodes.some((c: any) => c.title === name);
}

const METAOBJECTS_QUERY = /* GraphQL */ `
  query ListSubcategoriesForBackfill {
    metaobjects(type: "sub_category", first: 250) {
      nodes {
        fields {
          key
          value
        }
      }
    }
  }
`;

async function main() {
  // listSubcategories() (src/data/taxonomy.ts) calls requireAdmin() internally, which depends on
  // an authenticated Next.js session -- not available when this script is run standalone via
  // tsx. Read the metaobjects directly instead, same query shape minus the auth guard.
  const data = await shopifyAdminRequest<any>(METAOBJECTS_QUERY);
  const names: string[] = data.metaobjects.nodes
    .map((n: any) => n.fields.find((f: any) => f.key === 'name')?.value)
    .filter((name: string | undefined): name is string => Boolean(name));

  console.log(`Found ${names.length} sub-categories.`);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const name of names) {
    try {
      if (await collectionExistsForTitle(name)) {
        console.log(`skip (collection already exists): ${name}`);
        skipped++;
        continue;
      }
      await createSubcategoryCollection(name);
      console.log(`created + published collection: ${name}`);
      created++;
    } catch (err) {
      console.error(`FAILED for "${name}":`, err instanceof Error ? err.message : err);
      failed++;
    }
  }

  console.log(`\nDone. created=${created} skipped=${skipped} failed=${failed} total=${names.length}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
