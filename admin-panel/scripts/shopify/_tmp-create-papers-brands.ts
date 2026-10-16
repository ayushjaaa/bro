import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
const M = `mutation($metaobject: MetaobjectCreateInput!) { metaobjectCreate(metaobject: $metaobject) { metaobject { id } userErrors { field message } } }`;
const TO_CREATE = [
  { name: "Juicy Jay's", sub: 'gid://shopify/Metaobject/252081045702' },
  { name: 'Skunk', sub: 'gid://shopify/Metaobject/252081045702' },
  { name: 'Pop', sub: 'gid://shopify/Metaobject/252081340614' },
];
async function main() {
  for (const { name, sub } of TO_CREATE) {
    const res = await shopifyAdminRequest<any>(M, { metaobject: { type: 'brand', fields: [
      { key: 'name', value: name },
      { key: 'sub_category', value: sub },
    ]}});
    console.log(name, '->', JSON.stringify(res.metaobjectCreate));
  }
}
main().catch(e=>{console.error(e);process.exit(1)});
