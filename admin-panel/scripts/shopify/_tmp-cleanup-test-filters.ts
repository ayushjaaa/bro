import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const LIST_QUERY = /* GraphQL */ `
  query {
    metaobjects(type: "filter_definition", first: 250) {
      nodes { id fields { key value } }
    }
  }
`;
const DELETE_MUTATION = /* GraphQL */ `
  mutation Delete($id: ID!) { metaobjectDelete(id: $id) { deletedId userErrors { message } } }
`;
const METAFIELD_DELETE_MUTATION = /* GraphQL */ `
  mutation Delete($id: ID!) { metafieldDefinitionDelete(id: $id, deleteAllAssociatedMetafields: true) { deletedDefinitionId userErrors { message } } }
`;
const GET_METAFIELD_DEF_QUERY = /* GraphQL */ `
  query($ns: String!, $key: String!) {
    metafieldDefinitions(namespace: $ns, key: $key, ownerType: PRODUCT, first: 1) { nodes { id } }
  }
`;

async function main() {
  const data = await shopifyAdminRequest<any>(LIST_QUERY);
  const junk = data.metaobjects.nodes.filter((n: any) =>
    ['Material', 'Material2'].includes(n.fields.find((f: any) => f.key === 'label')?.value)
  );
  for (const n of junk) {
    const key = n.fields.find((f: any) => f.key === 'key')?.value;
    const del = await shopifyAdminRequest<any>(DELETE_MUTATION, { id: n.id });
    assertNoUserErrors(del.metaobjectDelete.userErrors, 'delete filter_definition');
    console.log('deleted filter_definition:', key);

    const mfDef = await shopifyAdminRequest<any>(GET_METAFIELD_DEF_QUERY, { ns: 'custom', key });
    const id = mfDef.metafieldDefinitions.nodes[0]?.id;
    if (id) {
      const delMf = await shopifyAdminRequest<any>(METAFIELD_DELETE_MUTATION, { id });
      assertNoUserErrors(delMf.metafieldDefinitionDelete.userErrors, 'delete metafieldDefinition');
      console.log('deleted metafieldDefinition:', key);
    }
  }
  console.log('done');
}
main().catch((e) => { console.error(e); process.exit(1); });
