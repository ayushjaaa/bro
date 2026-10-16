/**
 * Publishes every newly-imported product (all_product_ids.txt, one GID per line) to the
 * "Online Store" sales channel -- mirrors publishProductLine (src/data/products.ts).
 * Run: npx tsx --env-file=.env.local scripts/shopify/_tmp-publish-imported.ts
 */
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { readFileSync } from 'fs';

const GET_PUBLICATION_QUERY = /* GraphQL */ `
  query { publications(first: 10) { nodes { id name } } }
`;

const PUBLISH_MUTATION = /* GraphQL */ `
  mutation PublishablePublish($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      userErrors { field message }
    }
  }
`;

async function main() {
  const pubData = await shopifyAdminRequest<any>(GET_PUBLICATION_QUERY);
  const publication = pubData.publications.nodes.find((p: any) => p.name === 'Online Store');
  if (!publication) throw new Error('"Online Store" publication not found');

  const idsFile = process.env.PRODUCT_IDS_FILE || '/Users/ayushjaiswal/Downloads/all_product_ids.txt';
  const ids = readFileSync(idsFile, 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  console.log(`Publishing ${ids.length} products to "Online Store"...`);
  let ok = 0, fail = 0;
  for (const id of ids) {
    const data = await shopifyAdminRequest<any>(PUBLISH_MUTATION, {
      id,
      input: [{ publicationId: publication.id }],
    });
    const errs = data.publishablePublish.userErrors;
    if (errs?.length) {
      fail++;
      console.log(`FAIL ${id}: ${JSON.stringify(errs)}`);
    } else {
      ok++;
    }
  }
  console.log(`\nDone. ${ok} published, ${fail} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
