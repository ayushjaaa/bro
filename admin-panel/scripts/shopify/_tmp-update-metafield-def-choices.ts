/**
 * The REAL enforcement of "Value does not exist in provided choices" is each product metafield's
 * MetafieldDefinition.validations (Shopify's own choices-type validation) -- separate from, and
 * not automatically synced with, the `choices` field on the filter_definition metaobject (which is
 * just UI data the admin panel reads for its dropdown). Updating the metaobject alone (already
 * done) did nothing; this updates the actual enforcing definition.
 * Run: npx tsx --env-file=.env.local scripts/shopify/_tmp-update-metafield-def-choices.ts
 */
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';

const DEFS: Record<string, { id: string; add: string[] }> = {
  cone_cone_size: { id: 'gid://shopify/MetafieldDefinition/235803410630', add: ['Jumbo'] },
  torch_lighter_pack_display_quantity: {
    id: 'gid://shopify/MetafieldDefinition/235804197062',
    add: ['6', '9', '12', '15', '16', '20', '24', '25', '28', '42', '48', '50'],
  },
  disposable_vape_puff_count: {
    id: 'gid://shopify/MetafieldDefinition/235802230982',
    add: ['9000', '16000', '70000', '125000'],
  },
  disposable_vape_pack_quantity: { id: 'gid://shopify/MetafieldDefinition/235802362054', add: ['4', '5'] },
};

const CURRENT_CHOICES: Record<string, string[]> = {
  cone_cone_size: ['1¼', 'King Size', '98mm', '109mm'],
  torch_lighter_pack_display_quantity: ['Single', '5-Count Display', '20-Count Display'],
  disposable_vape_puff_count: ['600', '2000', '5000', '7000', '10000', '15000', '20000', '25000', '30000', '40000', '60000', '80000', '100000', '120000'],
  disposable_vape_pack_quantity: ['Single', '5-Pack', '10-Pack', 'Display Box'],
};

const UPDATE_MUTATION = `mutation($definition: MetafieldDefinitionUpdateInput!) {
  metafieldDefinitionUpdate(definition: $definition) {
    updatedDefinition { id }
    userErrors { field message }
  }
}`;

async function main() {
  for (const [key, { id, add }] of Object.entries(DEFS)) {
    const merged = Array.from(new Set([...CURRENT_CHOICES[key], ...add]));
    const res = await shopifyAdminRequest<any>(UPDATE_MUTATION, {
      definition: {
        key,
        namespace: 'custom',
        ownerType: 'PRODUCT',
        validations: [{ name: 'choices', value: JSON.stringify(merged) }],
      },
    });
    const errs = res.metafieldDefinitionUpdate.userErrors;
    if (errs?.length) console.log(`FAIL ${key}:`, JSON.stringify(errs));
    else console.log(`OK ${key}: now ${merged.length} choices`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
