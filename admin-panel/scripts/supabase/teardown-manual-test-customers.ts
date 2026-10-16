/**
 * Removes every customer created by create-manual-test-customers.ts (matched by last_name prefix
 * "ManualTest-"), their Auth users, and any suspended_applicants rows their emails ended up in.
 * Run: npx tsx --env-file=.env.local scripts/supabase/teardown-manual-test-customers.ts
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: rows } = await supabase.from('customers').select('id, email, supabase_user_id').like('last_name', 'ManualTest-%');
  if (!rows || rows.length === 0) {
    console.log('No ManualTest customers found -- nothing to clean up.');
    return;
  }

  for (const row of rows) {
    await supabase.from('customers').delete().eq('id', row.id);
    if (row.supabase_user_id) await supabase.auth.admin.deleteUser(row.supabase_user_id);
    await supabase.from('suspended_applicants').delete().eq('email', row.email);
    console.log(`Removed ${row.email}`);
  }
  console.log(`\nDone -- removed ${rows.length} manual test customer(s).`);
}

main();
