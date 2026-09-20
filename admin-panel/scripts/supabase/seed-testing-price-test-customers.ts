/**
 * Testing script -- creates one retail and one wholesale test customer (Supabase Auth user +
 * `customers` row, pre-approved) AND a real Shopify Customer on the new store for each, linked via
 * `shopify_customer_id` (using the same findOrCreateShopifyCustomer pattern as
 * admin-panel/src/lib/shopify/customer-lookup.ts, reimplemented here directly rather than imported
 * -- that file's `shopifyAdminRequest` comes from `./admin-client`, which pulls in Next.js-only
 * caching (`unstable_cache`) that doesn't run outside the Next.js server; every other script in
 * this directory imports from `admin-client.core` instead for the same reason).
 *
 * These two accounts exist specifically to test the wholesale-vs-retail price split on checkout
 * (see seed-testing-price-products.ts) -- account_type drives which price createDraftOrder uses
 * (admin-panel/src/lib/shopify/draft-orders.ts).
 *
 * Idempotent: re-running just reports "already exists" for anything already created.
 *
 * Run: npx tsx --env-file=.env.local scripts/supabase/seed-testing-price-test-customers.ts
 */
import { createClient } from '@supabase/supabase-js';
import { shopifyAdminRequest, assertNoUserErrors } from '../../src/lib/shopify/admin-client.core';

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

async function seedTestCustomer(
  supabase: ReturnType<typeof createClient>,
  opts: { email: string; password: string; firstName: string; lastName: string; accountType: 'retail' | 'wholesale' }
) {
  console.log(`\n${opts.accountType.toUpperCase()} test customer: ${opts.email}`);

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: opts.email,
    password: opts.password,
    email_confirm: true,
  });
  let supabaseUserId: string | undefined = authData?.user?.id;
  if (authError) {
    if (!authError.message.includes('already been registered')) {
      throw new Error(`auth.admin.createUser failed: ${authError.message}`);
    }
    console.log('  auth user already exists, looking it up...');
    const { data: list, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw new Error(`listUsers failed: ${listError.message}`);
    supabaseUserId = list.users.find((u) => u.email === opts.email)?.id;
  } else {
    console.log('  auth user created');
  }
  if (!supabaseUserId) throw new Error(`Could not resolve supabase_user_id for ${opts.email}`);

  const shopifyCustomerId = await findOrCreateShopifyCustomer(opts.email, opts.firstName, opts.lastName);
  console.log(`  Shopify customer: ${shopifyCustomerId}`);

  const { data: existingRow } = await supabase
    .from('customers')
    .select('id')
    .eq('email', opts.email)
    .maybeSingle();

  if (existingRow) {
    const { error } = await supabase
      .from('customers')
      .update({
        supabase_user_id: supabaseUserId,
        account_type: opts.accountType,
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: 'seed-testing-price-test-customers.ts',
        shopify_customer_id: shopifyCustomerId,
      })
      .eq('id', existingRow.id);
    if (error) throw new Error(`customers update failed: ${error.message}`);
    console.log('  customers row updated (already existed)');
    return { id: existingRow.id, email: opts.email, accountType: opts.accountType };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('customers')
    .insert({
      supabase_user_id: supabaseUserId,
      email: opts.email,
      first_name: opts.firstName,
      last_name: opts.lastName,
      account_type: opts.accountType,
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: 'seed-testing-price-test-customers.ts',
      shopify_customer_id: shopifyCustomerId,
    })
    .select('id')
    .single();
  if (insertError) throw new Error(`customers insert failed: ${insertError.message}`);
  console.log('  customers row created');
  return { id: inserted.id, email: opts.email, accountType: opts.accountType };
}

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const retailer = await seedTestCustomer(supabase, {
    email: 'retailer.pricetest@example.com',
    password: 'PriceTestRetail123!',
    firstName: 'Retail',
    lastName: 'Tester',
    accountType: 'retail',
  });

  const wholesaler = await seedTestCustomer(supabase, {
    email: 'wholesaler.pricetest@example.com',
    password: 'PriceTestWholesale123!',
    firstName: 'Wholesale',
    lastName: 'Tester',
    accountType: 'wholesale',
  });

  console.log('\nDone. Login credentials:');
  console.log(`  Retail:    retailer.pricetest@example.com / PriceTestRetail123!`);
  console.log(`  Wholesale: wholesaler.pricetest@example.com / PriceTestWholesale123!`);
  console.log('\nSupabase customer row ids:', { retailer: retailer.id, wholesaler: wholesaler.id });
}

main().catch((err) => {
  console.error('\nFailed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
