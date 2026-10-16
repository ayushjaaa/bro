/**
 * Fix: Pre-Rolled Cones and Torch Lighters aren't subject to province-specific excise-stamp
 * rules (neither CSV had ANY region- tags, unlike the vapes CSV which tags every row) -- the
 * import script wrongly defaulted them to region-federal anyway. A product with no region tag is
 * "allowed anywhere" (storefront/src/lib/regions.ts, admin-panel/src/lib/region-rules.ts) and
 * skips the PDP's region-mismatch check entirely (storefront src/app/products/[handle]/page.tsx:
 * `if (product.region && ...)`). Tagging them federal-only made the PDP show "not available in
 * your region" for any visitor who picked a real province other than Federal at the site's
 * mandatory province gate -- this removes the `region-federal` tag and `custom.region` metafield
 * from those 266 products (the 33 vapes products are untouched -- their region tags are correct).
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/_tmp-remove-region-cones-lighters.ts
 */
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { readFileSync } from 'fs';

const REMOVE_TAGS_MUTATION = /* GraphQL */ `
  mutation($id: ID!, $tags: [String!]!) {
    tagsRemove(id: $id, tags: $tags) { userErrors { field message } }
  }
`;

const DELETE_METAFIELD_MUTATION = /* GraphQL */ `
  mutation($input: [MetafieldIdentifierInput!]!) {
    metafieldsDelete(metafields: $input) { userErrors { field message } }
  }
`;

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastErr;
}

async function main() {
  const plan: Array<{ handle: string; subcategory: string }> = JSON.parse(
    readFileSync('/Users/ayushjaiswal/Downloads/import_plan.json', 'utf-8')
  );
  const handleToGid: Record<string, string> = JSON.parse(
    readFileSync('/Users/ayushjaiswal/Downloads/handle_to_gid.json', 'utf-8')
  );

  const targets = plan.filter(
    (p) => p.subcategory === 'Pre-Rolled Cones' || p.subcategory === 'Torch Lighters'
  );
  console.log(`Removing region tag/metafield from ${targets.length} cones/lighters products...`);

  let ok = 0, fail = 0;
  for (const p of targets) {
    const id = handleToGid[p.handle];
    if (!id) {
      console.log(`SKIP ${p.handle}: no product id`);
      continue;
    }
    try {
      await withRetry(() =>
        shopifyAdminRequest<any>(REMOVE_TAGS_MUTATION, { id, tags: ['region-federal'] })
      );
      const delRes = await withRetry(() =>
        shopifyAdminRequest<any>(DELETE_METAFIELD_MUTATION, {
          input: [{ ownerId: id, namespace: 'custom', key: 'region' }],
        })
      );
      const errs = delRes.metafieldsDelete.userErrors;
      if (errs?.length) {
        fail++;
        console.log(`FAIL ${p.handle}: ${JSON.stringify(errs)}`);
      } else {
        ok++;
        console.log(`OK   ${p.handle}`);
      }
    } catch (e: any) {
      fail++;
      console.log(`FAIL ${p.handle}: ${e?.message || e}`);
    }
  }
  console.log(`\nDone. ${ok} succeeded, ${fail} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
