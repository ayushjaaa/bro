/**
 * Fresh, from-scratch audit of all 299 imported products, live against Shopify -- no reliance on
 * any prior log file's claims. Checks per product:
 *  - productType/vendor set and non-empty
 *  - taxonomy.brand reference resolves to a real brand metaobject
 *  - every filterValues key from import_plan.json is present as a real metafield with the right value
 *  - >=1 media image, all READY
 *  - >=1 variant with a valid positive price
 *  - region tag/metafield: cones & lighters must have NEITHER; vapes must have BOTH, matching plan
 * Run: npx tsx --env-file=.env.local scripts/shopify/_tmp-final-full-audit.ts
 */
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { readFileSync, writeFileSync } from 'fs';

const Q = `query($id: ID!) {
  product(id: $id) {
    title productType vendor tags
    media(first: 5) { nodes { ... on MediaImage { status } } }
    variants(first: 5) { nodes { price } }
    customMetafields: metafields(first: 20, namespace: "custom") { nodes { key value } }
    brandMf: metafield(namespace: "taxonomy", key: "brand") {
      reference { ... on Metaobject { fields { key value } } }
    }
  }
}`;

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); } catch (e) { lastErr = e; if (i < retries) await new Promise((r) => setTimeout(r, 800 * (i + 1))); }
  }
  throw lastErr;
}

type PlanProduct = { handle: string; subcategory: string; brand: string; region: string; filterValues: Record<string, string> };

async function main() {
  const plan: PlanProduct[] = JSON.parse(readFileSync('/Users/ayushjaiswal/Downloads/import_plan.json', 'utf-8'));
  const handleToGid: Record<string, string> = JSON.parse(readFileSync('/Users/ayushjaiswal/Downloads/handle_to_gid.json', 'utf-8'));

  const problems: Array<{ handle: string; issues: string[] }> = [];
  let clean = 0;

  for (const p of plan) {
    const id = handleToGid[p.handle];
    const issues: string[] = [];
    if (!id) { problems.push({ handle: p.handle, issues: ['no gid mapping'] }); continue; }

    const data = await withRetry(() => shopifyAdminRequest<any>(Q, { id }));
    const prod = data.product;
    if (!prod) { problems.push({ handle: p.handle, issues: ['product not found'] }); continue; }

    if (prod.productType !== p.subcategory) issues.push(`productType "${prod.productType}" != expected "${p.subcategory}"`);
    if (prod.vendor !== p.brand) issues.push(`vendor "${prod.vendor}" != expected "${p.brand}"`);

    const brandName = prod.brandMf?.reference?.fields?.find((f: any) => f.key === 'name')?.value;
    if (brandName !== p.brand) issues.push(`taxonomy.brand name "${brandName}" != expected "${p.brand}"`);

    const media = prod.media.nodes;
    if (media.length === 0) issues.push('no images');
    else if (!media.every((m: any) => m.status === 'READY')) issues.push('an image not READY');

    const variants = prod.variants.nodes;
    if (variants.length === 0 || !variants.every((v: any) => parseFloat(v.price) > 0)) issues.push('bad/missing variant price');

    const cmf: Record<string, string> = {};
    prod.customMetafields.nodes.forEach((n: any) => (cmf[n.key] = n.value));
    for (const [key, expected] of Object.entries(p.filterValues)) {
      const actual = cmf[key];
      const norm = key === 'eliquid_bottle_size' ? expected.toLowerCase() : expected;
      if (actual !== norm) issues.push(`filter ${key}: got "${actual}", expected "${norm}"`);
    }

    const isCategoryScoped = p.subcategory === 'Pre-Rolled Cones' || p.subcategory === 'Torch Lighters';
    const hasRegionTag = prod.tags.some((t: string) => t.startsWith('region-'));
    const hasRegionMf = cmf['region'] !== undefined;
    if (isCategoryScoped) {
      if (hasRegionTag || hasRegionMf) issues.push('cones/lighters should have NO region tag/metafield, but has one');
    } else {
      if (!hasRegionTag) issues.push(`vape product missing region-${p.region} tag`);
      if (cmf['region'] !== p.region) issues.push(`region metafield "${cmf['region']}" != expected "${p.region}"`);
    }

    if (issues.length > 0) {
      problems.push({ handle: p.handle, issues });
      console.log(`ISSUE ${p.handle}: ${issues.join(' | ')}`);
    } else {
      clean++;
    }
  }

  console.log(`\n=== FINAL AUDIT SUMMARY ===`);
  console.log(`Total: ${plan.length}`);
  console.log(`Fully clean: ${clean}`);
  console.log(`With issues: ${problems.length}`);
  writeFileSync('/Users/ayushjaiswal/Downloads/final_audit_problems.json', JSON.stringify(problems, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
