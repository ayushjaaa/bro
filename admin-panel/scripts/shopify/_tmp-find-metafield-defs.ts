import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
const Q = `query {
  metafieldDefinitions(first: 100, ownerType: PRODUCT, namespace: "custom") {
    nodes { id key name validations { name value } }
  }
}`;
async function main() {
  const data = await shopifyAdminRequest<any>(Q);
  for (const n of data.metafieldDefinitions.nodes) {
    const keys = ['cone_cone_size','torch_lighter_pack_display_quantity','disposable_vape_puff_count','disposable_vape_pack_quantity','eliquid_bottle_size'];
    if (keys.includes(n.key)) {
      console.log(n.id, n.key, JSON.stringify(n.validations));
    }
  }
}
main().catch(e=>{console.error(e);process.exit(1)});
