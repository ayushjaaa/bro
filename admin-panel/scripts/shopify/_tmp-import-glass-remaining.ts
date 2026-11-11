/**
 * Imports the products from the client's revised glass/silicone export (Gemini_Distribution_Shopify_Export (4).csv)
 * that aren't live yet (glass_remaining_plan.json). Same flow as _tmp-import-clean-glass.ts, but the sub-category
 * IDs are read from Shopify by name, so the 7 sections made by _tmp-create-glass-sections.ts are covered.
 *
 * Idempotent: a handle that already exists is skipped. Run:
 *   npx tsx --env-file=.env.local scripts/shopify/_tmp-import-glass-remaining.ts <plan.json> [--limit N]
 */
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { readFileSync, writeFileSync } from 'fs';

const INVENTORY_LOCATION_ID = 'gid://shopify/Location/84994621638';
const CANNABIS_ACCESSORIES = 'gid://shopify/Metaobject/252082094278';
const SUBCATEGORY_IDS: Record<string, string> = {};

async function loadSubcategories() {
  const r: any = await shopifyAdminRequest<any>(`{metaobjects(type:"sub_category",first:250){nodes{id fields{key value}}}}`);
  for (const n of r.metaobjects.nodes) {
    const f = Object.fromEntries(n.fields.map((x: any) => [x.key, x.value]));
    if (f.category === CANNABIS_ACCESSORIES) SUBCATEGORY_IDS[f.name] = n.id;
  }
}

type Variant = { name: string; sku: string; price: string; compareAt: string | null; qty: number; image: string | null };
type Plan = {
  handle: string; title: string; descriptionHtml: string; subcategory: string; brand: string; optionName: string;
  images: { src: string; alt: string }[]; variants: Variant[];
};

const ok = (errs: any[] | undefined, what: string) => { if (errs?.length) throw new Error(`${what}: ${JSON.stringify(errs)}`); };

async function brandId(name: string, subId: string, cache: Map<string, string>): Promise<string> {
  const key = `${subId}::${name}`;
  if (cache.has(key)) return cache.get(key)!;
  const r = await shopifyAdminRequest<any>(`mutation($m:MetaobjectCreateInput!){metaobjectCreate(metaobject:$m){metaobject{id} userErrors{field message}}}`,
    { m: { type: 'brand', fields: [{ key: 'name', value: name }, { key: 'sub_category', value: subId }] } });
  ok(r.metaobjectCreate.userErrors, `create brand ${name}`);
  cache.set(key, r.metaobjectCreate.metaobject.id);
  console.log(`created brand "${name}" under ${subId}`);
  return r.metaobjectCreate.metaobject.id;
}

async function loadBrands(): Promise<Map<string, string>> {
  const m = new Map<string, string>(); let after: string | null = null;
  do {
    const r: any = await shopifyAdminRequest<any>(`query($a:String){metaobjects(type:"brand",first:250,after:$a){pageInfo{hasNextPage endCursor} nodes{id fields{key value}}}}`, { a: after });
    for (const n of r.metaobjects.nodes) { const f = Object.fromEntries(n.fields.map((x: any) => [x.key, x.value])); m.set(`${f.sub_category}::${f.name}`, n.id); }
    after = r.metaobjects.pageInfo.hasNextPage ? r.metaobjects.pageInfo.endCursor : null;
  } while (after);
  return m;
}

async function waitForMedia(productId: string, expected: number): Promise<{ id: string; status: string }[]> {
  for (let i = 0; i < 20; i++) {
    const r = await shopifyAdminRequest<any>(`query($id:ID!){product(id:$id){media(first:50){nodes{id status}}}}`, { id: productId });
    const nodes = r.product.media.nodes;
    if (nodes.length >= expected && nodes.every((n: any) => n.status === 'READY' || n.status === 'FAILED')) return nodes;
    await new Promise((res) => setTimeout(res, 1500));
  }
  const r = await shopifyAdminRequest<any>(`query($id:ID!){product(id:$id){media(first:50){nodes{id status}}}}`, { id: productId });
  return r.product.media.nodes;
}

async function importOne(p: Plan, brands: Map<string, string>, publicationId: string) {
  const exists = await shopifyAdminRequest<any>(`query($h:String!){productByHandle(handle:$h){id}}`, { h: p.handle });
  if (exists.productByHandle) return { handle: p.handle, status: 'skipped (already exists)', id: exists.productByHandle.id };
  const subId = SUBCATEGORY_IDS[p.subcategory];
  if (!subId) throw new Error(`unknown sub-category ${p.subcategory}`);
  const bId = await brandId(p.brand, subId, brands);
  const optionName = p.optionName === 'Title' ? 'Title' : p.optionName;

  const created = await shopifyAdminRequest<any>(`mutation($product:ProductCreateInput!,$media:[CreateMediaInput!]){productCreate(product:$product,media:$media){product{id} userErrors{field message}}}`, {
    product: {
      handle: p.handle, title: p.title, descriptionHtml: p.descriptionHtml, productType: p.subcategory, vendor: p.brand,
      status: 'ACTIVE', tags: [],
      productOptions: [{ name: optionName, values: [{ name: p.variants[0].name }] }],
      metafields: [{ namespace: 'taxonomy', key: 'brand', type: 'metaobject_reference', value: bId }],
    },
    media: p.images.map((im) => ({ originalSource: im.src, alt: im.alt.replace(/^Default Title\s+/, ''), mediaContentType: 'IMAGE' })),
  });
  ok(created.productCreate.userErrors, 'productCreate');
  const productId = created.productCreate.product.id;

  const media = await waitForMedia(productId, p.images.length);
  const failedMedia = media.filter((m) => m.status === 'FAILED').length;
  const mediaIdBySrc = new Map(p.images.map((im, i) => [im.src, media[i]?.id]));

  const variants = p.variants.map((v) => {
    const input: Record<string, unknown> = {
      optionValues: [{ name: v.name, optionName }],
      price: v.price,
      inventoryItem: { sku: v.sku, tracked: true },
      inventoryQuantities: [{ availableQuantity: Math.max(0, v.qty), locationId: INVENTORY_LOCATION_ID }],
      inventoryPolicy: 'DENY',
    };
    if (v.compareAt) input.compareAtPrice = v.compareAt;
    const mid = v.image ? mediaIdBySrc.get(v.image) : undefined;
    if (mid) input.mediaId = mid;
    return input;
  });
  const vr = await shopifyAdminRequest<any>(`mutation($productId:ID!,$variants:[ProductVariantsBulkInput!]!){productVariantsBulkCreate(productId:$productId,variants:$variants,strategy:REMOVE_STANDALONE_VARIANT){productVariants{id} userErrors{field message}}}`,
    { productId, variants });
  ok(vr.productVariantsBulkCreate.userErrors, 'productVariantsBulkCreate');

  const pub = await shopifyAdminRequest<any>(`mutation($id:ID!,$input:[PublicationInput!]!){publishablePublish(id:$id,input:$input){userErrors{field message}}}`,
    { id: productId, input: [{ publicationId }] });
  ok(pub.publishablePublish.userErrors, 'publish');

  return { handle: p.handle, status: 'created', id: productId, media: media.length, failedMedia };
}

async function main() {
  const [planFile, ...rest] = process.argv.slice(2);
  const li = rest.indexOf('--limit');
  const limit = li >= 0 ? parseInt(rest[li + 1], 10) : Infinity;
  const plan: Plan[] = JSON.parse(readFileSync(planFile, 'utf-8')).slice(0, limit);
  await loadSubcategories();
  const missing = [...new Set(plan.map((p) => p.subcategory))].filter((s) => !SUBCATEGORY_IDS[s]);
  if (missing.length) throw new Error(`sub-categories not found: ${missing.join(', ')}`);
  const brands = await loadBrands();
  const pubs = await shopifyAdminRequest<any>(`{publications(first:20){nodes{id name}}}`);
  const publicationId = pubs.publications.nodes.find((n: any) => n.name === 'Online Store')?.id;
  if (!publicationId) throw new Error('Online Store publication not found');

  const results: any[] = [];
  for (const p of plan) {
    try {
      const r = await importOne(p, brands, publicationId);
      results.push(r);
      console.log(`${r.status.padEnd(8)} ${p.handle}${'failedMedia' in r && r.failedMedia ? `  (${r.failedMedia} image(s) failed)` : ''}`);
    } catch (e: any) {
      results.push({ handle: p.handle, status: 'FAILED', error: String(e.message ?? e) });
      console.log(`FAILED   ${p.handle}: ${e.message ?? e}`);
    }
  }
  writeFileSync(planFile.replace(/\.json$/, '.results.json'), JSON.stringify(results, null, 2));
  const c = (s: string) => results.filter((r) => r.status.startsWith(s)).length;
  console.log(`\nDone: ${c('created')} created, ${c('skipped')} skipped, ${c('FAILED')} failed.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
