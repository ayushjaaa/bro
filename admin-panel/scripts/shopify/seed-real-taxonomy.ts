/**
 * One-time seed script — populates real taxonomy (Category -> Sub-category -> Brand), 3-level
 * design confirmed 2026-08-23 (matches Shopify metaobject best-practice research: 2-3 levels
 * recommended, thin/near-empty grouping levels folded into their parent).
 *
 * Data researched from script.js's CATALOG (jubileesk.ca-informed) and this planning session.
 *
 * Edge cases handled:
 * - Idempotent: checks for an existing entry (by name + parent) before creating, safe to re-run.
 * - Reuses existing real data ("Vapes" -> "Disposable Vapes" -> "Mr Fog") rather than duplicating.
 * - Deletes known junk/test categories ("flavour beast", "smock") left over from earlier testing.
 * - "Rolling Accessories" wrapper level is deliberately SKIPPED (per this session's decision,
 *   confirmed against best-practice research) -- Rolling Papers/Blunts & Wraps/Pre-Rolled Cones/
 *   Filters & Tips/Rolling Accessories(leaf item)/Tobacco are DIRECT children of "Smoking".
 * - Brands appearing under multiple sub-categories (e.g. "Spider" under both Torch Lighters and
 *   Butane) get a separate metaobject entry per sub-category -- Brand's parent is always exactly
 *   one Sub-category, duplicate names across branches are expected, not a bug.
 *
 * Run: npm run shopify:seed-real-taxonomy
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

interface MetaobjectField {
  key: string;
  value: string | null;
  reference: { id: string } | null;
}
interface MetaobjectsResponse {
  metaobjects: { nodes: Array<{ id: string; fields: MetaobjectField[] }> };
}

const LIST_QUERY = /* GraphQL */ `
  query List($type: String!) {
    metaobjects(type: $type, first: 250) {
      nodes { id fields { key value reference { ... on Metaobject { id } } } }
    }
  }
`;
const CREATE_MUTATION = /* GraphQL */ `
  mutation Create($metaobject: MetaobjectCreateInput!) {
    metaobjectCreate(metaobject: $metaobject) {
      metaobject { id }
      userErrors { field message }
    }
  }
`;
const DELETE_MUTATION = /* GraphQL */ `
  mutation Delete($id: ID!) {
    metaobjectDelete(id: $id) { deletedId userErrors { field message } }
  }
`;

function fieldValue(fields: MetaobjectField[], key: string) {
  return fields.find((f) => f.key === key)?.value ?? null;
}
function fieldRefId(fields: MetaobjectField[], key: string) {
  return fields.find((f) => f.key === key)?.reference?.id ?? null;
}

async function listAll(type: string, parentKey?: string) {
  const data = await shopifyAdminRequest<MetaobjectsResponse>(LIST_QUERY, { type });
  return data.metaobjects.nodes.map((n) => ({
    id: n.id,
    name: fieldValue(n.fields, 'name') ?? '',
    parentId: parentKey ? fieldRefId(n.fields, parentKey) : null,
  }));
}

async function findOrCreate(
  type: string,
  name: string,
  existing: Array<{ id: string; name: string; parentId: string | null }>,
  parentField?: { key: string; id: string }
): Promise<string> {
  const match = existing.find(
    (e) => e.name === name && (!parentField || e.parentId === parentField.id)
  );
  if (match) {
    console.log(`    exists, skipping: ${name}`);
    return match.id;
  }
  const fields = [{ key: 'name', value: name }];
  if (parentField) fields.push({ key: parentField.key, value: parentField.id });
  const data = await shopifyAdminRequest<any>(CREATE_MUTATION, { metaobject: { type, fields } });
  assertNoUserErrors(data.metaobjectCreate.userErrors, `create ${type} "${name}"`);
  const id = data.metaobjectCreate.metaobject.id;
  console.log(`    created: ${name} -> ${id}`);
  existing.push({ id, name, parentId: parentField?.id ?? null });
  return id;
}

async function deleteJunk(names: string[]) {
  const categories = await listAll('category');
  for (const junk of categories.filter((c) => names.includes(c.name))) {
    const data = await shopifyAdminRequest<any>(DELETE_MUTATION, { id: junk.id });
    assertNoUserErrors(data.metaobjectDelete.userErrors, `delete "${junk.name}"`);
    console.log(`  deleted junk category: ${junk.name}`);
  }
}

async function deleteJunkBrands(names: string[]) {
  const brands = await listAll('brand', 'sub_category');
  for (const junk of brands.filter((b) => names.includes(b.name))) {
    const data = await shopifyAdminRequest<any>(DELETE_MUTATION, { id: junk.id });
    assertNoUserErrors(data.metaobjectDelete.userErrors, `delete "${junk.name}"`);
    console.log(`  deleted junk brand: ${junk.name}`);
  }
}

const TREE: Record<string, Record<string, string[]>> = {
  Vapes: {
    'Disposable Vapes': [
      'Flavour Beast', 'Oxbar', 'Mr Fog', 'Stlth', 'Kraze', 'Geek Bar', 'Gcore',
      "Drip'n", 'Ripper', 'Instabar', 'Doozy Quad', 'Vice', 'Elf Bar',
    ],
    'E-Liquids / Vape Juice': [
      // "Gcore 30ml"/"Gcore 60ml" and "Flavour Beast 30ml"/"Flavour Beast 60ml" were a data bug --
      // bottle size is a product attribute (Bottle Size filter, see §7 of the implementation doc),
      // not a separate brand. Fixed 2026-08-23: one brand entry each, size handled as a
      // Product-Level metafield when the Product Line is created.
      'Gcore', 'Flavour Beast',
      'Lemon Drop', 'Flavour Drop', 'Berry Drop', 'Kapow', 'Mr Fog E-Juices',
      'Oxbar', 'ElfLiq', 'Delicious Drip E-Juice', 'Vice', 'Koil Killaz', 'Naked',
    ],
    'Pre-Filled Pods': [
      'Flavour Beast Pods', 'Ripper X 75K Pods', 'Oxbar Maglink 90K Pods', 'Mr Fog Switch Pods',
    ],
    'Vape Devices': ['Vaporesso', 'Mr Fog Drt Device', 'Battery', 'Caliburn'],
    'Vape Hardware & Accessories': ['Vaporesso', 'Mr Fog Drt Device', 'Battery', 'Caliburn'],
  },
  Smoking: {
    // "Rolling Accessories" wrapper deliberately skipped -- these are direct children of Smoking
    'Rolling Papers': ['RAW', 'Elements', 'Zig-Zag', 'OCB', 'Job', 'Bambu'],
    'Blunts & Wraps': [],
    'Pre-Rolled Cones': [],
    'Filters & Tips': [],
    'Rolling Accessories': [], // the leaf item (Rolling Trays/Machines/Mats), not the old wrapper
    Tobacco: [],
    'Torch Lighters': ['Spider', 'Maven', 'Soul', 'Supernova', 'Zengaz', 'Clickit', 'Scorch Torch'],
    Butane: ['Spider', 'Supernova', 'London', 'Whip-It', 'Soul', 'Ronson', 'Zippo', 'K-Lite', 'Nibo'],
  },
  'Cannabis Accessories': {
    Glass: [],
    'Dab & Concentrate': [],
    Grinders: [],
    Scales: [],
    Hookahs: [],
    Storage: [],
    Cleaning: [],
    'Replacement Parts': [],
  },
  Convenience: {
    'Car Air Fresheners': [],
    Lighters: [],
    Batteries: [],
    'General Convenience': [],
  },
};

async function main() {
  console.log('Step 1: cleaning up known junk/test categories...');
  await deleteJunk(['flavour beast', 'smock']);

  console.log('\nStep 1b: fixing Gcore/Flavour Beast bottle-size brand-duplication bug...');
  await deleteJunkBrands(['Gcore 30ml', 'Gcore 60ml', 'Flavour Beast 30ml', 'Flavour Beast 60ml']);

  console.log('\nStep 2: seeding categories, sub-categories, brands...');
  const categories = await listAll('category');
  const subcategories = await listAll('sub_category', 'category');
  const brands = await listAll('brand', 'sub_category');

  for (const [categoryName, subMap] of Object.entries(TREE)) {
    console.log(`\nCategory: ${categoryName}`);
    const categoryId = await findOrCreate('category', categoryName, categories);

    for (const [subName, brandNames] of Object.entries(subMap)) {
      console.log(`  Sub-category: ${subName}`);
      const subId = await findOrCreate('sub_category', subName, subcategories, {
        key: 'category',
        id: categoryId,
      });

      for (const brandName of brandNames) {
        await findOrCreate('brand', brandName, brands, { key: 'sub_category', id: subId });
      }
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('\nFailed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
