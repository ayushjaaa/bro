/**
 * Creates 5 PERSISTENT (not auto-deleted) test customers for manually testing 034's Suspend/
 * Deactivate/Reactivate/Reject/Allow-reapply actions in a real browser. Unlike the e2e specs'
 * helpers, nothing here gets cleaned up automatically -- run teardown-manual-test-customers.ts
 * when done with them.
 *
 * Run: npx tsx --env-file=.env.local scripts/supabase/create-manual-test-customers.ts
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const PASSWORD = 'ManualTest123!';
const stamp = Date.now();

type Spec = {
  tag: string;
  lastName: string;
  status: 'pending' | 'approved';
  purpose: string;
};

const specs: Spec[] = [
  { tag: 'suspend-approved', lastName: 'ManualTest-1-SuspendApproved', status: 'approved', purpose: 'Test: Suspend an APPROVED account (permanent, should block login + reapply forever)' },
  { tag: 'deactivate', lastName: 'ManualTest-2-Deactivate', status: 'approved', purpose: 'Test: Deactivate an APPROVED account, then Reactivate it (temporary, reversible)' },
  { tag: 'reject', lastName: 'ManualTest-3-Reject', status: 'pending', purpose: 'Test: Reject a PENDING applicant, then Allow reapply (status back to pending, same email)' },
  { tag: 'suspend-pending', lastName: 'ManualTest-4-SuspendPending', status: 'pending', purpose: 'Test: Suspend a PENDING applicant directly, BEFORE approval (the new feature)' },
  { tag: 'reactivate-check', lastName: 'ManualTest-5-ReactivateCheck', status: 'approved', purpose: 'Spare approved account -- use for anything else you want to try (e.g. suspend then confirm storefront login is blocked)' },
];

async function main() {
  const results: Array<{ purpose: string; email: string; password: string; status: string }> = [];

  for (const spec of specs) {
    const email = `${spec.tag}-${stamp}@example.com`;
    const { data: userData, error: userErr } = await supabase.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (userErr || !userData.user) throw userErr ?? new Error(`createUser failed for ${email}`);

    const { error } = await supabase.from('customers').insert({
      supabase_user_id: userData.user.id,
      email,
      first_name: 'Manual',
      last_name: spec.lastName,
      account_type: 'wholesale',
      status: spec.status,
      business_number: `MT-BN-${spec.tag}-${stamp}`,
      legal_business_name: `${spec.lastName} Co`,
      operating_name: spec.lastName,
      num_stores: 1,
      business_types: ['Smoke Shop'],
      ship_line1: '1 Test St',
      ship_city: 'Toronto',
      ship_province: 'Ontario',
      ship_postal_code: 'M5V 1A1',
      bill_same_as_shipping: true,
      tax_exempt: false,
      signature_name: 'Manual Test',
      signed_at: new Date().toISOString(),
      ...(spec.status === 'approved' ? { approved_at: new Date().toISOString(), approved_by: 'manual-test-setup' } : {}),
    });
    if (error) throw error;

    results.push({ purpose: spec.purpose, email, password: PASSWORD, status: spec.status });
  }

  console.log('\n5 persistent test customers created:\n');
  for (const r of results) {
    console.log(`- ${r.purpose}`);
    console.log(`  email: ${r.email}  |  password: ${r.password}  |  starting status: ${r.status}\n`);
  }
  console.log('Find them in the admin panel Customers list by last name "ManualTest-1..5-...".');
  console.log('When done, run: npx tsx --env-file=.env.local scripts/supabase/teardown-manual-test-customers.ts');
}

main();
