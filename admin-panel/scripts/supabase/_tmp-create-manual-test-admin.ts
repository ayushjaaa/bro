/** Disposable test admin, same pattern as _tmp-create-test-admin.ts, for manual testing in a
 * browser. Run: npx tsx --env-file=.env.local scripts/supabase/_tmp-create-manual-test-admin.ts
 * Remove later with: npx tsx --env-file=.env.local scripts/supabase/_tmp-delete-test-admin.ts
 * (adjust the email there, or just delete manually -- see admin_users / auth.users). */
import { createClient } from '@supabase/supabase-js';

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const email = `manual-test-admin-${Date.now()}@example.com`;
  const password = 'ManualAdmin123!';

  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser failed: ${error.message}`);

  const { error: insertError } = await supabase.from('admin_users').insert({ email, user_id: data.user!.id });
  if (insertError) throw new Error(`admin_users insert failed: ${insertError.message}`);

  console.log(`Admin ready -- log in at /login with:`);
  console.log(`  email: ${email}`);
  console.log(`  password: ${password}`);
}

main().catch((err) => {
  console.error('Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
