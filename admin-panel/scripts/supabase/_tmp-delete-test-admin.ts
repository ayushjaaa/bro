import { createClient } from '@supabase/supabase-js';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const email = 'automation-test-admin@example.com';

  await supabase.from('admin_users').delete().eq('email', email);

  const { data } = await supabase.auth.admin.listUsers();
  const user = data.users.find((u) => u.email === email);
  if (user) await supabase.auth.admin.deleteUser(user.id);

  console.log('cleaned up test admin:', email);
}
main();
