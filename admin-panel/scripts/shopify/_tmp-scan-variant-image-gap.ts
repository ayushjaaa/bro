/**
 * Scans every multi-variant product for the "all variants share one image" data gap: the bulk
 * import (Sep 2026) attached each flavor's photo to the product's media gallery but never wired
 * a distinct `mediaId` onto the matching variant, so every variant fell back to showing whichever
 * image Shopify picked as default (observed: the first/primary image) regardless of which flavor
 * was selected on the storefront.
 *
 * Dry run only -- no mutations. For each affected product, tries to match each variant's flavor
 * name to a product media filename (normalized) and reports whether a confident match exists.
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/_tmp-scan-variant-image-gap.ts
 */
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { writeFileSync } from 'fs';

const PRODUCTS_QUERY = /* GraphQL */ `
  query Products($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        handle
        title
        media(first: 50) {
          nodes {
            ... on MediaImage {
              id
              image {
                url
              }
            }
          }
        }
        variants(first: 100) {
          nodes {
            id
            title
            image {
              url
            }
          }
        }
      }
    }
  }
`;

function filenameStem(url: string): string {
  const path = new URL(url).pathname;
  const file = path.split('/').pop() || '';
  // strip extension and any Shopify dedupe suffix like "_e2249e5d-537a-..."
  return file
    .replace(/\.(webp|jpg|jpeg|png)$/i, '')
    .replace(/_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, '');
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

async function main() {
  let cursor: string | null = null;
  let scanned = 0;
  const affected: Array<{
    productId: string;
    handle: string;
    title: string;
    variantCount: number;
    sharedImageUrl: string;
    matches: Array<{
      variantId: string;
      variantTitle: string;
      matchedUrl: string | null;
      matchedMediaId: string | null;
      matchType: string;
    }>;
    unmatchedCount: number;
  }> = [];

  do {
    const data: any = await shopifyAdminRequest(PRODUCTS_QUERY, { cursor });
    const products = data.products.nodes;
    for (const p of products) {
      scanned++;
      const variants = p.variants.nodes;
      if (variants.length < 2) continue;

      const imageUrls = variants.map((v: any) => v.image?.url ?? null);
      const distinctUrls = new Set(imageUrls);
      // the bug signature: every variant points at the exact same single image (or all null)
      const isSuspect = distinctUrls.size === 1;
      if (!isSuspect) continue;

      const sharedImageUrl = imageUrls[0];
      const mediaImages = p.media.nodes.filter((m: any) => m.image?.url);
      if (mediaImages.length < 2) continue; // nothing to match against

      const matches: Array<{
        variantId: string;
        variantTitle: string;
        matchedUrl: string | null;
        matchedMediaId: string | null;
        matchType: string;
      }> = [];
      let unmatchedCount = 0;
      for (const v of variants) {
        const normTitle = normalize(v.title);
        let best: { url: string; mediaId: string } | null = null;
        let matchType = 'none';

        // pass 1: exact normalized filename === normalized flavor name (safe, unambiguous)
        for (const m of mediaImages) {
          const stem = normalize(filenameStem(m.image.url));
          if (stem === normTitle) {
            best = { url: m.image.url, mediaId: m.id };
            matchType = 'exact';
            break;
          }
        }

        // pass 2: substring, but only keep the LONGEST (most specific) candidate stem, and only
        // in the direction title-contains-stem (a short generic filename like "Punch_Ice" inside
        // a longer flavor name like "Maui Punch Ice") -- never the reverse (a longer, more
        // specific filename like "Blue_Razz_Lemon_Ice" should not satisfy a shorter title match).
        if (!best) {
          let bestStem = '';
          for (const m of mediaImages) {
            const stem = normalize(filenameStem(m.image.url));
            if (stem.length >= 4 && normTitle.includes(stem) && stem.length > bestStem.length) {
              bestStem = stem;
              best = { url: m.image.url, mediaId: m.id };
            }
          }
          if (best) matchType = 'substring';
        }

        if (!best) unmatchedCount++;
        matches.push({
          variantId: v.id,
          variantTitle: v.title,
          matchedUrl: best?.url ?? null,
          matchedMediaId: best?.mediaId ?? null,
          matchType,
        });
      }

      affected.push({
        productId: p.id,
        handle: p.handle,
        title: p.title,
        variantCount: variants.length,
        sharedImageUrl: sharedImageUrl ?? '(none)',
        matches,
        unmatchedCount,
      });
    }
    cursor = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
    console.log(`Scanned ${scanned} products so far, ${affected.length} affected...`);
  } while (cursor);

  console.log(`\nDone. Scanned ${scanned} products total.`);
  console.log(`Affected (all variants share one image): ${affected.length}`);
  const fullyMatchable = affected.filter((a) => a.unmatchedCount === 0);
  console.log(`Fully auto-matchable (every variant found a distinct image by name): ${fullyMatchable.length}`);
  console.log(`Partially/un-matchable (need manual review): ${affected.length - fullyMatchable.length}`);
  const exactOnly = affected.filter((a) => a.matches.every((m) => m.matchType === 'exact'));
  console.log(`Fully EXACT-matched (no substring guesses at all): ${exactOnly.length}`);

  writeFileSync(
    '/Users/ayushjaiswal/Downloads/variant-image-gap-scan.json',
    JSON.stringify(affected, null, 2)
  );
  console.log('\nFull report written to ~/Downloads/variant-image-gap-scan.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
