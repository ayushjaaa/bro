/**
 * One-time seed script — populates real Product-Level filter_definitions (ADMIN_PANEL_IMPLEMENTATION.md
 * §7) for every Sub-category, sourced from script.js's CATALOG `filters` arrays (jubileesk.ca-informed)
 * and this planning session's Native/Product/Variant classification (2026-08-24): every filter in
 * this catalog turned out to be Product-Level except Brand/Price/Availability/Flavor, which are
 * Native (no metafield needed) -- see §7.0.
 *
 * Keys are domain-prefixed per Sub-category (§7.3) -- e.g. "rolling_paper_material" vs
 * "glass_material" -- because the SAME label ("Material") means different things in different
 * Sub-categories; a shared/generic key would let a Rolling-Papers product get assigned a
 * Glass-only choice.
 *
 * Only 3 filters have real enum choices in script.js (Rolling Papers' Paper Size + Material,
 * Torch Lighters' Flame Type); everything else seeds with a single placeholder choice
 * ("To be confirmed") since the real value-lists aren't known yet. Admins can already add more
 * Choices values via Shopify Admin -> Settings -> Custom data (live-verified earlier this session
 * that Choices lists are editable there natively) even before this admin panel gets its own
 * "edit filter" UI.
 *
 * Idempotent: skips any filter_definition whose `key` already exists; safe to re-run.
 *
 * Run: npm run shopify:seed-real-filters
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

interface FilterSpec {
  label: string;
  key: string;
  choices: string[];
}

interface SubcategorySpec {
  subcategoryName: string;
  filters: FilterSpec[];
}

function key(domain: string, label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[/]/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${domain}_${slug}`;
}

const TBD = ['To be confirmed'];

const SPECS: SubcategorySpec[] = [
  {
    subcategoryName: 'Disposable Vapes',
    filters: [
      { label: 'Puff Count', key: key('disposable_vape', 'Puff Count'), choices: TBD },
      { label: 'Nicotine Strength', key: key('disposable_vape', 'Nicotine Strength'), choices: TBD },
      { label: 'Nicotine Type', key: key('disposable_vape', 'Nicotine Type'), choices: TBD },
      { label: 'Device Type', key: key('disposable_vape', 'Device Type'), choices: TBD },
      { label: 'Pack Quantity', key: key('disposable_vape', 'Pack Quantity'), choices: TBD },
    ],
  },
  {
    subcategoryName: 'E-Liquids / Vape Juice',
    filters: [
      { label: 'Nicotine Strength', key: key('eliquid', 'Nicotine Strength'), choices: TBD },
      { label: 'Nicotine Type', key: key('eliquid', 'Nicotine Type'), choices: TBD },
      { label: 'Bottle Size', key: key('eliquid', 'Bottle Size'), choices: TBD },
      { label: 'VG/PG Ratio', key: key('eliquid', 'VG/PG Ratio'), choices: TBD },
      { label: 'Pack Quantity', key: key('eliquid', 'Pack Quantity'), choices: TBD },
    ],
  },
  {
    subcategoryName: 'Pre-Filled Pods',
    filters: [
      { label: 'Device Compatibility', key: key('pod', 'Device Compatibility'), choices: TBD },
      { label: 'Nicotine Strength', key: key('pod', 'Nicotine Strength'), choices: TBD },
      { label: 'Pod Capacity', key: key('pod', 'Pod Capacity'), choices: TBD },
      { label: 'Pack Quantity', key: key('pod', 'Pack Quantity'), choices: TBD },
    ],
  },
  {
    subcategoryName: 'Vape Devices',
    filters: [
      { label: 'Device Type', key: key('vape_device', 'Device Type'), choices: TBD },
      { label: 'Battery Capacity', key: key('vape_device', 'Battery Capacity'), choices: TBD },
      { label: 'Battery Type', key: key('vape_device', 'Battery Type'), choices: TBD },
      { label: 'Pod/Tank Capacity', key: key('vape_device', 'Pod/Tank Capacity'), choices: TBD },
      { label: 'Coil Compatibility', key: key('vape_device', 'Coil Compatibility'), choices: TBD },
      { label: 'Color', key: key('vape_device', 'Color'), choices: TBD },
      { label: 'Pack Quantity', key: key('vape_device', 'Pack Quantity'), choices: TBD },
    ],
  },
  {
    subcategoryName: 'Vape Hardware & Accessories',
    filters: [
      { label: 'Compatibility', key: key('vape_hardware', 'Compatibility'), choices: TBD },
      { label: 'Resistance', key: key('vape_hardware', 'Resistance'), choices: TBD },
      { label: 'Capacity', key: key('vape_hardware', 'Capacity'), choices: TBD },
      { label: 'Size', key: key('vape_hardware', 'Size'), choices: TBD },
      { label: 'Color', key: key('vape_hardware', 'Color'), choices: TBD },
      { label: 'Pack Quantity', key: key('vape_hardware', 'Pack Quantity'), choices: TBD },
    ],
  },
  {
    subcategoryName: 'Rolling Papers',
    filters: [
      { label: 'Paper Size', key: key('rolling_paper', 'Paper Size'), choices: ['King Size', 'King Size Slim', '1¼', 'Single Wide'] },
      { label: 'Material', key: key('rolling_paper', 'Material'), choices: ['Hemp', 'Rice', 'Unbleached', 'Other'] },
      { label: 'Paper Type', key: key('rolling_paper', 'Paper Type'), choices: TBD },
      { label: 'Length / Width', key: key('rolling_paper', 'Length / Width'), choices: TBD },
      { label: 'Pack Quantity', key: key('rolling_paper', 'Pack Quantity'), choices: TBD },
    ],
  },
  {
    subcategoryName: 'Blunts & Wraps',
    filters: [
      { label: 'Material', key: key('blunt_wrap', 'Material'), choices: TBD },
      { label: 'Size', key: key('blunt_wrap', 'Size'), choices: TBD },
      { label: 'Wrap Type', key: key('blunt_wrap', 'Wrap Type'), choices: TBD },
      { label: 'Count / Pack Quantity', key: key('blunt_wrap', 'Count / Pack Quantity'), choices: TBD },
    ],
  },
  {
    subcategoryName: 'Pre-Rolled Cones',
    filters: [
      { label: 'Cone Size', key: key('cone', 'Cone Size'), choices: TBD },
      { label: 'Material', key: key('cone', 'Material'), choices: TBD },
      { label: 'Count', key: key('cone', 'Count'), choices: TBD },
      { label: 'Pack Quantity', key: key('cone', 'Pack Quantity'), choices: TBD },
    ],
  },
  {
    subcategoryName: 'Filters & Tips',
    filters: [
      { label: 'Material', key: key('filter_tip', 'Material'), choices: TBD },
      { label: 'Tip Type', key: key('filter_tip', 'Tip Type'), choices: TBD },
      { label: 'Size', key: key('filter_tip', 'Size'), choices: TBD },
      { label: 'Color', key: key('filter_tip', 'Color'), choices: TBD },
      { label: 'Pack Quantity', key: key('filter_tip', 'Pack Quantity'), choices: TBD },
    ],
  },
  {
    subcategoryName: 'Rolling Accessories',
    filters: [
      { label: 'Product Type', key: key('rolling_accessory', 'Product Type'), choices: TBD },
      { label: 'Size', key: key('rolling_accessory', 'Size'), choices: TBD },
      { label: 'Material', key: key('rolling_accessory', 'Material'), choices: TBD },
      { label: 'Color', key: key('rolling_accessory', 'Color'), choices: TBD },
      { label: 'Design', key: key('rolling_accessory', 'Design'), choices: TBD },
    ],
  },
  {
    subcategoryName: 'Tobacco',
    filters: [
      { label: 'Tobacco Type', key: key('tobacco', 'Tobacco Type'), choices: TBD },
      { label: 'Size', key: key('tobacco', 'Size'), choices: TBD },
      { label: 'Quantity', key: key('tobacco', 'Quantity'), choices: TBD },
      { label: 'Pack Size', key: key('tobacco', 'Pack Size'), choices: TBD },
    ],
  },
  {
    subcategoryName: 'Torch Lighters',
    filters: [
      { label: 'Flame Type', key: key('torch_lighter', 'Flame Type'), choices: ['Single Flame', 'Dual Flame', 'Multi-Flame', 'Adjustable Flame'] },
      { label: 'Refillable', key: key('torch_lighter', 'Refillable'), choices: TBD },
      { label: 'Ignition Type', key: key('torch_lighter', 'Ignition Type'), choices: TBD },
      { label: 'Torch Type', key: key('torch_lighter', 'Torch Type'), choices: TBD },
      { label: 'Size', key: key('torch_lighter', 'Size'), choices: TBD },
      { label: 'Color / Design', key: key('torch_lighter', 'Color / Design'), choices: TBD },
      { label: 'Pack / Display Quantity', key: key('torch_lighter', 'Pack / Display Quantity'), choices: TBD },
    ],
  },
  {
    subcategoryName: 'Butane',
    filters: [
      { label: 'Butane Type', key: key('butane', 'Butane Type'), choices: TBD },
      { label: 'Can Size', key: key('butane', 'Can Size'), choices: TBD },
      { label: 'Weight', key: key('butane', 'Weight'), choices: TBD },
      { label: 'Refinement / Purity', key: key('butane', 'Refinement / Purity'), choices: TBD },
      { label: 'Pack Quantity', key: key('butane', 'Pack Quantity'), choices: TBD },
      { label: 'Container Type', key: key('butane', 'Container Type'), choices: TBD },
    ],
  },
  {
    subcategoryName: 'Glass',
    filters: [
      { label: 'Product Type', key: key('glass', 'Product Type'), choices: TBD },
      { label: 'Size / Height', key: key('glass', 'Size / Height'), choices: TBD },
      { label: 'Material', key: key('glass', 'Material'), choices: TBD },
      { label: 'Color', key: key('glass', 'Color'), choices: TBD },
      { label: 'Percolator Type', key: key('glass', 'Percolator Type'), choices: TBD },
      { label: 'Joint Size', key: key('glass', 'Joint Size'), choices: TBD },
      { label: 'Joint Type', key: key('glass', 'Joint Type'), choices: TBD },
      { label: 'Design', key: key('glass', 'Design'), choices: TBD },
    ],
  },
  {
    subcategoryName: 'Dab & Concentrate',
    filters: [
      { label: 'Product Type', key: key('dab', 'Product Type'), choices: TBD },
      { label: 'Material', key: key('dab', 'Material'), choices: TBD },
      { label: 'Size', key: key('dab', 'Size'), choices: TBD },
      { label: 'Joint Size', key: key('dab', 'Joint Size'), choices: TBD },
      { label: 'Color', key: key('dab', 'Color'), choices: TBD },
    ],
  },
  {
    subcategoryName: 'Grinders',
    filters: [
      { label: 'Grinder Type', key: key('grinder', 'Grinder Type'), choices: TBD },
      { label: 'Material', key: key('grinder', 'Material'), choices: TBD },
      { label: 'Size', key: key('grinder', 'Size'), choices: TBD },
      { label: 'Number of Pieces', key: key('grinder', 'Number of Pieces'), choices: TBD },
      { label: 'Color', key: key('grinder', 'Color'), choices: TBD },
    ],
  },
  {
    subcategoryName: 'Scales',
    filters: [
      { label: 'Capacity', key: key('scale', 'Capacity'), choices: TBD },
      { label: 'Accuracy', key: key('scale', 'Accuracy'), choices: TBD },
      { label: 'Scale Type', key: key('scale', 'Scale Type'), choices: TBD },
      { label: 'Unit Options', key: key('scale', 'Unit Options'), choices: TBD },
      { label: 'Size', key: key('scale', 'Size'), choices: TBD },
    ],
  },
  {
    subcategoryName: 'Hookahs',
    filters: [
      { label: 'Size', key: key('hookah', 'Size'), choices: TBD },
      { label: 'Material', key: key('hookah', 'Material'), choices: TBD },
      { label: 'Hose Count', key: key('hookah', 'Hose Count'), choices: TBD },
      { label: 'Color', key: key('hookah', 'Color'), choices: TBD },
      { label: 'Product Type', key: key('hookah', 'Product Type'), choices: TBD },
    ],
  },
  {
    subcategoryName: 'Storage',
    filters: [
      { label: 'Material', key: key('storage', 'Material'), choices: TBD },
      { label: 'Size', key: key('storage', 'Size'), choices: TBD },
      { label: 'Capacity', key: key('storage', 'Capacity'), choices: TBD },
      { label: 'Closure Type', key: key('storage', 'Closure Type'), choices: TBD },
      { label: 'Color', key: key('storage', 'Color'), choices: TBD },
    ],
  },
  {
    subcategoryName: 'Cleaning',
    filters: [
      { label: 'Product Type', key: key('cleaning', 'Product Type'), choices: TBD },
      { label: 'Size', key: key('cleaning', 'Size'), choices: TBD },
      { label: 'Pack Quantity', key: key('cleaning', 'Pack Quantity'), choices: TBD },
    ],
  },
  {
    subcategoryName: 'Replacement Parts',
    filters: [
      { label: 'Part Type', key: key('replacement_part', 'Part Type'), choices: TBD },
      { label: 'Compatibility', key: key('replacement_part', 'Compatibility'), choices: TBD },
      { label: 'Size', key: key('replacement_part', 'Size'), choices: TBD },
      { label: 'Joint Size', key: key('replacement_part', 'Joint Size'), choices: TBD },
      { label: 'Material', key: key('replacement_part', 'Material'), choices: TBD },
    ],
  },
  {
    subcategoryName: 'Car Air Fresheners',
    filters: [
      { label: 'Scent', key: key('air_freshener', 'Scent'), choices: TBD },
      { label: 'Format', key: key('air_freshener', 'Format'), choices: TBD },
      { label: 'Pack Quantity', key: key('air_freshener', 'Pack Quantity'), choices: TBD },
      { label: 'Size', key: key('air_freshener', 'Size'), choices: TBD },
    ],
  },
  {
    subcategoryName: 'Lighters',
    filters: [
      { label: 'Lighter Type', key: key('lighter', 'Lighter Type'), choices: TBD },
      { label: 'Refillable', key: key('lighter', 'Refillable'), choices: TBD },
      { label: 'Ignition Type', key: key('lighter', 'Ignition Type'), choices: TBD },
      { label: 'Color', key: key('lighter', 'Color'), choices: TBD },
      { label: 'Pack Quantity', key: key('lighter', 'Pack Quantity'), choices: TBD },
    ],
  },
  {
    subcategoryName: 'Batteries',
    filters: [
      { label: 'Battery Type', key: key('battery', 'Battery Type'), choices: TBD },
      { label: 'Size', key: key('battery', 'Size'), choices: TBD },
      { label: 'Capacity', key: key('battery', 'Capacity'), choices: TBD },
      { label: 'Rechargeable', key: key('battery', 'Rechargeable'), choices: TBD },
      { label: 'Pack Quantity', key: key('battery', 'Pack Quantity'), choices: TBD },
    ],
  },
  // General Convenience: no filters -- script.js itself says "only populated once client
  // inventory confirms" (matches §7.2's "no extra fields needed yet" case).
];

// -------------------------------------------------------------------------------------------

interface MetaobjectField {
  key: string;
  value: string | null;
  reference: { id: string } | null;
}

const LIST_SUBCATEGORIES_QUERY = /* GraphQL */ `
  query {
    metaobjects(type: "sub_category", first: 250) {
      nodes { id fields { key value } }
    }
  }
`;

const LIST_FILTER_DEFINITIONS_QUERY = /* GraphQL */ `
  query {
    metaobjects(type: "filter_definition", first: 250) {
      nodes { id fields { key value } }
    }
  }
`;

const METAOBJECT_CREATE_MUTATION = /* GraphQL */ `
  mutation Create($metaobject: MetaobjectCreateInput!) {
    metaobjectCreate(metaobject: $metaobject) {
      metaobject { id }
      userErrors { field message }
    }
  }
`;

const METAFIELD_DEFINITION_CREATE_MUTATION = /* GraphQL */ `
  mutation Create($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition { id }
      userErrors { field message }
    }
  }
`;

const GET_SUBCATEGORY_RELEVANT_FILTERS_QUERY = /* GraphQL */ `
  query($id: ID!) {
    metaobject(id: $id) {
      field(key: "relevant_filters") { value }
    }
  }
`;

const METAOBJECT_UPDATE_MUTATION = /* GraphQL */ `
  mutation Update($id: ID!, $metaobject: MetaobjectUpdateInput!) {
    metaobjectUpdate(id: $id, metaobject: $metaobject) {
      metaobject { id }
      userErrors { field message }
    }
  }
`;

function fieldValue(fields: MetaobjectField[], key: string): string | null {
  return fields.find((f) => f.key === key)?.value ?? null;
}

async function main() {
  console.log('Loading existing sub-categories and filter_definitions...');
  const subsData = await shopifyAdminRequest<any>(LIST_SUBCATEGORIES_QUERY);
  const subcategories: Array<{ id: string; name: string }> = subsData.metaobjects.nodes.map((n: any) => ({
    id: n.id,
    name: fieldValue(n.fields, 'name') ?? '',
  }));

  const filterDefsData = await shopifyAdminRequest<any>(LIST_FILTER_DEFINITIONS_QUERY);
  const existingByKey = new Map<string, string>();
  for (const n of filterDefsData.metaobjects.nodes) {
    const k = fieldValue(n.fields, 'key');
    if (k) existingByKey.set(k, n.id);
  }

  let created = 0;
  let skipped = 0;

  for (const spec of SPECS) {
    const subcategory = subcategories.find((s) => s.name === spec.subcategoryName);
    if (!subcategory) {
      console.log(`  SKIP (sub-category not found): ${spec.subcategoryName}`);
      continue;
    }
    console.log(`\nSub-category: ${spec.subcategoryName}`);

    const newFilterIds: string[] = [];
    for (const filter of spec.filters) {
      let filterId = existingByKey.get(filter.key);
      if (filterId) {
        console.log(`  exists, skipping: ${filter.key}`);
        skipped++;
      } else {
        // Create the matching custom.<key> metafield definition on Product first.
        const mfData = await shopifyAdminRequest<any>(METAFIELD_DEFINITION_CREATE_MUTATION, {
          definition: {
            name: filter.label,
            namespace: 'custom',
            key: filter.key,
            type: 'single_line_text_field',
            ownerType: 'PRODUCT',
            validations: [{ name: 'choices', value: JSON.stringify(filter.choices) }],
            access: { storefront: 'PUBLIC_READ' },
          },
        });
        assertNoUserErrors(mfData.metafieldDefinitionCreate.userErrors, `metafieldDefinitionCreate(custom.${filter.key})`);

        const fields = [
          { key: 'label', value: filter.label },
          { key: 'key', value: filter.key },
          { key: 'level', value: 'product' },
          { key: 'choices', value: JSON.stringify(filter.choices) },
        ];
        const data = await shopifyAdminRequest<any>(METAOBJECT_CREATE_MUTATION, {
          metaobject: { type: 'filter_definition', fields },
        });
        assertNoUserErrors(data.metaobjectCreate.userErrors, `metaobjectCreate(filter_definition ${filter.key})`);
        filterId = data.metaobjectCreate.metaobject.id as string;
        existingByKey.set(filter.key, filterId);
        console.log(`  created: ${filter.key} -> ${filterId}`);
        created++;
      }
      newFilterIds.push(filterId!);
    }

    if (newFilterIds.length === 0) continue;

    // Attach (append, de-duplicated) to the sub-category's relevant_filters.
    const current = await shopifyAdminRequest<any>(GET_SUBCATEGORY_RELEVANT_FILTERS_QUERY, { id: subcategory.id });
    const existingIds: string[] = current.metaobject?.field?.value ? JSON.parse(current.metaobject.field.value) : [];
    const merged = Array.from(new Set([...existingIds, ...newFilterIds]));
    if (merged.length !== existingIds.length) {
      const upd = await shopifyAdminRequest<any>(METAOBJECT_UPDATE_MUTATION, {
        id: subcategory.id,
        metaobject: { fields: [{ key: 'relevant_filters', value: JSON.stringify(merged) }] },
      });
      assertNoUserErrors(upd.metaobjectUpdate.userErrors, `metaobjectUpdate(${spec.subcategoryName}.relevant_filters)`);
      console.log(`  attached ${newFilterIds.length} filter(s) to ${spec.subcategoryName}`);
    }
  }

  console.log(`\nDone. Created ${created} new filter_definitions, skipped ${skipped} already-existing.`);
}

main().catch((err) => {
  console.error('\nFailed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
