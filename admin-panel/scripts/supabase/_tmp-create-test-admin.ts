import { createClient } from '@supabase/supabase-js';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const email = 'automation-test-admin@example.com';
  const password = 'TestAutomation123!';

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error && !error.message.includes('already been registered')) {
    throw new Error(`createUser failed: ${error.message}`);
  }
  console.log(`user ready: ${email} / ${password}`);

  const { error: insertError } = await supabase.from('admin_users').insert({ email });
  if (insertError && insertError.code !== '23505') {
    throw new Error(`admin_users insert failed: ${insertError.message}`);
  }
  console.log('added to admin_users (or already present)');
}

main().catch((err) => {
  console.error('Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
