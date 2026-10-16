import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';

const SMOKING_SUBCATS = [
  'Rolling Papers',
  'Blunts & Wraps',
  'Pre-Rolled Cones',
  'Filters & Tips',
  'Rolling Accessories',
  'Tobacco',
  'Torch Lighters',
  'Butane',
];

const Q = /* GraphQL */ `
  query ($query: String!) {
    products(first: 5, query: $query) {
      edges { node { title productType status } }
    }
  }
`;

const COUNT_Q = /* GraphQL */ `
  query ($query: String!) {
    productsCount(query: $query) { count }
  }
`;

async function main() {
  for (const sub of SMOKING_SUBCATS) {
    const query = `product_type:'${sub.replace(/'/g, "\\'")}'`;
    try {
      const countData = await shopifyAdminRequest<any>(COUNT_Q, { query });
      console.log(`${sub}: productsCount(product_type exact) = ${countData.productsCount.count}`);
    } catch (e: any) {
      console.log(`${sub}: count query failed: ${e.message}`);
    }
  }

  console.log('\n--- Sample of ALL distinct productType values currently in the store ---');
  const Q2 = /* GraphQL */ `
    query {
      products(first: 250) {
        edges { node { productType vendor tags } }
      }
    }
  `;
  const data = await shopifyAdminRequest<any>(Q2);
  const types = new Set<string>();
  for (const e of data.products.edges) {
    if (e.node.productType) types.add(e.node.productType);
  }
  console.log([...types].sort().join('\n'));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
