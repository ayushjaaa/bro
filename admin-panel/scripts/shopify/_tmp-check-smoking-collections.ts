import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';

const Q = /* GraphQL */ `
  query {
    collections(first: 100) {
      edges {
        node {
          title
          handle
          productsCount { count }
          navKey: metafield(namespace: "custom", key: "menu_nav_key") { value }
        }
      }
    }
  }
`;

async function main() {
  const data = await shopifyAdminRequest<any>(Q);
  const smokingNames = [
    'Rolling Papers',
    'Blunts & Wraps',
    'Pre-Rolled Cones',
    'Filters & Tips',
    'Rolling Accessories',
    'Tobacco',
    'Torch Lighters',
    'Butane',
    'Smoking',
  ];
  for (const e of data.collections.edges) {
    const n = e.node;
    if (smokingNames.some((s) => n.title.toLowerCase().includes(s.toLowerCase()))) {
      console.log(`${n.title} (${n.handle}) -> products: ${n.productsCount.count}, menu_nav_key: ${n.navKey?.value ?? 'NONE'}`);
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
