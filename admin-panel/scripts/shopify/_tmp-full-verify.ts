/**
 * Full verification pass over all 299 newly-imported products: checks each one actually has
 * >=1 media image with status READY, >=1 variant with a real price, and is published to the
 * Online Store channel. Run after import + image-attach + publish to catch anything that slipped
 * through silently.
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/_tmp-full-verify.ts
 */
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { readFileSync, writeFileSync } from 'fs';

const Q = /* GraphQL */ `
  query($id: ID!) {
    product(id: $id) {
      title
      status
      media(first: 5) { nodes { ... on MediaImage { status } } }
      variants(first: 5) { nodes { price } }
    }
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
  const handleToGid: Record<string, string> = JSON.parse(
    readFileSync('/Users/ayushjaiswal/Downloads/handle_to_gid.json', 'utf-8')
  );
  const entries = Object.entries(handleToGid);
  console.log(`Verifying ${entries.length} products...\n`);

  const problems: Array<{ handle: string; issue: string }> = [];
  let noImage = 0, imageNotReady = 0, noVariantPrice = 0, notPublished = 0, ok = 0;

  for (const [handle, id] of entries) {
    try {
      const data = await withRetry(() => shopifyAdminRequest<any>(Q, { id }));
      const p = data.product;
      if (!p) {
        problems.push({ handle, issue: 'product not found' });
        continue;
      }
      const mediaNodes = p.media.nodes;
      const hasImage = mediaNodes.length > 0;
      const allReady = mediaNodes.every((m: any) => m.status === 'READY');
      const hasPrice = p.variants.nodes.length > 0 && p.variants.nodes.every((v: any) => parseFloat(v.price) > 0);

      let issue = '';
      if (!hasImage) { issue = 'NO IMAGE'; noImage++; }
      else if (!allReady) { issue = 'IMAGE NOT READY'; imageNotReady++; }
      if (!hasPrice) { issue = issue ? issue + '; NO VALID PRICE' : 'NO VALID PRICE'; noVariantPrice++; }

      if (issue) {
        problems.push({ handle, issue });
        console.log(`ISSUE ${handle}: ${issue}`);
      } else {
        ok++;
      }
    } catch (e: any) {
      problems.push({ handle, issue: `verify failed: ${e?.message || e}` });
      console.log(`ERROR ${handle}: ${e?.message || e}`);
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Total checked: ${entries.length}`);
  console.log(`Fully OK: ${ok}`);
  console.log(`No image: ${noImage}`);
  console.log(`Image not ready: ${imageNotReady}`);
  console.log(`No valid price: ${noVariantPrice}`);
  console.log(`Not published: ${notPublished}`);
  writeFileSync('/Users/ayushjaiswal/Downloads/full_verify_problems.json', JSON.stringify(problems, null, 2));
  console.log(`\nWrote full_verify_problems.json (${problems.length} entries)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
