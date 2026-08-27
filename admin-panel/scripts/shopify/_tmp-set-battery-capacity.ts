import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const CHOICES = ['1000mAh', '1500mAh', '2000mAh', '2500mAh', '3000mAh', '3500mAh'];

async function main() {
  const q = `query { metaobjects(type: "filter_definition", first: 250) { nodes { id fields { key value } } } }`;
  const data: any = await shopifyAdminRequest(q);
  const node = data.metaobjects.nodes.find((n: any) => n.fields.find((f: any) => f.key === 'key')?.value === 'battery_capacity');
  if (!node) throw new Error('battery_capacity filter_definition not found');

  const upd = await shopifyAdminRequest<any>(
    `mutation($id: ID!, $metaobject: MetaobjectUpdateInput!) { metaobjectUpdate(id: $id, metaobject: $metaobject) { metaobject { id } userErrors { message } } }`,
    { id: node.id, metaobject: { fields: [{ key: 'choices', value: JSON.stringify(CHOICES) }] } }
  );
  assertNoUserErrors(upd.metaobjectUpdate.userErrors, 'metaobjectUpdate(battery_capacity)');

  const mfDef = await shopifyAdminRequest<any>(
    `query { metafieldDefinitions(namespace: "custom", key: "battery_capacity", ownerType: PRODUCT, first: 1) { nodes { id } } }`
  );
  const mfId = mfDef.metafieldDefinitions.nodes[0]?.id;
  if (!mfId) throw new Error('metafieldDefinition custom.battery_capacity not found');
  const mfUpd = await shopifyAdminRequest<any>(
    `mutation($definition: MetafieldDefinitionUpdateInput!) { metafieldDefinitionUpdate(definition: $definition) { updatedDefinition { id } userErrors { message } } }`,
    { definition: { key: 'battery_capacity', namespace: 'custom', ownerType: 'PRODUCT', validations: [{ name: 'choices', value: JSON.stringify(CHOICES) }] } }
  );
  assertNoUserErrors(mfUpd.metafieldDefinitionUpdate.userErrors, 'metafieldDefinitionUpdate(custom.battery_capacity)');

  console.log('Updated battery_capacity ->', CHOICES);
}
main().catch((e) => { console.error(e); process.exit(1); });
