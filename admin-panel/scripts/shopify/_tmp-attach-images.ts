/**
 * Attaches product images to the 299 newly-imported products. The import script (Sep 2026) created
 * products/variants/filters but never read the CSVs' "Image Src" column -- this backfills that gap.
 * Shopify's productCreateMedia fetches a remote URL itself (no local download/re-upload needed),
 * same mutation the app already uses for variant images (src/data/variants.ts CREATE_MEDIA_MUTATION).
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/_tmp-attach-images.ts
 */
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { readFileSync, writeFileSync } from 'fs';

const CREATE_MEDIA_MUTATION = /* GraphQL */ `
  mutation CreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media { id status }
      mediaUserErrors { field message }
    }
  }
`;

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr;
}

async function main() {
  const handleToGidFile = process.env.HANDLE_TO_GID_FILE || '/Users/ayushjaiswal/Downloads/handle_to_gid.json';
  const handleImagesFile = process.env.HANDLE_IMAGES_FILE || '/Users/ayushjaiswal/Downloads/handle_images.json';
  const handleToGid: Record<string, string> = JSON.parse(readFileSync(handleToGidFile, 'utf-8'));
  const handleImages: Record<string, string[]> = JSON.parse(readFileSync(handleImagesFile, 'utf-8'));

  const onlyFile = process.env.ONLY_HANDLES_FILE;
  let entries = Object.entries(handleToGid);
  if (onlyFile) {
    const only = new Set(readFileSync(onlyFile, 'utf-8').split('\n').map((l) => l.trim()).filter(Boolean));
    entries = entries.filter(([h]) => only.has(h));
  }
  console.log(`Attaching images to ${entries.length} products...`);

  let ok = 0, fail = 0;
  const results: Array<{ handle: string; ok: boolean; count?: number; error?: string }> = [];

  for (const [handle, productId] of entries) {
    const urls = (handleImages[handle] || []).slice(0, 10); // cap: avoid one product hogging the whole run
    if (urls.length === 0) {
      results.push({ handle, ok: false, error: 'no images' });
      fail++;
      continue;
    }
    const media = urls.map((src) => ({ originalSource: src, mediaContentType: 'IMAGE' }));
    try {
      const data = await withRetry(() => shopifyAdminRequest<any>(CREATE_MEDIA_MUTATION, { productId, media }));
      const errs = data.productCreateMedia.mediaUserErrors;
      if (errs?.length) {
        results.push({ handle, ok: false, error: JSON.stringify(errs) });
        fail++;
        console.log(`FAIL ${handle}: ${JSON.stringify(errs)}`);
      } else {
        results.push({ handle, ok: true, count: urls.length });
        ok++;
        console.log(`OK   ${handle} (${urls.length} images)`);
      }
    } catch (e: any) {
      results.push({ handle, ok: false, error: String(e?.message || e) });
      fail++;
      console.log(`FAIL ${handle}: ${e?.message || e}`);
    }
  }

  console.log(`\nDone. ${ok} succeeded, ${fail} failed.`);
  writeFileSync('/Users/ayushjaiswal/Downloads/attach_images_results.json', JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
