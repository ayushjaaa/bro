/**
 * One-time update script — fills in real Choices values for filter_definitions that were seeded
 * with the "To be confirmed" placeholder (seed-real-filters.ts). Values are industry-standard
 * proposals (jubileesk.ca itself was unreachable for automated verification this session) --
 * confirmed explicitly by the user to seed as-is; client can adjust individual values later via
 * Shopify Admin -> Settings -> Custom data (Choices lists are natively editable there).
 *
 * Updates BOTH the filter_definition metaobject's `choices` field AND the matching
 * `custom.<key>` metafieldDefinition's `choices` validation, keeping them in sync (§7.1).
 *
 * Only touches keys listed in CHOICES below; anything not listed is left untouched (still "To be
 * confirmed", including battery_capacity which wasn't given a value in this round).
 *
 * Idempotent: safe to re-run; just overwrites with the same values.
 *
 * Run: npm run shopify:update-filter-choices
 */
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const CHOICES: Record<string, string[]> = {
  // Disposable Vapes
  disposable_vape_puff_count: ['600', '2000', '5000', '7000', '10000', '15000', '20000', '25000', '30000'],
  disposable_vape_nicotine_strength: ['0mg', '20mg', '35mg', '50mg'],
  disposable_vape_nicotine_type: ['Freebase', 'Nicotine Salt', 'Nicotine-Free'],
  disposable_vape_device_type: ['Standard Disposable', 'Rechargeable Disposable', 'Mesh Coil'],
  disposable_vape_pack_quantity: ['Single', '5-Pack', '10-Pack', 'Display Box'],
  // E-Liquids / Vape Juice
  eliquid_nicotine_strength: ['0mg', '3mg', '6mg', '12mg', '20mg', '35mg', '50mg'],
  eliquid_nicotine_type: ['Freebase', 'Nicotine Salt', 'Shortfill/Nicotine-Free'],
  eliquid_bottle_size: ['30ml', '60ml', '100ml', '120ml'],
  eliquid_vg_pg_ratio: ['50/50', '70/30', '80/20'],
  eliquid_pack_quantity: ['Single', '3-Pack'],
  // Pre-Filled Pods
  pod_device_compatibility: ['STLTH', 'Vuse', 'Universal'],
  pod_nicotine_strength: ['20mg', '35mg', '50mg'],
  pod_pod_capacity: ['2ml', '3ml', '4.8ml'],
  pod_pack_quantity: ['2-Pack', '4-Pack'],
  // Vape Devices
  vape_device_device_type: ['Pod System', 'Pod Mod', 'Vape Pen', 'Box Mod'],
  vape_device_battery_capacity: ['400mAh', '650mAh', '900mAh', '1000mAh', '1500mAh', '2000mAh'],
  vape_device_battery_type: ['Built-in', 'Removable'],
  vape_device_pod_tank_capacity: ['2ml', '3ml', '4ml', '5ml'],
  vape_device_coil_compatibility: ['Mesh', 'Ceramic', 'Universal'],
  vape_device_color: ['Black', 'Silver', 'Blue', 'Red', 'Rainbow'],
  vape_device_pack_quantity: ['Single', 'Kit'],
  // Vape Hardware & Accessories
  vape_hardware_compatibility: ['Universal', 'Device-Specific'],
  vape_hardware_resistance: ['0.4Ω', '0.6Ω', '0.8Ω', '1.0Ω', '1.2Ω'],
  vape_hardware_capacity: ['2ml', '3ml', '5ml'],
  vape_hardware_size: ['Small', 'Standard', 'Large'],
  vape_hardware_color: ['Black', 'Silver', 'Clear'],
  vape_hardware_pack_quantity: ['Single', '5-Pack'],
  // Rolling Papers (Paper Size + Material already real, not touched here)
  rolling_paper_paper_type: ['Regular', 'Slow Burning', 'Flavored', 'Organic'],
  rolling_paper_length_width: ['78mm', '84mm', '110mm'],
  rolling_paper_pack_quantity: ['Single Pack', '3-Pack', 'Box (24 packs)'],
  // Blunts & Wraps
  blunt_wrap_material: ['Hemp', 'Tobacco Leaf', 'Palm Leaf'],
  blunt_wrap_size: ['Single', 'King Size'],
  blunt_wrap_wrap_type: ['Flavored', 'Natural', 'Organic'],
  blunt_wrap_count_pack_quantity: ['2-Pack', '25-Pack', '50-Pack'],
  // Pre-Rolled Cones
  cone_cone_size: ['1¼', 'King Size', '98mm', '109mm'],
  cone_material: ['Hemp', 'Rice', 'Bleached', 'Unbleached'],
  cone_count: ['3', '6', '20', '100'],
  cone_pack_quantity: ['Single Pack', 'Bulk Box'],
  // Filters & Tips
  filter_tip_material: ['Paper', 'Glass', 'Wood', 'Ceramic'],
  filter_tip_tip_type: ['Flat Tip', 'Rolled Tip', 'Filter Tip', 'Perforated'],
  filter_tip_size: ['Standard', 'Wide', 'Slim'],
  filter_tip_color: ['Natural', 'Assorted'],
  filter_tip_pack_quantity: ['50-Pack', '100-Pack'],
  // Rolling Accessories
  rolling_accessory_product_type: ['Rolling Tray', 'Rolling Machine', 'Rolling Mat'],
  rolling_accessory_size: ['Small', 'Medium', 'Large'],
  rolling_accessory_material: ['Metal', 'Plastic', 'Wood', 'Silicone'],
  rolling_accessory_color: ['Black', 'Assorted'],
  rolling_accessory_design: ['Plain', 'Printed/Novelty'],
  // Tobacco
  tobacco_tobacco_type: ['Rolling Tobacco', 'Cigars', 'Cigarillos', 'Pipe Tobacco'],
  tobacco_size: ['Regular', 'King Size'],
  tobacco_quantity: ['Single', 'Pack'],
  tobacco_pack_size: ['20g', '40g', '50g'],
  // Torch Lighters (Flame Type already real, not touched here)
  torch_lighter_refillable: ['Yes', 'No'],
  torch_lighter_ignition_type: ['Piezo', 'Electronic', 'Flint'],
  torch_lighter_torch_type: ['Single Torch', 'Triple Torch', 'Quad Torch'],
  torch_lighter_size: ['Pocket', 'Standard', 'Large'],
  torch_lighter_color_design: ['Black', 'Silver', 'Assorted', 'Novelty Print'],
  torch_lighter_pack_display_quantity: ['Single', '5-Count Display', '20-Count Display'],
  // Butane
  butane_butane_type: ['Universal', 'Ultra-Refined'],
  butane_can_size: ['90g', '190g', '300g'],
  butane_weight: ['90g', '190g', '300g'],
  butane_refinement_purity: ['5x Refined', '7x Refined', '9x Refined'],
  butane_pack_quantity: ['Single Can', '12-Pack Case'],
  butane_container_type: ['Can', 'Cartridge'],
  // Glass
  glass_product_type: ['Bong', 'Water Pipe', 'Hand Pipe', 'Bubbler'],
  glass_size_height: ['Small (<8in)', 'Medium (8-12in)', 'Large (>12in)'],
  glass_material: ['Borosilicate Glass', 'Silicone', 'Ceramic'],
  glass_color: ['Clear', 'Black', 'Blue', 'Assorted'],
  glass_percolator_type: ['None', 'Honeycomb', 'Tree', 'Showerhead'],
  glass_joint_size: ['14mm', '18mm'],
  glass_joint_type: ['Male', 'Female'],
  glass_design: ['Plain', 'Etched', 'Novelty'],
  // Dab & Concentrate
  dab_product_type: ['Dab Rig', 'Dab Tool', 'Concentrate Container', 'Wax Accessory'],
  dab_material: ['Glass', 'Titanium', 'Quartz', 'Silicone'],
  dab_size: ['Mini', 'Standard'],
  dab_joint_size: ['10mm', '14mm', '18mm'],
  dab_color: ['Clear', 'Black', 'Assorted'],
  // Grinders
  grinder_grinder_type: ['2-Piece', '3-Piece', '4-Piece', 'Electric'],
  grinder_material: ['Aluminum', 'Zinc', 'Wood', 'Acrylic'],
  grinder_size: ['Mini (30mm)', 'Standard (50mm)', 'Large (63mm+)'],
  grinder_number_of_pieces: ['2', '3', '4'],
  grinder_color: ['Black', 'Silver', 'Assorted'],
  // Scales
  scale_capacity: ['100g', '200g', '500g', '1000g', '5000g'],
  scale_accuracy: ['0.01g', '0.1g', '1g'],
  scale_scale_type: ['Pocket', 'Digital', 'Precision'],
  scale_unit_options: ['g/oz', 'g/oz/ct/dwt'],
  scale_size: ['Compact', 'Standard'],
  // Hookahs
  hookah_size: ['Small', 'Medium', 'Large'],
  hookah_material: ['Glass', 'Stainless Steel', 'Brass', 'Silicone'],
  hookah_hose_count: ['1', '2', '3', '4'],
  hookah_color: ['Assorted'],
  hookah_product_type: ['Complete Set', 'Pipe Only', 'Accessory'],
  // Storage
  storage_material: ['Glass', 'Silicone', 'Metal', 'Plastic'],
  storage_size: ['Small', 'Medium', 'Large'],
  storage_capacity: ['1oz', '2oz', '4oz', '8oz'],
  storage_closure_type: ['Screw-Top', 'Snap-Lock', 'Airtight Seal'],
  storage_color: ['Black', 'Clear', 'Assorted'],
  // Cleaning
  cleaning_product_type: ['Cleaning Solution', 'Cleaning Brush', 'Cleaning Kit'],
  cleaning_size: ['Travel Size', 'Standard', 'Bulk'],
  cleaning_pack_quantity: ['Single', 'Multi-Pack'],
  // Replacement Parts
  replacement_part_part_type: ['Downstem', 'Bowl', 'Screen', 'Ash Catcher'],
  replacement_part_compatibility: ['Universal', 'Brand-Specific'],
  replacement_part_size: ['Standard', 'Custom'],
  replacement_part_joint_size: ['10mm', '14mm', '18mm'],
  replacement_part_material: ['Glass', 'Metal'],
  // Car Air Fresheners
  air_freshener_scent: ['New Car', 'Vanilla', 'Citrus', 'Ocean Breeze', 'Black Ice'],
  air_freshener_format: ['Hanging', 'Vent Clip', 'Spray', 'Can'],
  air_freshener_pack_quantity: ['Single', '3-Pack'],
  air_freshener_size: ['Standard', 'Mini'],
  // Lighters
  lighter_lighter_type: ['Pocket', 'Utility', 'Electric'],
  lighter_refillable: ['Yes', 'No'],
  lighter_ignition_type: ['Flint', 'Electronic/Arc', 'Piezo'],
  lighter_color: ['Assorted', 'Black', 'Blue', 'Red'],
  lighter_pack_quantity: ['Single', '50-Count Display'],
  // Batteries
  battery_battery_type: ['AA', 'AAA', '9V', 'CR2032', '18650'],
  battery_size: ['Standard', 'Compact'],
  battery_rechargeable: ['Yes', 'No'],
  battery_pack_quantity: ['2-Pack', '4-Pack', '8-Pack'],
};

interface MetaobjectField {
  key: string;
  value: string | null;
}

const LIST_FILTER_DEFINITIONS_QUERY = /* GraphQL */ `
  query {
    metaobjects(type: "filter_definition", first: 250) {
      nodes { id fields { key value } }
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

const FIND_METAFIELD_DEFINITION_QUERY = /* GraphQL */ `
  query($key: String!) {
    metafieldDefinitions(namespace: "custom", key: $key, ownerType: PRODUCT, first: 1) {
      nodes { id }
    }
  }
`;

const METAFIELD_DEFINITION_UPDATE_MUTATION = /* GraphQL */ `
  mutation Update($definition: MetafieldDefinitionUpdateInput!) {
    metafieldDefinitionUpdate(definition: $definition) {
      updatedDefinition { id }
      userErrors { field message }
    }
  }
`;

function fieldValue(fields: MetaobjectField[], key: string): string | null {
  return fields.find((f) => f.key === key)?.value ?? null;
}

async function main() {
  const data = await shopifyAdminRequest<any>(LIST_FILTER_DEFINITIONS_QUERY);
  const byKey = new Map<string, string>();
  for (const n of data.metaobjects.nodes) {
    const k = fieldValue(n.fields, 'key');
    if (k) byKey.set(k, n.id);
  }

  let updated = 0;
  let notFound = 0;

  for (const [key, choices] of Object.entries(CHOICES)) {
    const filterDefId = byKey.get(key);
    if (!filterDefId) {
      console.log(`  NOT FOUND (filter_definition): ${key}`);
      notFound++;
      continue;
    }

    const upd = await shopifyAdminRequest<any>(METAOBJECT_UPDATE_MUTATION, {
      id: filterDefId,
      metaobject: { fields: [{ key: 'choices', value: JSON.stringify(choices) }] },
    });
    assertNoUserErrors(upd.metaobjectUpdate.userErrors, `metaobjectUpdate(${key})`);

    const mfDef = await shopifyAdminRequest<any>(FIND_METAFIELD_DEFINITION_QUERY, { key });
    const mfId = mfDef.metafieldDefinitions.nodes[0]?.id;
    if (mfId) {
      const mfUpd = await shopifyAdminRequest<any>(METAFIELD_DEFINITION_UPDATE_MUTATION, {
        definition: { key, namespace: 'custom', ownerType: 'PRODUCT', validations: [{ name: 'choices', value: JSON.stringify(choices) }] },
      });
      assertNoUserErrors(mfUpd.metafieldDefinitionUpdate.userErrors, `metafieldDefinitionUpdate(custom.${key})`);
    } else {
      console.log(`  WARNING: no metafieldDefinition found for custom.${key}`);
    }

    console.log(`  updated: ${key} -> ${choices.length} choices`);
    updated++;
  }

  console.log(`\nDone. Updated ${updated}, not found ${notFound}.`);
}

main().catch((err) => {
  console.error('\nFailed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
