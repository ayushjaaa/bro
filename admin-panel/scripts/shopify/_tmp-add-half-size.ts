import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';

// 1. update the filter_definition metaobject's choices (UI data)
const META_UPDATE = `mutation($id: ID!, $fields: [MetaobjectFieldInput!]!) {
  metaobjectUpdate(id: $id, metaobject: { fields: $fields }) { metaobject { id } userErrors { field message } }
}`;
// 2. update the REAL enforcing metafield definition validation
const DEF_UPDATE = `mutation($definition: MetafieldDefinitionUpdateInput!) {
  metafieldDefinitionUpdate(definition: $definition) { updatedDefinition { id } userErrors { field message } }
}`;
const FIND_DEF = `query { metafieldDefinitions(first: 100, ownerType: PRODUCT, namespace: "custom") { nodes { id key validations { name value } } } }`;

async function main() {
  const newChoices = ["King Size","King Size Slim","1¼","Single Wide","1/2"];
  const r1 = await shopifyAdminRequest<any>(META_UPDATE, {
    id: 'gid://shopify/Metaobject/255348670662',
    fields: [{ key: 'choices', value: JSON.stringify(newChoices) }],
  });
  console.log('metaobject choices update:', JSON.stringify(r1.metaobjectUpdate));

  const defs = await shopifyAdminRequest<any>(FIND_DEF);
  const def = defs.metafieldDefinitions.nodes.find((n: any) => n.key === 'rolling_paper_paper_size');
  console.log('found def:', def?.id, def?.validations);

  const r2 = await shopifyAdminRequest<any>(DEF_UPDATE, {
    definition: {
      key: 'rolling_paper_paper_size',
      namespace: 'custom',
      ownerType: 'PRODUCT',
      validations: [{ name: 'choices', value: JSON.stringify(newChoices) }],
    },
  });
  console.log('definition validation update:', JSON.stringify(r2.metafieldDefinitionUpdate));
}
main().catch(e=>{console.error(e);process.exit(1)});
