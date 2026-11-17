// Probe (no-op, delta 0): shows the exact GraphQL error for inventoryAdjustQuantities on 2026-07.
const domain = process.env.SHOPIFY_STORE_DOMAIN, ver = process.env.SHOPIFY_API_VERSION, tok = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
async function q(query: string, variables: any) {
  const r = await fetch(`https://${domain}/admin/api/${ver}/graphql.json`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': tok! }, body: JSON.stringify({ query, variables }) });
  return r.json();
}
(async () => {
  const p = await q(`query{productByHandle(handle:"mg-22y-10-glass-beaker-bong"){variants(first:1){nodes{inventoryQuantity inventoryItem{id}}}}}`, {});
  const v = p.data.productByHandle.variants.nodes[0];
  console.log(JSON.stringify(await q(`mutation($i:InventoryAdjustQuantitiesInput!){inventoryAdjustQuantities(input:$i){userErrors{field message}}}`,
    { i: { reason: 'correction', name: 'available', changes: [{ inventoryItemId: v.inventoryItem.id, locationId: 'gid://shopify/Location/84994621638', delta: 0, changeFromQuantity: v.inventoryQuantity }] } })).slice(0, 700));
})();
