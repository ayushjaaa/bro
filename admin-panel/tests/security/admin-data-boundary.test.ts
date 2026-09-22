/**
 * Live database tests for admin-panel's data-access boundary. Hits the REAL Supabase project.
 * Run: `npm run test:security`. Everything is created under `rls-*@e2e.test.internal` and the
 * seeded `automation-test-admin@example.com` test admin, and removed in `after()`.
 *
 * Same "prove the database itself enforces it, don't assume the migration ran" philosophy as
 * storefront's `tests/security/wishlist-locations.test.ts`, but this file also had to CORRECT its
 * own first assumption after running live: `admin_users` and `internal_notes` are genuinely
 * `service_role`-only -- NEITHER a non-admin customer's session NOR a real admin's own browser
 * session (signed in via `signInWithPassword`, using the anon key like the admin-panel's own
 * server-side Supabase client does) can read them directly; only admin-panel's own server code,
 * using its service-role client after `requireAdmin()` has verified the caller, ever touches them.
 * `order_status_log` and `cart_snapshot`, by contrast, DO have a working RLS policy that checks
 * admin status itself -- a non-admin/anon session is blocked, but a real admin's own session is
 * correctly allowed to read them directly. Both are valid, secure designs; this file asserts
 * each table's ACTUAL behavior rather than assuming every admin-only table works the same way
 * (an earlier draft of this file wrongly assumed all four were service_role-only, and the live
 * run below is what caught that).
 *
 * Also proves ordinary customer-row isolation on the `customers` table itself (a non-admin
 * customer sees only their own row, never another customer's), and documents that `sales_reps` is
 * intentionally, non-defectively readable by any authenticated user (F6's own review already
 * judged it low-sensitivity -- a business contact list -- so RLS doesn't gate it; this test
 * exists so a FUTURE change can't accidentally tighten or loosen that without the test noticing).
 */
import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();

type TestCustomer = { userId: string; customerId: string; client: SupabaseClient };
const createdCustomers: TestCustomer[] = [];

async function makeApprovedCustomer(tag: string): Promise<TestCustomer> {
  const email = `rls-${tag}-${stamp}@e2e.test.internal`;
  const password = `Sec#${Math.random().toString(36).slice(2, 12)}A1`;
  const { data: userData, error: userErr } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (userErr || !userData.user) throw userErr ?? new Error('createUser failed');
  const { data: custRow, error: custErr } = await service
    .from('customers')
    .insert({
      supabase_user_id: userData.user.id, email, first_name: 'RLS', last_name: tag, account_type: 'wholesale',
      status: 'approved', approved_at: new Date().toISOString(), ship_line1: '1 Test St', ship_city: 'Toronto',
      ship_province: 'Ontario', ship_postal_code: 'M5V 1A1', signature_name: 'RLS Test', signed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (custErr || !custRow) throw custErr ?? new Error('customer insert failed');
  const client = createClient(url, anonKey);
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;
  const result = { userId: userData.user.id, customerId: custRow.id, client };
  createdCustomers.push(result);
  return result;
}

let customerA: TestCustomer;
let customerB: TestCustomer;
let realAdminClient: SupabaseClient;
let anonClient: SupabaseClient;

before(async () => {
  customerA = await makeApprovedCustomer('A');
  customerB = await makeApprovedCustomer('B');

  realAdminClient = createClient(url, anonKey);
  const { error: adminSignInErr } = await realAdminClient.auth.signInWithPassword({
    email: 'automation-test-admin@example.com',
    password: 'TestAutomation123!',
  });
  if (adminSignInErr) {
    throw new Error(
      `Could not sign in as the seeded test admin -- run: npx tsx --env-file=.env.local scripts/supabase/_tmp-create-test-admin.ts (${adminSignInErr.message})`
    );
  }

  anonClient = createClient(url, anonKey);
});

after(async () => {
  for (const c of createdCustomers) {
    await service.from('customers').delete().eq('id', c.customerId);
    await service.auth.admin.deleteUser(c.userId);
  }
});

/** A row is "not visible" whether Supabase returns it as an empty result OR as a permission
 * error (both mean the caller got nothing) -- matches the same assertion style storefront's own
 * `wishlist-locations.test.ts` uses, for the same reason: which shape you get depends on whether
 * the RLS policy's own helper function is executable by that role at all. */
function assertNotVisible(data: unknown[] | null, error: { message: string } | null) {
  assert.ok(error || (data ?? []).length === 0, `expected no visible rows, got: ${JSON.stringify({ data, error })}`);
}

describe('customers table: cross-customer row isolation', () => {
  it('a customer sees only their own row, never another customer\'s', async () => {
    const { data, error } = await customerA.client.from('customers').select('id').limit(50);
    assert.equal(error, null);
    assert.ok(data!.some((r) => r.id === customerA.customerId), 'should see own row');
    assert.ok(!data!.some((r) => r.id === customerB.customerId), 'must NOT see another customer\'s row');
  });
});

describe('admin-only tables: refused for non-admin/anon in every case; two DIFFERENT valid designs for a real admin', () => {
  // Blocked for EVERYONE via a plain client, admin or not -- only admin-panel's own
  // service-role-using server code (after requireAdmin()) ever reads these.
  const SERVICE_ROLE_ONLY_TABLES = ['admin_users', 'internal_notes'];
  // Blocked for non-admin/anon, but a genuine admin's own session IS correctly allowed --
  // a working RLS admin-check policy, not just a grant restriction.
  const ADMIN_SESSION_READABLE_TABLES = ['order_status_log', 'cart_snapshot'];

  for (const table of [...SERVICE_ROLE_ONLY_TABLES, ...ADMIN_SESSION_READABLE_TABLES]) {
    it(`${table} is not directly readable by a non-admin customer session`, async () => {
      const { data, error } = await customerA.client.from(table).select('*').limit(5);
      assertNotVisible(data, error);
    });

    it(`${table} is not directly readable by an anonymous (no-session) client`, async () => {
      const { data, error } = await anonClient.from(table).select('*').limit(5);
      assertNotVisible(data, error);
    });
  }

  for (const table of SERVICE_ROLE_ONLY_TABLES) {
    it(`${table} is not directly readable even by a REAL admin's own browser session (service_role-only by design)`, async () => {
      const { data, error } = await realAdminClient.from(table).select('*').limit(5);
      assertNotVisible(data, error);
    });
  }

  for (const table of ADMIN_SESSION_READABLE_TABLES) {
    it(`${table} IS directly readable by a REAL admin's own browser session (working RLS admin-check policy)`, async () => {
      const { error } = await realAdminClient.from(table).select('*').limit(5);
      assert.equal(error, null, `a real admin's own session should be able to read ${table} directly`);
    });
  }

  it('list_customer_carts RPC (K3) refuses a non-admin customer session', async () => {
    const { data, error } = await customerA.client.rpc('list_customer_carts', { p_search: null, p_limit: 5, p_offset: 0 });
    assertNotVisible(data as unknown[] | null, error);
  });

  it('list_customer_carts RPC (K3) refuses an anonymous (no-session) client', async () => {
    const { data, error } = await anonClient.rpc('list_customer_carts', { p_search: null, p_limit: 5, p_offset: 0 });
    assertNotVisible(data as unknown[] | null, error);
  });

  it('list_customer_carts RPC (K3) refuses even a REAL admin\'s own browser session (service_role-only by design)', async () => {
    const { data, error } = await realAdminClient.rpc('list_customer_carts', { p_search: null, p_limit: 5, p_offset: 0 });
    assertNotVisible(data as unknown[] | null, error);
  });
});

describe('sales_reps: intentionally public-read to any authenticated user (F6 review, not a gap)', () => {
  it('a non-admin customer CAN read sales_reps (low-sensitivity business contact list, by design)', async () => {
    const { error } = await customerA.client.from('sales_reps').select('*').limit(5);
    assert.equal(error, null, 'sales_reps should stay readable to any authenticated user -- if this starts failing, RLS tightened and the app-level admin gate (requireAdmin in data/sales-reps.ts) is now the ONLY thing stopping any authenticated user from browsing rep contact info from a component that forgot to check it');
  });
});
