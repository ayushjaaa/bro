/**
 * Extends filter_definition "choices" lists with real values from the new Jubilee import that
 * didn't match the existing fixed list (which is why productCreate silently dropped those
 * metafields for 207 products -- see the import log). Union with existing choices, never replaces.
 * Run: npx tsx --env-file=.env.local scripts/shopify/_tmp-extend-filter-choices.ts
 */
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';

const NEW_VALUES: Record<string, string[]> = {
  cone_cone_size: ['Jumbo'],
  torch_lighter_pack_display_quantity: ['6', '9', '12', '15', '16', '20', '24', '25', '28', '42', '48', '50'],
  disposable_vape_puff_count: ['9000', '16000', '70000', '125000'],
  disposable_vape_pack_quantity: ['4', '5'],
};

const LIST_QUERY = `query { metaobjects(type: "filter_definition", first: 100) { nodes { id fields { key value } } } }`;
const UPDATE_MUTATION = `mutation($id: ID!, $fields: [MetaobjectFieldInput!]!) {
  metaobjectUpdate(id: $id, metaobject: { fields: $fields }) {
    metaobject { id }
    userErrors { field message }
  }
}`;

async function main() {
  const data = await shopifyAdminRequest<any>(LIST_QUERY);
  for (const n of data.metaobjects.nodes) {
    const f: any = {};
    n.fields.forEach((x: any) => (f[x.key] = x.value));
    const additions = NEW_VALUES[f.key];
    if (!additions) continue;
    const current: string[] = JSON.parse(f.choices || '[]');
    const merged = Array.from(new Set([...current, ...additions]));
    const res = await shopifyAdminRequest<any>(UPDATE_MUTATION, {
      id: n.id,
      fields: [{ key: 'choices', value: JSON.stringify(merged) }],
    });
    const errs = res.metaobjectUpdate.userErrors;
    if (errs?.length) {
      console.log(`FAIL ${f.key}:`, JSON.stringify(errs));
    } else {
      console.log(`OK ${f.key}: ${current.length} -> ${merged.length} choices`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
