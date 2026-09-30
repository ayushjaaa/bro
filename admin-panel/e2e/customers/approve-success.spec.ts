import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loginAsAdmin } from '../fixtures';

/**
 * Live coverage for the ONE thing no other test in this codebase actually exercised: a full,
 * successful Approve that reaches the real Shopify Admin API and comes back with a real customer
 * id. Found missing the hard way -- manually clicking Approve in a real browser surfaced "Could
 * not reach Shopify" every single time, which was wrongly assumed (through this whole session) to
 * be a missing-Shopify-credentials limitation of the local environment. It wasn't: credentials
 * were valid and working throughout (confirmed separately against /admin/api/.../shop.json,
 * 200 OK). The real cause was a bug in customer-lookup.ts's `customerSet` GraphQL mutation -- the
 * `$identifier` variable was declared with the wrong input type (`CustomerIdentifierInput!`
 * instead of the correct `CustomerSetIdentifiers!`), which Shopify rejects at query-validation
 * time, before any customer logic runs. No automated test caught this because every other test
 * deliberately avoids the real Shopify call: customer-approval-races.test.ts exercises the RPCs
 * directly (no Shopify involved at all), and approve-race.spec.ts pre-claims the row so its UI
 * assertion only needs the claim guard to fire, never reaching the Shopify step. This test closes
 * that real gap -- it's the only one in the suite that lets Approve run all the way through.
 */
function getServiceRoleClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const TEST_MARKER = 'e2e.test.internal';

async function deleteShopifyCustomer(shopifyCustomerId: string) {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!domain || !token) return;
  const query = `mutation DeleteCustomer($id: ID!) { customerDelete(input: {id: $id}) { deletedCustomerId userErrors { message } } }`;
  await fetch(`https://${domain}/admin/api/2025-01/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { id: shopifyCustomerId } }),
  });
}

test('a full Approve reaches Shopify successfully: status becomes approved, a real Shopify customer id is attached, an account number is assigned', async ({ page }) => {
  const service = getServiceRoleClient();
  const uniqueLastName = `ApproveSuccess-${Date.now()}`;
  const email = `approvesuccess-${Date.now()}@${TEST_MARKER}`;
  const { data: userData, error: userErr } = await service.auth.admin.createUser({ email, email_confirm: true });
  if (userErr || !userData.user) throw userErr ?? new Error('createUser failed');

  const { data: row, error } = await service
    .from('customers')
    .insert({
      supabase_user_id: userData.user.id, email, first_name: 'ApproveSuccess', last_name: uniqueLastName, account_type: 'wholesale',
      status: 'pending', ship_line1: '1 Test St', ship_city: 'Toronto', ship_province: 'Ontario',
      ship_postal_code: 'M5V 1A1', signature_name: 'ApproveSuccess Test', signed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error || !row) throw error ?? new Error('customer insert failed');

  let shopifyCustomerId: string | null = null;
  try {
    await loginAsAdmin(page);
    await page.goto('/customers');
    await expect(page.getByText(uniqueLastName)).toBeVisible({ timeout: 15_000 });

    const rowLocator = page.locator('tr', { has: page.getByText(uniqueLastName) });
    page.once('dialog', (d) => d.accept());
    await rowLocator.getByRole('button', { name: 'Approve' }).click();

    // Must NOT show the Shopify-failure message -- if this regresses, it fails loudly here
    // instead of silently, unlike the manual discovery that found this bug.
    await expect(page.getByText(/could not reach shopify/i)).not.toBeVisible({ timeout: 3_000 });
    await expect(rowLocator.getByText('approved', { exact: false })).toBeVisible({ timeout: 15_000 });

    const { data: finalRow } = await service
      .from('customers')
      .select('status, shopify_customer_id, account_number')
      .eq('id', row.id)
      .single();

    expect(finalRow?.status).toBe('approved');
    expect(finalRow?.shopify_customer_id).toBeTruthy();
    expect(finalRow?.shopify_customer_id).toMatch(/^gid:\/\/shopify\/Customer\/\d+$/);
    expect(finalRow?.account_number).toMatch(/^W-[A-Z]{2}-\d{2}-\d{4}$/);

    shopifyCustomerId = finalRow!.shopify_customer_id as string;
  } finally {
    if (shopifyCustomerId) await deleteShopifyCustomer(shopifyCustomerId);
    await service.from('customers').delete().eq('id', row.id);
    await service.auth.admin.deleteUser(userData.user.id);
  }
});
