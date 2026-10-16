/**
 * One-off: creates a fresh, pre-approved wholesale test customer (new email, not the
 * existing wholesaler.pricetest@example.com account). Mirrors seed-testing-price-test-customers.ts.
 *
 * Run: npx tsx --env-file=.env.local scripts/supabase/_tmp-seed-new-wholesaler.ts
 */
import { createClient } from '@supabase/supabase-js';
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

const EMAIL = 'wholesaler.pricetest4@example.com';
const PASSWORD = 'PriceTestWholesale101!';
const FIRST_NAME = 'Wholesale';
const LAST_NAME = 'Tester4';

const FIND_CUSTOMER_QUERY = /* GraphQL */ `
  query FindCustomerByEmail($query: String!) {
    customers(first: 1, query: $query) {
      nodes { id }
    }
  }
`;
const CREATE_CUSTOMER_MUTATION = /* GraphQL */ `
  mutation CreateCustomer($input: CustomerInput!) {
    customerCreate(input: $input) {
      customer { id }
      userErrors { field message }
    }
  }
`;

async function findOrCreateShopifyCustomer(email: string, firstName: string, lastName: string): Promise<string> {
  const found = await shopifyAdminRequest<any>(FIND_CUSTOMER_QUERY, { query: `email:${email}` });
  const existingId = found.customers.nodes[0]?.id;
  if (existingId) return existingId;

  const data = await shopifyAdminRequest<any>(CREATE_CUSTOMER_MUTATION, {
    input: { email, firstName, lastName },
  });
  assertNoUserErrors(data.customerCreate.userErrors, 'customerCreate');
  return data.customerCreate.customer.id as string;
}

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  let supabaseUserId: string | undefined = authData?.user?.id;
  if (authError) {
    if (!authError.message.includes('already been registered')) {
      throw new Error(`auth.admin.createUser failed: ${authError.message}`);
    }
    const { data: list, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw new Error(`listUsers failed: ${listError.message}`);
    supabaseUserId = list.users.find((u) => u.email === EMAIL)?.id;
  }
  if (!supabaseUserId) throw new Error(`Could not resolve supabase_user_id for ${EMAIL}`);

  const shopifyCustomerId = await findOrCreateShopifyCustomer(EMAIL, FIRST_NAME, LAST_NAME);

  const { data: existingRow } = await supabase.from('customers').select('id').eq('email', EMAIL).maybeSingle();

  if (existingRow) {
    const { error } = await supabase
      .from('customers')
      .update({
        supabase_user_id: supabaseUserId,
        account_type: 'wholesale',
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: '_tmp-seed-new-wholesaler.ts',
        shopify_customer_id: shopifyCustomerId,
      })
      .eq('id', existingRow.id);
    if (error) throw new Error(`customers update failed: ${error.message}`);
  } else {
    const { error } = await supabase.from('customers').insert({
      supabase_user_id: supabaseUserId,
      email: EMAIL,
      first_name: FIRST_NAME,
      last_name: LAST_NAME,
      account_type: 'wholesale',
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: '_tmp-seed-new-wholesaler.ts',
      shopify_customer_id: shopifyCustomerId,
    });
    if (error) throw new Error(`customers insert failed: ${error.message}`);
  }

  console.log('\nDone. Login credentials:');
  console.log(`  Wholesale: ${EMAIL} / ${PASSWORD}`);
}

main().catch((err) => {
  console.error('\nFailed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
