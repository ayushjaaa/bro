/**
 * Applies the variant-image backfill for the confidently-matched products found by
 * _tmp-scan-variant-image-gap.ts (every variant in the product had a safe, name-based match
 * against the product's own media gallery -- unmatchedCount === 0). Sets each variant's own
 * `mediaId` via `productVariantsBulkUpdate`, one GraphQL call per product (all its variants in
 * one request), same mutation the admin panel's own Edit Flavours flow already uses
 * (src/data/variants.ts).
 *
 * Reads /Users/ayushjaiswal/Downloads/variant-image-gap-scan.json (the scan's output).
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/_tmp-apply-variant-image-fix.ts
 */
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { readFileSync, writeFileSync } from 'fs';

const BULK_UPDATE_MUTATION = /* GraphQL */ `
  mutation BulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

async function main() {
  const data: any[] = JSON.parse(
    readFileSync('/Users/ayushjaiswal/Downloads/variant-image-gap-scan.json', 'utf-8')
  );
  const safe = data.filter((p) => p.unmatchedCount === 0);
  console.log(`Applying fix to ${safe.length} products...`);

  let ok = 0;
  let fail = 0;
  const results: Array<{ handle: string; ok: boolean; error?: string }> = [];

  for (const p of safe) {
    const variants = p.matches.map((m: any) => ({
      id: m.variantId,
      mediaId: m.matchedMediaId,
    }));
    try {
      const res: any = await shopifyAdminRequest(BULK_UPDATE_MUTATION, {
        productId: p.productId,
        variants,
      });
      const errors = res.productVariantsBulkUpdate.userErrors;
      if (errors?.length) {
        results.push({ handle: p.handle, ok: false, error: JSON.stringify(errors) });
        fail++;
        console.log(`FAIL ${p.handle}: ${JSON.stringify(errors)}`);
      } else {
        results.push({ handle: p.handle, ok: true });
        ok++;
        console.log(`OK   ${p.handle} (${variants.length} variants)`);
      }
    } catch (e: any) {
      results.push({ handle: p.handle, ok: false, error: String(e?.message || e) });
      fail++;
      console.log(`FAIL ${p.handle}: ${e?.message || e}`);
    }
  }

  console.log(`\nDone. ${ok} succeeded, ${fail} failed.`);
  writeFileSync(
    '/Users/ayushjaiswal/Downloads/variant-image-fix-results.json',
    JSON.stringify(results, null, 2)
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
