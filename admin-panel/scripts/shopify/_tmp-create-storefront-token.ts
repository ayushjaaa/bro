/**
 * One-off: attempt to generate a real Storefront API access token for the storefront app,
 * programmatically, via the same custom-app Admin API credentials admin-panel already uses.
 * Run: npx tsx --env-file=.env.local scripts/shopify/_tmp-create-storefront-token.ts
 */
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';

const MUTATION = /* GraphQL */ `
  mutation StorefrontAccessTokenCreate($input: StorefrontAccessTokenInput!) {
    storefrontAccessTokenCreate(input: $input) {
      storefrontAccessToken {
        accessToken
        title
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const LIST_QUERY = /* GraphQL */ `
  query ListTokens {
    shop {
      storefrontAccessTokens(first: 10) {
        nodes {
          accessToken
          title
        }
      }
    }
  }
`;

async function main() {
  console.log('Checking for existing Storefront API access tokens on this app...');
  try {
    const existing = await shopifyAdminRequest<any>(LIST_QUERY);
    const nodes = existing.shop.storefrontAccessTokens.nodes;
    if (nodes.length > 0) {
      console.log(`Found ${nodes.length} existing token(s):`);
      for (const n of nodes) console.log(`  - ${n.title}: ${n.accessToken}`);
      return;
    }
    console.log('No existing tokens. Creating one...');
  } catch (err) {
    console.log('List query failed (may lack scope):', err instanceof Error ? err.message : err);
  }

  const data = await shopifyAdminRequest<any>(MUTATION, {
    input: { title: 'Gemini Distribution Storefront' },
  });
  if (data.storefrontAccessTokenCreate.userErrors?.length > 0) {
    console.log('userErrors:', JSON.stringify(data.storefrontAccessTokenCreate.userErrors, null, 2));
    return;
  }
  console.log('Created token:', data.storefrontAccessTokenCreate.storefrontAccessToken.accessToken);
}

main().catch((err) => {
  console.error('FAILED:', err instanceof Error ? err.message : err);
  if (err && typeof err === 'object' && 'errors' in err) {
    console.error('Details:', JSON.stringify((err as any).errors, null, 2));
  }
  process.exit(1);
});
