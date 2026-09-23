import 'server-only';
import { shopifyAdminRequest, assertNoUserErrors } from './admin-client';
import { quoteShopifySearchValue } from './query-value';

/** Finds an existing Shopify Customer by email, or creates one -- called when an admin approves
 * a pending registration (src/data/customers.ts). Needs the `write_customers` scope. */

const FIND_CUSTOMER_QUERY = /* GraphQL */ `
  query FindCustomerByEmail($query: String!) {
    customers(first: 1, query: $query) {
      nodes {
        id
      }
    }
  }
`;

const CREATE_CUSTOMER_MUTATION = /* GraphQL */ `
  mutation CreateCustomer($input: CustomerInput!) {
    customerCreate(input: $input) {
      customer {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export async function findOrCreateShopifyCustomer(
  email: string,
  firstName: string,
  lastName: string
): Promise<string> {
  const found = await shopifyAdminRequest<any>(FIND_CUSTOMER_QUERY, { query: `email:${quoteShopifySearchValue(email)}` });
  // The email is quoted + escaped above so it is one literal term. Do NOT also request `email` back
  // to double-check it: this store's plan blocks PII fields (ACCESS_DENIED, see admin-client.core.ts)
  // and asking for it fails the whole query.
  const existingId = found.customers.nodes[0]?.id;
  if (existingId) return existingId;

  const data = await shopifyAdminRequest<any>(CREATE_CUSTOMER_MUTATION, {
    input: { email, firstName, lastName },
  });
  assertNoUserErrors(data.customerCreate.userErrors, 'customerCreate');
  return data.customerCreate.customer.id as string;
}
