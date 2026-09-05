import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const PUB_QUERY = `{ publications(first: 10) { nodes { id name } } }`;
const PUBLISH_MUTATION = `mutation($id: ID!, $input: [PublicationInput!]!) {
  publishablePublish(id: $id, input: $input) { userErrors { field message } }
}`;

async function main() {
  const pubData = await shopifyAdminRequest<any>(PUB_QUERY);
  const publication = pubData.publications.nodes.find((p: any) => p.name === 'Online Store');
  if (!publication) throw new Error('Online Store publication not found');
  console.log('Publication:', publication.id);

  let published = 0;
  let failed = 0;
  let after: string | null = null;

  while (true) {
    const data = await shopifyAdminRequest<any>(
      `query($after: String) { products(first: 50, after: $after) { pageInfo { hasNextPage endCursor } nodes { id title } } }`,
      { after }
    );
    for (const p of data.products.nodes) {
      try {
        const r = await shopifyAdminRequest<any>(PUBLISH_MUTATION, { id: p.id, input: [{ publicationId: publication.id }] });
        assertNoUserErrors(r.publishablePublish.userErrors, `publish ${p.title}`);
        published++;
      } catch (err) {
        failed++;
        console.error(`FAILED to publish ${p.title}:`, err instanceof Error ? err.message : err);
      }
    }
    console.log(`  published so far: ${published}`);
    if (!data.products.pageInfo.hasNextPage) break;
    after = data.products.pageInfo.endCursor;
  }

  console.log(`\nDone. Published: ${published}, Failed: ${failed}.`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
