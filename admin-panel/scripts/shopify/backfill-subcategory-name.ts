/**
 * One-time backfill -- sets custom.subcategory_name on every existing product by walking its
 * taxonomy.brand -> sub_category -> name chain, for products created before this field existed.
 * Safe to re-run (idempotent -- just re-sets the same value).
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/backfill-subcategory-name.ts
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const LIST_QUERY = /* GraphQL */ `
  query List($after: String) {
    products(first: 250, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        brandField: metafield(namespace: "taxonomy", key: "brand") {
          reference {
            ... on Metaobject {
              subCategoryField: field(key: "sub_category") {
                reference { ... on Metaobject { subCategoryName: field(key: "name") { value } } }
              }
            }
          }
        }
        existing: metafield(namespace: "custom", key: "subcategory_name") { value }
      }
    }
  }
`;

const SET_MUTATION = /* GraphQL */ `
  mutation Set($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id }
      userErrors { field message }
    }
  }
`;

async function main() {
  let after: string | null = null;
  let updated = 0;
  let skipped = 0;
  let noSubcategory = 0;

  while (true) {
    const data: any = await shopifyAdminRequest<any>(LIST_QUERY, { after });

    const toSet: Array<{ ownerId: string; namespace: string; key: string; type: string; value: string }> = [];
    for (const p of data.products.nodes) {
      const subcategoryName = p.brandField?.reference?.subCategoryField?.reference?.subCategoryName?.value;
      if (!subcategoryName) {
        noSubcategory++;
        console.log(`  SKIP (no brand/sub-category): ${p.title}`);
        continue;
      }
      if (p.existing?.value === subcategoryName) {
        skipped++;
        continue;
      }
      toSet.push({
        ownerId: p.id,
        namespace: 'custom',
        key: 'subcategory_name',
        type: 'single_line_text_field',
        value: subcategoryName,
      });
    }

    if (toSet.length > 0) {
      // metafieldsSet accepts up to 25 at a time.
      for (let i = 0; i < toSet.length; i += 25) {
        const batch = toSet.slice(i, i + 25);
        const result = await shopifyAdminRequest<any>(SET_MUTATION, { metafields: batch });
        assertNoUserErrors(result.metafieldsSet.userErrors, 'metafieldsSet');
        updated += batch.length;
        console.log(`  set subcategory_name on ${batch.length} products (running total: ${updated})`);
      }
    }

    if (!data.products.pageInfo.hasNextPage) break;
    after = data.products.pageInfo.endCursor;
  }

  console.log(`\nDone. Updated: ${updated}, already correct: ${skipped}, no brand/sub-category: ${noSubcategory}.`);
}

main().catch((err) => {
  console.error('Failed:', err instanceof Error ? err.message : err);
  if ((err as any)?.errors) console.error('Details:', JSON.stringify((err as any).errors, null, 2));
  process.exit(1);
});
