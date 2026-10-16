/**
 * Creates the brand metaobjects that are missing for the 3 new Jubilee CSVs
 * (cones, torch lighters, vapes) before any product import runs.
 * Idempotent-ish: re-checks the live brand list right before creating, skips exact
 * (name, sub_category) matches that already exist.
 *
 * Run: npx tsx --env-file=.env.local scripts/shopify/_tmp-create-missing-brands.ts
 */
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';

const SUBCATS = {
  'Pre-Rolled Cones': 'gid://shopify/Metaobject/252081307846',
  'Torch Lighters': 'gid://shopify/Metaobject/252081438918',
  'E-Liquids / Vape Juice': 'gid://shopify/Metaobject/252080062662',
  'Pre-Filled Pods': 'gid://shopify/Metaobject/252080521414',
} as const;

const TO_CREATE: Array<{ subcat: keyof typeof SUBCATS; name: string }> = [
  // Pre-Rolled Cones -- 0 brands existed for this sub-category before this import
  { subcat: 'Pre-Rolled Cones', name: 'Beautiful Burns' },
  { subcat: 'Pre-Rolled Cones', name: 'Blazy Susan' },
  { subcat: 'Pre-Rolled Cones', name: 'Elements' },
  { subcat: 'Pre-Rolled Cones', name: "Juicy Jay's" },
  { subcat: 'Pre-Rolled Cones', name: 'Kush' },
  { subcat: 'Pre-Rolled Cones', name: 'Pop' },
  { subcat: 'Pre-Rolled Cones', name: 'RAW' },
  { subcat: 'Pre-Rolled Cones', name: 'Royal Blunts' },
  { subcat: 'Pre-Rolled Cones', name: 'Zig-Zag' },
  // Torch Lighters -- 7 brands already existed (Spider, Maven, Soul, Supernova, Zengaz, Clickit,
  // Scorch Torch); these 5 are new
  { subcat: 'Torch Lighters', name: 'Eagle' },
  { subcat: 'Torch Lighters', name: 'Special Blue' },
  { subcat: 'Torch Lighters', name: 'Supreme' },
  { subcat: 'Torch Lighters', name: 'Techno' },
  { subcat: 'Torch Lighters', name: 'Three Flames' },
  // E-Liquids / Vape Juice -- new brand names not already in this sub-category's list
  { subcat: 'E-Liquids / Vape Juice', name: 'Doozy' },
  { subcat: 'E-Liquids / Vape Juice', name: "Drip'n" },
  { subcat: 'E-Liquids / Vape Juice', name: 'Fruitbae' },
  { subcat: 'E-Liquids / Vape Juice', name: 'Rufpuf' },
  // Pre-Filled Pods -- CSV uses generic brand names, distinct from the existing specific ones
  // ("Flavour Beast Pods", "Mr Fog Switch Pods", "Oxbar Maglink 90K Pods", "Ripper X 75K Pods")
  { subcat: 'Pre-Filled Pods', name: 'Flavour Beast' },
  { subcat: 'Pre-Filled Pods', name: 'Mr Fog' },
  { subcat: 'Pre-Filled Pods', name: 'Oxbar' },
  { subcat: 'Pre-Filled Pods', name: 'Ripper' },
];

const LIST_BRANDS_QUERY = /* GraphQL */ `
  query { metaobjects(type: "brand", first: 250) { nodes { id fields { key value } } } }
`;

const METAOBJECT_CREATE_MUTATION = /* GraphQL */ `
  mutation MetaobjectCreate($metaobject: MetaobjectCreateInput!) {
    metaobjectCreate(metaobject: $metaobject) {
      metaobject { id handle }
      userErrors { field message }
    }
  }
`;

async function main() {
  const data = await shopifyAdminRequest<any>(LIST_BRANDS_QUERY);
  const existing = new Set<string>();
  for (const n of data.metaobjects.nodes) {
    const f: any = {};
    n.fields.forEach((x: any) => (f[x.key] = x.value));
    existing.add(`${f.sub_category}::${f.name}`);
  }

  const created: Record<string, string> = {};
  for (const { subcat, name } of TO_CREATE) {
    const subcategoryId = SUBCATS[subcat];
    const key = `${subcategoryId}::${name}`;
    if (existing.has(key)) {
      console.log(`SKIP (already exists): ${subcat} / ${name}`);
      continue;
    }
    const res = await shopifyAdminRequest<any>(METAOBJECT_CREATE_MUTATION, {
      metaobject: {
        type: 'brand',
        fields: [
          { key: 'name', value: name },
          { key: 'sub_category', value: subcategoryId },
        ],
      },
    });
    const errs = res.metaobjectCreate.userErrors;
    if (errs?.length) {
      console.error(`FAILED: ${subcat} / ${name}:`, JSON.stringify(errs));
      continue;
    }
    const id = res.metaobjectCreate.metaobject.id;
    created[`${subcat}::${name}`] = id;
    console.log(`CREATED: ${subcat} / ${name} -> ${id}`);
  }

  console.log('\n--- created map (for the import script) ---');
  console.log(JSON.stringify(created, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
