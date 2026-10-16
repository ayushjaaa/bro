import { createClient } from '@supabase/supabase-js';

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const email = `dual-browser-test-${Date.now()}@example.com`;
  const password = 'DualBrowser123!';

  const { data: userData, error: userErr } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (userErr) throw userErr;

  const { error } = await supabase.from('customers').insert({
    supabase_user_id: userData.user!.id,
    email,
    first_name: 'Dual',
    last_name: 'BrowserTest',
    account_type: 'wholesale',
    status: 'approved',
    approved_at: new Date().toISOString(),
    approved_by: 'manual-setup',
    legal_business_name: 'Dual Browser Test Co',
    business_number: `${Date.now()}`.slice(-9),
    ship_line1: '1 Test St',
    ship_city: 'Toronto',
    ship_province: 'Ontario',
    ship_postal_code: 'M5V 1A1',
    signature_name: 'Dual Browser Test',
    signed_at: new Date().toISOString(),
  });
  if (error) throw error;

  console.log(`Customer ready -- log in at storefront with:`);
  console.log(`  email: ${email}`);
  console.log(`  password: ${password}`);
  console.log(`Find in admin panel Customers list by last name "BrowserTest".`);
}

main().catch((err) => {
  console.error('Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
